import { useQuery, useMutation } from "@tanstack/react-query";
import { Button, Textarea } from "@caliber/ui-kit";
import { FileText, Mail, Loader2, Download, RefreshCw, Wand2, FileType2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { generateResume } from "@/server/functions/generate-resume";
import { generateCoverLetter } from "@/server/functions/generate-cover-letter";
import { getDocumentDownload, getDocumentsForAnalysis } from "@/server/functions/get-history";
import { AppliedToggle } from "./applied-toggle";

type ResumeFormat = "pdf" | "docx";

interface DocumentActionsProps {
  analysisId: number;
  applied?: boolean;
  onDocumentGenerated?: () => void;
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

export function DocumentActions({ analysisId, applied = false, onDocumentGenerated }: DocumentActionsProps) {
  const [extraGuidance, setExtraGuidance] = useState("");
  const [resumeFormat, setResumeFormat] = useState<ResumeFormat>("pdf");
  // Tracks the locally-generated result for the current format session.
  // Cleared when format switches so the user must regenerate in the new format.
  const [localResumeResult, setLocalResumeResult] = useState<DocResult | null>(null);
  // ── Fetch existing documents ──────────────────────────────────────
  const { data: docs } = useQuery({
    queryKey: ["documents", analysisId],
    queryFn: () => getDocumentsForAnalysis({ data: { analysisId } }),
    staleTime: 0,
  });

  const resumeResultFromDb: DocResult | null = docs?.resume ?? null;
  const coverResult: DocResult | null = docs?.coverLetter ?? null;

  function handleFormatChange(fmt: ResumeFormat) {
    if (fmt === resumeFormat) return;
    setResumeFormat(fmt);
    // Clear local result so the user regenerates in the new format.
    // The DB result may be a different format — don't show it as usable.
    setLocalResumeResult(null);
  }

  // ── Generate resume ───────────────────────────────────────────────
  const resumeMutation = useMutation({
    mutationFn: (format: ResumeFormat) => {
      const toastId = toast.loading("Generating your resume…", {
        description: "Tailoring to the job description. You can leave this page.",
      });
      return generateResume({ data: { analysisId, extraGuidance: extraGuidance.trim() || undefined, format } })
        .then((result) => {
          toast.success("Resume ready!", {
            id: toastId,
            description: result.fileName ?? "Your tailored resume has been generated.",
            action: {
              label: "Download",
              onClick: () => triggerDownload(result.r2Key, result.fileName ?? `resume.${format}`),
            },
            duration: 10000,
          });
          return result;
        })
        .catch((err) => {
          toast.error("Resume generation failed", {
            id: toastId,
            description: err instanceof Error ? err.message : "Something went wrong.",
          });
          throw err;
        });
    },
    onSuccess: (result) => {
      setLocalResumeResult(result);
      onDocumentGenerated?.();
    },
  });

  // ── Generate cover letter ─────────────────────────────────────────
  const coverMutation = useMutation({
    mutationFn: () =>
      generateCoverLetter({ data: { analysisId, extraGuidance: extraGuidance.trim() || undefined } }),
    onSuccess: () => onDocumentGenerated?.(),
  });

  // ── Download (fire-and-forget, no cache needed) ───────────────────
  const resumeDownloadMutation = useMutation({
    mutationFn: (doc: DocResult) => triggerDownload(doc.r2Key, doc.fileName ?? `resume.${resumeFormat}`),
    onError: (error) => {
      console.error("Resume download failed:", error);
    },
  });

  const coverDownloadMutation = useMutation({
    mutationFn: (doc: DocResult) => triggerDownload(doc.r2Key, doc.fileName ?? "cover-letter.pdf"),
    onError: (error) => {
      console.error("Cover letter download failed:", error);
    },
  });

  const busy = resumeMutation.isPending || coverMutation.isPending;

  // Use local result (format-aware) first; fall back to DB result only when
  // the format hasn't been switched (i.e. the DB result is the same format).
  const dbResumeMatchesFormat = resumeResultFromDb?.fileName?.endsWith(`.${resumeFormat}`) ?? false;
  const resolvedResume = localResumeResult ?? (dbResumeMatchesFormat ? resumeResultFromDb : null);
  const resolvedCover = coverMutation.data ?? coverResult;

  const error =
    resumeMutation.error?.message ??
    coverMutation.error?.message ??
    resumeDownloadMutation.error?.message ??
    coverDownloadMutation.error?.message ??
    null;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-semibold text-slate-800">Generate Documents</span>
        </div>
        <AppliedToggle analysisId={analysisId} initialApplied={applied} />
      </div>

      {/* Guidance input */}
      <Textarea
        value={extraGuidance}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setExtraGuidance(e.target.value)}
        placeholder="Optional tailoring guidance — e.g. emphasize healthcare domain experience…"
        disabled={busy}
        rows={2}
        className="resize-none text-sm"
      />

      {/* Document panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* ATS Resume */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-semibold text-slate-800">ATS Resume</span>
            </div>
            {resolvedResume && (
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                Ready
              </span>
            )}
          </div>

          {/* Format toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 shrink-0">Format</span>
            <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs font-medium">
              <button
                onClick={() => handleFormatChange("pdf")}
                disabled={busy}
                className={`flex items-center gap-1 px-2.5 py-1 transition-colors ${resumeFormat === "pdf" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              >
                <FileText className="h-3 w-3" />PDF
              </button>
              <button
                onClick={() => handleFormatChange("docx")}
                disabled={busy}
                className={`flex items-center gap-1 px-2.5 py-1 transition-colors border-l border-slate-200 ${resumeFormat === "docx" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              >
                <FileType2 className="h-3 w-3" />DOCX
              </button>
            </div>
          </div>

          {/* Action */}
          {resolvedResume ? (
            <div className="flex gap-2">
              <Button
                onClick={() => resumeDownloadMutation.mutate(resolvedResume)}
                disabled={resumeDownloadMutation.isPending}
                size="sm"
                className="flex-1"
              >
                {resumeDownloadMutation.isPending ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                Download {resumeFormat.toUpperCase()}
              </Button>
              <Button
                onClick={() => resumeMutation.mutate(resumeFormat)}
                disabled={busy}
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                title="Regenerate"
              >
                {resumeMutation.isPending ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => resumeMutation.mutate(resumeFormat)}
              disabled={busy}
              size="sm"
              className="w-full"
            >
              {resumeMutation.isPending ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
              {resumeMutation.isPending ? "Creating…" : "Create Resume"}
            </Button>
          )}
        </div>

        {/* Cover Letter */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-sky-600" />
              <span className="text-sm font-semibold text-slate-800">Cover Letter</span>
            </div>
            {resolvedCover && (
              <span className="text-[10px] font-medium text-sky-700 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded-full">
                Ready
              </span>
            )}
          </div>

          <div className="h-[1.75rem]" />

          {resolvedCover ? (
            <div className="flex gap-2">
              <Button
                onClick={() => coverDownloadMutation.mutate(resolvedCover)}
                disabled={coverDownloadMutation.isPending}
                size="sm"
                className="flex-1"
                variant="secondary"
              >
                {coverDownloadMutation.isPending ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                Download PDF
              </Button>
              <Button
                onClick={() => coverMutation.mutate()}
                disabled={busy}
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                title="Regenerate"
              >
                {coverMutation.isPending ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => coverMutation.mutate()}
              disabled={busy}
              size="sm"
              className="w-full"
              variant="secondary"
            >
              {coverMutation.isPending ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
              {coverMutation.isPending ? "Creating…" : "Create Cover Letter"}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  );
}

