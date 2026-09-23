import {
  ConnectorRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { KdocsConnectorRuntimeMiddleware } from './kdocs-connector-runtime.middleware.js'
import { KdocsMcpClient } from './mcp/kdocs-mcp.client.js'

jest.mock('@xpert-ai/plugin-sdk', () => ({
  AgentMiddlewareStrategy: () => (target: object) => target,
  ConnectorRuntimeCapability: { id: 'platform.connector' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' }
}))
jest.mock('@langchain/core/tools', () => ({
  tool: (
    handler: (input: unknown) => Promise<unknown>,
    config: { schema: { parse(value: unknown): unknown }; name: string; description: string }
  ) => ({
    ...config,
    invoke: (input: unknown) => handler(config.schema.parse(input))
  })
}))

describe('KdocsConnectorRuntimeMiddleware', () => {
  it('exposes only the bounded WPS tool surface and rejects unknown schema keys', async () => {
    const setup = createSetup()

    expect(setup.middleware.tools?.map((tool) => tool.name)).toEqual([
      'kdocs_search_files',
      'kdocs_list_files',
      'kdocs_get_file',
      'kdocs_get_file_link',
      'kdocs_read_document',
      'kdocs_create_file',
      'kdocs_write_smart_document',
      'kdocs_rename_file',
      'kdocs_move_file',
      'kdocs_copy_file',
      'kdocs_get_sheets',
      'kdocs_read_sheet_range',
      'kdocs_update_sheet_cells',
      'kdocs_append_sheet_row',
      'kdocs_upload_file',
      'kdocs_download_file'
    ])
    await expect(invoke(setup.middleware, 'kdocs_search_files', { unknown: true })).rejects.toThrow()
    await expect(invoke(setup.middleware, 'kdocs_write_smart_document', {
      file_id: 'file-1',
      content: 'replacement',
      mode: 'replace'
    })).rejects.toThrow('confirmed=true')
  })

  it('maps file search results into an allowlisted paginated DTO', async () => {
    const setup = createSetup()
    setup.callTool.mockResolvedValue({
      code: 0,
      data: {
        code: 0,
        msg: 'success',
        data: {
          items: [{ file: { id: 'file-1', name: 'Report.docx', type: 'file', drive_id: 'drive-1', secret: 'drop' } }],
          next_page_token: 'next',
          internal: 'drop'
        }
      }
    })

    const result = await invoke(setup.middleware, 'kdocs_search_files', { keyword: 'Report' })

    expect(setup.callTool).toHaveBeenCalledWith(expect.objectContaining({
      name: 'search_files',
      arguments: expect.objectContaining({ keyword: 'Report', page_size: 20, scope: ['all'], with_link: false })
    }))
    expect(result).toMatchObject({ status: 'ok', items: [{ fileId: 'file-1', name: 'Report.docx', driveId: 'drive-1' }], nextPageToken: 'next' })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(result)).not.toContain('internal')
  })

  it('forwards WPS drive and scope filters for personal-drive searches', async () => {
    const setup = createSetup()
    setup.callTool.mockResolvedValue({ code: 0, data: { items: [] } })

    const result = await invoke(setup.middleware, 'kdocs_search_files', {
      keyword: 'Xpert-KDocs-Test-Doc.docx',
      type: 'file_name',
      file_type: 'file',
      file_exts: ['docx'],
      drive_ids: ['drive-1'],
      parent_ids: ['folder-1'],
      scope: ['personal_drive']
    })

    expect(setup.callTool).toHaveBeenCalledWith(expect.objectContaining({
      name: 'search_files',
      arguments: expect.objectContaining({
        drive_ids: ['drive-1'],
        parent_ids: ['folder-1'],
        scope: ['personal_drive'],
        with_total: true
      })
    }))
    expect(result).toMatchObject({ status: 'empty', items: [], hasMore: false })
  })

  it('rejects unsupported search scope values and duplicate scopes', async () => {
    const setup = createSetup()

    await expect(invoke(setup.middleware, 'kdocs_search_files', {
      keyword: 'Xpert-KDocs-Test',
      scope: ['unsupported']
    })).rejects.toThrow()

    await expect(invoke(setup.middleware, 'kdocs_search_files', {
      keyword: 'Xpert-KDocs-Test',
      scope: ['personal_drive', 'personal_drive']
    })).rejects.toThrow('Search scopes must be unique')
  })

  it('preflights creation, independently verifies the file, and returns its WPS link', async () => {
    const setup = createSetup()
    setup.callTool.mockImplementation(async (input) => {
      if (input.name === 'search_files') return { code: 0, data: { items: [] } }
      if (input.name === 'create_file') return { code: 0, data: { id: 'created-1', name: 'Plan.otl' } }
      if (input.name === 'get_file_info') return { code: 0, data: { id: 'created-1', name: 'Plan.otl', type: 'file' } }
      if (input.name === 'get_file_link') return { code: 0, data: { id: 'created-1', link_url: 'https://www.kdocs.cn/l/created-1' } }
      throw new Error(`Unexpected tool ${input.name}`)
    })

    const result = await invoke(setup.middleware, 'kdocs_create_file', { name: 'Plan.otl' })

    expect(result).toMatchObject({
      status: 'created',
      fileId: 'created-1',
      file: { fileId: 'created-1', name: 'Plan.otl' },
      link: 'https://www.kdocs.cn/l/created-1',
      verified: true
    })
    expect(setup.callTool.mock.calls.map(([input]) => input.name)).toEqual([
      'search_files', 'create_file', 'get_file_info', 'get_file_link'
    ])
    expect(setup.callTool.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      name: 'search_files',
      arguments: expect.objectContaining({ scope: ['all'] })
    }))
  })

  it('pre-reads and post-verifies bounded worksheet mutations', async () => {
    const setup = createSetup()
    setup.callTool
      .mockResolvedValueOnce(rangePayload('old'))
      .mockResolvedValueOnce({ code: 0 })
      .mockResolvedValueOnce(rangePayload('new'))

    const result = await invoke(setup.middleware, 'kdocs_update_sheet_cells', {
      file_id: 'sheet-file-1',
      sheet_id: 3,
      cells: [{ row: 0, col: 0, value: 'new' }]
    })

    expect(result).toMatchObject({ status: 'completed', changedCellCount: 1, verified: true })
    expect(setup.callTool.mock.calls.map(([input]) => input.name)).toEqual([
      'sheet.get_range_data', 'sheet.update_range_data', 'sheet.get_range_data'
    ])
  })

  it('reads uploads from Workspace Files and never returns Base64', async () => {
    const setup = createSetup()
    const bytes = Buffer.from('document bytes')
    setup.readRuntimeBuffer.mockResolvedValue({
      name: 'report.docx',
      filePath: 'report.docx',
      workspacePath: '/workspace/report.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: bytes.length,
      catalog: 'xperts',
      buffer: bytes,
      reference: { source: 'platform.workspace.files', filePath: 'report.docx', workspacePath: '/workspace/report.docx' }
    })
    setup.callTool.mockImplementation(async (input) => {
      if (input.name === 'upload_file') return { code: 0, data: { id: 'uploaded-1', name: 'report.docx' } }
      if (input.name === 'get_file_info') return { code: 0, data: { id: 'uploaded-1', name: 'report.docx', type: 'file' } }
      throw new Error(`Unexpected tool ${input.name}`)
    })

    const result = await invoke(setup.middleware, 'kdocs_upload_file', {
      file: { path: '/workspace/report.docx' }
    })

    expect(setup.readRuntimeBuffer).toHaveBeenCalledWith('/workspace/report.docx')
    expect(setup.callTool).toHaveBeenCalledWith(expect.objectContaining({
      name: 'upload_file',
      arguments: expect.objectContaining({ content_base64: bytes.toString('base64') })
    }))
    expect(result).toMatchObject({ status: 'completed', fileId: 'uploaded-1', sourceSize: bytes.length })
    expect(JSON.stringify(result)).not.toContain(bytes.toString('base64'))
  })
})

