import { DEFAULT_REWRITE_TEXT } from './constants.js'
import type { MatchPhase } from './runtime-types.js'
import type { CompiledSensitiveRule, SensitiveRule } from './types.js'
import { normalizeForMatching } from './text-utils.js'
import { isRecord, toNonEmptyString } from './utils.js'

export function normalizeRuleDrafts(input: Array<Partial<SensitiveRule> | null | undefined>): SensitiveRule[] {
  const rules: SensitiveRule[] = []

  for (const [index, draft] of input.entries()) {
    if (!isRecord(draft)) {
      continue
    }

    const id = toNonEmptyString(draft['id'])
    const pattern = toNonEmptyString(draft['pattern'])
    const type = toNonEmptyString(draft['type']) as SensitiveRule['type'] | null
    const scope = toNonEmptyString(draft['scope']) as SensitiveRule['scope'] | null
    const severity = toNonEmptyString(draft['severity']) as SensitiveRule['severity'] | null
    const action = toNonEmptyString(draft['action']) as SensitiveRule['action'] | null
    const replacementText = toNonEmptyString(draft['replacementText']) ?? undefined

    const hasAnyValue = Boolean(id || pattern || type || scope || severity || action || replacementText)
    if (!hasAnyValue) {
      continue
    }

    if (!pattern || !type || !action || !scope || !severity) {
      continue
    }

    if (!['keyword', 'regex'].includes(type)) {
      continue
    }
    if (!['input', 'output', 'both'].includes(scope)) {
      continue
    }
    if (!['high', 'medium'].includes(severity)) {
      continue
    }
    if (!['block', 'rewrite'].includes(action)) {
      continue
    }

    rules.push({
      id: id ?? `rule-${index + 1}`,
      pattern,
      type,
      scope,
      severity,
      action,
      replacementText,
    })
  }

  return rules
}

export function compileSensitiveRules(
  rules: SensitiveRule[],
  normalize: boolean,
  caseSensitive: boolean,
): CompiledSensitiveRule[] {
  return rules.map((rule, index) => {
    const normalizedPattern =
      rule.type === 'keyword' ? normalizeForMatching(rule.pattern, normalize, caseSensitive) : rule.pattern

    if (rule.type === 'regex') {
      try {
        return {
          ...rule,
          index,
          normalizedPattern,
          matchRegex: new RegExp(rule.pattern, caseSensitive ? '' : 'i'),
          rewriteRegex: new RegExp(rule.pattern, caseSensitive ? 'g' : 'gi'),
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`请完善规则配置：规则「${rule.id}」的正则表达式不合法（${message}）。`)
      }
    }

    return {
      ...rule,
      index,
      normalizedPattern,
    }
  }) as CompiledSensitiveRule[]
}

function getSeverityWeight(severity: 'high' | 'medium'): number {
  return severity === 'high' ? 2 : 1
}

export function pickWinningRule(matches: CompiledSensitiveRule[]): CompiledSensitiveRule | null {
  if (matches.length === 0) {
    return null
  }

  let winner: CompiledSensitiveRule = matches[0]!
  for (const current of matches.slice(1)) {
    const currentWeight = getSeverityWeight(current.severity)
    const winnerWeight = getSeverityWeight(winner.severity)

    if (currentWeight > winnerWeight) {
      winner = current
      continue
    }

    if (currentWeight === winnerWeight && current.index < winner.index) {
      winner = current
    }
  }

  return winner
}

export function rewriteTextByRule(_source: string, rule: CompiledSensitiveRule, _caseSensitive: boolean): string {
  const replacement = rule.replacementText?.trim() || DEFAULT_REWRITE_TEXT

  // Rewrite replaces the full sentence to avoid semantic leftovers.
  return replacement
}

export function findMatches(
  text: string,
  phase: MatchPhase,
  rules: CompiledSensitiveRule[],
  normalize: boolean,
  caseSensitive: boolean,
): CompiledSensitiveRule[] {
  if (!text) {
    return []
  }

  const matchTarget = normalizeForMatching(text, normalize, caseSensitive)

  return rules.filter((rule) => {
    if (rule.scope !== 'both' && rule.scope !== phase) {
      return false
    }

    if (rule.type === 'keyword') {
      return matchTarget.includes(rule.normalizedPattern)
    }

    return Boolean(rule.matchRegex?.test(matchTarget))
  })
}
