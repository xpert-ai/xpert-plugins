import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddlewareStrategy,
  ConnectorRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeCredentialV2,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  BAIDU_NETDISK_AUTH_METHOD_OAUTH,
  BAIDU_NETDISK_CONNECTOR_PROVIDER,
  BAIDU_NETDISK_RUNTIME_MIDDLEWARE_NAME
} from '../constants.js'
import { BAIDU_NETDISK_ICON } from '../branding.js'
import { BaiduNetdiskClient } from '../client/baidu-netdisk.client.js'
import { categoryName } from '../client/baidu-netdisk-mapper.js'
import type { BaiduNetdiskFile, BaiduNetdiskPage, BaiduNetdiskRuntimeCredential } from '../client/types.js'
import { BaiduNetdiskConnectorError, readString } from '../errors.js'
import { BaiduNetdiskConfigService } from '../plugin-config.js'
import { BaiduNetdiskOAuthConfigService } from '../connector/baidu-netdisk-oauth-config.service.js'
import { ensureAllowedPath, ensureFileName } from '../services/baidu-netdisk-path-policy.js'
import { defineAgentTool } from '../tools/define-agent-tool.js'
import {
  copyFilesSchema,
  createFolderSchema,
  deleteFilesSchema,
  emptySchema,
  getFileSchema,
  listFilesSchema,
  moveFilesSchema,
  renameFileSchema,
  searchFilesSchema,
  semanticSearchSchema,
  uploadTextSchema,
  uploadWorkspaceFileSchema,
  type CopyFilesInput,
  type CreateFolderInput,
  type DeleteFilesInput,
  type GetFileInput,
  type ListFilesInput,
  type MoveFilesInput,
  type RenameFileInput,
  type SearchFilesInput,
  type SemanticSearchInput,
  type UploadTextInput,
  type UploadWorkspaceFileInput
} from '../tools/schemas.js'

type RuntimeConfig = { connectorId?: string }
type HiddenMiddlewareMeta = TAgentMiddlewareMeta & { builtin: true }

@Injectable()
@AgentMiddlewareStrategy(BAIDU_NETDISK_RUNTIME_MIDDLEWARE_NAME)
export class BaiduNetdiskRuntimeMiddleware implements IAgentMiddlewareStrategy<RuntimeConfig> {
  readonly meta: HiddenMiddlewareMeta = {
    name: BAIDU_NETDISK_RUNTIME_MIDDLEWARE_NAME,
    label: { en_US: 'Baidu Netdisk connector runtime', zh_Hans: '百度网盘连接器运行时' },
    description: {
      en_US: 'Bounded Baidu Netdisk file and search tools for an authorized workspace.',
      zh_Hans: '为已授权工作区提供受限的百度网盘文件和搜索工具。'
    },
    icon: BAIDU_NETDISK_ICON,
    builtin: true,
    configSchema: { type: 'object', properties: {} }
  }

  constructor(
    private readonly client: BaiduNetdiskClient,
    private readonly config: BaiduNetdiskConfigService,
    private readonly oauthConfig: BaiduNetdiskOAuthConfigService
  ) {}

