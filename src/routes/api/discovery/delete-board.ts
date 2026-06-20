import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { getCloudflareEnvAsync } from '@/lib/cloudflare';

export const Route = createFileRoute('/api/discovery/delete-board')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { id } = await request.json() as { id?: string };
          if (!id) {
            return json({ success: false, error: 'Missing board ID' }, { status: 400 });
          }

          const env = await getCloudflareEnvAsync();
          if (!env.DB) {
            return json({ success: false, error: 'Database unavailable' }, { status: 500 });
          }

          const result = await env.DB.prepare(
            'DELETE FROM boards WHERE id = ?'
          ).bind(id).run();

          if (result.meta.changes === 0) {
            return json({ success: false, error: `Board not found` }, { status: 404 });
          }

          return json({ success: true });
        } catch (error) {
          console.error('[api/discovery/delete-board] Error deleting board:', error);
          return json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }, { status: 500 });
        }
      }
    }
  }
});
