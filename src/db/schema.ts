import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  company: text('company'),
  description: text('description'),
  descriptionRaw: text('description_raw'), // Raw/dirty data from source
  fullDescription: text('full_description'),
  isCleansed: integer('is_cleansed').default(0), // 0 = needs cleansing, 1 = cleansed
  payRange: text('pay_range'),
  postDate: integer('post_date', { mode: 'timestamp' }),
  sourceUrl: text('source_url').notNull().unique(),
  sourceName: text('source_name').notNull(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => categories.id),
  remoteType: text('remote_type').notNull().default('fully_remote'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})


export const discoveredCompanies = sqliteTable('discovered_companies', {
  slug: text('slug').primaryKey(),
  name: text('name'),
  jobCount: integer('job_count').default(0),
  remoteJobCount: integer('remote_job_count').default(0),
  departments: text('departments', { mode: 'json' }).$type<string[]>(),
  suggestedCategory: text('suggested_category'),
  sampleJobs: text('sample_jobs', { mode: 'json' }).$type<string[]>(),
  source: text('source').notNull(), // 'greenhouse', 'lever', etc.
  status: text('status').default('new'), // 'new', 'added', 'ignored'
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const syncHistory = sqliteTable('sync_history', {
  id: text('id').primaryKey(),
  syncType: text('sync_type').notNull().default('job_sync'), // 'job_sync' or 'discovery'
  source: text('source'), // 'greenhouse', 'lever', 'remoteok', 'himalayas' for micro-cron tracking
  startedAt: integer('started_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('running'), // 'queued', 'running', 'processing', 'completed', 'failed', 'batch_state'
  sources: text('sources', { mode: 'json' }).$type<string[]>(),
  totalCompanies: integer('total_companies').default(0),
  processedCompanies: integer('processed_companies').default(0),
  lastProcessedIndex: integer('last_processed_index').default(0),
  failedCompanies: text('failed_companies', { mode: 'json' }).$type<string[]>().default(sql`'[]'`),
  stats: text('stats', { mode: 'json' }).$type<{
    jobsAdded: number
    jobsUpdated: number
    jobsDeleted: number
    companiesAdded: number
    companiesUpdated?: number
    companiesDeleted: number
  }>(),
  logs: text('logs', { mode: 'json' }).$type<Array<{
    timestamp: string
    type: 'info' | 'success' | 'error' | 'warning'
    message: string
  }>>(),
})

// Potential companies to discover
export const potentialCompanies = sqliteTable('potential_companies', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  addedAt: integer('added_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  lastCheckedAt: integer('last_checked_at', { mode: 'timestamp' }),
  checkCount: integer('check_count').default(0),
  status: text('status').default('pending'), // 'pending', 'checking', 'not_found', 'discovered'
})

// Discovery state for rotation
export const discoveryState = sqliteTable('discovery_state', {
  id: text('id').primaryKey(),
  lastProcessedIndex: integer('last_processed_index').default(0),
  totalPotential: integer('total_potential').default(0),
  status: text('status').default('active'),
})

// Track job-level progress per company to handle pagination
export const companyJobProgress = sqliteTable('company_job_progress', {
  companySlug: text('company_slug').primaryKey(),
  source: text('source').notNull(), // 'greenhouse', 'lever', etc.
  lastJobOffset: integer('last_job_offset').default(0),
  totalJobsDiscovered: integer('total_jobs_discovered').default(0),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const duplicateJobs = sqliteTable('duplicate_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId1: integer('job_id_1').notNull().references(() => jobs.id),
  jobId2: integer('job_id_2').notNull().references(() => jobs.id),
  similarityScore: integer('similarity_score').notNull(), // 0-100
  resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
export type Job = typeof jobs.$inferSelect
export type NewJob = typeof jobs.$inferInsert
export type SyncHistory = typeof syncHistory.$inferSelect
export type NewSyncHistory = typeof syncHistory.$inferInsert
export type DuplicateJob = typeof duplicateJobs.$inferSelect
export type NewDuplicateJob = typeof duplicateJobs.$inferInsert
export type CompanyJobProgress = typeof companyJobProgress.$inferSelect
export type NewCompanyJobProgress = typeof companyJobProgress.$inferInsert

// ─────────────────────────────────────────────────────────────────────────────
// better-auth core tables
// ─────────────────────────────────────────────────────────────────────────────

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  // admin plugin fields
  role: text('role').default('user'),
  banned: integer('banned', { mode: 'boolean' }),
  banReason: text('ban_reason'),
  banExpires: integer('ban_expires', { mode: 'timestamp' }),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  // admin plugin fields
  impersonatedBy: text('impersonated_by'),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

// ─────────────────────────────────────────────────────────────────────────────
// User-centric tables (migrated from job-analyzer)
// Dates stored as ISO 8601 text strings (new Date().toISOString())
// ─────────────────────────────────────────────────────────────────────────────

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified').notNull().default(0),
  name: text('name'),
  image: text('image'),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('user'), // "admin" | "user"
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

// ─── Master Resume ────────────────────────────────────────────────────────────
// One structured resume per user. JSON fields store typed arrays (see comments).
export const masterResume = sqliteTable('master_resume', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').unique().references(() => users.id),
  fullName: text('full_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  linkedin: text('linkedin'),
  website: text('website'),
  summary: text('summary'),
  competencies: text('competencies'), // JSON: string[]
  tools: text('tools'),               // JSON: string[]
  experience: text('experience'),     // JSON: { title, company, start, end, bullets[] }[]
  education: text('education'),       // JSON: { school, degree, field, year }[]
  certifications: text('certifications'), // JSON: string[]
  rawText: text('raw_text'),          // Original uploaded document text
  updatedAt: text('updated_at'),
})

// ─── Job Analyses ─────────────────────────────────────────────────────────────
// One row per job the user has analyzed. Links to generatedDocuments for PDFs.
export const jobAnalyses = sqliteTable('job_analyses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').references(() => users.id),
  jobUrl: text('job_url').notNull(),
  jobTitle: text('job_title'),
  company: text('company'),
  industry: text('industry'),
  location: text('location'),
  jdText: text('jd_text'),           // Full job description text
  matchScore: integer('match_score'), // 0-100
  gapAnalysis: text('gap_analysis'),  // JSON: { skill, gap, severity }[]
  recommendations: text('recommendations'), // JSON: string[]
  pursue: integer('pursue'),          // 1 = pursue, 0 = do not pursue
  pursueJustification: text('pursue_justification'),
  keywords: text('keywords'),         // JSON: string[]
  strategyNote: text('strategy_note'),
  personalInterest: text('personal_interest'), // 1-3 sentence "why this role"
  careerAnalysis: text('career_analysis'), // JSON: { trajectory, recommendation, reasoning }
  insights: text('insights'),             // JSON: { workLifeBalance, remoteFlexibility, seniorityLevel, cultureSignals, redFlags }
  applied: integer('applied').default(0), // 1 = applied, 0 = not applied
  applicationStatus: text('application_status', { enum: ['Applied', 'Interviewed', 'Hired'] }),
  appliedAt: text('applied_at'),
  createdAt: text('created_at'),
})

// ─── Generated Documents ──────────────────────────────────────────────────────
// PDFs stored in R2; r2Key is the object key used to retrieve/serve them.
export const generatedDocuments = sqliteTable('generated_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobAnalysisId: integer('job_analysis_id').references(() => jobAnalyses.id),
  docType: text('doc_type').notNull(), // "resume" | "cover_letter"
  r2Key: text('r2_key').notNull(),
  fileName: text('file_name'),
  resumeKeywords: text('resume_keywords'), // JSON: string[] — keywords used in this doc
  createdAt: text('created_at'),
})

// ─── Analytics Summary ────────────────────────────────────────────────────────
// Populated exclusively by the cron job — do not write from request handlers.
export const analyticsSummary = sqliteTable('analytics_summary', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').references(() => users.id),
  period: text('period').notNull(), // "all_time" | "YYYY-MM"
  topJdKeywords: text('top_jd_keywords'),      // JSON: { keyword, count }[]
  topResumeKeywords: text('top_resume_keywords'), // JSON: { keyword, count }[]
  topJobTitles: text('top_job_titles'),         // JSON: { title, count }[]
  topIndustries: text('top_industries'),        // JSON: { industry, count }[]
  averageMatchScore: real('average_match_score'),
  totalAnalyses: integer('total_analyses'),
  totalResumesGenerated: integer('total_resumes_generated'),
  totalApplied: integer('total_applied').default(0),
  totalPursued: integer('total_pursued').default(0),
  updatedAt: text('updated_at'),
})

export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  linkedinRetentionDays: integer('linkedin_retention_days').notNull().default(14),
  linkedinAutoPrune: integer('linkedin_auto_prune').notNull().default(1),
  linkedinAllowAllUsersView: integer('linkedin_allow_all_users_view').notNull().default(0),
  linkedinSearchCronFrequency: text('linkedin_search_cron_frequency').notNull().default('daily'),
  linkedinCronStartHour: integer('linkedin_cron_start_hour').notNull().default(9),
  linkedinCronVarianceMinutes: integer('linkedin_cron_variance_minutes').notNull().default(20),
  updatedAt: text('updated_at').notNull(),
})

