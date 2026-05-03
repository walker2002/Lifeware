import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { fileURLToPath, URL } from "node:url"

const srcDir = fileURLToPath(new URL("./src", import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    server: {
      deps: {
        // Force Vite to process all source files through the alias resolver
        inline: [srcDir],
      },
    },
  },
})
