import { providerFixture } from './provider-test-fixture.js'
import { diagramDto, mutationDto, qualityDto, sceneItemDto, templateDto, templatesDto } from './result-dto.js'
import { receiptSchema } from './contracts.js'
import { patchSceneSchema } from './drawing-contracts.js'
import { exportDto } from './render-result-dto.js'

describe('Excalidraw tool DTOs', () => {
  it('preserves every changed ID for the largest accepted mixed patch', () => {
    const patch = patchSceneSchema.parse({
      drawingId: 'drawing',
      expectedRevision: 1,
      addElements: Array.from({ length: 20 }, (_, i) => ({ id: `add-${i}`, type: 'rectangle', x: 0, y: 0 })),
      updateElements: Array.from({ length: 100 }, (_, i) => ({ id: `update-${i}`, x: 1 })),
      deleteElementIds: Array.from({ length: 100 }, (_, i) => `delete-${i}`)
    })
    const changedIds = [
      ...patch.addElements.map((item) => item.id),
      ...patch.updateElements.map((item) => item.id),
      ...patch.deleteElementIds
    ]
    const receipt = receiptSchema.parse({
      success: true,
      drawingId: patch.drawingId,
      message: 'Patched',
      changedIds,
      changedCount: changedIds.length
    })
    expect(mutationDto(receipt).changedIds).toEqual(changedIds)
  })

  it('includes bounded validation defects and the next page for repair', () => {
    const issues = Array.from({ length: 30 }, (_, i) => ({
      code: 'canvas.node_out_of_bounds',
      severity: 'error',
      message: 'Move the node inside the canvas. '.repeat(40),
      targetIds: [`node-${i}`]
    }))
    const result = mutationDto({
      success: true,
      drawingId: 'drawing',
      irRevision: 2,
      message: 'Validated',
      validation: { valid: false, summary: { errors: 30, warnings: 0 }, issues }
    })
    expect(result.validation.issues).toHaveLength(20)
    expect(result.validation.issues[0].message).toHaveLength(1000)
    expect(result.validation.issues[0]).toMatchObject({ targetIds: ['node-0'], code: 'canvas.node_out_of_bounds' })
    expect(result.validation).toMatchObject({ valid: false, issueTotal: 30, nextIssueOffset: 20 })
  })

  it('keeps the effective review decision and failure recovery hint', () => {
    expect(
      mutationDto({
        success: true,
        message: 'Reviewed',
        review: { qualityRunId: 'run', attempt: 2, decision: 'exhausted' }
      }).review
    ).toMatchObject({ decision: 'exhausted', attempt: 2 })
    expect(mutationDto({ success: false, message: 'Failed', nextAction: 'Read the latest revision.' }).nextAction).toBe(
      'Read the latest revision.'
    )
  })

  it('preserves target IDs and repair details while removing generic successful-operation prose', () => {
    const dto = mutationDto({
      success: true,
      drawingId: 'drawing',
      sceneRevision: 2,
      status: 'draft',
      changedCount: 1,
      message: 'Scene updated.',
      nextAction: 'Read current revisions before the next change; reuse operationId when retrying.',
      changedIds: ['element'],
      validation: { valid: true, checkedAt: 'now', summary: { errors: 0, warnings: 0, nodes: 2, edges: 1 }, issues: [] }
    })
    expect(JSON.parse(JSON.stringify(dto))).toEqual({
      success: true,
      drawingId: 'drawing',
      sceneRevision: 2,
      status: 'draft',
      changedCount: 1,
      changedIds: ['element'],
      validation: { valid: true, errors: 0, warnings: 0, issues: [], issueTotal: 0 }
    })
    expect(
      mutationDto({ success: false, message: 'Retry the failed operation.', errorCode: 'render_failed' })
    ).toMatchObject({ message: 'Retry the failed operation.', errorCode: 'render_failed' })
  })
  it('returns template parameters and label IDs without template payloads, previews or duplicated examples', () => {
    const { catalog } = providerFixture()
    for (const template of catalog.list()) {
      const source = catalog.get(template.key, template.version)
      const result = templateDto(source)
      expect(Object.keys(result).sort()).toEqual(['defaults', 'inputSchema', 'key', 'labels', 'version'])
      expect(result.labels).toEqual(
        expect.arrayContaining(source.payload.base.nodes.map(({ id, label }) => ({ id, label })))
      )
      expect(JSON.stringify(result)).not.toContain('assetPath')
      expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(Buffer.byteLength(JSON.stringify(source)))
    }
    expect(templatesDto(catalog.list()).items[0]).not.toHaveProperty('preview')
  })
  it('reads one editable element without collaboration bookkeeping or hidden custom data', () => {
    const result = sceneItemDto({
      drawingId: 'drawing',
      sceneRevision: 2,
      itemType: 'element',
      item: {
        id: 'label',
        type: 'text',
        x: 0,
        y: 0,
        text: 'Visible label',
        originalText: 'Visible label',
        fontFamily: 6,
        seed: 123,
        versionNonce: 123,
        updated: 1,
        version: 2,
        customData: { internalPath: '/private/file' }
      }
    })
    expect(result.item).toEqual({ id: 'label', type: 'text', x: 0, y: 0, text: 'Visible label', fontFamily: 6 })
  })
  it('keeps explicit IR inspection separate from quality histories and file references', () => {
    const ir = providerFixture().catalog.instantiate('layered-architecture', undefined, {})
    const source = {
      success: true,
      message: 'loaded',
      drawingId: 'drawing',
      revision: 3,
      status: 'rendered' as const,
      templateKey: 'layered-architecture',
      renderedExcalidrawVersionId: 'version',
      ir,
      validationReport: null,
      visualReviews: [
        {
          qualityRunId: 'run',
          attempt: 1,
          decision: 'passed' as const,
          issues: [],
          reviewedAt: 'now',
          svgFile: { source: 'internal' }
        }
      ]
    }
    // Additional provider fields must not be serialized just because they are JSON-safe.
    const result = diagramDto({ ...source, visualReviews: [] })
    expect(Object.keys(result).sort()).toEqual(['drawingId', 'ir', 'irRevision', 'status'])
    expect(result.ir).toEqual(ir)
  })
  it('bounds quality issues and review history while preserving continuation offsets', () => {
    const issues = Array.from({ length: 45 }, (_, i) => ({
      code: `issue-${i}`,
      severity: 'warning' as const,
      message: 'Adjust spacing.',
      targetIds: [`node-${i}`]
    }))
    const source = {
      drawingId: 'drawing',
      revision: 3,
      status: 'validated' as const,
      renderedExcalidrawVersionId: null,
      validationReport: {
        valid: true,
        checkedAt: 'now',
        issues,
        summary: { errors: 0, warnings: 45, nodes: 300, edges: 600 }
      },
      visualReviews: Array.from({ length: 50 }, (_, i) => ({
        qualityRunId: `run-${i}`,
        attempt: 1,
        decision: 'passed' as const,
        issues: [],
        reviewedAt: 'now'
      })),
      qualityArtifacts: { qualityRunId: 'active-run', attempt: 1, png: { workspacePath: '/private/preview.png' } }
    }
    const first = qualityDto(source, {})
    expect(first.activeQualityRun).toEqual({ qualityRunId: 'active-run', attempt: 1 })
    expect(JSON.stringify(first)).not.toContain('workspacePath')
    expect(first.validationReport.issues).toHaveLength(20)
    expect(first.validationReport.nextIssueOffset).toBe(20)
    expect(first.visualReviews).toHaveLength(1)
    expect(first.visualReviews[0].qualityRunId).toBe('run-49')
    expect(first.nextReviewOffset).toBe(1)
    const last = qualityDto(source, { issueOffset: 40, reviewOffset: 49 })
    expect(last.validationReport.issues).toHaveLength(5)
    expect(last.validationReport.nextIssueOffset).toBeUndefined()
    expect(last.nextReviewOffset).toBeUndefined()
  })
  it('returns export metadata once, followed by only addressed data chunks', () => {
    const source = {
      drawingId: 'drawing',
      jobId: 'job',
      format: 'json' as const,
      mimeType: 'application/json',
      name: 'drawing.excalidraw',
      size: 100,
      sha256: 'a'.repeat(64),
      encoding: 'base64' as const,
      data: 'AAAA',
      offset: 0,
      total: 16,
      nextOffset: 4
    }
    expect(exportDto(source)).toHaveProperty('sha256')
    expect(exportDto({ ...source, offset: 4, nextOffset: 8 })).toEqual({
      jobId: 'job',
      data: 'AAAA',
      offset: 4,
      nextOffset: 8
    })
  })
})
