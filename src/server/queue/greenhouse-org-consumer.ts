/**
 * Greenhouse Organization Consumer
 *
 * Processes Greenhouse org discovery messages from the job-ingestion-queue,
 * extracts boards.greenhouse.io/* URLs, and upserts organization names
 * into the greenhouse_orgs D1 table.
 */

import type { DrizzleD1Database } from '@/db/db'
import * as schema from '@/db/schema'
import { eq } from 'drizzle-orm'
import { extractGreenhouseOrgsFromPayload } from '@/lib/greenhouse-extractor'
import type { GreenhouseOrgMessage } from '@/lib/job-ingestion-queue'

/**
 * Process a Greenhouse org discovery message.
 * Extracts org names from the payload and upserts them to the greenhouse_orgs table.
 */
export async function processGreenhouseOrgMessage(
  db: DrizzleD1Database,
  message: GreenhouseOrgMessage,
): Promise<void> {
  const orgs = extractGreenhouseOrgsFromPayload(message.payload)

  if (orgs.length === 0) {
    console.log('[greenhouse-org-consumer] No Greenhouse URLs found in payload')
    return
  }

  for (const orgName of orgs) {
    try {
      const existing = await db
        .select()
        .from(schema.greenhouseOrgs)
        .where(eq(schema.greenhouseOrgs.orgName, orgName))
        .limit(1)

      if (existing.length > 0) {
        await db
          .update(schema.greenhouseOrgs)
          .set({
            updatedAt: new Date(),
          })
          .where(eq(schema.greenhouseOrgs.orgName, orgName))

        console.log(`[greenhouse-org-consumer] Updated org: ${orgName}`)
      } else {
        await db.insert(schema.greenhouseOrgs).values({
          orgName,
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        console.log(`[greenhouse-org-consumer] Inserted org: ${orgName}`)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(
        `[greenhouse-org-consumer] Failed to process org ${orgName}:`,
        errorMsg,
      )
    }
  }
}
