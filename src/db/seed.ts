import { getDbFromContext, schema } from './db'

const defaultCategories = [
  {
    name: 'Programming & Development',
    slug: 'programming-development',
    description: 'Software development, web development, mobile apps, and coding roles',
  },
  {
    name: 'Project Management',
    slug: 'project-management',
    description: 'Project managers, product managers, scrum masters, and agile roles',
  },
  {
    name: 'Design',
    slug: 'design',
    description: 'UI/UX design, graphic design, product design, and creative roles',
  },
  {
    name: 'Marketing',
    slug: 'marketing',
    description: 'Digital marketing, content marketing, SEO, and growth roles',
  },
  {
    name: 'Data Science & Analytics',
    slug: 'data-science-analytics',
    description: 'Data scientists, analysts, machine learning engineers, and BI roles',
  },
  {
    name: 'DevOps & Infrastructure',
    slug: 'devops-infrastructure',
    description: 'DevOps engineers, SRE, cloud architects, and infrastructure roles',
  },
  {
    name: 'Customer Support',
    slug: 'customer-support',
    description: 'Customer service, technical support, and success roles',
  },
  {
    name: 'Sales',
    slug: 'sales',
    description: 'Sales representatives, account executives, and business development',
  },
  {
    name: 'Product Management',
    slug: 'product-management',
    description: 'Product managers, product owners, and product leadership roles',
  },
  {
    name: 'Healthcare & Medical',
    slug: 'healthcare-medical',
    description: 'Remote medical coding, telehealth, clinical research, healthcare admin, and medical support roles',
  },
  {
    name: 'Administrative & Reception',
    slug: 'administrative-reception',
    description: 'Virtual assistants, receptionists, office administrators, and clerical support roles',
  },
  {
    name: 'Education & Training',
    slug: 'education-training',
    description: 'Online tutoring, instructional design, curriculum development, and training coordinator roles',
  },
  {
    name: 'Legal',
    slug: 'legal',
    description: 'Paralegals, legal assistants, contract specialists, and compliance roles',
  },
  {
    name: 'Accounting & Finance',
    slug: 'accounting-finance',
    description: 'Bookkeepers, accountants, financial analysts, payroll, and billing roles',
  },
  {
    name: 'Human Resources',
    slug: 'human-resources',
    description: 'HR coordinators, recruiters, benefits administrators, and people operations roles',
  },
  {
    name: 'Writing & Content',
    slug: 'writing-content',
    description: 'Technical writers, editors, translators, transcriptionists, and content creators',
  },
]

