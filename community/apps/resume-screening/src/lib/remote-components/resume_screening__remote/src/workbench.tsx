import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  Checkbox, Collapsible, CollapsibleContent, CollapsibleTrigger,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction
} from '@xpert-ai/plugin-shadcn-ui'
import { executeAction, notify, requestData, syncAssistantContext, WorkbenchActionError } from './bridge'
import { RESUME_REVISION_CONFLICT, RESUME_CRITERIA_LOCKED } from '../../../action-contract.js'
import { sendScoringRequest, type ScoringRequest } from './assistant-request'
import { i18n, useLocalizedMessage, type ResumeCatalog } from './i18n'
import type { CandidateRow, HostContext, ResumeDecision, ResumeWorkbenchData } from './types'
import { React } from './vendor'
import { ScoreDetailsDialog } from './score-details-dialog'
import { parseSkillInput } from './skill-input'
import type { ScreeningEditState } from '../../../types.js'
import { CandidatePanel } from './candidate-panel'
import { SkillTagsInput } from './skill-tags-input'
import { ScreeningList } from './screening-list'
import { LoadingState } from './loading-state'
import { screeningFormErrors } from './screening-form'

const { useCallback, useEffect, useRef, useState } = React

type DegreeKey = 'high_school' | 'associate' | 'bachelor' | 'master' | 'doctorate'
const DEGREES: DegreeKey[] = ['high_school', 'associate', 'bachelor', 'master', 'doctorate']
const DEGREE_LABEL_KEY: Record<DegreeKey, keyof ResumeCatalog> = {
  high_school: 'degreeHighSchool',
  associate: 'degreeAssociate',
  bachelor: 'degreeBachelor',
  master: 'degreeMaster',
  doctorate: 'degreeDoctorate'
}
const DECISION_LABEL_KEY: Record<ResumeDecision, keyof ResumeCatalog> = {
  interview: 'decisionInterview',
  pending: 'decisionPending',
  rejected: 'decisionRejected'
}

const SUGGESTED_LABEL_KEY: Record<ResumeDecision, keyof ResumeCatalog> = {
  interview: 'suggestInterview',
  pending: 'suggestPending',
  rejected: 'suggestRejected'
}

function readWorkbenchData(value: unknown): ResumeWorkbenchData | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const items = record['items']
  const summary = record['summary'] as Record<string, unknown> | undefined
  if (!Array.isArray(items) || !summary) return null
  const total = typeof record['total'] === 'number' ? record['total'] : items.length
  const page = typeof summary['page'] === 'number' ? summary['page'] : 1
  const pageSize = typeof summary['pageSize'] === 'number' ? summary['pageSize'] : 20
  return {
    screeningId: typeof summary['screeningId'] === 'string' ? summary['screeningId'] : null,
    title: typeof summary['title'] === 'string' ? summary['title'] : null,
    jobTitle: typeof summary['jobTitle'] === 'string' ? summary['jobTitle'] : null,
    status: typeof summary['status'] === 'string' ? summary['status'] : null,
    tableKey: 'candidates',
    table: { key: 'candidates', items: items as CandidateRow[], total, page, pageSize },
    jdText: typeof summary['jdText'] === 'string' ? summary['jdText'] : '',
    edit: readEditState(summary['edit']),
    screenings: Array.isArray(summary['screenings']) ? summary['screenings'] as ResumeWorkbenchData['screenings'] : []
  }
}

function readEditState(value: unknown): ScreeningEditState | undefined {
  if (!value || typeof value !== 'object' || !('title' in value) || typeof value.title !== 'string'
    || !('jobTitle' in value) || typeof value.jobTitle !== 'string'
    || !('jdText' in value) || typeof value.jdText !== 'string'
    || !('minYears' in value) || typeof value.minYears !== 'number'
    || !('minDegree' in value) || !DEGREES.includes(value.minDegree as DegreeKey)
    || !('requiredSkills' in value) || !Array.isArray(value.requiredSkills)
    || !value.requiredSkills.every((skill: unknown) => typeof skill === 'string')
    || !('version' in value) || typeof value.version !== 'string'
    || !('criteriaLocked' in value) || typeof value.criteriaLocked !== 'boolean') return undefined
  return value as ScreeningEditState
}

