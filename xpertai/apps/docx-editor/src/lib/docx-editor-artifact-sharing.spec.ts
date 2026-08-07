import assert from 'node:assert/strict'
import test from 'node:test'
import { DocxEditorService } from './docx-editor.service.js'

test('requires explicit confirmation before publishing a public DOCX link', async () => {
  const documentRepository = {
    findOne: async () => ({ id: 'document-1', title: 'Contract', status: 'active', currentVersionId: 'version-1' })
  }
  const versionRepository = { findOne: async () => ({ id: 'version-1', documentId: 'document-1', versionNumber: 1 }) }
  const service = new DocxEditorService(
    documentRepository as never,
    versionRepository as never,
    {} as never,
    {} as never
  )
  await assert.rejects(
    service.publishArtifact(
      { tenantId: 'tenant-1' },
      { documentId: 'document-1', accessMode: 'public_link', userConfirmedPublicLink: false }
    ),
    /explicit user confirmation/
  )
})
