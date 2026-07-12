import { PRESENTATION_MUTATION_TOOL_NAMES, PRESENTATION_TOOL_NAMES } from './constants.js'
import { PresentationStudioViewProvider } from './presentation-studio-view.provider.js'

describe('PresentationStudioViewProvider incremental host events', () => {
  it('forwards only mutations and never asks the host to refresh the remote component', () => {
    const provider = new PresentationStudioViewProvider(null!)
    const [manifest] = provider.getViewManifests({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      hostType: 'agent',
      hostId: 'assistant-1',
      slots: [{ key: 'agent.workbench.fixed', mode: 'sections' }]
    }, 'agent.workbench.fixed')
    const subscription = manifest.hostEvents?.subscriptions?.[0]

    expect(manifest.dataSource.cache?.enabled).toBe(false)
    expect(manifest.actions?.some((action) => action.key === 'load_theme_runtime' && !action.placement)).toBe(true)
    expect(manifest.actions?.some((action) => action.key === 'load_asset_previews' && !action.placement)).toBe(true)
    expect(manifest.actions?.some((action) => action.key === 'render_preview')).toBe(false)
    expect(manifest.view.type === 'remote_component'
      ? (manifest.view.dataSource as { cache?: { enabled?: boolean } }).cache?.enabled
      : undefined).toBe(false)
    expect(subscription?.action?.type).toBe('forward')
    expect(subscription?.filter?.toolNames).toEqual([...PRESENTATION_MUTATION_TOOL_NAMES])
    for (const toolName of PRESENTATION_TOOL_NAMES) {
      if (!(PRESENTATION_MUTATION_TOOL_NAMES as readonly string[]).includes(toolName)) {
        expect(subscription?.filter?.toolNames).not.toContain(toolName)
      }
    }
  })

  it('returns native workbench data without translating HTML preview metadata', async () => {
    const service = {
      getWorkbenchData: jest.fn().mockResolvedValue({
        item: { deckId: 'deck-1', title: 'Native deck' }, versions: [], exports: [], assets: []
      })
    }
    const provider = new PresentationStudioViewProvider(service as never)
    const result = await provider.getViewData({
      tenantId: 'tenant-1', organizationId: 'org-1', workspaceId: 'workspace-1', userId: 'user-1',
      hostType: 'agent', hostId: 'assistant-1', slots: []
    }, 'presentation_studio', { parameters: { table: 'deck_detail', deckId: 'deck-1' } })

    expect(service.getWorkbenchData).toHaveBeenCalledWith(expect.objectContaining({
      xpertId: 'assistant-1',
      assistantId: 'assistant-1'
    }), expect.objectContaining({ deckId: 'deck-1' }))
    expect(result).toEqual({ item: { deckId: 'deck-1', title: 'Native deck' }, versions: [], exports: [], assets: [] })
  })
})
