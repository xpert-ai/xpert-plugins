import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { ContentEditorsRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ContentEditorInput, type ContentFileEditorInput, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { DocxFormat } from './format.js'
import { DOCX_EDITOR, DOCX_MIME } from './constants.js'

export type DocxFileInput = ContentEditorInput | ContentFileEditorInput

@Injectable()
export class DocxFiles {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry,
    private readonly format: DocxFormat) {}
  private async source(input: DocxFileInput) {
    const api = this.runtime.require(ContentEditorsRuntimeCapability)
    // Cards may predate Spaces ownership. Resolve again instead of using a stale
    // generic-file lane that the platform correctly refuses for managed resources.
    let target: DocxFileInput = input
    if ('path' in input) {
      const resolved = await api.resolveFile({ actor: input.actor, projectId: input.projectId, assistantId: input.assistantId, path: input.path })
      if (resolved.resource) target = { actor: input.actor, projectId: input.projectId, assistantId: input.assistantId, source: resolved.resource.resourceRef }
    }
    const file = 'source' in target ? await api.read(target) : await api.readFile(target)
    if (file.registration.key !== DOCX_EDITOR || !file.file) throw new ForbiddenException('docx.editor_mismatch')
    await this.format.validateFile(file.buffer)
    return { api, file, descriptor: file.file, target }
  }
  async read(input: DocxFileInput) {
    const { file, descriptor } = await this.source(input)
    return { revision: file.revision, title: descriptor.title, canWrite: file.canWrite,
      sequence: 'sequence' in file ? file.sequence : undefined, collaboration: 'collaboration' in file && file.collaboration === true,
      mimeType: DOCX_MIME, contentBase64: file.buffer.toString('base64') }
  }
  /** Internal rendering input. Provider authorization is repeated even for cached covers. */
  async previewSource(input: DocxFileInput) {
    const { file } = await this.source(input)
    await this.format.validateFile(file.buffer)
    return file.buffer
  }
  async session(input: DocxFileInput) {
    const { api, target } = await this.source(input)
    if (!('source' in target)) throw new ForbiddenException('docx.collaboration_unavailable')
    return api.createSession(target)
  }
  async save(input: DocxFileInput, expectedRevision: string, buffer: Buffer) {
    const { api, file, target } = await this.source(input)
    if (!file.canWrite) throw new ForbiddenException('docx.read_only')
    if (file.revision !== expectedRevision) throw new ConflictException('docx.version_conflict')
    await this.format.validateFile(buffer)
    // Resource publication performs the atomic revision check; the read above alone is not a lock.
    return 'source' in target ? api.write({ ...target, expectedRevision, buffer }) : api.writeFile({ ...target, expectedRevision, buffer })
  }
  async download(input: DocxFileInput) {
    const { descriptor } = await this.source(input)
    return { reference: { ...input.actor, source: 'platform.workspace.files' as const, catalog: 'projects' as const,
      projectId: input.projectId, scopeId: input.projectId, filePath: descriptor.path, workspacePath: descriptor.path },
      fileName: descriptor.path.split('/').pop() ?? descriptor.title, mimeType: DOCX_MIME }
  }
}
