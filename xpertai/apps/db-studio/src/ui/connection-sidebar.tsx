import { Button, ControlInput, SelectField, Table, SelectOption } from './controls'
import { translate } from './i18n'
import * as React from 'react'
import { Badge } from '@xpert-ai/plugin-shadcn-ui'
import {
  Database,
  Play,
  Square,
  Plus,
  Search,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  Braces,
  ChevronRight,
  Table2,
  FileCode2,
  Network,
  History,
  Star,
  BarChart3,
  ArrowDownToLine,
  ArrowUpFromLine,
  Sparkles,
  ShieldCheck,
  X,
} from 'lucide-react'
import {
  splitWorkbenchSql,
  quoteDatabaseIdentifier,
  type DatabaseCapabilities,
  type DatabaseObjectRef,
  type DatabaseObjectDetail,
  type DatabaseObjectPage,
  type DatabaseLocation,
  type DatabaseResult,
  type DataSourceSummary,
  type DatabaseValue,
} from '@xpert-ai/plugin-sdk/data-workbench'
import { SqlEditor, type EditorHandle } from './editor'
import { PolicyDialog, type ConnectionPolicy } from './policy-dialog'
import { Dashboard } from './dashboard'
import { ResultTable } from './result-table'
import { ChartPanel, PivotPanel, ErPanel, type ChartConfig } from './analysis-panels'
import { compareSnapshots, documentation, type Snapshot } from './schema-tools'
import { action, data, command, onHost, startBridge, upload, type JsonRecord } from './bridge'
import {
  uid,
  blank,
  targetEmpty,
  newDraft,
  jsonContent,
  cleanTarget,
  download,
  type Target,
  type SavedRecord,
  type Draft,
  type QueryReceipt,
  type Run,
  type Plan,
} from './model'
import type { StudioState } from './controller'
import { SidebarLayout } from './workbench-layout'
export function ConnectionSidebar(props: StudioState) {
  const {
    zh,
    ready,
    sources,
    target,
    locations,
    objects,
    objectPage,
    hasObjects,
    search,
    setSearch,
    caps,
    connectionError,
    connectionLoading,
    creatingConnection,
    createConnection,
    retryConnection,
    detail,
    panel,
    collapsed,
    setCollapsed,
    plan,
    setShowPolicy,
    policy,
    setPolicy,
    active,
    engine,
    connection,
    protect,
    requestItem,
    saveAll,
    loadObjects,
    selectConnection,
    selectLocation,
    inspect,
    readTable,
    loadList,
  } = props
  return (
    <aside className={collapsed ? 'sidebar collapsed' : 'sidebar'}>
      <div className="sidebar-heading">
        <Button title={translate(zh, 'm_25559eb2')} aria-label={translate(zh, 'm_25559eb2')} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </Button>
        {!collapsed && (
          <>
            <strong>{translate(zh, 'm_2ae89b8a')}</strong>
            <Button
              title={translate(zh, 'm_597f3537')}
              aria-label={translate(zh, 'm_597f3537')}
              disabled={!ready || creatingConnection}
              onClick={() => void protect(createConnection)}
            >
              <Plus size={17} />
            </Button>
          </>
        )}
      </div>
      {!collapsed && (
        <>
          <SelectField
            aria-label={translate(zh, 'm_ec96e70b')}
            className="connection-select"
            value={target.dataSourceId}
            disabled={!ready || Boolean(active.target.sessionId)}
            onChange={(event) => void protect(() => selectConnection(event.target.value))}
          >
            <SelectOption value="">{translate(zh, 'm_e2e07196')}</SelectOption>
            {sources.map((source) => (
              <SelectOption key={source.id} value={source.id}>
                {source.name} · {source.engine}
              </SelectOption>
            ))}
          </SelectField>
          {connectionLoading && <p className="connection-feedback muted" role="status">{translate(zh, 'connection_loading')}</p>}
          {connectionError && (
            <div className="connection-feedback" role="alert">
              <strong>{translate(zh, 'connection_failed')}</strong>
              <details><summary>{translate(zh, 'connection_error_details')}</summary><p>{connectionError}</p></details>
              <Button onClick={retryConnection}>{translate(zh, 'connection_retry')}</Button>
            </div>
          )}
          {caps && (
            <div className="connection-meta">
              <span className="dot" />
              {caps.engine}
              <span title={caps.version}>{caps.version}</span>
            </div>
          )}
          <SelectField
            aria-label={translate(zh, 'm_725559da')}
            disabled={!caps || connectionLoading || !locations.length || Boolean(active.target.sessionId)}
            className="location-select"
            value={locations.findIndex((location) => location.database === target.database && location.schema === target.schema)}
            onChange={(event) => void protect(() => selectLocation(Number(event.target.value)))}
          >
            <SelectOption value={-1}>{translate(zh, target.dataSourceId ? 'location_placeholder' : 'm_e2e07196')}</SelectOption>
            {locations.map((location, i) => (
              <SelectOption value={i} key={i}>
                {[location.database, location.schema].filter(Boolean).join(' / ')}
              </SelectOption>
            ))}
          </SelectField>
          <form
            className="object-search"
            onSubmit={(event) => {
              event.preventDefault()
              if (caps && !connectionLoading) void protect(() => loadObjects(target, 1))
            }}
          >
            <ControlInput
              aria-label={translate(zh, 'm_9277b744')}
              disabled={!caps || connectionLoading}
              placeholder={translate(zh, 'm_3af242a9')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button type="submit" variant="ghost" size="icon-sm" disabled={!caps || connectionLoading} title={translate(zh, 'm_9277b744')} aria-label={translate(zh, 'm_9277b744')}>
              <Search size={14} />
            </Button>
          </form>
          <div className="object-label">
            {translate(zh, 'm_4e4481ee')}
            <Button title={translate(zh, 'm_140abb82')} aria-label={translate(zh, 'm_140abb82')}
              disabled={!caps || connectionLoading} onClick={() => void protect(() => loadObjects(target))}>
              <RefreshCw size={13} />
            </Button>
          </div>
          <SidebarLayout zh={zh} objects={<>
          <div className="object-tree" role="tree">
            {objects.map((object) => (
              <div className="object-row" key={object.name}>
                <Button
                  role="treeitem"
                  aria-selected={detail?.object.name === object.name}
                  onClick={() => void protect(() => inspect(object))}
                  onDoubleClick={() => readTable(object)}
                >
                  {object.kind === 'view' ? <FileCode2 size={14} /> : <Table2 size={14} />}
                  <span>{object.name}</span>
                </Button>
                <Button title={translate(zh, 'm_7a87f6f7')} onClick={() => readTable(object)}>
                  <ChevronRight size={13} />
                </Button>
              </div>
            ))}
            {!objects.length && (
              <p className="muted empty-small">{connectionLoading ? translate(zh, 'connection_loading') : connectionError ? translate(zh, 'connection_unavailable') : target.dataSourceId ? translate(zh, 'm_86763d84') : translate(zh, 'm_df80d695')}</p>
            )}
          </div>
          {(hasObjects || objectPage > 1) && (
            <div className="pagination">
              <Button disabled={objectPage === 1} onClick={() => void protect(() => loadObjects(target, objectPage - 1))}>
                ‹
              </Button>
              {objectPage}
              <Button disabled={!hasObjects} onClick={() => void protect(() => loadObjects(target, objectPage + 1))}>
                ›
              </Button>
            </div>
          )}
          </>} navigation={<nav className="collections">
            {[
              ['execution', History, translate(zh, 'm_29fe68f7')],
              ['favorite', Star, translate(zh, 'm_7a9728cc')],
              ['chart_saved', BarChart3, translate(zh, 'm_a364356f')],
              ['dashboard', BarChart3, translate(zh, 'm_6ea6d448')],
              ['snapshot', Network, translate(zh, 'm_a25928cd')],
              ['plan', ShieldCheck, translate(zh, 'm_2dc6e570')],
            ].map(([key, Icon, label]) => {
              const Glyph = Icon as typeof History
              return (
                <Button
                  key={String(key)}
                  className={panel === key ? 'selected' : ''}
                  onClick={() => void protect(() => loadList(key === 'chart_saved' ? 'chart' : String(key)))}
                >
                  <Glyph size={15} />
                  {String(label)}
                </Button>
              )
            })}
            <Button
              onClick={() =>
                void protect(async () => {
                  setPolicy(await requestItem('policy', target))
                  setShowPolicy(true)
                })
              }
              disabled={!target.dataSourceId}
            >
              <ShieldCheck size={15} />
              {translate(zh, 'm_41e7faf0')}
            </Button>
          </nav>} />
        </>
      )}
    </aside>
  )
}
