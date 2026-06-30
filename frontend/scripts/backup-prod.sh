#!/usr/bin/env bash
# backup-prod.sh — 生产库备份脚本
#
# 用法: cd frontend && bash scripts/backup-prod.sh
#
# 使用 pg_dump 导出生产库数据，gzip 压缩后存入 backups/ 目录。
# 文件名格式: lifeware_prod_YYYYMMDD_HHMMSS.sql.gz
#
# 依赖：pg_dump（PostgreSQL 客户端工具，通常已随 postgresql-client 安装）
#
# 建议：每次生产库迁移前执行一次备份。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ─── 参数解析 ──────────────────────────────────────────
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="${BACKUP_DIR}/lifeware_prod_${TIMESTAMP}.sql.gz"

# ─── 加载生产库连接串 ───────────────────────────────────
if [ ! -f ".env.production" ]; then
  echo -e "${RED}[FAIL]${NC} .env.production 文件不存在"
  exit 1
fi

# 解析 postgresql://user:password@host:port/dbname
DB_URL=$(grep '^DATABASE_URL=' .env.production | head -1 | sed -E 's/^DATABASE_URL="([^"]*)"/\1/')

# 简易解析（不引入额外依赖）
DB_USER=$(echo "$DB_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
DB_PASS=$(echo "$DB_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
DB_HOST=$(echo "$DB_URL" | sed -E 's|postgresql://[^@]+@([^:]+):.*|\1|')
DB_PORT=$(echo "$DB_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed -E 's|.*/([^/?]+).*|\1|')

echo -e ">>> 备份目标: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo ">>> 输出文件: ${FILE}"

# ─── 执行备份 ──────────────────────────────────────────
if ! command -v pg_dump &> /dev/null; then
  echo -e "${RED}[FAIL]${NC} pg_dump 未安装"
  echo "请安装 PostgreSQL 客户端: sudo apt install postgresql-client"
  exit 1
fi

PGPASSWORD="$DB_PASS" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-acl \
  | gzip > "$FILE"

if [ $? -eq 0 ] && [ -s "$FILE" ]; then
  SIZE=$(du -h "$FILE" | cut -f1)
  echo -e "${GREEN}>>> 备份完成: ${FILE} (${SIZE})${NC}"
else
  echo -e "${RED}[FAIL]${NC} 备份失败"
  rm -f "$FILE"
  exit 1
fi
