#!/usr/bin/env bash
# migrate-prod.sh — 生产库迁移脚本
#
# 用法: cd frontend && bash scripts/migrate-prod.sh
#
# 从 .env.production 读取 DATABASE_URL，
# 对生产库执行 drizzle-kit migrate。
#
# 前置条件：
#   1. docker-compose --profile production up -d postgres_prod 已启动
#   2. frontend/.env.production 已配置正确的 DATABASE_URL

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# ─── 加载生产库连接串 ───────────────────────────────────
if [ ! -f ".env.production" ]; then
  echo -e "${RED}[FAIL]${NC} .env.production 文件不存在"
  echo "请先创建 frontend/.env.production（参考 .env.production 模板）"
  exit 1
fi

# 从 .env.production 提取 DATABASE_URL
DATABASE_URL_LINE=$(grep '^DATABASE_URL=' .env.production | head -1)
if [ -z "$DATABASE_URL_LINE" ]; then
  echo -e "${RED}[FAIL]${NC} .env.production 中未找到 DATABASE_URL"
  exit 1
fi

# 提取引号中的值（兼容双引号和无引号两种格式）
DB_URL=$(echo "$DATABASE_URL_LINE" | sed -E 's/^DATABASE_URL="?([^"]*)"?.*/\1/')
export DATABASE_URL="$DB_URL"

echo ">>> 迁移目标: ${DATABASE_URL%%@*}@***:${DATABASE_URL##*:}"

# ─── 执行迁移 ──────────────────────────────────────────
npx drizzle-kit migrate

echo -e "${GREEN}>>> 生产库迁移完成${NC}"
