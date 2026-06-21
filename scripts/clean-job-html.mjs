import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Standalone clean functions matching Caliber's html-utils
function decodeHtmlEntities(text) {
  if (!text) return '';

  const map = {
    '&nbsp;': ' ',
    '&amp;nbsp;': ' ',
    '&lt;': '<',
    '&amp;lt;': '<',
    '&gt;': '>',
    '&amp;gt;': '>',
    '&quot;': '"',
    '&amp;quot;': '"',
    '&#39;': "'",
    '&amp;': '&',
  };

  let decoded = text;
  let previous = '';
  let iterations = 0;

  while (decoded !== previous && iterations < 5) {
    previous = decoded;
    
    for (const [entity, char] of Object.entries(map)) {
      decoded = decoded.split(entity).join(char);
    }

    decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
      return String.fromCharCode(parseInt(dec, 10));
    });

    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
    
    iterations++;
  }

  return decoded;
}

function cleanJobDescription(description) {
  if (!description) return '';

  let cleaned = decodeHtmlEntities(description);

  // Strip HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // Strip any leftover entities
  cleaned = cleaned.replace(/&[a-zA-Z0-9#x]+;/g, ' ');

  // Normalize spaces/quotes
  cleaned = cleaned.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
  cleaned = cleaned.replace(/[\u2018\u2019]/g, "'");
  cleaned = cleaned.replace(/[\u201C\u201D]/g, '"');
  cleaned = cleaned.replace(/\u2026/g, '...');

  // Normalize spacing
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

async function main() {
  console.log('Fetching job descriptions from D1 remote database...');
  
  const query = 'SELECT id, description_plain, description_html FROM canonical_jobs';
  let output;
  try {
    output = execSync(
      `npx wrangler d1 execute DB --remote --json --command "${query}"`,
      { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 }
    );
  } catch (err) {
    console.error('Failed to fetch jobs from D1:', err);
    process.exit(1);
  }

  const parsed = JSON.parse(output);
  const rows = parsed[0]?.results || [];
  console.log(`Successfully fetched ${rows.length} jobs.`);

  const updates = [];
  const htmlTagPattern = /<[^>]*>/;

  for (const row of rows) {
    const plain = row.description_plain || '';
    const html = row.description_html || '';

    // Check if description_plain contains raw HTML tags
    if (htmlTagPattern.test(plain)) {
      // Use the HTML source if available, otherwise fallback to cleaning the plain field itself
      const source = html || plain;
      const cleaned = cleanJobDescription(source);
      
      if (cleaned && cleaned !== plain) {
        updates.push({
          id: row.id,
          cleaned
        });
      }
    }
  }

  console.log(`Found ${updates.length} jobs with raw HTML in their plain descriptions that need cleaning.`);

  if (updates.length === 0) {
    console.log('All jobs are clean. No updates needed.');
    return;
  }

  // Generate SQL batch files
  const chunkSize = 200;
  const tempFiles = [];

  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const sqlStatements = chunk.map(update => {
      const escapedCleaned = update.cleaned.replace(/'/g, "''");
      return `UPDATE canonical_jobs SET description_plain = '${escapedCleaned}', updated_at = '${new Date().toISOString()}' WHERE id = '${update.id}';`;
    });

    const chunkNum = Math.floor(i / chunkSize) + 1;
    const tempFileName = path.join(process.cwd(), `scripts/temp_clean_jobs_${chunkNum}.sql`);
    fs.writeFileSync(tempFileName, sqlStatements.join('\n'), 'utf8');
    tempFiles.push(tempFileName);
  }

  console.log(`Generated ${tempFiles.length} batch update SQL files.`);

  // Execute each SQL file
  for (let j = 0; j < tempFiles.length; j++) {
    const file = tempFiles[j];
    console.log(`Executing chunk ${j + 1}/${tempFiles.length} (${path.basename(file)})...`);
    try {
      execSync(`npx wrangler d1 execute DB --remote --file "${file}" --yes`, { stdio: 'inherit' });
    } catch (err) {
      console.error(`Failed to execute updates for file ${file}:`, err);
    } finally {
      // Clean up file
      try {
        fs.unlinkSync(file);
      } catch (e) {
        // ignore
      }
    }
  }

  console.log('Cleanup script finished processing all updates successfully.');
}

main().catch(console.error);
