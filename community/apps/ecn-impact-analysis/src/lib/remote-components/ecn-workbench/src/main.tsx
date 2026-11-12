import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Button, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Skeleton } from '@xpert-ai/plugin-shadcn-ui'
import { RefreshCw, Plus, GitBranch, AlertCircle, Send } from 'lucide-react'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import './styles.css'
import type { AssessmentListData, EcnAssessmentStatus, ViewQuery } from '../../../contracts'
import { I18nContext, createI18n, normalizeLocale, useI18n } from './i18n'
import { executeAction, requestData, startBridge, type HostInit } from './bridge'
import { AssessmentDetail } from './assessment-detail'
import { RiskBadge, StatusBadge, formatTime } from './ui'

const ECN_IMPACT_VIEW_KEY = 'ecn_impact__workbench'

function App() {
  const [host, setHost] = React.useState<HostInit | null>(null)
  const [data, setData] = React.useState<AssessmentListData | null>(null)
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [form, setForm] = React.useState({ changeNo: '', materialNo: '', changeType: 'material', changeDescription: '', changeReason: '' })
  const query = React.useRef<ViewQuery>({ page: 1, pageSize: 20 })
  const reload = React.useRef<() => Promise<void>>(async () => {})

  const load = React.useCallback(async () => {
    const next = await requestData({ ...query.current }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'request_failed')
      return null
    })
    if (next) {
      setData(next)
      setError('')
    }
    setLoading(false)
  }, [])
  reload.current = load

  React.useEffect(
    () =>
      startBridge(
        (value) => {
          setHost(value)
          query.current = { page: 1, pageSize: 20, ...value.initialQuery }
          document.documentElement.lang = normalizeLocale(value.locale)
          void reload.current()
        },
        () => void reload.current()
      ),
    []
  )

  const i18n = React.useMemo(() => createI18n(normalizeLocale(host?.locale)), [host?.locale])

  const action = async (actionKey: string, input: Record<string, unknown> = {}) => {
    setBusy(true)
    setError('')
    try {
      const receipt = await executeAction(actionKey, input, typeof input['assessmentId'] === 'string' ? (input['assessmentId'] as string) : undefined)
      await load()
      return receipt
    } catch (e) {
      setError(e instanceof Error ? e.message : 'action_failed')
      throw e
    } finally {
      setBusy(false)
    }
  }

  const select = (selectionId: string) => {
    query.current = { ...query.current, selectionId }
    void load()
  }

  const search = (value: string) => {
    query.current = { ...query.current, search: value.trim() || undefined, page: 1 }
    void load()
  }

  const submitCreate = async () => {
    try {
      await action('create_assessment', {
        changeNo: form.changeNo.trim() || undefined,
        materialNo: form.materialNo.trim(),
        materialName: undefined,
        changeType: form.changeType,
        changeDescription: form.changeDescription.trim(),
        changeReason: form.changeReason.trim() || undefined
      })
      setCreateOpen(false)
      setForm({ changeNo: '', materialNo: '', changeType: 'material', changeDescription: '', changeReason: '' })
    } catch {
      /* error banner already shows the reason */
    }
  }

  return (
    <I18nContext.Provider value={i18n}>
      <Main
        data={data}
        loading={loading}
        error={error}
        busy={busy}
        locale={normalizeLocale(host?.locale)}
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        form={form}
        setForm={setForm}
        onReload={() => void load()}
        onAction={action}
        onSelect={select}
        onSearch={search}
        onSubmitCreate={submitCreate}
      />
    </I18nContext.Provider>
  )
}

interface MainProps {
  data: AssessmentListData | null
  loading: boolean
  error: string
  busy: boolean
  locale: string
  createOpen: boolean
  setCreateOpen: (open: boolean) => void
  form: { changeNo: string; materialNo: string; changeType: string; changeDescription: string; changeReason: string }
  setForm: React.Dispatch<React.SetStateAction<{ changeNo: string; materialNo: string; changeType: string; changeDescription: string; changeReason: string }>>
  onReload: () => void
  onAction: (actionKey: string, input?: Record<string, unknown>) => Promise<unknown>
  onSelect: (selectionId: string) => void
  onSearch: (value: string) => void
  onSubmitCreate: () => Promise<void>
}

