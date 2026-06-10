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

async function requireAdmin(request?: Request) {
  const user = await resolveSessionUser(request);
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
  return user;
}

export const getLinkedinAdminSettings = createServerFn({ method: "GET" }).handler(async (_, { request }) => {
  await requireAdmin(request);
  return getLinkedinSettings();
});

export const updateLinkedinAdminSettings = createServerFn({ method: "POST" })
  .inputValidator((data: Partial<LinkedinAppSettings>) => data)
  .handler(async ({ data }, { request }) => {
    await requireAdmin(request);
    return saveLinkedinSettings(data);
  });

export const runLinkedinSemanticDedupe = createServerFn({ method: "POST" }).handler(async (_, { request }) => {
  await requireAdmin(request);
  const exactUrlDeletedCount = await pruneDuplicateLinkedinJobResults();
  const semanticDeletedCount = await pruneSemanticDuplicateLinkedinJobResults();
  return {
    deletedCount: exactUrlDeletedCount + semanticDeletedCount,
    exactUrlDeletedCount,
    semanticDeletedCount,
  };
});
