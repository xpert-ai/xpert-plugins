import type { StructuredToolInterface } from '@langchain/core/tools'
import {
  BuiltinToolset,
  type TBuiltinToolsetParams
} from '@xpert-ai/plugin-sdk'
import { buildVeoTools } from './tools.js'
import {
  VeoToolsetName,
  VeoWorkspaceCapability,
  type RuntimeCapabilityRegistryLike,
  type VeoCredentials,
  type WorkspaceFilesApi
} from './types.js'

export type VeoToolsetDescriptor = ConstructorParameters<
  typeof BuiltinToolset
>[1]

export class VeoToolset extends BuiltinToolset<
  StructuredToolInterface,
  VeoCredentials
> {
  constructor(
    toolset?: VeoToolsetDescriptor,
    private readonly runtimeCapabilities?: RuntimeCapabilityRegistryLike,
    params?: TBuiltinToolsetParams
  ) {
    super(VeoToolsetName, toolset, params)
  }

  override async _validateCredentials(
    credentials: VeoCredentials
  ): Promise<void> {
    if (!credentials.gemini_api_key?.trim()) {
      throw new Error('Gemini API key is missing')
    }
  }

  override async initTools(): Promise<StructuredToolInterface[]> {
    this.tools = buildVeoTools({
      credentials: this.getCredentials() ?? {},
      workspaceFiles: this.getWorkspaceFiles(),
      workspaceScope: this.createWorkspaceScope()
    })
    return this.tools
  }

  private getWorkspaceFiles() {
    const workspaceFiles = this.runtimeCapabilities?.get<WorkspaceFilesApi>(
      VeoWorkspaceCapability
    )
    if (!workspaceFiles) {
      throw new Error(
        'Xpert workspace file runtime capability is required for Veo inputs and outputs.'
      )
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

function normalizeOptionalString(value: string | undefined | null) {
  const normalized = value?.trim()
  return normalized || undefined
}
