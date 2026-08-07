import type { StructuredToolInterface } from '@langchain/core/tools'
import { BuiltinToolset, type TBuiltinToolsetParams } from '@xpert-ai/plugin-sdk'
import { buildKlingTools } from './tools.js'
import {
  KlingVideo,
  KlingWorkspaceCapability,
  type KlingCredentials,
  type RuntimeCapabilityRegistryLike,
  type WorkspaceFilesApi
} from './types.js'

export class KlingVideoToolset extends BuiltinToolset<StructuredToolInterface, KlingCredentials> {
  constructor(
    toolset?: KlingVideoToolsetDescriptor,
    private readonly runtimeCapabilities?: RuntimeCapabilityRegistryLike,
    params?: TBuiltinToolsetParams
  ) {
    super(KlingVideo, toolset, params)
  }

  override async _validateCredentials(credentials: KlingCredentials): Promise<void> {
    if (!credentials?.api_key?.trim()) throw new Error('Kling API key is missing')
  }

  override async initTools(): Promise<StructuredToolInterface[]> {
    this.tools = buildKlingTools({
      credentials: this.getCredentials() ?? {},
      workspaceFiles: this.getWorkspaceFiles(),
      workspaceScope: this.createWorkspaceScope()
    })
    return this.tools
  }

  private getWorkspaceFiles() {
    const workspaceFiles = this.runtimeCapabilities?.get<WorkspaceFilesApi>(KlingWorkspaceCapability)
    if (!workspaceFiles) throw new Error('Xpert Workspace Files capability is required for Kling video generation.')
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

export type KlingVideoToolsetDescriptor = ConstructorParameters<
  typeof BuiltinToolset
>[1]

function normalizeOptionalString(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized || undefined
}
