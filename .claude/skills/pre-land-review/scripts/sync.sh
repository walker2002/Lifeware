#!/usr/bin/env bash
# @file sync.sh @brief 同步本地 /pre-land-review shadow skill 从 ~/.claude/skills/gstack/review/
#
# 用法：bash .claude/skills/pre-land-review/scripts/sync.sh
# 触发时机：gstack 升级后（通过 ~/.claude/skills/gstack/gstack-upgrade SKILL 自动升级）
#
# 幂等：每次都从 src 通过 sed 流式转换到 dst，不做「先 cp 覆盖再 sed 修复」（中断会留错版）。
# SSOT: ~/.claude/skills/gstack/review/（gstack 安装的源）
# Shadow: .claude/skills/pre-land-review/（本项目本地）
#
# 改名映射：
#   name: review → pre-land-review
#   .claude/skills/review/{checklist,greptile-triage}.md → pre-land-review/{...}.md
#   See `review/specialists/` for these. → See `specialists/` (in this same directory)
#   description: Pre-landing PR review. (gstack) → shadow 注释版

set -euo pipefail

SRC="${HOME}/.claude/skills/gstack/review"
DST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -d "$SRC" ]; then
  echo "FATAL: 源不存在 $SRC" >&2
  echo "  gstack 可能没安装或路径变更。" >&2
  exit 1
fi
if [ ! -d "$DST" ]; then
  echo "FATAL: 本地 shadow 目录不存在 $DST" >&2
  exit 1
fi

echo "Sync: $SRC → $DST"
echo "─────────────────────────"

# 通用 transforms（所有运行时文件适用）
COMMON_SED=(
  -e 's|^name: review$|name: pre-land-review|'
  -e 's|`\.claude/skills/review/checklist\.md`|`\.claude/skills/pre-land-review/checklist\.md`|g'
  -e 's|`\.claude/skills/review/greptile-triage\.md`|`\.claude/skills/pre-land-review/greptile-triage\.md`|g'
  -e 's|^description: Pre-landing PR review\. (gstack)$|description: Pre-landing PR review (local shadow of gstack/review, renamed because Claude Code built-in /review shadows it). (gstack)|'
)

sync_one() {
  local src_file="$1"
  local dst_file="$2"
  local extra_sed=("${@:3}")
  # 流式：src 出发 → sed 链转换 → dst。中断时不会留下「cp 完未 sed」的错版。
  # 用 sponge 友好版（写到临时文件再 rename）：原子写避免 partial。
  local tmp
  tmp="$(mktemp "${DST}/.sync.XXXXXX")"
  sed "${COMMON_SED[@]}" "${extra_sed[@]}" "$src_file" > "$tmp"
  mv -f "$tmp" "$dst_file"
}

# 1. 运行时文件
synced=0
for f in SKILL.md checklist.md design-checklist.md greptile-triage.md TODOS-format.md; do
  [ -f "$SRC/$f" ] || continue
  extra=()
  if [ "$f" = "checklist.md" ]; then
    extra=(-e 's|See `review/specialists/` for these\.|See `specialists/` (in this same directory) for these.|')
  fi
  sync_one "$SRC/$f" "$DST/$f" "${extra[@]}"
  echo "  ✓ $f"
  synced=$((synced + 1))
done

# 2. specialists/ 子目录（不需要 transform，引用的是 gstack 原版路径）
if [ -d "$SRC/specialists" ]; then
  mkdir -p "$DST/specialists"
  rm -f "$DST/specialists/"*.md 2>/dev/null || true
  spec_count=0
  for f in "$SRC/specialists/"*.md; do
    [ -f "$f" ] || continue
    cp "$f" "$DST/specialists/$(basename "$f")"
    spec_count=$((spec_count + 1))
  done
  echo "  ✓ specialists/ ($spec_count files)"
fi

echo "─────────────────────────"
echo "DONE. synced $synced runtime files."
echo ""
echo "Verify:"
if grep -q 'name: pre-land-review' "$DST/SKILL.md"; then
  echo "  ✓ SKILL.md name OK"
else
  echo "  ✗ SKILL.md name mismatch" >&2
  exit 1
fi
if grep -rnq '\.claude/skills/review/' "$DST/SKILL.md" "$DST/checklist.md" 2>/dev/null; then
  echo "  ✗ stale .claude/skills/review/ path found" >&2
  exit 1
else
  echo "  ✓ no stale .claude/skills/review/ paths"
fi
