jest.mock('@xpert-ai/plugin-sdk', () => ({
  ViewExtensionProvider: () => (target: unknown) => target,
  renderRemoteReactIframeHtml: (input: { title: string; appScript: string }) =>
    `<!doctype html><html><body><h1>${input.title}</h1><script>${input.appScript}</script></body></html>`
}))

import { SmartMaintenanceViewProvider } from './smart-maintenance-view.provider'
import {
  SMART_MAINTENANCE_WORKBENCH_VIEW_KEY,
  SMART_MAINTENANCE_IMPORT_SERVICE_DATA_TOOL_NAME,
  SMART_MAINTENANCE_SAVE_TOOL_NAME
} from './constants'

describe('SmartMaintenanceViewProvider', () => {
  const context = {
    hostType: 'agent',
    hostId: 'assistant-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: 'user-1'
  } as never

  function createProvider() {
    return new SmartMaintenanceViewProvider({
      getViewData: jest.fn(async () => ({ items: [], total: 0, summary: {}, meta: {} })),
      prepareServiceDataImportDraft: jest.fn(async () => ({
        importDraftId: 'import-draft-1',
        fileName: 'service-data-complete.json',
        importMode: 'replace',
        summary: { customers: 1, devices: 1 },
        serviceData: {
          customers: [{ code: 'customer-1', name: '元数科技园区' }],
          devices: [{ code: 'AC-A3-001', label: 'A区3楼中央空调' }]
        }
      })),
      getMockCatalog: jest.fn(async () => ({ deviceTypes: [] })),
      saveGeneratedWorkOrder: jest.fn(async () => ({ id: 'wo-form-1', status: 'pending_confirmation' })),
      updateWorkOrder: jest.fn(async () => ({ id: 'wo-1' })),
      markNeedsSupplement: jest.fn(async () => ({ id: 'wo-1', status: 'needs_supplement' })),
      saveSupplement: jest.fn(async () => ({ id: 'wo-1', status: 'pending_confirmation' })),
      prepareSupplementDraft: jest.fn(async () => ({ id: 'wo-1', status: 'needs_supplement', aiSupplementDraft: {} })),
      confirmProcessing: jest.fn(async () => ({ id: 'wo-1', status: 'processing' })),
      markProcessed: jest.fn(async () => ({ id: 'wo-1', status: 'processed' })),
      rejectAndClose: jest.fn(async () => ({ id: 'wo-1', status: 'rejected' }))
    } as never)
  }

  it('registers one smart maintenance workbench manifest for the fixed slot', () => {
    const provider = createProvider()
    const manifests = provider.getViewManifests(context, 'agent.workbench.fixed')

    expect(manifests.map((item) => item.key)).toEqual([SMART_MAINTENANCE_WORKBENCH_VIEW_KEY])
    expect(manifests[0].title.zh_Hans).toBe('智能维保工作台')
    expect(manifests[0].clientCommands?.map((item) => item.key)).toEqual(['assistant.chat.send_message'])
    expect(manifests[0].hostEvents?.subscriptions?.[0].filter?.toolNames).toContain(SMART_MAINTENANCE_SAVE_TOOL_NAME)
    expect(manifests[0].hostEvents?.subscriptions?.[0].filter?.toolNames).toContain(
      SMART_MAINTENANCE_IMPORT_SERVICE_DATA_TOOL_NAME
    )
    expect(manifests[0].actions?.find((item) => item.key === 'prepare_service_data_import')).toMatchObject({
      transport: 'file'
    })
    expect(manifests[0].actions?.some((item) => item.key === 'save_report_work_order')).toBe(false)
  })

  it('routes view actions to service methods', async () => {
    const provider = createProvider()
    const result = await provider.executeViewAction(context, SMART_MAINTENANCE_WORKBENCH_VIEW_KEY, 'mark_processed', {
      targetId: 'wo-1',
      input: {
        processingResult: 'fixed',
        processingSummary: '恢复正常'
      }
    } as never)

    expect(result.success).toBe(true)
    expect(result.refresh).toBe(true)
  })

  it('prepares report entry form submissions as assistant messages instead of saving directly', async () => {
    const provider = createProvider()
    const result = await provider.executeViewAction(context, SMART_MAINTENANCE_WORKBENCH_VIEW_KEY, 'prepare_report_chat_message', {
      input: {
        originalContent: 'A 区 3 楼中央空调不制冷',
        customerName: '元数科技',
        deviceType: '中央空调',
        urgency: 'high'
      }
    } as never)

    expect(result.success).toBe(true)
    expect(result.refresh).toBe(false)
    expect(result.data).toMatchObject({
      commandKey: 'assistant.chat.send_message',
      payload: {
        text: expect.stringContaining('smart_maintenance_save_generated_work_order')
      }
    })
  })

  it('instructs the agent to infer service scope from natural language instead of requiring manual scope hints', async () => {
    const provider = createProvider()
    const result = await provider.executeViewAction(context, SMART_MAINTENANCE_WORKBENCH_VIEW_KEY, 'prepare_report_chat_message', {
      input: {
        originalContent: '博雅电力总部园区A区3楼办公区中央空调面板显示E4，今天下午不制冷，请尽快维修。'
      }
    } as never)

    expect(result.success).toBe(true)
    const text = String((result.data as { payload?: { text?: string } })?.payload?.text ?? '')
    expect(text).toContain('客户、项目、场所不是用户必填项')
    expect(text).toContain('根据自然语言中的客户、项目、场所、楼栋、房间、设备名称、设备编号、故障代码与候选数据自动匹配')
    expect(text).toContain('只有在没有任何候选命中或多个候选同等匹配且无法判断时，才追问用户补充')
    expect(text).toContain('多个候选同等合理或当前服务范围完全未覆盖时，不要调用 smart_maintenance_save_generated_work_order')
    expect(text).toContain('缺少非关键字段时仍可保存工单，并把缺失项写入 completenessTips；这类工单会进入待补充')
    expect(text).toContain('保存后请明确反馈生成的工单号、状态是待确认还是待补充，以及需要人工确认或补充的内容')
  })

  it('prepares uploaded service data as an assistant import task without saving directly', async () => {
    const provider = createProvider()

    const result = await provider.executeViewFileAction?.(
      context,
      SMART_MAINTENANCE_WORKBENCH_VIEW_KEY,
      'prepare_service_data_import',
      {} as never,
      {
        originalname: 'service-data-complete.json',
        mimetype: 'application/json',
        size: 128,
        buffer: Buffer.from(
          JSON.stringify({
            customers: [{ code: 'customer-1', name: '元数科技园区' }],
            devices: [{ code: 'AC-A3-001', label: 'A区3楼中央空调' }]
          })
        )
      }
    )

    expect(result).toMatchObject({
      success: true,
      refresh: false,
      data: {
        commandKey: 'assistant.chat.send_message',
        payload: {
          text: expect.stringContaining('smart_maintenance_import_service_data')
        },
        importDraftId: 'import-draft-1',
        summary: {
          customers: 1,
          devices: 1
        }
      }
    })
    const text = String((result?.data as { payload?: { text?: string } })?.payload?.text ?? '')
    expect(text).toContain('importDraftId：import-draft-1')
    expect(text).toContain('不要把 serviceData JSON 重新输出到对话')
    expect(text).not.toContain('serviceData JSON：')
    expect(text).not.toContain('元数科技园区')
  })

  it('routes supplement draft view action to the service', async () => {
    const provider = createProvider()
    const result = await provider.executeViewAction(context, SMART_MAINTENANCE_WORKBENCH_VIEW_KEY, 'prepare_supplement_draft', {
      targetId: 'wo-1',
      input: {
        supplementContent: '位置在二楼财务室，无法打印',
        location: '二楼财务室',
        faultPhenomenon: '无法打印'
      }
    } as never)

    expect(result.success).toBe(true)
    expect(result.refresh).toBe(true)
  })
})
