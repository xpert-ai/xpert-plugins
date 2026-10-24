import { i18n, type MessageKey } from './i18n'
import type { WorkbenchEntry } from '../../../src/workbench-contract'
export type Section = 'inbox' | 'repositories' | 'settings' | 'recent' | 'requested' | 'authored'
export type ViewState = {
  section: Section
  page: number
  search: string
  repository: string
  status: string
  recordId: string
  tab: string
  pinned: boolean
}
const sections: Section[] = ['inbox', 'repositories', 'settings', 'recent', 'requested', 'authored']
export function viewState(parameters: Record<string, unknown> = {}): ViewState {
  return {
    section: sections.includes(parameters.section as Section) ? (parameters.section as Section) : 'inbox',
    page: typeof parameters.listPage === 'number' && parameters.listPage > 0 ? Math.min(parameters.listPage, 50) : 1,
    search: typeof parameters.listSearch === 'string' ? parameters.listSearch.slice(0, 200) : '',
    repository: typeof parameters.repository === 'string' ? parameters.repository : '',
    status: typeof parameters.status === 'string' ? parameters.status : '',
    recordId: typeof parameters.recordId === 'string' ? parameters.recordId : '',
    tab: ['summary', 'changes', 'findings', 'checks', 'history'].includes(String(parameters.tab))
      ? String(parameters.tab)
      : 'changes',
    pinned: parameters.pinned === true
  }
}
export const viewParameters = (s: ViewState) => ({
  section: s.section,
  listPage: s.page,
  listSearch: s.search,
  repository: s.repository,
  status: s.status,
  recordId: s.recordId,
  tab: s.tab,
  pinned: s.pinned
})
export const statusKeys = {
  needs_configuration: 'wb_needs_configuration',
  blocked: 'wb_blocked',
  awaiting_revision: 'wb_awaiting_revision',
  completed: 'wb_completed',
  queued: 'wb_queued',
  running: 'wb_running',
  awaiting_confirmation: 'wb_awaiting_confirmation',
  publishing: 'wb_publishing',
  published: 'wb_published',
  failed: 'wb_failed',
  skipped: 'wb_skipped',
  superseded: 'wb_superseded',
  cancelled: 'wb_cancelled',
  publication_unknown: 'wb_publication_unknown',
  ready: 'wb_ready',
  reviewed: 'wb_reviewed',
  submitting: 'wb_submitting',
  submitted: 'wb_submitted',
  submission_unknown: 'wb_submission_unknown'
} satisfies Record<string, MessageKey>
export function statusLabel(value: string, locale?: string) {
  return i18n(locale).t(statusKeys[value as keyof typeof statusKeys] ?? 'workbenchStatusUnknown')
}
export function statusTone(value: string) {
  if (
    ['awaiting_confirmation', 'blocked', 'needs_configuration', 'publication_unknown', 'submission_unknown'].includes(
      value
    )
  )
    return 'review-status-waiting'
  if (['published', 'submitted', 'completed', 'reviewed'].includes(value)) return 'review-status-success'
  if (value === 'failed') return 'text-destructive border-destructive/30'
  if (['running', 'queued'].includes(value)) return 'text-primary border-primary/30 bg-primary/5'
  return 'text-muted-foreground'
}
export function sourceLabel(entry: WorkbenchEntry, locale?: string) {
  return i18n(locale).t(
    entry.trigger === 'trial'
      ? 'sourceTrial'
      : entry.source === 'automatic'
      ? 'sourceAutomatic'
      : entry.source === 'local_git'
      ? 'sourceLocal'
      : 'sourceManual'
  )
}
