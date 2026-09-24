const source =
  'Synthetic: from 2024-12-31 (exclusive) to 2025-12-31 inclusive, the chair, CEO, general manager, deputy general managers and CFO had 0 departures. On 2025-12-31 controlling shareholder and concert parties pledged 0% of their holdings. Disclosed liabilities/assets on 2025-12-31: 80%.'
const fields = [
  {
    key: 'managementStability',
    status: 'present',
    value: 'unchanged',
    unit: null,
    period: '(2024-12-31,2025-12-31]',
    evidence: [
      'from 2024-12-31 (exclusive) to 2025-12-31 inclusive, the chair, CEO, general manager, deputy general managers and CFO had 0 departures.'
    ]
  },
  {
    key: 'pledgeRatio',
    status: 'present',
    value: '0',
    unit: '%',
    period: '2025-12-31',
    evidence: [
      'On 2025-12-31 controlling shareholder and concert parties pledged 0% of their holdings.'
    ]
  },
  {
    key: 'debtAssetRatio',
    status: 'present',
    value: '80',
    unit: '%',
    period: '2025',
    evidence: ['Disclosed liabilities/assets on 2025-12-31: 80%.']
  }
]
const inputs = {
  evaluationDate: '2025-12-31',
  departureCount: '0',
  managementStart: '2024-12-31',
  managementEnd: '2025-12-31',
  managementScopeVerified: true,
  pledgeDate: '2025-12-31',
  pledgeScopeVerified: true,
  debtDate: '2025-12-31',
  debtScopeVerified: true
}
module.exports = { source, fields, inputs }
