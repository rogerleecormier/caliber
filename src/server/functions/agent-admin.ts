'use server';
import { createServerFn } from "@tanstack/react-start";
import {
  getAgentSettings,
  saveAgentSettings,
  type AgentAppSettings,
} from "@/lib/normalized-jobs-persistence";
import { resolveSessionUser } from "@/lib/resolve-user";

async function requireAdmin(ctx?: any) {
  const user = await resolveSessionUser(ctx?.request);
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
  return user;
}

export const getAgentAdminSettings = createServerFn({ method: "GET" }).handler(async (ctx: any) => {
  await requireAdmin(ctx);
  return getAgentSettings();
});

export const updateAgentAdminSettings = createServerFn({ method: "POST" })
  .inputValidator((data: Partial<AgentAppSettings>) => data)
  .handler(async (ctx: any) => { const { data } = ctx;
    await requireAdmin(ctx);
    return saveAgentSettings(data);
  });
