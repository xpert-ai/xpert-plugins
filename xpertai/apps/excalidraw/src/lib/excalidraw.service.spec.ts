jest.mock('@xpert-ai/plugin-sdk', () => ({
  ArtifactsRuntimeCapability: Symbol('artifacts'),
  CollaborationRuntimeCapability: Symbol('collaboration'),
  WorkspaceFilesRuntimeCapability: Symbol('workspace-files'),
  WORKSPACE_FILES_SOURCE: 'platform.workspace.files',
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol('runtime-capabilities')
}))

import { BadRequestException } from '@nestjs/common'
import { ArtifactsRuntimeCapability, CollaborationRuntimeCapability, WorkspaceFilesRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { summarizeDrawingMutationResult } from './excalidraw-agent-response.js'
import { ExcalidrawService } from './excalidraw.service.js'

describe('ExcalidrawService patchScene', () => {
  let service: ExcalidrawService
  let drawings: MemoryRepository<any>
  let versions: MemoryRepository<any>
  let logs: MemoryRepository<any>
  let publications: MemoryRepository<any>

  beforeEach(() => {
    drawings = new MemoryRepository('drawing')
    versions = new MemoryRepository('version')
    logs = new MemoryRepository('log')
    publications = new MemoryRepository('publication')
    service = new ExcalidrawService(drawings as any, versions as any, logs as any, publications as any)
  })

  it('applies add, update, and delete operations into the current version', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Patch target',
      elements: [baseElement({ id: 'rect-1' }), textElement({ id: 'text-1' })],
      appState: {},
      files: {}
    })

    const result = await service.patchScene(testScope(), {
      drawingId: created.item.id,
      updateElements: [{ id: 'rect-1', x: 32 }],
      deleteElementIds: ['text-1'],
      addElements: [baseElement({ id: 'ellipse-1', type: 'ellipse', x: 200 })],
      changeSummary: 'Patch scene'
    })

    expect(result.patch).toEqual({
      addCount: 1,
      updateCount: 1,
      deleteCount: 1,
      addedIds: ['ellipse-1'],
      updatedIds: ['rect-1'],
      deletedIds: ['text-1']
    })
    expect(result.version.versionNumber).toBe(1)
    expect(result.version.elements.map((element: any) => element.id)).toEqual(['rect-1', 'ellipse-1'])
    expect(result.version.elements[0].x).toBe(32)
    expect(result.version.elements[0].version).toBe(2)
    expect(result.version.elements[0].versionNonce).not.toBe(1)
    expect(result.version.elements[0].updated).toBeGreaterThan(1)
    expect(await versions.find({ where: { drawingId: created.item.id } })).toHaveLength(1)
  })

  it('rejects updates for unknown element ids', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Patch target',
      elements: [baseElement({ id: 'rect-1' })]
    })

    await expect(
      service.patchScene(testScope(), {
        drawingId: created.item.id,
        updateElements: [{ id: 'missing', x: 10 }]
      })
    ).rejects.toThrow(BadRequestException)
  })

  it('rejects duplicate added ids', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Patch target',
      elements: [baseElement({ id: 'rect-1' })]
    })

    await expect(
      service.patchScene(testScope(), {
        drawingId: created.item.id,
        addElements: [baseElement({ id: 'new-1' }), baseElement({ id: 'new-1', x: 100 })]
      })
    ).rejects.toThrow(/duplicate/)
  })

  it('normalizes agent element metadata when appending elements', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Patch target'
    })

    const result = await service.patchScene(testScope(), {
      drawingId: created.item.id,
      addElements: [baseElement({ id: 'rect-agent', updated: undefined, index: 'f9' })],
      changeSummary: 'Agent append'
    })

    expect(result.version.elements[0].id).toBe('rect-agent')
    expect(Number.isFinite(result.version.elements[0].updated)).toBe(true)
    expect(result.version.elements[0].index).toBeNull()
  })

  it('fills Excalidraw defaults for shorthand added elements', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Friendly append target'
    })

    const result = await service.patchScene(testScope(), {
      drawingId: created.item.id,
      addElements: [
        {
          id: 'rect-short',
          type: 'rectangle',
          x: 10,
          y: 20,
          width: 160,
          height: 90
        },
        {
          id: 'text-short',
          type: 'text',
          x: 20,
          y: 40,
          text: 'Hello defaults'
        }
      ],
      changeSummary: 'Append shorthand elements'
    })

    const rect = result.version.elements[0]
    const text = result.version.elements[1]
    expect(rect).toEqual(expect.objectContaining({
      id: 'rect-short',
      roughness: 1,
      backgroundColor: 'transparent',
      locked: false,
      frameId: null,
      link: null,
      roundness: null
    }))
    expect(text).toEqual(expect.objectContaining({
      id: 'text-short',
      backgroundColor: 'transparent',
      originalText: 'Hello defaults',
      verticalAlign: 'top',
      autoResize: true,
      containerId: null,
      lineHeight: 1.25
    }))
  })

  it('normalizes invalid roundness metadata for added elements', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Roundness defaults target'
    })

    const result = await service.patchScene(testScope(), {
      drawingId: created.item.id,
      addElements: [
        {
          id: 'rect-round',
          type: 'rectangle',
          roundness: {
            type: 'adaptive',
            value: 'auto'
          }
        },
        {
          id: 'rect-round-null',
          type: 'rectangle',
          roundness: 'round'
        }
      ]
    })

    expect(result.version.elements[0].roundness).toEqual({ type: 3 })
    expect(result.version.elements[1].roundness).toBeNull()
  })

  it('normalizes arrowhead aliases and unsupported values for added linear elements', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Arrowhead defaults target'
    })

    const result = await service.patchScene(testScope(), {
      drawingId: created.item.id,
      addElements: [
        {
          id: 'arrow-short',
          type: 'arrow',
          startArrowhead: 'none',
          endArrowhead: 'arrowhead'
        },
        {
          id: 'line-short',
          type: 'line',
          startArrowhead: 'triangle-filled',
          endArrowhead: 'unsupported'
        },
        {
          id: 'arrow-fallback',
          type: 'arrow',
          startArrowhead: 'unsupported',
          endArrowhead: 'unsupported'
        }
      ]
    })

    const [arrow, line, fallbackArrow] = result.version.elements
    expect(arrow.startArrowhead).toBeNull()
    expect(arrow.endArrowhead).toBe('arrow')
    expect(line.startArrowhead).toBe('triangle')
    expect(line.endArrowhead).toBeNull()
    expect(fallbackArrow.startArrowhead).toBeNull()
    expect(fallbackArrow.endArrowhead).toBe('arrow')
  })

  it('normalizes arrowhead aliases in update patches', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Arrowhead update target',
      elements: [arrowElement({ id: 'arrow-1' })]
    })

    const result = await service.patchScene(testScope(), {
      drawingId: created.item.id,
      updateElements: [
        {
          id: 'arrow-1',
          startArrowhead: 'open-triangle',
          endArrowhead: 'normal'
        }
      ]
    })

    expect(result.version.elements[0].startArrowhead).toBe('triangle_outline')
    expect(result.version.elements[0].endArrowhead).toBe('arrow')
  })

  it('normalizes invalid roundness metadata in update patches', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Roundness update target',
      elements: [baseElement({ id: 'rect-1' })]
    })

    const result = await service.patchScene(testScope(), {
      drawingId: created.item.id,
      updateElements: [
        {
          id: 'rect-1',
          roundness: {
            type: 'round',
            value: Number.NaN
          }
        }
      ]
    })

    expect(result.version.elements[0].roundness).toEqual({ type: 3 })
  })

  it('keeps explicit higher element mutation metadata from update patches', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Explicit metadata target',
      elements: [baseElement({ id: 'rect-1', version: 4, versionNonce: 44, updated: 100 })]
    })

    const result = await service.patchScene(testScope(), {
      drawingId: created.item.id,
      updateElements: [
        {
          id: 'rect-1',
          x: 12,
          version: 8,
          versionNonce: 88,
          updated: 120
        }
      ]
    })

    expect(result.version.elements[0]).toEqual(expect.objectContaining({
      x: 12,
      version: 8,
      versionNonce: 88,
      updated: 120
    }))
  })

  it('saves a complete scene into the current version without incrementing version number', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Current save target',
      elements: [baseElement({ id: 'rect-1' })]
    })

    const result = await service.saveCurrentScene(testScope(), {
      drawingId: created.item.id,
      elements: [baseElement({ id: 'rect-2', x: 80 })],
      appState: { viewBackgroundColor: '#fff' },
      files: {},
      sourceType: 'agent_json',
      changeSummary: 'Replace current scene'
    })

    expect(result.version.id).toBe(created.currentVersion.id)
    expect(result.version.versionNumber).toBe(1)
    expect(result.version.elements.map((element: any) => element.id)).toEqual(['rect-2'])
    expect(await versions.find({ where: { drawingId: created.item.id } })).toHaveLength(1)
  })

  it('rejects no-op patches', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Patch target',
      elements: [baseElement({ id: 'rect-1' })]
    })

    await expect(
      service.patchScene(testScope(), {
        drawingId: created.item.id,
        updateElements: [{ id: 'rect-1' }]
      })
    ).rejects.toThrow(/did not change/)
  })

  it('rejects element type changes', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Patch target',
      elements: [baseElement({ id: 'rect-1' })]
    })

    await expect(
      service.patchScene(testScope(), {
        drawingId: created.item.id,
        updateElements: [{ id: 'rect-1', type: 'ellipse' }]
      })
    ).rejects.toThrow(/type/)
  })

  it('returns compact agent metadata by default', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Agent summary target',
      elements: [baseElement({ id: 'rect-1' }), textElement({ id: 'text-1' })],
      appState: { viewBackgroundColor: '#fff' },
      files: { file1: { id: 'file1', dataURL: 'data:image/png;base64,large' } }
    })

    const result = await service.getDrawingForAgent(testScope(), {
      drawingId: created.item.id
    })

    expect(result.item.id).toBe(created.item.id)
    expect(result.currentVersion.elementCount).toBe(2)
    expect(result.currentVersion.fileCount).toBe(1)
    expect(result.currentVersion.drawingId).toBeUndefined()
    expect(result.scene).toBeUndefined()
    expect(result.versions[0].elements).toBeUndefined()
    expect(result.nextActions).toContain('excalidraw_get_scene_item')
  })

  it('returns paged lightweight scene refs only when explicitly requested', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Paged scene target',
      elements: [
        baseElement({ id: 'rect-1' }),
        textElement({ id: 'text-1', text: 'A long label that should stay compact in the get drawing response' }),
        baseElement({ id: 'diamond-1', type: 'diamond', x: 220 })
      ],
      appState: { viewBackgroundColor: '#fff', collaborators: { heavy: true } },
      files: { file1: { id: 'file1', dataURL: 'data:image/png;base64,large' } }
    })

    const result = await service.getDrawingForAgent(testScope(), {
      drawingId: created.item.id,
      includeScene: true,
      versionNumber: 1,
      elementOffset: 1,
      elementLimit: 1
    })

    expect(result.scene.version.versionNumber).toBe(1)
    expect(result.scene.elements.map((element: any) => element.id)).toEqual(['text-1'])
    expect(result.scene.elements[0].textPreview).toContain('A long label')
    expect(result.scene.elements[0].text).toBeUndefined()
    expect(result.scene.returnedElementCount).toBe(1)
    expect(result.scene.totalElementCount).toBe(3)
    expect(result.scene.hasMoreElements).toBe(true)
    expect(result.scene.appState.keys).toContain('viewBackgroundColor')
    expect(result.scene.appState.collaborators).toBeUndefined()
    expect(result.scene.files).toEqual([{ id: 'file1', dataURLLength: 27 }])
    expect(result.scene.files[0].dataURL).toBeUndefined()
    expect(result.scene.nextActions).toContain('excalidraw_get_scene_item')
  })

  it('returns full scene items through targeted item reads', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Scene item target',
      elements: [baseElement({ id: 'rect-1' }), textElement({ id: 'text-1', text: 'Full text' })],
      appState: { viewBackgroundColor: '#fff', customState: { nested: true } },
      files: { file1: { id: 'file1', dataURL: 'data:image/png;base64,large' } },
      mermaidSource: 'flowchart TD\n  A --> B'
    })

    const element = await service.getSceneItemForAgent(testScope(), {
      drawingId: created.item.id,
      itemType: 'element',
      versionNumber: 1,
      elementId: 'text-1'
    })
    expect(element.element.text).toBe('Full text')
    expect(element.version.versionNumber).toBe(1)
    expect(element.version.drawingId).toBeUndefined()

    const appState = await service.getSceneItemForAgent(testScope(), {
      drawingId: created.item.id,
      itemType: 'appState',
      versionNumber: 1
    })
    expect(appState.appState.customState).toEqual({ nested: true })

    const file = await service.getSceneItemForAgent(testScope(), {
      drawingId: created.item.id,
      itemType: 'file',
      versionNumber: 1,
      fileId: 'file1'
    })
    expect(file.file.dataURL).toBe('data:image/png;base64,large')

    const mermaid = await service.getSceneItemForAgent(testScope(), {
      drawingId: created.item.id,
      itemType: 'mermaidSource',
      versionNumber: 1
    })
    expect(mermaid.mermaidSource).toContain('A --> B')
  })

  it('summarizes mutation results without returning scene payloads', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Mutation summary target',
      elements: [baseElement({ id: 'rect-1' })]
    })
    const patched = await service.patchScene(testScope(), {
      drawingId: created.item.id,
      updateElements: [{ id: 'rect-1', x: 48 }]
    })

    const summary = summarizeDrawingMutationResult(patched as any, 'patched') as any

    expect(summary).toEqual(expect.objectContaining({
      success: true
    }))
    expect(summary.drawingId).toBeUndefined()
    expect(summary.versionId).toBeUndefined()
    expect(summary.versionNumber).toBeUndefined()
    expect(summary.drawing).toBeUndefined()
    expect(summary.version).toBeUndefined()
    expect(summary.currentVersion).toBeUndefined()
    expect(summary.summary).toBeUndefined()
    expect(summary.patch.updateCount).toBe(1)
  })

  it('physically deletes a drawing with its versions and logs', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Delete target',
      elements: [baseElement({ id: 'rect-1' })]
    })
    await service.saveSceneVersion(testScope(), {
      drawingId: created.item.id,
      elements: [baseElement({ id: 'rect-2', x: 40 })],
      changeSummary: 'Second version'
    })

    expect(await drawings.find()).toHaveLength(1)
    expect(await versions.find()).toHaveLength(2)
    expect((await logs.find()).length).toBeGreaterThan(0)

    const result = await service.deleteDrawing(testScope(), created.item.id)

    expect(result.drawingId).toBe(created.item.id)
    await expect(service.getDrawing(testScope(), created.item.id)).rejects.toThrow(/not found/i)
    expect(await drawings.find()).toHaveLength(0)
    expect(await versions.find()).toHaveLength(0)
    expect(await logs.find()).toHaveLength(0)
  })

  it('physically deletes versions and promotes the latest remaining version', async () => {
    const created = await service.createDrawing(testScope(), {
      title: 'Version delete target',
      elements: [baseElement({ id: 'rect-1' })]
    })
    const firstVersionId = created.currentVersion.id
    const second = await service.saveSceneVersion(testScope(), {
      drawingId: created.item.id,
      elements: [baseElement({ id: 'rect-2', x: 40 })],
      changeSummary: 'Second version'
    })

    const afterSecondDelete = await service.deleteVersion(testScope(), created.item.id, second.version.id)

    expect(afterSecondDelete.currentVersionId).toBe(firstVersionId)
    expect(afterSecondDelete.currentVersionNumber).toBe(1)
    expect(afterSecondDelete.drawing.currentVersion.id).toBe(firstVersionId)
    expect(afterSecondDelete.drawing.versions.map((version: any) => version.versionNumber)).toEqual([1])
    expect(await logs.find({ where: { versionId: second.version.id } })).toHaveLength(0)

    const afterFirstDelete = await service.deleteVersion(testScope(), created.item.id, firstVersionId)

    expect(afterFirstDelete.currentVersionId).toBeNull()
    expect(afterFirstDelete.currentVersionNumber).toBe(0)
    expect(afterFirstDelete.drawing.currentVersion).toBeNull()
    expect(afterFirstDelete.drawing.item.currentVersionId).toBeNull()
    expect(afterFirstDelete.drawing.item.currentVersionNumber).toBe(0)
    expect(afterFirstDelete.drawing.versions).toHaveLength(0)
  })
})

