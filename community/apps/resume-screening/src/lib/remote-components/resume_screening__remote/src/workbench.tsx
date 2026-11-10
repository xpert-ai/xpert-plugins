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
  Textarea
} from '@xpert-ai/plugin-shadcn-ui'
import { executeAction, invokeClientCommand, notify, requestData, syncAssistantContext } from './bridge'
import { i18n, useLocalizedMessage, type ResumeCatalog } from './i18n'
import type { CandidateRow, HostContext, ResumeDecision, ResumeWorkbenchData } from './types'
import { React } from './vendor'

const { useCallback, useEffect, useState } = React

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
    table: { key: 'candidates', items: items as CandidateRow[], total, page, pageSize }
  }
}

function degreeLabel(degree: string) {
  return i18n.t(DEGREE_LABEL_KEY[degree as DegreeKey] ?? 'degreeBachelor')
}

export function ResumeWorkbench({ context }: { context: HostContext }) {
  const [data, setData] = useState<ResumeWorkbenchData | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useLocalizedMessage(i18n, '')
  const [search, setSearch] = useState(context.initialQuery?.search ?? '')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<CandidateRow | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async (query: { search?: string; page?: number; pageSize?: number }) => {
    setLoading(true)
    setErrorMessage('')
    try {
      const result = await requestData({
        search: query.search || undefined,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20
      })
      const parsed = readWorkbenchData(result)
      if (!parsed) throw new Error('Unexpected workbench data')
      setData(parsed)
    } catch {
      setErrorMessage(i18n.message('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [setErrorMessage])

  useEffect(() => {
    i18n.setLocale(context.locale)
  }, [context.locale])

  useEffect(() => {
    void load({ search, page })
  }, [load, search, page])

  useEffect(() => {
    window.__resumeScreeningReload = () => {
      void load({ search, page })
    }
    return () => {
      window.__resumeScreeningReload = undefined
    }
  }, [load, search, page])

  useEffect(() => {
    void syncAssistantContext(data?.screeningId ?? null)
  }, [data?.screeningId])

  const totalPages = data ? Math.max(1, Math.ceil(data.table.total / data.table.pageSize)) : 1
  const rows = data?.table.items ?? []

  return (
    <main className="flex h-full w-full flex-col gap-4 overflow-auto bg-background p-4 text-sm">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-base font-semibold">{i18n.t('title')}</h1>
        {data?.title ? <span className="text-muted-foreground">{data.title}</span> : null}
        {data?.jobTitle ? <Badge variant="secondary">{data.jobTitle}</Badge> : null}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            aria-label={i18n.t('searchLabel')}
            placeholder={i18n.t('searchPlaceholder')}
            value={search}
            onChange={(event) => {
              setPage(1)
              setSearch(event.target.value)
            }}
            className="w-56"
          />
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void load({ search, page })}
          >
            {i18n.t('refresh')}
          </Button>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            {i18n.t('createTitle')}
          </Button>
          <Button
            disabled={!data?.screeningId}
            onClick={() => setAddOpen(true)}
          >
            {i18n.t('addTitle')}
          </Button>
          <Button
            variant="secondary"
            disabled={!data?.screeningId}
            onClick={() => {
              void invokeClientCommand('assistant.chat.send_message', {
                message: i18n.t('askAssistant'),
                context: { screeningId: data?.screeningId }
              })
            }}
          >
            {i18n.t('askAssistant')}
          </Button>
        </span>
      </header>

      {loading ? (
        <p className="text-muted-foreground">{i18n.t('loading')}</p>
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
            <p className="font-medium">{i18n.t('noCandidatesTitle')}</p>
            <p className="mt-1 text-muted-foreground">{i18n.t('noCandidatesHint')}</p>
          </div>
        </section>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
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
                  expanded={expandedId === row.candidateId}
                  onToggle={() => setExpandedId(expandedId === row.candidateId ? null : row.candidateId)}
                  onConfirm={() => setConfirmTarget(row)}
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
              <span>{i18n.t('pageOf', { page, totalPages })}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                {i18n.t('nextPage')}
              </Button>
            </span>
          </footer>
        </>
      )}

      <ConfirmDialog
        row={confirmTarget}
        screeningId={data?.screeningId ?? null}
        onClose={() => setConfirmTarget(null)}
        onSaved={() => {
          setConfirmTarget(null)
          void load({ search, page })
        }}
      />
      <CreateScreeningDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false)
          setPage(1)
          void load({ search, page: 1 })
        }}
      />
      <AddCandidateDialog
        open={addOpen}
        screeningId={data?.screeningId ?? null}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false)
          void load({ search, page })
        }}
      />
    </main>
  )
}

