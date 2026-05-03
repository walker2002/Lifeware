import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/lib": path.resolve(__dirname, "./src/lib"),
      "@/usom": path.resolve(__dirname, "./src/usom"),
      "@/nexus": path.resolve(__dirname, "./src/nexus"),
      "@/domains": path.resolve(__dirname, "./src/domains"),
    },
  },
})
