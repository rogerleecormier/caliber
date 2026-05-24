import { schema } from "../db/db";
import { getD1Database } from "@caliber/shared-utils";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";

async function checkGreenhouseData() {
  const d1 = await getD1Database();
  const db = drizzle(d1, { schema });

  console.log("🔍 Checking a sample Greenhouse job...\n");

  const sampleJobs = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.sourceName, "Greenhouse"))
    .limit(3);

  if (sampleJobs.length === 0) {
    console.log("❌ No Greenhouse jobs found");
    process.exit(1);
  }

  sampleJobs.forEach((job, i) => {
    console.log(`\n📋 Sample Job ${i + 1}:`);
    console.log(`   Title: ${job.title}`);
    console.log(`   Company: ${job.company || "❌ MISSING"}`);
    console.log(`   Salary: ${job.payRange || "(not specified)"}`);
    console.log(
      `   Description: ${job.description ? "✅ Present (" + job.description.length + " chars)" : "❌ MISSING"}`
    );
    console.log(`   Category ID: ${job.categoryId}`);
    console.log(`   Source: ${job.sourceName}`);
  });

  const totalCount = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.sourceName, "Greenhouse"));

  console.log(`\n✅ Total Greenhouse jobs in database: ${totalCount.length}`);
  process.exit(0);
}

checkGreenhouseData();
