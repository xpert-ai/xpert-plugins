import type { StructuredToolInterface } from '@langchain/core/tools'
import type { IXpertToolset } from '@xpert-ai/contracts'
import {
  type RuntimeCapabilityResolver,
  type TBuiltinToolsetParams
} from '@xpert-ai/plugin-sdk'
import { ModelProviderBuiltinToolset } from '@xpert-ai/plugin-sdk/model-provider-toolset'
import { buildMiniMaxVideoTools } from './tools.js'
import { MiniMaxVideo, type MiniMaxVideoToolDependencies } from './types.js'
import type { MiniMaxCredentials } from '../types.js'
import { MiniMax } from '../types.js'

export class MiniMaxVideoToolset extends ModelProviderBuiltinToolset<StructuredToolInterface, MiniMaxCredentials> {
  constructor(
    toolset?: MiniMaxVideoToolsetDescriptor,
    runtimeCapabilities?: RuntimeCapabilityResolver,
    params?: TBuiltinToolsetParams
  ) {
    super(
      {
        toolsetProviderName: MiniMaxVideo,
        modelProviderName: MiniMax,
        authorizationScheme: 'Bearer',
        invalidCredentialsMessage: 'MiniMax model provider credentials are invalid.',
        missingProviderMessage: 'Configure the MiniMax model provider before using H3 video tools.',
        missingWorkspaceMessage: 'Xpert workspace file runtime capability is required for MiniMax video files.'
      },
      normalizeToolset(toolset),
      runtimeCapabilities,
      params
    )
  }

  override async initTools(): Promise<StructuredToolInterface[]> {
    const provider = await this.getModelProviderRuntime()
    const deps: MiniMaxVideoToolDependencies = {
      workspaceFiles: this.getWorkspaceFiles(),
      workspaceScope: this.createWorkspaceScope(),
      managedQueue: requireQueue(this.managedQueue),
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
        providerScopeId: provider.providerScopeId
      }
    }
    this.tools = buildMiniMaxVideoTools(deps)
    return this.tools
  }
}

export type MiniMaxVideoToolsetDescriptor = Omit<IXpertToolset, 'name' | 'credentials'> & {
  name?: string
  credentials?: MiniMaxCredentials
}

function normalizeToolset(toolset?: MiniMaxVideoToolsetDescriptor): IXpertToolset | undefined {
  return toolset ? { ...toolset, name: toolset.name ?? MiniMaxVideo } : undefined
}

function requireQueue<T>(queue: T | undefined): T {
  if (!queue) throw new Error('Managed Queue is required for MiniMax H3 video generation.')
  return queue
}
