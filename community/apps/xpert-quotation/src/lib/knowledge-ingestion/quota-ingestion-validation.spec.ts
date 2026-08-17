import { validateQuotaNormalization, type QuotaNormalizationValidationInput } from './quota-ingestion-validation.js'

describe('quota ingestion validation', () => {
  it('accepts the three representative Jiangsu quota resource gates', () => {
    expect(() => validateQuotaNormalization(validResult())).not.toThrow()
  })

  it('rejects duplicate write keys before database persistence', () => {
    const result = validResult()
    result.chunks[1].writeKey = result.chunks[0].writeKey
    expect(() => validateQuotaNormalization(result)).toThrow(expect.objectContaining({ code: 'quota_duplicate_write_key' }))
  })

  it('rejects a representative resource consumption mismatch', () => {
    const result = validResult()
    result.chunks[2].data.resources[0].consumption = '2.885'
    expect(() => validateQuotaNormalization(result)).toThrow(expect.objectContaining({ code: 'quota_representative_gate_failed' }))
  })
})

function validResult(): QuotaNormalizationValidationInput {
  return {
    pageCount: 815,
    chunks: [
      { writeKey: 'quota:13-47', data: { quotaCode: '13-47', resources: [{ code: '12330300', consumption: '12.900' }] } },
      { writeKey: 'quota:15-152', data: { quotaCode: '15-152', resources: [{ code: '11450342', consumption: '19.845' }] } },
      { writeKey: 'quota:15-161', data: { quotaCode: '15-161', resources: [{ code: '11010304', consumption: '2.884' }] } }
    ]
  }
}
