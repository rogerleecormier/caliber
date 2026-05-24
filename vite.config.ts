import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== "production";

const config = defineConfig({
  plugins: [
    // TanStack Start must come first for proper routing
    tanstackStart(),
    // Cloudflare plugin provides D1/KV/R2/AI/Browser bindings in dev and prod
    cloudflare({
      configPath: "./wrangler.toml",
    }),
    // Path aliases (@/*)
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    viteReact(),
  ],
  resolve: {
    alias: {
      'node:sqlite': new URL('./src/stubs/node-sqlite.js', import.meta.url).pathname,
      // Fix blake3-wasm resolution issue by pointing to browser version
      'blake3-wasm': 'blake3-wasm/esm/browser/index.js',
      // Stub cloudflare:workers in dev so auth/session imports don't crash
      ...(isDev ? {
        'cloudflare:workers': path.resolve(__dirname, 'src/stubs/cloudflare-workers-stub.ts'),
      } : {}),
    },
  },
  optimizeDeps: {
    exclude: ["wrangler", "blake3-wasm", "miniflare", "undici"],
  },
  build: {
    rollupOptions: {
      external: ["cloudflare:workers"],
    },
  },
  ssr: {
    noExternal: ["drizzle-orm"],
    external: ["node:sqlite", "blake3-wasm", "miniflare", "wrangler", "cloudflare:workers"],
  },
});

export default config;
