import { redirect } from "@tanstack/react-router";

export function requireLoginRedirect() {
  throw redirect({ to: "/login" });
}
