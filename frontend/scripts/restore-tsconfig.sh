#!/usr/bin/env sh
# @file restore-tsconfig
# @brief 检测并还原被 Next.js 注入的 .next-prod/types 路径
#
# 背景：当 NEXT_DIST_DIR=.next-prod 时，Next.js 16.1.6 在 `next dev` 启动时会
# 强制往 frontend/tsconfig.json 的 `include` 注入 `.next-prod/types/**/*.ts`，
# 并把整个文件重写（数组展开成多行）。这个行为无法通过配置禁用。
#
# 何时调用：本脚本由 .husky/post-checkout 和 .husky/post-merge 调用，覆盖
# 任何会导致 tsconfig.json 漂移的路径（包括绕过 prod.sh EXIT trap 的场景）：
#   - 用户在 shell 直起 `NEXT_DIST_DIR=.next-prod next dev`
#   - start-both.sh 被 SIGKILL 强杀，prod.sh 收不到退出信号
#   - 任何其他让 prod.sh EXIT trap 失效的边角情况
#
# 判定逻辑：
#   - HEAD 已有 .next-prod/types  → 用户主动 commit 过，跳过（不破坏合法变更）
#   - HEAD 没有，working tree 有  → 视为 Next.js 自动注入，从 HEAD 还原
#   - 都没有                      → 无事可做

set -e

TSCONFIG="frontend/tsconfig.json"

# 文件不存在（极少见，比如 sparse-checkout 排除了 frontend/）→ 跳过
[ -f "$TSCONFIG" ] || exit 0

# HEAD 版本也含 .next-prod/types → 视为用户已接受的合法状态，不动
if git show "HEAD:$TSCONFIG" 2>/dev/null | grep -qF '.next-prod/types'; then
  exit 0
fi

# HEAD 干净但 working tree 被污染 → 还原
if grep -qF '.next-prod/types' "$TSCONFIG" 2>/dev/null; then
  echo "[restore-tsconfig] 检测到 $TSCONFIG 被 Next.js 自动注入 .next-prod/types 路径，从 HEAD 还原"
  git checkout HEAD -- "$TSCONFIG"
fi
