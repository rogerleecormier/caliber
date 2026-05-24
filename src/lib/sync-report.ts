/**
 * Sync Report Utility
 * Tracks and formats comprehensive statistics about sync runs
 */

export interface SyncReport {
  startTime: Date
  endTime?: Date
  duration?: number
  
  // Discovery stats
  discovery: {
    companiesTested: number
    companiesDiscovered: number
    companiesAdded: {
      greenhouse: string[]
      lever: string[]
    }
    companiesRemoved: {
      greenhouse: string[]
      lever: string[]
    }
    dynamicSources?: {
      [key: string]: number
    }
  }
  
  // Job sync stats
  jobs: {
    totalFetched: number
    added: number
    updated: number
    skipped: number
    bySource: {
      [sourceName: string]: number
    }
    newCompaniesWithJobs: string[]
  }
  
  // Top new jobs (show most interesting)
  topNewJobs: Array<{
    title: string
    company: string
    salary?: string
  }>
}

export function createSyncReport(): SyncReport {
  return {
    startTime: new Date(),
    discovery: {
      companiesTested: 0,
      companiesDiscovered: 0,
      companiesAdded: {
        greenhouse: [],
        lever: []
      },
      companiesRemoved: {
        greenhouse: [],
        lever: []
      },
      dynamicSources: {}
    },
    jobs: {
      totalFetched: 0,
      added: 0,
      updated: 0,
      skipped: 0,
      bySource: {},
      newCompaniesWithJobs: []
    },
    topNewJobs: []
  }
}

export function updateDiscoveryStats(report: SyncReport, stats: Partial<SyncReport['discovery']>): void {
  if (stats.companiesTested !== undefined) {
    report.discovery.companiesTested += stats.companiesTested
  }
  if (stats.companiesDiscovered !== undefined) {
    report.discovery.companiesDiscovered += stats.companiesDiscovered
  }
  if (stats.companiesAdded) {
    if (stats.companiesAdded.greenhouse) {
      report.discovery.companiesAdded.greenhouse.push(...stats.companiesAdded.greenhouse)
    }
    if (stats.companiesAdded.lever) {
      report.discovery.companiesAdded.lever.push(...stats.companiesAdded.lever)
    }
  }
  if (stats.companiesRemoved) {
    if (stats.companiesRemoved.greenhouse) {
      report.discovery.companiesRemoved.greenhouse.push(...stats.companiesRemoved.greenhouse)
    }
    if (stats.companiesRemoved.lever) {
      report.discovery.companiesRemoved.lever.push(...stats.companiesRemoved.lever)
    }
  }
  if (stats.dynamicSources) {
    report.discovery.dynamicSources = {
      ...report.discovery.dynamicSources,
      ...stats.dynamicSources
    }
  }
}

export function updateJobStats(report: SyncReport, stats: Partial<SyncReport['jobs']>): void {
  if (stats.totalFetched !== undefined) {
    report.jobs.totalFetched += stats.totalFetched
  }
  if (stats.added !== undefined) {
    report.jobs.added += stats.added
  }
  if (stats.updated !== undefined) {
    report.jobs.updated += stats.updated
  }
  if (stats.skipped !== undefined) {
    report.jobs.skipped += stats.skipped
  }
  if (stats.bySource) {
    Object.entries(stats.bySource).forEach(([source, count]) => {
      report.jobs.bySource[source] = (report.jobs.bySource[source] || 0) + count
    })
  }
  if (stats.newCompaniesWithJobs) {
    report.jobs.newCompaniesWithJobs.push(...stats.newCompaniesWithJobs)
  }
}

export function addTopJob(report: SyncReport, job: { title: string; company: string; salary?: string }): void {
  // Only keep top 10 jobs, prioritize those with salaries
  if (report.topNewJobs.length < 10) {
    report.topNewJobs.push(job)
  } else if (job.salary && !report.topNewJobs[report.topNewJobs.length - 1].salary) {
    // Replace last job if new one has salary and last doesn't
    report.topNewJobs[report.topNewJobs.length - 1] = job
  }
}

export function finalizeSyncReport(report: SyncReport): SyncReport {
  report.endTime = new Date()
  report.duration = report.endTime.getTime() - report.startTime.getTime()
  return report
}

