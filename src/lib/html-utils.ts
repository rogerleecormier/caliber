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

  return decoded;
}

export function cleanJobDescription(description: string): string {
  if (!description) return '';

  let cleaned = decodeHtmlEntities(description);

  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // Replace multiple whitespace with single space
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
