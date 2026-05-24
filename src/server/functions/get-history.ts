'use server';
import { createServerFn } from "@tanstack/react-start";
import { desc, eq, and, sql } from "drizzle-orm";
import { getCloudflareEnv } from "@/lib/cloudflare";
import type { CloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { jobAnalyses, generatedDocuments } from "@/db/schema";
import { resolveSessionUser } from "@/lib/resolve-user";
import { aggregateAnalytics } from "@/server/cron/aggregate-analytics";

export interface HistoryRow {
  id: number;
  createdAt: string;
  jobTitle: string;
  company: string;
  matchScore: number;
  jobUrl: string;
  pursue: boolean;
  applied: boolean;
  applicationStatus: "Applied" | "Interviewed" | "Hired" | null;
  appliedAt: string | null;
  documents: Array<{ id: number; docType: string; r2Key: string; fileName: string }>;
}

export interface HistoryPipelineCounts {
  analyzed: number;
  prepped: number;
  applied: number;
  interviewed: number;
  hired: number;
}

const emptyPipelineCounts: HistoryPipelineCounts = {
  analyzed: 0,
  prepped: 0,
  applied: 0,
  interviewed: 0,
  hired: 0,
};

export const getHistory = createServerFn({ method: "GET" })
  .inputValidator((data: { page?: number; pageSize?: number; query?: string }) => data)
  .handler(async ({ data }): Promise<{ rows: HistoryRow[]; total: number; totalApplied: number; totalPursued: number; totalDocuments: number; pipelineCounts: HistoryPipelineCounts }> => {
    try {
      const env = getCloudflareEnv();
      if (!env.DB) return { rows: [], total: 0, totalApplied: 0, totalPursued: 0, totalDocuments: 0, pipelineCounts: emptyPipelineCounts };

      const user = await resolveSessionUser();
      if (!user) return { rows: [], total: 0, totalApplied: 0, totalPursued: 0, totalDocuments: 0, pipelineCounts: emptyPipelineCounts };

      const page = data.page ?? 1;
      const pageSize = data.pageSize ?? 20;
      const offset = (page - 1) * pageSize;
      const query = data.query?.trim().toLowerCase() ?? "";
      const searchPattern = `%${query}%`;
      let hasApplicationStatusColumn = false;
      try {
        const columnInfo = await env.DB.prepare("PRAGMA table_info(job_analyses)").all();
        hasApplicationStatusColumn = (columnInfo.results ?? []).some(
          (column: any) => column.name === "application_status",
        );
      } catch (error) {
        console.warn("[getHistory] Unable to inspect job_analyses schema; using legacy applied status.", error);
      }

      type AnalysisRecord = {
        id: number;
        createdAt: string | null;
        jobTitle: string | null;
        company: string | null;
        matchScore: number | null;
        jobUrl: string;
        pursue: number | null;
        applied: number | null;
        applicationStatus?: string | null;
        appliedAt: string | null;
      };

      const docsCte = `
        WITH doc_counts AS (
          SELECT
            job_analysis_id,
            sum(case when doc_type = 'resume' then 1 else 0 end) as resumeCount,
            sum(case when doc_type = 'cover_letter' then 1 else 0 end) as coverCount
          FROM generated_documents
          GROUP BY job_analysis_id
        )
      `;
      const appStatusExpr = hasApplicationStatusColumn ? "ja.application_status" : "NULL";
      const workflowExpr = `
        lower(
          case
            when ${appStatusExpr} = 'Hired' then 'hired'
            when ${appStatusExpr} = 'Interviewed' then 'interviewed'
            when ${appStatusExpr} = 'Applied' or ja.applied = 1 then 'applied'
            when coalesce(dc.resumeCount, 0) + coalesce(dc.coverCount, 0) > 0 then 'prepped'
            else 'analyzed'
          end
        )
      `;
      const searchClause = query
        ? ` AND (
            lower(coalesce(ja.job_title, '')) LIKE ?
            OR lower(coalesce(ja.company, '')) LIKE ?
            OR lower(coalesce(${appStatusExpr}, '')) LIKE ?
            OR ${workflowExpr} LIKE ?
          )`
        : "";
      const searchBinds = query ? [searchPattern, searchPattern, searchPattern, searchPattern] : [];

      const analysesResult = await env.DB.prepare(`
        ${docsCte}
        SELECT
          ja.id,
          ja.created_at as createdAt,
          ja.job_title as jobTitle,
          ja.company,
          ja.match_score as matchScore,
          ja.job_url as jobUrl,
          ja.pursue,
          ja.applied,
          ${hasApplicationStatusColumn ? "ja.application_status as applicationStatus," : ""}
          ja.applied_at as appliedAt
        FROM job_analyses ja
        LEFT JOIN doc_counts dc ON dc.job_analysis_id = ja.id
        WHERE ja.user_id = ?${searchClause}
        ORDER BY ja.created_at DESC
        LIMIT ? OFFSET ?
      `).bind(user.id, ...searchBinds, pageSize, offset).all<AnalysisRecord>();
      const analyses = analysesResult.results ?? [];

      const aggregates = await env.DB.prepare(`
        ${docsCte}
        SELECT
          count(*) as total,
          sum(case when ja.applied = 1 then 1 else 0 end) as totalApplied,
          sum(case when ja.pursue = 1 then 1 else 0 end) as totalPursued
        FROM job_analyses ja
        LEFT JOIN doc_counts dc ON dc.job_analysis_id = ja.id
        WHERE ja.user_id = ?${searchClause}
      `).bind(user.id, ...searchBinds).first<{ total: number; totalApplied: number | null; totalPursued: number | null }>();

      const docCountResult = await env.DB.prepare(`
        ${docsCte}
        SELECT count(*) as count
        FROM generated_documents gd
        INNER JOIN job_analyses ja ON gd.job_analysis_id = ja.id
        LEFT JOIN doc_counts dc ON dc.job_analysis_id = ja.id
        WHERE ja.user_id = ?${searchClause}
      `).bind(user.id, ...searchBinds).first<{ count: number }>();

      type PipelineRecord = {
        id: number;
        pursue: number | null;
        applied: number | null;
        applicationStatus?: string | null;
        resumeCount: number | null;
        coverCount: number | null;
      };

      const pipelineResult = await env.DB.prepare(`
        ${docsCte}
        SELECT
          ja.id,
          ja.pursue,
          ja.applied,
          ${hasApplicationStatusColumn ? "ja.application_status as applicationStatus," : ""}
          coalesce(dc.resumeCount, 0) as resumeCount,
          coalesce(dc.coverCount, 0) as coverCount
        FROM job_analyses ja
        LEFT JOIN doc_counts dc ON dc.job_analysis_id = ja.id
        WHERE ja.user_id = ?${searchClause}
      `).bind(user.id, ...searchBinds).all<PipelineRecord>();
      const pipelineRows = pipelineResult.results ?? [];

      const pipelineCounts = pipelineRows.reduce<HistoryPipelineCounts>((counts, row) => {
        const hasResume = Number(row.resumeCount ?? 0) > 0;
        const hasCover = Number(row.coverCount ?? 0) > 0;
        const applicationStatus = "applicationStatus" in row ? row.applicationStatus : null;
        if (applicationStatus === "Hired") counts.hired += 1;
        else if (applicationStatus === "Interviewed") counts.interviewed += 1;
        else if (applicationStatus === "Applied" || row.applied === 1) counts.applied += 1;
        else if (hasResume || hasCover) counts.prepped += 1;
        else counts.analyzed += 1;
        return counts;
      }, { ...emptyPipelineCounts });

      const rows: HistoryRow[] = await Promise.all(
        analyses.map(async (a) => {
          const docsResult = await env.DB.prepare(`
            SELECT
              id,
              doc_type as docType,
              r2_key as r2Key,
              file_name as fileName
            FROM generated_documents
            WHERE job_analysis_id = ?
            ORDER BY id DESC
          `).bind(a.id).all<{ id: number; docType: string; r2Key: string; fileName: string | null }>();
          const docs = docsResult.results ?? [];

          return {
            id: a.id,
            createdAt: a.createdAt ?? "",
            jobTitle: a.jobTitle ?? "Untitled",
            company: a.company ?? "Unknown",
            matchScore: a.matchScore ?? 0,
            jobUrl: a.jobUrl,
            pursue: a.pursue === 1,
            applied: a.applied === 1,
            applicationStatus: (() => {
              const status = a.applicationStatus ?? null;
              if (status === "Applied" || status === "Interviewed" || status === "Hired") return status;
              return a.applied === 1 ? "Applied" : null;
            })(),
            appliedAt: a.appliedAt ?? null,
            documents: docs.map((d: any) => ({
              id: d.id,
              docType: d.docType ?? d.doc_type,
              r2Key: d.r2Key ?? d.r2_key,
              fileName: d.fileName ?? d.file_name ?? "",
            })),
          };
        }),
      );

      return {
        rows,
        total: Number(aggregates?.total ?? 0),
        totalApplied: Number(aggregates?.totalApplied ?? 0),
        totalPursued: Number(aggregates?.totalPursued ?? 0),
        totalDocuments: Number(docCountResult?.count ?? 0),
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
    const docs = await db
      .select()
      .from(generatedDocuments)
      .where(eq(generatedDocuments.jobAnalysisId, data.analysisId));

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
    const [analysis] = await db
      .select()
      .from(jobAnalyses)
      .where(and(eq(jobAnalyses.id, data.id), eq(jobAnalyses.userId, user.id)))
      .limit(1);

    if (!analysis) throw new Error("Analysis not found or not authorized");

    const docs = await db
      .select()
      .from(generatedDocuments)
      .where(eq(generatedDocuments.jobAnalysisId, analysis.id));

    if (env.R2) {
      await Promise.all(
        docs.map(async (doc) => {
          try { await env.R2!.delete(doc.r2Key); } catch (e) {
            console.error("[deleteHistoryItem] R2 delete error:", e);
          }
        }),
      );
    }

    await db.delete(generatedDocuments).where(eq(generatedDocuments.jobAnalysisId, analysis.id));
    await db.delete(jobAnalyses).where(and(eq(jobAnalyses.id, analysis.id), eq(jobAnalyses.userId, user.id)));

    aggregateAnalytics(env as CloudflareEnv, user.id).catch((e) =>
      console.error("[deleteHistoryItem] aggregateAnalytics error:", e),
    );

    return { ok: true, id: analysis.id };
  });
