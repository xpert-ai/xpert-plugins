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
  EXCALIDRAW_GET_SCENE_ITEM_TOOL_NAME
} from './constants.js'
import { ChatMessageEventTypeEnum } from '@xpert-ai/contracts'
import { ExcalidrawMiddleware } from './excalidraw.middleware.js'

describe('ExcalidrawMiddleware staged element tools', () => {
  beforeEach(() => {
    mockDispatchCustomEvent.mockReset()
    mockDispatchCustomEvent.mockResolvedValue(undefined)
  })

  it('keeps excalidraw_create_drawing metadata-only even if scene fields are provided', async () => {
    const createDrawing = jest.fn(async (_scope, input) => ({
      success: true,
      message: 'Excalidraw drawing was created.',
      item: {
        id: 'drawing-1',
        title: input.title,
        description: input.description,
        kind: input.kind,
        status: 'draft',
        currentVersionNumber: 0
      },
      currentVersion: null,
      versions: []
    }))
    const middleware = await new ExcalidrawMiddleware({ createDrawing } as any).createMiddleware({}, testContext())

    const createTool = middleware.tools.find((candidate: any) => candidate.name === EXCALIDRAW_CREATE_DRAWING_TOOL_NAME) as any
    expect(createTool).toBeTruthy()

    const result = JSON.parse(await createTool.invoke({
      title: 'Metadata only',
      description: 'Create the record first.',
      kind: 'architecture',
      elements: [{ id: 'rect-1', type: 'rectangle' }],
      appState: { viewBackgroundColor: '#fff' },
      files: { file1: { id: 'file1' } },
      mermaidSource: 'flowchart TD'
    }))

    expect(createDrawing).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1' }),
      {
        title: 'Metadata only',
        description: 'Create the record first.',
        kind: 'architecture',
        tags: undefined,
        source: undefined,
        changeSummary: undefined
      }
    )
    expect(result.drawingId).toBe('drawing-1')
    expect(result.drawing).toBeUndefined()
  })

  it('registers excalidraw_add_elements and routes it through patchScene', async () => {
    const patchScene = jest.fn(async (_scope, input) => ({
      success: true,
      message: 'Excalidraw elements were added.',
      drawing: {
        item: {
          id: input.drawingId,
          title: 'Staged drawing',
          status: 'draft',
          currentVersionId: 'version-2',
          currentVersionNumber: 2
        },
        currentVersion: {
          id: 'version-2',
          drawingId: input.drawingId,
          versionNumber: 2,
          sourceType: 'agent_patch',
          elements: input.addElements,
          files: {}
        }
      },
      version: {
        id: 'version-2',
        drawingId: input.drawingId,
        versionNumber: 2,
        sourceType: 'agent_patch',
        elements: input.addElements,
        files: {}
      },
      patch: {
        addCount: input.addElements.length,
        updateCount: 0,
        deleteCount: 0,
        addedIds: input.addElements.map((element: any) => element.id),
        updatedIds: [],
        deletedIds: []
      }
    }))
    const middleware = await new ExcalidrawMiddleware({ patchScene } as any).createMiddleware({}, testContext())

    const addTool = middleware.tools.find((candidate: any) => candidate.name === EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME) as any
    expect(addTool).toBeTruthy()

    const result = JSON.parse(await addTool.invoke({
      drawingId: 'drawing-1',
      elements: [{ id: 'rect-1', type: 'rectangle' }],
      changeSummary: 'Add rectangle'
    }))

    expect(patchScene).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1' }),
      expect.objectContaining({
        drawingId: 'drawing-1',
        addElements: [{ id: 'rect-1', type: 'rectangle' }],
        changeSummary: 'Add rectangle'
      })
    )
    expect(result.patch).toEqual({
      addCount: 1,
      updateCount: 0,
      deleteCount: 0,
      addedIds: ['rect-1'],
      updatedIds: [],
      deletedIds: []
    })
    expect(result.message).toBe('Excalidraw elements were added.')
    expect(result.drawingId).toBeUndefined()
    expect(result.versionId).toBeUndefined()
    expect(result.versionNumber).toBeUndefined()
    expect(result.drawing).toBeUndefined()
    expect(result.currentVersion).toBeUndefined()
    expect(result.version).toBeUndefined()
    expect(result.summary).toBeUndefined()
  })

  it('dispatches changeSummary as the tool event message', async () => {
    const middleware = await new ExcalidrawMiddleware({ patchScene: jest.fn() } as any).createMiddleware({}, testContext())
    const addTool = middleware.tools.find((candidate: any) => candidate.name === EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME) as any
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
        title: 'Excalidraw',
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

  it('registers excalidraw_get_scene_item and routes it through getSceneItemForAgent', async () => {
    const getSceneItemForAgent = jest.fn(async (_scope, input) => ({
      itemType: input.itemType,
      drawingId: input.drawingId,
      version: {
        id: 'version-1',
        versionNumber: input.versionNumber,
        elementCount: 1
      },
      elementId: input.elementId,
      element: {
        id: input.elementId,
        type: 'text',
        text: 'Full text'
      }
    }))
    const middleware = await new ExcalidrawMiddleware({ getSceneItemForAgent } as any).createMiddleware({}, testContext())

    const getItemTool = middleware.tools.find((candidate: any) => candidate.name === EXCALIDRAW_GET_SCENE_ITEM_TOOL_NAME) as any
    expect(getItemTool).toBeTruthy()

    const result = JSON.parse(await getItemTool.invoke({
      drawingId: 'drawing-1',
      itemType: 'element',
      versionNumber: 1,
      elementId: 'text-1'
    }))

    expect(getSceneItemForAgent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1' }),
      expect.objectContaining({
        drawingId: 'drawing-1',
        itemType: 'element',
        versionNumber: 1,
        elementId: 'text-1'
      })
    )
    expect(result.element.text).toBe('Full text')
  })
})

function testContext() {
  return {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    workspaceId: null,
    projectId: null,
    userId: 'user-1',
    xpertId: 'assistant-1',
    conversationId: 'conversation-1'
  } as any
}
