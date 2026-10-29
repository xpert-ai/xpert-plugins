import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { I18nObject, XpertExtensionViewManifest, XpertRemoteComponentEntry, XpertRemoteComponentViewSchema, XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewActionResult, XpertViewDataResult, XpertViewQuery } from '@xpert-ai/contracts'
import { ViewExtensionProvider, renderRemoteReactIframeHtml, type IXpertViewExtensionProvider, type XpertViewFileActionFile } from '@xpert-ai/plugin-sdk'
import { RFID_FEATURE, RFID_ICON, RFID_PLUGIN_NAME, RFID_PROVIDER_KEY, RFID_REMOTE_ENTRY_KEY, RFID_VIEW_KEY } from './rfid-constants.js'
import { analysisIdSchema, analysisAttemptSchema, saveAnalysisSchema, type ExperimentScope } from './experiment-contracts.js'
import { RfidExperimentInsightService } from './rfid-experiment-insight.service.js'
import { RFID_REMOTE_PROTOCOL } from './remote-protocol.js'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const text = (en_US: string, zh_Hans = en_US): I18nObject => ({ en_US, zh_Hans })

@Injectable()
@ViewExtensionProvider(RFID_PROVIDER_KEY)
export class RfidExperimentInsightViewProvider implements IXpertViewExtensionProvider {
  constructor(private readonly service: RfidExperimentInsightService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'project' || context.hostType === 'agent' }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!(context.hostType === 'project' && slot === 'detail.sections') && !(context.hostType === 'agent' && ['agent.workbench.main', 'agent.workbench.fixed'].includes(slot))) return []
    return [{
      key: RFID_VIEW_KEY, title: text('RFID Experiment Insight', '无线感知实验智能分析助手'),
      description: text('Upload experiment CSV, review statistics and AI interpretation, confirm and save.'),
      icon: { type: 'svg', value: RFID_ICON }, hostType: context.hostType, slot, order: 30, refreshable: true,
      activation: { requiredFeatures: [RFID_FEATURE] },
      ...(slot === 'agent.workbench.fixed' ? { workbench: { fixed: true, menu: { enabled: true, label: text('RFID Experiment Insight'), order: 30, icon: { type: 'svg' as const, value: RFID_ICON } } } } : {}),
      source: { provider: RFID_PROVIDER_KEY, plugin: RFID_PLUGIN_NAME },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1, component: { isolation: 'iframe', entry: RFID_REMOTE_ENTRY_KEY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsParameters: true }, cache: { enabled: false } },
      hostEvents: { subscriptions: [{ key: 'rfid-tool-completed', event: 'assistant.tool.completed', filter: { sources: ['chatkit'], toolNames: ['analyze_experiment', 'save_analysis'] }, action: { type: 'refresh-and-forward', debounceMs: 500 } }] },
      clientCommands: [{ key: 'assistant.chat.send_message', label: text('Send to Assistant', '发送到助手') }],
      actions: [
        { key: 'upload_csv', label: text('Upload CSV', '上传 CSV'), actionType: 'invoke', transport: 'file' },
        { key: 'analyze_experiment', label: text('Analyze / Retry', '分析 / 重试'), actionType: 'invoke' },
        { key: 'save_analysis', label: text('Confirm and Save', '确认并保存'), actionType: 'invoke' },
        { key: 'report_dispatch_failure', label: text('Report Assistant dispatch failure'), actionType: 'invoke' },
        { key: 'refresh', label: text('Refresh', '刷新'), actionType: 'refresh', placement: 'toolbar' }
      ]
    }]
  }
  async getRemoteComponentEntry(_context: XpertResolvedViewHostContext, viewKey: string, component: XpertRemoteComponentViewSchema['component']): Promise<XpertRemoteComponentEntry> {
    if (viewKey !== RFID_VIEW_KEY || component.entry !== RFID_REMOTE_ENTRY_KEY) throw new Error('Unsupported remote component.')
    const packageFile = (name: string, path: string) => readFile(join(dirname(require.resolve(`${name}/package.json`)), path), 'utf8')
    const [reactUmd, reactDomUmd, appScript] = await Promise.all([
      packageFile('react', 'umd/react.production.min.js'), packageFile('react-dom', 'umd/react-dom.production.min.js'),
      readFile(join(here, 'remote-components', RFID_REMOTE_ENTRY_KEY, 'app.js'), 'utf8')
    ])
    return { html: renderRemoteReactIframeHtml({ title: 'RFID Experiment Insight', lang: 'zh-Hans', reactUmd, reactDomUmd,
      appScript: `window.RFID_REMOTE_PROTOCOL = ${JSON.stringify(RFID_REMOTE_PROTOCOL)};\n${appScript}` }), contentType: 'text/html; charset=utf-8' }
  }
  async getViewData(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    if (viewKey !== RFID_VIEW_KEY) throw new Error('Unsupported view.')
    const value = query.parameters?.analysisId ?? query.selectionId
    const id = value ? analysisIdSchema.parse({ analysisId: value }).analysisId : undefined
    return this.service.getWorkbenchData(scopeFromView(context), id)
  }
  async executeViewAction(context: XpertResolvedViewHostContext, viewKey: string, actionKey: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== RFID_VIEW_KEY) throw new Error('Unsupported view.')
      const scope = scopeFromView(context)
      if (actionKey === 'refresh') return { success: true, refresh: true }
      const analysisId = request.input?.analysisId ?? request.targetId
      if (actionKey === 'analyze_experiment') {
        const input = analysisIdSchema.parse({ analysisId })
        return { success: true, data: await this.service.prepareAnalysis(scope, input.analysisId), refresh: true }
      }
      if (actionKey === 'save_analysis') {
        const input = saveAnalysisSchema.parse({ analysisId, confirmed: request.input?.confirmed })
        return { success: true, data: await this.service.confirmAnalysis(scope, input.analysisId, input.confirmed), refresh: true }
      }
      if (actionKey === 'report_dispatch_failure') {
        const attempt = analysisAttemptSchema.parse({ analysisId, attemptId: request.input?.attemptId })
        await this.service.reportFailure(scope, attempt, 'dispatch')
        return { success: true, refresh: true }
      }
      throw new Error('Unsupported action.')
    } catch (error) { return failure(error) }
  }
  async executeViewFileAction(context: XpertResolvedViewHostContext, viewKey: string, actionKey: string, request: XpertViewActionRequest, file: XpertViewFileActionFile): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== RFID_VIEW_KEY || actionKey !== 'upload_csv') throw new Error('Unsupported file action.')
      if (!file.buffer?.length || file.buffer.length > 1024 * 1024) throw new Error('Upload a nonempty CSV file of at most 1 MiB.')
      // Decode uploaded bytes, not a user-provided server path or inferred file payload.
      const csv = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer)
      const data = await this.service.importCsv(scopeFromView(context), {
        requestId: request.input?.requestId, name: request.input?.name, fileName: file.originalname, csv
      })
      return { success: true, data, refresh: true }
    } catch (error) { return failure(error) }
  }
}
function scopeFromView(context: XpertResolvedViewHostContext): ExperimentScope {
  return { tenantId: context.tenantId, userId: context.userId, organizationId: context.organizationId ?? null,
    workspaceId: context.workspaceId ?? null, projectId: context.hostType === 'project' ? context.hostId : null }
}
function failure(error: unknown): XpertViewActionResult { return { success: false, message: text(error instanceof Error ? error.message : 'Action failed.') } }
