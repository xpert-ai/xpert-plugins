import { Badge, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription
} from '@xpert-ai/plugin-shadcn-ui'
import { executeAction, requestData } from './bridge'
import { i18n, useLocalizedMessage, type ResumeCatalog } from './i18n'
import type { ScreeningListItem, ScreeningEditState, ResumeScreeningStatus, ResumeDegreeLevel } from '../../../types.js'
import { React } from './vendor'
import { LoadingState } from './loading-state'

const STATUSES: Record<ResumeScreeningStatus, keyof ResumeCatalog> = {
  draft: 'screeningDraft', prescreened: 'screeningPrescreened', scored: 'screeningScored',
  reviewing: 'screeningReviewing', completed: 'screeningCompleted', failed: 'screeningFailed'
}
const DEGREES: Record<ResumeDegreeLevel, keyof ResumeCatalog> = {
  high_school: 'degreeHighSchool', associate: 'degreeAssociate', bachelor: 'degreeBachelor', master: 'degreeMaster', doctorate: 'degreeDoctorate'
}
type ListData = { items: ScreeningListItem[]; total: number; summary: { kind: 'screening_list'; page: number; pageSize: number } }
type ScreeningDetail = NonNullable<NonNullable<Awaited<ReturnType<typeof executeAction>>['data']>['screening']>

function listData(value: unknown): ListData {
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)
    || !('total' in value) || typeof value.total !== 'number' || !('summary' in value)
    || !value.summary || typeof value.summary !== 'object' || !('kind' in value.summary)
    || value.summary.kind !== 'screening_list' || !('page' in value.summary) || typeof value.summary.page !== 'number'
    || !('pageSize' in value.summary) || typeof value.summary.pageSize !== 'number'
    || !value.items.every((item: unknown) => item && typeof item === 'object'
      && 'id' in item && typeof item.id === 'string' && 'title' in item && typeof item.title === 'string'
      && 'jobTitle' in item && typeof item.jobTitle === 'string' && 'candidateCount' in item && typeof item.candidateCount === 'number'
      && 'status' in item && typeof item.status === 'string' && Object.prototype.hasOwnProperty.call(STATUSES, item.status))) {
    throw new Error('Unexpected screening list response')
  }
  return value as ListData
}

