/**
 * V3 Job Content Endpoint
 * Fetches and returns job description with lazy cleansing
 * Uses TanStack Start patterns
 */

import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getDbFromContext, schema } from '../../../db/db'
import { eq } from 'drizzle-orm'
import { sanitizeHtml, decodeHtmlEntities } from '../../../lib/html-utils'
import { extractSalaryFromDescription } from '../../../lib/job-sources/salary-utils'
import { syncQueue } from '../../../lib/sync-queue'

export const Route = createFileRoute('/api/v3/job-content')({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const url = new URL(request.url)
        const sourceUrl = url.searchParams.get('url')
        const company = url.searchParams.get('company')

        if (!sourceUrl || !company) {
          return json({ error: 'Missing url or company' }, { status: 400 })
        }

        try {
          const ctx = context as any
          const db = await getDbFromContext(ctx)

          // Check if we already have the job in DB
          const existingJob = await db.select()
            .from(schema.jobs)
            .where(eq(schema.jobs.sourceUrl, sourceUrl))
            .get()

          // LAZY CLEANSING: If job has raw description but hasn't been cleansed, do it now
          if (existingJob && existingJob.descriptionRaw && !existingJob.isCleansed) {
            const cleansedDescription = sanitizeHtml(existingJob.descriptionRaw)
            const textOnly = cleansedDescription.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
            const words = textOnly.split(' ')
            const summaryText = words.slice(0, 200).join(' ') + (words.length > 200 ? '...' : '')
            
            // Update with cleansed data
            await db.update(schema.jobs).set({
              description: summaryText,
              fullDescription: cleansedDescription,
              isCleansed: 1,
              updatedAt: new Date()
            }).where(eq(schema.jobs.id, existingJob.id))
            
            return json({ content: cleansedDescription }, {
              headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'X-Api-Version': 'v3'
              }
            })
          }

          // Return cached full description if available
          if (existingJob && existingJob.fullDescription) {
            const reprocessed = sanitizeHtml(existingJob.fullDescription)
            return json({ content: reprocessed }, {
              headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'X-Api-Version': 'v3'
              }
            })
          }

          // Fetch from source API
          let content = ''
          const lowerSourceUrl = sourceUrl.toLowerCase()
          
          // Greenhouse
          if (lowerSourceUrl.includes('greenhouse')) {
            const tokenMatch = sourceUrl.match(/boards\.greenhouse\.io\/([^\/]+)\/jobs\/(\d+)/i)
            
            if (tokenMatch && tokenMatch[1] && tokenMatch[2]) {
              const boardToken = tokenMatch[1]
              const id = tokenMatch[2]
              const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${id}`
              
              const response = await fetch(apiUrl)
              if (!response.ok) {
                throw new Error(`Greenhouse API error: ${response.status}`)
              }
              
              const data = await response.json() as any
              content = sanitizeHtml(decodeHtmlEntities(data.content || ''))
            } else {
              // Fallback with job ID extraction
              const idMatch = sourceUrl.match(/\/jobs\/(\d+)/i)
              if (idMatch && idMatch[1]) {
                const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${company.toLowerCase()}/jobs/${idMatch[1]}`
                const response = await fetch(apiUrl)
                if (!response.ok) {
                  throw new Error(`Greenhouse fallback error: ${response.status}`)
                }
                const data = await response.json() as any
                content = sanitizeHtml(decodeHtmlEntities(data.content || ''))
              } else {
                return json({ error: 'Could not extract Greenhouse job ID' }, { status: 400 })
              }
            }
          }
          // Lever
          else if (lowerSourceUrl.includes('lever.co')) {
            const match = sourceUrl.match(/lever\.co\/([^\/]+)\/([a-zA-Z0-9-]+)/i)
            if (match && match[1] && match[2]) {
              const companySlug = match[1]
              const id = match[2]
              const apiUrl = `https://api.lever.co/v0/postings/${companySlug}/${id}`
              
              const response = await fetch(apiUrl)
              if (!response.ok) {
                throw new Error(`Lever API error: ${response.status}`)
              }
              
              const data = await response.json() as any
              let rawContent = data.description || ''
              
              // Combine with lists
              if (data.lists && Array.isArray(data.lists)) {
                for (const list of data.lists) {
                  rawContent += `<h3>${list.text}</h3><ul>${list.content || ''}</ul>`
                }
              }
              if (data.additional) {
                rawContent += `<p>${data.additional}</p>`
              }
              
              content = sanitizeHtml(rawContent)
            } else {
              return json({ error: 'Could not extract Lever job ID' }, { status: 400 })
            }
          }
          else {
            return json({ 
              error: 'Unsupported source', 
              url: sourceUrl,
              hint: 'Please visit the job page directly'
            }, { status: 400 })
          }

          // Create summary and update DB
          const textOnly = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
          const words = textOnly.split(' ')
          const summaryText = words.slice(0, 200).join(' ') + (words.length > 200 ? '...' : '')
          
          // Extract salary if possible
          const extractedSalary = extractSalaryFromDescription(textOnly)
          
          const updateValues: any = {
            fullDescription: content,
            description: summaryText,
            updatedAt: new Date()
          }
          
          if (extractedSalary && existingJob && !existingJob.payRange) {
            updateValues.payRange = extractedSalary
          }
          
          await db.update(schema.jobs)
            .set(updateValues)
            .where(eq(schema.jobs.sourceUrl, sourceUrl))

          return json({ content }, { 
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'X-Api-Version': 'v3'
            }
          })
        } catch (error) {
          console.error('Job content error:', error)
          return json({ 
            error: 'Failed to fetch content',
            details: error instanceof Error ? error.message : String(error)
          }, { status: 500 })
        }
      }
    }
  }
})
