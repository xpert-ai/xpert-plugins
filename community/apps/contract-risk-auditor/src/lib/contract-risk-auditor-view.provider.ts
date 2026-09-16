import { Injectable } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type {
  I18nObject,
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
  IXpertViewExtensionProvider,
  renderRemoteReactIframeHtml,
  ViewExtensionProvider
} from '@xpert-ai/plugin-sdk'
import {
  AGENT_WORKBENCH_FIXED_SLOT,
  AGENT_WORKBENCH_MAIN_SLOT,
  CONTRACT_RISK_AUDITOR_FEATURE,
  CONTRACT_RISK_AUDITOR_PLUGIN_NAME,
  CONTRACT_RISK_AUDITOR_PROVIDER_KEY,
  CONTRACT_RISK_AUDITOR_REMOTE_ENTRY_KEY,
  CONTRACT_RISK_AUDITOR_VIEW_KEY,
  CONTRACT_RISK_ICON,
  PROJECT_DETAIL_SECTIONS_SLOT
} from './constants.js'
import { ContractRiskAuditorService } from './contract-risk-auditor.service.js'
import type { ContractAuditRecord, ContractAuditorScope } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

function scopeFromContext(context: XpertResolvedViewHostContext): ContractAuditorScope {
  return {
    userId: context.userId,
    tenantId: context.tenantId,
    organizationId: context.organizationId ?? undefined
  }
}

function success(en_US: string, zh_Hans: string, data?: unknown): XpertViewActionResult {
  return {
    success: true,
    message: text(en_US, zh_Hans),
    ...(data !== undefined ? { data } : {})
  }
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
  return {
    success: false,
    message: text(en_US, zh_Hans)
  }
}

async function readPackageFile(packageName: string, relativePath: string): Promise<string> {
  const packageJsonPath = requireFromHere.resolve(`${packageName}/package.json`)
  const packageDir = dirname(packageJsonPath)
  return readFile(join(packageDir, relativePath), 'utf8')
}

