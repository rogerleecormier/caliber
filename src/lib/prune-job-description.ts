/**
 * Job Description Pruning Utility
 *
 * Removes ATS boilerplate, HTML/Markdown noise, EEO compliance statements,
 * generic benefit summaries, and other cruft to drastically reduce database
 * weight while preserving meaningful job content.
 */

import * as cheerio from 'cheerio'

// Patterns for boilerplate text blocks that should be removed entirely
const BOILERPLATE_PATTERNS = [
  // EEO compliance statements
  /Equal Opportunity.*?(?:\n|<\/[^>]+>)/gi,
  /We are an Equal Opportunity Employer.*?(?:\n|<\/[^>]+>)/gi,
  /EEO.*?(?:\n|<\/[^>]+>)/gi,
  /is an Equal Opportunity Employer/gi,

  // Generic benefits/perks headers (common ATS output)
  /^(What We Offer|Benefits & Perks|Why Join Us\?|What We Provide|Compensation & Benefits).*?(?=^(?:[A-Z][A-Za-z\s]+:|$))/gim,
  /^(401k|Health Insurance|Dental|Vision|PTO|Paid Time Off|Remote Work|Flexible Hours).*?(?=^(?:[A-Z][A-Za-z\s]+:|$))/gim,

  // Generic benefit descriptions (often copy-paste across many jobs)
  /Competitive salary.*?(?:\n\n|$)/gi,
  /Health.*?benefits.*?(?:\n\n|$)/gi,
  /Dental.*?vision.*?(?:\n\n|$)/gi,
  /Flexible work schedule/gi,
  /Work.{0,20}life.{0,20}balance/gi,

  // ATS-specific boilerplate
  /\[Applicant Tracking System\].*?(?:\n|<\/[^>]+>)/gi,
  /Questions about this job\?/gi,
  /Apply now|Click here to apply/gi,

  // Recruitment agency jargon
  /Our client is seeking/gi,
  /We're currently recruiting for/gi,
  /recruitment consultant|talent advisor|hiring manager/gi,
]

// Patterns for text nodes that should be heavily truncated or removed
const MINIMAL_VALUE_PATTERNS = [
  // Contact/footer info
  /Contact us:|Email:|Phone:|Website:/gi,
  /Apply at|Submit your resume/gi,

  // Legal disclaimers
  /All qualified applicants|applicants with disabilities/gi,
  /This position is subject to/gi,
]

// Heading keywords that often indicate boilerplate sections
const BOILERPLATE_HEADINGS = [
  'equal opportunity',
  'eeo',
  'diversity',
  'benefits',
  'perks',
  'compensation',
  'salary range',
  'what we offer',
  'why join us',
  'our culture',
  'company overview',
  'about the company',
  'apply now',
  'how to apply',
  'contact',
  'equal employment opportunity',
]

/**
 * Remove ATS boilerplate, HTML/Markdown noise, and other cruft from job descriptions.
 * Preserves key job content like responsibilities, requirements, and qualifications.
 *
 * @param rawText - Raw job description (may be HTML, Markdown, or plain text)
 * @returns Pruned, plain-text job description
 */
export function pruneJobDescription(rawText: string): string {
  if (!rawText || rawText.trim().length === 0) {
    return ''
  }

  // If it looks like HTML, parse it; otherwise treat as plain text
  const isHtml = /<[a-z][\s\S]*>/i.test(rawText)
  let text = rawText

  if (isHtml) {
    text = parseHtmlToText(rawText)
  } else {
    // Plain text: just clean up encoding
    text = cleanEncodingIssues(rawText)
  }

  // Remove boilerplate patterns
  for (const pattern of BOILERPLATE_PATTERNS) {
    text = text.replace(pattern, '')
  }

  // Remove lines that contain minimal-value patterns
  text = text
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      if (!trimmed) return false

      // Skip lines that are mostly boilerplate
      for (const pattern of MINIMAL_VALUE_PATTERNS) {
        if (pattern.test(trimmed)) {
          return false
        }
      }

      return true
    })
    .join('\n')

  // Clean up excessive whitespace
  text = text
    .replace(/\n\n\n+/g, '\n\n') // Collapse multiple blank lines
    .replace(/[ \t]+/g, ' ') // Normalize spaces
    .trim()

  return text
}

/**
 * Parse HTML job description to plain text, removing boilerplate sections.
 */
function parseHtmlToText(html: string): string {
  const $ = cheerio.load(html)

  // Remove script, style, and other non-content tags
  $('script, style, iframe, object, embed, form, input, meta, link').remove()

  // Find and remove boilerplate sections by heading
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const $heading = $(el as any)
    const headingText = $heading.text().toLowerCase()

    // Check if this heading matches boilerplate patterns
    for (const boilerplateHeading of BOILERPLATE_HEADINGS) {
      if (headingText.includes(boilerplateHeading)) {
        // Remove the heading and all following content until the next heading
        const $next = $heading.next()
        const toRemove: any[] = [$heading]

        if ($next.length > 0) {
          // Find content between this heading and the next major heading
          let current = $heading.next()
          while (current.length > 0) {
            const tagName = current[0].tagName?.toLowerCase() || ''

            // Stop at next heading
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
              break
            }

            toRemove.push(current)
            current = current.next()
          }
        }

        // Remove all collected elements
        toRemove.forEach(el => el.remove())
        break
      }
    }
  })

  // Extract text content
  let text = $('body').text() || $.text()

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&#8209;/g, '-')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')

  // Clean up encoding issues
  text = cleanEncodingIssues(text)

  return text
}

/**
 * Fix common UTF-8/Latin-1 encoding issues.
 */
function cleanEncodingIssues(text: string): string {
  return text
    // UTF-8 mojibake
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€"/g, '–')
    .replace(/â€"/g, '—')
    .replace(/â€¢/g, '•')
    .replace(/Â/g, '')

    // Control characters
    .replace(/\0/g, '')
    .replace(/\r\n/g, '\n')
}
