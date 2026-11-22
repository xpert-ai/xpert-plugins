import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  Badge, Button, DialogDescription, DialogHeader, DialogTitle, Input, Label,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@xpert-ai/plugin-shadcn-ui'
import { useLocalizedMessage } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { ASK_ASSISTANT_COMMAND } from '../../../domain/case'
import type { CaseStatus } from '../../../domain/case'
import type { CaseDetail } from '../../../domain/contracts'
import { executeAction, invokeClientCommand } from './bridge'
import { Choice } from './choices'
import { categoryLabel, parseCreatedCase, promptSourceLabel } from './data'
import type { CategoryView, WorkbenchData } from './data'
import { i18n } from './i18n'
import { downscalePhoto } from './photo'

const STATUS_VARIANTS: Record<CaseStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline', analyzing: 'secondary', suggested: 'secondary', confirmed: 'default', failed: 'destructive'
}
const REFRESH_MS = 4000
/** How many refreshes to wait for the Assistant to pick up a request before giving up quietly. */
const MAX_WAIT_REFRESHES = 30

export function CaseDesk({ data, refresh, open }: {
  data: WorkbenchData; refresh: () => Promise<void>; open: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useLocalizedMessage(i18n)
  const requestKey = useRef<string | null>(null)
  const photoSequence = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const pickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    const sequence = ++photoSequence.current
    setPhoto(null)
    requestKey.current = null
    if (!file) { setReading(false); return }
    setReading(true)
    setError('')
    try {
      const url = await downscalePhoto(file)
      if (sequence === photoSequence.current) setPhoto(url)
    } catch {
      if (sequence === photoSequence.current) setError(i18n.message('create.photoInvalid'))
    } finally {
      if (sequence === photoSequence.current) setReading(false)
    }
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!photo || busy || !title.trim()) return
    // The key survives a failed attempt, so retrying the same input cannot create a second case.
    requestKey.current ??= crypto.randomUUID()
    setBusy(true)
    setError('')
    try {
      const created = parseCreatedCase(await executeAction('create_case', {
        requestKey: requestKey.current, title, photo: { dataUrl: photo }
      }))
      requestKey.current = null
      setPhoto(null)
      setTitle('')
      if (inputRef.current) inputRef.current.value = ''
      await refresh()
      open(created.id)
    } catch { setError(i18n.message('create.failed')) } finally { setBusy(false) }
  }
  const decided = data.cases.filter(item => item.confirmedCategoryId && item.suggestedCategoryId)
  const agreed = decided.filter(item => item.confirmedCategoryId === item.suggestedCategoryId).length
  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={event => void save(event)} className="flex flex-col gap-3">
        <h2>{i18n.t('create.heading')}</h2>
        <hr />
        <Label htmlFor="case-photo">{i18n.t('create.photoLabel')}</Label>
        <Input ref={inputRef} id="case-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => void pickPhoto(event)} />
        <p>{i18n.t('create.photoHint')}</p>
        {reading ? <p role="status">{i18n.t('create.photoReading')}</p> : null}
        {photo ? <img className="sample-preview" src={photo} alt={i18n.t('create.photoPreview')} /> : null}
        <Label htmlFor="case-title">{i18n.t('create.title')}</Label>
        <Input id="case-title" value={title} maxLength={120} disabled={busy} onChange={event => {
          requestKey.current = null; setTitle(event.target.value)
        }} />
        <p>{i18n.t('create.titleHint')}</p>
        <div><Button disabled={busy || reading || !photo || !title.trim()} type="submit">
          {i18n.t(busy ? 'common.saving' : 'create.save')}
        </Button></div>
        {error ? <p role="alert">{error}</p> : null}
      </form>
      <section className="flex flex-col gap-3">
        <h2>{i18n.t('cases.heading')}</h2><hr />
        {data.activePrompt ? <p>{i18n.t('prompt.current', {
          source: promptSourceLabel(data.activePrompt.source, data.activePrompt.runTitle)
        })}</p> : null}
        {decided.length > 0 ? <p>{i18n.t('cases.agreement', { agreed, total: decided.length })}</p> : null}
        {data.cases.length === 0 ? <p>{i18n.t('cases.empty')}</p> : (
          <Table>
            <TableHeader><TableRow>
              {(['title', 'status', 'suggested', 'confirmed'] as const).map(key => <TableHead key={key}>{i18n.t(`cases.${key}`)}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>{data.cases.map(item => (
              <TableRow key={item.id}>
                <TableCell><Button variant="link" onClick={() => open(item.id)}>{item.title}</Button></TableCell>
                <TableCell><Badge variant={STATUS_VARIANTS[item.status]}>{i18n.t(`caseStatus.${item.status}`)}</Badge></TableCell>
                <TableCell>{item.suggestedCategoryId ? categoryLabel(data.categories, item.suggestedCategoryId) : i18n.t('cases.noSuggestion')}</TableCell>
                <TableCell>{item.confirmedCategoryId ? categoryLabel(data.categories, item.confirmedCategoryId) : i18n.t('cases.notConfirmed')}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
        <p>{i18n.t('cases.limit')}</p>
      </section>
    </div>
  )
}

/** The contents of the case dialog: evidence, the Assistant's suggestion, and the person's decision. */
export function CaseDialog({ detail, categories, refresh }: {
  detail: CaseDetail; categories: CategoryView[]; refresh: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useLocalizedMessage(i18n)
  // What the person picked; until they pick, the suggestion is offered.
  const [picked, setPicked] = useState<string | null>(null)
  // Revision at which the Assistant was asked, to keep refreshing until it has acted on the case.
  const [askedAt, setAskedAt] = useState<number | null>(null)
  const running = detail.status === 'analyzing' && !detail.canAnalyze
  const waiting = running || askedAt === detail.revision
  useEffect(() => {
    if (!waiting) return
    let refreshes = 0
    const timer = setInterval(() => {
      if (!running && ++refreshes > MAX_WAIT_REFRESHES) { setAskedAt(null); return }
      void refresh()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [waiting, running, refresh])
  // Once the case has moved on, the Assistant has acted and "sent" no longer describes it.
  useEffect(() => {
    if (askedAt !== null && askedAt !== detail.revision) { setAskedAt(null); setNotice('') }
  }, [askedAt, detail.revision, setNotice])
  const category = picked ?? detail.suggestion?.categoryId ?? ''
  const analyze = async () => {
    setBusy(true); setNotice('')
    try {
      await invokeClientCommand(ASK_ASSISTANT_COMMAND, { text: i18n.t('case.message', { id: detail.id }) })
      setAskedAt(detail.revision)
      setNotice(i18n.message('case.sent'))
    } catch { setNotice(i18n.message('case.sendFailed', { id: detail.id })) } finally { setBusy(false) }
  }
  const confirm = async () => {
    setBusy(true); setNotice(''); setAskedAt(null)
    try {
      await executeAction('confirm_case', { caseId: detail.id, revision: detail.revision, categoryId: category })
      await refresh()
    } catch (error) {
      if (error instanceof Error && error.message === 'conflict') {
        await refresh()
        setNotice(i18n.message('case.conflict'))
      } else setNotice(i18n.message('common.actionFailed'))
    } finally { setBusy(false) }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{detail.title}</DialogTitle>
        <DialogDescription>{i18n.t('case.dialogHint')}</DialogDescription>
      </DialogHeader>
      <div><Badge variant={STATUS_VARIANTS[detail.status]}>{i18n.t(`caseStatus.${detail.status}`)}</Badge></div>
      {detail.photoDataUrl
        ? <img className="evidence-photo" src={detail.photoDataUrl} alt={i18n.t('case.photoAlt', { title: detail.title })} />
        : <p role="alert">{i18n.t('case.noPhoto')}</p>}
      {running ? <p role="status">{i18n.t('case.analyzing')}</p> : null}
      {detail.status === 'failed' ? <p role="alert">{i18n.t('case.failed', {
        reason: i18n.t(`failure.${detail.failureCode ?? 'unknown'}`)
      })}</p> : null}
      {detail.suggestion ? <section className="flex flex-col gap-2">
        <h3>{i18n.t('case.suggestion')}</h3><hr />
        <p>{categoryLabel(categories, detail.suggestion.categoryId)}</p>
        <p className="raw-output">{detail.suggestion.reason}</p>
        <p>{i18n.t('case.suggestionMeta', {
          model: detail.suggestion.model, prompt: promptSourceLabel(detail.suggestion.promptSource)
        })}</p>
      </section> : null}
      {detail.canAnalyze && detail.photoDataUrl ? <div>
        <Button variant={detail.status === 'draft' ? 'default' : 'outline'} disabled={busy || waiting} onClick={() => void analyze()}>
          {i18n.t(detail.status === 'draft' ? 'case.analyze' : 'case.reanalyze')}
        </Button>
      </div> : null}
      {detail.status === 'confirmed' && detail.confirmedCategoryId ? <section className="flex flex-col gap-2">
        <h3>{i18n.t('cases.confirmed')}</h3><hr />
        <p>{i18n.t('case.confirmedAs', { category: categoryLabel(categories, detail.confirmedCategoryId) })}</p>
        <p>{!detail.suggestion ? i18n.t('case.confirmedWithoutSuggestion')
          : detail.suggestion.categoryId === detail.confirmedCategoryId ? i18n.t('case.agreed')
            : i18n.t('case.corrected', { category: categoryLabel(categories, detail.suggestion.categoryId) })}</p>
      </section> : null}
      {detail.canConfirm ? <section className="flex flex-col gap-2">
        <h3>{i18n.t('case.confirm')}</h3><hr />
        <Label htmlFor="case-category">{i18n.t('case.category')}</Label>
        <Choice id="case-category" label={i18n.t('case.choose')} value={category} disabled={busy}
          onChange={setPicked} options={categories.map(item => ({ value: item.id, label: i18n.label(item.label, item.id) }))} />
        <p>{i18n.t('case.confirmHint')}</p>
        <div><Button disabled={busy || !category} onClick={() => void confirm()}>{i18n.t('case.confirm')}</Button></div>
      </section> : null}
      {notice ? <p role="status">{notice}</p> : null}
    </>
  )
}
