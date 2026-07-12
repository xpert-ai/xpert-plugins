jest.mock('@xpert-ai/plugin-sdk', () => ({
  ArtifactsRuntimeCapability: Symbol('artifacts'),
  CollaborationRuntimeCapability: Symbol('collaboration'),
  WorkspaceFilesRuntimeCapability: Symbol('workspace-files'),
  WORKSPACE_FILES_SOURCE: 'platform.workspace.files',
  XPERT_RUNTIME_CAPABILITIES_TOKEN: Symbol('runtime-capabilities')
}))

import { ConflictException, NotFoundException } from '@nestjs/common'
import { DiagramIrService } from './diagram-ir.service.js'
import { ArtifactTemplateCatalogService, BUILTIN_DIAGRAM_TEMPLATES, DiagramArtifactTemplateAdapter } from './artifact-template-catalog.service.js'
import { DiagramLayoutService, DiagramRoutingService } from './diagram-layout.service.js'
import { DiagramCompilerService, DiagramValidationService } from './diagram-rendering.service.js'
import { DiagramIrRevision } from './entities/index.js'
import type { ExcalidrawScope } from '../types.js'

function scope(tenantId: string): ExcalidrawScope {
  return {
    tenantId,
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    projectId: null,
    userId: 'user-1',
    assistantId: 'assistant-1'
  }
}

function createFixture() {
  const rows: DiagramIrRevision[] = []
  let id = 0
  const repository = {
    create: jest.fn((value) => Object.assign(new DiagramIrRevision(), value, { id: `ir-${++id}` })),
    save: jest.fn(async (value) => {
      rows.push(value)
      return value
    }),
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return [...rows]
        .filter((row) => Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value))
        .sort((a, b) => b.revision - a.revision)[0] ?? null
    })
  }
  let drawingId = 0
  let versionId = 0
  const excalidraw = {
    createDrawing: jest.fn(async () => ({ item: { id: `drawing-${++drawingId}` } })),
    deleteDrawing: jest.fn(async () => ({ success: true })),
    getDrawing: jest.fn(async (_scope, requestedDrawingId) => ({ item: { id: requestedDrawingId } })),
    saveSceneVersion: jest.fn(async () => ({ version: { id: `version-${++versionId}`, versionNumber: versionId } }))
  }
  const adapter = new DiagramArtifactTemplateAdapter()
  const catalog = new ArtifactTemplateCatalogService(adapter)
  const compiler = new DiagramCompilerService(
    new DiagramLayoutService(new DiagramRoutingService()),
    new DiagramValidationService()
  )
  const preview = {
    createPreview: jest.fn(async () => ({
      svg: { filePath: 'preview.svg', workspacePath: 'preview.svg', fileRef: { source: 'platform.workspace.files', filePath: 'preview.svg', workspacePath: 'preview.svg' }, size: 100 },
      png: { filePath: 'preview.png', workspacePath: 'preview.png', fileRef: { source: 'platform.workspace.files', filePath: 'preview.png', workspacePath: 'preview.png' }, size: 200 }
    }))
  }
  const service = new DiagramIrService(repository as never, excalidraw as never, compiler, preview as never, catalog)
  const ir = adapter.instantiate(BUILTIN_DIAGRAM_TEMPLATES[0], BUILTIN_DIAGRAM_TEMPLATES[0].defaults)
  return { service, repository, excalidraw, preview, ir, rows }
}