function Main({
  data,
  loading,
  error,
  busy,
  locale,
  createOpen,
  setCreateOpen,
  form,
  setForm,
  onReload,
  onAction,
  onSelect,
  onSearch,
  onSubmitCreate
}: MainProps) {
  const { t, tFn } = useI18n()
  const selected = data?.selected
  const doAction = (actionKey: string, input?: Record<string, unknown>) => {
    void onAction(actionKey, input).catch(() => {})
  }

  return (
    <main className="ecn-app">
      <header className="ecn-header">
        <div className="ecn-heading">
          <GitBranch size={22} color="#1d4ed8" />
          <div>
            <p className="eyebrow">{t('appSubtitle')}</p>
            <h1>{t('appTitle')}</h1>
          </div>
          <Badge variant="outline">{t('mockBadge')}</Badge>
        </div>
        <div className="ecn-header-actions">
          <Button size="sm" variant="outline" disabled={busy || !selected} onClick={() => doAction('send_to_chat', { assessmentId: selected?.id })}>
            <Send size={14} />
            {t('sendToChat')}
          </Button>
          {(selected?.status === 'draft' || selected?.status === 'ai_completed') && selected && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => doAction('retry_analysis', { assessmentId: selected.id })}>
              {t('retry')}
              {selected.retryCount > 0 ? ` (${selected.retryCount})` : ''}
            </Button>
          )}
          <Button size="sm" disabled={busy} onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            {t('newAssessment')}
          </Button>
          <Button size="sm" variant="ghost" aria-label={t('refresh')} onClick={onReload} disabled={busy}>
            <RefreshCw size={15} />
          </Button>
        </div>
      </header>

      <div className="ecn-body">
        <aside className="ecn-list">
          <div className="ecn-list-toolbar">
            <Input
              onChange={(e) => onSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
            />
          </div>
          <div className="ecn-list-scroll">
            {loading && !data ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : !data?.items.length ? (
              <div className="ecn-empty">
                <GitBranch size={36} />
                <h2>{t('empty')}</h2>
                <p className="text-xs leading-relaxed">{t('emptyHint')}</p>
              </div>
            ) : (
              data.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`ecn-list-item ${selected?.id === item.id ? 'selected' : ''}`}
                  onClick={() => onSelect(item.id)}
                >
                  <div className="ecn-list-item-top">
                    <span className="ecn-list-item-no">{item.changeNo}</span>
                    <StatusBadge status={item.status as EcnAssessmentStatus} />
                  </div>
                  <div className="ecn-list-item-material">
                    {item.materialNo}
                    {item.materialName ? ` · ${item.materialName}` : ''}
                  </div>
                  <div className="ecn-list-item-meta">
                    <RiskBadge risk={item.riskLevel} />
                    <span className="text-[11px] text-muted-foreground">
                      {t('colItems')} {item.itemCount}
                      {item.pendingCount > 0 ? ` · ${tFn('pendingTip', item.pendingCount)}` : ''}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{formatTime(item.updatedAt, locale)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="ecn-detail">
          {error && (
            <div role="alert" className="ecn-error-banner">
              <AlertCircle size={16} />
              <span>
                {t('error')} · {error}
              </span>
              <Button size="sm" variant="outline" onClick={onReload}>
                {t('retryAction')}
              </Button>
            </div>
          )}
          {loading && !data ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : selected ? (
            <AssessmentDetail detail={selected} busy={busy} locale={locale} onAction={onAction} />
          ) : (
            <div className="ecn-empty">
              <GitBranch size={40} />
              <h2>{data?.items.length ? t('noSelection') : t('empty')}</h2>
              {!data?.items.length && <p className="text-xs">{t('emptyHint')}</p>}
            </div>
          )}
        </section>
      </div>

      <footer className="ecn-footer">{t('systemNotice')}</footer>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialogNewTitle')}</DialogTitle>
            <DialogDescription>{t('createHint')}</DialogDescription>
          </DialogHeader>
          <label className="field-label" htmlFor="ecn-material">
            {t('selectMaterial')}
          </label>
          <Input
            id="ecn-material"
            className="ecn-dialog-input"
            value={form.materialNo}
            onChange={(e) => setForm((prev) => ({ ...prev, materialNo: e.target.value }))}
            placeholder={t('selectMaterialPlaceholder')}
          />
          <label className="field-label" htmlFor="ecn-type">
            {t('inputChangeType')}
          </label>
          <Select value={form.changeType} onValueChange={(v) => setForm((prev) => ({ ...prev, changeType: v }))}>
            <SelectTrigger className="ecn-dialog-select" aria-label={t('inputChangeType')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['material', 'dimension', 'structure', 'process', 'other'] as const).map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`changeType_${k}` as const)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="field-label" htmlFor="ecn-desc">
            {t('inputChangeDescription')}
          </label>
          <Input
            id="ecn-desc"
            className="ecn-dialog-input"
            value={form.changeDescription}
            onChange={(e) => setForm((prev) => ({ ...prev, changeDescription: e.target.value }))}
            placeholder={t('inputChangeDescriptionPlaceholder')}
          />
          <label className="field-label" htmlFor="ecn-reason">
            {t('inputChangeReason')}
          </label>
          <Input
            id="ecn-reason"
            className="ecn-dialog-input"
            value={form.changeReason}
            onChange={(e) => setForm((prev) => ({ ...prev, changeReason: e.target.value }))}
            placeholder={t('inputChangeReason')}
          />
          <label className="field-label" htmlFor="ecn-no">
            {t('inputChangeNo')}
          </label>
          <Input
            id="ecn-no"
            className="ecn-dialog-input"
            value={form.changeNo}
            onChange={(e) => setForm((prev) => ({ ...prev, changeNo: e.target.value }))}
            placeholder="ECN-2026-015"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('cancel')}
            </Button>
            <Button disabled={busy || !form.materialNo.trim() || !form.changeDescription.trim()} onClick={() => void onSubmitCreate()}>
              {t('sendAfterCreate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
