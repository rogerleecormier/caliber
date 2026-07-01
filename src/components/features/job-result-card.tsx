import { Link } from "@tanstack/react-router";
import type { ChangeEvent } from "react";
import { useState, useMemo } from "react";
import {
  Badge,
  Body,
  Caption,
  PrimaryCard,
  Card,
} from "@caliber/ui-kit";
import {
  ExternalLink,
  FileText,
  Layers,
  Loader2,
  Mail,
  Sparkles,
  Star,
} from "lucide-react";
import { getScoreBorderColor } from "@/lib/scoreUtils";
import { getDocumentDownload } from "@/server/functions/get-history";
import { cleanJobDescription } from "@/lib/html-utils";
import { WorkTypeBadge } from "@/components/ui/work-type-badge";
import { DocumentViewerModal } from "@/components/features/document-viewer-modal";

export type JobStatus = "Discovered" | "Analyzed" | "Prepped" | "Applied" | "Interviewed" | "Hired" | "Not Hired" | "Archived";

export type JobResultCardJob = {
  id?: number;
  title: string;
  company: string;
  location?: string | null;
  sourceUrl: string;
  salary?: string | null;
  snippet?: string | null;
  description?: string | null;
  descriptionPruned?: string | null;
  postDateText?: string | null;
  firstSeenAt?: string | null;
  createdAt?: string | null;
  resultSource?: string;
  ownerEmail?: string | null;
  status?: JobStatus | null;
  sourceName?: string | null;
  sourceOrigin?: string | null;
  score?: {
    atsScore: number;
    careerScore: number;
    outlookScore: number;
    masterScore: number;
    atsReason?: string;
    isUnicorn?: boolean;
    unicornReason?: string | null;
  };
  masterScore?: number | null;
  atsScore?: number | null;
  careerScore?: number | null;
  outlookScore?: number | null;
  atsReason?: string | null;
  isUnicorn?: number | boolean | null;
  unicornReason?: string | null;
  matchScore?: number | null;
  isFlagged?: boolean | number | null;
  documents?: Array<{ id: number; docType: string; r2Key: string; fileName: string; createdAt: string | null }>;
  quickAnalysis?: string | null;
};


interface JobResultCardProps {
  job: JobResultCardJob;
  isNew?: boolean;
  selected?: boolean;
  showSelection?: boolean;
  onSelect?: () => void;
  statusOptions?: JobStatus[];
  onStatusChange?: (status: JobStatus) => void | Promise<void>;
  statusPending?: boolean;
  isAnalyzed?: boolean;
  onAnalyzeClick?: () => void;
  isFavorited?: boolean;
  onToggleFavorite?: () => void | Promise<void>;
  isRecommendation?: boolean;
  onApplyClick?: () => void;
  isHorizontal?: boolean;
}

function getScore(job: JobResultCardJob) {
  if (job.score) return job.score;
  const hasAnyScore =
    job.masterScore != null ||
    job.atsScore != null ||
    job.careerScore != null ||
    job.outlookScore != null;

  if (!hasAnyScore) {
    return null;
  }

  return {
    atsScore: job.atsScore,
    careerScore: job.careerScore,
    outlookScore: job.outlookScore,
    masterScore: job.masterScore,
    atsReason: job.atsReason ?? undefined,
    isUnicorn: job.isUnicorn === true || job.isUnicorn === 1,
    unicornReason: job.unicornReason ?? null,
  };
}

function formatScore(value: number | null | undefined): string {
  if (value == null) return "N/A";
  return `${value}%`;
}

const SOURCE_BADGE_CLASS: Record<string, string> = {
  greenhouse: 'bg-emerald-600',
  lever:      'bg-indigo-600',
  workable:   'bg-violet-600',
  ashby:      'bg-purple-600',
  adzuna:     'bg-orange-500',
  jooble:     'bg-yellow-500',
  remotive:   'bg-teal-600',
  remoteok:   'bg-pink-600',
  himalayas:  'bg-cyan-600',
  jobicy:     'bg-lime-600',
  manual:     'bg-slate-500',
  // legacy fallbacks
  'text-input':   'bg-slate-500',
  quick_search:   'bg-slate-500',
  search_agent:   'bg-slate-500',
};

function sourceBadgeClass(source: string): string {
  return SOURCE_BADGE_CLASS[source.toLowerCase()] ?? 'bg-slate-500';
}