export function formatSyncReport(report: SyncReport): string {
  const lines: string[] = []
  
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  lines.push('📊 SYNC REPORT')
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  lines.push('')
  
  // Discovery Section
  if (report.discovery.companiesTested > 0 || report.discovery.companiesDiscovered > 0) {
    lines.push('🔍 DISCOVERY')
    lines.push(`   Companies Tested: ${report.discovery.companiesTested}`)
    lines.push(`   New Discovered: ${report.discovery.companiesDiscovered}`)
    
    const totalAdded = report.discovery.companiesAdded.greenhouse.length + 
                       report.discovery.companiesAdded.lever.length
    if (totalAdded > 0) {
      lines.push(`   ✅ Added: ${totalAdded} companies`)
      if (report.discovery.companiesAdded.greenhouse.length > 0) {
        lines.push(`      Greenhouse: ${report.discovery.companiesAdded.greenhouse.join(', ')}`)
      }
      if (report.discovery.companiesAdded.lever.length > 0) {
        lines.push(`      Lever: ${report.discovery.companiesAdded.lever.join(', ')}`)
      }
    }
    
    const totalRemoved = report.discovery.companiesRemoved.greenhouse.length +
                        report.discovery.companiesRemoved.lever.length
    if (totalRemoved > 0) {
      lines.push(`   🗑️  Removed: ${totalRemoved} companies (404s)`)
    }
    lines.push('')
  }
  
  // Jobs Section
  if (report.jobs.totalFetched > 0) {
    lines.push('💼 JOBS')
    lines.push(`   Total Fetched: ${report.jobs.totalFetched}`)
    lines.push(`   ✅ Added: ${report.jobs.added}`)
    lines.push(`   🔄 Updated: ${report.jobs.updated}`)
    lines.push(`   ⏭️  Skipped: ${report.jobs.skipped}`)
    lines.push('')
    
    if (Object.keys(report.jobs.bySource).length > 0) {
      lines.push('   By Source:')
      Object.entries(report.jobs.bySource).forEach(([source, count]) => {
        lines.push(`      ${source}: ${count}`)
      })
      lines.push('')
    }
  }
  
  // Top Jobs
  if (report.topNewJobs.length > 0) {
    lines.push('🌟 HIGHLIGHTED NEW JOBS')
    report.topNewJobs.slice(0, 5).forEach(job => {
      const salaryStr = job.salary ? ` | ${job.salary}` : ''
      lines.push(`   • ${job.title} at ${job.company}${salaryStr}`)
    })
    lines.push('')
  }
  
  // Duration
  if (report.duration) {
    lines.push(`⏱️  Duration: ${(report.duration / 1000).toFixed(1)}s`)
  }
  
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  
  return lines.join('\n')
}

/**
 * Parse console output to extract statistics
 * This is used to extract stats from the npm script outputs
 */
export function parseDiscoveryOutput(output: string): Partial<SyncReport['discovery']> {
  const stats: Partial<SyncReport['discovery']> = {
    companiesAdded: { greenhouse: [], lever: [] },
    companiesRemoved: { greenhouse: [], lever: [] }
  }
  
  // Parse "Testing X potential companies from curated lists"
  const testingMatch = output.match(/Testing\s+(\d+)\s+potential companies/i)
  if (testingMatch) {
    stats.companiesTested = parseInt(testingMatch[1])
  }
  
  // Parse "Generated X slug variations to test"
  const variationsMatch = output.match(/Generated\s+(\d+)\s+slug variations/i)
  if (variationsMatch) {
    stats.companiesTested = parseInt(variationsMatch[1])
  }
  
  // Parse "Companies discovered: X" or "✅ Added X companies to database"
  const discoveredMatch = output.match(/Companies discovered:\s*(\d+)/i) ||
                          output.match(/Added\s+(\d+)\s+companies to database/i)
  if (discoveredMatch) {
    stats.companiesDiscovered = parseInt(discoveredMatch[1])
  }
  
  // Parse individual company additions (look for "✅ company-name: X remote jobs")
  const companyMatches = output.matchAll(/✅\s+([a-z0-9-]+):\s+(\d+)\s+remote\s+job/gi)
  const addedCompanies: string[] = []
  for (const match of companyMatches) {
    addedCompanies.push(match[1])
  }
  if (addedCompanies.length > 0) {
    stats.companiesDiscovered = addedCompanies.length
    // We can't determine if it's greenhouse or lever from output alone,
    // but we'll populate based on which script ran
    if (output.includes('Greenhouse')) {
      stats.companiesAdded!.greenhouse = addedCompanies
    } else if (output.includes('Lever')) {
      stats.companiesAdded!.lever = addedCompanies
    }
  }
  
  return stats
}

export function parseJobSyncOutput(output: string): Partial<SyncReport['jobs']> {
  const stats: Partial<SyncReport['jobs']> = {
    bySource: {}
  }
  
  // Parse "Total added: X"
  const addedMatch = output.match(/Total added:\s*(\d+)/i)
  if (addedMatch) {
    stats.added = parseInt(addedMatch[1])
  }
  
  // Parse "Total updated: X"
  const updatedMatch = output.match(/Total updated:\s*(\d+)/i)
  if (updatedMatch) {
    stats.updated = parseInt(updatedMatch[1])
  }
  
  // Parse "Total skipped: X"
  const skippedMatch = output.match(/Total skipped.*:\s*(\d+)/i)
  if (skippedMatch) {
    stats.skipped = parseInt(skippedMatch[1])
  }
  
  // Parse source-specific job counts
  const greenhouseMatch = output.match(/Greenhouse.*?(\d+)\s+remote\s+job/i)
  if (greenhouseMatch) {
    stats.bySource!['Greenhouse'] = parseInt(greenhouseMatch[1])
  }
  
  const leverMatch = output.match(/Lever.*?(\d+)\s+remote\s+job/i)
  if (leverMatch) {
    stats.bySource!['Lever'] = parseInt(leverMatch[1])
  }
  
  const remoteokMatch = output.match(/RemoteOK.*?(\d+)\s+job/i) ||
                        output.match(/Found\s+(\d+)\s+jobs\s+from\s+RemoteOK/i)
  if (remoteokMatch) {
    stats.bySource!['RemoteOK'] = parseInt(remoteokMatch[1])
  }
  
  return stats
}