function CandidateRowView({
  row,
  expanded,
  onToggle,
  onConfirm
}: {
  row: CandidateRow
  expanded: boolean
  onToggle: () => void
  onConfirm: () => void
}) {
  const blockers = row.prescreen.filter((finding) => finding.severity === 'error').length
  return (
    <>
      <TableRow>
        <TableCell>
          <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={onToggle}>
            {row.name}
          </button>
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
          <Button variant="outline" size="sm" disabled={row.totalScore === null} onClick={onConfirm}>
            {i18n.t('confirmTitle')}
          </Button>
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow>
          <TableCell colSpan={7}>
            <p className="mb-2 font-medium">{i18n.t('findingsTitle')}</p>
            {row.prescreen.length === 0 ? (
              <p className="text-muted-foreground">{i18n.t('findingsEmpty')}</p>
            ) : (
              <ul className="space-y-2">
                {row.prescreen.map((finding, index) => (
                  <li key={`${finding.rule}-${index}`} className="text-xs">
                    <Badge variant={finding.severity === 'error' ? 'destructive' : 'secondary'}>
                      {finding.severity === 'error' ? i18n.t('severityError') : i18n.t('severityWarning')}
                    </Badge>{' '}
                    <span className="font-mono">{finding.rule}</span> {finding.message}
                    {finding.evidence ? <p className="mt-1 text-muted-foreground">{finding.evidence}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </TableCell>
        </TableRow>
      ) : null}
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
      setDecision(row.decision ?? 'pending')
      setAdjustedTotal(row.totalScore === null ? '' : String(row.totalScore))
      setNote(row.note ?? '')
      setErrorMessage('')
    }
  }, [row, setErrorMessage])

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
              value={adjustedTotal}
              onChange={(event) => setAdjustedTotal(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-note">{i18n.t('confirmNoteLabel')}</Label>
            <Textarea
              id="confirm-note"
              placeholder={i18n.t('confirmNotePlaceholder')}
              value={note}
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
            disabled={!row || !screeningId || saving}
            onClick={async () => {
              if (!row || !screeningId) return
              setSaving(true)
              setErrorMessage('')
              try {
                const parsedAdjusted = adjustedTotal.trim() === '' ? undefined : Number(adjustedTotal)
                await executeAction('confirm_candidate', row.candidateId, {
                  screeningId,
                  candidateId: row.candidateId,
                  decision,
                  adjustedTotal: parsedAdjusted,
                  note: note.trim() === '' ? undefined : note.trim(),
                  baseRevision: row.revision
                })
                notify(i18n.t('confirmSaved'))
                onSaved()
              } catch (error) {
                const message = error instanceof Error ? error.message : ''
                setErrorMessage(
                  message.includes('revision')
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
  onClose,
  onSaved
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [jdText, setJdText] = useState('')
  const [minYears, setMinYears] = useState('5')
  const [minDegree, setMinDegree] = useState<DegreeKey>('bachelor')
  const [skills, setSkills] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useLocalizedMessage(i18n, '')

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{i18n.t('createTitle')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="create-title">{i18n.t('createTitleLabel')}</Label>
            <Input id="create-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="create-job-title">{i18n.t('createJobTitleLabel')}</Label>
            <Input id="create-job-title" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="create-jd">{i18n.t('createJdLabel')}</Label>
            <Textarea id="create-jd" rows={5} value={jdText} onChange={(event) => setJdText(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="create-min-years">{i18n.t('createMinYearsLabel')}</Label>
              <Input
                id="create-min-years"
                inputMode="numeric"
                value={minYears}
                onChange={(event) => setMinYears(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="create-min-degree">{i18n.t('createMinDegreeLabel')}</Label>
              <Select value={minDegree} onValueChange={(value) => setMinDegree(value as DegreeKey)}>
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
            <Input
              id="create-skills"
              placeholder={i18n.t('createSkillsHint')}
              value={skills}
              onChange={(event) => setSkills(event.target.value)}
            />
          </div>
          {errorMessage ? <p className="text-destructive">{errorMessage}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {i18n.t('createCancel')}
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              setErrorMessage('')
              try {
                await executeAction('create_screening', '', {
                  title: title.trim(),
                  jobTitle: jobTitle.trim(),
                  jdText: jdText.trim(),
                  minYears: Number(minYears),
                  minDegree,
                  requiredSkills: skills.split(/[,，]/).map((skill) => skill.trim()).filter(Boolean)
                })
                notify(i18n.t('createSaved'))
                setTitle('')
                setJobTitle('')
                setJdText('')
                setSkills('')
                onSaved()
              } catch {
                setErrorMessage(i18n.message('createFailed'))
              } finally {
                setSaving(false)
              }
            }}
          >
            {i18n.t('createSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddCandidateDialog({
  open,
  screeningId,
  onClose,
  onSaved
}: {
  open: boolean
  screeningId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [years, setYears] = useState('0')
  const [degree, setDegree] = useState<DegreeKey>('bachelor')
  const [skills, setSkills] = useState('')
  const [resumeText, setResumeText] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useLocalizedMessage(i18n, '')

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{i18n.t('addTitle')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="add-name">{i18n.t('addNameLabel')}</Label>
            <Input id="add-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="add-years">{i18n.t('addYearsLabel')}</Label>
              <Input id="add-years" inputMode="numeric" value={years} onChange={(event) => setYears(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-degree">{i18n.t('addDegreeLabel')}</Label>
              <Select value={degree} onValueChange={(value) => setDegree(value as DegreeKey)}>
                <SelectTrigger id="add-degree">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEGREES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {i18n.t(DEGREE_LABEL_KEY[item])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-skills">{i18n.t('addSkillsLabel')}</Label>
            <Input id="add-skills" value={skills} onChange={(event) => setSkills(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-resume">{i18n.t('addResumeLabel')}</Label>
            <Textarea id="add-resume" rows={6} value={resumeText} onChange={(event) => setResumeText(event.target.value)} />
          </div>
          {errorMessage ? <p className="text-destructive">{errorMessage}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {i18n.t('addCancel')}
          </Button>
          <Button
            disabled={!screeningId || saving}
            onClick={async () => {
              if (!screeningId) return
              setSaving(true)
              setErrorMessage('')
              try {
                await executeAction('add_candidate', '', {
                  screeningId,
                  name: name.trim(),
                  yearsOfExperience: Number(years),
                  degree,
                  skills: skills.split(/[,，]/).map((skill) => skill.trim()).filter(Boolean),
                  resumeText: resumeText.trim()
                })
                notify(i18n.t('addSaved'))
                setName('')
                setSkills('')
                setResumeText('')
                onSaved()
              } catch {
                setErrorMessage(i18n.message('addFailed'))
              } finally {
                setSaving(false)
              }
            }}
          >
            {i18n.t('addSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