export function ScreeningList({ active, refreshKey, onOpen, onCreate, onEdit }: {
  active: boolean; refreshKey: number; onOpen: (id: string) => void; onCreate: () => void
  onEdit: (target: { id: string; state: ScreeningEditState }) => void
}) {
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [data, setData] = React.useState<ListData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<ScreeningDetail | null>(null)
  const [error, setError] = useLocalizedMessage(i18n, '')
  const sequence = React.useRef(0)
  const load = React.useCallback(async () => {
    const current = ++sequence.current
    setLoading(true); setError('')
    try {
      const result = listData(await requestData({ search: search || undefined, page, pageSize: 20,
        parameters: { mode: 'screenings', status: status === 'all' ? undefined : status } }))
      if (current === sequence.current) setData(result)
    } catch { if (current === sequence.current) setError(i18n.message('screeningListFailed')) }
    finally { if (current === sequence.current) setLoading(false) }
  }, [search, status, page, setError])
  React.useEffect(() => { if (active) void load() }, [load, active, refreshKey])
  const inspect = async (id: string, edit: boolean) => {
    setBusyId(id); setError('')
    try {
      const result = await executeAction('get_screening', id, { screeningId: id })
      if (!result.data?.screening) throw new Error('Missing screening')
      if (edit) onEdit({ id, state: result.data.screening.edit })
      else setDetail(result.data.screening)
    } catch { setError(i18n.message('screeningDetailFailed')) }
    finally { setBusyId(null) }
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / data.summary.pageSize)) : 1
  return <main className="flex h-full min-w-0 flex-col gap-4 overflow-auto bg-background p-4 text-sm">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
      <div className="grid gap-1"><h1 className="text-base font-semibold">{i18n.t('screeningListTitle')}</h1>
        <p className="text-muted-foreground">{i18n.t('screeningListHint')}</p></div>
      <Button onClick={onCreate}>{i18n.t('createTitle')}</Button>
    </header>
    <section className="flex flex-wrap items-center gap-2" aria-label={i18n.t('screeningFilters')}>
      <Input className="w-full sm:w-80" aria-label={i18n.t('screeningSearch')} placeholder={i18n.t('screeningSearch')}
        value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
      <Select value={status} onValueChange={(next) => { setStatus(next); setPage(1) }}>
        <SelectTrigger className="w-44" aria-label={i18n.t('screeningStatusFilter')}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">{i18n.t('screeningAllStatuses')}</SelectItem>
          {(Object.keys(STATUSES) as ResumeScreeningStatus[]).map((key) => <SelectItem key={key} value={key}>{i18n.t(STATUSES[key])}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button variant="ghost" disabled={loading} onClick={() => void load()}>{i18n.t('refresh')}</Button>
      {data ? <span className="text-xs text-muted-foreground">{i18n.t('screeningTotal', { count: data.total })}</span> : null}
    </section>
    {error ? <p role="alert" className="text-destructive">{error}<Button variant="link" onClick={() => void load()}>{i18n.t('retry')}</Button></p> : null}
    {loading ? <LoadingState /> : data?.items.length ? <>
      <Table><TableHeader><TableRow>
        <TableHead>{i18n.t('createTitleLabel')}</TableHead><TableHead>{i18n.t('createJobTitleLabel')}</TableHead>
        <TableHead>{i18n.t('screeningStatus')}</TableHead><TableHead>{i18n.t('screeningResumeCount')}</TableHead>
        <TableHead>{i18n.t('screeningUpdated')}</TableHead><TableHead>{i18n.t('colActions')}</TableHead>
      </TableRow></TableHeader><TableBody>{data.items.map((item) => <TableRow key={item.id}>
        <TableCell><Button variant="link" size="sm" onClick={() => onOpen(item.id)}>{item.title}</Button></TableCell>
        <TableCell>{item.jobTitle}</TableCell>
        <TableCell><Badge variant={item.status === 'failed' ? 'destructive' : 'secondary'}>{i18n.t(STATUSES[item.status])}</Badge></TableCell>
        <TableCell><Button variant="link" size="sm" onClick={() => onOpen(item.id)}>{i18n.t('screeningResumeCountValue', { count: item.candidateCount })}</Button></TableCell>
        <TableCell className="text-muted-foreground">{item.updatedAt ? i18n.date(item.updatedAt, { dateStyle: 'medium', timeStyle: 'short', hour12: false }) : '—'}</TableCell>
        <TableCell><div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" disabled={busyId === item.id} onClick={() => void inspect(item.id, false)}>{i18n.t('screeningView')}</Button>
          <Button variant="ghost" size="sm" disabled={busyId === item.id} onClick={() => void inspect(item.id, true)}>{i18n.t('screeningEdit')}</Button>
          <Button variant="outline" size="sm" onClick={() => onOpen(item.id)}>{i18n.t('screeningEnter')}</Button>
        </div></TableCell>
      </TableRow>)}</TableBody></Table>
      <footer className="flex items-center justify-end gap-2 text-muted-foreground">
        <Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>{i18n.t('prevPage')}</Button>
        <span>{i18n.t('pageOf', { page: data.summary.page, totalPages: pages })}</span>
        <Button variant="outline" size="sm" disabled={loading || page >= pages} onClick={() => setPage(page + 1)}>{i18n.t('nextPage')}</Button>
      </footer>
    </> : !loading && !error ? <section className="grid gap-2 py-12 text-center"><p className="font-medium">{i18n.t(search || status !== 'all' ? 'screeningNoMatches' : 'noScreeningTitle')}</p>
      <p className="text-muted-foreground">{i18n.t(search || status !== 'all' ? 'screeningFilterHint' : 'noScreeningHint')}</p></section> : null}
    <Sheet open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
      <SheetContent showCloseButton={false} className="overflow-hidden data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <SheetHeader><SheetTitle>{detail?.title}</SheetTitle><SheetDescription>{detail?.jobTitle}</SheetDescription>
          <Button className="absolute right-3 top-3" variant="ghost" size="sm" onClick={() => setDetail(null)}>{i18n.t('closeDetails')}</Button>
        </SheetHeader>
        {detail ? <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4">
          <p>{i18n.t('screeningResumeCountValue', { count: detail.candidateCount })} · {i18n.t(STATUSES[detail.status])}</p>
          <dl className="grid grid-cols-2 gap-4"><div><dt className="text-muted-foreground">{i18n.t('createMinYearsLabel')}</dt><dd>{detail.edit.minYears}</dd></div>
            <div><dt className="text-muted-foreground">{i18n.t('createMinDegreeLabel')}</dt><dd>{i18n.t(DEGREES[detail.edit.minDegree])}</dd></div></dl>
          <h3 className="font-medium">{i18n.t('createJdLabel')}</h3><p className="whitespace-pre-wrap break-words leading-relaxed">{detail.edit.jdText}</p>
          <h3 className="font-medium">{i18n.t('createSkillsLabel')}</h3><div className="flex flex-wrap gap-1">{detail.edit.requiredSkills.map((skill) => <Badge variant="secondary" key={skill}>{skill}</Badge>)}</div>
          <p className="text-muted-foreground">{i18n.t(detail.edit.criteriaLocked ? 'editCriteriaLocked' : 'editCriteriaHint')}</p>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => { onEdit({ id: detail.screeningId, state: detail.edit }); setDetail(null) }}>{i18n.t('editTitle')}</Button>
            <Button onClick={() => { onOpen(detail.screeningId); setDetail(null) }}>{i18n.t('screeningEnter')}</Button>
          </div>
        </div> : null}
      </SheetContent>
    </Sheet>
  </main>
}
