import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
import {
  renderRemoteReactIframeHtml,
  ViewExtensionProvider,
  type IXpertViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import {
  ACTION_KEYS,
  FEATURE,
  PLUGIN_NAME,
  PROVIDER_KEY,
  REMOTE_ENTRY,
  VIEW_KEY
} from './constants.js'
import {
  analyzeTicketInputSchema,
  confirmTicketInputSchema,
  deleteTicketInputSchema,
  retryTicketInputSchema,
  saveTicketInputSchema,
  SmartTicketError
} from './domain/contracts.js'
import { scopeFromView } from './scope.js'
import { TicketService } from './ticket.service.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(import.meta.url)

async function readPackageFile(packageName: string, relativePath: string): Promise<string> {
  try {
    const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
    return await readFile(join(packageRoot, relativePath), 'utf8')
  } catch {
    const peerRoots = [
      join(__dirname, '../../procurement-quote-comparison/node_modules', packageName),
      join(__dirname, '../../crm/node_modules', packageName),
      join(__dirname, '../../../../node_modules', packageName)
    ]
    for (const peerRoot of peerRoots) {
      try {
        return await readFile(join(peerRoot, relativePath), 'utf8')
      } catch {
        // continue
      }
    }
    return `/* ${packageName} mock runtime */`
  }
}

@Injectable()
@ViewExtensionProvider(PROVIDER_KEY)
export class TicketViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: TicketService) {}

  supports(context: XpertResolvedViewHostContext): boolean {
    return context.hostType === 'agent'
  }

  getViewManifests(
    context: XpertResolvedViewHostContext,
    slot: string
  ): XpertExtensionViewManifest[] {
    if (!this.supports(context)) return []
    if (!['agent.workbench.main', 'agent.workbench.fixed'].includes(slot)) return []

    return [
      {
        key: VIEW_KEY,
        title: {
          en_US: 'Smart Ticket',
          zh_Hans: '智能客诉工单'
        },
        description: {
          en_US:
            'AI-assisted customer feedback classification, sentiment detection, reply drafting and confirmation workbench.',
          zh_Hans:
            'AI 辅助客诉分析、情绪判定、回复拟定与确认归档工作台。'
        },
        icon: { type: 'font', value: 'ri-customer-service-2-line' },
        hostType: 'agent',
        slot,
        order: 35,
        refreshable: true,
        activation: { requiredFeatures: [FEATURE] },
        ...(slot === 'agent.workbench.fixed'
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: {
                    en_US: 'Smart Ticket',
                    zh_Hans: '智能客诉工单'
                  },
                  order: 35
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
          querySchema: { supportsParameters: true },
          cache: { enabled: false }
        },
        actions: ACTION_KEYS.map((key) => {
          const actionLabels: Record<string, { en_US: string; zh_Hans: string }> = {
            save_ticket: { en_US: 'Save Ticket', zh_Hans: '保存工单' },
            analyze_ticket: { en_US: 'AI Analyze', zh_Hans: 'AI智能分析' },
            confirm_ticket: { en_US: 'Confirm & Save', zh_Hans: '确认归档' },
            delete_ticket: { en_US: 'Delete Ticket', zh_Hans: '删除工单' },
            retry_ticket: { en_US: 'Retry Analysis', zh_Hans: '重试分析' }
          }
          return {
            key,
            label: actionLabels[key] ?? { en_US: key, zh_Hans: key },
            actionType: 'invoke' as const,
            placement: 'toolbar' as const
          }
        }),
        clientCommands: [
          {
            key: 'assistant.composer.append_references',
            label: { en_US: 'Reference to Chat', zh_Hans: '引用至聊天' }
          }
        ]
      }
    ]
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    _query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== VIEW_KEY) {
      return { item: null }
    }
    const scope = scopeFromView(context)
    const items = await this.service.listTickets(scope)
    return {
      item: {
        tickets: items,
        total: items.length
      }
    }
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== VIEW_KEY) {
      return {
        success: false,
        data: { code: 'INVALID_VIEW_KEY', message: `未知的视图 Key: ${viewKey}` }
      }
    }

    const scope = scopeFromView(context)

    try {
      switch (actionKey) {
        case 'analyze_ticket': {
          const input = analyzeTicketInputSchema.parse(request.input)
          const ticket = await this.service.analyzeAndDraft(scope, input)
          return { success: true, data: { ticket } }
        }
        case 'confirm_ticket': {
          const input = confirmTicketInputSchema.parse(request.input)
          const ticket = await this.service.confirmAndSave(scope, input)
          return { success: true, data: { ticket } }
        }
        case 'save_ticket': {
          const input = saveTicketInputSchema.parse(request.input)
          const ticket = await this.service.saveTicket(scope, input)
          return { success: true, data: { ticket } }
        }
        case 'delete_ticket': {
          const input = deleteTicketInputSchema.parse(request.input)
          const result = await this.service.deleteTicket(scope, input)
          return { success: true, data: result }
        }
        case 'retry_ticket': {
          const input = retryTicketInputSchema.parse(request.input)
          const ticket = await this.service.retryAnalysis(scope, input)
          return { success: true, data: { ticket } }
        }
        default:
          return {
            success: false,
            data: { code: 'UNKNOWN_ACTION', message: `未支持的动作: ${actionKey}` }
          }
      }
    } catch (error) {
      if (error instanceof SmartTicketError) {
        return {
          success: false,
          data: { code: error.code, message: error.message }
        }
      }
      if (error instanceof z.ZodError) {
        return {
          success: false,
          data: {
            code: 'VALIDATION_ERROR',
            message: error.errors
              .map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`)
              .join(', ')
          }
        }
      }
      return {
        success: false,
        data: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error)
        }
      }
    }
  }

  async getRemoteComponentEntry(
    _context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema['component']
  ): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== VIEW_KEY || component.entry !== REMOTE_ENTRY) {
      return {
        html: '<!doctype html><html><body>不支持的远程组件入口。</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const appScript = await readFile(
      join(__dirname, 'remote-components', REMOTE_ENTRY, 'app.js'),
      'utf8'
    )
    const reactUmd = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDomUmd = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: '智能客诉工单工作台',
        lang: 'zh-Hans',
        reactUmd,
        reactDomUmd,
        appScript
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }
}
