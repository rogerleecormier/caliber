/**
 * Unified Pipeline Status Lifecycle
 *
 * Single source of truth for the Caliber job pipeline.
 * Every UI component and server function imports from here.
 */

// ─── Status Enum ──────────────────────────────────────────────────────────────

export const PIPELINE_STATUSES = [
  'Not Started',
  'Analyzed',
  'Prepped',
  'Applied',
  'Interviewed',
  'Hired',
  'Not Hired',
  'Archived',
] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

/** Statuses that indicate the job has been through AI analysis */
export const ANALYZED_STATUSES: PipelineStatus[] = [
  'Analyzed',
  'Prepped',
  'Applied',
  'Interviewed',
  'Hired',
  'Not Hired',
];

/** Default status for jobs discovered by search agents. Favoriting is tracked
 * independently via the `isFavorited` flag, not by pipeline stage. */
export const DEFAULT_AGENT_STATUS: PipelineStatus = 'Not Started';

/** Default status for jobs that are manually analyzed */
export const DEFAULT_ANALYZED_STATUS: PipelineStatus = 'Analyzed';

// ─── Visual Tokens ────────────────────────────────────────────────────────────

export interface StatusTone {
  /** Tailwind bg class for dots and bars */
  dot: string;
  /** Tailwind classes for pill/badge backgrounds */
  bg: string;
  /** Tailwind classes for pill/badge text */
  text: string;
  /** Tailwind classes for pill/badge border */
  border: string;
  /** Combined pill class string */
  pill: string;
  /** Pipeline bar background class */
  bar: string;
}

export const STATUS_TONES: Record<PipelineStatus, StatusTone> = {
  'Not Started': {
    dot: 'bg-slate-300',
    bg: 'bg-slate-50',
    text: 'text-slate-500',
    border: 'border-slate-100',
    pill: 'border-slate-100 bg-slate-50 text-slate-500',
    bar: 'bg-slate-300',
  },
  Analyzed: {
    dot: 'bg-slate-400',
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    border: 'border-slate-200',
    pill: 'border-slate-200 bg-slate-50 text-slate-600',
    bar: 'bg-slate-500',
  },
  Prepped: {
    dot: 'bg-violet-500',
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    border: 'border-violet-100',
    pill: 'border-violet-100 bg-violet-50 text-violet-700',
    bar: 'bg-violet-500',
  },
  Applied: {
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-100',
    pill: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    bar: 'bg-emerald-500',
  },
  Interviewed: {
    dot: 'bg-sky-500',
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-100',
    pill: 'border-sky-100 bg-sky-50 text-sky-700',
    bar: 'bg-sky-500',
  },
  Hired: {
    dot: 'bg-emerald-600',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    pill: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    bar: 'bg-emerald-600',
  },
  'Not Hired': {
    dot: 'bg-slate-400',
    bg: 'bg-slate-50',
    text: 'text-slate-500',
    border: 'border-slate-200',
    pill: 'border-slate-200 bg-slate-50 text-slate-500',
    bar: 'bg-slate-400',
  },
  Archived: {
    dot: 'bg-slate-300',
    bg: 'bg-slate-50',
    text: 'text-slate-400',
    border: 'border-slate-100',
    pill: 'border-slate-100 bg-slate-50 text-slate-400',
    bar: 'bg-slate-300',
  },
};

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Validate and coerce a string into a PipelineStatus, falling back to Not Started */
export function normalizePipelineStatus(status: string | null | undefined): PipelineStatus {
  if (!status) return DEFAULT_AGENT_STATUS;
  // Direct match
  if (PIPELINE_STATUSES.includes(status as PipelineStatus)) {
    return status as PipelineStatus;
  }
  // Legacy status mapping
  switch (status) {
    case 'Docs Started':
    case 'Ready to Apply':
      return 'Prepped';
    case 'Interviewing':
      return 'Interviewed';
    case 'Rejected':
      return 'Not Hired';
    case 'Review':
    case 'Pursue':
    case 'Saved':
    case 'Discovered':
    case 'Favorited':
      return 'Not Started';
    default:
      return DEFAULT_AGENT_STATUS;
  }
}

/**
 * Map a legacy history row (from old job_analyses table) to a PipelineStatus.
 * Used during data migration and backward-compat reads.
 */
export function mapLegacyAnalysisStatus(row: {
  applied?: boolean | number | null;
  applicationStatus?: string | null;
  documents?: Array<unknown>;
}): PipelineStatus {
  const appStatus = row.applicationStatus;
  if (appStatus === 'Hired') return 'Hired';
  if (appStatus === 'Not Hired') return 'Not Hired';
  if (appStatus === 'Interviewed') return 'Interviewed';
  if (appStatus === 'Applied' || row.applied === 1 || row.applied === true) return 'Applied';
  if (Array.isArray(row.documents) && row.documents.length > 0) return 'Prepped';
  return 'Analyzed';
}

/** Pipeline step metadata for rendering pipeline bars */
export const PIPELINE_STEPS = PIPELINE_STATUSES.map((status, index) => ({
  status,
  index,
  tone: STATUS_TONES[status],
}));

/** Pipeline status keys suitable for object keys (camelCase) */
export type PipelineStatusKey =
  | 'notStarted'
  | 'analyzed'
  | 'prepped'
  | 'applied'
  | 'interviewed'
  | 'hired'
  | 'notHired'
  | 'archived';

export const STATUS_TO_KEY: Record<PipelineStatus, PipelineStatusKey> = {
  'Not Started': 'notStarted',
  Analyzed: 'analyzed',
  Prepped: 'prepped',
  Applied: 'applied',
  Interviewed: 'interviewed',
  Hired: 'hired',
  'Not Hired': 'notHired',
  Archived: 'archived',
};

export const KEY_TO_STATUS: Record<PipelineStatusKey, PipelineStatus> = {
  notStarted: 'Not Started',
  analyzed: 'Analyzed',
  prepped: 'Prepped',
  applied: 'Applied',
  interviewed: 'Interviewed',
  hired: 'Hired',
  notHired: 'Not Hired',
  archived: 'Archived',
};

export type PipelineCounts = Record<PipelineStatusKey, number>;

export const EMPTY_PIPELINE_COUNTS: PipelineCounts = {
  notStarted: 0,
  analyzed: 0,
  prepped: 0,
  applied: 0,
  interviewed: 0,
  hired: 0,
  notHired: 0,
  archived: 0,
};
