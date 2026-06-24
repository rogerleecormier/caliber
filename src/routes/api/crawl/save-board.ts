import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { getCloudflareEnvAsync } from '@/lib/cloudflare';

export const Route = createFileRoute('/api/crawl/save-board')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as { ats?: string; token?: string; companyName?: string };
          const { ats, token, companyName } = body;

          if (!ats || !token) {
            return json({ success: false, error: 'Missing ats or token parameter' }, { status: 400 });
          }

          const validAts = ['greenhouse', 'lever', 'ashby', 'workable', 'remoteok', 'himalayas', 'jobicy', 'adzuna', 'jooble', 'remotive'];
          if (!validAts.includes(ats.toLowerCase())) {
            return json({ success: false, error: `Invalid ATS: must be one of ${validAts.join(', ')}` }, { status: 400 });
          }

          const env = await getCloudflareEnvAsync();
          if (!env.DB) {
            return json({ success: false, error: 'Database binding "DB" is not available' }, { status: 500 });
          }

          const atsLower = ats.toLowerCase();
          const tokenTrimmed = token.trim();

          // Check if board already exists
          const existing = await env.DB.prepare(
            'SELECT id FROM boards WHERE ats = ? AND token = ?'
          ).bind(atsLower, tokenTrimmed).first<{ id: string }>();

          if (existing) {
            return json({ success: false, error: `Board for ${atsLower}/${tokenTrimmed} already exists` }, { status: 400 });
          }

          const id = crypto.randomUUID();
          const now = new Date().toISOString();

          await env.DB.prepare(`
            INSERT INTO boards (
              id, ats, token, company_name, crawl_frequency_tier, is_active, discovered_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            id,
            atsLower,
            tokenTrimmed,
            companyName?.trim() || null,
            'tier2', // default crawlFrequencyTier
            1, // isActive: true (as 1)
            now,
            now
          ).run();

          return json({ success: true, id });
        } catch (error) {
          console.error('[save-board-api] Error saving board:', error);
          return json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }, { status: 500 });
        }
      }
    }
  }
});
