import { BadRequestException, NotFoundException } from '@nestjs/common'
import { SmartMaintenanceMockCatalogService } from './smart-maintenance-mock-catalog.service'
import { SmartMaintenanceService } from './smart-maintenance.service'
import { SmartMaintenanceServiceData, SmartMaintenanceWorkOrder, SmartMaintenanceWorkOrderLog } from './entities'
import type { SmartMaintenanceScope } from './types'

function createRepository<T extends { id?: string }>() {
  const store: T[] = []
  const repository = {
    store,
    manager: {
      transaction: jest.fn(async (callback: (manager: { getRepository: (entity: unknown) => typeof repository }) => unknown) =>
        callback({
          getRepository: (entity: unknown) =>
            entity === SmartMaintenanceWorkOrderLog ? (logRepositoryRef.current as typeof repository) : repository
        })
      )
    },
    create: jest.fn((input: T) => ({ ...input })),
    save: jest.fn(async (input: T) => {
      const row = { ...input, id: input.id ?? `id-${store.length + 1}` } as T
      const index = store.findIndex((item) => item.id === row.id)
      if (index >= 0) {
        store[index] = row
      } else {
        store.push(row)
      }
      return row
    }),
    findOne: jest.fn(async ({ where }: { where: Partial<T> }) => {
      return (
        store.find((item) =>
          Object.entries(where).every(([key, value]) => value === undefined || item[key as keyof T] === value)
        ) ?? null
      )
    }),
    find: jest.fn(async () => store),
    count: jest.fn(async () => store.length)
  }
  return repository
}

const logRepositoryRef: { current?: ReturnType<typeof createRepository<SmartMaintenanceWorkOrderLog>> } = {}
const serviceDataRepositoryRef: { current?: ReturnType<typeof createRepository<SmartMaintenanceServiceData>> } = {}

