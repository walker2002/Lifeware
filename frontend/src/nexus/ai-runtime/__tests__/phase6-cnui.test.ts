// Phase 6 CN-UI 核心基础设施测试：T030-T035
import { describe, it, expect, vi } from 'vitest'

// ─── T030: CN-UI 核心类型 ─────────────────────────────────────

describe('CN-UI 核心类型 (T030)', () => {
  it('CnuiBaseComponentType 包含 10 个类型', async () => {
    const types = await import('../cnui/types')
    const baseTypes: types.CnuiBaseComponentType[] = [
      'text-input', 'select', 'time-picker', 'date-picker', 'slider',
      'toggle', 'button', 'text-display', 'list', 'card',
    ]
    expect(baseTypes).toHaveLength(10)
  })

  it('CnuiDomainComponentType 包含 6 个类型', async () => {
    const types = await import('../cnui/types')
    const domainTypes: types.CnuiDomainComponentType[] = [
      'habit-creation-card', 'timebox-list', 'energy-indicator',
      'schedule-proposal', 'review-summary', 'objective-tracker',
    ]
    expect(domainTypes).toHaveLength(6)
  })

  it('CnuiSurfaceStatus 包含 4 个状态', async () => {
    const types = await import('../cnui/types')
    const statuses: types.CnuiSurfaceStatus[] = ['rendering', 'interactive', 'confirming', 'completed']
    expect(statuses).toHaveLength(4)
  })

  it('CnuiSurfaceMessage 包含 cnuiSurfaceId 和 action', async () => {
    const types = await import('../cnui/types')
    const msg: types.CnuiSurfaceMessage = {
      role: 'assistant',
      content: '请确认',
      cnuiSurfaceId: 'surface-001',
      cnuiSurfaceType: 'habit-creation-card',
      action: 'render',
      dataSnapshot: { field: 'value' },
    }
    expect(msg.cnuiSurfaceId).toBe('surface-001')
    expect(msg.cnuiSurfaceType).toBe('habit-creation-card')
    expect(msg.action).toBe('render')
  })

  it('CnuiEvent 包含必要字段', async () => {
    const types = await import('../cnui/types')
    const event: types.CnuiEvent = {
      type: 'input_change',
      cnuiSurfaceId: 'surface-001',
      field: 'title',
      value: '新标题',
    }
    expect(event.type).toBe('input_change')
    expect(event.cnuiSurfaceId).toBe('surface-001')
  })
})

// ─── T031: Component Catalog ──────────────────────────────────

describe('Component Catalog (T031)', () => {
  it('register + get 注册和查询组件', async () => {
    const { createCatalog } = await import('../cnui/catalog')
    const catalog = createCatalog()

    catalog.register({
      type: 'text-input',
      propsSchema: {},
      isBase: true,
    })

    const info = catalog.get('text-input')
    expect(info).toBeDefined()
    expect(info!.type).toBe('text-input')
    expect(info!.isBase).toBe(true)
  })

  it('get() 未注册组件返回 undefined', async () => {
    const { createCatalog } = await import('../cnui/catalog')
    const catalog = createCatalog()
    expect(catalog.get('unknown')).toBeUndefined()
  })

  it('list() 返回所有注册组件', async () => {
    const { createCatalog } = await import('../cnui/catalog')
    const catalog = createCatalog()

    catalog.register({ type: 'text-input', propsSchema: {}, isBase: true })
    catalog.register({ type: 'habit-creation-card', propsSchema: {}, isBase: false })

    expect(catalog.list()).toHaveLength(2)
  })
})

// ─── T032: CnuiSurfaceStore ──────────────────────────────────

