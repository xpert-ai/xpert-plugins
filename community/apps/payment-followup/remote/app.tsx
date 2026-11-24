import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod/v3'
import {
  Button,
  Input,
  Textarea,
  Label,
  Badge,
  Separator,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@xpert-ai/plugin-shadcn-ui'
import { createRemoteI18n, RemoteI18nProvider, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import en from './locales/en.json'
import zh from './locales/zh-Hans.json'
import { analysisSchema, confirmationSchema, inputSchema } from '../src/lib/domain'
import type { Analysis, CaseInput, Confirmation } from '../src/lib/domain'
import { listen, post, request } from './bridge'
import './style.css'

const i18n = createRemoteI18n({ en, 'zh-Hans': zh }, 'zh-Hans')
const t = i18n.t
type Key = keyof typeof en
const statusSchema = z.enum(['draft', 'processing', 'review', 'confirmed', 'failed'])
const recordSchema = z.object({
  id: z.string(),
  input: inputSchema,
  status: statusSchema,
  revision: z.number(),
  attemptId: z.string().nullable(),
  aiResult: analysisSchema.nullable(),
  confirmedResult: confirmationSchema.nullable(),
  error: z.string().nullable(),
  warnings: z.array(z.string()),
  sourceLines: z.array(z.object({ id: z.number(), text: z.string() })),
  attempts: z.array(
    z.object({ id: z.string(), status: z.string(), startedAt: z.string(), error: z.string().nullable() })
  )
})
type CaseRecord = z.infer<typeof recordSchema>
const listingSchema = z.object({
  items: z.array(
    z.object({ id: z.string(), customerName: z.string(), invoiceNumber: z.string(), status: statusSchema })
  ),
  total: z.number(),
  meta: z.object({ selected: recordSchema.nullable(), page: z.number() })
})
type Listing = z.infer<typeof listingSchema>
const actionEnvelope = z.object({ success: z.boolean(), data: z.unknown() })
function message(code: string) {
  return t(Object.prototype.hasOwnProperty.call(en, code) ? (code as Key) : 'operation_failed')
}
function money(value: number) {
  return i18n.number(value / 100, { style: 'currency', currency: 'CNY' })
}
function parseMoney(value: string): number | null {
  if (!value.trim()) return null
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) throw new Error('invalid_input')
  const [whole, decimal = ''] = value.split('.')
  return Number(whole) * 100 + Number(decimal.padEnd(2, '0'))
}
async function mutate(input: object) {
  const response = await request('executeAction', { actionKey: 'mutate', input })
  const result = actionEnvelope.parse(response.result)
  if (!result.success) {
    const error = z.object({ code: z.string() }).safeParse(result.data)
    throw new Error(error.success ? error.data.code : 'operation_failed')
  }
  return recordSchema.parse(result.data)
}
async function command(commandKey: string, payload: object) {
  const response = await request('invokeClientCommand', { commandKey, payload })
  const result = z.object({ success: z.boolean().optional() }).passthrough().safeParse(response.result)
  if (result.success && result.data.success === false) throw new Error('operation_failed')
}
const sample: CaseInput = {
  customerName: '华东精密制造（示例）',
  invoiceNumber: 'AR-2026-102',
  outstandingCents: 5000000,
  dueDate: '2026-10-25',
  communicationDate: '2026-10-31',
  source:
    '客户：这笔五万元货款，我们 11 月 6 日先付三万。\n客户：剩下的等验收单补齐再安排，你们先把盖章版发过来。\n销售：收到，我先协调验收单，余款日期再与您确认。'
}
const empty: CaseInput = {
  customerName: '',
  invoiceNumber: '',
  outstandingCents: 0,
  dueDate: '',
  communicationDate: '',
  source: ''
}

function CreateDialog({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  onCreated: (record: CaseRecord) => void
}) {
  const [form, setForm] = useState(empty),
    [amount, setAmount] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const requestKey = useRef(crypto.randomUUID())
  useEffect(() => {
    if (open) {
      setForm(empty)
      setAmount('')
      setError('')
      requestKey.current = crypto.randomUUID()
    }
  }, [open])
  const update = (key: keyof CaseInput, value: string) => setForm((old) => ({ ...old, [key]: value }))
  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const input = inputSchema.parse({ ...form, outstandingCents: parseMoney(amount) })
      const record = await mutate({ kind: 'create', input, requestKey: requestKey.current })
      onCreated(record)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof z.ZodError ? 'invalid_input' : e instanceof Error ? e.message : 'operation_failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value)
      }}
    >
      <DialogContent className="payment-dialog">
        <DialogHeader>
          <DialogTitle>{t('new')}</DialogTitle>
          <DialogDescription>{t('createHelp')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="payment-detail">
          <div className="payment-fields">
            {(['customerName', 'invoiceNumber', 'dueDate', 'communicationDate'] as const).map((key, index) => (
              <div className="payment-field" key={key}>
                <Label htmlFor={key}>{t((['customer', 'invoice', 'due', 'communication'] as const)[index])}</Label>
                <Input
                  id={key}
                  type={key.endsWith('Date') ? 'date' : 'text'}
                  value={form[key]}
                  required
                  onChange={(e) => update(key, e.target.value)}
                />
              </div>
            ))}
            <div className="payment-field payment-span">
              <Label htmlFor="balance">{t('balance')}</Label>
              <Input
                id="balance"
                inputMode="decimal"
                value={amount}
                required
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="payment-field payment-span">
              <Label htmlFor="source">{t('source')}</Label>
              <Textarea
                id="source"
                rows={7}
                value={form.source}
                required
                maxLength={12000}
                onChange={(e) => update('source', e.target.value)}
              />
            </div>
          </div>
          {error && <p role="alert">{message(error)}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setForm(sample)
                setAmount('50000')
              }}
            >
              {t('example')}
            </Button>
            <Button type="submit" disabled={busy}>
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Review({
  record,
  busy,
  onConfirm
}: {
  record: CaseRecord
  busy: boolean
  onConfirm: (result: Confirmation) => void
}) {
  const original = record.confirmedResult?.analysis ?? record.aiResult!
  const [draft, setDraft] = useState<Analysis>(original),
    [followup, setFollowup] = useState(record.confirmedResult?.nextFollowupDate ?? ''),
    [note, setNote] = useState(record.confirmedResult?.note ?? ''),
    [error, setError] = useState('')
  const [amountTexts, setAmountTexts] = useState(
    original.promises.map((p) => (p.amountCents === null ? '' : (p.amountCents / 100).toFixed(2)))
  )
  const locked = record.status === 'confirmed'
  function changePromise(index: number, key: 'amountCents' | 'paymentDate' | 'condition', value: string) {
    try {
      const next = key === 'amountCents' ? parseMoney(value) : key === 'paymentDate' ? value || null : value
      setDraft((old) => ({ ...old, promises: old.promises.map((p, i) => (i === index ? { ...p, [key]: next } : p)) }))
      setError('')
    } catch {
      setError('invalid_input')
    }
  }
  const evidence = (ids: number[]) => (
    <blockquote className="payment-evidence">
      <p className="text-sm text-muted-foreground">{t('lines', { ids: ids.join(', ') })}</p>
      {ids.map((id) => (
        <p key={id}>{record.sourceLines.find((line) => line.id === id)?.text}</p>
      ))}
    </blockquote>
  )
  return (
    <section className="payment-detail">
      <div>
        <h2 className="text-lg font-semibold">{t(locked ? 'confirmedTitle' : 'draftTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t(locked ? 'confirmedNote' : 'aiNote')}</p>
      </div>
      <Separator />
      <Label htmlFor="summary">{t('summary')}</Label>
      <Textarea
        id="summary"
        disabled={locked}
        value={draft.summary}
        onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
      />
      <h3 className="font-semibold">{t('promises')}</h3>
      {!draft.promises.length && <p>{t('noPromises')}</p>}
      {draft.promises.map((promise, index) => (
        <div className="payment-detail" key={index}>
          <div className="payment-fields">
            <div className="payment-field">
              <Label htmlFor={`amount-${index}`}>{t('amount')}</Label>
              <Input
                id={`amount-${index}`}
                disabled={locked}
                inputMode="decimal"
                placeholder={t('unknown')}
                value={amountTexts[index]}
                onChange={(e) => {
                  setAmountTexts((old) => old.map((v, i) => (i === index ? e.target.value : v)))
                  setError('')
                }}
              />
            </div>
            <div className="payment-field">
              <Label htmlFor={`date-${index}`}>{t('date')}</Label>
              <Input
                id={`date-${index}`}
                disabled={locked}
                type="date"
                value={promise.paymentDate ?? ''}
                onChange={(e) => changePromise(index, 'paymentDate', e.target.value)}
              />
            </div>
            <div className="payment-field payment-span">
              <Label htmlFor={`condition-${index}`}>{t('condition')}</Label>
              <Input
                id={`condition-${index}`}
                disabled={locked}
                value={promise.condition}
                onChange={(e) => changePromise(index, 'condition', e.target.value)}
              />
            </div>
          </div>
          {evidence(promise.evidenceLineIds)}
          <Separator />
        </div>
      ))}
      {!!draft.blockers.length && (
        <div>
          <h3 className="font-semibold">{t('blockers')}</h3>
          {draft.blockers.map((b, i) => (
            <div key={i}>
              <p>{b.description}</p>
              {evidence(b.evidenceLineIds)}
            </div>
          ))}
        </div>
      )}
      {!!draft.questions.length && (
        <div>
          <h3 className="font-semibold">{t('questions')}</h3>
          <ul>
            {draft.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      <Label htmlFor="action">{t('action')}</Label>
      <Textarea
        id="action"
        disabled={locked}
        value={draft.suggestedAction}
        onChange={(e) => setDraft({ ...draft, suggestedAction: e.target.value })}
      />
      <Label htmlFor="followup">{t('followup')}</Label>
      <Input
        id="followup"
        type="date"
        disabled={locked}
        value={followup}
        onChange={(e) => setFollowup(e.target.value)}
      />
      <Label htmlFor="note">{t('note')}</Label>
      <Textarea id="note" disabled={locked} value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="text-sm text-muted-foreground">{t('promiseNote')}</p>
      {error && <p role="alert">{message(error)}</p>}
      {!locked && (
        <Button
          disabled={busy}
          onClick={() => {
            try {
              const value = confirmationSchema.parse({
                analysis: {
                  ...draft,
                  promises: draft.promises.map((p, i) => ({ ...p, amountCents: parseMoney(amountTexts[i]) }))
                },
                nextFollowupDate: followup,
                note
              })
              setError('')
              onConfirm(value)
            } catch {
              setError('invalid_input')
            }
          }}
        >
          {t('confirm')}
        </Button>
      )}
    </section>
  )
}

function App() {
  useRemoteLocale(i18n)
  const [ready, setReady] = useState(false),
    [listing, setListing] = useState<Listing | null>(null),
    [selected, setSelected] = useState(''),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const loader = useRef<() => void>(() => {}),
    sequence = useRef(0)
  async function load() {
    const attempt = ++sequence.current
    try {
      const response = await request('requestData', {
        query: { page, search: query, parameters: selected ? { recordId: selected } : {} }
      })
      const data = listingSchema.parse(response.data)
      if (attempt === sequence.current) {
        setListing(data)
        // Starting a conversation may remount the workbench under a new scope.
        // Open the most recently updated record; choosing never mutates its data.
        if (!selected && data.items.length) setSelected(data.items[0].id)
      }
    } catch (e) {
      if (attempt === sequence.current) setError(e instanceof Error ? e.message : 'operation_failed')
    }
  }
  loader.current = () => {
    void load()
  }
  useEffect(
    () =>
      listen(
        (init) => {
          i18n.setLocale(init.locale)
          installShadcnThemeVars()
          setReady(true)
          const id = init.initialQuery?.parameters?.recordId ?? init.viewState?.recordId
          if (id) setSelected(id)
        },
        () => loader.current()
      ),
    []
  )
  useEffect(() => {
    if (ready) void load()
  }, [ready, selected, page, query])
  useEffect(() => {
    if (ready && selected) post('saveViewState', { state: { recordId: selected } })
  }, [ready, selected])
  const record = listing?.meta.selected ?? null
  useEffect(() => {
    if (record?.status !== 'processing') return
    const timer = setInterval(() => loader.current(), 3000)
    return () => clearInterval(timer)
  }, [record?.status, record?.id])
  async function operate(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'operation_failed')
    } finally {
      setBusy(false)
    }
  }
  async function analyze() {
    if (!record) return
    const started = await mutate({ kind: 'start', id: record.id, revision: record.revision })
    await load()
    if (started.status !== 'processing' || !started.attemptId) throw new Error(started.error ?? 'invalid_state')
    try {
      await command('assistant.context.set', {
        key: 'paymentFollowup',
        context: { recordId: started.id, attemptId: started.attemptId }
      })
      await command('assistant.chat.send_message', {
        text: t('sendPrompt', { customer: record.input.customerName, invoice: record.input.invoiceNumber })
      })
    } catch (e) {
      await mutate({ kind: 'cancel', id: started.id, attemptId: started.attemptId })
      await load()
      throw e
    }
  }
  if (!ready)
    return (
      <main className="payment-shell">
        <p>{t('loading')}</p>
      </main>
    )
  return (
    <main className="payment-shell">
      <header className="payment-heading">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="payment-actions">
          <Button variant="outline" disabled={busy} onClick={() => loader.current()}>
            {t('refresh')}
          </Button>
          <Button onClick={() => setOpen(true)}>{t('new')}</Button>
        </div>
      </header>
      <Separator />
      {error && <p role="alert">{message(error)}</p>}
      {notice && <p role="status">{message(notice)}</p>}
      <div className="payment-layout">
        <aside className="payment-list">
          <form
            className="payment-toolbar"
            onSubmit={(e) => {
              e.preventDefault()
              setPage(1)
              setQuery(search)
            }}
          >
            <Input
              aria-label={t('search')}
              placeholder={t('search')}
              value={search}
              maxLength={100}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button type="submit" variant="outline">
              {t('find')}
            </Button>
          </form>
          {!listing?.items.length ? (
            <p>{t('empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('customer')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listing.items.map((item) => (
                  <TableRow key={item.id} data-state={selected === item.id ? 'selected' : undefined}>
                    <TableCell>
                      <Button
                        variant="link"
                        onClick={() => {
                          setError('')
                          setNotice('')
                          setSelected(item.id)
                        }}
                      >
                        {item.customerName}
                      </Button>
                      <p className="text-sm text-muted-foreground">{item.invoiceNumber}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t(`status.${item.status}`)}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="text-sm text-muted-foreground">{t('page', { page, total: listing?.total ?? 0 })}</p>
          <div className="payment-actions">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t('previous')}
            </Button>
            <Button variant="outline" disabled={page * 20 >= (listing?.total ?? 0)} onClick={() => setPage(page + 1)}>
              {t('next')}
            </Button>
          </div>
        </aside>
        {!record ? (
          <p>{t('select')}</p>
        ) : (
          <article className="payment-detail">
            <div className="payment-heading">
              <div>
                <h2 className="text-lg font-semibold">{record.input.customerName}</h2>
                <p>
                  {record.input.invoiceNumber} · {money(record.input.outstandingCents)}
                </p>
              </div>
              <Badge>{t(`status.${record.status}`)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('due')}: {record.input.dueDate} · {t('communication')}: {record.input.communicationDate}
            </p>
            <div className="payment-actions">
              {record.status !== 'confirmed' && record.status !== 'processing' && (
                <Button disabled={busy} onClick={() => void operate(analyze)}>
                  {t(record.status === 'draft' ? 'analyze' : 'retry')}
                </Button>
              )}
              {record.status === 'processing' && (
                <>
                  <p role="status">{t('processing')}</p>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void operate(async () => {
                        await mutate({ kind: 'cancel', id: record.id, attemptId: record.attemptId })
                        await load()
                      })
                    }
                  >
                    {t('stop')}
                  </Button>
                </>
              )}
            </div>
            {record.error && <p role="alert">{message(record.error)}</p>}
            <h3 className="font-semibold">{t('evidence')}</h3>
            <div className="payment-source">
              {record.sourceLines.map((line) => (
                <p key={line.id}>
                  <span className="text-muted-foreground">{line.id}. </span>
                  {line.text}
                </p>
              ))}
            </div>
            {record.warnings.map((w) => (
              <p key={w}>{message(w)}</p>
            ))}
            <Separator />
            {(record.aiResult || record.confirmedResult) && (
              <Review
                key={`${record.id}:${record.revision}`}
                record={record}
                busy={busy}
                onConfirm={(result) =>
                  void operate(async () => {
                    await mutate({ kind: 'confirm', id: record.id, revision: record.revision, result })
                    await load()
                    setNotice('saved')
                  })
                }
              />
            )}
            {!!record.attempts.length && (
              <section>
                <h3>{t('history')}</h3>
                {record.attempts.map((a) => (
                  <p key={a.id}>
                    {i18n.date(a.startedAt, { dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                    {message('attempt.' + a.status)}
                    {a.error ? ' · ' + message(a.error) : ''}
                  </p>
                ))}
              </section>
            )}
          </article>
        )}
      </div>
      <CreateDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={(record) => {
          setSelected(record.id)
          setPage(1)
          setQuery('')
          setSearch('')
          setNotice('saved')
          loader.current()
        }}
      />
    </main>
  )
}
createRoot(document.getElementById('root')!).render(
  <RemoteI18nProvider i18n={i18n}>
    <App />
  </RemoteI18nProvider>
)
