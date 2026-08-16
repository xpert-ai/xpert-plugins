import type { StructuredToolInterface, ToolSchemaBase } from '@langchain/core/tools'
import type { IXpertToolset } from '@xpert-ai/contracts'
import {
  type RuntimeCapabilityResolver,
  type TBuiltinToolsetParams
} from '@xpert-ai/plugin-sdk'
import { ModelProviderBuiltinToolset } from '@xpert-ai/plugin-sdk/model-provider-toolset'
import { buildZhipuCogVideoTools } from './tools.js'
import {
  ZhipuCogVideo,
  type ZhipuCogVideoCredentials
} from './types.js'
import { ZhipuAIModelProvider } from '../types.js'

export class ZhipuCogVideoToolset extends ModelProviderBuiltinToolset<
  StructuredToolInterface,
  ZhipuCogVideoCredentials
> {
  constructor(
    toolset?: ZhipuCogVideoToolsetDescriptor,
    runtimeCapabilities?: RuntimeCapabilityResolver,
    params?: TBuiltinToolsetParams
  ) {
    super(
      {
        toolsetProviderName: ZhipuCogVideo,
        modelProviderName: ZhipuAIModelProvider,
        authorizationScheme: 'Bearer',
        invalidCredentialsMessage: 'ZhipuAI model provider credentials are invalid.',
        missingProviderMessage: 'Configure the ZhipuAI model provider before using CogVideo tools.',
        missingWorkspaceMessage: 'Xpert workspace file runtime capability is required for ZhipuAI video outputs.'
      },
      normalizeToolset(toolset),
      runtimeCapabilities,
      params
    )
  }

  override async initTools(): Promise<StructuredToolInterface<ToolSchemaBase>[]> {
    const modelProvider = await this.getModelProviderRuntime()
    this.tools = buildZhipuCogVideoTools({
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
  if (!queue) throw new Error('Managed Queue is required for ZhipuAI video generation.')
  return queue
}

export type ZhipuCogVideoToolsetDescriptor = Omit<IXpertToolset, 'name' | 'credentials'> & {
  name?: string
  credentials?: ZhipuCogVideoCredentials
}

function normalizeToolset(toolset?: ZhipuCogVideoToolsetDescriptor): IXpertToolset | undefined {
  if (!toolset) return undefined
  return {
    ...toolset,
    name: toolset.name ?? ZhipuCogVideo
  }
}
