import { Inject, Injectable, Optional } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  I18nObject,
  JsonSchemaObjectType,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery,
  XpertViewScalar,
  type IconDefinition
} from '@xpert-ai/contracts'
import {
  AgentMiddlewareRuntimeCapabilityRegistry,
  IXpertViewExtensionProvider,
  ViewExtensionProvider,
  XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  ONTOAGENT_FEATURE,
  ONTOAGENT_MIDDLEWARE_TOOL_NAMES,
  ONTOAGENT_PLUGIN_NAME,
  ONTOAGENT_PROVIDER_KEY,
  ONTOAGENT_REMOTE_ENTRY_KEY,
  ONTOAGENT_VIEW_KEY
} from './constants.js'
import { OntoAgentService } from './ontoagent.service.js'
import type { OntoAgentScope } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const VIEW_ICON = { type: 'font', value: 'ri-node-tree' } satisfies IconDefinition

const reviewInputSchema = {
  type: 'object',
  properties: {
    reviewComment: {
      type: 'string',
      title: text('Review Comment', '审核备注')
    }
  }
} satisfies JsonSchemaObjectType

@Injectable()
@ViewExtensionProvider(ONTOAGENT_PROVIDER_KEY)
export class OntoAgentViewProvider implements IXpertViewExtensionProvider {
  constructor(
    private readonly service: OntoAgentService,
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: AgentMiddlewareRuntimeCapabilityRegistry
  ) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) {
      return []
    }

    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    return [
      {
        key: ONTOAGENT_VIEW_KEY,
        title: text('OntoAgent Governed Workbench', 'OntoAgent 受治理工作台'),
        description: text(
          'Sync certified Auto-Ontology snapshots, inspect mirror versions and exclusions, and review evidence-backed answers.',
          '同步认证快照、查看镜像版本与排除项，并审核带版本证据的回答。'
        ),
        icon: VIEW_ICON,
        hostType: 'agent',
        slot,
        order: fixed ? 30 : 20,
        refreshable: true,
        activation: {
          requiredFeatures: [ONTOAGENT_FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('OntoAgent', 'OntoAgent'),
                  order: 30,
                  icon: VIEW_ICON
                }
              }
            }
          : {}),
        source: {
          provider: ONTOAGENT_PROVIDER_KEY,
          plugin: ONTOAGENT_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: ONTOAGENT_REMOTE_ENTRY_KEY
          },
          dataSource: {
            mode: 'platform'
          }
        },
        dataSource: {
          mode: 'platform',
          querySchema: {
            supportsPagination: true,
            supportsSearch: true,
            supportsSelection: true,
            supportsParameters: true,
            defaultPageSize: 20
          },
          cache: {
            enabled: false
          }
        },
        hostEvents: {
          subscriptions: [
            {
              key: 'ontoagent-tool-completed',
              event: 'assistant.tool.completed',
              filter: {
                sources: ['chatkit'],
                toolNames: [...ONTOAGENT_MIDDLEWARE_TOOL_NAMES]
              },
              action: {
                type: 'forward',
                debounceMs: 1000
              }
            }
          ]
        },
        actions: [
          {
            key: 'refresh',
            label: text('Refresh', '刷新'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'refresh'
          },
          {
            key: 'sync_now',
            label: text('Sync / Retry', '同步 / 重试'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'invoke'
          },
          {
            key: 'confirm_answer',
            label: text('Confirm', '确认采纳'),
            icon: 'ri-check-line',
            placement: 'row',
            actionType: 'invoke',
            inputSchema: reviewInputSchema
          },
          {
            key: 'reject_answer',
            label: text('Reject', '拒绝'),
            icon: 'ri-close-line',
            placement: 'row',
            actionType: 'invoke',
            inputSchema: reviewInputSchema
          }
        ],
        clientCommands: [
          {
            key: 'assistant.chat.send_message',
            label: text('Send to Assistant Chat', '发送到 Assistant 对话')
          }
        ]
      }
    ]
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== ONTOAGENT_VIEW_KEY || component.entry !== ONTOAGENT_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const html = await readFile(join(__dirname, '..', 'remote', 'governed-workbench.html'), 'utf8').catch(() => null)
    return {
      html: html ?? '<!doctype html><html><body>OntoAgent remote view is not built yet. Run `pnpm build` in community/apps/ontoagent.</body></html>',
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== ONTOAGENT_VIEW_KEY) {
      return {}
    }
    return this.service.getViewData(scopeFromContext(context), {
      viewTab: getStringParameter(query.parameters, 'viewTab'),
      status: getStringParameter(query.parameters, 'status') as 'proposed' | 'confirmed' | 'rejected' | undefined,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize
    })
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== ONTOAGENT_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') {
        return success('OntoAgent view refreshed', 'OntoAgent 视图已刷新')
      }
      if (actionKey === 'sync_now') {
        const data = await this.service.syncNow(scope)
        return { ...success('Auto-Ontology sync finished', 'Auto-Ontology 同步已完成'), data }
      }
      if (actionKey === 'confirm_answer') {
        const data = await this.service.reviewAnswer(scope, requireTargetId(request), 'confirmed', getComment(request))
        return { ...success('Answer confirmed', '回答已确认采纳'), data }
      }
      if (actionKey === 'reject_answer') {
        const data = await this.service.reviewAnswer(scope, requireTargetId(request), 'rejected', getComment(request))
        return { ...success('Answer rejected', '回答已拒绝'), data }
      }
      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'OntoAgent action failed'
      return { success: false, message: text(message, message) }
    }
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): OntoAgentScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.hostId
  }
}

function requireTargetId(request: XpertViewActionRequest) {
  const targetId = request.targetId?.trim()
  if (!targetId) {
    throw new Error('answer_record_required')
  }
  return targetId
}

function getComment(request: XpertViewActionRequest) {
  const value = request.input?.['reviewComment']
  return typeof value === 'string' ? value : undefined
}

function getStringParameter(parameters: Record<string, XpertViewScalar | XpertViewScalar[]> | undefined, key: string) {
  const value = parameters?.[key]
  const normalized = Array.isArray(value) ? value[0] : value
  return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: true, message: text(en_US, zh_Hans), refresh: true }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: false, message: text(en_US, zh_Hans) }
}
