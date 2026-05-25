import { AnalysisForm } from "./analysis-form";
import { AnalysisResult } from "./analysis-result";
import { X } from "lucide-react";
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
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-slate-100"
            aria-label="Close modal"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
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
            />
          )}
        </div>
      </div>
    </div>
  );
}
