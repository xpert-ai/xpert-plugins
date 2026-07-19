import 'reflect-metadata'
jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, key: string) => `plugin_${namespace}_${key}`,
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
jest.mock('fractional-indexing', () => ({
  generateKeyBetween: jest.fn(() => 'a1')
}))
jest.mock('tldraw', () => ({
  createTLStore: () => ({
    getStoreSnapshot: () => ({ schema: { mock: true }, store: {} }),
    migrateSnapshot: (snapshot: object) => snapshot,
    put: jest.fn(),
    get: jest.fn()
  })
}))

import { CanvasMiddleware } from './canvas.middleware.js'
import type { AgentMiddleware, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory } from '@xpert-ai/contracts'
import { ToolMessage } from '@langchain/core/messages'
import type { z } from 'zod/v3'
import {
  CANVAS_CREATE_DOCUMENT_TOOL_NAME,
  CANVAS_GET_DOCUMENT_TOOL_NAME,
  CANVAS_GET_RECORD_TOOL_NAME,
  CANVAS_LIST_RECORDS_TOOL_NAME,
  CANVAS_INSERT_IMAGE_TOOL_NAME,
  CANVAS_PATCH_RECORDS_TOOL_NAME,
  CANVAS_REPORT_FAILURE_TOOL_NAME,
  CANVAS_SEARCH_DOCUMENTS_TOOL_NAME,
  CANVAS_UPDATE_DOCUMENT_STATUS_TOOL_NAME
} from './constants.js'
import type { CanvasService } from './canvas.service.js'

