
import { getAllCompanies } from './src/lib/job-sources/company-sources';

const companies = getAllCompanies();
console.log(`Total unique companies: ${companies.length}`);
