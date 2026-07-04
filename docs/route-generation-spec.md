# Domain 路由生成规范

## 版本历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.1 | 2026-07-04 | Claude | 幂等写入：业务字段未变则跳过重写，避免「Generated at: 时间戳漂移」污染 git diff |
| 1.0 | 2026-05-26 | Claude | 初始版本 |

---

## 1. 背景与目标

### 1.1 问题

当前架构中，Domain 路由入口文件（`app/habits/page.tsx` 等）散落在框架层目录中，导致：
- Domain 删除时需要手动清理多个位置的文件
- 新增 Domain 需要在 `app/` 目录创建路由文件
- Domain 无法真正独立部署或移除

### 1.2 目标

实现 Domain 的完全独立性：
- 删除 Domain 目录即可完全移除该模块
- 新增 Domain 无需修改框架层代码
- `app/` 目录仅保留框架级路由和自动生成的薄层文件

---

## 2. 架构设计

### 2.1 目录结构

```
frontend/
├── app/                          # 框架层（自动生成 + 框架级路由）
│   ├── habits/page.tsx           # ← 自动生成，勿手动编辑
│   ├── projects/page.tsx         # ← 自动生成
│   └── _layout.tsx               # 框架级布局
├── domains/                      # Domain 层（独立模块）
│   ├── habits/
│   │   ├── pages/                # Domain 页面组件
│   │   │   ├── HabitListPage.tsx
│   │   ├── handlers/             # Domain 处理器
│   │   ├── providers/            # Context Providers
│   │   └── manifest.yaml         # Domain 声明（含路由定义）
│   ├── tasks/
│   │   ├── pages/
│   │   └── manifest.yaml
│   └── ...
├── scripts/
│   └── generate-routes.ts        # 路由生成脚本
└── nexus/                        # 核心框架
```

### 2.2 分层职责

| 层 | 目录 | 职责 | 维护方式 |
|---|---|---|---|
| **路由层** | `app/` | URL 映射 | 自动生成 |
| **Domain 层** | `domains/` | 业务逻辑、组件、声明 | Domain 开发者维护 |
| **框架层** | `nexus/` | 意图引擎、编排器 | 框架团队维护 |

---

## 3. manifest.yaml 路由声明规范

### 3.1 扩展 view_routes 区块

每个 Domain 的 `manifest.yaml` 中，`view_routes` 区块需增加 `url` 字段：

```yaml
view_routes:
  view_list:
    component: domains/habits/pages/HabitListPage
    url: /habits                    # 新增：声明对应的 URL 路径
    params:                         # 可选：路径参数
      mode: list

  view_detail:
    component: domains/habits/pages/HabitDetailPage
    url: /habits/[id]               # 支持 Next.js 动态路由语法
```

### 3.2 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `component` | string | 是 | 组件路径，相对于 `src/` 目录 |
| `url` | string | **是** | Next.js App Router 路径 |
| `params` | object | 否 | 传递给组件的静态参数 |

### 3.3 URL 命名规范

- 使用 kebab-case：`/okr-objectives` 而非 `/okrObjectives`
- 复数形式表示列表：`/habits`、`/projects`
- 单数形式表示详情：`/habits/[id]`、`/projects/[id]`
- 子资源使用路径嵌套：`/okrs/objectives`

---

## 4. 路由文件生成规则

### 4.1 生成脚本

```bash
npm run generate:routes
```

### 4.2 生成文件格式

生成的路由文件应包含以下头部注释：

```tsx
// ---
// Auto-generated from domains/habits/manifest.yaml
// DO NOT EDIT MANUALLY
// Generated at: 2026-05-26T10:30:00Z
// ---

import { HabitListPage } from "@/domains/habits/pages/HabitListPage"

export default function HabitsListPage() {
  return <HabitListPage />
}
```

### 4.3 生成规则

