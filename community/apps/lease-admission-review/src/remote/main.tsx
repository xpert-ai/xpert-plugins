import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod/v3'
import {
  Button,
  Input,
  Textarea,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from '@xpert-ai/plugin-shadcn-ui'
import {
  Plus,
  RefreshCw,
  Save,
  Play,
  Check,
  ArrowLeft,
  ArrowRight
} from 'lucide-react'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import './style.css'
import {
  fieldsSchema,
  reviewDraftSchema,
  type Fields,
  type CaseDto
} from '../lib/contracts'
import {
  emptyScoringInput,
  scoreResultSchema,
  type ScoreResult
} from '../lib/scoring-input'
import { ScoringForm, ScorePanel } from './score-panel'
import { request, startBridge } from './bridge'
import { t, setLocale, errorText } from './i18n'
import { operationId } from './operation-id'
const caseSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.string(),
  status: z.enum(['draft', 'extracting', 'review', 'confirmed', 'failed']),
  revision: z.number(),
  attemptId: z.string().nullable(),
  candidates: fieldsSchema.nullable(),
  confirmed: fieldsSchema.nullable(),
  reason: z.string().nullable(),
  reviewDraft: reviewDraftSchema.nullable(),
  assessment: scoreResultSchema.nullable(),
  failureCode: z
    .enum(['timeout', 'dispatch_failed', 'unreadable', 'insufficient_input'])
    .nullable(),
  updatedAt: z.string()
})
const listSchema = z.object({
  items: z.array(
    caseSchema.pick({
      id: true,
      title: true,
      status: true,
      revision: true,
      updatedAt: true
    })
  ),
  total: z.number()
})
const receiptSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional()
})
async function action(name: string, input: object) {
  const r = await request('executeAction', { actionKey: name, input })
  const result = receiptSchema.parse(r.result)
  if (!result.success) {
    const e = z.object({ errorCode: z.string() }).safeParse(result.data)
    throw new Error(e.success ? e.data.errorCode : 'operation_failed')
  }
  return result.data
}
function App() {
  const [inputs, setInputs] = useState(emptyScoringInput())
  const [preview, setPreview] = useState<ScoreResult | null>(null)
  const [stale, setStale] = useState(false)
  const [saved, setSaved] = useState(false)
  const [evaluationDate, setEvaluationDate] = useState('')
  const [ready, setReady] = useState(false),
    [items, setItems] = useState<z.infer<typeof listSchema>['items']>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1)
  const [row, setRow] = useState<CaseDto | null>(null),
    [creating, setCreating] = useState(false),
    [title, setTitle] = useState(''),
    [source, setSource] = useState(''),
    [fields, setFields] = useState<Fields>([]),
    [reason, setReason] = useState(''),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [dialog, setDialog] = useState(false)
  const current = useRef({ row, dirty, page })
  current.current = { row, dirty, page }
  const createOperation = useRef(operationId()),
    inFlight = useRef(false)
  function apply(r: CaseDto) {
    setRow(r)
    setItems((list) =>
      list.map((item) =>
        item.id === r.id
          ? {
              ...item,
              status: r.status,
              revision: r.revision,
              updatedAt: r.updatedAt
            }
          : item
      )
    )
    setFields(
      r.confirmed ??
        (r.reviewDraft?.fields.length ? r.reviewDraft.fields : r.candidates) ??
        []
    )
    setReason(r.reviewDraft?.reason ?? r.reason ?? '')
    setInputs(r.reviewDraft?.inputs ?? emptyScoringInput())
    setPreview(r.assessment)
    setStale(false)
    setSaved(false)
    setDirty(false)
    setCreating(false)
  }
  async function load(id?: string) {
    const r = await request('requestData', {
      query: id ? { parameters: { id } } : { page: current.current.page }
    })
    if (id) {
      apply(
        caseSchema.parse(
          z.object({ item: caseSchema }).parse(r.data ?? r.payload).item
        )
      )
    } else {
      const data = listSchema.parse(r.data ?? r.payload)
      setItems(data.items)
      setTotal(data.total)
    }
  }
  async function refresh() {
    await load()
    if (current.current.row) {
      if (current.current.dirty) {
        setError(t('dirty'))
        return
      }
      await load(current.current.row.id)
    }
  }
  async function run(fn: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : 'operation_failed'))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  useEffect(
    () =>
      startBridge(
        (locale) => {
          setLocale(locale)
          setReady(true)
          void run(() => refresh())
        },
        () => {
          void run(() => refresh())
        }
      ),
    []
  )
  useEffect(() => {
    if (ready) void run(() => load())
  }, [page])
  useEffect(() => {
    if (row?.status !== 'extracting') return
    const timer = setInterval(() => {
      if (!current.current.dirty) void run(() => refresh())
    }, 5000)
    return () => clearInterval(timer)
  }, [row?.status])
  async function extract() {
    if (!row) return
    const data = await action('start', {
      id: row.id,
      revision: row.revision,
      operationId: operationId()
    })
    const started = caseSchema.parse(data)
    apply(started)
    const command = z
      .object({
        payload: z.object({ text: z.string(), newThread: z.literal(true) })
      })
      .parse(data)
    try {
      const dispatched = await request(
        'invokeClientCommand',
        { commandKey: 'assistant.chat.send_message', payload: command.payload },
        270000
      )
      if (
        receiptSchema.safeParse(dispatched.result).success &&
        receiptSchema.parse(dispatched.result).success === false
      )
        throw new Error('dispatch_failed')
    } catch (e) {
      if (e instanceof Error && e.message === 'request_timeout') throw e
      await action('dispatch_failed', { attemptId: started.attemptId })
      await load(started.id)
      throw e
    }
    await load()
  }
  function edit(index: number, patch: Partial<Fields[number]>) {
    setFields((list) =>
      list.map((f, i) => (i === index ? { ...f, ...patch } : f))
    )
    changed()
  }
  function changed() {
    setDirty(true)
    setStale(true)
    setSaved(false)
  }
  function scoringPayload() {
    if (!row) throw new Error('not_found')
    return {
      id: row.id,
      revision: row.revision,
      operationId: operationId(),
      fields,
      reason,
      inputs
    }
  }
  return (
    <div className="shell text-foreground bg-background">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">{t('title')}</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('refresh')}
            title={t('refresh')}
            disabled={!ready || busy || dirty}
            onClick={() => void run(refresh)}
          >
            <RefreshCw size={16} />
          </Button>
          <Button
            disabled={!ready || busy || dirty}
            onClick={() => {
              setCreating(true)
              setRow(null)
              setTitle('')
              setSource('')
              setEvaluationDate('')
              createOperation.current = operationId()
            }}
          >
            <Plus size={16} />
            {t('newCase')}
          </Button>
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="border-b px-4 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      <div className="workspace">
        <aside className="case-list border-r">
          <div className="grow overflow-y-auto">
            {items.length ? (
              items.map((item) => (
                <button
                  key={item.id}
                  disabled={busy || dirty}
                  className={
                    'case-row ' + (row?.id === item.id ? 'selected' : '')
                  }
                  onClick={() => void run(() => load(item.id))}
                >
                  <span>{item.title}</span>
                  <small>{t(item.status)}</small>
                </button>
              ))
            ) : (
              <p className="p-4 text-sm text-muted-foreground">{t('empty')}</p>
            )}
          </div>
          <div className="flex items-center justify-between border-t p-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('back')}
              disabled={page === 1 || busy || dirty}
              onClick={() => setPage((p) => p - 1)}
            >
              <ArrowLeft size={16} />
            </Button>
            <span>{page}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('next')}
              disabled={page * 20 >= total || busy || dirty}
              onClick={() => setPage((p) => p + 1)}
            >
              <ArrowRight size={16} />
            </Button>
          </div>
        </aside>
        <main className="min-w-0 overflow-y-auto p-4">
          {creating ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void run(async () => {
                  const saved = caseSchema.parse(
                    await action('create', {
                      title,
                      source,
                      evaluationDate,
                      operationId: createOperation.current
                    })
                  )
                  apply(saved)
                  await load()
                })
              }}
            >
              <label className="block space-y-2">
                <span>{t('evaluationDate')}</span>
                <Input
                  type="date"
                  required
                  value={evaluationDate}
                  onChange={(e) => setEvaluationDate(e.target.value)}
                />
              </label>
              <label className="block space-y-2">
                <span>{t('caseTitle')}</span>
                <Input
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="block space-y-2">
                <span>{t('source')}</span>
                <Textarea
                  required
                  maxLength={20000}
                  rows={12}
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </label>
              <Button type="submit" disabled={busy}>
                <Save size={16} />
                {t('create')}
              </Button>
            </form>
          ) : row ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold break-words">
                  {row.title}
                </h2>
                <span className="text-sm text-muted-foreground">
                  {t(row.status)}
                </span>
              </div>
              <details
                open={row.status === 'draft' || row.status === 'failed'}
                className="border-b pb-3"
              >
                <summary>{t('source')}</summary>
                <pre className="source mt-3 text-sm">{row.source}</pre>
              </details>
              {row.failureCode && (
                <p role="status" className="text-destructive">
                  {t(row.failureCode)}
                </p>
              )}
              {['draft', 'failed'].includes(row.status) && (
                <Button disabled={busy} onClick={() => void run(extract)}>
                  <Play size={16} />
                  {t(row.status === 'failed' ? 'retry' : 'extract')}
                </Button>
              )}
              {fields.map((field, index) => (
                <section key={field.key} className="border-b pb-4 space-y-3">
                  <h3 className="font-medium">{t(field.key)}</h3>
                  <div className="field-grid">
                    <label>
                      <span>{t('status')}</span>
                      <Select
                        value={field.status}
                        disabled={busy || row.status !== 'review'}
                        onValueChange={(value) => {
                          const status = z
                            .enum([
                              'present',
                              'missing',
                              'conflict',
                              'not_applicable'
                            ])
                            .parse(value)
                          edit(index, {
                            status,
                            ...(status === 'missing' ? { value: null } : {})
                          })
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            [
                              'present',
                              'missing',
                              'conflict',
                              'not_applicable'
                            ] as const
                          ).map((s) => (
                            <SelectItem key={s} value={s}>
                              {t(s)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    {(['value', 'unit', 'period'] as const).map((key) => (
                      <label key={key}>
                        <span>{t(key)}</span>
                        <Input
                          disabled={busy || row.status !== 'review'}
                          value={field[key] ?? ''}
                          maxLength={
                            key === 'value' ? 200 : key === 'period' ? 100 : 40
                          }
                          onChange={(e) =>
                            edit(index, { [key]: e.target.value || null })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label className="block">
                    <span
                      id={`evidence-label-${field.key}`}
                      className="text-sm text-muted-foreground"
                    >
                      {t('evidence')}
                    </span>
                    <Textarea
                      aria-labelledby={`evidence-label-${field.key}`}
                      disabled={busy || row.status !== 'review'}
                      value={field.evidence.join('\n')}
                      rows={2}
                      onChange={(e) =>
                        edit(index, {
                          evidence: e.target.value.split('\n').filter(Boolean)
                        })
                      }
                    />
                  </label>
                </section>
              ))}
              {!!fields.length && (
                <label className="block space-y-2">
                  <span id="correction-reason-label">{t('reason')}</span>
                  <Textarea
                    aria-labelledby="correction-reason-label"
                    disabled={busy || row.status !== 'review'}
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value)
                      changed()
                    }}
                  />
                </label>
              )}
              {!!fields.length &&
                (row.status !== 'confirmed' || row.assessment) && (
                  <ScoringForm
                    inputs={inputs}
                    disabled={busy || row.status !== 'review'}
                    onChange={(next) => {
                      setInputs(next)
                      changed()
                    }}
                  />
                )}
              {row.status === 'confirmed' && !row.assessment ? (
                <p>{t('historical')}</p>
              ) : (
                !!fields.length && <ScorePanel result={preview} stale={stale} />
              )}
              {saved && <p role="status">{t('draftSaved')}</p>}
              {row.status === 'review' && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() =>
                      void run(async () => {
                        apply(
                          caseSchema.parse(
                            await action('save_draft', scoringPayload())
                          )
                        )
                        setSaved(true)
                        await load()
                      })
                    }
                  >
                    {t('saveDraft')}
                  </Button>
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() =>
                      void run(async () => {
                        setPreview(
                          scoreResultSchema.parse(
                            await action('preview_score', scoringPayload())
                          )
                        )
                        setStale(false)
                      })
                    }
                  >
                    {t('previewScore')}
                  </Button>
                  <Button
                    disabled={busy || stale || !preview?.complete}
                    onClick={() => setDialog(true)}
                  >
                    <Check size={16} />
                    {t('confirm')}
                  </Button>
                  {dirty && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => apply(row)}
                    >
                      {t('discard')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">{t('select')}</p>
          )}
        </main>
      </div>
      <AlertDialog open={dialog} onOpenChange={setDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!row) return
                  apply(
                    caseSchema.parse(await action('confirm', scoringPayload()))
                  )
                  await load()
                })
              }
            >
              {t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
