import { Injectable } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import type {
  I18nObject,
  IconDefinition,
  XpertExtensionViewManifest,
  XpertRemoteComponentEntry,
  XpertRemoteComponentViewSchema,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery,
  XpertViewScalar
} from '@xpert-ai/contracts'
import { IXpertViewExtensionProvider, renderRemoteReactIframeHtml, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  TRAVEL_FEATURE,
  TRAVEL_ICON,
  TRAVEL_PROVIDER_KEY,
  TRAVEL_REMOTE_ENTRY_KEY,
  TRAVEL_WORKBENCH_VIEW_KEY
} from './constants'
import { TravelItineraryService } from './travel-itinerary.service'
import type { TravelItinerary, TravelRequirements, TravelScope } from './types'

const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const icon = { type: 'svg', value: TRAVEL_ICON, alt: 'Travel itinerary' } satisfies IconDefinition
const requireFromHere = createRequire(__filename)

@Injectable()
@ViewExtensionProvider(TRAVEL_PROVIDER_KEY)
export class TravelItineraryViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: TravelItineraryService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'agent'
  }

  getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) return []
    const fixed = slot === AGENT_WORKBENCH_FIXED_SLOT
    return [
      {
        key: TRAVEL_WORKBENCH_VIEW_KEY,
        title: text('Travel Planner', '旅行方案工作台'),
        description: text('Review, edit, retry, and confirm saved AI travel plans.', '查看、编辑、重试并确认已保存的 AI 旅行方案。'),
        icon,
        hostType: 'agent',
        slot,
        order: fixed ? 35 : 30,
        refreshable: true,
        activation: { requiredFeatures: [TRAVEL_FEATURE] },
        ...(fixed
          ? { workbench: { fixed: true, menu: { enabled: true, label: text('Travel', '旅行'), order: 35, icon } } }
          : {}),
        source: { provider: TRAVEL_PROVIDER_KEY, plugin: '@xpert-ai/plugin-travel-itinerary' },
        parameters: [{ key: 'planId', label: text('Plan', '方案'), type: 'string' }],
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: { isolation: 'iframe', entry: TRAVEL_REMOTE_ENTRY_KEY },
          dataSource: { mode: 'platform' }
        },
        dataSource: {
          mode: 'platform',
          querySchema: { supportsPagination: false, supportsSearch: false, supportsSort: false, supportsSelection: true, supportsParameters: true },
          cache: { enabled: false }
        },
        actions: [
          { key: 'refresh', label: text('Refresh', '刷新'), icon: 'ri-refresh-line', placement: 'toolbar', actionType: 'refresh' },
          {
            key: 'create_plan',
            label: text('Create plan', '创建方案'),
            icon: 'ri-add-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: { type: 'object', properties: { requirements: { type: 'object' } }, required: ['requirements'] }
          },
          {
            key: 'confirm_plan',
            label: text('Confirm plan', '确认方案'),
            icon: 'ri-check-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: { type: 'object', properties: { planId: { type: 'string' } }, required: ['planId'] }
          },
          {
            key: 'retry_plan',
            label: text('Retry plan', '允许重试'),
            icon: 'ri-restart-line',
            placement: 'toolbar',
            actionType: 'invoke',
            inputSchema: { type: 'object', properties: { planId: { type: 'string' } }, required: ['planId'] }
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
    if (viewKey !== TRAVEL_WORKBENCH_VIEW_KEY || component.entry !== TRAVEL_REMOTE_ENTRY_KEY) {
      return { html: '<!doctype html><html><body>Unsupported travel component.</body></html>', contentType: 'text/html; charset=utf-8' }
    }
    const appScript = await readFile(join(__dirname, 'remote', 'travel-workbench.js'), 'utf8')
    const appCss = await readFile(join(__dirname, 'remote', 'travel-workbench.css'), 'utf8')
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({ title: 'Travel Planner', lang: 'zh-Hans', reactUmd, reactDomUmd, appScript, appCss }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    if (viewKey !== TRAVEL_WORKBENCH_VIEW_KEY) return {}
    const planId = getStringParameter(query.parameters, 'planId')
    return this.service.getViewData(scopeFromContext(context), planId)
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== TRAVEL_WORKBENCH_VIEW_KEY) return failure('Unsupported travel view', '不支持的旅行视图')
    try {
      const scope = scopeFromContext(context)
      if (actionKey === 'refresh') return { success: true, message: text('Travel view refreshed', '旅行视图已刷新'), refresh: true }
      if (actionKey === 'create_plan') {
        const requirements = getObjectInput(request.input, 'requirements') as TravelRequirements | undefined
        if (!requirements) return failure('Travel requirements are required', '缺少旅行需求')
        const plan = await this.service.createPlan(scope, requirements)
        return { success: true, message: text('Travel plan created', '旅行方案已创建'), refresh: true, data: plan }
      }
      if (actionKey === 'confirm_plan') {
        const planId = request.targetId ?? getStringInput(request.input, 'planId')
        if (!planId) return failure('Plan id is required', '缺少方案 id')
        const plan = await this.service.confirmPlan(scope, planId)
        return { success: true, message: text('Travel plan confirmed', '旅行方案已确认'), refresh: true, data: plan }
      }
      if (actionKey === 'retry_plan') {
        const planId = request.targetId ?? getStringInput(request.input, 'planId')
        if (!planId) return failure('Plan id is required', '缺少方案 id')
        const plan = await this.service.retryPlan(scope, planId)
        return { success: true, message: text('Travel plan is ready to retry', '旅行方案已恢复为可重试状态'), refresh: true, data: plan }
      }
      return failure('Unsupported travel action', '不支持的旅行操作')
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Travel action failed'
      return { success: false, message: text(message, message) }
    }
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): TravelScope {
  return { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId, assistantId: context.hostId }
}

function getStringParameter(parameters: Record<string, XpertViewScalar | XpertViewScalar[]> | undefined, key: string) {
  const value = parameters?.[key]
  const normalized = Array.isArray(value) ? value[0] : value
  return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined
}

function getStringInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getObjectInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: false, message: text(en_US, zh_Hans) }
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}
