import 'reflect-metadata'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  ViewExtensionProvider: () => (target: Function) => target,
  renderRemoteReactIframeHtml: jest.fn(),
  pluginArtifactTableName: (namespace: string, key: string) =>
    `plugin_${namespace}_${key}`
}))

import { ConflictException, NotFoundException } from '@nestjs/common'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  ASSISTANT_CONTEXT_SET_COMMAND,
  STORY_STUDIO_MUTATION_TOOL_NAMES,
  STORY_STUDIO_WORKBENCH_VIEW_KEY
} from './constants.js'
import { StoryStudioViewProvider } from './story-studio-view.provider.js'

const project = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'View provider story',
  description: null,
  premise: null,
  productionFormat: 'vertical_short',
  aspectRatio: '9:16',
  targetDurationSeconds: 60,
  status: 'draft',
  revision: 1,
  tags: [],
  failureCode: null,
  failureMessage: null,
  failureRecoverable: null,
  createdAt: '2026-07-25T00:00:00.000Z',
  updatedAt: '2026-07-25T00:00:00.000Z',
  counts: {
    sources: 0,
    events: 0,
    episodes: 0,
    assets: 0,
    shots: 0,
    candidates: 0
  },
  availableReads: [
    'story_get_project_summary',
    'story_get_project_revision'
  ],
  nextAction: 'Review the project brief.'
} as const

function hostContext(): XpertResolvedViewHostContext {
  return {
    tenantId: 'tenant-a',
    organizationId: 'org-a',
    workspaceId: 'workspace-a',
    userId: 'user-a',
    hostType: 'agent',
    hostId: 'assistant-a',
    slots: []
  } as never
}

function createHarness() {
  const service = {
    searchProjects: jest.fn().mockResolvedValue({
      items: [project],
      total: 42,
      page: 2,
      pageSize: 20,
      search: 'view'
    }),
    getProjectSummary: jest.fn().mockResolvedValue(project),
    createProject: jest.fn().mockResolvedValue({
      project,
      receipt: {
        success: true,
        duplicate: false,
        operationId: 'create:view:provider',
        projectId: project.id,
        previousRevision: null,
        revision: 1,
        status: 'draft',
        changedFields: ['title'],
        nextAction: project.nextAction
      }
    }),
    updateProjectStatus: jest.fn(),
    updateProject: jest.fn()
  }
  const production = {
    getProduction: jest
      .fn()
      .mockRejectedValue(new NotFoundException('not found')),
    createDemoProduction: jest.fn(),
    saveProductionFromWorkbench: jest.fn(),
    resolveMediaCandidateFile: jest.fn(),
    uploadAssetImage: jest.fn(),
    uploadVoiceReferenceAudio: jest.fn()
  }
  const cutHandoffs = {
    getLatestSummary: jest.fn().mockResolvedValue(null),
    prepare: jest.fn()
  }
  const videoGeneration = {
    listGenerators: jest.fn().mockResolvedValue({ selectedToolsetId: null, generators: [] }),
    listTasks: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
    setProjectGenerator: jest.fn(),
    generateTakes: jest.fn(),
    refreshTask: jest.fn(),
    cancelTask: jest.fn(),
    retryTask: jest.fn(),
    selectShotVideo: jest.fn()
  }
  return {
    provider: new StoryStudioViewProvider(
      service as never,
      production as never,
      cutHandoffs as never,
      videoGeneration as never
    ),
    service,
    production,
    cutHandoffs,
    videoGeneration
  }
}

