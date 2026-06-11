import { JSDOM } from 'jsdom';

interface ScraperConfig {
  maxRetries?: number;
  baseDelay?: number; // milliseconds
  jitterRange?: number; // milliseconds
  timeout?: number; // milliseconds
  proxy?: string;
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
];

interface ScrapedJobDescription {
  fullDescription: string;
  extractedAt: Date;
  source: 'jooble-scraper';
}

export class JoobleScraper {
  private config: Required<ScraperConfig>;
  private lastRequestTime: number = 0;

  constructor(config: ScraperConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      baseDelay: config.baseDelay ?? 1000,
      jitterRange: config.jitterRange ?? 500,
      timeout: config.timeout ?? 10000,
      proxy: config.proxy ?? '',
    };
  }

  /**
   * Scrape a Jooble job description from a given job URL
   * Implements human-like behavior to bypass bot detection
   */
  async scrapeJobDescription(jobUrl: string): Promise<ScrapedJobDescription | null> {
    // Apply rate limiting - human-like delay
    await this.respectfulDelay();

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const description = await this.fetchAndParse(jobUrl);
        if (description) {
          return {
            fullDescription: description,
            extractedAt: new Date(),
            source: 'jooble-scraper',
          };
        }
      } catch (error) {
        console.warn(
          `Attempt ${attempt}/${this.config.maxRetries} failed for ${jobUrl}:`,
          error instanceof Error ? error.message : String(error)
        );

        if (attempt < this.config.maxRetries) {
          // Exponential backoff + jitter
          const delayMs = this.config.baseDelay * Math.pow(2, attempt - 1) + Math.random() * this.config.jitterRange;
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    return null;
  }

  private async fetchAndParse(jobUrl: string): Promise<string | null> {
    const headers = this.buildHumanHeaders();

    const fetchOptions: RequestInit = {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(this.config.timeout),
    };

    if (this.config.proxy) {
      // Proxy support for Cloudflare Workers would require a different approach
      // For now, this is a placeholder for when proxy support is available
    }

    const response = await fetch(jobUrl, fetchOptions);

    if (!response.ok) {
      // 403 typically indicates bot detection
      if (response.status === 403) {
        throw new Error('Bot detection (HTTP 403) - may need proxy rotation');
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Parse with JSDOM (works in Node.js, may need alternative for Workers)
    try {
      const dom = new JSDOM(html);
      const description = this.extractDescription(dom);
      return description;
    } catch (error) {
      // Fallback: basic regex if JSDOM not available
      return this.extractDescriptionRegex(html);
    }
  }

  private extractDescription(dom: JSDOM): string | null {
    const document = dom.window.document;

    // Try multiple selectors commonly used for job descriptions
    const selectors = [
      '[data-test="jobDescription"]',
      '.job-description',
      '.description',
      '[class*="description"]',
      'article',
      'main',
      '.job-content',
      '[class*="jobContent"]',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent) {
        const text = element.textContent.trim();
        if (text.length > 100) {
          // Filter out common nav/footer text
          return this.cleanText(text);
        }
      }
    }

    // Fallback: get main content area text
    const main = document.querySelector('main') || document.querySelector('body');
    if (main) {
      const text = main.textContent?.trim() || '';
      return this.cleanText(text);
    }

    return null;
  }

  private extractDescriptionRegex(html: string): string | null {
    // Remove scripts and styles
    let cleaned = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Extract text content
    const textMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const text = textMatch ? textMatch[1] : cleaned;

    // Remove HTML tags
    const plainText = text
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return plainText.length > 100 ? this.cleanText(plainText) : null;
  }

  private cleanText(text: string): string {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.match(/^(Apply|Share|Save|View all|Job details)/i))
      .slice(0, 100) // Limit to first 100 lines
      .join('\n');
  }

  private buildHumanHeaders(): Record<string, string> {
    const randomAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    return {
      'User-Agent': randomAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    };
  }

  private async respectfulDelay(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minDelay = this.config.baseDelay + Math.random() * this.config.jitterRange;

    if (timeSinceLastRequest < minDelay) {
      await new Promise((r) => setTimeout(r, minDelay - timeSinceLastRequest));
    }

    this.lastRequestTime = Date.now();
  }
}
