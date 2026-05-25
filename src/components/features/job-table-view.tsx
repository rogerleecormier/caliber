import { Link } from "@tanstack/react-router";
import { ExternalLink, Sparkles, MessageSquareText, Archive, Trash2 } from "lucide-react";
import type { LinkedinResultCardJob, LinkedinJobStatus } from "./linkedin-result-card";
import { getScoreBorderColor } from "@/lib/scoreUtils";
import type { ChangeEvent } from "react";

interface JobTableViewProps {
  jobs: LinkedinResultCardJob[];
  selectedIds: Set<number>;
  onSelect: (id: number) => void;
  onSelectAll: (checked: boolean) => void;
  onStatusChange: (id: number, status: LinkedinJobStatus) => void;
  statusOptions: LinkedinJobStatus[];
  statusPending: number | null;
  onAnalyze: (jobUrl: string) => void;
  analyzedJobIds: Set<number>;
}

function formatScore(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
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

export function JobTableView({
  jobs,
  selectedIds,
  onSelect,
  onSelectAll,
  onStatusChange,
  statusOptions,
  statusPending,
  onAnalyze,
  analyzedJobIds,
}: JobTableViewProps) {
  const allSelected = jobs.length > 0 && jobs.every((job) => job.id && selectedIds.has(job.id));

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="w-10 px-4 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600"
                aria-label="Select all jobs"
              />
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Position
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Company
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
              Score
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
              ATS
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
              Career
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
              Outlook
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Status
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {jobs.map((job) => {
            const score = getScore(job);
            const isSelected = job.id ? selectedIds.has(job.id) : false;
            const isAnalyzed = job.id ? analyzedJobIds.has(job.id) : false;

            return (
              <tr
                key={job.id ?? job.sourceUrl}
                className="transition hover:bg-slate-50"
              >
                <td className="px-4 py-3">
                  {job.id && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onSelect(job.id!)}
                      className="h-4 w-4 rounded border-slate-300 text-primary-600"
                      aria-label={`Select ${job.title}`}
                    />
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900">{job.title}</div>
                  <div className="text-xs text-slate-500">{job.postDateText}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-700">{job.company}</div>
                  {job.location && (
                    <div className="text-xs text-slate-500">{job.location}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <div
                    className={`inline-block rounded-lg px-3 py-1.5 text-sm font-semibold ${getScoreBorderColor(score?.masterScore ?? 0)}`}
                  >
                    {formatScore(score?.masterScore)}
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-sm font-medium text-slate-700">
                  {formatScore(score?.atsScore)}
                </td>
                <td className="px-4 py-3 text-center text-sm font-medium text-slate-700">
                  {formatScore(score?.careerScore)}
                </td>
                <td className="px-4 py-3 text-center text-sm font-medium text-slate-700">
                  {formatScore(score?.outlookScore)}
                </td>
                <td className="px-4 py-3">
                  {job.id && (
                    <select
                      value={(job.status ?? "Analyzed") as LinkedinJobStatus}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                        onStatusChange(job.id!, e.target.value as LinkedinJobStatus)
                      }
                      disabled={statusPending === job.id}
                      className="h-8 rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
                      aria-label={`Status for ${job.title}`}
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    {isAnalyzed ? (
                      <button
                        type="button"
                        onClick={() => onAnalyze(job.sourceUrl)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                        title="View saved analysis"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAnalyze(job.sourceUrl)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                        title="Analyze this job"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-amber-600 px-2.5 text-xs font-semibold text-white transition hover:bg-amber-700"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {jobs.length === 0 && (
        <div className="flex items-center justify-center py-12 text-center">
          <p className="text-sm text-slate-500">No jobs to display</p>
        </div>
      )}
    </div>
  );
}
