import { PresentationStudioService } from './presentation-studio.service.js'

describe('PresentationStudioService export versioning', () => {
  it('filters deck lists by the current Xpert id', async () => {
    const deckRepository = {
      findAndCount: jest.fn().mockResolvedValue([[], 0])
    }
    const service = new PresentationStudioService(
      deckRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    )

    await service.searchDecks({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      xpertId: 'assistant-1'
    }, {})

    expect(deckRepository.findAndCount).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        assistantId: 'assistant-1'
      })
    }))
  })

  it('rejects a deck id that belongs to another Xpert', async () => {
    const deckRepository = {
      findOne: jest.fn().mockImplementation(({ where }) =>
        where.assistantId === 'assistant-owner' ? { id: where.id, assistantId: 'assistant-owner' } : null)
    }
    const service = new PresentationStudioService(
      deckRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    )

    await expect(service.getDeck({ xpertId: 'assistant-other' }, 'deck-1'))
      .rejects.toThrow('Presentation deck was not found.')
    expect(deckRepository.findOne).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'deck-1', assistantId: 'assistant-other' })
    })
  })

  it('queues an immutable working snapshot without creating a deck version', async () => {
    const deck = {
      id: '97aab7a0-f241-49a8-b52a-88cb6eb84c8e',
      title: 'Working deck',
      goal: 'Test explicit versions',
      themePack: 'theme01',
      status: 'draft',
      revision: 42,
      currentVersionNumber: 3,
      yjsUpdateCount: 7,
      checksum: 'working-checksum',
      editorState: { slideOrder: ['s1', 's2', 's3'], skippedSlides: [], deletedSlides: [], duplicatedSlides: [], text: {}, props: {}, preview: {} },
      deckSpec: {
        title: 'Working deck', goal: 'Test explicit versions', themePack: 'theme01', pageCount: 3,
        slides: [
          { id: 's1', layout: 'theme01_page001', status: 'active', props: {} },
          { id: 's2', layout: 'theme01_page002', status: 'active', props: {} },
          { id: 's3', layout: 'theme01_page003', status: 'active', props: {} }
        ]
      }
    }
    const deckRepository = { findOne: jest.fn().mockResolvedValue(deck), manager: { transaction: jest.fn() } }
    const versionRepository = {
      create: jest.fn((value) => ({ ...value })),
      findOne: jest.fn(),
      save: jest.fn()
    }
    let savedExport: Record<string, unknown> | undefined
    const exportRepository = {
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value) => {
        savedExport = { ...value, id: value.id ?? 'b06d4bbd-9659-4496-b051-300900ab6c0d' }
        return savedExport
      })
    }
    const queue = { enqueue: jest.fn().mockResolvedValue({ jobId: 'presentation-studio-b06d4bbd-9659-4496-b051-300900ab6c0d' }) }
    const catalog = { requireLayout: jest.fn().mockResolvedValue({}) }
    const config = { get: jest.fn().mockReturnValue({ maxPageCount: 30 }) }
    const service = new PresentationStudioService(
      deckRepository as never,
      versionRepository as never,
      {} as never,
      {} as never,
      exportRepository as never,
      {} as never,
      catalog as never,
      {} as never,
      config as never,
      queue as never
    )

    const result = await service.requestExport({}, {
      deckId: deck.id,
      kind: 'pdf',
      expectedRevision: deck.revision
    })

    expect(result).toMatchObject({ versionId: null, workingRevision: 42, status: 'queued' })
    expect(versionRepository.save).not.toHaveBeenCalled()
    expect(deckRepository.manager.transaction).not.toHaveBeenCalled()
    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'presentation-studio-b06d4bbd-9659-4496-b051-300900ab6c0d',
      scopeKey: 'system:global',
      removeOnComplete: { age: 24 * 60 * 60, count: 100 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 100 }
    }))
    expect(String(queue.enqueue.mock.calls[0][0].jobId)).not.toContain(':')
    expect(savedExport).toMatchObject({ versionId: 'working-r42', checksum: 'working-checksum' })
  })

  it('returns a backend collaboration URL with the one-deck session', async () => {
    const collaboration = {
      ensureDocument: jest.fn().mockResolvedValue({ id: 'collaboration-document-1' }),
      createSession: jest.fn().mockResolvedValue({
        sessionId: 'session-1', clientKey: 'client-key-1', documentId: 'collaboration-document-1',
        namespace: '/api/collaboration', connectionUrl: 'http://localhost:3333/api/collaboration', access: 'write',
        actor: { presenceId: 'user-1', displayName: 'Ada', color: '#111827', actorType: 'user' }, expiresAt: Date.now() + 600_000
      })
    }
    const service = new PresentationStudioService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      { get: jest.fn().mockReturnValue(collaboration) } as never
    )

    const session = await service.createCollabSession({}, '97aab7a0-f241-49a8-b52a-88cb6eb84c8e')

    expect(session.connectionUrl).toBe('http://localhost:3333/api/collaboration')
    expect(session.documentId).toBe('collaboration-document-1')
  })

  it('uses the platform collaboration actor identity', async () => {
    const collaboration = {
      ensureDocument: jest.fn().mockResolvedValue({ id: 'collaboration-document-1' }),
      createSession: jest.fn().mockResolvedValue({
        sessionId: 'session-1', clientKey: 'client-key-1', documentId: 'collaboration-document-1',
        namespace: '/api/collaboration', connectionUrl: 'http://localhost:3333/api/collaboration', access: 'write',
        actor: { presenceId: 'user-1', displayName: 'Ada Lovelace', color: '#111827', actorType: 'user', avatarUrl: 'https://example.com/avatar.png' },
        expiresAt: Date.now() + 600_000
      })
    }
    const service = new PresentationStudioService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      { get: jest.fn().mockReturnValue(collaboration) } as never
    )

    const session = await service.createCollabSession(
      { tenantId: 'tenant-1', userId: 'user-1' },
      '97aab7a0-f241-49a8-b52a-88cb6eb84c8e'
    )

    expect(session.actor).toMatchObject({
      displayName: 'Ada Lovelace',
      avatarUrl: 'https://example.com/avatar.png'
    })
  })

  it('stores agent awareness in the same deck awareness scope and filters stale entries', async () => {
    const collaboration = {
      ensureDocument: jest.fn().mockResolvedValue({ id: 'collaboration-document-1' }),
      upsertVirtualPresence: jest.fn().mockResolvedValue({ clientId: 'agent-1', actorType: 'agent' })
    }
    const service = new PresentationStudioService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      { get: jest.fn().mockReturnValue(collaboration) } as never
    )
    const scope = { tenantId: 'tenant-1', organizationId: 'org-1', assistantId: 'assistant-1', agentKey: 'Deck Agent', conversationId: 'conversation-1' }
    const deckId = '97aab7a0-f241-49a8-b52a-88cb6eb84c8e'
    const actor = service.createAgentCollabActor(scope, deckId)

    await service.publishAgentAwareness(scope, deckId, actor, {
      protocolVersion: 2,
      mode: 'edit',
      status: 'editing',
      toolName: 'presentation_patch_slide',
      operationLabel: 'Editing slide',
      slideId: 'slide-1',
      focus: { kind: 'text', key: 'text:slide-1:title' }
    })
    expect(collaboration.upsertVirtualPresence).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'collaboration-document-1',
      actor: expect.objectContaining({ actorType: 'agent', displayName: 'Deck Agent' }),
      presence: expect.objectContaining({ pageId: 'slide-1', status: 'editing', toolName: 'presentation_patch_slide' })
    }))
  })

  it('creates distinct stable agent presence ids per conversation and deck', () => {
    const service = new PresentationStudioService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    )
    const deckId = '97aab7a0-f241-49a8-b52a-88cb6eb84c8e'
    const first = service.createAgentCollabActor({ assistantId: 'assistant-1', agentKey: 'Deck Agent', conversationId: 'conversation-1' }, deckId)
    const second = service.createAgentCollabActor({ assistantId: 'assistant-1', agentKey: 'Deck Agent', conversationId: 'conversation-2' }, deckId)
    const again = service.createAgentCollabActor({ assistantId: 'assistant-1', agentKey: 'Deck Agent', conversationId: 'conversation-1' }, deckId)

    expect(first.presenceId).toBe(again.presenceId)
    expect(first.presenceId).not.toBe(second.presenceId)
    expect(first.actorType).toBe('agent')
  })

  it('reconciles a removed managed queue job to a failed export', async () => {
    const item = {
      id: 'b06d4bbd-9659-4496-b051-300900ab6c0d',
      deckId: '97aab7a0-f241-49a8-b52a-88cb6eb84c8e',
      versionId: 'working-r42',
      kind: 'pdf',
      status: 'queued',
      jobId: 'presentation-studio-b06d4bbd-9659-4496-b051-300900ab6c0d',
      progress: 0,
      stage: 'queued',
      checksum: 'working-checksum'
    }
    const exportRepository = {
      findOne: jest.fn().mockResolvedValue(item),
      save: jest.fn(async (value) => value)
    }
    const queue = { getJob: jest.fn().mockResolvedValue(null) }
    const service = new PresentationStudioService(
      { findOne: jest.fn().mockResolvedValue({ id: item.deckId }) } as never,
      {} as never,
      {} as never,
      {} as never,
      exportRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      queue as never
    )

    const result = await service.getExport({}, item.id)

    expect(result).toMatchObject({ status: 'failed', stage: 'queue-missing' })
    expect(exportRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      errorMessage: 'Managed queue job was not found before the export completed.'
    }))
  })

  it('reconciles queue state while loading Workbench deck details', async () => {
    const deck = {
      id: '97aab7a0-f241-49a8-b52a-88cb6eb84c8e', title: 'Queue state deck', goal: 'Show failed exports',
      themePack: 'theme01', status: 'draft', revision: 1, currentVersionNumber: 0,
      deckSpec: { title: 'Queue state deck', goal: 'Show failed exports', themePack: 'theme01', pageCount: 1, slides: [] }
    }
    const item = {
      id: 'b06d4bbd-9659-4496-b051-300900ab6c0d', deckId: deck.id, versionId: 'working-r1', kind: 'html',
      status: 'queued', jobId: 'presentation-studio-b06d4bbd-9659-4496-b051-300900ab6c0d', progress: 0,
      stage: 'queued', checksum: 'working-checksum'
    }
    const exportRepository = {
      find: jest.fn().mockResolvedValue([item]),
      findOne: jest.fn().mockResolvedValue(item),
      save: jest.fn(async (value) => value)
    }
    const service = new PresentationStudioService(
      { findOne: jest.fn().mockResolvedValue(deck) } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      exportRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { getJob: jest.fn().mockResolvedValue(null) } as never
    )

    const result = await service.getDeck({}, deck.id, false)

    expect(result.exports).toEqual([expect.objectContaining({ status: 'failed', stage: 'queue-missing' })])
  })

  it('deletes a deck version and moves the current pointer to the latest remaining version', async () => {
    const deck = {
      id: '97aab7a0-f241-49a8-b52a-88cb6eb84c8e',
      currentVersionId: 'version-3',
      currentVersionNumber: 3
    }
    const deletedVersion = {
      id: 'version-3',
      deckId: deck.id,
      versionNumber: 3
    }
    const remainingVersion = {
      id: 'version-2',
      deckId: deck.id,
      versionNumber: 2
    }
    const deckRepository = {
      findOne: jest.fn().mockResolvedValue(deck),
      save: jest.fn(async (value) => value)
    }
    const versionRepository = {
      findOne: jest.fn().mockResolvedValue(deletedVersion),
      find: jest.fn().mockResolvedValue([remainingVersion]),
      delete: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const logRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value)
    }
    const service = new PresentationStudioService(
      deckRepository as never,
      versionRepository as never,
      {} as never,
      {} as never,
      {} as never,
      logRepository as never,
      {} as never,
      {} as never,
      {} as never
    )

    const result = await service.deleteVersion({}, deck.id, deletedVersion.id)

    expect(versionRepository.delete).toHaveBeenCalled()
    expect(deckRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      currentVersionId: remainingVersion.id,
      currentVersionNumber: remainingVersion.versionNumber
    }))
    expect(logRepository.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'version_deleted' }))
    expect(result).toMatchObject({
      deletedVersionId: deletedVersion.id,
      currentVersionId: remainingVersion.id,
      currentVersionNumber: remainingVersion.versionNumber
    })
  })

  it('deletes an export record and removes the uploaded artifact when available', async () => {
    const item = {
      id: 'b06d4bbd-9659-4496-b051-300900ab6c0d',
      deckId: '97aab7a0-f241-49a8-b52a-88cb6eb84c8e',
      versionId: 'working-r42',
      kind: 'html',
      status: 'running',
      jobId: 'presentation-studio-b06d4bbd-9659-4496-b051-300900ab6c0d',
      fileReference: {
        reference: {
          source: 'workspace-files',
          filePath: 'workspace://presentations/export.html',
          scope: { workspaceId: 'workspace-1' }
        }
      }
    }
    const exportRepository = {
      findOne: jest.fn().mockResolvedValue(item),
      delete: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const queue = { cancel: jest.fn().mockResolvedValue({ success: true }) }
    const workspaceFiles = { deleteFile: jest.fn().mockResolvedValue(undefined) }
    const runtimeCapabilities = { get: jest.fn().mockReturnValue(workspaceFiles) }
    const logRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value)
    }
    const service = new PresentationStudioService(
      { findOne: jest.fn().mockResolvedValue({ id: item.deckId }) } as never,
      {} as never,
      {} as never,
      {} as never,
      exportRepository as never,
      logRepository as never,
      {} as never,
      {} as never,
      {} as never,
      queue as never,
      runtimeCapabilities as never
    )

    const result = await service.deleteExport({}, item.id)

    expect(queue.cancel).toHaveBeenCalledWith({ jobId: item.jobId })
    expect(workspaceFiles.deleteFile).toHaveBeenCalledWith(expect.objectContaining({ filePath: item.fileReference.reference.filePath }))
    expect(exportRepository.delete).toHaveBeenCalled()
    expect(logRepository.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'export_deleted' }))
    expect(result).toMatchObject({ exportId: item.id, fileDeleted: true })
  })

  it('creates an Artifact link for a completed HTML export', async () => {
    const deck = {
      id: '97aab7a0-f241-49a8-b52a-88cb6eb84c8e',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      assistantId: 'assistant-1',
      title: 'Shared deck',
      goal: 'Share an HTML presentation'
    }
    const item = {
      id: 'b06d4bbd-9659-4496-b051-300900ab6c0d',
      deckId: deck.id,
      versionId: 'version-1',
      kind: 'html',
      status: 'succeeded',
      progress: 100,
      checksum: 'html-checksum',
      fileName: 'shared-deck.html',
      mimeType: 'text/html',
      size: 128,
      fileReference: {
        reference: {
          source: 'platform.workspace.files',
          filePath: 'files/presentation-studio/export.html',
          workspacePath: '/workspace/export.html'
        },
        sha256: 'sha256',
        fileName: 'shared-deck.html',
        mimeType: 'text/html',
        size: 128
      }
    }
    const exportRepository = {
      findOne: jest.fn().mockResolvedValue(item),
      save: jest.fn(async (value) => value)
    }
    const artifacts = {
      createArtifact: jest.fn().mockResolvedValue({ id: 'artifact-1' }),
      createArtifactVersion: jest.fn().mockResolvedValue({ id: 'artifact-version-1', versionNumber: 1 }),
      createArtifactLink: jest.fn().mockResolvedValue({
        id: 'artifact-link-1',
        publicUrl: 'https://xpert.test/artifacts/share/AbCdEfGhJkMn',
        versionMode: 'latest',
        accessMode: 'public_link'
      }),
      revokeArtifactLink: jest.fn()
    }
    const runtimeCapabilities = {
      has: jest.fn((key: string | { id: string }) => (typeof key === 'string' ? key : key.id) === 'platform.artifacts'),
      get: jest.fn((key: string | { id: string }) => (typeof key === 'string' ? key : key.id) === 'platform.artifacts' ? artifacts : undefined)
    }
    const logRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value)
    }
    const service = new PresentationStudioService(
      { findOne: jest.fn().mockResolvedValue(deck) } as never,
      {} as never,
      {} as never,
      {} as never,
      exportRepository as never,
      logRepository as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      runtimeCapabilities as never
    )

    const result = await service.shareHtmlExport({ tenantId: 'tenant-1', organizationId: 'org-1' }, {
      deckId: deck.id,
      exportId: item.id,
      versionMode: 'latest',
      accessMode: 'public_link'
    })

    expect(artifacts.createArtifact).toHaveBeenCalledWith(expect.objectContaining({
      source: expect.objectContaining({
        pluginName: '@xpert-ai/plugin-presentation-studio',
        resourceType: 'presentation_deck_html',
        resourceId: deck.id
      }),
      kind: 'html'
    }))
    expect(artifacts.createArtifactVersion).toHaveBeenCalledWith(expect.objectContaining({
      artifactId: 'artifact-1',
      workspaceFileRef: item.fileReference.reference,
      mimeType: 'text/html',
      checksum: item.checksum
    }))
    expect(artifacts.createArtifactLink).toHaveBeenCalledWith(expect.objectContaining({
      artifactId: 'artifact-1',
      versionMode: 'latest',
      access: expect.objectContaining({ mode: 'public_link', userConfirmedPublicLink: true }),
      presentation: expect.objectContaining({ disposition: 'inline', safeHtmlProfile: 'interactive' })
    }))
    expect(exportRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      artifactId: 'artifact-1',
      artifactVersionId: 'artifact-version-1',
      artifactLinkId: 'artifact-link-1',
      artifactPublicUrl: 'https://xpert.test/artifacts/share/AbCdEfGhJkMn'
    }))
    expect(logRepository.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'export_shared' }))
    expect(result).toMatchObject({
      publicUrl: 'https://xpert.test/artifacts/share/AbCdEfGhJkMn',
      shareUrl: 'https://xpert.test/artifacts/share/AbCdEfGhJkMn'
    })
  })

  it('does not reuse UUID Artifact share links when copying a share link', async () => {
    const deck = {
      id: '97aab7a0-f241-49a8-b52a-88cb6eb84c8e',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      assistantId: 'assistant-1',
      title: 'Shared deck',
      goal: 'Share an HTML presentation'
    }
    const item = {
      id: 'b06d4bbd-9659-4496-b051-300900ab6c0d',
      deckId: deck.id,
      versionId: 'version-1',
      kind: 'html',
      status: 'succeeded',
      progress: 100,
      checksum: 'html-checksum',
      fileName: 'shared-deck.html',
      mimeType: 'text/html',
      size: 128,
      artifactLinkId: 'uuid-link',
      artifactLinkVersionMode: 'latest',
      artifactLinkAccessMode: 'public_link',
      artifactPublicUrl: 'https://xpert.test/artifacts/share/68417089-6dfd-4667-9bc3-5ae82068ce06',
      artifactVersionId: 'artifact-version-1',
      fileReference: {
        reference: {
          source: 'platform.workspace.files',
          filePath: 'files/presentation-studio/export.html',
          workspacePath: '/workspace/export.html'
        },
        sha256: 'sha256',
        fileName: 'shared-deck.html',
        mimeType: 'text/html',
        size: 128
      }
    }
    const exportRepository = {
      findOne: jest.fn().mockResolvedValue(item),
      save: jest.fn(async (value) => value)
    }
    const artifacts = {
      createArtifact: jest.fn().mockResolvedValue({ id: 'artifact-1' }),
      createArtifactVersion: jest.fn(),
      createArtifactLink: jest.fn().mockResolvedValue({
        id: 'artifact-link-1',
        publicUrl: 'https://xpert.test/artifacts/share/QwErTy234567',
        versionMode: 'latest',
        accessMode: 'public_link'
      }),
      revokeArtifactLink: jest.fn()
    }
    const runtimeCapabilities = {
      has: jest.fn((key: string | { id: string }) => (typeof key === 'string' ? key : key.id) === 'platform.artifacts'),
      get: jest.fn((key: string | { id: string }) => (typeof key === 'string' ? key : key.id) === 'platform.artifacts' ? artifacts : undefined)
    }
    const logRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value)
    }
    const service = new PresentationStudioService(
      { findOne: jest.fn().mockResolvedValue(deck) } as never,
      {} as never,
      {} as never,
      {} as never,
      exportRepository as never,
      logRepository as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      runtimeCapabilities as never
    )

    const result = await service.shareHtmlExport({ tenantId: 'tenant-1', organizationId: 'org-1' }, {
      deckId: deck.id,
      exportId: item.id,
      versionMode: 'latest',
      accessMode: 'public_link'
    })

    expect(artifacts.revokeArtifactLink).toHaveBeenCalledWith('uuid-link')
    expect(artifacts.createArtifactVersion).not.toHaveBeenCalled()
    expect(artifacts.createArtifactLink).toHaveBeenCalled()
    expect(exportRepository.save).toHaveBeenLastCalledWith(expect.objectContaining({
      artifactLinkId: 'artifact-link-1',
      artifactPublicUrl: 'https://xpert.test/artifacts/share/QwErTy234567'
    }))
    expect(result).toMatchObject({
      publicUrl: 'https://xpert.test/artifacts/share/QwErTy234567',
      shareUrl: 'https://xpert.test/artifacts/share/QwErTy234567'
    })
  })

  it('queues an HTML export when sharing a deck without a completed HTML export', async () => {
    const deck = {
      id: '97aab7a0-f241-49a8-b52a-88cb6eb84c8e',
      title: 'Deck without HTML',
      goal: 'Share after export',
      themePack: 'theme01',
      status: 'draft',
      revision: 8,
      currentVersionNumber: 0,
      yjsUpdateCount: 0,
      checksum: 'deck-checksum',
      editorState: { slideOrder: ['s1', 's2', 's3'], skippedSlides: [], deletedSlides: [], duplicatedSlides: [], text: {}, props: {}, preview: {} },
      deckSpec: {
        title: 'Deck without HTML', goal: 'Share after export', themePack: 'theme01', pageCount: 3,
        slides: [
          { id: 's1', layout: 'theme01_page001', status: 'active', props: {} },
          { id: 's2', layout: 'theme01_page002', status: 'active', props: {} },
          { id: 's3', layout: 'theme01_page003', status: 'active', props: {} }
        ]
      }
    }
    const deckRepository = { findOne: jest.fn().mockResolvedValue(deck), manager: { transaction: jest.fn() } }
    const versionRepository = { create: jest.fn((value) => ({ ...value })) }
    const exportRecord = { id: 'export-html-1', deckId: deck.id, kind: 'html', status: 'queued', progress: 0 }
    const exportRepository = {
      findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null),
      create: jest.fn((value) => ({ ...value })),
      save: jest.fn(async (value) => ({ ...value, id: value.id ?? exportRecord.id }))
    }
    const queue = { enqueue: jest.fn().mockResolvedValue({ jobId: 'presentation-studio-export-html-1' }) }
    const catalog = { requireLayout: jest.fn().mockResolvedValue({}) }
    const config = { get: jest.fn().mockReturnValue({ maxPageCount: 30 }) }
    const service = new PresentationStudioService(
      deckRepository as never,
      versionRepository as never,
      {} as never,
      {} as never,
      exportRepository as never,
      {} as never,
      catalog as never,
      {} as never,
      config as never,
      queue as never
    )

    const result = await service.shareDeckHtmlExport({}, {
      deckId: deck.id,
      expectedRevision: deck.revision,
      versionMode: 'latest',
      accessMode: 'public_link'
    })

    expect(exportRepository.findOne).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ kind: 'html', status: 'succeeded', checksum: deck.checksum })
    }))
    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      queueName: 'presentation-studio.export',
      jobName: 'render'
    }))
    expect(result).toMatchObject({
      exportId: 'export-html-1',
      kind: 'html',
      status: 'queued',
      sharePending: true,
      publicUrl: null
    })
  })
})
