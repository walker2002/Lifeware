import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许通过 NEXT_DIST_DIR 环境变量切换构建目录，
  // 用于 prod.sh 与 dev.sh 并行运行（避免 .next/dev/lock 锁文件冲突）。
  // 未设置时保持 Next.js 默认行为（.next/）。
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
