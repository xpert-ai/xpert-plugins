import 'reflect-metadata'
jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, key: string) => `plugin_${namespace}_${key}`,
  ViewExtensionProvider: () => (target: Function) => target,
  renderRemoteReactIframeHtml: jest.fn(() => '<html></html>'),
  ArtifactsRuntimeCapability: { id: 'platform.artifacts' },
  WorkspaceFilesRuntimeCapability: { id: 'platform.workspace.files' },
  WORKSPACE_FILES_SOURCE: 'platform.workspace.files',
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol.for('XPERT_RUNTIME_CAPABILITIES_TOKEN')
}))
jest.mock('fractional-indexing', () => ({
  generateKeyBetween: jest.fn(() => 'a1')
}))
jest.mock('tldraw', () => ({
  createTLStore: () => ({
    getStoreSnapshot: () => ({ schema: { mock: true }, store: {} }),
    migrateSnapshot: (snapshot: object) => snapshot,
    put: jest.fn(),
    get: jest.fn()
  })
}))

import { CanvasViewProvider } from './canvas-view.provider.js'
import type { XpertResolvedViewHostContext, XpertViewActionRequest, XpertViewQuery } from '@xpert-ai/contracts'
import type { XpertViewFileActionFile } from '@xpert-ai/plugin-sdk'
import {
  ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  ASSISTANT_CONTEXT_SET_COMMAND,
  CANVAS_MIDDLEWARE_TOOL_NAMES,
  CANVAS_REMOTE_ENTRY_KEY,
  CANVAS_WORKBENCH_VIEW_KEY
} from './constants.js'
import type { CanvasService } from './canvas.service.js'
import type { CanvasArtifactService } from './canvas-artifact.service.js'
import type { CanvasArtifactExportService } from './canvas-artifact-export.service.js'

type RemoteManifestView = {
  component: {
    entry: string
  }
}

type FileTransportAction = {
  key?: string
  transport?: string
  placement?: string
}

type CanvasWorkbenchViewData = Awaited<ReturnType<CanvasViewProvider['getViewData']>> & {
  table?: {
    items?: Array<{ id: string }>
  }
  detail?: {
    item: {
      id: string
    }
    artifactShare?: object | null
  }
  settings?: {
    tldrawLicenseKey?: string
    artifactSharingAvailable?: boolean
  }
}

type CanvasActionResult = Awaited<ReturnType<CanvasViewProvider['executeViewAction']>> & {
  data?: {
    commandKey?: string
  }
}

const hostContext = {
  hostType: 'agent',
  tenantId: 'tenant',
  organizationId: 'org',
  userId: 'user',
  hostId: 'assistant'
} as XpertResolvedViewHostContext

