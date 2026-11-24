import { Badge, Button, Input, Textarea } from '@xpert-ai/plugin-shadcn-ui'
import { React } from './vendor'
import { executeAction, notify, requestData } from './bridge'
import type {
  BridgeMessage,
  HostContext,
  PickupLog,
  PickupRequest,
  PickupRole,
  PickupStatus,
  PickupViewData,
  VehicleSnapshot
} from './types'

const { useCallback, useEffect, useMemo, useRef, useState } = React

const STATUS_LABELS: Record<PickupStatus, string> = {
  applied: '已申请',
  approved: '已审批',
  rejected: '已驳回',
  cancelled: '已取消',
  executed: '已执行'
}

const ROLE_LABELS: Record<PickupRole, string> = {
  store: '店端',
  approver: '审批人',
  carrier: '承运商'
}

const ACTION_LABELS: Record<string, string> = {
  created: '创建申请',
  approved: '审批通过',
  rejected: '人工驳回',
  system_rejected: '系统驳回',
  cancelled: '取消申请',
  execution_failed: '执行失败',
  executed: '执行成功'
}

export function VehiclePickupWorkbench({ context }: { context: HostContext }) {
  const [data, setData] = useState<PickupViewData | null>(null)
  const [role, setRole] = useState<PickupRole>('store')
  const [status, setStatus] = useState<PickupStatus | 'all'>('all')
  const [searchDraft, setSearchDraft] = useState(context.initialQuery?.search ?? '')
  const [search, setSearch] = useState(context.initialQuery?.search ?? '')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [reasonMode, setReasonMode] = useState<'reject' | 'cancel' | null>(null)
  const [reason, setReason] = useState('')
  const selectedRef = useRef<string | null>(null)

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  const loadData = useCallback(
    async (options?: { role?: PickupRole; status?: PickupStatus | 'all'; search?: string; requestId?: string }) => {
      setBusy(true)
      try {
        const nextRole = options?.role ?? role
        const nextStatus = options?.status ?? status
        const nextSearch = options?.search ?? search
        const requestId =
          options && Object.prototype.hasOwnProperty.call(options, 'requestId')
            ? options.requestId
            : selectedRef.current ?? undefined
        const response = await requestData({
          search: nextSearch || undefined,
          parameters: {
            role: nextRole,
            status: nextStatus === 'all' ? undefined : nextStatus,
            requestId: requestId || undefined
          }
        })
        const next = normalizeData(unwrap(response))
        setData(next)
        setRole(next.viewer.role)
        const nextSelectedId =
          next.selectedRequest?.id ??
          next.requests.find((request) => request.id === requestId)?.id ??
          next.requests[0]?.id ??
          null
        setSelectedId(nextSelectedId)
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '申请加载失败')
      } finally {
        setBusy(false)
      }
    },
    [role, search, status]
  )

  useEffect(() => {
    window.__vehiclePickupReload = () => loadData()
    void loadData()
    return () => {
      delete window.__vehiclePickupReload
    }
  }, [])

  const selected = useMemo(
    () => data?.requests.find((request) => request.id === selectedId) ?? data?.selectedRequest ?? null,
    [data, selectedId]
  )

  async function switchRole(nextRole: PickupRole) {
    if (nextRole === role) return
    setRole(nextRole)
    setSelectedId(null)
    selectedRef.current = null
    setReasonMode(null)
    await loadData({ role: nextRole, requestId: undefined })
  }

  async function refresh() {
    await loadData({ requestId: selected?.id })
  }

  async function runAction(actionKey: string, input: Record<string, unknown> = {}) {
    if (!selected) return
    setBusy(true)
    try {
      const response = await executeAction(actionKey, selected.id, {
        ...input,
        role,
        version: selected.version
      })
      const result = unwrap(response) as { success?: boolean; message?: unknown } | null
      const message = messageText(result?.message)
      if (message) notify(message, result?.success === false ? 'warning' : 'success')
      setReasonMode(null)
      setReason('')
      await loadData({ requestId: selected.id })
    } catch (error) {
      notify(error instanceof Error ? error.message : '操作失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function selectRequest(request: PickupRequest) {
    setSelectedId(request.id)
    setReasonMode(null)
    await loadData({ requestId: request.id })
  }

  if (!data) {
    return <main className="vp-shell vp-loading">{busy ? '正在载入自提申请…' : notice || '暂无数据'}</main>
  }

  return (
    <main className="vp-shell">
      <header className="vp-header">
        <div className="vp-title">
          <span className="vp-mark">VP</span>
          <div>
            <h1>车辆自提</h1>
            <p>对话创建 · 统一审批 · 模拟运输执行</p>
          </div>
        </div>
        {data.viewer.canSwitchRole ? (
          <div className="vp-role-switch" aria-label="演示角色">
            <span>演示角色</span>
            {data.viewer.availableRoles.map((item) => (
              <Button
                key={item}
                className={`vp-role-button ${role === item ? 'is-active' : ''}`}
                variant="outline"
                size="sm"
                onClick={() => void switchRole(item)}
              >
                {ROLE_LABELS[item]}
              </Button>
            ))}
          </div>
        ) : (
          <Badge>{ROLE_LABELS[data.viewer.role]}</Badge>
        )}
      </header>

      <div className="vp-body">
        <aside className="vp-sidebar">
          <div className="vp-tools">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
              <Input
                className="vp-search"
                value={searchDraft}
                placeholder="搜索申请号或车架号"
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setSearch(searchDraft)
                    selectedRef.current = null
                    setSelectedId(null)
                    void loadData({ search: searchDraft, requestId: undefined })
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch(searchDraft)
                  selectedRef.current = null
                  setSelectedId(null)
                  void loadData({ search: searchDraft, requestId: undefined })
                }}
              >
                搜索
              </Button>
            </div>
            <div className="vp-filters">
              <Button
                className={`vp-filter ${status === 'all' ? 'is-active' : ''}`}
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatus('all')
                  selectedRef.current = null
                  setSelectedId(null)
                  void loadData({ status: 'all', requestId: undefined })
                }}
              >
                全部
              </Button>
              {data.statusOptions.map((item) => (
                <Button
                  key={item.value}
                  className={`vp-filter ${status === item.value ? 'is-active' : ''}`}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStatus(item.value)
                    selectedRef.current = null
                    setSelectedId(null)
                    void loadData({ status: item.value, requestId: undefined })
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="vp-list" aria-busy={busy}>
            {data.requests.length ? (
              data.requests.map((request) => (
                <button
                  key={request.id}
                  className={`vp-list-item ${selected?.id === request.id ? 'is-selected' : ''}`}
                  onClick={() => void selectRequest(request)}
                >
                  <span className="vp-list-top">
                    <strong>{request.requestNo}</strong>
                    <StatusBadge status={request.status} />
                  </span>
                  <span className="vp-list-meta">
                    <span>{request.vehicles.map((vehicle) => vehicle.vehicleNo).join(' · ')}</span>
                    <span>{formatDate(request.createdAt)}</span>
                  </span>
                </button>
              ))
            ) : (
              <div className="vp-empty">没有符合条件的自提申请</div>
            )}
          </div>
        </aside>

        <section className="vp-detail">
          {!selected ? (
            <div className="vp-empty">从左侧选择一份自提申请</div>
          ) : (
            <>
              <div className="vp-detail-head">
                <div className="vp-detail-title">
                  <strong>{selected.requestNo}</strong>
                  <p>
                    {selected.storeId} · 创建人{' '}
                    {selected.applicantName && selected.applicantName !== selected.applicantId
                      ? selected.applicantName
                      : '门店用户'}{' '}
                    · {formatDateTime(selected.createdAt)}
                  </p>
                </div>
                <div className="vp-actions">
                  <StatusBadge status={selected.status} />
                  {role === 'approver' && selected.status === 'applied' ? (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => void runAction('approve')}>
                        审批通过
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => openReason('reject')}>
                        驳回
                      </Button>
                    </>
                  ) : null}
                  {role === 'approver' && (selected.status === 'applied' || selected.status === 'approved') ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => openReason('cancel')}>
                      取消申请
                    </Button>
                  ) : null}
                  {role === 'carrier' && selected.status === 'approved' ? (
                    <Button size="sm" disabled={busy} onClick={() => void runAction('execute')}>
                      模拟执行
                    </Button>
                  ) : null}
                </div>
              </div>

              {notice ? <div className="vp-notice" style={{ marginTop: 12 }}>{notice}</div> : null}

              {reasonMode ? (
                <div className="vp-section">
                  <div className="vp-reason">
                    <strong>{reasonMode === 'reject' ? '填写驳回理由' : '填写取消原因'}</strong>
                    <Textarea
                      value={reason}
                      placeholder={reasonMode === 'reject' ? '例如：车辆信息与门店申请不一致' : '例如：审批后发现车辆暂不可提'}
                      onChange={(event) => setReason(event.target.value)}
                    />
                    <div className="vp-reason-actions">
                      <Button variant="ghost" size="sm" onClick={() => setReasonMode(null)}>
                        返回
                      </Button>
                      <Button
                        size="sm"
                        variant={reasonMode === 'reject' ? 'destructive' : 'default'}
                        disabled={busy || !reason.trim()}
                        onClick={() =>
                          void runAction(reasonMode === 'reject' ? 'reject' : 'cancel', { reason })
                        }
                      >
                        确认{reasonMode === 'reject' ? '驳回' : '取消'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="vp-section">
                <div className="vp-section-title">
                  <h2>申请摘要</h2>
                  <span>版本 {selected.version}</span>
                </div>
                <div className="vp-grid">
                  <Metric label="门店" value={selected.storeId} />
                  <Metric label="车辆数量" value={`${selected.vehicles.length} 台`} />
                  <Metric label="申请时间" value={formatDateTime(selected.createdAt)} />
                  <Metric label="状态" value={STATUS_LABELS[selected.status]} />
                </div>
              </div>

              <div className="vp-section">
                <div className="vp-section-title">
                  <h2>车辆明细</h2>
                  <span>{selected.vehicles.filter((vehicle) => vehicle.eligible).length} 台当前可取</span>
                </div>
                <div className="vp-vehicles-wrap">
                  <table className="vp-vehicles">
                    <thead>
                      <tr>
                        <th>车架号</th>
                        <th>车型</th>
                        <th>门店</th>
                        <th>创建时车辆状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.vehicles.map((vehicle) => (
                        <tr key={vehicle.vehicleNo}>
                          <td className="vp-vehicle-no">{vehicle.vehicleNo}</td>
                          <td>{vehicle.model}</td>
                          <td>{vehicle.storeId}</td>
                          <td>{vehicleStatusLabel(vehicle.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {selected.validationSnapshot?.errors?.length ? (
                  <div className="vp-issue">
                    {selected.validationSnapshot.errors.map((error, index) => (
                      <div key={`${error.code}-${index}`}>
                        {error.vehicleNo ? `${error.vehicleNo}：` : ''}
                        {error.message}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {selected.approvalReason ? (
                <div className="vp-section">
                  <div className="vp-section-title">
                    <h2>审批结果</h2>
                    {selected.rejectionSource === 'system' ? <Badge variant="destructive">系统驳回</Badge> : null}
                  </div>
                  <div className={selected.status === 'rejected' ? 'vp-issue' : 'vp-notice'}>
                    {selected.approvalReason}
                  </div>
                </div>
              ) : null}

              {selected.cancelReason ? (
                <div className="vp-section">
                  <div className="vp-section-title"><h2>取消原因</h2></div>
                  <div className="vp-notice">{selected.cancelReason}</div>
                </div>
              ) : null}

              {selected.executionFailureReason ? (
                <div className="vp-section">
                  <div className="vp-section-title">
                    <h2>运输执行</h2>
                    <span>尝试 {selected.executionAttempts} 次</span>
                  </div>
                  <div className="vp-issue">{selected.executionFailureReason}</div>
                </div>
              ) : null}

              {data.demo.vehicleIssueSimulationEnabled && selected.vehicles[0] ? (
                <div className="vp-section">
                  <div className="vp-section-title">
                    <h2>演示工具</h2>
                    <span>仅用于验证审批前复校验</span>
                  </div>
                  <div className="vp-demo">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void runAction('simulate_vehicle_issue', {
                          vehicleNo: selected.vehicles[0].vehicleNo,
                          vehicleStatus: 'customs_locked'
                        })
                      }
                    >
                      模拟海关锁
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void runAction('simulate_vehicle_issue', {
                          vehicleNo: selected.vehicles[0].vehicleNo,
                          vehicleStatus: 'under_maintenance'
                        })
                      }
                    >
                      模拟维护中
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="vp-section">
                <div className="vp-section-title">
                  <h2>操作记录</h2>
                  <span>{selected.logs?.length ?? 0} 条</span>
                </div>
                <div className="vp-log">
                  {(selected.logs ?? []).map((log) => (
                    <LogRow key={log.id} log={log} />
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )

  function openReason(mode: 'reject' | 'cancel') {
    setReasonMode(mode)
    setReason('')
  }
}

function StatusBadge({ status }: { status: PickupStatus }) {
  return <span className={`vp-status ${status}`}>{STATUS_LABELS[status]}</span>
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="vp-metric">
      <label>{label}</label>
      <strong title={value}>{value}</strong>
    </div>
  )
}

function LogRow({ log }: { log: PickupLog }) {
  const action = ACTION_LABELS[log.action] || log.action
  const details = [
    log.fromStatus && log.toStatus && log.fromStatus !== log.toStatus
      ? `${STATUS_LABELS[log.fromStatus]} → ${STATUS_LABELS[log.toStatus]}`
      : '',
    log.reason || ''
  ].filter(Boolean)
  return (
    <div className="vp-log-item">
      <span className="vp-log-time">{formatDateTime(log.createdAt)}</span>
      <span className="vp-log-content">
        <strong>{action}</strong>
        {details.length ? <span>{details.join(' · ')}</span> : null}
      </span>
    </div>
  )
}

function unwrap(response: BridgeMessage | unknown): unknown {
  if (!response || typeof response !== 'object') return null
  const value = response as BridgeMessage & Record<string, unknown>
  if ('data' in value) return value.data
  if ('result' in value) return value.result
  return value
}

function normalizeData(raw: unknown): PickupViewData {
  const value = raw && typeof raw === 'object' ? (raw as Partial<PickupViewData>) : {}
  const viewer = value.viewer ?? {
    role: 'store' as const,
    canSwitchRole: false,
    availableRoles: ['store' as const]
  }
  return {
    viewer,
    requests: Array.isArray(value.requests) ? value.requests : [],
    selectedRequest: value.selectedRequest ?? null,
    total: typeof value.total === 'number' ? value.total : 0,
    statusOptions: Array.isArray(value.statusOptions) ? value.statusOptions : [],
    demo: value.demo ?? {
      executionFailureEnabled: false,
      vehicleIssueSimulationEnabled: false
    }
  }
}

function messageText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const message = value as Record<string, unknown>
  return String(message.zh_Hans ?? message.zhHans ?? message.en_US ?? '')
}

function formatDate(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date(value))
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function vehicleStatusLabel(status: string) {
  return (
    {
      available: '可自提',
      customs_locked: '海关锁',
      under_maintenance: '维护中',
      sold: '已售出'
    }[status] || status
  )
}
