# Contract: 每日计划生成

**Date**: 2026-05-09 | **Feature**: 003-habit-slice

## Flow: applyTemplate

将模板中的习惯转换为当日时间盒计划。

### Input

```typescript
interface ApplyTemplateInput {
  templateId: USOM_ID
  date: DateOnly        // 目标日期
  userId: USOM_ID
}
```

### Process

1. **加载模板**: 从 HabitTemplateRepository 获取模板及其 TemplateHabit 列表
2. **验证**: 检查 applicableDays 包含目标日期的星期几
3. **生成时间盒草稿**: 遍历 TemplateHabit 列表：
   - effectiveTime = timeOverride ?? habit.defaultTime
   - effectiveDuration = durationOverride ?? habit.defaultDuration
   - 创建 Timebox { status: 'draft', startTime: effectiveTime, duration: effectiveDuration }
   - 创建 timebox_habits 关联
4. **冲突检测**: 调用 Rule Engine 检查与已有时间盒的重叠
5. **返回草稿**: 返回生成的时间盒列表 + 冲突列表

### Output

```typescript
interface ApplyTemplateResult {
  generatedTimeboxes: Timebox[]       // 生成的时间盒草稿
  conflicts: ConflictInfo[]           // 冲突信息
  totalHabits: number                 // 模板中习惯总数
  skippedHabits: number               // 被跳过的习惯数（冲突无法解决时）
}

interface ConflictInfo {
  timeboxId: USOM_ID
  habitTitle: string
  conflictType: 'overlap' | 'energy_mismatch'
  conflictingWith: string             // 冲突对象描述
  suggestions: string[]               // 解决建议
}
```

### User Adjustment (确认前)

用户可以对草稿执行：
- **调整时间**: 在 earliestTime ~ latestEndTime 范围内拖拽
- **压缩时长**: 不低于 minDuration
- **跳过习惯**: 删除该习惯对应的时间盒和关联

### Confirm (确认生效)

```typescript
interface ConfirmTemplateResult {
  confirmedTimeboxIds: USOM_ID[]      // 确认的时间盒 ID
  allTransitioned: boolean            // 是否全部 draft → planned
}
```

确认后所有时间盒从 `draft` → `planned`。习惯本身状态不变。

## Integration with Existing Systems

| Component | Integration Point |
|-----------|-------------------|
| TimeboxRepository | 创建/更新时间盒 |
| timebox_habits | 关联时间盒与习惯 |
| Rule Engine | 冲突检测（复用 timebox-overlap 框架） |
| Event Bus | 发布 TemplateApplied 事件 |
| Orchestrator | 协调 applyTemplate 流程 |
