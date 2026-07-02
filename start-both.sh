#!/usr/bin/env bash
# start-both.sh — 一键并行启动 dev.sh + prod.sh
#
# 用法:
#   ./start-both.sh                  # 使用默认日志目录 /tmp/lifeware-logs
#   LOG_DIR=/var/log/lifeware ./start-both.sh
#
# 行为:
#   - 后台拉起 dev.sh (端口 3000, db 5432) 和 prod.sh (端口 3001, db 5433)
#   - 轮询等待双端 Next.js 输出 "Ready in"，最多 90s
#   - 任一进程异常退出立即报错并停止另一个
#   - 双端就绪后 tail -f 两个日志（每行带文件名头）
#   - Ctrl+C / SIGTERM 触发 cleanup：向两个进程组发 SIGTERM，
#     10s 未退再 SIGKILL，最后保留日志到 LOG_DIR
#
# 设计要点:
#   - 后台启动时 bash 自动把每个 job 放到独立进程组 (pgid = 子进程 PID)
#   - cleanup 用 `kill -- -$PID` 向整个进程组发信号，能级联杀掉 dev.sh →
#     npm → node → next-dev，避免残留孤儿进程占端口/锁
#   - 日志写入文件而非直接 pipe 到终端，让 tail -f 接管输出显示，
#     同时保留事后回看能力（dev.log / prod.log）

set -euo pipefail

# ─── 颜色 ──────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}   $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

# ─── 路径与日志 ────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

LOG_DIR="${LOG_DIR:-/tmp/lifeware-logs}"
mkdir -p "$LOG_DIR"
DEV_LOG="$LOG_DIR/dev.log"
PROD_LOG="$LOG_DIR/prod.log"
: > "$DEV_LOG"
: > "$PROD_LOG"

# ─── 进程清理（Ctrl+C / SIGTERM 触发）──────────────
DEV_PID=""
PROD_PID=""

cleanup() {
  echo ""
  warn "正在关闭 dev.sh + prod.sh..."

  # 1) 先向两个进程组发 SIGTERM（pgid = 子进程 PID）
  for pid in "$DEV_PID" "$PROD_PID"; do
    [ -n "$pid" ] && kill -TERM -- -"$pid" 2>/dev/null || true
  done

  # 2) 等最多 10 秒让其自然退出
  for _ in $(seq 1 20); do
    alive=0
    for pid in "$DEV_PID" "$PROD_PID"; do
      [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && alive=1
    done
    [ "$alive" -eq 0 ] && break
    sleep 0.5
  done

  # 3) 还没死的强杀
  for pid in "$DEV_PID" "$PROD_PID"; do
    [ -n "$pid" ] && kill -KILL -- -"$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true

  ok "已清理。日志保留在: $LOG_DIR"
  exit 0
}
trap cleanup INT TERM

# ─── 1. 后台拉起两个脚本 ─────────────────────────────
info "启动 dev.sh  → 端口 3000 / 数据库 5432 ..."
./dev.sh > "$DEV_LOG" 2>&1 &
DEV_PID=$!

info "启动 prod.sh → 端口 3001 / 数据库 5433 ..."
./prod.sh > "$PROD_LOG" 2>&1 &
PROD_PID=$!

ok "dev.sh  PID=$DEV_PID"
ok "prod.sh PID=$PROD_PID"

# ─── 2. 轮询等 Next.js 双端 Ready ──────────────────
info "等待双端 Next.js 输出 'Ready in'（最长 90s）..."

for _ in $(seq 1 90); do
  # 任一异常退出立即失败
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    echo ""
    fail "dev.sh 异常退出，详情见 $DEV_LOG"
  fi
  if ! kill -0 "$PROD_PID" 2>/dev/null; then
    echo ""
    fail "prod.sh 异常退出，详情见 $PROD_LOG"
  fi

  # 双端都 Ready 则跳出
  if grep -q "Ready in" "$DEV_LOG" 2>/dev/null \
     && grep -q "Ready in" "$PROD_LOG" 2>/dev/null; then
    break
  fi
  sleep 1
done

# ─── 3. 输出就绪横幅 + tail 双日志 ─────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ 双端已就绪${NC}"
echo -e "${GREEN}    dev:  http://localhost:3000  →  db=localhost:5432${NC}"
echo -e "${GREEN}    prod: http://localhost:3001  →  db=localhost:5433${NC}"
echo -e "${GREEN}  停止: Ctrl+C${NC}"
echo -e "${GREEN}  日志: $DEV_LOG${NC}"
echo -e "${GREEN}        $PROD_LOG${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""

# tail -f 多文件模式会自动给每行加 "==> filename <==" 头
tail -n 0 -f "$DEV_LOG" "$PROD_LOG"