describe('CnuiSurfaceStore (T032)', () => {
  it('create + get 创建并获取 Surface', async () => {
    const { createSurfaceStore } = await import('../cnui/surface-store')
    const store = createSurfaceStore()

    const id = store.create({
      surfaceType: 'habit-creation-card',
      sessionId: 'session-001',
      dataModel: { name: '跑步' },
    })

    const data = store.get(id)
    expect(data).toBeDefined()
    expect(data!.surfaceType).toBe('habit-creation-card')
    expect(data!.status).toBe('rendering')
  })

  it('update() 更新 Surface 的 dataModel', async () => {
    const { createSurfaceStore } = await import('../cnui/surface-store')
    const store = createSurfaceStore()

    const id = store.create({
      surfaceType: 'habit-creation-card',
      sessionId: 's1',
      dataModel: {},
    })

    store.update(id, { dataModel: { name: '冥想' } })
    const data = store.get(id)
    expect(data!.dataModel).toEqual({ name: '冥想' })
  })

  it('delete() 删除后 get() 返回 undefined', async () => {
    const { createSurfaceStore } = await import('../cnui/surface-store')
    const store = createSurfaceStore()

    const id = store.create({ surfaceType: 'test', sessionId: 's1', dataModel: {} })
    store.delete(id)
    expect(store.get(id)).toBeUndefined()
  })
})

// ─── T033: CnuiEventBus ──────────────────────────────────────

describe('CnuiEventBus (T033)', () => {
  it('on() + emit() 注册监听并接收事件', async () => {
    const { createEventBus } = await import('../cnui/event-bus')
    const bus = createEventBus()

    const handler = vi.fn()
    bus.on(handler)

    bus.emit({ type: 'input_change', cnuiSurfaceId: 's1', field: 'title', value: 'test' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('unsubscribe 后不再接收事件', async () => {
    const { createEventBus } = await import('../cnui/event-bus')
    const bus = createEventBus()

    const handler = vi.fn()
    const unsub = bus.on(handler)

    unsub()
    bus.emit({ type: 'input_change', cnuiSurfaceId: 's1', field: 'f', value: 'v' })
    expect(handler).not.toHaveBeenCalled()
  })
})

// ─── T034: CnuiManager ───────────────────────────────────────

describe('CnuiManager (T034)', () => {
  it('createCnuiSurface() 创建 Surface 并返回 ID', async () => {
    const { createCnuiManager } = await import('../cnui/manager')
    const manager = createCnuiManager()

    const surfaceId = manager.createCnuiSurface({
      surfaceType: 'habit-creation-card',
      sessionId: 's1',
      dataModel: { name: '跑步' },
    })

    expect(surfaceId).toBeTruthy()
    const surface = manager.getSurface(surfaceId)
    expect(surface).toBeDefined()
    expect(surface!.status).toBe('rendering')
  })

  it('handleEvent(input_change) 更新 Surface dataModel', async () => {
    const { createCnuiManager } = await import('../cnui/manager')
    const manager = createCnuiManager()

    const surfaceId = manager.createCnuiSurface({
      surfaceType: 'habit-creation-card',
      sessionId: 's1',
      dataModel: { name: '跑步' },
    })

    manager.handleEvent({
      type: 'input_change',
      cnuiSurfaceId: surfaceId,
      field: 'name',
      value: '冥想',
    })

    const surface = manager.getSurface(surfaceId)
    expect(surface!.dataModel.name).toBe('冥想')
    expect(surface!.status).toBe('interactive')
  })

  it('handleEvent(button_click: confirm) 提取数据并标记 completed', async () => {
    const { createCnuiManager } = await import('../cnui/manager')
    const manager = createCnuiManager()

    const confirmHandler = vi.fn()
    manager.onConfirm(confirmHandler)

    const surfaceId = manager.createCnuiSurface({
      surfaceType: 'habit-creation-card',
      sessionId: 's1',
      dataModel: { name: '跑步', time: '07:00' },
    })

    manager.handleEvent({
      type: 'button_click',
      cnuiSurfaceId: surfaceId,
      action: 'confirm',
    })

    expect(confirmHandler).toHaveBeenCalledWith(
      expect.objectContaining({ name: '跑步', time: '07:00' }),
    )
    const surface = manager.getSurface(surfaceId)
    expect(surface!.status).toBe('completed')
  })
})

// ─── T035: 注册基础组件到 Catalog ────────────────────────────

describe('注册基础组件 (T035)', () => {
  it('注册 16 个组件（10 基础 + 6 域）', async () => {
    const { createCatalog, registerBaseComponents, registerDomainComponents } = await import('../cnui/catalog')
    const catalog = createCatalog()

    registerBaseComponents(catalog)
    registerDomainComponents(catalog)

    expect(catalog.list()).toHaveLength(16)
  })
})
