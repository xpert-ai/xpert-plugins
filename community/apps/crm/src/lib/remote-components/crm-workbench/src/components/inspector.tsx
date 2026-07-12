import { React } from '../vendor'
import {
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea
} from '@xpert-ai/plugin-shadcn-ui'
import { Icon } from '../icons'
import type { CrmField, CrmRecord, Locale, Mode, RelatedRecordSection, RelationLabels, TextBundle, TimelineItem } from '../types'
import { displayRecordTitle, formatDate, recordInitial } from '../utils'
import { FieldValue } from './field-value'
import { RelationPicker } from './relation-picker'
import { RelatedRecordsPanel } from './related-records-panel'
import { TimelinePanel } from './timeline-panel'

const EMPTY_SELECT_VALUE = '__empty__'

export function Inspector({
  mode,
  record,
  fields,
  draft,
  locale,
  t,
  objectLabel,
  objectKey,
  relationLabels,
  relatedSections,
  timelineItems,
  busy,
  onChange,
  onEdit,
  onClose,
  onCancel,
  onOpenRelatedRecord,
  onSave
}: {
  mode: Mode
  record: CrmRecord | null
  fields: CrmField[]
  draft: Record<string, unknown>
  locale: Locale
  t: TextBundle
  objectLabel: string
  objectKey: string
  relationLabels?: RelationLabels
  relatedSections: RelatedRecordSection[]
  timelineItems: TimelineItem[]
  busy: boolean
  onChange: (fieldKey: string, value: unknown) => void
  onEdit: () => void
  onClose: () => void
  onCancel: () => void
  onOpenRelatedRecord: (objectKey: string, recordId: string) => void
  onSave: () => void
}) {
  const isEditing = mode === 'edit' || mode === 'create'
  const title = mode === 'create' ? t.newRecord : record ? displayRecordTitle(record, fields, t) : t.details
  return (
    <Sheet open={mode !== 'closed'} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="crm20-inspector-content" side="right" showCloseButton={false}>
        <header className="crm20-inspector-header">
          <div className={`crm20-inspector-avatar crm20-object-${objectKey}`}>
            {mode === 'create' ? <Icon name="plus" /> : <span>{recordInitial(title)}</span>}
          </div>
          <div>
            <span>{objectLabel}</span>
            <strong>{title}</strong>
          </div>
          <Button variant="ghost" size="icon" title={t.close} onClick={onClose}>
            <Icon name="close" />
          </Button>
        </header>

        <div className="crm20-inspector-meta">
          <span>
            {t.created}: {record?.createdAt ? formatDate(record.createdAt, locale) : t.noValue}
          </span>
          <span>
            {t.updated}: {record?.updatedAt ? formatDate(record.updatedAt, locale) : t.noValue}
          </span>
        </div>

        {isEditing ? (
          <div className="crm20-form">
            {fields.map((field) => (
              <label className="crm20-field" key={field.fieldKey}>
                <span>
                  {field.label || field.fieldKey}
                  {field.required ? <em>{t.required}</em> : null}
                  <small>{field.type || 'text'}</small>
                </span>
                <FieldInput field={field} value={draft[field.fieldKey]} locale={locale} t={t} onChange={(value) => onChange(field.fieldKey, value)} />
              </label>
            ))}
          </div>
        ) : (
          <Tabs className="crm20-inspector-tabs" defaultValue="properties">
            <TabsList>
              <TabsTrigger value="properties">{t.properties}</TabsTrigger>
              <TabsTrigger value="timeline">{t.timeline}</TabsTrigger>
            </TabsList>
            <TabsContent value="properties">
              <div className="crm20-read-fields">
                {fields.map((field) => (
                  <div className="crm20-read-field" key={field.fieldKey}>
                    <span>{field.label || field.fieldKey}</span>
                    <strong>
                      <FieldValue value={record?.values?.[field.fieldKey]} field={field} fields={fields} locale={locale} relationLabels={relationLabels} t={t} />
                    </strong>
                  </div>
                ))}
                <RelatedRecordsPanel sections={relatedSections} locale={locale} t={t} onOpenRecord={onOpenRelatedRecord} />
              </div>
            </TabsContent>
            <TabsContent value="timeline">
              <TimelinePanel items={timelineItems} locale={locale} t={t} onOpenRecord={onOpenRelatedRecord} />
            </TabsContent>
          </Tabs>
        )}

        <footer className="crm20-inspector-actions">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={onCancel} disabled={busy}>
                {t.cancel}
              </Button>
              <Button onClick={onSave} disabled={busy}>
                <Icon name="save" />
                <span>{busy ? t.saving : t.save}</span>
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                {t.close}
              </Button>
              <Button onClick={onEdit}>
                <Icon name="edit" />
                <span>{t.edit}</span>
              </Button>
            </>
          )}
        </footer>
      </SheetContent>
    </Sheet>
  )
}

function FieldInput({
  field,
  value,
  locale,
  t,
  onChange
}: {
  field: CrmField
  value: unknown
  locale: Locale
  t: TextBundle
  onChange: (value: unknown) => void
}) {
  if (field.type === 'select' && Array.isArray(field.options)) {
    const selectedValue = value === undefined || value === null || value === '' ? EMPTY_SELECT_VALUE : String(value)
    return (
      <Select value={selectedValue} onValueChange={(next) => onChange(next === EMPTY_SELECT_VALUE ? '' : next)}>
        <SelectTrigger>
          <SelectValue placeholder="-" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY_SELECT_VALUE}>-</SelectItem>
          {field.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label || option.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (field.type === 'boolean') {
    return (
      <label className="crm20-checkbox-field">
        <Checkbox checked={Boolean(value)} onCheckedChange={(checked) => onChange(checked === true)} />
      </label>
    )
  }
  if (field.type === 'rich_text') {
    return <Textarea rows={5} value={value === undefined || value === null ? '' : String(value)} onChange={(event) => onChange(event.currentTarget.value)} />
  }
  if (field.type === 'date') {
    return <Input type="date" value={value === undefined || value === null ? '' : String(value).slice(0, 10)} onChange={(event) => onChange(event.currentTarget.value)} />
  }
  if (field.type === 'datetime') {
    return <Input type="datetime-local" value={value === undefined || value === null ? '' : String(value)} onChange={(event) => onChange(event.currentTarget.value)} />
  }
  if (field.type === 'number' || field.type === 'currency') {
    return <Input type="number" value={value === undefined || value === null ? '' : String(value)} onChange={(event) => onChange(event.currentTarget.value)} />
  }
  if (field.type === 'relation') {
    return <RelationPicker field={field} value={value} locale={locale} t={t} onChange={onChange} />
  }
  return <Input value={value === undefined || value === null ? '' : String(value)} onChange={(event) => onChange(event.currentTarget.value)} />
}
