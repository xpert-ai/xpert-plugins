import {
  getStoryCutHandoffSchema,
  prepareStoryCutHandoffSchema,
  recordStoryCutHandoffDeliverySchema
} from './story-cut-handoff.schemas.js'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const HANDOFF_ID = '22222222-2222-4222-8222-222222222222'

describe('StoryCutHandoff schemas', () => {
  it('accepts bounded prepare/get inputs and strips no unknown fields', () => {
    expect(
      prepareStoryCutHandoffSchema.parse({
        projectId: PROJECT_ID,
        operationId: 'prepare:1',
        expectedRevision: 7,
        fps: 24,
        changeSummary: 'Prepared Cut handoff.'
      })
    ).toMatchObject({ projectId: PROJECT_ID, expectedRevision: 7, fps: 24 })
    expect(
      getStoryCutHandoffSchema.parse({
        projectId: PROJECT_ID,
        handoffId: HANDOFF_ID
      })
    ).toEqual({ projectId: PROJECT_ID, handoffId: HANDOFF_ID })
    expect(() =>
      prepareStoryCutHandoffSchema.parse({
        projectId: PROJECT_ID,
        operationId: 'prepare:1',
        expectedRevision: 7,
        changeSummary: 'Prepared Cut handoff.',
        unexpected: true
      })
    ).toThrow()
  })

  it('requires status-specific Cut receipts', () => {
    expect(
      recordStoryCutHandoffDeliverySchema.parse({
        projectId: PROJECT_ID,
        handoffId: HANDOFF_ID,
        operationId: 'deliver:1',
        baseHandoffRevision: 1,
        status: 'delivered',
        cutProjectId: '33333333-3333-4333-8333-333333333333',
        cutProjectRevision: 3,
        changeSummary: 'Recorded Cut delivery.'
      })
    ).toMatchObject({ status: 'delivered', cutProjectRevision: 3 })
    expect(() =>
      recordStoryCutHandoffDeliverySchema.parse({
        projectId: PROJECT_ID,
        handoffId: HANDOFF_ID,
        operationId: 'proposal:1',
        baseHandoffRevision: 1,
        status: 'proposal_ready',
        cutProjectId: '33333333-3333-4333-8333-333333333333',
        changeSummary: 'Missing proposal id.'
      })
    ).toThrow()
    expect(() =>
      recordStoryCutHandoffDeliverySchema.parse({
        projectId: PROJECT_ID,
        handoffId: HANDOFF_ID,
        operationId: 'failed:1',
        baseHandoffRevision: 1,
        status: 'failed',
        changeSummary: 'Missing failure evidence.'
      })
    ).toThrow()
  })
})
