import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
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

export const greenhouseOrgs = sqliteTable('greenhouse_orgs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orgName: text('org_name').notNull().unique(),
  lastScrapedAt: integer('last_scraped_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
export type SyncHistory = typeof syncHistory.$inferSelect
export type NewSyncHistory = typeof syncHistory.$inferInsert
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
  showGlobalJobs: integer('show_global_jobs', { mode: 'boolean' }).notNull().default(false),
  preferredSalaryMin: integer('preferred_salary_min'),
  preferredSalaryMax: integer('preferred_salary_max'),
  preferredLocation: text('preferred_location'),
  preferredRemote: text('preferred_remote'),
  preferredKeywords: text('preferred_keywords'),
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
// Legacy users table removed. We now use better-auth 'user' table.

// ─── Master Resume ────────────────────────────────────────────────────────────
// One structured resume per user. JSON fields store typed arrays (see comments).
export const masterResume = sqliteTable('master_resume', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').unique().references(() => user.id),
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
  personalProjects: text('personal_projects'), // JSON: { name, description, technologies?, url? }[]
  rawText: text('raw_text'),          // Original uploaded document text
  updatedAt: text('updated_at'),
})

// ─── Resume Sections ──────────────────────────────────────────────────────────
// Section-based resume structure: one row per section per user.
// sectionType: 'professional_summary' | 'core_competencies' | 'technical_skills'
//            | 'professional_experience' | 'personal_projects' | 'education' | 'awards'
// content: JSON-serialized section data (typed per section type)
export const resumeSections = sqliteTable('resume_sections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  sectionType: text('section_type').notNull(),
  content: text('content').notNull(), // JSON serialized
  updatedAt: text('updated_at').notNull(),
})

// ─── Resume Vector Index ──────────────────────────────────────────────────
// Tracks vectorized resume chunks for semantic RAG matching.
// When a resume section changes, chunks are re-embedded and re-indexed in Vectorize.
export const resumeVectorIndex = sqliteTable('resume_vector_index', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  sectionType: text('section_type').notNull(), // 'professional_summary', 'technical_skills', etc.
  chunkIndex: integer('chunk_index').notNull(), // 0-based index within section
  chunkText: text('chunk_text').notNull(), // Raw text of this semantic block
  vectorId: text('vector_id'), // ID in Vectorize namespace (format: "{userId}#{sectionType}#{chunkIndex}")
  contentHash: text('content_hash').notNull(), // SHA-256 hash of chunkText to detect changes
  embeddedAt: integer('embedded_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

// ─── Job Analyses ─────────────────────────────────────────────────────────────
// One row per job the user has analyzed. Links to generatedDocuments for PDFs.
export const jobAnalyses = sqliteTable('job_analyses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').references(() => user.id),
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
  applicationStatus: text('application_status', { enum: ['Applied', 'Interviewed', 'Not Hired', 'Hired'] }),
  appliedAt: text('applied_at'),
  createdAt: text('created_at'),
})

