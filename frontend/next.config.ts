import type { NextConfig } from "next";

// [023.12] T14 治本：显式锁定 Asia/Shanghai 时区，防止 localDayKey /
// deriveAppointmentDisplayStatus 等使用 new Date().getXxx() 的代码
// 在 CI/prod（默认 UTC）上偏移 8 小时导致日界错乱。
// 必须在最早期设置：Next.js 启动时第一份加载的配置文件，
// 先于任何业务模块 import 执行。
process.env.TZ = "Asia/Shanghai";

const nextConfig: NextConfig = {
  // 允许通过 NEXT_DIST_DIR 环境变量切换构建目录，
  // 用于 prod.sh 与 dev.sh 并行运行（避免 .next/dev/lock 锁文件冲突）。
  // 未设置时保持 Next.js 默认行为（.next/）。
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // [023.05] PR2: /itineraries → /appointments 永久跳转
  // （itinerary→appointment 重命名，防存链接 + AI 历史 session 失效）。
  // Next.js 308 permanent 状态码对 SEO/书签/外链保留请求方法。
  async redirects() {
    return [
      {
        source: "/itineraries/:path*",
        destination: "/appointments/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
