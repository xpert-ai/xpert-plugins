import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common'
import { ContentEditorsRuntimeCapability, ProjectAccessRuntimeCapability, ProjectFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN, type ContentDocumentScope, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { z } from 'zod/v3'
import { PptxFormat } from './format.js'
import { PptxEngine } from './ai-engine.js'
import { PPTX_EDITOR } from './constants.js'
import { digest, matchReceipt, readReceipts, recordReceipt } from './ai-receipts.js'
import { templateCatalogSchema, templateComposeSchema, templateInspectSchema, templateSourceSchema,
  type TemplateCatalog, type TemplateSource, type TemplateEngineInput } from './template-schema.js'
import { pptxResourceCard } from './resource-card.js'
import { PptxPreview } from './preview.js'

const scopeSchema = z.object({ actor: z.object({ tenantId: z.string().uuid(), organizationId: z.string().uuid(), userId: z.string().uuid() }).strict(),
  projectId: z.string().uuid(), assistantId: z.string().uuid().optional() }).strict()
export const templateImportSchema = z.object({ operationId: z.string().uuid(), title: z.string().trim().min(1).max(120) }).strict()
export const templateListSchema = z.object({ offset: z.number().int().min(0).max(10000).default(0) }).strict()
const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')
const importMetadata = z.object({ title: z.string().max(120), sha256: z.string().regex(/^[a-f0-9]{64}$/), requestHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
const missing = (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
const conflict = (error: unknown) => error instanceof ConflictException || (!!error && typeof error === 'object' && 'status' in error && error.status === 409)

@Injectable()
export class PptxTemplates {
  private catalog?: Promise<TemplateCatalog>
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry,
    private readonly format: PptxFormat, private readonly engine: PptxEngine,
    @Optional() private readonly previews?: PptxPreview) {}
  private editors() { return this.runtime.require(ContentEditorsRuntimeCapability) }
  private files() { return this.runtime.require(ProjectFilesRuntimeCapability) }
  private async authorize(value: ContentDocumentScope, write = false) {
    const scope = scopeSchema.parse(value), access = this.runtime.require(ProjectAccessRuntimeCapability)
    if (scope.assistantId) await access.assertAssistant({ ...scope, assistantId: scope.assistantId })
    else if (!(await access.listReadable({ actor: scope.actor, projectIds: [scope.projectId] })).some(item => item.projectId === scope.projectId))
      throw new ForbiddenException('pptx.project_access_denied')
    if (write) await access.assertEdit(scope)
    return scope
  }
  private loadCatalog() {
    return this.catalog ??= readFile(new URL('../assets/templates/catalog.json', import.meta.url), 'utf8').then(text => templateCatalogSchema.parse(JSON.parse(text)))
  }
  private async current(scope: ContentDocumentScope, path: string) {
    const api = this.editors(), resolved = await api.resolveFile({ ...scope, path })
    const file = resolved.resource?.resourceRef ? await api.read({ ...scope, source: resolved.resource.resourceRef }) :
      await api.readFile({ ...scope, path, editorKey: PPTX_EDITOR })
    if (file.registration.key !== PPTX_EDITOR || !file.file) throw new ForbiddenException('pptx.editor_mismatch')
    await this.format.validateFile(file.buffer)
    return { file, resolved }
  }
  private async source(scope: ContentDocumentScope, raw: TemplateSource) {
    const source = templateSourceSchema.parse(raw)
    if (source.kind === 'file') {
      const { file } = await this.current(scope, source.filePath)
      if (file.revision !== source.expectedRevision) throw new ConflictException('pptx.template_version_conflict')
      return { buffer: file.buffer, revision: file.revision }
    }
    const entry = (await this.loadCatalog()).templates.find(entry => entry.id === source.templateId)
    if (!entry) throw new BadRequestException('pptx.template_not_found')
    const buffer = await readFile(new URL(`../assets/templates/${entry.id}/${source.language}.pptx`, import.meta.url))
    if (sha(buffer) !== entry.variants[source.language].sha256) throw new BadRequestException('pptx.template_integrity_failed')
    await this.format.validateFile(buffer)
    return { buffer, revision: sha(buffer) }
  }
  async list(value: ContentDocumentScope, raw: z.input<typeof templateListSchema> = {}, previews = false) {
    const scope = await this.authorize(value), { offset } = templateListSchema.parse(raw)
    let entries: Awaited<ReturnType<ReturnType<PptxTemplates['files']>['list']>> = []
    try { entries = await this.files().list({ ...scope, path: 'presentation-templates', depth: 1 }) } catch (error) { if (!missing(error)) throw error }
    const files = entries.filter(entry => entry.kind === 'file' && entry.path.endsWith('.pptx')).sort((a, b) => a.path.localeCompare(b.path))
    const enterprise = await Promise.all(files.slice(offset, offset + 30).map(async entry => {
      const { file } = await this.current(scope, entry.path)
      let title = file.file!.title
      try {
        const metadata = await this.files().read({ ...scope, path: entry.path.replace(/\.pptx$/, '.json') })
        if (metadata.buffer.length > 4096) throw new BadRequestException('pptx.template_metadata_invalid')
        title = importMetadata.parse(JSON.parse(metadata.buffer.toString('utf8'))).title
      } catch (error) { if (!missing(error)) throw error }
      return { kind: 'file' as const, filePath: entry.path, title, expectedRevision: file.revision }
    }))
    const catalog = await this.loadCatalog()
    const covers = previews ? await Promise.all(catalog.templates.map(async template => ({ id: template.id,
      en: 'data:image/svg+xml;base64,' + (await readFile(new URL(`../assets/templates/${template.id}/en.cover.svg`, import.meta.url))).toString('base64'),
      zh: 'data:image/svg+xml;base64,' + (await readFile(new URL(`../assets/templates/${template.id}/zh.cover.svg`, import.meta.url))).toString('base64') }))) : undefined
    return { ...catalog, enterprise, hasMore: offset + 30 < files.length, nextOffset: offset + 30, ...(covers ? { covers } : {}) }
  }
  async inspect(value: ContentDocumentScope, raw: z.input<typeof templateInspectSchema>, preview = false) {
    const input = templateInspectSchema.parse(raw), scope = await this.authorize(value), file = await this.source(scope, input.source)
    const result = await this.engine.run({ action: 'templateInspect', buffer: file.buffer })
    if (!result.template) throw new Error('pptx.processing_failed')
    return { revision: file.revision, ...result.template, slides: result.template.slides.slice(input.offset, input.offset + input.limit),
      hasMore: input.offset + input.limit < result.slideCount, ...(preview ? { contentBase64: file.buffer.toString('base64') } : {}) }
  }
  async import(value: ContentDocumentScope, raw: z.input<typeof templateImportSchema>, buffer: Buffer) {
    const input = templateImportSchema.parse(raw), scope = await this.authorize(value, true)
    await this.format.validateFile(buffer)
    const result = await this.engine.run({ action: 'templateInspect', buffer })
    if (!result.template) throw new Error('pptx.processing_failed')
    const filePath = `presentation-templates/${digest(scope).slice(0, 12)}-${input.operationId}.pptx`
    const metadata = { title: input.title, sha256: sha(buffer), requestHash: digest({ input, sha256: sha(buffer) }) }
    const metadataBuffer = Buffer.from(JSON.stringify(metadata)), metadataPath = filePath.replace(/\.pptx$/, '.json')
    await this.authorize(scope, true)
    // Reserve the operation identity first; interrupted uploads can retry without changing original bytes.
    try { await this.files().write({ ...scope, path: metadataPath, buffer: metadataBuffer, expectedHash: null }) }
    catch (error) {
      if (!conflict(error)) throw error
      if (!(await this.files().read({ ...scope, path: metadataPath })).buffer.equals(metadataBuffer)) throw new ConflictException('pptx.template_import_conflict')
    }
    try { await this.files().write({ ...scope, path: filePath, buffer, expectedHash: null }) }
    catch (error) {
      if (!conflict(error)) throw error
      const existing = await this.files().read({ ...scope, path: filePath })
      if (!existing.buffer.equals(buffer)) throw new ConflictException('pptx.template_import_conflict')
    }
    const { file } = await this.current(scope, filePath)
    return { source: { kind: 'file' as const, filePath, expectedRevision: file.revision }, title: input.title,
      slideCount: result.slideCount, issues: result.template.issues, sha256: sha(buffer) }
  }
  async compose(value: ContentDocumentScope, raw: z.input<typeof templateComposeSchema>) {
    const input = templateComposeSchema.parse(raw), scope = await this.authorize(value, true)
    const receipt = { id: input.operationId, actor: digest(scope), hash: digest(input) }
    const filePath = `presentations/template-${receipt.actor.slice(0, 16)}-${input.operationId}.pptx`
    const replay = async () => {
      const { file, resolved } = await this.current(scope, filePath)
      if (!file.canWrite) throw new ForbiddenException('pptx.read_only')
      if (!matchReceipt(await readReceipts(file.buffer), receipt, true)) throw new ConflictException('pptx.creation_conflict')
      const source = resolved.resource?.resourceRef
      const coverHash = await this.previews?.create(source ? { ...scope, source }
        : { ...scope, path: filePath, editorKey: PPTX_EDITOR }).catch(() => undefined)
      return { filePath, title: input.title, revision: file.revision, slideCount: input.slides.length,
        card: pptxResourceCard(scope.projectId, filePath, input.title, resolved, { slideCount: input.slides.length, coverHash }), replayed: true }
    }
    // A replay still requires access to the source; a revoked template cannot authorize a new delivery.
    const source = await this.source(scope, input.source)
    try { return await replay() } catch (error) { if (!missing(error)) throw error }
    const images: NonNullable<TemplateEngineInput['images']> = []
    let totalBytes = 0
    for (const fill of input.slides.flatMap(slide => slide.fills)) if (fill.kind === 'image') {
      const image = await this.files().read({ ...scope, path: fill.filePath })
      if (sha(image.buffer) !== fill.sha256) throw new ConflictException('pptx.template_image_conflict')
      if (images.some(item => item.filePath === fill.filePath)) continue
      totalBytes += image.buffer.length
      if (!image.buffer.length || image.buffer.length > 5 * 1024 * 1024 || totalBytes > 20 * 1024 * 1024) throw new BadRequestException('pptx.template_image_size')
      const png = image.buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      const jpg = image.buffer[0] === 255 && image.buffer[1] === 216 && image.buffer[2] === 255
      if (!png && !jpg) throw new BadRequestException('pptx.template_image_type')
      images.push({ filePath: fill.filePath, buffer: image.buffer, extension: png ? 'png' : 'jpg' })
    }
    const result = await this.engine.run({ action: 'templateCompose', buffer: source.buffer, plan: input, images })
    if (!result.buffer) throw new Error('pptx.processing_failed')
    const buffer = await recordReceipt(Buffer.from(result.buffer), receipt, true)
    await this.format.validateFile(buffer)
    await this.authorize(scope, true)
    // Re-read source after CPU work so a changed/deleted template cannot silently supply stale content.
    await this.source(scope, input.source)
    try { await this.files().write({ ...scope, path: filePath, buffer, expectedHash: null }) }
    catch (error) { if (!conflict(error)) throw error; return replay() }
    return { ...await replay(), replayed: false }
  }
}
