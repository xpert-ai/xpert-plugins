import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Badge,
  Button,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@xpert-ai/plugin-shadcn-ui'
import { RemoteI18nProvider, useLocalizedMessage, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import { ASK_ASSISTANT_COMMAND } from '../../../domain/case'
import type { CaseDetail } from '../../../domain/case'
import { executeAction, invokeClientCommand, requestData, startBridge } from './bridge'
import { parseCreatedCase, parseWorkbenchData } from './data'
import type { WorkbenchData } from './data'
import { CaseDetailView } from './detail'
import { i18n } from './i18n'
import { downscalePhoto } from './photo'
import { STATUS_KEYS, STATUS_VARIANTS } from './status'
import './styles.css'

type LoadState = 'loading' | 'ready' | 'failed'
const ANALYZING_POLL_MS = 4000
type PhotoState = 'empty' | 'reading' | 'ready' | 'invalid'

function Workbench() {
  useRemoteLocale(i18n)
  const [state, setState] = useState<LoadState>('loading')
  const [data, setData] = useState<WorkbenchData>({ cases: [], categories: [], selected: null })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Host events arrive through a listener registered once; it must read the current selection.
  const selectedIdRef = useRef<string | null>(null)

  const [title, setTitle] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoState, setPhotoState] = useState<PhotoState>('empty')
  const [submitting, setSubmitting] = useState(false)
  const [createError, setCreateError] = useLocalizedMessage(i18n)
  // One key per case being created, reused on retry so a repeated request cannot create a duplicate.
  const requestKey = useRef<string | null>(null)

  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useLocalizedMessage(i18n)
  // The "sent" notice belongs to the revision it was sent for; any later change supersedes it.
  const [noticeRevision, setNoticeRevision] = useState<number | null>(null)

  const load = useCallback(async () => {
    const caseId = selectedIdRef.current
    try {
      setData(parseWorkbenchData(await requestData(caseId ? { caseId } : {})))
      setState('ready')
    } catch {
      setState('failed')
    }
  }, [])

  const select = useCallback((caseId: string | null) => {
    selectedIdRef.current = caseId
    setSelectedId(caseId)
    setNotice('')
    void load()
  }, [load, setNotice])

  useEffect(() => startBridge(
    init => {
      i18n.setLocale(init.locale)
      void load()
    },
    () => void load()
  ), [load])

  // A run can fail after its last tool call, which sends no host event; poll while analysing.
  const analyzing = data.selected?.status === 'analyzing'
  useEffect(() => {
    if (!analyzing) return
    const timer = setInterval(() => void load(), ANALYZING_POLL_MS)
    return () => clearInterval(timer)
  }, [analyzing, load])

  const pickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    requestKey.current = null
    setCreateError('')
    if (!file) {
      setPhoto(null)
      setPhotoState('empty')
      return
    }
    setPhotoState('reading')
    try {
      setPhoto(await downscalePhoto(file))
      setPhotoState('ready')
    } catch {
      setPhoto(null)
      setPhotoState('invalid')
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || !photo || submitting) return
    requestKey.current ??= crypto.randomUUID()
    setSubmitting(true)
    setCreateError('')
    try {
      const created = parseCreatedCase(
        await executeAction('create_case', { requestKey: requestKey.current, title: trimmed, photo: { dataUrl: photo } })
      )
      requestKey.current = null
      setTitle('')
      setPhoto(null)
      setPhotoState('empty')
      select(created.id)
    } catch {
      setCreateError(i18n.message('create.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const analyze = async (detail: CaseDetail) => {
    setSending(true)
    setNotice('')
    setNoticeRevision(detail.revision)
    try {
      await invokeClientCommand(ASK_ASSISTANT_COMMAND, {
        text: i18n.t('analyze.message', { title: detail.title, id: detail.id })
      })
      setNotice(i18n.message('analyze.sent'))
    } catch {
      setNotice(i18n.message('analyze.sendFailed', { id: detail.id }))
    } finally {
      setSending(false)
    }
  }

  const selected = selectedId && data.selected?.id === selectedId ? data.selected : null

  return (
    <main className="photo-intake mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{i18n.t('view.title')}</h1>
          <p className="text-sm text-muted-foreground">{i18n.t('view.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>{i18n.t('view.refresh')}</Button>
      </header>

      {state === 'loading' ? <p className="text-sm text-muted-foreground">{i18n.t('view.loading')}</p> : null}
      {state === 'failed' ? (
        <div role="alert" className="flex items-center gap-3">
          <p className="text-sm text-destructive">{i18n.t('view.loadFailed')}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>{i18n.t('view.retry')}</Button>
        </div>
      ) : null}

      {state === 'ready' && selectedId ? (
        selected ? (
          <CaseDetailView
            detail={selected}
            categories={data.categories}
            sending={sending}
            notice={selected.revision === noticeRevision ? notice : ''}
            onBack={() => select(null)}
            onAnalyze={() => void analyze(selected)}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{i18n.t('detail.notFound')}</p>
            <div><Button variant="ghost" size="sm" onClick={() => select(null)}>{i18n.t('detail.back')}</Button></div>
          </div>
        )
      ) : null}

      {state === 'ready' && !selectedId ? (
        <>
          <form className="flex flex-col gap-3" onSubmit={event => void submit(event)} aria-labelledby="create-heading">
            <h2 id="create-heading" className="text-base font-semibold">{i18n.t('create.heading')}</h2>
            <div className="flex flex-col gap-2">
              <Label htmlFor="case-photo">{i18n.t('create.photoLabel')}</Label>
              <Input
                id="case-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-describedby="case-photo-hint"
                onChange={event => void pickPhoto(event)}
              />
              <p id="case-photo-hint" className="text-xs text-muted-foreground">{i18n.t('create.photoHint')}</p>
              {photoState === 'reading' ? <p role="status" className="text-sm text-muted-foreground">{i18n.t('create.photoReading')}</p> : null}
              {photoState === 'invalid' ? <p role="alert" className="text-sm text-destructive">{i18n.t('create.photoInvalid')}</p> : null}
              {photo ? <img src={photo} alt={i18n.t('create.photoPreview')} className="max-h-48 w-fit rounded-md border object-contain" /> : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="case-title">{i18n.t('create.label')}</Label>
              <Input
                id="case-title"
                value={title}
                maxLength={120}
                placeholder={i18n.t('create.placeholder')}
                onChange={event => setTitle(event.target.value)}
              />
            </div>
            <div>
              <Button type="submit" disabled={submitting || !title.trim() || !photo}>
                {i18n.t(submitting ? 'create.submitting' : 'create.submit')}
              </Button>
            </div>
            {createError ? <p role="alert" className="text-sm text-destructive">{createError}</p> : null}
          </form>

          <section className="flex flex-col gap-2" aria-labelledby="cases-heading" aria-live="polite">
            <h2 id="cases-heading" className="text-base font-semibold">{i18n.t('cases.heading')}</h2>
            {data.cases.length === 0 ? (
              <p className="text-sm text-muted-foreground">{i18n.t('cases.empty')}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{i18n.t('cases.count', { count: data.cases.length })}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{i18n.t('cases.column.title')}</TableHead>
                      <TableHead>{i18n.t('cases.column.status')}</TableHead>
                      <TableHead>{i18n.t('cases.column.updated')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.cases.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Button variant="link" className="h-auto p-0 text-left" onClick={() => select(item.id)}>
                            {item.title}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[item.status]}>{i18n.t(STATUS_KEYS[item.status])}</Badge>
                        </TableCell>
                        <TableCell>{i18n.date(item.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </section>
        </>
      ) : null}
    </main>
  )
}

const container = document.getElementById('root') ?? document.body.appendChild(document.createElement('div'))
createRoot(container).render(
  <RemoteI18nProvider i18n={i18n}>
    <Workbench />
  </RemoteI18nProvider>
)
