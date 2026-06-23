import { React, ReactDOM, h } from './vendor'
import {
  Badge,
  Button,
  Card,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table as ShadcnTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  installShadcnThemeVars
} from '@xpert-ai/plugin-shadcn-ui'
import { injectStyles } from './styles'
import { createTranslator, TranslationKey } from './i18n'
import {
  executeAction,
  getErrorMessage,
  getResponsePayload,
  notify,
  post,
  reportResize,
  request,
  resolveMessage,
  setRuntimeText,
  startRemoteBridge
} from './runtime'

installShadcnThemeVars({ styleId: 'wechat-workbench-shadcn-ui-vars' })

type TabKey = 'dashboard' | 'accounts' | 'conversations' | 'messages' | 'queue' | 'config' | 'logs'
type TableKey = 'accounts' | 'conversations' | 'messages' | 'queue' | 'logs'
type Translator = (key: TranslationKey) => string
type PagedTableState = {
  items: any[]
  total: number
  page: number
  pageSize: number
  search: string
  filters: Record<string, unknown>
  busy: boolean
  loaded: boolean
}

const DEFAULT_TABLE_PAGE_SIZE = 20
const TABLE_KEYS: TableKey[] = ['accounts', 'conversations', 'messages', 'queue', 'logs']
const SELECT_EMPTY_VALUE = '__all__'
const TRANSLATABLE_VALUE_KEYS: Record<string, TranslationKey> = {
  disabled: 'disabled',
  deferred: 'deferred',
  dispatched: 'dispatched',
  history_only: 'history_only',
  error: 'error',
  failed: 'failed',
  group: 'groupChat',
  inbound: 'inbound',
  info: 'infoLevel',
  offline: 'offline',
  online: 'online',
  outbound: 'outbound',
  paused: 'paused',
  private: 'privateChat',
  private_only: 'privateOnly',
  queued: 'queued',
  received: 'received',
  sent: 'sent',
  sending: 'sending',
  skipped: 'skipped',
  cancelled: 'cancelled',
  context_reset: 'context_reset',
  system: 'system',
  group_only: 'groupOnly',
  unknown: 'unknown'
}

function createTableState(): PagedTableState {
  return {
    items: [],
    total: 0,
    page: 1,
    pageSize: DEFAULT_TABLE_PAGE_SIZE,
    search: '',
    filters: {},
    busy: false,
    loaded: false
  }
}

function createInitialTablePages(): Record<TableKey, PagedTableState> {
  return TABLE_KEYS.reduce(
    (state, key) => ({
      ...state,
      [key]: createTableState()
    }),
    {} as Record<TableKey, PagedTableState>
  )
}

