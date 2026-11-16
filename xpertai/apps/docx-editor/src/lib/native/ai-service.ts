import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { AssistantMiddlewareAccessRuntimeCapability, ContentEditorsRuntimeCapability, ProjectAccessRuntimeCapability,
  ProjectFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type ContentDocumentScope, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { DOCX_EDITOR, DOCX_MIME } from './constants.js'
import { DocxFormat } from './format.js'
import { DocxEngine } from './ai-engine.js'
import { applySchema, createSchema, inspectSchema, templateSchema, versionSchema, templates, type EngineInput } from './ai-schema.js'
import { digest, matchReceipt, readReceipts, recordReceipt, type Receipt } from './ai-receipts.js'
import { docxResourceCard } from './resource-card.js'

export const DOCX_AI = 'docx-files'
const scopeSchema = z.object({ actor: z.object({ tenantId: z.string().uuid(), organizationId: z.string().uuid(), userId: z.string().uuid() }).strict(),
  projectId: z.string().uuid(), assistantId: z.string().uuid().optional() }).strict()
const missing = (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
const conflict = (error: unknown) => error instanceof ConflictException || (!!error && typeof error === 'object' && 'status' in error && error.status === 409)

@Injectable()
export class DocxAi {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry,
    private readonly format: DocxFormat, private readonly engine: DocxEngine) {}
  private editors() { return this.runtime.require(ContentEditorsRuntimeCapability) }
  private files() { return this.runtime.require(ProjectFilesRuntimeCapability) }
  private async authorize(scope: ContentDocumentScope, write = false, human = false) {
    scopeSchema.parse(scope)
    if (!human) {
      if (!scope.assistantId) throw new ForbiddenException('docx.assistant_required')
      await this.runtime.require(AssistantMiddlewareAccessRuntimeCapability).assertAccess({ actor: scope.actor, assistantId: scope.assistantId,
        provider: DOCX_AI, requiredFeature: DOCX_AI, scope: { type: 'project', projectId: scope.projectId } })
    }
    const access = this.runtime.require(ProjectAccessRuntimeCapability)
    if (scope.assistantId) await access.assertAssistant({ ...scope, assistantId: scope.assistantId })
    if (write) await access.assertEdit(scope)
    return scope
  }
  private async current(scope: ContentDocumentScope, filePath: string) {
    const api = this.editors(), resolution = await api.resolveFile({ ...scope, path: filePath })
    const source = resolution.resource?.resourceRef
    const target = source ? { ...scope, source } : { ...scope, path: filePath, editorKey: DOCX_EDITOR }
    const file = 'source' in target ? await api.read(target) : await api.readFile(target)
    if (file.registration.key !== DOCX_EDITOR || !file.file) throw new ForbiddenException('docx.editor_mismatch')
    await this.format.validateFile(file.buffer)
    return { ...file, target }
  }
  private reference(scope: ContentDocumentScope, filePath: string) {
    return { source: 'platform.workspace.files' as const, catalog: 'projects' as const, projectId: scope.projectId,
      scopeId: scope.projectId, filePath, workspacePath: filePath }
  }
  async listTemplates(scope: ContentDocumentScope, human = false) { await this.authorize(scope, false, human); return { templates } }
  async create(scope: ContentDocumentScope, raw: z.input<typeof createSchema>, human = false) {
    const input = createSchema.parse(raw)
    return this.createOutput(scope, input.operationId, input.title, input, async () => ({ action: 'create', input }), human)
  }
  async fillTemplate(scope: ContentDocumentScope, raw: z.input<typeof templateSchema>, human = false) {
    const input = templateSchema.parse(raw)
    await this.authorize(scope, true, human)
    return this.createOutput(scope, input.operationId, input.title, input, async () => {
      const template = await this.current(scope, input.filePath)
      if (template.revision !== input.expectedRevision) throw new ConflictException('docx.template_changed')
      return { action: 'fill', buffer: template.buffer, slots: input.slots }
    }, human)
  }
  private async createOutput(scope: ContentDocumentScope, operationId: string, title: string, input: unknown, job: () => Promise<EngineInput>, human: boolean) {
    await this.authorize(scope, true, human)
    const receipt: Receipt = { id: operationId, actor: digest(scope), hash: digest(input) }
    const filePath = `documents/${receipt.actor.slice(0, 16)}-${operationId}.docx`
    const replay = async () => {
      const file = await this.current(scope, filePath)
      if (!file.canWrite) throw new ForbiddenException('docx.read_only')
      if (!matchReceipt(await readReceipts(file.buffer), receipt, true)) throw new ConflictException('docx.creation_conflict')
      return { filePath, title, revision: file.revision, reference: this.reference(scope, filePath), replayed: true,
        navigation: await this.editors().resolveFile({ ...scope, path: filePath }) }
    }
    try { return await replay() } catch (error) { if (!missing(error)) throw error }
    const result = await this.engine.run(await job())
    if (!result.buffer) throw new Error('docx.processing_failed')
    const buffer = await recordReceipt(Buffer.from(result.buffer), receipt, true)
    await this.format.validateFile(buffer); await this.authorize(scope, true, human)
    try { await this.files().write({ ...scope, path: filePath, buffer, expectedHash: null }) }
    catch (error) { if (conflict(error)) return replay(); throw error }
    const file = await this.current(scope, filePath)
    return { filePath, title, revision: file.revision, reference: this.reference(scope, filePath), replayed: false,
      navigation: await this.editors().resolveFile({ ...scope, path: filePath }) }
  }
  async inspect(scope: ContentDocumentScope, raw: z.input<typeof inspectSchema>, human = false) {
    const input = inspectSchema.parse(raw); await this.authorize(scope, false, human)
    const file = await this.current(scope, input.filePath)
    return { filePath: input.filePath, revision: file.revision, canWrite: file.canWrite,
      ...await this.engine.run({ action: 'inspect', buffer: file.buffer, offset: input.offset, limit: input.limit }) }
  }
  async apply(scope: ContentDocumentScope, raw: z.input<typeof applySchema>) {
    const input = applySchema.parse(raw); await this.authorize(scope, true)
    const file = await this.current(scope, input.filePath)
    if (!file.canWrite) throw new ForbiddenException('docx.read_only')
    const receipt = { id: input.operationId, actor: digest(scope), hash: digest(input) }
    if (matchReceipt(await readReceipts(file.buffer), receipt)) return { revision: file.revision, replayed: true }
    if (file.revision !== input.expectedRevision) throw new ConflictException('docx.version_conflict')
    const result = await this.engine.run({ action: 'apply', buffer: file.buffer, edits: input.edits })
    if (!result.buffer) throw new Error('docx.processing_failed')
    const buffer = await recordReceipt(Buffer.from(result.buffer), receipt)
    await this.format.validateFile(buffer); await this.authorize(scope, true)
    const target = { ...file.target, expectedRevision: input.expectedRevision, buffer }, api = this.editors()
    try { return { ...await ('source' in target ? api.write(target) : api.writeFile(target)), replayed: false } }
    catch (error) {
      if (!conflict(error)) throw error
      const current = await this.current(scope, input.filePath)
      if (current.canWrite && matchReceipt(await readReceipts(current.buffer), receipt)) return { revision: current.revision, replayed: true }
      throw error
    }
  }
  async export(scope: ContentDocumentScope, raw: z.input<typeof versionSchema>) {
    const input = versionSchema.parse(raw); await this.authorize(scope, true)
    const file = await this.current(scope, input.filePath)
    if (file.revision !== input.expectedRevision) throw new ConflictException('docx.version_conflict')
    const filePath = `document-exports/${digest(file.buffer.toString('base64'))}.docx`
    await this.authorize(scope, true)
    try { await this.files().write({ ...scope, path: filePath, buffer: file.buffer, expectedHash: null }) }
    catch (error) {
      if (!conflict(error)) throw error
      if (!(await this.files().read({ ...scope, path: filePath })).buffer.equals(file.buffer)) throw new ConflictException('docx.snapshot_conflict')
    }
    return { filePath, sourceFilePath: input.filePath, title: file.file!.title, revision: file.revision, mimeType: DOCX_MIME, reference: this.reference(scope, filePath) }
  }
  async exportCard(scope: ContentDocumentScope, saved: { filePath: string; title: string; sourceFilePath?: string }) {
    await this.authorize(scope)
    const source = saved.sourceFilePath ?? saved.filePath
    return docxResourceCard(scope.projectId, source, saved.title, await this.editors().resolveFile({ ...scope, path: source }),
      { filePath: saved.filePath, resolved: await this.editors().resolveFile({ ...scope, path: saved.filePath }) })
  }
}