function degreeLabel(degree: string) {
  return i18n.t(DEGREE_LABEL_KEY[degree as DegreeKey] ?? 'degreeBachelor')
}

export function ResumeWorkbench({ context }: { context: HostContext }) {
  const initialId = context.initialQuery?.parameters?.['screeningId']
  const [activeId, setActiveId] = useState<string | null>(typeof initialId === 'string' ? initialId : null)
  const [listRefresh, setListRefresh] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<{ id: string; state: ScreeningEditState } | null>(null)
  useEffect(() => { i18n.setLocale(context.locale) }, [context.locale])
  useEffect(() => { if (typeof initialId === 'string') setActiveId(initialId) }, [initialId])
  return <>
    <div hidden={activeId !== null} className="h-full min-w-0">
      <ScreeningList active={activeId === null} refreshKey={listRefresh}
        onOpen={setActiveId} onCreate={() => setCreateOpen(true)} onEdit={setEditTarget} />
    </div>
    {activeId ? <ScreeningWorkspace key={activeId} context={context} initialId={activeId}
      onBack={() => { setActiveId(null); setListRefresh((value) => value + 1); void syncAssistantContext(null).catch(() => {}) }} /> : null}
    <CreateScreeningDialog open={createOpen || editTarget !== null} edit={editTarget}
      onClose={() => { setCreateOpen(false); setEditTarget(null) }} onSaved={(id) => {
        if (createOpen) setActiveId(id)
        setCreateOpen(false); setEditTarget(null); setListRefresh((value) => value + 1)
      }} />
  </>
}

