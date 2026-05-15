# Domain 合并：projects → tasks

**日期**：2026-05-15
**类型**：架构调整
**范围**：Domain 插件层

## 背景

`domains/projects/` 和 `domains/tasks/` 在目录层面是两个独立 Domain，但实际工作代码中 projects 和 tasks 紧密关联（tasks 有 `projectId` FK，UI 在同一个页面）。Domain 层尚未被 Nexus 集成，分离没有实际意义，反而增加维护负担。

## 设计

### 变更

1. **删除** `domains/projects/` 整个目录
2. **新建** `domains/tasks/index.ts`，将原 `projects/index.ts` 的 DomainPlugin 代码移入
3. **修改** `domains/tasks/manifest.yaml`，补充 project 相关事件

### 不变

- DB 层：`projects` 和 `tasks` 表保持独立，FK 关系不变
- Repository 层：`ProjectRepository`、`TaskRepository` 不变
- USOM 类型：`Project`、`Task` 类型不变
- UI：`app/projects/` 路径不变
- 组件：`components/projects/` 路径不变
- Server Actions：不变

### 插件 manifest 更新

- `domainId`: `'projects'` → `'tasks'`
- 保留全部 project + task 事件订阅
- 保留全部 onValidate / onEvent / onActionSurfaceRequest 逻辑

### 测试

测试文件从 `projects/__tests__/index.test.ts` 移至 `tasks/__tests__/index.test.ts`。
