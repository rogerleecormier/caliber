'use server';
import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { withRetry } from "@/lib/sync-queue";

function cleanUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.hostname.includes("linkedin.com") && url.pathname.includes("/jobs")) {
      const jobId = url.searchParams.get("currentJobId");
      if (jobId) return `https://www.linkedin.com/jobs/view/${jobId}/`;
    }
    if (url.hostname.includes("indeed.com") && url.pathname.includes("/viewjob")) {
      const jk = url.searchParams.get("jk");
      if (jk) {
        url.search = `?jk=${jk}`;
        return url.toString();
      }
    }
    const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "trackingId", "refId", "eBP", "xkcb"];
    for (const p of trackingParams) url.searchParams.delete(p);
    return url.toString();
  } catch {
    return raw;
  }
}

async function makeCacheKey(url: string): Promise<string> {
  const prefix = "scrape:";
  const cleaned = cleanUrl(url);
  if (prefix.length + cleaned.length <= 512) {
    return `${prefix}${cleaned}`;
  }
  const data = new TextEncoder().encode(cleaned);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}sha256:${hex}`;
}

export async function scrapeJobInternal(url: string) {
  if (!url || !URL.canParse(url)) {
    throw new Error("A valid URL is required");
  }

  try {
    const env = getCloudflareEnv();
    const browserWorker = env.BROWSER;
    const kvNamespace = env.KV;
    if (!browserWorker || !kvNamespace) {
      throw new Error("Browser rendering not available in development mode. Deploy to Cloudflare Workers to use this feature.");
    }

    const cacheKey = await makeCacheKey(url);
    const navigateUrl = cleanUrl(url);

    const cached = await kvNamespace.get(cacheKey);
    if (cached) {
      return { text: cached, fromCache: true };
    }

    const puppeteer = await import("@cloudflare/puppeteer");

    return await withRetry(
      async () => {
        const browser = await puppeteer.default.launch(browserWorker);
        try {
          const page = await browser.newPage();
          try {
            // Stealth/Anti-bot overrides
            await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
            await page.setExtraHTTPHeaders({
              "Accept-Language": "en-US,en;q=0.9",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            });
            await page.evaluateOnNewDocument(() => {
              Object.defineProperty(navigator, "webdriver", {
                get: () => false,
              });
            });

            await page.goto(navigateUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

            // Wait for known selectors to ensure content loads
            if (navigateUrl.includes("indeed.com")) {
              try {
                await page.waitForSelector("#jobDescriptionText", { timeout: 8000 });
              } catch (e) {
                console.warn("[scrape-job] Timeout waiting for indeed jobDescriptionText:", e);
              }
            } else if (navigateUrl.includes("linkedin.com")) {
              try {
                await page.waitForSelector(".show-more-less-html__markup, .description__text, .jobs-description", { timeout: 8000 });
              } catch (e) {
                console.warn("[scrape-job] Timeout waiting for linkedin jobDescription:", e);
              }
            } else {
              await new Promise((r) => setTimeout(r, 3000));
            }

            const isIndeed = navigateUrl.includes("indeed.com");
            const isLinkedIn = navigateUrl.includes("linkedin.com");

            const evalResult = await page.evaluate((isIndeed, isLinkedIn) => {
              // Try targeted selectors first for clean extraction
              const selectors = [
                "#jobDescriptionText", // Indeed
                ".show-more-less-html__markup", // LinkedIn
                ".description__text", // LinkedIn alt
                ".jobs-description", // LinkedIn alt
                "[data-ui='job-description']", // Workable
                ".job-description", // General
                "#content", // Greenhouse
                ".posting-headline", // Lever
              ];
              for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                  // Clean up children script/style tags if any
                  el.querySelectorAll("script, style").forEach((s) => s.remove());
                  const t = el.textContent?.trim();
                  if (t && t.length > 100) return { text: t, foundTarget: true };
                }
              }

              // Fallback to body clean text
              const scripts = document.querySelectorAll("script, style, nav, footer, header");
              scripts.forEach((el) => el.remove());
              return { text: document.body?.innerText?.trim() ?? "", foundTarget: false };
            }, isIndeed, isLinkedIn);

            if (isIndeed && !evalResult.foundTarget) {
              throw new Error("Indeed blocked this automated request or requires authentication. Please copy and paste the job description text manually.");
            }
            if (isLinkedIn && !evalResult.foundTarget) {
              throw new Error("LinkedIn blocked this automated request or requires authentication. Please copy and paste the job description text manually.");
            }

            const cleanText = evalResult.text;
            if (!cleanText) throw new Error("No text content extracted from the page");

            const lowerText = cleanText.toLowerCase();
            const botSigs = [
              "security check",
              "access denied",
              "verify you are human",
              "checking your browser",
              "turnstile",
              "cloudflare",
              "datadome",
              "bot-detection",
              "authenticating..."
            ];
            if (botSigs.some((sig) => lowerText.includes(sig))) {
              throw new Error("This request was blocked by the website's bot detection system. Please copy and paste the job description text manually.");
            }

            await kvNamespace.put(cacheKey, cleanText, { expirationTtl: 7 * 24 * 60 * 60 });
            return { text: cleanText, fromCache: false };
          } finally {
            try {
              await page.close();
            } catch (err) {
              console.error("[scrape-job] failed to close page:", err);
            }
          }
        } finally {
          try {
            await browser.close();
          } catch (err) {
            console.error("[scrape-job] failed to close browser:", err);
          }
        }
      },
      {
        maxRetries: 2,
        baseDelayMs: 2000,
        onRetry: (attempt, error) => {
          console.warn(`[scrape-job] Single job scrape attempt failed, retrying (attempt ${attempt}):`, error);
        },
      }
    );
  } catch (error) {
    console.error("scrapeJob error:", error);
    throw error;
  }
}

export const scrapeJob = createServerFn({ method: "POST" })
  .inputValidator((data: { url: string }) => {
    if (!data.url || !URL.canParse(data.url)) {
      throw new Error("A valid URL is required");
    }
    return data;
  })
  .handler(async ({ data }) => scrapeJobInternal(data.url));
