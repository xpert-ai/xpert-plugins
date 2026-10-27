jest.mock('@xpert-ai/plugin-sdk', () => ({ ContentEditorProvider: () => (target: object) => target,
  ContentEditorsRuntimeCapability: 'editors', XPERT_RUNTIME_CAPABILITIES_TOKEN: 'runtime',
  ViewExtensionProvider: () => (target: object) => target }))
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { OfficeFileService } from './office-file.service.js'
import { OfficeFileView } from './office-file-view.provider.js'
import { OfficeSpreadsheetFormat } from './spreadsheet-format.provider.js'

const input = { actor: { tenantId: '00000000-0000-4000-8000-000000000001', organizationId: '00000000-0000-4000-8000-000000000002', userId: '00000000-0000-4000-8000-000000000003' }, projectId: '00000000-0000-4000-8000-000000000004', assistantId: '00000000-0000-4000-8000-000000000005', source: { providerKey: 'library', resourceId: '00000000-0000-4000-8000-000000000006' } }
const patch = { sheetId: 'Sheet1', cells: [{ row: 0, column: 0, value: 42 }] }
async function fixture() {
  const format = new OfficeSpreadsheetFormat()
  const file = { buffer: await format.create(), revision: 'r1', canWrite: true, registration: format.descriptor, file: { path: 'sheet.xlsx', title: 'Sheet' } }
  const api = { read: jest.fn().mockImplementation(async () => file), write: jest.fn().mockImplementation(async (value) => {
    if (value.expectedRevision !== file.revision) throw new ConflictException()
    file.buffer = value.buffer; file.revision = 'r2'; return { revision: 'r2' }
  }) }
  return { file, api, format, service: new OfficeFileService({ require: () => api } as never, format) }
}
describe('Office plugin file mode', () => {
  it('round-trips real XLSX bytes through generic storage and rejects a stale session', async () => {
    const f = await fixture()
    const first = await f.service.read(input), second = await f.service.read(input)
    await f.service.save(input, first.revision, patch)
    expect((await f.service.read(input)).document.sheets[0].cells).toContainEqual({ row: 0, column: 0, value: 42 })
    await expect(f.service.save(input, second.revision, patch)).rejects.toBeInstanceOf(ConflictException)
    expect(f.api.write).toHaveBeenCalledTimes(1)
    expect(f.api.write.mock.calls[0][0].source).toEqual(input.source)
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
    await view.executeViewAction(context, 'office.file', 'file.read', { input: input.source })
    expect(f.api.read).toHaveBeenCalledWith(input)
    await expect(view.executeViewAction(context, 'office.file', 'file.read', { input: { ...input.source, projectId: 'foreign' } })).rejects.toThrow()
    await expect(view.executeViewAction({ ...context, runtimeScope: {} }, 'office.file', 'file.read', { input: input.source })).rejects.toThrow()
  })
})