describe('DiagramIrService revision and divergence rules', () => {
  it('prevalidates a new DiagramIR before creating an Excalidraw drawing', async () => {
    const { service, excalidraw, ir, rows } = createFixture()
    const invalidIr = {
      ...ir,
      edges: [{
        ...ir.edges[0],
        source: { ...ir.edges[0].source, nodeId: 'missing-node' }
      }]
    }

    await expect(service.create(scope('tenant-a'), { ir: invalidIr })).rejects.toThrow(/unknown source node/)
    expect(excalidraw.createDrawing).not.toHaveBeenCalled()
    expect(rows).toHaveLength(0)
  })

  it('returns compact mutation and validation results while get remains the explicit full IR read', async () => {
    const { service, ir } = createFixture()
    const created = await service.create(scope('tenant-a'), { drawingId: 'drawing-compact', ir })
    expect(created).not.toHaveProperty('ir')
    expect(created).not.toHaveProperty('visualReviews')

    const validated = await service.validate(scope('tenant-a'), {
      drawingId: 'drawing-compact', expectedRevision: created.revision
    })
    expect(validated).not.toHaveProperty('ir')
    expect(validated).toHaveProperty('validationReport')

    const loaded = await service.get(scope('tenant-a'), 'drawing-compact')
    expect(loaded).toHaveProperty('ir')
    expect(loaded).toHaveProperty('validationReport')
  })

  it('enforces expectedRevision and tenant isolation', async () => {
    const { service, repository, ir } = createFixture()
    const created = await service.create(scope('tenant-a'), { drawingId: 'drawing-shared', ir })
    expect(created.revision).toBe(1)

    await expect(service.upsertNode(scope('tenant-a'), {
      drawingId: 'drawing-shared',
      expectedRevision: 99,
      node: { ...ir.nodes[0], label: 'Changed' }
    })).rejects.toBeInstanceOf(ConflictException)

    await expect(service.get(scope('tenant-b'), 'drawing-shared')).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.create(scope('tenant-a'), { drawingId: 'drawing-shared', ir })).rejects.toBeInstanceOf(ConflictException)
    await expect(service.create(scope('tenant-a'), {
      drawingId: 'drawing-shared', ir, replaceCurrent: true
    })).rejects.toBeInstanceOf(ConflictException)
    await expect(service.create(scope('tenant-a'), {
      drawingId: 'drawing-shared', ir, replaceCurrent: true, expectedRevision: created.revision
    })).resolves.toMatchObject({ revision: 2 })

    repository.save.mockRejectedValueOnce({ code: '23505' })
    await expect(service.upsertNode(scope('tenant-a'), {
      drawingId: 'drawing-shared', expectedRevision: 2, node: { ...ir.nodes[0], label: 'Concurrent update' }
    })).rejects.toBeInstanceOf(ConflictException)
  })

  it('marks manual Excalidraw saves as diverged and requires explicit replacement', async () => {
    const { service, excalidraw, ir } = createFixture()
    const created = await service.create(scope('tenant-a'), { drawingId: 'drawing-1', ir })
    const rendered = await service.render(scope('tenant-a'), {
      drawingId: 'drawing-1',
      expectedRevision: created.revision
    })
    expect(rendered.status).toBe('rendered')
    expect(excalidraw.saveSceneVersion).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sourceType: 'agent_diagram_ir' }))

    const diverged = await service.markDiverged(scope('tenant-a'), 'drawing-1', 'manual-version')
    expect(diverged?.status).toBe('diverged')
    await expect(service.render(scope('tenant-a'), {
      drawingId: 'drawing-1',
      expectedRevision: diverged!.revision
    })).rejects.toBeInstanceOf(ConflictException)

    const replaced = await service.render(scope('tenant-a'), {
      drawingId: 'drawing-1',
      expectedRevision: diverged!.revision,
      replaceDiverged: true
    })
    expect(replaced.status).toBe('rendered')
  })

  it('records passed and skipped visual reviews without claiming skipped passed', async () => {
    const { service, ir } = createFixture()
    const createdPassed = await service.create(scope('tenant-a'), { drawingId: 'drawing-passed', ir })
    await expect(service.recordVisualReview(scope('tenant-a'), {
      drawingId: 'drawing-passed', expectedRevision: createdPassed.revision, qualityRunId: 'quality-1', decision: 'passed', issues: []
    })).rejects.toThrow(/PNG preview/)
    const passedPreview = await service.createPreview(scope('tenant-a'), {} as never, {
      drawingId: 'drawing-passed', expectedRevision: createdPassed.revision, qualityRunId: 'quality-1'
    })
    const passed = await service.recordVisualReview(scope('tenant-a'), {
      drawingId: 'drawing-passed', expectedRevision: passedPreview.revision, qualityRunId: 'quality-1', decision: 'passed', issues: []
    })
    expect(passed.status).toBe('reviewed')

    const createdSkipped = await service.create(scope('tenant-a'), { drawingId: 'drawing-skipped', ir })
    const skipped = await service.recordVisualReview(scope('tenant-a'), {
      drawingId: 'drawing-skipped', expectedRevision: createdSkipped.revision, qualityRunId: 'quality-2', decision: 'skipped', issues: [], notes: 'No image capability'
    })
    expect(skipped.status).toBe('draft')
    expect(skipped.review.decision).toBe('skipped')
  })

  it('requires targeted corrections and exhausts a quality run after two correction passes', async () => {
    const { service, ir } = createFixture()
    const created = await service.create(scope('tenant-a'), { drawingId: 'drawing-1', ir })
    await expect(service.recordVisualReview(scope('tenant-a'), {
      drawingId: 'drawing-1', expectedRevision: created.revision, qualityRunId: 'quality-1', decision: 'needs_revision', issues: []
    })).rejects.toThrow(/targeted visual issue/)
    await expect(service.recordVisualReview(scope('tenant-a'), {
      drawingId: 'drawing-1', expectedRevision: created.revision, qualityRunId: 'quality-1', decision: 'needs_revision',
      issues: [{ code: 'visual.spacing', severity: 'warning', message: 'Too close', targetIds: ['client'] }]
    })).rejects.toThrow(/correction intent/)

    const issue = {
      code: 'visual.spacing', severity: 'warning' as const, message: 'Nodes are too close',
      targetIds: ['client', 'gateway'], correctionIntent: 'Increase the gap without changing the flow.'
    }
    const initialPreview = await service.createPreview(scope('tenant-a'), {} as never, {
      drawingId: 'drawing-1', expectedRevision: created.revision, qualityRunId: 'quality-1'
    })
    const first = await service.recordVisualReview(scope('tenant-a'), {
      drawingId: 'drawing-1', expectedRevision: initialPreview.revision, qualityRunId: 'quality-1', decision: 'needs_revision', issues: [issue]
    })
    const secondPreview = await service.createPreview(scope('tenant-a'), {} as never, {
      drawingId: 'drawing-1', expectedRevision: first.revision, qualityRunId: 'quality-1'
    })
    const second = await service.recordVisualReview(scope('tenant-a'), {
      drawingId: 'drawing-1', expectedRevision: secondPreview.revision, qualityRunId: 'quality-1', decision: 'needs_revision', issues: [issue]
    })
    const thirdPreview = await service.createPreview(scope('tenant-a'), {} as never, {
      drawingId: 'drawing-1', expectedRevision: second.revision, qualityRunId: 'quality-1'
    })
    const exhausted = await service.recordVisualReview(scope('tenant-a'), {
      drawingId: 'drawing-1', expectedRevision: thirdPreview.revision, qualityRunId: 'quality-1', decision: 'needs_revision', issues: [issue]
    })

    expect(first.review.attempt).toBe(0)
    expect(second.review.attempt).toBe(1)
    expect(exhausted.review).toMatchObject({ attempt: 2, decision: 'exhausted' })
    expect(exhausted.status).toBe('failed')
  })
})
