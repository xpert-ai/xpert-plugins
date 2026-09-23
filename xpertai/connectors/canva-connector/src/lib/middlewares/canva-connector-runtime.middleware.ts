import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  ConnectorRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  type AgentMiddleware,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { CANVA_ICON } from '../branding.js'
import { CANVA_CONNECTOR_PROVIDER, CANVA_RUNTIME_MIDDLEWARE_NAME } from '../constants.js'
import { CanvaConnectorError } from '../errors.js'
import { CanvaDesignService, runtimeFromCredential } from '../canva-design.service.js'
import { CanvaConfirmationStore } from '../tools/confirmation-store.js'
import { defineAgentTool } from '../tools/define-agent-tool.js'
import {
  connectionStatusSchema,
  designIdSchema,
  editingCancelSchema,
  editingCommitSchema,
  editingPerformSchema,
  editingStartSchema,
  exportSchema,
  generateDesignSchema,
  importSchema,
  jobStatusSchema,
  searchDesignsSchema
} from '../tools/schemas.js'

type RuntimeConfig = { provider?: string; connectorId?: string }
type HiddenMeta = TAgentMiddlewareMeta & { builtin: true }

@Injectable()
@AgentMiddlewareStrategy(CANVA_RUNTIME_MIDDLEWARE_NAME)
export class CanvaConnectorRuntimeMiddleware implements IAgentMiddlewareStrategy<RuntimeConfig> {
  readonly meta: HiddenMeta = {
    name: CANVA_RUNTIME_MIDDLEWARE_NAME,
    label: { en_US: 'Canva connector runtime', zh_Hans: 'Canva 可画连接器运行时' },
    description: {
      en_US: 'Bounded Canva design search, generation, editing and export tools.',
      zh_Hans: '受限的 Canva 设计搜索、生成、编辑和导出工具。'
    },
    icon: CANVA_ICON,
    builtin: true,
    configSchema: { type: 'object', properties: {} }
  }

  constructor(private readonly designs: CanvaDesignService, private readonly confirmations: CanvaConfirmationStore) {}

