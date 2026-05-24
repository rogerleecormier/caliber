import { useQuery, useMutation } from "@tanstack/react-query";
import { Button, Textarea } from "@caliber/ui-kit";
import { FileText, Mail, Loader2, Download, RefreshCw, Wand2 } from "lucide-react";
import { useState } from "react";
import { generateResume } from "@/server/functions/generate-resume";
import { generateCoverLetter } from "@/server/functions/generate-cover-letter";
import { getDocumentDownload, getDocumentsForAnalysis } from "@/server/functions/get-history";
import { AppliedToggle } from "./applied-toggle";

interface DocumentActionsProps {
  analysisId: number;
  applied?: boolean;
}

type DocResult = { documentId: number; fileName: string | null; r2Key: string };

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

export function DocumentActions({ analysisId, applied = false }: DocumentActionsProps) {
  const [extraGuidance, setExtraGuidance] = useState("");

  // ── Fetch existing documents ──────────────────────────────────────
  const { data: docs } = useQuery({
    queryKey: ["documents", analysisId],
    queryFn: () => getDocumentsForAnalysis({ data: { analysisId } }),
    staleTime: Infinity, // documents don't change behind the scenes
  });

  const resumeResult: DocResult | null = docs?.resume ?? null;
  const coverResult: DocResult | null = docs?.coverLetter ?? null;

  // ── Generate resume ───────────────────────────────────────────────
  const resumeMutation = useMutation({
    mutationFn: () =>
      generateResume({ data: { analysisId, extraGuidance: extraGuidance.trim() || undefined } }),
  });

  // ── Generate cover letter ─────────────────────────────────────────
  const coverMutation = useMutation({
    mutationFn: () =>
      generateCoverLetter({ data: { analysisId, extraGuidance: extraGuidance.trim() || undefined } }),
  });

  // ── Download (fire-and-forget, no cache needed) ───────────────────
  const resumeDownloadMutation = useMutation({
    mutationFn: (doc: DocResult) => triggerDownload(doc.r2Key, doc.fileName ?? "resume.pdf"),
  });

  const coverDownloadMutation = useMutation({
    mutationFn: (doc: DocResult) => triggerDownload(doc.r2Key, doc.fileName ?? "cover-letter.pdf"),
  });

  const busy = resumeMutation.isPending || coverMutation.isPending;

  // Merge server state with optimistic mutation results
  const resolvedResume = resumeMutation.data ?? resumeResult;
  const resolvedCover = coverMutation.data ?? coverResult;

  const error =
    resumeMutation.error?.message ??
    coverMutation.error?.message ??
    resumeDownloadMutation.error?.message ??
    coverDownloadMutation.error?.message ??
    null;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 border border-violet-100">
            <Wand2 className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <span className="text-sm font-semibold text-slate-800">Generate Documents</span>
        </div>
        <AppliedToggle analysisId={analysisId} initialApplied={applied} />
      </div>

      {/* Tailoring guidance card */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Extra Tailoring Guidance</span>
          <span className="text-[10px] text-slate-400 font-medium">(optional)</span>
        </div>
        <div className="px-4 py-3">
          <Textarea
            value={extraGuidance}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setExtraGuidance(e.target.value)}
            placeholder="e.g. emphasize healthcare domain experience and vendor management leadership."
            disabled={busy}
            rows={3}
            className="resize-y text-sm border-slate-200 focus:border-primary-300 focus:ring-primary-100"
          />
          <p className="text-xs text-slate-400 mt-2">
            Applied to both resume and cover letter generation.
          </p>
        </div>
      </div>

      {/* Document panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DocPanel
          icon={<FileText className="h-4 w-4 text-emerald-600" />}
          iconBg="bg-emerald-50 border-emerald-100"
          label="ATS Resume"
          result={resolvedResume}
          generating={resumeMutation.isPending}
          downloading={resumeDownloadMutation.isPending}
          busy={busy}
          onGenerate={() => resumeMutation.mutate()}
          onDownload={() => resolvedResume && resumeDownloadMutation.mutate(resolvedResume)}
          generateLabel="Create Resume"
          accentClass="text-emerald-700"
          buttonVariant="default"
        />
        <DocPanel
          icon={<Mail className="h-4 w-4 text-sky-600" />}
          iconBg="bg-sky-50 border-sky-100"
          label="Cover Letter"
          result={resolvedCover}
          generating={coverMutation.isPending}
          downloading={coverDownloadMutation.isPending}
          busy={busy}
          onGenerate={() => coverMutation.mutate()}
          onDownload={() => resolvedCover && coverDownloadMutation.mutate(resolvedCover)}
          generateLabel="Create Cover Letter"
          accentClass="text-sky-700"
          buttonVariant="secondary"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}

interface DocPanelProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  result: DocResult | null;
  generating: boolean;
  downloading: boolean;
  busy: boolean;
  onGenerate: () => void;
  onDownload: () => void;
  generateLabel: string;
  accentClass: string;
  buttonVariant: "default" | "secondary";
}

function DocPanel({
  icon,
  iconBg,
  label,
  result,
  generating,
  downloading,
  busy,
  onGenerate,
  onDownload,
  generateLabel,
  accentClass,
  buttonVariant,
}: DocPanelProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${iconBg}`}>
          {icon}
        </div>
        <span className={`text-sm font-semibold ${accentClass}`}>{label}</span>
        {result && (
          <span className="ml-auto text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            Ready
          </span>
        )}
      </div>

      {/* Panel body */}
      <div className="px-4 py-3">
        {result ? (
          <div className="flex gap-2">
            <Button onClick={onDownload} disabled={downloading} size="sm" className="flex-1">
              {downloading ? (
                <Loader2 className="animate-spin h-3.5 w-3.5" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download
            </Button>
            <Button
              onClick={onGenerate}
              disabled={busy}
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-slate-400 hover:text-slate-700"
              title="Regenerate"
            >
              {generating ? (
                <Loader2 className="animate-spin h-3.5 w-3.5" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        ) : (
          <Button
            onClick={onGenerate}
            disabled={busy}
            size="sm"
            className="w-full"
            variant={buttonVariant}
          >
            {generating ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : icon}
            {generating ? "Creating…" : generateLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
