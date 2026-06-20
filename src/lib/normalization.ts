import type { AtsJobResponse, NormalizedJob } from '@/types/crawler';

export function normalizeCompany(company: string): string {
  if (!company) return 'unknown';
  
  let norm = company.toLowerCase().trim();
  
  // Strip common suffixes
  norm = norm.replace(/\b(llc|inc|ltd|co|corp|corporation|gmbh|sa|pvt|ltd\.)\b/g, '');
  // Strip punctuation
  norm = norm.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ');
  // Collapse whitespace
  norm = norm.replace(/\s+/g, ' ').trim();
  
  // Custom nickname mapping
  const mappings: Record<string, string> = {
    'aws': 'amazon web services',
    'amazon': 'amazon web services',
    'google': 'google',
    'meta': 'facebook',
    'facebook': 'facebook',
    'msft': 'microsoft',
    'microsoft': 'microsoft',
  };
  
  return mappings[norm] || norm;
}

export function normalizeTitle(title: string): string {
  if (!title) return 'unknown';
  
  let norm = title.toLowerCase().trim();
  
  // Remove remote/hybrid suffixes and parentheses content
  norm = norm.replace(/\b(remote|hybrid|onsite|on-site|wfh|work from home)\b/gi, '');
  // Clean up punctuation/parentheses/brackets content
  norm = norm.replace(/\(([^)]+)\)/g, '');
  norm = norm.replace(/\[([^\]]+)\]/g, '');
  norm = norm.replace(/[|:\-\/\\•].*$/, ''); // strip everything after separator character
  
  // Standardize seniority abbreviations
  norm = norm.replace(/\b(sr\.?|snr\.?|senior)\b/g, 'senior');
  norm = norm.replace(/\b(jr\.?|junior)\b/g, 'junior');
  norm = norm.replace(/\b(staff)\b/g, 'staff');
  norm = norm.replace(/\b(principal)\b/g, 'principal');
  norm = norm.replace(/\b(lead)\b/g, 'lead');
  norm = norm.replace(/\b(ii|iii|iv|v)\b/g, ''); // strip Roman numerals
  
  // Standardize job functions
  norm = norm.replace(/\b(swe|software engineer|software developer|developer)\b/g, 'software engineer');
  norm = norm.replace(/\b(pm|product manager)\b/g, 'product manager');
  norm = norm.replace(/\b(qa|quality assurance|tester)\b/g, 'qa engineer');
  norm = norm.replace(/\b(sre|site reliability engineer)\b/g, 'site reliability engineer');
  
  // Final cleanup
  norm = norm.replace(/[^a-z0-9\s]/g, ' ');
  norm = norm.replace(/\s+/g, ' ').trim();
  
  return norm || title.toLowerCase().trim();
}

export function normalizeLocation(loc: string | undefined): { locationDisplay: string; locationNorm: string; remote: boolean } {
  if (!loc) {
    return { locationDisplay: 'Remote', locationNorm: 'remote', remote: true };
  }
  
  const original = loc.trim();
  const lower = original.toLowerCase();
  
  const isRemote = 
    lower.includes('remote') || 
    lower.includes('anywhere') || 
    lower.includes('wfh') || 
    lower.includes('work from home') ||
    lower.includes('telecommute') ||
    lower.includes('virtual') ||
    lower === 'us' ||
    lower === 'usa' ||
    lower === 'united states';
    
  if (isRemote) {
    return { locationDisplay: 'Remote', locationNorm: 'remote', remote: true };
  }
  
  // Standardize location string (lowercase, strip extra punctuation, whitespace)
  const norm = lower
    .replace(/[.\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
    
  return {
    locationDisplay: original,
    locationNorm: norm,
    remote: false
  };
}

export function normalizeJob(job: AtsJobResponse): NormalizedJob {
  const companyDisplay = job.company || 'Unknown';
  const titleDisplay = job.title;
  
  let locationDisplay = 'Remote';
  if (job.location) {
    if (typeof job.location === 'string') {
      locationDisplay = job.location;
    } else {
      const parts = [job.location.city, job.location.state, job.location.country].filter(Boolean);
      locationDisplay = parts.length > 0 ? parts.join(', ') : 'Remote';
    }
  }

  let descriptionPlain = '';
  let descriptionHtml = '';
  if (job.description) {
    if (typeof job.description === 'string') {
      descriptionPlain = job.description;
      descriptionHtml = job.description;
    } else {
      descriptionPlain = job.description.plain || '';
      descriptionHtml = job.description.html || '';
    }
  }

  const compNorm = normalizeCompany(companyDisplay);
  const titleNorm = normalizeTitle(titleDisplay);
  const { locationDisplay: finalLocDisplay, locationNorm, remote } = normalizeLocation(locationDisplay);
  
  // Dedup key is: companyNorm + titleNorm + locationNorm + 7-day window
  const weekEpoch = Math.floor(Date.now() / 604800000);
  const dedupKey = `${compNorm}::${titleNorm}::${locationNorm}::${weekEpoch}`;
  
  // For rawHash: SHA-255 of plain description if available, or title + company
  const rawHashContent = descriptionPlain || `${companyDisplay}::${titleDisplay}`;
  let rawHash = 'no-hash';
  try {
    let hash = 0;
    for (let i = 0; i < rawHashContent.length; i++) {
      const char = rawHashContent.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    rawHash = Math.abs(hash).toString(16);
  } catch {
    rawHash = 'fallback-hash';
  }
  
  return {
    companyDisplay,
    companyNorm: compNorm,
    titleDisplay,
    titleNorm,
    locationDisplay: finalLocDisplay,
    locationNorm,
    remote,
    employmentType: job.employmentType,
    experienceLevel: job.experienceLevel,
    department: job.department,
    team: job.team,
    descriptionPlain,
    descriptionHtml,
    compensationMin: job.compensation?.min,
    compensationMax: job.compensation?.max,
    compensationCurrency: job.compensation?.currency,
    dedupKey,
    rawHash
  };
}
