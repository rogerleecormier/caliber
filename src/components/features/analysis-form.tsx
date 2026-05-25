import { useState, useEffect, useRef } from "react";
import { Button, Input, Textarea } from "@caliber/ui-kit";
import { Search, Loader2, RotateCcw, Link2, FileText } from "lucide-react";
import { analyzeJob } from "@/server/functions/analyze-job";
import { useRouter } from "@tanstack/react-router";
import { AnalysisResult } from "./analysis-result";
import { DocumentActions } from "./document-actions";

export type AnalysisData = Awaited<ReturnType<typeof analyzeJob>>;
type InputMode = "url" | "text";

interface AnalysisFormProps {
  initialUrl?: string;
  initialJd?: string;
  hideInputModeToggle?: boolean;
  pipelineJobId?: number;
  onAnalysisComplete?: (analysis: AnalysisData) => void;
}

export function AnalysisForm({
  initialUrl,
  initialJd,
  hideInputModeToggle = false,
  pipelineJobId,
  onAnalysisComplete,
}: AnalysisFormProps = {}) {
  const router = useRouter();
  const [mode, setMode] = useState<InputMode>(initialJd ? "text" : "url");
  const [url, setUrl] = useState(initialUrl ?? "");
  const [jdText, setJdText] = useState(initialJd ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisData | null>(null);
  const autoSubmittedKeyRef = useRef<string | null>(null);

  // Auto-submit when a URL or JD is pre-filled from the jobs page
  useEffect(() => {
    const autoSubmitKey = initialUrl?.trim()
      ? `url:${initialUrl.trim()}`
      : initialJd?.trim()
      ? `jd:${initialJd.trim()}`
      : null;

    if (!autoSubmitKey || autoSubmittedKeyRef.current === autoSubmitKey) return;

    if (initialUrl && initialUrl.trim()) {
      autoSubmittedKeyRef.current = autoSubmitKey;
      submitAnalysis({ url: initialUrl.trim() });
    } else if (initialJd && initialJd.trim().length >= 50) {
      autoSubmittedKeyRef.current = autoSubmitKey;
      submitAnalysis({ jdText: initialJd.trim() });
    }
  }, [initialUrl, initialJd]);

  async function submitAnalysis(payload: { url?: string; jdText?: string }) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await analyzeJob({ data: { ...payload, pipelineJobId } });
      setResult(data);
      if (onAnalysisComplete) {
        onAnalysisComplete(data);
      }
      if (pipelineJobId) {
        await router.invalidate();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isUrl = mode === "url";
    if (isUrl && !url.trim()) return;
    if (!isUrl && jdText.trim().length < 50) return;
    await submitAnalysis(isUrl ? { url: url.trim() } : { jdText: jdText.trim() });
  }

  function handleReset() {
    setResult(null);
    setUrl("");
    setJdText("");
    setError(null);
  }

  const canSubmit = !loading && (mode === "url" ? !!url.trim() : jdText.trim().length >= 50);

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold tracking-tight">Analyze a Job Posting</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Paste a URL or job description for AI-powered match scoring, gap analysis, and strategic positioning.
          </p>
        </div>

        {/* Mode toggle */}
        {!hideInputModeToggle && (
          <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-1 gap-1 mb-5">
            {([
              { id: "url" as InputMode, label: "From URL", Icon: Link2 },
              { id: "text" as InputMode, label: "Paste Text", Icon: FileText },
            ] as const).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={[
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  mode === id
                    ? "bg-background shadow-sm border border-border text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "url" ? (
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://example.com/jobs/position"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                required
                className="flex-1"
              />
              <Button type="submit" disabled={!canSubmit} className="shrink-0">
                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Search className="h-4 w-4" />}
                {loading ? "Analyzing…" : "Analyze"}
              </Button>
            </div>
          ) : (
            <>
              <Textarea
                placeholder="Paste the full job description here…"
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                disabled={loading}
                required
                rows={10}
                className="resize-y"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {jdText.trim().length > 0 && jdText.trim().length < 50
                    ? "Too short — paste the full job description"
                    : jdText.trim().length >= 50
                    ? `${jdText.trim().length.toLocaleString()} characters`
                    : ""}
                </span>
                <Button type="submit" disabled={!canSubmit} className="shrink-0">
                  {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Search className="h-4 w-4" />}
                  {loading ? "Analyzing…" : "Analyze"}
                </Button>
              </div>
            </>
          )}
        </form>

        {error && (
          <p className="mt-3 text-sm text-destructive">{error}</p>
        )}
      </div>

      {result && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5" />
              New Analysis
            </Button>
          </div>
          <AnalysisResult analysis={result} />
          <DocumentActions
            analysisId={result.id}
            applied={"applied" in result && result.applied === true}
          />
        </div>
      )}
    </div>
  );
}
