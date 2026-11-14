import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Input, Label, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Tabs, TabsContent, TabsList, TabsTrigger, Textarea,
} from '@xpert-ai/plugin-shadcn-ui'
import { RemoteI18nProvider, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { act, createImage, loadData, sendToAssistant, startBridge } from './bridge'
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_INQUIRY, MAX_TITLE, type ActionKey, type Draft, type DraftLine, type Projection } from './contracts'
import { DraftDetail, StatusBadge, type Edits } from './draft-detail'
import { errorKey, i18n, t, type MessageKey } from './i18n'

function App() {
  useRemoteLocale(i18n)
  const [data, setData] = useState<Projection | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<ActionKey | null>(null)
  const [notice, setNotice] = useState<MessageKey | null>(null)
  const [composing, setComposing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(window.innerWidth >= 760)
  const [title, setTitle] = useState('')
  const [inquiry, setInquiry] = useState('')
  const [inputMode, setInputMode] = useState<'text' | 'image'>('text')
  const [image, setImage] = useState<File>()
  const [edits, setEdits] = useState<Record<string, Edits | undefined>>({})
  const selectedId = useRef<string | undefined>(undefined)
  const inFlightRead = useRef<number | null>(null)
  const readSequence = useRef(0)
  const busy = useRef(false)
  const createRequest = useRef<{ title: string; source: string | File; requestId: string }>()

  const read = useCallback(async (id = selectedId.current, foreground = false, afterAction = false) => {
    if ((busy.current && !afterAction) || (!foreground && inFlightRead.current !== null)) return
    const sequence = ++readSequence.current
    inFlightRead.current = sequence
    if (foreground) setLoading(true)
    try {
      const result = await loadData(id)
      if (sequence !== readSequence.current) return
      selectedId.current = result.selected?.id ?? id
      setData(result)
      setNotice((current) => {
        if (current === 'error.dispatch_failed' && result.selected?.status !== 'analyzing') return null
        return current
      })
    } catch (error) {
      if (sequence === readSequence.current && !(error instanceof DOMException && error.name === 'AbortError')) {
        if (foreground) setNotice(errorKey(error instanceof Error ? error.message : 'unknown'))
      }
    } finally {
      if (inFlightRead.current === sequence) inFlightRead.current = null
      if (sequence === readSequence.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let connected = false
    const disconnect = startBridge((id) => {
      connected = true
      selectedId.current = id
      setComposing(false)
      setNotice(null)
      void read(id, true)
    }, () => {
      inFlightRead.current = null
      void read()
    })
    const startup = window.setTimeout(() => {
      if (!connected) {
        setLoading(false)
        setNotice('error.request_failed')
      }
    }, 12_000)
    return () => {
      ++readSequence.current
      window.clearTimeout(startup)
      disconnect()
    }
  }, [read])

  const draft = data?.selected
  const retryAt = draft?.status === 'analyzing' && draft.retryAt ? Date.parse(draft.retryAt) : 0
  const pollUntil = draft?.status === 'ocr_pending'
    ? (draft.retryAt ? Date.parse(draft.retryAt) : Date.parse(draft.updatedAt) + 120_000) : retryAt
  useEffect(() => {
    if (pollUntil <= Date.now()) return
    // Status changes normally arrive through tool events. A bounded read also
    // covers returning to the workbench after the Assistant tab was closed.
    const poll = window.setInterval(() => {
      if (Date.now() >= pollUntil) window.clearInterval(poll)
      void read()
    }, 4_000)
    return () => window.clearInterval(poll)
  }, [read, pollUntil])

  function choose(id: string) {
    selectedId.current = id
    setComposing(false)
    setImage(undefined)
    setNotice(null)
    setData((previous) => previous && { ...previous, selected: null })
    if (window.innerWidth < 760) setHistoryOpen(false)
    void read(id, true)
  }

  function applyDraft(next: Draft) {
    selectedId.current = next.id
    setData((previous) => previous && {
      ...previous,
      selected: next,
      records: [next, ...previous.records.filter((item) => item.id !== next.id)],
    })
  }

  async function requestAction(action: ActionKey, run: () => Promise<void>) {
    if (busy.current) return
    busy.current = true
    ++readSequence.current
    inFlightRead.current = null
    setPending(action)
    setNotice(null)
    try {
      await run()
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setNotice(errorKey(error instanceof Error ? error.message : 'unknown'))
      }
    } finally {
      await read(selectedId.current, false, true)
      busy.current = false
      setPending(null)
    }
  }

  async function startAnalysis(action: 'analyze' | 'retry', current: Draft) {
    const result = await act(action, { id: current.id, revision: current.revision }, current.id)
    applyDraft(result.draft)
    setEdits((previous) => ({ ...previous, [current.id]: undefined }))
    if (!result.chatMessage) throw new Error('dispatch_failed')
    try {
      await sendToAssistant(result.chatMessage)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new Error('dispatch_failed')
    }
  }

  function submitInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedTitle = title.trim()
    const source = inputMode === 'image' ? image : inquiry.trim()
    if (!trimmedTitle || !source) {
      setNotice('error.invalid_input')
      return
    }
    const imageInquiry = typeof source !== 'string'
    void requestAction(imageInquiry ? 'create_image' : 'create', async () => {
      let request = createRequest.current
      if (!request || request.title !== trimmedTitle || request.source !== source) {
        request = { title: trimmedTitle, source, requestId: crypto.randomUUID() }
        createRequest.current = request
      }
      const input = { title: request.title, requestId: request.requestId }
      const result = imageInquiry ? await createImage(input, source) : await act('create', { ...input, inquiry: source })
      applyDraft(result.draft)
      setComposing(false)
      setTitle('')
      setInquiry('')
      setImage(undefined)
      createRequest.current = undefined
      if (!imageInquiry && result.draft.status === 'draft') await startAnalysis('analyze', result.draft)
    })
  }

  function saveInquiry(current: Draft, inquiry: string) {
    void requestAction('save_inquiry', async () => {
      const result = await act('save_inquiry', { id: current.id, revision: current.revision, inquiry }, current.id)
      applyDraft(result.draft)
      await startAnalysis('analyze', result.draft)
    })
  }

  function retryOcr(current: Draft) {
    void requestAction('retry_ocr', async () => {
      const result = await act('retry_ocr', { id: current.id, revision: current.revision }, current.id)
      applyDraft(result.draft)
    })
  }

  function submitLines(action: 'save_lines' | 'confirm', current: Draft, lines: DraftLine[]) {
    void requestAction(action, async () => {
      const result = await act(action, { id: current.id, revision: current.revision, lines }, current.id)
      applyDraft(result.draft)
      setEdits((previous) => ({ ...previous, [current.id]: undefined }))
      if (action === 'save_lines') setNotice('saved')
    })
  }

  const locked = loading || pending !== null
  const showComposer = composing || (data?.records.length === 0 && !draft)
  const visibleNotice = notice && notice !== (draft?.errorCode ? errorKey(draft.errorCode) : null) ? notice : null
  const outage = data?.serviceError && data.serviceError !== draft?.errorCode ? errorKey(data.serviceError) : null

  return <div className="manufacturing-shell">
    <header className="manufacturing-toolbar">
      <div className="manufacturing-actions">
        <Button type="button" variant="ghost" size="icon" aria-expanded={historyOpen} aria-controls="manufacturing-history"
          aria-label={t(historyOpen ? 'hideHistory' : 'showHistory')} onClick={() => setHistoryOpen(!historyOpen)}>
          {historyOpen ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
        </Button>
        <h1 className="text-base font-semibold">{t('workbench')}</h1>
        <Badge variant="secondary">{t('synthetic')}</Badge>
      </div>
      <div className="manufacturing-actions">
        <Button type="button" variant="outline" onClick={() => {
          setNotice((previous) => previous === 'error.dispatch_failed' ? previous : null)
          void read(undefined, true)
        }} disabled={locked}>
          <RefreshCw aria-hidden="true" data-icon="inline-start" />
          {t('refresh')}
        </Button>
        <Button type="button" variant="outline" disabled={locked}
          onClick={() => {
            setComposing(true)
            setNotice(null)
            if (window.innerWidth < 760) setHistoryOpen(false)
          }}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          {t('new')}
        </Button>
      </div>
    </header>

    <div className="manufacturing-body" data-history={historyOpen ? 'open' : 'closed'}>
      <aside id="manufacturing-history" className="manufacturing-history" hidden={!historyOpen} aria-labelledby="manufacturing-history-title">
        <h2 className="text-sm font-semibold" id="manufacturing-history-title">{t('history')}</h2>
        {data?.records.length ? <ul className="manufacturing-records">
          {data.records.map((record) => {
            const active = !showComposer && draft?.id === record.id
            return <li key={record.id} className="manufacturing-record">
              <Button type="button" className="w-full justify-start" variant={active ? 'secondary' : 'ghost'}
                aria-current={active ? 'true' : undefined} disabled={locked} onClick={() => choose(record.id)}>
                <span className="truncate" title={record.title}>{record.title}</span>
              </Button>
              <StatusBadge status={record.status} />
            </li>
          })}
        </ul> : data && <p className="text-sm text-muted-foreground">{t('historyEmpty')}</p>}
      </aside>

      <main className="manufacturing-main" aria-busy={locked}>
        <div className="manufacturing-content">
          {outage && <p role="alert" className="text-sm text-destructive">{t(outage)}</p>}
          {visibleNotice && visibleNotice !== outage && <p role={visibleNotice === 'saved' ? 'status' : 'alert'}
            className={visibleNotice === 'saved' ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
            {t(visibleNotice)}
          </p>}
          {loading && <p role="status" className="text-sm text-muted-foreground">{t('loading')}</p>}
          {pending && pending !== 'confirm' && <p role="status" className="text-sm text-muted-foreground">
            {t(pending === 'create_image' || pending === 'retry_ocr' ? 'recognizingImage' : 'working')}
          </p>}
          {showComposer ? <Card>
            <CardHeader>
              <CardTitle><h2>{t('new')}</h2></CardTitle>
              <CardDescription>{t('syntheticOnly')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitInquiry} className="manufacturing-form">
                <div className="grid gap-2">
                  <Label htmlFor="manufacturing-title">{t('title')}</Label>
                  <Input id="manufacturing-title" value={title} maxLength={MAX_TITLE} required placeholder={t('titlePlaceholder')}
                    disabled={locked} onChange={(event) => setTitle(event.currentTarget.value)} />
                </div>
                <Tabs value={inputMode} onValueChange={(mode) => {
                  setInputMode(mode === 'image' ? 'image' : 'text')
                  setImage(undefined)
                  setNotice(null)
                }}>
                  <TabsList aria-label={t('inputMode')}>
                    <TabsTrigger value="text" disabled={locked}>{t('textInput')}</TabsTrigger>
                    <TabsTrigger value="image" disabled={locked}>{t('imageInput')}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="text" className="grid gap-2">
                    <Label htmlFor="manufacturing-inquiry">{t('inquiry')}</Label>
                    <Textarea id="manufacturing-inquiry" value={inquiry} maxLength={MAX_INQUIRY} rows={6} required
                      placeholder={t('inquiryPlaceholder')} disabled={locked} onChange={(event) => setInquiry(event.currentTarget.value)} />
                  </TabsContent>
                  <TabsContent value="image" className="grid gap-2">
                    <Label htmlFor="manufacturing-image">{t('imageFile')}</Label>
                    <Input id="manufacturing-image" type="file" accept={IMAGE_TYPES.join(',')} disabled={locked}
                      aria-describedby="manufacturing-image-help" onChange={(event) => {
                        const file = event.currentTarget.files?.[0]
                        const invalid = file && (!IMAGE_TYPES.includes(file.type) || !file.size || file.size > MAX_IMAGE_BYTES)
                        if (invalid) event.currentTarget.value = ''
                        setImage(invalid ? undefined : file)
                        setNotice(invalid ? 'error.invalid_image' : null)
                      }} />
                    <p className="text-sm text-muted-foreground" id="manufacturing-image-help">{t('imageHelp')}</p>
                  </TabsContent>
                </Tabs>
                <div className="manufacturing-actions">
                  <Button type="submit" disabled={locked || !data || !title.trim() ||
                    (inputMode === 'image' ? !image : !data.catalog || !inquiry.trim())}>
                    {t(inputMode === 'image' ? 'uploadAndRecognize' : 'createAndAnalyze')}
                  </Button>
                  {inputMode === 'text' && <Button type="button" variant="ghost" disabled={locked || !!title || !!inquiry}
                    onClick={() => { setTitle(t('sampleTitle')); setInquiry(t('sampleInquiry')) }}>
                    {t('useSample')}
                  </Button>}
                </div>
              </form>
            </CardContent>
          </Card> : draft ? <DraftDetail
            draft={draft}
            catalog={data?.catalog ?? null}
            edits={edits[draft.id]}
            updateEdits={(value) => {
              setNotice((previous) => previous === 'saved' ? null : previous)
              setEdits((previous) => ({ ...previous, [draft.id]: value }))
            }}
            pending={pending}
            disabled={locked}
            canResend={notice === 'error.dispatch_failed'}
            analyze={(action) => { void requestAction(action, () => startAnalysis(action, draft)) }}
            saveInquiry={(inquiry) => saveInquiry(draft, inquiry)}
            retryOcr={() => retryOcr(draft)}
            submit={(action, lines) => submitLines(action, draft, lines)}
          /> : !loading && <p className="text-sm text-muted-foreground">{t('chooseInquiry')}</p>}
        </div>
      </main>
    </div>
  </div>
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<RemoteI18nProvider i18n={i18n}><App /></RemoteI18nProvider>)
