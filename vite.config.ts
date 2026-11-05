import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Writes dist/404.html, a copy of the app's page: Vercel serves it with a 404
 * status for any address that is not one of the site's pages (vercel.json),
 * and the app then shows its "page not found" page.
 */
function notFoundPage(): Plugin {
  let outDir = "dist";
  return {
    name: "not-found-page",
    apply: "build",
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      copyFileSync(resolve(outDir, "index.html"), resolve(outDir, "404.html"));
    },
  };
}

export default defineConfig({
  plugins: [react(), notFoundPage()],
  test: {
    environment: "node",
  },
} as Parameters<typeof defineConfig>[0]);
