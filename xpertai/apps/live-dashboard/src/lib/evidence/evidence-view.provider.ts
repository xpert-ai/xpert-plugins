import { AnalysisEvidenceTransfers } from './evidence-transfers'
import { BadRequestException, ConflictException } from '@nestjs/common'
import { z } from 'zod/v3'
import { ViewExtensionProvider, ContentEditorProvider, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import type { ResourceContentEditorRegistration, XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewQuery } from '@xpert-ai/contracts'
import { AnalysisEvidenceService, captureEvidenceSchema } from './evidence.service'
import { PLUGIN_NAME } from '../dashboard.service'
import { dashboardRemoteEntry } from '../remote-entry'
import { dashboardIcon } from '../dashboard-icon'
import { FEATURE } from '../view.provider'

export const EVIDENCE_EDITOR = 'live-dashboard.evidence-editor'
export const evidenceModel = { typeId: 'analysis-evidence', modelId: 'xpert.analysis-evidence', schemaVersion: '1', editProtocol: { id: 'immutable.snapshot', version: '1' } }
const provider = 'live-dashboard-evidence', view = 'analysis-evidence'
const idSchema = z.object({ id: z.string().uuid() }).strict()
const refreshSchema = idSchema.extend({ requestId: z.string().uuid(), title: z.string().min(1).max(200) })
export const evidenceConvertSchema = idSchema.extend({ requestId: z.string().uuid(), title: z.string().min(1).max(200), target: z.enum(['document', 'presentation', 'motion']) })
@ContentEditorProvider(EVIDENCE_EDITOR)
export class AnalysisEvidenceEditor {
  readonly descriptor: ResourceContentEditorRegistration = { kind: 'resource', key: EVIDENCE_EDITOR, protocolVersion: 2,
    title: 'Analysis evidence', view: { providerKey: provider, viewKey: view, entry: view }, supports: [{ ...evidenceModel, access: ['view'] }] }
}
@ViewExtensionProvider(provider)
export class AnalysisEvidenceView implements IXpertViewExtensionProvider {
  constructor(private readonly evidence: AnalysisEvidenceService,
    private readonly transfers: AnalysisEvidenceTransfers) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench', 'agent.workbench.fixed', 'agent.workbench.main'].includes(slot)) return []
    return [{ key: view, title: { en_US: 'Analysis evidence', zh_Hans: '分析证据', zh_Hant: '分析證據' }, hostType: 'agent', slot,
      icon: dashboardIcon, activation: { projectResource: true, requiredFeatures: [FEATURE] }, source: { provider, plugin: PLUGIN_NAME }, refreshable: true,
      workbench: { fixed: true, openMode: 'on-demand', menu: { enabled: true, order: 39 } },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1, component: { isolation: 'iframe', entry: view }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsSelection: true, supportsParameters: true }, cache: { enabled: false } },
      clientCommands: [{ key: 'workbench.content.resolve' }, { key: 'workbench.navigation.open' }],
      actions: ['capture', 'refresh', 'convert'].map(key => ({ key, label: { en_US: key, zh_Hans: key }, actionType: 'invoke' })) }]
  }
  getRemoteComponentEntry(_context: XpertResolvedViewHostContext, entry: string) { this.assertView(entry); return dashboardRemoteEntry(false, 'evidence') }
  private assertView(key: string) { if (key !== view) throw new BadRequestException('EVIDENCE_VIEW_UNSUPPORTED') }
  async getViewData(context: XpertResolvedViewHostContext, key: string, query: XpertViewQuery) {
    this.assertView(key)
    const canCapture = await this.evidence.canCapture(context)
    if (query.selectionId) {
      const id = z.string().uuid().parse(query.selectionId)
      try { return { meta: { canCapture, snapshot: await this.evidence.read(context, id) } } }
      catch (error) {
        if (!(error instanceof ConflictException) || error.message !== 'EVIDENCE_SOURCE_CHANGED_CAPTURE_NEW_SNAPSHOT') throw error
        return { meta: { canCapture, refreshId: id, sourceChanged: true } }
      }
    }
    return { meta: { canCapture, ...await this.evidence.list(context, Math.max(0, (query.page ?? 1) - 1) * 50) } }
  }
  async executeViewAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest) {
    this.assertView(key)
    if (action === 'capture') return { success: true, data: await this.evidence.capture(context, captureEvidenceSchema.parse(request.input)), refresh: true }
    if (action === 'refresh') {
      const input = refreshSchema.parse(request.input)
      return { success: true, data: await this.evidence.refresh(context, input.id, input.requestId, input.title), refresh: false }
    }
    if (action === 'convert') return { success: true, data: await this.transfers.convert(context, evidenceConvertSchema.parse(request.input)), refresh: false }
    throw new BadRequestException('EVIDENCE_ACTION_UNSUPPORTED')
  }
}
