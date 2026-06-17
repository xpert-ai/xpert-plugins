import { React } from '../vendor'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input
} from '@xpert-ai/plugin-shadcn-ui'
import { executeAction, notify, requestData } from '../bridge'
import { Icon } from '../icons'
import { TEXT, resolveLocale } from '../i18n'
import type { CrmData, CrmField, CrmRecord, Density, HostContext, Mode, SortMode } from '../types'
import {
  PAGE_SIZE,
  buildQuery,
  countNonEmpty,
  getColumnsFromKeys,
  getDefaultColumnKeys,
  getInitialObjectKey,
  getRelatedRecordSections,
  getRelationLabels,
  getTimelineItems,
  isObject,
  normalizeData,
  normalizeFormValues,
  objectIcon,
  resolveNextSelection,
  resolveText,
  sortRecords,
  toFormValues,
  unwrap
} from '../utils'
import { Inspector } from './inspector'
import { RecordGrid } from './record-grid'

const { useCallback, useEffect, useMemo, useRef, useState } = React

export function CrmWorkbench({ context }: { context: HostContext }) {
  const locale = resolveLocale(context.locale)
  const t = TEXT[locale]
  const searchRef = useRef<HTMLInputElement | null>(null)
  const initialObjectKey = getInitialObjectKey(context)
  const [objectKey, setObjectKey] = useState(initialObjectKey)
  const [searchDraft, setSearchDraft] = useState(context.initialQuery?.search ?? '')
  const [searchQuery, setSearchQuery] = useState(context.initialQuery?.search ?? '')
  const [data, setData] = useState<CrmData | null>(null)
  const [selected, setSelected] = useState<CrmRecord | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [mode, setMode] = useState<Mode>('closed')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('server')
  const [density, setDensity] = useState<Density>('comfortable')
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set())
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>([])
  const selectedRef = useRef<CrmRecord | null>(null)
  const skipNextAutoLoadRef = useRef(false)

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  const loadData = useCallback(
    async (options?: {
      objectKey?: string
      searchQuery?: string
      recordId?: string
      keepSelection?: boolean
      silent?: boolean
    }) => {
      if (!options?.silent) setBusy(true)
      setNotice('')
      try {
        const nextObjectKey = options?.objectKey ?? objectKey
        const nextSearchQuery = options?.searchQuery ?? searchQuery
        const response = await requestData(buildQuery(context, nextObjectKey, nextSearchQuery, options?.recordId))
        const result = normalizeData(unwrap(response))
        setData(result)
        const visibleIds = new Set(result.table.items.map((record) => record.id))
        setCheckedIds((current) => new Set([...current].filter((id) => visibleIds.has(id))))
        const currentSelected = selectedRef.current

        const nextSelected = resolveNextSelection(result, {
          recordId: options?.recordId,
          keepSelection: options?.keepSelection,
          selected: currentSelected
        })
        if (nextSelected && options?.recordId) {
          openRecord(nextSelected, result.fields, 'view')
        } else if (!options?.keepSelection && !options?.recordId) {
          setSelected(null)
          setDraft({})
          setMode('closed')
        } else if (nextSelected && currentSelected) {
          setSelected(nextSelected)
          setDraft(toFormValues(result.fields, nextSelected.values ?? {}))
        }
      } catch (error) {
        setNotice(error instanceof Error && error.message ? error.message : t.loadFailed)
      } finally {
        setBusy(false)
      }
    },
    [context, objectKey, searchQuery, t.loadFailed]
  )

  useEffect(() => {
    window.__crmReload = () => loadData({ keepSelection: true, silent: true })
    return () => {
      delete window.__crmReload
    }
  }, [loadData])

  useEffect(() => {
    if (skipNextAutoLoadRef.current) {
      skipNextAutoLoadRef.current = false
      return
    }
    loadData()
  }, [loadData])

  const objects = data?.objects ?? []
  const currentObject = objects.find((object) => object.objectKey === objectKey) ?? data?.selectedObject ?? objects[0] ?? null
  const fields = data?.fields ?? currentObject?.fields ?? []
  const table = data?.table ?? { key: 'records', items: [], total: 0, page: 1, pageSize: PAGE_SIZE }
  const defaultColumnKeys = useMemo(() => getDefaultColumnKeys(data, fields), [data, fields])
  const columns = useMemo(
    () => getColumnsFromKeys(fields, visibleColumnKeys.length ? visibleColumnKeys : defaultColumnKeys),
    [defaultColumnKeys, fields, visibleColumnKeys]
  )
  const sortedItems = useMemo(() => sortRecords(table.items, columns[0], sortMode), [table.items, columns, sortMode])
  const relationLabels = useMemo(() => getRelationLabels(data), [data])
  const relatedSections = useMemo(() => getRelatedRecordSections(data), [data])
  const timelineItems = useMemo(() => getTimelineItems(data), [data])
  const firstMeasureColumn = columns.find((field) => field.type !== 'relation') ?? columns[0]
  const objectTitle = currentObject?.pluralLabel || currentObject?.label || objectKey
  const objectLabel = currentObject?.label || objectKey
  const activeView = data?.views?.find((item) => item.isDefault) ?? data?.views?.[0] ?? null

  useEffect(() => {
    setVisibleColumnKeys(defaultColumnKeys)
  }, [defaultColumnKeys, objectKey])

  function selectObject(nextObjectKey: string) {
    setObjectKey(nextObjectKey)
    setSelected(null)
    setDraft({})
    setMode('closed')
    setSearchDraft('')
    setSearchQuery('')
    setSortMode('server')
    setCheckedIds(new Set())
    setVisibleColumnKeys([])
  }

  function openRecord(record: CrmRecord | null, nextFields: CrmField[] = fields, nextMode: Mode = 'view') {
    setSelected(record)
    setDraft(toFormValues(nextFields, record?.values ?? {}))
    setMode(record ? nextMode : 'closed')
    setNotice('')
  }

  async function openRelatedRecord(nextObjectKey: string, recordId: string) {
    if (!nextObjectKey || !recordId) return
    if (nextObjectKey !== objectKey || searchQuery) {
      skipNextAutoLoadRef.current = true
    }
    setObjectKey(nextObjectKey)
    setSearchDraft('')
    setSearchQuery('')
    setSortMode('server')
    setCheckedIds(new Set())
    setVisibleColumnKeys([])
    await loadData({
      objectKey: nextObjectKey,
      searchQuery: '',
      recordId,
      keepSelection: true
    })
  }

  function startCreate() {
    setSelected(null)
    setDraft(toFormValues(fields, {}, true))
    setMode('create')
    setNotice('')
  }

  function updateDraft(fieldKey: string, value: unknown) {
    setDraft((current) => ({ ...current, [fieldKey]: value }))
  }

  async function saveDraft() {
    const values = normalizeFormValues(fields, draft)
    setBusy(true)
    setNotice('')
    try {
      const actionKey = selected?.id ? 'update_record' : 'create_record'
      const response = await executeAction(
        actionKey,
        selected?.id ?? null,
        selected?.id ? { recordId: selected.id, objectKey, values } : { objectKey, values },
        { objectKey }
      )
      const result = unwrap(response) as Record<string, unknown>
      if (result.success === false) throw new Error(resolveText(result.message, locale) || t.saveFailed)
      const savedRecord = (result.data && isObject(result.data) ? result.data : result) as unknown as CrmRecord
      const message = resolveText(result.message, locale) || t.saved
      notify(message)
      setNotice(message)
      await loadData({ recordId: typeof savedRecord.id === 'string' ? savedRecord.id : undefined, keepSelection: true, silent: true })
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : t.saveFailed
      setNotice(message)
      notify(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  function applySearch() {
    setSearchQuery(searchDraft.trim())
    setCheckedIds(new Set())
  }

  function toggleDensity() {
    setDensity((current) => (current === 'compact' ? 'comfortable' : 'compact'))
  }

  function toggleRecordChecked(recordId: string, checked: boolean) {
    setCheckedIds((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(recordId)
      } else {
        next.delete(recordId)
      }
      return next
    })
  }

  function toggleAllVisible(checked: boolean) {
    setCheckedIds((current) => {
      const next = new Set(current)
      sortedItems.forEach((record) => {
        if (checked) {
          next.add(record.id)
        } else {
          next.delete(record.id)
        }
      })
      return next
    })
  }

  async function updateVisibleColumns(fieldKey: string, checked: boolean) {
    const currentKeys = visibleColumnKeys.length ? visibleColumnKeys : defaultColumnKeys
    const nextKeys = checked ? [...currentKeys, fieldKey] : currentKeys.filter((key) => key !== fieldKey)
    const uniqueKeys = [...new Set(nextKeys)].filter((key) => fields.some((field) => field.fieldKey === key))
    if (!uniqueKeys.length) {
      setNotice(t.atLeastOneColumn)
      notify(t.atLeastOneColumn, 'error')
      return
    }
    setVisibleColumnKeys(uniqueKeys)
    setNotice('')
    try {
      const response = await executeAction(
        'update_view_columns',
        activeView?.viewKey ?? null,
        {
          objectKey,
          viewKey: activeView?.viewKey || 'all',
          columns: uniqueKeys
        },
        { objectKey }
      )
      const result = unwrap(response) as Record<string, unknown>
      if (result.success === false) throw new Error(resolveText(result.message, locale) || t.saveFailed)
      const message = resolveText(result.message, locale) || t.viewSaved
      setNotice(message)
      notify(message)
      await loadData({ keepSelection: true, silent: true })
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : t.saveFailed
      setNotice(message)
      notify(message, 'error')
      setVisibleColumnKeys(currentKeys)
    }
  }

  const selectedCount = checkedIds.size
  const sortTarget = columns[0]?.label || columns[0]?.fieldKey || objectLabel
  const sortLabel = sortMode === 'asc' ? t.ascending : sortMode === 'desc' ? t.descending : t.noSorting

  return (
    <main className={`crm20-shell crm20-${density}`}>
      <aside className="crm20-sidebar" aria-label={t.objects}>
        <div className="crm20-workspace">
          <span className="crm20-workspace-mark">X</span>
          <span className="crm20-workspace-name">{t.workspace}</span>
          <Icon name="chevron" />
        </div>
        <div className="crm20-sidebar-switcher" aria-label={t.viewMode}>
          <Button variant="ghost" size="icon" className="crm20-switcher-active" title="Home">
            <Icon name="home" />
          </Button>
          <Button variant="ghost" size="icon" title={t.searchPlaceholder} onClick={() => searchRef.current?.focus()}>
            <Icon name="message" />
          </Button>
        </div>
        <Button variant="outline" className="crm20-chat-button">
          <Icon name="message-plus" />
          <span>{t.newChat}</span>
        </Button>
        <div className="crm20-nav-section">{t.nativeCrm}</div>
        <nav className="crm20-object-nav">
          {objects.map((object) => (
            <Button
              variant="ghost"
              key={object.objectKey}
              className={object.objectKey === objectKey ? 'is-active' : ''}
              onClick={() => selectObject(object.objectKey)}
            >
              <span className={`crm20-object-icon crm20-object-${object.objectKey}`}>
                <Icon name={objectIcon(object)} />
              </span>
              <span>{object.pluralLabel || object.label || object.objectKey}</span>
            </Button>
          ))}
        </nav>
      </aside>

      <section className="crm20-main">
        <header className="crm20-object-header">
          <div className="crm20-object-title">
            <span className={`crm20-title-icon crm20-object-${objectKey}`}>
              <Icon name={currentObject ? objectIcon(currentObject) : 'grid'} />
            </span>
            <strong>{objectTitle}</strong>
          </div>
          <div className="crm20-header-actions">
            <Button variant="ghost" size="icon" title={t.refresh} onClick={() => loadData({ keepSelection: true })} disabled={busy}>
              <Icon name="refresh" />
            </Button>
            <Button onClick={startCreate} disabled={busy}>
              <Icon name="plus" />
              <span>{locale === 'zh_Hans' ? `${t.create} ${objectLabel}` : `New ${objectLabel}`}</span>
            </Button>
            <Button variant="ghost" size="icon" title={t.options} onClick={toggleDensity}>
              <Icon name="more" />
            </Button>
          </div>
        </header>

        <div className="crm20-viewbar">
          <Button variant="ghost" className="crm20-view-name">
            <Icon name="list" />
            <span>{data?.views?.[0]?.name || `${t.allRecords} ${objectTitle}`}</span>
            <span className="crm20-view-count">{table.total || 0}</span>
            <Icon name="chevron" />
          </Button>
          <div className="crm20-view-actions">
            <label className="crm20-search">
              <Icon name="search" />
              <Input
                ref={searchRef}
                value={searchDraft}
                placeholder={t.searchPlaceholder}
                onChange={(event) => setSearchDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applySearch()
                }}
              />
            </label>
            <Button variant="ghost" className="crm20-toolbar-button" onClick={() => searchRef.current?.focus()}>
              {t.filter}
              {searchQuery ? <Badge variant="secondary">{t.searchActive}</Badge> : null}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className={sortMode === 'server' ? 'crm20-toolbar-button' : 'crm20-toolbar-button is-active'}>
                  {t.sort}
                  <span className="crm20-toolbar-meta">{sortLabel}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="crm20-dropdown">
                <DropdownMenuLabel>
                  {t.sortBy} {sortTarget}
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
                  <DropdownMenuRadioItem value="server">{t.noSorting}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="asc">{t.ascending}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="desc">{t.descending}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className={density === 'compact' ? 'crm20-toolbar-button is-active' : 'crm20-toolbar-button'}>
                  {t.options}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="crm20-dropdown">
                <DropdownMenuLabel>{t.tableDensity}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => setDensity('comfortable')}>{t.comfortableDensity}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDensity('compact')}>{t.compactDensity}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t.visibleFields}</DropdownMenuLabel>
                {fields.map((field) => (
                  <DropdownMenuCheckboxItem
                    key={field.fieldKey}
                    checked={(visibleColumnKeys.length ? visibleColumnKeys : defaultColumnKeys).includes(field.fieldKey)}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(checked) => updateVisibleColumns(field.fieldKey, checked === true)}
                  >
                    {field.label || field.fieldKey}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => loadData({ keepSelection: true })}>{t.refresh}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {notice ? <div className="crm20-notice">{notice}</div> : null}

        <section className="crm20-content">
          <div className="crm20-table-panel">
            <div className={selectedCount ? 'crm20-selection-slot is-visible' : 'crm20-selection-slot'}>
              {selectedCount ? (
                <div className="crm20-selection-bar">
                  <Badge variant="secondary">{selectedCount}</Badge>
                  <strong>
                    {selectedCount} {t.selectedCount}
                  </strong>
                  <span>
                    {t.visibleRows} {sortedItems.length}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setCheckedIds(new Set())}>
                    {t.clearSelection}
                  </Button>
                </div>
              ) : null}
            </div>
            <RecordGrid
              columns={columns}
              fields={fields}
              records={sortedItems}
              selectedId={selected?.id}
              checkedIds={checkedIds}
              objectKey={objectKey}
              locale={locale}
              relationLabels={relationLabels}
              t={t}
              busy={busy}
              onSelect={(record) => openRecord(record)}
              onToggleRecord={toggleRecordChecked}
              onToggleAll={toggleAllVisible}
              onCreate={startCreate}
            />
            <footer className="crm20-table-footer">
              <Button variant="ghost" className="crm20-add-row" onClick={startCreate}>
                <Icon name="plus" />
                <span>{t.addNew}</span>
              </Button>
              <div className="crm20-calculation">
                <span>{t.calculate}</span>
                <Icon name="chevron" />
                <strong>
                  {t.countAll} {table.total || sortedItems.length}
                </strong>
                {firstMeasureColumn ? (
                  <strong>
                    {t.notEmpty} {firstMeasureColumn.label || firstMeasureColumn.fieldKey}{' '}
                    {countNonEmpty(sortedItems, firstMeasureColumn.fieldKey)}
                  </strong>
                ) : null}
              </div>
            </footer>
          </div>

          <Inspector
            mode={mode}
            record={selected}
            fields={fields}
            draft={draft}
            locale={locale}
            t={t}
            objectLabel={objectLabel}
            objectKey={objectKey}
            relationLabels={relationLabels}
            relatedSections={relatedSections}
            timelineItems={timelineItems}
            busy={busy}
            onChange={updateDraft}
            onEdit={() => setMode('edit')}
            onClose={() => setMode('closed')}
            onCancel={() => {
              if (selected) {
                openRecord(selected, fields, 'view')
              } else {
                setMode('closed')
              }
            }}
            onOpenRelatedRecord={openRelatedRecord}
            onSave={saveDraft}
          />
        </section>
      </section>
    </main>
  )
}