  createMiddleware(options: RuntimeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const connectorId = readString(options?.connectorId)
    const workspaceId = context.workspaceId
    const connectorRuntime = context.runtime?.capabilities?.get(ConnectorRuntimeCapability)
    const workspaceFiles = context.runtime?.capabilities?.get(WorkspaceFilesRuntimeCapability)
    const policy = this.config.config.pathPolicy
    const limits = this.config.config.limits

    const resolve = async (): Promise<BaiduNetdiskRuntimeCredential> => {
      if (!workspaceId) throw configurationError('Baidu Netdisk requires an active workspace.')
      if (!connectorRuntime?.getConnectorCredential)
        throw configurationError('Baidu Netdisk connector runtime capability is unavailable.')
      return runtimeCredentialFrom(
        await connectorRuntime.getConnectorCredential({
          workspaceId,
          provider: BAIDU_NETDISK_CONNECTOR_PROVIDER,
          ...(connectorId ? { connectorId } : {})
        })
      )
    }
    const connection = async () => {
      const credential = await resolve()
      const config = (await this.oauthConfig.resolve(credential.integrationId)).config
      return { credential, config }
    }
    const pathOf = (value: string) => ensureAllowedPath(value, policy)

    const statusTool = defineAgentTool(async () => {
      const { credential, config } = await connection()
      return {
        status: 'active',
        provider: BAIDU_NETDISK_CONNECTOR_PROVIDER,
        connectorId: credential.connectorId,
        scopes: config.scopes
      }
    }, fields('baidu_netdisk_connection_status', 'Check Baidu Netdisk connection metadata without returning credentials.', emptySchema, 'Check Baidu Netdisk connection', '检查百度网盘连接'))

    const quotaTool = defineAgentTool(async () => {
      const { credential, config } = await connection()
      return this.client.getQuota(credential, config)
    }, fields('baidu_netdisk_get_quota', 'Get used, total, and free Baidu Netdisk capacity.', emptySchema, 'Get Netdisk quota', '查询网盘容量'))

    const userInfoTool = defineAgentTool(async () => {
      const { credential, config } = await connection()
      const user = await this.client.getUserInfo(credential, config)
      return { ...(user.userId ? { userId: user.userId } : {}), ...(user.name ? { name: user.name } : {}) }
    }, fields('baidu_netdisk_get_user_info', 'Get allowlisted metadata for the authorized Baidu Netdisk account.', emptySchema, 'Get Netdisk user', '获取网盘用户信息'))

    const listTool = defineAgentTool(async (input: ListFilesInput) => {
      const value = listFilesSchema.parse(input)
      assertPageSize(value.page_size, limits.maxPageSize)
      const { credential, config } = await connection()
      return pageDto(
        await this.client.listFiles(credential, config, {
          path: pathOf(value.path),
          page: value.page,
          pageSize: value.page_size,
          category: value.category
        })
      )
    }, fields('baidu_netdisk_list_files', 'List bounded file summaries in one exact Baidu Netdisk directory. Use the returned path or fsid for follow-up calls.', listFilesSchema, 'List Netdisk files', '列出网盘文件'))

    const getTool = defineAgentTool(async (input: GetFileInput) => {
      const value = getFileSchema.parse(input)
      const { credential, config } = await connection()
      return { items: (await this.client.getFile(credential, config, value.fsids)).map(fileDto) }
    }, fields('baidu_netdisk_get_file', 'Get allowlisted metadata for exact Baidu Netdisk file IDs returned by another tool.', getFileSchema, 'Get Netdisk file', '获取网盘文件'))

    const searchTool = defineAgentTool(async (input: SearchFilesInput) => {
      const value = searchFilesSchema.parse(input)
      assertPageSize(value.page_size, limits.maxPageSize)
      const { credential, config } = await connection()
      return pageDto(
        await this.client.searchFiles(credential, config, {
          keyword: value.keyword,
          path: pathOf(value.path),
          page: value.page,
          pageSize: value.page_size
        })
      )
    }, fields('baidu_netdisk_search_files', 'Search Baidu Netdisk by filename keyword with bounded pagination.', searchFilesSchema, 'Search Netdisk files', '搜索网盘文件'))

    const semanticTool = defineAgentTool(async (input: SemanticSearchInput) => {
      const value = semanticSearchSchema.parse(input)
      assertPageSize(value.page_size, limits.maxPageSize)
      if (!this.config.config.capabilities.semanticSearch) throw capabilityDisabled('Semantic search')
      const { credential, config } = await connection()
      return pageDto(
        await this.client.semanticSearch(credential, config, {
          query: value.query,
          path: pathOf(value.path),
          page: value.page,
          pageSize: value.page_size,
          searchType: value.search_type,
          category: value.category
        })
      )
    }, fields('baidu_netdisk_semantic_search', 'Search indexed Baidu Netdisk filenames and supported document, image, video, or audio content using a natural-language query.', semanticSearchSchema, 'Semantic Netdisk search', '语义搜索网盘'))

    const mkdirTool = defineAgentTool(async (input: CreateFolderInput) => {
      const value = createFolderSchema.parse(input)
      const { credential, config } = await connection()
      return this.client.mkdir(credential, config, pathOf(value.path), rtype(value.on_conflict))
    }, fields('baidu_netdisk_create_folder', 'Create one Baidu Netdisk directory inside the allowed path root.', createFolderSchema, 'Create Netdisk folder', '创建网盘文件夹'))

    const copyTool = defineAgentTool(async (input: CopyFilesInput) => {
      const value = copyFilesSchema.parse(input)
      assertBatchSize(value.files.length, limits.maxBatchSize)
      const { credential, config } = await connection()
      return this.client.fileManager(
        credential,
        config,
        'copy',
        JSON.stringify(
          value.files.map((file) => ({
            path: pathOf(file.path),
            dest: pathOf(file.destination),
            ...(file.new_name ? { newname: ensureFileName(file.new_name) } : {})
          }))
        ),
        conflictPolicy(value.on_conflict)
      )
    }, fields('baidu_netdisk_copy_files', 'Copy bounded Baidu Netdisk files to exact destination directories.', copyFilesSchema, 'Copy Netdisk files', '复制网盘文件'))

    const moveTool = defineAgentTool(async (input: MoveFilesInput) => {
      const value = moveFilesSchema.parse(input)
      assertBatchSize(value.files.length, limits.maxBatchSize)
      const { credential, config } = await connection()
      return this.client.fileManager(
        credential,
        config,
        'move',
        JSON.stringify(
          value.files.map((file) => ({
            path: pathOf(file.path),
            dest: pathOf(file.destination),
            ...(file.new_name ? { newname: ensureFileName(file.new_name) } : {})
          }))
        ),
        conflictPolicy(value.on_conflict)
      )
    }, fields('baidu_netdisk_move_files', 'Move bounded Baidu Netdisk files to exact destination directories.', moveFilesSchema, 'Move Netdisk files', '移动网盘文件'))

    const renameTool = defineAgentTool(async (input: RenameFileInput) => {
      const value = renameFileSchema.parse(input)
      const { credential, config } = await connection()
      return this.client.fileManager(
        credential,
        config,
        'rename',
        JSON.stringify([{ path: pathOf(value.path), newname: ensureFileName(value.new_name) }]),
        conflictPolicy(value.on_conflict)
      )
    }, fields('baidu_netdisk_rename_file', 'Rename one exact Baidu Netdisk file inside the allowed path root.', renameFileSchema, 'Rename Netdisk file', '重命名网盘文件'))

    const deleteTool = defineAgentTool(async (input: DeleteFilesInput) => {
      const value = deleteFilesSchema.parse(input)
      assertBatchSize(value.paths.length, limits.maxBatchSize)
      if (!this.config.config.capabilities.delete) throw capabilityDisabled('Delete')
      const { credential, config } = await connection()
      return this.client.fileManager(credential, config, 'delete', JSON.stringify(value.paths.map(pathOf)), 'fail')
    }, fields('baidu_netdisk_delete_files', 'Delete exact Baidu Netdisk files only after explicit confirmed=true. This operation cannot be undone by the connector.', deleteFilesSchema, 'Delete Netdisk files', '删除网盘文件'))

    const uploadWorkspaceFileTool = defineAgentTool(async (input: UploadWorkspaceFileInput) => {
      const value = uploadWorkspaceFileSchema.parse(input)
      if (!this.config.config.capabilities.uploadWorkspaceFile) throw capabilityDisabled('Workspace file upload')
      if (!workspaceFiles?.resolveRuntimeReference || !workspaceFiles.readRuntimeBuffer)
        throw configurationError('Platform Workspace Files capability is required for Baidu Netdisk upload.')
      const locator = typeof value.file === 'string' ? value.file : value.file.fileRef ?? value.file
      const reference = await workspaceFiles.resolveRuntimeReference(locator)
      if (reference.size !== undefined && reference.size !== null && reference.size > limits.maxUploadBytes)
        throw new BaiduNetdiskConnectorError(
          'INVALID_ARGUMENT',
          `Workspace file exceeds the configured upload limit of ${limits.maxUploadBytes} bytes.`
        )
      const file = await workspaceFiles.readRuntimeBuffer(reference)
      if (!file.buffer.length || file.buffer.length > limits.maxUploadBytes)
        throw new BaiduNetdiskConnectorError(
          'INVALID_ARGUMENT',
          `Workspace file size must be between 1 and ${limits.maxUploadBytes} bytes.`
        )
      const fileName = ensureFileName(value.file_name ?? file.name)
      const directory = pathOf(value.destination_dir ?? policy.appFolder)
      const { credential, config } = await connection()
      return this.client.uploadBuffer(credential, config, {
        path: joinPath(directory, fileName),
        buffer: file.buffer,
        rtype: uploadRtype(value.on_conflict)
      })
    }, fields('baidu_netdisk_upload_workspace_file', 'Upload one Xpert Workspace file to the allowed Baidu Netdisk root using the verified three-step upload flow.', uploadWorkspaceFileSchema, 'Upload workspace file', '上传工作区文件'))

    const uploadTextTool = defineAgentTool(async (input: UploadTextInput) => {
      const value = uploadTextSchema.parse(input)
      if (!this.config.config.capabilities.uploadText) throw capabilityDisabled('Text upload')
      const buffer = Buffer.from(value.content, 'utf8')
      if (buffer.length > limits.maxUploadBytes)
        throw new BaiduNetdiskConnectorError(
          'INVALID_ARGUMENT',
          `Text content exceeds the configured upload limit of ${limits.maxUploadBytes} bytes.`
        )
      const directory = pathOf(value.destination_dir ?? policy.appFolder)
      const { credential, config } = await connection()
      return this.client.uploadBuffer(credential, config, {
        path: joinPath(directory, ensureFileName(value.file_name)),
        buffer,
        rtype: uploadRtype(value.on_conflict)
      })
    }, fields('baidu_netdisk_upload_text', 'Save bounded UTF-8 text as a file inside the allowed Baidu Netdisk root.', uploadTextSchema, 'Save text to Netdisk', '保存文本到网盘'))

    return {
      name: BAIDU_NETDISK_RUNTIME_MIDDLEWARE_NAME,
      tools: [
        statusTool,
        quotaTool,
        userInfoTool,
        listTool,
        getTool,
        searchTool,
        semanticTool,
        mkdirTool,
        copyTool,
        moveTool,
        renameTool,
        uploadWorkspaceFileTool,
        uploadTextTool,
        deleteTool
      ]
    }
  }
}