const mockJobs = [
  {
    title: 'Senior Full Stack Developer',
    description:
      'We are looking for an experienced Full Stack Developer to join our remote team. You will work on building scalable web applications using React, Node.js, and PostgreSQL. Strong TypeScript skills required.',
    payRange: '$120,000 - $160,000',
    postDate: new Date('2025-11-20'),
    sourceUrl: 'https://example.com/jobs/senior-fullstack-dev',
    sourceName: 'TechJobs',
    categoryId: 1, // Programming & Development
    remoteType: 'fully_remote',
  },
  {
    title: 'Product Manager - SaaS',
    description:
      'Join our product team to drive the roadmap for our SaaS platform. Work with engineering, design, and stakeholders to deliver features that delight customers. 3+ years PM experience required.',
    payRange: '$130,000 - $170,000',
    postDate: new Date('2025-11-22'),
    sourceUrl: 'https://example.com/jobs/product-manager-saas',
    sourceName: 'RemoteOK',
    categoryId: 9, // Product Management
    remoteType: 'fully_remote',
  },
  {
    title: 'UI/UX Designer',
    description:
      'Create beautiful, intuitive interfaces for our mobile and web applications. Collaborate with product and engineering teams. Portfolio showcasing modern design work required.',
    payRange: '$90,000 - $120,000',
    postDate: new Date('2025-11-24'),
    sourceUrl: 'https://example.com/jobs/ui-ux-designer',
    sourceName: 'WeWorkRemotely',
    categoryId: 3, // Design
    remoteType: 'fully_remote',
  },
  {
    title: 'Content Marketing Manager',
    description:
      'Lead our content strategy and create engaging blog posts, case studies, and social media content. SEO knowledge and B2B SaaS experience preferred.',
    payRange: '$80,000 - $110,000',
    postDate: new Date('2025-11-23'),
    sourceUrl: 'https://example.com/jobs/content-marketing-manager',
    sourceName: 'FlexJobs',
    categoryId: 4, // Marketing
    remoteType: 'fully_remote',
  },
  {
    title: 'Data Scientist',
    description:
      'Build predictive models and analyze large datasets to drive business decisions. Strong Python, SQL, and machine learning skills required. Experience with AWS or GCP is a plus.',
    payRange: '$140,000 - $180,000',
    postDate: new Date('2025-11-21'),
    sourceUrl: 'https://example.com/jobs/data-scientist',
    sourceName: 'AngelList',
    categoryId: 5, // Data Science & Analytics
    remoteType: 'fully_remote',
  },
  {
    title: 'DevOps Engineer',
    description:
      'Manage and optimize our cloud infrastructure on AWS. Implement CI/CD pipelines, monitoring, and automation. Kubernetes and Terraform experience required.',
    payRange: '$130,000 - $165,000',
    postDate: new Date('2025-11-25'),
    sourceUrl: 'https://example.com/jobs/devops-engineer',
    sourceName: 'Stack Overflow Jobs',
    categoryId: 6, // DevOps & Infrastructure
    remoteType: 'fully_remote',
  },
  {
    title: 'Customer Success Manager',
    description:
      'Help our enterprise customers succeed with our platform. Conduct training sessions, gather feedback, and ensure high customer satisfaction. SaaS experience preferred.',
    payRange: '$70,000 - $95,000',
    postDate: new Date('2025-11-19'),
    sourceUrl: 'https://example.com/jobs/customer-success-manager',
    sourceName: 'Remote.co',
    categoryId: 7, // Customer Support
    remoteType: 'fully_remote',
  },
  {
    title: 'Account Executive',
    description:
      'Drive new business by selling our B2B SaaS solution to mid-market companies. Meet with prospects, conduct demos, and close deals. 2+ years sales experience required.',
    payRange: '$100,000 - $150,000 (OTE)',
    postDate: new Date('2025-11-26'),
    sourceUrl: 'https://example.com/jobs/account-executive',
    sourceName: 'LinkedIn Jobs',
    categoryId: 8, // Sales
    remoteType: 'fully_remote',
  },
  {
    title: 'Frontend Developer - React',
    description:
      'Build responsive, high-performance web applications using React and modern JavaScript. Work closely with designers to implement pixel-perfect UIs. Remote-first company culture.',
    payRange: '$100,000 - $140,000',
    postDate: new Date('2025-11-18'),
    sourceUrl: 'https://example.com/jobs/frontend-react-dev',
    sourceName: 'GitHub Jobs',
    categoryId: 1, // Programming & Development
    remoteType: 'fully_remote',
  },
  {
    title: 'Marketing Analytics Lead',
    description:
      'Analyze marketing performance across all channels and provide actionable insights. Build dashboards and reports for leadership. SQL, Python, and data visualization skills required.',
    payRange: '$110,000 - $145,000',
    postDate: new Date('2025-11-17'),
    sourceUrl: 'https://example.com/jobs/marketing-analytics-lead',
    sourceName: 'Indeed',
    categoryId: 5, // Data Science & Analytics
    remoteType: 'fully_remote',
  },
]

async function seed() {
  const db = await getDbFromContext({})
  console.log('Seeding database...')

  // Insert categories and mock jobs using batch for reliability
  console.log('Inserting categories and mock jobs...')
  await db.batch([
    db.insert(schema.categories).values(defaultCategories).onConflictDoNothing(),
    db.insert(schema.jobs).values(mockJobs).onConflictDoNothing(),
  ])

  console.log('Database seeded successfully!')
}

seed()
  .catch((error) => {
    console.error('Error seeding database:', error)
    process.exit(1)
  })
