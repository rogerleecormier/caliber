export function decodeHtmlEntities(text: string): string {
  if (!text) return '';

  const map: Record<string, string> = {
    '&nbsp;': ' ',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&amp;': '&',
  };

  let decoded = text;
  let previous = '';
  let iterations = 0;

  // Run up to 5 times to handle nested/doubly encoded entities (e.g. &amp;lt; -> &lt; -> <)
  while (decoded !== previous && iterations < 5) {
    previous = decoded;
    
    // Replace mapped entities
    for (const [entity, char] of Object.entries(map)) {
      decoded = decoded.split(entity).join(char);
    }

    // Handle numeric entities like &#123;
    decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
      return String.fromCharCode(parseInt(dec, 10));
    });

    // Handle hex entities like &#x1F;
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
    
    iterations++;
  }

  return decoded;
}

export function cleanJobDescription(description: string): string {
  if (!description) return '';

  // 1. Recursive decode HTML entities
  let cleaned = decodeHtmlEntities(description);

  // 2. Strip HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // 3. Strip any leftover or unrecognized entities (e.g. &ldquo;, &hellip;, &rsquo;, etc.)
  cleaned = cleaned.replace(/&[a-zA-Z0-9#x]+;/g, ' ');

  // 4. Normalize unicode characters (like non-breaking spaces, smart quotes, etc.)
  cleaned = cleaned.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' '); // Spaces
  cleaned = cleaned.replace(/[\u2018\u2019]/g, "'"); // Smart single quotes
  cleaned = cleaned.replace(/[\u201C\u201D]/g, '"'); // Smart double quotes
  cleaned = cleaned.replace(/\u2026/g, '...'); // Ellipsis

  // 5. Strip leading and trailing ellipses (e.g. "...text..." or "…text…")
  cleaned = cleaned.replace(/^(\s*[\.…]+\s*)+/, '');
  cleaned = cleaned.replace(/(\s*[\.…]+\s*)+$/, '');

  // 6. Replace multiple whitespace/newlines with a single space
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';

  // Remove script tags and their content
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove iframe tags
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

  // Remove event handlers
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');

  // Remove style attributes that could be dangerous
  sanitized = sanitized.replace(/\s*style\s*=\s*["']javascript:[^"']*["']/gi, '');

  return sanitized;
}
