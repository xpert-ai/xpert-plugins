jest.mock('@xpert-ai/plugin-sdk', () => ({ ContentEditorProvider: () => (target: object) => target,
  ContentEditorsRuntimeCapability: 'editors', XPERT_RUNTIME_CAPABILITIES_TOKEN: 'runtime',
  ViewExtensionProvider: () => (target: object) => target }))
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { OfficeFileService } from './office-file.service.js'
import { OfficeFileView } from './office-file-view.provider.js'
import { OfficeXlsFormat, OfficeCsvFormat, OfficeTsvFormat } from './spreadsheets/serialized-file-formats.js'
import { OfficeSpreadsheetFormat } from './spreadsheet-format.provider.js'

const input = { actor: { tenantId: '00000000-0000-4000-8000-000000000001', organizationId: '00000000-0000-4000-8000-000000000002', userId: '00000000-0000-4000-8000-000000000003' }, projectId: '00000000-0000-4000-8000-000000000004', assistantId: '00000000-0000-4000-8000-000000000005', source: { providerKey: 'library', resourceId: '00000000-0000-4000-8000-000000000006' } }
const patch = { edits: [{ sheet: 'Sheet1', cell: 'A1', value: 42 }], results: [] }
async function fixture() {
  const format = new OfficeSpreadsheetFormat()
  const file = { buffer: await format.create(), revision: 'r1', canWrite: true, registration: format.descriptor, reference: { source: 'platform.workspace.files', catalog: 'xperts', scopeId: input.assistantId, xpertId: input.assistantId, isolateByUser: true, filePath: 'sheet.xlsx', workspacePath: 'sheet.xlsx' }, file: { path: 'sheet.xlsx', title: 'Sheet' } }
  const api = { read: jest.fn().mockImplementation(async () => file), write: jest.fn().mockImplementation(async (value) => {
    if (value.expectedRevision !== file.revision) throw new ConflictException()
    file.buffer = value.buffer; file.revision = 'r2'; return { revision: 'r2' }
  }) }
  const fileApi = { ...api, readFile: api.read, writeFile: api.write }
  return { file, api: fileApi, format, service: new OfficeFileService({ require: () => fileApi } as never, format, new OfficeXlsFormat(), new OfficeCsvFormat(), new OfficeTsvFormat()) }
}
describe('Office plugin file mode', () => {
  it('uses the host workspace feature and current slot without Assistant middleware', async () => {
    const f = await fixture(), view = new OfficeFileView(f.service)
    const context = { ...input.actor, hostId: input.assistantId, hostType: 'agent' as const, runtimeScope: { projectId: null } }
    const manifests = view.getViewManifests(context, 'agent.workbench')
    expect(manifests).toHaveLength(1)
    expect(manifests[0]).toMatchObject({ activation: { requiredFeatures: ['platform.workspace-files'] }, workbench: { fixed: true, openMode: 'on-demand' } })
    expect(view.getViewManifests(context, 'agent.workbench.main')).toEqual([])
  })
  it('round-trips real XLSX bytes through generic storage and rejects a stale session', async () => {
    const f = await fixture()
    const first = await f.service.read(input), second = await f.service.read(input)
    await f.service.save(input, first.revision, patch)
    expect((await f.service.read(input)).snapshot.sheets['sheet-1'].cellData[0][0].v).toBe(42)
    await expect(f.service.save(input, second.revision, patch)).rejects.toBeInstanceOf(ConflictException)
    expect(f.api.write).toHaveBeenCalledTimes(1)
    expect(f.api.write.mock.calls[0][0].source).toEqual(input.source)
  })
  it('routes standalone files and downloads through the authorized host reference', async () => {
    const f = await fixture(), view = new OfficeFileView(f.service)
    const context = { ...input.actor, hostId: input.assistantId, hostType: 'agent' as const, runtimeScope: { projectId: null } }
    const target = { kind: 'file', path: 'sheet.xlsx', editorKey: 'office.xlsx' }
    const opened = await view.executeViewAction(context, 'office.file', 'file.read', { input: target })
    expect(opened.success).toBe(true)
    expect(f.api.readFile).toHaveBeenCalledWith({ actor: input.actor, assistantId: input.assistantId, projectId: undefined, path: target.path, editorKey: target.editorKey })
    await view.executeViewAction(context, 'office.file', 'file.save', { input: { target, expectedRevision: 'r1', changes: patch } })
    expect(f.api.writeFile).toHaveBeenCalledTimes(1)
    const download = await view.resolveViewFile(context, 'office.file', { fileKey: JSON.stringify(target), purpose: 'download' })
    expect(download.reference).toBe(f.file.reference)
    expect(download.reference.isolateByUser).toBe(true)
  })
  it('preserves source-level CAS if another writer wins after the initial read', async () => {
    const f = await fixture(); f.api.write.mockRejectedValue(new ConflictException('raced'))
    await expect(f.service.save(input, 'r1', patch)).rejects.toThrow('raced')
    expect(f.file.revision).toBe('r1')
  })
  it('rejects revoked access, read-only users and resources registered to a different editor', async () => {
    const f = await fixture(); f.file.canWrite = false
    await expect(f.service.save(input, 'r1', patch)).rejects.toBeInstanceOf(ForbiddenException)
    f.file.registration = { ...f.file.registration, key: 'other.editor' }
    await expect(f.service.read(input)).rejects.toBeInstanceOf(ForbiddenException)
    f.api.read.mockRejectedValue(new ForbiddenException())
    await expect(f.service.download(input)).rejects.toBeInstanceOf(ForbiddenException)
    expect(f.api.write).not.toHaveBeenCalled()
  })
  it('builds actor/project/assistant scope only from the host and routes the source without a Spaces dependency', async () => {
    const f = await fixture(), view = new OfficeFileView(f.service)
    const context = { ...input.actor, hostId: input.assistantId, hostType: 'agent' as const, runtimeScope: { projectId: input.projectId } }
    await view.executeViewAction(context, 'office.file', 'file.read', { input: { kind: 'resource', ...input.source } })
    expect(f.api.read).toHaveBeenCalledWith(input)
    await expect(view.executeViewAction(context, 'office.file', 'file.read', { input: { kind: 'resource', ...input.source, projectId: 'foreign' } })).rejects.toThrow()
    await expect(view.executeViewAction({ ...context, runtimeScope: {} }, 'office.file', 'file.read', { input: { kind: 'resource', ...input.source } })).rejects.toThrow()
  })
})
