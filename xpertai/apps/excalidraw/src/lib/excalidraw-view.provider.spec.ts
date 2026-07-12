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
  it('always exposes the ten built-in technical diagram templates to the Workbench', async () => {
    const provider = new ExcalidrawViewProvider(
      { getWorkbenchData: jest.fn(async () => ({ items: [], total: 0 })) } as never,
      {} as never,
      {} as never
    )

    const result = await provider.getViewData(
      { hostType: 'agent', tenantId: 'tenant-1', organizationId: 'org-1' } as never,
      'excalidraw_workbench',
      { parameters: {} } as never
    ) as any

    expect(result.diagramTemplates).toHaveLength(10)
    expect(result.diagramTemplates.map((item: any) => item.key)).toContain('agent-tool-loop')
  })

  it('declares assistant context client command', () => {
    const provider = new ExcalidrawViewProvider({} as never, {} as never, {} as never)
    const manifests = provider.getViewManifests(testContext(), AGENT_WORKBENCH_FIXED_SLOT)

    expect(manifests).toHaveLength(1)
    expect(manifests[0].clientCommands?.map((command) => command.key)).toEqual([ASSISTANT_CONTEXT_SET_COMMAND])
  })

  it('declares only the supported workbench actions', () => {
    const provider = new ExcalidrawViewProvider({} as never, {} as never, {} as never)
    const manifests = provider.getViewManifests(testContext(), AGENT_WORKBENCH_FIXED_SLOT)

    expect(manifests[0].actions?.map((action) => action.key)).toEqual([
      'refresh',
      'create_drawing',
      'save_current_scene',
      'save_scene_version',
      'open_collaboration',
      'publish_artifact',
      'revoke_artifact_share',
      'inspect_diagram_template',
      'instantiate_diagram_template',
      'render_diagram_ir',
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
    expect(manifests[0].actions?.find((action) => action.key === 'publish_artifact')).not.toHaveProperty('transport')
  })

  it('publishes the HTML viewer through the normal action channel', async () => {
    const publishDrawingViewerArtifact = jest.fn(async () => ({
      artifactId: 'artifact-1',
      artifactVersionId: 'version-1',
      artifactLinkId: 'link-1',
      publicUrl: 'https://example.test/artifacts/share/opaque',
      shareUrl: 'https://example.test/artifacts/share/opaque'
    }))
    const provider = new ExcalidrawViewProvider(
      { publishDrawingViewerArtifact } as never,
      {} as never,
      {} as never
    )

    const result = await provider.executeViewAction(testContext(), EXCALIDRAW_WORKBENCH_VIEW_KEY, 'publish_artifact', {
      input: {
        drawingId: 'drawing-1',
        versionMode: 'latest',
        accessMode: 'public_link',
        userConfirmedPublicLink: true
      },
      parameters: {}
    } as never)

    expect(result.success).toBe(true)
    expect(publishDrawingViewerArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1' }),
      {
        drawingId: 'drawing-1',
        versionMode: 'latest',
        accessMode: 'public_link',
        userConfirmedPublicLink: true
      }
    )
  })

  it('saves restored imported scenes through the normal action channel', async () => {
    const saveCurrentScene = jest.fn(async (_scope, input) => ({
      success: true,
      item: { id: input.drawingId },
      currentVersion: { elements: input.elements }
    }))
    const provider = new ExcalidrawViewProvider(
      { saveCurrentScene } as never,
      {} as never,
      { markDiverged: jest.fn() } as never
    )

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

  it('instantiates and renders a new drawing from a template by default', async () => {
    const instantiateTemplate = jest.fn(async () => ({ drawingId: 'drawing-template', revision: 1 }))
    const render = jest.fn(async () => ({ drawingId: 'drawing-template', revision: 2, status: 'rendered' }))
    const provider = new ExcalidrawViewProvider({} as never, {} as never, { instantiateTemplate, render } as never)

    const result = await provider.executeViewAction(testContext(), EXCALIDRAW_WORKBENCH_VIEW_KEY, 'instantiate_diagram_template', {
      input: { key: 'rag-pipeline', version: '1.0.0', parameters: { title: 'RAG' } },
      parameters: {}
    } as never)

    expect(result.success).toBe(true)
    expect(instantiateTemplate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      key: 'rag-pipeline', drawingId: undefined, replaceCurrent: false
    }))
    expect(render).toHaveBeenCalledWith(expect.anything(), {
      drawingId: 'drawing-template', expectedRevision: 1, replaceDiverged: false
    })
  })

  it('refuses current-drawing template replacement without explicit confirmation', async () => {
    const instantiateTemplate = jest.fn()
    const provider = new ExcalidrawViewProvider({} as never, {} as never, { instantiateTemplate } as never)

    const result = await provider.executeViewAction(testContext(), EXCALIDRAW_WORKBENCH_VIEW_KEY, 'instantiate_diagram_template', {
      input: { key: 'rag-pipeline', drawingId: 'drawing-1', expectedRevision: 3, parameters: { title: 'RAG' } },
      parameters: {}
    } as never)

    expect(result.success).toBe(false)
    expect(instantiateTemplate).not.toHaveBeenCalled()
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
