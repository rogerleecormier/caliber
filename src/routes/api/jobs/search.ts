import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { JobAggregatorService } from '@/lib/services';

interface SearchRequestBody {
  keywords?: string;
  location?: string;
  limit?: number;
  sources?: ('adzuna' | 'jooble' | 'remotive')[];
}

interface SearchResponse {
  success: boolean;
  data?: {
    jobs: any[];
    sources: Record<string, { success: boolean; count: number; error?: string }>;
    deduped: number;
  };
  error?: string;
}

export const Route = createFileRoute('/api/jobs/search')({
  server: {
    handlers: {
      POST: async ({ request, context }: { request: Request; context: any }) => {
        try {
          const body = (await request.json()) as SearchRequestBody;

          // Validate input
          if (!body.keywords || !body.keywords.trim()) {
            return json(
              { success: false, error: 'Keywords are required' } as SearchResponse,
              { status: 400 }
            );
          }

          if (!body.sources || body.sources.length === 0) {
            return json(
              { success: false, error: 'At least one source must be selected' } as SearchResponse,
              { status: 400 }
            );
          }

          // Initialize aggregator with credentials from context
          const aggregator = new JobAggregatorService(
            context.KV, // Cloudflare KV binding
            context.ADZUNA_API_KEY,
            context.JOOBLE_API_KEY
          );

          // Perform search
          const result = await aggregator.search({
            keywords: body.keywords,
            location: body.location || 'United States',
            limit: Math.min(body.limit || 50, 100), // Cap at 100
            sources: body.sources,
          });

          // Return successful response
          return json(
            {
              success: true,
              data: {
                jobs: result.jobs,
                sources: result.sources,
                deduped: result.deduped,
              },
            } as SearchResponse,
            { status: 200 }
          );
        } catch (error) {
          console.error('Job search error:', error);

          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

          return json(
            {
              success: false,
              error: errorMessage,
            } as SearchResponse,
            { status: 500 }
          );
        }
      },
    },
  },
});
