import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lightweight vitest config for pure unit tests (no Cloudflare Workers runtime).
// Avoids loading the Cloudflare/TanStack Start vite plugins, which require
// binding to the Workers runtime and the full worker entrypoint graph.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    exclude: ["node_modules", "dist"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/",
        "dist/",
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "**/*.config.ts",
        "**/types.ts",
      ],
    },
  },
});
