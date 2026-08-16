import type { StructuredToolInterface } from '@langchain/core/tools'
import {
  BuiltinToolset,
  type RuntimeCapabilityResolver,
  type TBuiltinToolsetParams
} from '@xpert-ai/plugin-sdk'
import { ModelProviderBuiltinToolset } from '@xpert-ai/plugin-sdk/model-provider-toolset'
import { buildVeoTools } from './tools.js'
import {
  VeoToolsetName,
  VeoModelProvider,
  type VeoCredentials
} from './types.js'

export type VeoToolsetDescriptor = ConstructorParameters<typeof BuiltinToolset>[1]

export class VeoToolset extends ModelProviderBuiltinToolset<StructuredToolInterface, VeoCredentials> {
  constructor(
    toolset?: VeoToolsetDescriptor,
    runtimeCapabilities?: RuntimeCapabilityResolver,
    params?: TBuiltinToolsetParams
  ) {
    super(
      {
        toolsetProviderName: VeoToolsetName,
        modelProviderName: VeoModelProvider,
        authorizationScheme: 'ApiKey',
        invalidCredentialsMessage: 'Google Veo model provider credentials are invalid.',
        missingProviderMessage: 'Configure the Google Veo model provider before using Veo video tools.',
        missingWorkspaceMessage: 'Xpert workspace file runtime capability is required for Veo inputs and outputs.'
      },
      toolset,
      runtimeCapabilities,
      params
    )
  }

  override async initTools(): Promise<StructuredToolInterface[]> {
    const modelProvider = await this.getModelProviderRuntime()
    this.tools = buildVeoTools({
      workspaceFiles: this.getWorkspaceFiles(),
      workspaceScope: this.createWorkspaceScope(),
      managedQueue: requireManagedQueue(this.managedQueue),
      pluginScopeKey: this.pluginScopeKey,
      runtimeScope: {
        tenantId: this.tenantId,
        organizationId: this.organizationId,
        userId: this.params?.userId,
        projectId: this.params?.projectId,
        xpertId: this.xpertId,
        conversationId: this.params?.conversationId,
        agentKey: this.params?.agentKey,
        executionId: this.params?.executionId,
        providerScopeId: modelProvider.providerScopeId
      }
    })
    return this.tools
  }

}

function requireManagedQueue<T>(queue: T | undefined): T {
  if (!queue) throw new Error('Managed Queue is required for Google Veo generation.')
  return queue
}
