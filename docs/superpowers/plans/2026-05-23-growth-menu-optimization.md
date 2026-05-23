# 成长领域面板优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化左侧面板"成长领域"标签的显示：为每个域添加图标和中文名、实现 action 固定/收起、隐藏快捷方式改为 hover 显示、action 名称截断不换行。

**Architecture:** 纯 UI 组件层变更。所有改动集中在 `growth-menu.tsx`，通过本地常量映射域图标/中文名，用 localStorage 持久化固定状态。不修改 manifest schema 或 domain registry。

**Tech Stack:** React hooks (useState, useCallback), lucide-react icons, localStorage, Tailwind CSS, Vitest + Testing Library

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/components/layout/growth-menu.tsx` | Modify | 域图标+中文名、动作截断、快捷方式 tooltip、固定功能 |
| `frontend/src/components/layout/__tests__/growth-menu.test.tsx` | Modify | 更新测试覆盖全部新功能 |

---

### Task 1: 重构 GrowthMenu 组件

**Files:**
- Modify: `frontend/src/components/layout/growth-menu.tsx`

**当前组件问题：**
- 域标题显示 `domain.domainId`（如 "habits"），无图标无中文名
- action 名称可能换行，无截断
- 快捷方式始终内联显示在右侧
- 无固定/收起功能

**四个需求：**
1. 域标题 → 图标 + 中文名（如 🔲 习惯、⏰ 时间盒）
2. action 可固定/取消固定，默认全固定，非固定的收在"更多行动"下
3. 快捷方式不内联显示，改为 hover 时 tooltip 显示
4. action 名称 truncate 不换行

- [ ] **Step 1: 完整重写组件文件**

将 `frontend/src/components/layout/growth-menu.tsx` 完整替换为：

```typescript
"use client"

import { useState, useCallback } from "react"
import { CheckSquare, Clock, Repeat, Target, Pin, PinOff, ChevronDown } from "lucide-react"

interface DomainAction {
  action: string
  shortcut?: string
  description: string
}

interface DomainActionGroup {
  domainId: string
  domainName: string
  actions: DomainAction[]
}

interface GrowthMenuProps {
  domainActions: DomainActionGroup[]
  onAction: (domainId: string, action: string) => void
}

const DOMAIN_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  tasks: { icon: CheckSquare, label: '任务' },
  timebox: { icon: Clock, label: '时间盒' },
  habits: { icon: Repeat, label: '习惯' },
  okrs: { icon: Target, label: 'OKR' },
}

const PINNED_STORAGE_KEY = 'lw-pinned-actions'

