import { renderRemoteModuleIframeHtml } from '@xpert-ai/plugin-sdk'
import { PRESENTATION_MUTATION_TOOL_NAMES, PRESENTATION_TOOL_NAMES } from './constants.js'
import { PresentationStudioViewProvider } from './presentation-studio-view.provider.js'

describe('PresentationStudioViewProvider incremental host events', () => {
  it('renders a self-contained module iframe without host React UMD scripts', async () => {
    const provider = new PresentationStudioViewProvider(null!)

    const result = await provider.getRemoteComponentEntry({
      tenantId: 'tenant-1', organizationId: 'org-1', workspaceId: 'workspace-1', userId: 'user-1',
      hostType: 'agent', hostId: 'assistant-1', slots: []
    }, 'presentation_studio', { isolation: 'iframe', entry: 'presentation-studio-workbench' })

    expect(result.contentType).toBe('text/html; charset=utf-8')
    expect(jest.mocked(renderRemoteModuleIframeHtml)).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Presentation Studio',
      appScript: expect.stringContaining('19.2.7'),
      appCss: expect.any(String)
    }))
    expect(jest.mocked(renderRemoteModuleIframeHtml).mock.calls[0]?.[0]).not.toEqual(expect.objectContaining({
      reactUmd: expect.anything(),
      reactDomUmd: expect.anything()
    }))
  })

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
    expect(manifest.fileAccess).toEqual({ purposes: ['preview'] })
    expect(manifest.actions?.some((action) => action.key === 'load_theme_previews' && !action.placement)).toBe(true)
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

  it('lists presentations without materializing the theme gallery as a deck', async () => {
    const service = {
      getWorkbenchData: jest.fn().mockResolvedValue({ items: [] })
    }
    const provider = new PresentationStudioViewProvider(service as never)
    const context = {
      tenantId: 'tenant-1', organizationId: 'org-1', workspaceId: 'workspace-1', userId: 'user-1',
      hostType: 'agent' as const, hostId: 'assistant-1', slots: []
    }

    await provider.getViewData(context, 'presentation_studio', { parameters: { table: 'decks' } })

    expect(service.getWorkbenchData).toHaveBeenCalledTimes(1)
  })

  it('loads the independent theme gallery through a view action', async () => {
    const service = {
      getThemePreviewGallery: jest.fn().mockResolvedValue([{
        themePack: 'theme01',
        fileKey: 'theme01',
        displayName: '轻拟态风',
        scenario: '产品介绍',
        fileUrl: 'https://xpert.test/theme01.png',
        filePath: 'files/presentation-studio/theme-previews/theme01.png',
        reference: {
          source: 'platform.workspace.files',
          tenantId: 'tenant-1',
          catalog: 'xperts',
          scopeId: 'assistant-1',
          xpertId: 'assistant-1',
          filePath: 'files/presentation-studio/theme-previews/theme01.png',
          workspacePath: 'files/presentation-studio/theme-previews/theme01.png'
        }
      }])
    }
    const provider = new PresentationStudioViewProvider(service as never)
    const context = {
      tenantId: 'tenant-1', organizationId: 'org-1', workspaceId: 'workspace-1', userId: 'user-1',
      hostType: 'agent' as const, hostId: 'assistant-1', slots: []
    }

    const result = await provider.executeViewAction(
      context,
      'presentation_studio',
      'load_theme_previews',
      { input: {} } as never
    )

    expect(service.getThemePreviewGallery).toHaveBeenCalledWith(expect.objectContaining({
      assistantId: 'assistant-1',
      xpertId: 'assistant-1'
    }))
    expect(result).toMatchObject({
      success: true,
      data: {
        title: 'ppt主题预览',
        items: [{ themePack: 'theme01', fileKey: 'theme01', fileUrl: 'https://xpert.test/theme01.png' }]
      }
    })
    expect(JSON.stringify(result)).not.toContain('"reference"')
    expect(JSON.stringify(result)).not.toContain('"filePath"')
  })

  it('resolves theme previews through the scoped View file-access boundary', async () => {
    const resource = {
      reference: {
        source: 'platform.workspace.files' as const,
        tenantId: 'tenant-1',
        userId: 'user-1',
        catalog: 'projects' as const,
        scopeId: 'project-1',
        projectId: 'project-1',
        filePath: 'files/presentation-studio/theme-previews/theme01-轻拟态风.png',
        workspacePath: 'files/presentation-studio/theme-previews/theme01-轻拟态风.png'
      },
      fileName: 'theme01-轻拟态风.png',
      mimeType: 'image/png',
      size: 1024
    }
    const service = {
      resolveThemePreviewFile: jest.fn().mockResolvedValue(resource)
    }
    const provider = new PresentationStudioViewProvider(service as never)
    const context = {
      tenantId: 'tenant-1', organizationId: 'org-1', workspaceId: 'workspace-1', userId: 'user-1',
      hostType: 'agent' as const, hostId: 'assistant-1', slots: [],
      runtimeScope: {
        projectId: 'project-1',
        conversationId: null,
        dataScopeKey: 'project:project-1',
        workspaceFiles: {
          catalog: 'projects' as const,
          scopeId: 'project-1',
          projectId: 'project-1'
        }
      }
    }

    await expect(provider.resolveViewFile(context, 'presentation_studio', {
      fileKey: 'theme01',
      purpose: 'preview'
    })).resolves.toEqual(resource)
    expect(service.resolveThemePreviewFile).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      projectId: 'project-1',
      workspaceFiles: expect.objectContaining({ catalog: 'projects', scopeId: 'project-1' })
    }), 'theme01')
  })

  it('opens a Project deck with read-only collaboration access for a member', async () => {
    const service = {
      openDeck: jest.fn().mockImplementation(async (scope) => ({
        item: { id: 'deck-1', title: 'Shared deck' },
        versions: [],
        exports: [],
        assets: [],
        collab: { sessionId: 'session-1', documentId: 'document-1', access: scope.collaborationAccess }
      }))
    }
    const provider = new PresentationStudioViewProvider(service as never)
    const context = {
      tenantId: 'tenant-1', organizationId: 'org-1', workspaceId: 'workspace-1', userId: 'user-2',
      hostType: 'agent' as const, hostId: 'assistant-1', slots: [],
      runtimeScope: {
        projectId: 'project-1',
        conversationId: null,
        dataScopeKey: 'project:project-1',
        projectAccess: {
          role: 'member' as const,
          canRead: true,
          canEdit: false,
          canManage: false,
          canUse: true
        },
        workspaceFiles: {
          catalog: 'projects' as const,
          scopeId: 'project-1',
          projectId: 'project-1',
          userId: 'user-2',
          isolateByUser: false
        }
      }
    }

    const result = await provider.executeViewAction(
      context,
      'presentation_studio',
      'open_deck',
      { targetId: 'deck-1', input: {} } as never
    )

    expect(result).toMatchObject({
      success: true,
      data: {
        collab: { access: 'read' }
      }
    })
    expect(service.openDeck).toHaveBeenCalledWith(
      expect.objectContaining({ collaborationAccess: 'read' }),
      'deck-1'
    )
  })
})
