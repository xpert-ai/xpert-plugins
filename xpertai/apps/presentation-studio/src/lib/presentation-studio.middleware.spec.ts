import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { PRESENTATION_THEME_CATALOG, PRESENTATION_THEME_PACKS } from './constants.js'
import { PresentationStudioMiddleware } from './presentation-studio.middleware.js'

jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn().mockResolvedValue(undefined) }))

const mockedDispatchCustomEvent = jest.mocked(dispatchCustomEvent)

describe('PresentationStudioMiddleware agent awareness', () => {
  beforeEach(() => mockedDispatchCustomEvent.mockReset().mockResolvedValue(undefined))

  async function createHarness(options: { currentContext?: Record<string, unknown> | null } = {}) {
    const actor = { presenceId: 'agent_abc', displayName: 'Deck Agent', color: '#7c3aed', actorType: 'agent' as const, avatarUrl: null }
    const service = {
      createAgentCollabActor: jest.fn().mockReturnValue(actor),
      publishAgentAwareness: jest.fn().mockResolvedValue({}),
      getWorkbenchAgentContext: jest.fn().mockResolvedValue(options.currentContext ?? null),
      shareDeckHtmlExport: jest.fn().mockResolvedValue({
        exportId: 'b06d4bbd-9659-4496-b051-300900ab6c0d',
        publicUrl: 'https://xpert.test/artifacts/share/AbCdEfGhJkMn'
      }),
      revokeDeckHtmlShare: jest.fn().mockResolvedValue({ revoked: true })
    }
    const middleware = new PresentationStudioMiddleware(
      service as never,
      {} as never,
      { info: jest.fn(), error: jest.fn() } as never
    )
    const agentMiddleware = await middleware.createMiddleware({}, {
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
      xpertId: 'assistant-1',
      agentKey: 'Deck Agent',
      conversationId: 'conversation-1',
      node: {} as never,
      tools: new Map(),
      runtime: {} as never
    })
    return { service, agentMiddleware }
  }

  it('publishes editing and done statuses around a deck mutation tool', async () => {
    const { service, agentMiddleware } = await createHarness()

    await agentMiddleware.wrapToolCall?.({
      toolCall: { name: 'presentation_patch_slide', args: { deckId: 'deck-1', slideId: 'slide-1', textPatch: { 'text:slide-1:title': 'Title' } } },
      tool: {} as never,
      state: {} as never,
      runtime: {} as never
    } as never, async () => ({ content: 'ok' }) as never)

    expect(service.createAgentCollabActor).toHaveBeenCalledWith(expect.objectContaining({
      assistantId: 'assistant-1',
      agentKey: 'Deck Agent',
      conversationId: 'conversation-1'
    }), 'deck-1')
    expect(service.publishAgentAwareness).toHaveBeenNthCalledWith(1, expect.any(Object), 'deck-1', expect.any(Object), expect.objectContaining({
      status: 'editing',
      toolName: 'presentation_patch_slide',
      slideId: 'slide-1',
      focus: { kind: 'text', key: 'text:slide-1:title' }
    }))
    expect(service.publishAgentAwareness).toHaveBeenNthCalledWith(2, expect.any(Object), 'deck-1', expect.any(Object), expect.objectContaining({
      status: 'done',
      toolName: 'presentation_patch_slide'
    }))
  })

  it('publishes control focus for non-text prop patches', async () => {
    const { service, agentMiddleware } = await createHarness()

    await agentMiddleware.wrapToolCall?.({
      toolCall: { name: 'presentation_patch_slide', args: { deckId: 'deck-1', slideId: 'slide-1', propsPatch: { themeColor: 'blue' } } },
      tool: {} as never,
      state: {} as never,
      runtime: {} as never
    } as never, async () => ({ content: 'ok' }) as never)

    expect(service.publishAgentAwareness).toHaveBeenNthCalledWith(1, expect.any(Object), 'deck-1', expect.any(Object), expect.objectContaining({
      status: 'editing',
      focus: { kind: 'control', key: 'themeColor' }
    }))
  })

  it('publishes element focus for moved visual element patches', async () => {
    const { service, agentMiddleware } = await createHarness()

    await agentMiddleware.wrapToolCall?.({
      toolCall: {
        name: 'presentation_patch_slide',
        args: {
          deckId: 'deck-1',
          slideId: 'slide-1',
          propsPatch: { __studioElementPositions: { 'element:theme01-001:p0-1': { x: 12, y: 16 } } }
        }
      },
      tool: {} as never,
      state: {} as never,
      runtime: {} as never
    } as never, async () => ({ content: 'ok' }) as never)

    expect(service.publishAgentAwareness).toHaveBeenNthCalledWith(1, expect.any(Object), 'deck-1', expect.any(Object), expect.objectContaining({
      status: 'editing',
      focus: { kind: 'element', key: 'element:theme01-001:p0-1' }
    }))
  })

  it('publishes failed status when a deck mutation tool throws', async () => {
    const { service, agentMiddleware } = await createHarness()

    await expect(agentMiddleware.wrapToolCall?.({
      toolCall: { name: 'presentation_add_slide', args: { deckId: 'deck-1' } },
      tool: {} as never,
      state: {} as never,
      runtime: {} as never
    } as never, async () => { throw new Error('boom') })).rejects.toThrow('boom')

    expect(service.publishAgentAwareness).toHaveBeenLastCalledWith(expect.any(Object), 'deck-1', expect.any(Object), expect.objectContaining({
      status: 'failed',
      toolName: 'presentation_add_slide'
    }))
  })

  it('does not publish agent awareness for read-only tools without a deck target or current workbench context', async () => {
    const { service, agentMiddleware } = await createHarness()

    await agentMiddleware.wrapToolCall?.({
      toolCall: { name: 'presentation_search_layouts', args: { themePack: 'theme01', role: 'cover' } },
      tool: {} as never,
      state: {} as never,
      runtime: {} as never
    } as never, async () => ({ content: 'ok' }) as never)

    expect(service.publishAgentAwareness).not.toHaveBeenCalled()
  })

  it('publishes thinking presence for read-only layout searches when current workbench context exists', async () => {
    const { service, agentMiddleware } = await createHarness({
      currentContext: {
        deckId: 'deck-1',
        slideId: 'slide-1',
        assistantDisplayName: 'Presentation Studio Assistant'
      }
    })

    await agentMiddleware.wrapToolCall?.({
      toolCall: { name: 'presentation_search_layouts', args: { themePack: 'theme01', role: 'cover' } },
      tool: {} as never,
      state: {} as never,
      runtime: {} as never
    } as never, async () => ({ content: 'ok' }) as never)

    expect(service.createAgentCollabActor).toHaveBeenCalledWith(expect.objectContaining({
      assistantDisplayName: 'Presentation Studio Assistant'
    }), 'deck-1')
    expect(service.publishAgentAwareness).toHaveBeenNthCalledWith(1, expect.any(Object), 'deck-1', expect.any(Object), expect.objectContaining({
      status: 'thinking',
      toolName: 'presentation_search_layouts',
      slideId: 'slide-1',
      focus: { kind: 'slide' }
    }))
  })

  it('describes layout inspection as a read-only planning tool', async () => {
    const { agentMiddleware } = await createHarness()
    const inspectTool = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_inspect_layouts')
    const addSlideTool = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_add_slide')

    expect(inspectTool?.description).toContain('read-only planning tool')
    expect(inspectTool?.description).toContain('HARD LIMIT')
    expect(inspectTool?.description).toContain('sequential batches of at most 8')
    expect(addSlideTool?.description).toContain('array items may contain only allowedKeys')
  })

  it('exposes every theme name and scenario to the agent', async () => {
    const { agentMiddleware } = await createHarness()
    const createDeckTool = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_create_deck')

    for (const key of PRESENTATION_THEME_PACKS) {
      expect(createDeckTool?.description).toContain(`${key} ${PRESENTATION_THEME_CATALOG[key].displayName}`)
      expect(createDeckTool?.description).toContain(PRESENTATION_THEME_CATALOG[key].scenario)
    }
  })

  it('returns only the share URL when an HTML share is ready', async () => {
    const { service, agentMiddleware } = await createHarness()
    const shareTool = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_share_html')
    const deckId = '97aab7a0-f241-49a8-b52a-88cb6eb84c8e'

    await expect(shareTool?.invoke({ deckId })).resolves.toEqual({
      shareUrl: 'https://xpert.test/artifacts/share/AbCdEfGhJkMn'
    })
    expect(service.shareDeckHtmlExport).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      userId: 'user-1'
    }), {
      deckId,
      versionMode: 'version',
      accessMode: undefined,
      allowDownload: false,
      actor: 'agent'
    })
  })

  it('returns only pending status and export id while preparing an HTML share', async () => {
    const { service, agentMiddleware } = await createHarness()
    service.shareDeckHtmlExport.mockResolvedValueOnce({
      exportId: 'b06d4bbd-9659-4496-b051-300900ab6c0d',
      sharePending: true
    })
    const shareTool = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_share_html')

    await expect(shareTool?.invoke({ deckId: '97aab7a0-f241-49a8-b52a-88cb6eb84c8e' })).resolves.toEqual({
      status: 'pending',
      exportId: 'b06d4bbd-9659-4496-b051-300900ab6c0d'
    })
  })

  it('revokes an active HTML share only through the dedicated presentation tool', async () => {
    const { service, agentMiddleware } = await createHarness()
    const revokeTool = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_revoke_html_share')
    const deckId = '97aab7a0-f241-49a8-b52a-88cb6eb84c8e'

    await expect(revokeTool?.invoke({ deckId })).resolves.toEqual({ revoked: true })
    expect(service.revokeDeckHtmlShare).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      userId: 'user-1'
    }), deckId, 'agent')
  })

  it('dispatches changeSummary as running and successful tool timeline messages', async () => {
    const { agentMiddleware } = await createHarness()

    await agentMiddleware.wrapToolCall?.({
      toolCall: {
        id: 'tool-call-1',
        name: 'presentation_add_slide',
        args: { deckId: 'deck-1', layout: 'theme01_page001', props: {}, changeSummary: '添加市场概览页' }
      },
      tool: {} as never,
      state: {} as never,
      runtime: { metadata: { toolName: 'Add slide', toolset: 'Presentation Studio' } } as never
    } as never, async () => ({ content: '{"deckId":"deck-1","slideId":"slide-2"}' }) as never)

    expect(mockedDispatchCustomEvent).toHaveBeenCalledTimes(2)
    expect(mockedDispatchCustomEvent).toHaveBeenNthCalledWith(1, expect.any(String), expect.objectContaining({
      id: 'tool-call-1',
      tool: 'presentation_add_slide',
      title: 'Add slide',
      message: '添加市场概览页',
      status: 'running'
    }))
    expect(mockedDispatchCustomEvent).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({
      message: '添加市场概览页',
      status: 'success',
      output: '{"deckId":"deck-1","slideId":"slide-2"}'
    }))
  })

  it('dispatches failed changeSummary events and preserves the tool error', async () => {
    const { agentMiddleware } = await createHarness()

    await expect(agentMiddleware.wrapToolCall?.({
      toolCall: {
        id: 'tool-call-2',
        name: 'presentation_patch_slide',
        args: { deckId: 'deck-1', slideId: 'slide-1', changeSummary: '更新标题' }
      },
      tool: {} as never,
      state: {} as never,
      runtime: {} as never
    } as never, async () => { throw new Error('patch failed') })).rejects.toThrow('patch failed')

    expect(mockedDispatchCustomEvent).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({
      message: '更新标题',
      status: 'fail',
      error: 'patch failed'
    }))
  })

  it('does not dispatch a timeline event without changeSummary', async () => {
    const { agentMiddleware } = await createHarness()

    await agentMiddleware.wrapToolCall?.({
      toolCall: { name: 'presentation_add_slide', args: { deckId: 'deck-1' } },
      tool: {} as never,
      state: {} as never,
      runtime: {} as never
    } as never, async () => ({ content: 'ok' }) as never)

    expect(mockedDispatchCustomEvent).not.toHaveBeenCalled()
  })

  it('keeps mutations successful when timeline dispatch fails', async () => {
    mockedDispatchCustomEvent.mockRejectedValueOnce(new Error('timeline unavailable'))
    const { agentMiddleware } = await createHarness()

    await expect(agentMiddleware.wrapToolCall?.({
      toolCall: {
        name: 'presentation_add_slide',
        args: { deckId: 'deck-1', changeSummary: '添加页面' }
      },
      tool: {} as never,
      state: {} as never,
      runtime: {} as never
    } as never, async () => ({ content: 'ok' }) as never)).resolves.toEqual({ content: 'ok' })
  })
})
