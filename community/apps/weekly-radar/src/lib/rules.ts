import type { WeeklyRadarEntryStatus, WeeklyRadarRiskLevel } from './types'

export interface WeeklyRadarRiskPolicy {
  /** Days a pending-confirm entry may sit before it becomes a risk. */
  pendingConfirmDays: number
  /** Grace days before an overdue entry becomes a risk. */
  overdueGraceDays: number
  /** Days an untouched open entry must age before it turns high risk. */
  crossWeekHighDays: number
  /** Days an untouched open entry must age before it turns medium risk. */
  crossWeekMediumDays: number
}

export const DEFAULT_RISK_POLICY: WeeklyRadarRiskPolicy = {
  pendingConfirmDays: 3,
  overdueGraceDays: 0,
  crossWeekHighDays: 7,
  crossWeekMediumDays: 3
}

export interface RadarEntrySnapshot {
  id: string
  title: string
  status: WeeklyRadarEntryStatus
  weekKey: string
  owner?: string | null
  dueDate?: string | null
  evidenceRef?: string | null
  createdAt: Date
  lastTouchedAt: Date
}

export interface RadarRisk {
  id: string
  level: WeeklyRadarRiskLevel
  title: string
  detail: string
  suggestion: string
  reasons: string[]
  entryIds: string[]
  entryTitles: string[]
  evidenceRefs: string[]
  ageDays: number
}

export interface RadarRiskContext {
  now: Date
  currentWeekKey: string
  policy?: Partial<WeeklyRadarRiskPolicy>
}

const LEVEL_ORDER: Record<WeeklyRadarRiskLevel, number> = { high: 3, medium: 2, low: 1 }

interface Candidate {
  ruleId: string
  level: WeeklyRadarRiskLevel
  detail: string
  suggestion: string
  entryId: string
  ageDays: number
}

const RULE_LABELS: Record<string, string> = {
  cross_week_open: 'R1 跨周未闭环',
  pending_confirm_backlog: 'R2 待确认积压',
  failed_not_retried: 'R3 失败未重试',
  overdue: 'R4 逾期未动',
  recurring_blocked: 'R5 反复受阻'
}

/**
 * The risk engine is deliberately rule based: every risk must be recomputable
 * from the stored entries, so a reviewer can replay it and get the same answer.
 * The model never decides whether something is risky.
 */
