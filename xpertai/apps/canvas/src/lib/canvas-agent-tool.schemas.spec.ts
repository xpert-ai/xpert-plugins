import { toJsonSchema } from '@langchain/core/utils/json_schema'
import { applyRecordBatchSchema } from './canvas-agent-tool.schemas.js'

describe('Canvas Agent tool schemas', () => {
  it('publishes provider-safe single-shape schemas instead of a polymorphic create array', () => {
    const schema = toJsonSchema(applyRecordBatchSchema) as {
      properties?: Record<string, { items?: { anyOf?: unknown[] }; properties?: Record<string, unknown> }>
    }
    const properties = schema.properties ?? {}

    expect(properties).not.toHaveProperty('createShapes')
    expect(properties.workflow).toBeTruthy()
    for (const field of [
      'createTextShapes',
      'createGeoShapes',
      'createNoteShapes',
      'createFrameShapes',
      'createArrowShapes'
    ]) {
      expect(properties[field]).toBeTruthy()
      expect(properties[field]?.items?.anyOf).toBeUndefined()
    }
  })

  it('accepts one semantic workflow and rejects ambiguous or malformed workflow mutations', () => {
    const base = {
      documentId: '00000000-0000-4000-8000-000000000001',
      operationId: 'workflow-operation-1',
      batchId: 'workflow-batch-1',
      stageIndex: 1,
      stageLabel: 'Render workflow',
      isFinalStage: true,
      baseRevision: 4,
      changeSummary: 'Render workflow',
      workflow: {
        mode: 'replace_page' as const,
        title: 'Delivery workflow',
        stages: [
          { key: 'plan', label: 'Plan' },
          { key: 'ship', label: 'Ship' }
        ],
        branches: [{ key: 'review', label: 'Review', parentStageKey: 'plan' }]
      }
    }

    expect(applyRecordBatchSchema.safeParse(base).success).toBe(true)
    expect(applyRecordBatchSchema.safeParse({
      ...base,
      createTextShapes: [{ x: 0, y: 0, text: 'Not allowed beside workflow' }]
    }).success).toBe(false)
    expect(applyRecordBatchSchema.safeParse({
      ...base,
      workflow: { ...base.workflow, branches: [{ key: 'review', label: 'Review', parentStageKey: 'missing' }] }
    }).success).toBe(false)
  })
})
