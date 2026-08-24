import type { StructuredToolInterface, ToolSchemaBase } from '@langchain/core/tools'
import type { IXpertToolset } from '@xpert-ai/contracts'
import {
  type RuntimeCapabilityResolver,
  type TBuiltinToolsetParams
} from '@xpert-ai/plugin-sdk'
import { ModelProviderBuiltinToolset } from '@xpert-ai/plugin-sdk/model-provider-toolset'
import { buildSiliconflowVideoTools } from './tools.js'
import {
  SiliconflowVideo,
  type SiliconflowVideoCredentials
} from './types.js'
import { Siliconflow } from '../types.js'

export class SiliconflowVideoToolset extends ModelProviderBuiltinToolset<
  StructuredToolInterface,
  SiliconflowVideoCredentials
> {
  constructor(
    toolset?: SiliconflowVideoToolsetDescriptor,
    runtimeCapabilities?: RuntimeCapabilityResolver,
    params?: TBuiltinToolsetParams
  ) {
    super(
      {
        toolsetProviderName: SiliconflowVideo,
        modelProviderName: Siliconflow,
        authorizationScheme: 'Bearer',
        invalidCredentialsMessage: 'SiliconFlow model provider credentials are invalid.',
        missingProviderMessage: 'Configure the SiliconFlow model provider before using video tools.',
        missingWorkspaceMessage: 'Xpert workspace file runtime capability is required for SiliconFlow video outputs.'
      },
      normalizeToolset(toolset),
      runtimeCapabilities,
      params
    )
  }

  override async initTools(): Promise<StructuredToolInterface<ToolSchemaBase>[]> {
    const modelProvider = await this.getModelProviderRuntime()
    this.tools = buildSiliconflowVideoTools({
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
  if (!queue) throw new Error('Managed Queue is required for SiliconFlow video generation.')
  return queue
}

export type SiliconflowVideoToolsetDescriptor = Omit<IXpertToolset, 'name' | 'credentials'> & {
  name?: string
  credentials?: SiliconflowVideoCredentials
}

function normalizeToolset(toolset?: SiliconflowVideoToolsetDescriptor): IXpertToolset | undefined {
  if (!toolset) return undefined
  return {
    ...toolset,
    name: toolset.name ?? SiliconflowVideo
  }
}
