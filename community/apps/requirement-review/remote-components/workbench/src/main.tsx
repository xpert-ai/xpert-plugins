import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'
import {
  Button,
  Input,
  Textarea,
  Checkbox,
  Badge,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  FileText,
  Plus,
  RefreshCw
} from '@xpert-ai/plugin-shadcn-ui'
import {
  aiDraftSchema,
  editableDraftSchema,
  type EditableDraft
} from '../../../src/domain/contracts.js'
import { connect, request } from './bridge.js'
import { translator } from './i18n.js'

const status = z.enum([
  'READY',
  'ANALYZING',
  'REVIEWING',
  'CONFIRMED',
  'FAILED',
  'EMPTY'
])
const summary = z.object({
  id: z.string(),
  title: z.string(),
  status,
  version: z.number(),
  updatedAt: z.string(),
  requirementCount: z.number()
})
const detailSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceText: z.string(),
  sourceSegments: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      timestamp: z.string().nullable()
    })
  ),
  status,
  version: z.number(),
  inputVersion: z.number(),
  aiDraft: aiDraftSchema.nullable(),
  editableDraft: editableDraftSchema.nullable(),
  confirmedSnapshot: z
    .object({
      draft: editableDraftSchema,
      confirmedAt: z.string(),
      sourceVersion: z.number()
    })
    .nullable(),
  confirmedAt: z.string().nullable(),
  updatedAt: z.string(),
  blockers: z.array(
    z.object({ id: z.string().optional(), reason: z.string() })
  ),
  attempt: z
    .object({
      id: z.string(),
      status: z.string(),
      errorCode: z.string().nullable(),
      deadlineAt: z.string()
    })
    .nullable()
})
const dataset = z.object({
  items: z.array(summary),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  detail: detailSchema.nullable(),
  sendCommand: z.string()
})
const dataEnvelope = z.object({ data: z.object({ meta: dataset }) })
const actionEnvelope = z.object({
  result: z.object({
    success: z.boolean(),
    data: z
      .object({
        reviewId: z.string().optional(),
        attemptId: z.string().optional(),
        code: z.string().optional(),
        clientCommand: z
          .object({
            commandKey: z.string(),
            payload: z.object({ text: z.string() })
          })
          .optional()
      })
      .passthrough()
  })
})
type Detail = z.infer<typeof detailSchema>
type SourceRevision = {
  expectedVersion: number
  title: string
  sourceText: string
}
function App() {
  const [locale, setLocale] = useState('zh-CN')
  const t = translator(locale)
  const [data, setData] = useState<z.infer<typeof dataset> | null>(null)
  const [creating, setCreating] = useState(false)
  const [revision, setRevision] = useState<SourceRevision | null>(null)
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [draft, setDraft] = useState<EditableDraft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const [highlight, setHighlight] = useState('')
  const [search, setSearch] = useState('')
  const selected = useRef<string | undefined>()
  const page = useRef(1)
  const dirtyRef = useRef(false)
  const sequence = useRef(0)
  const searchRef = useRef('')
  const initialized = useRef(false)
  const requestKey = useRef<string | null>(null)
  const detail = data?.detail ?? null
  async function load(id = selected.current) {
    const generation = ++sequence.current
    try {
      const response = dataEnvelope.parse(
        await request('requestData', {
          query: {
            page: page.current,
            pageSize: 20,
            search: searchRef.current,
            parameters: { ...(id ? { reviewId: id } : {}) }
          }
        })
      )
      if (generation !== sequence.current) return
      setData(response.data.meta)
      if (!dirtyRef.current)
        setDraft(
          response.data.meta.detail?.confirmedSnapshot?.draft ??
            response.data.meta.detail?.editableDraft ??
            null
        )
      setError('')
    } catch {
      if (generation === sequence.current) setError('transport_failed')
    }
  }
  useEffect(
    () =>
      connect(
        (message) => {
          const hostLocale =
            typeof message.locale === 'string' ? message.locale : 'zh-CN'
          setLocale(hostLocale)
          const query = z
            .object({
              parameters: z
                .object({ reviewId: z.string().optional() })
                .optional(),
              page: z.number().optional(),
              search: z.string().optional()
            })
            .safeParse(message.initialQuery)
          if (query.success) {
            selected.current = query.data.parameters?.reviewId
            page.current = query.data.page ?? 1
            searchRef.current = query.data.search ?? ''
            setSearch(searchRef.current)
          }
          initialized.current = true
          void load()
        },
        () => {
          if (!dirtyRef.current) void load()
        }
      ),
    []
  )
  useEffect(() => {
    if (detail?.status !== 'ANALYZING') return
    const timer = setInterval(() => void load(), 3000)
    return () => clearInterval(timer)
  }, [detail?.status])
  useEffect(() => {
    if (!initialized.current) return
    const timer = setTimeout(() => {
      searchRef.current = search
      page.current = 1
      void load()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])
  function markDraft(value: EditableDraft) {
    dirtyRef.current = true
    setDirty(true)
    setDraft(value)
  }
  function select(id?: string) {
    if (dirtyRef.current || revision) {
      setError('version_conflict')
      return
    }
    selected.current = id
    requestKey.current = null
    setCreating(false)
    setRevision(null)
    setShowSource(false)
    void load(id)
  }
  function beginRevision(value: Detail) {
    setCreating(false)
    setRevision({
      expectedVersion: value.version,
      title: value.title,
      sourceText: value.sourceText
    })
    setError('')
  }
  async function action(key: string, input: object) {
    const result = actionEnvelope.parse(
      await request('executeAction', { actionKey: key, input })
    ).result
    if (!result.success) throw new Error(result.data.code ?? 'model_failed')
    return result.data
  }
  async function mutate(key: string) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (key === 'create') {
        const result = await action('create', { title, sourceText: source })
        selected.current = result.reviewId
        setCreating(false)
        setTitle('')
        setSource('')
      } else if (detail) {
        const identity = {
          reviewId: detail.id,
          expectedVersion: detail.version
        }
        if (key === 'revise' && revision) {
          await action('revise', {
            reviewId: detail.id,
            expectedVersion: revision.expectedVersion,
            title: revision.title,
            sourceText: revision.sourceText
          })
          requestKey.current = null
          setRevision(null)
        } else if (key === 'start') {
          requestKey.current ??= crypto.randomUUID()
          const result = await action('start', {
            ...identity,
            requestKey: requestKey.current
          })
          if (result.clientCommand) {
            try {
              const response = z
                .object({
                  result: z.object({
                    success: z.boolean().optional(),
                    handled: z.boolean().optional()
                  })
                })
                .parse(
                  await request('invokeClientCommand', {
                    commandKey: result.clientCommand.commandKey,
                    payload: {
                      ...result.clientCommand.payload,
                      clientMessageId: `reqtrace:${result.attemptId}`
                    }
                  })
                )
              if (
                response.result.success === false ||
                response.result.handled === false
              )
                throw new Error('dispatch_failed')
            } catch {
              await action('dispatch_failed', {
                reviewId: detail.id,
                attemptId: result.attemptId
              })
              requestKey.current = null
              throw new Error('dispatch_failed')
            }
          }
        } else if (key === 'save') {
          await action('save', { ...identity, draft })
          dirtyRef.current = false
          setDirty(false)
        } else if (key === 'confirm') {
          await action('confirm', identity)
          setConfirming(false)
        }
      }
      await load()
    } catch (failure) {
      const code =
        failure instanceof Error ? failure.message : 'transport_failed'
      if (key === 'revise' && code === 'version_conflict') {
        setRevision(null)
        await load(detail?.id)
      }
      setError(code)
    } finally {
      setBusy(false)
    }
  }
  function edit(
    index: number,
    fn: (item: EditableDraft['requirements'][number]) => void
  ) {
    if (!draft) return
    const next = structuredClone(draft)
    fn(next.requirements[index])
    markDraft(next)
  }
  function inspect(id: string) {
    setShowSource(true)
    setHighlight(id)
    setTimeout(
      () =>
        document
          .getElementById(`segment-${id}`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      0
    )
  }
  const blocked =
    !draft?.requirements.some((item) => item.included) ||
    draft.requirements.some(
      (item) =>
        item.included && (item.openQuestions.length || !item.acceptance.length)
    )
  return (
    <main className="h-dvh min-h-0 flex flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <FileText size={20} />
        <h1 className="font-semibold">ReqTrace · {t('app')}</h1>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('refresh')}
          disabled={busy || dirty || !!revision}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
        </Button>
        <Button
          size="sm"
          disabled={dirty || !!revision}
          onClick={() => {
            setCreating(true)
            setRevision(null)
            setError('')
          }}
        >
          <Plus size={16} />
          {t('newReview')}
        </Button>
      </header>
      {error && (
        <div
          role="alert"
          className="border-b px-4 py-2 text-destructive text-sm"
        >
          {t(error)}
        </div>
      )}
      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <aside className="md:w-52 shrink-0 border-b md:border-b-0 md:border-r flex flex-col min-h-0 max-h-44 md:max-h-none">
          <div className="p-3">
            <Input
              aria-label={t('search')}
              placeholder={t('search')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <nav className="flex-1 overflow-auto">
            {data?.items.map((item) => (
              <Button
                key={item.id}
                variant={
                  detail?.id === item.id && !creating ? 'secondary' : 'ghost'
                }
                className="w-full justify-start h-auto rounded-none px-3 py-2 text-left"
                onClick={() => select(item.id)}
              >
                <span className="min-w-0">
                  <span className="block truncate">{item.title}</span>
                  <span className="block text-xs text-muted-foreground mt-1">
                    {t(item.status)}
                  </span>
                </span>
              </Button>
            ))}
          </nav>
          <div className="flex justify-between p-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={page.current <= 1}
              onClick={() => {
                page.current--
                void load()
              }}
            >
              {t('previous')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!data || page.current * 20 >= data.total}
              onClick={() => {
                page.current++
                void load()
              }}
            >
              {t('next')}
            </Button>
          </div>
        </aside>
        <section className="flex-1 min-w-0 min-h-0 overflow-auto p-4">
          {creating ? (
            <form
              className="space-y-4 max-w-3xl mx-auto"
              onSubmit={(event) => {
                event.preventDefault()
                void mutate('create')
              }}
            >
              <h2 className="text-lg font-semibold">{t('newReview')}</h2>
              <label className="block space-y-2">
                <span>{t('title')}</span>
                <Input
                  value={title}
                  maxLength={80}
                  required
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label className="block space-y-2">
                <span>{t('source')}</span>
                <Textarea
                  className="min-h-64"
                  value={source}
                  maxLength={12000}
                  required
                  onChange={(event) => setSource(event.target.value)}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                {new Intl.NumberFormat(locale).format(source.length)} / 12,000
              </p>
              <div className="flex gap-2">
                <Button
                  disabled={busy || !title.trim() || !source.trim()}
                  type="submit"
                >
                  {t('create')}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setCreating(false)}
                >
                  {t('cancel')}
                </Button>
              </div>
            </form>
          ) : revision && detail ? (
            <form
              className="space-y-4 max-w-3xl mx-auto"
              onSubmit={(event) => {
                event.preventDefault()
                void mutate('revise')
              }}
            >
              <h2 className="text-lg font-semibold">{t('reviseSource')}</h2>
              <p
                role="status"
                className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
              >
                {t('reviseSourceHelp')}
              </p>
              <label className="block space-y-2">
                <span>{t('title')}</span>
                <Input
                  value={revision.title}
                  maxLength={80}
                  required
                  onChange={(event) =>
                    setRevision({ ...revision, title: event.target.value })
                  }
                />
              </label>
              <label className="block space-y-2">
                <span>{t('source')}</span>
                <Textarea
                  className="min-h-64"
                  value={revision.sourceText}
                  maxLength={12000}
                  required
                  onChange={(event) =>
                    setRevision({
                      ...revision,
                      sourceText: event.target.value
                    })
                  }
                />
              </label>
              <p className="text-xs text-muted-foreground">
                {new Intl.NumberFormat(locale).format(
                  revision.sourceText.length
                )}{' '}
                / 12,000
              </p>
              <div className="flex gap-2">
                <Button
                  disabled={
                    busy ||
                    !revision.title.trim() ||
                    !revision.sourceText.trim()
                  }
                  type="submit"
                >
                  {t('saveSourceRevision')}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  disabled={busy}
                  onClick={() => setRevision(null)}
                >
                  {t('cancel')}
                </Button>
              </div>
            </form>
          ) : !detail ? (
            <p className="text-muted-foreground py-16 text-center">
              {data ? t('empty') : t('loading')}
            </p>
          ) : (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex items-start gap-3 flex-wrap">
                <h2 className="text-lg font-semibold flex-1">{detail.title}</h2>
                <Badge
                  variant={
                    detail.status === 'CONFIRMED' ? 'default' : 'secondary'
                  }
                >
                  {t(detail.status)}
                </Badge>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSource(!showSource)}
                >
                  {t(showSource ? 'hideSource' : 'showSource')}
                </Button>
                {['READY', 'FAILED', 'EMPTY'].includes(detail.status) && (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => beginRevision(detail)}
                    >
                      {t('reviseSource')}
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => {
                        if (detail.status !== 'READY') requestKey.current = null
                        void mutate('start')
                      }}
                    >
                      {t(detail.status === 'READY' ? 'analyze' : 'retry')}
                    </Button>
                  </>
                )}
                {detail.status === 'REVIEWING' && (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy || !dirty}
                      onClick={() => void mutate('save')}
                    >
                      {t('save')}
                    </Button>
                    <Button
                      disabled={busy || dirty || blocked}
                      onClick={() => setConfirming(true)}
                    >
                      {t('confirm')}
                    </Button>
                    <span className="text-xs text-muted-foreground self-center">
                      {t(dirty ? 'unsaved' : 'saved')}
                    </span>
                  </>
                )}
              </div>
              {detail.status === 'ANALYZING' && (
                <p role="status" className="text-sm text-muted-foreground">
                  {t('analyzingHelp')}
                </p>
              )}
              {detail.status === 'FAILED' && (
                <p role="status" className="text-sm text-destructive">
                  {t(detail.attempt?.errorCode ?? 'model_failed')}
                </p>
              )}
              {detail.status === 'REVIEWING' && (
                <p className="text-sm text-muted-foreground">
                  {t('reviewingHelp')}
                </p>
              )}
              {detail.status === 'CONFIRMED' && (
                <p className="text-sm text-muted-foreground">
                  {t('confirmedHelp')}{' '}
                  {detail.confirmedAt &&
                    new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    }).format(new Date(detail.confirmedAt))}
                </p>
              )}
              {showSource && (
                <section
                  aria-label={t('source')}
                  className="border rounded-md p-3 max-h-64 overflow-auto space-y-3"
                >
                  {detail.sourceSegments.map((segment) => (
                    <p
                      id={`segment-${segment.id}`}
                      key={segment.id}
                      className={`text-sm whitespace-pre-wrap ${highlight === segment.id ? 'bg-accent text-accent-foreground p-2 rounded' : ''}`}
                    >
                      <span className="font-mono text-xs text-muted-foreground mr-2">
                        {segment.id}
                      </span>
                      {segment.text}
                    </p>
                  ))}
                </section>
              )}
              {draft?.requirements.map((item, index) => (
                <article
                  key={item.id}
                  className="border rounded-md p-4 space-y-3"
                  aria-label={item.title}
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{index + 1}</Badge>
                    {detail.status === 'REVIEWING' && (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={item.included}
                          onCheckedChange={(value) =>
                            edit(index, (card) => {
                              card.included = value === true
                            })
                          }
                        />
                        {t('included')}
                      </label>
                    )}
                  </div>
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">{t('title')}</span>
                    <Input
                      value={item.title}
                      maxLength={120}
                      readOnly={detail.status === 'CONFIRMED'}
                      onChange={(event) =>
                        edit(index, (card) => {
                          card.title = event.target.value
                        })
                      }
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">
                      {t('description')}
                    </span>
                    <Textarea
                      value={item.description}
                      maxLength={1200}
                      readOnly={detail.status === 'CONFIRMED'}
                      onChange={(event) =>
                        edit(index, (card) => {
                          card.description = event.target.value
                        })
                      }
                    />
                  </label>
                  <section>
                    <h3 className="text-sm font-medium mb-1">
                      {t('evidence')}
                    </h3>
                    {item.evidence.map((evidence, evidenceIndex) => (
                      <Button
                        key={evidenceIndex}
                        variant="ghost"
                        className="h-auto whitespace-normal text-left justify-start px-0 text-sm w-full"
                        onClick={() => inspect(evidence.segmentId)}
                      >
                        <span>
                          <span className="font-mono text-xs mr-2">
                            {evidence.segmentId}
                          </span>
                          “{evidence.quote}”
                        </span>
                      </Button>
                    ))}
                  </section>
                  <section className="space-y-2">
                    <h3 className="text-sm font-medium">{t('acceptance')}</h3>
                    {item.acceptance.map((criterion, criterionIndex) => (
                      <div
                        key={criterionIndex}
                        className="flex gap-2 items-start"
                      >
                        <Textarea
                          aria-label={`${t('acceptance')} ${criterionIndex + 1}`}
                          value={criterion.text}
                          maxLength={500}
                          readOnly={detail.status === 'CONFIRMED'}
                          onChange={(event) =>
                            edit(index, (card) => {
                              card.acceptance[criterionIndex].text =
                                event.target.value
                            })
                          }
                        />
                        <Select
                          value={criterion.basis}
                          disabled={detail.status === 'CONFIRMED'}
                          onValueChange={(value) =>
                            edit(index, (card) => {
                              card.acceptance[criterionIndex].basis =
                                value === 'source' ? 'source' : 'proposal'
                            })
                          }
                        >
                          <SelectTrigger
                            className="w-28 shrink-0"
                            aria-label={t('acceptance')}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="source">
                              {t('sourceBasis')}
                            </SelectItem>
                            <SelectItem value="proposal">
                              {t('proposal')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {detail.status === 'REVIEWING' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              edit(index, (card) => {
                                card.acceptance.splice(criterionIndex, 1)
                              })
                            }
                          >
                            {t('remove')}
                          </Button>
                        )}
                      </div>
                    ))}
                    {!item.acceptance.length && (
                      <p className="text-sm text-destructive">
                        {t('noAcceptance')}
                      </p>
                    )}
                    {detail.status === 'REVIEWING' &&
                      item.acceptance.length < 5 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            edit(index, (card) => {
                              card.acceptance.push({
                                text: '',
                                basis: 'proposal'
                              })
                            })
                          }
                        >
                          {t('addAcceptance')}
                        </Button>
                      )}
                  </section>
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">
                      {t('questions')}
                    </span>
                    <Textarea
                      value={item.openQuestions.join('\n')}
                      maxLength={1500}
                      readOnly={detail.status === 'CONFIRMED'}
                      placeholder={t('noQuestions')}
                      onChange={(event) =>
                        edit(index, (card) => {
                          card.openQuestions = event.target.value
                            .split('\n')
                            .filter((line) => line.trim())
                        })
                      }
                    />
                  </label>
                  {detail.aiDraft?.requirements[index] && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted-foreground">
                        {t('original')}
                      </summary>
                      <p className="whitespace-pre-wrap mt-2">
                        {detail.aiDraft.requirements[index].description}
                      </p>
                    </details>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmHelp')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || dirty || blocked}
              onClick={() => void mutate('confirm')}
            >
              {t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
