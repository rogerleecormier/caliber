'use server';
import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnv } from "@/lib/cloudflare";

function cleanUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.hostname.includes("linkedin.com") && url.pathname.includes("/jobs")) {
      const jobId = url.searchParams.get("currentJobId");
      if (jobId) return `https://www.linkedin.com/jobs/view/${jobId}/`;
    }
    const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "trackingId", "refId", "eBP"];
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
    if (!env.BROWSER || !env.KV) {
      throw new Error("Browser rendering not available in development mode. Deploy to Cloudflare Workers to use this feature.");
    }

    const cacheKey = await makeCacheKey(url);
    const navigateUrl = cleanUrl(url);

    const cached = await env.KV.get(cacheKey);
    if (cached) {
      return { text: cached, fromCache: true };
    }

    const puppeteer = await import("@cloudflare/puppeteer");
    const browser = await puppeteer.default.launch(env.BROWSER);
    const page = await browser.newPage();

    try {
      await page.goto(navigateUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 3000));

      const text = await page.evaluate(() => {
        const scripts = document.querySelectorAll("script, style, nav, footer, header");
        scripts.forEach((el) => el.remove());
        return document.body?.innerText?.trim() ?? "";
      });

      if (!text) throw new Error("No text content extracted from the page");

      await env.KV.put(cacheKey, text, { expirationTtl: 7 * 24 * 60 * 60 });
      return { text, fromCache: false };
    } finally {
      await browser.close();
    }
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
