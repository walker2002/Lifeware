# Quickstart: Domain 全面合规重构

**Feature**: 006-domain-compliance-refactor
**Date**: 2026-05-16 (updated)

## Prerequisites

```bash
cd frontend
docker-compose up -d
npm install          # 会安装 yaml + zod
npm run db:migrate
```

## Manifest Runtime Consumption 验证

### Phase 1 (基础设施) 完成后

```bash
# 1. 确认新依赖已安装
node -e "require('yaml'); console.log('yaml OK')"
node -e "require('zod'); console.log('zod OK')"

# 2. 确认 manifest-loader 目录存在
test -d src/domains/manifest-loader && echo "manifest-loader OK" || echo "MISSING"

# 3. 确认 plugin-factory.ts 存在
test -f src/domains/plugin-factory.ts && echo "plugin-factory OK" || echo "MISSING"
```

### Phase 2 (四域改造) 完成后

```bash
# 1. 四域 index.ts 中不再有内联 requiredFields/subscribedEvents
grep -n "requiredFields:" src/domains/*/index.ts && echo "FAIL: 硬编码残留" || echo "OK: 无硬编码 requiredFields"
grep -n "subscribedEvents:" src/domains/*/index.ts && echo "FAIL: 硬编码残留" || echo "OK: 无硬编码 subscribedEvents"

# 2. 四域 hooks.ts 中不再有 SUBSCRIBED_EVENTS 常量
grep -n "SUBSCRIBED_EVENTS" src/domains/*/hooks.ts && echo "FAIL: 硬编码残留" || echo "OK: 无 SUBSCRIBED_EVENTS 常量"

# 3. 四域 hooks.ts 导出工厂函数
for domain in timebox habits okrs tasks; do
  grep -q "export function create" src/domains/$domain/hooks.ts && echo "$domain: factory OK" || echo "$domain: MISSING factory"
done

# 4. 构建通过
npm run build
```

### Phase 3 (Nexus 改造) 完成后

```bash
# 1. Orchestrator 无 ACTION_MAP 硬编码
grep -n "ACTION_MAP" src/nexus/orchestrator/index.ts | grep -v "buildActionMap\|getActionMap" && echo "FAIL: ACTION_MAP 残留" || echo "OK: ACTION_MAP 已动态化"

# 2. lifecycle-configs.ts 已废弃或动态化
grep -n "timeboxLifecycle" src/nexus/orchestrator/lifecycle-configs.ts 2>/dev/null && echo "WARN: lifecycle-configs 未清理" || echo "OK: 已清理"

# 3. State Machine actionTimestampMap 动态化
grep -n "actionTimestampMap" src/nexus/core/state-machine/index.ts | head -5

# 4. Nexus 无域名称硬编码
grep -rn "Timebox\b\|Habit\b\|Objective\b\|KeyResult\b" src/nexus/core/state-machine/index.ts src/nexus/orchestrator/index.ts | grep -v "import\|comment\|// " && echo "FAIL: 域耦合残留" || echo "OK: 无域耦合"

# 5. 构建和测试
npm run build && npm test
```

### Manifest 校验测试

```bash
# 1. 制造一个 YAML 语法错误，验证加载器报告行号
# (手动在 manifest.yaml 中制造缩进错误，观察启动日志)

# 2. 验证合法 manifest 无警告
# (确认正常启动时无 manifest 相关错误)

# 3. 验证故障域不影响其他域
# (在某个域的 manifest 中制造错误，确认其他域正常加载)
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
