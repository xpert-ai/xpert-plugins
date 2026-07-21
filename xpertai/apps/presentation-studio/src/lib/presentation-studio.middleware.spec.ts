import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
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
    const themes = {
      list: jest.fn().mockResolvedValue({ builtIn: [], custom: [] }),
      materializeGenerator: jest.fn().mockResolvedValue({
        message: 'ready', skill: 'dashi-theme-generator', delivery: 'presentation-studio-plugin',
        archivePath: '/workspace/files/dashi-theme-generator.zip', archiveSha256: 'abc',
        extractDirectory: '$PWD/.theme-work', skillPath: '$PWD/.theme-work/dashi-theme-generator/SKILL.md',
        instruction: 'extract and follow', skillMarkdown: '# Dashi Theme Generator',
        file: { workspacePath: '/workspace/files/dashi-theme-generator.zip', mimeType: 'application/zip' }
      }),
      prepareRuntimeSource: jest.fn().mockResolvedValue({ theme: { status: 'prepared' } }),
      prepareRuntimeImageSources: jest.fn().mockResolvedValue({ theme: { status: 'prepared' } }),
      updateGenerationStatus: jest.fn().mockResolvedValue({ status: 'analyzing' }),
      registerRuntimePackage: jest.fn(),
      markFailed: jest.fn()
    }
    const runtimeFiles = {
      readRuntimeBuffer: jest.fn().mockImplementation(async (locator) => ({
        name: locator.path ?? 'page.png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        reference: { source: 'workspace-files', workspacePath: locator.path }
      }))
    }
    const middleware = new PresentationStudioMiddleware(
      service as never,
      {} as never,
      { info: jest.fn(), error: jest.fn() } as never,
      themes as never
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
      runtime: { capabilities: { require: jest.fn().mockReturnValue(runtimeFiles) } } as never
    })
    return { service, themes, runtimeFiles, agentMiddleware }
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

  it('exposes the explicit custom-theme preparation and registration workflow', async () => {
    const { agentMiddleware } = await createHarness()
    const prepare = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_prepare_theme')
    const register = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_register_theme')
    const progress = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_update_theme_progress')
    const list = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_list_themes')
    const openGenerator = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_open_dashi_theme_generator')

    expect(list).toBeDefined()
    expect(openGenerator?.description).toContain('built directly into Presentation Studio')
    expect(openGenerator?.description).toContain('without skillsMiddleware')
    expect(prepare?.description).toContain('sourceType and sourceMode are explicit contracts')
    expect(prepare?.description).toContain('sourceMode=single_file')
    expect(prepare?.description).toContain('sourceMode=image_files')
    expect(prepare?.description).toContain('does not start a background job')
    expect(openGenerator?.description).toContain('themeId is required')
    expect(openGenerator?.description).toContain('never call with {}')
    expect(openGenerator?.description).toContain('never guess or search')
    expect(openGenerator?.description).toContain('scaffold result is explicitly non-terminal')
    expect(openGenerator?.description).toContain('current agent, not the user')
    expect(openGenerator?.description).toContain('reuse-first')
    expect(progress?.description).toContain('analyzing, generating, and validating')
    expect(register?.description).toContain('explicit fidelity or reuse-first')
  })

  it('injects and materializes the built-in theme-generator skill without skillsMiddleware', async () => {
    const { themes, runtimeFiles, agentMiddleware } = await createHarness()
    const handler = jest.fn(async (request) => request)

    await agentMiddleware.wrapModelCall?.({ systemMessage: 'base instructions' } as never, handler as never)

    const forwarded = handler.mock.calls[0]?.[0] as { systemMessage?: { content?: unknown } }
    expect(forwarded.systemMessage?.content).toContain('presentation_studio_builtin_skill')
    expect(forwarded.systemMessage?.content).toContain('presentation_open_dashi_theme_generator')
    expect(forwarded.systemMessage?.content).toContain('do not require or invoke skillsMiddleware')
    expect(forwarded.systemMessage?.content).toContain('sourceMode')
    expect(forwarded.systemMessage?.content).toContain('inspect each image once')
    expect(forwarded.systemMessage?.content).toContain('must never become the next extraction input')
    expect(forwarded.systemMessage?.content).toContain('Never guess package-manager commands')
    expect(forwarded.systemMessage?.content).toContain('explicit generationMode discriminator')
    expect(forwarded.systemMessage?.content).toContain('pins complete editable components from theme01-theme12')
    expect(forwarded.systemMessage?.content).toContain('internal non-terminal state')
    expect(forwarded.systemMessage?.content).toContain('never tell the user that manual JSX implementation is required')
    expect(forwarded.systemMessage?.content).toContain('ready after presentation_register_theme succeeds')
    expect(forwarded.systemMessage?.content).toContain('never repeat an identical tool call')

    const openGenerator = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_open_dashi_theme_generator')
    const themeId = '0ee71ad5-1f22-4433-8b4e-26b44fd5f264'
    await openGenerator?.invoke({ themeId })
    expect(themes.materializeGenerator).toHaveBeenCalledWith(expect.any(Object), themeId, runtimeFiles)
  })

  it('passes 8 explicit image locators without concatenating their paths', async () => {
    const { themes, runtimeFiles, agentMiddleware } = await createHarness()
    const prepare = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_prepare_theme')
    const files = Array.from({ length: 8 }, (_, index) => ({ path: `files/page-${index + 1}.png` }))

    await prepare?.invoke({ name: 'Image evidence', sourceType: 'images', sourceMode: 'image_files', source: files })

    expect(runtimeFiles.readRuntimeBuffer).toHaveBeenCalledTimes(8)
    expect(themes.prepareRuntimeImageSources).toHaveBeenCalledWith(expect.any(Object), { name: 'Image evidence' }, expect.arrayContaining([
      expect.objectContaining({ name: 'files/page-1.png' })
    ]))
  })

  it('rejects undersized image evidence before reading any files', async () => {
    const { themes, runtimeFiles, agentMiddleware } = await createHarness()
    const prepare = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_prepare_theme')
    const files = [{ path: '/workspace/page-1.png' }]

    await expect(prepare?.invoke({
      name: 'Image evidence',
      sourceType: 'images',
      sourceMode: 'image_files',
      source: files
    })).rejects.toThrow('sourceMode image_files requires 8-30 separate Workspace image locators')

    expect(runtimeFiles.readRuntimeBuffer).not.toHaveBeenCalled()
    expect(themes.prepareRuntimeImageSources).not.toHaveBeenCalled()
  })

  it('accepts the shared Workspace string locator contract for a single source', async () => {
    const { themes, runtimeFiles, agentMiddleware } = await createHarness()
    const prepare = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_prepare_theme')

    await prepare?.invoke({
      name: 'PPTX source', sourceType: 'pptx', sourceMode: 'single_file', source: ['/workspace/template.pptx']
    })

    expect(runtimeFiles.readRuntimeBuffer).toHaveBeenCalledWith('/workspace/template.pptx')
    expect(themes.prepareRuntimeSource).toHaveBeenCalledWith(expect.any(Object), {
      name: 'PPTX source', sourceType: 'pptx'
    }, expect.objectContaining({ buffer: expect.any(Buffer) }))
  })

  it('normalizes a current-conversation host session path to its full Workspace locator', async () => {
    const { themes, runtimeFiles, agentMiddleware } = await createHarness()
    const prepare = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_prepare_theme')

    await prepare?.invoke({
      name: 'PDF source', sourceType: 'pdf', sourceMode: 'single_file',
      source: ['/Users/example/data/sessions/conversation-1/files/file-asset-1/template.pdf']
    })

    expect(runtimeFiles.readRuntimeBuffer).toHaveBeenCalledWith(
      '/workspace/sessions/conversation-1/files/file-asset-1/template.pdf'
    )
    expect(themes.prepareRuntimeSource).toHaveBeenCalledWith(expect.any(Object), {
      name: 'PDF source', sourceType: 'pdf'
    }, expect.objectContaining({ buffer: expect.any(Buffer) }))
  })

  it('normalizes current-conversation host page images before preparing image evidence', async () => {
    const { runtimeFiles, agentMiddleware } = await createHarness()
    const prepare = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_prepare_theme')
    const source = Array.from({ length: 8 }, (_, index) =>
      `/Users/example/data/sessions/conversation-1/files/file-asset-1/pages/page-${String(index + 1).padStart(4, '0')}.png`
    )

    await prepare?.invoke({ name: 'PDF pages', sourceType: 'images', sourceMode: 'image_files', source })

    expect(runtimeFiles.readRuntimeBuffer).toHaveBeenNthCalledWith(
      1, '/workspace/sessions/conversation-1/files/file-asset-1/pages/page-0001.png'
    )
    expect(runtimeFiles.readRuntimeBuffer).toHaveBeenNthCalledWith(
      8, '/workspace/sessions/conversation-1/files/file-asset-1/pages/page-0008.png'
    )
  })

  it('rejects a host session path from another conversation before reading files', async () => {
    const { runtimeFiles, agentMiddleware } = await createHarness()
    const prepare = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_prepare_theme')

    await expect(prepare?.invoke({
      name: 'Foreign PDF', sourceType: 'pdf', sourceMode: 'single_file',
      source: ['/Users/example/data/sessions/conversation-2/files/file-asset-1/template.pdf']
    })).rejects.toThrow('does not belong to the current conversation')
    expect(runtimeFiles.readRuntimeBuffer).not.toHaveBeenCalled()
  })

  it('rejects arbitrary absolute paths and traversal before reading files', async () => {
    const { runtimeFiles, agentMiddleware } = await createHarness()
    const prepare = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_prepare_theme')

    await expect(prepare?.invoke({
      name: 'Host file', sourceType: 'pdf', sourceMode: 'single_file', source: ['/tmp/template.pdf']
    })).rejects.toThrow('must be Workspace locators or files from the current conversation')
    await expect(prepare?.invoke({
      name: 'Traversal', sourceType: 'pdf', sourceMode: 'single_file',
      source: ['/Users/example/data/sessions/conversation-1/files/../template.pdf']
    })).rejects.toThrow('Workspace file path is invalid')
    expect(runtimeFiles.readRuntimeBuffer).not.toHaveBeenCalled()
  })

  it('turns a missing Workspace file into one actionable non-retry error', async () => {
    const { runtimeFiles, agentMiddleware } = await createHarness()
    runtimeFiles.readRuntimeBuffer.mockRejectedValueOnce(new Error('Conversation file not found'))
    const prepare = (agentMiddleware.tools ?? []).find((candidate) => candidate.name === 'presentation_prepare_theme')

    await expect(prepare?.invoke({
      name: 'Missing PDF', sourceType: 'pdf', sourceMode: 'single_file',
      source: ['/Users/example/data/sessions/conversation-1/files/file-asset-1/missing.pdf']
    })).rejects.toThrow('Use the workspacePath returned by the current attachment or parsed-file tool')
    expect(runtimeFiles.readRuntimeBuffer).toHaveBeenCalledTimes(1)
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
