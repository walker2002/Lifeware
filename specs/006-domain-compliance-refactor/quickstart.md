# Quickstart: Domain 全面合规重构

**Feature**: 006-domain-compliance-refactor
**Date**: 2026-05-15

## Prerequisites

```bash
cd frontend
docker-compose up -d
npm install
npm run db:migrate
```

## Verification Steps

### Phase 1 完成后验证

```bash
# 1. 检查四个域都有 manifest.yaml（六区块）
for domain in timebox habits okrs tasks; do
  echo "=== $domain ==="
  cat src/domains/$domain/manifest.yaml | grep -E "^(intent_triggers|lifecycle|field_metadata|list_actions|required_fields|subscribed_events):" || echo "MISSING BLOCKS"
done

# 2. 检查四个域都有 hooks.ts
for domain in timebox habits okrs tasks; do
  test -f src/domains/$domain/hooks.ts && echo "$domain: hooks.ts OK" || echo "$domain: MISSING hooks.ts"
done

# 3. 检查 registry 存在
test -f src/domains/registry.ts && echo "registry.ts OK" || echo "MISSING registry.ts"

# 4. 运行现有测试
npm test
```

### Phase 2 完成后验证

```bash
# 1. State Machine 不引用具体域对象
grep -rn "Timebox\|Habit\|Objective\|KeyResult\|Task\b\|Project\b" src/nexus/core/state-machine/index.ts && echo "FAIL: 域类型耦合" || echo "OK: 无域类型耦合"

# 2. Orchestrator 无域专属方法
grep -n "executeHabitIntent\|executeOKRIntent\|toHabitAction\|toOKRAction\|toLifecycleAction" src/nexus/orchestrator/index.ts && echo "FAIL: 域专属方法残留" || echo "OK: 无域专属方法"

# 3. transitions.ts 已删除
test -f src/nexus/core/state-machine/transitions.ts && echo "FAIL: 文件未删除" || echo "OK: 已删除"

# 4. 运行测试
npm test

# 5. 构建验证
npm run build
```

### Phase 3 完成后验证

```bash
# 1. Repository 已搬迁
for domain in timebox habits okrs tasks; do
  test -d src/domains/$domain/repository.ts -o -d src/domains/$domain/repository && echo "$domain: repo OK" || echo "$domain: MISSING repo"
done

# 2. UI 组件已搬迁
for domain in timebox habits okrs tasks; do
  test -d src/domains/$domain/pages && echo "$domain: pages OK" || echo "$domain: MISSING pages"
done

# 3. app/ 路由仅做薄壳导入
grep -c "import" src/app/projects/page.tsx  # 应为 1-2 行

# 4. 完整构建和测试
npm run build && npm test
```

## Rollback

如果重构出现问题：
- Phase 1/3 是文件搬迁，可以通过 git revert 回退
- Phase 2 是核心引擎变更，建议在独立分支上完成验证后再合并
