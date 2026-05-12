# Quick Start: 任务管理系统

## 1. 环境准备

```bash
cd frontend
npm install        # 确认依赖（openai、mammoth 已在依赖中）
docker-compose up -d  # 启动 PostgreSQL
```

## 2. 数据库迁移

```bash
# 生成迁移文件（新增 projects、project_templates、task_templates 表 + 扩展 tasks 表）
npm run db:generate

# 执行迁移
npm run db:migrate
```

## 3. USOM 文档更新（前置必做）

在写代码之前，按 Constitution IV 要求更新 Tier 2 文档：

1. **`docs/usom-design.md`**: 新增 Project、ProjectTemplate、TaskTemplate 类型；扩展 Task 类型（新增字段和状态值）
2. **`docs/database-design.md`**: 新增 4 张表定义 + 扩展 tasks 表

## 4. 实施顺序

### Step 1: 类型层（USOM）
- `frontend/src/usom/types/primitives.ts` — 更新 TaskStatus，新增 ProjectStatus
- `frontend/src/usom/types/objects.ts` — 新增 Project/ProjectTemplate/TaskTemplate，扩展 Task

### Step 2: 数据层（Schema + Repository）
- `frontend/src/lib/db/schema.ts` — 新增 projects/project_templates/task_templates 表，扩展 tasks 表
- `frontend/src/lib/db/repositories/mappers.ts` — 新增映射函数（projectRowToUSOM 等），更新 taskRowToUSOM（状态兼容）
- `frontend/src/lib/db/repositories/project.repository.ts` — 新 Repository
- `frontend/src/lib/db/repositories/task-template.repository.ts` — 新 Repository
- `frontend/src/lib/db/repositories/task.repository.ts` — 扩展：新增方法 + 状态映射
- `frontend/src/usom/interfaces/irepository.ts` — 新增接口

### Step 3: 域逻辑（Domain Plugin + 工具函数）
- `frontend/src/domains/projects/index.ts` — Projects 域插件（四钩子）
- `frontend/src/domains/projects/time-inheritance.ts` — 时间继承链纯函数
- `frontend/src/lib/task-import/file-parser.ts` — 复用 OKR 文件解析器
- `frontend/src/lib/task-import/task-extractor.ts` — LLM 任务提取
- `frontend/src/lib/task-import/template-markdown.ts` — 模板 Markdown 生成/解析

### Step 4: UI 组件
- `frontend/src/components/projects/` — 项目目录、详情、表单、任务列表、导入面板、模板对话框
- `frontend/src/app/projects/` — Next.js 路由页面

## 5. 测试

```bash
# 运行所有测试
npm test

# 关键测试文件
# - frontend/src/lib/time-inheritance.test.ts — 时间继承链
# - frontend/src/lib/db/repositories/__tests__/task.repository.test.ts
# - frontend/src/lib/db/repositories/__tests__/project.repository.test.ts
```

## 6. 验收检查

- [ ] 创建项目 → 添加 3 个任务 → 各添加 1 个子任务（< 3 分钟）
- [ ] 任务状态 `draft → active → in_progress → completed` 流转正常
- [ ] 子任务时间继承父任务/项目默认值
- [ ] `estimatedDuration > 720` 时显示黄色拆分提示
- [ ] 从模板创建项目（子任务 parent_template_id 正确映射）
- [ ] AI 导入 Markdown 文件提取准确率 > 80%
- [ ] 独立任务（无项目归属）在目录页显示
- [ ] 项目状态筛选（全部/进行中/已完成/已归档）正常
