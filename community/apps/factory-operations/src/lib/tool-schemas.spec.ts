import { describe, expect, it } from 'vitest'
import {
  recordEquipmentFindingSchema,
  recordTriageSchema,
  searchFactoryCasesSchema
} from './tool-schemas.js'

const base = {
  caseId: '11111111-1111-4111-8111-111111111111',
  operationId: 'triage:11111111',
  baseRevision: 1,
  changeSummary: 'Recorded anomaly triage'
}

describe('factory tool schemas', () => {
  it('accepts bounded case search and rejects model-supplied scope', () => {
    expect(searchFactoryCasesSchema.parse({ search: '  M-07  ' })).toEqual({
      search: 'M-07',
      page: 1,
      pageSize: 20
    })
    expect(() => searchFactoryCasesSchema.parse({ page: 0 })).toThrow()
    expect(() => searchFactoryCasesSchema.parse({ pageSize: 51 })).toThrow()
    expect(() =>
      searchFactoryCasesSchema.parse({ organizationId: 'model-controlled' })
    ).toThrow()
  })

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
