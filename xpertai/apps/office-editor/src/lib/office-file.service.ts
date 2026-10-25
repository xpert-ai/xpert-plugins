import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { ContentEditorsRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ContentEditorInput, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { OfficeSpreadsheetFormat } from './spreadsheet-format.provider.js'
import type { SpreadsheetPatch } from './spreadsheet-types.js'

/** Office owns the grid model. The platform and resource provider see only bytes and revisions. */
@Injectable()
export class OfficeFileService {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry,
    private readonly format: OfficeSpreadsheetFormat) {}
  private async source(input: ContentEditorInput) {
    const api = this.runtime.require(ContentEditorsRuntimeCapability)
    const file = await api.read(input)
    if (file.registration.key !== this.format.descriptor.key) throw new ForbiddenException('office.editor_mismatch')
    return { api, file }
  }
  async read(input: ContentEditorInput) {
    const { file } = await this.source(input)
    return { revision: file.revision, title: file.file.title, canWrite: file.canWrite,
      document: await this.format.read(file.buffer) }
  }
  async save(input: ContentEditorInput, expectedRevision: string, patch: SpreadsheetPatch) {
    const { api, file } = await this.source(input)
    if (!file.canWrite) throw new ForbiddenException('office.read_only')
    if (file.revision !== expectedRevision) throw new ConflictException('office.version_conflict')
    const buffer = await this.format.apply(file.buffer, patch)
    // Re-checks authorization and atomically compares the resource version at publication.
    return api.write({ ...input, buffer, expectedRevision })
  }
  async download(input: ContentEditorInput) {
    const { file } = await this.source(input)
    return { reference: { ...input.actor, catalog: 'projects' as const, source: 'platform.workspace.files' as const,
      projectId: input.projectId, scopeId: input.projectId, filePath: file.file.path, workspacePath: file.file.path },
      fileName: file.file.path.split('/').pop() ?? file.file.title, mimeType: file.registration.mimeType }
  }
}
