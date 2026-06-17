import { React } from '../vendor'
import { Badge, Button, Separator } from '@xpert-ai/plugin-shadcn-ui'
import { Icon } from '../icons'
import type { CrmField, CrmRecord, Locale, RelatedRecordSection, TextBundle } from '../types'
import { displayRecordTitle, formatDate, formatText, objectIcon, recordInitial } from '../utils'

export function RelatedRecordsPanel({
  sections,
  locale,
  t,
  onOpenRecord
}: {
  sections: RelatedRecordSection[]
  locale: Locale
  t: TextBundle
  onOpenRecord: (objectKey: string, recordId: string) => void
}) {
  if (!sections.length) return null

  return (
    <section className="crm20-related-panel">
      <header className="crm20-related-heading">
        <strong>{t.relatedRecords}</strong>
      </header>
      {sections.map((section, index) => (
        <div className="crm20-related-section" key={`${section.objectKey}-${section.relationFieldKey}`}>
          {index > 0 ? <Separator /> : null}
          <div className="crm20-related-section-header">
            <span className={`crm20-object-icon crm20-object-${section.objectKey}`}>
              <Icon name={objectIcon({ objectKey: section.objectKey })} />
            </span>
            <div>
              <strong>{section.objectPluralLabel || section.objectLabel || section.objectKey}</strong>
              <small>
                {t.linkedBy} {section.relationFieldLabel || section.relationFieldKey}
              </small>
            </div>
            <Badge variant="secondary">{section.total}</Badge>
          </div>
          <div className="crm20-related-list">
            {section.items.map((record) => {
              const title = displayRecordTitle(record, section.fields, t)
              const subtitle = relatedSubtitle(record, section.fields, section.relationFieldKey, locale, t)
              return (
                <Button
                  variant="ghost"
                  className="crm20-related-record"
                  key={record.id}
                  title={t.openRelatedRecord}
                  onClick={() => onOpenRecord(section.objectKey, record.id)}
                >
                  <span className={`crm20-record-mark crm20-object-${section.objectKey}`}>{recordInitial(title)}</span>
                  <span>
                    <strong>{title}</strong>
                    {subtitle ? <small>{subtitle}</small> : null}
                  </span>
                  <Icon name="chevron" />
                </Button>
              )
            })}
            {section.total > section.items.length ? (
              <span className="crm20-related-more">
                +{section.total - section.items.length} {t.moreRelatedRecords}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  )
}

function relatedSubtitle(record: CrmRecord, fields: CrmField[], relationFieldKey: string, locale: Locale, t: TextBundle) {
  const values = record.values ?? {}
  const skipped = new Set(['name', 'firstName', 'lastName', 'title', relationFieldKey])
  const field = fields.find((item) => {
    const value = values[item.fieldKey]
    return !skipped.has(item.fieldKey) && value !== undefined && value !== null && String(value).trim() !== ''
  })
  if (!field) return ''
  const value = values[field.fieldKey]
  if (field.type === 'date' || field.type === 'datetime') return formatDate(value, locale)
  return formatText(resolveOptionLabel(value, field), field, fields, t)
}

function resolveOptionLabel(value: unknown, field: CrmField) {
  if ((field.type === 'select' || field.type === 'multi_select') && Array.isArray(field.options)) {
    if (Array.isArray(value)) {
      return value
        .map((item) => field.options?.find((option) => option.value === String(item))?.label || String(item))
        .join(', ')
    }
    return field.options.find((option) => option.value === String(value))?.label || value
  }
  return value
}