function fields(name: string, description: string, schema: z.ZodTypeAny, en_US: string, zh_Hans: string) {
  return { name, description, schema, verboseParsingErrors: true, metadata: { toolName: { en_US, zh_Hans } } }
}

function runtimeCredentialFrom(value: ConnectorRuntimeCredentialV2): BaiduNetdiskRuntimeCredential {
  const accessToken = readString(value.credentials.accessToken)
  if (
    value.provider !== BAIDU_NETDISK_CONNECTOR_PROVIDER ||
    value.authMethodId !== BAIDU_NETDISK_AUTH_METHOD_OAUTH ||
    !value.connectorId ||
    !accessToken
  )
    throw new BaiduNetdiskConnectorError('TOKEN_EXPIRED', 'Baidu Netdisk runtime credential is missing or invalid.')
  return {
    connectorId: value.connectorId,
    integrationId: readString(value.credentials.integrationId),
    accessToken,
    tokenType: readString(value.credentials.tokenType) ?? 'bearer'
  }
}

function pageDto(page: BaiduNetdiskPage) {
  return { ...page, items: page.items.map(fileDto) }
}

function fileDto(file: BaiduNetdiskFile) {
  return {
    fsid: file.fsid,
    path: file.path,
    name: file.name,
    type: file.isDirectory ? 'folder' : categoryName(file.category),
    ...(file.size !== undefined ? { size: file.size } : {}),
    ...(file.md5 ? { md5: file.md5 } : {}),
    ...(file.modifiedAt ? { modifiedAt: file.modifiedAt } : {}),
    ...(file.createdAt ? { createdAt: file.createdAt } : {}),
    ...(file.content ? { content: file.content } : {}),
    ...(file.abstract ? { abstract: file.abstract } : {})
  }
}

