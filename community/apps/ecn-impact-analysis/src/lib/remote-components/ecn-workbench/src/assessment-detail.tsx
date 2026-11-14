import * as React from 'react'
import { Button, Input, Badge } from '@xpert-ai/plugin-shadcn-ui'
import { ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'
import type { AssessmentDetailDto, ImpactItemDto } from '../../../contracts'
import { useI18n } from './i18n'
import { DomainBadge, ItemStatusBadge, RiskBadge, StatusBadge, formatTime } from './ui'

interface DetailProps {
  detail: AssessmentDetailDto
  busy: boolean
  locale: string
  onAction: (actionKey: string, input: Record<string, unknown>) => Promise<unknown>
}

const DOMAIN_ORDER = ['bom', 'routing', 'production', 'inventory'] as const

export function AssessmentDetail({ detail, busy, locale, onAction }: DetailProps) {
  const { t, tFn } = useI18n()
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})
  const [notes, setNotes] = React.useState<Record<string, string>>({})

  const review = async (item: ImpactItemDto, decision: 'accepted' | 'rejected') => {
    await onAction('review_item', {
      assessmentId: detail.id,
      itemId: item.id,
      decision,
      note: notes[item.id]?.trim() || undefined
    })
  }

  const pendingCount = detail.items.filter((item) => item.status === 'pending').length
  const grouped = React.useMemo(() => {
    const map = new Map<string, ImpactItemDto[]>()
    for (const item of detail.items) {
      const list = map.get(item.domain) ?? []
      list.push(item)
      map.set(item.domain, list)
    }
    return map
  }, [detail.items])

  return (
    <div>
      {detail.lastError && (
        <div role="alert" className="ecn-error-banner">
          <AlertCircle size={16} />
          <span>
            {t('lastError')}：{detail.lastError}
          </span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void onAction('retry_analysis', { assessmentId: detail.id })}>
            {t('retryAction')}
          </Button>
        </div>
      )}

      <section className="ecn-section">
        <div className="flex items-center justify-between gap-2">
          <h2 className="ecn-section-title">{t('changeInfo')}</h2>
          <div className="flex items-center gap-2">
            <StatusBadge status={detail.status} />
            <RiskBadge risk={detail.riskLevel} />
          </div>
        </div>
        <div className="ecn-divider" />
        <div className="ecn-kv-grid">
          <div className="ecn-kv">
            <label>{t('colChange')}</label>
            <div className="value">
              {detail.changeNo}
              {detail.expectedEffectDate ? `（生效 ${detail.expectedEffectDate}）` : ''}
            </div>
          </div>
          <div className="ecn-kv">
            <label>{t('changeType')}</label>
            <div className="value">{t(`changeType_${detail.changeType}` as const)}</div>
          </div>
          <div className="ecn-kv">
            <label>{t('colMaterial')}</label>
            <div className="value">
              {detail.materialNo}
              {detail.materialName ? ` · ${detail.materialName}` : ''}
            </div>
          </div>
          {detail.changeReason ? (
            <div className="ecn-kv">
              <label>{t('changeReason')}</label>
              <div className="value">{detail.changeReason}</div>
            </div>
          ) : null}
          <div className="ecn-kv" style={{ gridColumn: '1 / -1' }}>
            <label>{t('changeDescription')}</label>
            <div className="value">{detail.changeDescription}</div>
          </div>
        </div>
      </section>

      {detail.aiSummary && (
        <section className="ecn-section">
          <div className="flex items-center justify-between gap-2">
            <h2 className="ecn-section-title">{t('aiSummary')}</h2>
            <span className="text-xs text-muted-foreground">
              {t('aiRisk')}：<RiskBadge risk={detail.riskLevel} />
              {detail.confirmedBy ? ` · ${t('confirmedBy')} ${detail.confirmedBy}` : ''}
            </span>
          </div>
          <div className="ecn-divider" />
          <div className="ecn-summary-box">{detail.aiSummary}</div>
        </section>
      )}

      <section className="ecn-section">
        <div className="flex items-center justify-between gap-2">
          <h2 className="ecn-section-title">
            {t('impactItems')}（{detail.items.length}）
          </h2>
          {detail.status === 'ai_completed' && (
            <div className="flex items-center gap-8">
              <span className="text-xs text-muted-foreground">
                {pendingCount > 0 ? tFn('pendingTip', pendingCount) : t('allReviewedTip')}
              </span>
              <Button size="sm" disabled={busy || pendingCount > 0} onClick={() => void onAction('confirm_assessment', { assessmentId: detail.id })}>
                {t('confirm')}
              </Button>
            </div>
          )}
          {detail.status === 'confirmed' && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void onAction('close_assessment', { assessmentId: detail.id })}>
              {t('archive')}
            </Button>
          )}
        </div>
        <div className="ecn-divider" />

        {!detail.items.length ? (
          <div className="ecn-empty">
            <h2>{t('impactItems')}</h2>
            <p>{detail.status === 'draft' ? '尚未执行 AI 影响分析。' : '没有影响项。'}</p>
            {detail.status === 'draft' && (
              <Button disabled={busy} onClick={() => void onAction('send_to_chat', { assessmentId: detail.id })}>
                {t('sendToChat')}
              </Button>
            )}
          </div>
        ) : (
          DOMAIN_ORDER.filter((domain) => grouped.has(domain)).map((domain) => (
            <div key={domain} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <DomainBadge domain={domain} />
                <span className="text-xs text-muted-foreground">{grouped.get(domain)!.length}</span>
              </div>
              {grouped.get(domain)!.map((item) => (
                <div key={item.id} className={`ecn-item ${item.status}`}>
                  <div
                    className="ecn-item-header"
                    onClick={() => setExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                  >
                    {expanded[item.id] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="ecn-item-target">{item.targetNo}</span>
                        {item.targetName ? <span className="text-xs text-muted-foreground">{item.targetName}</span> : null}
                        <ItemStatusBadge status={item.status} />
                        <RiskBadge risk={item.riskLevel} />
                      </div>
                      <div className="ecn-item-desc">{item.impactDescription}</div>
                    </div>
                  </div>
                  {expanded[item.id] && (
                    <div className="ecn-item-body">
                      <div className="row">
                        {item.relationPath && (
                          <span className="text-muted-foreground">
                            路径：{item.relationPath}
                          </span>
                        )}
                        {typeof item.confidence === 'number' && (
                          <span className="text-muted-foreground">
                            {t('confidence')}：{(item.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      {item.suggestedAction && (
                        <div className="text-[12.5px] leading-relaxed">
                          <span className="text-muted-foreground">建议措施：</span>
                          {item.suggestedAction}
                        </div>
                      )}
                      {item.evidence && Object.keys(item.evidence).length > 0 && (
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground select-none">{t('evidence')}</summary>
                          <pre className="ecn-evidence mt-1">{JSON.stringify(item.evidence, null, 2)}</pre>
                        </details>
                      )}
                      {item.reviewNote && (
                        <div className="text-[12.5px]">
                          <span className="text-muted-foreground">审核备注：</span>
                          {item.reviewNote}
                        </div>
                      )}
                      {item.status === 'pending' && detail.status === 'ai_completed' && (
                        <div className="ecn-review-row">
                          <Input
                            value={notes[item.id] ?? ''}
                            onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder={t('reviewNotePlaceholder')}
                            aria-label={`${t('reviewNotePlaceholder')} ${item.targetNo}`}
                          />
                          <Button size="sm" disabled={busy} onClick={() => void review(item, 'accepted')}>
                            {t('accept')}
                          </Button>
                          <Button size="sm" variant="destructive" disabled={busy} onClick={() => void review(item, 'rejected')}>
                            {t('reject')}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </section>

      <section className="ecn-section">
        <h2 className="ecn-section-title">{t('operationLog')}</h2>
        <div className="ecn-divider" />
        <ul className="ecn-log">
          {detail.logs.map((log) => (
            <li key={log.id}>
              <time>{formatTime(log.createdAt, locale)}</time>
              <span>
                {log.type === 'failed' ? <Badge variant="destructive" className="mr-1">fail</Badge> : null}
                {log.detail ?? log.type}
                <span className="text-muted-foreground">（{log.type}）</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
