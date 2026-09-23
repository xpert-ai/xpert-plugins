import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  ConnectorRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeCredentialV2,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type WorkspaceFileLocator,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { KDOCS_ICON } from './branding.js'
import {
  KDOCS_AUTH_METHOD_ID,
  KDOCS_CONNECTOR_PROVIDER,
  KDOCS_MAX_FILE_BYTES,
  KDOCS_RUNTIME_MIDDLEWARE_NAME
} from './constants.js'
import { KdocsConnectorError } from './errors.js'
import { downloadWpsFile } from './files/kdocs-file-transfer.js'
import {
  assertProviderSuccess,
  extractDownload,
  extractFileId,
  mapDocumentContent,
  mapFileInfo,
  mapFileLink,
  mapFilePage,
  mapSheetRange,
  mapSheets,
  type KdocsPayload
} from './mcp/kdocs-mappers.js'
import { KdocsMcpClient } from './mcp/kdocs-mcp.client.js'
import { defineAgentTool } from './tools/define-agent-tool.js'
import {
  appendSheetRowSchema,
  copyFileSchema,
  createFileSchema,
  downloadFileSchema,
  getFileSchema,
  getSheetsSchema,
  listFilesSchema,
  moveFileSchema,
  readDocumentSchema,
  readSheetRangeSchema,
  renameFileSchema,
  searchFilesSchema,
  updateSheetCellsSchema,
  uploadFileSchema,
  writeSmartDocumentSchema,
  type AppendSheetRowInput,
  type CopyFileInput,
  type CreateFileInput,
  type DownloadFileInput,
  type GetFileInput,
  type GetSheetsInput,
  type ListFilesInput,
  type MoveFileInput,
  type ReadDocumentInput,
  type ReadSheetRangeInput,
  type RenameFileInput,
  type SearchFilesInput,
  type UpdateSheetCellsInput,
  type UploadFileInput,
  type WriteSmartDocumentInput
} from './tools/schemas.js'

type KdocsConnectorRuntimeConfig = {
  provider?: string
  connectorId?: string
}

type HiddenAgentMiddlewareMeta = TAgentMiddlewareMeta & { builtin: true }

type RuntimeContext = {
  credential: {
    connectorId: string
    accessToken: string
  }
  sessionKey: string
}

@Injectable()
@AgentMiddlewareStrategy(KDOCS_RUNTIME_MIDDLEWARE_NAME)
export class KdocsConnectorRuntimeMiddleware implements IAgentMiddlewareStrategy<KdocsConnectorRuntimeConfig> {
  readonly meta: HiddenAgentMiddlewareMeta = {
    name: KDOCS_RUNTIME_MIDDLEWARE_NAME,
    label: { en_US: 'WPS Docs connector runtime', zh_Hans: '金山文档连接器运行时' },
    description: {
      en_US: 'Hidden runtime implementation for bounded WPS Docs Agent tools.',
      zh_Hans: '为金山文档受限 Agent 工具提供隐藏运行时实现。'
    },
    icon: KDOCS_ICON,
    builtin: true,
    configSchema: { type: 'object', properties: {} }
  }

  constructor(private readonly mcp: KdocsMcpClient) {}

