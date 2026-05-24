/**
 * Job Cleanup Script
 * Removes jobs that aren't truly remote or are low quality
 */

import { schema } from "../db/db";
import { getD1Database } from "@caliber/shared-utils";
import { drizzle } from "drizzle-orm/d1";
import { sql, or, like, and, eq, lt } from "drizzle-orm";

// Parse command line arguments
const args = process.argv.slice(2);
const sourceArg = args.find((arg) => arg.startsWith("--source="));
const targetSource = sourceArg ? sourceArg.split("=")[1] : null;

async function cleanupJobs() {
  const d1 = await getD1Database();
  const db = drizzle(d1, { schema });

  console.log("━".repeat(50));
  console.log("🧹 Job Cleanup Script");
  if (targetSource) {
    console.log(`🎯 Target Source: ${targetSource}`);
  }
  console.log("━".repeat(50));
  console.log();

  let totalRemoved = 0;

  // Helper to add source filter
  const withSourceFilter = (conditions: any) => {
    if (targetSource) {
      return and(conditions, eq(schema.jobs.sourceName, targetSource));
    }
    return conditions;
  };

  // 1. Remove jobs with location restrictions (not truly remote)
  console.log("1️⃣  Removing location-restricted jobs...");
  const locationKeywords = [
    "%US only%",
    "%USA only%",
    "%United States only%",
    "%Canada only%",
    "%UK only%",
    "%Europe only%",
    "%EU only%",
    "%EMEA only%",
    "%Americas only%",
    "%APAC only%",
    "%must be located in%",
    "%must be based in%",
    "%residents only%",
    "%citizens only%",
    "%work authorization required%",
    "%visa sponsorship not available%",
  ];

  const locationRestricted = await db
    .delete(schema.jobs)
    .where(
      withSourceFilter(
        or(
          ...locationKeywords.map((keyword) =>
            or(
              like(schema.jobs.description, keyword),
              like(schema.jobs.title, keyword)
            )
          )
        )
      )
    )
    .returning({ id: schema.jobs.id });

  console.log(
    `   Removed ${locationRestricted.length} location-restricted jobs`
  );
  totalRemoved += locationRestricted.length;

  // 2. Remove jobs that require office presence
  console.log("\n2️⃣  Removing hybrid/office-required jobs...");
  const officeKeywords = [
    "%hybrid%",
    "%in-office%",
    "%on-site%",
    "%onsite%",
    "%office required%",
    "%must work from office%",
    "%days per week in office%",
    "%% remote%", // e.g., "50% remote" means 50% office
  ];

  const officeRequired = await db
    .delete(schema.jobs)
    .where(
      withSourceFilter(
        or(
          ...officeKeywords.map((keyword) =>
            or(
              like(schema.jobs.description, keyword),
              like(schema.jobs.title, keyword)
            )
          )
        )
      )
    )
    .returning({ id: schema.jobs.id });

  console.log(
    `   Removed ${officeRequired.length} hybrid/office-required jobs`
  );
  totalRemoved += officeRequired.length;

  // 3. Remove jobs with missing critical information
  console.log("\n3️⃣  Removing jobs with missing information...");
  const missingInfo = await db
    .delete(schema.jobs)
    .where(
      withSourceFilter(
        or(
          sql`${schema.jobs.title} IS NULL`,
          sql`${schema.jobs.title} = ''`,
          sql`${schema.jobs.description} IS NULL`,
          sql`${schema.jobs.description} = ''`,
          sql`length(${schema.jobs.description}) < 50` // Too short to be useful
        )
      )
    )
    .returning({ id: schema.jobs.id });

  console.log(`   Removed ${missingInfo.length} jobs with missing info`);
  totalRemoved += missingInfo.length;

  // 4. Remove duplicate jobs (same title + company)
  console.log("\n4️⃣  Removing duplicate jobs...");

  // Find duplicates
  // Note: We can't easily filter the subquery by source if we want to find duplicates ACROSS sources,
  // but usually duplicates are within the same source or we want to keep one.
  // If targetSource is set, we only want to remove duplicates FROM that source.
  // So we find duplicates as usual, but only delete if the job to be deleted matches the source.

  const duplicates = await db.all<{
    id: number;
    title: string;
    company: string;
    first_posted: string;
  }>(sql`
    SELECT id, title, company, MIN(post_date) as first_posted
    FROM jobs
    GROUP BY LOWER(title), LOWER(company)
    HAVING COUNT(*) > 1
  `);

  let duplicatesRemoved = 0;
  for (const dup of duplicates) {
    // Keep the oldest posting, remove newer ones
    const removeConditions = and(
      sql`LOWER(${schema.jobs.title}) = LOWER(${dup.title})`,
      sql`LOWER(${schema.jobs.company}) = LOWER(${dup.company})`,
      sql`${schema.jobs.postDate} > ${dup.first_posted}`
    );

    const removed = await db
      .delete(schema.jobs)
      .where(withSourceFilter(removeConditions))
      .returning({ id: schema.jobs.id });

    duplicatesRemoved += removed.length;
  }

  console.log(`   Removed ${duplicatesRemoved} duplicate jobs`);
  totalRemoved += duplicatesRemoved;

  // 5. Remove old jobs (older than 90 days)
  console.log("\n5️⃣  Removing old jobs (>90 days)...");
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const oldJobs = await db
    .delete(schema.jobs)
    .where(withSourceFilter(lt(schema.jobs.postDate, ninetyDaysAgo)))
    .returning({ id: schema.jobs.id });

  console.log(`   Removed ${oldJobs.length} old jobs`);
  totalRemoved += oldJobs.length;

  // Summary
  console.log("\n" + "━".repeat(50));
  console.log("📊 Cleanup Summary");
  console.log("━".repeat(50));
  console.log(`Total jobs removed: ${totalRemoved}`);

  const remaining = await db.get<{ count: number }>(
    sql`SELECT COUNT(*) as count FROM jobs`
  );
  console.log(`Jobs remaining: ${remaining?.count ?? 0}`);
  console.log("━".repeat(50));
}

// Run cleanup
cleanupJobs()
  .then(() => {
    console.log("\n✅ Cleanup complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Cleanup failed:", error);
    process.exit(1);
  });
