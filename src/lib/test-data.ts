// Test job data for database sync testing
export const testJobs = [
  {
    title: "Senior Software Engineer",
    company: "Acme Corp",
    description:
      "We are looking for a Senior Software Engineer to join our backend team. You will work on building scalable systems that serve millions of users. Required: 5+ years of experience, strong problem solving skills.",
    salary: "$150,000 - $200,000",
    postedDate: new Date("2024-11-20"),
    sourceUrl: "https://example.com/jobs/senior-software-engineer-1",
    sourceName: "TestSource",
    tags: ["backend", "javascript", "senior"],
  },
  {
    title: "Product Manager",
    company: "TechStartup Inc",
    description:
      "Join our Product team to shape the future of our platform. You will work with engineers, designers, and stakeholders to define product strategy and roadmap. Experience with B2B SaaS preferred.",
    salary: "$120,000 - $160,000",
    postedDate: new Date("2024-11-19"),
    sourceUrl: "https://example.com/jobs/product-manager-2",
    sourceName: "TestSource",
    tags: ["product", "management", "b2b"],
  },
  {
    title: "DevOps Engineer",
    company: "CloudTech Solutions",
    description:
      "We are seeking a DevOps Engineer to help us build and maintain our cloud infrastructure. You will work with Kubernetes, Docker, and AWS. Strong understanding of CI/CD pipelines required.",
    salary: "$130,000 - $180,000",
    postedDate: new Date("2024-11-18"),
    sourceUrl: "https://example.com/jobs/devops-engineer-3",
    sourceName: "TestSource",
    tags: ["devops", "kubernetes", "aws"],
  },
  {
    title: "Data Analyst",
    company: "Analytics Pro",
    description:
      "Looking for a Data Analyst to help drive insights from our data. You will work with SQL, Python, and Tableau. Experience with data warehousing and ETL processes is a plus.",
    salary: "$90,000 - $130,000",
    postedDate: new Date("2024-11-17"),
    sourceUrl: "https://example.com/jobs/data-analyst-4",
    sourceName: "TestSource",
    tags: ["data", "analytics", "sql"],
  },
  {
    title: "UX Designer",
    company: "Design Studio",
    description:
      "We are hiring a UX Designer to create amazing user experiences. You will work with Figma, conduct user research, and collaborate with product and engineering teams.",
    salary: "$100,000 - $140,000",
    postedDate: new Date("2024-11-16"),
    sourceUrl: "https://example.com/jobs/ux-designer-5",
    sourceName: "TestSource",
    tags: ["design", "ux", "figma"],
  },
  {
    title: "Full-Stack Developer",
    company: "WebDev Co",
    description:
      "Join our team as a Full-Stack Developer. Build web applications using React and Node.js. We value clean code and continuous learning. 3+ years of experience preferred.",
    salary: "$110,000 - $150,000",
    postedDate: new Date("2024-11-15"),
    sourceUrl: "https://example.com/jobs/fullstack-dev-6",
    sourceName: "TestSource",
    tags: ["fullstack", "react", "nodejs"],
  },
  {
    title: "QA Automation Engineer",
    company: "Quality First",
    description:
      "We need a QA Automation Engineer to help us maintain high quality standards. Write automated tests using Selenium and Python. Experience with CI/CD and testing frameworks required.",
    salary: "$95,000 - $135,000",
    postedDate: new Date("2024-11-14"),
    sourceUrl: "https://example.com/jobs/qa-automation-7",
    sourceName: "TestSource",
    tags: ["qa", "automation", "testing"],
  },
  {
    title: "Security Engineer",
    company: "CyberSafe Inc",
    description:
      "Protect our systems as a Security Engineer. You will identify vulnerabilities, implement security best practices, and respond to incidents. CISSP or similar certification preferred.",
    salary: "$140,000 - $190,000",
    postedDate: new Date("2024-11-13"),
    sourceUrl: "https://example.com/jobs/security-engineer-8",
    sourceName: "TestSource",
    tags: ["security", "infosec", "compliance"],
  },
  {
    title: "Mobile Developer",
    company: "AppMakers Ltd",
    description:
      "We are looking for a Mobile Developer to build iOS and Android apps. Experience with React Native or Flutter is a plus. Join a team of passionate developers.",
    salary: "$105,000 - $145,000",
    postedDate: new Date("2024-11-12"),
    sourceUrl: "https://example.com/jobs/mobile-dev-9",
    sourceName: "TestSource",
    tags: ["mobile", "ios", "android"],
  },
  {
    title: "Machine Learning Engineer",
    company: "AI Innovations",
    description:
      "Help us build the future of AI. We are seeking an ML Engineer with experience in deep learning, computer vision, or NLP. Strong Python skills and experience with TensorFlow required.",
    salary: "$160,000 - $220,000",
    postedDate: new Date("2024-11-11"),
    sourceUrl: "https://example.com/jobs/ml-engineer-10",
    sourceName: "TestSource",
    tags: ["ml", "ai", "python"],
  },
];

// Helper function to convert test data to raw job format
export function getTestJobsAsRaw() {
  return testJobs.map((job) => ({
    title: job.title,
    company: job.company,
    description: job.description,
    salary: job.salary,
    postedDate: job.postedDate,
    sourceUrl: job.sourceUrl,
    sourceName: job.sourceName,
    tags: job.tags,
  }));
}
