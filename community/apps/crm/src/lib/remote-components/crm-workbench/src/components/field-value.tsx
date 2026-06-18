import { React } from '../vendor'
import type { CrmField, CrmRecord, Locale, RelationLabels, TextBundle } from '../types'
import {
  displayRecordTitle,
  formatCurrency,
  formatDate,
  formatText,
  isUrlLike,
  recordInitial,
  shortUrl
} from '../utils'

export function NameCell({
  field,
  fields,
  record,
  objectKey,
  locale,
  relationLabels,
  t
}: {
  field: CrmField
  fields: CrmField[]
  record: CrmRecord
  objectKey: string
  locale: Locale
  relationLabels?: RelationLabels
  t: TextBundle
}) {
  const title = displayRecordTitle(record, fields, t)
  return (
    <span className="crm20-name-cell">
      <span className={`crm20-record-mark crm20-object-${objectKey}`}>{recordInitial(title)}</span>
      <span className="crm20-name-text">
        <FieldValue value={record.values?.[field.fieldKey] ?? title} field={field} fields={fields} locale={locale} relationLabels={relationLabels} t={t} />
      </span>
    </span>
  )
}

export function FieldValue({
  value,
  field,
  fields,
  locale,
  t,
  relationLabels
}: {
  value: unknown
  field: CrmField
  fields: CrmField[]
  locale: Locale
  t: TextBundle
  relationLabels?: RelationLabels
}) {
  if (value === undefined || value === null || value === '') {
    return <span className="crm20-muted-value">{t.noValue}</span>
  }
  if (field.type === 'currency') {
    return <span>{formatCurrency(value, locale)}</span>
  }
  if (field.type === 'boolean') {
    return <span>{value ? (locale === 'zh_Hans' ? '是' : 'Yes') : locale === 'zh_Hans' ? '否' : 'No'}</span>
  }
  if (field.type === 'select' && Array.isArray(field.options)) {
    const option = field.options.find((item) => item.value === String(value))
    return (
      <span className="crm20-chip" style={{ '--chip-color': option?.color || '#64748b' } as React.CSSProperties}>
        <span />
        {option?.label || String(value)}
      </span>
    )
  }
  if (field.type === 'multi_select') {
    const items = Array.isArray(value) ? value : String(value).split(/[,，、;；\n]+/).filter(Boolean)
    return (
      <span className="crm20-multi-value">
        {items.slice(0, 2).map((item) => (
          <span className="crm20-pill" key={String(item)}>
            {String(item)}
          </span>
        ))}
        {items.length > 2 ? <span className="crm20-muted-value">+{items.length - 2}</span> : null}
      </span>
    )
  }
  if (field.type === 'url' || isUrlLike(String(value))) {
    return <span className="crm20-link-pill">{shortUrl(String(value))}</span>
  }
  if (field.type === 'email') {
    return <span className="crm20-link-value">{String(value)}</span>
  }
  if (field.type === 'date' || field.type === 'datetime') {
    return <span>{formatDate(value, locale)}</span>
  }
  if (field.type === 'relation') {
    const relationId = String(value)
    const relationLabel = relationLabels?.[field.fieldKey]?.[relationId]
    return <span className="crm20-relation-value">{relationLabel || `#${relationId.slice(0, 8)}`}</span>
  }
  return <span>{formatText(value, field, fields, t)}</span>
}