function createSetup() {
  const mcp = new KdocsMcpClient()
  const callTool = jest.spyOn(mcp, 'callTool')
  const readRuntimeBuffer = jest.fn<ReturnType<WorkspaceFilesApi['readRuntimeBuffer']>, Parameters<WorkspaceFilesApi['readRuntimeBuffer']>>()
  const writeRuntimeBuffer = jest.fn<ReturnType<WorkspaceFilesApi['writeRuntimeBuffer']>, Parameters<WorkspaceFilesApi['writeRuntimeBuffer']>>()
  const connectorRuntime: ConnectorRuntimeApi = {
    getConnector: jest.fn(),
    getConnectorCredential: jest.fn().mockResolvedValue({
      connectorId: 'kdocs-connector-1',
      workspaceId: 'workspace-1',
      provider: 'kdocs',
      authMethodId: 'skillhub-login',
      credentials: { accessToken: 'wps-access-token', tokenType: 'bearer' }
    })
  }
  const workspaceFiles = { readRuntimeBuffer, writeRuntimeBuffer } as Pick<
    WorkspaceFilesApi,
    'readRuntimeBuffer' | 'writeRuntimeBuffer'
  >
  const middleware = new KdocsConnectorRuntimeMiddleware(mcp).createMiddleware(
    {},
    runtimeContext(connectorRuntime, workspaceFiles)
  )
  return { middleware, callTool, readRuntimeBuffer, writeRuntimeBuffer }
}

function runtimeContext(
  connectorRuntime: ConnectorRuntimeApi,
  workspaceFiles: Pick<WorkspaceFilesApi, 'readRuntimeBuffer' | 'writeRuntimeBuffer'>
) {
  return {
    tenantId: 'tenant-1',
    organizationId: 'organization-1',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    node: {},
    tools: new Map(),
    runtime: {
      capabilities: {
        get: (capability: unknown) => capability === ConnectorRuntimeCapability
          ? connectorRuntime
          : capability === WorkspaceFilesRuntimeCapability
            ? workspaceFiles
            : undefined
      }
    }
  } as unknown as IAgentMiddlewareContext
}

function requireTool(middleware: AgentMiddleware, name: string) {
  const selected = middleware.tools?.find((tool) => tool.name === name)
  if (!selected) throw new Error(`Missing tool ${name}`)
  return selected
}

async function invoke(middleware: AgentMiddleware, name: string, input: Record<string, unknown>) {
  const value = await requireTool(middleware, name).invoke(input)
  if (typeof value === 'string') {
    const parsed: unknown = JSON.parse(value)
    if (isRecord(parsed)) return parsed
    throw new Error(`Tool ${name} returned a non-object JSON value`)
  }
  if (isRecord(value)) return value
  throw new Error(`Tool ${name} returned a non-object value`)
}

function rangePayload(value: string) {
  return {
    result: 'ok',
    detail: {
      rangeData: [{ rowFrom: 0, colFrom: 0, cellText: value, originalCellValue: value }]
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
