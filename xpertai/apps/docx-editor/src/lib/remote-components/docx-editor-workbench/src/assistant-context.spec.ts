import {
  buildClearDocxAssistantContextPayload,
  buildDocxAssistantContextPayload,
  DOCX_ASSISTANT_CONTEXT_KEY
} from './assistant-context.js'

describe('DOCX Workbench assistant context payload', () => {
  it('builds the assistant.context.set payload for the current Workbench document', () => {
    const payload = buildDocxAssistantContextPayload({
      documentId: ' doc-1 ',
      mode: 'suggesting',
      dirty: true,
      detail: {
        item: {
          id: 'doc-1',
          title: ' Contract Review ',
          fileName: 'contract.docx',
          currentVersionId: 'version-from-document',
          currentVersionNumber: 3
        },
        currentVersion: {
          id: 'version-4',
          versionNumber: 4,
          workspaceFilePath: 'files/docx-editor/documents/doc-1/versions/v4.docx',
          workspaceCatalog: 'xperts',
          workspaceScopeId: 'xpert-1'
        }
      },
      selectionContext: {
        currentPage: 2,
        totalPages: 5,
        selection: {
          paraId: 'p-1',
          selectedText: 'selected clause',
          paragraphText: 'full paragraph text',
          before: 'before',
          after: 'after'
        }
      }
    })

    expect(payload).toEqual({
      key: DOCX_ASSISTANT_CONTEXT_KEY,
      env: {
        docxEditorDocumentId: 'doc-1',
        docxEditorMode: 'suggesting',
        docxEditorVersionId: 'version-4',
        docxEditorWorkspaceFilePath: 'files/docx-editor/documents/doc-1/versions/v4.docx'
      },
      context: {
        currentDocument: {
          documentId: 'doc-1',
          title: 'Contract Review',
          fileName: 'contract.docx',
          currentVersionId: 'version-4',
          currentVersionNumber: 4,
          workspaceFilePath: 'files/docx-editor/documents/doc-1/versions/v4.docx',
          workspaceCatalog: 'xperts',
          workspaceScopeId: 'xpert-1',
          dirty: true,
          mode: 'suggesting',
          selection: {
            paraId: 'p-1',
            selectedText: 'selected clause',
            paragraphText: 'full paragraph text',
            before: 'before',
            after: 'after'
          },
          currentPage: 2,
          totalPages: 5
        }
      }
    })
  })

  it('uses the saved snapshot selection when no live selection context is available', () => {
    const payload = buildDocxAssistantContextPayload({
      documentId: 'doc-1',
      mode: 'viewing',
      detail: {
        item: {
          id: 'doc-1',
          fileName: 'snapshot.docx'
        },
        snapshot: {
          selection: {
            paraId: 'p-2',
            selectedText: 'x'.repeat(900)
          }
        }
      }
    })

    const currentDocument = payload?.context.currentDocument

    expect(currentDocument?.title).toBe('snapshot.docx')
    expect(currentDocument?.mode).toBe('viewing')
    expect((currentDocument?.selection as Record<string, string>).paraId).toBe('p-2')
    expect((currentDocument?.selection as Record<string, string>).selectedText).toHaveLength(803)
  })

  it('returns null when there is no selected document item', () => {
    expect(buildDocxAssistantContextPayload({ documentId: 'doc-1', mode: 'editing', detail: null })).toBeNull()
    expect(buildDocxAssistantContextPayload({ documentId: '', mode: 'editing', detail: { item: { id: 'doc-1' } } })).toBeNull()
  })

  it('builds the assistant context clear payload', () => {
    expect(buildClearDocxAssistantContextPayload()).toEqual({
      key: DOCX_ASSISTANT_CONTEXT_KEY,
      clear: true
    })
  })
})