function ScreeningWorkspace({ context, initialId, onBack }: { context: HostContext; initialId: string; onBack: () => void }) {
  const [data, setData] = useState<ResumeWorkbenchData | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useLocalizedMessage(i18n, '')
  const [refreshError, setRefreshError] = useLocalizedMessage(i18n, '')
  const hasCurrentData = useRef(false)
  const blockingLoad = useRef(true)
  const [search, setSearch] = useState(context.initialQuery?.search ?? '')
  const [searchDraft, setSearchDraft] = useState(context.initialQuery?.search ?? '')
  const [page, setPage] = useState(1)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<CandidateRow | null>(null)
  const [candidatePanel, setCandidatePanel] = useState<{ id: string | null } | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pendingScore, setPendingScore] = useState<{ ids: string[]; replaceReviewed: boolean } | null>(null)
  const [preparing, setPreparing] = useState(false)
  const preparingRef = useRef(false)
  const [jobOpen, setJobOpen] = useState(false)
  const screeningId = initialId
  const requestSequence = useRef(0)
  const [sending, setSending] = useState(false)
  const [failedScoringRequest, setFailedScoringRequest] = useState<ScoringRequest | null>(null)
  const [assistantError, setAssistantError] = useLocalizedMessage(i18n, '')
  const sendingRef = useRef(false)
  const activeScreeningId = useRef(data?.screeningId)
  activeScreeningId.current = data?.screeningId

  const sendToAssistant = async (request: ScoringRequest) => {
    if (sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setAssistantError('')
    setFailedScoringRequest(null)
    try {
      await sendScoringRequest(request)
      notify(i18n.t('assistantSent'))
    } catch (error) {
      if (activeScreeningId.current !== request.screeningId) return
      setFailedScoringRequest(request)
      const reason = error instanceof Error ? error.message.split('\n')[0].slice(0, 250) : ''
      setAssistantError(reason ? i18n.message('assistantFailedWithReason', { reason }) : i18n.message('assistantFailed'))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  useEffect(() => {
    setFailedScoringRequest(null)
    setAssistantError('')
  }, [data?.screeningId, setAssistantError])
  useEffect(() => { setSelectedIds([]) }, [screeningId, search, page])

  const load = useCallback(async (query: { search?: string; page?: number; pageSize?: number }, background = false) => {
    const sequence = ++requestSequence.current
    const silent = background && hasCurrentData.current && !blockingLoad.current
    if (!silent) {
      hasCurrentData.current = false
      blockingLoad.current = true
      setLoading(true)
    }
    setErrorMessage('')
    setRefreshError('')
    try {
      const result = await requestData({
        search: query.search || undefined,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        parameters: { screeningId }
      })
      const parsed = readWorkbenchData(result)
      if (!parsed) throw new Error('Unexpected workbench data')
      if (sequence !== requestSequence.current) return
      setData(parsed)
      hasCurrentData.current = true
    } catch (error) {
      if (sequence === requestSequence.current) {
        const reason = error instanceof Error ? error.message.split('\n')[0].slice(0, 250) : ''
        if (silent) setRefreshError(i18n.message('backgroundRefreshFailed'))
        else setErrorMessage(reason ? i18n.message('loadFailedWithReason', { reason }) : i18n.message('loadFailed'))
      }
    } finally {
      if (sequence === requestSequence.current) {
        blockingLoad.current = false
        setLoading(false)
      }
    }
  }, [setErrorMessage, setRefreshError, screeningId])

  useEffect(() => {
    i18n.setLocale(context.locale)
  }, [context.locale])

  useEffect(() => {
    void load({ search, page })
  }, [load, search, page])

  useEffect(() => {
    let refreshing = false
    let queued = false
    let disposed = false
    const refresh = async () => {
      queued = true
      if (refreshing) return
      refreshing = true
      do {
        queued = false
        await load({ search, page }, true)
      } while (queued && !disposed)
      refreshing = false
    }
    window.__resumeScreeningReload = () => { void refresh() }
    return () => {
      disposed = true
      window.__resumeScreeningReload = undefined
    }
  }, [load, search, page])

  useEffect(() => {
    void syncAssistantContext(data?.screeningId ?? null).catch(() => {})
  }, [data?.screeningId])

  const totalPages = data ? Math.max(1, Math.ceil(data.table.total / data.table.pageSize)) : 1
  const rows = data?.table.items ?? []
  const applySearch = (next: string) => {
    const query = next.trim()
    setSelectedIds([])
    setPage(1)
    setSearch(query)
    if (query === search && page === 1) void load({ search: query, page: 1 })
  }
  const scoreCandidates = async (ids: string[], confirmed = false, replaceReviewed = false) => {
    if (!data?.screeningId || !ids.length || preparingRef.current || sendingRef.current) return
    const selectedRows = rows.filter((row) => ids.includes(row.candidateId))
    if (!confirmed && selectedRows.some((row) => row.aiTotalScore != null || row.totalScore !== null || row.decision
      || (row.scoreState !== undefined && row.scoreState !== 'unscored'))) {
      setPendingScore({ ids, replaceReviewed: selectedRows.some((row) => Boolean(row.decision) && row.scoreState !== 'stale') })
      return
    }
    setCandidatePanel(null)
    preparingRef.current = true; setPreparing(true); setAssistantError('')
    try {
      const task = await executeAction('prepare_scoring', '', { screeningId: data.screeningId,
        candidateIds: ids, requestId: crypto.randomUUID(), replaceReviewed })
      if (!task.data?.taskId) throw new Error('Missing scoring task')
      await sendToAssistant({ screeningId: data.screeningId, text: i18n.t('scoringSelectedRequest', {
        screeningId: data.screeningId, taskId: task.data.taskId, candidateIds: ids.join(', ')
      }) })
    } catch { setAssistantError(i18n.message('scorePrepareFailed')) }
    finally { preparingRef.current = false; setPreparing(false) }
  }
  const toggleCandidate = (id: string, selected: boolean) => {
    setSelectedIds((current) => selected ? [...new Set([...current, id])].slice(0, 20) : current.filter((item) => item !== id))
  }

  return (
    <main className="flex h-full w-full flex-col gap-4 overflow-auto bg-background p-4 text-sm">
      <header className="grid gap-3 border-b pb-4">
        <div><Button variant="link" size="sm" onClick={onBack}>{i18n.t('backToScreenings')}</Button></div>
        <h1 className="text-base font-semibold">{data?.title ?? i18n.t('title')}</h1>
        <Collapsible open={jobOpen} onOpenChange={setJobOpen}>
        <div className="flex flex-wrap items-center gap-2">
          {data?.jobTitle ? <Badge variant="secondary">{data.jobTitle}</Badge> : null}
          {data?.jdText ? <CollapsibleTrigger asChild><Button variant="ghost" size="sm">
            {i18n.t(jobOpen ? 'hideJob' : 'viewJob')}
          </Button></CollapsibleTrigger> : null}
        </div>
          {data?.jdText ? <CollapsibleContent className="pt-3"><p className="max-w-4xl whitespace-pre-wrap break-words text-muted-foreground">{data.jdText}</p></CollapsibleContent> : null}
        </Collapsible>
      </header>
      {assistantError ? (
        <p role="alert" className="text-destructive">
          {assistantError}{' '}
          {failedScoringRequest && failedScoringRequest.screeningId === data?.screeningId ? <Button variant="link" disabled={sending} onClick={() => failedScoringRequest && void sendToAssistant(failedScoringRequest)}>
            {i18n.t('retry')}
          </Button> : null}
        </p>
      ) : null}
      {data?.screeningId ? <section className="grid gap-3" aria-label={i18n.t('candidateSection')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex flex-wrap items-center gap-2" aria-label={i18n.t('candidateSearchForm')}
          onSubmit={(event) => { event.preventDefault(); if (!loading) applySearch(searchDraft) }}>
          <Input aria-label={i18n.t('searchLabel')} placeholder={i18n.t('searchPlaceholder')} value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)} className="min-w-40 flex-1 sm:max-w-80" />
          <Button type="submit" variant="outline" disabled={loading}>{i18n.t('searchAction')}</Button>
          <Button type="button" variant="outline" disabled={loading} onClick={() => { setSearchDraft(''); applySearch('') }}>{i18n.t('resetAction')}</Button>
        </form>
          <Button disabled={loading} onClick={() => setCandidatePanel({ id: null })}>{i18n.t('addTitle')}</Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <Button variant="outline" disabled={loading || preparing || sending || !selectedIds.length}
            onClick={() => void scoreCandidates(selectedIds)}>{i18n.t('scoreSelectionAction')}</Button>
          {selectedIds.length ? <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{i18n.t('selectedCount', { count: selectedIds.length })}</span>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>{i18n.t('clearSelection')}</Button>
          </div> : null}
        </div>
      </section> : null}

      {refreshError ? <p role="alert" className="text-destructive">
        {refreshError}{' '}
        <Button variant="link" onClick={() => void load({ search, page }, true)}>{i18n.t('retry')}</Button>
      </p> : null}
      {loading ? (
        <LoadingState />
      ) : errorMessage ? (
        <p className="text-destructive">
          {errorMessage}{' '}
          <Button variant="link" onClick={() => void load({ search, page })}>
            {i18n.t('retry')}
          </Button>
        </p>
      ) : !data?.screeningId ? (
        <section className="grid place-items-center py-16 text-center">
          <div>
            <p className="font-medium">{i18n.t('noScreeningTitle')}</p>
            <p className="mt-1 text-muted-foreground">{i18n.t('noScreeningHint')}</p>
          </div>
        </section>
      ) : rows.length === 0 ? (
        <section className="grid place-items-center py-16 text-center">
          <div>
            <p className="font-medium">{i18n.t(search.trim() ? 'noMatchesTitle' : 'noCandidatesTitle')}</p>
            <p className="mt-1 text-muted-foreground">{i18n.t(search.trim() ? 'noMatchesHint' : 'noCandidatesHint')}</p>
          </div>
        </section>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><Checkbox aria-label={i18n.t('selectPage')}
                  checked={rows.length > 0 && rows.every((row) => selectedIds.includes(row.candidateId))}
                  onCheckedChange={(checked) => setSelectedIds(checked === true ? rows.map((row) => row.candidateId).slice(0, 20) : [])} /></TableHead>
                <TableHead>{i18n.t('colCandidate')}</TableHead>
                <TableHead>{i18n.t('colYears')}</TableHead>
                <TableHead>{i18n.t('colDegree')}</TableHead>
                <TableHead>{i18n.t('colSkills')}</TableHead>
                <TableHead>{i18n.t('colScore')}</TableHead>
                <TableHead>{i18n.t('colDecision')}</TableHead>
                <TableHead>{i18n.t('colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <CandidateRowView
                  key={row.candidateId}
                  row={row}
                  onDetails={() => setDetailsId(row.candidateId)}
                  onConfirm={() => setConfirmTarget(row)}
                  selected={selectedIds.includes(row.candidateId)}
                  onSelect={(selected) => toggleCandidate(row.candidateId, selected)}
                  onResume={() => setCandidatePanel({ id: row.candidateId })}
                  onScore={() => void scoreCandidates([row.candidateId])}
                  scoring={sending || preparing}
                />
              ))}
            </TableBody>
          </Table>
          <footer className="flex items-center gap-2 text-muted-foreground">
            <span>{i18n.t('totalCandidates', { total: data.table.total })}</span>
            <span className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                {i18n.t('prevPage')}
              </Button>
              <span>{i18n.t('pageOf', { page: data.table.page, totalPages })}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                {i18n.t('nextPage')}
              </Button>
            </span>
          </footer>
        </>
      )}

      <ScoreDetailsDialog
        row={rows.find((row) => row.candidateId === detailsId) ?? null}
        onClose={() => setDetailsId(null)}
        onReview={(row) => { setDetailsId(null); setConfirmTarget(row) }}
        onResume={(row) => { setDetailsId(null); setCandidatePanel({ id: row.candidateId }) }}
      />
      <ConfirmDialog
        row={confirmTarget}
        screeningId={data?.screeningId ?? null}
        onClose={() => setConfirmTarget(null)}
        onSaved={() => {
          setConfirmTarget(null)
          void load({ search, page })
        }}
      />
      <CandidatePanel
        open={candidatePanel !== null}
        candidateId={candidatePanel?.id ?? null}
        screeningId={data?.screeningId ?? null}
        onClose={() => setCandidatePanel(null)}
        onScore={(id) => { void scoreCandidates([id]) }}
        onSaved={() => {
          void load({ search, page })
        }}
      />
      <AlertDialog open={pendingScore !== null} onOpenChange={(open) => !open && setPendingScore(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{i18n.t(pendingScore?.replaceReviewed ? 'reevaluateTitle' : 'rescoreTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{i18n.t(pendingScore?.replaceReviewed ? 'reevaluateHint' : 'rescoreHint')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{i18n.t('createCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const request = pendingScore; setPendingScore(null); if (request) void scoreCandidates(request.ids, true, request.replaceReviewed) }}>{i18n.t('reevaluateConfirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

function CandidateRowView({
  row,
  onDetails,
  onConfirm, selected, onSelect, onResume, onScore, scoring
}: {
  row: CandidateRow
  onDetails: () => void
  onConfirm: () => void
  selected: boolean; onSelect: (selected: boolean) => void; onResume: () => void; onScore: () => void; scoring: boolean
}) {
  const blockers = row.prescreen.filter((finding) => finding.severity === 'error').length
  return (
    <>
      <TableRow>
        <TableCell><Checkbox checked={selected} aria-label={i18n.t('selectCandidate', { name: row.name })}
          onCheckedChange={(checked) => onSelect(checked === true)} /></TableCell>
        <TableCell>
          <Button variant="link" size="sm" onClick={onResume}>{row.name}</Button>
          {row.note ? <p className="mt-1 max-w-64 truncate text-xs text-muted-foreground">{row.note}</p> : null}
        </TableCell>
        <TableCell>{row.yearsOfExperience}</TableCell>
        <TableCell>{degreeLabel(row.degree)}</TableCell>
        <TableCell>
          <span className="flex max-w-64 flex-wrap gap-1">
            {row.skills.map((skill) => (
              <Badge key={skill} variant="secondary">
                {skill}
              </Badge>
            ))}
          </span>
        </TableCell>
        <TableCell>
          {row.totalScore === null ? (
            <span className="text-muted-foreground">{i18n.t('scoreUnscored')}</span>
          ) : (
            <span className="font-semibold">{row.totalScore}</span>
          )}
          {row.scoreState === 'stale' || row.scoreState === 'unverified' ? <p className="mb-1 max-w-52 text-xs text-muted-foreground">{i18n.t(`state_${row.scoreState}`)}</p> : null}
          <Button variant="ghost" size="sm" onClick={onDetails} aria-label={i18n.t('openScoreDetails', { name: row.name })} aria-haspopup="dialog">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></svg>
            {i18n.t('scoreDetailsButton')}
          </Button>
          {blockers > 0 ? (
            <Badge variant="destructive" className="ml-2">
              {blockers}
            </Badge>
          ) : null}
        </TableCell>
        <TableCell>
          {row.decision ? (
            <Badge>{i18n.t(DECISION_LABEL_KEY[row.decision])}</Badge>
          ) : row.suggestedDecision ? (
            <span className="text-muted-foreground">
              {i18n.t('suggestedPrefix', { decision: i18n.t(SUGGESTED_LABEL_KEY[row.suggestedDecision]) })}
            </span>
          ) : (
            <span className="text-muted-foreground">{i18n.t('decisionUnscored')}</span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onResume}>{i18n.t('viewResume')}</Button>
            <Button variant="outline" size="sm" disabled={scoring} onClick={onScore}>{i18n.t(row.aiTotalScore != null || row.totalScore !== null || (row.scoreState !== undefined && row.scoreState !== 'unscored') ? 'rescoreOne' : 'scoreOne')}</Button>
            <Button variant="ghost" size="sm" disabled={row.totalScore === null || row.scoreState === 'stale'} onClick={onConfirm}>{i18n.t('confirmTitle')}</Button>
          </div>
        </TableCell>
      </TableRow>

    </>
  )
}

function ConfirmDialog({
  row,
  screeningId,
  onClose,
  onSaved
}: {
  row: CandidateRow | null
  screeningId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [decision, setDecision] = useState<ResumeDecision>('pending')
  const [adjustedTotal, setAdjustedTotal] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useLocalizedMessage(i18n, '')

  useEffect(() => {
    if (row) {
      setDecision(row.decision ?? row.suggestedDecision ?? 'pending')
      setAdjustedTotal(row.totalScore === null ? '' : String(row.totalScore))
      setNote(row.note ?? '')
      setErrorMessage('')
    }
  }, [row, setErrorMessage])

  const adjustedTotalInvalid = adjustedTotal.trim() !== '' && (
    !Number.isInteger(Number(adjustedTotal)) || Number(adjustedTotal) < 0 || Number(adjustedTotal) > 100
  )

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {i18n.t('confirmTitle')}
            {row ? ` — ${row.name}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="confirm-decision">{i18n.t('confirmDecisionLabel')}</Label>
            <Select value={decision} onValueChange={(value) => setDecision(value as ResumeDecision)}>
              <SelectTrigger id="confirm-decision">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DECISION_LABEL_KEY) as ResumeDecision[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {i18n.t(DECISION_LABEL_KEY[key])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-adjusted">{i18n.t('confirmAdjustedLabel')}</Label>
            <Input
              id="confirm-adjusted"
              inputMode="numeric"
              type="number" min={0} max={100} step={1}
              value={adjustedTotal}
              aria-invalid={adjustedTotalInvalid || undefined}
              aria-describedby={adjustedTotalInvalid ? 'confirm-adjusted-hint confirm-adjusted-error' : 'confirm-adjusted-hint'}
              onChange={(event) => setAdjustedTotal(event.target.value)}
            />
            <p id="confirm-adjusted-hint" className="text-muted-foreground">{i18n.t('confirmAdjustedHint')}</p>
            {adjustedTotalInvalid ? <p id="confirm-adjusted-error" role="alert" className="text-destructive">
              {i18n.t('confirmAdjustedInvalid')}
            </p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-note">{i18n.t('confirmNoteLabel')}</Label>
            <Textarea
              id="confirm-note"
              placeholder={i18n.t('confirmNotePlaceholder')}
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          {errorMessage ? <p className="text-destructive">{errorMessage}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {i18n.t('confirmCancel')}
          </Button>
          <Button
            disabled={!row || !screeningId || saving || adjustedTotalInvalid}
            onClick={async () => {
              if (!row || !screeningId || adjustedTotalInvalid) return
              setSaving(true)
              setErrorMessage('')
              try {
                const parsedAdjusted = adjustedTotal.trim() === '' ? null : Number(adjustedTotal)
                await executeAction('confirm_candidate', row.candidateId, {
                  screeningId,
                  candidateId: row.candidateId,
                  decision,
                  adjustedTotal: parsedAdjusted,
                  note: note.trim(),
                  baseRevision: row.revision
                })
                notify(i18n.t('confirmSaved'))
                onSaved()
              } catch (error) {
                setErrorMessage(
                  error instanceof WorkbenchActionError && error.code === RESUME_REVISION_CONFLICT
                    ? i18n.message('confirmRevisionConflict')
                    : i18n.message('confirmFailed')
                )
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? i18n.t('confirmSaving') : i18n.t('confirmSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateScreeningDialog({
  open,
  edit,
  onClose,
  onSaved
}: {
  open: boolean
  edit: { id: string; state: ScreeningEditState } | null
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const requestId = useRef(crypto.randomUUID())
  const lastEdit = useRef(edit)
  if (edit) lastEdit.current = edit
  const displayEdit = open ? edit : lastEdit.current
  const [title, setTitle] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [jdText, setJdText] = useState('')
  const [minYears, setMinYears] = useState('5')
  const [minDegree, setMinDegree] = useState<DegreeKey>('bachelor')
  const [skills, setSkills] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useLocalizedMessage(i18n, '')

  useEffect(() => {
    if (!open) return
    const saved = edit?.state
    setTitle(saved?.title ?? '')
    setJobTitle(saved?.jobTitle ?? '')
    setJdText(saved?.jdText ?? '')
    setMinYears(String(saved?.minYears ?? 5))
    setMinDegree(saved?.minDegree ?? 'bachelor')
    setSkills(saved?.requiredSkills.join(', ') ?? '')
    setErrorMessage('')
  }, [open, edit, setErrorMessage])
  const criteriaLocked = saving || displayEdit?.state.criteriaLocked === true
  const fieldErrors = screeningFormErrors({ title, jobTitle, jdText, minYears, skills })
  const invalidFields = Object.values(fieldErrors).filter((key) => key !== null)

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{i18n.t(displayEdit ? 'editTitle' : 'createTitle')}</DialogTitle>
        </DialogHeader>
        {displayEdit ? <p className="text-muted-foreground">{i18n.t(displayEdit.state.criteriaLocked ? 'editCriteriaLocked' : 'editCriteriaHint')}</p> : null}
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="create-title">{i18n.t('createTitleLabel')}</Label>
            <Input id="create-title" aria-required="true" aria-invalid={Boolean(fieldErrors.title)} aria-describedby={fieldErrors.title ? 'create-validation' : undefined} maxLength={200} disabled={saving} value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="create-job-title">{i18n.t('createJobTitleLabel')}</Label>
            <Input id="create-job-title" aria-required="true" aria-invalid={Boolean(fieldErrors.jobTitle)} aria-describedby={fieldErrors.jobTitle ? 'create-validation' : undefined} maxLength={200} disabled={criteriaLocked} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="create-jd">{i18n.t('createJdLabel')}</Label>
            <Textarea id="create-jd" aria-required="true" aria-invalid={Boolean(fieldErrors.jdText)} aria-describedby={fieldErrors.jdText ? 'create-validation' : undefined} maxLength={20000} disabled={criteriaLocked} rows={5} value={jdText} onChange={(event) => setJdText(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="create-min-years">{i18n.t('createMinYearsLabel')}</Label>
              <Input
                id="create-min-years"
                aria-required="true" aria-invalid={Boolean(fieldErrors.minYears)} aria-describedby={fieldErrors.minYears ? 'create-validation' : undefined}
                disabled={criteriaLocked}
                type="number" min={0} max={50} step={1}
                inputMode="numeric"
                value={minYears}
                onChange={(event) => setMinYears(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="create-min-degree">{i18n.t('createMinDegreeLabel')}</Label>
              <Select disabled={criteriaLocked} value={minDegree} onValueChange={(value) => setMinDegree(value as DegreeKey)}>
                <SelectTrigger id="create-min-degree">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEGREES.map((degree) => (
                    <SelectItem key={degree} value={degree}>
                      {i18n.t(DEGREE_LABEL_KEY[degree])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="create-skills">{i18n.t('createSkillsLabel')}</Label>
            <SkillTagsInput id="create-skills" value={skills} onChange={setSkills} disabled={criteriaLocked} limit={20} />
          </div>
          {invalidFields.length ? <div id="create-validation" role="status" className="text-destructive">
            <ul className="list-inside list-disc">{invalidFields.map((key) => <li key={key}>{i18n.t(key)}</li>)}</ul>
          </div> : null}
          {errorMessage ? <p className="text-destructive">{errorMessage}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            {i18n.t('createCancel')}
          </Button>
          <Button
            disabled={saving || invalidFields.length > 0}
            onClick={async () => {
              setSaving(true)
              setErrorMessage('')
              try {
                const result = await executeAction(edit ? 'update_screening' : 'create_screening', '', {
                  ...(edit ? { screeningId: edit.id, baseVersion: edit.state.version } : { requestId: requestId.current }),
                  title: title.trim(),
                  jobTitle: jobTitle.trim(),
                  jdText: jdText.trim(),
                  minYears: Number(minYears),
                  minDegree,
                  requiredSkills: edit?.state.criteriaLocked ? edit.state.requiredSkills : parseSkillInput(skills)
                })
                if (!result.data?.screeningId) throw new Error('Missing screening id')
                requestId.current = crypto.randomUUID()
                notify(i18n.t(edit ? 'editSaved' : 'createSaved'))
                onSaved(result.data.screeningId)
              } catch (error) {
                setErrorMessage(edit
                  ? i18n.message(error instanceof WorkbenchActionError && error.code === RESUME_REVISION_CONFLICT
                    ? 'editConflict' : error instanceof WorkbenchActionError && error.code === RESUME_CRITERIA_LOCKED
                      ? 'editCriteriaChanged' : 'editFailed')
                  : i18n.message('createFailed'))
              } finally {
                setSaving(false)
              }
            }}
          >
            {i18n.t(saving ? 'editSaving' : displayEdit ? 'editSave' : 'createSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
