import { React } from '../vendor'
import {
  Button,
  Checkbox,
  Table as ShadcnTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@xpert-ai/plugin-shadcn-ui'
import { Icon } from '../icons'
import type { CrmField, CrmRecord, Locale, RelationLabels, TextBundle } from '../types'
import { columnWidth, fieldIcon } from '../utils'
import { FieldValue, NameCell } from './field-value'

export function RecordGrid({
  columns,
  fields,
  records,
  selectedId,
  checkedIds,
  objectKey,
  locale,
  relationLabels,
  t,
  busy,
  onSelect,
  onToggleRecord,
  onToggleAll,
  onCreate
}: {
  columns: CrmField[]
  fields: CrmField[]
  records: CrmRecord[]
  selectedId?: string
  checkedIds: Set<string>
  objectKey: string
  locale: Locale
  relationLabels?: RelationLabels
  t: TextBundle
  busy: boolean
  onSelect: (record: CrmRecord) => void
  onToggleRecord: (recordId: string, checked: boolean) => void
  onToggleAll: (checked: boolean) => void
  onCreate: () => void
}) {
  const allVisibleChecked = records.length > 0 && records.every((record) => checkedIds.has(record.id))

  if (!records.length && !busy) {
    return (
      <div className="crm20-empty-table">
        <div className={`crm20-empty-icon crm20-object-${objectKey}`}>
          <Icon name="table" />
        </div>
        <strong>{t.empty}</strong>
        <Button onClick={onCreate}>
          <Icon name="plus" />
          <span>{t.newRecord}</span>
        </Button>
      </div>
    )
  }

  return (
    <div className="crm20-grid-scroll">
      <ShadcnTable className="crm20-grid">
        <colgroup>
          <col className="crm20-check-col" />
          {columns.map((field, index) => (
            <col key={field.fieldKey} style={{ width: `${columnWidth(field, index)}px` }} />
          ))}
          <col className="crm20-extra-col" />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead className="crm20-check-cell">
              <Checkbox
                aria-label={t.selectAll}
                checked={allVisibleChecked}
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={(checked) => onToggleAll(checked === true)}
              />
            </TableHead>
            {columns.map((field) => (
              <TableHead key={field.fieldKey} title={field.label || field.fieldKey}>
                <span className="crm20-th-content">
                  <Icon name={fieldIcon(field)} />
                  <span>{field.label || field.fieldKey}</span>
                </span>
              </TableHead>
            ))}
            <TableHead className="crm20-extra-cell">
              <Icon name="plus" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => {
            const isChecked = checkedIds.has(record.id)
            const className = [record.id === selectedId ? 'is-selected' : '', isChecked ? 'is-checked' : ''].filter(Boolean).join(' ')
            return (
              <TableRow key={record.id} className={className} onClick={() => onSelect(record)} onDoubleClick={() => onSelect(record)}>
                <TableCell className="crm20-check-cell">
                  <Checkbox
                    aria-label="Select row"
                    checked={isChecked}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={(checked) => onToggleRecord(record.id, checked === true)}
                  />
                </TableCell>
                {columns.map((field, index) => (
                  <TableCell key={field.fieldKey}>
                    {index === 0 ? (
                      <NameCell
                        field={field}
                        fields={fields}
                        record={record}
                        objectKey={record.objectKey || objectKey}
                        locale={locale}
                        relationLabels={relationLabels}
                        t={t}
                      />
                    ) : (
                      <FieldValue value={record.values?.[field.fieldKey]} field={field} fields={fields} locale={locale} relationLabels={relationLabels} t={t} />
                    )}
                  </TableCell>
                ))}
                <TableCell className="crm20-extra-cell" />
              </TableRow>
            )
          })}
        </TableBody>
      </ShadcnTable>
      {busy ? <div className="crm20-loading-line" /> : null}
    </div>
  )
}
