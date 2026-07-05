/**
 * @file createSmartTimeboxes.spec
 * @brief [023.08] T5 [CT4 fold] 端到端 E2E — 真实 PG 落库 + revert
 *
 * ⚠️ **未实装** — 当前 MVP 没有 Playwright runner（[023.08] 范围外）。
 *   本文件作为 SSOT contract：[023.10] 接入 @playwright/test 后即可启用。
 *   不加入 vitest suite（路径 `frontend/e2e/` 不在 vitest include 列表）。
 *
 * 覆盖场景（CT4 fold）：
 *   1. /timeboxes 页面 → click [data-testid=ai-orchestrate-button] → AI panel 出现
 *   2. 接受所有 proposals → click [data-testid=accept-all-btn]
 *   3. 调 admin API /api/timeboxes/today 验证 timeboxes 数 > 0（PG 真实落库）
 *   4. [data-testid=revert-batch-btn] 出现
 *   5. 点 revert → 调 admin API 再验 timeboxes 数 = 0
 *
 * data-testid 约定（F5 fold）：
 *   - workspace 入口： ai-orchestrate-button
 *   - proposal 卡片： proposal-card
 *   - 接受/拒绝：   accept-all-btn / reject-btn
 *   - 撤销 batch： revert-batch-btn
 *
 * Spec 等级（待 Playwright wiring 后转 e2e test）：
 *   - `expect.poll` + `/api/timeboxes/today` admin 端点（GET）带 since=today
 *   - revert 后第二轮 `expect.poll` 待 items 数清零
 */

import { test, expect } from '@playwright/test'

test('[023.08] T5 [CT4] CreateSmartTimebox AI 推荐 → 接受 → 撤销 端到端 PG 落库', async ({ page, request }) => {
  // Step 1: 进 timeboxes workspace, 触发 AI 智能推荐
  await page.goto('/timeboxes')
  await page.click('[data-testid=ai-orchestrate-button]')
  await expect(page.locator('text=AI 编排建议')).toBeVisible({ timeout: 5000 })

  // Step 2: 接受所有 proposals
  await page.click('[data-testid=accept-all-btn]')

  // [CT4 fold] Step 3: 验证 PG 实际落库
  await expect
    .poll(async () => {
      const r = await request.get('/api/timeboxes/today')
      const json = await r.json()
      return json.items?.length ?? 0
    }, { timeout: 5000 })
    .toBeGreaterThan(0)

  // Step 4: 验证 revert 按钮显示
  await expect(page.locator('[data-testid=revert-batch-btn]')).toBeVisible({ timeout: 3000 })

  // Step 5: 点 revert
  await page.click('[data-testid=revert-batch-btn]')

  // [CT4 fold] Step 6: 验证 PG rows 已删除
  await expect
    .poll(async () => {
      const r = await request.get('/api/timeboxes/today')
      const json = await r.json()
      return json.items?.length ?? 0
    }, { timeout: 5000 })
    .toBe(0)
})
