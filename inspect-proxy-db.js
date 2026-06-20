import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./src/db/schema";

async function main() {
  const proxy = await getPlatformProxy({
    configPath: "./wrangler.toml",
  });
  const d1 = proxy.env.DB;
  const db = drizzle(d1, { schema });

  const result = await db.select().from(schema.normalizedJobs).orderBy(schema.normalizedJobs.id).all();
  console.log(`Total jobs in normalizedJobs: ${result.length}`);
  for (const job of result) {
    console.log({
      id: job.id,
      title: job.jobTitle,
      company: job.employerName,
      sourceOrigin: job.sourceOrigin,
      currentStage: job.currentStage,
      postDateText: job.postDateText,
      descriptionLength: job.description ? job.description.length : null,
      descriptionPrunedLength: job.descriptionPruned ? job.descriptionPruned.length : null,
    });
  }

  await proxy.dispose();
}

main().catch(console.error);
