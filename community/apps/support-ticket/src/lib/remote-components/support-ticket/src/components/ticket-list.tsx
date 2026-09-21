import { React } from '../vendor'
import { cx, formatDateTime, optionLabel } from '../utils'
import type { Text } from '../i18n'
import type { TicketListItem, TicketOption, TicketStats } from '../types'

interface TicketListProps {
  t: Text
  locale: string
  loading: boolean
  items: TicketListItem[]
  stats?: TicketStats
  statuses: TicketOption[]
  categories: TicketOption[]
  priorities: TicketOption[]
  status: string
  onStatusChange: (value: string) => void
  search: string
  onSearchChange: (value: string) => void
  selectedId: string | null
  onSelect: (id: string) => void
}

export function TicketList(props: TicketListProps) {
  const {
    t,
    locale,
    loading,
    items,
    stats,
    statuses,
    categories,
    priorities,
    status,
    onStatusChange,
    search,
    onSearchChange,
    selectedId,
    onSelect
  } = props
  const statsMap = (stats ?? {}) as unknown as Record<string, number>

  return (
    <>
      <div className="st-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={status === ''}
          className={cx('st-tab', status === '' && 'is-active')}
          onClick={() => onStatusChange('')}
        >
          {t('allStatuses')}
          <span>{stats?.total ?? 0}</span>
        </button>
        {statuses.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={status === item.value}
            className={cx('st-tab', status === item.value && 'is-active')}
            onClick={() => onStatusChange(item.value)}
          >
            {locale === 'en-US' ? item.en_US : item.zh_Hans}
            <span>{statsMap[item.value] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="st-search">
        <input
          className="st-input"
          value={search}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          onChange={(event: { target: { value: string } }) => onSearchChange(event.target.value)}
        />
      </div>
      <div className="st-list">
        {loading && items.length === 0 ? (
          <div>
            <div className="st-skeleton st-skeleton-line" />
            <div className="st-skeleton st-skeleton-line" />
            <div className="st-skeleton st-skeleton-line" />
          </div>
        ) : null}
        {!loading && items.length === 0 ? (
          <div className="st-empty">
            <strong>{search || status ? t('noMatch') : t('emptyList')}</strong>
            <span>{search || status ? '' : t('emptyListHint')}</span>
          </div>
        ) : null}
        {items.map((item) => (
          <article
            key={item.id}
            className={cx('st-card', selectedId === item.id && 'is-selected')}
            onClick={() => onSelect(item.id)}
          >
            <div className="st-card-top">
              <span className="st-card-no st-mono">{item.ticketNo}</span>
              <span className={cx('st-tag', `st-tag-${item.status}`)}>
                {statusLabel(item.status, statuses, locale)}
              </span>
            </div>
            <div className="st-card-customer">{item.customerName}</div>
            <div className="st-card-preview">{item.confirmedReplyPreview ?? item.draftReplyPreview ?? ''}</div>
            <div className="st-card-meta">
              {item.category ? (
                <span className="st-tag st-tag-neutral">{optionLabel(categories, item.category, locale)}</span>
              ) : null}
              {item.priority ? <span className="st-tag st-tag-neutral">{optionLabel(priorities, item.priority, locale)}</span> : null}
              <span>{formatDateTime(item.updatedAt ?? item.createdAt, locale)}</span>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

function statusLabel(status: string, statuses: TicketOption[], locale: string) {
  const match = statuses.find((item) => item.value === status)
  if (!match) {
    return status
  }
  return locale === 'en-US' ? match.en_US : match.zh_Hans
}
