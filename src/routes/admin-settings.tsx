import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listUsers, createUser, deleteUser } from "@/server/functions/admin";
import {
  getAgentAdminSettings,
  updateAgentAdminSettings,
} from "@/server/functions/agent-admin";
import {
  PageHero,
  PageSection,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
} from "@caliber/ui-kit";
import { Shield, Trash2 } from "lucide-react";

type AdminUser = { id: string; email: string; role: string | null; createdAt: string | Date };
type AgentSettings = Awaited<ReturnType<typeof getAgentAdminSettings>>;

export const Route = createFileRoute("/admin-settings")({
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
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
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
    getAgentAdminSettings({})
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
      const next = await updateAgentAdminSettings({
        data: settings,
      });
      setSettings(next);
      setSuccessMessage("Agent settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div className="spx-page space-y-8">
      <PageHero
        eyebrow="Admin"
        icon={<Shield className="h-3.5 w-3.5" />}
        title="Admin Settings"
        description="Manage jobs-app access, create accounts, and remove users when needed."
      />

      <PageSection
        title="Create User"
        description="Add a new user to the jobs application with an initial password."
      >
        <form onSubmit={handleAddUser} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
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
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow className="border-b border-slate-200 hover:bg-transparent">
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {userList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center text-sm text-slate-400">
                  {loadingUsers ? "Loading users…" : "No users yet"}
                </TableCell>
              </TableRow>
            ) : (
              userList.map((u) => (
                <TableRow key={u.id} className="h-10">
                  <TableCell className="font-medium text-slate-800">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"} className={u.role === "admin" ? "bg-orange-600 text-white" : ""}>
                      {u.role ?? "user"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-500 text-xs">{u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : ""}</TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(u.id)}
                      className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </PageSection>

      <PageSection
        title="Search Agent General Settings"
        description="Control job retention and visibility across users."
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
                    <p className="text-xs text-muted-foreground">When enabled, all users can browse each other's search agent results.</p>
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
            </div>
          </form>
        )}
      </PageSection>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {successMessage && <p className="text-sm text-emerald-700">{successMessage}</p>}
    </div>
  );
}
