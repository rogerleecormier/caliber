'use server';
import { createServerFn } from "@tanstack/react-start";
import {
  getLinkedinSettings,
  pruneDuplicateLinkedinJobResults,
  pruneSemanticDuplicateLinkedinJobResults,
  saveLinkedinSettings,
  type LinkedinAppSettings,
} from "@/lib/linkedin-persistence";
import { resolveSessionUser } from "@/lib/resolve-user";

async function requireAdmin(ctx?: any) {
  const user = await resolveSessionUser(ctx?.request);
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
  return user;
}

export const getLinkedinAdminSettings = createServerFn({ method: "GET" }).handler(async (_data, ctx) => {
  await requireAdmin(ctx);
  return getLinkedinSettings();
});

export const updateLinkedinAdminSettings = createServerFn({ method: "POST" })
  .inputValidator((data: Partial<LinkedinAppSettings>) => data)
  .handler(async ({ data }, ctx) => {
    await requireAdmin(ctx);
    return saveLinkedinSettings(data);
  });

export const runLinkedinSemanticDedupe = createServerFn({ method: "POST" }).handler(async (_data, ctx) => {
  await requireAdmin(ctx);
  const exactUrlDeletedCount = await pruneDuplicateLinkedinJobResults();
  const semanticDeletedCount = await pruneSemanticDuplicateLinkedinJobResults();
  return {
    deletedCount: exactUrlDeletedCount + semanticDeletedCount,
    exactUrlDeletedCount,
    semanticDeletedCount,
  };
});
