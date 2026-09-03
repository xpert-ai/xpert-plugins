import { Injectable } from '@nestjs/common'
import { CanvaConnectorError, requireString, readString } from './errors.js'
import {
  mapCandidateList,
  mapContent,
  mapDesign,
  mapDesignList,
  mapFormats,
  mapJob,
  mapPages,
  mapReceipt
} from './mcp/canva-mappers.js'
import { CanvaMcpClient } from './mcp/canva-mcp.client.js'
import { CanvaConnectClient } from './connect/canva-connect.client.js'

export type CanvaRuntimeCredential = {
  connectorId: string
  authMethodId: string
  accessToken: string
  resource: string
  mode: 'mcp-cn' | 'connect-global'
}
export type CanvaExportResult = {
  jobId: string | null
  status: string
  downloadUrl: string | null
  fileName: string
  mimeType: string
}

@Injectable()
export class CanvaDesignService {
  constructor(private readonly mcp: CanvaMcpClient, private readonly rest: CanvaConnectClient) {}

  async call(runtime: CanvaRuntimeCredential, operation: string, args: Record<string, unknown>, designId?: string) {
    if (runtime.mode === 'mcp-cn') {
      return this.mcp.callTool({
        connectorId: runtime.connectorId,
        accessToken: runtime.accessToken,
        resource: runtime.resource,
        name: operation as Parameters<CanvaMcpClient['callTool']>[0]['name'],
        arguments: args
      })
    }
    return this.rest.call({ accessToken: runtime.accessToken, operation, designId, arguments: args })
  }

  async search(runtime: CanvaRuntimeCredential, input: { query?: string; page: number; pageSize: number }) {
    return mapDesignList(
      await this.call(runtime, 'search-designs', {
        ...(input.query ? { query: input.query } : {}),
        page: input.page,
        page_size: input.pageSize
      }),
      input.page,
      input.pageSize
    )
  }
  async getDesign(runtime: CanvaRuntimeCredential, designId: string) {
    return mapDesign(await this.call(runtime, 'get-design', { design_id: designId }, designId))
  }
  async getPages(runtime: CanvaRuntimeCredential, designId: string) {
    return mapPages(await this.call(runtime, 'get-design-pages', { design_id: designId }, designId))
  }
  async getContent(runtime: CanvaRuntimeCredential, designId: string) {
    return mapContent(await this.call(runtime, 'get-design-content', { design_id: designId }, designId))
  }
  async generate(
    runtime: CanvaRuntimeCredential,
    input: { prompt: string; designType: 'poster' | 'presentation' | 'xiaohongshu' | 'resume'; language?: string }
  ) {
    return mapCandidateList(
      await this.call(runtime, 'generate-design', {
        prompt: input.prompt,
        design_type: input.designType,
        user_intent: input.prompt.slice(0, 255),
        ...(input.language ? { language: input.language } : {})
      })
    )
  }
  async startEditing(runtime: CanvaRuntimeCredential, designId: string, operationId: string) {
    return mapReceipt(
      await this.call(
        runtime,
        'start-editing-transaction',
        { design_id: designId, operation_id: operationId },
        designId
      ),
      'start_editing_transaction'
    )
  }
  async performEditing(
    runtime: CanvaRuntimeCredential,
    designId: string,
    transactionId: string,
    operations: readonly Record<string, unknown>[],
    operationId: string
  ) {
    return mapReceipt(
      await this.call(
        runtime,
        'perform-editing-operations',
        { design_id: designId, transaction_id: transactionId, operation_id: operationId, operations },
        designId
      ),
      'perform_editing_operations'
    )
  }
  async commitEditing(runtime: CanvaRuntimeCredential, designId: string, transactionId: string, operationId: string) {
    return mapReceipt(
      await this.call(
        runtime,
        'commit-editing-transaction',
        { design_id: designId, transaction_id: transactionId, operation_id: operationId },
        designId
      ),
      'commit_editing_transaction'
    )
  }
  async cancelEditing(runtime: CanvaRuntimeCredential, designId: string, transactionId: string) {
    return mapReceipt(
      await this.call(
        runtime,
        'cancel-editing-transaction',
        { design_id: designId, transaction_id: transactionId },
        designId
      ),
      'cancel_editing_transaction'
    )
  }
  async formats(runtime: CanvaRuntimeCredential, designId: string) {
    return mapFormats(await this.call(runtime, 'get-export-formats', { design_id: designId }, designId))
  }
  async export(
    runtime: CanvaRuntimeCredential,
    designId: string,
    format: string,
    operationId: string
  ): Promise<CanvaExportResult> {
    const payload = await this.call(
      runtime,
      'export-design',
      { design_id: designId, format, operation_id: operationId },
      designId
    )
    return {
      jobId: readString(payload.job_id ?? payload.jobId) ?? null,
      status: readString(payload.status) ?? 'accepted',
      downloadUrl: safeDownloadUrl(payload.download_url ?? payload.url),
      fileName: safeFileName(payload.file_name ?? payload.fileName, `${designId}.${format}`),
      mimeType: mimeType(format)
    }
  }
  async importFromUrl(runtime: CanvaRuntimeCredential, url: string, operationId: string) {
    return mapReceipt(
      await this.call(runtime, 'import-design-from-url', { url, operation_id: operationId }),
      'import_design_from_url'
    )
  }
  async jobStatus(runtime: CanvaRuntimeCredential, jobId: string) {
    return mapJob(await this.call(runtime, 'get-job-status', { job_id: jobId }))
  }
}

export function runtimeFromCredential(value: {
  connectorId: string
  authMethodId: string
  credentials: Record<string, unknown>
}): CanvaRuntimeCredential {
  const accessToken = requireString(value.credentials.accessToken, 'Canva access token is missing')
  const resource = requireString(value.credentials.resource, 'Canva token resource is missing')
  const mode = value.credentials.mode
  if (mode !== 'mcp-cn' && mode !== 'connect-global')
    throw new CanvaConnectorError('CANVA_CONFIGURATION_INVALID', 'Canva runtime mode is invalid')
  return { connectorId: value.connectorId, authMethodId: value.authMethodId, accessToken, resource, mode }
}

function safeDownloadUrl(value: unknown) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? value : null
  } catch {
    return null
  }
}
function safeFileName(value: unknown, fallback: string) {
  const candidate = readString(value)
    ?.replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 160)
  return candidate || fallback
}
function mimeType(format: string) {
  return format === 'pdf'
    ? 'application/pdf'
    : format === 'jpg' || format === 'jpeg'
    ? 'image/jpeg'
    : format === 'pptx'
    ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    : 'image/png'
}
