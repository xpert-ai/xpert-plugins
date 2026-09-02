import { describe, expect, it } from 'vitest'
import {
  recordEquipmentFindingSchema,
  recordTriageSchema
} from './tool-schemas.js'

const base = {
  caseId: '11111111-1111-4111-8111-111111111111',
  operationId: 'triage:11111111',
  baseRevision: 1,
  changeSummary: 'Recorded anomaly triage'
}

describe('factory tool schemas', () => {
  it('rejects unknown fields and incomplete evidence', () => {
    expect(() =>
      recordTriageSchema.parse({
        ...base,
        severity: 'critical',
        summary: 'Confirmed critical anomaly.',
        confidence: 0.99,
        evidence: [],
        tenantId: 'model-controlled'
      })
    ).toThrow()
  })

  it('rejects oversized and invalid equipment findings', () => {
    expect(() =>
      recordEquipmentFindingSchema.parse({
        ...base,
        failureMode: 'x',
        remainingSafeMinutes: -1,
        recommendation: 'keep_running',
        summary: 'too short',
        confidence: 2,
        evidence: []
      })
    ).toThrow()
  })
})
