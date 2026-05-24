import { createFileRoute, redirect } from "@tanstack/react-router";
import { getResume } from "@/server/functions/manage-resume";
import { FileUser } from "lucide-react";
import { ResumeManager } from "@/components/features/resume-manager";
import { PageHero, PageSection } from "@spearyx/ui-kit";

export const Route = createFileRoute("/profile")({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: number } | null };
    if (!ctx.user) throw redirect({ to: "/login" });
  },
  loader: async () => getResume(),
  component: ProfilePage,
  pendingComponent: ProfileLoading,
});

function ProfilePage() {
  const data = Route.useLoaderData();

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
        <ResumeManager initial={data} />
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
