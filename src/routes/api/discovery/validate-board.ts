import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { getCloudflareEnvAsync } from '@/lib/cloudflare';
import { validateBoardToken } from '@/server/discovery/consumer';

export const Route = createFileRoute('/api/discovery/validate-board')({
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

          const board = await env.DB.prepare(
            'SELECT ats, token FROM boards WHERE id = ?'
          ).bind(id).first<{ ats: string; token: string }>();

          if (!board) {
            return json({ success: false, error: 'Board not found' }, { status: 404 });
          }

          const isValid = await validateBoardToken(board.ats, board.token);
          if (isValid) {
            await env.DB.prepare(
              'UPDATE boards SET validated = 1, validation_error_count = 0, is_active = 1 WHERE id = ?'
            ).bind(id).run();
            return json({ success: true, validated: true });
          } else {
            await env.DB.prepare(
              'UPDATE boards SET validation_error_count = validation_error_count + 1 WHERE id = ?'
            ).bind(id).run();
            return json({ success: true, validated: false });
          }
        } catch (error) {
          console.error('[api/discovery/validate-board] Error validating board:', error);
          return json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          }, { status: 500 });
        }
      }
    }
  }
});
