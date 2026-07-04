#!/usr/bin/env bash
# prod.sh — Lifeware 生产环境一键启动脚本
#
# 用法:
#   ./prod.sh              → 启动生产库 + 应用（数据层不动，安全默认）
#   ./prod.sh --migrate     → 备份 → 迁移 → seed → 启动应用（数据库同步）
#   ./prod.sh --backup-only → 仅备份生产库到 backups/ 目录
#
# 与 dev.sh 的差异：
#   - 启动 postgres_prod 容器（profile: production，端口 5433）
#   - 使用 .env.production 的 DATABASE_URL
#   - 种子数据仅包含最小用户创建（seed-prod.ts，无演示数据）
#   - 默认不执行迁移（生产库安全第一）

set -euo pipefail

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ─── tsconfig.json 自动恢复 ────────────────────────────
# 当 NEXT_DIST_DIR=.next-prod 时，Next.js 启动会自动往 tsconfig.json 的
# `include` 注入 `.next-prod/types/**/*.ts` 并把整个文件重写（数组展开成多行）。
# 这是 Next.js 的默认行为，无法禁用。脚本退出时把 tsconfig.json 还原到进入前
# 的状态，避免每次跑 prod.sh 都留下「莫名其妙的修改」。
TSCONFIG_FILE="$SCRIPT_DIR/frontend/tsconfig.json"
TSCONFIG_BAK="$(mktemp)"
if [ -f "$TSCONFIG_FILE" ]; then
  cp "$TSCONFIG_FILE" "$TSCONFIG_BAK"
fi
restore_tsconfig() {
  if [ -f "$TSCONFIG_BAK" ]; then
    cp "$TSCONFIG_BAK" "$TSCONFIG_FILE"
    rm -f "$TSCONFIG_BAK"
  fi
}
trap restore_tsconfig EXIT

# ─── 参数解析 ──────────────────────────────────────────
DO_MIGRATE=false
BACKUP_ONLY=false

for arg in "$@"; do
  case $arg in
    --migrate)      DO_MIGRATE=true ;;
    --backup-only)  BACKUP_ONLY=true ;;
    *)              fail "未知参数: $arg（可用: --migrate, --backup-only）" ;;
  esac
done

# ─── 前置检查 ──────────────────────────────────────────
if [ ! -f "frontend/.env.production" ]; then
  fail "frontend/.env.production 不存在，请先创建并配置生产数据库密码"
fi

# ─── 1. 启动生产库容器 ──────────────────────────────────
info "启动生产数据库 (postgres_prod, 端口 5433)..."
docker-compose --profile production up -d postgres_prod

# ─── 2. 等待数据库就绪 ──────────────────────────────────
info "等待数据库就绪..."
max_retries=30
retry=0
until docker-compose exec -T postgres_prod pg_isready -U lifeware > /dev/null 2>&1; do
  retry=$((retry + 1))
  if [ $retry -ge $max_retries ]; then
    fail "生产数据库启动超时 (${max_retries}s)"
  fi
  sleep 1
done
ok "生产数据库已就绪 (端口 5433)"

# ─── 2b. 仅备份模式 ────────────────────────────────────
if [ "$BACKUP_ONLY" = true ]; then
  echo ""
  info "执行生产库备份..."
  cd frontend
  bash scripts/backup-prod.sh
  ok "备份完成"
  exit 0
fi

# ─── 2c. 检查迁移状态 ──────────────────────────────────
cd frontend

# 检查 drizzle.__drizzle_migrations 表中有多少已应用的迁移
APPLIED_COUNT=$(docker-compose exec -T postgres_prod psql -U lifeware -d lifeware -tAc \
  "SELECT COUNT(*) FROM drizzle.__drizzle_migrations;" 2>/dev/null || echo "0")

# 统计 migrations 目录中的 SQL 迁移文件数
TOTAL_MIGRATIONS=$(ls -1 src/lib/db/migrations/*.sql 2>/dev/null | wc -l)

# ─── 计算待执行迁移数 ────────────────────────────────
PENDING=$(( TOTAL_MIGRATIONS - APPLIED_COUNT ))

# ─── 3. 迁移分支 ──────────────────────────────────────
if [ "$DO_MIGRATE" = true ]; then
  echo ""

  if [ "$PENDING" -eq 0 ]; then
    ok "迁移状态: ${APPLIED_COUNT}/${TOTAL_MIGRATIONS} 全部已应用，无需迁移"
    echo ""
  else
    # ─── 3a. 迁移前备份 ⚠️ ────────────────────────────
    warn "⚠️  检测到 ${PENDING} 个待执行迁移，先自动备份..."
    bash scripts/backup-prod.sh
    ok "迁移前备份完成"
    echo ""

    # ─── 3b. 运行迁移 ──────────────────────────────────
    info "运行生产库迁移 (${PENDING} 个)..."
    bash scripts/migrate-prod.sh
    ok "生产库迁移完成"
    echo ""

    # ─── 3c. 种子数据（幂等）───────────────────────────
    info "刷新生产库种子数据（幂等，已有数据不重复插入）..."
    npx tsx scripts/seed-prod.ts
    ok "种子数据已就绪"
    echo ""
  fi

else
  # 非 --migrate 模式：仅报告状态
  if [ "$PENDING" -gt 0 ]; then
    warn "⚠️  迁移状态: ${APPLIED_COUNT}/${TOTAL_MIGRATIONS} 已应用，${PENDING} 个待执行"
    warn "   如需同步数据库，请运行: ./prod.sh --migrate"
    echo ""
  else
    ok "迁移状态: ${APPLIED_COUNT}/${TOTAL_MIGRATIONS} 全部已应用"
    echo ""
  fi
fi

# ─── 4. 切换环境变量 → 生产库 ──────────────────────────
# 关键：必须 export DATABASE_URL，否则 Next.js 启动时会读 .env.local 回退到开发库
PROD_DB_URL=$(grep '^DATABASE_URL=' .env.production | head -1 | sed -E 's/^DATABASE_URL="([^"]*)"/\1/')
export DATABASE_URL="$PROD_DB_URL"

# ─── 5. 启动 Next.js ──────────────────────────────────
# 与 dev.sh 并行运行：使用不同端口 (3001) + 不同 distDir (.next-prod)
# 避免 .next/dev/lock 锁文件冲突和端口冲突
PROD_PORT="${PROD_PORT:-3001}"
PROD_DIST_DIR="${PROD_DIST_DIR:-.next-prod}"
export PORT="$PROD_PORT"
export NEXT_DIST_DIR="$PROD_DIST_DIR"

info "启动 Next.js 开发服务器（连生产库，端口 $PROD_PORT）..."
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Lifeware 生产环境已就绪${NC}"
echo -e "${GREEN}  前端: http://localhost:${PROD_PORT}${NC}"
echo -e "${GREEN}  数据库: postgresql://lifeware:****@localhost:5433/lifeware${NC}"
echo -e "${GREEN}  用户: mvp@lifeware.app${NC}"
echo -e "${GREEN}  迁移状态: ${APPLIED_COUNT}/${TOTAL_MIGRATIONS}${NC}"
if [ "$DO_MIGRATE" != true ] && [ "$PENDING" -gt 0 ]; then
  echo -e "${YELLOW}  ⚠️  有 ${PENDING} 个迁移待执行 → ./prod.sh --migrate${NC}"
fi
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""

npx next dev -H 0.0.0.0 -p "$PROD_PORT"
