import { AnalysisForm } from "./analysis-form";
import { AnalysisResult } from "./analysis-result";
import { ExternalLink, X } from "lucide-react";
import type { AnalysisData } from "./analysis-form";

interface AnalysisModalProps {
  isOpen: boolean;
  jobTitle?: string;
  jobUrl?: string;
  onClose: () => void;
  isFromExistingJob?: boolean;
  storedAnalysis?: AnalysisData | null;
  pipelineJobId?: number;
  onAnalysisComplete?: (analysis: AnalysisData) => void;
  onDocumentGenerated?: () => void;
}

export function AnalysisModal({
  isOpen,
  jobTitle,
  jobUrl,
  onClose,
  isFromExistingJob = false,
  storedAnalysis = null,
  pipelineJobId,
  onAnalysisComplete,
  onDocumentGenerated,
}: AnalysisModalProps) {
  if (!isOpen) return null;

  const isViewingStored = !!storedAnalysis;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">{isViewingStored ? "View Analysis" : "Analyze Job"}</h2>
            {jobTitle && <p className="mt-0.5 text-sm text-slate-600 truncate">{jobTitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {jobUrl && (
              <a
                href={jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Apply
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1 hover:bg-slate-100"
              aria-label="Close modal"
            >
              <X className="h-5 w-5 text-slate-500" />
            </button>
          </div>
        </div>
        <div className="p-6">
          {isViewingStored && storedAnalysis ? (
            <AnalysisResult analysis={storedAnalysis} />
          ) : (
            <AnalysisForm
              initialUrl={jobUrl}
              hideInputModeToggle={isFromExistingJob}
              pipelineJobId={pipelineJobId}
              onAnalysisComplete={onAnalysisComplete}
              onDocumentGenerated={onDocumentGenerated}
            />
          )}
        </div>
      </div>
    </div>
  );
}
