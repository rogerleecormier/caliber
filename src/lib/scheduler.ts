#!/usr/bin/env node
/**
 * Job Sync Scheduler
 * 
 * Runs the complete job sync workflow on a schedule:
 * 1. Cleanup - Remove 404 companies
 * 2. Discovery - Find new companies (configurable frequency)
 * 3. Sync - Fetch jobs from all sources
 * 
 * Default: Runs every 6 hours
 */

import cron from 'node-cron'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const execAsync = promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configuration
const CONFIG = {
  // Cron schedule: '0 */6 * * *' = every 6 hours at minute 0
  syncSchedule: process.env.SYNC_SCHEDULE || '0 */6 * * *',
  
  // Discovery runs less frequently (once per day by default)
  runDiscoveryEveryNSyncs: parseInt(process.env.DISCOVERY_FREQUENCY || '4'), // Every 4th sync = once per day
  
  // Cleanup runs every time
  alwaysRunCleanup: process.env.ALWAYS_CLEANUP !== 'false',
  
  // Log file
  logFile: path.join(__dirname, '.scheduler-logs', 'scheduler.log')
}

let syncCounter = 0

function log(message: string, type: 'info' | 'error' | 'success' = 'info') {
  const timestamp = new Date().toISOString()
  const emoji = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️'
  const logMessage = `[${timestamp}] ${emoji} ${message}`
  
  console.log(logMessage)
  
  // Ensure log directory exists
  const logDir = path.dirname(CONFIG.logFile)
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  
  // Append to log file
  fs.appendFileSync(CONFIG.logFile, logMessage + '\n')
}

async function runCommand(command: string, description: string): Promise<void> {
  log(`Starting: ${description}`)
  
  try {
    const { stdout, stderr } = await execAsync(`npm run ${command}`, {
      cwd: path.join(__dirname, '..', '..', '..'),
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large outputs
    })
    
    if (stdout) {
      log(`${description} output:\n${stdout}`)
    }
    if (stderr) {
      log(`${description} warnings:\n${stderr}`, 'info')
    }
    
    log(`Completed: ${description}`, 'success')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log(`Failed: ${description} - ${errorMessage}`, 'error')
    throw error
  }
}

async function runSyncWorkflow() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log('Starting Scheduled Job Sync Workflow')
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  
  syncCounter++
  const startTime = Date.now()
  
  try {
    // Step 1: Cleanup (always run)
    if (CONFIG.alwaysRunCleanup) {
      await runCommand('greenhouse:cleanup', 'Greenhouse Cleanup')
    } else {
      log('Cleanup skipped (disabled in config)')
    }
    
    // Step 2: Discovery (run every Nth sync)
    const shouldRunDiscovery = syncCounter % CONFIG.runDiscoveryEveryNSyncs === 0
    if (shouldRunDiscovery) {
      log(`Running discovery (sync #${syncCounter}, runs every ${CONFIG.runDiscoveryEveryNSyncs} syncs)`)
      await runCommand('greenhouse:discover', 'Greenhouse Discovery')
    } else {
      log(`Discovery skipped (runs every ${CONFIG.runDiscoveryEveryNSyncs} syncs, current: ${syncCounter})`)
    }
    
    // Step 3: Sync jobs
    await runCommand('sync-jobs', 'Job Sync')
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2)
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    log(`Workflow completed successfully in ${duration} minutes`, 'success')
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2)
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    log(`Workflow failed after ${duration} minutes`, 'error')
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  }
}

// Main scheduler
async function main() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log('🚀 Job Sync Scheduler Started')
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log(`Schedule: ${CONFIG.syncSchedule}`)
  log(`Cleanup: ${CONFIG.alwaysRunCleanup ? 'Every sync' : 'Disabled'}`)
  log(`Discovery: Every ${CONFIG.runDiscoveryEveryNSyncs} syncs`)
  log(`Log file: ${CONFIG.logFile}`)
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  // Validate cron schedule
  if (!cron.validate(CONFIG.syncSchedule)) {
    log(`Invalid cron schedule: ${CONFIG.syncSchedule}`, 'error')
    process.exit(1)
  }
  
  // Schedule the job
  const task = cron.schedule(CONFIG.syncSchedule, () => {
    runSyncWorkflow()
  })
  
  log('✅ Scheduler is running. Press Ctrl+C to stop.')
  log(`Next run will be at: ${getNextRunTime(CONFIG.syncSchedule)}\n`)
  
  // Run immediately on start (optional)
  if (process.env.RUN_ON_START === 'true') {
    log('Running initial sync (RUN_ON_START=true)...\n')
    await runSyncWorkflow()
  }
  
  // Keep the process alive
  process.on('SIGINT', () => {
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    log('Scheduler stopped by user')
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    task.stop()
    process.exit(0)
  })
}

function getNextRunTime(_cronExpression: string): string {
  // Simple approximation - in production, use a library like cron-parser
  const now = new Date()
  return new Date(now.getTime() + 6 * 60 * 60 * 1000).toLocaleString()
}

main().catch(error => {
  log(`Scheduler error: ${error}`, 'error')
  process.exit(1)
})
