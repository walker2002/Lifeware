#!/usr/bin/env bash
# Lifeware 开发环境一键启动脚本
# 用法: ./dev.sh [--skip-seed] [--clean]
#
# 选项:
#   --skip-seed   跳过种子数据填充
#   --clean       清空数据库并重新迁移 + 填充数据

set -euo pipefail

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

SKIP_SEED=false
CLEAN=false

for arg in "$@"; do
  case $arg in
    --skip-seed) SKIP_SEED=true ;;
    --clean) CLEAN=true ;;
  esac
done

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ─── 1. 启动 PostgreSQL ─────────────────────────────────────
info "启动 PostgreSQL..."
docker-compose up -d

# ─── 2. 等待数据库就绪 ──────────────────────────────────────
info "等待数据库就绪..."
max_retries=30
retry=0
until docker-compose exec -T postgres pg_isready -U lifeware_dev > /dev/null 2>&1; do
  retry=$((retry + 1))
  if [ $retry -ge $max_retries ]; then
    fail "数据库启动超时 (${max_retries}s)"
  fi
  sleep 1
done
ok "PostgreSQL 已就绪"

# ─── 3. 清空数据库（可选）──────────────────────────────────
if [ "$CLEAN" = true ]; then
  warn "清空数据库..."
  docker-compose exec -T postgres psql -U lifeware_dev -d lifeware_dev \
    -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" > /dev/null 2>&1
  ok "数据库已清空"
fi

# ─── 4. 运行数据库迁移 ──────────────────────────────────────
info "运行数据库迁移..."
cd frontend
npx drizzle-kit migrate
ok "数据库迁移完成"

# ─── 5. 填充种子数据 ────────────────────────────────────────
if [ "$SKIP_SEED" = false ]; then
  info "填充种子数据..."
  npx tsx scripts/seed-dev.ts
  ok "种子数据已就绪"
else
  warn "跳过种子数据"
fi

# ─── 6. 启动 Next.js 开发服务器 ─────────────────────────────
info "启动 Next.js 开发服务器..."
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Lifeware 开发环境已就绪${NC}"
echo -e "${GREEN}  前端: http://localhost:3000${NC}"
echo -e "${GREEN}  数据库: postgresql://lifeware_dev:dev_password_here@localhost:5432/lifeware_dev${NC}"
echo -e "${GREEN}  测试用户: dev@lifeware.app${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""

npm run dev
