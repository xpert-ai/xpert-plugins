const source =
  'Management unchanged for 24 months. Pledge 0%. Debt/assets 80% for 2025.'
const fields = [
  {
    key: 'managementStability',
    status: 'present',
    value: 'unchanged',
    unit: null,
    period: '24 months',
    evidence: ['Management unchanged for 24 months.']
  },
  {
    key: 'pledgeRatio',
    status: 'present',
    value: '0',
    unit: '%',
    period: null,
    evidence: ['Pledge 0%.']
  },
  {
    key: 'debtAssetRatio',
    status: 'present',
    value: '80',
    unit: '%',
    period: '2025',
    evidence: ['Debt/assets 80% for 2025.']
  }
]
module.exports = { source, fields }
