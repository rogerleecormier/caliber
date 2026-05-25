import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listUsers, createUser, deleteUser } from "@/server/functions/admin";
import {
  getLinkedinAdminSettings,
  runLinkedinSemanticDedupe,
  updateLinkedinAdminSettings,
} from "@/server/functions/linkedin-admin";
import { PageHero, PageSection } from "@caliber/ui-kit";
import { Clock, Shield, Trash2 } from "lucide-react";

type AdminUser = { id: string; email: string; role: string; createdAt: string };
type LinkedinSettings = Awaited<ReturnType<typeof getLinkedinAdminSettings>>;

export const Route = createFileRoute("/admin")({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: string; role: string } | null };
    if (!ctx.user) throw redirect({ to: "/login" });
    if (ctx.user.role !== "admin") throw redirect({ to: "/" });
  },
  component: AdminPage,
});

function AdminPage() {
  const [userList, setUserList] = useState<AdminUser[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [settings, setSettings] = useState<LinkedinSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [runningLinkedinDedupe, setRunningLinkedinDedupe] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  async function fetchUsers() {
    setSuccessMessage("");
    setLoadingUsers(true);
    try {
      setUserList(await listUsers({}));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
      setUserList([]);
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => {
    getLinkedinAdminSettings({})
      .then(setSettings)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings"));
  }, []);

  async function handleAddUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setLoading(true);
    try {
      await createUser({ data: { email, password } });
      setEmail(""); setPassword("");
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add user");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!window.confirm("Delete this user and all their data?")) return;
    setError("");
    setSuccessMessage("");
    try {
      await deleteUser({ data: { userId } });
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  }

  async function handleSaveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!settings) return;
    setSavingSettings(true);
    setError("");
    setSuccessMessage("");
    try {
      const next = await updateLinkedinAdminSettings({
        data: settings,
      });
      setSettings(next);
      setSuccessMessage("LinkedIn settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleRunLinkedinDedupe() {
    if (!window.confirm("Run LinkedIn dedupe now? This will permanently remove older duplicate job rows.")) {
      return;
    }

    setRunningLinkedinDedupe(true);
    setError("");
    setSuccessMessage("");
    try {
      const result = await runLinkedinSemanticDedupe({});
      setSuccessMessage(
        result.deletedCount > 0
          ? `LinkedIn dedupe complete. Removed ${result.deletedCount} duplicate jobs (${result.exactUrlDeletedCount} exact URL matches, ${result.semanticDeletedCount} semantic matches).`
          : "LinkedIn dedupe complete. No duplicate jobs were found.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run LinkedIn dedupe");
    } finally {
      setRunningLinkedinDedupe(false);
    }
  }

  return (
    <div className="spx-page space-y-8">
      <PageHero
        eyebrow="Admin"
        icon={<Shield className="h-3.5 w-3.5" />}
        title="User Management"
        description="Manage jobs-app access, create accounts, and remove users when needed."
      />

      <PageSection
        title="Create User"
        description="Add a new user to the jobs application with an initial password."
      >
        <form onSubmit={handleAddUser} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add User"}
          </button>
        </form>
        {loadingUsers && <p className="mt-4 text-sm text-muted-foreground">Loading users...</p>}
      </PageSection>

      <PageSection
        title="Current Users"
        description="Accounts with access to the jobs workspace."
        className="overflow-hidden p-0"
        contentClassName=""
      >
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">Role</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {userList.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No users yet
                </td>
              </tr>
            ) : (
              userList.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3 capitalize">{u.role}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : ""}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDeleteUser(u.id)}
                      className="inline-flex items-center gap-1 text-sm text-destructive hover:underline"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </PageSection>

      <PageSection
        title="LinkedIn Cron Schedule"
        description="Control how frequently saved searches run and add randomized variance to avoid predictable request patterns."
      >
        {!settings ? (
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        ) : (
          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Run Frequency</span>
                <p className="text-xs text-muted-foreground">How often each saved search is eligible to run.</p>
                <select
                  value={settings.linkedinSearchCronFrequency}
                  onChange={(e) => setSettings({ ...settings, linkedinSearchCronFrequency: e.target.value as LinkedinSettings["linkedinSearchCronFrequency"] })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="hourly">Every Hour</option>
                  <option value="every_2_hours">Every 2 Hours</option>
                  <option value="every_4_hours">Every 4 Hours</option>
                  <option value="every_8_hours">Every 8 Hours</option>
                  <option value="every_12_hours">Every 12 Hours</option>
                  <option value="daily">Daily (24 Hours)</option>
                </select>
              </label>

              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Start Hour (UTC)</span>
                <p className="text-xs text-muted-foreground">Anchor hour for daily/12h schedules. 0–23.</p>
                <select
                  value={settings.linkedinCronStartHour}
                  onChange={(e) => setSettings({ ...settings, linkedinCronStartHour: Number(e.target.value) })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {h.toString().padStart(2, "0")}:00 UTC{h >= 4 && h <= 20 ? ` (${h - 4}:00 ET)` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Variance Window (minutes)</span>
                <p className="text-xs text-muted-foreground">Max random offset subtracted from the interval to avoid fixed timing patterns.</p>
                <select
                  value={settings.linkedinCronVarianceMinutes}
                  onChange={(e) => setSettings({ ...settings, linkedinCronVarianceMinutes: Number(e.target.value) })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value={0}>None (exact interval)</option>
                  <option value={5}>±5 minutes</option>
                  <option value={10}>±10 minutes</option>
                  <option value={20}>±20 minutes</option>
                  <option value={30}>±30 minutes</option>
                  <option value={45}>±45 minutes</option>
                  <option value={59}>±59 minutes</option>
                </select>
              </label>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">How variance works</p>
                  <p className="text-xs">
                    On each cron tick, a random number of minutes (0–{settings.linkedinCronVarianceMinutes}) is subtracted from the interval threshold before checking whether a search is due. This means searches may run slightly earlier than the exact interval, making timing less predictable to LinkedIn's bot detection.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={savingSettings}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {savingSettings ? "Saving..." : "Save Cron Settings"}
              </button>
            </div>
          </form>
        )}
      </PageSection>

      <PageSection
        title="LinkedIn General Settings"
        description="Control job retention, deduplication, and visibility across users."
      >
        {!settings ? (
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        ) : (
          <form onSubmit={handleSaveSettings} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Retention Days</span>
                <p className="text-xs text-muted-foreground">Job results older than this are pruned.</p>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={settings.linkedinRetentionDays}
                  onChange={(e) => setSettings({ ...settings, linkedinRetentionDays: Number(e.target.value || 14) })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </label>

              <div className="space-y-3 sm:col-span-2 xl:col-span-2">
                <label className="flex items-center gap-3 rounded-lg border border-input bg-background px-4 py-3 text-sm shadow-sm cursor-pointer hover:bg-muted/30">
                  <input
                    type="checkbox"
                    checked={settings.linkedinAutoPrune}
                    onChange={(e) => setSettings({ ...settings, linkedinAutoPrune: e.target.checked })}
                    className="h-4 w-4 rounded"
                  />
                  <div>
                    <p className="font-medium">Enable Auto Prune</p>
                    <p className="text-xs text-muted-foreground">Automatically remove expired job results on each cron run.</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-lg border border-input bg-background px-4 py-3 text-sm shadow-sm cursor-pointer hover:bg-muted/30">
                  <input
                    type="checkbox"
                    checked={settings.linkedinAllowAllUsersView}
                    onChange={(e) => setSettings({ ...settings, linkedinAllowAllUsersView: e.target.checked })}
                    className="h-4 w-4 rounded"
                  />
                  <div>
                    <p className="font-medium">Allow All Users To View Shared History</p>
                    <p className="text-xs text-muted-foreground">When enabled, all users can browse each other's saved search results.</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={savingSettings}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {savingSettings ? "Saving..." : "Save General Settings"}
              </button>
              <button
                type="button"
                onClick={handleRunLinkedinDedupe}
                disabled={runningLinkedinDedupe}
                className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
              >
                {runningLinkedinDedupe ? "Running Dedupe..." : "Run LinkedIn Dedupe Now"}
              </button>
            </div>
          </form>
        )}
      </PageSection>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {successMessage && <p className="text-sm text-emerald-700">{successMessage}</p>}
    </div>
  );
}
