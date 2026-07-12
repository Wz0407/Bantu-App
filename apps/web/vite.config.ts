/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The frontend talks only to the ASP.NET Core API (ARCHITECTURE.md §3).
// In development, API paths are proxied to the local API process.
const API_URL = process.env["MYBANTU_API_URL"] ?? "http://127.0.0.1:5100";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": API_URL,
      "/health": API_URL,
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
});
