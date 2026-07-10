import 'reflect-metadata'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: Function) => target,
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  RequestContext: {
    getOrganizationId: () => null
  }
}))

jest.mock('@langchain/core/tools', () => ({
  tool: jest.fn((_fn, config) => ({ ...config, invoke: _fn }))
}))

jest.mock('@langchain/core/callbacks/dispatch', () => ({
  dispatchCustomEvent: jest.fn()
}))

jest.mock('./pencil.service.js', () => ({
  PencilService: class MockPencilService {}
}))

import { PencilMiddleware } from './pencil.middleware.js'
import type { AgentMiddleware, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import type { PencilService } from './pencil.service.js'
import { summarizeCoreToolResult } from './pencil-agent-response.js'
import {
  PENCIL_CREATE_DOCUMENT_TOOL_NAME,
  PENCIL_CREATE_SAMPLE_DOCUMENT_TOOL_NAME,
  PENCIL_EXPORT_FILE_TOOL_NAME,
  PENCIL_GET_NODE_TOOL_NAME,
  PENCIL_REPORT_FAILURE_TOOL_NAME,
  PENCIL_RENDER_PATCH_TOOL_NAME,
  PENCIL_SAVE_VERSION_TOOL_NAME
} from './constants.js'

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
  xpertId: 'assistant',
  runtime: {
    capabilities: {
      require: jest.fn()
    }
  }
} as unknown as IAgentMiddlewareContext

async function createMiddleware(service: Partial<PencilService> = {}) {
  return new PencilMiddleware({
    getCoreToolDefinitions: async () => [
      {
        name: 'update_node',
        description: 'Update a node',
        mutates: true,
        params: {
          id: { type: 'string', description: 'Node ID', required: true },
          x: { type: 'number', description: 'X position' }
        },
        execute: jest.fn()
      }
    ],
    ...service
  } as PencilService).createMiddleware({}, context) as Promise<AgentMiddleware>
}

describe('PencilMiddleware', () => {
  it('exposes persistence tools and selected prefixed core tools without duplicate get_node collision', async () => {
    const agentMiddleware = await createMiddleware()
    const names = (agentMiddleware.tools as TestTool[]).map((item) => item.name)

    expect(names).toEqual(
      expect.arrayContaining([
        PENCIL_CREATE_DOCUMENT_TOOL_NAME,
        PENCIL_CREATE_SAMPLE_DOCUMENT_TOOL_NAME,
        PENCIL_SAVE_VERSION_TOOL_NAME,
        PENCIL_EXPORT_FILE_TOOL_NAME,
        PENCIL_REPORT_FAILURE_TOOL_NAME,
        PENCIL_RENDER_PATCH_TOOL_NAME,
        'pencil_update_node'
      ])
    )
    expect(names.filter((name) => name === PENCIL_GET_NODE_TOOL_NAME)).toHaveLength(1)
    expect((agentMiddleware.tools as TestTool[]).every((item) => item.verboseParsingErrors === true)).toBe(true)
  })

  it('keeps tenant and organization out of tool schemas', async () => {
    const agentMiddleware = await createMiddleware()
    const saveTool = (agentMiddleware.tools as TestTool[]).find((item) => item.name === PENCIL_SAVE_VERSION_TOOL_NAME)
    const parsed = saveTool.schema.parse({
      documentId: 'doc-1',
      changeSummary: 'Save checkpoint'
    }) as Record<string, unknown>

    expect(parsed.documentId).toBe('doc-1')
    expect(parsed.tenantId).toBeUndefined()
    expect(parsed.organizationId).toBeUndefined()
  })

  it('builds core tool schema with injected documentId', async () => {
    const agentMiddleware = await createMiddleware()
    const updateNodeTool = (agentMiddleware.tools as TestTool[]).find((item) => item.name === 'pencil_update_node')

    expect(() =>
      updateNodeTool.schema.parse({
        documentId: 'doc-1',
        id: 'node-1',
        x: 24,
        changeSummary: 'Move selected node'
      })
    ).not.toThrow()
  })

  it('validates compact render draft patches without exposing ownership scope', async () => {
    const agentMiddleware = await createMiddleware()
    const patchTool = (agentMiddleware.tools as TestTool[]).find((item) => item.name === PENCIL_RENDER_PATCH_TOOL_NAME)
    const parsed = patchTool.schema.parse({
      documentId: 'doc-1',
      draftId: 'draft-1',
      expectedRevision: 2,
      edits: [{ oldText: 'text=\"Broken', newText: 'text=\"Fixed' }]
    }) as Record<string, unknown>

    expect(parsed).toEqual(expect.objectContaining({ documentId: 'doc-1', draftId: 'draft-1', expectedRevision: 2 }))
    expect(parsed.tenantId).toBeUndefined()
    expect(parsed.organizationId).toBeUndefined()
  })

  it('preserves created page id in compact core tool summaries', () => {
    expect(
      summarizeCoreToolResult({
        success: true,
        toolName: 'create_page',
        documentId: 'doc-1',
        result: {
          id: 'page-2',
          name: '产品介绍'
        }
      })
    ).toEqual(expect.objectContaining({ documentId: 'doc-1', pageId: 'page-2' }))
  })
})
