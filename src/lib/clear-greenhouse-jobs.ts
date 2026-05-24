import { schema } from "../db/db";
import { getD1Database } from "@caliber/shared-utils";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";

async function clearGreenhouseJobs() {
  const d1 = await getD1Database();
  const db = drizzle(d1, { schema });

  console.log("🧹 Clearing old Greenhouse jobs from database...");

  try {
    const result = await db
      .delete(schema.jobs)
      .where(eq(schema.jobs.sourceName, "Greenhouse"));

    console.log("✅ Successfully cleared Greenhouse jobs");
    console.log("💡 Now run: npm run sync-jobs");
    console.log(
      "   This will fetch fresh Greenhouse data with company names, descriptions, and salaries"
    );
  } catch (error) {
    console.error("❌ Error clearing jobs:", error);
    process.exit(1);
  }

  process.exit(0);
}

clearGreenhouseJobs();
