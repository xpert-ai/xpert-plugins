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

import { EXCALIDRAW_ADD_ELEMENTS_TOOL_NAME, EXCALIDRAW_CREATE_DRAWING_TOOL_NAME } from './constants.js'
import { ExcalidrawMiddleware } from './excalidraw.middleware.js'

describe('ExcalidrawMiddleware staged element tools', () => {
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
    expect(result.drawing.id).toBe('drawing-1')
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
    expect(result.drawingId).toBe('drawing-1')
    expect(result.versionId).toBe('version-2')
    expect(result.versionNumber).toBe(2)
    expect(result.version.elements).toBeUndefined()
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
