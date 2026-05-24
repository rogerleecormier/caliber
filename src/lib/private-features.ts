import { redirect } from "@tanstack/react-router";
import type { SessionUser } from "./cloudflare";

export function canAccessLinkedInSearch(user?: SessionUser | null): boolean {
  return user?.role === "admin";
}

export function requireLinkedInSearchOwner(user?: SessionUser | null) {
  if (!canAccessLinkedInSearch(user)) {
    throw redirect({ to: "/jobs" });
  }
}
