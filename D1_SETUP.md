# Cloudflare D1 with TanStack Start - Local Development Setup

This guide explains how to use Cloudflare D1 locally with your TanStack Start project.

## Architecture Overview

The setup uses the following components:

1. **TanStack Start** - Full-stack React framework with SSR
2. **Cloudflare D1** - Serverless SQL database
3. **Drizzle ORM** - Type-safe ORM for database operations
4. **@cloudflare/vite-plugin** - Provides local D1 bindings during development

## File Structure

```
apps/jobs/
├── app/
│   └── ssr.tsx                    # Cloudflare bindings handler for TanStack Start
├── src/
│   ├── db/
│   │   ├── schema.ts              # Database schema
│   │   └── db.ts                  # Database utilities
│   └── routes/
│       └── api/
│           └── test-db.ts         # Example API route using D1
├── drizzle/                       # Database migrations
├── wrangler.toml                  # Cloudflare configuration
└── vite.config.ts                 # Vite configuration with Cloudflare plugin
```

## How It Works

### 1. Cloudflare Bindings Handler (`app/ssr.tsx`)

This file exports an `onRequest` handler that:

- Receives Cloudflare environment bindings (including D1)
- Injects them into the TanStack Router context
- Makes them available to all routes via `context.cloudflare.env.DB`

```typescript
export type AppLoadContext = {
  cloudflare: {
    env: {
      DB: D1Database;
    };
  };
};
```

### 2. Vite Configuration

The Cloudflare Vite plugin provides local D1 bindings during development:

```typescript
cloudflare({
  configPath: "./wrangler.toml",
  persistState: true, // Keeps local database between restarts
});
```

### 3. Database Access in Routes

API routes can access D1 through the context:

```typescript
export const Route = createFileRoute("/api/example")({
  server: {
    handlers: {
      GET: async ({ context }) => {
        const db = await getDbFromContext(context);
        const results = await db.select().from(schema.jobs);
        return json({ results });
      },
    },
  },
});
```

## Local Development

### Starting the Dev Server

```bash
npm run dev
```

The server will start on `http://localhost:3003` with:

- Local D1 database at `.wrangler/state/v3/d1/`
- Hot module reloading
- TypeScript support

### Database Migrations

Generate a new migration:

```bash
npm run db:generate
```

Apply migrations locally:

```bash
npm run db:migrate:local
```

Apply migrations to production:

```bash
npm run db:migrate:prod
```

### Testing D1 Connection

```bash
curl http://localhost:3003/api/test-db
```

Expected response:

```json
{
  "success": true,
  "message": "DB connection successful",
  "jobCount": 0
}
```

## Key Configuration Files

### `wrangler.toml`

```toml
[[d1_databases]]
binding = "DB"                     # The binding name used in code
database_name = "spearyx-jobs"     # Database name in Cloudflare
database_id = "your-db-id"         # Production database ID
migrations_dir = "drizzle"         # Where migrations are stored
```

### `drizzle.config.ts`

```typescript
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
```

## TypeScript Support

The setup includes full TypeScript support:

1. **Cloudflare types** - Auto-generated from `wrangler.toml`:

   ```bash
   npm run cf-typegen
   ```

2. **Drizzle types** - Inferred from schema automatically

3. **Router context types** - Defined in `app/ssr.tsx` and extended in `router.tsx`

## Troubleshooting

### DB binding not found

If you see "DB binding not found", check:

1. `wrangler.toml` has `[[d1_databases]]` with `binding = "DB"`
2. `vite.config.ts` includes the `cloudflare` plugin
3. `app/ssr.tsx` exists and exports `onRequest`

### Migrations not applying

```bash
# List migrations
npx wrangler d1 migrations list DB --local

# Force re-apply
npx wrangler d1 migrations apply DB --local --no-check
```

### Local database location

The local D1 database is stored at:

```
.wrangler/state/v3/d1/miniflare-D1DatabaseObject/{db-id}.sqlite
```

## Production Deployment

When deploying to Cloudflare Pages:

1. The `app/ssr.tsx` handler automatically provides the production D1 binding
2. Migrations are applied via: `npm run db:migrate:prod`
3. No code changes needed - same code works locally and in production

## Additional Resources

- [TanStack Start Docs](https://tanstack.com/start)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Cloudflare Vite Plugin](https://github.com/cloudflare/workers-sdk/tree/main/packages/vite-plugin)
