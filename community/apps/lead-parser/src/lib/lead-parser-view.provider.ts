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
  XpertViewQuery
} from '@xpert-ai/contracts'
import { IXpertViewExtensionProvider, renderRemoteReactIframeHtml, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  LEAD_PARSER_ACTION_PARSE,
  LEAD_PARSER_ACTION_SAVE,
  LEAD_PARSER_FEATURE,
  LEAD_PARSER_PLUGIN,
  LEAD_PARSER_PROVIDER_KEY,
  LEAD_PARSER_REMOTE_ENTRY_KEY,
  LEAD_PARSER_WORKBENCH_VIEW_KEY
} from './constants'
import { LeadParserScope, LeadParserService, ParsedLead } from './lead-parser.service'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

const LEAD_PARSER_ICON: IconDefinition = {
  type: 'svg',
  value:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v4H4zM4 10h10v10H4zM16 14l4 4M20 14l-4 4"/></svg>',
  alt: 'Lead Parser'
}

@Injectable()
@ViewExtensionProvider(LEAD_PARSER_PROVIDER_KEY)
export class LeadParserViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: LeadParserService) {}

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
        key: LEAD_PARSER_WORKBENCH_VIEW_KEY,
        title: text('Lead Parser Workbench', '线索解析工作台'),
        description: text(
          'Parse raw sales lead text into structured fields and save them.',
          '把销售线索原文解析为姓名、公司、意向、预算等结构化字段并保存。'
        ),
        icon: LEAD_PARSER_ICON,
        hostType: 'agent',
        slot,
        order: fixed ? 40 : 35,
        refreshable: true,
        activation: {
          requiredFeatures: [LEAD_PARSER_FEATURE]
        },
        ...(fixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Lead Parser', '线索解析'),
                  order: 40,
                  icon: LEAD_PARSER_ICON
                }
              }
            }
          : {}),
        source: {
          provider: LEAD_PARSER_PROVIDER_KEY,
          plugin: LEAD_PARSER_PLUGIN
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: LEAD_PARSER_REMOTE_ENTRY_KEY
          },
          dataSource: {
            mode: 'platform'
          }
        },
        dataSource: {
          mode: 'platform',
          querySchema: {
            supportsPagination: false,
            supportsSearch: false,
            supportsSort: false,
            supportsSelection: false,
            supportsParameters: false
          },
          cache: {
            enabled: false
          }
        },
        actions: [
          {
            key: 'refresh',
            label: text('Refresh', '刷新'),
            icon: 'ri-refresh-line',
            placement: 'toolbar',
            actionType: 'refresh'
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
    if (viewKey !== LEAD_PARSER_WORKBENCH_VIEW_KEY || component.entry !== LEAD_PARSER_REMOTE_ENTRY_KEY) {
      return {
        html: '<!doctype html><html><body>Unsupported Lead Parser component.</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }
    const dir = join(__dirname, 'remote-components', LEAD_PARSER_REMOTE_ENTRY_KEY)
    const appScript = await readFile(join(dir, 'app.js'), 'utf8')
    const appCss = await readFile(join(dir, 'app.css'), 'utf8')
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
    return {
      html: renderRemoteReactIframeHtml({
        title: 'Lead Parser Workbench',
        lang: 'zh-Hans',
        reactUmd,
        reactDomUmd,
        appScript,
        appCss
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    _query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== LEAD_PARSER_WORKBENCH_VIEW_KEY) {
      return {}
    }
    const saved = await this.service.listSavedLeads(scopeFromContext(context))
    return {
      items: saved,
      total: saved.length
    }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== LEAD_PARSER_WORKBENCH_VIEW_KEY) {
        return failure('Unsupported view', '不支持的视图')
      }
      if (actionKey === 'refresh') {
        return success('Refreshed', '已刷新')
      }
      const scope = scopeFromContext(context)

      if (actionKey === LEAD_PARSER_ACTION_PARSE) {
        const rawText = getStringInput(request.input, 'text')
        if (!rawText) {
          return failure('text is required', '缺少线索文本')
        }
        const parsed = await this.service.parseText(scope, rawText)
        return {
          success: true,
          message: text('Lead parsed', '解析完成'),
          refresh: false,
          data: parsed
        }
      }

      if (actionKey === LEAD_PARSER_ACTION_SAVE) {
        const rawText = getStringInput(request.input, 'text')
        const lead = getLeadInput(request.input)
        if (!lead) {
          return failure('parsed lead is required', '缺少解析结果，请先执行解析')
        }
        const saved = await this.service.saveLead(scope, rawText ?? '', lead)
        return {
          success: true,
          message: text('Lead saved', '线索已保存'),
          refresh: true,
          data: saved
        }
      }

      return failure('Unsupported action', '不支持的操作')
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'Action failed'
      return failure(message, message)
    }
  }
}

function scopeFromContext(context: XpertResolvedViewHostContext): LeadParserScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId
  }
}

function getStringInput(input: Record<string, unknown> | null | undefined, key: string) {
  const value = input?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getLeadInput(input: Record<string, unknown> | null | undefined): ParsedLead | null {
  const value = input?.lead
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const lead = value as Record<string, unknown>
  return {
    name: typeof lead.name === 'string' ? lead.name : null,
    company: typeof lead.company === 'string' ? lead.company : null,
    intent: typeof lead.intent === 'string' ? lead.intent : null,
    budget: typeof lead.budget === 'number' ? lead.budget : null
  }
}

async function readPackageFile(packageName: string, relativePath: string) {
  const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
  return readFile(join(packageRoot, relativePath), 'utf8')
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: true, message: text(en_US, zh_Hans), refresh: true }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return { success: false, message: text(en_US, zh_Hans) }
}
