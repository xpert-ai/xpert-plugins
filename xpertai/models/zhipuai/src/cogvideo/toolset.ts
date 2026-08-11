import type { StructuredToolInterface, ToolSchemaBase } from '@langchain/core/tools'
import { BuiltinToolset, type TBuiltinToolsetParams } from '@xpert-ai/plugin-sdk'
import { buildZhipuCogVideoTools } from './tools.js'
import {
  ZhipuCogVideo,
  ZhipuCogVideoWorkspaceCapability,
  type WorkspaceFilesApi,
  type ZhipuCogVideoCredentials
} from './types.js'

export type RuntimeCapabilityRegistryLike = {
  get<T>(key: string): T | undefined
}

export class ZhipuCogVideoToolset extends BuiltinToolset<StructuredToolInterface, ZhipuCogVideoCredentials> {
  constructor(
    toolset?: any,
    private readonly runtimeCapabilities?: RuntimeCapabilityRegistryLike,
    params?: TBuiltinToolsetParams
  ) {
    super(ZhipuCogVideo, toolset, params)
  }

  override async _validateCredentials(credentials: ZhipuCogVideoCredentials): Promise<void> {
    if (!credentials.api_key?.trim()) throw new Error('ZhipuAI API key is missing')
  }

  override async initTools(): Promise<StructuredToolInterface<ToolSchemaBase>[]> {
    this.tools = buildZhipuCogVideoTools({
      credentials: this.getCredentials() || {},
      workspaceFiles: this.getWorkspaceFiles(),
      workspaceScope: this.createWorkspaceScope()
    })
    return this.tools
  }

  private getWorkspaceFiles() {
    const workspaceFiles = this.runtimeCapabilities?.get<WorkspaceFilesApi>(ZhipuCogVideoWorkspaceCapability)
    if (!workspaceFiles) {
      throw new Error('Xpert workspace file runtime capability is required for ZhipuAI video outputs.')
    }
    return workspaceFiles
  }

  private createWorkspaceScope() {
    const projectId = normalizeOptionalString(this.params?.projectId)
    if (projectId) {
      return {
        tenantId: normalizeOptionalString(this.params?.tenantId),
        userId: normalizeOptionalString(this.params?.userId),
        catalog: 'projects' as const,
        scopeId: projectId,
        projectId
      }
    }

    const xpertId = normalizeOptionalString(this.xpertId)
    if (!xpertId) return undefined
    return {
      tenantId: normalizeOptionalString(this.params?.tenantId),
      userId: normalizeOptionalString(this.params?.userId),
      catalog: 'xperts' as const,
      scopeId: xpertId,
      xpertId,
      isolateByUser: false
    }
  }
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized || undefined
}