export const linkedinSavedSearches = sqliteTable('linkedin_saved_searches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  criteria: text('criteria').notNull(),
  isActive: integer('is_active').notNull().default(1),
  runIntervalHours: integer('run_interval_hours').notNull().default(24), // customizable interval in hours (e.g. 1, 2, 4, 8, 12, 24)
  sources: text('sources').notNull().default('["linkedin", "greenhouse", "lever"]'), // target sources for this search agent
  lastRunAt: text('last_run_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const linkedinJobResults = sqliteTable('linkedin_job_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id),
  savedSearchId: integer('saved_search_id').references(() => linkedinSavedSearches.id),
  externalJobId: text('external_job_id').notNull(),
  title: text('title').notNull(),
  company: text('company').notNull(),
  location: text('location').notNull(),
  sourceUrl: text('source_url').notNull(),
  canonicalSourceUrl: text('canonical_source_url').notNull(),
  sourceName: text('source_name').notNull().default('LinkedIn'),
  searchUrl: text('search_url'),
  criteria: text('criteria').notNull(),
  salary: text('salary'),
  snippet: text('snippet'),
  description: text('description'),
  postDateText: text('post_date_text'),
  workplaceType: text('workplace_type'),
  atsScore: integer('ats_score'),
  careerScore: integer('career_score'),
  outlookScore: integer('outlook_score'),
  masterScore: integer('master_score'),
  atsReason: text('ats_reason'),
  careerReason: text('career_reason'),
  outlookReason: text('outlook_reason'),
  isUnicorn: integer('is_unicorn').notNull().default(0),
  unicornReason: text('unicorn_reason'),
  status: text('status', { enum: ['Analyzed', 'Prepped', 'Applied', 'Interviewed', 'Hired', 'Archived'] }).notNull().default('Analyzed'),
  firstSeenAt: text('first_seen_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// ─── Inferred Types (user-centric tables) ─────────────────────────────────────
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type MasterResume = typeof masterResume.$inferSelect
export type NewMasterResume = typeof masterResume.$inferInsert
export type JobAnalysis = typeof jobAnalyses.$inferSelect
export type NewJobAnalysis = typeof jobAnalyses.$inferInsert
export type GeneratedDocument = typeof generatedDocuments.$inferSelect
export type NewGeneratedDocument = typeof generatedDocuments.$inferInsert
export type AnalyticsSummary = typeof analyticsSummary.$inferSelect
export type NewAnalyticsSummary = typeof analyticsSummary.$inferInsert
export type AppSettings = typeof appSettings.$inferSelect
export type NewAppSettings = typeof appSettings.$inferInsert
export type LinkedinSavedSearch = typeof linkedinSavedSearches.$inferSelect
export type NewLinkedinSavedSearch = typeof linkedinSavedSearches.$inferInsert
export type LinkedinJobResult = typeof linkedinJobResults.$inferSelect
export type NewLinkedinJobResult = typeof linkedinJobResults.$inferInsert
