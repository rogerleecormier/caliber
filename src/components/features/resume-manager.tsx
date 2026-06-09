import { useState, useRef, useCallback } from "react";
import { Button, Input, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@caliber/ui-kit";
import { CheckCircle2, Loader2, Upload, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { saveResume, parseResumeText, aiParseResume, type ResumeData } from "@/server/functions/manage-resume";

export function ResumeManager({ initial }: { initial: ResumeData | null }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "extracting" | "done" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(initial?.updatedAt ?? null);

  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [linkedin, setLinkedin] = useState(initial?.linkedin ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [rawText, setRawText] = useState(initial?.rawText ?? "");
  const [parsedStructured, setParsedStructured] = useState<Partial<ResumeData> | null>(null);

  const parseFile = useCallback(async (file: File) => {
    setUploadStatus("extracting");
    setUploadError(null);
    try {
      let text = "";
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "pdf") {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        const arrayBuffer = await file.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          pages.push(content.items.map((item: any) => ("str" in item ? item.str : "")).join(" "));
        }
        text = pages.join("\n\n");
      } else if (ext === "docx") {
        const mammoth = await import("mammoth/mammoth.browser");
        const arrayBuffer = await file.arrayBuffer();
        const result = await (mammoth as any).extractRawText({ arrayBuffer });
        text = result.value;
      } else {
        text = await file.text();
      }
      setRawText(text);

      const parsed = await parseResumeText({ data: { text } });
      if (parsed) {
        if (parsed.fullName && !fullName) setFullName(parsed.fullName);
        if (parsed.email && !email) setEmail(parsed.email);
        if (parsed.phone && !phone) setPhone(parsed.phone);
        if (parsed.linkedin && !linkedin) setLinkedin(parsed.linkedin);
        if (parsed.website && !website) setWebsite(parsed.website);
      }

      setUploadStatus("done");
      setTimeout(() => setUploadStatus("idle"), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to read file";
      setUploadError(msg);
      setUploadStatus("error");
      toast.error("Resume upload failed", { description: msg });
    }
  }, [fullName, email, phone, linkedin, website]);

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    parseFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    setSaveStatus("saving");
    setSaveError(null);

    const aiToastId = rawText
      ? toast.loading("AI is parsing your resume…", {
          description: "Extracting experience, skills, and projects. You can leave this page.",
        })
      : null;

    try {
      let structured = parsedStructured ?? {};
      if (rawText) {
        const aiParsed = await aiParseResume({ data: { text: rawText } });
        if (aiParsed && Object.keys(aiParsed).length > 0) {
          setParsedStructured(aiParsed);
          structured = aiParsed;
        }
      }

      const result = await saveResume({
        data: {
          fullName: fullName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          linkedin: linkedin.trim() || undefined,
          website: website.trim() || undefined,
          rawText: rawText || undefined,
          ...structured,
        },
      });

      setLastSaved(result.updatedAt);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);

      if (aiToastId) {
        toast.success("Resume parsed and saved!", {
          id: aiToastId,
          description: "Experience, skills, and personal projects have been saved to your profile.",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setSaveError(msg);
      setSaveStatus("error");
      if (aiToastId) toast.error("Save failed", { id: aiToastId, description: msg });
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {/* Upload drop zone */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Upload Resume</CardTitle>
          <CardDescription>
            Upload a PDF, DOCX, or TXT file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            onClick={() => uploadStatus === "idle" || uploadStatus === "error" ? fileInputRef.current?.click() : undefined}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            className={[
              "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors select-none",
              uploadStatus === "idle" || uploadStatus === "error" ? "cursor-pointer" : "cursor-default",
              dragOver
                ? "border-primary bg-primary/5"
                : uploadStatus === "error"
                ? "border-destructive/40 bg-destructive/5"
                : uploadStatus === "done"
                ? "border-emerald-500/40 bg-emerald-500/5"
                : uploadStatus !== "idle"
                ? "border-primary/40 bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/30",
            ].join(" ")}
          >
            {uploadStatus === "done" ? (
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            ) : uploadStatus === "error" ? (
              <AlertCircle className="h-8 w-8 text-destructive" />
            ) : uploadStatus !== "idle" ? (
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground" />
            )}
            <div className="text-center">
              <p className="text-sm font-medium">
                {uploadStatus === "extracting" ? "Reading file…" :
                 uploadStatus === "done" ? "File ready — click Save Resume to parse and save." :
                 uploadStatus === "error" ? "Failed to read file" :
                 "Click to upload or drag & drop"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {uploadStatus === "extracting" ? "Extracting text from your file…" :
                 uploadStatus === "done" ? "Contact info auto-filled. AI will parse all sections on save." :
                 uploadStatus === "error" ? uploadError ?? "" :
                 "PDF, DOCX, or TXT"}
              </p>
            </div>
            {(uploadStatus === "idle" || uploadStatus === "error") && (
              <div className="flex gap-1.5">
                {["PDF", "DOCX", "TXT"].map((fmt) => (
                  <span key={fmt} className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded font-mono">{fmt}</span>
                ))}
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.text,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="hidden"
            onChange={handleFileInputChange}
          />
        </CardContent>
      </Card>

      {/* Contact info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contact Information</CardTitle>
          <CardDescription>Used in the header of generated resumes and cover letters.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="fullName">
                Full Name <span className="text-destructive">*</span>
              </label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="email">Email</label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="phone">Phone</label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="linkedin">LinkedIn</label>
              <Input id="linkedin" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/yourprofile" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="website">Website / Portfolio</label>
              <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yoursite.com" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resume text */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resume Text</CardTitle>
          <CardDescription>
            The full text the AI reads for gap scoring and document generation. Paste or edit directly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste your resume text here, or upload a file above…"
            className="w-full min-h-[400px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {rawText && (
            <p className="text-xs text-muted-foreground mt-1.5 tabular-nums">{rawText.length.toLocaleString()} characters</p>
          )}
        </CardContent>
      </Card>

      {/* Save footer */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-sm text-muted-foreground">
          {lastSaved ? `Last saved ${new Date(lastSaved).toLocaleString()}` : ""}
        </span>
        <Button type="submit" disabled={saveStatus === "saving" || !fullName.trim()} className="min-w-32">
          {saveStatus === "saving" ? (
            <><Loader2 className="animate-spin h-4 w-4" />Saving…</>
          ) : saveStatus === "saved" ? (
            <><CheckCircle2 className="h-4 w-4" />Saved!</>
          ) : (
            "Save Resume"
          )}
        </Button>
      </div>
      {saveError && <p className="text-sm text-destructive">{saveError}</p>}
    </form>
  );
}
