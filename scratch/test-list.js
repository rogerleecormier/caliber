import { getCloudflareEnvAsync } from "../src/lib/cloudflare.ts";
import { getDb } from "../src/db/db.ts";
import { normalizedJobs, user } from "../src/db/schema.ts";
import { eq, and, or, sql, ne } from "drizzle-orm";

async function main() {
  const env = await getCloudflareEnvAsync();
  if (!env.DB) {
    console.error("No DB binding found from platform proxy.");
    return;
  }
  const db = getDb(env.DB);

  // Let's first make sure a user exists
  const users = await db.select().from(user).all();
  if (users.length === 0) {
    console.log("No users found in database.");
    return;
  }
  const testUser = users[0];
  console.log("Using test user:", testUser);

  const now = new Date().toISOString();

  // Let's insert a favorited job
  console.log("Inserting a favorited job...");
  const inserted = await db.insert(normalizedJobs).values({
    userId: testUser.id,
    sourceOrigin: 'greenhouse',
    jobTitle: 'Software Engineer Test',
    employerName: 'Caliber Test Inc',
    sourceUrl: 'http://example.com/job-test',
    canonicalSourceUrl: 'http://example.com/job-test',
    isFavorited: true,
    currentStage: 'Favorited',
    discoveryTimestamp: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  }).returning();

  const insertedJob = inserted[0];
  console.log("Inserted job:", insertedJob);

  // Now query it using listNormalizedJobs logic
  console.log("Querying using Drizzle logic...");

  const isFavorited = true;
  const baseWhereClause = and(
    eq(normalizedJobs.userId, testUser.id),
    ne(normalizedJobs.currentStage, 'Archived'),
    isFavorited === true
      ? or(
          eq(normalizedJobs.isFavorited, true),
          sql`${normalizedJobs.currentStage} != 'Favorited'`
        )
      : undefined
  );

  try {
    const rows = await db
      .select({
        id: normalizedJobs.id,
        jobTitle: normalizedJobs.jobTitle,
        isFavorited: normalizedJobs.isFavorited,
        currentStage: normalizedJobs.currentStage
      })
      .from(normalizedJobs)
      .where(baseWhereClause)
      .all();

    console.log("Drizzle query results:", rows);
  } catch (e) {
    console.error("Error during Drizzle query:", e);
  }

  // Clean up
  await db.delete(normalizedJobs).where(eq(normalizedJobs.id, insertedJob.id));
  console.log("Cleaned up.");
}

main().catch(console.error);
