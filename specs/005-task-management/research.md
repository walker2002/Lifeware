# Research: 任务管理系统

**Phase 0 — 解决技术不确定性** | **Date**: 2026-05-12

## R1: LLM 任务提取 Prompt 设计

### Decision
复用 OKR 导入的 `file-parser.ts` 管道（文件验证→文本提取→LLM 提取→结构化输出），设计专用的任务提取 prompt。提取结果以 JSON 结构返回，前端渲染为预览 Markdown。

### Rationale
- OKR 导入已验证此管道可行（`frontend/src/lib/okr-import/file-parser.ts`）
- OpenAI SDK（`openai` v6.35）已在依赖中，无需新增
- Prompt 输出 JSON 而非 Markdown，便于前端编辑和验证

### Prompt 设计要点

```typescript
// LLM 输入：模板文本 + 字段说明（HTML 注释被忽略）
// LLM 输出：结构化 JSON
{
  project: { name, priority, defaultEarliestTime, defaultLatestStartTime, description },
  tasks: [
    { title, estimatedDuration, priority, energyRequired, frequencyType,
      depth: 0|1,  // 0=顶级任务，1=子任务
      children: [...] }
  ]
}
```

### Alternatives Considered
- **直接 Markdown 渲染（无 LLM）**: 简单但无法处理拼写错误、格式变体、非标准缩写。AI 提取提供容错性。
- **LangChain**: 引入新依赖，过度设计。直接 OpenAI SDK 调用足够。

### 降级策略
AI 调用失败时，回退到手动表单创建（template-form fallback），符合 Constitution VIII。

---

## R2: 状态迁移兼容策略

### Decision
采用**双状态兼容期**策略：新代码写入 `in_progress`，读取时兼容 `scheduled`。

### Rationale
- 现有数据可能有 `scheduled` 状态的任务，不能直接删除枚举值
- 数据库枚举列在 Drizzle 中为 text 类型（非 PostgreSQL ENUM），添加新值不会锁表
- 无需数据迁移脚本——`scheduled` 在读取时映射为 `in_progress`

### 实施步骤
1. `TaskStatus` 类型新增 `'in_progress' | 'on_hold'`，保留 `'scheduled'`
2. Repository 读取时做映射：`row.status === 'scheduled' ? 'in_progress' : row.status`
3. USOM 类型中 `TaskStatus` 标记 `scheduled` 为 `@deprecated`
4. 后续迭代可添加数据迁移脚本将 `scheduled` 批量更新为 `in_progress`

### 影响范围
- `frontend/src/usom/types/primitives.ts`: TaskStatus 类型
- `frontend/src/lib/db/schema.ts`: tasks.status 枚举
- `frontend/src/lib/db/repositories/task.repository.ts`: 状态映射
- `frontend/src/lib/db/repositories/mappers.ts`: taskRowToUSOM

### Alternatives Considered
- **立即迁移所有 `scheduled` 数据**: 需要停机迁移，MVP 阶段不必要。兼容读取是零风险方案。
- **保留 `scheduled` 为合法状态**: 语义不清晰（"已排期" vs "执行中"），与新的 `in_progress` 重叠。

---

## R3: 模板→实例映射算法

### Decision
采用**两遍算法**：第一遍创建所有顶级任务（记录 template_id→new_id 映射），第二遍创建子任务（将 `parent_template_id` 替换为映射后的 `parent_id`）。

### Rationale
- 模板中的子任务通过 `parent_template_id` 自关联
- 实例创建后，子任务需要通过新的 `parent_id` 关联到新的父任务
- 两遍创建 + ID 映射表是标准模式，清晰可测试

### 算法伪代码

