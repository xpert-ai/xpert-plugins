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
    if (!this.xpertId) {
      return undefined
    }
    return {
      catalog: 'xperts' as const,
      scopeId: this.xpertId,
      xpertId: this.xpertId,
      isolateByUser: false
    }
  }
}
