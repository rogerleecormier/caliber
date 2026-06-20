import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { getCloudflareEnvAsync } from '@/lib/cloudflare';

export const Route = createFileRoute('/api/crawl/toggle-board')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json() as { id?: string; is_active?: boolean };
          const { id, is_active } = body;

          if (!id) {
            return json({ success: false, error: 'Missing board ID' }, { status: 400 });
          }

          if (is_active === undefined) {
            return json({ success: false, error: 'Missing is_active parameter' }, { status: 400 });
          }

          const env = await getCloudflareEnvAsync();
          if (!env.DB) {
            return json({ success: false, error: 'Database binding "DB" is not available' }, { status: 500 });
          }

          const result = await env.DB.prepare(
            'UPDATE boards SET is_active = ? WHERE id = ?'
          ).bind(is_active ? 1 : 0, id).run();

          if (result.meta.changes === 0) {
            return json({ success: false, error: `Board with ID ${id} not found` }, { status: 404 });
          }

          return json({ success: true });
        } catch (error) {
          console.error('[toggle-board-api] Error toggling board:', error);
          return json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }, { status: 500 });
        }
      }
    }
  }
});
