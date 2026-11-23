import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { ContentEditorsRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ContentEditorInput, type ContentFileEditorInput, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { PdfFormat } from './format.js'
import { PDF_EDITOR, PDF_MIME } from './constants.js'

export type PdfFileInput = ContentEditorInput | ContentFileEditorInput

@Injectable()
export class PdfFiles {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry,
    private readonly format: PdfFormat) {}
  private async source(input: PdfFileInput) {
    const api = this.runtime.require(ContentEditorsRuntimeCapability)
    // Cards may predate Spaces ownership. Resolve again instead of using a stale
    // generic-file lane that the platform correctly refuses for managed resources.
    let target: PdfFileInput = input
    if ('path' in input) {
      const resolved = await api.resolveFile({ actor: input.actor, projectId: input.projectId, assistantId: input.assistantId, path: input.path })
      if (resolved.resource) target = { actor: input.actor, projectId: input.projectId, assistantId: input.assistantId, source: resolved.resource.resourceRef }
    }
    const file = 'source' in target ? await api.read(target) : await api.readFile(target)
    if (file.registration.key !== PDF_EDITOR || !file.file) throw new ForbiddenException('pdf.editor_mismatch')
    await this.format.validateFile(file.buffer)
    return { api, file, descriptor: file.file, target }
  }
  async read(input: PdfFileInput) {
    const { file, descriptor } = await this.source(input)
    return { revision: file.revision, title: descriptor.title, canWrite: false,
      sequence: 'sequence' in file ? file.sequence : undefined, collaboration: 'collaboration' in file && file.collaboration === true,
      mimeType: PDF_MIME, contentBase64: file.buffer.toString('base64') }
  }
  /** Internal rendering input. Provider authorization is repeated even for cached covers. */
  async previewSource(input: PdfFileInput) {
    const { file } = await this.source(input)
    await this.format.validateFile(file.buffer)
    return file.buffer
  }
  async download(input: PdfFileInput) {
    const { descriptor } = await this.source(input)
    return { reference: { ...input.actor, source: 'platform.workspace.files' as const, catalog: 'projects' as const,
      projectId: input.projectId, scopeId: input.projectId, filePath: descriptor.path, workspacePath: descriptor.path },
      fileName: descriptor.path.split('/').pop() ?? descriptor.title, mimeType: PDF_MIME }
  }
}
