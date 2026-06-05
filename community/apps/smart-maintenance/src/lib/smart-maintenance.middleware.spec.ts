jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: unknown) => target
}))

import { SmartMaintenanceMiddleware } from './smart-maintenance.middleware'
const SMART_MAINTENANCE_TOOL_NAMES = [
  'smart_maintenance_save_generated_work_order',
  'smart_maintenance_import_service_data',
  'smart_maintenance_get_catalog',
  'smart_maintenance_search_work_orders',
  'smart_maintenance_get_work_order_detail',
  'smart_maintenance_prepare_supplement_draft'
]

describe('SmartMaintenanceMiddleware', () => {
  function createMiddleware(service: Record<string, jest.Mock>) {
    const middleware = new SmartMaintenanceMiddleware(service as never)
    return middleware.createMiddleware(
      {},
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        conversationId: 'conversation-1',
        xpertId: 'assistant-1',
        node: {} as never,
        tools: new Map(),
        runtime: {} as never
      }
    )
  }

  it('exposes the smart maintenance business tools', async () => {
    const service = {
      saveGeneratedWorkOrder: jest.fn(async () => ({
        id: 'wo-1',
        workOrderNo: 'SM-20260602-0001',
        status: 'pending_confirmation',
        title: 'A 区 3 楼中央空调报修'
      })),
      importServiceData: jest.fn(async () => ({ id: 'service-data-1', summary: { customers: 1, devices: 1 } })),
      getCurrentCatalog: jest.fn(async () => ({ deviceTypes: [] })),
      getMockCatalog: jest.fn(async () => ({ deviceTypes: [] })),
      searchWorkOrders: jest.fn(async () => ({ items: [], total: 0 })),
      getWorkOrderDetailForAgent: jest.fn(async () => ({ workOrder: { id: 'wo-1' }, logs: [] })),
      prepareSupplementDraft: jest.fn(async () => ({ id: 'wo-1', aiSupplementDraft: {} }))
    }
    const result = await createMiddleware(service)

    expect(result.tools.map((item) => item.name)).toEqual(SMART_MAINTENANCE_TOOL_NAMES)
  })

  it('invokes search, detail, catalog and supplement draft tools with scoped service methods', async () => {
    const service = {
      saveGeneratedWorkOrder: jest.fn(async () => ({
        id: 'wo-1',
        workOrderNo: 'SM-20260602-0001',
        status: 'pending_confirmation',
        title: 'A 区 3 楼中央空调报修'
      })),
      importServiceData: jest.fn(async () => ({ id: 'service-data-1', summary: { customers: 1, devices: 1 } })),
      getCurrentCatalog: jest.fn(async () => ({ deviceTypes: [{ code: 'central_ac', label: '中央空调' }] })),
      getMockCatalog: jest.fn(async () => ({ deviceTypes: [{ code: 'central_ac', label: '中央空调' }] })),
      searchWorkOrders: jest.fn(async () => ({
        items: [{ id: 'wo-1', workOrderNo: 'SM-20260602-0001' }],
        total: 1,
        summary: { stats: { total: 1 } }
      })),
      getWorkOrderDetailForAgent: jest.fn(async () => ({ id: 'wo-1', workOrderNo: 'SM-20260602-0001', logs: [] })),
      prepareSupplementDraft: jest.fn(async () => ({
        id: 'wo-1',
        workOrderNo: 'SM-20260602-0001',
        status: 'needs_supplement',
        aiSupplementDraft: { location: '二楼财务室' }
      }))
    }
    const result = await createMiddleware(service)

    const tools = new Map(result.tools.map((item) => [item.name, item]))
    await tools.get('smart_maintenance_get_catalog')?.invoke({})
    await tools.get('smart_maintenance_search_work_orders')?.invoke({ status: 'needs_supplement', search: '空调' })
    await tools.get('smart_maintenance_get_work_order_detail')?.invoke({ workOrderId: 'wo-1' })
    await tools
      .get('smart_maintenance_prepare_supplement_draft')
      ?.invoke({ workOrderId: 'wo-1', supplementContent: '位置是二楼财务室' })

    expect(service.getCurrentCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1' })
    )
    expect(service.searchWorkOrders).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1' }),
      expect.objectContaining({ status: 'needs_supplement', search: '空调' })
    )
    expect(service.getWorkOrderDetailForAgent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1' }),
      'wo-1'
    )
    expect(service.prepareSupplementDraft).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1' }),
      'wo-1',
      expect.objectContaining({ supplementContent: '位置是二楼财务室' })
    )
  })

  it('imports service data only through the agent middleware tool', async () => {
    const service = {
      saveGeneratedWorkOrder: jest.fn(),
      importServiceData: jest.fn(async () => ({
        id: 'service-data-1',
        summary: {
          customers: 1,
          projects: 1,
          locations: 1,
          devices: 1
        }
      })),
      getCurrentCatalog: jest.fn(async () => ({ deviceTypes: [] })),
      searchWorkOrders: jest.fn(),
      getWorkOrderDetailForAgent: jest.fn(),
      prepareSupplementDraft: jest.fn()
    }
    const result = await createMiddleware(service)
    const tools = new Map(result.tools.map((item) => [item.name, item]))

    const response = await tools.get('smart_maintenance_import_service_data')?.invoke({
      fileName: 'service-data-complete.xlsx',
      importMode: 'replace',
      serviceData: {
        customers: [{ code: 'customer-1', name: '元数科技园区' }],
        projects: [{ code: 'project-1', customerCode: 'customer-1', name: '办公楼设备维保项目' }],
        locations: [{ code: 'loc-1', projectCode: 'project-1', name: 'A区办公楼' }],
        deviceTypes: [{ code: 'central_ac', label: '中央空调' }],
        devices: [{ code: 'AC-A3-001', label: 'A区3楼中央空调', deviceType: '中央空调' }],
        faultCategories: [{ code: 'cooling', label: '制冷异常' }],
        departments: [{ code: 'hvac', label: '暖通维修组' }],
        roles: [{ code: 'hvac_engineer', label: '空调维修工程师', departmentCode: 'hvac' }],
        personnel: [{ code: 'staff-li', name: '李工', roleCode: 'hvac_engineer' }],
        parts: [{ code: 'temperature_sensor', label: '温度传感器', deviceType: '中央空调' }],
        serviceTypes: [{ code: 'repair', label: '设备维修' }],
        urgencies: [{ code: 'high', label: '高' }]
      }
    })

    expect(JSON.parse(String(response))).toMatchObject({
      success: true,
      data: {
        id: 'service-data-1',
        summary: {
          customers: 1,
          devices: 1
        }
      }
    })
    expect(service.importServiceData).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1' }),
      expect.objectContaining({
        fileName: 'service-data-complete.xlsx',
        importMode: 'replace',
        serviceData: expect.objectContaining({
          customers: [expect.objectContaining({ name: '元数科技园区' })]
        })
      })
    )
  })

  it('imports prepared service data drafts by id through the agent middleware tool', async () => {
    const service = {
      saveGeneratedWorkOrder: jest.fn(),
      importServiceData: jest.fn(async () => ({
        id: 'service-data-1',
        fileName: 'service-data-complete.xlsx',
        importMode: 'replace',
        importedAt: new Date('2026-06-04T09:48:51.026Z'),
        summary: {
          customers: 3,
          devices: 10
        }
      })),
      getCurrentCatalog: jest.fn(async () => ({ deviceTypes: [] })),
      searchWorkOrders: jest.fn(),
      getWorkOrderDetailForAgent: jest.fn(),
      prepareSupplementDraft: jest.fn()
    }
    const result = await createMiddleware(service)
    const tools = new Map(result.tools.map((item) => [item.name, item]))

    const response = await tools.get('smart_maintenance_import_service_data')?.invoke({
      importDraftId: 'import-draft-1',
      fileName: 'service-data-complete.xlsx',
      importMode: 'replace'
    })

    expect(JSON.parse(String(response))).toMatchObject({
      success: true,
      data: {
        id: 'service-data-1',
        summary: {
          customers: 3,
          devices: 10
        }
      }
    })
    expect(service.importServiceData).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1' }),
      {
        importDraftId: 'import-draft-1',
        fileName: 'service-data-complete.xlsx',
        importMode: 'replace',
        serviceData: undefined
      }
    )
  })

  it('returns work order status, scope and supplement tips for AI feedback after saving', async () => {
    const service = {
      saveGeneratedWorkOrder: jest.fn(async () => ({
        id: 'wo-1',
        workOrderNo: 'SM-20260604-0001',
        status: 'needs_supplement',
        title: 'A区3楼中央空调 E4 报修',
        customerName: '博雅电力总部园区',
        projectName: '总部园区维保项目',
        siteName: 'A区3楼办公区',
        deviceType: '中央空调',
        location: 'A区3楼办公区',
        urgency: 'high',
        completenessTips: ['缺少具体设备编号']
      })),
      importServiceData: jest.fn(),
      getCurrentCatalog: jest.fn(async () => ({ deviceTypes: [] })),
      searchWorkOrders: jest.fn(),
      getWorkOrderDetailForAgent: jest.fn(),
      prepareSupplementDraft: jest.fn()
    }
    const result = await createMiddleware(service)
    const tools = new Map(result.tools.map((item) => [item.name, item]))

    const response = await tools.get('smart_maintenance_save_generated_work_order')?.invoke({
      originalContent: 'A区3楼中央空调 E4，不制冷',
      customerName: '博雅电力总部园区',
      projectName: '总部园区维保项目',
      siteName: 'A区3楼办公区',
      deviceType: '中央空调',
      completenessTips: ['缺少具体设备编号']
    })

    expect(JSON.parse(String(response))).toMatchObject({
      success: true,
      data: {
        id: 'wo-1',
        workOrderNo: 'SM-20260604-0001',
        status: 'needs_supplement',
        title: 'A区3楼中央空调 E4 报修',
        customerName: '博雅电力总部园区',
        projectName: '总部园区维保项目',
        siteName: 'A区3楼办公区',
        completenessTips: ['缺少具体设备编号']
      }
    })
  })
})
