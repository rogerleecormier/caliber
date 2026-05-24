#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const APP_DIR = "/run/media/rogerleecormier/Storage/dev/spearyx/apps/jobs";
const SOURCE_DB = "job-analyzer-db";
const TARGET_DB = "spearyx-jobs";
const SOURCE_BUCKET = "job-analyzer-documents";
const TARGET_BUCKET = "spearyx-documents";
const MAX_SQL_CHARS = 50000;

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const skipDocuments = args.has("--skip-documents");
const pageSize = 25;

function runCommand(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    cwd: APP_DIR,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 100,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function runWranglerJson(argsList) {
  const output = runCommand("pnpm", ["exec", "wrangler", ...argsList, "--json"]);
  return JSON.parse(output);
}

function d1Query(dbName, sql) {
  return runWranglerJson(["d1", "execute", dbName, "--remote", "--command", sql]);
}

function d1Exec(dbName, sql) {
  return d1Query(dbName, sql);
}

function r2Get(objectPath, filePath) {
  runCommand("pnpm", ["exec", "wrangler", "r2", "object", "get", objectPath, "--remote", "--file", filePath]);
}

function r2Put(objectPath, filePath) {
  runCommand("pnpm", ["exec", "wrangler", "r2", "object", "put", objectPath, "--remote", "--file", filePath, "--force"]);
}

function escapeSql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function parseTimestamp(value) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function maybeJsonString(value, fallback = "[]") {
  if (isBlank(value)) return fallback;
  return value;
}

function buildAnalysisKey(row, userId) {
  return [
    userId,
    row.job_url ?? row.jobUrl ?? "",
    row.job_title ?? row.jobTitle ?? "",
    row.company ?? "",
    row.created_at ?? row.createdAt ?? "",
  ].join("||");
}

function analysisWhereClause(row, userId) {
  return [
    "(",
    `user_id = ${escapeSql(userId)}`,
    `AND job_url = ${escapeSql(row.job_url ?? row.jobUrl ?? "")}`,
    `AND job_title = ${escapeSql(row.job_title ?? row.jobTitle ?? "")}`,
    `AND company = ${escapeSql(row.company ?? "")}`,
    `AND created_at = ${escapeSql(row.created_at ?? row.createdAt ?? "")}`,
    ")",
  ].join(" ");
}

function buildAnalysisInsertTuple(analysis, targetUserId) {
  return `(
    ${[
      escapeSql(targetUserId),
      escapeSql(analysis.job_url),
      escapeSql(analysis.job_title),
      escapeSql(analysis.company),
      escapeSql(analysis.industry),
      escapeSql(analysis.location),
      escapeSql(analysis.jd_text),
      escapeSql(analysis.match_score),
      escapeSql(maybeJsonString(analysis.gap_analysis, "[]")),
      escapeSql(maybeJsonString(analysis.recommendations, "[]")),
      escapeSql(analysis.pursue),
      escapeSql(analysis.pursue_justification),
      escapeSql(maybeJsonString(analysis.keywords, "[]")),
      escapeSql(analysis.strategy_note),
      escapeSql(analysis.personal_interest),
      escapeSql(analysis.career_analysis),
      "NULL",
      escapeSql(analysis.applied ?? 0),
      escapeSql(analysis.applied_at),
      escapeSql(analysis.created_at),
    ].join(", ")}
  )`;
}

function mergeResume(existing, source) {
  if (!existing) return source;

  const sourceWins = parseTimestamp(source.updated_at) > parseTimestamp(existing.updated_at);
  const merged = { ...existing };
  const fields = [
    "full_name",
    "email",
    "phone",
    "linkedin",
    "website",
    "summary",
    "competencies",
    "tools",
    "experience",
    "education",
    "certifications",
    "raw_text",
  ];

  for (const field of fields) {
    const sourceValue = source[field];
    const targetValue = existing[field];

    if (sourceWins) {
      merged[field] = !isBlank(sourceValue) ? sourceValue : targetValue;
    } else {
      merged[field] = !isBlank(targetValue) ? targetValue : sourceValue;
    }
  }

  merged.updated_at = sourceWins
    ? (source.updated_at ?? existing.updated_at)
    : (existing.updated_at ?? source.updated_at);

  return merged;
}

function changedFields(current, next, fields) {
  return fields.some((field) => (current?.[field] ?? null) !== (next?.[field] ?? null));
}

function resultRows(result) {
  return Array.isArray(result) ? result.flatMap((entry) => entry.results ?? []) : [];
}

function lastRowId(result) {
  const last = Array.isArray(result) ? result[result.length - 1] : null;
  return last?.meta?.last_row_id ?? 0;
}

async function main() {
  console.log(isDryRun ? "Running dry-run migration from job-analyzer to spearyx..." : "Running migration from job-analyzer to spearyx...");

  const report = {
    usersInserted: 0,
    usersReused: 0,
    resumesInserted: 0,
    resumesUpdated: 0,
    analysesInserted: 0,
    analysesReused: 0,
    documentsInserted: 0,
    documentsSkipped: 0,
    documentsCopied: 0,
    analyticsInserted: 0,
    analyticsSkipped: 0,
    warnings: [],
  };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-analyzer-migration-"));

  try {
    const sourceUsers = resultRows(d1Query(SOURCE_DB, "SELECT * FROM users ORDER BY id"));
    const sourceResumes = resultRows(d1Query(SOURCE_DB, "SELECT * FROM master_resume ORDER BY id"));
    const sourceAnalytics = resultRows(d1Query(SOURCE_DB, "SELECT * FROM analytics_summary ORDER BY id"));

    const targetUsers = resultRows(d1Query(TARGET_DB, "SELECT * FROM users ORDER BY id"));
    const targetResumes = resultRows(d1Query(TARGET_DB, "SELECT * FROM master_resume ORDER BY id"));
    const targetAnalyses = resultRows(d1Query(TARGET_DB, "SELECT id, user_id, job_url, job_title, company, created_at FROM job_analyses ORDER BY id"));
    const targetDocuments = resultRows(d1Query(TARGET_DB, "SELECT id, job_analysis_id, doc_type, r2_key, file_name, created_at FROM generated_documents ORDER BY id"));
    const targetAnalytics = resultRows(d1Query(TARGET_DB, "SELECT * FROM analytics_summary ORDER BY id"));

    const targetUserByEmail = new Map(targetUsers.map((row) => [row.email.toLowerCase(), row]));
    const sourceUserIdToTargetUserId = new Map();

    for (const user of sourceUsers) {
      const email = user.email.toLowerCase();
      const existing = targetUserByEmail.get(email);
      if (existing) {
        sourceUserIdToTargetUserId.set(user.id, existing.id);
        report.usersReused += 1;
        continue;
      }

      if (isDryRun) {
        sourceUserIdToTargetUserId.set(user.id, -(user.id));
        report.usersInserted += 1;
        continue;
      }

      const insertResult = d1Exec(
        TARGET_DB,
        [
          "INSERT INTO users (email, password_hash, role, created_at)",
          `VALUES (${escapeSql(user.email)}, ${escapeSql(user.password_hash)}, ${escapeSql(user.role)}, ${escapeSql(user.created_at)});`,
        ].join(" "),
      );

      const insertedId = lastRowId(insertResult);
      sourceUserIdToTargetUserId.set(user.id, insertedId);
      targetUserByEmail.set(email, { ...user, id: insertedId });
      report.usersInserted += 1;
    }

    const targetResumeByUserId = new Map(targetResumes.map((row) => [row.user_id, row]));
    for (const resume of sourceResumes) {
      const targetUserId = sourceUserIdToTargetUserId.get(resume.user_id);
      if (!targetUserId) {
        report.warnings.push(`Skipped master_resume ${resume.id}: no mapped user for source user ${resume.user_id}`);
        continue;
      }

      const existing = targetResumeByUserId.get(targetUserId);
      const merged = mergeResume(existing ? {
        ...existing,
        full_name: existing.full_name,
      } : null, {
        ...resume,
        user_id: targetUserId,
      });

      const fields = [
        "full_name",
        "email",
        "phone",
        "linkedin",
        "website",
        "summary",
        "competencies",
        "tools",
        "experience",
        "education",
        "certifications",
        "raw_text",
        "updated_at",
      ];

      if (existing) {
        if (!changedFields(existing, merged, fields)) continue;

        if (!isDryRun) {
          d1Exec(
            TARGET_DB,
            [
              "UPDATE master_resume SET",
              `full_name = ${escapeSql(merged.full_name)},`,
              `email = ${escapeSql(merged.email)},`,
              `phone = ${escapeSql(merged.phone)},`,
              `linkedin = ${escapeSql(merged.linkedin)},`,
              `website = ${escapeSql(merged.website)},`,
              `summary = ${escapeSql(merged.summary)},`,
              `competencies = ${escapeSql(merged.competencies)},`,
              `tools = ${escapeSql(merged.tools)},`,
              `experience = ${escapeSql(merged.experience)},`,
              `education = ${escapeSql(merged.education)},`,
              `certifications = ${escapeSql(merged.certifications)},`,
              `raw_text = ${escapeSql(merged.raw_text)},`,
              `updated_at = ${escapeSql(merged.updated_at)}`,
              `WHERE id = ${existing.id};`,
            ].join(" "),
          );
        }

        targetResumeByUserId.set(targetUserId, { ...existing, ...merged });
        report.resumesUpdated += 1;
      } else {
        if (!isDryRun) {
          d1Exec(
            TARGET_DB,
            [
              "INSERT INTO master_resume (user_id, full_name, email, phone, linkedin, website, summary, competencies, tools, experience, education, certifications, raw_text, updated_at)",
              "VALUES (",
              [
                escapeSql(targetUserId),
                escapeSql(merged.full_name),
                escapeSql(merged.email),
                escapeSql(merged.phone),
                escapeSql(merged.linkedin),
                escapeSql(merged.website),
                escapeSql(merged.summary),
                escapeSql(merged.competencies),
                escapeSql(merged.tools),
                escapeSql(merged.experience),
                escapeSql(merged.education),
                escapeSql(merged.certifications),
                escapeSql(merged.raw_text),
                escapeSql(merged.updated_at),
              ].join(", "),
              ");",
            ].join(" "),
          );
        }

        targetResumeByUserId.set(targetUserId, { ...merged, id: -1 });
        report.resumesInserted += 1;
      }
    }

    const targetAnalysisByKey = new Map(targetAnalyses.map((row) => [buildAnalysisKey(row, row.user_id), row.id]));
    const sourceAnalysisIdToTargetAnalysisId = new Map();
    const sourceAnalysisCount = resultRows(d1Query(SOURCE_DB, "SELECT count(*) as count FROM job_analyses"))[0]?.count ?? 0;

    for (let offset = 0; offset < sourceAnalysisCount; offset += pageSize) {
      const rows = resultRows(d1Query(
        SOURCE_DB,
        `SELECT * FROM job_analyses ORDER BY id LIMIT ${pageSize} OFFSET ${offset}`,
      ));

      const pendingInsertBatch = [];

      for (const analysis of rows) {
        const targetUserId = sourceUserIdToTargetUserId.get(analysis.user_id);
        if (!targetUserId) {
          report.warnings.push(`Skipped job_analysis ${analysis.id}: no mapped user for source user ${analysis.user_id}`);
          continue;
        }

        const dedupeKey = buildAnalysisKey(analysis, targetUserId);
        const existingId = targetAnalysisByKey.get(dedupeKey);
        if (existingId) {
          sourceAnalysisIdToTargetAnalysisId.set(analysis.id, existingId);
          report.analysesReused += 1;
          continue;
        }

        if (isDryRun) {
          const fakeId = 1000000 + analysis.id;
          sourceAnalysisIdToTargetAnalysisId.set(analysis.id, fakeId);
          targetAnalysisByKey.set(dedupeKey, fakeId);
          report.analysesInserted += 1;
          continue;
        }

        pendingInsertBatch.push({ analysis, targetUserId, dedupeKey });
      }

      if (!pendingInsertBatch.length || isDryRun) {
        continue;
      }

      let currentChunk = [];
      let currentLength = 0;
      const chunks = [];

      for (const entry of pendingInsertBatch) {
        const tuple = buildAnalysisInsertTuple(entry.analysis, entry.targetUserId);
        if (currentChunk.length > 0 && currentLength + tuple.length > MAX_SQL_CHARS) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentLength = 0;
        }
        currentChunk.push({ ...entry, tuple });
        currentLength += tuple.length;
      }

      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }

      for (const chunk of chunks) {
        d1Exec(
          TARGET_DB,
          [
            "INSERT INTO job_analyses (user_id, job_url, job_title, company, industry, location, jd_text, match_score, gap_analysis, recommendations, pursue, pursue_justification, keywords, strategy_note, personal_interest, career_analysis, insights, applied, applied_at, created_at)",
            "VALUES",
            chunk.map((entry) => entry.tuple).join(",\n"),
            ";",
          ].join(" "),
        );

        const insertedRows = resultRows(d1Query(
          TARGET_DB,
          [
            "SELECT id, user_id, job_url, job_title, company, created_at FROM job_analyses WHERE",
            chunk.map(({ analysis, targetUserId }) => analysisWhereClause(analysis, targetUserId)).join(" OR "),
            "ORDER BY id",
          ].join(" "),
        ));

        for (const row of insertedRows) {
          targetAnalysisByKey.set(buildAnalysisKey(row, row.user_id), row.id);
        }

        for (const { analysis, dedupeKey } of chunk) {
          const insertedId = targetAnalysisByKey.get(dedupeKey);
          if (!insertedId) {
            report.warnings.push(`Failed to resolve inserted job_analysis for source id ${analysis.id}`);
            continue;
          }
          sourceAnalysisIdToTargetAnalysisId.set(analysis.id, insertedId);
          report.analysesInserted += 1;
        }
      }
    }

    const targetDocumentByKey = new Map(
      targetDocuments.map((row) => [`${row.r2_key}||${row.doc_type}||${row.created_at ?? ""}`, row.id]),
    );
    const sourceDocumentCount = resultRows(d1Query(SOURCE_DB, "SELECT count(*) as count FROM generated_documents"))[0]?.count ?? 0;

    for (let offset = 0; offset < sourceDocumentCount; offset += pageSize) {
      const rows = resultRows(d1Query(
        SOURCE_DB,
        `SELECT * FROM generated_documents ORDER BY id LIMIT ${pageSize} OFFSET ${offset}`,
      ));

      for (const doc of rows) {
        const targetAnalysisId = sourceAnalysisIdToTargetAnalysisId.get(doc.job_analysis_id);
        if (!targetAnalysisId) {
          report.warnings.push(`Skipped generated_document ${doc.id}: no mapped job_analysis for source analysis ${doc.job_analysis_id}`);
          continue;
        }

        const docKey = `${doc.r2_key}||${doc.doc_type}||${doc.created_at ?? ""}`;
        if (targetDocumentByKey.has(docKey)) {
          report.documentsSkipped += 1;
          continue;
        }

        if (!skipDocuments) {
          const tmpFile = path.join(tmpDir, `doc-${doc.id}-${path.basename(doc.r2_key)}`);

          if (!isDryRun) {
            try {
              r2Get(`${SOURCE_BUCKET}/${doc.r2_key}`, tmpFile);
              r2Put(`${TARGET_BUCKET}/${doc.r2_key}`, tmpFile);
              report.documentsCopied += 1;
            } catch (error) {
              report.warnings.push(`Failed to copy R2 object ${doc.r2_key}: ${error instanceof Error ? error.message : String(error)}`);
              continue;
            } finally {
              if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
            }
          } else {
            report.documentsCopied += 1;
          }
        }

        if (!isDryRun) {
          d1Exec(
            TARGET_DB,
            [
              "INSERT INTO generated_documents (job_analysis_id, doc_type, r2_key, file_name, resume_keywords, created_at)",
              "VALUES (",
              [
                escapeSql(targetAnalysisId),
                escapeSql(doc.doc_type),
                escapeSql(doc.r2_key),
                escapeSql(doc.file_name),
                escapeSql(doc.resume_keywords),
                escapeSql(doc.created_at),
              ].join(", "),
              ");",
            ].join(" "),
          );
        }

        targetDocumentByKey.set(docKey, -1);
        report.documentsInserted += 1;
      }
    }

    const targetAnalyticsByKey = new Map(
      targetAnalytics.map((row) => [`${row.user_id}||${row.period}`, row]),
    );
    for (const summary of sourceAnalytics) {
      const targetUserId = sourceUserIdToTargetUserId.get(summary.user_id);
      if (!targetUserId) {
        report.warnings.push(`Skipped analytics_summary ${summary.id}: no mapped user for source user ${summary.user_id}`);
        continue;
      }

      const key = `${targetUserId}||${summary.period}`;
      if (targetAnalyticsByKey.has(key)) {
        report.analyticsSkipped += 1;
        continue;
      }

      if (!isDryRun) {
        d1Exec(
          TARGET_DB,
          [
            "INSERT INTO analytics_summary (user_id, period, top_jd_keywords, top_resume_keywords, top_job_titles, top_industries, average_match_score, total_analyses, total_resumes_generated, total_applied, updated_at)",
            "VALUES (",
            [
              escapeSql(targetUserId),
              escapeSql(summary.period),
              escapeSql(summary.top_jd_keywords),
              escapeSql(summary.top_resume_keywords),
              escapeSql(summary.top_job_titles),
              escapeSql(summary.top_industries),
              escapeSql(summary.average_match_score),
              escapeSql(summary.total_analyses),
              escapeSql(summary.total_resumes_generated),
              escapeSql(summary.total_applied ?? 0),
              escapeSql(summary.updated_at),
            ].join(", "),
            ");",
          ].join(" "),
        );
      }

      report.analyticsInserted += 1;
    }

    const reportPath = path.join(APP_DIR, "migration-report.job-analyzer.json");
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

    console.log(JSON.stringify(report, null, 2));
    console.log(`Migration report written to ${reportPath}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
