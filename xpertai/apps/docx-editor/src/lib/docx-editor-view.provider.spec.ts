import { DocxEditorViewProvider } from './docx-editor-view.provider.js'
import {
  DOCX_EDITOR_FEATURE,
  DOCX_EDITOR_HOST_EVENT_TOOL_NAMES,
  DOCX_EDITOR_PROVIDER_KEY,
  DOCX_EDITOR_REMOTE_ENTRY_KEY,
  DOCX_EDITOR_READ_ONLY_TOOL_NAMES,
  DOCX_EDITOR_VIEW_KEY
} from './constants.js'

describe('DocxEditorViewProvider', () => {
  const createService = () => ({
    getWorkbenchData: jest.fn(),
    createDocument: jest.fn(),
    saveDocumentVersion: jest.fn(),
    syncSnapshot: jest.fn(),
    completeOperation: jest.fn(),
    deleteDocument: jest.fn(),
    restoreVersion: jest.fn(),
    prepareAssistantPrompt: jest.fn(),
    uploadDocx: jest.fn()
  })

  it('registers a remote component view on agent workbench slots', () => {
    const provider = new DocxEditorViewProvider(createService() as never)
    const manifests = provider.getViewManifests(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-1',
        slots: [{ key: 'agent.workbench.fixed', mode: 'sections' }]
      },
      'agent.workbench.fixed'
    )

    expect(provider.supports({ tenantId: 'tenant-1', userId: 'user-1', hostType: 'agent', hostId: 'xpert-1', slots: [] })).toBe(true)
    expect(manifests).toHaveLength(1)
    expect(manifests[0].key).toBe(DOCX_EDITOR_VIEW_KEY)
    expect(manifests[0].source.provider).toBe(DOCX_EDITOR_PROVIDER_KEY)
    expect(manifests[0].activation?.requiredFeatures).toEqual([DOCX_EDITOR_FEATURE])
    expect(manifests[0].view.type).toBe('remote_component')
    expect(manifests[0].view.component.entry).toBe(DOCX_EDITOR_REMOTE_ENTRY_KEY)
  })

  it('forwards only mutating Workbench-relevant tool events', () => {
    const provider = new DocxEditorViewProvider(createService() as never)
    const manifests = provider.getViewManifests(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-1',
        slots: [{ key: 'agent.workbench.fixed', mode: 'sections' }]
      },
      'agent.workbench.fixed'
    )
    const subscription = manifests[0].hostEvents?.subscriptions?.[0]

    expect(subscription?.filter?.toolNames).toEqual([...DOCX_EDITOR_HOST_EVENT_TOOL_NAMES])
    for (const toolName of DOCX_EDITOR_READ_ONLY_TOOL_NAMES) {
      expect(subscription?.filter?.toolNames).not.toContain(toolName)
    }
    expect(subscription?.action?.type).toBe('forward')
  })

  it('uses the current agent host as default assistant id for created documents', async () => {
    const service = createService()
    service.createDocument.mockResolvedValue({ id: 'document-1' })
    const provider = new DocxEditorViewProvider(service as never)

    await provider.executeViewAction(
      {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        hostType: 'agent',
        hostId: 'xpert-1',
        slots: [{ key: 'agent.workbench.fixed', mode: 'sections' }]
      },
      DOCX_EDITOR_VIEW_KEY,
      'create_document',
      {
        input: {
          title: 'Contract Review'
        }
      }
    )

    expect(service.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        assistantId: 'xpert-1'
      }),
      expect.objectContaining({
        title: 'Contract Review',
        assistantId: 'xpert-1'
      })
    )
  })
})