describe('SmartMaintenanceService', () => {
  const scope: SmartMaintenanceScope = {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: 'user-1',
    assistantId: 'assistant-1',
    conversationId: 'conversation-1'
  }

  let workOrderRepository: ReturnType<typeof createRepository<SmartMaintenanceWorkOrder>>
  let logRepository: ReturnType<typeof createRepository<SmartMaintenanceWorkOrderLog>>
  let serviceDataRepository: ReturnType<typeof createRepository<SmartMaintenanceServiceData>>
  let service: SmartMaintenanceService

  beforeEach(() => {
    workOrderRepository = createRepository<SmartMaintenanceWorkOrder>()
    logRepository = createRepository<SmartMaintenanceWorkOrderLog>()
    serviceDataRepository = createRepository<SmartMaintenanceServiceData>()
    logRepositoryRef.current = logRepository
    serviceDataRepositoryRef.current = serviceDataRepository
    service = new SmartMaintenanceService(
      workOrderRepository as never,
      logRepository as never,
      serviceDataRepository as never,
      new SmartMaintenanceMockCatalogService()
    )
  })

  it('saves a complete AI generated work order as pending confirmation and creates an ai_generated log', async () => {
    const workOrder = await service.saveGeneratedWorkOrder(
      {
        sourceType: 'agent_chat',
        originalContent: 'A 区 3 楼中央空调不制冷，面板显示 E4',
        deviceType: '中央空调',
        faultCategory: '制冷异常',
        faultPhenomenon: '不制冷',
        faultCode: 'E4',
        location: 'A 区 3 楼',
        urgency: 'high',
        recommendedDepartment: '暖通维修组',
        recommendedRole: '空调维修工程师',
        suggestedParts: ['温度传感器', '控制面板'],
        aiConfidence: 0.86
      },
      scope
    )

    expect(workOrder.status).toBe('pending_confirmation')
    expect(workOrder.workOrderNo).toMatch(/^SM-\d{8}-\d{4}$/)
    expect(workOrder.confirmedDepartment).toBe('暖通维修组')
    expect(logRepository.store).toHaveLength(1)
    expect(logRepository.store[0].action).toBe('ai_generated')
  })

  it('saves an AI generated work order with completeness tips as needs supplement', async () => {
    const workOrder = await service.saveGeneratedWorkOrder(
      {
        originalContent: 'A 区 3 楼中央空调不制冷，面板显示 E4',
        deviceType: '中央空调',
        faultCategory: '制冷异常',
        faultPhenomenon: '不制冷',
        faultCode: 'E4',
        location: 'A 区 3 楼',
        completenessTips: ['缺少具体设备编号']
      },
      scope
    )

    expect(workOrder.status).toBe('needs_supplement')
    expect(workOrder.completenessTips).toEqual(['缺少具体设备编号'])
    expect(logRepository.store[0].snapshot).toMatchObject({
      status: 'needs_supplement',
      completenessTips: ['缺少具体设备编号']
    })
  })

  it('normalizes a generated work order scope from imported service data when the agent provides a unique site or device hint', async () => {
    await service.importServiceData(scope, {
      fileName: 'service-data-complete.json',
      importMode: 'replace',
      serviceData: {
        customers: [{ code: 'customer-east-hq', name: '博雅电力' }],
        projects: [{ code: 'project-east-weekly', customerCode: 'customer-east-hq', name: '总部园区一周巡检' }],
        locations: [
          {
            code: 'loc-east-a-3f',
            customerCode: 'customer-east-hq',
            projectCode: 'project-east-weekly',
            name: 'A区3楼办公区'
          }
        ],
        devices: [
          {
            code: 'AC-A3-001',
            label: 'A区3楼中央空调',
            deviceType: '中央空调',
            locationCode: 'loc-east-a-3f',
            location: 'A区3楼办公区'
          }
        ]
      }
    })

    const workOrder = await service.saveGeneratedWorkOrder(
      {
        originalContent: 'A区3楼办公区中央空调面板显示E4，今天下午不制冷，请尽快维修。',
        siteName: 'A区3楼办公区',
        deviceName: 'A区3楼中央空调',
        deviceType: '中央空调',
        faultCode: 'E4',
        faultPhenomenon: '不制冷',
        completenessTips: ['缺少报修人姓名及联系方式']
      },
      scope
    )

    expect(workOrder.customerName).toBe('博雅电力')
    expect(workOrder.projectName).toBe('总部园区一周巡检')
    expect(workOrder.siteName).toBe('A区3楼办公区')
    expect(workOrder.deviceNo).toBe('AC-A3-001')
    expect(workOrder.status).toBe('needs_supplement')
  })

  it('removes scope completion tips after customer project and site are auto-filled from a unique service data match', async () => {
    await service.importServiceData(scope, {
      fileName: 'service-data-complete.json',
      importMode: 'replace',
      serviceData: {
        customers: [{ code: 'customer-east-hq', name: '博雅电力' }],
        projects: [{ code: 'project-east-weekly', customerCode: 'customer-east-hq', name: '总部园区一周巡检' }],
        locations: [
          {
            code: 'loc-east-a-3f',
            customerCode: 'customer-east-hq',
            projectCode: 'project-east-weekly',
            name: 'A区3楼办公区'
          }
        ],
        devices: [
          {
            code: 'AC-A3-001',
            label: 'A区3楼中央空调',
            deviceType: '中央空调',
            locationCode: 'loc-east-a-3f',
            location: 'A区3楼办公区'
          }
        ]
      }
    })

    const workOrder = await service.saveGeneratedWorkOrder(
      {
        originalContent: 'A区3楼办公区中央空调面板显示E4，今天下午不制冷，请尽快维修。',
        siteName: 'A区3楼办公区',
        deviceType: '中央空调',
        completenessTips: ['缺少客户名称和项目名称，建议人工确认', '缺少报修人姓名及联系方式']
      },
      scope
    )

    expect(workOrder.customerName).toBe('博雅电力')
    expect(workOrder.projectName).toBe('总部园区一周巡检')
    expect(workOrder.completenessTips).toEqual(['缺少报修人姓名及联系方式'])
    expect(workOrder.status).toBe('needs_supplement')
  })

  it('rejects empty original content', async () => {
    await expect(service.saveGeneratedWorkOrder({ originalContent: '   ' }, scope)).rejects.toBeInstanceOf(
      BadRequestException
    )
  })

  it('seeds the design demo work orders for an empty scoped review desk', async () => {
    const viewData = await service.getViewData(scope, { viewMode: 'review' })

    expect(viewData.total).toBe(5)
    expect(viewData.items.map((item) => item.workOrderNo)).toEqual([
      'MT-20250526-0001',
      'MT-20250526-0002',
      'MT-20250525-0009',
      'MT-20250524-0008',
      'MT-20250524-0007'
    ])
    expect(viewData.item?.workOrderNo).toBe('MT-20250526-0001')
    expect(viewData.summary.stats).toMatchObject({
      total: 5,
      pending_confirmation: 1,
      needs_supplement: 1,
      processing: 1,
      processed: 1,
      rejected: 1
    })
    expect(logRepository.store.map((log) => log.action)).toEqual([
      'ai_generated',
      'ai_generated',
      'mark_needs_supplement',
      'ai_generated',
      'confirm_processing',
      'ai_generated',
      'confirm_processing',
      'mark_processed',
      'ai_generated',
      'reject_closed'
    ])
  })

  it('seeds missing demo work orders while preserving existing scoped work orders', async () => {
    const created = await service.saveGeneratedWorkOrder(
      {
        originalContent: 'A 区 3 楼中央空调不制冷',
        deviceType: '中央空调',
        faultPhenomenon: '不制冷',
        location: 'A 区 3 楼'
      },
      scope
    )

    const viewData = await service.getViewData(scope, { viewMode: 'review' })

    expect(viewData.total).toBe(6)
    expect(viewData.items.map((item) => item.id)).toContain(created.id)
    expect(viewData.items.map((item) => item.workOrderNo)).toEqual(
      expect.arrayContaining([
        'MT-20250526-0001',
        'MT-20250526-0002',
        'MT-20250525-0009',
        'MT-20250524-0008',
        'MT-20250524-0007'
      ])
    )
  })

  it('shows work orders across agent host ids in the same tenant and organization', async () => {
    const created = await service.saveGeneratedWorkOrder(
      {
        originalContent: '2号楼3层会议室中央空调不制冷',
        deviceType: '中央空调',
        faultPhenomenon: '不制冷',
        location: '2号楼3层会议室'
      },
      { ...scope, assistantId: 'middleware-xpert-id' }
    )

    const viewData = await service.getViewData({ ...scope, assistantId: 'workbench-host-id' }, { viewMode: 'review' })

    expect(viewData.total).toBe(6)
    expect(viewData.items.map((item) => item.id)).toContain(created.id)
  })

  it('searches scoped work orders for agent summaries without selecting a detail item', async () => {
    await service.saveGeneratedWorkOrder(
      {
        originalContent: 'A 区 3 楼中央空调不制冷',
        deviceType: '中央空调',
        faultPhenomenon: '不制冷',
        location: 'A 区 3 楼',
        urgency: 'high'
      },
      scope
    )

    const result = await service.searchWorkOrders(scope, {
      deviceType: '中央空调',
      urgency: 'high',
      search: '空调',
      page: 1,
      pageSize: 10
    })

    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.items[0]).toMatchObject({
      deviceType: '中央空调',
      urgency: 'high'
    })
    expect(result.item).toBeUndefined()
    expect(result.summary.stats.total).toBeGreaterThanOrEqual(1)
  })

  it('returns agent work order detail with logs', async () => {
    const workOrder = await service.saveGeneratedWorkOrder(
      {
        originalContent: 'A 区 3 楼中央空调不制冷',
        deviceType: '中央空调',
        faultPhenomenon: '不制冷',
        location: 'A 区 3 楼'
      },
      scope
    )

    const detail = await service.getWorkOrderDetailForAgent(scope, workOrder.id as string)

    expect(detail).toMatchObject({
      id: workOrder.id,
      workOrderNo: workOrder.workOrderNo,
      logs: [expect.objectContaining({ action: 'ai_generated' })]
    })
  })

  it('imports agent-approved service data and uses it as the current catalog', async () => {
    const imported = await service.importServiceData(scope, {
      fileName: 'service-data-complete.xlsx',
      importMode: 'replace',
      serviceData: {
        customers: [{ code: 'customer-1', name: '元数科技园区' }],
        projects: [{ code: 'project-1', customerCode: 'customer-1', name: '办公楼设备维保项目' }],
        locations: [{ code: 'loc-1', projectCode: 'project-1', name: 'A区办公楼' }],
        deviceTypes: [{ code: 'central_ac', label: '中央空调' }],
        devices: [{ code: 'AC-A3-001', label: 'A区3楼中央空调', deviceType: '中央空调', location: 'A区办公楼' }],
        faultCategories: [{ code: 'cooling', label: '制冷异常' }],
        departments: [{ code: 'hvac', label: '暖通维修组' }],
        roles: [{ code: 'hvac_engineer', label: '空调维修工程师', departmentCode: 'hvac' }],
        personnel: [{ code: 'staff-li', name: '李工', roleCode: 'hvac_engineer' }],
        parts: [{ code: 'temperature_sensor', label: '温度传感器', deviceType: '中央空调' }],
        serviceTypes: [{ code: 'repair', label: '设备维修' }],
        urgencies: [{ code: 'high', label: '高' }]
      }
    })

    expect(imported.summary).toMatchObject({
      customers: 1,
      projects: 1,
      locations: 1,
      devices: 1
    })
    expect(serviceDataRepository.store).toHaveLength(1)

    const catalog = await service.getCurrentCatalog(scope)

    expect(catalog.customers?.map((item) => item.name)).toEqual(['元数科技园区'])
    expect(catalog.deviceTypes.map((item) => item.label)).toEqual(['中央空调'])
    expect(catalog.devices.map((item) => item.label)).toEqual(['A区3楼中央空调'])

    const viewData = await service.getViewData(scope, { viewMode: 'review' })

    expect(viewData.meta.latestServiceData).toMatchObject({
      id: imported.id,
      fileName: 'service-data-complete.xlsx',
      importMode: 'replace',
      summary: expect.objectContaining({
        customers: 1,
        devices: 1
      })
    })
  })

  it('prepares uploaded service data import draft without persisting it', async () => {
    const draft = await service.prepareServiceDataImportDraft(scope, {
      fileName: 'service-data-complete.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          customers: [{ code: 'customer-1', name: '元数科技园区' }],
          devices: [{ code: 'AC-A3-001', label: 'A区3楼中央空调' }]
        })
      )
    })

    expect(draft.summary).toMatchObject({
      customers: 1,
      devices: 1
    })
    expect(draft.importDraftId).toEqual(expect.any(String))
    expect(draft.serviceData.customers?.[0]).toMatchObject({ name: '元数科技园区' })
    expect(serviceDataRepository.store).toHaveLength(0)
  })

  it('imports a prepared service data draft by id through the agent write path', async () => {
    const draft = await service.prepareServiceDataImportDraft(scope, {
      fileName: 'service-data-complete.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          customers: [{ code: 'customer-1', name: '元数科技园区' }],
          devices: [{ code: 'AC-A3-001', label: 'A区3楼中央空调' }]
        })
      )
    })

    expect(serviceDataRepository.store).toHaveLength(0)

    const imported = await service.importServiceData(scope, {
      importDraftId: draft.importDraftId
    })

    expect(imported.fileName).toBe('service-data-complete.json')
    expect(imported.importMode).toBe('replace')
    expect(imported.summary).toMatchObject({
      customers: 1,
      devices: 1
    })
    expect(serviceDataRepository.store).toHaveLength(1)
  })

  it('captures similar unresolved work orders without blocking generation', async () => {
    await service.saveGeneratedWorkOrder(
      {
        originalContent: 'A 区 3 楼中央空调不制冷',
        deviceType: '中央空调',
        faultCategory: '制冷异常',
        faultPhenomenon: '不制冷',
        location: 'A 区 3 楼'
      },
      scope
    )

    const next = await service.saveGeneratedWorkOrder(
      {
        originalContent: 'A 区 3 楼空调制冷效果差',
        deviceType: '中央空调',
        faultCategory: '制冷异常',
        faultPhenomenon: '制冷效果差',
        location: 'A 区 3 楼'
      },
      scope
    )

    expect(next.similarWorkOrders).toHaveLength(1)
    expect(next.similarWorkOrders?.[0].deviceType).toBe('中央空调')
  })

  it('marks pending confirmation work order as needs supplement', async () => {
    const workOrder = await service.saveGeneratedWorkOrder({ originalContent: '打印机无法打印', deviceType: '打印机' }, scope)
    const result = await service.markNeedsSupplement(scope, workOrder.id as string, { reason: '缺少位置' })

    expect(result.status).toBe('needs_supplement')
    expect(logRepository.store.some((log) => log.action === 'mark_needs_supplement')).toBe(true)
  })

  it('saves supplement and returns work order to pending confirmation', async () => {
    const workOrder = await service.saveGeneratedWorkOrder({ originalContent: '打印机无法打印', deviceType: '打印机' }, scope)
    const needsSupplement = await service.markNeedsSupplement(scope, workOrder.id as string, { reason: '缺少位置' })

    const result = await service.saveSupplement(scope, needsSupplement.id as string, {
      location: '二楼财务室',
      faultPhenomenon: '无法打印'
    })

    expect(result.status).toBe('pending_confirmation')
    expect(result.location).toBe('二楼财务室')
    expect(logRepository.store.some((log) => log.action === 'supplement_saved')).toBe(true)
  })

  it('prepares a supplement draft for human one-click fill without changing status', async () => {
    const workOrder = await service.saveGeneratedWorkOrder(
      {
        originalContent: '打印机无法打印',
        deviceType: '打印机',
        completenessTips: ['缺少位置', '缺少故障现象']
      },
      scope
    )
    const result = await service.prepareSupplementDraft(scope, workOrder.id as string, {
      supplementContent: '位置在二楼财务室，故障现象是无法打印，需要上门。',
      draft: {
        location: '二楼财务室',
        faultPhenomenon: '无法打印',
        needOnsite: true,
        processingRemark: '用户补充位置和故障现象后，请安排现场检查。'
      },
      confidence: 0.82
    })

    expect(result.status).toBe('needs_supplement')
    expect(result.aiSupplementDraft).toMatchObject({
      location: '二楼财务室',
      faultPhenomenon: '无法打印',
      needOnsite: true,
      processingRemark: '用户补充位置和故障现象后，请安排现场检查。',
      confidence: 0.82
    })
    expect(result.aiSupplementDraftedAt).toBeInstanceOf(Date)
    expect(logRepository.store.some((log) => log.action === 'supplement_draft_prepared')).toBe(true)
  })

  it('requires core fields before confirming processing', async () => {
    const workOrder = await service.saveGeneratedWorkOrder({ originalContent: '空调坏了' }, scope)

    await expect(
      service.confirmProcessing(scope, workOrder.id as string, {
        confirmedDepartment: '暖通维修组',
        processingRemark: '安排处理'
      })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('confirms processing with required fields and then marks processed', async () => {
    const workOrder = await service.saveGeneratedWorkOrder(
      {
        originalContent: 'A 区 3 楼中央空调不制冷',
        deviceType: '中央空调',
        faultPhenomenon: '不制冷',
        location: 'A 区 3 楼',
        urgency: 'high',
        recommendedDepartment: '暖通维修组'
      },
      scope
    )

    const processing = await service.confirmProcessing(scope, workOrder.id as string, {
      confirmedDepartment: '暖通维修组',
      processingRemark: '按 AI 建议先安排暖通维修组现场检查'
    })

    expect(processing.status).toBe('processing')
    expect(processing.processingStartedAt).toBeInstanceOf(Date)

    const processed = await service.markProcessed(scope, workOrder.id as string, {
      processingResult: 'fixed',
      processingSummary: '更换温度传感器后恢复制冷'
    })

    expect(processed.status).toBe('processed')
    expect(processed.processingResult).toBe('fixed')
    expect(processed.processedAt).toBeInstanceOf(Date)
  })

  it('rejects and closes pending work order with a reason', async () => {
    const workOrder = await service.saveGeneratedWorkOrder({ originalContent: '重复报修', deviceType: '中央空调' }, scope)
    const rejected = await service.rejectAndClose(scope, workOrder.id as string, { reason: '已有相同未处理工单' })

    expect(rejected.status).toBe('rejected')
    expect(rejected.rejectionReason).toBe('已有相同未处理工单')
    expect(logRepository.store.some((log) => log.action === 'reject_closed')).toBe(true)
  })

  it('throws not found for out-of-scope work order', async () => {
    await expect(service.getWorkOrderDetail(scope, 'missing-id')).rejects.toBeInstanceOf(NotFoundException)
  })
})
