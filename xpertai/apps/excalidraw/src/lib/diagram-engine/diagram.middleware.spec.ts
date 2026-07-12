jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: unknown) => target,
  RequestContext: { getOrganizationId: () => 'org-1' }
}))
jest.mock('@langchain/core/callbacks/dispatch', () => ({
  dispatchCustomEvent: jest.fn(async () => undefined)
}))

import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
  EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME,
  EXCALIDRAW_DIAGRAM_TOOL_NAMES,
  EXCALIDRAW_DIAGRAM_IR_TOOL_NAMES,
  EXCALIDRAW_DIAGRAM_QUALITY_TOOL_NAMES,
  EXCALIDRAW_TEMPLATE_TOOL_NAMES,
  ExcalidrawDiagramEngineMiddleware
} from './diagram.middleware.js'
import { DiagramIrRevisionConflictException } from './diagram-ir.service.js'

const context = {
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  xpertId: 'assistant-1',
  runtime: {}
} as never

describe('optional DiagramEngine middleware provider', () => {
  it('exposes template, IR, and quality tools through one provider', () => {
    const catalog = { list: jest.fn(), get: jest.fn() }
    const diagrams = {}
    const middleware = new ExcalidrawDiagramEngineMiddleware(catalog as never, diagrams as never).createMiddleware({}, context) as any
    const names = middleware.tools.map((item: any) => item.name)

    expect(middleware.name).toBe(EXCALIDRAW_DIAGRAM_ENGINE_MIDDLEWARE_NAME)
    expect(names).toEqual(EXCALIDRAW_DIAGRAM_TOOL_NAMES)
    expect(names).toEqual([
      ...EXCALIDRAW_TEMPLATE_TOOL_NAMES,
      ...EXCALIDRAW_DIAGRAM_IR_TOOL_NAMES,
      ...EXCALIDRAW_DIAGRAM_QUALITY_TOOL_NAMES
    ])
  })

  it('returns a structured preview failure when Workspace Files capability is unavailable', async () => {
    const diagrams = { createPreview: jest.fn() }
    const middleware = new ExcalidrawDiagramEngineMiddleware({} as never, diagrams as never).createMiddleware({}, context) as any
    const preview = middleware.tools.find((item: any) => item.name === 'excalidraw_diagram_create_preview')

    const result = JSON.parse(await preview.invoke({ drawingId: 'drawing-1', expectedRevision: 1 }))

    expect(result).toEqual(expect.objectContaining({
      success: false,
      message: 'WorkspaceFilesRuntimeCapability is required to create diagram previews.',
      error: expect.objectContaining({
        code: 'diagram_runtime_capability_unavailable',
        statusCode: 503,
        retryable: true
      })
    }))
    expect(diagrams.createPreview).not.toHaveBeenCalled()
  })

  it('awaits async service results instead of detaching a rejecting promise', async () => {
    const validate = jest.fn(async () => ({ success: true, drawingId: 'drawing-1', revision: 2, status: 'validated' }))
    const middleware = new ExcalidrawDiagramEngineMiddleware({} as never, { validate } as never).createMiddleware({}, context) as any
    const tool = middleware.tools.find((item: any) => item.name === 'excalidraw_diagram_validate')

    const result = JSON.parse(await tool.invoke({ drawingId: 'drawing-1', expectedRevision: 1 }))

    expect(result).toEqual({ success: true, drawingId: 'drawing-1', revision: 2, status: 'validated' })
    expect(validate).toHaveBeenCalledTimes(1)
  })

  it('turns stale revision conflicts into recoverable Agent tool results', async () => {
    const validate = jest.fn(async () => {
      throw new DiagramIrRevisionConflictException(1, 2)
    })
    const middleware = new ExcalidrawDiagramEngineMiddleware({} as never, { validate } as never).createMiddleware({}, context) as any
    const tool = middleware.tools.find((item: any) => item.name === 'excalidraw_diagram_validate')

    const result = JSON.parse(await tool.invoke({ drawingId: 'drawing-1', expectedRevision: 1 }))

    expect(result).toEqual({
      success: false,
      message: 'DiagramIR revision conflict: expected 1, current 2.',
      error: {
        code: 'diagram_revision_conflict',
        statusCode: 409,
        retryable: true,
        expectedRevision: 1,
        currentRevision: 2,
        recoveryTool: 'excalidraw_diagram_get',
        recovery: 'Read the latest DiagramIR, reapply the intended change if still needed, and retry with the returned revision.'
      }
    })
  })

  it('publishes changeSummary as the running and completed tool step title and message', async () => {
    const middleware = new ExcalidrawDiagramEngineMiddleware({} as never, {} as never).createMiddleware({}, context) as any
    const handler = jest.fn(async () => ({ content: '{"success":true}' }))

    await middleware.wrapToolCall({
      toolCall: {
        id: 'call-1',
        name: 'excalidraw_diagram_upsert_node',
        args: { drawingId: 'drawing-1', expectedRevision: 1, changeSummary: 'Move gateway below API' }
      },
      runtime: { metadata: { toolset: 'diagram-ir' } }
    }, handler)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(dispatchCustomEvent).toHaveBeenCalledTimes(2)
    expect(dispatchCustomEvent).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({
      title: 'Move gateway below API',
      message: 'Move gateway below API',
      status: 'running'
    }))
    expect(dispatchCustomEvent).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({
      title: 'Move gateway below API',
      message: 'Move gateway below API',
      status: 'success'
    }))
  })
})
