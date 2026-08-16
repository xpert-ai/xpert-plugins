import type { StructuredToolInterface } from '@langchain/core/tools'
import {
  BuiltinToolset,
  type RuntimeCapabilityResolver,
  type TBuiltinToolsetParams
} from '@xpert-ai/plugin-sdk'
import { ModelProviderBuiltinToolset } from '@xpert-ai/plugin-sdk/model-provider-toolset'
import { buildKlingTools } from './tools.js'
import {
  KlingVideo,
  KlingModelProvider,
  type KlingCredentials
} from './types.js'

export class KlingVideoToolset extends ModelProviderBuiltinToolset<StructuredToolInterface, KlingCredentials> {
  constructor(
    toolset?: KlingVideoToolsetDescriptor,
    runtimeCapabilities?: RuntimeCapabilityResolver,
    params?: TBuiltinToolsetParams
  ) {
    super(
      {
        toolsetProviderName: KlingVideo,
        modelProviderName: KlingModelProvider,
        authorizationScheme: 'Bearer',
        invalidCredentialsMessage: 'Kling model provider credentials are invalid.',
        missingProviderMessage: 'Configure the Kling model provider before using Kling video tools.',
        missingWorkspaceMessage: 'Xpert Workspace Files capability is required for Kling video generation.'
      },
      toolset,
      runtimeCapabilities,
      params
    )
  }

  override async initTools(): Promise<StructuredToolInterface[]> {
    const modelProvider = await this.getModelProviderRuntime()
    this.tools = buildKlingTools({
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
  if (!queue) throw new Error('Managed Queue is required for Kling video generation.')
  return queue
}

export type KlingVideoToolsetDescriptor = ConstructorParameters<typeof BuiltinToolset>[1]
