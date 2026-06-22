import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== "production";

// Stub cloudflare:workers only for client/ssr environments (not the cloudflare environment,
// where the real module is available and needed by the plugin's virtual export-types module).
const cloudflareWorkersStubPlugin = {
  name: "cloudflare-workers-stub",
  resolveId(id: string, _importer: string | undefined, options: { ssr?: boolean }) {
    if (id === "cloudflare:workers" && options?.ssr) {
      return path.resolve(__dirname, "src/stubs/cloudflare-workers-stub.ts");
    }
  },
};

const config = defineConfig({
  plugins: [
    // TanStack Start must come first for proper routing
    tanstackStart(),
    // Cloudflare plugin provides D1/KV/R2/AI/Browser bindings in dev and prod
    cloudflare({
      configPath: "./wrangler.toml",
    }),
    tailwindcss(),
    ...(isDev ? [cloudflareWorkersStubPlugin] : []),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      'node:sqlite': new URL('./src/stubs/node-sqlite.js', import.meta.url).pathname,
      // Fix blake3-wasm resolution issue by pointing to browser version
      'blake3-wasm': 'blake3-wasm/esm/browser/index.js',
    },
  },
  optimizeDeps: {
    exclude: ["wrangler", "blake3-wasm", "miniflare", "undici", "@cloudflare/unenv-preset"],
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
