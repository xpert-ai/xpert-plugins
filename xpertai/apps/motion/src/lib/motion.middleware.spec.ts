import 'reflect-metadata'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: Function) => target,
  RequestContext: {
    getOrganizationId: () => null
  }
}))

jest.mock('@langchain/core/tools', () => ({
  tool: jest.fn((_fn, config) => ({ ...config, invoke: _fn }))
}))

const mockDispatchCustomEvent = jest.fn()
jest.mock('@langchain/core/callbacks/dispatch', () => ({
  dispatchCustomEvent: (...args: [string | number, object]) => mockDispatchCustomEvent(...args)
}))

import { ToolMessage } from '@langchain/core/messages'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory } from '@xpert-ai/contracts'
import type { AgentMiddleware, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import {
  MOTION_CREATE_PROJECT_TOOL_NAME,
  MOTION_EXPORT_ARTIFACT_TOOL_NAME,
  MOTION_FINALIZE_VERSION_TOOL_NAME,
  MOTION_GET_PROJECT_TOOL_NAME,
  MOTION_GET_RECIPE_TOOL_NAME,
  MOTION_MIDDLEWARE_NAME,
  MOTION_MIDDLEWARE_TOOL_NAMES,
  MOTION_REPORT_FAILURE_TOOL_NAME,
  MOTION_SAVE_HYPERFRAMES_COMPOSITION_TOOL_NAME,
  MOTION_SAVE_VIDEO_COMPOSITION_TOOL_NAME,
  MOTION_SAVE_WEB_ARTIFACT_TOOL_NAME,
  MOTION_SEARCH_RECIPES_TOOL_NAME,
  MOTION_UPDATE_PROJECT_STATUS_TOOL_NAME
} from './constants.js'
import { MotionMiddleware } from './motion.middleware.js'
import type { MotionService } from './motion.service.js'

type TestTool = {
  name: string
  description?: string
  verboseParsingErrors?: boolean
  schema: {
    parse(value: object): object
  }
  invoke(input: object): Promise<string>
}

const context: IAgentMiddlewareContext = {
  tenantId: 'tenant',
  organizationId: 'org',
  workspaceId: 'workspace',
  projectId: 'project',
  userId: 'user',
  conversationId: 'conversation',
  xpertId: 'assistant'
} as IAgentMiddlewareContext

function createMiddleware(service: object = {}) {
  return new MotionMiddleware(service as MotionService).createMiddleware({}, context) as AgentMiddleware
}

function getMiddlewareTool(agentMiddleware: AgentMiddleware, name: string) {
  const found = (agentMiddleware.tools as TestTool[]).find((item) => item.name === name)
  if (!found) {
    throw new Error(`Missing test tool ${name}`)
  }
  return found
}

describe('Motion middleware', () => {
  beforeEach(() => {
    mockDispatchCustomEvent.mockReset()
  })

  it('exposes the public Motion tool set', () => {
    expect(MOTION_MIDDLEWARE_TOOL_NAMES).toEqual([
      MOTION_SEARCH_RECIPES_TOOL_NAME,
      MOTION_GET_RECIPE_TOOL_NAME,
      MOTION_CREATE_PROJECT_TOOL_NAME,
      MOTION_GET_PROJECT_TOOL_NAME,
      MOTION_SAVE_WEB_ARTIFACT_TOOL_NAME,
      MOTION_SAVE_VIDEO_COMPOSITION_TOOL_NAME,
      MOTION_SAVE_HYPERFRAMES_COMPOSITION_TOOL_NAME,
      MOTION_FINALIZE_VERSION_TOOL_NAME,
      MOTION_EXPORT_ARTIFACT_TOOL_NAME,
      MOTION_UPDATE_PROJECT_STATUS_TOOL_NAME,
      MOTION_REPORT_FAILURE_TOOL_NAME
    ])
  })

  it('dispatches mutation change summaries as Tool events instead of Computer events', async () => {
    const agentMiddleware = createMiddleware()
    const saveTool = getMiddlewareTool(agentMiddleware, MOTION_SAVE_WEB_ARTIFACT_TOOL_NAME)
    const handler: Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[1] = jest.fn(
      async () =>
        new ToolMessage({
          content: '{"success":true}',
          name: MOTION_SAVE_WEB_ARTIFACT_TOOL_NAME,
          tool_call_id: 'motion-tool-call-1'
        })
    )
    const request = {
      toolCall: {
        type: 'tool_call',
        id: 'motion-tool-call-1',
        name: MOTION_SAVE_WEB_ARTIFACT_TOOL_NAME,
        args: {
          projectId: 'project-1',
          html: '<!doctype html><html><body>Motion</body></html>',
          changeSummary: '保存 Motion 初稿'
        }
      },
      tool: saveTool,
      state: { messages: [] },
      runtime: {
        metadata: {
          toolset: MOTION_MIDDLEWARE_NAME
        }
      }
    } as Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0]

    await agentMiddleware.wrapToolCall(request, handler)

    expect(handler).toHaveBeenCalledWith(request)
    expect(mockDispatchCustomEvent).toHaveBeenCalledTimes(2)
    expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
      1,
      ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
      expect.objectContaining({
        id: 'motion-tool-call-1',
        tool_call_id: 'motion-tool-call-1',
        category: 'Tool',
        type: ChatMessageStepCategory.Program,
        toolset: MOTION_MIDDLEWARE_NAME,
        tool: MOTION_SAVE_WEB_ARTIFACT_TOOL_NAME,
        title: '保存 Motion 初稿',
        message: '保存 Motion 初稿',
        status: 'running',
        created_date: expect.any(Date),
        end_date: null,
        input: expect.objectContaining({
          projectId: 'project-1'
        })
      })
    )
    expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
      2,
      ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
      expect.objectContaining({
        id: 'motion-tool-call-1',
        tool_call_id: 'motion-tool-call-1',
        category: 'Tool',
        type: ChatMessageStepCategory.Program,
        status: 'success',
        end_date: expect.any(Date)
      })
    )
  })

  it('returns compact recipe search results for the agent', async () => {
    const agentMiddleware = createMiddleware({
      searchRecipes: jest.fn(() => ({
        items: [
          {
            id: 'typewriter-multi',
            name: 'Typewriter Multi',
            category: 'web',
            surfaces: ['web'],
            target: ['text'],
            runtime: ['css'],
            export: ['html'],
            status: 'ready',
            desc: 'Types lines in sequence.',
            preview: '<html>large preview</html>',
            tags: ['text', 'hero', 'launch', 'one', 'two', 'three', 'four', 'five', 'six']
          }
        ],
        total: 1,
        page: 1,
        pageSize: 24
      }))
    })

    const searchTool = getMiddlewareTool(agentMiddleware, MOTION_SEARCH_RECIPES_TOOL_NAME)
    const result = JSON.parse(await searchTool.invoke({ query: 'typewriter' })) as {
      items: Array<{ id: string; preview?: string; tags?: string[] }>
      total: number
    }

    expect(result.total).toBe(1)
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'typewriter-multi'
      })
    )
    expect(result.items[0].preview).toBeUndefined()
    expect(result.items[0].tags).toHaveLength(8)
  })

  it('omits verbose recipe manifests and skill text from get_recipe results', async () => {
    const agentMiddleware = createMiddleware({
      getRecipe: jest.fn(() => ({
        summary: {
          id: 'click-spark',
          name: 'Click Spark',
          surfaces: ['web'],
          target: ['button'],
          desc: 'Spark particles on click.'
        },
        manifestText: 'name: Click Spark\n'.repeat(100),
        skillText: '# Click Spark\n'.repeat(100),
        implementationFiles: ['click-spark.css', 'click-spark.js']
      }))
    })

    const recipeTool = getMiddlewareTool(agentMiddleware, MOTION_GET_RECIPE_TOOL_NAME)
    const result = JSON.parse(await recipeTool.invoke({ recipeId: 'click-spark' })) as {
      recipe: { id: string }
      manifestText?: string
      skillText?: string
      manifestBytes: number
      skillBytes: number
    }

    expect(result.recipe.id).toBe('click-spark')
    expect(result.manifestText).toBeUndefined()
    expect(result.skillText).toBeUndefined()
    expect(result.manifestBytes).toBeGreaterThan(0)
    expect(result.skillBytes).toBeGreaterThan(0)
  })

  it('returns compact project metadata without full working-copy content', async () => {
    const agentMiddleware = createMiddleware({
      getProject: jest.fn(async () => ({
        item: {
          id: 'motion-project-1',
          title: 'Motion Launch',
          surface: 'web',
          status: 'draft',
          workingCopyRevision: 2,
          artifactChecksum: 'abc123'
        },
        workingCopy: {
          html: '<!doctype html><html><body><h1>Motion</h1></body></html>',
          videoComposition: {
            duration: 5,
            layers: [
              {
                id: 'title',
                type: 'text',
                tracks: {
                  opacity: [
                    { t: 0, v: 0 },
                    { t: 0.5, v: 1 }
                  ]
                }
              }
            ]
          },
          componentSelection: { id: 'title' },
          layerSelection: { layerId: 'title' },
          workingCopyRevision: 2,
          artifactChecksum: 'abc123'
        },
        versions: [
          {
            id: 'version-1',
            versionNumber: 1,
            surface: 'web',
            changeSummary: 'Initial'
          }
        ],
        exports: [],
        logs: [
          {
            id: 'log-1',
            action: 'web_artifact_saved',
            message: 'Saved',
            snapshot: { html: '<html>large snapshot</html>' }
          }
        ]
      }))
    })

    const projectTool = getMiddlewareTool(agentMiddleware, MOTION_GET_PROJECT_TOOL_NAME)
    const result = JSON.parse(await projectTool.invoke({ projectId: 'motion-project-1', includeLogs: true })) as {
      projectId: string
      workingCopy: { html?: string; htmlBytes: number; video: { keyframeCount: number } }
      logs?: object[]
      logCount: number
      lastLog?: { snapshot?: object }
    }

    expect(result.projectId).toBe('motion-project-1')
    expect(result.workingCopy.html).toBeUndefined()
    expect(result.workingCopy.htmlBytes).toBeGreaterThan(0)
    expect(result.workingCopy.video.keyframeCount).toBe(2)
    expect(result.logs).toBeUndefined()
    expect(result.logCount).toBe(1)
    expect(result.lastLog?.snapshot).toBeUndefined()
  })

  it('summarizes native HyperFrames source without returning the full document', async () => {
    const hyperframesHtml = '<!doctype html><main data-composition-id="main" data-width="1280" data-height="720" data-duration="6" data-hf-id="root"></main>'
    const agentMiddleware = createMiddleware({
      getProject: jest.fn(async () => ({
        item: {
          id: 'motion-project-hf',
          title: 'Native Launch',
          surface: 'video',
          videoEngine: 'hyperframes',
          status: 'draft',
          artifactChecksum: 'hf123'
        },
        workingCopy: {
          videoEngine: 'hyperframes',
          hyperframesHtml,
          artifactChecksum: 'hf123'
        },
        versions: [],
        exports: [
          { id: 'export-hf', kind: 'mp4', status: 'queued', backend: 'hyperframes', progress: 0, stage: 'queued' }
        ]
      }))
    })

    const projectTool = getMiddlewareTool(agentMiddleware, MOTION_GET_PROJECT_TOOL_NAME)
    const result = JSON.parse(await projectTool.invoke({ projectId: 'motion-project-hf' })) as {
      project: { videoEngine: string }
      workingCopy: { hasHyperframesComposition: boolean; hyperframesBytes: number; hyperframesHtml?: string }
      exports: Array<{ status: string; backend: string }>
    }

    expect(result.project.videoEngine).toBe('hyperframes')
    expect(result.workingCopy.hasHyperframesComposition).toBe(true)
    expect(result.workingCopy.hyperframesBytes).toBe(hyperframesHtml.length)
    expect(result.workingCopy.hyperframesHtml).toBeUndefined()
    expect(result.exports[0]).toEqual(expect.objectContaining({ status: 'queued', backend: 'hyperframes' }))
  })

  it('omits export content from export_artifact results', async () => {
    const agentMiddleware = createMiddleware({
      exportArtifact: jest.fn(async () => ({
        success: true,
        message: 'Motion artifact was exported.',
        project: {
          id: 'motion-project-1',
          surface: 'web',
          status: 'draft',
          lastExportKind: 'html'
        },
        export: {
          id: 'export-1',
          kind: 'html',
          filePath: '/workspace/motion/export.html',
          mimeType: 'text/html',
          size: 512
        },
        content: '<!doctype html>'.repeat(200)
      }))
    })

    const exportTool = getMiddlewareTool(agentMiddleware, MOTION_EXPORT_ARTIFACT_TOOL_NAME)
    const result = JSON.parse(await exportTool.invoke({ projectId: 'motion-project-1', kind: 'html' })) as {
      content?: string
      contentBytes: number
      contentOmitted: boolean
      exportId: string
      exportPath: string
    }

    expect(result.exportId).toBe('export-1')
    expect(result.exportPath).toBe('/workspace/motion/export.html')
    expect(result.content).toBeUndefined()
    expect(result.contentOmitted).toBe(true)
    expect(result.contentBytes).toBeGreaterThan(0)
  })
})
