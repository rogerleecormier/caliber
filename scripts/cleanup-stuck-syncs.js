#!/usr/bin/env node
/**
 * Cleanup Stuck Syncs Script
 * 
 * Identifies and marks stuck sync jobs as failed.
 * A sync is considered stuck if it has been "running" for more than 1 hour.
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find database path automatically
const dbDir = path.join(__dirname, "../.wrangler/state/v3/d1/miniflare-D1DatabaseObject");
let dbPath = "";

if (fs.existsSync(dbDir)) {
  const files = fs.readdirSync(dbDir);
  const sqliteFile = files.find(f => f.endsWith(".sqlite"));
  if (sqliteFile) {
    dbPath = path.join(dbDir, sqliteFile);
  }
}

if (!dbPath || !fs.existsSync(dbPath)) {
  console.error("❌ Could not find local D1 database file.");
  console.error(`Checked directory: ${dbDir}`);
  process.exit(1);
}

console.log(`📍 Database: ${dbPath}\n`);
const db = new Database(dbPath);

const STUCK_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const STUCK_THRESHOLD_DATE = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

console.log(`🔍 Checking for syncs stuck in 'running' state since before ${STUCK_THRESHOLD_DATE}...`);

const stuckSyncs = db.prepare(`
  SELECT id, sync_type, started_at 
  FROM sync_history 
  WHERE status = 'running' 
  AND started_at < ?
`).all(STUCK_THRESHOLD_DATE);

console.log(`Found ${stuckSyncs.length} stuck sync(s).`);

if (stuckSyncs.length === 0) {
  console.log("✅ No stuck syncs found.");
  process.exit(0);
}

const updateStmt = db.prepare(`
  UPDATE sync_history 
  SET status = 'failed', 
      completed_at = ?, 
      logs = json_patch(logs, ?),
      stats = json_patch(stats, ?)
  WHERE id = ?
`);

let fixedCount = 0;

for (const sync of stuckSyncs) {
  console.log(`  - Fixing stuck sync: ${sync.sync_type} (${sync.source || 'unknown'}) started at ${sync.started_at}`);
  
  try {
    const now = new Date().toISOString();
    const errorMsg = "Timed out / Stuck in running state (Cleanup Script)";
    
    // Add error log
    const errorLog = JSON.stringify([{
      timestamp: now,
      type: 'error',
      message: errorMsg
    }]);

    // Update stats error
    const errorStats = JSON.stringify({
      error: errorMsg
    });
    
    updateStmt.run(now, errorLog, errorStats, sync.id);
    fixedCount++;
  } catch (error) {
    console.error(`    ❌ Failed to update sync ${sync.id}:`, error.message);
  }
}

console.log(`\n✅ Successfully marked ${fixedCount} sync(s) as failed.`);