describe('ExcalidrawService Artifact sharing', () => {
  it('requires explicit confirmation, publishes HTML, and reuses unchanged content', async () => {
    const drawings = new MemoryRepository<any>('drawing')
    const versions = new MemoryRepository<any>('version')
    const logs = new MemoryRepository<any>('log')
    const publications = new MemoryRepository<any>('publication')
    const workspaceFiles = {
      uploadBuffer: jest.fn(async ({ originalName, size }) => ({
        name: originalName,
        filePath: `files/${originalName}`,
        workspacePath: `/workspace/files/${originalName}`,
        mimeType: 'text/html',
        size,
        catalog: 'xperts'
      })),
      deleteFile: jest.fn()
    }
    const artifacts = {
      createArtifact: jest.fn(async () => ({ id: 'artifact-1' })),
      createArtifactVersion: jest.fn(async () => ({ id: 'artifact-version-1' })),
      createArtifactLink: jest.fn(async () => ({
        id: 'artifact-link-1',
        versionMode: 'latest',
        accessMode: 'public_link',
        allowDownload: false,
        publicUrl: 'https://example.test/custom/artifact-link/opaque'
      })),
      updateArtifactLinkAccess: jest.fn(async (_linkId, patch) => ({
        id: 'artifact-link-1',
        versionMode: patch.versionMode,
        accessMode: patch.access.mode,
        allowDownload: false,
        publicUrl: 'https://example.test/custom/artifact-link/opaque'
      })),
      revokeArtifactLink: jest.fn(async () => undefined),
      deleteArtifact: jest.fn(async () => undefined)
    }
    const runtime = {
      get: jest.fn((key) => {
        if (key === WorkspaceFilesRuntimeCapability) return workspaceFiles
        if (key === ArtifactsRuntimeCapability) return artifacts
        if (key === CollaborationRuntimeCapability) return null
        return null
      })
    }
    const service = new ExcalidrawService(
      drawings as any,
      versions as any,
      logs as any,
      publications as any,
      runtime as any,
      artifactViewer('viewer-checksum') as any
    )
    const created = await service.createDrawing(testScope(), {
      title: 'Share target',
      elements: [baseElement({ id: 'rect-share' })]
    })
    await expect(service.publishDrawingViewerArtifact(testScope(), {
      drawingId: created.item.id,
      accessMode: 'public_link',
      userConfirmedPublicLink: false
    })).rejects.toThrow(/confirmation/i)

    const first = await service.publishDrawingViewerArtifact(testScope(), {
      drawingId: created.item.id,
      accessMode: 'public_link',
      userConfirmedPublicLink: true
    })
    const second = await service.publishDrawingViewerArtifact(testScope(), {
      drawingId: created.item.id,
      accessMode: 'public_link',
      userConfirmedPublicLink: true
    })
    const updated = await service.publishDrawingViewerArtifact(testScope(), {
      drawingId: created.item.id,
      accessMode: 'organization_all'
    })

    expect(first.shareUrl).toBe('https://example.test/custom/artifact-link/opaque')
    expect(first.publicUrl).toBe(first.shareUrl)
    expect(second.artifactLinkId).toBe(first.artifactLinkId)
    expect(updated.accessMode).toBe('organization_all')
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledTimes(1)
    expect(workspaceFiles.uploadBuffer).toHaveBeenCalledWith(expect.objectContaining({
      mimeType: 'text/html',
      folder: `files/excalidraw/artifacts/${created.item.id}`
    }))
    expect(artifacts.createArtifact).toHaveBeenCalledWith(expect.objectContaining({
      source: expect.objectContaining({ resourceType: 'excalidraw_drawing_viewer' }),
      kind: 'html'
    }))
    expect(artifacts.createArtifactVersion).toHaveBeenCalledWith(expect.objectContaining({
      mimeType: 'text/html',
      fileName: 'Share target.html'
    }))
    expect(artifacts.createArtifactVersion).toHaveBeenCalledTimes(1)
    expect(artifacts.createArtifactLink).toHaveBeenCalledTimes(1)
    expect(artifacts.createArtifactLink).toHaveBeenCalledWith(expect.objectContaining({
      presentation: { disposition: 'inline', allowDownload: false, safeHtmlProfile: 'interactive' }
    }))
    expect(artifacts.updateArtifactLinkAccess).toHaveBeenCalledTimes(1)
  })

  it('migrates an active SVG publication only after the HTML link succeeds', async () => {
    const drawings = new MemoryRepository<any>('drawing')
    const versions = new MemoryRepository<any>('version')
    const logs = new MemoryRepository<any>('log')
    const publications = new MemoryRepository<any>('publication')
    const workspaceFiles = {
      uploadBuffer: jest.fn(async ({ originalName, size }) => ({
        name: originalName,
        filePath: `files/${originalName}`,
        workspacePath: `/workspace/files/${originalName}`,
        mimeType: 'text/html',
        size
      })),
      deleteFile: jest.fn(async () => undefined)
    }
    const artifacts = {
      createArtifact: jest.fn(async () => ({ id: 'artifact-html' })),
      createArtifactVersion: jest.fn(async () => ({ id: 'version-html' })),
      createArtifactLink: jest.fn(async () => ({
        id: 'link-html',
        versionMode: 'latest',
        accessMode: 'organization_all',
        allowDownload: false,
        publicUrl: 'https://example.test/artifacts/share/html'
      })),
      updateArtifactLinkAccess: jest.fn(),
      revokeArtifactLink: jest.fn(async () => undefined),
      deleteArtifact: jest.fn(async () => undefined)
    }
    const runtime = {
      get: jest.fn((key) => key === WorkspaceFilesRuntimeCapability
        ? workspaceFiles
        : key === ArtifactsRuntimeCapability ? artifacts : null)
    }
    const service = new ExcalidrawService(
      drawings as any,
      versions as any,
      logs as any,
      publications as any,
      runtime as any,
      artifactViewer('html-checksum') as any
    )
    const created = await service.createDrawing(testScope(), {
      title: 'Legacy SVG share',
      elements: [baseElement({ id: 'legacy-rect' })]
    })
    await publications.save({
      ...testScope(),
      drawingId: created.item.id,
      collaborationSequence: 1,
      checksum: 'legacy-svg-checksum',
      fileName: 'legacy.svg',
      mimeType: 'image/svg+xml',
      size: 120,
      sha256: 'legacy-svg-checksum',
      workspaceFileReference: { source: 'platform.workspace.files', filePath: 'files/legacy.svg', workspacePath: '/workspace/files/legacy.svg' },
      artifactId: 'artifact-svg',
      artifactVersionId: 'version-svg',
      artifactLinkId: 'link-svg',
      artifactLinkVersionMode: 'latest',
      artifactLinkAccessMode: 'organization_all',
      allowDownload: true,
      publicUrl: 'https://example.test/artifacts/share/svg',
      status: 'active'
    })

    const result = await service.publishDrawingViewerArtifact(testScope(), {
      drawingId: created.item.id,
      accessMode: 'organization_all'
    })

    expect(result.shareUrl).toBe('https://example.test/artifacts/share/html')
    expect(artifacts.createArtifactLink.mock.invocationCallOrder[0]).toBeLessThan(artifacts.revokeArtifactLink.mock.invocationCallOrder[0])
    expect(artifacts.revokeArtifactLink).toHaveBeenCalledWith('link-svg')
    expect(artifacts.deleteArtifact).toHaveBeenCalledWith('artifact-svg')
    expect(workspaceFiles.deleteFile).toHaveBeenCalledWith(expect.objectContaining({ filePath: 'files/legacy.svg' }))
    expect((await publications.find({ where: { drawingId: created.item.id, status: 'superseded' } }))).toHaveLength(1)
  })

  it('keeps the legacy SVG link active when HTML link creation fails', async () => {
    const drawings = new MemoryRepository<any>('drawing')
    const versions = new MemoryRepository<any>('version')
    const publications = new MemoryRepository<any>('publication')
    const workspaceFiles = {
      uploadBuffer: jest.fn(async ({ originalName, size }) => ({
        name: originalName,
        filePath: `files/${originalName}`,
        workspacePath: `/workspace/files/${originalName}`,
        mimeType: 'text/html',
        size
      })),
      deleteFile: jest.fn(async () => undefined)
    }
    const artifacts = {
      createArtifact: jest.fn(async () => ({ id: 'artifact-html' })),
      createArtifactVersion: jest.fn(async () => ({ id: 'version-html' })),
      createArtifactLink: jest.fn(async () => { throw new Error('link failed') }),
      updateArtifactLinkAccess: jest.fn(),
      revokeArtifactLink: jest.fn(async () => undefined),
      deleteArtifact: jest.fn(async () => undefined)
    }
    const runtime = {
      get: jest.fn((key) => key === WorkspaceFilesRuntimeCapability
        ? workspaceFiles
        : key === ArtifactsRuntimeCapability ? artifacts : null)
    }
    const service = new ExcalidrawService(
      drawings as any,
      versions as any,
      new MemoryRepository<any>('log') as any,
      publications as any,
      runtime as any,
      artifactViewer('failed-html-checksum') as any
    )
    const created = await service.createDrawing(testScope(), {
      title: 'Failed migration',
      elements: [baseElement({ id: 'legacy-rect' })]
    })
    const legacy = await publications.save({
      ...testScope(), drawingId: created.item.id, collaborationSequence: 1,
      checksum: 'legacy', fileName: 'legacy.svg', mimeType: 'image/svg+xml', size: 100, sha256: 'legacy',
      workspaceFileReference: { source: 'platform.workspace.files', filePath: 'legacy.svg', workspacePath: '/workspace/legacy.svg' },
      artifactId: 'artifact-svg', artifactVersionId: 'version-svg', artifactLinkId: 'link-svg',
      artifactLinkVersionMode: 'latest', artifactLinkAccessMode: 'organization_all', allowDownload: true,
      publicUrl: 'https://example.test/artifacts/share/svg', status: 'active'
    })

    await expect(service.publishDrawingViewerArtifact(testScope(), {
      drawingId: created.item.id,
      accessMode: 'organization_all'
    })).rejects.toThrow('link failed')

    expect((await publications.findOne({ where: { id: legacy.id } }))?.status).toBe('active')
    expect(artifacts.revokeArtifactLink).not.toHaveBeenCalled()
    expect(artifacts.deleteArtifact).not.toHaveBeenCalled()
    expect(workspaceFiles.deleteFile).not.toHaveBeenCalled()
  })

  it('fails clearly when Workspace Files is unavailable', async () => {
    const drawings = new MemoryRepository<any>('drawing')
    const versions = new MemoryRepository<any>('version')
    const service = new ExcalidrawService(
      drawings as any,
      versions as any,
      new MemoryRepository<any>('log') as any,
      new MemoryRepository<any>('publication') as any,
      { get: jest.fn(() => null) } as any,
      artifactViewer('missing-capability') as any
    )
    const created = await service.createDrawing(testScope(), { title: 'Missing capability' })
    await expect(service.publishDrawingViewerArtifact(testScope(), {
      drawingId: created.item.id,
      accessMode: 'organization_all'
    })).rejects.toThrow(/Workspace Files capability/i)

    const workspaceFiles = { uploadBuffer: jest.fn() }
    const missingArtifactsService = new ExcalidrawService(
      drawings as any,
      versions as any,
      new MemoryRepository<any>('log') as any,
      new MemoryRepository<any>('publication') as any,
      { get: jest.fn((key) => key === WorkspaceFilesRuntimeCapability ? workspaceFiles : null) } as any,
      artifactViewer('missing-artifacts') as any
    )
    await expect(missingArtifactsService.publishDrawingViewerArtifact(testScope(), {
      drawingId: created.item.id,
      accessMode: 'organization_all'
    })).rejects.toThrow(/Artifacts capability/i)
    expect(workspaceFiles.uploadBuffer).not.toHaveBeenCalled()
  })
})

