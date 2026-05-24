#!/bin/bash

# Test D1 Local Setup for TanStack Start
echo "🧪 Testing Cloudflare D1 with TanStack Start"
echo "=============================================="
echo ""

cd "$(dirname "$0")"

# Check if wrangler.toml exists
if [ ! -f "wrangler.toml" ]; then
    echo "❌ wrangler.toml not found"
    exit 1
fi
echo "✅ wrangler.toml found"

# Check if D1 database binding is configured
if grep -q "binding = \"DB\"" wrangler.toml; then
    echo "✅ D1 binding 'DB' configured in wrangler.toml"
else
    echo "❌ D1 binding 'DB' not found in wrangler.toml"
    exit 1
fi

# Check if migrations exist
if [ -d "drizzle" ] && [ "$(ls -A drizzle/*.sql 2>/dev/null)" ]; then
    echo "✅ Drizzle migrations found"
else
    echo "⚠️  No migrations found in drizzle/ directory"
fi

# Check if app/ssr.tsx exists
if [ -f "app/ssr.tsx" ]; then
    echo "✅ app/ssr.tsx exists (Cloudflare bindings handler)"
else
    echo "❌ app/ssr.tsx missing - this is needed for D1 context"
    exit 1
fi

# Check if vite.config.ts has cloudflare plugin
if grep -q "@cloudflare/vite-plugin" vite.config.ts; then
    echo "✅ Cloudflare Vite plugin configured"
else
    echo "❌ Cloudflare Vite plugin not found in vite.config.ts"
    exit 1
fi

echo ""
echo "📋 Setup Summary:"
echo "  - D1 binding: DB"
echo "  - Local database: .wrangler/state/v3/d1/"
echo "  - Dev server: vite dev --port 3003"
echo ""
echo "🚀 To start the dev server:"
echo "   npm run dev"
echo ""
echo "🧪 To test the D1 connection:"
echo "   curl http://localhost:3003/api/test-db"
echo ""
echo "✅ D1 setup is complete!"