function rtype(value: 'fail' | 'rename' | 'overwrite'): number {
  return value === 'fail' ? 0 : value === 'overwrite' ? 4 : 1
}

function uploadRtype(value: 'fail' | 'rename' | 'overwrite'): number {
  return value === 'fail' ? 0 : value === 'overwrite' ? 2 : 3
}

function conflictPolicy(value: 'fail' | 'rename' | 'overwrite' | 'skip'): string {
  return value === 'rename' ? 'newcopy' : value
}

function joinPath(directory: string, fileName: string): string {
  return directory === '/' ? `/${fileName}` : `${directory}/${fileName}`
}

function configurationError(message: string): BaiduNetdiskConnectorError {
  return new BaiduNetdiskConnectorError('CONFIGURATION_INVALID', message)
}
function capabilityDisabled(name: string): BaiduNetdiskConnectorError {
  return new BaiduNetdiskConnectorError('CAPABILITY_DISABLED', `${name} is disabled for this Baidu Netdisk plugin.`)
}
function assertPageSize(value: number, maximum: number): void {
  if (value > maximum)
    throw new BaiduNetdiskConnectorError('INVALID_ARGUMENT', `Page size exceeds the configured limit of ${maximum}.`)
}
function assertBatchSize(value: number, maximum: number): void {
  if (value > maximum)
    throw new BaiduNetdiskConnectorError('INVALID_ARGUMENT', `Batch size exceeds the configured limit of ${maximum}.`)
}