class MemoryRepository<T extends { id?: string }> {
  private sequence = 0
  private items: T[] = []

  constructor(private readonly prefix: string) {}

  create(value: Partial<T>) {
    return { ...value } as T
  }

  async save(value: Partial<T>) {
    const item = {
      ...value,
      id: value.id ?? `${this.prefix}-${++this.sequence}`
    } as T
    const index = this.items.findIndex((candidate) => candidate.id === item.id)
    if (index >= 0) {
      this.items[index] = { ...this.items[index], ...item }
    } else {
      this.items.push(item)
    }
    return this.items.find((candidate) => candidate.id === item.id) as T
  }

  async find(options: { where?: Partial<T>; order?: Record<string, 'ASC' | 'DESC'> } = {}) {
    const filtered = this.items.filter((item) => matchesWhere(item, options.where))
    const [orderKey, orderDirection] = Object.entries(options.order ?? {})[0] ?? []
    if (orderKey) {
      filtered.sort((left: any, right: any) => {
        const leftValue = left[orderKey]
        const rightValue = right[orderKey]
        if (leftValue === rightValue) {
          return 0
        }
        const direction = orderDirection === 'DESC' ? -1 : 1
        return leftValue > rightValue ? direction : -direction
      })
    }
    return filtered
  }

  async findOne(options: { where?: Partial<T> } = {}) {
    return this.items.find((item) => matchesWhere(item, options.where)) ?? null
  }

