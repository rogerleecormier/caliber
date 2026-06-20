import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { fetchGreenhouseJobs } from '@/server/ats/parsers/greenhouse';
import { fetchLeverJobs } from '@/server/ats/parsers/lever';
import { fetchAshbyJobs } from '@/server/ats/parsers/ashby';
import { normalizeJob } from '@/lib/normalization';

async function handleCrawl(ats: string, request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    const companyName = url.searchParams.get('company') || token || undefined;

    if (!token) {
      return json({ success: false, error: 'Query parameter "token" is required' }, { status: 400 });
    }

    let rawJobs: any[] = [];
    if (ats === 'greenhouse') {
      rawJobs = await fetchGreenhouseJobs(token, companyName);
    } else if (ats === 'lever') {
      rawJobs = await fetchLeverJobs(token, companyName);
    } else if (ats === 'ashby') {
      rawJobs = await fetchAshbyJobs(token, companyName);
    } else {
      return json({ success: false, error: `Unsupported ATS provider: ${ats}` }, { status: 400 });
    }

    const normalizedJobs = rawJobs.map(job => normalizeJob(job));

    return json({
      success: true,
      provider: ats,
      token,
      company: companyName,
      count: rawJobs.length,
      sampleNormalized: normalizedJobs.slice(0, 3),
      sampleRaw: rawJobs.slice(0, 1),
    });
  } catch (error) {
    console.error(`Manual crawl error for ${ats}:`, error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export const Route = createFileRoute('/api/crawl/$ats')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        return handleCrawl((params as any).ats, request);
      },
      POST: async ({ params, request }) => {
        return handleCrawl((params as any).ats, request);
      }
    }
  }
});
