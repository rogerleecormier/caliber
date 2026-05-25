import { Link } from "@tanstack/react-router";
import type { ChangeEvent } from "react";
import { useState } from "react";
import {
  Badge,
  Body,
  Button,
  Caption,
  Label,
  PrimaryCard,
} from "@caliber/ui-kit";
import {
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { getScoreBorderColor } from "@/lib/scoreUtils";
import {
  generateLinkedinOutreach,
} from "@/server/functions/linkedin-searches";
import { getDocumentDownload } from "@/server/functions/get-history";

export type LinkedinJobStatus = "Discovered" | "Analyzed" | "Prepped" | "Applied" | "Interviewed" | "Hired" | "Not Hired" | "Archived";

export type LinkedinResultCardJob = {
  id?: number;
  title: string;
  company: string;
  location?: string | null;
  sourceUrl: string;
  salary?: string | null;
  snippet?: string | null;
  description?: string | null;
  postDateText?: string | null;
  resultSource?: string;
  ownerEmail?: string | null;
  status?: LinkedinJobStatus | null;
  sourceName?: string | null;
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
  documents?: Array<{ id: number; docType: string; r2Key: string; fileName: string }>;
};


interface LinkedinResultCardProps {
  job: LinkedinResultCardJob;
  isNew?: boolean;
  selected?: boolean;
  showSelection?: boolean;
  onSelect?: () => void;
  statusOptions?: LinkedinJobStatus[];
  onStatusChange?: (status: LinkedinJobStatus) => void | Promise<void>;
  statusPending?: boolean;
  isAnalyzed?: boolean;
  onAnalyzeClick?: () => void;
}

function getScore(job: LinkedinResultCardJob) {
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


export function LinkedinResultCard({
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
}: LinkedinResultCardProps) {
  const score = getScore(job);
  const [outreach, setOutreach] = useState("");
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachCopied, setOutreachCopied] = useState(false);
  const [outreachError, setOutreachError] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

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
      console.error("Failed to download document:", e);
    } finally {
      setDownloadingKey(null);
    }
  }

  async function handleGenerateOutreach() {
    setOutreachLoading(true);
    setOutreachError(null);
    setOutreachCopied(false);
    try {
      const result = await generateLinkedinOutreach({ data: job });
      setOutreach(result.message);
    } catch (error) {
      setOutreachError(error instanceof Error ? error.message : "Unable to generate outreach.");
    } finally {
      setOutreachLoading(false);
    }
  }

  async function copyOutreach() {
    if (!outreach) return;
    await navigator.clipboard.writeText(outreach);
    setOutreachCopied(true);
  }

  return (
    <PrimaryCard
      title={job.title}
      description={`${job.company}${job.location ? ' · ' + job.location : ''}`}
      className={`shadow-sm transition hover:shadow-md ${
        selected
          ? "ring-2 ring-primary-300 bg-white/85"
          : isNew
            ? "ring-2 ring-indigo-300 bg-indigo-50/30"
            : "bg-white/85"
      } ${getScoreBorderColor(score?.masterScore ?? 0)}`}
    >
      <div className="space-y-4">
        <div className="space-y-3">
          {showSelection ? (
            <div className="relative -m-2 mb-2">
              <input
                type="checkbox"
                checked={selected}
                onChange={onSelect}
                className="absolute right-2 top-2 h-4 w-4 shrink-0 rounded border-slate-300 text-primary-600"
                aria-label={`Select ${job.title} at ${job.company}`}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {job.sourceName && (
              <Badge className={`border-0 px-2 py-0 text-[10px] text-white ${
                job.sourceName.toLowerCase() === 'linkedin' ? 'bg-sky-600' :
                job.sourceName.toLowerCase() === 'greenhouse' ? 'bg-emerald-600' :
                job.sourceName.toLowerCase() === 'lever' ? 'bg-indigo-600' :
                job.sourceName.toLowerCase() === 'workable' ? 'bg-violet-600' : 'bg-slate-600'
              }`}>
                {job.sourceName}
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
          {job.postDateText || job.ownerEmail ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {job.postDateText ? (
                <Caption className="text-xs text-slate-500">{job.postDateText}</Caption>
              ) : null}
              {job.ownerEmail ? (
                <Caption className="text-[11px] text-slate-500">
                  {job.ownerEmail}
                </Caption>
              ) : null}
            </div>
          ) : null}

          {score || job.matchScore != null ? (
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
          ) : null}

          {job.salary ? (
            <Body size="sm" weight="medium" className="text-emerald-700">
              {job.salary}
            </Body>
          ) : null}
          {job.snippet ? (
            <Body size="sm" className="leading-relaxed text-slate-600">
              {job.snippet}
            </Body>
          ) : null}
          {job.documents && job.documents.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              <Caption variant="semibold" className="w-full text-[10px] uppercase tracking-wide text-slate-500">
                Documents
              </Caption>
              {job.documents.map((doc) => (
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
              {onAnalyzeClick ? (
                <button
                  type="button"
                  onClick={onAnalyzeClick}
                  className={`inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold transition ${
                    isAnalyzed
                      ? "border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                      : "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {isAnalyzed ? "View Analysis" : "Analyze"}
                </button>
              ) : (
                <Link
                  to="/analyze"
                  search={{ url: job.sourceUrl }}
                  className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Analyze
                </Link>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateOutreach}
                disabled={outreachLoading}
                className="h-8 whitespace-nowrap border-slate-200 px-2.5 text-slate-700 hover:text-amber-700 hover:border-amber-200 hover:bg-amber-50"
              >
                {outreachLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MessageSquareText className="h-3.5 w-3.5" />
                )}
                Outreach
              </Button>
              <a
                href={job.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg bg-amber-600 px-2.5 text-xs font-semibold text-white transition hover:bg-amber-700"
              >
                Open <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
          {statusOptions && onStatusChange ? (
            <Label className="flex items-center justify-between gap-2 text-xs text-slate-500">
              Status
              <select
                value={(job.status ?? "Analyzed") as LinkedinJobStatus}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  onStatusChange(event.target.value as LinkedinJobStatus)
                }
                disabled={statusPending}
                className="h-8 w-36 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                aria-label={`Status for ${job.title}`}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </Label>
          ) : null}
        </div>

        {outreachError ? (
          <Body size="sm" className="text-red-600">{outreachError}</Body>
        ) : null}
        {outreach ? (
          <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_auto] sm:items-start">
            <div>
              <Caption variant="semibold" className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">
                Outreach blurb
              </Caption>
              <Body size="sm" className="text-slate-700">
                {outreach}
              </Body>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateOutreach}
                disabled={outreachLoading}
              >
                {outreachLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquareText className="h-3.5 w-3.5" />}
                Refresh
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={copyOutreach}>
                <Copy className="h-3.5 w-3.5" />
                {outreachCopied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </PrimaryCard>
  );
}
