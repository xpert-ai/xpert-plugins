import { translate } from './i18n'
import * as React from 'react'
import { Button, Badge } from '@xpert-ai/plugin-shadcn-ui'
import {
  Database,
  Play,
  Square,
  Plus,
  Search,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  Braces,
  ChevronRight,
  Table2,
  FileCode2,
  Network,
  History,
  Star,
  BarChart3,
  ArrowDownToLine,
  ArrowUpFromLine,
  Sparkles,
  ShieldCheck,
  X,
} from 'lucide-react'
import {
  splitWorkbenchSql,
  quoteDatabaseIdentifier,
  type DatabaseCapabilities,
  type DatabaseObjectRef,
  type DatabaseObjectDetail,
  type DatabaseObjectPage,
  type DatabaseLocation,
  type DatabaseResult,
  type DataSourceSummary,
  type DatabaseValue,
} from '@xpert-ai/plugin-sdk/data-workbench'
import { SqlEditor, type EditorHandle } from './editor'
import { PolicyDialog, type ConnectionPolicy } from './policy-dialog'
import { Dashboard } from './dashboard'
import { ResultTable } from './result-table'
import { ChartPanel, PivotPanel, ErPanel, type ChartConfig } from './analysis-panels'
import { compareSnapshots, documentation, type Snapshot } from './schema-tools'
import { action, data, command, onHost, startBridge, upload, type JsonRecord } from './bridge'
import {
  uid,
  blank,
  targetEmpty,
  newDraft,
  jsonContent,
  cleanTarget,
  download,
  type Target,
  type SavedRecord,
  type Draft,
  type QueryReceipt,
  type Run,
  type Plan,
} from './model'
export function useStudio() {
  const [zh, setZh] = React.useState(true),
    [ready, setReady] = React.useState(false),
    [sources, setSources] = React.useState<DataSourceSummary[]>([]),
    [features, setFeatures] = React.useState<string[]>([]),
    [testMode, setTestMode] = React.useState(false),
    [target, setTarget] = React.useState<Target>(targetEmpty),
    [locations, setLocations] = React.useState<DatabaseLocation[]>([]),
    [objects, setObjects] = React.useState<DatabaseObjectRef[]>([]),
    [objectPage, setObjectPage] = React.useState(1),
    [hasObjects, setHasObjects] = React.useState(false),
    [search, setSearch] = React.useState(''),
    [caps, setCaps] = React.useState<DatabaseCapabilities | null>(null),
    [detail, setDetail] = React.useState<DatabaseObjectDetail | null>(null),
    [drafts, setDrafts] = React.useState<Draft[]>([newDraft(targetEmpty)]),
    [tab, setTab] = React.useState(''),
    [panel, setPanel] = React.useState('results'),
    [run, setRun] = React.useState<Run | null>(null),
    [busy, setBusy] = React.useState(false),
    [runningId, setRunningId] = React.useState<string | null>(null),
    [error, setError] = React.useState(''),
    [collapsed, setCollapsed] = React.useState(false),
    [list, setList] = React.useState<SavedRecord[]>([]),
    [plan, setPlan] = React.useState<Plan | null>(null),
    [er, setEr] = React.useState<DatabaseObjectDetail[]>([]),
    [comparison, setComparison] = React.useState(''),
    [snapshotA, setSnapshotA] = React.useState(''),
    [snapshotB, setSnapshotB] = React.useState(''),
    [showPolicy, setShowPolicy] = React.useState(false),
    [policy, setPolicy] = React.useState<ConnectionPolicy | null>(null),
    [limit, setLimit] = React.useState(100),
    [height, setHeight] = React.useState(270),
    [notice, setNotice] = React.useState('')
  const [task, setTask] = React.useState<SavedRecord | null>(null),
    [chartConfig, setChartConfig] = React.useState<ChartConfig | undefined>(),
    [explainRun, setExplainRun] = React.useState<Run | null>(null)
  const saves = React.useRef(new Map<string, Promise<string>>()),
    revisions = React.useRef(new Map<string, { id: string; revision: number }>())
  const editor = React.useRef<EditorHandle | null>(null),
    file = React.useRef<HTMLInputElement>(null),
    generation = React.useRef(0)
  const active = drafts.find((draft) => draft.key === tab) ?? drafts[0],
    engine = sources.find((source) => source.id === active?.target.dataSourceId)?.engine ?? 'doris',
    connection = sources.find((source) => source.id === target.dataSourceId),
    canChange = features.includes('db-studio-changes'),
    canTransfer = features.includes('db-studio-transfer'),
    result = run?.receipt.result ?? blank
  const protect = async (work: () => Promise<void>) => {
    setError('')
    try {
      await work()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'operation_failed')
    }
  }
  const requestItem = async <T>(kind: string, input: unknown = {}) => (await data<{ item: T }>(kind, input)).item
  const updateDraft = (change: Partial<Draft>) =>
    setDrafts((all) => all.map((draft) => (draft.key === active.key ? { ...draft, ...change, dirty: true } : draft)))
  const addDraft = (sql: string, selected = target, title = 'Query') => {
    const draft = { ...newDraft({ ...selected }, sql), title }
    setDrafts((all) => [...all, draft])
    setTab(draft.key)
    setPanel('results')
  }
  const saveDraft = async (captured: Draft): Promise<string> => {
    const pending = saves.current.get(captured.key)
    if (pending) await pending
    const work = async () => {
      const saved = await action<SavedRecord>('save_artifact', {
        id: captured.id,
        revision: captured.revision,
        ...revisions.current.get(captured.key),
        kind: 'draft',
        title: captured.title,
        target: cleanTarget(captured.target),
        content: captured.sql,
      })
      revisions.current.set(captured.key, { id: saved.id, revision: saved.revision })
      setDrafts((all) =>
        all.map((item) =>
          item.key === captured.key
            ? {
                ...item,
                id: saved.id,
                revision: saved.revision,
                dirty:
                  item.sql !== captured.sql ||
                  item.title !== captured.title ||
                  JSON.stringify(item.target) !== JSON.stringify(captured.target),
              }
            : item
        )
      )
      return saved.id
    }
    const promise = work()
    saves.current.set(captured.key, promise)
    try {
      return await promise
    } finally {
      if (saves.current.get(captured.key) === promise) saves.current.delete(captured.key)
    }
  }
  const save = () => saveDraft({ ...active })
  const saveAll = async () => {
    for (const draft of drafts) if (draft.dirty && draft.target.dataSourceId) await saveDraft({ ...draft })
  }
  React.useEffect(() => {
    if (!ready || !drafts.some((draft) => draft.dirty && draft.target.dataSourceId)) return
    const timer = setTimeout(() => {
      void protect(saveAll)
    }, 1200)
    return () => clearTimeout(timer)
  }, [ready, drafts])
  React.useEffect(() => {
    if (!task || !['queued', 'running'].includes(task.status)) return
    let stopped = false
    const timer = setTimeout(() => {
      void protect(async () => {
        const current = await requestItem<SavedRecord>('record', { id: task.id })
        if (stopped) return
        setTask(current)
        if (current.kind === 'plan') setPlan(current as Plan)
        if (current.status === 'succeeded' && current.kind === 'transfer') {
          await loadList('snapshot')
          setNotice(translate(zh, 'm_c0f8be17'))
        }
        if (['failed', 'unknown'].includes(current.status)) setNotice(translate(zh, 'm_90e4fe99'))
      })
    }, 2500)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [task])
  const transaction = async (operation: 'begin' | 'commit' | 'rollback') => {
    const current = cleanTarget(active.target)
    const receipt = await action<{ sessionId: string; status: string }>('transaction', {
      target: current,
      action: operation,
    })
    const next = { ...current, sessionId: operation === 'begin' ? receipt.sessionId : undefined }
    setTarget(next)
    updateDraft({ target: next })
    setNotice(translate(zh, 'm_a3dcb598') + receipt.status)
    if (plan) setPlan(await requestItem('record', { id: plan.id }))
  }
  const publishContext = async () => {
    const draftId = await save()
    await command('assistant.context.set', {
      key: 'db_studio',
      context: { draftId, target: active.target, object: detail?.object ?? null },
    })
    return draftId
  }
  const ask = async (message: string) => {
    await publishContext()
    await command('assistant.chat.send_message', { text: message })
  }
  const loadObjects = async (selected: Target, page = 1, term = search) => {
    const stamp = generation.current
    const response = await data<{ item: DatabaseObjectPage }>('objects', selected, page, term)
    if (stamp !== generation.current) return
    setObjects(response.item.items)
    setHasObjects(response.item.hasMore)
    setObjectPage(page)
  }
  const selectConnection = async (id: string) => {
    const stamp = ++generation.current,
      selected = { dataSourceId: id }
    setTarget(selected)
    setDetail(null)
    setObjects([])
    setCaps(null)
    const [cap, places] = await Promise.all([
      requestItem<DatabaseCapabilities>('capabilities', selected),
      requestItem<DatabaseLocation[]>('locations', selected),
    ])
    if (stamp !== generation.current) return
    setCaps(cap)
    setLocations(places)
    const next = { ...selected, ...places[0] }
    setTarget(next)
    updateDraft({ target: next })
    await loadObjects(next, 1, '')
  }
  const selectLocation = async (index: number) => {
    generation.current++
    const next = { dataSourceId: target.dataSourceId, ...locations[index] }
    setTarget(next)
    setDetail(null)
    updateDraft({ target: next })
    await loadObjects(next, 1, '')
  }
  const inspect = async (object: DatabaseObjectRef) => {
    const stamp = generation.current
    const selected = await requestItem<DatabaseObjectDetail>('describe', { target, object })
    if (stamp !== generation.current) return
    setDetail(selected)
    setPanel('structure')
  }
  const execute = async (mode: 'query' | 'explain' | 'script' = 'query', continuation?: Run['input']) => {
    const selected = continuation ?? {
      ...cleanTarget(active.target),
      sql: editor.current?.selection() || active.sql,
      limit,
      offset: 0,
    }
    if (!selected.dataSourceId) throw new Error(translate(zh, 'm_fe4bc4d8'))
    const statements = splitWorkbenchSql(selected.sql)
    if (mode !== 'script' && statements.length !== 1) throw new Error(translate(zh, 'm_4c02b7d9'))
    setBusy(true)
    try {
      for (const statement of statements) {
        if (statement.effect === 'write') {
          if (mode === 'script') throw new Error(translate(zh, 'm_790370df'))
          const response = await action<Plan>('propose_change', {
            ...selected,
            limit: undefined,
            offset: undefined,
            sql: statement.sql,
            reason: translate(zh, 'm_0fc02e88'),
            operationId: uid(),
          })
          setPlan(response)
          setPanel('plan')
          return
        }
        if (statement.effect !== 'read') throw new Error(translate(zh, 'm_982fbc1d'))
        const executionId = uid()
        setRunningId(executionId)
        const input = { ...selected, sql: statement.sql }
        const receipt = await action<QueryReceipt>(mode === 'explain' ? 'explain' : 'run_query', {
          ...input,
          executionId,
        })
        if (mode === 'explain') setExplainRun({ input, receipt })
        else setRun({ input, receipt })
        setPanel(mode === 'explain' ? 'explain' : 'results')
      }
    } finally {
      setBusy(false)
      setRunningId(null)
    }
  }
  const readTable = (object: DatabaseObjectRef) => {
    const namespace = engine === 'postgres' ? object.schema : object.database
    const sql = `SELECT *\nFROM ${[namespace, object.name]
      .filter(Boolean)
      .map((name) => quoteDatabaseIdentifier(name!, engine))
      .join('.')}\nLIMIT 100;`
    addDraft(sql, cleanTarget({ ...target, ...object }), object.name)
  }
  const loadList = async (kind: string) => {
    const response = await data<{ items: SavedRecord[] }>(kind)
    setList(response.items)
    setPanel(kind === 'chart' ? 'chart_saved' : kind)
  }
  React.useEffect(() => {
    const unsubscribe = onHost((type, message) => {
      if (type === 'init') {
        setZh(!String(message.locale ?? 'zh').startsWith('en'))
        void protect(async () => {
          const response = await data<{
            summary: { items: DataSourceSummary[]; features: string[]; testReadOnly: boolean; drafts: SavedRecord[] }
          }>('bootstrap')
          setSources(response.summary.items)
          setFeatures(response.summary.features)
          setTestMode(response.summary.testReadOnly)
          const loaded = response.summary.drafts.map((item) => ({
            key: item.id,
            id: item.id,
            revision: item.revision,
            title: item.title,
            sql: String(item.summary?.content ?? ''),
            target: (item.summary?.target ?? targetEmpty) as Target,
            dirty: false,
          }))
          if (loaded.length) {
            setDrafts(loaded)
            setTab(loaded[0].key)
            setTarget(loaded[0].target)
          }
          setReady(true)
        })
      } else if (type === 'locale') {
        const locale = message.locale ?? (message.payload as JsonRecord | undefined)?.locale ?? (message.data as JsonRecord | undefined)?.locale
        if (typeof locale === 'string') setZh(!locale.startsWith('en'))
      } else if (type === 'event') {
        const event = (message.event as JsonRecord | undefined) ?? message
        const locale = event.locale ?? (event.payload as JsonRecord | undefined)?.locale
        if (typeof locale === 'string' || String(event.type ?? '').toLowerCase().includes('locale') || String(event.type ?? '').toLowerCase().includes('language')) {
          if (typeof locale === 'string') setZh(!locale.startsWith('en'))
          return
        }
        setNotice('Agent ' + translate(zh, 'm_d5103240'))
      }
    })
    const stop = startBridge()
    return () => {
      unsubscribe()
      stop()
    }
  }, [])
  React.useEffect(() => {
    if (!ready || !target.dataSourceId) return
    void protect(async () => {
      setCaps(await requestItem('capabilities', target))
      setLocations(await requestItem('locations', target))
      await loadObjects(target, 1, '')
    })
  }, [ready])
  const saveChart = async (config: ChartConfig) => {
    if (!run) return
    await action('save_artifact', {
      kind: 'chart',
      title: config.title,
      target: cleanTarget(run.input),
      content: JSON.stringify({ config, query: run.input, executionId: run.receipt.executionId, result }),
    })
    setNotice(translate(zh, 'm_65413585'))
  }
  const exportRows = async (format: 'csv' | 'json') => {
    if (!run) return
    const exported = await action<{ name: string; content: string; hasMore: boolean; exportedRows: number }>('export_result', {
      id: run.receipt.executionId,
      format,
    })
    download(exported.name, exported.content)
    setNotice(`${exported.exportedRows} ${translate(zh, 'm_b7aee3d1')}${exported.hasMore ? translate(zh, 'm_755c01b0') : ''}`)
  }
  const editRow = async (row: DatabaseValue[], column: number, value: string) => {
    if (!detail || !run) return
    setPlan(
      await action('row_update', {
        executionId: run.receipt.executionId,
        object: detail.object,
        rowIndex: result.rows.indexOf(row),
        columnIndex: column,
        value,
        operationId: uid(),
      })
    )
    setPanel('plan')
  }
  const toolbarPanels = [
    ['results', translate(zh, 'm_682329d2')],
    ['explain', translate(zh, 'm_3074ee5e')],
    ['structure', translate(zh, 'm_ede385f4')],
    ['chart', translate(zh, 'm_b90ca172')],
    ['pivot', translate(zh, 'm_2dc4daa4')],
    ['er', 'ER'],
    ['docs', translate(zh, 'm_59490576')],
  ]

  return {
    zh,
    setZh,
    ready,
    setReady,
    sources,
    setSources,
    features,
    setFeatures,
    testMode,
    setTestMode,
    target,
    setTarget,
    locations,
    setLocations,
    objects,
    setObjects,
    objectPage,
    setObjectPage,
    hasObjects,
    setHasObjects,
    search,
    setSearch,
    caps,
    setCaps,
    detail,
    setDetail,
    drafts,
    setDrafts,
    tab,
    setTab,
    panel,
    setPanel,
    run,
    setRun,
    busy,
    setBusy,
    runningId,
    setRunningId,
    error,
    setError,
    collapsed,
    setCollapsed,
    list,
    setList,
    plan,
    setPlan,
    er,
    setEr,
    comparison,
    setComparison,
    snapshotA,
    setSnapshotA,
    snapshotB,
    setSnapshotB,
    showPolicy,
    setShowPolicy,
    policy,
    setPolicy,
    limit,
    setLimit,
    height,
    setHeight,
    notice,
    setNotice,
    task,
    setTask,
    chartConfig,
    setChartConfig,
    explainRun,
    setExplainRun,
    saves,
    revisions,
    editor,
    file,
    generation,
    active,
    engine,
    connection,
    canChange,
    canTransfer,
    result,
    protect,
    requestItem,
    updateDraft,
    addDraft,
    saveDraft,
    save,
    saveAll,
    transaction,
    publishContext,
    ask,
    loadObjects,
    selectConnection,
    selectLocation,
    inspect,
    execute,
    readTable,
    loadList,
    saveChart,
    exportRows,
    editRow,
    toolbarPanels,
  }
}
export type StudioState = ReturnType<typeof useStudio>
