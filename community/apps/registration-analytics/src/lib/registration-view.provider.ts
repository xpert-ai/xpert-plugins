import { Injectable } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type {
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import { IXpertViewExtensionProvider, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  FEATURE,
  ICON,
  PLUGIN_NAME,
  PROVIDER_KEY,
  REMOTE_ENTRY,
  WORKBENCH_VIEW_KEY
} from './constants'
import { RegistrationService } from './registration.service'
import type { RegistrationScope } from './types'

const saveQueryInputSchema = z.object({
  name: z.string().min(1),
  question: z.string().min(1),
  condition: z.record(z.unknown()).default({})
})

@Injectable()
@ViewExtensionProvider(PROVIDER_KEY)
export class RegistrationViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: RegistrationService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT)) {
      return []
    }
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    return [
      {
        key: WORKBENCH_VIEW_KEY,
        title: { en_US: 'Registration Console', zh_Hans: '报名问数台' },
        description: { en_US: 'Query and analyze registration records with AI.', zh_Hans: '用 AI 查询和分析报名数据。' },
        icon: { type: 'svg', value: ICON, alt: 'Registration Analytics' },
        hostType: 'agent',
        slot,
        order: fixed ? 30 : 25,
        refreshable: true,
        activation: {
          requiredFeatures: [FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: { en_US: 'Registration', zh_Hans: '报名问数' },
                  order: 30,
                  icon: { type: 'svg', value: ICON, alt: 'Registration Analytics' }
                }
              }
            }
          : {}),
        source: { provider: PROVIDER_KEY, plugin: PLUGIN_NAME },
        view: {
          type: 'remote_component',
          runtime: 'esm',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: REMOTE_ENTRY
          },
          dataSource: { mode: 'platform' }
        },
        dataSource: {
          mode: 'platform',
          querySchema: {
            supportsParameters: true,
            supportsSearch: true,
            supportsPagination: true,
            defaultPageSize: 25
          },
          cache: { enabled: false }
        },
        actions: [
          {
            key: 'refresh',
            label: { en_US: 'Refresh', zh_Hans: '刷新' },
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'refresh'
          },
          {
            key: 'save_query',
            label: { en_US: 'Save Query', zh_Hans: '保存查询' },
            icon: 'ri-save-3-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', title: { en_US: 'Name', zh_Hans: '名称' } },
                question: { type: 'string', title: { en_US: 'Question', zh_Hans: '问题' } },
                condition: { type: 'object', title: { en_US: 'Condition', zh_Hans: '条件' } }
              },
              required: ['name', 'question']
            }
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
    if (viewKey !== WORKBENCH_VIEW_KEY || component.entry !== REMOTE_ENTRY || component.isolation !== 'iframe') {
      return {
        html: '<!doctype html><html><body>Unsupported Registration component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const html = await readFile(join(__dirname, 'remote', 'registration-console.html'), 'utf8')
    return {
      html,
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    _query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== WORKBENCH_VIEW_KEY) {
      return {}
    }
    return this.service.getViewData(scopeFromContext(context))
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== WORKBENCH_VIEW_KEY) {
        return failure('Unsupported Registration view action', '不支持的报名视图操作')
      }
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') {
        return success('Registration view refreshed', '报名视图已刷新')
      }
      if (actionKey === 'save_query') {
        const parsed = saveQueryInputSchema.parse(request.input ?? {})
        const saved = await this.service.saveQuery(scope, {
          name: parsed.name,
          question: parsed.question,
          condition: parsed.condition as never
        })
        return {
          success: true,
          message: { en_US: 'Query saved', zh_Hans: '查询已保存' },
          refresh: true,
          data: saved
        }
      }
      if (actionKey === 'delete_saved_query') {
        const savedQueryId = getStringInput(request.input, 'savedQueryId') ?? request.targetId
        if (!savedQueryId) {
          return failure('Saved query id is required', '缺少常用查询 id')
        }
        const deleted = await this.service.deleteSavedQuery(scope, savedQueryId)
        return {
          success: true,
          message: { en_US: 'Query deleted', zh_Hans: '查询已删除' },
          refresh: true,
          data: deleted
        }
      }
      return failure('Unsupported Registration action', '不支持的报名操作')
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          message: { en_US: 'Invalid input', zh_Hans: '输入不合法' }
        }
      }
      const message = error instanceof Error && error.message ? error.message : 'Registration action failed'
      return {
        success: false,
        message: { en_US: message, zh_Hans: message }
      }
    }
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): RegistrationScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.hostId
  }
}

function getStringInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: true,
    message: { en_US, zh_Hans },
    refresh: true
  }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: false,
    message: { en_US, zh_Hans }
  }
}
