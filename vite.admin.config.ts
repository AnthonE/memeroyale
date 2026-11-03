// The admin console bundles: built into dist-admin/, which the static server never serves. The game
// server hands out dist-admin/login.js to anyone (it holds nothing but the login form) and dist-admin/console.js ONLY to
// a request carrying a valid admin session (server/admin/http.ts). `vite build` builds these too (vite.config.ts
// closeBundle); on its own: `ADMIN_ENTRY=console npx vite build -c vite.admin.config.ts` (one entry per run: IIFE).
import { defineConfig } from "vite";

const entry = process.env.ADMIN_ENTRY === "login" ? "login" : "console";
export default defineConfig({
  // fonts resolve against the admin page's own URL (…/admin → …/assets/ui/toon/*), so a /kong/ prefix just works
  base: "./",
  publicDir: false,
  logLevel: "warn",
  build: {
    target: "es2022", outDir: "dist-admin", emptyOutDir: false, sourcemap: false, copyPublicDir: false,
    lib: { entry: `client/src/admin/${entry}.ts`, name: `krAdmin_${entry}`, formats: ["iife"], fileName: () => `${entry}.js` },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
