import { useState, useEffect, useRef } from "react";
import { Button, Input, Textarea } from "@caliber/ui-kit";
import { Search, Loader2, RotateCcw, Link2, FileText, Building2, Mail } from "lucide-react";
import { toast } from "sonner";
import { analyzeJob } from "@/server/functions/analyze-job";
import { generateResume } from "@/server/functions/generate-resume";
import { generateCoverLetter } from "@/server/functions/generate-cover-letter";
import { AnalysisResult } from "./analysis-result";

export type AnalysisData = Awaited<ReturnType<typeof analyzeJob>>;
type InputMode = "url" | "text";

interface AnalysisFormProps {
  initialUrl?: string;
  initialJd?: string;
  hideInputModeToggle?: boolean;
  pipelineJobId?: number;
  onAnalysisComplete?: (analysis: AnalysisData) => void;
  onDocumentGenerated?: () => void;
}

export function AnalysisForm({
  initialUrl,
  initialJd,
  hideInputModeToggle = false,
  pipelineJobId,
  onAnalysisComplete,
  onDocumentGenerated,
}: AnalysisFormProps = {}) {
  const isUrlTextInput = initialUrl === "text-input" || initialUrl === "manual";
  const [mode, setMode] = useState<InputMode>(initialJd || !initialUrl || isUrlTextInput ? "text" : "url");
  const [url, setUrl] = useState(initialUrl && !isUrlTextInput ? initialUrl : "");
  const [jdText, setJdText] = useState(initialJd ?? "");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<"analyzing" | "resume" | "cover_letter" | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
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
    setLoadingStep("analyzing");
    setLoadingProgress(5);

    // Start a progress bar simulation ticker for Step 1
    let currentProgress = 5;
    let progressInterval = setInterval(() => {
      currentProgress = Math.min(30, currentProgress + 1);
      setLoadingProgress(currentProgress);
    }, 300);

    let data: AnalysisData;
    try {
      data = await analyzeJob({ data: { ...payload, pipelineJobId } });
    } catch (err) {
      clearInterval(progressInterval);
      setError(err instanceof Error ? err.message : "Analysis failed");
      setLoading(false);
      setLoadingStep(null);
      setLoadingProgress(0);
      return;
    }

    // Step 2: Tailoring ATS Resume
    clearInterval(progressInterval);
    currentProgress = 35;
    setLoadingProgress(35);
    setLoadingStep("resume");

    progressInterval = setInterval(() => {
      currentProgress = Math.min(65, currentProgress + 1);
      setLoadingProgress(currentProgress);
    }, 450);

    try {
      await generateResume({ data: { analysisId: data.id } });
    } catch (err) {
      console.error("Auto-resume tailoring failed:", err);
      toast.error("Automatic resume tailoring failed. You can retry it from the dashboard.");
    }

    // Step 3: Drafting Cover Letter
    clearInterval(progressInterval);
    currentProgress = 70;
    setLoadingProgress(70);
    setLoadingStep("cover_letter");

    progressInterval = setInterval(() => {
      currentProgress = Math.min(95, currentProgress + 1);
      setLoadingProgress(currentProgress);
    }, 300);

    try {
      await generateCoverLetter({ data: { analysisId: data.id } });
    } catch (err) {
      console.error("Auto-cover letter drafting failed:", err);
      toast.error("Automatic cover letter drafting failed. You can retry it from the dashboard.");
    }

    clearInterval(progressInterval);
    setLoadingProgress(100);

    // Slightly pause at 100% to let user see the completed state
    await new Promise((resolve) => setTimeout(resolve, 800));

    setResult(data);
    if (onAnalysisComplete) {
      onAnalysisComplete(data);
    }
    if (onDocumentGenerated) {
      onDocumentGenerated();
    }
    setLoading(false);
    setLoadingStep(null);
    setLoadingProgress(0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isUrl = mode === "url";
    if (isUrl && !url.trim()) return;
    if (!isUrl && jdText.trim().length < 50) return;

    if (isUrl) {
      await submitAnalysis({ url: url.trim() });
    } else {
      await submitAnalysis({
        url: url.trim() && url.trim() !== "text-input" && url.trim() !== "manual" ? url.trim() : undefined,
        jdText: jdText.trim(),
      });
    }
  }

  function handleReset() {
    setResult(null);
    setUrl("");
    setJdText("");
    setError(null);
  }

  const canSubmit = !loading && (mode === "url" ? !!url.trim() : jdText.trim().length >= 50);

  if (loading && loadingStep) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[450px] text-center space-y-6 animate-in fade-in duration-300">
        {/* Glow / Shimmer effects matching site theme */}
        <div className="relative">
          <div className="absolute -inset-1.5 rounded-full bg-gradient-to-r from-orange-500 via-violet-500 to-indigo-500 opacity-75 blur-md animate-pulse"></div>
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-xl">
            {loadingStep === "analyzing" && (
              <Building2 className="h-10 w-10 text-orange-500 animate-bounce" />
            )}
            {loadingStep === "resume" && (
              <FileText className="h-10 w-10 text-violet-500 animate-pulse" />
            )}
            {loadingStep === "cover_letter" && (
              <Mail className="h-10 w-10 text-sky-500 animate-pulse" />
            )}
          </div>
        </div>

        <div className="space-y-2 max-w-md">
          <h3 className="text-xl font-bold tracking-tight text-slate-800">
            {loadingStep === "analyzing" && "Analyzing Job Posting..."}
            {loadingStep === "resume" && "Tailoring ATS Resume..."}
            {loadingStep === "cover_letter" && "Drafting Custom Cover Letter..."}
          </h3>
          <p className="text-sm text-slate-500">
            {loadingStep === "analyzing" && "Scraping description and evaluating keyword matching..."}
            {loadingStep === "resume" && "Optimizing resume format and content matching the role requirements..."}
            {loadingStep === "cover_letter" && "Writing tailored professional introduction..."}
          </p>
        </div>

        {/* Loading Bar */}
        <div className="w-full max-w-md space-y-2">
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
            <div
              className="h-full bg-gradient-to-r from-orange-500 via-violet-500 to-indigo-500 transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs font-semibold text-slate-500 px-1">
            <span>{loadingProgress}%</span>
            <span>{loadingStep === "analyzing" ? "Step 1 of 3" : loadingStep === "resume" ? "Step 2 of 3" : "Step 3 of 3"}</span>
          </div>
        </div>

        {/* Step checklist */}
        <div className="w-full max-w-sm rounded-xl border border-slate-200/60 bg-white/60 backdrop-blur-sm p-4 text-left shadow-sm space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
              loadingProgress > 30 ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 text-slate-500"
            }`}>
              {loadingProgress > 30 ? "✓" : "1"}
            </div>
            <span className={loadingProgress > 30 ? "text-slate-500 line-through" : "font-semibold text-slate-800"}>
              AI Job Analysis
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
              loadingProgress > 65 ? "bg-emerald-500 border-emerald-500 text-white" : loadingStep === "resume" ? "bg-violet-100 border-violet-500 text-violet-700 animate-pulse" : "border-slate-300 text-slate-500"
            }`}>
              {loadingProgress > 65 ? "✓" : "2"}
            </div>
            <span className={loadingStep === "resume" ? "font-semibold text-slate-800" : "text-slate-500"}>
              ATS Resume Tailoring
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
              loadingProgress === 100 ? "bg-emerald-500 border-emerald-500 text-white" : loadingStep === "cover_letter" ? "bg-sky-100 border-sky-500 text-sky-700 animate-pulse" : "border-slate-300 text-slate-500"
            }`}>
              {loadingProgress === 100 ? "✓" : "3"}
            </div>
            <span className={loadingStep === "cover_letter" ? "font-semibold text-slate-800" : "text-slate-500"}>
              Cover Letter Generation
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={result ? "h-full flex flex-col min-h-0" : "mx-auto max-w-2xl mt-4"}>
      {!result && (
        <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-sm">
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
      )}

      {result && (
        <div className="h-full flex flex-col min-h-0">
          <div className="flex justify-end shrink-0 mb-4">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5" />
              New Analysis
            </Button>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            <AnalysisResult analysis={result} showDocumentActions={true} onDocumentGenerated={onDocumentGenerated} />
          </div>
        </div>
      )}
    </div>
  );
}
