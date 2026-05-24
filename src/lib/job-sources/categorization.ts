import type { CategoryKeywords } from './types'

// Category keyword mappings for automatic categorization
export const categoryKeywords: CategoryKeywords[] = [
  {
    id: 1, // Programming & Development
    keywords: [
      'developer', 'engineer', 'programmer', 'software', 'frontend', 'backend',
      'full stack', 'fullstack', 'web developer', 'mobile developer', 'react',
      'angular', 'vue', 'node', 'python', 'java', 'javascript', 'typescript',
      'php', 'ruby', 'golang', 'rust', 'kotlin', 'swift', 'flutter', 'ios',
      'android', 'coding', 'dev', 'programming'
    ]
  },
  {
    id: 2, // Project Management
    keywords: [
      'project manager', 'scrum master', 'agile',
      'program manager', 'delivery manager', 'pmo', 'kanban',
      'project coordinator', 'technical project manager',
      'tpm', 'technical program manager'
    ]
  },
  {
    id: 9, // Product Management
    keywords: [
      'product manager', 'product owner', 'product lead',
      'head of product', 'vp of product', 'director of product',
      'associate product manager', 'apm', 'group product manager',
      'gpm', 'pm'
    ]
  },
  {
    id: 3, // Design
    keywords: [
      'designer', 'ui', 'ux', 'ui/ux', 'graphic design', 'web design',
      'product design', 'visual design', 'interaction design', 'figma',
      'sketch', 'adobe', 'illustrator', 'photoshop', 'creative'
    ]
  },
  {
    id: 4, // Marketing
    keywords: [
      'marketing', 'content', 'seo', 'sem', 'social media', 'digital marketing',
      'growth', 'brand', 'copywriter', 'content writer', 'marketing manager',
      'social media manager', 'email marketing', 'demand generation'
    ]
  },
  {
    id: 5, // Data Science & Analytics
    keywords: [
      'data scientist', 'data analyst', 'machine learning', 'ml', 'ai',
      'artificial intelligence', 'data engineer', 'analytics', 'business intelligence',
      'bi', 'tableau', 'power bi', 'sql', 'data', 'statistics', 'analyst'
    ]
  },
  {
    id: 6, // DevOps & Infrastructure
    keywords: [
      'devops', 'sre', 'site reliability', 'infrastructure', 'cloud', 'aws',
      'azure', 'gcp', 'kubernetes', 'docker', 'terraform', 'ci/cd',
      'jenkins', 'automation', 'system administrator', 'sysadmin'
    ]
  },
  {
    id: 7, // Customer Support
    keywords: [
      'customer support', 'customer service', 'technical support', 'help desk',
      'customer success', 'support engineer', 'support specialist', 'client success'
    ]
  },
  {
    id: 8, // Sales
    keywords: [
      'sales', 'account executive', 'bdr', 'sdr', 'business development',
      'sales representative', 'account manager', 'sales manager', 'inside sales'
    ]
  },
  {
    id: 10, // Healthcare & Medical
    keywords: [
      'medical', 'healthcare', 'health care', 'nurse', 'nursing', 'clinical',
      'telehealth', 'telemedicine', 'medical coding', 'medical coder', 'icd',
      'medical billing', 'health information', 'him', 'ehr', 'emr',
      'pharmacy', 'pharmacist', 'pharmacy technician', 'pharm tech',
      'medical records', 'patient', 'patient care', 'care coordinator',
      'utilization review', 'case manager', 'case management',
      'medical assistant', 'medical receptionist', 'medical secretary',
      'radiology', 'lab', 'laboratory', 'pathology', 'dental',
      'mental health', 'therapist', 'counselor', 'psychologist',
      'physician', 'doctor', 'md', 'registered nurse', 'rn', 'lpn',
      'cna', 'medical device', 'biotech', 'pharmaceutical',
      'clinical research', 'clinical trial', 'cra', 'crc',
      'health coach', 'wellness', 'dietitian', 'nutritionist'
    ]
  },
  {
    id: 11, // Administrative & Reception
    keywords: [
      'receptionist', 'administrative assistant', 'admin assistant',
      'virtual assistant', 'office manager', 'office administrator',
      'executive assistant', 'secretary', 'clerical', 'front desk',
      'office coordinator', 'administrative coordinator', 'data entry',
      'filing', 'scheduling', 'appointment', 'office support',
      'administrative support', 'admin support', 'personal assistant',
      'administrative specialist', 'office assistant'
    ]
  },
  {
    id: 12, // Education & Training
    keywords: [
      'teacher', 'tutor', 'instructor', 'professor', 'lecturer',
      'curriculum', 'instructional design', 'instructional designer',
      'e-learning', 'elearning', 'online teaching', 'education',
      'training', 'trainer', 'training coordinator', 'training specialist',
      'learning and development', 'l&d', 'academic', 'school',
      'teaching assistant', 'course developer', 'education specialist',
      'learning management', 'lms', 'onboarding specialist'
    ]
  },
  {
    id: 13, // Legal
    keywords: [
      'legal', 'paralegal', 'attorney', 'lawyer', 'law clerk',
      'legal assistant', 'legal secretary', 'contract specialist',
      'contracts manager', 'compliance', 'compliance officer',
      'regulatory', 'litigation', 'corporate counsel', 'legal counsel',
      'legal analyst', 'legal coordinator', 'patent', 'trademark',
      'intellectual property', 'ip', 'legal operations'
    ]
  },
  {
    id: 14, // Accounting & Finance
    keywords: [
      'accountant', 'accounting', 'bookkeeper', 'bookkeeping',
      'financial analyst', 'finance manager', 'cpa', 'auditor', 'audit',
      'tax', 'tax preparer', 'tax specialist', 'payroll',
      'accounts payable', 'accounts receivable', 'ap', 'ar',
      'billing', 'billing specialist', 'invoice', 'invoicing',
      'controller', 'treasurer', 'financial planning', 'fp&a',
      'budget', 'budgeting', 'general ledger', 'financial reporting',
      'revenue', 'collections', 'credit analyst'
    ]
  },
  {
    id: 15, // Human Resources
    keywords: [
      'human resources', 'hr', 'recruiter', 'recruiting', 'talent acquisition',
      'hr coordinator', 'hr manager', 'hr generalist', 'hr specialist',
      'people operations', 'people ops', 'benefits', 'benefits administrator',
      'compensation', 'hris', 'employee relations', 'workforce',
      'staffing', 'staffing coordinator', 'talent management',
      'diversity', 'dei', 'employee engagement', 'hr business partner',
      'hrbp', 'onboarding', 'offboarding'
    ]
  },
  {
    id: 16, // Writing & Content
    keywords: [
      'writer', 'writing', 'technical writer', 'technical writing',
      'editor', 'editing', 'copywriter', 'copy editor', 'proofreader',
      'proofreading', 'translator', 'translation', 'interpreter',
      'transcriptionist', 'transcription', 'content creator',
      'content strategist', 'content specialist', 'ghostwriter',
      'journalist', 'reporter', 'blogger', 'grant writer',
      'proposal writer', 'documentation', 'documentation specialist',
      'medical writer', 'science writer', 'ux writer', 'ux writing'
    ]
  }
]

