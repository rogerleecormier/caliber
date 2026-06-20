import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { getResume } from "@/server/functions/manage-resume";
import { getUserPreferences, setUserPreferences } from "@/server/functions/user-preferences";
import { FileUser, Sparkles, Check, Loader2 } from "lucide-react";
import { ResumeManagerV2 } from "@/components/features/resume-manager-v2";
import { PageHero, PageSection, Button, Input } from "@caliber/ui-kit";

export const Route = createFileRoute("/profile")({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: string } | null };
    if (!ctx.user) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const [resume, preferences] = await Promise.all([getResume(), getUserPreferences()]);
    return { resume, preferences };
  },
  component: ProfilePage,
  pendingComponent: ProfileLoading,
});

function ProfilePage() {
  const { resume, preferences } = Route.useLoaderData();
  
  const [showGlobalJobs, setShowGlobalJobs] = useState(preferences.showGlobalJobs);
  const [preferredSalaryMin, setPreferredSalaryMin] = useState<string>(preferences.preferredSalaryMin?.toString() ?? "");
  const [preferredSalaryMax, setPreferredSalaryMax] = useState<string>(preferences.preferredSalaryMax?.toString() ?? "");
  const [preferredLocation, setPreferredLocation] = useState<string>(preferences.preferredLocation ?? "");
  const [preferredRemote, setPreferredRemote] = useState<string>(preferences.preferredRemote ?? "any");
  const [preferredKeywords, setPreferredKeywords] = useState<string>(preferences.preferredKeywords.join(", "));
  
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      const keywordsArray = preferredKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      await setUserPreferences({
        data: {
          showGlobalJobs,
          preferredSalaryMin: preferredSalaryMin ? Number(preferredSalaryMin) : null,
          preferredSalaryMax: preferredSalaryMax ? Number(preferredSalaryMax) : null,
          preferredLocation: preferredLocation.trim() || null,
          preferredRemote: preferredRemote,
          preferredKeywords: keywordsArray,
        },
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="spx-page-narrow spx-stack">
      <PageHero
        eyebrow="Candidate Profile"
        icon={<FileUser className="h-3.5 w-3.5" />}
        title="My Profile"
        description="Upload or refine your master resume. Caliber uses this profile across analyses, resume generation, and cover letter generation."
      />
      
      <PageSection
        title="Master Resume"
        description="Keep one high-quality source resume here so analysis and document generation stay grounded in the same profile."
      >
        <ResumeManagerV2 initial={resume} />
      </PageSection>

      <PageSection
        title="Job Search Preferences"
        description="Set your preference constraints. These guide automated search agents and candidate recommendations."
      >
        <form onSubmit={handleSave} className="space-y-6 bg-white/70 backdrop-blur-md rounded-2xl border border-slate-100 p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Preferred Location
              </label>
              <Input
                type="text"
                placeholder="e.g. San Francisco, CA or Remote"
                value={preferredLocation}
                onChange={(e) => setPreferredLocation(e.target.value)}
                className="w-full"
              />
            </div>
            
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Remote Preference
              </label>
              <select
                value={preferredRemote}
                onChange={(e) => setPreferredRemote(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="any">No Preference (Any)</option>
                <option value="remote">Remote Only</option>
                <option value="hybrid">Hybrid</option>
                <option value="on-site">On-Site Only</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Min Preferred Salary (Annual USD)
              </label>
              <Input
                type="number"
                placeholder="e.g. 100000"
                value={preferredSalaryMin}
                onChange={(e) => setPreferredSalaryMin(e.target.value)}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Max Preferred Salary (Annual USD)
              </label>
              <Input
                type="number"
                placeholder="e.g. 180000"
                value={preferredSalaryMax}
                onChange={(e) => setPreferredSalaryMax(e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Keywords (Comma separated)
            </label>
            <Input
              type="text"
              placeholder="e.g. React, TypeScript, GraphQL, Engineer"
              value={preferredKeywords}
              onChange={(e) => setPreferredKeywords(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3 text-sm cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={showGlobalJobs}
                disabled={saving}
                onChange={(e) => setShowGlobalJobs(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="font-medium text-slate-800">Show jobs from all user searches</p>
                <p className="text-xs text-slate-500">When enabled, your pipeline also includes global catalog jobs discovered by other users' search agents.</p>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {saveSuccess && (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 animate-fade-in">
                <Check className="h-4 w-4" /> Preferences saved!
              </span>
            )}
            <Button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 text-white hover:bg-indigo-700 font-semibold px-6 min-w-[120px]"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save Preferences"
              )}
            </Button>
          </div>
        </form>
      </PageSection>
    </div>
  );
}

function ProfileLoading() {
  return (
    <div className="spx-page-narrow space-y-4 animate-pulse">
      <div className="spx-glass-card h-10 w-48 rounded-xl bg-white/70" />
      <div className="spx-glass-card h-96 w-full rounded-[1.6rem] bg-white/70" />
    </div>
  );
}
