import type { StructuredToolInterface } from '@langchain/core/tools'
import type { IXpertToolset } from '@xpert-ai/contracts'
import {
  type RuntimeCapabilityResolver,
  type TBuiltinToolsetParams
} from '@xpert-ai/plugin-sdk'
import { ModelProviderBuiltinToolset } from '@xpert-ai/plugin-sdk/model-provider-toolset'
import { buildSeedreamTools } from './tools.js'
import {
  SeedreamAigc,
  type SeedreamAigcCredentials
} from './types.js'
import { Volcengine } from '../types.js'
import type { SeedreamImageResponse } from './types.js'

type SeedreamToolsetParams = TBuiltinToolsetParams
export type SeedreamAigcToolsetDescriptor = Omit<IXpertToolset, 'name' | 'credentials'> & {
  name?: string
  credentials?: SeedreamAigcCredentials
}

export class SeedreamAigcToolset extends ModelProviderBuiltinToolset<
  StructuredToolInterface,
  SeedreamAigcCredentials
> {
  constructor(
    toolset?: SeedreamAigcToolsetDescriptor,
    runtimeCapabilities?: RuntimeCapabilityResolver,
    protected override params?: SeedreamToolsetParams
  ) {
    super(
      {
        toolsetProviderName: SeedreamAigc,
        modelProviderName: Volcengine,
        authorizationScheme: 'Bearer',
        invalidCredentialsMessage: 'Volcengine model provider credentials are invalid.',
        missingProviderMessage: 'Configure the Volcengine model provider before using Seedream AIGC tools.',
        missingWorkspaceMessage: 'Xpert workspace file runtime capability is required for Seedream AIGC outputs.'
      },
      normalizeToolset(toolset),
      runtimeCapabilities,
      params
    )
  }

  override async initTools(): Promise<StructuredToolInterface[]> {
    const modelProvider = await this.getModelProviderRuntime()
    this.tools = buildSeedreamTools({
      credentials: {
        ark_api_key: this.getModelProviderCredential(modelProvider),
        api_endpoint_host: modelProvider.baseURL
      },
      workspaceFiles: this.getWorkspaceFiles(),
      workspaceScope: this.createWorkspaceScope(),
      createImageModelClient: (model) => this.createModelClient<Record<string, unknown>, SeedreamImageResponse>(model, 'image'),
      modelProvider,
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
  if (!queue) throw new Error('Managed Queue is required for Seedance video generation.')
  return queue
}

function normalizeToolset(toolset?: SeedreamAigcToolsetDescriptor): IXpertToolset | undefined {
  if (!toolset) return undefined
  return {
    ...toolset,
    name: toolset.name ?? SeedreamAigc
  }
}