export function scanRisks(entries: RadarEntrySnapshot[], context: RadarRiskContext): RadarRisk[] {
  const policy = { ...DEFAULT_RISK_POLICY, ...(context.policy ?? {}) }
  const candidatesByEntry = new Map<string, Candidate[]>()
  const risks: RadarRisk[] = []

  for (const entry of entries) {
    const ageDays = ageInDays(entry.lastTouchedAt, context.now)
    const candidates = candidatesByEntry.get(entry.id) ?? []

    if (entry.status !== 'done' && entry.weekKey < context.currentWeekKey) {
      candidates.push({
        ruleId: 'cross_week_open',
        level: levelForAge(ageDays, policy),
        detail: `条目创建于 ${entry.weekKey}，当前周为 ${context.currentWeekKey}，已跨周未闭环 ${ageDays} 天。`,
        suggestion: '在本周周报中明确责任人、下一节点与关闭条件，或标记为不再跟踪。',
        entryId: entry.id,
        ageDays
      })
    }

    if (entry.status === 'pending_confirm' && ageDays >= policy.pendingConfirmDays) {
      candidates.push({
        ruleId: 'pending_confirm_backlog',
        level: ageDays >= policy.pendingConfirmDays * 2 ? 'high' : 'medium',
        detail: `等待人工确认已 ${ageDays} 天（阈值 ${policy.pendingConfirmDays} 天），结论尚未生效。`,
        suggestion: '在工作台确认该条目状态；确认前不要把相关结论写进周报。',
        entryId: entry.id,
        ageDays
      })
    }

    if (entry.status === 'ai_failed') {
      candidates.push({
        ruleId: 'failed_not_retried',
        level: 'high',
        detail: 'AI 处理失败且尚未重试，该条目相关结论当前不可信。',
        suggestion: '重试失败步骤，或改为人工录入后标记为已确认。',
        entryId: entry.id,
        ageDays
      })
    }

    if (entry.dueDate && entry.status !== 'done') {
      const overdueDays = daysSinceDate(entry.dueDate, context.now)
      if (overdueDays > policy.overdueGraceDays) {
        candidates.push({
          ruleId: 'overdue',
          level: overdueDays >= 7 ? 'high' : 'medium',
          detail: `截止日期 ${entry.dueDate} 已过 ${overdueDays} 天仍未完成。`,
          suggestion: '重新承诺截止日期，或说明阻塞原因与解法。',
          entryId: entry.id,
          ageDays
        })
      }
    }

    if (candidates.length) {
      candidatesByEntry.set(entry.id, candidates)
    }
  }

  for (const [entryId, candidates] of candidatesByEntry) {
    const entry = entries.find((item) => item.id === entryId)
    if (!entry) continue
    const level = candidates.reduce<WeeklyRadarRiskLevel>(
      (acc, candidate) => (LEVEL_ORDER[candidate.level] > LEVEL_ORDER[acc] ? candidate.level : acc),
      'low'
    )
    risks.push({
      id: `entry:${entryId}`,
      level,
      title: entry.title,
      detail: candidates.map((candidate) => candidate.detail).join(' '),
      suggestion: candidates[0].suggestion,
      reasons: candidates.map((candidate) => RULE_LABELS[candidate.ruleId] ?? candidate.ruleId),
      entryIds: [entryId],
      entryTitles: [entry.title],
      evidenceRefs: entry.evidenceRef ? [entry.evidenceRef] : [],
      ageDays: candidates[0].ageDays
    })
  }

  const recurring = detectRecurringBlocked(entries, context)
  if (recurring) {
    risks.push(recurring)
  }

  return risks.sort((left, right) => {
    const byLevel = LEVEL_ORDER[right.level] - LEVEL_ORDER[left.level]
    if (byLevel !== 0) return byLevel
    if (right.ageDays !== left.ageDays) return right.ageDays - left.ageDays
    return left.title.localeCompare(right.title)
  })
}

function detectRecurringBlocked(entries: RadarEntrySnapshot[], context: RadarRiskContext): RadarRisk | null {
  const groups = new Map<string, RadarEntrySnapshot[]>()
  for (const entry of entries) {
    if (entry.status !== 'blocked') continue
    const key = normalizeTitle(entry.title)
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }

  for (const [key, group] of groups) {
    const weekKeys = new Set(group.map((entry) => entry.weekKey))
    if (weekKeys.size < 2) continue
    const ageDays = group.reduce((max, entry) => Math.max(max, ageInDays(entry.lastTouchedAt, context.now)), 0)
    return {
      id: `recurring:${key}`,
      level: 'high',
      title: group[0].title,
      detail: `同一事项在 ${weekKeys.size} 个不同周（${[...weekKeys].sort().join('、')}）都处于受阻状态，属于结构性问题而非本周波动。`,
      suggestion: '升级处理：明确阻塞方与决策人，给出可验证的解除条件与日期。',
      reasons: [RULE_LABELS.recurring_blocked],
      entryIds: group.map((entry) => entry.id),
      entryTitles: group.map((entry) => entry.title),
      evidenceRefs: group.map((entry) => entry.evidenceRef).filter((value): value is string => Boolean(value)),
      ageDays
    }
  }

  return null
}

function levelForAge(ageDays: number, policy: WeeklyRadarRiskPolicy): WeeklyRadarRiskLevel {
  if (ageDays >= policy.crossWeekHighDays) return 'high'
  if (ageDays >= policy.crossWeekMediumDays) return 'medium'
  return 'low'
}

function ageInDays(since: Date, now: Date) {
  const diff = now.getTime() - since.getTime()
  if (!Number.isFinite(diff)) return 0
  return Math.max(0, Math.floor(diff / 86_400_000))
}

function daysSinceDate(date: string, now: Date) {
  const target = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(target.getTime())) return 0
  const diff = now.getTime() - target.getTime()
  if (!Number.isFinite(diff)) return 0
  return Math.max(0, Math.floor(diff / 86_400_000))
}

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .slice(0, 80)
}

/** ISO-8601 week key, for example 2026-W45. */
export function weekKeyOf(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNumber = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
