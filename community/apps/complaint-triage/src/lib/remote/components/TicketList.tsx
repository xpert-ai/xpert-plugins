import type { TicketListItem, TicketStatus } from '../../domain/contracts.js'
import { TICKET_STATUS_ORDER } from '../status.js'
import { useServices } from '../context.js'
import { SeverityBadge, StatusPill } from './badges.js'

interface Props {
  items: TicketListItem[]
  total: number
  counts: Record<TicketStatus, number>
  page: number
  pageSize: number
  search: string
  status: TicketStatus | null
  selectedId: string | null
  loading: boolean
  onSearch: (value: string) => void
  onStatus: (value: TicketStatus | null) => void
  onPage: (page: number) => void
  onSelect: (ticketId: string) => void
  onCreate: () => void
}

export function TicketList(props: Props) {
  const { t, formatTime } = useServices()
  const allCount = TICKET_STATUS_ORDER.reduce((sum, status) => sum + props.counts[status], 0)
  const pages = Math.max(1, Math.ceil(props.total / props.pageSize))
  const filtered = props.search.length > 0 || props.status !== null

  return (
    <aside className="ct-list" aria-label={t('app.title')}>
      <div className="ct-list-toolbar">
        <button type="button" className="xui-button xui-button-primary" onClick={props.onCreate}>
          {t('list.new')}
        </button>
        <input
          className="xui-input"
          type="search"
          value={props.search}
          placeholder={t('list.search')}
          aria-label={t('list.search')}
          onChange={(event) => props.onSearch(event.target.value)}
        />
      </div>

      <div className="ct-filters" role="tablist">
        <button type="button" role="tab" aria-selected={props.status === null} className="ct-filter" onClick={() => props.onStatus(null)}>
          {t('list.all')} <span className="ct-count">{allCount}</span>
        </button>
        {TICKET_STATUS_ORDER.map((status) => (
          <button key={status} type="button" role="tab" aria-selected={props.status === status} className="ct-filter" onClick={() => props.onStatus(status)}>
            {t(`status.${status}`)} <span className="ct-count">{props.counts[status]}</span>
          </button>
        ))}
      </div>

      <div className="ct-list-body" aria-busy={props.loading}>
        {props.items.length === 0 && !props.loading ? (
          filtered ? (
            <div className="xui-empty">{t('list.noMatch')}</div>
          ) : (
            <div className="ct-empty">
              <h2>{t('list.empty.title')}</h2>
              <p>{t('list.empty.body')}</p>
              <button type="button" className="xui-button xui-button-primary" onClick={props.onCreate}>
                {t('list.empty.action')}
              </button>
            </div>
          )
        ) : (
          <ul className="ct-rows">
            {props.items.map((item) => (
              <li key={item.id}>
                <button type="button" className="ct-row" aria-current={item.id === props.selectedId} onClick={() => props.onSelect(item.id)}>
                  <span className="ct-row-head">
                    <span className="ct-ticket-no">{item.ticketNo}</span>
                    <StatusPill status={item.status} />
                    {item.severity ? <SeverityBadge severity={item.severity} /> : null}
                  </span>
                  <span className="ct-row-excerpt">{item.excerpt}</span>
                  <span className="ct-row-meta">
                    {t(`channel.${item.channel}`)}
                    {item.customerName ? ` · ${item.customerName}` : ''} · {formatTime(item.createdAt)}
                    {item.attemptCount > 1 ? ` · ${t('list.attempts', { count: item.attemptCount })}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {props.total > props.pageSize ? (
        <div className="ct-pager">
          <button type="button" className="xui-button xui-button-sm" disabled={props.page <= 1} onClick={() => props.onPage(props.page - 1)}>
            {t('list.prev')}
          </button>
          <span>{t('list.page', { page: props.page, pages, total: props.total })}</span>
          <button type="button" className="xui-button xui-button-sm" disabled={props.page >= pages} onClick={() => props.onPage(props.page + 1)}>
            {t('list.next')}
          </button>
        </div>
      ) : null}
    </aside>
  )
}
