import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { promoteToAdmin } from "@/server/functions/auth";

export const Route = createFileRoute("/admin-setup")({
  component: AdminSetup,
});

function AdminSetup() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const result = await promoteToAdmin({ email, token });
      setMessage(`✓ User ${email} promoted to admin`);
      setEmail("");
      setToken("");
    } catch (err) {
      setMessage(`✗ ${err instanceof Error ? err.message : "Failed to promote user"}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Admin Setup</h1>
          <p className="text-muted-foreground">Promote a user to admin</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Admin Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Enter admin token"
            />
          </div>

          {message && (
            <div className={`rounded-lg p-3 text-sm ${message.startsWith("✓") ? "bg-green-500/10 text-green-700" : "bg-destructive/10 text-destructive"}`}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Promoting..." : "Promote to Admin"}
          </button>
        </form>
      </div>
    </div>
  );
}
