import 'reflect-metadata'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: Function) => target,
  RequestContext: {
    getOrganizationId: () => null
  },
  WorkspaceFilesRuntimeCapability: {
    id: 'platform.workspace.files'
  },
  pluginArtifactTableName: (namespace: string, key: string) =>
    `plugin_${namespace}_${key}`
}))

jest.mock('@langchain/core/tools', () => ({
  tool: jest.fn((handler, config) => ({
    ...config,
    invoke: handler
  }))
}))

const mockDispatchCustomEvent = jest.fn()
jest.mock('@langchain/core/callbacks/dispatch', () => ({
  dispatchCustomEvent: (...args: unknown[]) =>
    mockDispatchCustomEvent(...args)
}))

import type {
  AgentMiddleware,
  IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'
import {
  STORY_ATTACH_GENERATED_ASSET_IMAGE_TOOL_NAME,
  STORY_ATTACH_GENERATED_VIDEO_TOOL_NAME,
  STORY_CREATE_ADAPTATION_SUGGESTION_TOOL_NAME,
  STORY_CREATE_PROJECT_TOOL_NAME,
  STORY_SEARCH_PROJECTS_TOOL_NAME,
  STORY_START_PRODUCTION_TOOL_NAME,
  STORY_STUDIO_MIDDLEWARE_TOOL_NAMES,
  STORY_UPSERT_PRODUCTION_SHOT_TOOL_NAME,
  STORY_UPDATE_PROJECT_STATUS_TOOL_NAME
} from './constants.js'
import { StoryStudioMiddleware } from './story-studio.middleware.js'
import type { StoryMutationReceipt } from './types.js'

type TestTool = {
  name: string
  invoke(input: object): Promise<string>
}

const receipt: StoryMutationReceipt = {
  success: true,
  duplicate: false,
  operationId: 'create:story:middleware',
  projectId: '00000000-0000-4000-8000-000000000001',
  previousRevision: null,
  revision: 1,
  status: 'draft',
  changedFields: ['title', 'status'],
  nextAction: 'Review the project brief.'
}

function middlewareContext(): IAgentMiddlewareContext {
  return {
    tenantId: 'tenant-a',
    organizationId: 'org-a',
    workspaceId: 'workspace-a',
    projectId: 'host-project-a',
    userId: 'user-a',
    conversationId: 'conversation-a',
    xpertId: 'assistant-a',
    runtime: {
      capabilities: {
        require: () => ({
          readRuntimeBuffer: jest.fn().mockResolvedValue({
            name: 'task.mp4',
            buffer: Buffer.from('video'),
            reference: {
              source: 'platform.workspace.files',
              filePath: 'files/task.mp4',
              workspacePath: '/workspace/files/task.mp4'
            }
          }),
          writeRuntimeBuffer: jest.fn().mockImplementation((input) => ({
            name: input.fileName,
            filePath: `${input.folder}/${input.fileName}`,
            workspacePath: `/workspace/${input.folder}/${input.fileName}`,
            mimeType: input.mimeType,
            size: input.size,
            catalog: 'xperts',
            scopeId: 'assistant-a',
            reference: {
              source: 'platform.workspace.files',
              filePath: `${input.folder}/${input.fileName}`,
              workspacePath: `/workspace/${input.folder}/${input.fileName}`,
              catalog: 'xperts',
              scopeId: 'assistant-a',
              xpertId: 'assistant-a'
            }
          }))
        })
      }
    }
  } as never
}

function createHarness() {
  const service = {
    createProject: jest.fn().mockResolvedValue({
      project: { id: receipt.projectId },
      receipt
    }),
    searchProjects: jest.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      search: ''
    }),
    getProjectSummary: jest.fn(),
    updateProject: jest.fn(),
    updateProjectStatus: jest.fn(),
    reportFailure: jest.fn()
  }
  const production = {
    saveProduction: jest.fn(),
    getProduction: jest.fn(),
    startProduction: jest.fn().mockResolvedValue({
      success: true,
      duplicate: false,
      projectId: receipt.projectId,
      revision: 2,
      documentRevision: 1,
      sceneId: 'scene-river',
      shotIds: ['shot-ask'],
      counts: {
        sources: 1,
        beats: 0,
        episodes: 0,
        assets: 0,
        characters: 1,
        scenes: 1,
        shots: 1,
        candidates: 0,
        selectedCandidates: 0
      },
      totalDurationSeconds: 5
    }),
    upsertScene: jest.fn(),
    upsertShot: jest.fn().mockResolvedValue({
      success: true,
      duplicate: false,
      projectId: receipt.projectId,
      revision: 4,
      documentRevision: 2,
      sceneId: 'scene-river',
      shotId: 'shot-crossing',
      shotIds: ['shot-crossing'],
      counts: {
        sources: 1,
        beats: 0,
        episodes: 1,
        assets: 0,
        characters: 3,
        scenes: 1,
        shots: 1,
        candidates: 0,
        selectedCandidates: 0
      },
      totalDurationSeconds: 6
    }),
    attachAssetImage: jest.fn().mockResolvedValue({
      success: true,
      projectId: receipt.projectId,
      revision: 2
    })
  }
  const generatedMedia = {
    attachGeneratedVideo: jest.fn()
  }
  const suggestions = {
    list: jest.fn(),
    create: jest.fn().mockResolvedValue({
      success: true,
      duplicate: false,
      projectId: receipt.projectId,
      revision: 8,
      changedSuggestionIds: ['suggestion-rain'],
      suggestion: {
        id: 'suggestion-rain',
        episodeId: 'episode-01',
        sceneId: 'scene-01',
        originalText: '她停下脚步。',
        suggestedText: '她在雨幕边收紧相机背带。',
        reason: '用可视动作替代抽象情绪。',
        status: 'pending',
        createdBy: 'assistant',
        createdAt: '2026-08-06T08:00:00.000Z'
      }
    }),
    update: jest.fn(),
    delete: jest.fn()
  }
  const cutHandoffs = {
    prepare: jest.fn(),
    get: jest.fn(),
    recordDelivery: jest.fn()
  }
  const videoGeneration = {
    listTasks: jest.fn(),
    getTask: jest.fn(),
    refreshTask: jest.fn(),
    cancelTask: jest.fn(),
    retryTask: jest.fn(),
    selectShotVideo: jest.fn()
  }
  const middleware = new StoryStudioMiddleware(
    service as never,
    production as never,
    suggestions as never,
    generatedMedia as never,
    cutHandoffs as never,
    videoGeneration as never
  )
    .createMiddleware({}, middlewareContext()) as AgentMiddleware
  return {
    middleware,
    service,
    production,
    generatedMedia,
    suggestions,
    cutHandoffs
  }
}

