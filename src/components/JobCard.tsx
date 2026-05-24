import {
  ExternalLink,
  Calendar,
  DollarSign,
  Building2,
  Eye,
  Sparkles,
  Globe,
  FileText,
  TrendingUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { JobWithCategory } from "../lib/search-utils";
import type { JobScoreResult } from "../routes/api/ai/score-all";
import React, { useState } from "react";
import JobDetailModal from "./JobDetailModal";
import ResumeBuilderModal from "./ai/ResumeBuilderModal";
import AIAnalysisModal from "./ai/AIAnalysisModal";
import { getMasterScoreGradient } from "../lib/scoreUtils";

interface JobCardProps {
  key?: any;
  job: JobWithCategory;
  score?: JobScoreResult;
  onCompanyClick?: (company: string) => void;
}

function getTruncatedDescription(html: string | null, maxLength = 160): string {
  if (!html) return "";
  let text = html.replace(/<[^>]*>/g, "");
  const entities: Record<string, string> = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&quot;": '"', "&#39;": "'", "&apos;": "'", "&copy;": "©",
    "&reg;": "®", "&trade;": "™", "&ndash;": "–", "&mdash;": "—",
    "&bull;": "•", "&middot;": "·",
  };
  text = text.replace(/&[a-zA-Z0-9#]+;/g, (e) => entities[e] || e);
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= maxLength ? text : text.substring(0, maxLength).trim() + "…";
}

function ScoreBadge({ score }: { score: JobScoreResult }) {
  const gradient = getMasterScoreGradient(score.masterScore);
  return (
    <div className="flex items-center gap-1.5">
      {score.isUnicorn && (
        <span className="text-sm leading-none" title={score.unicornReason || "Unicorn opportunity"}>🦄</span>
      )}
      <div
        className={`inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br ${gradient} text-white text-xs font-bold shadow-sm score-ring-pulse`}
        title={`Match Score: ${score.masterScore}`}
      >
        {score.masterScore}
      </div>
    </div>
  );
}

export default function JobCard({ job, score, onCompanyClick }: JobCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);

  const formattedDate = job.postDate
    ? formatDistanceToNow(new Date(job.postDate), { addSuffix: true })
    : "Date not specified";

  const preview = getTruncatedDescription(job.description);

  return (
    <>
      <article
        className="flex flex-col h-full rounded-2xl overflow-hidden group transition-all duration-200 hover:-translate-y-1 cursor-default"
        style={{
          background: "rgba(255,255,255,0.75)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(226,232,240,0.8)",
          boxShadow: "0 4px 16px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.03)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 40px rgba(15,23,42,0.1), 0 4px 8px rgba(15,23,42,0.05)";
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(220,38,38,0.18)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.03)";
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(226,232,240,0.8)";
        }}
      >
        {/* Card body */}
        <div className="p-5 flex-1 flex flex-col">

          {/* Top row: category + source + score */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
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
            {score && <ScoreBadge score={score} />}
          </div>

          {/* Title */}
          <h3 className="text-base font-bold text-slate-900 mb-1.5 line-clamp-2 leading-snug group-hover:text-primary-600 transition-colors duration-150">
            {job.title}
          </h3>

          {/* Company */}
          {job.company && (
            <div className="flex items-center gap-1.5 text-slate-600 mb-2 text-sm font-medium">
              <Building2 size={13} className="text-slate-400 flex-shrink-0" />
              {onCompanyClick ? (
                <button
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); onCompanyClick(job.company!); }}
                  className="hover:text-primary-600 hover:underline transition-colors text-left truncate"
                >
                  {job.company}
                </button>
              ) : (
                <span className="truncate">{job.company}</span>
              )}
            </div>
          )}

          {/* Description preview */}
          {preview && (
            <p className="text-slate-500 text-xs mb-3 line-clamp-2 leading-relaxed flex-none">
              {preview}
            </p>
          )}

          {/* Meta */}
          <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
            {job.payRange && (
              <div className="flex items-center gap-1">
                <DollarSign size={12} className="text-emerald-400 flex-shrink-0" />
                <span className="font-medium text-slate-500">{job.payRange}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Calendar size={12} className="text-slate-300 flex-shrink-0" />
              <span>{formattedDate}</span>
            </div>
          </div>
        </div>

        {/* AI Feature strip */}
        {score && (
          <div
            className="px-5 py-2 flex items-center gap-2 border-t"
            style={{ background: "rgba(139,92,246,0.04)", borderColor: "rgba(139,92,246,0.1)" }}
          >
            <Sparkles size={10} className="text-violet-400 flex-shrink-0" />
            <span className="text-[10px] text-violet-500 font-semibold flex-1 min-w-0 truncate">
              {score.isUnicorn ? "Unicorn opportunity detected" : `AI Score: ${score.masterScore} · Resume match analysis available`}
            </span>
            <TrendingUp size={10} className="text-violet-400 flex-shrink-0" />
          </div>
        )}

        {/* Footer buttons */}
        <div
          className="px-4 py-2.5 flex items-center justify-end gap-1.5 flex-wrap border-t"
          style={{ background: "rgba(248,250,252,0.7)", borderColor: "rgba(226,232,240,0.7)" }}
        >
          <button
            onClick={() => setIsResumeModalOpen(true)}
            disabled={!job.description}
            title={!job.description ? "No job description available" : "AI Resume Tailor"}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "rgba(16,185,129,0.08)", color: "#059669", border: "1px solid rgba(16,185,129,0.2)" }}
            onMouseEnter={(e) => { if (job.description) (e.currentTarget as HTMLElement).style.background = "rgba(16,185,129,0.14)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(16,185,129,0.08)"; }}
          >
            <FileText size={11} />
            Tailor
          </button>

          <button
            onClick={() => setIsAnalysisModalOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all"
            style={{ background: "rgba(139,92,246,0.08)", color: "#7c3aed", border: "1px solid rgba(139,92,246,0.2)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.14)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.08)"; }}
          >
            <Sparkles size={11} />
            AI Analysis
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all"
            style={{ background: "rgba(255,255,255,0.8)", color: "#64748b", border: "1px solid rgba(226,232,240,0.9)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(241,245,249,0.9)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.8)"; }}
          >
            <Eye size={11} />
            Preview
          </button>

          <a
            href={job.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg text-white transition-all"
            style={{ background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", boxShadow: "0 2px 8px rgba(220,38,38,0.25)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(220,38,38,0.35)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(220,38,38,0.25)"; }}
          >
            Apply <ExternalLink size={10} />
          </a>
        </div>
      </article>

      <JobDetailModal job={job} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      <ResumeBuilderModal job={job} isOpen={isResumeModalOpen} onClose={() => setIsResumeModalOpen(false)} />
      <AIAnalysisModal job={job} isOpen={isAnalysisModalOpen} onClose={() => setIsAnalysisModalOpen(false)} />
    </>
  );
}
