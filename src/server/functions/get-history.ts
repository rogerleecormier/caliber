'use server';
import { createServerFn } from "@tanstack/react-start";
import { desc, eq, and, sql } from "drizzle-orm";
import { getCloudflareEnv } from "@/lib/cloudflare";
import type { CloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { pipelineJobs, generatedDocuments } from "@/db/schema";
import { resolveSessionUser } from "@/lib/resolve-user";
import { aggregateAnalytics } from "@/server/cron/aggregate-analytics";
import {
  type PipelineStatus,
  normalizePipelineStatus,
} from "@/lib/pipeline-constants";
import { type PipelineCounts, EMPTY_PIPELINE_COUNTS, STATUS_TO_KEY } from "@/lib/pipeline-constants";

export interface HistoryRow {
  id: number;
  createdAt: string;
  jobTitle: string;
  company: string;
  matchScore: number;
  jobUrl: string;
  pursue: boolean;
  applied: boolean;
  applicationStatus: PipelineStatus | null;
  appliedAt: string | null;
  documents: Array<{ id: number; docType: string; r2Key: string; fileName: string }>;
}

export interface HistoryPipelineCounts extends PipelineCounts {}

const emptyPipelineCounts: HistoryPipelineCounts = { ...EMPTY_PIPELINE_COUNTS };

export const getHistory = createServerFn({ method: "GET" })
  .inputValidator((data: { page?: number; pageSize?: number; query?: string }) => data)
  .handler(async ({ data }): Promise<{ rows: HistoryRow[]; total: number; totalApplied: number; totalPursued: number; totalDocuments: number; pipelineCounts: HistoryPipelineCounts }> => {
    try {
      const env = getCloudflareEnv();
      if (!env.DB) return { rows: [], total: 0, totalApplied: 0, totalPursued: 0, totalDocuments: 0, pipelineCounts: emptyPipelineCounts };

      const user = await resolveSessionUser();
      if (!user) return { rows: [], total: 0, totalApplied: 0, totalPursued: 0, totalDocuments: 0, pipelineCounts: emptyPipelineCounts };

      const db = getDb(env.DB);
      const page = data.page ?? 1;
      const pageSize = data.pageSize ?? 20;
      const offset = (page - 1) * pageSize;
      const query = data.query?.trim().toLowerCase() ?? "";

      // Only show analyzed+ jobs in history (not Discovered)
      const baseConditions = [
        eq(pipelineJobs.userId, user.id),
        sql`${pipelineJobs.status} != 'Discovered'`,
      ];

      if (query) {
        baseConditions.push(
          sql`(lower(coalesce(${pipelineJobs.title}, '')) LIKE ${'%' + query + '%'} OR lower(coalesce(${pipelineJobs.company}, '')) LIKE ${'%' + query + '%'})`,
        );
      }

      const whereClause = and(...baseConditions);

      const analyses = await db
        .select()
        .from(pipelineJobs)
        .where(whereClause)
        .orderBy(desc(pipelineJobs.analyzedAt), desc(pipelineJobs.createdAt))
        .limit(pageSize)
        .offset(offset);

      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(pipelineJobs)
        .where(whereClause);

      const [appliedRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(pipelineJobs)
        .where(and(
          eq(pipelineJobs.userId, user.id),
          sql`${pipelineJobs.status} IN ('Applied', 'Interviewed', 'Hired')`,
        ));

      const [pursuedRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(pipelineJobs)
        .where(and(
          eq(pipelineJobs.userId, user.id),
          eq(pipelineJobs.pursue, 1),
        ));

      const [docCountRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(generatedDocuments)
        .where(sql`${generatedDocuments.pipelineJobId} IN (SELECT id FROM pipeline_jobs WHERE user_id = ${user.id})`);

      // Pipeline counts
      const statusRows = await db
        .select({
          status: pipelineJobs.status,
          count: sql<number>`count(*)`,
        })
        .from(pipelineJobs)
        .where(and(
          eq(pipelineJobs.userId, user.id),
          sql`${pipelineJobs.status} != 'Discovered'`,
        ))
        .groupBy(pipelineJobs.status);

      const pipelineCounts = { ...EMPTY_PIPELINE_COUNTS };
      for (const row of statusRows) {
        const status = normalizePipelineStatus(row.status);
        const key = STATUS_TO_KEY[status];
        if (key) pipelineCounts[key] = (pipelineCounts[key] ?? 0) + Number(row.count ?? 0);
      }

      const rows: HistoryRow[] = await Promise.all(
        analyses.map(async (a) => {
          // Fetch documents for this pipeline job
          const docs = await db
            .select({
              id: generatedDocuments.id,
              docType: generatedDocuments.docType,
              r2Key: generatedDocuments.r2Key,
              fileName: generatedDocuments.fileName,
            })
            .from(generatedDocuments)
            .where(eq(generatedDocuments.pipelineJobId, a.id))
            .orderBy(desc(generatedDocuments.id));

          const status = normalizePipelineStatus(a.status);
          const isApplied = ['Applied', 'Interviewed', 'Hired'].includes(status);

          return {
            id: a.id,
            createdAt: a.analyzedAt ?? a.createdAt ?? "",
            jobTitle: a.title ?? "Untitled",
            company: a.company ?? "Unknown",
            matchScore: a.matchScore ?? 0,
            jobUrl: a.sourceUrl,
            pursue: a.pursue === 1,
            applied: isApplied,
            applicationStatus: status,
            appliedAt: null,
            documents: docs.map((d) => ({
              id: d.id,
              docType: d.docType,
              r2Key: d.r2Key,
              fileName: d.fileName ?? "",
            })),
          };
        }),
      );

      return {
        rows,
        total: Number(countRow?.count ?? 0),
        totalApplied: Number(appliedRow?.count ?? 0),
        totalPursued: Number(pursuedRow?.count ?? 0),
        totalDocuments: Number(docCountRow?.count ?? 0),
        pipelineCounts,
      };
    } catch (error) {
      console.error("[getHistory] error:", error);
      return { rows: [], total: 0, totalApplied: 0, totalPursued: 0, totalDocuments: 0, pipelineCounts: emptyPipelineCounts };
    }
  });

export const getDocumentDownload = createServerFn({ method: "GET" })
  .inputValidator((data: { r2Key: string }) => data)
  .handler(async ({ data }) => {
    const env = getCloudflareEnv();
    if (!env.R2) throw new Error("R2 storage not available");

    const object = await env.R2.get(data.r2Key);
    if (!object) throw new Error("Document not found");

    const bytes = await object.arrayBuffer();
    return {
      data: Array.from(new Uint8Array(bytes)),
      contentType: object.httpMetadata?.contentType ?? "application/pdf",
      fileName: object.customMetadata?.fileName ?? data.r2Key.split("/").pop() ?? "document.pdf",
    };
  });

export const getDocumentsForAnalysis = createServerFn({ method: "GET" })
  .inputValidator((data: { analysisId: number }) => data)
  .handler(async ({ data }) => {
    const env = getCloudflareEnv();
    if (!env.DB) return { resume: null, coverLetter: null };

    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");

    const db = getDb(env.DB);

    // Check both legacy job_analysis_id and new pipeline_job_id, newest first
    const docs = await db
      .select()
      .from(generatedDocuments)
      .where(sql`${generatedDocuments.pipelineJobId} = ${data.analysisId} OR ${generatedDocuments.jobAnalysisId} = ${data.analysisId}`)
      .orderBy(desc(generatedDocuments.id));

    const resume = docs.find((d) => d.docType === "resume");
    const coverLetter = docs.find((d) => d.docType === "cover_letter");

    return {
      resume: resume ? { documentId: resume.id, fileName: resume.fileName, r2Key: resume.r2Key } : null,
      coverLetter: coverLetter ? { documentId: coverLetter.id, fileName: coverLetter.fileName, r2Key: coverLetter.r2Key } : null,
    };
  });

export const deleteHistoryItem = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const env = getCloudflareEnv();
    if (!env.DB) throw new Error("Database not available");

    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");

    const db = getDb(env.DB);
    const [job] = await db
      .select()
      .from(pipelineJobs)
      .where(and(eq(pipelineJobs.id, data.id), eq(pipelineJobs.userId, user.id)))
      .limit(1);

    if (!job) throw new Error("Job not found or not authorized");

    const docs = await db
      .select()
      .from(generatedDocuments)
      .where(eq(generatedDocuments.pipelineJobId, job.id));

    if (env.R2) {
      await Promise.all(
        docs.map(async (doc) => {
          try { await env.R2!.delete(doc.r2Key); } catch (e) {
            console.error("[deleteHistoryItem] R2 delete error:", e);
          }
        }),
      );
    }

    await db.delete(generatedDocuments).where(eq(generatedDocuments.pipelineJobId, job.id));
    await db.delete(pipelineJobs).where(and(eq(pipelineJobs.id, job.id), eq(pipelineJobs.userId, user.id)));

    aggregateAnalytics(env as CloudflareEnv, user.id).catch((e) =>
      console.error("[deleteHistoryItem] aggregateAnalytics error:", e),
    );

    return { ok: true, id: job.id };
  });