const SOURCE_DISPLAY_LABELS: Record<string, string> = {
  manual: 'Manual', 'text-input': 'Manual', quick_search: 'Manual',
  search_agent: 'Unknown', unknown: 'Unknown',
  remoteok: 'RemoteOK', himalayas: 'Himalayas', jobicy: 'Jobicy',
};

function sourceLabel(sourceName?: string | null, sourceOrigin?: string | null): string {
  const raw = (sourceName || sourceOrigin || '').toLowerCase();
  return SOURCE_DISPLAY_LABELS[raw] ?? (raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '');
}

function FavoriteStarButton({
  isFavorited,
  onToggleFavorite,
  jobTitle,
}: {
  isFavorited: boolean;
  onToggleFavorite: () => void | Promise<void>;
  jobTitle: string;
}) {
  const [isAnimating, setIsAnimating] = useState(false);

  function handleClick() {
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 400);
    void onToggleFavorite();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isFavorited ? `Unfavorite ${jobTitle}` : `Favorite ${jobTitle}`}
      aria-pressed={isFavorited}
      title={isFavorited ? "Unfavorite" : "Favorite"}
      className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm ring-1 ring-slate-200 transition hover:bg-white hover:ring-amber-300"
    >
      <Star
        className={`h-4 w-4 transition-transform duration-300 ${
          isFavorited ? "fill-amber-400 text-amber-400" : "fill-none text-slate-400"
        } ${isAnimating ? "scale-150" : "scale-100"}`}
      />
    </button>
  );
}

