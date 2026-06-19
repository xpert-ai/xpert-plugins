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
  OFFICE_EDITOR_FEATURE,
  OFFICE_EDITOR_MIDDLEWARE_NAME,
  OFFICE_EDITOR_TOOL_NAMES
} from './constants.js'
import { OfficeEditorMiddleware } from './office-editor.middleware.js'

describe('OfficeEditorMiddleware', () => {
  it('exposes all Office Editor tools and feature metadata', () => {
    const middleware = new OfficeEditorMiddleware(createService() as never)
    const runtime = middleware.createMiddleware({}, testContext())

    expect(middleware.meta.name).toBe(OFFICE_EDITOR_MIDDLEWARE_NAME)
    expect(middleware.meta.features).toContain(OFFICE_EDITOR_FEATURE)
    expect(runtime.name).toBe(OFFICE_EDITOR_MIDDLEWARE_NAME)
    expect(runtime.tools?.map((item: any) => item.name)).toEqual([...OFFICE_EDITOR_TOOL_NAMES])
  })

  it('validates queue edits through a discriminated zod schema and routes the discriminator to the service', async () => {
    const service = createService()
    service.queueOperation.mockResolvedValue({
      id: 'operation-1',
      operationType: 'doc_append_text',
      status: 'queued'
    })
    const middleware = new OfficeEditorMiddleware(service as never)
    const runtime = middleware.createMiddleware({}, testContext())
    const queueTool = runtime.tools?.find((candidate: any) => candidate.name === 'office_queue_edit') as any

    expect(queueTool.schema.parse({
      documentId: 'document-1',
      operation: {
        operationType: 'doc_append_text',
        text: 'Append this paragraph.'
      }
    })).toEqual({
      documentId: 'document-1',
      operation: {
        operationType: 'doc_append_text',
        text: 'Append this paragraph.'
      }
    })
    expect(() => queueTool.schema.parse({
      documentId: 'document-1',
      operation: {
        operationType: 'doc_append_text',
        search: 'missing text field'
      }
    })).toThrow()

    const result = JSON.parse(await queueTool.invoke({
      documentId: 'document-1',
      operation: {
        operationType: 'doc_append_text',
        text: 'Append this paragraph.'
      },
      reviewNote: 'Human should inspect tone.',
      confidence: 0.7
    }))

    expect(service.queueOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1'
      }),
      {
        documentId: 'document-1',
        operationType: 'doc_append_text',
        input: {
          operationType: 'doc_append_text',
          text: 'Append this paragraph.'
        },
        reviewNote: 'Human should inspect tone.',
        confidence: 0.7,
        source: 'agent'
      }
    )
    expect(result.message).toMatch(/queued/i)
    expect(result.operation.status).toBe('queued')
  })
})

function createService() {
  return {
    createDocument: jest.fn(),
    getWorkbenchData: jest.fn(),
    queueOperation: jest.fn(),
    addReviewNote: jest.fn(),
    reportFailure: jest.fn()
  }
}

function testContext() {
  return {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    userId: 'user-1',
    xpertId: 'assistant-1',
    conversationId: 'conversation-1'
  } as any
}
