import React, { useEffect, useRef, useState } from 'react'
import { z } from 'zod/v3'
import {
  ASSISTANT_CONTEXT_SET_COMMAND,
  WORKBENCH_NAVIGATION_OPEN_COMMAND,
  WORKBENCH_EXTENSION_VIEW_TARGET
} from '@xpert-ai/contracts'
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  History,
  Inbox,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Star,
  UserRound
} from 'lucide-react'
import {
  Badge,
  Button,
  buttonVariants,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@xpert-ai/plugin-shadcn-ui'
import { action, command, connect, data, type Host } from './bridge'
import { workbenchEntrySchema, workbenchPageSchema, type WorkbenchEntry } from '../../../src/workbench-contract'
import { i18n, errorMessage } from './i18n'
import { AutomationDashboard } from './automation-dashboard'
import { LocalGitImport } from './local-git-import'
import { ReviewDetail } from './review-detail'
import {
  viewState,
  viewParameters,
  statusKeys,
  statusLabel,
  statusTone,
  sourceLabel,
  type ViewState,
  type Section
} from './workbench-model'
import { openPipeline } from './repository-pipeline'
import { QueueWidthMenu, useQueueResize } from './queue-resize'

const inboxSchema = z.object({
  items: z.array(z.object({ number: z.number(), title: z.string(), url: z.string(), author: z.string() })),
  total: z.number()
})
export function Workbench() {
  const [host, setHost] = useState<Host | null>(null),
    [state, setState] = useState<ViewState>(() => viewState())
  const [items, setItems] = useState<WorkbenchEntry[]>([]),
    [selected, setSelected] = useState<WorkbenchEntry | null>(null)
  const [inbox, setInbox] = useState<z.infer<typeof inboxSchema>['items']>([]),
    [total, setTotal] = useState(0),
    [repositories, setRepositories] = useState<{ value: string; label: string }[]>([])
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0)
  const [navOpen, setNavOpen] = useState(() => window.innerWidth > 1200),
    [queueOpen, setQueueOpen] = useState(true),
    [createOpen, setCreateOpen] = useState(false),
    [importOpen, setImportOpen] = useState(false)
  const [url, setUrl] = useState(''),
    [access, setAccess] = useState<'public' | 'connected'>('public'),
    [formError, setFormError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const epoch = useRef(0),
    listRequest = useRef(0),
    selectionRequest = useRef(0),
    stateRef = useRef(state),
    selectedRef = useRef(selected),
    hostRef = useRef(host)
  stateRef.current = state
  selectedRef.current = selected
  hostRef.current = host
  const { t, locale, formatDate } = i18n(host?.locale)
  const management = state.section === 'repositories' || state.section === 'settings'
  const queueResize = useQueueResize(!management && queueOpen)
  const githubInbox = state.section === 'requested' || state.section === 'authored'
  const reload = () => setRefresh((n) => n + 1)
  useEffect(
    () =>
      connect((h) => {
        const scopeChanged =
          hostRef.current?.scopeRevision !== h.scopeRevision || hostRef.current?.instanceId !== h.instanceId
        if (scopeChanged) {
          epoch.current++
          selectionRequest.current++
          setSelected(null)
          setItems([])
          setError('')
        }
        setHost(h)
        const next = viewState(h.initialQuery?.parameters)
        setState(next)
        setSearchInput(next.search)
        if (next.recordId) void loadSelection(next.recordId)
        else if (h.initialQuery?.selectionId) void loadSelection(h.initialQuery.selectionId)
        else if (scopeChanged)
          void command(ASSISTANT_CONTEXT_SET_COMMAND, { key: 'codeReview', clear: true }).catch(() => {})
      }, reload),
    []
  )
  function navigate(next: ViewState, entry = selectedRef.current) {
    setState(next)
    setError('')
    void command(WORKBENCH_NAVIGATION_OPEN_COMMAND, {
      target: WORKBENCH_EXTENSION_VIEW_TARGET,
      viewKey: hostRef.current?.manifest.key,
      ...(entry?.reviewId ? { selectionId: entry.reviewId } : {}),
      parameters: viewParameters(next)
    }).catch((e) => {
      if (e instanceof Error && e.message !== 'context_changed') setError(e.message)
    })
  }
  function choose(entry: WorkbenchEntry, reflect = true) {
    selectionRequest.current++
    setSelected(entry)
    setError('')
    if (window.matchMedia('(max-width: 760px)').matches) setQueueOpen(false)
    if (!entry.reviewId) void command(ASSISTANT_CONTEXT_SET_COMMAND, { key: 'codeReview', clear: true }).catch(() => {})
    if (reflect) navigate({ ...stateRef.current, recordId: entry.id }, entry)
  }
  async function loadSelection(id: string) {
    const request = ++selectionRequest.current,
      generation = epoch.current
    try {
      const result = workbenchPageSchema.parse(await data({ parameters: { workbench: true, recordId: id } }))
      if (request !== selectionRequest.current || generation !== epoch.current) return
      if (result.items[0]) setSelected(result.items[0])
      else {
        setSelected(null)
        void command(ASSISTANT_CONTEXT_SET_COMMAND, { key: 'codeReview', clear: true }).catch(() => {})
        setError('review_not_found')
      }
    } catch (e) {
      if (request === selectionRequest.current && generation === epoch.current)
        setError(e instanceof Error ? e.message : 'operation_failed')
    }
  }
  useEffect(() => {
    if (!host || management) return
    const request = ++listRequest.current,
      generation = epoch.current
    setLoading(true)
    void data({
      page: state.page,
      parameters: githubInbox
        ? { inbox: state.section }
        : {
            workbench: true,
            search: state.search,
            repository: state.repository,
            status: state.status,
            pinned: state.section === 'recent' && state.pinned
          }
    })
      .then((value) => {
        if (request !== listRequest.current || generation !== epoch.current) return
        setError('')
        if (githubInbox) {
          const result = inboxSchema.parse(value)
          setInbox(result.items)
          setTotal(result.total)
          return
        }
        const result = workbenchPageSchema.parse(value)
        setItems(result.items)
        setTotal(result.total)
        setRepositories(result.repositories)
        const current = selectedRef.current,
          updated = current && result.items.find((item) => item.id === current.id)
        if (updated) setSelected(updated)
        else if (current && refresh > 0) void loadSelection(current.id)
        else if (!current && !stateRef.current.recordId && !host.initialQuery?.selectionId && result.items[0])
          choose(result.items[0])
      })
      .catch((e) => {
        if (request === listRequest.current && generation === epoch.current)
          setError(e instanceof Error ? e.message : 'operation_failed')
      })
      .finally(() => {
        if (request === listRequest.current && generation === epoch.current) setLoading(false)
      })
    return () => {
      listRequest.current++
    }
  }, [
    host?.scopeRevision,
    !!host,
    state.section,
    state.page,
    state.search,
    state.repository,
    state.status,
    state.pinned,
    refresh
  ])
  useEffect(() => {
    if (!host) return
    const timer = setInterval(reload, 10000)
    return () => clearInterval(timer)
  }, [!!host])
  useEffect(() => {
    if (searchInput === state.search || githubInbox || management) return
    const timer = setTimeout(() => navigate({ ...stateRef.current, search: searchInput, page: 1 }), 300)
    return () => clearTimeout(timer)
  }, [searchInput, state.search, githubInbox, management])
  async function openPr(value: string, mode: 'public' | 'connected') {
    if (busy) return
    const generation = epoch.current
    setBusy(true)
    setFormError('')
    setError('')
    try {
      const result = z.object({ id: z.string().uuid() }).parse(await action('open', { url: value, access: mode }))
      if (generation !== epoch.current) return
      setCreateOpen(false)
      await imported(result.id)
    } catch (e) {
      if (generation === epoch.current) {
        const code = e instanceof Error ? e.message : 'operation_failed'
        setFormError(code)
        if (!createOpen) setError(code)
      }
    } finally {
      if (generation === epoch.current) setBusy(false)
    }
  }
  async function imported(id: string) {
    const result = workbenchPageSchema.parse(await data({ parameters: { workbench: true, recordId: id } }))
    if (!result.items[0]) throw new Error('review_not_found')
    const entry = result.items[0]
    setSelected(entry)
    navigate(
      {
        ...stateRef.current,
        section: 'inbox',
        page: 1,
        search: '',
        repository: '',
        status: '',
        recordId: entry.id,
        tab: 'changes'
      },
      entry
    )
    setSearchInput('')
    reload()
  }
  const changeSection = (section: Section) => {
    if (section === 'repositories' || section === 'settings')
      void command(ASSISTANT_CONTEXT_SET_COMMAND, { key: 'codeReview', clear: true }).catch(() => {})
    navigate({ ...stateRef.current, section, page: 1 })
  }
  const navItems = [
    { section: 'inbox' as const, label: t('reviewInbox'), Icon: Inbox },
    { section: 'repositories' as const, label: t('repositories'), Icon: FolderGit2 },
    { section: 'settings' as const, label: t('settings'), Icon: Settings2 },
    { section: 'recent' as const, label: t('recentPinned'), Icon: Star },
    { section: 'requested' as const, label: t('reviewRequested'), Icon: UserRound },
    { section: 'authored' as const, label: t('createdByMe'), Icon: ArrowUpRight }
  ]
  return (
    <div className="review-workbench flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="review-toolbar flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t(navOpen ? 'hideNavigation' : 'showNavigation')}
          title={t(navOpen ? 'hideNavigation' : 'showNavigation')}
          onClick={() => setNavOpen((v) => !v)}
        >
          {navOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </Button>
        <h1 className="shrink-0 border-r pr-4 font-semibold">{t('workbenchTitle')}</h1>
        {!management && !githubInbox && (
          <>
            <Select
              value={state.repository || 'all'}
              onValueChange={(v) => navigate({ ...state, repository: v === 'all' ? '' : v, page: 1 })}
            >
              <SelectTrigger className="review-repository w-52" aria-label={t('repositories')}>
                <FolderGit2 className="size-4 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allRepositories')}</SelectItem>
                {repositories.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="review-search relative min-w-24 max-w-xl flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                aria-label={t('searchReviews')}
                placeholder={t('searchReviews')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                maxLength={200}
              />
            </div>
          </>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            disabled={!host || busy}
            aria-label={t('reload')}
            title={t('reload')}
            onClick={() => {
              reload()
              if (selected) void loadSelection(selected.id)
            }}
          >
            <RefreshCw className={`size-4 ${loading && !management ? 'animate-spin' : ''}`} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* Radix needs a DOM ref; this plugin runs React 18, while Button uses React 19 ref props. */}
              <button type="button" className={buttonVariants()} disabled={!host || busy}>
                <Plus className="size-4" />
                <span>{t('newReview')}</span>
                <ChevronDown className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onSelect={() => {
                  setFormError('')
                  setCreateOpen(true)
                }}
              >
                <GitPullRequest className="size-4" />
                {t('openGithubPr')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                <FolderGit2 className="size-4" />
                {t('importLocalGit')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-3 border-b bg-destructive/5 px-4 py-2 text-sm text-destructive"
        >
          {errorMessage(error, locale)}
          <Button size="sm" variant="ghost" onClick={reload}>
            {t('reload')}
          </Button>
        </div>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <aside
          className={`review-navigation flex shrink-0 flex-col overflow-hidden border-r bg-muted/20 ${
            navOpen ? 'is-open' : 'is-collapsed'
          }`}
        >
          <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label={t('workbenchTitle')}>
            {navItems.map(({ section, label, Icon }, index) => (
              <React.Fragment key={section}>
                {index === 3 && (
                  <div className="mx-2 my-4 border-t pt-4">
                    <p className="nav-label text-xs text-muted-foreground">{t('personalFilters')}</p>
                  </div>
                )}
                <Button
                  variant="ghost"
                  className={`mb-1 w-full justify-start gap-3 ${
                    state.section === section ? 'bg-primary/10 text-primary' : ''
                  }`}
                  aria-current={state.section === section ? 'page' : undefined}
                  title={label}
                  onClick={() => changeSection(section)}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="nav-label truncate">{label}</span>
                </Button>
              </React.Fragment>
            ))}
          </nav>
          <p className="nav-label p-4 text-xs leading-5 text-muted-foreground">{t('resultsStayLocal')}</p>
        </aside>
        {management ? (
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <AutomationDashboard
              host={host}
              section={state.section as 'repositories' | 'settings'}
              onNavigate={changeSection}
            />
          </div>
        ) : (
          <>
            {queueOpen && (
              <aside
                ref={queueResize.ref}
                id="review-pr-queue"
                style={{ '--review-queue-width': `${queueResize.width}px` } as React.CSSProperties}
                className="review-queue flex min-h-0 shrink-0 flex-col overflow-hidden border-r"
                aria-label={t('prQueue')}
              >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{t('prQueue')}</h2>
                    <span className="rounded bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{total}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {!githubInbox && (
                      <Select
                        value={state.status || 'all'}
                        onValueChange={(v) => navigate({ ...state, status: v === 'all' ? '' : v, page: 1 })}
                      >
                        <SelectTrigger className="w-auto min-w-28" aria-label={t('allStatuses')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('allStatuses')}</SelectItem>
                          {Object.keys(statusKeys).map((key) => (
                            <SelectItem key={key} value={key}>
                              {statusLabel(key, locale)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <QueueWidthMenu locale={locale} onWidth={queueResize.setWidth} />
                  </div>
                </div>
                {state.section === 'recent' && (
                  <label className="flex items-center gap-2 border-b px-4 py-2 text-xs">
                    <Checkbox
                      checked={state.pinned}
                      onCheckedChange={(value) => navigate({ ...state, pinned: value === true, page: 1 })}
                    />
                    {t('pinOnly')}
                  </label>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={loading}>
                  {loading && !items.length && !inbox.length ? (
                    <p role="status" className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                      <LoaderCircle className="size-4 animate-spin" />
                      {t('loadingReviews')}
                    </p>
                  ) : githubInbox ? (
                    inbox.map((row) => (
                      <button
                        key={row.url}
                        disabled={busy}
                        className="w-full border-b px-4 py-4 text-left hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                        onClick={() => void openPr(row.url, 'connected')}
                      >
                        <p className="text-xs text-muted-foreground">
                          #{row.number} · {row.author}
                        </p>
                        <p className="mt-1 text-sm font-medium">{row.title}</p>
                      </button>
                    ))
                  ) : (
                    items.map((entry) => (
                      <button
                        key={entry.key}
                        className={`review-queue-row w-full border-b border-l-2 px-4 py-3 text-left hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
                          selected?.key === entry.key ? 'border-l-primary bg-primary/5' : 'border-l-transparent'
                        }`}
                        aria-current={selected?.key === entry.key ? 'true' : undefined}
                        onClick={() => choose(entry)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs text-muted-foreground">
                            {entry.ref.provider === 'github' ? `#${entry.ref.number}` : entry.ref.repository}
                          </span>
                          <Badge variant="outline" className={`shrink-0 text-xs ${statusTone(entry.status)}`}>
                            {statusLabel(entry.status, locale)}
                          </Badge>
                        </div>
                        <p className="my-1 line-clamp-2 break-words text-sm font-medium leading-5">{entry.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {entry.ref.provider === 'github'
                            ? `${entry.ref.owner}/${entry.ref.repository}`
                            : entry.ref.repository}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <GitBranch className="size-3 shrink-0" />
                          <span>{sourceLabel(entry, locale)}</span>
                          <span>·</span>
                          <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                          <span className="ml-auto text-primary">{t('runsCount', { count: entry.count })}</span>
                        </div>
                      </button>
                    ))
                  )}
                  {!loading && !(githubInbox ? inbox.length : items.length) && (
                    <div className="space-y-2 p-5 text-sm">
                      <p>{t('emptyReviews')}</p>
                      <p className="leading-6 text-muted-foreground">{t('emptyReviewsHelp')}</p>
                      <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                        {t('newReview')}
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center justify-between border-t px-3 py-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('previousPage')}
                    disabled={loading || state.page <= 1}
                    onClick={() => navigate({ ...state, page: state.page - 1 })}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="text-xs tabular-nums">
                    {state.page} / {Math.max(1, Math.ceil(total / 20))}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('nextPage')}
                    disabled={loading || state.page >= 50 || state.page * 20 >= total}
                    onClick={() => navigate({ ...state, page: state.page + 1 })}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </aside>
            )}
            {queueOpen && (
              <div
                {...queueResize.separatorProps}
                className={`review-queue-resizer ${queueResize.dragging ? 'is-dragging' : ''}`}
                aria-label={t('resizeQueue')}
                title={t('resizeQueueHelp')}
              />
            )}
            <main
              className={`review-detail relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
                queueOpen ? '' : 'queue-hidden'
              }`}
            >
              <Button
                className="absolute left-3 top-3 z-10"
                size="icon"
                variant="ghost"
                aria-label={t(queueOpen ? 'hideQueue' : 'showQueue')}
                title={t(queueOpen ? 'hideQueue' : 'showQueue')}
                onClick={() => setQueueOpen((v) => !v)}
              >
                {queueOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
              </Button>
              {selected ? (
                <ReviewDetail
                  key={selected.id}
                  host={host}
                  entry={selected}
                  tab={state.tab}
                  onTab={(tab) => navigate({ ...state, tab })}
                  onSelect={choose}
                  refresh={refresh}
                  onChanged={reload}
                />
              ) : (
                <div className="m-auto max-w-md p-8 text-center">
                  <GitPullRequest className="mx-auto mb-4 size-9 text-muted-foreground" />
                  <p className="text-sm leading-6 text-muted-foreground">{t('selectReview')}</p>
                </div>
              )}
            </main>
          </>
        )}
      </div>
      <Dialog
        open={createOpen}
        onOpenChange={(value) => {
          if (!busy) setCreateOpen(value)
        }}
      >
        <DialogContent>
          <DialogTitle>{t('openGithubPr')}</DialogTitle>
          <DialogDescription>{t('openPrHelp')}</DialogDescription>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void openPr(url, access)
            }}
          >
            <label className="block space-y-2 text-sm">
              <span>{t('pullRequestUrl')}</span>
              <Input
                autoFocus
                required
                type="url"
                placeholder="https://github.com/owner/repo/pull/123"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span>{t('githubAccess')}</span>
              <Select value={access} onValueChange={(v) => setAccess(v === 'connected' ? 'connected' : 'public')}>
                <SelectTrigger aria-label={t('githubAccess')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">{t('publicRepository')}</SelectItem>
                  <SelectItem value="connected">{t('connectedGithub')}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage(formError, locale)}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setCreateOpen(false)}>
                {t('cancel')}
              </Button>
              <Button disabled={!url.trim() || busy}>
                {busy && <LoaderCircle className="size-4 animate-spin" />}
                {t('openPr')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <LocalGitImport
        host={host}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(id) =>
          void imported(id).catch((e) => setError(e instanceof Error ? e.message : 'operation_failed'))
        }
      />
    </div>
  )
}
