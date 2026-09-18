import '@xpert-ai/plugin-shadcn-ui/style.css'
import { executeAction, installBridgeListener, invokeClientCommand, notify, post, reportResize, requestData } from './bridge'
import { injectStyles } from './styles'
import type { CaseView, ClauseView, ClauseType, HostContext, HumanDecision, RiskLevel, ViewData } from './types'
import { asBoolean, asNumber, asObject, asString, formatDateTime, truncate } from './utils'
import { React, ReactDOM } from './vendor'

const { useCallback, useEffect, useMemo, useState } = React

const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'

const CLAUSE_LABELS: Record<ClauseType, string> = {
  payment: '付款条件',
  delivery: '交付',
  warranty: '质保',
  liability: '违约责任'
}

const RISK_LABELS: Record<RiskLevel, string> = { high: '高风险', medium: '中风险', low: '低风险' }

const STATUS_LABELS: Record<string, string> = {
  draft: '待审查',
  extracting: 'AI 审查中',
  extracted: '待人工确认',
  confirmed: '已完成'
}

const DECISION_LABELS: Record<HumanDecision, string> = {
  pending: '待处理',
  confirmed: '已确认',
  edited: '已修改',
  rejected: '已驳回'
}

interface DraftDecision {
  decision: HumanDecision
  conclusion: string
  note: string
}

injectStyles()

