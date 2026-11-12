import { Injectable } from '@nestjs/common'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { XpertExtensionViewManifest, XpertRemoteComponentEntry, XpertRemoteComponentViewSchema, XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewActionResult, XpertViewDataResult, XpertViewQuery } from '@xpert-ai/contracts'
import { ASSISTANT_CHAT_SEND_MESSAGE_COMMAND } from '@xpert-ai/contracts'
import { ViewExtensionProvider, renderRemoteModuleIframeHtml, type IXpertViewExtensionProvider, type XpertViewFileActionFile } from '@xpert-ai/plugin-sdk'
import { BusinessError, FEATURE, PLUGIN_NAME, TOOL_NAMES, VIEW_KEY, VIEW_PROVIDER, humanLinesSchema, parseInput, type Scope } from './contracts.js'
import { draftDto } from './draft.entity.js'
import { QuotationService, createSchema, revisionSchema } from './quotation.service.js'

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const updateSchema = z.object({ id: z.string().uuid(), revision: revisionSchema, lines: humanLinesSchema }).strict()
const analyzeSchema = z.object({ id: z.string().uuid(), revision: revisionSchema }).strict()

@Injectable()
@ViewExtensionProvider(VIEW_PROVIDER)
export class QuotationView implements IXpertViewExtensionProvider {
  constructor(private readonly service: QuotationService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
    if (!this.supports(context) || !['agent.workbench.main', 'agent.workbench.fixed'].includes(slot)) return []
    return [{
      key: VIEW_KEY, title: text('Quotation assistant for pipe fitting foundries', '针对管件铸造企业的报价助手'), hostType: 'agent', slot, order: 10, refreshable: true,
      icon: { type: 'font', value: 'ri-file-list-3-line' }, activation: { requiredFeatures: [FEATURE] },
      ...(slot === 'agent.workbench.fixed' ? { workbench: { fixed: true, menu: { enabled: true, label: text('Quotation workbench', '报价工作台'), order: 10 } } } : {}),
      source: { provider: VIEW_PROVIDER, plugin: PLUGIN_NAME },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1, component: { isolation: 'iframe', entry: VIEW_KEY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', querySchema: { supportsParameters: true }, cache: { enabled: false } },
      clientCommands: [{ key: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, label: text('Analyze inquiry', 'AI 识别询价') }],
      hostEvents: { subscriptions: [{ key: 'manufacturing-candidates-updated', event: 'assistant.tool.completed', filter: { sources: ['chatkit'], toolNames: [...TOOL_NAMES].filter((name) => name !== 'manufacturing_read_inquiry' && name !== 'manufacturing_get_catalog') }, action: { type: 'refresh-and-forward', debounceMs: 200 } }] },
      actions: [...['create', 'analyze', 'retry', 'save_lines', 'confirm', 'retry_ocr', 'save_inquiry'].map((key) => ({ key, label: text(key, key), actionType: 'invoke' as const })),
        { key: 'create_image', label: text('Read regular image', '识别规整图片'), actionType: 'invoke', transport: 'file' }]
    }]
  }

  private scope(context: XpertResolvedViewHostContext): Scope {
    if (!this.supports(context)) throw new BusinessError('forbidden')
    return { tenantId: context.tenantId, organizationId: context.organizationId ?? null, userId: context.userId, assistantId: context.hostId }
  }

  async getRemoteComponentEntry(_context: XpertResolvedViewHostContext, key: string, component: XpertRemoteComponentViewSchema['component']): Promise<XpertRemoteComponentEntry> {
    if (key !== VIEW_KEY || component.entry !== VIEW_KEY) throw new BusinessError('not_found')
    const [appScript, appCss] = await Promise.all([
      readFile(new URL('./remote/app.js', import.meta.url), 'utf8'), readFile(new URL('./remote/app.css', import.meta.url), 'utf8')
    ])
    return { html: renderRemoteModuleIframeHtml({ title: '针对管件铸造企业的报价助手', lang: 'zh-Hans', appScript, appCss }), contentType: 'text/html; charset=utf-8' }
  }

  async getViewData(context: XpertResolvedViewHostContext, key: string, query: XpertViewQuery): Promise<XpertViewDataResult> {
    if (key !== VIEW_KEY) throw new BusinessError('not_found')
    const id = query.parameters?.draftId ?? query.selectionId
    if (id != null && typeof id !== 'string') throw new BusinessError('invalid_input')
    return { summary: await this.service.workbench(this.scope(context), id || undefined) }
  }

  async executeViewAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    try {
      if (key !== VIEW_KEY) throw new BusinessError('not_found')
      const scope = this.scope(context)
      if (action === 'create') return { success: true, refresh: true, data: { draft: draftDto(await this.service.create(scope, request.input)) } }
      if (action === 'refresh') return { success: true, refresh: true }
      const input = { ...request.input, id: request.input?.id ?? request.targetId }
      if (action === 'retry_ocr') {
        const value = parseInput(analyzeSchema, input)
        return { success: true, refresh: true, data: { draft: draftDto(await this.service.retryOcr(scope, value.id, value.revision)) } }
      }
      if (action === 'save_inquiry') {
        const value = parseInput(analyzeSchema.extend({ inquiry: createSchema.shape.inquiry }), input)
        return { success: true, refresh: true, data: { draft: draftDto(await this.service.saveInquiry(scope, value.id, value.revision, value.inquiry)) } }
      }
      if (action === 'analyze' || action === 'retry') {
        const value = parseInput(analyzeSchema, input)
        return { success: true, refresh: true, data: await this.service.analyze(scope, value.id, value.revision) }
      }
      if (action === 'save_lines' || action === 'confirm') {
        const value = parseInput(updateSchema, input)
        const draft = action === 'confirm'
          ? await this.service.confirm(scope, value.id, value.revision, value.lines)
          : await this.service.saveLines(scope, value.id, value.revision, value.lines)
        return { success: true, refresh: true, data: { draft: draftDto(draft) } }
      }
      throw new BusinessError('invalid_input')
    } catch (error) {
      const errorCode = error instanceof BusinessError ? error.code : 'operation_failed'
      return { success: false, refresh: true, data: { errorCode }, failure: { kind: 'business', code: errorCode }, message: text('The operation could not be completed. Refresh and retry.', '本次操作未完成，请刷新记录后重试。') }
    }
  }

  async executeViewFileAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest, file: XpertViewFileActionFile): Promise<XpertViewActionResult> {
    try {
      if (key !== VIEW_KEY || action !== 'create_image') throw new BusinessError('invalid_input')
      return { success: true, refresh: true, data: { draft: draftDto(await this.service.createImage(this.scope(context), request.input,
        { buffer: file.buffer, mimetype: file.mimetype ?? '', originalname: file.originalname ?? 'inquiry' })) } }
    } catch (error) {
      const errorCode = error instanceof BusinessError ? error.code : 'operation_failed'
      return { success: false, refresh: true, data: { errorCode }, failure: { kind: 'business', code: errorCode } }
    }
  }
}