export function determineCategoryId(title: string | null | undefined, description: string | null | undefined, tags: string[] = []): number {
  const titleLower = (title || '').toLowerCase()
  const tagsLower = tags.map(t => t.toLowerCase())

  // TIER 1: Title Match (Fastest & Highest Confidence)
  // If we find a match here, we return immediately and skip description scanning.
  for (const category of categoryKeywords) {
    for (const keyword of category.keywords) {
      if (titleLower.includes(keyword.toLowerCase())) {
        return category.id
      }
    }
  }

  // TIER 2: Tag Match (Fast & Medium Confidence)
  // If we find a tag match, we return immediately.
  for (const category of categoryKeywords) {
    for (const keyword of category.keywords) {
      const keywordLower = keyword.toLowerCase()
      if (tagsLower.some(t => t.includes(keywordLower))) {
        return category.id
      }
    }
  }

  // TIER 3: Description Match (Slowest & Low Confidence / Fallback)
  // Only scan description if we found NOTHING in title or tags.
  // Truncate description to safegaurd CPU even in fallback case.
  const descriptionLower = (description || '').slice(0, 2000).toLowerCase()
  if (!descriptionLower) return 1 // Programming

  let bestScore = 0
  let bestCategoryId = 1

  for (const category of categoryKeywords) {
    let score = 0
    for (const keyword of category.keywords) {
      if (descriptionLower.includes(keyword.toLowerCase())) {
        score += 1
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestCategoryId = category.id
    }
  }

  return bestCategoryId
}
