import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import path from "node:path"

// vitest.config.ts 始终在 frontend/ 目录下
// import.meta.url 在 vitest 加载此文件时解析为该文件的 URL
const configDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(configDir, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    server: {
      deps: {
        inline: [path.resolve(configDir, "src")],
      },
    },
  },
})
