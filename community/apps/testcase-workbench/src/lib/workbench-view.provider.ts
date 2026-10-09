import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import type {
  XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertViewActionRequest,
  XpertViewActionResult, XpertViewDataResult, XpertViewQuery,
  XpertRemoteComponentViewSchema, XpertRemoteComponentEntry
} from '@xpert-ai/contracts'
import { ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import type { IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  ACTION_KEYS, APPEND_COMMAND, FEATURE, PLUGIN_NAME, PROVIDER_KEY, REMOTE_ENTRY, VIEW_KEY
} from './constants.js'
import { TestCaseWorkbenchService } from './workbench.service.js'
import { scopeFromView } from './scope.js'
import {
  confirmCasesSchema, discardCasesSchema, saveRequirementSchema, TestCaseError
} from './domain/contracts.js'

const LABELS: Record<string, [string, string]> = {
  save_requirement: ['Save requirement', '保存需求'],
  confirm_cases: ['Confirm cases', '确认用例'],
  discard_cases: ['Discard drafts', '丢弃草稿']
}

@Injectable()
@ViewExtensionProvider(PROVIDER_KEY)
export class TestCaseWorkbenchViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: TestCaseWorkbenchService) {}

  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }

  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench.main', 'agent.workbench.fixed'].includes(slot)) return []
    return [{
      key: VIEW_KEY,
      title: { en_US: 'Test cases', zh_Hans: '测试用例' },
      description: { en_US: 'Turn a requirement into draft test cases, confirm and persist them.', zh_Hans: '把需求交给 AI 生成用例草稿，人工确认后保存。' },
      icon: { type: 'font', value: 'ri-list-check-2' },
      hostType: 'agent', slot, order: 30, refreshable: false,
      activation: { requiredFeatures: [FEATURE] },
      ...(slot === 'agent.workbench.fixed' ? { workbench: { fixed: true, menu: {
        enabled: true, label: { en_US: 'Test cases', zh_Hans: '测试用例' }, order: 30 } } } : {}),
      source: { provider: PROVIDER_KEY, plugin: PLUGIN_NAME },
      view: { type: 'remote_component', runtime: 'esm', protocolVersion: 1,
        component: { isolation: 'iframe', entry: REMOTE_ENTRY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsParameters: false }, cache: { enabled: false } },
      actions: ACTION_KEYS.map(key => ({
        key, label: { en_US: LABELS[key][0], zh_Hans: LABELS[key][1] }, actionType: 'invoke', placement: 'toolbar'
      })),
      clientCommands: [{ key: APPEND_COMMAND, label: { en_US: 'Generate with AI', zh_Hans: 'AI 生成用例' } }]
    }]
  }

  private scope(context: XpertResolvedViewHostContext, viewKey: string) {
    if (viewKey !== VIEW_KEY) throw new TestCaseError('not_found')
    return scopeFromView(context)
  }

  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, _query: XpertViewQuery): Promise<XpertViewDataResult> {
    const scope = this.scope(context, viewKey)
    return { item: await this.service.getState(scope) }
  }

  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, actionKey: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    const scope = this.scope(context, viewKey)
    try {
      switch (actionKey) {
        case 'save_requirement': return { success: true, data: await this.service.saveRequirement(scope, saveRequirementSchema.parse(request.input)) }
        case 'confirm_cases': return { success: true, data: await this.service.confirmCases(scope, confirmCasesSchema.parse(request.input)) }
        case 'discard_cases': return { success: true, data: await this.service.discardCases(scope, discardCasesSchema.parse(request.input)) }
        default: throw new TestCaseError('not_found')
      }
    } catch (error) {
      if (error instanceof TestCaseError) return { success: false, data: { code: error.code, detail: error.detail } }
      if (error instanceof z.ZodError) return { success: false, data: { code: 'invalid_input' } }
      throw error
    }
  }

  async getRemoteComponentEntry(context: XpertResolvedViewHostContext, viewKey: string, component: XpertRemoteComponentViewSchema['component']): Promise<XpertRemoteComponentEntry> {
    this.scope(context, viewKey)
    if (component.entry !== REMOTE_ENTRY || component.isolation !== 'iframe') throw new TestCaseError('not_found')
    return { html: await readFile(new URL('../remote/testcase.html', import.meta.url), 'utf8'), contentType: 'text/html; charset=utf-8' }
  }
}