| 规则 | 说明 |
|---|---|---|
| 文件位置 | `app/{url_path}/page.tsx`（去掉开头的 `/`） |
| 动态路由 | `[id]` 转换为 Next.js 的 `[id]` 目录 |
| 嵌套路径 | `/okrs/objectives` → `app/okrs/objectives/page.tsx` |
| 覆盖策略 | 默认不覆盖已存在文件（除非 `--force`） |
| 空目录处理 | 自动创建中间目录 |
| **幂等写入** | 业务字段（component/url/params）未变则跳过重写；时间戳行不计入比对，否则每次 dev/build 都会留下「时间戳漂移」 |

### 4.4 示例映射

| manifest url | 生成文件路径 |
|---|---|
| `/habits` | `app/habits/page.tsx` |
| `/okrs/objectives` | `app/okrs/objectives/page.tsx` |
| `/habits/[id]` | `app/habits/[id]/page.tsx` |
| `/projects` | `app/projects/page.tsx` |

---

## 5. 构建脚本规范

### 5.1 脚本位置

```
scripts/generate-routes.ts
```

### 5.2 脚本功能

```typescript
// scripts/generate-routes.ts

interface GenerateRoutesOptions {
  force?: boolean      // 是否覆盖已存在文件
  watch?: boolean      // 监听模式
  domains?: string[]   // 指定 Domain，默认全部
}

// 主要功能：
// 1. 扫描 domains/ 目录下所有 manifest.yaml
// 2. 解析 view_routes 区块
// 3. 生成对应的 app/ 目录下的路由文件
// 4. 报告生成结果
```

### 5.3 package.json 集成

```json
{
  "scripts": {
    "generate:routes": "tsx scripts/generate-routes.ts",
    "generate:routes:watch": "tsx scripts/generate-routes.ts --watch",
    "generate:routes:force": "tsx scripts/generate-routes.ts --force",
    "predev": "npm run generate:routes",
    "prebuild": "npm run generate:routes"
  }
}
```

### 5.4 错误处理

脚本应在以下情况报错并退出：
- manifest.yaml 中 `url` 字段缺失
- `url` 格式无效（不以 `/` 开头）
- component 文件不存在
- 目标文件已存在且非自动生成（缺少 `--force`）

---

## 6. Domain 开发流程

### 6.1 新增 Domain

1. 在 `domains/` 创建新目录
2. 创建 `manifest.yaml`，填写 `view_routes.url`
3. 实现组件文件
4. 运行 `npm run generate:routes`
5. 验证路由可访问

### 6.2 删除 Domain

1. 删除 `domains/{domain}/` 目录
2. 运行 `npm run generate:routes --clean`（清理孤立路由）
3. 验证其他 Domain 正常

### 6.3 修改路由

1. 修改 `manifest.yaml` 中的 `url`
2. 运行 `npm run generate:routes --force`
3. 手动删除旧路由文件（如有）

---

## 7. 注意事项

### 7.1 不得手动编辑

- `app/` 下自动生成的文件头部有 `DO NOT EDIT MANUALLY` 标记
- 手动编辑会在下次生成时被覆盖

### 7.2 特殊路由处理

以下路由不属于 Domain，需手动维护在 `app/`：
- 根路径 `/` → `app/page.tsx`
- 登录页 `/login` → `app/login/page.tsx`
- 系统设置 `/settings` → `app/settings/page.tsx`

### 7.3 冲突检测

生成脚本应检测并报告：
- 多个 Domain 声明相同 URL
- URL 与框架级路由冲突

---

## 8. 实施计划

| 阶段 | 任务 | 状态 |
|---|---|---|
| P1 | 实现路由生成脚本 | 待开始 |
| P2 | 更新所有 Domain manifest.yaml | 待开始 |
| P3 | 迁移现有路由到自动生成 | 待开始 |
| P4 | 文档培训 | 待开始 |

---

## 9. 参考文档

- [Next.js App Router 文档](https://nextjs.org/docs/app)
- [Domain Manifest 规范](./domain-manifest-spec.md)
- [Nexus 架构设计](../mydocs/core/总体设计.md)
