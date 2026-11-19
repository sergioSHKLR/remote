import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served from https://sergioshklr.github.io/remote/ on GitHub Pages (was /remir/ before the repo rename).
export default defineConfig({
  base: "/remote/",
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
