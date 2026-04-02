import {
  ChecklistItem,
  getAgentMiddlewareNodes,
  IWFNMiddleware,
  TXpertTeamDraft,
  TXpertTeamNode
} from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { VIEW_IMAGE_MIDDLEWARE_NAME } from './view-image.types.js'

const SANDBOX_SHELL_MIDDLEWARE_NAME = 'SandboxShell'
const EventNameXpertValidate = 'xpert.validate'

type XpertDraftValidateEvent = {
  draft: TXpertTeamDraft
}

@Injectable()
export class ViewImageValidator {
  @OnEvent(EventNameXpertValidate)
  handle(event: XpertDraftValidateEvent) {
    const draft = event.draft
    const sandboxEnabled = !!draft.team?.features?.sandbox?.enabled
    const agentNodes = draft.nodes.filter((node) => node.type === 'agent')
    const items: ChecklistItem[] = []

    agentNodes.forEach((agentNode) => {
      const middlewares = getAgentMiddlewareNodes(draft, agentNode.key).map(
        (node) => node as TXpertTeamNode<'workflow'>
      )
      const middlewareEntities = middlewares.map((node) => ({
        node,
        entity: node.entity as IWFNMiddleware
      }))
      const hasSandboxShell = middlewareEntities.some(
        ({ entity }) => entity.provider === SANDBOX_SHELL_MIDDLEWARE_NAME
      )

      middlewareEntities
        .filter(({ entity }) => entity.provider === VIEW_IMAGE_MIDDLEWARE_NAME)
        .forEach(({ node, entity }) => {
          if (!sandboxEnabled) {
            items.push({
              node: node.key,
              ruleCode: 'VIEW_IMAGE_SANDBOX_DISABLED',
              field: 'provider',
              value: entity.provider,
              level: 'warning',
              message: {
                en_US: 'ViewImageMiddleware requires the agent sandbox feature to be enabled.',
                zh_Hans: 'ViewImageMiddleware 需要先启用智能体的 sandbox 功能。'
              }
            })
          }

          if (!hasSandboxShell) {
            items.push({
              node: node.key,
              ruleCode: 'VIEW_IMAGE_SANDBOX_SHELL_MISSING',
              field: 'provider',
              value: entity.provider,
              level: 'warning',
              message: {
                en_US: 'ViewImageMiddleware should be paired with the SandboxShell middleware on the same agent.',
                zh_Hans: 'ViewImageMiddleware 需要与同一智能体上的 SandboxShell 中间件配合使用。'
              }
            })
          }
        })
    })

    return items
  }
}
