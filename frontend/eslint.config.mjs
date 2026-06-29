import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // ─── [023] A2.9 写侧跨域直 import 防回退（§1-A2 锁定）─────────────────
  // 仅锁 src/domains/timebox/handlers/scheduling-handler.ts：
  // 写侧 handler 跨域直 import tasks/habits repository 走旁路，违反 Nexus
  // 链路终点约束。CNUI 读侧（cnui/handlers.ts）直 import tasks/habits repo
  // 做读聚合是合法范式（与 tasks 自己的 cnui/handlers 一致，OV#3 证据），
  // 不在 ESLint 禁止范围。
  {
    files: ["src/domains/timebox/handlers/scheduling-handler.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/domains/tasks/*", "@/domains/habits/*"],
              message:
                "[023] timebox scheduling-handler 禁止直 import tasks/habits（写侧跨域走 orchestrator）",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