type TestTool = {
  name: string
  description?: string
  verboseParsingErrors?: boolean
  schema: z.ZodTypeAny
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

const DOCUMENT_ID = '643dacec-8f1a-4bcc-b759-e371efefb4c2'

function createMiddleware(service: Partial<CanvasService> = {}) {
  return new CanvasMiddleware(service as CanvasService).createMiddleware({}, context) as AgentMiddleware
}

describe('CanvasMiddleware', () => {
  beforeEach(() => {
    mockDispatchCustomEvent.mockReset()
  })

  it('exposes all Canvas Agent middleware tools with metadata', () => {
    const middleware = new CanvasMiddleware({} as CanvasService)
    const agentMiddleware = createMiddleware()
    const names = (agentMiddleware.tools as TestTool[]).map((item) => item.name)

    expect(middleware.meta.features).toEqual(expect.arrayContaining(['canvas', 'agent-canvas', 'canvas-workbench']))
    expect(names).toEqual([
      CANVAS_CREATE_DOCUMENT_TOOL_NAME,
      CANVAS_PATCH_RECORDS_TOOL_NAME,
      CANVAS_INSERT_IMAGE_TOOL_NAME,
      CANVAS_SEARCH_DOCUMENTS_TOOL_NAME,
      CANVAS_GET_DOCUMENT_TOOL_NAME,
      CANVAS_LIST_RECORDS_TOOL_NAME,
      CANVAS_GET_RECORD_TOOL_NAME,
      CANVAS_UPDATE_DOCUMENT_STATUS_TOOL_NAME,
      CANVAS_REPORT_FAILURE_TOOL_NAME
    ])
    expect(names).not.toContain('canvas_create_version')
    expect((agentMiddleware.tools as TestTool[]).every((item) => item.verboseParsingErrors === true)).toBe(true)
  })

  it('keeps complete snapshots out of model-visible creation and mutation schemas', () => {
    const agentMiddleware = createMiddleware()
    const tools = agentMiddleware.tools as TestTool[]
    const createTool = tools.find((item) => item.name === CANVAS_CREATE_DOCUMENT_TOOL_NAME)
    const patchTool = tools.find((item) => item.name === CANVAS_PATCH_RECORDS_TOOL_NAME)

    expect(() =>
      createTool.schema.parse({
        title: 'Progressive Canvas',
        snapshot: { schema: {}, store: {} }
      })
    ).toThrow()
    const oversizedCreateResult = patchTool.schema.safeParse({
      documentId: DOCUMENT_ID,
      operationId: 'canvas-stage-operation-1',
      batchId: 'canvas-batch-1',
      stageIndex: 1,
      stageLabel: 'Create the first section',
      isFinalStage: false,
      baseRevision: 0,
      createShapes: Array.from({ length: 13 }, (_, index) => ({
        id: `shape:stage-${index}`,
        type: 'text',
        x: index * 20,
        y: 0,
        text: `Stage ${index}`
      })),
      changeSummary: 'Create the first section'
    })
    expect(oversizedCreateResult.success).toBe(false)
    if (!oversizedCreateResult.success) {
      expect(oversizedCreateResult.error.issues).toHaveLength(1)
      expect(oversizedCreateResult.error.issues[0]).toEqual(expect.objectContaining({
        path: ['createShapes'],
        message: expect.stringContaining('split larger plans into semantic stages')
      }))
    }

    const oversizedCombinedResult = patchTool.schema.safeParse({
      documentId: DOCUMENT_ID,
      operationId: 'canvas-stage-operation-combined',
      batchId: 'canvas-batch-1',
      stageIndex: 1,
      stageLabel: 'Reject a combined oversized stage',
      isFinalStage: false,
      baseRevision: 0,
      createShapes: Array.from({ length: 8 }, (_, index) => ({
        type: 'text',
        x: index * 20,
        y: 0,
        text: `Stage ${index}`
      })),
      removeRecords: Array.from({ length: 5 }, (_, index) => ({
        id: `shape:remove-${index}`,
        expectedChecksum: 'a'.repeat(64)
      })),
      changeSummary: 'Reject a combined oversized stage'
    })
    expect(oversizedCombinedResult.success).toBe(false)
    if (!oversizedCombinedResult.success) {
      expect(oversizedCombinedResult.error.issues).toHaveLength(1)
      expect(oversizedCombinedResult.error.issues[0]).toEqual(expect.objectContaining({
        path: [],
        message: expect.stringContaining('contains 13 record operations')
      }))
    }
    expect(() =>
      patchTool.schema.parse({
        documentId: DOCUMENT_ID,
        operationId: 'canvas-stage-operation-2',
        batchId: 'canvas-batch-1',
        stageIndex: 1,
        stageLabel: 'Reject raw records',
        isFinalStage: false,
        baseRevision: 0,
        createRecords: [{ id: 'shape:raw', typeName: 'shape', type: 'text' }],
        changeSummary: 'Reject raw records'
      })
    ).toThrow('Unrecognized key')
    expect(() =>
      patchTool.schema.parse({
        documentId: DOCUMENT_ID,
        operationId: 'canvas-stage-operation-3',
        batchId: 'canvas-batch-1',
        stageIndex: 1,
        stageLabel: 'Create simplified text',
        isFinalStage: true,
        baseRevision: 0,
        createShapes: [{ type: 'text', x: 100, y: 100, text: '测试' }],
        changeSummary: 'Create simplified text'
      })
    ).not.toThrow()
    expect(() =>
      patchTool.schema.parse({
        documentId: DOCUMENT_ID,
        operationId: 'canvas-stage-operation-4',
        batchId: 'canvas-batch-1',
        stageIndex: 1,
        stageLabel: 'Reject raw text props',
        isFinalStage: true,
        baseRevision: 0,
        createShapes: [{
          type: 'text',
          x: 100,
          y: 100,
          text: '测试',
          textAlign: 'left',
          props: { text: 'raw' }
        }],
        changeSummary: 'Reject raw text props'
      })
    ).toThrow()
    expect(() =>
      patchTool.schema.parse({
        documentId: DOCUMENT_ID,
        operationId: 'canvas-stage-operation-5',
        batchId: 'canvas-batch-1',
        stageIndex: 1,
        stageLabel: 'Reject zero length arrow',
        isFinalStage: true,
        baseRevision: 0,
        createShapes: [{ type: 'arrow', start: { x: 50, y: 50 }, end: { x: 50, y: 50 } }],
        changeSummary: 'Reject zero length arrow'
      })
    ).toThrow('start and end points must differ')
  })

  it('uses strict, revision-bound progressive read schemas', () => {
    const tools = createMiddleware().tools as TestTool[]
    const summaryTool = tools.find((item) => item.name === CANVAS_GET_DOCUMENT_TOOL_NAME)
    const listTool = tools.find((item) => item.name === CANVAS_LIST_RECORDS_TOOL_NAME)
    const recordTool = tools.find((item) => item.name === CANVAS_GET_RECORD_TOOL_NAME)

    expect(() => summaryTool.schema.parse({ documentId: DOCUMENT_ID, includeSnapshot: true })).toThrow('Unrecognized key')
    expect(() => listTool.schema.parse({
      documentId: DOCUMENT_ID,
      expectedRevision: 3,
      typeNames: ['shape'],
      limit: 20
    })).not.toThrow()
    expect(() => listTool.schema.parse({
      documentId: DOCUMENT_ID,
      expectedRevision: 3,
      limit: 41
    })).toThrow()
    expect(() => recordTool.schema.parse({
      documentId: DOCUMENT_ID,
      recordId: 'shape:task-1'
    })).toThrow()
  })

  it('accepts Seedream workspace image inputs on insert image schema', () => {
    const agentMiddleware = createMiddleware()
    const insertTool = (agentMiddleware.tools as TestTool[]).find((item) => item.name === CANVAS_INSERT_IMAGE_TOOL_NAME)

    expect(() =>
      insertTool.schema.parse({
        documentId: DOCUMENT_ID,
        workspaceFilePath: 'files/seedream-aigc/images/generated.png',
        target: {
          documentId: DOCUMENT_ID,
          pageId: 'page:page',
          shapeId: 'shape:holder',
          width: 512,
          height: 683
        },
        changeSummary: '插入 Seedream 生成图'
      })
    ).not.toThrow()
  })

  it('guides agents to use progressive reads and staged writes', () => {
    const agentMiddleware = createMiddleware()
    const tools = agentMiddleware.tools as TestTool[]
    const createTool = tools.find((item) => item.name === CANVAS_CREATE_DOCUMENT_TOOL_NAME)
    const patchTool = tools.find((item) => item.name === CANVAS_PATCH_RECORDS_TOOL_NAME)
    const listTool = tools.find((item) => item.name === CANVAS_LIST_RECORDS_TOOL_NAME)
    const insertTool = tools.find((item) => item.name === CANVAS_INSERT_IMAGE_TOOL_NAME)

    expect(createTool?.description).toContain('env.canvasDocumentId')
    expect(createTool?.description).toContain('never accepts or writes a complete snapshot')
    expect(patchTool?.description).toContain('at most 12 shape or record operations')
    expect(patchTool?.description).toContain('count createShapes + updateRecords + removeRecords')
    expect(patchTool?.description).toContain('preferably 6–8 operations each')
    expect(patchTool?.description).toContain('split 16 shapes into 8 + 8')
    expect(patchTool?.description).toContain('createShapes')
    expect(patchTool?.description).toContain('workingCopyRevision')
    expect(listTool?.description).toContain('nextCursor')
    expect(insertTool?.description).toContain('Use documentId from env.canvasDocumentId')
    expect(insertTool?.description).toContain('env.canvasInsertionTargetJson')
  })

  it('dispatches changeSummary as the tool message for running and success states', async () => {
    const agentMiddleware = createMiddleware({ patchRecords: jest.fn() } as Partial<CanvasService>)
    const patchTool = (agentMiddleware.tools as TestTool[]).find((item) => item.name === CANVAS_PATCH_RECORDS_TOOL_NAME)
    const handler: Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[1] = jest.fn(
      async () =>
        new ToolMessage({
          content: '{"success":true}',
          name: CANVAS_PATCH_RECORDS_TOOL_NAME,
          tool_call_id: 'canvas-tool-call-1'
        })
    )
    const request = {
      toolCall: {
        type: 'tool_call',
        id: 'canvas-tool-call-1',
        name: CANVAS_PATCH_RECORDS_TOOL_NAME,
        args: {
          documentId: 'doc-1',
          putRecords: [{ id: 'shape:note' }],
          changeSummary: '添加画布说明'
        }
      },
      tool: patchTool,
      state: { messages: [] },
      runtime: {
        metadata: {
          toolset: 'Canvas'
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
        id: 'canvas-tool-call-1',
        tool_call_id: 'canvas-tool-call-1',
        category: 'Tool',
        type: ChatMessageStepCategory.Program,
        toolset: 'Canvas',
        tool: CANVAS_PATCH_RECORDS_TOOL_NAME,
        title: CANVAS_PATCH_RECORDS_TOOL_NAME,
        message: '添加画布说明',
        status: 'running',
        input: expect.objectContaining({
          documentId: 'doc-1',
          changeSummary: '添加画布说明'
        }),
        end_date: null
      })
    )
    expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
      2,
      ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
      expect.objectContaining({
        id: 'canvas-tool-call-1',
        tool_call_id: 'canvas-tool-call-1',
        message: '添加画布说明',
        status: 'success',
        end_date: expect.any(Date)
      })
    )
  })

  it('dispatches failed changeSummary tool messages with the same tool call id', async () => {
    const agentMiddleware = createMiddleware()
    const insertTool = (agentMiddleware.tools as TestTool[]).find((item) => item.name === CANVAS_INSERT_IMAGE_TOOL_NAME)
    const handler: Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[1] = jest.fn(async () => {
      throw new Error('insert failed')
    })
    const request = {
      toolCall: {
        type: 'tool_call',
        id: 'canvas-tool-call-2',
        name: CANVAS_INSERT_IMAGE_TOOL_NAME,
        args: {
          documentId: 'doc-1',
          workspaceFilePath: 'files/generated.jpg',
          changeSummary: '替换选中图片'
        }
      },
      tool: insertTool,
      state: { messages: [] },
      runtime: {
        metadata: {
          toolset: 'Canvas',
          toolName: 'Canvas 插图'
        }
      }
    } as Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0]

    await expect(agentMiddleware.wrapToolCall(request, handler)).rejects.toThrow('insert failed')

    expect(mockDispatchCustomEvent).toHaveBeenCalledTimes(2)
    expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
      2,
      ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
      expect.objectContaining({
        id: 'canvas-tool-call-2',
        tool_call_id: 'canvas-tool-call-2',
        title: 'Canvas 插图',
        message: '替换选中图片',
        status: 'fail',
        error: 'insert failed'
      })
    )
  })

  it('publishes Agent editing and done presence around a Canvas mutation', async () => {
    const actor = {
      presenceId: 'agent_canvas', displayName: 'Canvas Agent', color: '#0f766e', actorType: 'agent' as const, avatarUrl: null
    }
    const publishAgentAwareness = jest.fn(async () => null)
    const agentMiddleware = createMiddleware({
      createAgentCollaborationActor: jest.fn(() => actor),
      publishAgentAwareness
    } as Partial<CanvasService>)
    const request = {
      toolCall: {
        type: 'tool_call',
        id: 'canvas-presence-1',
        name: CANVAS_PATCH_RECORDS_TOOL_NAME,
        args: { documentId: 'doc-1', putRecords: [{ id: 'shape:note' }] }
      },
      tool: (agentMiddleware.tools as TestTool[]).find((item) => item.name === CANVAS_PATCH_RECORDS_TOOL_NAME),
      state: { messages: [] },
      runtime: { metadata: {} }
    } as unknown as Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0]

    await agentMiddleware.wrapToolCall(request, jest.fn(async () => new ToolMessage({
      content: 'ok', name: CANVAS_PATCH_RECORDS_TOOL_NAME, tool_call_id: 'canvas-presence-1'
    })))

    expect(publishAgentAwareness).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tenantId: 'tenant', assistantId: 'assistant' }),
      'doc-1',
      actor,
      expect.objectContaining({ status: 'editing', toolName: CANVAS_PATCH_RECORDS_TOOL_NAME })
    )
    expect(publishAgentAwareness).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      'doc-1',
      actor,
      expect.objectContaining({ status: 'done', toolName: CANVAS_PATCH_RECORDS_TOOL_NAME })
    )
  })
})