  createMiddleware(options: RuntimeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const resolveRuntime = async () => {
      if (options.provider && options.provider !== CANVA_CONNECTOR_PROVIDER)
        throw new CanvaConnectorError('CANVA_INPUT_INVALID', `Unsupported connector provider '${options.provider}'`)
      if (!context.workspaceId)
        throw new CanvaConnectorError('CANVA_CONNECTOR_UNAVAILABLE', 'Canva tools require an active workspace')
      const capability = context.runtime.capabilities?.get(ConnectorRuntimeCapability)
      if (!capability?.getConnectorCredential)
        throw new CanvaConnectorError('CANVA_CONNECTOR_UNAVAILABLE', 'Connector runtime capability is unavailable')
      const value = await capability.getConnectorCredential({
        workspaceId: context.workspaceId,
        provider: CANVA_CONNECTOR_PROVIDER,
        ...(options.connectorId ? { connectorId: options.connectorId } : {})
      })
      return runtimeFromCredential(value)
    }
    const call = async (handler: (runtime: Awaited<ReturnType<typeof resolveRuntime>>) => Promise<unknown>) =>
      handler(await resolveRuntime())
    const fields = (name: string, description: string, schema: z.ZodTypeAny, en: string, zh: string) => ({
      name,
      description,
      schema,
      verboseParsingErrors: true,
      metadata: { toolName: { en_US: en, zh_Hans: zh } }
    })

    const statusTool = defineAgentTool(async () => {
      const runtime = await resolveRuntime()
      return {
        status: 'active',
        connectorId: runtime.connectorId,
        provider: CANVA_CONNECTOR_PROVIDER,
        authMethodId: runtime.authMethodId,
        resource: runtime.resource,
        mode: runtime.mode
      }
    }, fields('canva_connection_status', 'Check Canva connection metadata without returning credentials.', connectionStatusSchema, 'Check Canva connection', '检查 Canva 连接'))
    const searchTool = defineAgentTool(
      async (input: z.output<typeof searchDesignsSchema>) =>
        call((runtime) =>
          this.designs.search(runtime, { ...input, page: input.page ?? 1, pageSize: input.pageSize ?? 20 })
        ),
      fields(
        'canva_search_designs',
        'Search the current user Canva designs with bounded pagination.',
        searchDesignsSchema,
        'Search Canva designs',
        '搜索 Canva 设计'
      )
    )
    const getTool = defineAgentTool(
      async (input: z.output<typeof designIdSchema>) =>
        call((runtime) => this.designs.getDesign(runtime, input.designId)),
      fields(
        'canva_get_design',
        'Get an allowlisted summary for one exact Canva design ID.',
        designIdSchema,
        'Get Canva design',
        '获取 Canva 设计'
      )
    )
    const pagesTool = defineAgentTool(
      async (input: z.output<typeof designIdSchema>) =>
        call((runtime) => this.designs.getPages(runtime, input.designId)),
      fields(
        'canva_get_design_pages',
        'List bounded pages for one exact Canva design ID.',
        designIdSchema,
        'List design pages',
        '列出设计页面'
      )
    )
    const contentTool = defineAgentTool(
      async (input: z.output<typeof designIdSchema>) =>
        call((runtime) => this.designs.getContent(runtime, input.designId)),
      fields(
        'canva_get_design_content',
        'Read a bounded text and element preview for one exact Canva design.',
        designIdSchema,
        'Read design content',
        '读取设计内容'
      )
    )
    const generateTool = defineAgentTool(
      async (input: z.output<typeof generateDesignSchema>) =>
        call((runtime) =>
          this.designs.generate(runtime, {
            ...input,
            prompt: input.prompt ?? '',
            designType: input.designType ?? 'poster',
            language: input.language ?? 'zh-CN'
          })
        ),
      fields(
        'canva_generate_design',
        'Generate bounded Canva design options from a text brief. Return each trusted Canva open URL so the user can choose and continue editing in Canva. Do not retry automatically after an AI quota error or an outcome-unknown timeout.',
        generateDesignSchema,
        'Generate Canva designs',
        '生成 Canva 设计'
      )
    )
    const startTool = defineAgentTool(
      async (input: z.output<typeof editingStartSchema>) =>
        call((runtime) => this.designs.startEditing(runtime, input.designId, input.operationId)),
      fields(
        'canva_start_editing_transaction',
        'Start an editing transaction for one exact Canva design.',
        editingStartSchema,
        'Start editing transaction',
        '开始编辑事务'
      )
    )
    const performTool = defineAgentTool(
      async (input: z.output<typeof editingPerformSchema>) =>
        call((runtime) =>
          this.designs.performEditing(runtime, input.designId, input.transactionId, input.operations, input.operationId)
        ),
      fields(
        'canva_perform_editing_operations',
        'Apply at most 20 narrow, typed operations to an active Canva editing transaction.',
        editingPerformSchema,
        'Apply editing operations',
        '执行编辑操作'
      )
    )
    const commitTool = defineAgentTool(async (input: z.output<typeof editingCommitSchema>) => {
      const runtime = await resolveRuntime()
      const payload = withoutConfirmation(input)
      if (!input.confirmation)
        return this.confirmations.request({
          userId: context.userId,
          connectorId: runtime.connectorId,
          operation: 'commit_editing_transaction',
          payload
        })
      this.confirmations.consume({
        handle: input.confirmation,
        userId: context.userId,
        connectorId: runtime.connectorId,
        operation: 'commit_editing_transaction',
        payload
      })
      return this.designs.commitEditing(runtime, input.designId, input.transactionId, input.operationId)
    }, fields('canva_commit_editing_transaction', 'Commit an editing transaction after explicit confirmation.', editingCommitSchema, 'Commit Canva edits', '提交 Canva 编辑'))
    const cancelTool = defineAgentTool(
      async (input: z.output<typeof editingCancelSchema>) =>
        call((runtime) => this.designs.cancelEditing(runtime, input.designId, input.transactionId)),
      fields(
        'canva_cancel_editing_transaction',
        'Cancel an active Canva editing transaction.',
        editingCancelSchema,
        'Cancel editing transaction',
        '取消编辑事务'
      )
    )
    const formatsTool = defineAgentTool(
      async (input: z.output<typeof designIdSchema>) =>
        call((runtime) => this.designs.formats(runtime, input.designId)),
      fields(
        'canva_get_export_formats',
        'List export formats available for one exact Canva design.',
        designIdSchema,
        'List export formats',
        '列出导出格式'
      )
    )
    const exportTool = defineAgentTool(async (input: z.output<typeof exportSchema>) => {
      const runtime = await resolveRuntime()
      const payload = withoutConfirmation(input)
      if (!input.confirmation)
        return this.confirmations.request({
          userId: context.userId,
          connectorId: runtime.connectorId,
          operation: 'export_design',
          payload
        })
      this.confirmations.consume({
        handle: input.confirmation,
        userId: context.userId,
        connectorId: runtime.connectorId,
        operation: 'export_design',
        payload
      })
      const result = await this.designs.export(runtime, input.designId, input.format, input.operationId)
      if (!result.downloadUrl)
        return { status: result.status, jobId: result.jobId, fileName: result.fileName, mimeType: result.mimeType }
      const files = requireWorkspaceFiles(context)
      const downloaded = await downloadExport(result.downloadUrl)
      await files.writeRuntimeBuffer({
        path: `exports/canva/${safeSegment(input.designId)}-${result.fileName}`,
        originalName: result.fileName,
        mimeType: result.mimeType,
        buffer: downloaded
      })
      return {
        status: 'completed',
        jobId: result.jobId,
        fileName: result.fileName,
        mimeType: result.mimeType,
        size: downloaded.length,
        sha256: createHash('sha256').update(downloaded).digest('hex')
      }
    }, fields('canva_export_design', 'Export one Canva design to a selected format and write the bytes to Workspace Files after explicit confirmation.', exportSchema, 'Export Canva design', '导出 Canva 设计'))
    const importTool = defineAgentTool(async (input: z.output<typeof importSchema>) => {
      const runtime = await resolveRuntime()
      const payload = withoutConfirmation(input)
      if (!input.confirmation)
        return this.confirmations.request({
          userId: context.userId,
          connectorId: runtime.connectorId,
          operation: 'import_design_from_url',
          payload
        })
      this.confirmations.consume({
        handle: input.confirmation,
        userId: context.userId,
        connectorId: runtime.connectorId,
        operation: 'import_design_from_url',
        payload
      })
      return this.designs.importFromUrl(runtime, input.url, input.operationId)
    }, fields('canva_import_design_from_url', 'Import a PDF or supported asset from one public HTTPS URL after explicit confirmation.', importSchema, 'Import Canva design', '导入 Canva 设计'))
    const jobTool = defineAgentTool(
      async (input: z.output<typeof jobStatusSchema>) =>
        call((runtime) => this.designs.jobStatus(runtime, input.jobId)),
      fields(
        'canva_get_job_status',
        'Poll one exact Canva export or import job.',
        jobStatusSchema,
        'Check Canva job',
        '查询 Canva 任务'
      )
    )
    return {
      name: CANVA_RUNTIME_MIDDLEWARE_NAME,
      tools: [
        statusTool,
        searchTool,
        getTool,
        pagesTool,
        contentTool,
        generateTool,
        startTool,
        performTool,
        commitTool,
        cancelTool,
        formatsTool,
        exportTool,
        importTool,
        jobTool
      ]
    }
  }
}