function getTool(middleware: AgentMiddleware, name: string) {
  const tool = (middleware.tools as TestTool[]).find(
    (candidate) => candidate.name === name
  )
  if (!tool) {
    throw new Error(`Missing Story Studio test tool '${name}'.`)
  }
  return tool
}

describe('StoryStudioMiddleware', () => {
  beforeEach(() => {
    mockDispatchCustomEvent.mockReset().mockResolvedValue(undefined)
  })

  it('exposes the complete public tool catalog', () => {
    const { middleware } = createHarness()
    expect((middleware.tools as TestTool[]).map((tool) => tool.name)).toEqual(
      [...STORY_STUDIO_MIDDLEWARE_TOOL_NAMES]
    )
  })

  it('routes Assistant adaptation advice through the suggestion middleware tool', async () => {
    const { middleware, suggestions } = createHarness()
    const input = {
      projectId: receipt.projectId,
      operationId: 'suggestion:rain:0001',
      baseRevision: 7,
      suggestionId: 'suggestion-rain',
      episodeId: 'episode-01',
      sceneId: 'scene-01',
      originalText: '她停下脚步。',
      suggestedText: '她在雨幕边收紧相机背带。',
      reason: '用可视动作替代抽象情绪。',
      changeSummary: '新增一条雨夜场景的改编建议'
    }
    const result = JSON.parse(
      await getTool(
        middleware,
        STORY_CREATE_ADAPTATION_SUGGESTION_TOOL_NAME
      ).invoke(input)
    )

    expect(suggestions.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
      input
    )
    expect(result.suggestion.createdBy).toBe('assistant')
    expect(result.changedSuggestionIds).toEqual(['suggestion-rain'])
  })

  it('routes initial production creation through the start tool', async () => {
    const { middleware, production } = createHarness()
    const input = {
      projectId: receipt.projectId,
      operationId: 'production:start:middleware',
      baseRevision: 1,
      sourceSynopsis: 'A foal reaches a river.',
      adaptationGoal: 'Create the opening scene.',
      visualStyle: 'Ink-wash fable.',
      characters: [{ id: 'foal', name: 'Foal' }],
      firstScene: {
        id: 'scene-river',
        order: 1,
        title: 'The river',
        summary: 'The foal pauses at the riverbank.',
        shots: [
          {
            id: 'shot-ask',
            title: 'Foal asks',
            composition: 'Medium shot beside the river.',
            action: 'The foal watches the current.',
            camera: 'Static medium shot',
            dialogue: {
              text: 'Can I cross?',
              speakerId: 'foal',
              type: 'dialogue'
            },
            durationSeconds: 5
          }
        ]
      },
      changeSummary: 'Started the first river scene'
    }
    const result = JSON.parse(
      await getTool(
        middleware,
        STORY_START_PRODUCTION_TOOL_NAME
      ).invoke(input)
    )

    expect(production.startProduction).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
      input
    )
    expect(result).toEqual(
      expect.objectContaining({
        projectId: receipt.projectId,
        revision: 2,
        documentRevision: 1,
        sceneId: 'scene-river'
      })
    )
  })

  it('routes one-shot production patches through the smaller production tool', async () => {
    const { middleware, production } = createHarness()
    const input = {
      projectId: receipt.projectId,
      operationId: 'production:shot:middleware',
      baseRevision: 3,
      sceneId: 'scene-river',
      shot: {
        id: 'shot-crossing',
        action: 'The foal tests the water with one hoof.',
        dialogue: null
      },
      changeSummary: 'Updated the silent river-crossing action beat'
    }
    const result = JSON.parse(
      await getTool(
        middleware,
        STORY_UPSERT_PRODUCTION_SHOT_TOOL_NAME
      ).invoke(input)
    )

    expect(production.upsertShot).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
      input
    )
    expect(result).toEqual(
      expect.objectContaining({
        projectId: receipt.projectId,
        revision: 4,
        documentRevision: 2,
        sceneId: 'scene-river',
        shotId: 'shot-crossing'
      })
    )
  })

  it('persists and attaches completed Seedream asset images', async () => {
    const { middleware, production } = createHarness()
    await getTool(
      middleware,
      STORY_ATTACH_GENERATED_ASSET_IMAGE_TOOL_NAME
    ).invoke({
      projectId: receipt.projectId,
      operationId: 'seedream:asset:middleware',
      baseRevision: 1,
      assetId: 'asset-lin',
      candidateId: 'seedream-image-1',
      label: 'Lin reference',
      assetReference: {
        type: 'continuity_view',
        key: 'front'
      },
      file: '/workspace/files/seedream-aigc/images/task.png',
      providerReceipt: {
        provider: 'seedream_aigc',
        taskId: 'task-image-1',
        status: 'completed'
      },
      select: true,
      changeSummary: 'Attached Lin reference'
    })

    expect(production.attachAssetImage).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a' }),
      expect.objectContaining({
        assetId: 'asset-lin',
        candidateId: 'seedream-image-1',
        assetReference: {
          type: 'continuity_view',
          key: 'front'
        }
      }),
      expect.objectContaining({
        reference: expect.objectContaining({
          workspacePath: expect.stringContaining('generated-assets')
        })
      })
    )
  })

  it('passes the resolved scope and returns only a compact mutation receipt', async () => {
    const { middleware, service } = createHarness()
    const result = JSON.parse(
      await getTool(middleware, STORY_CREATE_PROJECT_TOOL_NAME).invoke({
        operationId: receipt.operationId,
        title: 'Middleware story',
        changeSummary: 'Created middleware story'
      })
    )

    expect(service.createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        organizationId: 'org-a',
        workspaceId: 'workspace-a',
        hostProjectId: 'host-project-a',
        assistantId: 'assistant-a'
      }),
      expect.objectContaining({ title: 'Middleware story' })
    )
    expect(result).toEqual(receipt)
    expect(result.project).toBeUndefined()
  })

  it('publishes compact running and success events for mutations', async () => {
    const { middleware } = createHarness()
    const handler = jest.fn().mockResolvedValue({
      content: JSON.stringify(receipt)
    })
    const request = {
      toolCall: {
        id: 'tool-call-1',
        name: STORY_UPDATE_PROJECT_STATUS_TOOL_NAME,
        args: {
          projectId: receipt.projectId,
          operationId: 'status:story:middleware',
          baseRevision: 1,
          status: 'planning',
          premise: 'This large field must not enter the host event.',
          changeSummary: 'Moved the story to planning'
        }
      },
      tool: {},
      state: {},
      runtime: {
        metadata: {
          toolset: 'StoryStudioMiddleware',
          toolsetId: 'toolset-1'
        }
      }
    }

    await middleware.wrapToolCall?.(request as never, handler)

    expect(mockDispatchCustomEvent).toHaveBeenCalledTimes(2)
    expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        status: 'running',
        title: 'Moved the story to planning',
        input: {
          projectId: receipt.projectId,
          operationId: 'status:story:middleware',
          baseRevision: 1,
          status: 'planning'
        },
        end_date: null
      })
    )
    expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        status: 'success',
        output: expect.objectContaining({
          projectId: receipt.projectId,
          revision: 1,
          status: 'draft'
        }),
        end_date: expect.any(Date)
      })
    )
  })

  it('does not publish mutation events for read-only tools', async () => {
    const { middleware } = createHarness()
    await middleware.wrapToolCall?.(
      {
        toolCall: {
          name: STORY_SEARCH_PROJECTS_TOOL_NAME,
          args: { search: 'moon' }
        }
      } as never,
      jest.fn().mockResolvedValue({ content: '{}' })
    )
    expect(mockDispatchCustomEvent).not.toHaveBeenCalled()
  })

  it('resolves a Workspace video before attaching it to a shot', async () => {
    const { middleware, generatedMedia } = createHarness()
    generatedMedia.attachGeneratedVideo.mockResolvedValue({
      success: true,
      duplicate: false,
      projectId: receipt.projectId,
      revision: 2,
      sceneId: 'scene-1',
      shotId: 'shot-1',
      candidate: {
        id: 'seedance-task-1',
        kind: 'video',
        selected: true
      }
    })

    const result = JSON.parse(
      await getTool(
        middleware,
        STORY_ATTACH_GENERATED_VIDEO_TOOL_NAME
      ).invoke({
        projectId: receipt.projectId,
        operationId: 'seedance:attach:middleware',
        baseRevision: 1,
        sceneId: 'scene-1',
        shotId: 'shot-1',
        candidateId: 'seedance-task-1',
        label: 'Seedance video',
        file: '/workspace/files/task.mp4',
        providerReceipt: {
          provider: 'seedream_aigc',
          taskId: 'task-1',
          status: 'succeeded'
        },
        changeSummary: 'Attached Seedance video'
      })
    )

    expect(generatedMedia.attachGeneratedVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        assistantId: 'assistant-a'
      }),
      expect.objectContaining({
        sceneId: 'scene-1',
        shotId: 'shot-1'
      }),
      expect.objectContaining({
        reference: expect.objectContaining({
          source: 'platform.workspace.files',
          filePath: expect.stringContaining(
            'files/story-studio/'
          )
        })
      })
    )
    expect(result.candidate).toEqual(
      expect.objectContaining({
        id: 'seedance-task-1',
        selected: true
      })
    )
  })
})
