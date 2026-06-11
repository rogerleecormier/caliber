import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { getResume } from "@/server/functions/manage-resume";
import { getShowGlobalJobs, setShowGlobalJobs } from "@/server/functions/user-preferences";
import { FileUser } from "lucide-react";
import { ResumeManagerV2 } from "@/components/features/resume-manager-v2";
import { PageHero, PageSection } from "@caliber/ui-kit";

export const Route = createFileRoute("/profile")({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: string } | null };
    if (!ctx.user) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const [resume, preferences] = await Promise.all([getResume(), getShowGlobalJobs()]);
    return { resume, preferences };
  },
  component: ProfilePage,
  pendingComponent: ProfileLoading,
});

function ProfilePage() {
  const { resume, preferences } = Route.useLoaderData();
  const [showGlobalJobs, setShowGlobalJobsState] = useState(preferences.showGlobalJobs);
  const [saving, setSaving] = useState(false);

  async function handleToggle(checked: boolean) {
    setShowGlobalJobsState(checked);
    setSaving(true);
    try {
      await setShowGlobalJobs({ data: { showGlobalJobs: checked } });
    } catch {
      setShowGlobalJobsState(!checked);
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
        description="Control which jobs appear in your pipeline."
      >
        <label className="flex items-center gap-3 rounded-lg border border-input bg-background px-4 py-3 text-sm shadow-sm cursor-pointer hover:bg-muted/30">
          <input
            type="checkbox"
            checked={showGlobalJobs}
            disabled={saving}
            onChange={(e) => handleToggle(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <div>
            <p className="font-medium">Show jobs from all user searches</p>
            <p className="text-xs text-muted-foreground">When enabled, your pipeline also includes global catalog jobs discovered by other users' search agents.</p>
          </div>
        </label>
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
