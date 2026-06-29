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
import {
  CANVAS_CREATE_DOCUMENT_TOOL_NAME,
  CANVAS_GET_DOCUMENT_TOOL_NAME,
  CANVAS_GET_RECORD_TOOL_NAME,
  CANVAS_INSERT_IMAGE_TOOL_NAME,
  CANVAS_PATCH_RECORDS_TOOL_NAME,
  CANVAS_REPORT_FAILURE_TOOL_NAME,
  CANVAS_SAVE_SNAPSHOT_TOOL_NAME,
  CANVAS_SEARCH_DOCUMENTS_TOOL_NAME,
  CANVAS_UPDATE_DOCUMENT_STATUS_TOOL_NAME
} from './constants.js'
import type { CanvasService } from './canvas.service.js'

type TestTool = {
  name: string
  description?: string
  verboseParsingErrors?: boolean
  schema: {
    parse(value: object): object
  }
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
      CANVAS_SAVE_SNAPSHOT_TOOL_NAME,
      CANVAS_PATCH_RECORDS_TOOL_NAME,
      CANVAS_INSERT_IMAGE_TOOL_NAME,
      CANVAS_SEARCH_DOCUMENTS_TOOL_NAME,
      CANVAS_GET_DOCUMENT_TOOL_NAME,
      CANVAS_GET_RECORD_TOOL_NAME,
      CANVAS_UPDATE_DOCUMENT_STATUS_TOOL_NAME,
      CANVAS_REPORT_FAILURE_TOOL_NAME
    ])
    expect((agentMiddleware.tools as TestTool[]).every((item) => item.verboseParsingErrors === true)).toBe(true)
  })

  it('accepts optional snapshot images on save snapshot tool schema', () => {
    const agentMiddleware = createMiddleware()
    const saveTool = (agentMiddleware.tools as TestTool[]).find((item) => item.name === CANVAS_SAVE_SNAPSHOT_TOOL_NAME)

    expect(() =>
      saveTool.schema.parse({
        documentId: 'doc-1',
        snapshot: { schema: {}, store: {} },
        snapshotImage: {
          dataUrl: 'data:image/png;base64,abc',
          mimeType: 'image/png',
          pageId: 'page:page'
        }
      })
    ).not.toThrow()
  })

  it('accepts Seedream workspace image inputs on insert image schema', () => {
    const agentMiddleware = createMiddleware()
    const insertTool = (agentMiddleware.tools as TestTool[]).find((item) => item.name === CANVAS_INSERT_IMAGE_TOOL_NAME)

    expect(() =>
      insertTool.schema.parse({
        documentId: 'doc-1',
        workspaceFilePath: 'files/seedream-aigc/images/generated.png',
        target: {
          documentId: 'doc-1',
          pageId: 'page:page',
          shapeId: 'shape:holder',
          width: 512,
          height: 683
        },
        changeSummary: '插入 Seedream 生成图'
      })
    ).not.toThrow()
  })

  it('guides agents to use the current Workbench canvas for image insertion', () => {
    const agentMiddleware = createMiddleware()
    const tools = agentMiddleware.tools as TestTool[]
    const createTool = tools.find((item) => item.name === CANVAS_CREATE_DOCUMENT_TOOL_NAME)
    const saveTool = tools.find((item) => item.name === CANVAS_SAVE_SNAPSHOT_TOOL_NAME)
    const insertTool = tools.find((item) => item.name === CANVAS_INSERT_IMAGE_TOOL_NAME)

    expect(createTool?.description).toContain('env.canvasDocumentId')
    expect(createTool?.description).toContain('do not call this tool for image insertion')
    expect(saveTool?.description).toContain('do not call it after canvas_insert_image')
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
})
