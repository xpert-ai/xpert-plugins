import { React } from '../vendor'
import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@xpert-ai/plugin-shadcn-ui'
import { requestData } from '../bridge'
import { Icon } from '../icons'
import type { CrmField, CrmRecord, Locale, TextBundle } from '../types'
import { displayRecordTitle, normalizeData, recordInitial, unwrap } from '../utils'

const { useCallback, useEffect, useMemo, useState } = React
const RELATION_PAGE_SIZE = 8

export function RelationPicker({
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
  const targetObjectKey = field.relationObjectKey || ''
  const valueText = value === undefined || value === null ? '' : String(value)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [targetFields, setTargetFields] = useState<CrmField[]>([])
  const [records, setRecords] = useState<CrmRecord[]>([])
  const [selectedRecord, setSelectedRecord] = useState<CrmRecord | null>(null)

  const selectedTitle = useMemo(() => {
    if (selectedRecord) return displayRecordTitle(selectedRecord, targetFields, t)
    if (valueText) return `#${valueText.slice(0, 8)}`
    return t.noValue
  }, [selectedRecord, t, targetFields, valueText])

  const loadRecords = useCallback(
    async (search: string, recordId?: string) => {
      if (!targetObjectKey) return
      setBusy(true)
      try {
        const response = await requestData({
          page: 1,
          pageSize: RELATION_PAGE_SIZE,
          search: search.trim() || undefined,
          parameters: {
            objectKey: targetObjectKey,
            recordId: recordId || undefined
          }
        })
        const result = normalizeData(unwrap(response))
        const items = [...result.table.items]
        if (result.selectedRecord && !items.some((item) => item.id === result.selectedRecord?.id)) {
          items.unshift(result.selectedRecord)
        }
        setTargetFields(result.fields)
        setRecords(items)
        if (valueText) {
          const selected = items.find((item) => item.id === valueText) ?? null
          setSelectedRecord(selected)
        }
      } finally {
        setBusy(false)
      }
    },
    [targetObjectKey, valueText]
  )

  useEffect(() => {
    if (!targetObjectKey) return
    loadRecords('', valueText || undefined)
  }, [loadRecords, targetObjectKey, valueText])

  useEffect(() => {
    if (!open) return
    const timeout = window.setTimeout(() => {
      loadRecords(query, valueText || undefined)
    }, 220)
    return () => window.clearTimeout(timeout)
  }, [loadRecords, open, query, valueText])

  function selectRecord(record: CrmRecord) {
    setSelectedRecord(record)
    onChange(record.id)
    setOpen(false)
    setQuery('')
  }

  function clearRelation() {
    setSelectedRecord(null)
    onChange('')
    setOpen(false)
    setQuery('')
  }

  if (!targetObjectKey) {
    return (
      <Button variant="outline" className="crm20-relation-trigger" disabled>
        {t.relationReference}
      </Button>
    )
  }

  return (
    <div className="crm20-relation-picker">
      <div className="crm20-relation-row">
        <Button variant="outline" className="crm20-relation-trigger" onClick={() => setOpen((current) => !current)}>
          <span className={`crm20-record-mark crm20-object-${targetObjectKey}`}>{selectedRecord ? recordInitial(selectedTitle) : '#'}</span>
          <span className="crm20-relation-title">{selectedTitle}</span>
          <Badge variant="secondary">{targetObjectKey}</Badge>
        </Button>
        {valueText ? (
          <Button variant="ghost" size="icon" title={t.clearRelation} onClick={clearRelation}>
            <Icon name="close" />
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="crm20-relation-command">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder={t.searchRelation} />
            <CommandList>
              <CommandEmpty>{busy ? t.loadingRelatedRecords : t.relationNoResults}</CommandEmpty>
              <CommandGroup heading={t.relatedRecords}>
                {records.map((record) => {
                  const title = displayRecordTitle(record, targetFields, t)
                  return (
                    <CommandItem key={record.id} value={`${record.id} ${title}`} onSelect={() => selectRecord(record)}>
                      <span className={`crm20-record-mark crm20-object-${record.objectKey || targetObjectKey}`}>{recordInitial(title)}</span>
                      <span className="crm20-relation-option-text">
                        <strong>{title}</strong>
                        <small>{locale === 'zh_Hans' ? '记录' : 'Record'} #{record.id.slice(0, 8)}</small>
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      ) : null}
    </div>
  )
}
