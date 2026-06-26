import 'reflect-metadata'
jest.mock('@xpert-ai/plugin-sdk', () => ({
  ViewExtensionProvider: () => (target: Function) => target,
  renderRemoteReactIframeHtml: jest.fn(() => '<html></html>')
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
import {
  ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  ASSISTANT_CONTEXT_SET_COMMAND,
  CANVAS_MIDDLEWARE_TOOL_NAMES,
  CANVAS_REMOTE_ENTRY_KEY,
  CANVAS_WORKBENCH_VIEW_KEY
} from './constants.js'
import type { CanvasService } from './canvas.service.js'

type RemoteManifestView = {
  component: {
    entry: string
  }
}

type FileTransportAction = {
  key?: string
  transport?: string
}

type CanvasWorkbenchViewData = Awaited<ReturnType<CanvasViewProvider['getViewData']>> & {
  table?: {
    items?: Array<{ id: string }>
  }
  detail?: {
    item: {
      id: string
    }
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
    expect(manifest.actions?.map((action) => action.key)).toEqual(expect.arrayContaining(['autosave_snapshot', 'prepare_assistant_prompt']))
    expect(manifest.actions?.some((action) => action.key === 'import_snapshot_file' && (action as FileTransportAction).transport === 'file')).toBe(true)
    expect(manifest.hostEvents?.subscriptions?.[0].filter?.toolNames).toEqual([...CANVAS_MIDDLEWARE_TOOL_NAMES])
  })

  it('loads paginated view data and optional detail', async () => {
    const service = {
      searchDocuments: jest.fn().mockResolvedValue({ items: [{ id: 'doc-1' }], total: 1, page: 1, pageSize: 20 }),
      getDocument: jest.fn().mockResolvedValue({ item: { id: 'doc-1' } })
    }
    const provider = new CanvasViewProvider(service as Partial<CanvasService> as CanvasService)
    const result = await provider.getViewData(
      hostContext,
      CANVAS_WORKBENCH_VIEW_KEY,
      { page: 1, pageSize: 20, parameters: { documentId: 'doc-1' } } as XpertViewQuery
    ) as CanvasWorkbenchViewData

    expect(result.table?.items).toEqual([{ id: 'doc-1' }])
    expect(result.detail?.item.id).toBe('doc-1')
    expect(service.searchDocuments).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant', organizationId: 'org' }), expect.objectContaining({}))
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
})