describe('StoryStudioViewProvider', () => {
  it('publishes a fixed Workbench manifest that forwards only mutation tools', () => {
    const { provider } = createHarness()
    const [manifest] = provider.getViewManifests(
      hostContext(),
      AGENT_WORKBENCH_FIXED_SLOT
    )

    expect(manifest.key).toBe(STORY_STUDIO_WORKBENCH_VIEW_KEY)
    expect(manifest.workbench?.fixed).toBe(true)
    expect(manifest.dataSource.querySchema).toEqual(
      expect.objectContaining({
        supportsPagination: true,
        supportsSearch: true
      })
    )
    expect(manifest.hostEvents?.subscriptions?.[0]?.filter?.toolNames).toEqual(
      [...STORY_STUDIO_MUTATION_TOOL_NAMES]
    )
    expect(manifest.clientCommands?.map((command) => command.key)).toEqual([
      ASSISTANT_CONTEXT_SET_COMMAND,
      ASSISTANT_CHAT_SEND_MESSAGE_COMMAND
    ])
    expect(Reflect.get(manifest, 'fileAccess')).toEqual({
      purposes: ['preview']
    })
    expect(manifest.actions?.map((action) => action.key)).toEqual(
      expect.arrayContaining([
        'update_project',
        'save_production',
        'upload_asset_image',
        'upload_voice_reference_audio'
      ])
    )
    expect(
      manifest.actions?.find(
        (action) => action.key === 'upload_asset_image'
      )
    ).toEqual(expect.objectContaining({ transport: 'file' }))
  })

  it('resolves preview media through the scoped production service', async () => {
    const { provider, production } = createHarness()
    production.resolveMediaCandidateFile.mockResolvedValue({
      reference: {
        source: 'platform.workspace.files',
        tenantId: 'tenant-a',
        filePath: 'story-studio/project/shot.mp4',
        workspacePath: '/workspace/story-studio/project/shot.mp4'
      },
      fileName: 'shot.mp4',
      mimeType: 'video/mp4',
      size: 1024
    })

    await expect(
      provider.resolveViewFile(
        hostContext(),
        STORY_STUDIO_WORKBENCH_VIEW_KEY,
        {
          fileKey: 'candidate-video',
          targetId: project.id,
          purpose: 'preview'
        }
      )
    ).resolves.toEqual(
      expect.objectContaining({
        fileName: 'shot.mp4',
        mimeType: 'video/mp4'
      })
    )
    expect(production.resolveMediaCandidateFile).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        actorType: 'user'
      }),
      project.id,
      'candidate-video'
    )
  })

  it('passes search pagination and scope to the service', async () => {
    const { provider, service } = createHarness()
    const result = await provider.getViewData(
      hostContext(),
      STORY_STUDIO_WORKBENCH_VIEW_KEY,
      {
        page: 2,
        pageSize: 20,
        search: 'view',
        parameters: {
          status: 'draft',
          projectId: project.id
        }
      }
    )

    expect(service.searchProjects).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        organizationId: 'org-a',
        workspaceId: 'workspace-a',
        assistantId: 'assistant-a',
        actorType: 'user'
      }),
      {
        status: 'draft',
        search: 'view',
        page: 2,
        pageSize: 20
      }
    )
    expect(result).toEqual(
      expect.objectContaining({
        detail: project,
        table: expect.objectContaining({
          total: 42,
          page: 2,
          pageSize: 20
        })
      })
    )
  })

  it('hides only not-found selections and propagates infrastructure errors', async () => {
    const { provider, service } = createHarness()
    service.getProjectSummary.mockRejectedValueOnce(
      new NotFoundException('not found')
    )
    await expect(
      provider.getViewData(
        hostContext(),
        STORY_STUDIO_WORKBENCH_VIEW_KEY,
        { parameters: { projectId: project.id } }
      )
    ).resolves.toEqual(expect.objectContaining({ detail: null }))

    service.getProjectSummary.mockRejectedValueOnce(
      new Error('database unavailable')
    )
    await expect(
      provider.getViewData(
        hostContext(),
        STORY_STUDIO_WORKBENCH_VIEW_KEY,
        { parameters: { projectId: project.id } }
      )
    ).rejects.toThrow('database unavailable')
  })

  it('validates and executes create actions through the scoped service', async () => {
    const { provider, service } = createHarness()
    const result = await provider.executeViewAction(
      hostContext(),
      STORY_STUDIO_WORKBENCH_VIEW_KEY,
      'create_project',
      {
        input: {
          operationId: 'create:view:provider',
          title: 'View provider story',
          productionFormat: 'vertical_short',
          aspectRatio: '9:16',
          targetDurationSeconds: 60,
          changeSummary: 'Created a View provider story'
        }
      }
    )

    expect(result.success).toBe(true)
    expect(service.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
      expect.objectContaining({
        operationId: 'create:view:provider',
        title: 'View provider story'
      })
    )
  })

  it('uploads a manual asset reference through the file transport', async () => {
    const { provider, production } = createHarness()
    production.uploadAssetImage.mockResolvedValue({
      projectId: project.id,
      revision: 2,
      production: { documentRevision: 2 }
    })

    const result = await provider.executeViewFileAction(
      hostContext(),
      STORY_STUDIO_WORKBENCH_VIEW_KEY,
      'upload_asset_image',
      {
        input: {
          projectId: project.id,
          operationId: 'manual:asset:upload:0001',
          baseRevision: 1,
          assetId: 'asset-courier',
          candidateId: 'asset-image-courier-1',
          label: 'courier.png',
          select: true,
          changeSummary: 'Uploaded courier reference'
        }
      },
      {
        buffer: Buffer.from([
          137, 80, 78, 71, 13, 10, 26, 10
        ]),
        originalname: 'courier.png',
        mimetype: 'image/png'
      } as never
    )

    expect(result).toEqual(
      expect.objectContaining({ success: true, refresh: true })
    )
    expect(production.uploadAssetImage).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'user' }),
      expect.objectContaining({
        assetId: 'asset-courier',
        providerReceipt: expect.objectContaining({
          provider: 'manual_upload',
          status: 'completed'
        })
      }),
      expect.objectContaining({
        originalName: 'courier.png',
        mimeType: 'image/png'
      })
    )
  })

  it('uploads a character voice reference through the file transport', async () => {
    const { provider, production } = createHarness()
    production.uploadVoiceReferenceAudio.mockResolvedValue({
      projectId: project.id,
      voiceReference: {
        url: 'https://workspace.example/voice.wav',
        label: 'lin-wan-voice',
        workspacePath: '/workspace/story-studio/project/voice.wav',
        originalName: 'lin-wan.wav',
        mimeType: 'audio/wav',
        size: 44
      }
    })

    const result = await provider.executeViewFileAction(
      hostContext(),
      STORY_STUDIO_WORKBENCH_VIEW_KEY,
      'upload_voice_reference_audio',
      {
        input: {
          projectId: project.id,
          assetId: 'asset-linwan',
          referenceId: 'voice-reference-linwan-1',
          label: 'lin-wan-voice'
        }
      },
      {
        buffer: Buffer.from('RIFF0000WAVE', 'ascii'),
        originalname: 'lin-wan.wav',
        mimetype: 'audio/wav'
      } as never
    )

    expect(result).toEqual(
      expect.objectContaining({ success: true, refresh: false })
    )
    expect(production.uploadVoiceReferenceAudio).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'user' }),
      expect.objectContaining({
        assetId: 'asset-linwan',
        referenceId: 'voice-reference-linwan-1'
      }),
      expect.objectContaining({
        originalName: 'lin-wan.wav',
        mimeType: 'audio/wav'
      })
    )
  })

  it('advances the demo into production before saving its revision-bound document', async () => {
    const { provider, service, production } = createHarness()
    service.updateProjectStatus
      .mockResolvedValueOnce({
        project: { ...project, status: 'planning', revision: 2 }
      })
      .mockResolvedValueOnce({
        project: { ...project, status: 'production', revision: 3 }
      })
    production.createDemoProduction.mockResolvedValue({
      projectId: project.id,
      revision: 4
    })

    const result = await provider.executeViewAction(
      hostContext(),
      STORY_STUDIO_WORKBENCH_VIEW_KEY,
      'create_demo_project',
      {
        input: {
          operationId: 'demo:view:provider'
        }
      }
    )

    expect(service.updateProjectStatus.mock.calls[0][1]).toEqual(
      expect.objectContaining({ baseRevision: 1, status: 'planning' })
    )
    expect(service.updateProjectStatus.mock.calls[1][1]).toEqual(
      expect.objectContaining({ baseRevision: 2, status: 'production' })
    )
    expect(production.createDemoProduction).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
      expect.objectContaining({ baseRevision: 3 })
    )
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ revision: 4, status: 'production' })
      })
    )
  })

  it('returns a business failure for malformed action input', async () => {
    const { provider, service } = createHarness()
    const result = await provider.executeViewAction(
      hostContext(),
      STORY_STUDIO_WORKBENCH_VIEW_KEY,
      'create_project',
      {
        input: {
          operationId: 'short',
          title: 'Invalid input',
          productionFormat: 'not-a-format'
        }
      }
    )

    expect(result.success).toBe(false)
    expect(service.createProject).not.toHaveBeenCalled()
  })

  it('saves human project details with nullable clears and user scope', async () => {
    const { provider, service } = createHarness()
    service.updateProject.mockResolvedValue({
      project: { ...project, title: 'Human edit', revision: 2 },
      receipt: { revision: 2 }
    })

    const result = await provider.executeViewAction(
      hostContext(),
      STORY_STUDIO_WORKBENCH_VIEW_KEY,
      'update_project',
      {
        input: {
          projectId: project.id,
          operationId: 'human:update:project',
          baseRevision: 1,
          title: 'Human edit',
          description: null,
          premise: null,
          targetDurationSeconds: null,
          changeSummary: 'Human corrected the project brief'
        }
      }
    )

    expect(result).toEqual(
      expect.objectContaining({ success: true, refresh: true })
    )
    expect(service.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'user', userId: 'user-a' }),
      expect.objectContaining({
        title: 'Human edit',
        description: null,
        premise: null,
        targetDurationSeconds: null
      })
    )
  })

  it('saves a complete production document through the safe Workbench path', async () => {
    const { provider, production } = createHarness()
    production.saveProductionFromWorkbench.mockResolvedValue({
      projectId: project.id,
      revision: 2,
      production: { documentRevision: 3 }
    })
    const document = {
      sourceSynopsis: 'A reviewed source.',
      adaptationGoal: 'Create a five second short.',
      visualStyle: 'High contrast studio light.',
      characters: [],
      scenes: [
        {
          id: 'scene-1',
          order: 1,
          title: 'Opening',
          summary: 'The character enters.',
          shots: [
            {
              id: 'shot-1',
              title: 'Entrance',
              composition: 'Medium shot.',
              action: 'The door opens.',
              camera: 'Slow push.',
              durationSeconds: 5,
              candidates: []
            }
          ]
        }
      ]
    }
    const result = await provider.executeViewAction(
      hostContext(),
      STORY_STUDIO_WORKBENCH_VIEW_KEY,
      'save_production',
      {
        input: {
          projectId: project.id,
          operationId: 'human:save:production',
          baseRevision: 1,
          production: document,
          changeSummary: 'Human corrected the storyboard'
        }
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        refresh: true,
        data: expect.objectContaining({
          revision: 2,
          documentRevision: 3
        })
      })
    )
    expect(production.saveProductionFromWorkbench).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'user' }),
      expect.objectContaining({ production: document })
    )
  })

  it('returns structured revision conflicts so the Workbench can keep its draft', async () => {
    const { provider, service } = createHarness()
    service.updateProject.mockRejectedValue(
      new ConflictException({
        errorCode: 'story_revision_conflict',
        message: 'Story project changed. Refresh the project and retry.',
        currentRevision: 5
      })
    )

    const result = await provider.executeViewAction(
      hostContext(),
      STORY_STUDIO_WORKBENCH_VIEW_KEY,
      'update_project',
      {
        input: {
          projectId: project.id,
          operationId: 'human:stale:project',
          baseRevision: 1,
          title: 'Stale edit',
          changeSummary: 'Attempted a stale human edit'
        }
      }
    )

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        data: {
          errorCode: 'story_revision_conflict',
          currentRevision: 5
        }
      })
    )
  })
})