export function GrowthMenu({ domainActions, onAction }: GrowthMenuProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [pinned, setPinned] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem(PINNED_STORAGE_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })
  const [expandedUnpinned, setExpandedUnpinned] = useState<Set<string>>(new Set())

  const toggleGroup = useCallback((domainId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(domainId)) next.delete(domainId)
      else next.add(domainId)
      return next
    })
  }, [])

  const togglePin = useCallback((domainId: string, action: string) => {
    setPinned(prev => {
      const current = prev[domainId] ?? []
      const next = current.includes(action)
        ? current.filter(a => a !== action)
        : [...current, action]
      const newState = { ...prev, [domainId]: next }
      try {
        localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(newState))
      } catch {}
      return newState
    })
  }, [])

  const toggleUnpinned = useCallback((domainId: string) => {
    setExpandedUnpinned(prev => {
      const next = new Set(prev)
      if (next.has(domainId)) next.delete(domainId)
      else next.add(domainId)
      return next
    })
  }, [])

  return (
    <div className="flex flex-col gap-2">
      {domainActions.length === 0 && (
        <p className="px-3 py-6 text-center text-sm text-body/40">加载中...</p>
      )}
      {domainActions.map(domain => {
        const meta = DOMAIN_META[domain.domainId]
        const Icon = meta?.icon
        const pinnedList = pinned[domain.domainId] ?? domain.actions.map(a => a.action)
        const pinnedActions = domain.actions.filter(a => pinnedList.includes(a.action))
        const unpinnedActions = domain.actions.filter(a => !pinnedList.includes(a.action))

        return (
          <div key={domain.domainId}>
            <button
              type="button"
              onClick={() => toggleGroup(domain.domainId)}
              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-body/60 hover:text-body transition-colors"
            >
              {Icon && <Icon className="size-3.5" />}
              <span>{meta?.label ?? domain.domainId}</span>
              <span className="ml-auto text-[10px]">{collapsed.has(domain.domainId) ? '▸' : '▾'}</span>
            </button>

            {!collapsed.has(domain.domainId) && (
              <>
                {pinnedActions.map(act => (
                  <button
                    key={act.action}
                    type="button"
                    onClick={() => onAction(domain.domainId, act.action)}
                    title={act.shortcut ?? undefined}
                    className="group flex w-full items-center rounded-md px-3 py-2 text-sm text-body hover:bg-surface-soft hover:text-ink transition-colors"
                  >
                    <span className="truncate">{act.description}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={e => { e.stopPropagation(); togglePin(domain.domainId, act.action) }}
                      className="ml-auto shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-body/30 hover:text-primary transition-opacity"
                    >
                      <Pin className="size-3" />
                    </span>
                  </button>
                ))}

                {unpinnedActions.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleUnpinned(domain.domainId)}
                      className="flex w-full items-center gap-1 px-3 py-1 text-xs text-body/40 hover:text-body transition-colors"
                    >
                      <ChevronDown className={`size-3 transition-transform ${expandedUnpinned.has(domain.domainId) ? 'rotate-180' : ''}`} />
                      更多行动
                    </button>
                    {expandedUnpinned.has(domain.domainId) && unpinnedActions.map(act => (
                      <button
                        key={act.action}
                        type="button"
                        onClick={() => onAction(domain.domainId, act.action)}
                        title={act.shortcut ?? undefined}
                        className="group flex w-full items-center rounded-md px-3 py-2 text-sm text-body hover:bg-surface-soft hover:text-ink transition-colors"
                      >
                        <span className="truncate">{act.description}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={e => { e.stopPropagation(); togglePin(domain.domainId, act.action) }}
                          className="ml-auto shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-body/30 hover:text-primary transition-opacity"
                        >
                          <PinOff className="size-3" />
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

**关键设计说明：**

| 需求 | 实现方式 |
|------|---------|
| 域图标+中文名 | `DOMAIN_META` 常量映射 4 个域的 lucide 图标和中文标签 |
| 快捷方式 tooltip | `title={act.shortcut ?? undefined}` 在按钮上，hover 显示 |
| 名称截断 | `<span className="truncate">` — Tailwind 的 truncate = overflow-hidden + text-ellipsis + whitespace-nowrap |
| 固定/取消固定 | localStorage 持久化，首次访问所有 action 视为固定 |
| "更多行动" | 非固定 action 数量 > 0 时显示，点击展开/收起 |
| Pin 按钮 | `opacity-0 group-hover:opacity-100` — hover 时才可见，`e.stopPropagation()` 防止触发父按钮 |
| 固定 action | 显示 Pin 图标（点击可取消固定） |
| 非固定 action | 显示 PinOff 图标（点击可重新固定） |

- [ ] **Step 2: 验证编译**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --pretty 2>&1 | grep -v "Slider.tsx" | grep -v "episode.repository" | grep -v "phase5-integration" | grep -v "phase6-cnui" | grep "error" | head -5`
Expected: 无新增错误（输出为空或只有已知的预存错误）

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/growth-menu.tsx
git commit -m "feat: add domain icons, Chinese names, pin/unpin and shortcut tooltip to growth menu

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 更新测试

**Files:**
- Modify: `frontend/src/components/layout/__tests__/growth-menu.test.tsx`

当前测试断言 `screen.getByText('habits')` 和 `screen.getByText('/createHabit')`，变更后这些不再匹配（域标题变为中文、快捷方式不再内联显示）。

- [ ] **Step 1: 完整替换测试文件**

将 `frontend/src/components/layout/__tests__/growth-menu.test.tsx` 完整替换为：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GrowthMenu } from '../growth-menu'

const mockDomainActions = [
  {
    domainId: 'habits',
    domainName: 'Habits',
    actions: [
      { action: 'createHabit', shortcut: '/createHabit', description: '创建习惯' },
      { action: 'logHabit', shortcut: '/logHabit', description: '记录习惯' },
    ],
  },
  {
    domainId: 'timebox',
    domainName: 'Timebox',
    actions: [
      { action: 'createTimebox', shortcut: '/createTimebox', description: '创建时间盒' },
    ],
  },
]

describe('GrowthMenu', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('should render domain groups with Chinese labels', () => {
    render(<GrowthMenu domainActions={mockDomainActions} onAction={vi.fn()} />)
    expect(screen.getByText('习惯')).toBeInTheDocument()
    expect(screen.getByText('时间盒')).toBeInTheDocument()
  })

  it('should render pinned action descriptions', () => {
    render(<GrowthMenu domainActions={mockDomainActions} onAction={vi.fn()} />)
    expect(screen.getByText('创建习惯')).toBeInTheDocument()
    expect(screen.getByText('记录习惯')).toBeInTheDocument()
    expect(screen.getByText('创建时间盒')).toBeInTheDocument()
  })

  it('should not display shortcuts inline', () => {
    render(<GrowthMenu domainActions={mockDomainActions} onAction={vi.fn()} />)
    expect(screen.queryByText('/createHabit')).not.toBeInTheDocument()
    expect(screen.queryByText('/logHabit')).not.toBeInTheDocument()
  })

  it('should set shortcut as title attribute for tooltip', () => {
    render(<GrowthMenu domainActions={mockDomainActions} onAction={vi.fn()} />)
    const btn = screen.getByText('创建习惯').closest('button')!
    expect(btn.title).toBe('/createHabit')
  })

  it('should call onAction when action clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<GrowthMenu domainActions={mockDomainActions} onAction={onAction} />)

    await user.click(screen.getByText('创建习惯'))
    expect(onAction).toHaveBeenCalledWith('habits', 'createHabit')
  })

  it('should collapse and expand domain groups', async () => {
    const user = userEvent.setup()
    render(<GrowthMenu domainActions={mockDomainActions} onAction={vi.fn()} />)

    const habitsHeader = screen.getByText('习惯')
    await user.click(habitsHeader)
    expect(screen.queryByText('创建习惯')).not.toBeInTheDocument()

    await user.click(habitsHeader)
    expect(screen.getByText('创建习惯')).toBeInTheDocument()
  })

  it('should move unpinned action to "更多行动" section', async () => {
    const user = userEvent.setup()
    render(<GrowthMenu domainActions={mockDomainActions} onAction={vi.fn()} />)

    // 点击 "创建习惯" 的固定按钮，取消固定
    const createActionBtn = screen.getByText('创建习惯').closest('button')!
    const pinToggle = createActionBtn.querySelector('[role="button"]') as HTMLElement
    await user.click(pinToggle)

    // action 应该从主列表消失
    expect(screen.queryByText('创建习惯')).not.toBeInTheDocument()

    // 应该出现 "更多行动" 按钮
    expect(screen.getByText('更多行动')).toBeInTheDocument()
  })

  it('should show loading state when no domains', () => {
    render(<GrowthMenu domainActions={[]} onAction={vi.fn()} />)
    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试确认通过**

Run: `cd /home/walker/lifeware/frontend && npx vitest run src/components/layout/__tests__/growth-menu.test.tsx`
Expected: ALL PASS

如果有测试失败，根据实际组件行为调整断言，然后重新运行直到全部通过。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/__tests__/growth-menu.test.tsx
git commit -m "test: update growth-menu tests for icons, Chinese names, pin and tooltip

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