function App() {
  const [context, setContext] = useState<HostContext | null>(null)

  useEffect(() => {
    const dispose = installBridgeListener({
      onInit: setContext,
      onHostEvent: () => window.__contractReviewReload?.()
    })
    post('ready')
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

  if (!context) {
    return (
      <main className="crx-shell">
        <div className="crx-empty">正在加载合同条款审查台…</div>
      </main>
    )
  }

  return <Workbench />
}

function Workbench() {
  const [data, setData] = useState<ViewData | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, DraftDecision>>({})
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (caseId?: string | null) => {
    try {
      const response = await requestData(caseId ? { parameters: { caseId } } : {})
      const payload = asObject(response.data) ?? asObject(response.result)
      if (!payload) return
      const view = normalizeViewData(payload)
      setData(view)
      setSelectedId((current) => {
        if (caseId) return caseId
        return current ?? view.selected?.id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    window.__contractReviewReload = () => void load(selectedId)
    void load(null)
    return () => {
      delete window.__contractReviewReload
    }
    // 只在挂载时拉一次；后续刷新由 hostEvent 与用户操作驱动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selected = useMemo(() => {
    if (!data?.selected) return null
    if (selectedId && data.selected.id !== selectedId) return null
    return data.selected
  }, [data, selectedId])

  const selectCase = async (caseId: string) => {
    setSelectedId(caseId)
    setDrafts({})
    setError(null)
    await load(caseId)
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const handleCreate = (input: { title: string; counterparty: string; contractText: string }) =>
    run(async () => {
      const response = await executeAction('create_case', null, input)
      const result = asObject(response.result)
      if (result && result.success === false) throw new Error(messageOf(result))
      notify('审查单已创建')
      setCreating(false)
      await load(null)
    })

  const handleExtraction = (caseId: string) =>
    run(async () => {
      const response = await executeAction('begin_extraction', caseId, { caseId })
      const result = asObject(response.result)
      if (result && result.success === false) throw new Error(messageOf(result))

      // 插件不直接调用模型：由宿主把这条消息发到当前会话，Agent 再回调插件工具写回条款。
      const clientCommand = asObject(asObject(result?.data)?.clientCommand)
      if (clientCommand) {
        const commandKey = asString(clientCommand.commandKey)
        const payload = asObject(clientCommand.payload)
        if (commandKey === ASSISTANT_CHAT_SEND_MESSAGE_COMMAND && payload) {
          await invokeClientCommand(commandKey, {
            ...payload,
            clientMessageId: `contract-review:${caseId}:${Date.now()}`
          })
          notify('已把审查请求发给 Agent，条款会边抽边写入')
        } else {
          throw new Error('宿主未接受发送指令')
        }
      }
      await load(caseId)
    })

  const handleSave = (caseId: string, clauses: ClauseView[], allowPartial: boolean) =>
    run(async () => {
      const decisions = clauses.map((clause) => {
        const draft = drafts[clause.id]
        return {
          clauseId: clause.id,
          decision: draft?.decision ?? clause.humanDecision,
          conclusion: draft?.conclusion ?? null,
          note: draft?.note ?? null
        }
      })
      const response = await executeAction('save_review', caseId, { caseId, decisions, allowPartial })
      const result = asObject(response.result)
      if (result && result.success === false) throw new Error(messageOf(result))
      const payload = asObject(result?.data)
      const saved = asBoolean(payload?.saved, true)
      if (!saved) {
        setError(asString(payload?.message, '还有条款未处置'))
        await load(caseId)
        return
      }
      notify(asString(payload?.message, '审查结论已保存'))
      setDrafts({})
      await load(caseId)
    })

  const handleDelete = (caseId: string) =>
    run(async () => {
      const response = await executeAction('delete_case', caseId, { caseId })
      const result = asObject(response.result)
      if (result && result.success === false) throw new Error(messageOf(result))
      notify('审查单已删除')
      setSelectedId(null)
      setDrafts({})
      await load(null)
    })

  const cases = data?.list.items ?? []

  return (
    <div className="crx-shell">
      <aside className="crx-sidebar">
        <div className="crx-sidebar-head">
          <div className="crx-sidebar-title">
            <span>合同审查单</span>
            <button className="crx-btn crx-btn-sm" disabled={busy} onClick={() => setCreating(true)}>
              新建审查
            </button>
          </div>
        </div>
        <div className="crx-list">
          {cases.length === 0 && <div className="crx-empty">还没有审查单。点「新建审查」粘贴一份合同开始。</div>}
          {cases.map((item) => (
            <div
              key={item.id}
              className={`crx-item ${item.id === selectedId ? 'crx-item-active' : ''}`}
              onClick={() => void selectCase(item.id)}
            >
              <div className="crx-item-title">{item.title}</div>
              <div className="crx-item-meta">
                <StatusBadge status={item.status} />
                <span>
                  已确认 {item.clauseCount - item.pendingCount}/{item.clauseCount}
                </span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section className="crx-main">
        {error && (
          <div style={{ padding: '12px 18px 0' }}>
            <div className="crx-banner crx-banner-error">{error}</div>
          </div>
        )}

        {!selected ? (
          <div className="crx-empty">
            {cases.length ? '从左侧选择一张审查单查看结论。' : '粘贴一份合同，让 AI 先抽出四类关键条款，再由你逐条确认。'}
          </div>
        ) : (
          <>
            <header className="crx-main-head">
              <h2 className="crx-main-title">{selected.title}</h2>
              <div className="crx-main-sub">
                <StatusBadge status={selected.status} />
                {selected.counterparty && <span>相对方：{selected.counterparty}</span>}
                <span>审查尝试 {selected.extractionAttempts} 次</span>
                {selected.lastExtractionAt && <span>上次：{formatDateTime(selected.lastExtractionAt)}</span>}
                {selected.confirmedAt && <span>落库：{formatDateTime(selected.confirmedAt)}</span>}
              </div>
              <div className="crx-toolbar" style={{ marginTop: 10 }}>
                <button className="crx-btn crx-btn-primary" disabled={busy} onClick={() => void handleExtraction(selected.id)}>
                  {busy && <span className="crx-spin" />}
                  {selected.extractionAttempts > 0 ? '重试 AI 审查' : '让 Agent 审查'}
                </button>
                <button className="crx-btn" disabled={busy} onClick={() => void load(selected.id)}>
                  刷新
                </button>
                <button className="crx-btn" disabled={busy} onClick={() => void handleDelete(selected.id)}>
                  删除审查单
                </button>
              </div>
            </header>

            <div className="crx-body">
              {selected.lastExtractionError && (
                <div className="crx-banner crx-banner-error">
                  本轮 AI 审查未成功：{selected.lastExtractionError}
                  <br />
                  合同正文与已登记的条款都还在，直接点「重试 AI 审查」即可。
                </div>
              )}

              {selected.status === 'extracting' && (
                <div className="crx-banner crx-banner-info">
                  Agent 正在阅读合同并逐条登记，条款出现后会自动刷新。若长时间无变化，可点「刷新」。
                </div>
              )}

              {!selected.clauses?.length ? (
                <div className="crx-empty">
                  AI 还没有登记任何条款。
                  <br />
                  点上方「让 Agent 审查」，它会读取合同全文并抽出付款、交付、质保、违约四类条款。
                </div>
              ) : (
                selected.clauses.map((clause) => (
                  <ClauseCard
                    key={clause.id}
                    clause={clause}
                    disabled={busy}
                    draft={drafts[clause.id]}
                    onChange={(next) => setDrafts((current) => ({ ...current, [clause.id]: next }))}
                  />
                ))
              )}

              <details>
                <summary style={{ cursor: 'pointer', color: 'var(--crx-muted)', fontSize: 12 }}>查看合同原文</summary>
                <div className="crx-quote" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
                  {selected.contractText}
                </div>
              </details>
            </div>

            <footer className="crx-footer">
              <div className="crx-progress">
                {(() => {
                  const stats = computeStats(selected.clauses ?? [], drafts)
                  return (
                    <>
                      共 <b>{stats.total}</b> 条 · 已确认 <b>{stats.confirmed}</b> · 已修改 <b>{stats.edited}</b> · 已驳回{' '}
                      <b>{stats.rejected}</b> · 待处理 <b style={{ color: stats.pending ? 'var(--crx-high)' : undefined }}>{stats.pending}</b>
                    </>
                  )
                })()}
              </div>
              <button
                className="crx-btn crx-btn-primary"
                disabled={busy || !selected.clauses?.length}
                onClick={() => void handleSave(selected.id, selected.clauses ?? [], false)}
              >
                保存审查结论
              </button>
            </footer>
          </>
        )}
      </section>

      {creating && <CreateCaseDialog onCancel={() => setCreating(false)} onSubmit={handleCreate} busy={busy} />}
    </div>
  )
}

function ClauseCard({
  clause,
  draft,
  disabled,
  onChange
}: {
  clause: ClauseView
  draft?: DraftDecision
  disabled: boolean
  onChange: (next: DraftDecision) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const current = draft ?? {
    decision: clause.humanDecision,
    conclusion: clause.humanConclusion ?? '',
    note: clause.humanNote ?? ''
  }
  const decided = current.decision !== 'pending'

  const set = (patch: Partial<DraftDecision>) => onChange({ ...current, ...patch })

  return (
    <article className="crx-clause">
      <div className="crx-clause-head">
        <div className="crx-clause-name">
          {CLAUSE_LABELS[clause.clauseType] ?? clause.clauseType}
          <span className={`crx-badge crx-badge-${clause.aiRiskLevel}`} style={{ marginLeft: 8 }}>
            AI 判定：{RISK_LABELS[clause.aiRiskLevel] ?? clause.aiRiskLevel}
          </span>
        </div>
        <span className={`crx-badge ${decided ? 'crx-badge-ok' : 'crx-badge-neutral'}`}>
          {DECISION_LABELS[current.decision]}
        </span>
      </div>

      <div className="crx-clause-body">
        <div className="crx-section-label">合同原文摘录</div>
        <div className="crx-quote">{expanded ? clause.excerpt : truncate(clause.excerpt, 160)}</div>
        {clause.excerpt.length > 160 && (
          <button className="crx-btn crx-btn-sm" style={{ marginBottom: 12 }} onClick={() => setExpanded(!expanded)}>
            {expanded ? '收起原文' : '展开原文'}
          </button>
        )}

        <div className="crx-section-label">AI 建议（供参考，不构成结论）</div>
        <div className="crx-ai">
          <div>{clause.aiConclusion ?? '—'}</div>
          {clause.aiReason && <div className="crx-ai-reason">风险理由：{clause.aiReason}</div>}
        </div>

        <div className="crx-human">
          <div className="crx-section-label">人工确认</div>
          <div className="crx-row">
            {(['confirmed', 'edited', 'rejected'] as HumanDecision[]).map((option) => (
              <button
                key={option}
                className={`crx-btn crx-btn-sm ${current.decision === option ? 'crx-decision-active' : ''}`}
                disabled={disabled}
                onClick={() => set({ decision: option })}
              >
                {option === 'confirmed' ? '确认' : option === 'edited' ? '修改' : '驳回'}
              </button>
            ))}
            {decided && (
              <button className="crx-btn crx-btn-sm" disabled={disabled} onClick={() => set({ decision: 'pending' })}>
                撤销
              </button>
            )}
          </div>

          {current.decision === 'edited' && (
            <div className="crx-field">
              <div className="crx-section-label">修改后的结论</div>
              <textarea
                className="crx-textarea"
                value={current.conclusion}
                placeholder="写下你认可的结论，落库时以这段为准"
                onChange={(event) => set({ conclusion: event.target.value })}
              />
            </div>
          )}

          <div className="crx-field">
            <div className="crx-section-label">备注（可选）</div>
            <input
              className="crx-input"
              value={current.note}
              placeholder="例如：已与法务确认，账期可接受"
              onChange={(event) => set({ note: event.target.value })}
            />
          </div>
        </div>
      </div>
    </article>
  )
}

function CreateCaseDialog({
  onCancel,
  onSubmit,
  busy
}: {
  onCancel: () => void
  onSubmit: (input: { title: string; counterparty: string; contractText: string }) => void
  busy: boolean
}) {
  const [title, setTitle] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [contractText, setContractText] = useState('')
  const valid = title.trim().length > 0 && contractText.trim().length > 0

  return (
    <div className="crx-modal-mask" onClick={onCancel}>
      <div className="crx-modal" onClick={(event) => event.stopPropagation()}>
        <h3>新建合同审查单</h3>
        <div className="crx-field">
          <div className="crx-section-label">合同名称</div>
          <input
            className="crx-input"
            value={title}
            placeholder="例如：XX 项目设备采购合同"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="crx-field">
          <div className="crx-section-label">相对方（可选）</div>
          <input
            className="crx-input"
            value={counterparty}
            placeholder="例如：某某科技有限公司"
            onChange={(event) => setCounterparty(event.target.value)}
          />
        </div>
        <div className="crx-field">
          <div className="crx-section-label">合同正文（粘贴全文）</div>
          <textarea
            className="crx-textarea"
            style={{ minHeight: 220 }}
            value={contractText}
            placeholder="把合同正文整段粘贴到这里。正文越完整，AI 抽取的四类条款越可靠。"
            onChange={(event) => setContractText(event.target.value)}
          />
          <div className="crx-item-meta" style={{ marginTop: 4 }}>
            已输入 {contractText.trim().length} 字
          </div>
        </div>
        <div className="crx-modal-actions">
          <button className="crx-btn" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            className="crx-btn crx-btn-primary"
            disabled={!valid || busy}
            onClick={() => onSubmit({ title, counterparty, contractText })}
          >
            创建审查单
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'confirmed'
      ? 'crx-badge-ok'
      : status === 'extracted'
        ? 'crx-badge-info'
        : status === 'extracting'
          ? 'crx-badge-medium'
          : 'crx-badge-neutral'
  return <span className={`crx-badge ${tone}`}>{STATUS_LABELS[status] ?? status}</span>
}

function computeStats(clauses: ClauseView[], drafts: Record<string, DraftDecision>) {
  const stats = { total: clauses.length, pending: 0, confirmed: 0, edited: 0, rejected: 0 }
  for (const clause of clauses) {
    const decision = drafts[clause.id]?.decision ?? clause.humanDecision
    if (decision === 'pending') stats.pending += 1
    else if (decision === 'confirmed') stats.confirmed += 1
    else if (decision === 'edited') stats.edited += 1
    else if (decision === 'rejected') stats.rejected += 1
  }
  return stats
}

function messageOf(result: Record<string, unknown>): string {
  const message = asObject(result.message)
  return asString(message?.zh_Hans) || asString(message?.en_US) || '操作失败'
}

/** 宿主信封：items = 左栏列表，item = 当前选中的审查单（含 clauses），summary 带分页信息 */
function normalizeViewData(payload: Record<string, unknown>): ViewData {
  const selected = asObject(payload.item)
  const summary = asObject(payload.summary)
  const items = Array.isArray(payload.items) ? (payload.items as unknown[]) : []
  return {
    selected: selected ? normalizeCase(selected) : null,
    list: {
      items: items.map((item) => normalizeCase(asObject(item) ?? {})),
      total: asNumber(payload.total, items.length),
      page: asNumber(summary?.page, 1),
      pageSize: asNumber(summary?.pageSize, 25)
    }
  }
}

function normalizeCase(raw: Record<string, unknown>): CaseView {
  const clauses = Array.isArray(raw.clauses) ? (raw.clauses as unknown[]) : []
  return {
    id: asString(raw.id),
    title: asString(raw.title),
    counterparty: (raw.counterparty as string | null) ?? null,
    contractText: asString(raw.contractText),
    status: asString(raw.status, 'draft') as CaseView['status'],
    extractionAttempts: asNumber(raw.extractionAttempts, 0),
    lastExtractionAt: (raw.lastExtractionAt as string | null) ?? null,
    lastExtractionError: (raw.lastExtractionError as string | null) ?? null,
    confirmedAt: (raw.confirmedAt as string | null) ?? null,
    createdAt: (raw.createdAt as string | null) ?? null,
    updatedAt: (raw.updatedAt as string | null) ?? null,
    clauseCount: asNumber(raw.clauseCount, clauses.length),
    pendingCount: asNumber(raw.pendingCount, 0),
    clauses: clauses.map((item) => normalizeClause(asObject(item) ?? {}))
  }
}

function normalizeClause(raw: Record<string, unknown>): ClauseView {
  return {
    id: asString(raw.id),
    caseId: asString(raw.caseId),
    sequence: asNumber(raw.sequence, 0),
    clauseType: asString(raw.clauseType, 'payment') as ClauseType,
    excerpt: asString(raw.excerpt),
    aiConclusion: (raw.aiConclusion as string | null) ?? null,
    aiRiskLevel: asString(raw.aiRiskLevel, 'medium') as RiskLevel,
    aiReason: (raw.aiReason as string | null) ?? null,
    humanDecision: asString(raw.humanDecision, 'pending') as HumanDecision,
    humanConclusion: (raw.humanConclusion as string | null) ?? null,
    humanNote: (raw.humanNote as string | null) ?? null,
    decidedAt: (raw.decidedAt as string | null) ?? null
  }
}

declare global {
  interface Window {
    __contractReviewReload?: () => void
  }
}

const rootElement = document.getElementById('root')
const root = ReactDOM.createRoot ? ReactDOM.createRoot(rootElement) : null
if (root) {
  root.render(<App />)
} else {
  ReactDOM.render?.(<App />, rootElement)
}
