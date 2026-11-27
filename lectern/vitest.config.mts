import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Server-only modules are tested directly in Node.
      "server-only": path.resolve(__dirname, "src/test/empty.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"] },
});
