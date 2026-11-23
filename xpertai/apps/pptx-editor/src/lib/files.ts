import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { ContentEditorsRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ContentEditorInput, type ContentFileEditorInput, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { PptxFormat } from './format.js'
import { PPTX_EDITOR, PPTX_MIME } from './constants.js'

export type PptxFileInput = ContentEditorInput | ContentFileEditorInput

@Injectable()
export class PptxFiles {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry,
    private readonly format: PptxFormat) {}
  private async source(input: PptxFileInput) {
    const api = this.runtime.require(ContentEditorsRuntimeCapability)
    const file = 'source' in input ? await api.read(input) : await api.readFile(input)
    if (file.registration.key !== PPTX_EDITOR || !file.file) throw new ForbiddenException('pptx.editor_mismatch')
    return { api, file, descriptor: file.file }
  }
  async read(input: PptxFileInput) {
    const { file, descriptor } = await this.source(input)
    return { revision: file.revision, title: descriptor.title, canWrite: file.canWrite,
      sequence: 'sequence' in file ? file.sequence : undefined, collaboration: 'collaboration' in file && file.collaboration === true,
      mimeType: PPTX_MIME, contentBase64: file.buffer.toString('base64') }
  }
  /** Internal rendering input. Provider authorization is repeated even for cached covers. */
  async previewSource(input: PptxFileInput) {
    const { file } = await this.source(input)
    await this.format.validateFile(file.buffer)
    return file.buffer
  }
  async session(input: PptxFileInput) {
    const { api } = await this.source(input)
    if (!('source' in input)) throw new ForbiddenException('pptx.collaboration_unavailable')
    return api.createSession(input)
  }
  async save(input: PptxFileInput, expectedRevision: string, buffer: Buffer) {
    const { api, file } = await this.source(input)
    if (!file.canWrite) throw new ForbiddenException('pptx.read_only')
    if (file.revision !== expectedRevision) throw new ConflictException('pptx.version_conflict')
    await this.format.validateFile(buffer)
    // Resource publication performs the atomic revision check; the read above alone is not a lock.
    return 'source' in input ? api.write({ ...input, expectedRevision, buffer }) : api.writeFile({ ...input, expectedRevision, buffer })
  }
  async download(input: PptxFileInput) {
    const { descriptor } = await this.source(input)
    return { reference: { ...input.actor, source: 'platform.workspace.files' as const, catalog: 'projects' as const,
      projectId: input.projectId, scopeId: input.projectId, filePath: descriptor.path, workspacePath: descriptor.path },
      fileName: descriptor.path.split('/').pop() ?? descriptor.title, mimeType: PPTX_MIME }
  }
}
