import {
  ChecklistItem,
  getAgentMiddlewareNodes,
  IWFNMiddleware,
  TXpertTeamDraft,
  TXpertTeamNode
} from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
  CONNECTOR_MIDDLEWARE_NAME,
  LARK_CONNECTOR_PROVIDER,
  LARK_CLI_SKILL_MIDDLEWARE_NAME,
  LarkAuthMode
} from './lark-cli.types.js'

const SANDBOX_SHELL_MIDDLEWARE_NAME = 'SandboxShell'
const EventNameXpertValidate = 'xpert.validate'

type XpertDraftValidateEvent = {
  draft: TXpertTeamDraft
}

@Injectable()
export class LarkSkillValidator {
  @OnEvent(EventNameXpertValidate)
  handle(event: XpertDraftValidateEvent) {
    const draft = event.draft
    const workspaceId = resolveDraftWorkspaceId(draft)
    const sandboxEnabled = !!draft.team?.features?.sandbox?.enabled
    const agentNodes = draft.nodes.filter((node) => node.type === 'agent')
    const items: ChecklistItem[] = []

    agentNodes.forEach((agentNode) => {
      const middlewares = getAgentMiddlewareNodes(draft, agentNode.key).map((node) => node as TXpertTeamNode<'workflow'>)
      const middlewareEntities = middlewares.map((node) => ({
        node,
        entity: node.entity as IWFNMiddleware
      }))
      const hasSandboxShell = middlewareEntities.some(
        ({ entity }) => entity.provider === SANDBOX_SHELL_MIDDLEWARE_NAME
      )

      middlewareEntities
        .filter(({ entity }) => isLarkRuntimeMiddleware(entity))
        .forEach(({ node, entity }) => {
          const options = (entity.options ?? {}) as Record<string, unknown>
          const isConnectorMiddleware = entity.provider === CONNECTOR_MIDDLEWARE_NAME
          const isConnectorMode = isConnectorMiddleware || options.authMode === LarkAuthMode.CONNECTOR
          const label = isConnectorMiddleware ? 'Connector middleware' : 'LarkCLISkill'
          const zhLabel = isConnectorMiddleware ? '连接器中间件' : 'LarkCLISkill'

          if (!sandboxEnabled) {
            items.push({
              node: node.key,
              ruleCode: `${isConnectorMiddleware ? 'CONNECTOR_MIDDLEWARE' : 'LARK_CLI_SKILL'}_SANDBOX_DISABLED`,
              field: 'provider',
              value: entity.provider,
              level: 'warning',
              message: {
                en_US: `${label} requires the agent sandbox feature to be enabled.`,
                zh_Hans: `${zhLabel} 需要先启用智能体的 sandbox 功能。`
              }
            })
          }

          if (!hasSandboxShell) {
            items.push({
              node: node.key,
              ruleCode: `${isConnectorMiddleware ? 'CONNECTOR_MIDDLEWARE' : 'LARK_CLI_SKILL'}_SANDBOX_SHELL_MISSING`,
              field: 'provider',
              value: entity.provider,
              level: 'warning',
              message: {
                en_US: `${label} should be paired with the SandboxShell middleware on the same agent.`,
                zh_Hans: `${zhLabel} 需要与同一智能体上的 SandboxShell 中间件配合使用。`
              }
            })
          }

          if (isConnectorMode && !workspaceId) {
            items.push({
              node: node.key,
              ruleCode: `${isConnectorMiddleware ? 'CONNECTOR_MIDDLEWARE' : 'LARK_CLI_SKILL'}_CONNECTOR_WORKSPACE_MISSING`,
              field: isConnectorMiddleware ? 'options.provider' : 'options.authMode',
              value: entity.provider,
              level: 'warning',
              message: {
                en_US: `${label} requires a workspace context.`,
                zh_Hans: `${zhLabel} 需要工作区上下文。`
              }
            })
          }

        })
    })

    return items
  }
}

function isLarkRuntimeMiddleware(entity: IWFNMiddleware) {
  if (entity.provider === LARK_CLI_SKILL_MIDDLEWARE_NAME) {
    return true
  }
  if (entity.provider !== CONNECTOR_MIDDLEWARE_NAME) {
    return false
  }
  const options = (entity.options ?? {}) as Record<string, unknown>
  return options.provider === LARK_CONNECTOR_PROVIDER
}

function resolveDraftWorkspaceId(draft: TXpertTeamDraft) {
  const teamWorkspaceId = draft.team?.workspaceId
  if (typeof teamWorkspaceId === 'string' && teamWorkspaceId.trim()) {
    return teamWorkspaceId
  }

  const legacyWorkspaceId = (draft as { workspaceId?: unknown }).workspaceId
  return typeof legacyWorkspaceId === 'string' && legacyWorkspaceId.trim() ? legacyWorkspaceId : null
}
