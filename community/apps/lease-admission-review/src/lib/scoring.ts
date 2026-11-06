import type { Fields } from './contracts'
import {
  scoringInputSchema,
  type ScoringInput,
  type ScoreResult
} from './scoring-input'

export const RULESET_VERSION = 'admission-three-indicators-v1' as const
export function validDate(value: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < '1900-01-01' ||
    value > '9999-12-31'
  )
    return false
  const date = new Date(value + 'T00:00:00Z')
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}
export function windowStart(evaluationDate: string): string | null {
  if (!validDate(evaluationDate)) return null
  const [year, month, day] = evaluationDate.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year - 1, month, 0)).getUTCDate()
  return `${year - 1}-${String(month).padStart(2, '0')}-${String(
    Math.min(day, lastDay)
  ).padStart(2, '0')}`
}
// One percent is 10,000 units. Comparison never rounds the disclosed value.
export function percentUnits(
  value: string | null,
  unit: string | null
): bigint | null {
  const match = /^(\d{1,12})(?:\.(\d{1,4}))?\s*(%)?$/.exec(value?.trim() ?? '')
  const explicitUnit = ['%', '百分比', 'percent'].includes(
    unit?.trim().toLowerCase() ?? ''
  )
  if (!match || (!match[3] && !explicitUnit) || (unit && !explicitUnit))
    return null
  return BigInt(match[1]) * 10000n + BigInt((match[2] ?? '').padEnd(4, '0'))
}
function percentText(units: bigint): string {
  const fraction = String(units % 10000n)
    .padStart(4, '0')
    .replace(/0+$/, '')
  return `${units / 10000n}${fraction ? '.' + fraction : ''}%`
}
export function scoreReview(
  source: string,
  fields: Fields,
  raw: ScoringInput
): ScoreResult {
  const inputs = scoringInputSchema.parse(raw)
  const expectedStart = windowStart(inputs.evaluationDate)
  const keys = ['managementStability', 'pledgeRatio', 'debtAssetRatio'] as const
  let debt: bigint | null = null
  const items = keys.map((key, index) => {
    const field = fields.find((f) => f.key === key)
    const issues: string[] = []
    if (!expectedStart) issues.push('evaluation_date')
    if (!field || field.status !== 'present') issues.push('fact_required')
    if (!field?.value || !field.period) issues.push('value_period_required')
    if (
      !field?.evidence.length ||
      field.evidence.some((e) => !e || !source.includes(e))
    )
      issues.push('evidence_required')
    let value: bigint | null = null
    let score: number | null = null
    let normalizedValue: string | null = null
    let band = ''
    if (key === 'managementStability') {
      if (!inputs.managementScopeVerified) issues.push('management_scope')
      if (
        !validDate(inputs.managementStart) ||
        !validDate(inputs.managementEnd) ||
        inputs.managementStart !== expectedStart ||
        inputs.managementEnd !== inputs.evaluationDate
      )
        issues.push('management_window')
      if (!/^\d{1,9}$/.test(inputs.departureCount))
        issues.push('departure_count')
      if (!issues.length) {
        const count = Number(inputs.departureCount)
        score = count === 0 ? 2 : count <= 2 ? 1 : 0
        normalizedValue = String(count)
        band = count === 0 ? '0' : count <= 2 ? '1–2' : '≥3'
      }
    } else {
      const date = key === 'pledgeRatio' ? inputs.pledgeDate : inputs.debtDate
      const verified =
        key === 'pledgeRatio'
          ? inputs.pledgeScopeVerified
          : inputs.debtScopeVerified
      if (!verified)
        issues.push(key === 'pledgeRatio' ? 'pledge_scope' : 'debt_scope')
      if (!validDate(date) || date !== inputs.evaluationDate)
        issues.push('report_date')
      value = percentUnits(field?.value ?? null, field?.unit ?? null)
      if (value === null || (key === 'pledgeRatio' && value > 1000000n))
        issues.push('invalid_percent')
      if (!issues.length && value !== null) {
        const bounds = [400000n, 500000n, 600000n, 700000n]
        const bucket = bounds.findIndex((bound) => value! <= bound)
        const slot = bucket < 0 ? 4 : bucket
        score = (key === 'pledgeRatio' ? [5, 4, 3, 1, 0] : [8, 6, 4, 2, 0])[
          slot
        ]
        band = ['≤40%', '(40%,50%]', '(50%,60%]', '(60%,70%]', '>70%'][slot]
        normalizedValue = percentText(value)
        if (key === 'debtAssetRatio') debt = value
      }
    }
    return {
      key,
      maximum: [2, 5, 8][index],
      score,
      normalizedValue,
      band,
      issues,
      evidence: field?.evidence ?? []
    }
  })
  const complete = items.every((item) => item.score !== null)
  return {
    rulesetVersion: RULESET_VERSION,
    inputs,
    items,
    maximum: 15,
    complete,
    total: complete ? items.reduce((sum, item) => sum + item.score!, 0) : null,
    veto: debt === null ? 'insufficient' : debt > 800000n ? 'hit' : 'clear'
  }
}
