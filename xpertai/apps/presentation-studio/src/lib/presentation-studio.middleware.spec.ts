import { PresentationStudioMiddleware } from './presentation-studio.middleware.js'

describe('PresentationStudioMiddleware agent awareness', () => {
  async function createHarness(options: { currentContext?: Record<string, unknown> | null } = {}) {
    const actor = { presenceId: 'agent_abc', displayName: 'Deck Agent', color: '#7c3aed', actorType: 'agent' as const, avatarUrl: null }
    const service = {
      createAgentCollabActor: jest.fn().mockReturnValue(actor),
      publishAgentAwareness: jest.fn().mockResolvedValue({}),
      getWorkbenchAgentContext: jest.fn().mockResolvedValue(options.currentContext ?? null)
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
})
