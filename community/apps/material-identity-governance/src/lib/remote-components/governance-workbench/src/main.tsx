import * as React from 'react'
import { createRoot } from 'react-dom/client'
import {
  Button,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Skeleton,
} from '@xpert-ai/plugin-shadcn-ui'
import {
  RefreshCw,
  Plus,
  Play,
  ArrowLeft,
  Layers3,
  AlertCircle,
} from 'lucide-react'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import './styles.css'
import type {
  WorkbenchData,
  ViewQuery,
  ActionInput,
  CaseKind,
  FlowNode,
  Surface,
} from '../../../contracts'
import { I18nContext, createI18n, normalizeLocale, useI18n } from './i18n'
import {
  startBridge,
  requestData,
  executeAction,
  navigate,
  type HostInit,
} from './bridge'
import { Dashboard } from './dashboard'
import { Swimlane } from './swimlane'
import { PipelineToolbar } from './pipeline-toolbar'
import { Workspace } from './workspace'
import { ExecutionMarkers, Status } from './ui'
const viewKey: Record<Surface, string> = {
  dashboard: 'material_identity_operations_dashboard',
  pipeline: 'material_identity_pipeline_overview',
  workspace: 'material_identity_case_workspace',
}
function App() {
  const [host, setHost] = React.useState<HostInit | null>(null),
    [data, setData] = React.useState<WorkbenchData | null>(null),
    [error, setError] = React.useState(''),
    [busy, setBusy] = React.useState(false),
    [loading, setLoading] = React.useState(true)
  const query = React.useRef<ViewQuery>({ page: 1, pageSize: 20 }),
    reload = React.useRef<() => Promise<void>>(async () => {})
  const loadSequence = React.useRef(0)
  const initialQueryKey = React.useRef<string | null>(null)
  const load = React.useCallback(async () => {
    const sequence = ++loadSequence.current
    try {
      const next = await requestData({ ...query.current })
      if (sequence !== loadSequence.current) return
      setData(next)
      setError('')
    } catch (e) {
      if (sequence !== loadSequence.current) return
      setError(e instanceof Error ? e.message : 'request_failed')
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }, [])
  reload.current = load
  React.useEffect(
    () =>
      startBridge(
        (value) => {
          setHost(value)
          // Host refreshes resend init. Preserve a user's local case selection
          // until navigation actually supplies a different initial query.
          const nextKey = JSON.stringify(value.initialQuery ?? {})
          if (nextKey !== initialQueryKey.current) {
            initialQueryKey.current = nextKey
            query.current = { ...query.current, ...value.initialQuery }
          }
          document.documentElement.lang = normalizeLocale(value.locale)
          void reload.current()
        },
        () => void reload.current(),
      ),
    [],
  )
  React.useEffect(() => {
    if (
      data?.selectedCase?.status !== 'active' &&
      !data?.flow?.nodes.some((n) => n.status === 'running') &&
      !data?.flow?.lanes.some((lane) =>
        lane.executions.some(
          (r) => r.status === 'queued' || r.status === 'running',
        ),
      ) &&
      !data?.coordinatorExecutions?.some(
        (r) => r.status === 'queued' || r.status === 'running',
      )
    )
      return
    const timer = setInterval(() => void reload.current(), 3000)
    return () => clearInterval(timer)
  }, [data])
  const i18n = React.useMemo(
    () => createI18n(normalizeLocale(host?.locale)),
    [host?.locale],
  )
  const action = async (key: string, input: Partial<ActionInput> = {}) => {
    setBusy(true)
    setError('')
    try {
      const r = await executeAction(key, {
        operationId: crypto.randomUUID(),
        ...(key === 'create_case'
          ? {}
          : {
              caseId: data?.selectedCase?.id,
              expectedRevision: data?.selectedCase?.revision,
            }),
        ...input,
      })
      if (r.caseId) query.current.selectionId = r.caseId
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'action_failed')
      throw e
    } finally {
      setBusy(false)
    }
  }
  const open = async (surface: Surface, id?: string, nodeKey?: string) => {
    try {
      await navigate({
        target: 'workbench.view',
        viewKey: viewKey[surface],
        selectionId: id,
        parameters: { surface, ...(nodeKey ? { nodeKey } : {}) },
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'navigation_failed')
    }
  }
  return (
    <I18nContext.Provider value={i18n}>
      <Screen
        data={data}
        loading={loading}
        error={error}
        busy={busy}
        onReload={() => void load()}
        onAction={action}
        onOpen={open}
        onSelect={(id) => {
          query.current.selectionId = id
          void load()
        }}
        onError={(e) => setError(e.message)}
      />
    </I18nContext.Provider>
  )
}
interface ScreenProps {
  data: WorkbenchData | null
  loading: boolean
  error: string
  busy: boolean
  onReload: () => void
  onAction: (key: string, input?: Partial<ActionInput>) => Promise<void>
  onOpen: (surface: Surface, id?: string, nodeKey?: string) => Promise<void>
  onSelect: (id: string) => void
  onError: (error: Error) => void
}
function Screen({
  data,
  loading,
  error,
  busy,
  onReload,
  onAction,
  onOpen,
  onSelect,
  onError,
}: ScreenProps) {
  const { t } = useI18n()
  const [create, setCreate] = React.useState(false),
    [kind, setKind] = React.useState<CaseKind>('duplicate_codes'),
    [title, setTitle] = React.useState(''),
    [node, setNode] = React.useState<FlowNode | null>(null)
  const current = data?.selectedCase,
    flow = data?.flow,
    surface = data?.surface ?? 'dashboard'
  const doAction = (key: string, input?: Partial<ActionInput>) => {
    void onAction(key, input).catch(() => {})
  }
  const openNode = (n: FlowNode) => {
    if (n.openMode === 'view') void onOpen('workspace', current?.id, n.key)
    else setNode(n)
  }
  const createCase = async () => {
    try {
      await onAction('create_case', { kind, title: title.trim() || undefined })
      setCreate(false)
      setTitle('')
    } catch {}
  }
  return (
    <main
      className={`governance-app ${surface === 'pipeline' ? 'pipeline-studio' : ''}`}
    >
      {surface === 'pipeline' ? (
        <PipelineToolbar
          data={data}
          busy={busy}
          onSelect={onSelect}
          onReload={onReload}
          onCreate={() => setCreate(true)}
          onWorkspace={() => void onOpen('workspace', current?.id)}
          onCoordinate={() => doAction('coordinate_next')}
        />
      ) : (
        <header className="app-header">
          <div className="app-heading">
            <Layers3 className="text-primary" size={25} />
            <div>
              <p className="eyebrow">{t('app')}</p>
              <h1>{t(surface)}</h1>
            </div>
            <Badge variant="outline">{t('mock')}</Badge>
          </div>
          <div className="header-actions">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('refresh')}
              onClick={onReload}
              disabled={busy}
            >
              <RefreshCw size={16} />
            </Button>
            {surface === 'workspace' ? (
              <Button
                variant="outline"
                onClick={() => void onOpen('pipeline', current?.id)}
              >
                <ArrowLeft size={15} />
                {t('back')}
              </Button>
            ) : (
              <Button
                disabled={
                  busy || data?.canCreate === false || data?.canManage === false
                }
                onClick={() => setCreate(true)}
              >
                <Plus size={16} />
                {t('create')}
              </Button>
            )}
          </div>
        </header>
      )}
      <div
        className={`governance-content ${surface === 'pipeline' ? 'pipeline-content' : ''}`}
      >
        {error && (
          <div role="alert" className="error-banner">
            <AlertCircle size={17} />
            <span>
              {t('error')} · {error}
            </span>
            <Button variant="outline" size="sm" onClick={onReload}>
              {t('retry')}
            </Button>
          </div>
        )}
        {loading && !data ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : !data ? (
          <p className="empty-inline">{t('loading')}</p>
        ) : (
          <>
            {data.projectStatus &&
              data.projectStatus !== 'ready' &&
              current && (
                <div className="blocker-banner">
                  <span>{t('projectFailed')}</span>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      doAction('retry_project', { expectedRevision: undefined })
                    }
                  >
                    {t('projectRetry')}
                  </Button>
                </div>
              )}
            {surface === 'workspace' && (
              <section className="case-toolbar">
                <Select value={current?.id ?? ''} onValueChange={onSelect}>
                  <SelectTrigger
                    className="case-select"
                    aria-label={t('selectCase')}
                  >
                    <SelectValue placeholder={t('selectCase')} />
                  </SelectTrigger>
                  <SelectContent>
                    {data.table.items.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.caseKey} · {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {current && (
                  <>
                    <Status value={current.status} />
                    <span className="text-xs text-muted-foreground">
                      {t('revision')} {current.revision}
                    </span>
                  </>
                )}
              </section>
            )}
            {!data.table.items.length ? (
              <div className="empty-state">
                <Layers3 size={40} />
                <h2>{t('noCases')}</h2>
                <p>{t('noCasesHint')}</p>
                <Button
                  disabled={data.canCreate === false}
                  onClick={() => setCreate(true)}
                >
                  {t('create')}
                </Button>
              </div>
            ) : surface === 'dashboard' ? (
              <Dashboard
                data={data}
                onOpen={(id) => void onOpen('pipeline', id)}
              />
            ) : current && flow ? (
              <>
                {surface === 'pipeline' ? (
                  <>
                    {flow.blocker && (
                      <div className="blocker-banner">
                        <ShieldIcon />
                        <span>{flow.blocker}</span>
                        {current.status === 'review_required' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void onOpen('workspace', current.id)}
                          >
                            {t('decision')}
                          </Button>
                        )}
                      </div>
                    )}
                    <Swimlane
                      flow={flow}
                      onNode={openNode}
                      onError={onError}
                      coordinatorExecutions={data.coordinatorExecutions ?? []}
                    />
                  </>
                ) : (
                  <Workspace
                    current={current}
                    canApprove={data.canApprove}
                    busy={busy}
                    onAction={onAction}
                  />
                )}
              </>
            ) : (
              <div className="empty-state">{t('noSelection')}</div>
            )}
          </>
        )}
        {surface !== 'pipeline' && (
          <footer className="app-footer">{t('systemNotice')}</footer>
        )}
      </div>
      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('newCaseTitle')}</DialogTitle>
            <DialogDescription>{t('createHint')}</DialogDescription>
          </DialogHeader>
          <label className="field-label">{t('scenario')}</label>
          <Select
            value={kind}
            onValueChange={(v) => {
              if (
                v === 'duplicate_codes' ||
                v === 'code_collision' ||
                v === 'drawing_request'
              )
                setKind(v)
            }}
          >
            <SelectTrigger aria-label={t('scenario')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                [
                  'duplicate_codes',
                  'code_collision',
                  'drawing_request',
                ] as const
              ).map((k) => (
                <SelectItem key={k} value={k}>
                  {t(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="field-label" htmlFor="case-title">
            {t('title')}
          </label>
          <Input
            id="case-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t(kind)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreate(false)}>
              {t('cancel')}
            </Button>
            <Button disabled={busy} onClick={() => void createCase()}>
              {t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={node !== null}
        onOpenChange={(open) => {
          if (!open) setNode(null)
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{node?.title}</DialogTitle>
            <DialogDescription>
              {node?.summary || t('noArtifact')}
            </DialogDescription>
          </DialogHeader>
          {node && (
            <>
              <div className="flex items-center justify-between">
                <Status value={node.status} />
                <ExecutionMarkers records={node.executions} onError={onError} />
              </div>
              <div className="node-evidence">
                {current?.artifacts
                  .filter((a) => a.key === node.artifactKey)
                  .map((a) => (
                    <p key={a.key}>{a.summary}</p>
                  ))}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() =>
                    void onOpen('workspace', current?.id, node.key)
                  }
                >
                  {t('fullWorkspace')}
                </Button>
                {node.executionMode === 'assistant_task' && (
                  <Button
                    disabled={busy || !node.executable}
                    onClick={() => {
                      doAction('run_node', { nodeKey: node.key })
                      setNode(null)
                    }}
                  >
                    <Play size={14} />
                    {t('run')}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
function ShieldIcon() {
  return <AlertCircle size={17} />
}
const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
