import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    // During `vite dev`, forward API calls to the Node server (port 3000).
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  preview: {
    allowedHosts: ["www.benjamintakaki.com"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
