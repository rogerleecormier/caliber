
import { POTENTIAL_COMPANIES } from './src/routes/api/v2/seed-potential-companies';
import * as fs from 'fs';

const uniqueSlugs = [...new Set(POTENTIAL_COMPANIES)];
const sqlStatements = uniqueSlugs.map(slug => {
    const id = crypto.randomUUID();
    return `INSERT OR IGNORE INTO potential_companies (id, slug, status, check_count) VALUES ('${id}', '${slug}', 'pending', 0);`;
});

fs.writeFileSync('seed.sql', sqlStatements.join('\n'));
console.log(`Generated seed.sql with ${sqlStatements.length} statements.`);
