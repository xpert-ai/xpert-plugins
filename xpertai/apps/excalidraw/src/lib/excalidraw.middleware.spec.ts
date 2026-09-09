const mockDispatchCustomEvent = jest.fn()

jest.mock('@langchain/core/callbacks/dispatch', () => ({
  dispatchCustomEvent: (...args: unknown[]) => mockDispatchCustomEvent(...args)
}))

jest.mock('@langchain/core/tools', () => ({
  tool: (func: (input: unknown) => Promise<string>, config: Record<string, unknown>) => ({
    ...config,
    func,
    invoke: func
  })
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: unknown) => target,
  RequestContext: {
    getOrganizationId: () => null
  }
}))

import {
  EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME,
  EXCALIDRAW_CREATE_DRAWING_TOOL_NAME,
  EXCALIDRAW_GET_SCENE_ITEM_TOOL_NAME,
  EXCALIDRAW_PATCH_SCENE_TOOL_NAME
} from './constants.js'
import { SystemMessage, ToolMessage } from '@langchain/core/messages'
import { ChatMessageEventTypeEnum } from '@xpert-ai/contracts'
import { excalidrawMiddlewareExtensions } from './tools/middleware-extensions.js'

describe('Excalidraw middleware context and event extensions', () => {
  it('injects drawingId from runtime structured context before Excalidraw tool execution', async () => {
    const middleware = excalidrawMiddlewareExtensions()
    const addTool = {name:EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME}
    const handler = jest.fn(async () => new ToolMessage({ content: 'ok', tool_call_id: 'tool-call-1' }))

    await middleware.wrapToolCall?.(
      {
        toolCall: {
          id: 'tool-call-1',
          name: EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME,
          args: {
            elements: [{ id: 'rect-1', type: 'rectangle' }]
          }
        },
        tool: addTool,
        state: { messages: [] },
        runtime: {
          context: {
            excalidraw: {
              currentDrawing: {
                drawingId: 'drawing-from-context',
                title: 'Opened drawing'
              }
            }
          }
        }
      } as any,
      handler as any
    )

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          args: {
            elements: [{ id: 'rect-1', type: 'rectangle' }],
            drawingId: 'drawing-from-context'
          }
        })
      })
    )
  })

  it('injects drawingId from runtime env context before Excalidraw tool execution', async () => {
    const middleware = excalidrawMiddlewareExtensions()
    const addTool = {name:EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME}
    const handler = jest.fn(async () => new ToolMessage({ content: 'ok', tool_call_id: 'tool-call-1' }))

    await middleware.wrapToolCall?.(
      {
        toolCall: {
          id: 'tool-call-1',
          name: EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME,
          args: {
            elements: [{ id: 'rect-1', type: 'rectangle' }]
          }
        },
        tool: addTool,
        state: { messages: [] },
        runtime: {
          context: {
            env: {
              excalidrawDrawingId: 'drawing-from-env'
            }
          }
        }
      } as any,
      handler as any
    )

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          args: {
            elements: [{ id: 'rect-1', type: 'rectangle' }],
            drawingId: 'drawing-from-env'
          }
        })
      })
    )
  })

  it('returns a clear error when drawingId and current Workbench context are missing', async () => {
    const middleware = excalidrawMiddlewareExtensions()
    const addTool = {name:EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME}
    const handler = jest.fn()

    const result = await middleware.wrapToolCall?.(
      {
        toolCall: {
          id: 'tool-call-1',
          name: EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME,
          args: {
            elements: [{ id: 'rect-1', type: 'rectangle' }]
          }
        },
        tool: addTool,
        state: { messages: [] },
        runtime: {
          context: {}
        }
      } as any,
      handler as any
    )

    expect(handler).not.toHaveBeenCalled()
    expect(result).toBeInstanceOf(ToolMessage)
    expect((result as ToolMessage).content).toBe('未找到当前 Excalidraw Workbench 图形，请先打开图形或显式传 drawingId。')
  })

  it('injects current Workbench drawing context into model calls', async () => {
    const middleware = excalidrawMiddlewareExtensions()
    const handler = jest.fn(async () => 'ok')

    await middleware.wrapModelCall?.(
      {
        systemMessage: new SystemMessage('Base prompt.'),
        messages: [],
        tools: [],
        state: { messages: [] },
        runtime: {
          context: {
            excalidraw: {
              currentDrawing: {
                drawingId: 'drawing-1',
                title: 'Current sketch',
                currentVersionNumber: 3,
                isDirty: true,
                selection: {
                  type: 'excalidraw.selection.v1',
                  selectedElementIds: ['rect-1']
                }
              }
            }
          }
        }
      } as any,
      handler as any
    )

    const request = handler.mock.calls[0]?.[0]
    expect(request.systemMessage.content).toContain('Base prompt.')
    expect(request.systemMessage.content).toContain('excalidrawDrawingId: drawing-1')
    expect(request.systemMessage.content).toContain('title: Current sketch')
    expect(request.systemMessage.content).toContain('excalidrawVersionNumber: 3')
    expect(request.systemMessage.content).toContain('excalidrawSceneDirty: true')
    expect(request.systemMessage.content).toContain('selectionType: excalidraw.selection.v1')
    expect(request.systemMessage.content).toContain('Excalidraw tools may omit drawingId')
  })

  it('dispatches changeSummary as the tool event message', async () => {
    const middleware = excalidrawMiddlewareExtensions()
    const addTool = {name:EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME}
    const handler = jest.fn(async () => ({
      content: '{"success":true}',
      name: EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME,
      tool_call_id: 'tool-call-1'
    }))

    const request = {
      toolCall: {
        type: 'tool_call',
        id: 'tool-call-1',
        name: EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME,
        args: {
          drawingId: 'drawing-1',
          elements: [{ id: 'rect-1', type: 'rectangle' }],
          changeSummary: '添加数据分析平台'
        }
      },
      tool: addTool,
      state: { messages: [] },
      runtime: {
        metadata: {
          toolset: 'Excalidraw',
          toolName: 'Excalidraw'
        }
      }
    } as any

    await middleware.wrapToolCall(request, handler)

    expect(handler).toHaveBeenCalledWith(request)
    expect(mockDispatchCustomEvent).toHaveBeenCalledTimes(2)
    expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
      1,
      ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
      expect.objectContaining({
        id: 'tool-call-1',
        tool_call_id: 'tool-call-1',
        tool: EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME,
        title: '添加数据分析平台',
        message: '添加数据分析平台',
        status: 'running',
        end_date: null,
        input: request.toolCall.args
      })
    )
    expect(mockDispatchCustomEvent).toHaveBeenNthCalledWith(
      2,
      ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
      expect.objectContaining({
        id: 'tool-call-1',
        tool_call_id: 'tool-call-1',
        tool: EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME,
        message: '添加数据分析平台',
        status: 'success',
        output: '{"success":true}'
      })
    )
  })

})
