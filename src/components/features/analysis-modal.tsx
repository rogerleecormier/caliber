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
  isFromExistingJob: _isFromExistingJob = false,
  storedAnalysis = null,
  pipelineJobId,
  onAnalysisComplete,
  onDocumentGenerated,
}: AnalysisModalProps) {
  if (!isOpen) return null;

  const isViewingStored = !!storedAnalysis;
  const hasApplyUrl = !!jobUrl && jobUrl !== "manual" && /^https?:\/\//i.test(jobUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex flex-col max-h-[90vh] lg:h-[85vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shrink-0">
          <div>
            <h2 className="font-semibold text-slate-900">{isViewingStored ? "View Analysis" : "Analyze Job"}</h2>
            {jobTitle && <p className="mt-0.5 text-sm text-slate-600 truncate">{jobTitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {hasApplyUrl && (
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
        <div className="flex-1 overflow-hidden bg-slate-50 p-6">
          {isViewingStored && storedAnalysis ? (
            <AnalysisResult analysis={storedAnalysis} showDocumentActions={true} onDocumentGenerated={onDocumentGenerated} />
          ) : (
            <AnalysisForm
              initialUrl={jobUrl}
              hideInputModeToggle={false}
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
