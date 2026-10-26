jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, key: string) => `plugin_${namespace}_${key}`
}))
import { randomUUID } from 'node:crypto'
import { OfficeEditorService } from '../office-editor.service.js'
import { WORKBOOK_MODEL } from './model.js'

it('blocks every alternate snapshot, Yjs, queued and XLSX writer for native resources', async () => {
  const scope = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), projectId: randomUUID(), assistantId: randomUUID() }
  const document = { id: randomUUID(), ...scope, documentType: 'spreadsheet', contentModel: WORKBOOK_MODEL.modelId }
  const repository = { findOne: jest.fn().mockResolvedValue(document), save: jest.fn() }
  const workbooks = { require: jest.fn().mockResolvedValue(document), edit: jest.fn().mockResolvedValue({ documentId: document.id, revision: '2' }) }
  const service = new OfficeEditorService(repository as never, repository as never, repository as never, repository as never, repository as never, undefined, undefined, workbooks as never)
  const documentId = document.id
  for (const operation of [
    () => service.saveSnapshot(scope, { documentId, snapshot: {} } as never),
    () => service.syncYjsState(scope, { documentId } as never),
    () => service.queueOperation(scope, { documentId } as never),
    () => service.addReviewNote(scope, { documentId } as never),
    () => service.restoreExcelVersion(scope, { documentId } as never),
    () => service.createCollabSession(scope, documentId),
    () => service.deleteDocument(scope, documentId)
  ]) await expect(operation()).rejects.toThrow('office.use_versioned_workbook_editor')
  expect(repository.save).not.toHaveBeenCalled()
  await expect(service.editExcel(scope, { documentId, operations: [] })).rejects.toThrow('office.version_and_request_required')
  await service.editExcel(scope, { documentId, expectedVersionNumber: 1, idempotencyKey: 'retry', operations: [{ type: 'set_range_values', sheetName: 'Sheet1', range: 'A1', values: [[42]] }] })
  expect(workbooks.edit).toHaveBeenCalledWith(expect.objectContaining({ projectId: scope.projectId, actor: expect.objectContaining({ userId: scope.userId }) }), documentId, '1', expect.any(Array), 'retry')
})
