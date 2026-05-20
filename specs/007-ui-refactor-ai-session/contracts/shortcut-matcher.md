# UI Contract: Shortcut Matcher

**Feature**: 007-ui-refactor-ai-session  
**Type**: Intent Engine preprocessing contract

## Interface

```typescript
function matchShortcut(rawInput: string): ShortcutMatch | undefined

interface ShortcutMatch {
  domainId: string
  action: string
  confidence: 1.0  // 快捷方式匹配始终为确定性匹配
}
```

## Matching Rules

### Rule 1: 长格式 `/domain:action`

```
Pattern:  /^/(\w+):([\w-]+)$/
Example:  /habits:createHabit
Priority: 最高（无歧义，直接定位 Domain）
```

1. 解析 domainId 和 action
2. 验证 Domain 存在且已注册
3. 验证 action 在 Domain 的 intent_triggers 中存在
4. 返回 `{ domainId, action, confidence: 1.0 }`

### Rule 2: 短格式 `/action`

```
Pattern:  /^/([\w-]+)$/
Example:  /createHabit
Priority: 次（全局唯一性查询）
```

1. 在 Registry 中按 shortcut 别名查询
2. 返回对应的 `{ domainId, action, confidence: 1.0 }`
3. 无匹配时返回 `undefined`

### Rule 3: 无匹配

返回 `undefined`，走自然语言路由（Intent Engine Phase A）。

## Validation Contract

### 启动时校验

Registry 初始化时遍历所有 manifest 的 `shortcut` 值：
- 检测到重复 → 抛出 `ShortcutConflictError`，系统拒绝启动
- 无重复 → 构建 `Map<shortcut, {domainId, action}>` 索引
