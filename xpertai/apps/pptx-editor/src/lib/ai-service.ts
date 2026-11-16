import { ConflictException, ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common'
import { AssistantMiddlewareAccessRuntimeCapability, ContentEditorsRuntimeCapability, ProjectAccessRuntimeCapability,
  ProjectFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type ContentDocumentScope, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { PPTX_EDITOR, PPTX_MIME } from './constants.js'
import { PptxFormat } from './format.js'
import { PptxEngine } from './ai-engine.js'
import { createSchema, applySchema, inspectSchema, renderSchema, versionSchema, type EngineOutput } from './ai-schema.js'
import { generatePresentation } from './ai-generate.js'
import { digest, matchReceipt, readReceipts, recordReceipt, type Receipt } from './ai-receipts.js'
import { pptxResourceCard } from './resource-card.js'
import { presentationSummary } from './presentation-summary.js'
import { PptxPreview } from './preview.js'
import { PptxTemplates, templateListSchema } from './template-service.js'
import { templateComposeSchema, templateInspectSchema } from './template-schema.js'

export const PPTX_AI = 'pptx-editor'
const scopeSchema = z.object({ actor: z.object({ tenantId: z.string().uuid(), organizationId: z.string().uuid(), userId: z.string().uuid() }).strict(),
  projectId: z.string().uuid(), assistantId: z.string().uuid() }).strict()
export type PptxAiScope = z.infer<typeof scopeSchema>
const missing = (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
const conflict = (error: unknown) => error instanceof ConflictException || (!!error && typeof error === 'object' && 'status' in error && error.status === 409)

@Injectable()
export class PptxAi {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry,
    private readonly format: PptxFormat, private readonly engine: PptxEngine, private readonly templates: PptxTemplates,
    @Optional() private readonly previews?: PptxPreview) {}
  private editors() { return this.runtime.require(ContentEditorsRuntimeCapability) }
  private files() { return this.runtime.require(ProjectFilesRuntimeCapability) }
  private async authorize(value: ContentDocumentScope, write = false): Promise<PptxAiScope> {
    const scope = scopeSchema.parse(value)
    await this.runtime.require(AssistantMiddlewareAccessRuntimeCapability).assertAccess({ actor: scope.actor, assistantId: scope.assistantId,
      provider: PPTX_AI, requiredFeature: PPTX_AI, scope: { type: 'project', projectId: scope.projectId } })
    const access = this.runtime.require(ProjectAccessRuntimeCapability)
    await access.assertAssistant(scope)
    if (write) await access.assertEdit(scope)
    return scope
  }
  private async current(scope: PptxAiScope, filePath: string) {
    const api = this.editors(), input = { ...scope, path: filePath, editorKey: PPTX_EDITOR }
    // Ownership resolution may select a resource editor, whose key differs from the file codec.
    // Validate the actual codec after reading through the resolved owner below.
    const resolution = await api.resolveFile({ ...scope, path: filePath })
    const source = resolution.resource?.resourceRef
    const target = source ? { ...scope, source } : input
    const file = 'source' in target ? await api.read(target) : await api.readFile(target)
    if (file.registration.key !== PPTX_EDITOR || !file.file) throw new ForbiddenException('pptx.editor_mismatch')
    await this.format.validateFile(file.buffer)
    return { ...file, target }
  }
  private receipt(scope: PptxAiScope, id: string, request: unknown): Receipt {
    return { id, actor: digest(scope), hash: digest(request) }
  }
  private reference(scope: PptxAiScope, filePath: string) {
    return { source: 'platform.workspace.files' as const, catalog: 'projects' as const, projectId: scope.projectId,
      scopeId: scope.projectId, filePath, workspacePath: filePath }
  }
  async listTemplates(value: ContentDocumentScope, input: z.input<typeof templateListSchema>) {
    return this.templates.list(await this.authorize(value), input)
  }
  async inspectTemplate(value: ContentDocumentScope, input: z.input<typeof templateInspectSchema>) {
    return this.templates.inspect(await this.authorize(value), input)
  }
  async composeTemplate(value: ContentDocumentScope, input: z.input<typeof templateComposeSchema>) {
    return this.templates.compose(await this.authorize(value, true), input)
  }
  async create(value: ContentDocumentScope, raw: z.input<typeof createSchema>) {
    const input = createSchema.parse(raw), scope = await this.authorize(value, true)
    const receipt = this.receipt(scope, input.operationId, input)
    const filePath = `presentations/${receipt.actor.slice(0, 16)}-${input.operationId}.pptx`
    const replay = async () => {
      const file = await this.current(scope, filePath)
      if (!file.canWrite) throw new ForbiddenException('pptx.read_only')
      if (!matchReceipt(await readReceipts(file.buffer), receipt, true)) throw new ConflictException('pptx.creation_conflict')
      return { filePath, revision: file.revision, reference: this.reference(scope, filePath), replayed: true }
    }
    try { return await replay() } catch (error) { if (!missing(error)) throw error }
    const buffer = await recordReceipt(await generatePresentation(input), receipt, true)
    await this.format.validateFile(buffer)
    await this.authorize(scope, true)
    try { await this.files().write({ ...scope, path: filePath, buffer, expectedHash: null }) }
    catch (error) { if (conflict(error)) return replay(); throw error }
    const file = await this.current(scope, filePath)
    return { filePath, title: input.title, revision: file.revision, slideCount: input.slides.length,
      reference: this.reference(scope, filePath), replayed: false }
  }
  async inspect(value: ContentDocumentScope, raw: z.input<typeof inspectSchema>) {
    const input = inspectSchema.parse(raw), scope = await this.authorize(value)
    const file = await this.current(scope, input.filePath)
    const result = await this.engine.run({ action: 'inspect', buffer: file.buffer, offset: input.offset, limit: input.limit, objectOffset: input.objectOffset })
    return { filePath: input.filePath, revision: file.revision, canWrite: file.canWrite, ...result }
  }
  async apply(value: ContentDocumentScope, raw: z.input<typeof applySchema>) {
    const input = applySchema.parse(raw), scope = await this.authorize(value, true)
    const file = await this.current(scope, input.filePath)
    if (!file.canWrite) throw new ForbiddenException('pptx.read_only')
    const receipt = this.receipt(scope, input.operationId, input)
    if (matchReceipt(await readReceipts(file.buffer), receipt)) return { revision: file.revision, replayed: true }
    if (file.revision !== input.expectedRevision) throw new ConflictException('pptx.version_conflict')
    const result = await this.engine.run({ action: 'apply', buffer: file.buffer, operations: input.operations })
    if (!result.buffer) throw new Error('pptx.processing_failed')
    const buffer = await recordReceipt(Buffer.from(result.buffer), receipt)
    await this.format.validateFile(buffer)
    await this.authorize(scope, true)
    const api = this.editors()
    try {
      const target = { ...file.target, expectedRevision: input.expectedRevision, buffer }
      const saved = 'source' in target ? await api.write(target) : await api.writeFile(target)
      return { ...saved, replayed: false, changedObjects: input.operations.length }
    } catch (error) {
      if (!conflict(error)) throw error
      const current = await this.current(scope, input.filePath)
      if (!current.canWrite) throw new ForbiddenException('pptx.read_only')
      if (matchReceipt(await readReceipts(current.buffer), receipt)) return { revision: current.revision, replayed: true }
      throw error
    }
  }
  async validate(value: ContentDocumentScope, raw: z.input<typeof versionSchema>) {
    const input = versionSchema.parse(raw), scope = await this.authorize(value)
    const file = await this.current(scope, input.filePath)
    this.expected(file.revision, input.expectedRevision)
    const result = await this.engine.run({ action: 'validate', buffer: file.buffer })
    return { revision: file.revision, ...result, visualReviewRequired: true, checks: ['package', 'object-bounds', 'notes'] }
  }
  async render(value: ContentDocumentScope, raw: z.input<typeof renderSchema>) {
    const input = renderSchema.parse(raw), scope = await this.authorize(value, true)
    const file = await this.current(scope, input.filePath)
    this.expected(file.revision, input.expectedRevision)
    const result: EngineOutput = await this.engine.run({ action: 'render', buffer: file.buffer, offset: input.offset, limit: input.limit })
    if (!result.html) throw new Error('pptx.processing_failed')
    const preview = await this.snapshot(scope, Buffer.from(result.html), 'html')
    return { revision: file.revision, ...preview, renderer: 'xpert-pptx-editor', pageStart: input.offset + 1,
      pageCount: Math.min(input.limit, result.slideCount - input.offset), includesNotes: false, officeFidelityVerified: false }
  }
  async export(value: ContentDocumentScope, raw: z.input<typeof versionSchema>) {
    const input = versionSchema.parse(raw), scope = await this.authorize(value, true)
    const file = await this.current(scope, input.filePath)
    this.expected(file.revision, input.expectedRevision)
    return { revision: file.revision, ...await this.snapshot(scope, file.buffer, 'pptx'),
      ...await presentationSummary(file.buffer, file.file!.title), sourceFilePath: input.filePath, mimeType: PPTX_MIME }
  }
  async exportCard(value: ContentDocumentScope, saved: { filePath: string; title: string; sourceFilePath?: string; slideCount?: number }) {
    const scope = await this.authorize(value)
    const sourcePath = saved.sourceFilePath ?? saved.filePath
    const resolved = await this.editors().resolveFile({ ...scope, path: sourcePath })
    const download = sourcePath === saved.filePath ? resolved : await this.editors().resolveFile({ ...scope, path: saved.filePath })
    const source = download.resource?.resourceRef
    const coverHash = await this.previews?.create(source ? { ...scope, source }
      : { ...scope, path: saved.filePath, editorKey: PPTX_EDITOR }).catch(() => undefined)
    return pptxResourceCard(scope.projectId, sourcePath, saved.title, resolved, {
      slideCount: saved.slideCount, coverHash, download: { filePath: saved.filePath, resolved: download }
    })
  }
  private expected(actual: string, expected: string) {
    if (actual !== expected) throw new ConflictException('pptx.version_conflict')
  }
  private async snapshot(scope: PptxAiScope, buffer: Buffer, extension: 'html' | 'pptx') {
    await this.authorize(scope, true)
    const hash = digest(buffer.toString('base64'))
    const filePath = `presentation-exports/${hash}.${extension}`
    try { await this.files().write({ ...scope, path: filePath, buffer, expectedHash: null }) }
    catch (error) {
      if (!conflict(error)) throw error
      const existing = await this.files().read({ ...scope, path: filePath })
      if (!existing.buffer.equals(buffer)) throw new ConflictException('pptx.snapshot_conflict')
    }
    return { filePath, reference: this.reference(scope, filePath) }
  }
}
