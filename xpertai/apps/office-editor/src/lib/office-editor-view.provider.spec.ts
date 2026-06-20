jest.mock('@xpert-ai/plugin-sdk', () => ({
  ViewExtensionProvider: () => (target: unknown) => target,
  renderRemoteReactIframeHtml: jest.fn(() => '<!doctype html><html><body></body></html>')
}))

import {
  OFFICE_EDITOR_FEATURE,
  OFFICE_EDITOR_PROVIDER_KEY,
  OFFICE_EDITOR_REMOTE_ENTRY_KEY,
  OFFICE_EDITOR_TOOL_NAMES,
  OFFICE_EDITOR_VIEW_KEY
} from './constants.js'
import { OfficeEditorViewProvider } from './office-editor-view.provider.js'

describe('OfficeEditorViewProvider', () => {
  it('registers a platform remote component without embedding sensitive host context', () => {
    const provider = new OfficeEditorViewProvider(createService() as never)
    const context = testContext('agent')
    const manifests = provider.getViewManifests(context, 'agent.workbench.fixed')

    expect(provider.supports(context)).toBe(true)
    expect(manifests).toHaveLength(1)
    expect(manifests[0]).toEqual(
      expect.objectContaining({
        key: OFFICE_EDITOR_VIEW_KEY,
        source: expect.objectContaining({
          provider: OFFICE_EDITOR_PROVIDER_KEY
        }),
        activation: expect.objectContaining({
          requiredFeatures: [OFFICE_EDITOR_FEATURE]
        })
      })
    )
    expect(manifests[0].view).toEqual(
      expect.objectContaining({
        type: 'remote_component',
        component: expect.objectContaining({
          isolation: 'iframe',
          entry: OFFICE_EDITOR_REMOTE_ENTRY_KEY
        }),
        dataSource: {
          mode: 'platform'
        }
      })
    )
    expect(manifests[0].hostEvents?.subscriptions?.[0].filter?.toolNames).toEqual([...OFFICE_EDITOR_TOOL_NAMES])
    expect(manifests[0].actions?.map((action) => action.key)).toEqual([
      'refresh',
      'create_document',
      'import_document',
      'open_document',
      'save_snapshot',
      'sync_yjs_state',
      'queue_operation',
      'complete_operation',
      'delete_document',
      'prepare_assistant_prompt'
    ])
    const serialized = JSON.stringify(manifests[0])
    expect(serialized).not.toContain('tenant-1')
    expect(serialized).not.toContain('org-1')
    expect(serialized).not.toContain('workspace-1')
  })

  it('maps view actions to scoped service calls and keeps collab access session based', async () => {
    const service = createService()
    service.openDocument.mockResolvedValue({
      item: {
        id: 'document-1',
        documentType: 'spreadsheet'
      },
      currentSnapshot: null,
      collab: {
        sessionId: 'session-1',
        namespace: '/api/office-editor/collab/ws/document-1',
        expiresAt: Date.now() + 60000
      }
    })
    const provider = new OfficeEditorViewProvider(service as never)

    const result = await provider.executeViewAction(
      testContext('project'),
      OFFICE_EDITOR_VIEW_KEY,
      'open_document',
      {
        input: {
          documentId: 'document-1'
        }
      } as any
    )

    expect(service.openDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1'
      }),
      'document-1'
    )
    expect(result.success).toBe(true)
    expect(JSON.stringify(result.data)).toContain('session-1')
    expect(JSON.stringify(result.data)).not.toContain('tenant-1')
    expect(JSON.stringify(result.data)).not.toContain('org-1')
  })

  it('declares and executes import_document as a scoped file action without sensitive iframe context', async () => {
    const service = createService()
    service.importDocument.mockResolvedValue({
      document: {
        id: 'document-2',
        documentType: 'spreadsheet'
      },
      snapshot: {
        id: 'snapshot-1',
        source: 'import'
      },
      warnings: ['best effort']
    })
    const provider = new OfficeEditorViewProvider(service as never)
    const manifest = provider.getViewManifests(testContext('agent'), 'agent.workbench.fixed')[0]
    const action = manifest.actions?.find((item) => item.key === 'import_document') as any

    expect(action).toEqual(expect.objectContaining({
      actionType: 'invoke',
      transport: 'file'
    }))

    const result = await provider.executeViewFileAction(
      testContext('agent'),
      OFFICE_EDITOR_VIEW_KEY,
      'import_document',
      {
        input: {
          importFormat: 'xlsx',
          documentType: 'spreadsheet',
          name: 'workbook.xlsx',
          title: 'Workbook'
        }
      } as any,
      {
        originalname: 'workbook.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 5,
        buffer: Buffer.from('hello')
      } as any
    )

    expect(service.importDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        assistantId: 'assistant-1'
      }),
      expect.objectContaining({
        importFormat: 'xlsx',
        documentType: 'spreadsheet',
        title: 'Workbook',
        fileName: 'workbook.xlsx',
        size: 5,
        fileBase64: Buffer.from('hello').toString('base64')
      })
    )
    expect(result.success).toBe(true)
    expect(JSON.stringify(result.data)).not.toContain('tenant-1')
    expect(JSON.stringify(result.data)).not.toContain('org-1')
  })
})

function createService() {
  return {
    getWorkbenchData: jest.fn(),
    createDocument: jest.fn(),
    importDocument: jest.fn(),
    openDocument: jest.fn(),
    saveSnapshot: jest.fn(),
    syncYjsState: jest.fn(),
    queueOperation: jest.fn(),
    completeOperation: jest.fn(),
    deleteDocument: jest.fn(),
    prepareAssistantPrompt: jest.fn()
  }
}

function testContext(hostType: 'agent' | 'project') {
  return {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    userId: 'user-1',
    hostType,
    hostId: hostType === 'agent' ? 'assistant-1' : 'project-1',
    slots: [{ key: hostType === 'agent' ? 'agent.workbench.fixed' : 'detail.sections', mode: 'sections' }]
  } as any
}
