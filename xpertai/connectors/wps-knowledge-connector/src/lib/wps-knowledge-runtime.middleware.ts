import { Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  ConnectorRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type ConnectorRuntimeCredentialV2,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { WPS_KNOWLEDGE_ICON } from './branding.js'
import {
  WPS_KNOWLEDGE_AUTH_METHOD_ID,
  WPS_KNOWLEDGE_CONNECTOR_PROVIDER,
  WPS_KNOWLEDGE_RUNTIME_MIDDLEWARE_NAME
} from './constants.js'
import { WpsKnowledgeConnectorError } from './errors.js'
import { defineAgentTool } from './tools/define-agent-tool.js'
import {
  askSchema,
  connectionStatusSchema,
  getLibrarySchema,
  listFilesSchema,
  listLibrariesSchema,
  shareLinkSchema,
  type AskInput,
  type GetLibraryInput,
  type ListFilesInput,
  type ListLibrariesInput,
  type ShareLinkInput
} from './tools/schemas.js'
import { WpsKnowledgeService, type WpsKnowledgeRuntime } from './wps-knowledge.service.js'

type RuntimeConfig = { connectorId?: string }
type HiddenMeta = TAgentMiddlewareMeta & { builtin: true }
type ResolvedRuntime = WpsKnowledgeRuntime & {
  authMethodId: string
  connectorId: string
  statusCredential: ConnectorRuntimeCredentialV2
}

@Injectable()
@AgentMiddlewareStrategy(WPS_KNOWLEDGE_RUNTIME_MIDDLEWARE_NAME)
export class WpsKnowledgeRuntimeMiddleware implements IAgentMiddlewareStrategy<RuntimeConfig> {
  readonly meta: HiddenMeta = {
    name: WPS_KNOWLEDGE_RUNTIME_MIDDLEWARE_NAME,
    label: { en_US: 'WPS Knowledge connector runtime', zh_Hans: 'WPS 知识库连接器运行时' },
    description: {
      en_US: 'Bounded read-only WPS Knowledge SkillHub tools.',
      zh_Hans: '受限且只读的 WPS 知识库 SkillHub 工具。'
    },
    icon: WPS_KNOWLEDGE_ICON,
    builtin: true,
    configSchema: { type: 'object', properties: {} }
  }

  constructor(private readonly knowledge: WpsKnowledgeService) {}

  createMiddleware(options: RuntimeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const resolve = () => this.resolveRuntime(options, context)
    return {
      name: WPS_KNOWLEDGE_RUNTIME_MIDDLEWARE_NAME,
      tools: [
        defineAgentTool(async () => connectionStatus(await resolve()), {
          name: 'wps_knowledge_get_connection_status',
          description: 'Return the active WPS Knowledge SkillHub connection status and bounded profile. Never returns the access token.',
          schema: connectionStatusSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool(async (input: ListLibrariesInput) => this.knowledge.listLibraries(await resolve(), input), {
          name: 'wps_knowledge_list_libraries',
          description: 'List one bounded page of WPS knowledge libraries. Use returned kuids for detail, file-list, share-link, and ask tools.',
          schema: listLibrariesSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool(async (input: GetLibraryInput) => this.knowledge.getLibrary(await resolve(), input), {
          name: 'wps_knowledge_get_library',
          description: 'Get one WPS knowledge library by exact kuid or bounded name lookup.',
          schema: getLibrarySchema,
          verboseParsingErrors: true
        }),
        defineAgentTool(async (input: ListFilesInput) => this.knowledge.listFiles(await resolve(), input), {
          name: 'wps_knowledge_list_files',
          description: 'List one page of files and folders under an exact WPS knowledge library or folder kuid.',
          schema: listFilesSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool(async (input: AskInput) => this.knowledge.ask(await resolve(), input), {
          name: 'wps_knowledge_ask',
          description: 'Ask selected WPS knowledge libraries, or all accessible libraries when libraryKuids is omitted. Returns bounded cited output.',
          schema: askSchema,
          verboseParsingErrors: true
        }),
        defineAgentTool(async (input: ShareLinkInput) => this.knowledge.getShareLink(await resolve(), input.kuid), {
          name: 'wps_knowledge_get_share_link',
          description: 'Get the WPS web share link for one exact knowledge-library kuid.',
          schema: shareLinkSchema,
          verboseParsingErrors: true
        })
      ]
    }
  }

  private async resolveRuntime(options: RuntimeConfig, context: IAgentMiddlewareContext): Promise<ResolvedRuntime> {
    if (!context.workspaceId) {
      throw new WpsKnowledgeConnectorError('CONNECTOR_UNAVAILABLE', 'WPS Knowledge tools require an active workspace.')
    }
    const connectorRuntime = context.runtime.capabilities?.get(ConnectorRuntimeCapability) as ConnectorRuntimeApi | undefined
    if (!connectorRuntime?.getConnectorCredential) {
      throw new WpsKnowledgeConnectorError('CONNECTOR_UNAVAILABLE', 'Connector runtime capability is unavailable.')
    }
    const credential = await connectorRuntime.getConnectorCredential({
      workspaceId: context.workspaceId,
      provider: WPS_KNOWLEDGE_CONNECTOR_PROVIDER,
      ...(options.connectorId ? { connectorId: options.connectorId } : {})
    })
    const value = readCredential(credential)
    return {
      credential: { accessToken: value.accessToken },
      authMethodId: value.authMethodId,
      connectorId: value.connectorId,
      statusCredential: credential
    }
  }
}

function readCredential(value: ConnectorRuntimeCredentialV2): {
  accessToken: string
  authMethodId: string
  connectorId: string
} {
  const accessToken = typeof value.credentials.accessToken === 'string' ? value.credentials.accessToken.trim() : ''
  if (
    value.provider !== WPS_KNOWLEDGE_CONNECTOR_PROVIDER ||
    value.authMethodId !== WPS_KNOWLEDGE_AUTH_METHOD_ID ||
    !accessToken ||
    !value.connectorId
  ) {
    throw new WpsKnowledgeConnectorError('TOKEN_EXPIRED', 'WPS Knowledge runtime credential is missing or invalid.')
  }
  return { accessToken, authMethodId: value.authMethodId, connectorId: value.connectorId }
}

function connectionStatus(value: ResolvedRuntime) {
  return {
    status: 'active' as const,
    connectorId: value.connectorId,
    provider: WPS_KNOWLEDGE_CONNECTOR_PROVIDER,
    authMethodId: value.authMethodId,
    expiresAt: value.statusCredential.expiresAt ?? null,
    profile: value.statusCredential.profile ? {
      name: typeof value.statusCredential.profile.name === 'string'
        ? value.statusCredential.profile.name.slice(0, 240)
        : null
    } : null
  }
}