function App() {
  const [context, setContext] = React.useState(null)
  const [data, setData] = React.useState(null)
  const [tab, setTab] = React.useState<TabKey>('dashboard')
  const [search, setSearch] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [tablePages, setTablePages] = React.useState<Record<TableKey, PagedTableState>>(() => createInitialTablePages())
  const [draft, setDraft] = React.useState({ integrationId: '', uuid: '', contactId: '', content: '' })
  const contextRef = React.useRef(null)
  const searchRef = React.useRef('')
  const tabRef = React.useRef<TabKey>('dashboard')
  const tablePagesRef = React.useRef<Record<TableKey, PagedTableState>>(tablePages)
  const t = createTranslator(context?.locale)

  React.useEffect(() => {
    setRuntimeText({
      requestTimeout: t('requestTimeout'),
      remoteRequestFailed: t('remoteRequestFailed'),
      unknownError: t('unknownError')
    })
  }, [context?.locale])

  React.useEffect(() => {
    searchRef.current = search
  }, [search])

  React.useEffect(() => {
    tabRef.current = tab
  }, [tab])

  React.useEffect(() => {
    tablePagesRef.current = tablePages
  }, [tablePages])

  React.useEffect(() => {
    startRemoteBridge(
      (nextContext) => {
        contextRef.current = nextContext
        setContext(nextContext)
        setData(nextContext.payload || null)
        setTimeout(() => reload(nextContext), 0)
      },
      () => reload()
    )
    post('ready')
  }, [])

  React.useEffect(() => {
    if (isPagedTable(tab)) {
      loadTable(tab)
    }
  }, [tab])

  React.useEffect(reportResize, [data, tab, busy, tablePages])

  async function reload(nextContext?: any) {
    const activeContext = nextContext || contextRef.current || context
    if (!activeContext) {
      return
    }
    setBusy(true)
    try {
      const response = await request('requestData', {
        query: {
          page: 1,
          pageSize: 200,
          search: searchRef.current
        }
      })
      setData(getResponsePayload(response) || null)
      if (isPagedTable(tabRef.current)) {
        await loadTable(tabRef.current)
      }
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function loadTable(table: TableKey, patch: Partial<PagedTableState> = {}) {
    const current = tablePagesRef.current[table] || createTableState()
    const next: PagedTableState = {
      ...current,
      ...patch,
      filters: patch.filters || current.filters || {},
      pageSize: normalizePageSize(patch.pageSize ?? current.pageSize)
    }
    setTablePages((prev) => ({
      ...prev,
      [table]: {
        ...next,
        busy: true
      }
    }))
    try {
      const response = await request('requestData', {
        query: {
          page: next.page,
          pageSize: next.pageSize,
          search: next.search,
          parameters: {
            table,
            filtersJson: JSON.stringify(next.filters || {})
          }
        }
      })
      const payload = getResponsePayload(response) || {}
      const tableResult = payload.table || payload.tables?.[table] || {}
      const items = asArray(tableResult.items)
      const total = normalizeCount(tableResult.total, items.length)
      const page = normalizePage(tableResult.page || next.page)
      const pageSize = normalizePageSize(tableResult.pageSize || next.pageSize)
      setTablePages((prev) => ({
        ...prev,
        [table]: {
          ...next,
          items,
          total,
          page,
          pageSize,
          busy: false,
          loaded: true
        }
      }))
      setData((prev: any) => ({
        ...(prev || {}),
        scope: payload.scope || prev?.scope,
        integrationId: payload.integrationId === undefined ? prev?.integrationId : payload.integrationId,
        [table]: items
      }))
    } catch (error) {
      setTablePages((prev) => ({
        ...prev,
        [table]: {
          ...prev[table],
          busy: false
        }
      }))
      notify('error', getErrorMessage(error))
    }
  }

  async function runAction(actionKey: string, targetId?: string | null, input?: any) {
    setBusy(true)
    try {
      const response = await executeAction(actionKey, targetId || null, input || {}, {})
      const result = getResponsePayload(response)
      if (result && result.success === false) {
        throw new Error(resolveMessage(result.message, contextRef.current?.locale) || t('operationFailed'))
      }
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('operationCompleted'))
      await reload()
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const summary = data?.summary || {}
  const callback = data?.callbackConfig || {}
  const integrations = Array.isArray(data?.integrations) ? data.integrations : []
  const isOrganizationScope = data?.scope === 'organization'
  const accounts = data?.accounts || []
  const conversations = data?.conversations || []
  const messages = data?.messages || []
  const queue = data?.queue || []
  const logs = data?.logs || messages
  const config = data?.config || {}
  const tunnel = data?.tunnel || null
  const dashboard = React.useMemo(() => buildDashboard(data), [data])
  const accountTable = withFallbackTable(tablePages.accounts, accounts)
  const conversationTable = withFallbackTable(tablePages.conversations, conversations)
  const messageTable = withFallbackTable(tablePages.messages, messages)
  const queueTable = withFallbackTable(tablePages.queue, queue)
  const logTable = withFallbackTable(tablePages.logs, logs)

  if (data?.missingIntegration) {
    return (
      <div className="wxp-app">
        <div className="xui-notice">{resolveMessage(data.message, context?.locale) || t('missingIntegrationFallback')}</div>
      </div>
    )
  }

  return (
    <div className="wxp-app">
      <div className="wxp-sticky-head">
        <div className="wxp-head">
          <div className="wxp-title">
            <strong>{t('appTitle')}</strong>
            <span>{t('appSubtitle')}</span>
          </div>
          <div className="wxp-actions">
            <Input
              value={search}
              placeholder={t('searchPlaceholder')}
              onChange={(event: any) => setSearch(event.target.value)}
              onKeyDown={(event: any) => {
                if (event.key === 'Enter') {
                  reload()
                }
              }}
            />
            <Button disabled={busy} onClick={() => reload()}>
              {busy ? t('refreshing') : t('refresh')}
            </Button>
          </div>
        </div>

        <div className="wxp-tabs">
          <TabButton tabKey="dashboard" label={t('dashboard')} active={tab} setTab={setTab} />
          <TabButton tabKey="accounts" label={t('account')} active={tab} setTab={setTab} />
          <TabButton tabKey="conversations" label={t('conversation')} active={tab} setTab={setTab} />
          <TabButton tabKey="messages" label={t('message')} active={tab} setTab={setTab} />
          <TabButton tabKey="queue" label={t('queue')} active={tab} setTab={setTab} />
          <TabButton tabKey="config" label={t('config')} active={tab} setTab={setTab} />
          <TabButton tabKey="logs" label={t('logs')} active={tab} setTab={setTab} />
        </div>
      </div>

      {tab === 'dashboard' && (
        <DashboardView dashboard={dashboard} summary={summary} tunnel={tunnel} isOrganizationScope={isOrganizationScope} t={t} />
      )}
      {tab === 'accounts' && (
        <AccountsView
          accounts={accounts}
          table={accountTable}
          callback={callback}
          integrations={integrations}
          isOrganizationScope={isOrganizationScope}
          t={t}
          onTableChange={(patch: Partial<PagedTableState>) => loadTable('accounts', patch)}
          onRegister={(account: any) => runAction('register_callback', account.uuid, { uuid: account.uuid, integrationId: account.integrationId })}
          onToggle={(account: any, enabled: boolean) =>
            runAction('set_account_enabled', account.uuid, { uuid: account.uuid, enabled, integrationId: account.integrationId })
          }
        />
      )}
      {tab === 'conversations' && (
        <ConversationsView
          conversations={conversations}
          table={conversationTable}
          isOrganizationScope={isOrganizationScope}
          t={t}
          onTableChange={(patch: Partial<PagedTableState>) => loadTable('conversations', patch)}
          onReset={(item: any) => runAction('restart_conversation', item.id, { bindingId: item.id, integrationId: item.integrationId })}
        />
      )}
      {tab === 'messages' && (
        <MessagesView
          messages={messages}
          table={messageTable}
          isOrganizationScope={isOrganizationScope}
          t={t}
          onTableChange={(patch: Partial<PagedTableState>) => loadTable('messages', patch)}
          onResend={(item: any) => runAction('resend_message', item.id, { integrationId: item.integrationId })}
        />
      )}
      {tab === 'config' && (
        <ConfigView
          config={config}
          callback={callback}
          integrations={integrations}
          tunnel={tunnel}
          isOrganizationScope={isOrganizationScope}
          draft={draft}
          setDraft={setDraft}
          t={t}
          onSend={() => runAction('send_text', null, draft)}
        />
      )}
      {tab === 'queue' && (
        <QueueView
          queue={queue}
          table={queueTable}
          isOrganizationScope={isOrganizationScope}
          t={t}
          onTableChange={(patch: Partial<PagedTableState>) => loadTable('queue', patch)}
          onCancel={(item: any) => runAction('cancel_queue_item', item.id, { id: item.id, integrationId: item.integrationId })}
          onRetry={(item: any) => runAction('retry_queue_item', item.id, { id: item.id, integrationId: item.integrationId })}
          onPause={(item: any) => runAction('pause_outbound_account', item.uuid, { uuid: item.uuid, integrationId: item.integrationId })}
          onResume={(item: any) => runAction('resume_outbound_account', item.uuid, { uuid: item.uuid, integrationId: item.integrationId })}
        />
      )}
      {tab === 'logs' && (
        <LogsView
          logs={logs}
          table={logTable}
          isOrganizationScope={isOrganizationScope}
          t={t}
          onTableChange={(patch: Partial<PagedTableState>) => loadTable('logs', patch)}
        />
      )}
    </div>
  )
}

function DashboardView(props: any) {
  const dashboard = props.dashboard
  const t = props.t
  const summary = props.summary || {}
  const [calendarAccount, setCalendarAccount] = React.useState('all')
  const [calendarMode, setCalendarMode] = React.useState<'daily' | 'weekly' | 'cumulative'>('daily')

  React.useEffect(reportResize, [calendarAccount, calendarMode])

  return (
    <section className="wxp-dashboard">
      <div className="wxp-stats">
        {summary.integrationCount !== undefined && <Stat label={t('integration')} value={summary.integrationCount || 0} />}
        <Stat label={t('account')} value={summary.accountCount || 0} />
        <Stat label={t('conversation')} value={summary.conversationCount || 0} />
        <Stat label={t('message')} value={summary.recentMessageCount || 0} />
        <Stat label={t('error')} value={summary.errorCount || 0} />
        {props.tunnel && (
          <Stat label={t('tunnelStatus')} value={tunnelStatusLabel(props.tunnel, t)} helper={props.tunnel.wsUrl || ''} />
        )}
      </div>

      <div className="wxp-dashboard-grid">
        <Metric label={t('currentResultMessages')} value={dashboard.total} helper={t('currentResultHint')} />
        <Metric label={t('inboundMessages')} value={dashboard.inbound} helper={formatPercent(dashboard.inbound, dashboard.total)} />
        <Metric label={t('outboundMessages')} value={dashboard.outbound} helper={formatPercent(dashboard.outbound, dashboard.total)} />
        <Metric
          label={t('failedMessages')}
          value={dashboard.failed}
          helper={`${t('failureRate')} ${formatPercent(dashboard.failed, dashboard.total)}`}
          tone={dashboard.failed ? 'danger' : 'normal'}
        />
        <Metric label={t('activeContacts')} value={dashboard.activeContactCount} helper={t('currentResultHint')} />
        <Metric label={t('replyCoverage')} value={formatPercent(dashboard.outbound, dashboard.inbound)} helper={t('outboundInboundRatio')} />
      </div>

      <div className="wxp-dashboard-layout">
        <section className="wxp-analytics-panel wxp-analytics-panel-wide">
          <PanelTitle title={t('messageTrend')} meta={t('basedOnRecentLogs')} />
          <EchartsTrendChart
            items={dashboard.trend}
            t={t}
            emptyText={t('noDashboardData')}
            libraryMissingText={t('chartLibraryUnavailable')}
          />
        </section>
        <section className="wxp-analytics-panel wxp-analytics-panel-wide">
          <div className="wxp-calendar-head">
            <PanelTitle title={t('wechatMessageActivity')} meta={t('basedOnRecentLogs')} />
            <div className="wxp-calendar-controls">
              <label className="wxp-calendar-filter">
                <span>{t('accountFilter')}</span>
                <Select value={calendarAccount} onValueChange={(value: string) => setCalendarAccount(value)}>
                  <SelectTrigger aria-label={t('accountFilter')}>
                    <SelectValue placeholder={t('allAccounts')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('allAccounts')}</SelectItem>
                  {dashboard.accountOptions.map((account: any) => (
                    <SelectItem key={account.value} value={account.value}>
                      {account.label}
                    </SelectItem>
                  ))}
                  </SelectContent>
                </Select>
              </label>
              <div className="wxp-segmented">
                <Button variant={calendarMode === 'daily' ? 'secondary' : 'ghost'} size="sm" onClick={() => setCalendarMode('daily')}>
                  {t('calendarDaily')}
                </Button>
                <Button variant={calendarMode === 'weekly' ? 'secondary' : 'ghost'} size="sm" onClick={() => setCalendarMode('weekly')}>
                  {t('calendarWeekly')}
                </Button>
                <Button variant={calendarMode === 'cumulative' ? 'secondary' : 'ghost'} size="sm" onClick={() => setCalendarMode('cumulative')}>
                  {t('calendarCumulative')}
                </Button>
              </div>
            </div>
          </div>
          <WechatActivityCalendar
            logs={dashboard.logs}
            accountUuid={calendarAccount}
            mode={calendarMode}
            t={t}
            emptyText={t('noDashboardData')}
          />
        </section>
        <section className="wxp-analytics-panel">
          <PanelTitle title={t('trafficByDirection')} meta={t('currentResultHint')} />
          <BreakdownList items={dashboard.directionBreakdown} emptyText={t('noDashboardData')} />
        </section>
        <section className="wxp-analytics-panel">
          <PanelTitle title={t('trafficByStatus')} meta={t('currentResultHint')} />
          <BreakdownList items={dashboard.statusBreakdown} emptyText={t('noDashboardData')} />
        </section>
        <section className="wxp-analytics-panel">
          <PanelTitle title={t('chatTypeMix')} meta={t('currentResultHint')} />
          <BreakdownList items={dashboard.chatTypeBreakdown} emptyText={t('noDashboardData')} />
        </section>
        <section className="wxp-analytics-panel">
          <PanelTitle title={t('accountHealth')} meta={t('allAccountsHint')} />
          <BreakdownList items={dashboard.accountHealth} emptyText={t('noAccountCallbacks')} />
        </section>
        {props.isOrganizationScope && (
          <section className="wxp-analytics-panel">
            <PanelTitle title={t('topIntegrations')} meta={t('basedOnRecentLogs')} />
            <RankList items={dashboard.topIntegrations} emptyText={t('noIntegrations')} />
          </section>
        )}
        <section className="wxp-analytics-panel">
          <PanelTitle title={t('topAccounts')} meta={t('basedOnRecentLogs')} />
          <RankList items={dashboard.topAccounts} emptyText={t('noDashboardData')} />
        </section>
        <section className="wxp-analytics-panel">
          <PanelTitle title={t('topContacts')} meta={t('basedOnRecentLogs')} />
          <RankList items={dashboard.topContacts} emptyText={t('noDashboardData')} />
        </section>
        <section className="wxp-analytics-panel">
          <PanelTitle title={t('recentFailures')} meta={t('needsAttention')} />
          <ActivityList items={dashboard.recentFailures} emptyText={t('noRecentFailures')} t={t} />
        </section>
        <section className="wxp-analytics-panel">
          <PanelTitle title={t('latestActivity')} meta={t('basedOnRecentLogs')} />
          <ActivityList items={dashboard.latestActivity} emptyText={t('noRuntimeLogs')} t={t} />
        </section>
      </div>
    </section>
  )
}

function AccountsView(props: any) {
  const filter = useTableFilterDraft(props.table, props.onTableChange)
  return (
    <section className="wxp-panel">
      <div className="wxp-callback">
        {props.isOrganizationScope ? (
          <div className="wxp-integration-list">
            <strong>{props.t('organizationCallbacks')}</strong>
            {(props.integrations || []).map((integration: any) => (
              <div className="wxp-integration-row" key={integration.id}>
                <div>
                  <span>{integration.name || integration.id}</span>
                  <code>{integration.callbackConfig?.globalWebhookUrl || ''}</code>
                </div>
                <div className="wxp-actions">
                  <Button variant="outline" size="sm" onClick={() => copyText(integration.callbackConfig?.globalWebhookUrl, props.t)}>
                    {props.t('copyUrl')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => copyText(integration.callbackConfig?.setCallbackCurlTemplate, props.t)}>
                    {props.t('copySetCallbackCurl')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div>
              <strong>{props.t('callbackGlobalWebhook')}</strong>
              <code>{props.callback.globalWebhookUrl || ''}</code>
            </div>
            <div className="wxp-actions">
              <Button variant="outline" onClick={() => copyText(props.callback.globalWebhookUrl, props.t)}>
                {props.t('copyUrl')}
              </Button>
              <Button variant="outline" onClick={() => copyText(props.callback.setCallbackCurlTemplate, props.t)}>
                {props.t('copySetCallbackCurl')}
              </Button>
            </div>
          </>
        )}
      </div>
      <TableFilters
        draft={filter.draft}
        setDraft={filter.setDraft}
        commitDraft={filter.commitDraft}
        t={props.t}
        onReset={() => {
          filter.reset()
          props.onTableChange({ page: 1, search: '', filters: {} })
        }}
      >
        {props.isOrganizationScope && <TextFilter field="integrationId" placeholder={props.t('integrationId')} {...filter} />}
        <TextFilter field="uuid" placeholder={props.t('uuid')} {...filter} />
        <SelectFilter
          field="status"
          label={props.t('status')}
          options={translatedOptions(['online', 'offline', 'unknown', 'disabled', 'error'], props.t)}
          {...filter}
        />
        <SelectFilter
          field="enabled"
          label={props.t('enabledState')}
          options={[
            { value: 'true', label: props.t('enabledOnly') },
            { value: 'false', label: props.t('disabledOnly') }
          ]}
          {...filter}
        />
      </TableFilters>
      <DataTable
        headers={[
          ...(props.isOrganizationScope ? [props.t('integration')] : []),
          props.t('uuid'),
          props.t('ownerWxid'),
          props.t('status'),
          props.t('lastCallback'),
          props.t('lastReply'),
          props.t('error'),
          props.t('action')
        ]}
        rows={props.table.items}
        loading={props.table.busy}
        loadingText={props.t('loading')}
        emptyText={props.t('noAccountCallbacks')}
        renderRow={(account: any) => [
          ...(props.isOrganizationScope ? [code(account.integrationId)] : []),
          code(account.uuid),
          display(account.ownerWxid || account.displayName),
          translatedPill(account.status || (account.enabled === false ? 'disabled' : 'unknown'), props.t),
          time(account.lastCallbackAt),
          time(account.lastSendAt),
          display(account.lastError),
          <div className="xui-actions">
            <Button variant="outline" size="sm" onClick={() => props.onRegister(account)}>
              {props.t('registerCallback')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => props.onToggle(account, account.enabled === false)}>
              {account.enabled === false ? props.t('enable') : props.t('disable')}
            </Button>
          </div>
        ]}
      />
      <Pagination table={props.table} t={props.t} onChange={props.onTableChange} />
    </section>
  )
}

function ConversationsView(props: any) {
  const filter = useTableFilterDraft(props.table, props.onTableChange)
  return (
    <section className="wxp-panel">
      <TableFilters
        draft={filter.draft}
        setDraft={filter.setDraft}
        commitDraft={filter.commitDraft}
        t={props.t}
        onReset={() => {
          filter.reset()
          props.onTableChange({ page: 1, search: '', filters: {} })
        }}
      >
        {props.isOrganizationScope && <TextFilter field="integrationId" placeholder={props.t('integrationId')} {...filter} />}
        <SelectFilter
          field="chatType"
          label={props.t('type')}
          options={[
            { value: 'private', label: props.t('privateChat') },
            { value: 'group', label: props.t('groupChat') }
          ]}
          {...filter}
        />
        <TextFilter field="uuid" placeholder={props.t('uuid')} {...filter} />
        <TextFilter field="contactId" placeholder={props.t('contact')} {...filter} />
        <TextFilter field="senderId" placeholder={props.t('sender')} {...filter} />
      </TableFilters>
      <DataTable
        headers={[
          ...(props.isOrganizationScope ? [props.t('integration')] : []),
          props.t('type'),
          props.t('uuid'),
          props.t('contact'),
          props.t('sender'),
          props.t('xpert'),
          props.t('conversationId'),
          props.t('updatedAt'),
          props.t('action')
        ]}
        rows={props.table.items}
        loading={props.table.busy}
        loadingText={props.t('loading')}
        emptyText={props.t('noConversationBindings')}
        renderRow={(item: any) => [
          ...(props.isOrganizationScope ? [code(item.integrationId)] : []),
          translatedPill(item.chatType, props.t),
          code(item.uuid),
          code(item.contactId),
          code(item.senderId),
          code(item.xpertId),
          code(item.conversationId),
          time(item.updatedAt),
          <Button variant="outline" size="sm" onClick={() => props.onReset(item)}>
            {props.t('reset')}
          </Button>
        ]}
      />
      <Pagination table={props.table} t={props.t} onChange={props.onTableChange} />
    </section>
  )
}

function MessagesView(props: any) {
  const filter = useTableFilterDraft(props.table, props.onTableChange)
  return (
    <section className="wxp-panel">
      <TableFilters
        draft={filter.draft}
        setDraft={filter.setDraft}
        commitDraft={filter.commitDraft}
        t={props.t}
        onReset={() => {
          filter.reset()
          props.onTableChange({ page: 1, search: '', filters: {} })
        }}
      >
        {props.isOrganizationScope && <TextFilter field="integrationId" placeholder={props.t('integrationId')} {...filter} />}
        <SelectFilter field="direction" label={props.t('direction')} options={translatedOptions(['inbound', 'outbound', 'system'], props.t)} {...filter} />
        <SelectFilter field="status" label={props.t('status')} options={translatedOptions(['received', 'dispatched', 'history_only', 'sent', 'skipped', 'failed', 'context_reset'], props.t)} {...filter} />
        <SelectFilter
          field="chatType"
          label={props.t('type')}
          options={[
            { value: 'private', label: props.t('privateChat') },
            { value: 'group', label: props.t('groupChat') }
          ]}
          {...filter}
        />
        <TextFilter field="uuid" placeholder={props.t('uuid')} {...filter} />
        <TextFilter field="contactId" placeholder={props.t('contact')} {...filter} />
      </TableFilters>
      <DataTable
        headers={[
          ...(props.isOrganizationScope ? [props.t('integration')] : []),
          props.t('direction'),
          props.t('status'),
          props.t('uuid'),
          props.t('contact'),
          props.t('sender'),
          props.t('content'),
          props.t('error'),
          props.t('time'),
          props.t('action')
        ]}
        rows={props.table.items}
        loading={props.table.busy}
        loadingText={props.t('loading')}
        emptyText={props.t('noMessageLogs')}
        renderRow={(item: any) => [
          ...(props.isOrganizationScope ? [code(item.integrationId)] : []),
          translatedPill(item.direction, props.t),
          translatedPill(item.status, props.t),
          code(item.uuid),
          code(item.contactId),
          code(item.senderId),
          <details>
            <summary>{clip(item.content, 80)}</summary>
            <pre>{item.payloadSummary || item.content || ''}</pre>
          </details>,
          display(item.error),
          time(item.createdAt),
          item.direction === 'outbound' ? (
            <Button variant="outline" size="sm" onClick={() => props.onResend(item)}>
              {props.t('resend')}
            </Button>
          ) : (
            ''
          )
        ]}
      />
      <Pagination table={props.table} t={props.t} onChange={props.onTableChange} />
    </section>
  )
}

function QueueView(props: any) {
  const filter = useTableFilterDraft(props.table, props.onTableChange)
  return (
    <section className="wxp-panel">
      <TableFilters
        draft={filter.draft}
        setDraft={filter.setDraft}
        commitDraft={filter.commitDraft}
        t={props.t}
        onReset={() => {
          filter.reset()
          props.onTableChange({ page: 1, search: '', filters: {} })
        }}
      >
        {props.isOrganizationScope && <TextFilter field="integrationId" placeholder={props.t('integrationId')} {...filter} />}
        <SelectFilter
          field="status"
          label={props.t('status')}
          options={translatedOptions(['queued', 'deferred', 'sending', 'paused', 'failed', 'cancelled', 'sent'], props.t)}
          {...filter}
        />
        <TextFilter field="uuid" placeholder={props.t('uuid')} {...filter} />
        <TextFilter field="contactId" placeholder={props.t('contact')} {...filter} />
      </TableFilters>
      <DataTable
        headers={[
          ...(props.isOrganizationScope ? [props.t('integration')] : []),
          props.t('status'),
          props.t('uuid'),
          props.t('contact'),
          props.t('queueJobId'),
          props.t('scheduledAt'),
          props.t('sentAt'),
          props.t('contentOrError'),
          props.t('action')
        ]}
        rows={props.table.items}
        loading={props.table.busy}
        loadingText={props.t('loading')}
        emptyText={props.t('noQueueItems')}
        renderRow={(item: any) => [
          ...(props.isOrganizationScope ? [code(item.integrationId)] : []),
          translatedPill(item.status, props.t),
          code(item.uuid),
          code(item.contactId),
          code(item.queueJobId),
          time(item.scheduledAt),
          time(item.sentAt),
          <QueueContentCell item={item} t={props.t} />,
          <div className="xui-actions">
            {['queued', 'deferred', 'paused'].includes(item.status) && (
              <Button variant="outline" size="sm" onClick={() => props.onCancel(item)}>
                {props.t('cancel')}
              </Button>
            )}
            {['failed', 'cancelled', 'paused'].includes(item.status) && (
              <Button variant="outline" size="sm" onClick={() => props.onRetry(item)}>
                {props.t('retry')}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => props.onPause(item)}>
              {props.t('pause')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => props.onResume(item)}>
              {props.t('resume')}
            </Button>
          </div>
        ]}
      />
      <Pagination table={props.table} t={props.t} onChange={props.onTableChange} />
    </section>
  )
}

function QueueContentCell(props: { item: any; t: Translator }) {
  const item = props.item || {}
  const payload = parseJsonRecord(item.payloadSummary)
  const hasError = Boolean(displayText(item.error))
  const type = payload?.type === 'image' ? 'image' : 'text'
  const summary = hasError ? queueErrorSummary(item.error, props.t) : queueContentSummary(item.content, payload, props.t)
  const meta = queueContentMeta(payload, props.t)
  const detail = queueContentDetail(item, payload, props.t)

  return (
    <div className={hasError ? 'wxp-message-cell wxp-message-cell-error' : 'wxp-message-cell'}>
      <div className="wxp-message-cell-head">
        <Badge variant={hasError ? 'destructive' : 'secondary'}>
          {hasError ? props.t('error') : type === 'image' ? props.t('imageMessage') : props.t('textMessage')}
        </Badge>
        {meta && <small>{meta}</small>}
      </div>
      <strong title={displayText(hasError ? item.error : item.content)}>{summary || '-'}</strong>
      {detail && (
        <details>
          <summary>{hasError ? props.t('errorDetail') : props.t('contentDetail')}</summary>
          <pre>{detail}</pre>
        </details>
      )}
    </div>
  )
}

function ConfigView(props: any) {
  return (
    <section className="wxp-config">
      <div className="wxp-panel">
        <h3>{props.isOrganizationScope ? props.t('integrations') : props.t('runtimeConfig')}</h3>
        {props.isOrganizationScope ? (
          <DataTable
            headers={[
              props.t('integration'),
              props.t('account'),
              props.t('conversation'),
              props.t('message'),
              props.t('error'),
              props.t('connectionMode'),
              props.t('tunnelClientId'),
              props.t('tunnelStatus')
            ]}
            rows={props.integrations || []}
            loadingText={props.t('loading')}
            emptyText={props.t('noIntegrations')}
            renderRow={(integration: any) => [
              code(integration.name || integration.id),
              String(integration.accountCount || 0),
              String(integration.conversationCount || 0),
              String(integration.recentMessageCount || 0),
              String(integration.errorCount || 0),
              connectionModeLabel(integration.config?.connectionMode, props.t),
              code(integration.config?.tunnelClientId || integration.config?.baseUrl),
              tunnelStatusLabel(integration.tunnel, props.t)
            ]}
          />
        ) : (
          <>
            {kv(props.t('connectionMode'), connectionModeLabel(props.config.connectionMode, props.t))}
            {kv(props.t('baseUrl'), props.config.baseUrl)}
            {kv(props.t('tunnelClientId'), props.config.tunnelClientId)}
            {kv(props.t('apiVersion'), props.config.apiVersion)}
            {kv(props.t('timeoutMs'), props.config.timeoutMs)}
            {kv(props.t('preferLanguage'), props.config.preferLanguage)}
            {kv(props.t('fallbackToLegacySendText'), String(props.config.fallbackToLegacySendText))}
          </>
        )}
      </div>
      <TunnelPanel tunnel={props.tunnel} t={props.t} />
      <div className="wxp-panel">
        <h3>{props.t('manualSend')}</h3>
        {props.isOrganizationScope && (
          <Input
            placeholder={props.t('integrationId')}
            value={props.draft.integrationId}
            onChange={(event: any) => props.setDraft(Object.assign({}, props.draft, { integrationId: event.target.value }))}
          />
        )}
        <Input
          placeholder={props.t('uuid')}
          value={props.draft.uuid}
          onChange={(event: any) => props.setDraft(Object.assign({}, props.draft, { uuid: event.target.value }))}
        />
        <Input
          placeholder={props.t('contactId')}
          value={props.draft.contactId}
          onChange={(event: any) => props.setDraft(Object.assign({}, props.draft, { contactId: event.target.value }))}
        />
        <Textarea
          placeholder={props.t('sendTextPlaceholder')}
          value={props.draft.content}
          onChange={(event: any) => props.setDraft(Object.assign({}, props.draft, { content: event.target.value }))}
        />
        <Button onClick={props.onSend}>
          {props.t('send')}
        </Button>
      </div>
    </section>
  )
}

function TunnelPanel(props: any) {
  const tunnel = props.tunnel || {}
  const setup = tunnel.setup || {}
  const settingJson = setup.settingJson || ''
  const sidecar = setup.sidecar || {}
  return (
    <div className="wxp-panel wxp-tunnel-panel">
      <div className="wxp-panel-title">
        <strong>{props.t('tunnelSetup')}</strong>
        {settingJson && (
          <Button variant="outline" size="sm" onClick={() => copyText(settingJson, props.t)}>
            {props.t('copyTunnelConfig')}
          </Button>
        )}
      </div>
      <div className="wxp-tunnel-grid">
        {kv(props.t('tunnelStatus'), tunnelStatusLabel(tunnel, props.t))}
        {kv(props.t('tunnelClientId'), tunnel.clientId)}
        {kv(props.t('tunnelLastSeen'), time(tunnel.lastSeenAt))}
        {kv(props.t('tunnelBindings'), tunnel.bindingCount)}
        {kv(props.t('sidecarWebsocketUrl'), sidecar.websocketUrl)}
        {kv(props.t('sidecarLocalListen'), sidecar.listenHost && sidecar.listenPort ? `${sidecar.listenHost}:${sidecar.listenPort}` : '')}
      </div>
      <div>
        <span className="xui-muted">{props.t('tunnelConfigSnippet')}</span>
        <pre>{settingJson || '-'}</pre>
      </div>
      <div>
        <span className="xui-muted">{props.t('sidecarCommand')}</span>
        <pre>{sidecar.command || '-'}</pre>
      </div>
    </div>
  )
}

function LogsView(props: any) {
  const filter = useTableFilterDraft(props.table, props.onTableChange)
  return (
    <section className="wxp-panel">
      <TableFilters
        draft={filter.draft}
        setDraft={filter.setDraft}
        commitDraft={filter.commitDraft}
        t={props.t}
        onReset={() => {
          filter.reset()
          props.onTableChange({ page: 1, search: '', filters: {} })
        }}
      >
        {props.isOrganizationScope && <TextFilter field="integrationId" placeholder={props.t('integrationId')} {...filter} />}
        <SelectFilter
          field="level"
          label={props.t('level')}
          options={[
            { value: 'info', label: props.t('infoLevel') },
            { value: 'error', label: props.t('errorLevel') }
          ]}
          {...filter}
        />
        <SelectFilter field="direction" label={props.t('direction')} options={translatedOptions(['inbound', 'outbound', 'system'], props.t)} {...filter} />
        <SelectFilter field="status" label={props.t('status')} options={translatedOptions(['received', 'dispatched', 'history_only', 'sent', 'skipped', 'failed', 'context_reset'], props.t)} {...filter} />
        <TextFilter field="uuid" placeholder={props.t('uuid')} {...filter} />
        <TextFilter field="contactId" placeholder={props.t('contact')} {...filter} />
      </TableFilters>
      <DataTable
        headers={[
          ...(props.isOrganizationScope ? [props.t('integration')] : []),
          props.t('level'),
          props.t('phase'),
          props.t('uuid'),
          props.t('contact'),
          props.t('contentOrError'),
          props.t('time')
        ]}
        rows={props.table.items}
        loading={props.table.busy}
        loadingText={props.t('loading')}
        emptyText={props.t('noRuntimeLogs')}
        renderRow={(item: any) => [
          ...(props.isOrganizationScope ? [code(item.integrationId)] : []),
          translatedPill(item.error || item.status === 'failed' ? 'error' : 'info', props.t),
          <Badge variant={badgeVariant(item.status)}>{phaseLabel(item, props.t)}</Badge>,
          code(item.uuid),
          code(item.contactId),
          display(item.error || clip(item.content, 120)),
          time(item.createdAt)
        ]}
      />
      <Pagination table={props.table} t={props.t} onChange={props.onTableChange} />
    </section>
  )
}

function Stat(props: { label: string; value: unknown; helper?: string }) {
  return (
    <Card className="wxp-stat">
      <span>{props.label}</span>
      <strong>{String(props.value)}</strong>
      {props.helper && <small>{props.helper}</small>}
    </Card>
  )
}

function Metric(props: { label: string; value: unknown; helper?: string; tone?: 'normal' | 'danger' }) {
  return (
    <Card className={props.tone === 'danger' ? 'wxp-metric wxp-metric-danger' : 'wxp-metric'}>
      <span>{props.label}</span>
      <strong>{String(props.value)}</strong>
      {props.helper && <small>{props.helper}</small>}
    </Card>
  )
}

function PanelTitle(props: { title: string; meta?: string }) {
  return (
    <div className="wxp-panel-title">
      <strong>{props.title}</strong>
      {props.meta && <span>{props.meta}</span>}
    </div>
  )
}

function EchartsTrendChart(props: {
  items: Array<{ label: string; count: number; inbound: number; outbound: number; failed: number }>
  t: Translator
  emptyText: string
  libraryMissingText: string
}) {
  const chartRef = React.useRef(null)

  React.useEffect(() => {
    const echarts = (window as any).echarts
    const element = chartRef.current as HTMLElement | null
    if (!element || !props.items.length || !echarts?.init) {
      return
    }

    const styles = getComputedStyle(document.documentElement)
    const textColor = readCssVar(styles, '--xui-color-muted-foreground', '#6b7280')
    const gridColor = readCssVar(styles, '--xui-color-border', '#e5e7eb')
    const primaryColor = readCssVar(styles, '--xui-color-primary', '#2f8cf6')
    const destructiveColor = readCssVar(styles, '--xui-color-destructive', '#ef4444')
    const outboundColor = readCssVar(styles, '--xui-color-success', primaryColor)
    const tooltipBackgroundColor = readCssVar(styles, '--xui-color-card', '#ffffff')
    const tooltipBorderColor = readCssVar(styles, '--xui-color-border', '#e5e7eb')
    const chart = echarts.init(element, undefined, { renderer: 'canvas' })
    chart.setOption({
      animation: true,
      color: [primaryColor, outboundColor, destructiveColor],
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBackgroundColor,
        borderColor: tooltipBorderColor,
        textStyle: {
          color: textColor
        }
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: {
          color: textColor
        }
      },
      grid: {
        left: 0,
        right: 6,
        top: 36,
        bottom: 0,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: true,
        data: props.items.map((item) => item.label),
        axisLine: { lineStyle: { color: gridColor } },
        axisTick: { show: false },
        axisLabel: { color: textColor }
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: textColor }
      },
      series: [
        {
          name: props.t('inboundMessages'),
          type: 'bar',
          stack: 'message',
          barMaxWidth: 22,
          itemStyle: {
            color: primaryColor
          },
          emphasis: {
            itemStyle: {
              color: primaryColor
            }
          },
          data: props.items.map((item) => item.inbound)
        },
        {
          name: props.t('outboundMessages'),
          type: 'bar',
          stack: 'message',
          barMaxWidth: 22,
          itemStyle: {
            color: outboundColor
          },
          emphasis: {
            itemStyle: {
              color: outboundColor
            }
          },
          data: props.items.map((item) => item.outbound)
        },
        {
          name: props.t('failedMessages'),
          type: 'line',
          smooth: true,
          symbolSize: 6,
          itemStyle: {
            color: destructiveColor
          },
          lineStyle: {
            color: destructiveColor
          },
          emphasis: {
            itemStyle: {
              color: destructiveColor,
              borderColor: tooltipBackgroundColor,
              borderWidth: 2
            },
            lineStyle: {
              color: destructiveColor
            }
          },
          data: props.items.map((item) => item.failed)
        }
      ]
    })

    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    observer?.observe(element)
    setTimeout(resize, 0)

    return () => {
      window.removeEventListener('resize', resize)
      observer?.disconnect()
      chart.dispose()
    }
  }, [props.items, props.t])

  if (!props.items.length) {
    return <div className="xui-empty">{props.emptyText}</div>
  }

  if (!(window as any).echarts?.init) {
    return <div className="xui-empty">{props.libraryMissingText}</div>
  }

  return <div className="wxp-echarts-trend" ref={chartRef} />
}

function WechatActivityCalendar(props: {
  logs: any[]
  accountUuid: string
  mode: 'daily' | 'weekly' | 'cumulative'
  t: Translator
  emptyText: string
}) {
  const calendar = React.useMemo(
    () => buildActivityCalendar(props.logs, props.accountUuid, props.mode),
    [props.logs, props.accountUuid, props.mode]
  )

  if (!props.logs?.length) {
    return <div className="xui-empty">{props.emptyText}</div>
  }

  return (
    <div className={`wxp-calendar wxp-calendar-${props.mode}`}>
      {props.mode === 'weekly' ? (
        <div className="wxp-calendar-week-grid" style={{ gridTemplateColumns: `repeat(${calendar.weeks}, 12px)` }}>
          {calendar.weekCells.map((cell) => (
            <span
              key={cell.key}
              className={cell.active ? 'wxp-calendar-week-cell active' : 'wxp-calendar-week-cell'}
              title={`${cell.label}: ${cell.count} ${props.t('message')}`}
            />
          ))}
        </div>
      ) : (
        <div className="wxp-calendar-grid" style={{ gridTemplateColumns: `repeat(${calendar.weeks}, 12px)` }}>
          {calendar.cells.map((cell) => (
            <span
              key={cell.key}
              className={`wxp-calendar-cell level-${cell.level}`}
              title={`${cell.label}: ${cell.count} ${props.t('message')}`}
            />
          ))}
        </div>
      )}
      <div
        className={`wxp-calendar-months ${props.mode === 'weekly' ? 'wxp-calendar-months-weekly' : ''}`}
        style={{ gridTemplateColumns: `repeat(${calendar.weeks}, 12px)` }}
      >
        {calendar.months.map((month) => (
          <span key={`${month.label}:${month.column}`} style={{ gridColumn: `${month.column} / span ${month.span}` }}>
            {month.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function BreakdownList(props: { items: Array<{ label: string; count: number; percent: number }>; emptyText: string }) {
  if (!props.items.length) {
    return <div className="xui-empty">{props.emptyText}</div>
  }
  return (
    <div className="wxp-breakdown-list">
      {props.items.map((item) => (
        <div className="wxp-breakdown-row" key={item.label}>
          <div>
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </div>
          <div className="wxp-breakdown-track">
            <div style={{ width: `${Math.max(3, item.percent)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function RankList(props: { items: Array<{ label: string; count: number; detail?: string }>; emptyText: string }) {
  if (!props.items.length) {
    return <div className="xui-empty">{props.emptyText}</div>
  }
  return (
    <div className="wxp-rank-list">
      {props.items.map((item, index) => (
        <div className="wxp-rank-row" key={`${item.label}:${index}`}>
          <strong>{index + 1}</strong>
          <div>
            <span>{item.label}</span>
            {item.detail && <small>{item.detail}</small>}
          </div>
          <b>{item.count}</b>
        </div>
      ))}
    </div>
  )
}

function ActivityList(props: { items: any[]; emptyText: string; t: Translator }) {
  if (!props.items.length) {
    return <div className="xui-empty">{props.emptyText}</div>
  }
  return (
    <div className="wxp-activity-list">
      {props.items.map((item) => (
        <div className="wxp-activity-row" key={item.id || `${item.messageId}:${item.createdAt}`}>
          <div>
            {translatedPill(item.direction, props.t)}
            {translatedPill(item.status, props.t)}
          </div>
          <strong>{clip(item.error || item.content || item.payloadSummary, 120) || '-'}</strong>
          <small>
            {code(item.uuid)} {code(item.contactId)} {time(item.createdAt)}
          </small>
        </div>
      ))}
    </div>
  )
}

function TabButton(props: { tabKey: TabKey; label: string; active: TabKey; setTab: (key: TabKey) => void }) {
  return (
    <Button
      variant="ghost"
      className={props.tabKey === props.active ? 'active' : ''}
      onClick={() => props.setTab(props.tabKey)}
    >
      {props.label}
    </Button>
  )
}

function TableFilters(props: {
  draft: Record<string, unknown>
  setDraft: (draft: Record<string, unknown>) => void
  commitDraft: (draft: Record<string, unknown>) => void
  t: Translator
  onReset: () => void
  children: any
}) {
  return (
    <div className="wxp-table-filters">
      <Input
        value={displayText(props.draft.search)}
        placeholder={props.t('tableSearchPlaceholder')}
        onChange={(event: any) => props.setDraft({ ...props.draft, search: event.target.value })}
        onKeyDown={(event: any) => {
          if (event.key === 'Enter') {
            props.commitDraft({ ...props.draft, search: event.target.value })
          }
        }}
      />
      {props.children}
      <div className="wxp-filter-actions">
        <Button variant="outline" size="sm" onClick={props.onReset}>
          {props.t('resetFilters')}
        </Button>
      </div>
    </div>
  )
}

function TextFilter(props: {
  field: string
  placeholder: string
  draft: Record<string, unknown>
  setDraft: (draft: Record<string, unknown>) => void
}) {
  return (
    <Input
      value={displayText(props.draft[props.field])}
      placeholder={props.placeholder}
      onChange={(event: any) => props.setDraft({ ...props.draft, [props.field]: event.target.value })}
    />
  )
}

function SelectFilter(props: {
  field: string
  label: string
  options: Array<string | { value: string; label: string }>
  draft: Record<string, unknown>
  setDraft: (draft: Record<string, unknown>) => void
  commitDraft?: (draft: Record<string, unknown>) => void
}) {
  return (
    <Select
      value={displayText(props.draft[props.field]) || SELECT_EMPTY_VALUE}
      onValueChange={(value: string) => {
        const normalizedValue = value === SELECT_EMPTY_VALUE ? '' : value
        const nextDraft = { ...props.draft, [props.field]: normalizedValue }
        if (props.commitDraft) {
          props.commitDraft(nextDraft)
          return
        }
        props.setDraft(nextDraft)
      }}
    >
      <SelectTrigger aria-label={props.label}>
        <SelectValue placeholder={props.label} />
      </SelectTrigger>
      <SelectContent>
      <SelectItem value={SELECT_EMPTY_VALUE}>{props.label}</SelectItem>
      {props.options.map((option) => {
        const item = typeof option === 'string' ? { value: option, label: option } : option
        return (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        )
      })}
      </SelectContent>
    </Select>
  )
}

function Pagination(props: { table: PagedTableState; t: Translator; onChange: (patch: Partial<PagedTableState>) => void }) {
  const totalPages = Math.max(1, Math.ceil((props.table.total || 0) / props.table.pageSize))
  return (
    <div className="wxp-pagination">
      <span>
        {props.t('totalItems')} {props.table.total || 0}
      </span>
      <label>
        <span>{props.t('pageSize')}</span>
        <Select value={String(props.table.pageSize)} onValueChange={(value: string) => props.onChange({ page: 1, pageSize: Number(value) })}>
          <SelectTrigger aria-label={props.t('pageSize')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
          {[10, 20, 50, 100].map((value) => (
            <SelectItem key={value} value={String(value)}>
              {value}
            </SelectItem>
          ))}
          </SelectContent>
        </Select>
      </label>
      <Button
        variant="outline"
        size="sm"
        disabled={props.table.busy || props.table.page <= 1}
        onClick={() => props.onChange({ page: Math.max(1, props.table.page - 1) })}
      >
        {props.t('previousPage')}
      </Button>
      <strong>
        {props.table.page} / {totalPages}
      </strong>
      <Button
        variant="outline"
        size="sm"
        disabled={props.table.busy || props.table.page >= totalPages}
        onClick={() => props.onChange({ page: props.table.page + 1 })}
      >
        {props.t('nextPage')}
      </Button>
    </div>
  )
}

function DataTable(props: {
  headers: string[]
  rows: any[]
  renderRow: (row: any) => any[]
  emptyText: string
  loadingText?: string
  loading?: boolean
}) {
  if (props.loading && !props.rows?.length) {
    return <div className="xui-empty">{props.loadingText || '...'}</div>
  }
  if (!props.rows?.length) {
    return <div className="xui-empty">{props.emptyText}</div>
  }
  return (
    <ScrollArea className="wxp-table-wrap">
      {props.loading && <div className="wxp-table-loading">{props.loadingText || '...'}</div>}
      <ShadcnTable className="wxp-data-table">
        <TableHeader>
          <TableRow>
            {props.headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.rows.map((row) => (
            <TableRow key={row.id || row.uuid || row.conversationId}>
              {props.renderRow(row).map((cell, index) => (
                <TableCell key={index}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </ShadcnTable>
    </ScrollArea>
  )
}

function kv(label: string, value: unknown) {
  return (
    <div className="wxp-kv">
      <span>{label}</span>
      <strong>{displayText(value) || '-'}</strong>
    </div>
  )
}

function code(value: unknown) {
  return value ? <code>{clip(value, 42)}</code> : '-'
}

function display(value: unknown) {
  return <span className="xui-muted">{displayText(value) || '-'}</span>
}

function pill(value: unknown) {
  return <Badge variant={badgeVariant(value)}>{displayText(value) || '-'}</Badge>
}

function translatedPill(value: unknown, t: Translator) {
  return <Badge variant={badgeVariant(value)}>{translateValue(value, t) || '-'}</Badge>
}

function translatedOptions(values: string[], t: Translator) {
  return values.map((value) => ({
    value,
    label: translateValue(value, t)
  }))
}

function translateValue(value: unknown, t: Translator) {
  const text = displayText(value)
  if (!text) {
    return ''
  }
  const normalized = text.replace(/[^a-zA-Z0-9]+/g, '_')
  const key = TRANSLATABLE_VALUE_KEYS[normalized]
  return key ? t(key) : text
}

function badgeVariant(value: unknown): 'default' | 'secondary' | 'success' | 'warning' | 'destructive' {
  const text = displayText(value).toLowerCase()
  if (['sent', 'dispatched', 'received', 'online', 'connected', 'outbound'].includes(text)) {
    return 'success'
  }
  if (['failed', 'error', 'disabled', 'offline', 'disconnected'].includes(text)) {
    return 'destructive'
  }
  if (['skipped', 'unknown', 'system'].includes(text)) {
    return 'warning'
  }
  return 'secondary'
}

function phaseLabel(item: any, t: Translator) {
  const direction = translateValue(item?.direction, t)
  const status = translateValue(item?.status, t)
  return [direction, status].filter(Boolean).join(':') || '-'
}

function connectionModeLabel(value: unknown, t: Translator) {
  return value === 'reverse_tunnel' ? t('reverseTunnel') : t('directHttp')
}

function tunnelStatusLabel(tunnel: any, t: Translator) {
  return tunnel?.connected ? t('connected') : t('disconnected')
}

function time(value: unknown) {
  if (!value) {
    return '-'
  }
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}

function clip(value: unknown, length: number) {
  const text = displayText(value)
  if (!text) {
    return ''
  }
  return text.length > length ? `${text.slice(0, length)}...` : text
}

function displayText(value: unknown) {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
}

function normalizeText(value: unknown) {
  return displayText(value).replace(/\s+/g, ' ').trim()
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  const text = displayText(value)
  if (!text) {
    return null
  }
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function queueErrorSummary(value: unknown, t: Translator) {
  const text = normalizeText(value)
  if (!text) {
    return ''
  }
  if (/reverse tunnel client/i.test(text) && /not connected/i.test(text)) {
    const clientId = text.match(/client\s+"([^"]+)"/i)?.[1]
    return [t('reverseTunnelNotConnected'), clientId ? clip(clientId, 36) : ''].filter(Boolean).join(': ')
  }
  if (text === 'paused_by_user') {
    return t('pausedByUser')
  }
  if (text === 'cancelled_by_user') {
    return t('cancelledByUser')
  }
  if (text === 'account_disabled') {
    return t('accountDisabled')
  }
  return clip(text, 180)
}

function queueContentSummary(content: unknown, payload: Record<string, unknown> | null, t: Translator) {
  const text = normalizeText(content)
  if (payload?.type === 'image') {
    return [t('imageMessage'), formatUrlSummary(text)].filter(Boolean).join(' · ')
  }
  return clip(text, 180)
}

function queueContentMeta(payload: Record<string, unknown> | null, t: Translator) {
  if (!payload) {
    return ''
  }
  const parts = [
    payload.source ? `${t('source')}: ${clip(payload.source, 24)}` : '',
    payload.idempotencyKey ? `${t('idempotencyKey')}: ${clip(payload.idempotencyKey, 30)}` : '',
    Array.isArray(payload.atUsers) && payload.atUsers.length ? `${t('atUsers')}: ${payload.atUsers.length}` : ''
  ].filter(Boolean)
  return parts.join(' · ')
}

function queueContentDetail(item: any, payload: Record<string, unknown> | null, t: Translator) {
  const sections = [
    displayText(item.error) ? `${t('originalError')}:\n${displayText(item.error)}` : '',
    displayText(item.content) ? `${t('messageContent')}:\n${displayText(item.content)}` : '',
    payload ? `${t('messageMetadata')}:\n${JSON.stringify(payload, null, 2)}` : ''
  ].filter(Boolean)
  return sections.join('\n\n')
}

function formatUrlSummary(value: unknown) {
  const text = displayText(value)
  if (!text) {
    return ''
  }
  try {
    const url = new URL(text)
    const path = `${url.pathname}${url.search}`
    return clip(`${url.host}${path}`, 90)
  } catch {
    return clip(text, 90)
  }
}

function formatList(value: unknown) {
  const items = Array.isArray(value)
    ? value.map((item) => displayText(item).trim()).filter(Boolean)
    : typeof value === 'string'
      ? value.split(/[,\n，]/).map((item) => item.trim()).filter(Boolean)
      : []
  return items.length ? items.join(', ') : ''
}

function useTableFilterDraft(table: PagedTableState, onTableChange: (patch: Partial<PagedTableState>) => void) {
  const [draft, setDraft] = React.useState<Record<string, unknown>>(() => ({
    search: table.search || '',
    ...(table.filters || {})
  }))
  const tableSignature = createFilterSignature(table.search, table.filters || {})
  const draftSignature = createFilterSignature(draft.search, cleanFilters(draft))
  const onTableChangeRef = React.useRef(onTableChange)
  const autoFilterTimerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    onTableChangeRef.current = onTableChange
  }, [onTableChange])

  React.useEffect(() => {
    setDraft({
      search: table.search || '',
      ...(table.filters || {})
    })
  }, [tableSignature])

  React.useEffect(() => {
    if (draftSignature === tableSignature) {
      return
    }
    if (autoFilterTimerRef.current) {
      window.clearTimeout(autoFilterTimerRef.current)
    }
    autoFilterTimerRef.current = window.setTimeout(() => {
      autoFilterTimerRef.current = null
      onTableChangeRef.current(createFilterPatch(draft))
    }, 250)
    return () => {
      if (autoFilterTimerRef.current) {
        window.clearTimeout(autoFilterTimerRef.current)
        autoFilterTimerRef.current = null
      }
    }
  }, [draftSignature, tableSignature])

  const commitDraft = (nextDraft: Record<string, unknown>) => {
    if (autoFilterTimerRef.current) {
      window.clearTimeout(autoFilterTimerRef.current)
      autoFilterTimerRef.current = null
    }
    setDraft(nextDraft)
    onTableChangeRef.current(createFilterPatch(nextDraft))
  }

  return {
    draft,
    setDraft,
    commitDraft,
    reset: () => setDraft({ search: '' })
  }
}

function createFilterPatch(draft: Record<string, unknown>): Partial<PagedTableState> {
  return {
    page: 1,
    search: displayText(draft.search).trim(),
    filters: cleanFilters(draft)
  }
}

function createFilterSignature(search: unknown, filters: Record<string, unknown>) {
  const normalizedFilters: Record<string, string> = {}
  Object.keys(filters || {})
    .sort()
    .forEach((key) => {
      const text = displayText(filters[key]).trim()
      if (text) {
        normalizedFilters[key] = text
      }
    })
  return JSON.stringify({
    search: displayText(search).trim(),
    filters: normalizedFilters
  })
}

function cleanFilters(draft: Record<string, unknown>) {
  const filters: Record<string, unknown> = {}
  Object.keys(draft || {})
    .sort()
    .forEach((key) => {
      const value = draft[key]
      if (key === 'search') {
        return
      }
      const text = displayText(value).trim()
      if (text) {
        filters[key] = text
      }
    })
  return filters
}

function isPagedTable(tab: TabKey): tab is TableKey {
  return TABLE_KEYS.includes(tab as TableKey)
}

function withFallbackTable(table: PagedTableState, fallbackItems: any[]): PagedTableState {
  if (table.loaded || table.busy) {
    return table
  }
  const items = asArray(fallbackItems)
  return {
    ...table,
    items,
    total: items.length
  }
}

function normalizePage(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1
}

function normalizePageSize(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? Math.min(Math.max(value, 10), 100)
    : DEFAULT_TABLE_PAGE_SIZE
}

function normalizeCount(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

async function copyText(value: unknown, t: Translator) {
  const text = displayText(value)
  if (!text) {
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    notify('success', t('copied'))
  } catch {
    notify('error', t('copyFailed'))
  }
}

function buildDashboard(data: any) {
  const logs = asArray(data?.logs?.length ? data.logs : data?.messages)
  const accounts = asArray(data?.accounts)
  const integrations = asArray(data?.integrations)
  const total = logs.length
  const inbound = logs.filter((item) => item.direction === 'inbound').length
  const outbound = logs.filter((item) => item.direction === 'outbound').length
  const failed = logs.filter((item) => item.status === 'failed' || item.error).length
  const uniqueContacts = uniqueValues(logs, 'contactId')
  const uniqueAccounts = uniqueValues(logs, 'uuid')

  return {
    total,
    inbound,
    outbound,
    failed,
    logs,
    accountOptions: buildAccountOptions(accounts, logs),
    activeContactCount: uniqueContacts.size,
    activeAccountCount: uniqueAccounts.size,
    trend: buildTrend(logs),
    directionBreakdown: buildBreakdown(logs, 'direction'),
    statusBreakdown: buildBreakdown(logs, 'status'),
    chatTypeBreakdown: buildBreakdown(logs, 'chatType'),
    accountHealth: buildAccountHealth(accounts),
    topAccounts: buildTopList(logs, 'uuid', (value) => accountLabel(accounts, value), (value) => value),
    topContacts: buildTopList(logs, 'contactId', (value) => value),
    topIntegrations: buildIntegrationRanking(integrations),
    recentFailures: logs.filter((item) => item.status === 'failed' || item.error).slice(0, 5),
    latestActivity: logs.slice(0, 8)
  }
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : []
}

function uniqueValues(items: any[], key: string) {
  return new Set(items.map((item) => displayText(item?.[key]).trim()).filter(Boolean))
}

function buildBreakdown(items: any[], key: string) {
  const counts = new Map<string, number>()
  items.forEach((item) => {
    const label = displayText(item?.[key]).trim() || 'unknown'
    counts.set(label, (counts.get(label) || 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      percent: items.length ? Math.round((count / items.length) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function buildAccountHealth(accounts: any[]) {
  if (!accounts.length) {
    return []
  }
  const counts = new Map<string, number>()
  accounts.forEach((account) => {
    const status = account?.enabled === false ? 'disabled' : displayText(account?.status).trim() || 'unknown'
    counts.set(status, (counts.get(status) || 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      percent: Math.round((count / accounts.length) * 100)
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function buildTopList(
  items: any[],
  key: string,
  labelFactory: (value: string) => string,
  detailFactory?: (value: string) => string
) {
  const counts = new Map<string, number>()
  items.forEach((item) => {
    const value = displayText(item?.[key]).trim()
    if (value) {
      counts.set(value, (counts.get(value) || 0) + 1)
    }
  })
  return Array.from(counts.entries())
    .map(([value, count]) => ({
      label: clip(labelFactory(value), 48) || value,
      count,
      detail: detailFactory ? clip(detailFactory(value), 60) : ''
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 6)
}

function buildAccountOptions(accounts: any[], logs: any[]) {
  const accountMap = new Map<string, string>()
  accounts.forEach((account) => {
    const uuid = displayText(account?.uuid).trim()
    if (uuid) {
      accountMap.set(uuid, accountLabel(accounts, uuid))
    }
  })
  logs.forEach((log) => {
    const uuid = displayText(log?.uuid).trim()
    if (uuid && !accountMap.has(uuid)) {
      accountMap.set(uuid, uuid)
    }
  })
  return Array.from(accountMap.entries())
    .map(([value, label]) => ({
      value,
      label: clip(label, 42) || value
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function buildIntegrationRanking(integrations: any[]) {
  return integrations
    .map((integration) => ({
      label: displayText(integration?.name || integration?.id) || '-',
      count: Number(integration?.recentMessageCount || 0),
      detail: displayText(integration?.config?.baseUrl)
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 6)
}

function accountLabel(accounts: any[], uuid: string) {
  const account = accounts.find((item) => item?.uuid === uuid)
  return displayText(account?.displayName || account?.ownerWxid || uuid)
}

function buildTrend(items: any[]) {
  const dated = items
    .map((item) => ({ item, date: resolveLogDate(item) }))
    .filter((entry): entry is { item: any; date: Date } => Boolean(entry.date))
  if (!dated.length) {
    return []
  }
  const first = new Date(Math.min(...dated.map((entry) => entry.date.getTime())))
  const last = new Date(Math.max(...dated.map((entry) => entry.date.getTime())))
  const useHour = first.toDateString() === last.toDateString()
  const counts = new Map<string, { label: string; count: number; inbound: number; outbound: number; failed: number; order: number }>()

  dated.forEach((entry) => {
    const order = useHour ? floorHour(entry.date).getTime() : floorDay(entry.date).getTime()
    const label = useHour ? `${String(entry.date.getHours()).padStart(2, '0')}:00` : `${entry.date.getMonth() + 1}/${entry.date.getDate()}`
    const key = String(order)
    const current = counts.get(key) || {
      label,
      order,
      count: 0,
      inbound: 0,
      outbound: 0,
      failed: 0
    }
    const direction = displayText(entry.item?.direction)
    const failed = entry.item?.status === 'failed' || entry.item?.error
    counts.set(key, {
      label,
      order,
      count: current.count + 1,
      inbound: current.inbound + (direction === 'inbound' ? 1 : 0),
      outbound: current.outbound + (direction === 'outbound' ? 1 : 0),
      failed: current.failed + (failed ? 1 : 0)
    })
  })

  return Array.from(counts.values())
    .sort((a, b) => a.order - b.order)
    .slice(-12)
}

function floorHour(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours())
}

function floorDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function readCssVar(styles: CSSStyleDeclaration, name: string, fallback: string) {
  return styles.getPropertyValue(name).trim() || fallback
}

function buildActivityCalendar(logs: any[], accountUuid: string, mode: 'daily' | 'weekly' | 'cumulative') {
  const end = floorDay(new Date())
  const start = new Date(end)
  start.setDate(start.getDate() - 364)
  const alignedStart = new Date(start)
  alignedStart.setDate(alignedStart.getDate() - alignedStart.getDay())
  const dayCount = Math.ceil((end.getTime() - alignedStart.getTime()) / 86_400_000) + 1
  const weeks = Math.ceil(dayCount / 7)
  const counts = new Map<string, number>()

  logs
    .filter((log) => accountUuid === 'all' || log?.uuid === accountUuid)
    .forEach((log) => {
      const date = resolveLogDate(log)
      if (!date) {
        return
      }
      const day = floorDay(date)
      if (day < alignedStart || day > end) {
        return
      }
      const key = toDateKey(day)
      counts.set(key, (counts.get(key) || 0) + 1)
    })

  const dailyCounts = Array.from({ length: weeks * 7 }, (_, index) => {
    const date = new Date(alignedStart)
    date.setDate(alignedStart.getDate() + index)
    const key = toDateKey(date)
    return {
      key,
      date,
      raw: counts.get(key) || 0,
      count: counts.get(key) || 0
    }
  })

  if (mode === 'weekly') {
    for (let week = 0; week < weeks; week += 1) {
      const startIndex = week * 7
      const weeklyCount = dailyCounts.slice(startIndex, startIndex + 7).reduce((sum, item) => sum + item.raw, 0)
      dailyCounts.slice(startIndex, startIndex + 7).forEach((item) => {
        item.count = weeklyCount
      })
    }
  }

  if (mode === 'cumulative') {
    let total = 0
    dailyCounts.forEach((item) => {
      total += item.raw
      item.count = total
    })
  }

  const max = Math.max(...dailyCounts.map((item) => item.count), 1)
  const weeklyCounts = Array.from({ length: weeks }, (_, week) => {
    const startIndex = week * 7
    const weekStart = dailyCounts[startIndex]?.date || alignedStart
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    const count = dailyCounts.slice(startIndex, startIndex + 7).reduce((sum, item) => sum + item.raw, 0)
    return {
      key: `week:${toDateKey(weekStart)}`,
      label: `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`,
      count
    }
  })
  const weeklyMax = Math.max(...weeklyCounts.map((item) => item.count), 1)
  const cells = dailyCounts.map((item) => ({
    key: item.key,
    label: item.date.toLocaleDateString(),
    count: item.count,
    level: item.count ? Math.max(1, Math.ceil((item.count / max) * 4)) : 0
  }))
  const weekCells = weeklyCounts.flatMap((item, weekIndex) => {
    const activeRows = item.count ? Math.max(1, Math.ceil((item.count / weeklyMax) * 7)) : 0
    return Array.from({ length: 7 }, (_, rowIndex) => {
      const active = rowIndex >= 7 - activeRows
      return {
        key: `${item.key}:${rowIndex}`,
        label: item.label,
        count: item.count,
        weekIndex,
        rowIndex,
        active
      }
    })
  })
  const months = buildCalendarMonths(alignedStart, weeks)
  return {
    weeks,
    cells,
    weekCells,
    months
  }
}

function resolveLogDate(log: any) {
  const raw = log?.createdAt ?? log?.created_at ?? log?.timestamp ?? log?.updatedAt ?? log?.updated_at
  if (!raw) {
    return null
  }
  const numeric = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : null
  const date = numeric === null ? new Date(String(raw)) : new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
  return Number.isNaN(date.getTime()) ? null : date
}

function buildCalendarMonths(alignedStart: Date, weeks: number) {
  const months: Array<{ label: string; column: number; span: number }> = []
  let currentLabel = ''
  let currentColumn = 1
  for (let week = 0; week < weeks; week += 1) {
    const date = new Date(alignedStart)
    date.setDate(alignedStart.getDate() + week * 7)
    const label = date.toLocaleDateString(undefined, { month: 'short' })
    if (label !== currentLabel) {
      if (currentLabel) {
        months[months.length - 1].span = Math.max(1, week + 1 - currentColumn)
      }
      currentLabel = label
      currentColumn = week + 1
      months.push({ label, column: currentColumn, span: 1 })
    }
  }
  if (months.length) {
    months[months.length - 1].span = Math.max(1, weeks + 1 - months[months.length - 1].column)
  }
  return months
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatPercent(value: number, total: number) {
  if (!total) {
    return '0%'
  }
  return `${Math.round((value / total) * 100)}%`
}

injectStyles()

const root = document.getElementById('root')
if (ReactDOM.createRoot) {
  ReactDOM.createRoot(root).render(<App />)
} else {
  ReactDOM.render(<App />, root)
}
