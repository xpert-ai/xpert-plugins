jest.mock('@xpert-ai/plugin-sdk', () => ({
  ViewExtensionProvider: () => (target: unknown) => target,
  renderRemoteReactIframeHtml: jest.fn(() => '<html>iframe</html>')
}))

import { ScrapeTaskIntakeViewProvider } from './scrape-task-intake-view.provider'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  SCRAPE_TASK_INTAKE_FEATURE,
  SCRAPE_TASK_INTAKE_PROVIDER_KEY,
  SCRAPE_TASK_INTAKE_REMOTE_ENTRY_KEY,
  SCRAPE_TASK_INTAKE_WORKBENCH_VIEW_KEY
} from './constants'

describe('ScrapeTaskIntakeViewProvider', () => {
  function createProvider(service: Record<string, jest.Mock>) {
    return new ScrapeTaskIntakeViewProvider(service as never)
  }

  const hostContext = {
    hostType: 'agent',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: 'user-1',
    hostId: 'assistant-1'
  } as never

  it('supports only agent hosts', () => {
    const provider = createProvider({})
    expect(provider.supports({ hostType: 'agent' } as never)).toBe(true)
    expect(provider.supports({ hostType: 'web' } as never)).toBe(false)
  })

  it('declares the workbench manifest with remote component, platform data source and assistant chat command', () => {
    const provider = createProvider({})
    const manifests = provider.getViewManifests(hostContext, AGENT_WORKBENCH_MAIN_SLOT)

    expect(manifests).toHaveLength(1)
    const manifest = manifests[0]
    expect(manifest.key).toBe(SCRAPE_TASK_INTAKE_WORKBENCH_VIEW_KEY)
    expect(manifest.hostType).toBe('agent')
    expect(manifest.view.type).toBe('remote_component')
    expect(manifest.view.component.entry).toBe(SCRAPE_TASK_INTAKE_REMOTE_ENTRY_KEY)
    expect(manifest.source.provider).toBe(SCRAPE_TASK_INTAKE_PROVIDER_KEY)
    expect(manifest.dataSource.querySchema.supportsPagination).toBe(true)
    expect(manifest.clientCommands?.map((item) => item.key)).toContain('assistant.chat.send_message')
    expect(manifest.hostEvents?.subscriptions?.[0]?.event).toBe('assistant.tool.completed')

    const actionKeys = manifest.actions?.map((item) => item.key)
    expect(actionKeys).toEqual(
      expect.arrayContaining([
        'refresh',
        'prepare_report_chat_message',
        'update_task',
        'mark_needs_supplement',
        'prepare_supplement_draft',
        'save_supplement',
        'confirm_task',
        'start_processing',
        'complete_task',
        'reject_and_close'
      ])
    )
  })

  it('returns no manifests for unsupported slots', () => {
    const provider = createProvider({})
    expect(provider.getViewManifests(hostContext, 'other.slot')).toEqual([])
  })

  it('declares requiredFeatures on every workbench slot manifest so the platform does not filter it out', () => {
    // Both `agent.workbench.main` and `agent.workbench.fixed` are declared with
    // `manifestPolicy.requireFeatureActivation: true` on the platform side, and
    // `isManifestActiveForContext` drops any manifest that declares no
    // requiredFeatures for such a slot.
    const provider = createProvider({})

    for (const slot of [AGENT_WORKBENCH_MAIN_SLOT, AGENT_WORKBENCH_FIXED_SLOT]) {
      const manifests = provider.getViewManifests(hostContext, slot)
      expect(manifests).toHaveLength(1)
      expect(manifests[0].activation?.requiredFeatures).toEqual([SCRAPE_TASK_INTAKE_FEATURE])
    }
  })

  it('prepares the report chat message with assistant instructions', async () => {
    const provider = createProvider({})
    const result = await provider.executeViewAction(
      hostContext,
      SCRAPE_TASK_INTAKE_WORKBENCH_VIEW_KEY,
      'prepare_report_chat_message',
      {
        input: {
          originalContent: '采集某电商平台商品名称和价格。',
          requesterName: '张三'
        }
      } as never
    )

    expect(result.success).toBe(true)
    expect(result.data?.commandKey).toBe('assistant.chat.send_message')
    expect(result.data?.payload.text).toContain('scrape_intake_save_generated_task')
    expect(result.data?.payload.text).toContain('采集某电商平台商品名称和价格。')
  })

  it('rejects an empty report content', async () => {
    const provider = createProvider({})
    const result = await provider.executeViewAction(hostContext, SCRAPE_TASK_INTAKE_WORKBENCH_VIEW_KEY, 'prepare_report_chat_message', {
      input: { originalContent: '   ' }
    } as never)

    expect(result.success).toBe(false)
  })

  it('routes status transition actions to the scoped service', async () => {
    const service = {
      updateTask: jest.fn(async () => ({ id: 'task-1' })),
      markNeedsSupplement: jest.fn(async () => ({ id: 'task-1' })),
      prepareSupplementDraft: jest.fn(async () => ({ id: 'task-1' })),
      saveSupplement: jest.fn(async () => ({ id: 'task-1' })),
      confirmTask: jest.fn(async () => ({ id: 'task-1' })),
      startProcessing: jest.fn(async () => ({ id: 'task-1' })),
      completeTask: jest.fn(async () => ({ id: 'task-1' })),
      rejectAndClose: jest.fn(async () => ({ id: 'task-1' })),
      getCatalog: jest.fn(() => ({ siteTemplates: [] }))
    }
    const provider = createProvider(service)

    await provider.executeViewAction(hostContext, SCRAPE_TASK_INTAKE_WORKBENCH_VIEW_KEY, 'confirm_task', {
      targetId: 'task-1',
      input: { assigneeName: '张三' }
    } as never)
    expect(service.confirmTask).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1' }),
      'task-1',
      expect.objectContaining({ assigneeName: '张三' })
    )

    await provider.executeViewAction(hostContext, SCRAPE_TASK_INTAKE_WORKBENCH_VIEW_KEY, 'reject_and_close', {
      targetId: 'task-1',
      input: { reason: '不合规' }
    } as never)
    expect(service.rejectAndClose).toHaveBeenCalledWith(expect.anything(), 'task-1', { reason: '不合规' })
  })

  it('returns a failure result when the service throws', async () => {
    const provider = createProvider({
      confirmTask: jest.fn(async () => {
        throw new Error('Only pending confirmation or needs supplement tasks can be edited')
      })
    })

    const result = await provider.executeViewAction(hostContext, SCRAPE_TASK_INTAKE_WORKBENCH_VIEW_KEY, 'confirm_task', {
      targetId: 'task-1'
    } as never)

    expect(result.success).toBe(false)
    expect(result.message.en_US).toContain('Only pending confirmation')
  })

  it('loads view data through the scoped service with scalar query parameters', async () => {
    const getViewData = jest.fn(async () => ({ items: [], total: 0, summary: { stats: {} }, meta: { catalog: {} } }))
    const provider = createProvider({ getViewData })

    await provider.getViewData(
      hostContext,
      SCRAPE_TASK_INTAKE_WORKBENCH_VIEW_KEY,
      {
        search: '电商',
        page: 2,
        pageSize: 10,
        parameters: { status: 'pending_confirmation', taskId: 'task-1' }
      } as never
    )

    expect(getViewData).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      expect.objectContaining({ search: '电商', page: 2, pageSize: 10, status: 'pending_confirmation', taskId: 'task-1' })
    )
  })
})
