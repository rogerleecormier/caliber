import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@caliber/ui-kit/src/ui/dialog";
import { Download, FileText, Loader2, Mail } from "lucide-react";
import { getDocumentDownload } from "@/server/functions/get-history";

export type ViewableDocument = {
  id: number;
  docType: string;
  r2Key: string;
  fileName: string;
  createdAt: string | null;
};

interface DocumentViewerModalProps {
  open: boolean;
  onClose: () => void;
  documents: ViewableDocument[];
  jobTitle?: string;
  initialDocumentId?: number | null;
}

function isDocx(docType: string, fileName: string) {
  return docType.endsWith("_docx") || fileName.toLowerCase().endsWith(".docx");
}

function docLabel(docType: string): string {
  if (docType.startsWith("resume")) {
    return docType.endsWith("_docx") ? "Resume (DOCX)" : "Resume (PDF)";
  }
  return docType.endsWith("_docx") ? "Cover Letter (DOCX)" : "Cover Letter (PDF)";
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export function DocumentViewerModal({
  open,
  onClose,
  documents,
  jobTitle,
  initialDocumentId,
}: DocumentViewerModalProps) {
  const sorted = useMemo(
    () => [...documents].sort((a, b) => b.id - a.id),
    [documents],
  );
  const [selectedId, setSelectedId] = useState<number | null>(initialDocumentId ?? sorted[0]?.id ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedId(initialDocumentId ?? sorted[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedDoc = sorted.find((d) => d.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;
    setPreviewUrl(null);
    setPreviewHtml(null);
    setError(null);

    if (!open || !selectedDoc) return;

    setLoading(true);
    (async () => {
      try {
        const result = await getDocumentDownload({ data: { r2Key: selectedDoc.r2Key } });
        if (cancelled) return;
        const bytes = new Uint8Array(result.data);

        if (isDocx(selectedDoc.docType, selectedDoc.fileName)) {
          const mammoth = await import("mammoth/mammoth.browser");
          const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          const converted = await (mammoth as any).convertToHtml({ arrayBuffer });
          if (cancelled) return;
          setPreviewHtml(converted.value);
        } else {
          const blob = new Blob([bytes], { type: result.contentType || "application/pdf" });
          const url = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          setPreviewUrl(url);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load document preview");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, selectedDoc?.id]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleDownload() {
    if (!selectedDoc) return;
    setDownloading(true);
    try {
      const result = await getDocumentDownload({ data: { r2Key: selectedDoc.r2Key } });
      const blob = new Blob([new Uint8Array(result.data)], { type: result.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = selectedDoc.fileName || "document";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to download document");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl w-full max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-slate-100 shrink-0">
          <DialogTitle>Documents</DialogTitle>
          {jobTitle && <DialogDescription>{jobTitle}</DialogDescription>}
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
          {/* Document list */}
          <div className="sm:w-56 shrink-0 border-b sm:border-b-0 sm:border-r border-slate-100 p-3 space-y-1 overflow-y-auto">
            {sorted.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => setSelectedId(doc.id)}
                className={`w-full text-left rounded-lg px-3 py-2 text-xs transition ${
                  selectedId === doc.id
                    ? "bg-amber-50 border border-amber-200 text-amber-800"
                    : "border border-transparent hover:bg-slate-50 text-slate-700"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  {doc.docType.startsWith("resume") ? (
                    <FileText className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  ) : (
                    <Mail className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  )}
                  {docLabel(doc.docType)}
                </div>
                {doc.createdAt && (
                  <div className="text-[10px] text-slate-400 mt-0.5">{formatDate(doc.createdAt)}</div>
                )}
              </button>
            ))}
            {sorted.length === 0 && (
              <p className="text-xs text-slate-400 px-2 py-4">No documents yet.</p>
            )}
          </div>

          {/* Preview pane */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-slate-100 shrink-0">
              <span className="text-xs font-medium text-slate-600 truncate">
                {selectedDoc?.fileName ?? ""}
              </span>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!selectedDoc || downloading}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {downloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Download
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-auto bg-slate-50 p-3">
              {loading ? (
                <div className="flex h-full items-center justify-center text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : error ? (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  title={selectedDoc?.fileName ?? "Document preview"}
                  className="w-full h-full min-h-[60vh] rounded-lg border border-slate-200 bg-white"
                />
              ) : previewHtml ? (
                <div
                  className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-white p-6"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-400">
                  Select a document to preview
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
