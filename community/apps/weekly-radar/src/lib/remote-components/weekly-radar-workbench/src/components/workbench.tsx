import { executeAction, notify, requestData } from '../bridge'
import { TEXT } from '../i18n'
import type {
  HostContext,
  Locale,
  RadarData,
  RadarEntry,
  RadarEntryStatus,
  RadarRisk,
  RadarWeekly
} from '../types'
import { buildQuery, createOperationId, formatDate, getInitialWeekKey, normalizeRadarData, unwrap } from '../utils'
import { React } from '../vendor'

const { useCallback, useEffect, useMemo, useState } = React

const STATUS_ORDER: RadarEntryStatus[] = [
  'planned',
  'in_progress',
  'blocked',
  'pending_confirm',
  'ai_failed',
  'done'
]

const STATUS_DOT: Record<RadarEntryStatus, string> = {
  planned: '#9ca3af',
  in_progress: '#2563eb',
  blocked: '#dc2626',
  pending_confirm: '#d97706',
  ai_failed: '#b91c1c',
  done: '#059669'
}

const LEVEL_COLOR: Record<string, string> = {
  high: '#dc2626',
  medium: '#d97706',
  low: '#64748b'
}

export function WeeklyRadarWorkbench({ context }: { context: HostContext }) {
  const locale: Locale = context.locale === 'en_US' ? 'en_US' : 'zh_Hans'
  const t = TEXT[locale]

  const [weekKey, setWeekKey] = useState(getInitialWeekKey(context))
  const [search, setSearch] = useState('')
  const [data, setData] = useState<RadarData | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftOwner, setDraftOwner] = useState('')
  const [draftDueDate, setDraftDueDate] = useState('')
  const [draftStatus, setDraftStatus] = useState<RadarEntryStatus>('in_progress')

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setBusy(true)
      try {
        const response = await requestData(buildQuery(context, weekKey, search))
        const next = normalizeRadarData(unwrap(response))
        setData(next)
        if (!weekKey && next.weekKey) setWeekKey(next.weekKey)
        setNotice('')
      } catch {
        setNotice(t.loadFailed)
      } finally {
        if (!options?.silent) setBusy(false)
      }
    },
    [context, search, t.loadFailed, weekKey]
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    window.__radarReload = () => load({ silent: true })
    return () => {
      window.__radarReload = undefined
    }
  }, [load])

  const metrics = data?.metrics ?? null
  const risks = useMemo(() => data?.risks ?? [], [data])
  const weekly = data?.weekly ?? null

  const runAction = async (actionKey: string, input: Record<string, unknown>, targetId?: string) => {
    setBusy(true)
    try {
      await executeAction(actionKey, targetId ?? null, input)
      notify(t.saving === '' ? '' : '已保存')
      await load({ silent: true })
      setNotice('')
    } catch {
      setNotice(t.actionFailed)
      notify(t.actionFailed, 'error')
    } finally {
      setBusy(false)
    }
  }

  const createEntry = async () => {
    const title = draftTitle.trim()
    if (!title) {
      setNotice(t.entryTitlePlaceholder)
      return
    }
    await runAction(
      'create_entry',
      {
        title,
        owner: draftOwner.trim() || undefined,
        dueDate: draftDueDate || undefined,
        status: draftStatus,
        weekKey: weekKey || undefined,
        operationId: createOperationId()
      }
    )
    setDraftTitle('')
    setDraftOwner('')
    setDraftDueDate('')
  }

  const updateStatus = async (entry: RadarEntry, status: RadarEntryStatus) => {
    if (status === entry.status) return
    await runAction('update_entry', { status }, entry.id)
  }

  if (!data) {
    return (
      <main className="radar-shell">
        <div className="radar-loading">{t.loading}</div>
      </main>
    )
  }

  return (
    <main className="radar-shell">
      <header className="radar-header">
        <div className="radar-title">
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="radar-header-actions">
          <label className="radar-header-actions">
            <span style={{ fontSize: 12, color: '#6b7280' }}>{t.week}</span>
            <input
              className="radar-input"
              value={weekKey}
              placeholder="2026-W45"
              onChange={(event: { target: { value: string } }) => setWeekKey(event.target.value)}
            />
          </label>
          <input
            className="radar-input"
            value={search}
            placeholder={t.entries}
            onChange={(event: { target: { value: string } }) => setSearch(event.target.value)}
          />
          <button className="radar-button" disabled={busy} onClick={() => load()}>
            {t.refresh}
          </button>
        </div>
      </header>

      {notice ? <div className="radar-notice">{notice}</div> : null}

      <section className="radar-metrics">
        <div className="radar-metric">
          <span>{t.total}</span>
          <strong>{metrics?.total ?? 0}</strong>
        </div>
        <div className="radar-metric">
          <span>{t.open}</span>
          <strong>{metrics?.openEntries ?? 0}</strong>
        </div>
        <div className="radar-metric">
          <span>{t.riskCount}</span>
          <strong>{metrics?.riskCount ?? 0}</strong>
        </div>
        <div className="radar-metric is-high">
          <span>{t.highRisk}</span>
          <strong>{metrics?.highRiskCount ?? 0}</strong>
        </div>
      </section>

      <section className="radar-columns">
        <div className="radar-panel">
          <h2>
            {t.entries}
            <small>{data.total}</small>
          </h2>
          <div className="radar-form">
            <input
              value={draftTitle}
              placeholder={t.entryTitlePlaceholder}
              onChange={(event: { target: { value: string } }) => setDraftTitle(event.target.value)}
            />
            <input
              value={draftOwner}
              placeholder={t.owner}
              onChange={(event: { target: { value: string } }) => setDraftOwner(event.target.value)}
            />
            <input
              value={draftDueDate}
              placeholder={t.dueDate}
              onChange={(event: { target: { value: string } }) => setDraftDueDate(event.target.value)}
            />
            <button className="radar-button is-primary" disabled={busy} onClick={createEntry}>
              {t.addEntry}
            </button>
          </div>

          {data.entries.length === 0 ? (
            <div className="radar-empty">{t.emptyEntries}</div>
          ) : (
            <table className="radar-table">
              <thead>
                <tr>
                  <th>{t.entryTitle}</th>
                  <th>{t.status}</th>
                  <th>{t.owner}</th>
                  <th>{t.dueDate}</th>
                  <th>{t.ageDays}</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <strong>{entry.title}</strong>
                      <small>{entry.evidenceRef ?? t.noValue}</small>
                    </td>
                    <td>
                      <span className="radar-status" style={{ ['--dot' as string]: STATUS_DOT[entry.status] }}>
                        <span />
                        {t.statusLabels[entry.status]}
                      </span>
                      <select
                        className="radar-select"
                        style={{ marginTop: 6, width: '100%' }}
                        value={entry.status}
                        disabled={busy}
                        onChange={(event: { target: { value: string } }) =>
                          updateStatus(entry, event.target.value as RadarEntryStatus)
                        }
                      >
                        {STATUS_ORDER.map((status) => (
                          <option key={status} value={status}>
                            {t.statusLabels[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{entry.owner ?? t.noValue}</td>
                    <td>{entry.dueDate ?? t.noValue}</td>
                    <td>{entry.ageDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="radar-panel">
          <h2>
            {t.risks}
            <small>{risks.length}</small>
          </h2>
          {risks.length === 0 ? (
            <div className="radar-empty">{t.emptyRisks}</div>
          ) : (
            risks.map((risk) => <RiskCard key={risk.id} risk={risk} t={t} />)
          )}
        </div>
      </section>

      <section className="radar-panel">
        <h2>
          {t.report}
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {weekly ? (
              <span className={`radar-badge ${weekly.status === 'confirmed' ? 'is-confirmed' : 'is-draft'}`}>
                {weekly.status === 'confirmed' ? t.confirmed : t.draft}
              </span>
            ) : null}
            <button
              className="radar-button"
              disabled={busy}
              onClick={() => runAction('generate_weekly', { weekKey: weekKey || data.weekKey })}
            >
              {t.generate}
            </button>
            <button
              className="radar-button is-primary"
              disabled={busy || !weekly || weekly.status === 'confirmed'}
              onClick={() => runAction('confirm_weekly', { weekKey: weekKey || data.weekKey })}
            >
              {t.confirm}
            </button>
          </span>
        </h2>
        {!weekly ? (
          <div className="radar-empty">{t.emptyReport}</div>
        ) : (
          <div className="radar-report">
            <div className="radar-report-block">
              <h3>{t.highlights}</h3>
              <p>{weekly.highlights ?? t.noValue}</p>
            </div>
            <div className="radar-report-block">
              <h3>{t.nextActions}</h3>
              <p>{weekly.nextActions ?? t.noValue}</p>
            </div>
            <div className="radar-report-block">
              <h3>{t.risks}</h3>
              <p>
                {(weekly.risks ?? []).length === 0
                  ? t.emptyRisks
                  : (weekly.risks ?? [])
                      .map((risk) => `[${t.levelLabels[risk.level]}] ${risk.title} · ${risk.reasons.join(' / ')}`)
                      .join('\n')}
              </p>
            </div>
            <div className="radar-report-block">
              <h3>{t.history}</h3>
              <p>
                {data.weeklies.length === 0
                  ? t.noValue
                  : data.weeklies
                      .map((item: RadarWeekly) => `${item.weekKey} · ${item.status === 'confirmed' ? t.confirmed : t.draft} · ${formatDate(item.updatedAt, locale)}`)
                      .join('\n')}
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

function RiskCard({ risk, t }: { risk: RadarRisk; t: (typeof TEXT)['zh_Hans'] }) {
  return (
    <article className="radar-risk" style={{ ['--level' as string]: LEVEL_COLOR[risk.level] ?? LEVEL_COLOR.low }}>
      <header>
        <strong>{risk.title}</strong>
        <span className="radar-badge">{t.levelLabels[risk.level]}</span>
      </header>
      <p>{risk.detail}</p>
      <dl>
        <dt>{t.ageDays}</dt>
        <dd>{risk.ageDays}d</dd>
        <dt>{t.evidence}</dt>
        <dd>{risk.evidenceRefs.length ? risk.evidenceRefs.join('、') : t.noValue}</dd>
        <dt>{t.suggestion}</dt>
        <dd>{risk.suggestion}</dd>
      </dl>
    </article>
  )
}
