import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { viteSingleFile } from "vite-plugin-singlefile";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Builds the browser-only demo into one self-contained HTML file: demo/dist/index.html. */
export default defineConfig({
  root: here,
  base: "./",
  plugins: [viteSingleFile()],
  resolve: {
    alias: [
      { find: "next/link", replacement: path.join(here, "next-link.tsx") },
      { find: "next/navigation", replacement: path.join(here, "next-navigation.ts") },
      { find: /^@\//, replacement: path.join(here, "../src") + "/" },
    ],
  },
  define: {
    // No Supabase: the app runs in local mode. NEXT_PUBLIC_DEMO turns off server-only features.
    "process.env": JSON.stringify({ NEXT_PUBLIC_DEMO: "1" }),
  },
  oxc: { jsx: { runtime: "automatic" } },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 4000 },
});