describe('CanvasViewProvider', () => {
  it('declares a scoped remote Workbench view with actions and host events', () => {
    const provider = new CanvasViewProvider({} as CanvasService)
    const manifests = provider.getViewManifests({ hostType: 'agent' } as XpertResolvedViewHostContext, 'agent.workbench.fixed')
    const manifest = manifests[0]

    expect(manifest.key).toBe(CANVAS_WORKBENCH_VIEW_KEY)
    expect((manifest.view as RemoteManifestView).component.entry).toBe(CANVAS_REMOTE_ENTRY_KEY)
    expect(manifest.dataSource?.querySchema?.supportsPagination).toBe(true)
    expect(manifest.clientCommands?.map((command) => command.key)).toEqual(
      expect.arrayContaining([ASSISTANT_CONTEXT_SET_COMMAND, ASSISTANT_CHAT_SEND_MESSAGE_COMMAND])
    )
    expect(manifest.actions?.map((action) => action.key)).toEqual(
      expect.arrayContaining(['autosave_snapshot', 'prepare_assistant_prompt', 'delete_document', 'delete_version'])
    )
    expect(manifest.actions?.some((action) => action.key === 'import_snapshot_file' && (action as FileTransportAction).transport === 'file')).toBe(true)
    expect(manifest.actions?.some((action) => action.key === 'save_snapshot')).toBe(false)
    expect(manifest.actions?.map((action) => action.key)).toEqual(
      expect.arrayContaining(['publish_artifact', 'get_artifact_export', 'revoke_artifact_share'])
    )
    expect(manifest.actions?.some((action) => action.key === 'publish_artifact' && (action as FileTransportAction).transport === 'file')).toBe(false)
    expect((manifest.actions?.find((action) => action.key === 'save_version') as FileTransportAction | undefined)?.placement).toBeUndefined()
    expect(manifest.hostEvents?.subscriptions?.[0].filter?.toolNames).toEqual([...CANVAS_MIDDLEWARE_TOOL_NAMES])
  })

  it('loads paginated view data and optional detail', async () => {
    const previousLicenseKey = process.env.TLDRAW_LICENSE_KEY
    process.env.TLDRAW_LICENSE_KEY = 'tl-test-key'
    try {
      const service = {
        searchDocuments: jest.fn().mockResolvedValue({ items: [{ id: 'doc-1' }], total: 1, page: 1, pageSize: 20 }),
        getDocument: jest.fn().mockResolvedValue({ item: { id: 'doc-1' } })
      }
      const artifactService = {
        getShare: jest.fn().mockResolvedValue({ artifactLinkId: 'link-1', publicUrl: '/artifacts/share/link-1' }),
        isAvailable: jest.fn(() => true)
      }
      const artifactExportService = {
        getCapabilities: jest.fn().mockResolvedValue({ available: true })
      }
      const provider = new CanvasViewProvider(
        service as Partial<CanvasService> as CanvasService,
        artifactService as Partial<CanvasArtifactService> as CanvasArtifactService,
        artifactExportService as Partial<CanvasArtifactExportService> as CanvasArtifactExportService
      )
      const result = await provider.getViewData(
        hostContext,
        CANVAS_WORKBENCH_VIEW_KEY,
        { page: 1, pageSize: 20, parameters: { documentId: 'doc-1' } } as XpertViewQuery
      ) as CanvasWorkbenchViewData

      expect(result.table?.items).toEqual([{ id: 'doc-1' }])
      expect(result.detail?.item.id).toBe('doc-1')
      expect(result.detail?.artifactShare).toEqual(expect.objectContaining({ artifactLinkId: 'link-1' }))
      expect(result.settings?.tldrawLicenseKey).toBe('tl-test-key')
      expect(result.settings?.artifactSharingAvailable).toBe(true)
      expect(service.searchDocuments).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant', organizationId: 'org' }), expect.objectContaining({}))
    } finally {
      if (previousLicenseKey === undefined) {
        delete process.env.TLDRAW_LICENSE_KEY
      } else {
        process.env.TLDRAW_LICENSE_KEY = previousLicenseKey
      }
    }
  })

  it('loads the latest document detail when no document id is provided', async () => {
    const service = {
      searchDocuments: jest.fn().mockResolvedValue({ items: [{ id: 'doc-latest' }], total: 1, page: 1, pageSize: 20 }),
      getDocument: jest.fn().mockResolvedValue({ item: { id: 'doc-latest' }, currentVersion: { id: 'version-latest' } })
    }
    const provider = new CanvasViewProvider(service as Partial<CanvasService> as CanvasService)
    const result = await provider.getViewData(
      hostContext,
      CANVAS_WORKBENCH_VIEW_KEY,
      { page: 1, pageSize: 20, parameters: {} } as XpertViewQuery
    ) as CanvasWorkbenchViewData

    expect(result.detail?.item.id).toBe('doc-latest')
    expect(service.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant', organizationId: 'org' }),
      expect.objectContaining({ documentId: 'doc-latest', includeSnapshot: true })
    )
  })

  it('executes prepare assistant prompt action', async () => {
    const service = {
      prepareAssistantPrompt: jest.fn().mockResolvedValue({
        commandKey: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
        payload: { text: 'use view_image files/canvas/documents/doc-1/snapshots/current.png' },
        snapshotImagePath: 'files/canvas/documents/doc-1/snapshots/current.png'
      })
    }
    const provider = new CanvasViewProvider(service as Partial<CanvasService> as CanvasService)
    const result = await provider.executeViewAction(
      hostContext,
      CANVAS_WORKBENCH_VIEW_KEY,
      'prepare_assistant_prompt',
      { targetId: 'doc-1', input: { instruction: 'check layout' } } as XpertViewActionRequest
    ) as CanvasActionResult

    expect(result.success).toBe(true)
    expect(result.refresh).toBe(false)
    expect(result.data?.commandKey).toBe(ASSISTANT_CHAT_SEND_MESSAGE_COMMAND)
    expect(service.prepareAssistantPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant', assistantId: 'assistant' }),
      expect.objectContaining({ documentId: 'doc-1', instruction: 'check layout' })
    )
  })

  it('executes document and version deletion actions', async () => {
    const service = {
      deleteDocument: jest.fn().mockResolvedValue({ success: true, deletedDocumentId: 'doc-1' }),
      deleteVersion: jest.fn().mockResolvedValue({ success: true, deletedVersionId: 'ver-1' })
    }
    const provider = new CanvasViewProvider(service as Partial<CanvasService> as CanvasService)

    await provider.executeViewAction(
      hostContext,
      CANVAS_WORKBENCH_VIEW_KEY,
      'delete_version',
      { targetId: 'doc-1', input: { versionId: 'ver-1' } } as XpertViewActionRequest
    )
    await provider.executeViewAction(
      hostContext,
      CANVAS_WORKBENCH_VIEW_KEY,
      'delete_document',
      { targetId: 'doc-1', input: {} } as XpertViewActionRequest
    )

    expect(service.deleteVersion).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant' }), 'doc-1', 'ver-1')
    expect(service.deleteDocument).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant' }), 'doc-1')
  })

  it('publishes and revokes Artifact shares without calling Canvas version creation', async () => {
    const service = { saveSnapshot: jest.fn() }
    const artifactService = {
      revoke: jest.fn().mockResolvedValue({ revoked: true })
    }
    const artifactExportService = {
      requestPublish: jest.fn().mockResolvedValue({ exportId: 'export-1', status: 'queued', stage: 'queued' }),
      getExport: jest.fn().mockResolvedValue({ exportId: 'export-1', status: 'succeeded', share: { artifactLinkId: 'link-1', shareUrl: '/artifacts/share/link-1' } })
    }
    const provider = new CanvasViewProvider(
      service as Partial<CanvasService> as CanvasService,
      artifactService as Partial<CanvasArtifactService> as CanvasArtifactService,
      artifactExportService as Partial<CanvasArtifactExportService> as CanvasArtifactExportService
    )

    const published = await provider.executeViewAction(
      hostContext,
      CANVAS_WORKBENCH_VIEW_KEY,
      'publish_artifact',
      {
        targetId: 'doc-1',
        input: {
          accessMode: 'public_link',
          targetMode: 'version',
          userConfirmedPublicLink: true,
          baseRevision: 5,
          baseSnapshotChecksum: 'checksum-1',
          pageId: 'page:page-1'
        }
      } as XpertViewActionRequest
    )
    const revoked = await provider.executeViewAction(
      hostContext,
      CANVAS_WORKBENCH_VIEW_KEY,
      'revoke_artifact_share',
      { targetId: 'doc-1', input: {} } as XpertViewActionRequest
    )
    const exportStatus = await provider.executeViewAction(
      hostContext,
      CANVAS_WORKBENCH_VIEW_KEY,
      'get_artifact_export',
      { targetId: 'doc-1', input: { exportId: 'export-1' } } as XpertViewActionRequest
    )

    expect(published.success).toBe(true)
    expect(revoked.success).toBe(true)
    expect(exportStatus.success).toBe(true)
    expect(artifactExportService.requestPublish).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant' }), expect.objectContaining({
      documentId: 'doc-1',
      baseRevision: 5,
      pageId: 'page:page-1'
    }))
    expect(artifactService.revoke).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant' }), 'doc-1')
    expect(artifactExportService.getExport).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant' }), 'export-1')
    expect(service.saveSnapshot).not.toHaveBeenCalled()
  })

  it('imports into an existing working copy without creating a version', async () => {
    const service = {
      importSnapshotToWorkingCopy: jest.fn().mockResolvedValue({ document: { id: 'doc-1' }, workingCopyRevision: 4 })
    }
    const provider = new CanvasViewProvider(service as Partial<CanvasService> as CanvasService)

    const result = await provider.executeViewFileAction(
      hostContext,
      CANVAS_WORKBENCH_VIEW_KEY,
      'import_snapshot_file',
      { targetId: 'doc-1', input: { documentId: 'doc-1' } } as XpertViewActionRequest,
      {
        originalname: 'import.tldr',
        buffer: Buffer.from(JSON.stringify({ schema: {}, store: {} }))
      } as XpertViewFileActionFile
    )

    expect(result.success).toBe(true)
    expect(service.importSnapshotToWorkingCopy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant' }),
      expect.objectContaining({ documentId: 'doc-1', changeSummary: 'Imported import.tldr' })
    )
  })
})
