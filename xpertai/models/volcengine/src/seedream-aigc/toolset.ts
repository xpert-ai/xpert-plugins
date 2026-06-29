import type { StructuredToolInterface, ToolSchemaBase } from '@langchain/core/tools'
import { BuiltinToolset, type TBuiltinToolsetParams } from '@xpert-ai/plugin-sdk'
import { buildSeedreamTools } from './tools.js'
import {
  SeedreamAigc,
  SeedreamAigcWorkspaceCapability,
  type RuntimeCapabilityRegistryLike,
  type SeedreamAigcCredentials,
  type WorkspaceFilesApi
} from './types.js'

export class SeedreamAigcToolset extends BuiltinToolset<StructuredToolInterface, SeedreamAigcCredentials> {
  constructor(
    toolset?: any,
    private readonly runtimeCapabilities?: RuntimeCapabilityRegistryLike,
    params?: TBuiltinToolsetParams
  ) {
    super(SeedreamAigc, toolset, params)
  }

  override async _validateCredentials(credentials: SeedreamAigcCredentials): Promise<void> {
    if (!credentials?.ark_api_key) {
      throw new Error('Ark API key is missing')
    }
  }

  override async initTools(): Promise<StructuredToolInterface<ToolSchemaBase, any, any>[]> {
    this.tools = buildSeedreamTools({
      credentials: this.getCredentials() ?? {},
      workspaceFiles: this.getWorkspaceFiles(),
      workspaceScope: this.createWorkspaceScope()
    })
    return this.tools
  }

  private getWorkspaceFiles() {
    const workspaceFiles = this.runtimeCapabilities?.get<WorkspaceFilesApi>(SeedreamAigcWorkspaceCapability)
    if (!workspaceFiles) {
      throw new Error('Xpert workspace file runtime capability is required for Seedream AIGC outputs.')
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
    if (!xpertId) {
      return undefined
    }
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

function normalizeOptionalString(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}
