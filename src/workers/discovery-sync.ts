/**
 * Discovery Sync Worker (V3) - Direct D1 Access
 * 
 * Discovers new companies with remote job boards directly to D1,
 * bypassing the HTTP layer to avoid cold start issues.
 */

import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../db/schema'
import { syncDiscovery } from '../lib/worker-sync-logic'

export interface Env {
  DB: D1Database;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    const startTime = new Date()
    const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    
    console.log(`[${timeStr}] 🔍 Discovery Sync Worker starting (direct D1 access)`)
    
    // Create Drizzle instance directly from the D1 binding
    const db = drizzle(env.DB, { schema })
    
    try {
      const result = await syncDiscovery(db, timeStr)
      
      if (result.success) {
        console.log(`[${timeStr}] ✅ Discovery: checked ${result.companiesChecked}, discovered ${result.companiesAdded}, updated ${result.companiesUpdated} (${result.duration}ms)`)
      } else {
        console.log(`[${timeStr}] ⚠️ Discovery returned: ${result.error || 'no error message'}`)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[${timeStr}] ❌ Discovery sync failed:`, errorMsg)
      // Error state is already marked in syncDiscovery via markSyncFailed
    }
  }
}
