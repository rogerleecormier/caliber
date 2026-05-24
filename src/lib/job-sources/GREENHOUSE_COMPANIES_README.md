# Greenhouse Companies Database

This file contains a comprehensive, categorized list of companies using Greenhouse ATS that commonly have remote job openings.

## Quick Start

### Adding a New Company

1. **Test the company slug first:**
   ```bash
   curl https://boards-api.greenhouse.io/v1/boards/COMPANY-SLUG/jobs
   ```

2. **If successful, add to the appropriate category in `greenhouse-companies.json`**

3. **Run sync to verify:**
   ```bash
   npm run sync-jobs
   ```

## How to Find Company Slugs

### Method 1: Career Page URL
Visit a company's career page. If it uses Greenhouse, the URL will be:
- `https://boards.greenhouse.io/COMPANY-SLUG`
- Extract the slug from the URL

### Method 2: Search
Look for "Powered by Greenhouse" on career pages. The slug is usually:
- Lowercase company name
- Hyphens instead of spaces
- Sometimes abbreviated

### Common Patterns
- **Single word**: `stripe`, `notion`, `figma`
- **Two words**: `gitlab`, `github`, `doordash`  
- **With hyphens**: `y-combinator`, `hash-corp`
- **Abbreviated**: `gh` (GitHub sometimes), but usually full name

## Current Statistics

- **Total Companies**: 200+
- **Categories**: 15
- **Active Success Rate**: ~30-35%
- **Last Updated**: 2025-11-28

## Categories Overview

| Category | Count | Examples |
|----------|-------|----------|
| Tech Giants | 18 | Microsoft, Amazon, Netflix, Uber |
| Established Tech | 29 | Stripe, GitHub, Notion, Shopify |
| Remote-First | 22 | Zapier, Buffer, DuckDuckGo |
| Startups & Scale-ups | 30 | Plaid, Retool, Linear, Vercel |
| Fintech | 23 | Coinbase, Affirm, Kraken |
| Security & DevOps | 20 | Snyk, 1Password, CrowdStrike |
| Developer Tools | 20 | GitLab, CircleCI, Sourcegraph |
| Data & Analytics | 20 | Segment, Heap, Fivetran |
| SaaS Products | 20 | Asana, Monday, Airtable |
| E-commerce | 15 | Etsy, Mercari, StockX |
| Healthcare | 20 | Oscar, Maven, Udacity |
| Education | 20 | Coursera, Udemy, Duolingo |
| Design & Creative | 20 | Adobe, Figma, Framer |
| Communication | 20 | Twilio, Vonage, Sendbird |
| Y Combinator | 20 | Stripe, Coinbase, Brex, Gusto |

## Maintenance Tips

### Removing Inactive Companies
If a company consistently returns 404 or has no remote jobs:
1. Check if they still use Greenhouse
2. If not, remove from JSON or move to a "deprecated" category
3. Document in commit message

### Testing Bulk Additions
Before adding many companies:
1. Test each slug individually
2. Add in small batches (10-20 at a time)
3. Run sync to verify
4. Monitor success rates

### Avoiding Duplicates
The system automatically deduplicates, but try to avoid adding the same company to multiple categories unless necessary.

## Troubleshooting

### Company Returns 404
- **Cause**: Not using Greenhouse or wrong slug
- **Fix**: Try alternative slug patterns or remove from list

### Company Returns Empty Jobs Array
- **Cause**: Using Greenhouse but no active job postings
- **Result**: Logged as "No remote positions" - this is fine

### Rate Limiting Issues
- **Cause**: Too many requests too quickly
- **Fix**: Increase delay between requests in `greenhouse.ts`
- Current delay: 500ms (recommended minimum)

## Contributing

To contribute new companies:
1. Test the slug works
2. Add to appropriate category
3. Include company name in commit message
4. Optional: Note industry/specialty

## Resources

- [Greenhouse Job Board API Docs](https://developers.greenhouse.io/job-board.html)
- [List of Companies Using Greenhouse](https://www.6sense.com/tech/applicant-tracking-system-ats/greenhouse-market-share)
- [Y Combinator Companies](https://www.ycombinator.com/companies)

## Notes

- **Slug Format**: Always lowercase, hyphenated
- **Remote Filter**: System automatically filters for "remote" in location
- **Update Frequency**: Review quarterly to remove inactive companies
- **Success Rate**: ~30-35% is normal (many companies inactive or moved platforms)