// ─── Generated Documents ──────────────────────────────────────────────────────
// PDFs stored in R2; r2Key is the object key used to retrieve/serve them.
export const generatedDocuments = sqliteTable('generated_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobAnalysisId: integer('job_analysis_id').references(() => jobAnalyses.id),
  pipelineJobId: integer('pipeline_job_id'), // FK to pipeline_jobs after migration
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
  userId: text('user_id').references(() => user.id),
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

// ─────────────────────────────────────────────────────────────────────────────
// Search Configurations — persisted background search agents (cron-driven)
// ─────────────────────────────────────────────────────────────────────────────

export const searchConfigurations = sqliteTable('search_configurations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => user.id),
  name: text('name').notNull(),
  criteria: text('criteria').notNull(),
  isActive: integer('is_active').notNull().default(1),
  runIntervalHours: integer('run_interval_hours').notNull().default(24), // customizable interval in hours (e.g. 1, 2, 4, 8, 12, 24)
  sources: text('sources').notNull().default('["adzuna", "greenhouse", "lever"]'), // target sources for this search agent
  employmentType: text('employment_type'), // JSON array e.g. '["full-time","contract"]'
  lastRunAt: text('last_run_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Normalized Jobs — unified storage for ALL jobs (global ATS catalog +
// per-user agent-discovered/analyzed pipeline). userId is null for global
// catalog rows (no owner); set for jobs discovered by a user's search agent.
// ─────────────────────────────────────────────────────────────────────────────

export const normalizedJobs = sqliteTable('normalized_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').references(() => user.id),
  savedSearchId: integer('saved_search_id').references(() => searchConfigurations.id),
  canonicalJobId: text('canonical_job_id').references(() => canonicalJobs.id, { onDelete: 'set null' }),
  isFavorited: integer('is_favorited', { mode: 'boolean' }).notNull().default(false),

  // ── Identity / normalization ──
  sourceOrigin: text('source_origin').notNull(), // 'greenhouse' | 'lever' | 'workable' | 'adzuna' | 'jooble' | 'remotive'
  externalReferenceId: text('external_reference_id'),
  jobTitle: text('job_title').notNull(),
  employerName: text('employer_name').notNull(),
  location: text('location'),
  industry: text('industry'),
  sourceUrl: text('source_url').notNull(),
  canonicalSourceUrl: text('canonical_source_url').notNull(),
  rawPayload: text('raw_payload'), // JSON of original source response

  // ── Content ──
  searchUrl: text('search_url'),
  criteria: text('criteria'),
  description: text('description'),
  descriptionPruned: text('description_pruned'), // Cleaned, boilerplate-removed text
  salary: text('salary'),
  snippet: text('snippet'),
  postDateText: text('post_date_text'),
  workplaceType: text('workplace_type'),
  remoteType: text('remote_type').notNull().default('fully_remote'),
  categoryId: integer('category_id').references(() => categories.id),

  // ── Quick AI scores (agent triage) ──
  atsScore: integer('ats_score'),
  careerScore: integer('career_score'),
  outlookScore: integer('outlook_score'),
  masterScore: integer('master_score'),
  atsReason: text('ats_reason'),
  careerReason: text('career_reason'),
  outlookReason: text('outlook_reason'),
  isUnicorn: integer('is_unicorn').notNull().default(0),
  unicornReason: text('unicorn_reason'),
  quickAnalysis: text('quick_analysis'),

  // ── Deep analysis fields (from /analyze pipeline) ──
  jdText: text('jd_text'),
  matchScore: integer('match_score'),
  gapAnalysis: text('gap_analysis'),
  recommendations: text('recommendations'),
  pursue: integer('pursue'),
  pursueJustification: text('pursue_justification'),
  keywords: text('keywords'),
  strategyNote: text('strategy_note'),
  personalInterest: text('personal_interest'),
  careerAnalysis: text('career_analysis'),
  insights: text('insights'),

  // ── Pipeline tracker ──
  currentStage: text('current_stage', {
    enum: ['Not Started', 'Analyzed', 'Prepped', 'Applied', 'Interviewed', 'Hired', 'Not Hired', 'Archived'],
  }).notNull().default('Not Started'),
  finalResolution: text('final_resolution', {
    enum: ['Hired', 'Not Hired', 'Withdrawn'],
  }),
  isFlagged: integer('is_flagged', { mode: 'boolean' }).notNull().default(false),

  // ── Timestamps ──
  discoveryTimestamp: text('discovery_timestamp').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  analyzedAt: text('analyzed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// ─── Inferred Types (user-centric tables) ─────────────────────────────────────
export type User = typeof user.$inferSelect
export type NewUser = typeof user.$inferInsert
export type MasterResume = typeof masterResume.$inferSelect
export type NewMasterResume = typeof masterResume.$inferInsert
export type ResumeSection = typeof resumeSections.$inferSelect
export type NewResumeSection = typeof resumeSections.$inferInsert
export type ResumeVectorIndex = typeof resumeVectorIndex.$inferSelect
export type NewResumeVectorIndex = typeof resumeVectorIndex.$inferInsert
export type JobAnalysis = typeof jobAnalyses.$inferSelect
export type NewJobAnalysis = typeof jobAnalyses.$inferInsert
export type GeneratedDocument = typeof generatedDocuments.$inferSelect
export type NewGeneratedDocument = typeof generatedDocuments.$inferInsert
export type AnalyticsSummary = typeof analyticsSummary.$inferSelect
export type NewAnalyticsSummary = typeof analyticsSummary.$inferInsert
export type AppSettings = typeof appSettings.$inferSelect
export type NewAppSettings = typeof appSettings.$inferInsert
export type SearchConfiguration = typeof searchConfigurations.$inferSelect
export type NewSearchConfiguration = typeof searchConfigurations.$inferInsert
export type NormalizedJob = typeof normalizedJobs.$inferSelect
export type NewNormalizedJob = typeof normalizedJobs.$inferInsert
export type GreenhouseOrg = typeof greenhouseOrgs.$inferSelect
export type NewGreenhouseOrg = typeof greenhouseOrgs.$inferInsert

// ─────────────────────────────────────────────────────────────────────────────
// Crawler Job Agent tables
// ─────────────────────────────────────────────────────────────────────────────

export const canonicalJobs = sqliteTable('canonical_jobs', {
  id: text('id').primaryKey(),
  companyDisplay: text('company_display').notNull(),
  companyNorm: text('company_norm').notNull(),
  titleDisplay: text('title_display').notNull(),
  titleNorm: text('title_norm').notNull(),
  locationDisplay: text('location_display'),
  locationNorm: text('location_norm'),
  remote: integer('remote', { mode: 'boolean' }).default(false),
  employmentType: text('employment_type'),
  experienceLevel: text('experience_level'),
  department: text('department'),
  team: text('team'),
  descriptionPlain: text('description_plain'),
  descriptionHtml: text('description_html'),
  compensationMin: real('compensation_min'),
  compensationMax: real('compensation_max'),
  compensationCurrency: text('compensation_currency'),
  isListed: integer('is_listed', { mode: 'boolean' }).default(true),
  dedupKey: text('dedup_key').unique().notNull(),
  vectorId: text('vector_id'),
  firstSeenAt: text('first_seen_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  idxCanonicalDedupKey: index('idx_canonical_dedup_key').on(table.dedupKey),
  idxCanonicalCompanyTitle: index('idx_canonical_company_title').on(table.companyNorm, table.titleNorm),
  idxCanonicalLocation: index('idx_canonical_location').on(table.locationNorm),
  idxCanonicalExpires: index('idx_canonical_expires').on(table.expiresAt),
}))

export const jobSources = sqliteTable('job_sources', {
  id: text('id').primaryKey(),
  canonicalId: text('canonical_id').notNull().references(() => canonicalJobs.id, { onDelete: 'cascade' }),
  ats: text('ats').notNull(),
  boardToken: text('board_token').notNull(),
  sourceJobId: text('source_job_id').notNull(),
  sourceUrl: text('source_url').notNull(),
  applyUrl: text('apply_url').notNull(),
  rawHash: text('raw_hash').notNull(),
  firstSeenAt: text('first_seen_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  uniqueAtsBoardSourceJob: uniqueIndex('unique_ats_board_source_job').on(table.ats, table.boardToken, table.sourceJobId),
  idxSourcesCanonical: index('idx_sources_canonical').on(table.canonicalId),
  idxSourcesAtsBoard: index('idx_sources_ats_board').on(table.ats, table.boardToken),
  idxSourcesLastSeen: index('idx_sources_last_seen').on(table.lastSeenAt),
}))

export const boards = sqliteTable('boards', {
  id: text('id').primaryKey(),
  ats: text('ats').notNull(),
  token: text('token').notNull(),
  companyName: text('company_name'),
  crawlFrequencyTier: text('crawl_frequency_tier').default('tier2'), // 'tier1' | 'tier2' | 'tier3'
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  lastCrawledAt: text('last_crawled_at'),
  crawlErrorCount: integer('crawl_error_count').default(0),
  crawlErrorLastAt: text('crawl_error_last_at'),
  discoveredAt: text('discovered_at').notNull(),
  createdAt: text('created_at').notNull(),
  lastDiscoveredAt: text('last_discovered_at'),
  discoveryPhase: text('discovery_phase'),
  discoveryConfidence: real('discovery_confidence'),
  validated: integer('validated', { mode: 'boolean' }).default(false),
  validationErrorCount: integer('validation_error_count').default(0),
}, (table) => ({
  uniqueAtsToken: uniqueIndex('unique_ats_token').on(table.ats, table.token),
  idxBoardsActive: index('idx_boards_active').on(table.isActive, table.crawlFrequencyTier),
  idxBoardsValidated: index('idx_boards_validated').on(table.validated, table.isActive),
  idxBoardsConfidence: index('idx_boards_confidence').on(table.discoveryConfidence),
}))

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(), // crawl_start | dedup_merge | vector_insert | error
  ats: text('ats'),
  boardToken: text('board_token'),
  canonicalId: text('canonical_id'),
  sourceId: text('source_id'),
  details: text('details'), // JSON stringified
  actor: text('actor').default('system'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  idxAuditCreated: index('idx_audit_created').on(table.createdAt),
}))

export type CanonicalJob = typeof canonicalJobs.$inferSelect
export type NewCanonicalJob = typeof canonicalJobs.$inferInsert
export type JobSource = typeof jobSources.$inferSelect
export type NewJobSource = typeof jobSources.$inferInsert
export type Board = typeof boards.$inferSelect
export type NewBoard = typeof boards.$inferInsert
export type AuditLog = typeof auditLog.$inferSelect
export type NewAuditLog = typeof auditLog.$inferInsert

