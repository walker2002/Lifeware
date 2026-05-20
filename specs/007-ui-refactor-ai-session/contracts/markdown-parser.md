# UI Contract: Markdown Parser

**Feature**: 007-ui-refactor-ai-session  
**Type**: Intent Engine preprocessing contract

## Interface

```typescript
function parseMarkdownToIntent(
  markdownContent: string,
  domainId: string,
  action: string
): ParseResult

type ParseResult =
  | { status: 'success'; fields: Record<string, unknown> }
  | { status: 'partial'; fields: Record<string, unknown>; errors: ParseError[] }
  | { status: 'failed'; errors: ParseError[] }

interface ParseError {
  section: string    // Markdown 中的位置引用
  message: string    // 人类可读的错误描述
}
```

## Parsing Strategy

参照 `template-parser.ts` 的字段映射模式：

1. 从 Domain manifest 加载 `templates.markdown.<action>` 定义
2. 加载对应的 `template_file` 获取模板结构和字段映射
3. 按分区（section）解析 Markdown 内容
4. 将 key-value 对映射为 `StructuredIntent.fields`

## Fallback Contract

```
Markdown 解析
  ├── 完全成功 → StructuredIntent → Nexus 链
  ├── 部分成功 → 高亮问题区域 + 用户修正 → 重新解析
  │     └── 仍失败 → 降级到 template_form 路径
  └── 完全失败 → 降级到 template_form 路径
```

## MVP Constraint

每个 Markdown 文件仅产生**单个 Domain 的单个 action** 的 StructuredIntent。跨 Domain 批处理不在 MVP 范围。
