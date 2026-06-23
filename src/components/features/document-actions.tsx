import { useQuery, useMutation } from "@tanstack/react-query";
import { Button, Textarea } from "@caliber/ui-kit";
import { FileText, Mail, Loader2, Download, RefreshCw, Wand2, FileType2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { generateResume } from "@/server/functions/generate-resume";
import { generateCoverLetter } from "@/server/functions/generate-cover-letter";
import { getDocumentDownload, getDocumentsForAnalysis } from "@/server/functions/get-history";
import { AppliedToggle } from "./applied-toggle";

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
  const [localResumePdf, setLocalResumePdf] = useState<DocResult | null>(null);
  const [localResumeDocx, setLocalResumeDocx] = useState<DocResult | null>(null);
  const [localCoverPdf, setLocalCoverPdf] = useState<DocResult | null>(null);
  const [localCoverDocx, setLocalCoverDocx] = useState<DocResult | null>(null);

  const { data: docs } = useQuery({
    queryKey: ["documents", analysisId],
    queryFn: () => getDocumentsForAnalysis({ data: { analysisId } }),
    staleTime: 0,
  });

  const resumePdf: DocResult | null = localResumePdf ?? docs?.resumePdf ?? null;
  const resumeDocx: DocResult | null = localResumeDocx ?? docs?.resumeDocx ?? null;
  const coverPdf: DocResult | null = localCoverPdf ?? docs?.coverPdf ?? null;
  const coverDocx: DocResult | null = localCoverDocx ?? docs?.coverDocx ?? null;
  const hasResume = !!(resumePdf || resumeDocx);
  const hasCover = !!(coverPdf || coverDocx);

  const resumeMutation = useMutation({
    mutationFn: () => {
      const toastId = toast.loading("Generating your resume…", {
        description: "Creating PDF and DOCX versions.",
      });
      return generateResume({ data: { analysisId, extraGuidance: extraGuidance.trim() || undefined } })
        .then((result) => {
          toast.success("Resume ready!", {
            id: toastId,
            description: result.pdf.fileName ?? "Both formats are ready to download.",
            duration: 8000,
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
      setLocalResumePdf(result.pdf);
      setLocalResumeDocx(result.docx);
      onDocumentGenerated?.();
    },
  });

  const coverMutation = useMutation({
    mutationFn: () => {
      const toastId = toast.loading("Generating your cover letter…");
      return generateCoverLetter({ data: { analysisId, extraGuidance: extraGuidance.trim() || undefined } })
        .then((result) => {
          toast.success("Cover letter ready!", { id: toastId, duration: 8000 });
          return result;
        })
        .catch((err) => {
          toast.error("Cover letter generation failed", {
            id: toastId,
            description: err instanceof Error ? err.message : "Something went wrong.",
          });
          throw err;
        });
    },
    onSuccess: (result) => {
      setLocalCoverPdf(result.pdf);
      setLocalCoverDocx(result.docx);
      onDocumentGenerated?.();
    },
  });

  const resumePdfDownload = useMutation({ mutationFn: (doc: DocResult) => triggerDownload(doc.r2Key, doc.fileName ?? "resume.pdf") });
  const resumeDocxDownload = useMutation({ mutationFn: (doc: DocResult) => triggerDownload(doc.r2Key, doc.fileName ?? "resume.docx") });
  const coverPdfDownload = useMutation({ mutationFn: (doc: DocResult) => triggerDownload(doc.r2Key, doc.fileName ?? "cover-letter.pdf") });
  const coverDocxDownload = useMutation({ mutationFn: (doc: DocResult) => triggerDownload(doc.r2Key, doc.fileName ?? "cover-letter.docx") });

  const busy = resumeMutation.isPending || coverMutation.isPending;

  const error =
    resumeMutation.error?.message ??
    coverMutation.error?.message ??
    resumePdfDownload.error?.message ??
    resumeDocxDownload.error?.message ??
    coverPdfDownload.error?.message ??
    coverDocxDownload.error?.message ??
    null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-semibold text-slate-800">Generate Documents</span>
        </div>
        <AppliedToggle analysisId={analysisId} initialApplied={applied} />
      </div>

      {/* Guidance */}
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
              <span className="text-sm font-semibold text-slate-800">Resume</span>
            </div>
            {hasResume && (
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                Ready
              </span>
            )}
          </div>

          {hasResume ? (
            <div className="flex gap-2">
              {resumePdf && (
                <Button
                  onClick={() => resumePdfDownload.mutate(resumePdf)}
                  disabled={resumePdfDownload.isPending}
                  size="sm"
                  className="flex-1"
                >
                  {resumePdfDownload.isPending ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                  PDF
                </Button>
              )}
              {resumeDocx && (
                <Button
                  onClick={() => resumeDocxDownload.mutate(resumeDocx)}
                  disabled={resumeDocxDownload.isPending}
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                >
                  {resumeDocxDownload.isPending ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <FileType2 className="h-3.5 w-3.5" />}
                  DOCX
                </Button>
              )}
              <Button
                onClick={() => resumeMutation.mutate()}
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
              onClick={() => resumeMutation.mutate()}
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
            {hasCover && (
              <span className="text-[10px] font-medium text-sky-700 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded-full">
                Ready
              </span>
            )}
          </div>

          {hasCover ? (
            <div className="flex gap-2">
              {coverPdf && (
                <Button
                  onClick={() => coverPdfDownload.mutate(coverPdf)}
                  disabled={coverPdfDownload.isPending}
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                >
                  {coverPdfDownload.isPending ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                  PDF
                </Button>
              )}
              {coverDocx && (
                <Button
                  onClick={() => coverDocxDownload.mutate(coverDocx)}
                  disabled={coverDocxDownload.isPending}
                  size="sm"
                  variant="ghost"
                  className="flex-1"
                >
                  {coverDocxDownload.isPending ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <FileType2 className="h-3.5 w-3.5" />}
                  DOCX
                </Button>
              )}
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
