import type { AnalysisStatus, MatchLevel } from '../../../types.js'

export const STATUS_LABEL: Record<AnalysisStatus, string> = {
  waiting_ai: '分析中',
  review: '待人工确认',
  confirmed: '已确认',
  failed: '分析失败'
}

export const STATUS_CLASS: Record<AnalysisStatus, string> = {
  waiting_ai: 'rm-badge rm-badge-amber',
  review: 'rm-badge rm-badge-purple',
  confirmed: 'rm-badge rm-badge-green',
  failed: 'rm-badge rm-badge-red'
}

export function formatDateTime(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

export function formatFullDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

export function levelClass(level?: MatchLevel) {
  if (level === '高度匹配') return 'rm-badge rm-badge-green'
  if (level === '较好匹配') return 'rm-badge rm-badge-blue'
  if (level === '基本匹配') return 'rm-badge rm-badge-amber'
  return 'rm-badge rm-badge-red'
}

export function scoreTone(score: number) {
  if (score >= 85) return 'green'
  if (score >= 70) return 'blue'
  if (score >= 55) return 'amber'
  return 'red'
}

export function shortNumber(value?: number) {
  if (value === undefined || value === null) return '—'
  return String(value)
}
