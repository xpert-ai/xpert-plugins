import type { StructuredToolInterface, ToolSchemaBase } from '@langchain/core/tools'
import { BuiltinToolset, type TBuiltinToolsetParams } from '@xpert-ai/plugin-sdk'
import { buildSiliconflowVideoTools } from './tools.js'
import {
  SiliconflowVideo,
  SiliconflowVideoWorkspaceCapability,
  type SiliconflowVideoCredentials,
  type SiliconflowWorkspaceScope,
  type WorkspaceFilesApi
} from './types.js'

export type RuntimeCapabilityRegistryLike = {
  get<T>(key: string): T | undefined
}

export class SiliconflowVideoToolset extends BuiltinToolset<StructuredToolInterface, SiliconflowVideoCredentials> {
  constructor(
    toolset?: any,
    private readonly runtimeCapabilities?: RuntimeCapabilityRegistryLike,
    params?: TBuiltinToolsetParams
  ) {
    super(SiliconflowVideo, toolset, params)
  }

  override async _validateCredentials(credentials: SiliconflowVideoCredentials): Promise<void> {
    if (!credentials.api_key?.trim()) throw new Error('SiliconFlow API key is missing')
  }

  override async initTools(): Promise<StructuredToolInterface<ToolSchemaBase>[]> {
    this.tools = buildSiliconflowVideoTools({
      credentials: this.getCredentials() || {},
      workspaceFiles: this.getWorkspaceFiles(),
      workspaceScope: this.createWorkspaceScope()
    })
    return this.tools
  }

  private getWorkspaceFiles() {
    const workspaceFiles = this.runtimeCapabilities?.get<WorkspaceFilesApi>(SiliconflowVideoWorkspaceCapability)
    if (!workspaceFiles) {
      throw new Error('Xpert workspace file runtime capability is required for SiliconFlow video outputs.')
    }
    return workspaceFiles
  }

  private createWorkspaceScope(): SiliconflowWorkspaceScope | undefined {
    const projectId = normalizeOptionalString(this.params?.projectId)
    if (projectId) {
      return {
        tenantId: normalizeOptionalString(this.params?.tenantId),
        userId: normalizeOptionalString(this.params?.userId),
        catalog: 'projects',
        scopeId: projectId,
        projectId
      }
    }

    const xpertId = normalizeOptionalString(this.xpertId)
    if (!xpertId) return undefined
    return {
      tenantId: normalizeOptionalString(this.params?.tenantId),
      userId: normalizeOptionalString(this.params?.userId),
      catalog: 'xperts',
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
