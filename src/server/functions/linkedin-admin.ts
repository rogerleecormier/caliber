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

async function requireAdmin() {
  const user = await resolveSessionUser();
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
  return user;
}

export const getLinkedinAdminSettings = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return getLinkedinSettings();
});

export const updateLinkedinAdminSettings = createServerFn({ method: "POST" })
  .inputValidator((data: Partial<LinkedinAppSettings>) => data)
  .handler(async ({ data }) => {
    await requireAdmin();
    return saveLinkedinSettings(data);
  });

export const runLinkedinSemanticDedupe = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const exactUrlDeletedCount = await pruneDuplicateLinkedinJobResults();
  const semanticDeletedCount = await pruneSemanticDuplicateLinkedinJobResults();
  return {
    deletedCount: exactUrlDeletedCount + semanticDeletedCount,
    exactUrlDeletedCount,
    semanticDeletedCount,
  };
});
