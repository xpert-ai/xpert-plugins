import { React } from '../vendor'
import { Badge, Button, Separator } from '@xpert-ai/plugin-shadcn-ui'
import { Icon } from '../icons'
import type { Locale, TextBundle, TimelineItem } from '../types'
import { formatDate } from '../utils'

export function TimelinePanel({
  items,
  locale,
  t,
  onOpenRecord
}: {
  items: TimelineItem[]
  locale: Locale
  t: TextBundle
  onOpenRecord: (objectKey: string, recordId: string) => void
}) {
  if (!items.length) {
    return (
      <section className="crm20-timeline-empty">
        <span className="crm20-timeline-dot">
          <Icon name="workflow" />
        </span>
        <strong>{t.noTimelineItems}</strong>
      </section>
    )
  }

  return (
    <section className="crm20-timeline-panel">
      {items.map((item, index) => (
        <div className="crm20-timeline-item" key={`${item.type}-${item.id}`}>
          {index > 0 ? <Separator /> : null}
          <div className={`crm20-timeline-dot crm20-timeline-${item.type}`}>
            <Icon name={timelineIcon(item.type)} />
          </div>
          <div className="crm20-timeline-content">
            <div className="crm20-timeline-meta">
              <Badge variant="secondary">{timelineLabel(item.type, t)}</Badge>
              {item.status ? <Badge variant="secondary">{item.status}</Badge> : null}
              <time>{formatDate(item.occurredAt || item.updatedAt || item.createdAt, locale)}</time>
            </div>
            {item.type === 'note' || item.type === 'task' ? (
              <Button
                variant="ghost"
                className="crm20-timeline-record"
                onClick={() => onOpenRecord(item.objectKey || item.type, item.id)}
              >
                <span>
                  <strong>{item.title}</strong>
                  {item.body ? <small>{itemBody(item, t)}</small> : null}
                </span>
                <Icon name="chevron" />
              </Button>
            ) : (
              <div className="crm20-timeline-activity-body">
                <strong>{item.title}</strong>
                {item.body ? <small>{item.body}</small> : null}
              </div>
            )}
          </div>
        </div>
      ))}
    </section>
  )
}

function timelineIcon(type: TimelineItem['type']) {
  if (type === 'note') return 'note'
  if (type === 'task') return 'check'
  return 'edit'
}

function timelineLabel(type: TimelineItem['type'], t: TextBundle) {
  if (type === 'note') return t.note
  if (type === 'task') return t.task
  return t.activity
}

function itemBody(item: TimelineItem, t: TextBundle) {
  if (item.type === 'task' && item.body?.startsWith('Due ')) {
    return `${t.due} ${item.body.slice(4)}`
  }
  return item.body
}