  createMiddleware(options: KdocsConnectorRuntimeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const resolveRuntime = () => resolveRuntimeContext(options, context)

    return {
      name: KDOCS_RUNTIME_MIDDLEWARE_NAME,
      tools: [
        defineAgentTool<SearchFilesInput>(async (input) => {
          const runtime = await resolveRuntime()
          const payload = await this.call(runtime, 'search_files', compactRecord({
            ...input,
            with_total: true,
            with_link: false,
            with_permission: false
          }), true)
          return mapFilePage(payload)
        }, {
          name: 'kdocs_search_files',
          description: 'Search WPS cloud files by bounded keyword and filters, including optional drive_ids and scopes such as personal_drive. Returns status=empty when no item matches the supplied query; an empty result does not prove that a file or folder does not exist.',
          schema: searchFilesSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool<ListFilesInput>(async (input) => {
          const runtime = await resolveRuntime()
          const payload = await this.call(runtime, 'list_files', input, true)
          return mapFilePage(payload)
        }, {
          name: 'kdocs_list_files',
          description: 'List one page of files in an exact WPS drive folder discovered from search or file metadata.',
          schema: listFilesSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool<GetFileInput>(async (input) => {
          const runtime = await resolveRuntime()
          return mapFileInfo(await this.call(runtime, 'get_file_info', {
            file_id: input.file_id,
            with_permission: true,
            with_drive: false
          }, true))
        }, {
          name: 'kdocs_get_file',
          description: 'Get allowlisted metadata and effective operation permissions for one exact WPS file or folder.',
          schema: getFileSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool<GetFileInput>(async (input) => {
          const runtime = await resolveRuntime()
          return mapFileLink(await this.call(runtime, 'get_file_link', { file_id: input.file_id }, true))
        }, {
          name: 'kdocs_get_file_link',
          description: 'Get the WPS web link for one exact file. Call after creating or locating a document when the user needs to open it.',
          schema: getFileSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool<ReadDocumentInput>(async (input) => {
          const runtime = await resolveRuntime()
          return mapDocumentContent(await this.call(runtime, 'read_file_content', compactRecord({
            drive_id: input.drive_id,
            file_id: input.file_id,
            link_id: input.link_id,
            format: input.format,
            include_elements: input.include_elements,
            mode: 'async',
            task_id: input.task_id,
            enable_upload_medias: false
          }), true))
        }, {
          name: 'kdocs_read_document',
          description: 'Read one DOCX or PDF as bounded Markdown or plain text. If status is running, call again with the returned task_id. Use sheet tools for spreadsheets.',
          schema: readDocumentSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool<CreateFileInput>(async (input) => {
          const runtime = await resolveRuntime()
          const existing = await this.findExactFile(runtime, input.name, input.drive_id, input.parent_id)
          if (existing) return { status: 'already_exists', operation: 'create_file', file: existing, verified: true }
          let created: KdocsPayload
          try {
            created = await this.call(runtime, 'create_file', compactRecord({
              drive_id: input.drive_id,
              parent_id: input.parent_id,
              parent_path: input.parent_path,
              name: input.name,
              file_type: 'file',
              on_name_conflict: input.on_name_conflict
            }))
          } catch (error) {
            const recovered = await this.findExactFile(runtime, input.name, input.drive_id, input.parent_id)
            if (recovered) return { status: 'recovered', operation: 'create_file', file: recovered, verified: true }
            throw error
          }
          const fileId = extractFileId(created)
          const verified = await this.verifyFile(runtime, fileId)
          const link = await this.tryFileLink(runtime, fileId)
          return { status: 'created', operation: 'create_file', fileId, file: verified, link, verified: !!verified }
        }, {
          name: 'kdocs_create_file',
          description: 'Create one WPS office file after an exact-name preflight, verify it by an independent read, and return its web link when available. Provide drive_id and parent_id together to target a folder, or omit both to use the provider default. Does not create PDFs.',
          schema: createFileSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool<WriteSmartDocumentInput>(async (input) => {
          const runtime = await resolveRuntime()
          await this.call(runtime, 'otl.block_query', { file_id: input.file_id, blockIds: ['doc'] }, true)
          const payload = await this.call(runtime, 'otl.insert_content', compactRecord({
            file_id: input.file_id,
            title: input.title,
            content: input.content,
            format: input.format,
            mode: input.mode
          }))
          assertProviderSuccess(payload)
          const verified = await this.verifySmartDocument(runtime, input.file_id)
          return {
            status: verified ? 'completed' : 'verification_failed',
            operation: 'write_smart_document',
            fileId: input.file_id,
            mode: input.mode,
            verified
          }
        }, {
          name: 'kdocs_write_smart_document',
          description: 'Write Markdown or HTML to an existing .otl smart document, then independently read its block tree. replace mode requires confirmed=true after user confirmation.',
          schema: writeSmartDocumentSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool<RenameFileInput>(async (input) => {
          const runtime = await resolveRuntime()
          await this.call(runtime, 'get_file_info', { file_id: input.file_id }, true)
          const payload = await this.call(runtime, 'rename_file', compactRecord({
            file_id: input.file_id,
            drive_id: input.drive_id,
            dst_name: input.new_name
          }))
          assertProviderSuccess(payload)
          const file = await this.verifyFile(runtime, input.file_id)
          return {
            status: file?.name === input.new_name ? 'completed' : 'verification_failed',
            operation: 'rename_file',
            fileId: input.file_id,
            file,
            verified: file?.name === input.new_name
          }
        }, {
          name: 'kdocs_rename_file',
          description: 'Rename one exact WPS file or folder and independently verify the resulting name.',
          schema: renameFileSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool<MoveFileInput>(async (input) => {
          const runtime = await resolveRuntime()
          await this.call(runtime, 'get_file_info', { file_id: input.destination_parent_id }, true)
          const payload = await this.call(runtime, 'move_file', {
            drive_id: input.drive_id,
            file_ids: [input.file_id],
            dst_drive_id: input.destination_drive_id,
            dst_parent_id: input.destination_parent_id
          })
          assertProviderSuccess(payload)
          const file = await this.verifyFile(runtime, input.file_id)
          const verified = file?.parentId === input.destination_parent_id && file.driveId === input.destination_drive_id
          return { status: verified ? 'completed' : 'verification_failed', operation: 'move_file', fileId: input.file_id, file, verified }
        }, {
          name: 'kdocs_move_file',
          description: 'Move one exact WPS file after validating the destination folder, then verify its new drive and parent.',
          schema: moveFileSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool<CopyFileInput>(async (input) => {
          const runtime = await resolveRuntime()
          await this.call(runtime, 'get_file_info', { file_id: input.destination_parent_id }, true)
          const payload = await this.call(runtime, 'copy_file', compactRecord({
            drive_id: input.drive_id,
            file_id: input.file_id,
            dst_drive_id: input.destination_drive_id,
            dst_parent_id: input.destination_parent_id
          }))
          const copiedFileId = extractFileId(payload)
          const file = await this.verifyFile(runtime, copiedFileId)
          return { status: file ? 'completed' : 'verification_failed', operation: 'copy_file', fileId: copiedFileId, file, verified: !!file }
        }, {
          name: 'kdocs_copy_file',
          description: 'Copy one exact WPS file to a validated destination and verify the new copy. This operation is non-idempotent; do not retry after an uncertain result.',
          schema: copyFileSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool<GetSheetsInput>(async (input) => {
          const runtime = await resolveRuntime()
          return mapSheets(await this.call(runtime, 'sheet.get_sheets_info', { file_id: input.file_id }, true))
        }, {
          name: 'kdocs_get_sheets',
          description: 'List bounded worksheet metadata for one .xlsx or .ksheet file before selecting a range.',
          schema: getSheetsSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool<ReadSheetRangeInput>(async (input) => {
          const runtime = await resolveRuntime()
          return mapSheetRange(await this.call(runtime, 'sheet.get_range_data', {
            file_id: input.file_id,
            sheetId: input.sheet_id,
            range: providerRange(input.range)
          }, true))
        }, {
          name: 'kdocs_read_sheet_range',
          description: 'Read at most 5,000 cells from one exact WPS worksheet range using zero-based coordinates. Image bytes are omitted.',
          schema: readSheetRangeSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool<UpdateSheetCellsInput>(async (input) => {
          const runtime = await resolveRuntime()
          const range = boundingRange(input.cells)
          await this.call(runtime, 'sheet.get_range_data', { file_id: input.file_id, sheetId: input.sheet_id, range }, true)
          const payload = await this.call(runtime, 'sheet.update_range_data', {
            file_id: input.file_id,
            sheetId: input.sheet_id,
            rangeData: input.cells.map((cell) => ({
              opType: 'formula',
              rowFrom: cell.row,
              rowTo: cell.row,
              colFrom: cell.col,
              colTo: cell.col,
              formula: serializeCellValue(cell.value)
            }))
          })
          assertProviderSuccess(payload)
          const actual = mapSheetRange(await this.call(runtime, 'sheet.get_range_data', {
            file_id: input.file_id,
            sheetId: input.sheet_id,
            range
          }, true))
          const verified = verifyCells(input.cells, actual.cells)
          return {
            status: verified ? 'completed' : 'verification_failed',
            operation: 'update_sheet_cells',
            fileId: input.file_id,
            sheetId: input.sheet_id,
            changedCellCount: input.cells.length,
            verified,
            cells: actual.cells
          }
        }, {
          name: 'kdocs_update_sheet_cells',
          description: 'Update up to 100 explicit worksheet cells, with a pre-read and independent post-read verification. Coordinates are zero-based.',
          schema: updateSheetCellsSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool<AppendSheetRowInput>(async (input) => {
          const runtime = await resolveRuntime()
          const before = await this.getSheet(runtime, input.file_id, input.sheet_id)
          const payload = await this.call(runtime, 'sheet.add_row', {
            file_id: input.file_id,
            sheetId: input.sheet_id,
            rangeData: input.values.map((value, col) => ({ opType: 'formula', col, formula: serializeCellValue(value) }))
          })
          assertProviderSuccess(payload)
          const after = await this.tryGetSheet(runtime, input.file_id, input.sheet_id)
          const verified = !!after && (before.empty === true ? after.empty === false : (after.rowTo ?? -1) > (before.rowTo ?? -1))
          return {
            status: verified ? 'completed' : 'verification_failed',
            operation: 'append_sheet_row',
            fileId: input.file_id,
            sheetId: input.sheet_id,
            appendedCellCount: input.values.length,
            row: after?.rowTo,
            verified
          }
        }, {
          name: 'kdocs_append_sheet_row',
          description: 'Append one row with at most 100 values and verify worksheet growth. This is non-idempotent; do not retry after an uncertain result.',
          schema: appendSheetRowSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool<UploadFileInput>(async (input) => {
          const runtime = await resolveRuntime()
          const files = requireWorkspaceFiles(context)
          const source = await files.readRuntimeBuffer(fileLocator(input.file))
          if (!source.buffer.length || source.buffer.length > KDOCS_MAX_FILE_BYTES) {
            throw new KdocsConnectorError('FILE_TOO_LARGE', `Upload must be non-empty and no larger than ${KDOCS_MAX_FILE_BYTES} bytes`)
          }
          let targetName = safeFileName(input.target_name ?? source.name)
          if (input.file_id) {
            const current = mapFileInfo(await this.call(runtime, 'get_file_info', { file_id: input.file_id }, true))
            targetName = current.name
            if (!/\.(docx|pdf)$/i.test(current.name)) {
              throw new KdocsConnectorError('MCP_TOOL_FAILED', 'WPS full-file replacement supports only existing DOCX and PDF files')
            }
          } else {
            validateUploadTarget(targetName, input.content_format)
          }
          const payload = await this.call(runtime, 'upload_file', compactRecord({
            file_id: input.file_id,
            name: input.file_id ? undefined : targetName,
            drive_id: input.drive_id,
            parent_id: input.parent_id,
            content_base64: source.buffer.toString('base64'),
            content_format: input.content_format,
            file_sum: createHash('sha256').update(source.buffer).digest('hex'),
            file_type: 'sha256'
          }))
          const fileId = input.file_id ?? extractFileId(payload)
          const file = await this.verifyFile(runtime, fileId)
          return {
            status: file ? 'completed' : 'verification_failed',
            operation: input.file_id ? 'replace_file' : 'upload_file',
            fileId,
            file,
            sourceSize: source.buffer.length,
            verified: !!file
          }
        }, {
          name: 'kdocs_upload_file',
          description: 'Upload one Workspace Files object to WPS without exposing Base64. New uploads support office/PDF targets; replacement supports existing DOCX/PDF only.',
          schema: uploadFileSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool<DownloadFileInput>(async (input) => {
          const runtime = await resolveRuntime()
          const files = requireWorkspaceFiles(context)
          const file = mapFileInfo(await this.call(runtime, 'get_file_info', { file_id: input.file_id }, true))
          const download = extractDownload(await this.call(runtime, 'download_file', compactRecord({
            file_id: input.file_id,
            drive_id: input.drive_id,
            with_hash: true,
            internal: false
          }), true))
          const fetched = await downloadWpsFile({
            url: download.url,
            accessToken: runtime.credential.accessToken,
            hashes: download.hashes
          })
          const fileName = safeFileName(input.output_name ?? file.name)
          const written = await files.writeRuntimeBuffer({
            path: `downloads/kdocs/${safeSegment(input.file_id)}-${fileName}`,
            originalName: fileName,
            mimeType: fetched.mimeType,
            buffer: fetched.buffer
          })
          return {
            status: 'downloaded',
            fileId: input.file_id,
            fileName,
            mimeType: fetched.mimeType,
            size: fetched.buffer.length,
            sha256: fetched.sha256,
            workspacePath: written.workspacePath
          }
        }, {
          name: 'kdocs_download_file',
          description: 'Download one uploaded WPS binary file, enforce trusted HTTPS redirects and integrity/size checks, then write it into the current Workspace Files scope.',
          schema: downloadFileSchema,
          verboseParsingErrors: true
        })
      ]
    }
  }

  private call(
    runtime: RuntimeContext,
    name: Parameters<KdocsMcpClient['callTool']>[0]['name'],
    args: Record<string, unknown>,
    retrySessionLost = false
  ) {
    return this.mcp.callTool({
      sessionKey: runtime.sessionKey,
      accessToken: runtime.credential.accessToken,
      name,
      arguments: args,
      retrySessionLost
    })
  }

  private async findExactFile(runtime: RuntimeContext, name: string, driveId?: string, parentId?: string) {
    try {
      const page = mapFilePage(await this.call(runtime, 'search_files', compactRecord({
        keyword: name,
        type: 'file_name',
        scope: ['all'],
        drive_ids: driveId ? [driveId] : undefined,
        parent_ids: parentId ? [parentId] : undefined,
        page_size: 20,
        with_total: false,
        with_link: false
      }), true))
      return page.items.find((file) => file.name === name && (!driveId || file.driveId === driveId) && (!parentId || file.parentId === parentId))
    } catch {
      return undefined
    }
  }

  private async verifyFile(runtime: RuntimeContext, fileId: string) {
    try {
      return mapFileInfo(await this.call(runtime, 'get_file_info', { file_id: fileId }, true))
    } catch {
      return undefined
    }
  }

  private async tryFileLink(runtime: RuntimeContext, fileId: string) {
    try {
      return mapFileLink(await this.call(runtime, 'get_file_link', { file_id: fileId }, true)).link
    } catch {
      return undefined
    }
  }

  private async verifySmartDocument(runtime: RuntimeContext, fileId: string) {
    try {
      const payload = await this.call(runtime, 'otl.block_query', { file_id: fileId, blockIds: ['doc'] }, true)
      assertProviderSuccess(payload)
      return true
    } catch {
      return false
    }
  }

  private async getSheet(runtime: RuntimeContext, fileId: string, sheetId: number) {
    const sheet = mapSheets(await this.call(runtime, 'sheet.get_sheets_info', { file_id: fileId }, true)).sheets
      .find((candidate) => candidate.sheetId === sheetId)
    if (!sheet) throw new KdocsConnectorError('PROVIDER_RESPONSE_INVALID', `WPS worksheet ${sheetId} was not found`)
    return sheet
  }

  private async tryGetSheet(runtime: RuntimeContext, fileId: string, sheetId: number) {
    try {
      return await this.getSheet(runtime, fileId, sheetId)
    } catch {
      return undefined
    }
  }
}

async function resolveRuntimeContext(
  options: KdocsConnectorRuntimeConfig,
  context: IAgentMiddlewareContext
): Promise<RuntimeContext> {
  if (options.provider && options.provider !== KDOCS_CONNECTOR_PROVIDER) {
    throw new KdocsConnectorError('CONNECTOR_UNAVAILABLE', `Unsupported connector provider '${options.provider}'`)
  }
  if (!context.workspaceId) throw new KdocsConnectorError('CONNECTOR_UNAVAILABLE', 'WPS Docs tools require an active workspace')
  const connectorRuntime = context.runtime.capabilities?.get(ConnectorRuntimeCapability)
  if (!connectorRuntime?.getConnectorCredential) {
    throw new KdocsConnectorError('CONNECTOR_UNAVAILABLE', 'Connector runtime capability is unavailable')
  }
  const value = await connectorRuntime.getConnectorCredential({
    workspaceId: context.workspaceId,
    provider: KDOCS_CONNECTOR_PROVIDER,
    connectorId: options.connectorId
  })
  const credential = readRuntimeCredential(value)
  return { credential, sessionKey: `${context.workspaceId}:${credential.connectorId}` }
}

function readRuntimeCredential(value: ConnectorRuntimeCredentialV2) {
  const accessToken = readString(value.credentials.accessToken)
  if (
    value.provider !== KDOCS_CONNECTOR_PROVIDER ||
    value.authMethodId !== KDOCS_AUTH_METHOD_ID ||
    !value.connectorId ||
    !accessToken
  ) {
    throw new KdocsConnectorError('TOKEN_EXPIRED', 'WPS connector runtime credential is missing or invalid')
  }
  return { connectorId: value.connectorId, accessToken }
}

function requireWorkspaceFiles(context: IAgentMiddlewareContext): WorkspaceFilesApi {
  const files = context.runtime.capabilities?.get(WorkspaceFilesRuntimeCapability)
  if (!files) throw new KdocsConnectorError('WORKSPACE_FILES_UNAVAILABLE', 'Workspace Files is required for WPS file transfer')
  return files
}

function providerRange(value: ReadSheetRangeInput['range']) {
  return { rowFrom: value.row_from, rowTo: value.row_to, colFrom: value.col_from, colTo: value.col_to }
}

function boundingRange(cells: UpdateSheetCellsInput['cells']) {
  return {
    rowFrom: Math.min(...cells.map((cell) => cell.row)),
    rowTo: Math.max(...cells.map((cell) => cell.row)),
    colFrom: Math.min(...cells.map((cell) => cell.col)),
    colTo: Math.max(...cells.map((cell) => cell.col))
  }
}

function verifyCells(expected: UpdateSheetCellsInput['cells'], actual: ReturnType<typeof mapSheetRange>['cells']) {
  const actualByCoordinate = new Map(actual.map((cell) => [`${cell.row}:${cell.col}`, cell]))
  return expected.every((cell) => {
    const found = actualByCoordinate.get(`${cell.row}:${cell.col}`)
    const expectedValue = serializeCellValue(cell.value)
    return expectedValue === ''
      ? !found || found.value === undefined || found.value === ''
      : found?.value === expectedValue || found?.text === expectedValue || found?.formula === expectedValue
  })
}

function serializeCellValue(value: string | number | boolean | null) {
  if (value === null) return ''
  return typeof value === 'string' ? value : String(value)
}

function fileLocator(input: UploadFileInput['file']): WorkspaceFileLocator {
  return input.fileRef ?? input.workspacePath ?? input.filePath ?? input.path ?? ''
}

function validateUploadTarget(name: string, contentFormat: UploadFileInput['content_format']) {
  if (!/\.(doc|docx|xls|xlsx|ppt|pptx|pdf)$/i.test(name)) {
    throw new KdocsConnectorError('MCP_TOOL_FAILED', 'New WPS uploads require a DOC, DOCX, XLS, XLSX, PPT, PPTX, or PDF target name')
  }
  if (contentFormat === 'markdown' && !/\.(docx|pdf)$/i.test(name)) {
    throw new KdocsConnectorError('MCP_TOOL_FAILED', 'Markdown uploads require a DOCX or PDF target name')
  }
}

function compactRecord(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

function safeFileName(value: string) {
  const normalized = value.replace(/[\\/\0]/g, '_').replace(/^\.+$/, '_').trim()
  return (normalized || 'wps-file').slice(0, 240)
}

function safeSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80) || 'item'
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
