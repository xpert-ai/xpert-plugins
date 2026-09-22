import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import type {
  XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewActionResult,
  XpertViewDataResult, XpertViewQuery, XpertRemoteComponentViewSchema, XpertRemoteComponentEntry
} from '@xpert-ai/contracts'
import { ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import type { IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { ContractServiceClient } from './client.js'
import { ACTION_KEYS, FEATURE, PLUGIN_NAME, PROVIDER_KEY, REMOTE_ENTRY, VIEW_KEY } from './constants.js'
import { ContractReviewError, publicError, querySchema } from './contracts.js'
import { scopeFromView } from './scope.js'

@Injectable()
@ViewExtensionProvider(PROVIDER_KEY)
export class ContractReviewViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly client: ContractServiceClient) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench.main', 'agent.workbench.fixed'].includes(slot)) return []
    const labels = [['Save corrections', '保存修订'], ['Confirm information', '确认资料'], ['Copyable summary', '生成摘要'], ['Save original text', '保存合同原文']]
    return [{
      key: VIEW_KEY, title: { en_US: 'Contract review', zh_Hans: '合同资料核对' },
      description: { en_US: 'Review extracted information against original contract text.', zh_Hans: '对照原文核对字段、修订依据并人工确认。' },
      icon: { type: 'font', value: 'ri-file-text-line' }, hostType: 'agent', slot, order: 30,
      refreshable: true, activation: { requiredFeatures: [FEATURE] },
      ...(slot === 'agent.workbench.fixed' ? { workbench: { fixed: true, menu: { enabled: true, label: { en_US: 'Contracts', zh_Hans: '合同资料' }, order: 30 } } } : {}),
      source: { provider: PROVIDER_KEY, plugin: PLUGIN_NAME },
      view: { type: 'remote_component', runtime: 'esm', protocolVersion: 1, component: { isolation: 'iframe', entry: REMOTE_ENTRY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsParameters: true }, cache: { enabled: false } },
      actions: ACTION_KEYS.map((key, index) => ({ key, label: { en_US: labels[index][0], zh_Hans: labels[index][1] }, actionType: 'invoke', placement: 'toolbar' })),
      clientCommands: [{ key: 'assistant.chat.send_message', label: { en_US: 'Send to assistant', zh_Hans: '发送给助手' } }]
    }]
  }
  private scope(context: XpertResolvedViewHostContext, viewKey: string) {
    if (viewKey !== VIEW_KEY) throw new ContractReviewError('NOT_FOUND')
    return scopeFromView(context)
  }
  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    try {
      const scope = this.scope(context, viewKey)
      const parameters = querySchema.parse(query.parameters ?? {})
      const [list, selected] = await Promise.all([
        this.client.list(scope), parameters.contractId ? this.client.get(scope, { contractId: parameters.contractId }) : Promise.resolve(null)
      ])
      return { items: list.items, meta: { selected } }
    } catch (error) { throw new ContractReviewError(publicError(error).code) }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, actionKey: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    try {
      const scope = this.scope(context, viewKey)
      switch (actionKey) {
        case 'intake_contract': return { success: true, data: await this.client.intake(scope, request.input), refresh: true }
        case 'update_contract': return { success: true, data: await this.client.update(scope, request.input), refresh: true }
        case 'confirm_contract': return { success: true, data: await this.client.confirm(scope, request.input), refresh: true }
        case 'get_summary': return { success: true, data: await this.client.summary(scope, request.input) }
        default: throw new ContractReviewError('INVALID_INPUT')
      }
    } catch (error) { return { success: false, data: publicError(error) } }
  }
  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, viewKey: string, component: XpertRemoteComponentViewSchema['component']): Promise<XpertRemoteComponentEntry> {
    this.scope(context, viewKey)
    if (component.entry !== REMOTE_ENTRY || component.isolation !== 'iframe') throw new ContractReviewError('NOT_FOUND')
    return { html: await readFile(new URL('../remote/contract-review.html', import.meta.url), 'utf8'), contentType: 'text/html; charset=utf-8' }
  }
}