export function JobResultCard({
  job,
  isNew = false,
  selected = false,
  showSelection = false,
  onSelect,
  statusOptions,
  onStatusChange,
  statusPending = false,
  isAnalyzed = false,
  onAnalyzeClick,
  isFavorited = false,
  onToggleFavorite,
  isRecommendation = false,
  onApplyClick,
  isHorizontal = false,
}: JobResultCardProps) {
  const score = getScore(job);
  const hasUrl = !!(job.sourceUrl && job.sourceUrl !== "text-input" && job.sourceUrl !== "manual");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [documentsModalOpen, setDocumentsModalOpen] = useState(false);
  const cleanedSnippet = useMemo(() => {
    const text = job.snippet || job.descriptionPruned || job.description;
    if (!text) return '';
    const clean = cleanJobDescription(text);
    return clean.length > 300 ? clean.substring(0, 300) + '...' : clean;
  }, [job.snippet, job.descriptionPruned, job.description]);

  // Show only the single most recent resume and the single most recent cover
  // letter on the card face (regardless of PDF/DOCX format); the full list is
  // available via the "view more" button, which opens DocumentViewerModal.
  const mostRecentDocuments = (() => {
    if (!job.documents || job.documents.length === 0) return [];
    const latestResume = job.documents
      .filter((d) => d.docType.startsWith("resume"))
      .reduce<typeof job.documents[0] | null>((latest, d) => (!latest || d.id > latest.id ? d : latest), null);
    const latestCover = job.documents
      .filter((d) => d.docType.startsWith("cover_letter"))
      .reduce<typeof job.documents[0] | null>((latest, d) => (!latest || d.id > latest.id ? d : latest), null);
    return [latestResume, latestCover].filter((d): d is typeof job.documents[0] => d != null);
  })();

  async function triggerDownload(r2Key: string, fileName: string) {
    const result = await getDocumentDownload({ data: { r2Key } });
    const blob = new Blob([new Uint8Array(result.data)], { type: result.contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDownload(r2Key: string, fileName: string) {
    setDownloadingKey(r2Key);
    try {
      await triggerDownload(r2Key, fileName);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to download document";
      console.error("Failed to download document:", e);
      alert(`Download failed: ${message}`);
    } finally {
      setDownloadingKey(null);
    }
  }


  if (isHorizontal) {
    return (
      <>
      <Card
        className={`shadow-sm transition hover:shadow-md border-l-4 ${getScoreBorderColor(score?.masterScore ?? 0)} ${
          selected
            ? "ring-2 ring-primary-300 bg-white/85"
            : isNew
              ? "ring-2 ring-indigo-300 bg-indigo-50/30"
              : "bg-white/85"
        } relative p-5 flex flex-col md:flex-row gap-6 justify-between items-stretch`}
      >
        {/* Selection checkbox or flag icon */}
        {showSelection ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            className={`absolute top-3 h-4 w-4 shrink-0 rounded border-slate-300 text-primary-600 z-10 ${onToggleFavorite ? "right-14" : "right-3"}`}
            aria-label={`Select ${job.title} at ${job.company}`}
          />
        ) : null}

        {onToggleFavorite && (
          <FavoriteStarButton
            isFavorited={isFavorited}
            onToggleFavorite={onToggleFavorite}
            jobTitle={job.title}
          />
        )}

        {/* Left Column: Job Info */}
        <div className="flex-1 space-y-4">
          <div className="space-y-2">
            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2">
              {(job.sourceName || job.sourceOrigin) && (
                <Badge className={`border-0 px-2 py-0 text-[10px] text-white ${sourceBadgeClass(job.sourceName || job.sourceOrigin || '')}`}>
                  {sourceLabel(job.sourceName, job.sourceOrigin)}
                </Badge>
              )}
              {job.resultSource === "history" ? (
                <Badge variant="success" className="px-2 py-0 text-[10px]">
                  Tracked
                </Badge>
              ) : null}
              {isNew ? (
                <Badge className="border-0 bg-indigo-600 px-2 py-0 text-[10px] text-white">
                  New Match
                </Badge>
              ) : null}
              {score?.isUnicorn ? (
                <Badge variant="warning" className="px-2 py-0 text-[10px]" title={score.unicornReason || "Unicorn opportunity"}>
                  Unicorn
                </Badge>
              ) : null}
            </div>

            {/* Title & Company */}
            <div>
              <h3 className="text-lg font-bold text-primary-500 leading-tight">
                {job.title}
              </h3>
              <p className="text-sm font-medium text-slate-600 mt-1">
                {job.company}{job.location ? ' · ' + job.location : ''}
              </p>
            </div>
          </div>

          {/* Dates & Meta info */}
          {((job.postDateText && job.postDateText !== "Invalid Date") || job.firstSeenAt || job.ownerEmail) && (
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
              {job.postDateText && job.postDateText !== "Invalid Date" ? (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-medium text-slate-400">Posted:</span>
                  <Caption className="text-xs text-slate-600">
                    {(() => {
                      const d = new Date(job.postDateText);
                      return !isNaN(d.getTime()) ? d.toLocaleDateString() : job.postDateText;
                    })()}
                  </Caption>
                </div>
              ) : null}
              {job.firstSeenAt ? (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-medium text-slate-400">Found:</span>
                  <Caption className="text-xs text-slate-600">
                    {new Date(job.firstSeenAt).toLocaleDateString()}
                  </Caption>
                </div>
              ) : null}
              {job.ownerEmail ? (
                <Caption className="text-[11px] text-slate-500">
                  {job.ownerEmail}
                </Caption>
              ) : null}
            </div>
          )}

          {job.salary ? (
            <Body size="sm" weight="medium" className="text-emerald-700">
              {job.salary}
            </Body>
          ) : null}

          {cleanedSnippet ? (
            <Body size="sm" className="leading-relaxed text-slate-600 max-w-3xl">
              {cleanedSnippet}
            </Body>
          ) : null}

          {mostRecentDocuments.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              <Caption variant="semibold" className="w-full text-[10px] uppercase tracking-wide text-slate-500">
                Documents
              </Caption>
              {mostRecentDocuments.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => handleDownload(doc.r2Key, doc.fileName)}
                  disabled={downloadingKey === doc.r2Key}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {downloadingKey === doc.r2Key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                  ) : doc.docType.startsWith("resume") ? (
                    <FileText className="h-3.5 w-3.5 text-amber-600" />
                  ) : (
                    <Mail className="h-3.5 w-3.5 text-amber-600" />
                  )}
                  {doc.docType === "resume_docx" ? "Resume (DOCX)" : doc.docType.startsWith("resume") ? "Resume (PDF)" : doc.docType === "cover_letter_docx" ? "Cover Letter (DOCX)" : "Cover Letter (PDF)"}
                </button>
              ))}
              {(job.documents?.length ?? 0) > mostRecentDocuments.length && (
                <button
                  type="button"
                  onClick={() => setDocumentsModalOpen(true)}
                  title="View all documents"
                  aria-label="View all documents"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                >
                  <Layers className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Column: AI Analysis, Score & Actions */}
        <div className="w-full md:w-80 md:border-l md:border-slate-100 md:pl-6 flex flex-col justify-between gap-4 shrink-0">
          <div className="space-y-3">
            {/* Match Score */}
            {(score?.masterScore != null || job.matchScore != null || job.masterScore != null) && (
              <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-1.5 shadow-sm">
                <Caption variant="semibold" className="text-[10px] uppercase tracking-wide text-emerald-600">
                  Match Score
                </Caption>
                <span className="text-sm font-extrabold text-emerald-700">
                  {formatScore(score?.masterScore ?? job.matchScore ?? job.masterScore)}
                </span>
              </div>
            )}

            {/* Quick Analysis */}
            {job.quickAnalysis && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/45 p-3 shadow-inner">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1">
                  AI Quick Analysis
                </span>
                <p className="text-xs text-slate-700 leading-relaxed font-medium">
                  {job.quickAnalysis}
                </p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-3 md:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              {isAnalyzed ? (
                <button
                  type="button"
                  onClick={onAnalyzeClick}
                  className="flex-1 inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  View Analysis
                </button>
              ) : onAnalyzeClick ? (
                <button
                  type="button"
                  onClick={onAnalyzeClick}
                  className="flex-1 inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 transition hover:bg-indigo-50 hover:text-amber-800"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Analyze
                </button>
              ) : (
                <Link
                  to="/jobs"
                  search={(prev: any) => ({ ...prev, url: hasUrl ? job.sourceUrl : undefined })}
                  className="flex-1 inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 transition hover:bg-indigo-50 hover:text-amber-800"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Analyze
                </Link>
              )}
            </div>

            {hasUrl ? (
              <a
                href={job.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onApplyClick}
                className="w-full inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white transition hover:bg-amber-700"
              >
                Open <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="w-full inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-100 border border-slate-200 px-3 text-xs font-semibold text-slate-400 cursor-not-allowed"
              >
                Open <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}

            {statusOptions && onStatusChange ? (
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-xs font-medium text-slate-600">Status</span>
                <select
                  value={(job.status ?? "Analyzed") as JobStatus}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    onStatusChange(event.target.value as JobStatus)
                  }
                  disabled={statusPending}
                  className="h-8 w-full max-w-[200px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                  aria-label={`Status for ${job.title}`}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </div>
      </Card>
      <DocumentViewerModal
        open={documentsModalOpen}
        onClose={() => setDocumentsModalOpen(false)}
        documents={job.documents ?? []}
        jobTitle={`${job.title} · ${job.company}`}
      />
    </>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      {showSelection ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          className={`absolute top-3 h-4 w-4 shrink-0 rounded border-slate-300 text-primary-600 z-10 ${onToggleFavorite ? "right-14" : "right-3"}`}
          aria-label={`Select ${job.title} at ${job.company}`}
        />
      ) : null}
      {onToggleFavorite && (
        <FavoriteStarButton
          isFavorited={isFavorited}
          onToggleFavorite={onToggleFavorite}
          jobTitle={job.title}
        />
      )}
      <PrimaryCard
        title={job.title}
        description={`${job.company}${job.location ? ' · ' + job.location : ''}`}
        className={`shadow-sm transition hover:shadow-md flex flex-col h-full rounded-lg ${
          selected
            ? "ring-2 ring-primary-300 bg-white/85"
            : isNew
              ? "ring-2 ring-indigo-300 bg-indigo-50/30"
              : "bg-white/85"
        } ${getScoreBorderColor(score?.masterScore ?? 0)}`}
      >
        <div className="space-y-2">
          <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(job.sourceName || job.sourceOrigin) && (
              <Badge className={`border-0 px-2 py-0 text-[10px] text-white ${
                (job.sourceName || job.sourceOrigin)!.toLowerCase() === 'linkedin' ? 'bg-sky-600' :
                (job.sourceName || job.sourceOrigin)!.toLowerCase() === 'greenhouse' ? 'bg-teal-700' :
                (job.sourceName || job.sourceOrigin)!.toLowerCase() === 'lever' ? 'bg-indigo-600' :
                (job.sourceName || job.sourceOrigin)!.toLowerCase() === 'workable' ? 'bg-violet-600' : 'bg-slate-600'
              }`}>
                {job.sourceName || (job.sourceOrigin ? job.sourceOrigin.charAt(0).toUpperCase() + job.sourceOrigin.slice(1) : '')}
              </Badge>
            )}
            {/* Remote/Hybrid badge only — no text label */}
            {job.location && (
              <WorkTypeBadge workType={
                job.location.toLowerCase().includes("remote") ? "remote" :
                job.location.toLowerCase().includes("hybrid") ? "hybrid" : undefined
              } />
            )}
            {job.resultSource === "history" ? (
              <Badge variant="success" className="px-2 py-0 text-[10px]">
                Tracked
              </Badge>
            ) : null}
            {isNew ? (
              <Badge className="border-0 bg-indigo-600 px-2 py-0 text-[10px] text-white">
                New Match
              </Badge>
            ) : null}
            {score?.isUnicorn ? (
              <Badge variant="warning" className="px-2 py-0 text-[10px]" title={score.unicornReason || "Unicorn opportunity"}>
                Unicorn
              </Badge>
            ) : null}
          </div>
          {(job.postDateText && job.postDateText !== "Invalid Date") || job.firstSeenAt || job.ownerEmail ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {job.postDateText && job.postDateText !== "Invalid Date" ? (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-medium text-slate-400">Posted:</span>
                  <span>
                    {(() => {
                      const d = new Date(job.postDateText!);
                      return !isNaN(d.getTime()) ? d.toLocaleDateString() : job.postDateText;
                    })()}
                  </span>
                </div>
              ) : null}
              {job.firstSeenAt ? (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-medium text-slate-400">Found:</span>
                  <span>{new Date(job.firstSeenAt).toLocaleDateString()}</span>
                </div>
              ) : null}
              {job.ownerEmail ? (
                <span className="text-[11px]">{job.ownerEmail}</span>
              ) : null}
            </div>
          ) : null}

          {/* Master score only on card face — ATS/Career/Outlook in detail modal */}
          {(score?.masterScore != null || job.matchScore != null || job.masterScore != null) && (
            <div className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${getScoreBorderColor(score?.masterScore ?? job.masterScore ?? 0)}`}>
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Match</span>
              {formatScore(score?.masterScore ?? job.matchScore ?? job.masterScore)}
            </div>
          )}

          {isRecommendation && job.quickAnalysis && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-2.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1">
                AI Quick Analysis
              </span>
              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                {job.quickAnalysis}
              </p>
            </div>
          )}

          {job.salary ? (
            <span className="text-xs font-semibold text-teal-700">{job.salary}</span>
          ) : null}
          {cleanedSnippet ? (
            <p className="text-xs leading-relaxed text-slate-500 line-clamp-3">
              {cleanedSnippet}
            </p>
          ) : null}
          {mostRecentDocuments.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
              {mostRecentDocuments.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => handleDownload(doc.r2Key, doc.fileName)}
                  disabled={downloadingKey === doc.r2Key}
                  className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  {downloadingKey === doc.r2Key ? (
                    <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                  ) : doc.docType.startsWith("resume") ? (
                    <FileText className="h-3 w-3 text-orange-500" />
                  ) : (
                    <Mail className="h-3 w-3 text-orange-500" />
                  )}
                  {doc.docType === "resume_docx" ? "Resume (DOCX)" : doc.docType.startsWith("resume") ? "Resume (PDF)" : doc.docType === "cover_letter_docx" ? "Cover Letter (DOCX)" : "Cover Letter (PDF)"}
                </button>
              ))}
              {(job.documents?.length ?? 0) > mostRecentDocuments.length && (
                <button
                  type="button"
                  onClick={() => setDocumentsModalOpen(true)}
                  title="View all documents"
                  aria-label="View all documents"
                  className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                >
                  <Layers className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 pt-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
              {isAnalyzed ? (
                <button
                  type="button"
                  onClick={onAnalyzeClick}
                  className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  View Analysis
                </button>
              ) : onAnalyzeClick ? (
                <button
                  type="button"
                  onClick={onAnalyzeClick}
                  className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Analyze
                </button>
              ) : (
                <Link
                  to="/jobs"
                  search={(prev: any) => ({ ...prev, url: hasUrl ? job.sourceUrl : undefined })}
                  className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Analyze
                </Link>
              )}
              {hasUrl ? (
                <a
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onApplyClick}
                  className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg bg-orange-600 px-2.5 text-xs font-semibold text-white transition hover:bg-orange-700"
                >
                  Open <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg bg-slate-100 border border-slate-200 px-2.5 text-xs font-semibold text-slate-400 cursor-not-allowed"
                >
                  Open <ExternalLink className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {statusOptions && onStatusChange ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-600">Status</span>
                <select
                  value={(job.status ?? "Analyzed") as JobStatus}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    onStatusChange(event.target.value as JobStatus)
                  }
                  disabled={statusPending}
                  className="h-8 w-36 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                  aria-label={`Status for ${job.title}`}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </div>

      </div>
    </PrimaryCard>
      <DocumentViewerModal
        open={documentsModalOpen}
        onClose={() => setDocumentsModalOpen(false)}
        documents={job.documents ?? []}
        jobTitle={`${job.title} · ${job.company}`}
      />
    </div>
  );
}
