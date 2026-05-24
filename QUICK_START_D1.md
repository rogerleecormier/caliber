# Quick Start: D1 with TanStack Start

## What Was Set Up

✅ **app/ssr.tsx** - Cloudflare bindings handler that injects D1 into context  
✅ **vite.config.ts** - Updated with Cloudflare plugin for local D1 access  
✅ **src/router.tsx** - Updated with AppLoadContext type  
✅ **src/db/db.ts** - Simplified with proper TypeScript types  
✅ **Local D1 database** - Migrations applied to `.wrangler/state/v3/d1/`

## Usage in Routes

### API Route Example

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { getDbFromContext, schema } from "../../db/db";

export const Route = createFileRoute("/api/my-endpoint")({
  server: {
    handlers: {
      GET: async ({ context }) => {
        const db = await getDbFromContext(context);
        const jobs = await db.select().from(schema.jobs);
        return json({ jobs });
      },
      POST: async ({ context, request }) => {
        const db = await getDbFromContext(context);
        const body = await request.json();
        // Insert, update, etc.
        return json({ success: true });
      },
    },
  },
});
```

### Page Route with Loader

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getDbFromContext, schema } from "../db/db";

const getJobs = createServerFn("GET", async (_, { context }) => {
  const db = await getDbFromContext(context);
  return await db.select().from(schema.jobs);
});

export const Route = createFileRoute("/jobs")({
  loader: async () => {
    const jobs = await getJobs();
    return { jobs };
  },
  component: JobsPage,
});

function JobsPage() {
  const { jobs } = Route.useLoaderData();
  return (
    <div>
      {jobs.map((job) => (
        <div key={job.id}>{job.title}</div>
      ))}
    </div>
  );
}
```

## Common Commands

```bash
# Start dev server
npm run dev

# Generate new migration
npm run db:generate

# Apply migrations locally
npm run db:migrate:local

# Test D1 connection
curl http://localhost:3003/api/test-db

# Generate Cloudflare types
npm run cf-typegen
```

## How Context Works

1. **Development**: `@cloudflare/vite-plugin` provides D1 binding from `wrangler.toml`
2. **app/ssr.tsx**: Receives D1 from Cloudflare env and injects into context
3. **Routes**: Access via `context.cloudflare.env.DB`
4. **Helper**: `getDbFromContext(context)` returns typed Drizzle instance

## Local Database Location

```
.wrangler/state/v3/d1/miniflare-D1DatabaseObject/{your-db-id}.sqlite
```

The database persists between restarts (due to `persistState: true` in vite config).

## Troubleshooting

**"DB binding not found"**

- Check `wrangler.toml` has `binding = "DB"`
- Restart dev server after config changes

**Migrations not applied**

- Run `npm run db:migrate:local`

**TypeScript errors**

- Run `npm run cf-typegen` to regenerate Cloudflare types

## Next Steps

- See `D1_SETUP.md` for detailed documentation
- Run `./test-d1-setup.sh` to verify configuration
- Check existing routes in `src/routes/api/` for examples
