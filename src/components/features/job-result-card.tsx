import { Link } from "@tanstack/react-router";
import type { ChangeEvent } from "react";
import { useState, useMemo } from "react";
import {
  Badge,
  Body,
  Caption,
  PrimaryCard,
} from "@caliber/ui-kit";
import {
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Sparkles,
} from "lucide-react";
import { getScoreBorderColor } from "@/lib/scoreUtils";
import { getDocumentDownload } from "@/server/functions/get-history";
import { FlagToggle } from "@/components/features/flag-toggle";
import { cleanJobDescription } from "@/lib/html-utils";

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
  documents?: Array<{ id: number; docType: string; r2Key: string; fileName: string }>;
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
}: JobResultCardProps) {
  const score = getScore(job);
  const hasUrl = !!(job.sourceUrl && job.sourceUrl !== "text-input");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const cleanedSnippet = useMemo(() => {
    const text = job.snippet || job.descriptionPruned || job.description;
    if (!text) return '';
    const clean = cleanJobDescription(text);
    return clean.length > 300 ? clean.substring(0, 300) + '...' : clean;
  }, [job.snippet, job.descriptionPruned, job.description]);

  const mostRecentDocuments = (() => {
    if (!job.documents || job.documents.length === 0) return [];
    const byType = new Map<string, typeof job.documents[0]>();
    for (const doc of job.documents) {
      const existing = byType.get(doc.docType);
      if (!existing || doc.id > existing.id) {
        byType.set(doc.docType, doc);
      }
    }
    return Array.from(byType.values());
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


  return (
    <div className="relative h-full flex flex-col">
      {showSelection ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          className="absolute right-3 top-3 h-4 w-4 shrink-0 rounded border-slate-300 text-primary-600 z-10"
          aria-label={`Select ${job.title} at ${job.company}`}
        />
      ) : null}
      {job.id != null ? (
        <div className={`absolute top-2 z-10 ${showSelection ? "right-9" : "right-2"}`}>
          <FlagToggle jobId={job.id} initialFlagged={!!job.isFlagged} />
        </div>
      ) : null}
      <PrimaryCard
        title={job.title}
        description={`${job.company}${job.location ? ' · ' + job.location : ''}`}
        className={`shadow-sm transition hover:shadow-md flex flex-col h-full ${
          selected
            ? "ring-2 ring-primary-300 bg-white/85"
            : isNew
              ? "ring-2 ring-indigo-300 bg-indigo-50/30"
              : "bg-white/85"
        } ${getScoreBorderColor(score?.masterScore ?? 0)}`}
      >
        <div className="space-y-4">
          <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(job.sourceName || job.sourceOrigin) && (
              <Badge className={`border-0 px-2 py-0 text-[10px] text-white ${
                (job.sourceName || job.sourceOrigin)!.toLowerCase() === 'linkedin' ? 'bg-sky-600' :
                (job.sourceName || job.sourceOrigin)!.toLowerCase() === 'greenhouse' ? 'bg-emerald-600' :
                (job.sourceName || job.sourceOrigin)!.toLowerCase() === 'lever' ? 'bg-indigo-600' :
                (job.sourceName || job.sourceOrigin)!.toLowerCase() === 'workable' ? 'bg-violet-600' : 'bg-slate-600'
              }`}>
                {job.sourceName || (job.sourceOrigin ? job.sourceOrigin.charAt(0).toUpperCase() + job.sourceOrigin.slice(1) : '')}
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
          {(job.postDateText && job.postDateText !== "Invalid Date") || job.firstSeenAt || job.ownerEmail ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
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
          ) : null}

          {isRecommendation ? (
            <div className="space-y-2.5">
              {(score?.masterScore != null || job.matchScore != null || job.masterScore != null) && (
                <div className="inline-block rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                  <Caption variant="semibold" className="block text-[10px] uppercase tracking-wide text-emerald-600">
                    Match Score
                  </Caption>
                  <Body size="sm" weight="semibold" className="text-emerald-700">
                    {formatScore(score?.masterScore ?? job.matchScore ?? job.masterScore)}
                  </Body>
                </div>
              )}
              {job.quickAnalysis && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1">
                    AI Quick Analysis
                  </span>
                  <p className="text-xs text-slate-700 leading-relaxed font-medium">
                    {job.quickAnalysis}
                  </p>
                </div>
              )}
            </div>
          ) : (
            score || job.matchScore != null ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {job.sourceName?.toLowerCase() === "manual" ? (
                  <>
                    {job.matchScore != null && (
                      <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                        <Caption variant="semibold" className="block text-[10px] uppercase tracking-wide text-emerald-600">
                          Match Score
                        </Caption>
                        <Body size="sm" weight="semibold" className="text-emerald-700">
                          {formatScore(job.matchScore)}
                        </Body>
                      </div>
                    )}
                    {["ATS", "Career", "Outlook"].map((label) => (
                      <div
                        key={label}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <Caption variant="semibold" className="block text-[10px] uppercase tracking-wide text-slate-500">
                          {label}
                        </Caption>
                        <Body size="sm" weight="semibold" className="text-slate-800">
                          N/A
                        </Body>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {job.matchScore != null && (
                      <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                        <Caption variant="semibold" className="block text-[10px] uppercase tracking-wide text-emerald-600">
                          Match Score
                        </Caption>
                        <Body size="sm" weight="semibold" className="text-emerald-700">
                          {formatScore(job.matchScore)}
                        </Body>
                      </div>
                    )}
                    {score && [
                      ["ATS", score.atsScore],
                      ["Career", score.careerScore],
                      ["Outlook", score.outlookScore],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <Caption variant="semibold" className="block text-[10px] uppercase tracking-wide text-slate-500">
                          {label}
                        </Caption>
                        <Body
                          size="sm"
                          weight="semibold"
                          className="text-slate-800"
                        >
                          {formatScore(value as number | null)}
                        </Body>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : null
          )}

          {job.salary ? (
            <Body size="sm" weight="medium" className="text-emerald-700">
              {job.salary}
            </Body>
          ) : null}
          {cleanedSnippet ? (
            <Body size="sm" className="leading-relaxed text-slate-600">
              {cleanedSnippet}
            </Body>
          ) : null}
          {mostRecentDocuments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
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
                  ) : doc.docType === "resume" ? (
                    <FileText className="h-3.5 w-3.5 text-amber-600" />
                  ) : (
                    <Mail className="h-3.5 w-3.5 text-amber-600" />
                  )}
                  {doc.docType === "resume" ? "Resume" : "Cover Letter"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={onToggleFavorite}
                  className={`inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 text-xs font-semibold transition ${
                    isFavorited
                      ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="mr-1">{isFavorited ? "★" : "☆"}</span>
                  {isFavorited ? "Favorited" : "Favorite"}
                </button>
              )}
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
                  className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg bg-amber-600 px-2.5 text-xs font-semibold text-white transition hover:bg-amber-700"
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
    </div>
  );
}