  async delete(where: Partial<T> = {}) {
    const beforeCount = this.items.length
    this.items = this.items.filter((item) => !matchesWhere(item, where))
    return {
      affected: beforeCount - this.items.length,
      raw: []
    }
  }
}

function matchesWhere<T extends Record<string, unknown>>(item: T, where: Partial<T> = {}) {
  return Object.entries(where).every(([key, value]) => item[key] === value)
}

function testScope() {
  return {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    workspaceId: null,
    projectId: null,
    userId: 'user-1',
    assistantId: 'assistant-1',
    conversationId: 'conversation-1'
  }
}

function artifactViewer(checksum: string) {
  const buffer = Buffer.from('<!doctype html><html><body><div id="root"></div></body></html>')
  return {
    render: jest.fn(async () => ({
      buffer,
      checksum,
      sha256: checksum,
      size: buffer.byteLength,
      mimeType: 'text/html' as const,
      viewerVersion: 1,
      theme: 'light' as const
    }))
  }
}

function baseElement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'element-1',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'hachure',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...overrides
  }
}

function textElement(overrides: Record<string, unknown> = {}) {
  return {
    ...baseElement({ type: 'text', width: 80, height: 24 }),
    fontSize: 20,
    fontFamily: 5,
    text: 'Hello',
    textAlign: 'left',
    verticalAlign: 'top',
    containerId: null,
    originalText: 'Hello',
    autoResize: true,
    lineHeight: 1.25,
    ...overrides
  }
}

function arrowElement(overrides: Record<string, unknown> = {}) {
  return {
    ...baseElement({ type: 'arrow', width: 100, height: 0 }),
    points: [
      [0, 0],
      [100, 0]
    ],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: 'arrow',
    elbowed: false,
    ...overrides
  }
}
