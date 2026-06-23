jest.mock('@xpert-ai/plugin-sdk', () => ({
  ViewExtensionProvider: () => (target: unknown) => target,
  renderRemoteReactIframeHtml: jest.fn()
}))

import {
  AGENT_WORKBENCH_FIXED_SLOT,
  ASSISTANT_CONTEXT_SET_COMMAND,
  EXCALIDRAW_WORKBENCH_VIEW_KEY,
} from './constants.js'
import { ExcalidrawViewProvider } from './excalidraw-view.provider.js'

describe('ExcalidrawViewProvider selection assistant context', () => {
  it('declares assistant context client command', () => {
    const provider = new ExcalidrawViewProvider({} as never)
    const manifests = provider.getViewManifests(testContext(), AGENT_WORKBENCH_FIXED_SLOT)

    expect(manifests).toHaveLength(1)
    expect(manifests[0].clientCommands?.map((command) => command.key)).toEqual([ASSISTANT_CONTEXT_SET_COMMAND])
  })

  it('declares only the supported workbench actions', () => {
    const provider = new ExcalidrawViewProvider({} as never)
    const manifests = provider.getViewManifests(testContext(), AGENT_WORKBENCH_FIXED_SLOT)

    expect(manifests[0].actions?.map((action) => action.key)).toEqual([
      'refresh',
      'create_drawing',
      'save_current_scene',
      'save_scene_version',
      'restore_version',
      'mark_reviewed',
      'mark_draft',
      'archive_drawing',
      'delete_drawing',
      'delete_version',
      'import_scene_file',
      'import_restored_scene',
      'save_converted_mermaid_scene'
    ])
  })

  it('saves restored imported scenes through the normal action channel', async () => {
    const saveCurrentScene = jest.fn(async (_scope, input) => ({
      success: true,
      item: { id: input.drawingId },
      currentVersion: { elements: input.elements }
    }))
    const provider = new ExcalidrawViewProvider({ saveCurrentScene } as never)

    const result = await provider.executeViewAction(testContext(), EXCALIDRAW_WORKBENCH_VIEW_KEY, 'import_restored_scene', {
      input: {
        drawingId: 'drawing-1',
        elements: [{ id: 'rect-1', type: 'rectangle' }],
        appState: { viewBackgroundColor: '#fff' },
        files: {},
        changeSummary: 'Imported demo.excalidraw'
      },
      parameters: {}
    } as never)

    expect(result.success).toBe(true)
    expect(saveCurrentScene).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1' }),
      expect.objectContaining({
        drawingId: 'drawing-1',
        elements: [{ id: 'rect-1', type: 'rectangle' }],
        appState: { viewBackgroundColor: '#fff' },
        files: {},
        sourceType: 'import',
        changeSummary: 'Imported demo.excalidraw'
      })
    )
  })
})

function testContext() {
  return {
    hostType: 'agent',
    hostId: 'assistant-1',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    userId: 'user-1',
    locale: 'zh-Hans'
  } as never
}
