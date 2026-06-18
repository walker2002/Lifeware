import "@testing-library/jest-dom/vitest";

// 加载 .env.local 中的环境变量（集成测试需要 DATABASE_URL 连真实 PostgreSQL）。
// 仅当环境中尚未提供 DATABASE_URL 时加载，避免覆盖 CI 注入的配置。
if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dotenv = require("dotenv");
  dotenv.config({ path: ".env.local" });
}