```typescript
async function createFromTemplate(templateId: string, userId: string, dates: { startDate, endDate }): Promise<Project> {
  // 1. 加载模板
  const projectTmpl = await templateRepo.findProjectById(templateId)
  const taskTmpls = await templateRepo.findTasksByProject(templateId)

  // 2. 创建项目实例
  const project = await projectRepo.create({ ...projectTmpl, ...dates, status: 'planning' })

  // 3. 第一遍：创建顶级任务（parent_template_id = null）
  const idMap = new Map<string, string>() // templateId → newTaskId
  for (const tmpl of taskTmpls.filter(t => !t.parentTemplateId)) {
    const task = await taskRepo.create({ ...tmpl, projectId: project.id, status: 'draft' })
    idMap.set(tmpl.id, task.id)
  }

  // 4. 第二遍：创建子任务（替换 parent_template_id → parent_id）
  for (const tmpl of taskTmpls.filter(t => t.parentTemplateId)) {
    const parentId = idMap.get(tmpl.parentTemplateId)
    await taskRepo.create({ ...tmpl, projectId: project.id, parentId, status: 'draft' })
  }

  return project
}
```

### 注意事项
- 必须在一个事务中完成所有创建操作（使用 Drizzle `transaction`）
- ID 映射表在内存中，适合模板规模（通常 < 100 任务）

### Alternatives Considered
- **递归创建（深度优先）**: 代码更短但需要多次数据库往返，且不支持事务批量提交。
- **CTE 递归查询**: PostgreSQL 原生能力，但与 Repository 模式隔离原则冲突（业务逻辑不应放入 SQL）。

---

## R4: 周期性任务实例生成

### Decision
复用 habit_logs 的实例生成模式：在 `timebox_tasks` 中存储每日生成的周期任务实例。生成时机为每日首次访问时（lazy generation），或通过 cron/scheduler 预生成。

### Rationale
- `habits` → `habit_logs` 的 `(habitId, date)` 唯一约束模式已验证
- `timebox_tasks` 关联表已存在，无需新建表
- lazy generation 避免预生成过多无用实例

### 查询模式
```sql
-- 获取某日所有任务实例（一次性 + 周期性）
SELECT t.* FROM tasks t
WHERE t.user_id = $userId
  AND (
    t.frequency_type = 'once'
    OR (t.frequency_type IN ('daily', 'weekly', 'custom') AND t.start_date <= $date AND (t.end_date IS NULL OR t.end_date >= $date))
  )
```

### MVP 简化
- MVP 阶段仅生成未来 7 天的实例
- 频率为 `custom`（指定星期几）的任务按 `days_of_week` 字段过滤
- 不实现动态调整（如"跳过今天"），该功能后续迭代

### Alternatives Considered
- **预生成所有未来实例**: 简单但浪费存储（无限递归任务会生成无限实例）。
- **视图而非物化**: 纯查询计算，无存储开销，但无法标记实例状态（如"今日已完成"）。

---

## R5: 时间继承链纯函数

### Decision
时间参数（`earliestTime`、`latestStartTime`、`defaultTime`、`defaultDuration`）解析为纯函数，非递归循环向上查找。

### Rationale
- 两层深度（任务→项目）在 MVP 中是上限；数据模型可扩展但 UI 不暴露更深层级
- 纯函数可独立测试，不依赖 Repository

### 实现

```typescript
// frontend/src/domains/projects/time-inheritance.ts

export function resolveTaskTime(
  task: Task,
  parentTask?: Task | null,
  project?: Project | null
): ResolvedTime {
  return {
    earliestTime:    task.earliestTime    ?? parentTask?.earliestTime    ?? project?.defaultEarliestTime,
    latestStartTime: task.latestStartTime ?? parentTask?.latestStartTime ?? project?.defaultLatestStartTime,
    defaultTime:     task.defaultTime     ?? parentTask?.defaultTime     ?? undefined,
    defaultDuration: task.defaultDuration ?? parentTask?.defaultDuration ?? project?.defaultDuration,
  }
}
```

- 使用 `??`（nullish coalescing）确保显式设置的空字符串不触发继承
- `null` 和 `undefined` 均触发向上查找

### Alternatives Considered
- **递归到根**: 过度设计——MVP 只有两层。若未来扩展层级，只需将参数改为 `parents: Task[]` 数组遍历。
