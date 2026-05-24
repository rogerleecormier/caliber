import { X, ExternalLink, Calendar, DollarSign, Building2, FileText, Sparkles, RefreshCw, Globe } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect } from "react";
import type { JobWithCategory } from "../lib/search-utils";
import ResumeBuilderModal from "./ai/ResumeBuilderModal";
import AIAnalysisModal from "./ai/AIAnalysisModal";

interface JobDetailModalProps {
  job: JobWithCategory;
  isOpen: boolean;
  onClose: () => void;
}

export default function JobDetailModal({ job, isOpen, onClose }: JobDetailModalProps) {
  const [fullDescription, setFullDescription] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isCustomDomain, setIsCustomDomain] = useState(false);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);

  useEffect(() => {
    if (job.fullDescription) setFullDescription(job.fullDescription);

    if (isOpen && job.sourceUrl && job.company) {
      const fetchContent = async () => {
        setIsLoading(true);
        setFetchError(null);
        setIsCustomDomain(false);
        try {
          const params = new URLSearchParams({ url: job.sourceUrl, company: job.company || "" });
          const response = await fetch(`/api/v3/job-content?${params.toString()}`);
          if (response.ok) {
            const data = await response.json() as { content?: string };
            if (data.content) {
              setFullDescription(data.content);
              setFetchError(null);
              setIsCustomDomain(false);
            } else {
              setFetchError("No content returned from API");
            }
          } else {
            const errorData = await response.json() as { error?: string; isCustomDomain?: boolean; hint?: string };
            setIsCustomDomain(errorData.isCustomDomain || false);
            setFetchError(errorData.hint || errorData.error || `Failed to load (${response.status})`);
          }
        } catch (error) {
          setFetchError(error instanceof Error ? error.message : "Failed to fetch content");
        } finally {
          setIsLoading(false);
        }
      };
      fetchContent();
    } else if (!isOpen) {
      setFetchError(null);
      setIsCustomDomain(false);
    }
  }, [isOpen, job.sourceUrl, job.company, job.fullDescription]);

  if (!isOpen) return null;

  const formattedDate = job.postDate
    ? formatDistanceToNow(new Date(job.postDate), { addSuffix: true })
    : "Date not specified";

  const hasDescription = !!(job.description || fullDescription);

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 flex items-center justify-center p-4 z-50"
        style={{ background: "rgba(15,23,42,0.65)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
        onClick={onClose}
      >
        {/* Modal */}
        <div
          className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.96)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(226,232,240,0.9)",
            boxShadow: "0 24px 80px rgba(15,23,42,0.22), 0 8px 24px rgba(15,23,42,0.1)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div
            className="flex items-start justify-between gap-4 p-6"
            style={{ borderBottom: "1px solid rgba(226,232,240,0.8)", background: "rgba(255,255,255,0.6)" }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide"
                  style={{ background: "rgba(220,38,38,0.08)", color: "#b91c1c", border: "1px solid rgba(220,38,38,0.15)" }}
                >
                  {job.category.name}
                </span>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium"
                  style={{ background: "rgba(248,250,252,0.9)", color: "#94a3b8", border: "1px solid rgba(226,232,240,0.6)" }}
                >
                  <Globe size={9} />
                  {job.sourceName}
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 leading-tight">{job.title}</h2>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setIsResumeModalOpen(true)}
                disabled={!hasDescription}
                title={!hasDescription ? "No description available" : "AI Resume Tailor"}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "rgba(16,185,129,0.08)", color: "#059669", border: "1px solid rgba(16,185,129,0.2)" }}
              >
                <FileText size={13} />
                Tailor Resume
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: "#94a3b8" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(241,245,249,0.9)"; (e.currentTarget as HTMLElement).style.color = "#475569"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#94a3b8"; }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* ── Metadata bar ── */}
          <div
            className="flex flex-wrap items-center gap-4 px-6 py-3"
            style={{ borderBottom: "1px solid rgba(226,232,240,0.6)", background: "rgba(248,250,252,0.5)" }}
          >
            {job.company && (
              <div className="flex items-center gap-1.5 text-sm text-slate-600 font-medium">
                <Building2 size={14} className="text-slate-400" />
                {job.company}
              </div>
            )}
            {job.payRange && (
              <div className="flex items-center gap-1.5 text-sm text-slate-600">
                <DollarSign size={14} className="text-emerald-500" />
                <span className="font-medium">{job.payRange}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <Calendar size={14} className="text-slate-400" />
              {formattedDate}
            </div>
            {/* Mobile tailor button */}
            <button
              onClick={() => setIsResumeModalOpen(true)}
              disabled={!hasDescription}
              className="sm:hidden inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg w-full justify-center mt-1 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "rgba(16,185,129,0.08)", color: "#059669", border: "1px solid rgba(16,185,129,0.2)" }}
            >
              <FileText size={13} />
              Tailor Resume
            </button>
          </div>

          {/* ── AI Feature Banner ── */}
          <div
            className="px-6 py-2 flex items-center gap-3"
            style={{ background: "rgba(139,92,246,0.04)", borderBottom: "1px solid rgba(139,92,246,0.1)" }}
          >
            <Sparkles size={12} className="text-violet-500 flex-shrink-0" />
            <span className="text-xs text-violet-600 font-semibold">AI-Powered:</span>
            <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
              <span>JD-Resume Analysis</span>
              <span className="text-slate-300">·</span>
              <span>Cover Letter Generator</span>
              <span className="text-slate-300">·</span>
              <span>Match Scoring</span>
            </div>
          </div>

          {/* ── Body — Description ── */}
          <div className="flex-1 overflow-y-auto p-6 jobs-modal-scroll">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-primary-500 inline-block" />
              Job Description
            </h3>

            {fetchError ? (
              <div className="flex flex-col items-center justify-center py-12">
                {isCustomDomain ? (
                  <div className="text-center max-w-md">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(14,165,233,0.1)", border: "1px solid rgba(14,165,233,0.2)" }}>
                      <ExternalLink size={24} className="text-sky-600" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mb-2">View on Job Site</h3>
                    <p className="text-sm text-slate-500 mb-6">This job is hosted on a custom domain. Click below to view the complete description and apply.</p>
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl transition-all"
                      style={{ background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", boxShadow: "0 4px 12px rgba(220,38,38,0.3)" }}
                    >
                      View Full Job <ExternalLink size={14} />
                    </a>
                  </div>
                ) : (
                  <div className="text-center max-w-sm">
                    <div className="p-4 rounded-xl mb-4 text-sm" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", color: "#b91c1c" }}>
                      <p className="font-semibold mb-1">Failed to load description</p>
                      <p className="text-xs opacity-80">{fetchError}</p>
                    </div>
                    <button
                      onClick={() => { setFetchError(null); setFullDescription(null); setIsCustomDomain(false); }}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all"
                      style={{ background: "rgba(220,38,38,0.08)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.2)" }}
                    >
                      <RefreshCw size={14} />
                      Retry
                    </button>
                    {job.description && (
                      <div className="mt-6 pt-6 border-t border-slate-100 opacity-70">
                        <p className="text-xs text-slate-400 mb-3 font-medium uppercase tracking-wide">Summary</p>
                        <div className="job-description-content" dangerouslySetInnerHTML={{ __html: job.description }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-10 h-10 rounded-full border-2 border-slate-200 border-t-primary-500 animate-spin mb-4" />
                <p className="text-sm text-slate-500 font-medium mb-6">Loading full description…</p>
                {job.description && (
                  <div className="job-description-content opacity-40 max-w-full" dangerouslySetInnerHTML={{ __html: job.description }} />
                )}
              </div>
            ) : (
              <div
                className="job-description-content"
                dangerouslySetInnerHTML={{ __html: fullDescription || job.fullDescription || job.description || "No description available." }}
              />
            )}
          </div>

          {/* ── Footer ── */}
          <div
            className="flex items-center justify-between gap-4 px-6 py-4 flex-wrap"
            style={{ borderTop: "1px solid rgba(226,232,240,0.8)", background: "rgba(248,250,252,0.7)" }}
          >
            <span className="text-xs font-medium text-slate-400">via {job.sourceName}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAnalysisModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all"
                style={{ background: "rgba(139,92,246,0.08)", color: "#7c3aed", border: "1px solid rgba(139,92,246,0.2)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.14)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.08)"; }}
              >
                <Sparkles size={13} />
                AI Analysis
              </button>
              <a
                href={job.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white rounded-xl transition-all"
                style={{ background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", boxShadow: "0 4px 12px rgba(220,38,38,0.28)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 18px rgba(220,38,38,0.38)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(220,38,38,0.28)"; }}
              >
                Apply Now <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
      </div>

      <ResumeBuilderModal
        job={{ ...job, description: fullDescription || job.description }}
        isOpen={isResumeModalOpen}
        onClose={() => setIsResumeModalOpen(false)}
      />
      <AIAnalysisModal
        job={job}
        initialDescriptionHtml={fullDescription || job.fullDescription || job.description}
        isOpen={isAnalysisModalOpen}
        onClose={() => setIsAnalysisModalOpen(false)}
      />
    </>
  );
}