@Injectable()
@ViewExtensionProvider(CONTRACT_RISK_AUDITOR_PROVIDER_KEY)
export class ContractRiskAuditorViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: ContractRiskAuditorService) {}

  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === 'project' || context.hostType === 'agent'
  }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    const isAgentFixed = context.hostType === 'agent' && slot === AGENT_WORKBENCH_FIXED_SLOT
    const isAgentMain = context.hostType === 'agent' && slot === AGENT_WORKBENCH_MAIN_SLOT
    const isProjectDetail = context.hostType === 'project' && slot === PROJECT_DETAIL_SECTIONS_SLOT

    if (!isAgentFixed && !isAgentMain && !isProjectDetail) {
      return []
    }

    return [
      {
        key: CONTRACT_RISK_AUDITOR_VIEW_KEY,
        title: text('Contract Risk Auditor', '合同风险排查工作台'),
        description: text(
          'Identify contract risks, review harsh clauses, and apply anti-breach revisions.',
          '排查采购合同违约风险、霸王条款，并提供防违约修订建议与人机协同审核。'
        ),
        icon: {
          type: 'font',
          value: 'ri-shield-check-line'
        },
        hostType: context.hostType,
        slot,
        order: 25,
        refreshable: true,
        activation: {
          requiredFeatures: [CONTRACT_RISK_AUDITOR_FEATURE]
        },
        ...(isAgentFixed
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text('Contract Risk Auditor', '合同风险排查工作台'),
                  order: 25,
                  icon: {
                    type: 'svg',
                    value: CONTRACT_RISK_ICON,
                    alt: 'Contract Risk Auditor'
                  }
                }
              }
            }
          : {}),
        source: {
          provider: CONTRACT_RISK_AUDITOR_PROVIDER_KEY,
          plugin: CONTRACT_RISK_AUDITOR_PLUGIN_NAME
        },
        view: {
          type: 'remote_component',
          runtime: 'react',
          protocolVersion: 1,
          component: {
            isolation: 'iframe',
            entry: CONTRACT_RISK_AUDITOR_REMOTE_ENTRY_KEY
          },
          dataSource: {
            mode: 'platform'
          }
        },
        dataSource: {
          mode: 'platform'
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
    if (
      viewKey !== CONTRACT_RISK_AUDITOR_VIEW_KEY ||
      component.entry !== CONTRACT_RISK_AUDITOR_REMOTE_ENTRY_KEY
    ) {
      return {
        html: '<!doctype html><html><body>不支持的远程组件入口</body></html>',
        contentType: 'text/html; charset=utf-8'
      }
    }

    const appScript = await readFile(
      join(__dirname, 'remote-components', CONTRACT_RISK_AUDITOR_REMOTE_ENTRY_KEY, 'app.js'),
      'utf8'
    )
    const react = await readPackageFile('react', 'umd/react.production.min.js')
    const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

    return {
      html: renderRemoteReactIframeHtml({
        title: 'Contract Risk Auditor',
        lang: 'zh-Hans',
        reactUmd: react,
        reactDomUmd: reactDom,
        appScript
      }),
      contentType: 'text/html; charset=utf-8'
    }
  }

  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== CONTRACT_RISK_AUDITOR_VIEW_KEY) {
      return {}
    }

    const scope = scopeFromContext(context)
    const recordId = typeof query.parameters?.recordId === 'string' ? query.parameters.recordId : undefined
    const data = await this.service.getWorkbenchData(scope, { recordId })
    return data as unknown as XpertViewDataResult
  }

  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    if (viewKey !== CONTRACT_RISK_AUDITOR_VIEW_KEY) {
      return failure('Unsupported view', '不支持的视图')
    }

    const scope = scopeFromContext(context)
    const input = request.input || {}

    try {
      if (actionKey === 'refresh') {
        const data = await this.service.getWorkbenchData(scope)
        return success('View refreshed', '数据已刷新', data)
      }

      if (actionKey === 'audit_contract') {
        const id = typeof input.id === 'string' ? input.id : ''
        const content = typeof input.content === 'string' ? input.content : ''
        const title = typeof input.title === 'string' ? input.title : undefined

        if (!content.trim()) {
          return failure('Contract content is required', '请提供有效的合同条款文本')
        }
        const record = await this.service.auditContract(scope, id, content, title)
        return success('Audit completed', '合同合规审查完成', record)
      }

      if (actionKey === 'accept_revision') {
        const recordId = String(input.recordId || '')
        const riskId = String(input.riskId || '')
        const customRevision = typeof input.customRevision === 'string' ? input.customRevision : undefined
        const record = await this.service.acceptRevision(scope, recordId, riskId, customRevision)
        return success('Revision accepted', '已采纳修改建议并更新合同', record)
      }

      if (actionKey === 'ignore_risk') {
        const recordId = String(input.recordId || '')
        const riskId = String(input.riskId || '')
        const record = await this.service.ignoreRisk(scope, recordId, riskId)
        return success('Risk ignored', '已忽略该风险项', record)
      }

      if (actionKey === 'save_contract') {
        const record = input.record as ContractAuditRecord
        const saved = await this.service.saveContract(scope, record)
        return success('Contract saved', '合同审核单保存成功', saved)
      }

      if (actionKey === 'delete_record') {
        const recordId = String(input.recordId || '')
        await this.service.deleteRecord(scope, recordId)
        return success('Record deleted', '已删除该审查记录')
      }

      if (actionKey === 'clear_records') {
        await this.service.clearRecords(scope)
        return success('All records cleared', '已清空所有审查记录')
      }

      return failure('Unknown action', `未知的动作: ${actionKey}`)
    } catch (err: any) {
      return failure('Action execution failed', err?.message || '操作执行失败')
    }
  }
}
