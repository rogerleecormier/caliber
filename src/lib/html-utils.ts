import * as cheerio from 'cheerio'

/**
 * Converts plain text to HTML by detecting paragraphs and headings
 * This is needed when APIs return plain text instead of HTML
 */
function convertPlainTextToHtml(text: string): string {
  if (!text) return ''
  
  // Check if the text already has HTML tags
  if (/<[a-z][\s\S]*>/i.test(text)) {
    // Already has HTML, return as-is
    return text
  }
  
  // Split by double newlines to detect paragraphs
  const paragraphs = text.split(/\n\n+/)
  
  let html = ''
  for (const para of paragraphs) {
    if (!para.trim()) continue
    
    // Check if this paragraph looks like a heading (ends with colon, short, title case)
    const trimmed = para.trim()
    const lines = trimmed.split('\n')
    
    for (const line of lines) {
      const cleanLine = line.trim()
      if (!cleanLine) continue
      
      // Detect headings: short lines ending with colon, or all caps
      if (cleanLine.endsWith(':') && cleanLine.length < 80) {
        html += `<h3>${cleanLine}</h3>`
      } else if (/^[A-Z][A-Z\s'&]{2,50}:/.test(cleanLine)) {
        // ALL CAPS heading
        html += `<h3>${cleanLine}</h3>`
      } else {
        // Regular paragraph
        html += `<p>${cleanLine}</p>`
      }
    }
  }
  
  return html || `<p>${text}</p>`
}

/**
 * Sanitizes HTML while preserving basic formatting
 * Keeps: <p>, <br>, <b>, <strong>, <i>, <em>, <u>, <ul>, <li>, <h1-h6>
 * Removes: <script>, <style>, dangerous attributes, inline styles
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  
  // STEP 1: Convert plain text to HTML if needed
  // This handles cases where APIs return plain text instead of HTML
  const htmlInput = convertPlainTextToHtml(html)
  
  // STEP 2: Fix common encoding issues before processing
  let cleaned = htmlInput
    // Fix common encoding issues (Mojibake)
    // UTF-8 characters interpreted as Windows-1252 or Latin-1
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00A0/g, ' ')
    
    // Apostrophes / Single Quotes
    .replace(/â€™/g, "'")     // ’ (U+2019) -> â€™
    .replace(/â€˜/g, "'")     // ‘ (U+2018) -> â€˜
    
    // Robust fix for UTF-8 bytes interpreted as Latin-1 (E2 80 XX sequences)
    // This covers: ’ (99), ‘ (98), “ (9C), ” (9D), – (93), — (94), … (A6)
    .replace(/\u00e2\u0080([\u0080-\u00bf])/g, (_match, p1) => {
      const hex = p1.charCodeAt(0).toString(16).toUpperCase();
      switch (hex) {
        case '98': return "'"; // ‘
        case '99': return "'"; // ’
        case '9C': return '"'; // “
        case '9D': return '"'; // ”
        case '93': return "–"; // –
        case '94': return "—"; // —
        case 'A6': return "..."; // …
        default: return "'"; // Default to apostrophe for unknown E2 80 XX chars to be safe
      }
    })

    // Weird Glyphs (Observed in screenshots)
    .replace(/â⁻⁗/g, "'")     // â (E2) + ⁻ (207B) + ⁗ (2057) -> '
    .replace(/\u00e2\u207b\u2057/g, "'") // Explicit unicode for above
    
    // Double Quotes (Legacy patterns)
    .replace(/â€œ/g, '"')     // “ (U+201C) -> â€œ
    .replace(/â\u0080\u009c/gi, '"')
    .replace(/â€/g, '"')      // ” (U+201D) -> â€ (often truncated)
    .replace(/â\u0080\u009d/gi, '"')
    
    // Dashes
    .replace(/â€“/g, '–')     // – (U+2013) -> â€“
    .replace(/â\u0080\u0093/g, '–')
    .replace(/â€”/g, '—')     // — (U+2014) -> â€”
    .replace(/â\u0080\u0094/g, '—')
    
    // Bullets and others
    .replace(/â€¢/g, '•')     // • (U+2022) -> â€¢
    .replace(/â\u0080\u00a2/g, '•')
    .replace(/Â/g, '')        // Non-breaking space artifact (U+00C2)
    
    .replace(/\\n/g, '') // Remove literal \n characters
  
  // Load HTML with cheerio
  const $ = cheerio.load(cleaned)
  
  // Remove dangerous tags entirely
  $('script, style, iframe, object, embed, form, input').remove()
  
  // Remove all attributes (styles, classes, IDs, etc.)
  $('*').each((_, el) => {
    if (el.type === 'tag') {
      const $el = $(el)
      const attrs = $el.attr()
      if (attrs) {
        Object.keys(attrs).forEach(attr => {
          $el.removeAttr(attr)
        })
      }
    }
  })
  
  // Remove links but keep their text content
  $('a').each((_, el) => {
    const text = $(el).text()
    $(el).replaceWith(text)
  })
  
  // Convert div tags to paragraphs for better spacing, but avoid invalid nesting
  $('div').each((_, el) => {
    const $el = $(el)
    // If div contains block elements, unwrap it to avoid <p><div>...</div></p> or <p><p>...</p></p>
    if ($el.find('p, ul, ol, div, h1, h2, h3, h4, h5, h6, blockquote, pre').length > 0) {
       $el.replaceWith($el.html() || '')
    } else {
       // Otherwise it's likely text or inline elements, wrap in p
       const content = $el.html()
       if (content && content.trim()) {
         $el.replaceWith(`<p>${content}</p>`)
       } else {
         $el.remove()
       }
    }
  })
  
  // Headings are now allowed (h1-h6), so we don't convert them
  
  // Convert "fake" lists (paragraphs starting with bullets) to real lists
  // Lever often does: <p><span>•</span> Text</p> or <p>• Text</p>
  // Regex includes: •, -, ⁃, ∙, ●, ▪, *, · (middle dot), and various unicode bullets
  const bulletRegex = /^[\s\u200B]*[•\-\u2022\u2023\u25E6\u2043\u2219\u25CF\u25AA*·]\s*/;
  
  // First pass: identify and mark potential list items
  $('p').each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    const spanText = $el.find('span').text().trim();
    const hasBulletSpan = spanText.match(/^[•\-\u2022\u2023\u25E6\u2043\u2219\u25CF\u25AA*·]/);
    
    if (text.match(bulletRegex) || hasBulletSpan) {
      // Remove the bullet character/span from the content
      let content = $el.html() || '';
      
      // If it has a span bullet, remove the bullet from the span
      if (hasBulletSpan) {
        const $clone = $el.clone();
        $clone.find('span').each((_, span) => {
           const $span = $(span);
           const sText = $span.text().trim();
           // Check if this span starts with a bullet
           if (sText.match(/^[•\-\u2022\u2023\u25E6\u2043\u2219\u25CF\u25AA*·]/)) {
             // Replace the bullet in the text, keeping the rest
             const newText = $span.text().replace(bulletRegex, '');
             if (newText.trim() === '') {
               $span.remove();
             } else {
               $span.text(newText);
             }
           } else if (sText === '') {
             $span.remove();
           }
        });
        content = $clone.html() || '';
      } else {
        // Text bullet, remove via regex
        content = content.replace(bulletRegex, '');
      }
      
      $el.replaceWith(`<li data-converted="true">${content.trim()}</li>`);
    }
  });

  // Second pass: Wrap consecutive <li> elements in <ul>
  // We iterate through all converted li elements and group them
  $('li[data-converted="true"]').each((_, el) => {
    const $el = $(el);
    // Remove the marker attribute
    $el.removeAttr('data-converted');
    
    // Check if previous sibling is a UL
    const $prev = $el.prev();
    if ($prev.length > 0 && $prev[0].tagName === 'ul') {
      // Append to existing UL
      $prev.append($el);
    } else {
      // Create new UL and wrap this LI
      const $ul = $('<ul></ul>');
      $el.before($ul);
      $ul.append($el);
    }
  });

  // Lists are preserved as is

  
  // Get the sanitized HTML
  const bodyHtml = $('body').html()
  let sanitized = bodyHtml || ''
  
  // Clean up excessive whitespace and empty tags
  sanitized = sanitized
    .replace(/<p>\s*<\/p>/g, '') // Remove empty paragraphs
    .replace(/<p>\s*•\s*<\/p>/g, '') // Remove empty bullet points
    .replace(/<p><br\s*\/?><\/p>/g, '') // Remove paragraphs with only br
    
    // Convert double breaks to paragraph splits (for spacing)
    .replace(/<br\s*\/?>\s*<br\s*\/?>/g, '</p><p>')
    
    // ENHANCED: Convert bold/strong text followed by colon at start of paragraph into h3
    // This handles "Technical Skills:", "About the Role:", etc.
    // Pattern: <p><strong>TEXT:</strong> or <p><b>TEXT:</b>
    .replace(/<p>\s*<(strong|b)>([^<]+?):<\/(strong|b)>/gi, '<h3>$2:</h3><p>')
    
    // ENHANCED: Also handle case where bold heading is followed by a break
    // Pattern: <p><strong>TEXT:</strong><br> -> <h3>TEXT:</h3><p>
    .replace(/<p>\s*<(strong|b)>([^<]+?):<\/(strong|b)>\s*<br\s*\/?>/gi, '<h3>$2:</h3><p>')
    
    // Heuristic: If a paragraph starts with bold/strong and is followed by a break, split it
    // This handles "<b>Heading</b><br>Content" -> "<p><b>Heading</b></p><p>Content</p>"
    .replace(/<p>\s*(<(?:b|strong)>.*?<\/(?:b|strong)>)\s*<br\s*\/?>/g, '<p>$1</p><p>')
    
    // Heuristic: Detect ALL CAPS HEADINGS followed by a colon in the middle of text
    // Example: "...with us? THE OPPORTUNITY: At Clari..." -> "...with us?</p><p><strong>THE OPPORTUNITY:</strong> At Clari..."
    // We look for:
    // 1. Sentence ending (punctuation or start of string)
    // 2. Optional whitespace
    // 3. ALL CAPS PHRASE (min 3 chars, max 50 chars to avoid false positives)
    // 4. Colon
    .replace(/([.?!]\s+|^)([A-Z][A-Z\s'&]{2,50}):/g, '$1</p><h3>$2:</h3><p>')
    
    .replace(/\s+/g, ' ') // Normalize whitespace to single spaces
    .replace(/<\/p>\s*<p>/g, '</p><p>') // Clean paragraph spacing
    .replace(/<\/h3>\s*<p>\s*<\/p>/g, '</h3>') // Remove empty paragraphs after headings
    .replace(/\\n/g, '') // Remove any remaining literal \n
    .replace(/<p>\s*<\/p>/g, '') // Clean up any empty paragraphs created by the split
    .trim()
  
  return sanitized
}


/**
 * Decodes HTML entities and fixes common UTF-8/Latin-1 mojibake issues
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return ''
  
  // 0. Handle DOUBLE-ENCODED entities first (e.g., &amp;#8211; -> &#8211; -> –)
  // This is common when APIs double-encode HTML entities
  let decoded = text
    .replace(/&amp;#(\d+);/g, '&#$1;')     // &amp;#8211; -> &#8211;
    .replace(/&amp;#x([0-9a-fA-F]+);/g, '&#x$1;')  // &amp;#x2013; -> &#x2013;
    .replace(/&amp;amp;/g, '&amp;')         // &amp;amp; -> &amp;
    .replace(/&amp;([a-zA-Z]+);/g, '&$1;') // &amp;nbsp; -> &nbsp;
  
  // 1. Basic named entities lookup
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': ' ',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&ndash;': '–',
    '&mdash;': '—',
    '&bull;': '•',
    '&middot;': '·',
    '&lsquo;': "'",
    '&rsquo;': "'",
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&euro;': '€',
    '&pound;': '£',
    '&cent;': '¢',
    '&yen;': '¥',
  }

  // 2. Replace named entities
  decoded = decoded.replace(/&[a-zA-Z0-9]+;/g, (match) => {
    return entities[match] || match
  })

  // 3. Replace numeric entities (decimal and hex)
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  
  // 4. Fix common UTF-8 mojibake (text that was UTF-8 but decoded as Latin-1)
  decoded = decoded
    // Quotes
    .replace(/â€™/g, "'")   // Right single quote (')
    .replace(/â€˜/g, "'")   // Left single quote (')
    .replace(/â€œ/g, '"')   // Left double quote (")
    .replace(/â€/g, '"')    // Right double quote (")
    .replace(/â€¦/g, '…')   // Ellipsis
    
    // Dashes
    .replace(/â€"/g, '–')   // En dash
    .replace(/â€"/g, '—')   // Em dash
    
    // Bullets and symbols
    .replace(/â€¢/g, '•')   // Bullet
    .replace(/Â·/g, '·')    // Middle dot
    .replace(/Â®/g, '®')    // Registered trademark
    .replace(/Â©/g, '©')    // Copyright
    .replace(/â„¢/g, '™')   // Trademark
    
    // Spaces and formatting
    .replace(/Â/g, '')      // Non-breaking space artifacts
    .replace(/\u00A0/g, ' ') // Non-breaking space to regular space
    
    // Other common mojibake patterns
    .replace(/Ã©/g, 'é')    // e with acute
    .replace(/Ã¨/g, 'è')    // e with grave
    .replace(/Ã /g, 'à')    // a with grave
    .replace(/Ã¡/g, 'á')    // a with acute
    .replace(/Ã­/g, 'í')    // i with acute
    .replace(/Ã³/g, 'ó')    // o with acute
    .replace(/Ãº/g, 'ú')    // u with acute
    .replace(/Ã±/g, 'ñ')    // n with tilde
  
  return decoded
}

/**
 * Truncates HTML to a specific length while preserving tags
 */
export function truncateHtml(html: string, maxLength: number = 500): string {
  const $ = cheerio.load(html)
  const text = $.text()
  
  if (text.length <= maxLength) return html
  
  // If too long, truncate and add ellipsis
  const truncated = html.substring(0, maxLength)
  return truncated + '...'
}
