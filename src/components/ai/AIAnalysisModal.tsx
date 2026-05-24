import { useMemo } from "react";
import { Sparkles, X } from "lucide-react";
import type { JobWithCategory } from "../../lib/search-utils";
import { AnalysisForm } from "../features/analysis-form";

interface AIAnalysisModalProps {
  job: JobWithCategory;
  isOpen: boolean;
  onClose: () => void;
  initialDescriptionHtml?: string | null;
}

function htmlToPlainText(html?: string | null): string | undefined {
  if (!html) return undefined;

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  return text.length >= 50 ? text : undefined;
}

export default function AIAnalysisModal({
  job,
  isOpen,
  onClose,
  initialDescriptionHtml,
}: AIAnalysisModalProps) {
  const initialJd = useMemo(
    () => htmlToPlainText(initialDescriptionHtml ?? job.fullDescription ?? job.description),
    [initialDescriptionHtml, job.fullDescription, job.description],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b-2 border-slate-200 p-6">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="rounded-xl bg-amber-100 p-2.5">
              <Sparkles className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold leading-tight text-slate-900">AI Analysis</h2>
              <p className="mt-1 text-sm text-slate-500">
                <span className="font-semibold text-slate-700">{job.title}</span>
                {job.company ? ` at ${job.company}` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex flex-shrink-0 items-center justify-center rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close modal"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
          <div className="mx-auto max-w-4xl">
            <AnalysisForm
              initialUrl={initialJd ? undefined : job.sourceUrl}
              initialJd={initialJd}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
