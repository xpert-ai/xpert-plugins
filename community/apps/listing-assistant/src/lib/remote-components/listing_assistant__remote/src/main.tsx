import '@xpert-ai/plugin-shadcn-ui/style.css'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@xpert-ai/plugin-shadcn-ui'
import { RemoteI18nProvider } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { React, ReactDOM } from './vendor'
import {
  executeAction,
  installBridgeListener,
  notify,
  reportResize,
  requestData,
  resolveLocaleText,
  unwrap
} from './bridge'
import { i18n, messages, type Catalog } from './i18n'
import { injectStyles } from './styles'
import { sourceSegments } from './evidence'
import type { TaskDetail, WorkbenchData } from './types'
import { DraftForm } from './components/DraftForm'
import { NewTaskDialog } from './components/NewTaskDialog'
import { TaskList } from './components/TaskList'
import {
  emptyForm,
  errorMessage,
  errorText,
  FIELD_LABEL,
  formFromDetail,
  normalizeData,
  normalizeLocale,
  openReviewFlags,
  pendingParseTasks,
  STATUS_LABEL,
  type BatchProgress,
  type Busy,
  type FormState,
  type ReviewWarning
} from './workbench-utils'

const { useEffect, useRef, useState } = React

function App() {
  const [t, setT] = useState<Catalog>(() => messages('zh-Hans'))
  const [locale, setLocale] = useState('zh-Hans')
  const [data, setData] = useState<WorkbenchData>({ tasks: [], selectedTask: null })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createText, setCreateText] = useState('')
  const [createError, setCreateError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [warnings, setWarnings] = useState<ReviewWarning[]>([])
  const [batch, setBatch] = useState<BatchProgress | null>(null)
  const [activeEvidence, setActiveEvidence] = useState<string | null>(null)

  const selectedRef = useRef<string | null>(null)
  const searchRef = useRef('')
  const localeRef = useRef(locale)
  searchRef.current = search
  localeRef.current = locale

  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    injectStyles()
    const dispose = installBridgeListener({
      onInit: (next) => {
        const nextLocale = normalizeLocale(next.locale)
        setLocale(nextLocale)
        setT(messages(nextLocale))
        void loadData(undefined, false)
      },
      onHostEvent: () => {
        void loadData(selectedRef.current ?? undefined, true)
      }
    })
    // Some hosts deliver init before the listener attaches; announce readiness once mounted.
    window.parent.postMessage({ channel: 'xpertai.remote_component', protocolVersion: 1, type: 'ready' }, '*')
    return dispose
  }, [])

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => setTimeout(reportResize, 0))
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setTimeout(reportResize, 0)
  })

  useEffect(() => {
    if (!activeEvidence) return
    document.getElementById(`la-evidence-${activeEvidence}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeEvidence])

  async function loadData(taskId?: string, silent = false) {
    if (!silent) setBusy('load')
    try {
      const response = await requestData({
        page: 1,
        pageSize: 50,
        search: searchRef.current.trim() || undefined,
        parameters: { taskId: taskId || undefined }
      })
      const next = normalizeData(unwrap(response))
      setData(next)
      if (next.selectedTask) {
        selectedRef.current = next.selectedTask.id
        setSelectedId(next.selectedTask.id)
        setForm(formFromDetail(next.selectedTask))
      } else {
        selectedRef.current = null
        setSelectedId(null)
        setForm(emptyForm())
      }
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error, tRef.current.loadFailed) })
    } finally {
      if (!silent) setBusy(null)
    }
  }

  function selectTask(taskId: string) {
    selectedRef.current = taskId
    setSelectedId(taskId)
    setNotice(null)
    setActiveEvidence(null)
    void loadData(taskId)
  }

  function requestSave() {
    const detail = data.selectedTask
    if (!detail) return
    const open = openReviewFlags(detail, form)
    if (!open.length) {
      void saveDraft()
      return
    }
    setWarnings(open)
    setConfirmOpen(true)
  }

  /**
   * Batch extraction runs one task per request, reusing the same idempotent
   * parse action. A failure is counted and the loop continues, so one bad
   * listing never blocks the rest of the batch.
   */
  async function runBatchParse() {
    if (busy) return
    const pending = pendingParseTasks(data.tasks)
    if (!pending.length) {
      notify(tRef.current.batchParseNone)
      return
    }
    const reload = selectedRef.current
    setBusy('batch')
    setNotice({ kind: 'info', text: tRef.current.batchParseHint })
    let ok = 0
    let failed = 0
    try {
      for (let index = 0; index < pending.length; index += 1) {
        setBatch({ done: index, total: pending.length, ok, failed })
        try {
          const response = await executeAction('parse_task', pending[index].id, { taskId: pending[index].id })
          const result = unwrap(response) as Record<string, unknown> | null
          if (result && result.success === false) failed += 1
          else ok += 1
        } catch {
          failed += 1
        }
        await loadData(reload ?? undefined, true)
      }
      setBatch({ done: pending.length, total: pending.length, ok, failed })
    } finally {
      setBusy(null)
      setBatch(null)
      const summary = tRef.current.batchParseDone
        .replace('{ok}', String(ok))
        .replace('{failed}', String(failed))
      setNotice({ kind: failed ? 'error' : 'info', text: summary })
      notify(summary)
      await loadData(reload ?? undefined, true)
    }
  }

  async function runParse(retry: boolean) {
    const taskId = selectedRef.current
    if (!taskId) return
    setBusy('parse')
    setNotice(null)
    try {
      const response = await executeAction(retry ? 'retry_parse' : 'parse_task', taskId, { taskId })
      const result = unwrap(response) as Record<string, unknown> | null
      if (result && result.success === false) {
        const detail = result.data as { errorCode?: string; errorMessage?: string } | undefined
        setNotice({
          kind: 'error',
          text: errorText(
            tRef.current,
            detail?.errorCode,
            detail?.errorMessage || resolveLocaleText(result.message, localeRef.current)
          )
        })
      } else {
        const outcome = (result?.data as { outcome?: string } | undefined)?.outcome
        notify(outcome === 'already_parsed' ? tRef.current.parseAlready : tRef.current.parseSuccess)
      }
      await loadData(taskId, true)
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error, tRef.current.failureTitle) })
    } finally {
      setBusy(null)
    }
  }

  async function saveDraft() {
    const taskId = selectedRef.current
    if (!taskId) return
    setBusy('save')
    setNotice(null)
    try {
      const attributes = Object.fromEntries(
        form.attributes.filter((pair) => pair.key.trim()).map((pair) => [pair.key.trim(), pair.value.trim() || null])
      )
      const specs = form.specs
        .filter((spec) => spec.name.trim())
        .map((spec) => ({
          name: spec.name.trim(),
          price: spec.price.trim() || null,
          stock: spec.stock.trim() ? Number(spec.stock) : null
        }))
      const response = await executeAction('save_draft', taskId, {
        taskId,
        title: form.title,
        description: form.description,
        price: form.price,
        currency: form.currency,
        category: form.category,
        attributes,
        specs
      })
      const result = unwrap(response) as Record<string, unknown> | null
      if (result && result.success === false) {
        const data = result.data as { errorCode?: string; errorMessage?: string } | undefined
        setNotice({
          kind: 'error',
          text: errorText(
            tRef.current,
            data?.errorCode,
            data?.errorMessage || resolveLocaleText(result.message, localeRef.current)
          )
        })
        return
      }
      notify(tRef.current.saveSuccess)
      await loadData(taskId, true)
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error, tRef.current.failureTitle) })
    } finally {
      setBusy(null)
    }
  }

  async function createTask() {
    const sourceText = createText.trim()
    if (!sourceText) {
      setCreateError(tRef.current.pastePlaceholder)
      return
    }
    setBusy('create')
    setCreateError('')
    try {
      const isBatch = /(?:^|\n)\s*---\s*(?:\n|$)/.test(createText)
      const response = await executeAction(isBatch ? 'create_task_batch' : 'create_task', null, { sourceText })
      const result = unwrap(response) as Record<string, unknown> | null
      if (result && result.success === false) {
        const failure = result.data as { errorCode?: string; errorMessage?: string } | undefined
        setCreateError(
          errorText(
            tRef.current,
            failure?.errorCode,
            failure?.errorMessage || resolveLocaleText(result.message, localeRef.current)
          )
        )
        return
      }
      const data = result?.data as { taskId?: string; taskIds?: string[]; count?: number } | undefined
      const taskIds = Array.isArray(data?.taskIds) ? data.taskIds : []
      const taskId = data?.taskId ?? taskIds[0] ?? null
      setCreateOpen(false)
      setCreateText('')
      notify(isBatch ? `${tRef.current.batchCreated} ${data?.count ?? taskIds.length}` : tRef.current.createSuccess)
      selectedRef.current = taskId
      if (taskId) setSelectedId(taskId)
      await loadData(taskId ?? undefined, true)
    } catch (error) {
      setCreateError(errorMessage(error, tRef.current.errUnknown))
    } finally {
      setBusy(null)
    }
  }

  const detail = data.selectedTask
  const isBusy = busy !== null

  return (
    <div className="la-root">
      <header className="la-header">
        <div>
          <h1 className="la-title">{t.appTitle}</h1>
          <p className="la-subtitle">{t.appSubtitle}</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setCreateError('')
            setCreateOpen(true)
          }}
          disabled={isBusy}
        >
          {t.newTask}
        </Button>
      </header>

      <div className="la-body">
        <aside className="la-sidebar">
          <TaskList
            t={t}
            tasks={data.tasks}
            selectedId={selectedId}
            search={search}
            batch={batch}
            pendingCount={pendingParseTasks(data.tasks).length}
            isBusy={isBusy}
            onSearchChange={setSearch}
            onSearchSubmit={() => void loadData(undefined)}
            onBatchParse={() => void runBatchParse()}
            onSelect={selectTask}
          />
        </aside>

        <main className="la-main">
          {notice ? <div className={`la-notice la-notice--${notice.kind}`}>{notice.text}</div> : null}

          {!detail ? (
            <div className="la-empty">
              <h3>{t.noTasks}</h3>
              <p>{t.noTasksHint}</p>
              <Button size="sm" onClick={() => setCreateOpen(true)} disabled={isBusy}>
                {t.newTask}
              </Button>
            </div>
          ) : (
            <TaskDetailView
              t={t}
              detail={detail}
              form={form}
              busy={busy}
              isBusy={isBusy}
              activeEvidence={activeEvidence}
              onFormChange={(patch) => setForm({ ...form, ...patch })}
              onEvidenceFocus={setActiveEvidence}
              onParse={runParse}
              onSave={requestSave}
            />
          )}
        </main>
      </div>

      <NewTaskDialog
        t={t}
        open={createOpen}
        value={createText}
        error={createError}
        creating={busy === 'create'}
        onOpenChange={setCreateOpen}
        onChange={setCreateText}
        onCreate={() => void createTask()}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.saveConfirmTitle}</DialogTitle>
            <DialogDescription>{t.saveConfirmBody}</DialogDescription>
          </DialogHeader>
          <ul className="la-warning-list">
            {warnings.map((warning) => (
              <li key={warning.field}>
                <span>{t[FIELD_LABEL[warning.field]]}</span>
                <Badge variant="outline" className={`la-flag la-flag--${warning.flag}`}>
                  {warning.flag === 'missing' ? t.flagMissing : t.flagUncertain}
                </Badge>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t.saveConfirmBack}
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false)
                void saveDraft()
              }}
            >
              {t.saveConfirmContinue}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type TaskDetailViewProps = {
  t: Catalog
  detail: TaskDetail
  form: FormState
  busy: Busy
  isBusy: boolean
  activeEvidence: string | null
  onFormChange: (patch: Partial<FormState>) => void
  onEvidenceFocus: (field: string) => void
  onParse: (retry: boolean) => void
  onSave: () => void
}

function TaskDetailView({
  t,
  detail,
  form,
  busy,
  isBusy,
  activeEvidence,
  onFormChange,
  onEvidenceFocus,
  onParse,
  onSave
}: TaskDetailViewProps) {
  return (
    <div className="la-detail">
      <div className="la-detail-head">
        <div className="la-detail-head-left">
          <Badge variant="outline" className={`la-status--${detail.status}`}>
            {t[STATUS_LABEL[detail.status]]}
          </Badge>
          <span className="la-detail-title">{detail.draft?.title || t.untitledTask}</span>
          {detail.attemptCount ? <span className="la-note">{`${t.attemptPrefix} ${detail.attemptCount}`}</span> : null}
        </div>
        <div className="la-detail-actions">
          <Button
            size="sm"
            variant={detail.status === 'failed' ? 'outline' : 'default'}
            onClick={() => onParse(detail.status === 'failed')}
            disabled={isBusy}
          >
            {busy === 'parse' ? t.parsing : detail.status === 'failed' ? t.retryParse : t.runParse}
          </Button>
          <Button size="sm" variant="outline" onClick={onSave} disabled={isBusy || !detail.draft}>
            {busy === 'save' ? t.saving : t.saveDraft}
          </Button>
        </div>
      </div>

      {busy === 'parse' ? <div className="la-notice la-notice--info">{t.parseRunningHint}</div> : null}

      {detail.status === 'failed' ? (
        <div className="la-error">
          <strong>{t.errorTitle}</strong>
          <p>{errorText(t, detail.lastErrorCode, detail.lastErrorMessage || t.failureTitle)}</p>
          <span>{t.retryHint}</span>
        </div>
      ) : null}

      <div className="la-split">
        <section className="la-pane la-pane--source">
          <div className="la-pane-head">
            {t.sourceLabel}
            {detail.draft?.evidence ? <span className="la-evidence-hint">{t.evidencePaneHint}</span> : null}
          </div>
          <div className="la-source-text">
            {detail.sourceText
              ? sourceSegments(detail.sourceText, detail.draft?.evidence).map((segment, index) =>
                  segment.field ? (
                    <mark
                      key={`${segment.field}-${index}`}
                      id={`la-evidence-${segment.field}`}
                      className={`la-evidence${activeEvidence === segment.field ? ' la-evidence--active' : ''}`}
                    >
                      {segment.text}
                    </mark>
                  ) : (
                    <span key={`text-${index}`}>{segment.text}</span>
                  )
                )
              : t.emptySource}
          </div>
        </section>

        <section className="la-pane">
          <div className="la-pane-head">{t.draftLabel}</div>
          {!detail.draft ? (
            <div className="la-empty">
              <h3>{t.emptyDraftTitle}</h3>
              <p>{t.emptyDraftHint}</p>
              <Button size="sm" onClick={() => onParse(false)} disabled={isBusy}>
                {t.runParse}
              </Button>
            </div>
          ) : (
            <DraftForm
              t={t}
              detail={detail}
              form={form}
              activeEvidence={activeEvidence}
              onChange={onFormChange}
              onEvidenceFocus={onEvidenceFocus}
            />
          )}
        </section>
      </div>
    </div>
  )
}

const rootElement = document.getElementById('root')
const root = ReactDOM.createRoot ? ReactDOM.createRoot(rootElement) : null
if (root) {
  root.render(
    <RemoteI18nProvider i18n={i18n}>
      <App />
    </RemoteI18nProvider>
  )
} else {
  ReactDOM.render?.(
    <RemoteI18nProvider i18n={i18n}>
      <App />
    </RemoteI18nProvider>,
    rootElement
  )
}
