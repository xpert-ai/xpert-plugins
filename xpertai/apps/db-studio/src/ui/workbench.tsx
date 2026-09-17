import { Button, ControlInput, SelectField, Table, SelectOption } from './controls'
import { translate } from './i18n'
import * as React from 'react'
import { Badge, Tabs, TabsList, TabsTrigger } from '@xpert-ai/plugin-shadcn-ui'
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
import type { StudioState } from './controller'
import { ConnectionSidebar } from './connection-sidebar'
/** One-line SQL preview extracted from a saved record's summary payload. */
const sqlPreview = (item: SavedRecord): string => {
  const summary = item.summary as { query?: { sql?: string }; sql?: string; content?: string } | undefined
  const candidates = [summary?.query?.sql, summary?.sql, summary?.content]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (!trimmed || trimmed.startsWith('{')) continue
    return trimmed.replace(/\s+/g, ' ').slice(0, 140)
  }
  return ''
}
/** Plan approval failures carry terse backend codes; map them to actionable guidance. */
const PLAN_ERROR_TEXT: Record<string, { zh: string; en: string }> = {
  approval_expired: {
    zh: '审批已过期（计划有效期 30 分钟）：请在右侧对话框重新发起变更指令生成新计划，并在 30 分钟内完成批准与执行。',
    en: 'Approval expired (30-minute validity). Ask the assistant for a new plan, then approve and execute within 30 minutes.',
  },
  connection_read_only: {
    zh: '连接执行策略为只读：请先在「连接执行策略」中关闭只读连接或预授权该操作。',
    en: 'The connection policy is read-only. Disable read-only in Execution policy or pre-authorize the action first.',
  },
  read_only_test_mode: {
    zh: '测试模式下不允许审批计划。',
    en: 'Approvals are disabled while test mode is on.',
  },
  data_source_edit_permission_required: {
    zh: '当前账号缺少数据源编辑权限，无法审批计划。',
    en: 'The current account lacks data source edit permission.',
  },
  plan_not_awaiting_approval: {
    zh: '计划状态已变化，请刷新操作计划列表后重试。',
    en: 'The plan status changed. Refresh the operation plans list and retry.',
  },
  approval_content_changed: {
    zh: '计划内容与审批摘要不一致，请重新生成计划。',
    en: 'Plan content does not match its digest. Regenerate the plan.',
  },
  approval_conflict: {
    zh: '计划已被其他会话更新，请刷新后重试。',
    en: 'The plan was updated elsewhere. Refresh and retry.',
  },
  feature_not_enabled: {
    zh: '当前助手未启用「数据库变更」能力，无法审批或执行计划。',
    en: 'The database changes capability is not enabled for this assistant.',
  },
}
const planError = (error: unknown, zh: boolean): Error => {
  const code = error instanceof Error ? error.message : String(error)
  const known = PLAN_ERROR_TEXT[code]
  return new Error(known ? (zh ? known.zh : known.en) : code)
}
const STATUS_TEXT: Record<string, { zh: string; en: string }> = {
  saved: { zh: '已保存', en: 'Saved' },
  succeeded: { zh: '成功', en: 'Succeeded' },
  failed: { zh: '失败', en: 'Failed' },
  awaiting_approval: { zh: '等待审批', en: 'Awaiting approval' },
  ready: { zh: '待执行', en: 'Ready' },
  running: { zh: '执行中', en: 'Running' },
  queued: { zh: '排队中', en: 'Queued' },
  pending: { zh: '待处理', en: 'Pending' },
  cancelled: { zh: '已取消', en: 'Cancelled' },
  unknown: { zh: '状态未知', en: 'Unknown' },
}
const statusLabel = (status: string, zh: boolean): string => STATUS_TEXT[status]?.[zh ? 'zh' : 'en'] ?? status
const formatRecordTime = (value: string, zh: boolean): string => {
  const date = Date.parse(value)
  return Number.isFinite(date) ? new Date(date).toLocaleString(zh ? 'zh-CN' : 'en-US') : value
}
export function Workbench(props: StudioState) {
  const {
    zh,
    ready,
    sources,
    testMode,
    target,
    setTarget,
    locations,
    setLocations,
    objects,
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
    error,
    setError,
    list,
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
    setTask,
    chartConfig,
    setChartConfig,
    explainRun,
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
    transaction,
    ask,
    loadObjects,
    execute,
    readTable,
    loadList,
    saveChart,
    exportRows,
    editRow,
    toolbarPanels,
  } = props
  const selectDraft = (draft: Draft) => {
    generation.current++
    setTab(draft.key)
    setTarget(draft.target)
    setDetail(null)
    void protect(async () => {
      setCaps(await requestItem('capabilities', cleanTarget(draft.target)))
      setLocations(await requestItem('locations', cleanTarget(draft.target)))
      await loadObjects(cleanTarget(draft.target), 1, '')
    })
  }
  return (
    <div className="studio">
      <a className="skip-link" href="#workspace">
        {translate(zh, 'm_88438c0f')}
      </a>
      <div className="workspace-shell">
        <ConnectionSidebar {...props} />
        <main id="workspace">
          <Tabs value={active?.key ?? ''} onValueChange={(value) => {
            const draft = drafts.find((item) => item.key === value)
            if (draft) selectDraft(draft)
          }} className="query-tabs">
            <TabsList variant="line">
              {drafts.map((draft) => (
                <TabsTrigger key={draft.key} value={draft.key} className="query-tab-trigger">
                  <FileCode2 size={14} />
                  <span>{draft.title}</span>
                  {draft.dirty && <span className="dirty-dot" />}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={translate(zh, 'm_486c22ee')}
                    className="tab-close"
                    onClick={(event) => {
                      event.stopPropagation()
                      void protect(async () => {
                        if (drafts.length === 1) return
                        if (draft.target.sessionId) throw new Error(translate(zh, 'm_27fc426c'))
                        if (draft.dirty && draft.target.dataSourceId) await saveDraft({ ...draft })
                        setDrafts((all) => all.filter((item) => item.key !== draft.key))
                      })
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.stopPropagation()
                      void protect(async () => {
                        if (drafts.length === 1) return
                        if (draft.target.sessionId) throw new Error(translate(zh, 'm_27fc426c'))
                        if (draft.dirty && draft.target.dataSourceId) await saveDraft({ ...draft })
                        setDrafts((all) => all.filter((item) => item.key !== draft.key))
                      })
                    }}
                  >
                    <X size={13} />
                  </span>
                </TabsTrigger>
              ))}
              <Button variant="ghost" size="icon-sm" title={translate(zh, 'm_96c8221f')} onClick={() => addDraft('SELECT 1 AS ready;')}>
                <Plus size={17} />
              </Button>
            </TabsList>
          </Tabs>
          <div className="editor-toolbar">
            <div className="toolbar-main">
              <Button variant="default" size="sm" disabled={busy || !ready || !active.target.dataSourceId} onClick={() => void protect(() => execute())}>
                <Play size={13} />
                {translate(zh, 'm_42fad981')}
                <kbd>⌘ ↵</kbd>
              </Button>
              <Button disabled={busy || !active.target.dataSourceId} onClick={() => void protect(() => execute('script'))}>
                {translate(zh, 'm_e1421329')}
              </Button>
              <Button disabled={busy || !caps?.explain} onClick={() => void protect(() => execute('explain'))}>
                {translate(zh, 'm_53dd6327')}
              </Button>
              <Button title={translate(zh, 'm_21498624')} onClick={() => editor.current?.format()}>
                <Braces size={16} />
              </Button>
              <Button
                title={translate(zh, 'm_5a161016')}
                onClick={() =>
                  void protect(async () => {
                    await save()
                    setNotice(translate(zh, 'm_530a9995'))
                  })
                }
              >
                <Save size={16} />
              </Button>
              {busy && (
                <Button
                  className="danger"
                  onClick={() =>
                    void protect(async () => {
                      if (runningId) await action('cancel', { id: runningId })
                    })
                  }
                >
                  <Square size={13} />
                  {translate(zh, 'm_d94a8eaf')}
                </Button>
              )}
            </div>
            <div className="toolbar-end">
              <SelectField aria-label={translate(zh, 'm_25339cf2')} value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
                {[50, 100, 200, 500, 1000].map((n) => (
                  <SelectOption value={n} key={n}>
                    {n} {translate(zh, 'm_eb541124')}
                  </SelectOption>
                ))}
              </SelectField>
              <Button title={translate(zh, 'm_e4eed595')} onClick={() => void protect(() => ask(translate(zh, 'm_79574ee9')))}>
                <Sparkles size={15} />
                {translate(zh, 'm_ad75e18a')}
              </Button>
            </div>
          </div>
          <div className="editor-context">
            <Database size={12} />
            {sources.find((source) => source.id === active.target.dataSourceId)?.name ?? translate(zh, 'm_7fb2fe77')}
            <ChevronRight size={11} />
            {active.target.schema ?? active.target.database ?? '—'}
            <span>{engine.toUpperCase()}</span>
            <div className="transaction-controls">
              {active.target.sessionId ? (
                <>
                  <span className="session-label">{translate(zh, 'm_3bbb2b3f')}</span>
                  <Button disabled={busy || testMode} onClick={() => void protect(() => transaction('commit'))}>
                    {translate(zh, 'm_a3375e2d')}
                  </Button>
                  <Button disabled={busy || testMode} onClick={() => void protect(() => transaction('rollback'))}>
                    {translate(zh, 'm_6b0b7015')}
                  </Button>
                </>
              ) : (
                <Button
                  title={caps?.transactions ? translate(zh, 'm_a0a0d313') : translate(zh, 'm_e0154315')}
                  disabled={busy || testMode || !canChange || !caps?.transactions}
                  onClick={() => void protect(() => transaction('begin'))}
                >
                  BEGIN
                </Button>
              )}
            </div>
          </div>
          <div className="editor-area" style={{ height }}>
            <SqlEditor
              value={active.sql}
              onChange={(sql) => updateDraft({ sql })}
              onRun={() => void protect(() => execute())}
              handle={editor}
              engine={engine}
              names={[...objects.map((object) => object.name), ...(detail?.columns.map((col) => col.name) ?? [])]}
            />
          </div>
          <div
            role="separator"
            aria-label={translate(zh, 'm_65414071')}
            aria-orientation="horizontal"
            tabIndex={0}
            className="resize-bar"
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp') setHeight((h) => Math.max(120, h - 20))
              if (event.key === 'ArrowDown') setHeight((h) => Math.min(600, h + 20))
            }}
            onPointerDown={(event) => {
              const start = event.clientY,
                original = height
              event.currentTarget.setPointerCapture(event.pointerId)
              event.currentTarget.onpointermove = (move) => setHeight(Math.max(120, Math.min(600, original + move.clientY - start)))
              event.currentTarget.onpointerup = () => {
                event.currentTarget.onpointermove = null
              }
            }}
          />
          <Tabs value={panel} onValueChange={setPanel} className="result-tabs">
            <TabsList variant="line">
              {toolbarPanels.map(([key, label]) => (
                <TabsTrigger value={key} key={key}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            {run && (
              <span className="result-meta">
                {result.rows.length} {translate(zh, 'm_eb541124')} · {result.durationMs} ms
              </span>
            )}
          </Tabs>
          {error && (
            <div role="alert" className="error-banner">
              <strong>{translate(zh, 'm_93929287')}</strong>
              <span>{error}</span>
              <Button onClick={() => setError('')}>
                <X size={14} />
              </Button>
            </div>
          )}
          <div className="result-body">
            {panel === 'results' && (
              <>
                {run ? (
                  <>
                    <div className="result-actions">
                      <Button
                        onClick={() =>
                          void protect(async () => {
                            await action('save_artifact', {
                              kind: 'favorite',
                              title: active.title,
                              target: cleanTarget(run.input),
                              content: run.input.sql,
                            })
                            setNotice(translate(zh, 'm_70e4f4d1'))
                          })
                        }
                      >
                        <Star size={14} />
                        {translate(zh, 'm_9df7a3d5')}
                      </Button>
                      <Button disabled={!canTransfer} onClick={() => void protect(() => exportRows('csv'))}>
                        <ArrowDownToLine size={14} />
                        CSV
                      </Button>
                      <Button disabled={!canTransfer} onClick={() => void protect(() => exportRows('json'))}>
                        JSON
                      </Button>
                      <span className="spacer" />
                      <Button
                        disabled={busy || run.input.offset === 0}
                        onClick={() =>
                          void protect(() => execute('query', { ...run.input, offset: Math.max(0, run.input.offset - run.input.limit) }))
                        }
                      >
                        ‹ {translate(zh, 'm_2149c196')}
                      </Button>
                      <span>
                        {run.input.offset + 1}–{run.input.offset + result.rows.length}
                      </span>
                      <Button
                        disabled={busy || !result.hasMore}
                        onClick={() => void protect(() => execute('query', { ...run.input, offset: run.input.offset + run.input.limit }))}
                      >
                        {translate(zh, 'm_bbe67f7d')} ›
                      </Button>
                    </div>
                    <ResultTable
                      result={result}
                      zh={zh}
                      edit={Boolean(canChange && !testMode && detail?.editable && run.input.sql.trim().match(/^SELECT \*/i))}
                      onEdit={(row, col, value) => void protect(() => editRow(row, col, value))}
                    />
                  </>
                ) : (
                  <div className="welcome">
                    <span className="welcome-icon">
                      <Database size={30} />
                    </span>
                    <h2>{translate(zh, 'm_9062c69d')}</h2>
                    <p>{translate(zh, 'm_714b6980')}</p>
                    <div className="quick-actions">
                      <Button onClick={() => addDraft('SELECT 1 AS ready;')}>
                        <FileCode2 size={17} />
                        {translate(zh, 'm_144bae72')}
                      </Button>
                      <Button disabled={!target.dataSourceId} onClick={() => void protect(() => ask(translate(zh, 'm_51da0288')))}>
                        <Sparkles size={17} />
                        {translate(zh, 'm_4f72585a')}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
            {panel === 'explain' && (
              <div className="analysis-panel">
                {explainRun ? (
                  <>
                    <h3>{translate(zh, 'm_965a49a7')}</h3>
                    <p className="muted">
                      {translate(zh, 'm_70cbaa69')} · {explainRun.receipt.executionId}
                    </p>
                    {explainRun.receipt.result.rows.map((row, i) => (
                      <pre key={i}>
                        {row
                          .map((value) => {
                            try {
                              return JSON.stringify(JSON.parse(String(value)), null, 2)
                            } catch {
                              return String(value ?? 'NULL')
                            }
                          })
                          .join('\n')}
                      </pre>
                    ))}
                  </>
                ) : (
                  <div className="empty">{translate(zh, 'm_16982e95')}</div>
                )}
              </div>
            )}
            {panel === 'structure' && (
              <div className="analysis-panel">
                {detail ? (
                  <>
                    <div className="section-title">
                      <h3>
                        <Table2 size={18} />
                        {detail.object.name}
                      </h3>
                      <Badge variant="outline">{detail.model ?? detail.object.kind}</Badge>
                      <span className="spacer" />
                      <Button onClick={() => readTable(detail.object)}>
                        <Play size={14} />
                        {translate(zh, 'm_6262d25d')}
                      </Button>
                      <Button disabled={!canTransfer || testMode} onClick={() => file.current?.click()}>
                        <ArrowUpFromLine size={14} />
                        {translate(zh, 'm_f0101b10')}
                      </Button>
                      <Button
                        disabled={!canChange}
                        onClick={() =>
                          addDraft(detail.definition, cleanTarget({ ...target, ...detail.object }), translate(zh, 'm_fc120e3c'))
                        }
                      >
                        {translate(zh, 'm_60bc7fec')}
                      </Button>
                    </div>
                    <Table className="structure-table">
                      <thead>
                        <tr>
                          <th>{translate(zh, 'm_8338bf55')}</th>
                          <th>{translate(zh, 'm_e1031f45')}</th>
                          <th>NULL</th>
                          <th>{translate(zh, 'm_c7215ac2')}</th>
                          <th>{translate(zh, 'm_16b93c4e')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.columns.map((column) => (
                          <tr key={column.id}>
                            <td>{column.name}</td>
                            <td>
                              <code>{column.dataType}</code>
                            </td>
                            <td>{column.nullable ? 'YES' : 'NO'}</td>
                            <td>{column.defaultValue ?? '—'}</td>
                            <td>
                              {detail.keys
                                .filter((key) => key.columns.includes(column.name))
                                .map((key) => key.kind)
                                .join(', ') || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                    <details>
                      <summary>{translate(zh, 'm_5b736095')}</summary>
                      <pre>{detail.definition}</pre>
                    </details>
                    {detail.diagnostics.map((reason) => (
                      <p className="muted" key={reason}>
                        {reason}
                      </p>
                    ))}
                    <div className="toolbar">
                      <Button
                        onClick={() =>
                          void protect(async () => {
                            const namespace = detail.object.schema ?? detail.object.database
                            const ref = [namespace, detail.object.name]
                              .filter(Boolean)
                              .map((value) => quoteDatabaseIdentifier(value!, engine))
                              .join('.')
                            addDraft(
                              `SELECT COUNT(*) AS sample_rows${detail.columns
                                .slice(0, 8)
                                .map(
                                  (column) =>
                                    `,\n  COUNT(${quoteDatabaseIdentifier(column.name, engine)}) AS ${quoteDatabaseIdentifier(
                                      column.name + '_non_null',
                                      engine
                                    )}`
                                )
                                .join('')}\nFROM (SELECT * FROM ${ref} LIMIT 1000) AS sample`,
                              cleanTarget(target),
                              translate(zh, 'm_5eea2f4a')
                            )
                          })
                        }
                      >
                        {translate(zh, 'm_8676852b')}
                      </Button>
                      <Button onClick={() => void protect(() => ask(translate(zh, 'm_e53b8625')))}>
                        <Sparkles size={14} />
                        {translate(zh, 'm_6e8043b1')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="empty">{translate(zh, 'm_35987484')}</div>
                )}
              </div>
            )}
            {panel === 'chart' && (
              <ChartPanel
                key={run?.receipt.executionId}
                result={result}
                initial={chartConfig}
                zh={zh}
                onSave={(config) => void protect(() => saveChart(config))}
              />
            )}
            {panel === 'dashboard' && <Dashboard zh={zh} />}
            {panel === 'pivot' && <PivotPanel result={result} zh={zh} />}
            {panel === 'er' && (
              <>
                <div className="toolbar">
                  <Button
                    disabled={!target.dataSourceId}
                    onClick={() =>
                      void protect(async () => {
                        setBusy(true)
                        try {
                          const details: DatabaseObjectDetail[] = []
                          for (const object of objects.slice(0, 50))
                            details.push(await requestItem('describe', { target: cleanTarget(target), object }))
                          setEr(details)
                        } finally {
                          setBusy(false)
                        }
                      })
                    }
                  >
                    <RefreshCw size={14} />
                    {translate(zh, 'm_eb91cb84')}
                  </Button>
                  <span className="muted">{translate(zh, 'm_423a17b1')}</span>
                </div>
                <ErPanel objects={er} zh={zh} />
              </>
            )}
            {panel === 'docs' && (
              <div className="analysis-panel">
                {detail ? (
                  <>
                    <div className="toolbar">
                      <Button onClick={() => download(`${detail.object.name}.md`, documentation(detail))}>
                        <ArrowDownToLine size={14} />
                        {translate(zh, 'm_4b059977')}
                      </Button>
                      <Button onClick={() => void protect(() => ask(translate(zh, 'm_c5f9ece6')))}>
                        <Sparkles size={14} />
                        {translate(zh, 'm_9951d568')}
                      </Button>
                    </div>
                    <pre>{documentation(detail)}</pre>
                  </>
                ) : (
                  <div className="empty">{translate(zh, 'm_fb3a1ca8')}</div>
                )}
              </div>
            )}
            {['execution', 'favorite', 'snapshot', 'plan', 'chart_saved'].includes(panel) && !(panel === 'plan' && plan) && (
              <div className="analysis-panel">
                <div className="section-title">
                  <h3>
                    {panel === 'execution'
                      ? translate(zh, 'm_93537e6d')
                      : panel === 'favorite'
                      ? translate(zh, 'm_7a9728cc')
                      : panel === 'snapshot'
                      ? translate(zh, 'm_a25928cd')
                      : panel === 'chart_saved'
                      ? translate(zh, 'm_392b1246')
                      : translate(zh, 'm_2dc6e570')}
                  </h3>
                  <span className="spacer" />
                  {panel === 'snapshot' && (
                    <Button
                      disabled={busy || !target.dataSourceId}
                      onClick={() =>
                        void protect(async () => {
                          setBusy(true)
                          try {
                            const queued = await action<SavedRecord>('snapshot', {
                              target: cleanTarget(target),
                              title: `${target.schema ?? target.database} · ${new Date().toLocaleString()}`,
                            })
                            setTask(queued)
                            setNotice(translate(zh, 'm_afa20c27'))
                          } finally {
                            setBusy(false)
                          }
                        })
                      }
                    >
                      <Plus size={14} />
                      {translate(zh, 'm_b62f5da1')}
                    </Button>
                  )}
                  {panel === 'favorite' && (
                    <Button
                      onClick={() =>
                        download(
                          'db-studio-favorites.json',
                          JSON.stringify(
                            list.map((item) => ({ title: item.title, ...item.summary })),
                            null,
                            2
                          )
                        )
                      }
                    >
                      {translate(zh, 'm_55279870')}
                    </Button>
                  )}
                </div>
                {panel === 'snapshot' && (
                  <div className="compare-controls">
                    <SelectField aria-label="Before snapshot" value={snapshotA} onChange={(event) => setSnapshotA(event.target.value)}>
                      <SelectOption value="">{translate(zh, 'm_2e6987e8')}</SelectOption>
                      {list.map((item) => (
                        <SelectOption value={item.id} key={item.id}>
                          {item.title}
                        </SelectOption>
                      ))}
                    </SelectField>
                    <ChevronRight size={16} />
                    <SelectField aria-label="After snapshot" value={snapshotB} onChange={(event) => setSnapshotB(event.target.value)}>
                      <SelectOption value="">{translate(zh, 'm_06f996be')}</SelectOption>
                      {list.map((item) => (
                        <SelectOption value={item.id} key={item.id}>
                          {item.title}
                        </SelectOption>
                      ))}
                    </SelectField>
                    <Button
                      disabled={!snapshotA || !snapshotB}
                      onClick={() =>
                        void protect(async () => {
                          const a = await requestItem<SavedRecord>('record', { id: snapshotA }),
                            b = await requestItem<SavedRecord>('record', { id: snapshotB })
                          const compared = compareSnapshots(JSON.parse(jsonContent(a)) as Snapshot, JSON.parse(jsonContent(b)) as Snapshot)
                          setComparison(compared.report + '\n\n' + compared.sql)
                        })
                      }
                    >
                      {translate(zh, 'm_f0749908')}
                    </Button>
                  </div>
                )}
                {comparison && panel === 'snapshot' && (
                  <>
                    <pre>{comparison}</pre>
                    <Button onClick={() => addDraft(comparison.split('\n\n').slice(1).join('\n\n'), target, translate(zh, 'm_3fcbd735'))}>
                      {translate(zh, 'm_ebb4bba1')}
                    </Button>
                  </>
                )}
                {list.map((item) => (
                  <Button
                    className="record-row"
                    key={item.id}
                    onClick={() =>
                      void protect(async () => {
                        const record = await requestItem<SavedRecord>('record', { id: item.id })
                        if (record.kind === 'plan') {
                          setPlan(record as Plan)
                          setPanel('plan')
                        } else if (record.kind === 'favorite')
                          addDraft(String(record.payload.content), record.payload.target as Target, record.title)
                        else if (record.kind === 'execution') {
                          const savedQuery = record.payload.query as Partial<Run['input']>
                          const query: Run['input'] = {
                            ...(savedQuery as Run['input']),
                            limit: Number.isFinite(Number(savedQuery.limit)) && Number(savedQuery.limit) > 0 ? Number(savedQuery.limit) : 100,
                            offset: Number.isFinite(Number(savedQuery.offset)) && Number(savedQuery.offset) >= 0 ? Number(savedQuery.offset) : 0,
                          }
                          addDraft(query.sql, cleanTarget(query), record.title)
                          if (record.payload.result)
                            setRun({
                              input: query,
                              receipt: {
                                executionId: record.id,
                                dataSourceId: query.dataSourceId,
                                result: record.payload.result as DatabaseResult,
                              },
                            })
                        } else if (record.kind === 'chart') {
                          const saved = JSON.parse(jsonContent(record)) as {
                            query: Run['input']
                            executionId: string
                            result: DatabaseResult
                            config: ChartConfig
                          }
                          setChartConfig(saved.config)
                          setRun({
                            input: saved.query,
                            receipt: {
                              executionId: saved.executionId,
                              dataSourceId: saved.query.dataSourceId,
                              result: saved.result,
                            },
                          })
                          setPanel('chart')
                        } else if (record.kind === 'snapshot') {
                          const snapshot = JSON.parse(jsonContent(record)) as Snapshot
                          setEr(snapshot.objects)
                          setPanel('er')
                        }
                      })
                    }
                  >
                    <strong
                      className="record-title"
                      title={sqlPreview(item) || item.title}
                    >
                      {sqlPreview(item) || item.title}
                    </strong>
                    <small className="record-meta">
                      {item.updatedAt ? `${formatRecordTime(item.updatedAt, zh)} · ` : ''}
                      {item.id.slice(0, 8)}
                    </small>
                    <Badge variant="outline">{statusLabel(item.status, zh)}</Badge>
                    <ChevronRight size={15} />
                  </Button>
                ))}
                {!list.length && <div className="empty">{translate(zh, 'm_a6fcc228')}</div>}
              </div>
            )}
            {panel === 'plan' && plan && (
              <div className="analysis-panel plan-review">
                <div className="section-title">
                  <Button
                    onClick={() => {
                      setPlan(null)
                      void protect(() => loadList('plan'))
                    }}
                  >
                    ‹
                  </Button>
                  <h3>{translate(zh, 'm_5f8bcec2')}</h3>
                  <Badge variant="outline">{plan.status}</Badge>
                </div>
                <p>{plan.payload.reason}</p>
                <dl>
                  <dt>{translate(zh, 'm_96ca9adf')}</dt>
                  <dd>{JSON.stringify(plan.payload.target)}</dd>
                  <dt>{translate(zh, 'm_35b8f612')}</dt>
                  <dd>{plan.payload.policyRevision}</dd>
                  <dt>{translate(zh, 'm_5ef490d7')}</dt>
                  <dd>{plan.payload.expiresAt}</dd>
                </dl>
                <pre>{plan.payload.sql ?? JSON.stringify(plan.payload, null, 2)}</pre>
                <small>{plan.payload.digest}</small>
                {(() => {
                  const remainingMs = Date.parse(plan.payload.expiresAt) - Date.now()
                  if (!Number.isFinite(remainingMs)) return null
                  return (
                    <p className={remainingMs > 0 ? 'muted' : 'plan-expired'}>
                      {remainingMs > 0
                        ? zh
                          ? `审批剩余时间约 ${Math.max(1, Math.ceil(remainingMs / 60000))} 分钟，过期后需重新生成计划`
                          : `Approval window: ~${Math.max(1, Math.ceil(remainingMs / 60000))} min left`
                        : zh
                        ? '该计划已过期：请在对话框重新发起变更指令生成新计划'
                        : 'This plan has expired. Ask the assistant for a new plan.'}
                    </p>
                  )
                })()}
                <div className="toolbar">
                  <Button
                    disabled={testMode || plan.status !== 'awaiting_approval'}
                    onClick={() =>
                      void protect(async () => {
                        try {
                          setPlan(await action('approve_plan', { id: plan.id, digest: plan.payload.digest, approve: false }))
                        } catch (error) {
                          throw planError(error, zh)
                        }
                      })
                    }
                  >
                    {translate(zh, 'm_39589b77')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={testMode || plan.status !== 'awaiting_approval'}
                    onClick={() =>
                      void protect(async () => {
                        try {
                          setPlan(await action('approve_plan', { id: plan.id, digest: plan.payload.digest, approve: true }))
                        } catch (error) {
                          throw planError(error, zh)
                        }
                      })
                    }
                  >
                    {translate(zh, 'm_9f7239b9')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={testMode || plan.status !== 'ready'}
                    onClick={() =>
                      void protect(async () => {
                        try {
                          const queued = await action<Plan>('execute_plan', { id: plan.id })
                          setPlan(queued)
                          setTask(queued)
                        } catch (error) {
                          throw planError(error, zh)
                        }
                      })
                    }
                  >
                    {translate(zh, 'm_70e140d6')}
                  </Button>
                </div>
                {plan.payload.receipt != null && <pre>{JSON.stringify(plan.payload.receipt, null, 2)}</pre>}
              </div>
            )}
          </div>
          <footer className="status-bar">
            <span className={busy ? 'working' : ''}>
              {busy ? translate(zh, 'm_a7b8a920') : ready ? translate(zh, 'm_7e9f0492') : translate(zh, 'm_3ef6ab94')}
            </span>
            <span>{notice || caps?.diagnostics.join(' · ')}</span>
            <span className="spacer" />
            <span>{connection?.name ?? 'DB Studio'}</span>
          </footer>
        </main>
      </div>
      <ControlInput
        hidden
        type="file"
        ref={file}
        accept=".csv,.json"
        onChange={(event) => {
          const uploaded = event.target.files?.[0]
          if (uploaded && detail)
            void protect(async () => {
              setPlan(
                await upload(
                  {
                    target: cleanTarget(target),
                    table: detail.object.name,
                    format: uploaded.name.toLowerCase().endsWith('.json') ? 'json' : 'csv',
                    operationId: uid(),
                  },
                  uploaded
                )
              )
              setPanel('plan')
            })
          event.target.value = ''
        }}
      />
      {showPolicy && policy && (
        <PolicyDialog
          policy={policy}
          setPolicy={setPolicy}
          objects={objects}
          testMode={testMode}
          zh={zh}
          onClose={() => setShowPolicy(false)}
          onSave={() =>
            void protect(async () => {
              setPolicy(await action('set_policy', { dataSourceId: target.dataSourceId, ...policy }))
              setNotice(translate(zh, 'm_25178a6c'))
            })
          }
        />
      )}
    </div>
  )
}