function withoutConfirmation(input: Record<string, unknown>) {
  const payload = { ...input }
  delete payload.confirmation
  return payload
}
function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}
function requireWorkspaceFiles(context: IAgentMiddlewareContext): WorkspaceFilesApi {
  const files = context.runtime.capabilities?.get(WorkspaceFilesRuntimeCapability)
  if (!files)
    throw new CanvaConnectorError(
      'CANVA_FILE_CAPABILITY_MISSING',
      'Workspace Files capability is required for Canva exports'
    )
  return files
}
async function downloadExport(url: string) {
  const response = await fetch(url, {
    redirect: 'error',
    headers: { Accept: '*/*', 'User-Agent': 'Xpert-Canva-Connector' }
  })
  if (!response.ok)
    throw new CanvaConnectorError(
      'CANVA_FILE_DOWNLOAD_FAILED',
      `Canva export download returned HTTP ${response.status}`,
      response.status >= 500
    )
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > 100 * 1024 * 1024)
    throw new CanvaConnectorError('CANVA_FILE_DOWNLOAD_FAILED', 'Canva export exceeds the allowed file size')
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > 100 * 1024 * 1024)
    throw new CanvaConnectorError('CANVA_FILE_DOWNLOAD_FAILED', 'Canva export exceeds the allowed file size')
  return buffer
}
