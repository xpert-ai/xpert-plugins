import * as React from 'react'
import { createRoot } from 'react-dom/client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  ChevronRight,
  Input,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@xpert-ai/plugin-shadcn-ui'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import './styles.css'
import {
  CreateProjectDialog,
  EMPTY_PROJECT_DRAFT,
  type CreateProjectDraft
} from './create-project-dialog'
import { createTranslator, normalizeLocale, type MessageKey } from './i18n'
import {
  executeAction,
  getErrorMessage,
  getResponsePayload,
  isRemoteObject,
  invokeClientCommand,
  notify,
  post,
  reportResize,
  requestData,
  requireSuccessfulAction,
  setRuntimeText,
  startRemoteBridge,
  type RemoteBridgeContext,
  type RemoteValue
} from './runtime'
import { buildStoryStudioAssistantContext } from './assistant-context'
import { storyStudioDebug } from './debug-logger'
import {
  buildSeedanceAssistantMessage,
  buildSeedanceGenerationTargets,
  buildSeedanceStatusAssistantMessage
} from './seedance-generation'
import { normalizeStoryToolEvent } from './tool-event'
import {
  findProjectId,
  parseProject,
  readPagination,
  readProjectList,
  readProjectStatusFilter,
  type ProductionFormat,
  type ProjectStatus,
  type ProjectSummary
} from './project-data'
import {
  ProductionPanel,
  parseHandoffView,
  parseProductionView,
  parseRenderCapability,
  parseRenderView,
  type HandoffView,
  type ProductionView,
  type RenderCapabilityView,
  type RenderView
} from './production-panel'
import { useStoryEditor } from './use-story-editor'
import { findHandoff, readHostThemeMode } from './workbench-data'

const h: typeof React.createElement = React.createElement
const ASSISTANT_CONTEXT_COMMAND = 'assistant.context.set'
const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'
const PROJECT_PAGE_SIZE = 20

const STATUS_KEYS: Record<ProjectStatus, MessageKey> = {
  draft: 'status.draft',
  planning: 'status.planning',
  production: 'status.production',
  review: 'status.review',
  completed: 'status.completed',
  failed: 'status.failed',
  archived: 'status.archived'
}

const FORMAT_KEYS: Record<ProductionFormat, MessageKey> = {
  vertical_short: 'format.vertical_short',
  horizontal_short: 'format.horizontal_short',
  episodic_series: 'format.episodic_series',
  feature: 'format.feature',
  custom: 'format.custom'
}

const NEXT_ACTION_KEYS: Record<ProjectStatus, MessageKey> = {
  draft: 'next.draft',
  planning: 'next.planning',
  production: 'next.production',
  review: 'next.review',
  completed: 'next.completed',
  failed: 'next.failed',
  archived: 'next.archived'
}

const NEXT_STATUS: Partial<Record<ProjectStatus, ProjectStatus>> = {
  draft: 'planning',
  planning: 'production',
  production: 'review',
  review: 'completed',
  failed: 'draft',
  archived: 'draft'
}

const STAGES: MessageKey[] = [
  'stages.projects',
  'stages.sources',
  'stages.story',
  'stages.episodes',
  'stages.assets',
  'stages.storyboard',
  'stages.generation',
  'stages.handoff'
]

function App() {
  const [context, setContext] = React.useState<RemoteBridgeContext | null>(null)
  const [projects, setProjects] = React.useState<ProjectSummary[]>([])
  const [selected, setSelected] = React.useState<ProjectSummary | null>(null)
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<ProjectStatus | 'all'>('all')
  const [busy, setBusy] = React.useState(false)
  const [generating, setGenerating] = React.useState(false)
  const [handingOff, setHandingOff] = React.useState(false)
  const [production, setProduction] = React.useState<ProductionView | null>(null)
  const [render, setRender] = React.useState<RenderView | null>(null)
  const [renderCapability, setRenderCapability] = React.useState<RenderCapabilityView | null>(null)
  const [handoff, setHandoff] = React.useState<HandoffView | null>(null)
  const [activeStage, setActiveStage] = React.useState(1)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<CreateProjectDraft>(EMPTY_PROJECT_DRAFT)
  const [projectsCollapsed, setProjectsCollapsed] = React.useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = React.useState(false)
  const [discardOpen, setDiscardOpen] = React.useState(false)
  const [pendingNavigation, setPendingNavigation] = React.useState<
    | { kind: 'stage'; stage: number }
    | { kind: 'project'; projectId: string }
    | {
        kind: 'refresh'
        preferredId?: string | null
        requestedPage?: number
      }
    | { kind: 'discard' }
    | null
  >(null)
  const selectedRef = React.useRef<ProjectSummary | null>(null)
  const pageRef = React.useRef(1)
  const searchRef = React.useRef('')
  const statusRef = React.useRef<ProjectStatus | 'all'>('all')
  const refreshAfterToolEventRef = React.useRef<
    (event: RemoteValue) => Promise<void>
  >(async () => undefined)
  const t = createTranslator(context?.locale)
  const themeMode = readHostThemeMode(context?.theme)
  const {
    editor,
    editorRef,
    beginEdit,
    closeEditor,
    updateProjectDraft,
    updateProductionDraft,
    markRemotePending,
    saveEditor,
    useAgentVersion
  } = useStoryEditor({
    activeStage,
    production,
    getProject: () => selectedRef.current,
    getSnapshot: requestProjectSnapshot,
    reload: (projectId) => reloadProjects(projectId),
    t
  })

  React.useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  React.useEffect(() => {
    pageRef.current = page
  }, [page])

  React.useEffect(() => {
    searchRef.current = search
  }, [search])

  React.useEffect(() => {
    statusRef.current = status
  }, [status])

  React.useEffect(() => {
    document.documentElement.dataset.storyTheme = themeMode
  }, [themeMode])

  React.useEffect(() => {
    const narrowViewport = window.matchMedia('(max-width: 920px)')
    const collapseForNarrowViewport = (matches: boolean) => {
      if (!matches) return
      setProjectsCollapsed(true)
      setInspectorCollapsed(true)
    }
    collapseForNarrowViewport(narrowViewport.matches)
    const handleChange = (event: MediaQueryListEvent) => {
      collapseForNarrowViewport(event.matches)
    }
    narrowViewport.addEventListener('change', handleChange)
    return () => narrowViewport.removeEventListener('change', handleChange)
  }, [])

  React.useEffect(() => {
    setRuntimeText({
      requestTimeout: t('errors.requestTimeout'),
      remoteRequestFailed: t('errors.remoteRequestFailed'),
      unknownError: t('errors.unknown')
    })
  }, [context?.locale])

  React.useEffect(() => {
    startRemoteBridge(
      (nextContext) => {
        setContext(nextContext)
        document.documentElement.lang = normalizeLocale(nextContext.locale)
        applyWorkbenchPayload(nextContext.payload)
        void reloadProjects()
      },
      (event) => void refreshAfterToolEventRef.current(event)
    )
    post('ready')
  }, [])

  React.useEffect(reportResize, [
    projects,
    selected,
    production,
    render,
    handoff,
    page,
    total,
    busy,
    generating,
    handingOff,
    createOpen,
    activeStage,
    themeMode,
    projectsCollapsed,
    inspectorCollapsed,
    editor,
    discardOpen,
    context?.locale
  ])

  React.useEffect(() => {
    if (!context) return
    const timer = window.setTimeout(() => {
      void invokeClientCommand(
        ASSISTANT_CONTEXT_COMMAND,
        buildStoryStudioAssistantContext(selected, editor?.dirty === true)
      ).catch((error) => {
        storyStudioDebug.warn('assistant.context.sync.failed', {
          message: getErrorMessage(error instanceof Error ? error : String(error))
        })
      })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [
    context,
    selected?.id,
    selected?.revision,
    selected?.status,
    editor?.dirty
  ])

  function applyWorkbenchPayload(value: RemoteValue) {
    const payload = isRemoteObject(value) ? value : null
    if (!payload) return
    const nextProjects = readProjectList(payload)
    const pagination = readPagination(payload, PROJECT_PAGE_SIZE)
    setProjects(nextProjects)
    setPage(pagination.page)
    pageRef.current = pagination.page
    setTotal(pagination.total)
    setProduction(parseProductionView(payload.production))
    setRender(parseRenderView(payload.render))
    setRenderCapability(parseRenderCapability(payload.renderCapability))
    setHandoff(parseHandoffView(payload.handoff))
    const nextDetail = parseProject(payload.detail)
    if (nextDetail) {
      selectedRef.current = nextDetail
      setSelected(nextDetail)
    }
  }

  async function reloadProjects(
    preferredId = selectedRef.current?.id ?? null,
    requestedPage = pageRef.current
  ) {
    setBusy(true)
    try {
      const response = await requestData({
        page: requestedPage,
        pageSize: PROJECT_PAGE_SIZE,
        search: searchRef.current,
        parameters: {
          table: 'projects',
          ...(statusRef.current === 'all' ? {} : { status: statusRef.current }),
          ...(preferredId ? { projectId: preferredId } : {})
        }
      })
      const payload = getResponsePayload(response)
      const object = isRemoteObject(payload) ? payload : null
      const nextProjects = object ? readProjectList(object) : []
      const nextDetail = object ? parseProject(object.detail) : null
      setProduction(object ? parseProductionView(object.production) : null)
      setRender(object ? parseRenderView(object.render) : null)
      setRenderCapability(object ? parseRenderCapability(object.renderCapability) : null)
      setHandoff(object ? parseHandoffView(object.handoff) : null)
      const pagination = object
        ? readPagination(object, PROJECT_PAGE_SIZE)
        : { page: requestedPage, pageSize: PROJECT_PAGE_SIZE, total: 0 }
      setProjects(nextProjects)
      setPage(pagination.page)
      pageRef.current = pagination.page
      setTotal(pagination.total)
      const fallback =
        nextDetail ??
        nextProjects.find((project) => project.id === preferredId) ??
        nextProjects[0] ??
        null
      selectedRef.current = fallback
      setSelected(fallback)
      storyStudioDebug.info('projects.reload.applied', {
        count: nextProjects.length,
        page: pagination.page,
        total: pagination.total,
        selectedProjectId: fallback?.id ?? ''
      })
      return nextProjects
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
      return []
    } finally {
      setBusy(false)
    }
  }

  function requestNavigation(
    navigation: NonNullable<typeof pendingNavigation>
  ) {
    if (editorRef.current?.dirty) {
      setPendingNavigation(navigation)
      setDiscardOpen(true)
      return
    }
    void applyNavigation(navigation)
  }

  async function applyNavigation(
    navigation: NonNullable<typeof pendingNavigation>
  ) {
    setDiscardOpen(false)
    setPendingNavigation(null)
    closeEditor()
    if (navigation.kind === 'stage') {
      setActiveStage(navigation.stage)
      return
    }
    if (navigation.kind === 'project') {
      await reloadProjects(navigation.projectId)
      return
    }
    if (navigation.kind === 'refresh') {
      await reloadProjects(
        navigation.preferredId,
        navigation.requestedPage
      )
    }
  }

  function selectProject(projectId: string) {
    requestNavigation({ kind: 'project', projectId })
  }

  function requestDiscardEdit() {
    const current = editorRef.current
    if (!current?.dirty) {
      closeEditor()
      return
    }
    setPendingNavigation({ kind: 'discard' })
    setDiscardOpen(true)
  }

  async function requestProjectSnapshot(projectId: string) {
    const response = await requestData({
      page: pageRef.current,
      pageSize: PROJECT_PAGE_SIZE,
      search: searchRef.current,
      parameters: {
        table: 'projects',
        ...(statusRef.current === 'all'
          ? {}
          : { status: statusRef.current }),
        projectId
      }
    })
    const payload = getResponsePayload(response)
    const object = isRemoteObject(payload) ? payload : null
    return {
      project: object ? parseProject(object.detail) : null,
      production: object
        ? parseProductionView(object.production)
        : null
    }
  }

  async function createProject() {
    const title = draft.title.trim()
    if (!title) return
    setBusy(true)
    try {
      const response = await executeAction('create_project', null, {
        operationId: crypto.randomUUID(),
        title,
        description: draft.description.trim(),
        premise: draft.premise.trim(),
        productionFormat: draft.productionFormat,
        aspectRatio: draft.aspectRatio,
        targetDurationSeconds: Number(draft.duration),
        tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        changeSummary: t('changes.created', { title })
      })
      const projectId = findProjectId(requireSuccessfulAction(response))
      setCreateOpen(false)
      setDraft(EMPTY_PROJECT_DRAFT)
      setActiveStage(1)
      notify('success', t('messages.created'))
      pageRef.current = 1
      await reloadProjects(projectId, 1)
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
    } finally {
      setBusy(false)
    }
  }

  async function createDemoProject() {
    setBusy(true)
    try {
      const payload = requireSuccessfulAction(
        await executeAction('create_demo_project', null, {
          operationId: crypto.randomUUID()
        })
      )
      const projectId = findProjectId(payload)
      notify('success', t('messages.demoCreated'))
      pageRef.current = 1
      setActiveStage(6)
      await reloadProjects(projectId, 1)
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
    } finally {
      setBusy(false)
    }
  }

  async function advanceProject() {
    const project = selectedRef.current
    if (!project) return
    const nextStatus = NEXT_STATUS[project.status]
    if (!nextStatus) return
    setBusy(true)
    try {
      requireSuccessfulAction(
        await executeAction('update_project_status', project.id, {
          projectId: project.id,
          operationId: crypto.randomUUID(),
          baseRevision: project.revision,
          status: nextStatus,
          changeSummary: t('changes.advanced', { stage: t(STATUS_KEYS[nextStatus]) })
        })
      )
      notify('success', t('messages.advanced'))
      await reloadProjects(project.id)
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
    } finally {
      setBusy(false)
    }
  }

  async function startRender() {
    const project = selectedRef.current
    if (!project) return
    setBusy(true)
    try {
      requireSuccessfulAction(
        await executeAction('start_render', project.id, {
          projectId: project.id,
          operationId: crypto.randomUUID(),
          expectedRevision: project.revision,
          quality: 'standard',
          fps: 24,
          fileName: `${project.title.replace(/[\\/:*?"<>|]/g, '-')}-animatic.mp4`,
          changeSummary: `Queued animatic render for ${project.title}`
        })
      )
      notify('success', t('render.rendering', { progress: 0 }))
      await reloadProjects(project.id)
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
    } finally {
      setBusy(false)
    }
  }

  async function generateSeedanceVideos() {
    const project = selectedRef.current
    if (!project || !production) return
    setGenerating(true)
    try {
      const targets = buildSeedanceGenerationTargets(production)
      if (!targets.length) throw new Error(t('generation.noImages'))
      const text = buildSeedanceAssistantMessage({
        projectId: project.id,
        revision: project.revision,
        aspectRatio: project.aspectRatio,
        targets
      })
      const response = await invokeClientCommand(ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, {
        text,
        clientMessageId: `story-studio:seedance:${project.id}:${Date.now()}`,
        state: {
          source: '@xpert-ai/plugin-story-studio',
          action: 'generate_seedance_storyboard_videos',
          projectId: project.id,
          targetCount: targets.length
        }
      })
      const result = getResponsePayload(response)
      if (isRemoteObject(result) && result.success === false) {
        throw new Error(typeof result.message === 'string' ? result.message : t('generation.sendFailed'))
      }
      notify('success', t('generation.sent', { count: targets.length }))
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
    } finally {
      setGenerating(false)
    }
  }

  async function querySeedanceVideos() {
    const project = selectedRef.current
    if (!project) return
    setGenerating(true)
    try {
      const response = await invokeClientCommand(ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, {
        text: buildSeedanceStatusAssistantMessage({
          projectId: project.id,
          revision: project.revision
        }),
        clientMessageId: `story-studio:seedance-status:${project.id}:${Date.now()}`,
        state: {
          source: '@xpert-ai/plugin-story-studio',
          action: 'query_seedance_storyboard_videos',
          projectId: project.id
        }
      })
      const result = getResponsePayload(response)
      if (isRemoteObject(result) && result.success === false) {
        throw new Error(typeof result.message === 'string' ? result.message : t('generation.queryFailed'))
      }
      notify('success', t('generation.querySent'))
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
    } finally {
      setGenerating(false)
    }
  }

  async function prepareCutHandoff() {
    const project = selectedRef.current
    if (!project) return
    setHandingOff(true)
    try {
      const actionResult = requireSuccessfulAction(
        await executeAction('prepare_cut_handoff', project.id, {
          projectId: project.id,
          operationId: crypto.randomUUID(),
          expectedRevision: project.revision,
          fps: 24,
          changeSummary: t('changes.handoff', { title: project.title })
        })
      )
      const prepared = findHandoff(actionResult)
      if (!prepared) throw new Error(t('errors.remoteRequestFailed'))
      setHandoff(prepared)
      const text = [
        `Accept StoryCutHandoff ${prepared.id} for Story Studio project ${project.id}.`,
        'Use story_get_cut_handoff with only projectId and handoffId to read the frozen contract.',
        'Pass that exact contract to cut_accept_story_handoff. Do not alter paths, checksums, timing, target mode, or target Cut project.',
        'Then call story_record_cut_handoff_delivery using the returned Cut project/proposal receipt and the latest handoffRevision.',
        'For proposal mode, never apply the proposal automatically; leave it pending for a human review in Cut.',
        'If Cut rejects the contract, record status=failed with the provider error and stop.'
      ].join('\n\n')
      const command = await invokeClientCommand(ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, {
        text,
        clientMessageId: `story-studio:cut-handoff:${prepared.id}:${Date.now()}`,
        state: {
          source: '@xpert-ai/plugin-story-studio',
          action: 'accept_story_cut_handoff',
          projectId: project.id,
          handoffId: prepared.id,
          handoffRevision: prepared.handoffRevision,
          mode: prepared.mode
        }
      })
      const commandResult = getResponsePayload(command)
      if (isRemoteObject(commandResult) && commandResult.success === false) {
        throw new Error(
          typeof commandResult.message === 'string'
            ? commandResult.message
            : t('handoff.sendFailed')
        )
      }
      notify('success', t('handoff.sent'))
      await reloadProjects(project.id)
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
    } finally {
      setHandingOff(false)
    }
  }

  async function refreshAfterToolEvent(event: RemoteValue) {
    const normalized = normalizeStoryToolEvent(event)
    storyStudioDebug.info('toolEvent.normalized', {
      toolName: normalized.toolName ?? '',
      projectId: normalized.projectId ?? ''
    })
    const currentEditor = editorRef.current
    const targetId =
      normalized.projectId ?? selectedRef.current?.id ?? null
    if (
      currentEditor?.dirty &&
      targetId === currentEditor.projectId
    ) {
      markRemotePending()
      notify('warning', t('editor.agentPending'))
      return
    }
    if (
      currentEditor &&
      targetId === currentEditor.projectId
    ) {
      closeEditor()
    }
    await reloadProjects(targetId)
    notify('info', t('messages.agentRefresh'))
  }

  refreshAfterToolEventRef.current = refreshAfterToolEvent

  const nextStatus = selected ? NEXT_STATUS[selected.status] : undefined
  const pageCount = Math.max(1, Math.ceil(total / PROJECT_PAGE_SIZE))
  const shotReadiness = readShotReadiness(production)

  return (
    <div className="ss-root">
      <header className="ss-header">
        <div className="ss-brand">
          <div className="ss-brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div><h1>{t('app.title')}</h1><p>{t('app.kicker')}</p></div>
        </div>
        {selected ? (
          <div className="ss-current-project">
            <strong>{selected.title}</strong>
            <Badge variant="outline">{selected.aspectRatio}</Badge>
            <Badge variant="outline">{t('project.revision', { revision: selected.revision })}</Badge>
            <span className={shotReadiness.selected === shotReadiness.total && shotReadiness.total > 0 ? 'is-ready' : ''}>
              <i />{t('project.shotReadiness', shotReadiness)}
            </span>
          </div>
        ) : null}
        <div className="ss-header-actions">
          <Button
            className="ss-header-secondary-action"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => requestNavigation({ kind: 'refresh' })}
          >
            <RotateCcw aria-hidden="true" />{t('actions.refresh')}
          </Button>
          <Button
            className="ss-header-secondary-action"
            variant="outline"
            size="sm"
            disabled={busy || editor?.dirty}
            onClick={() => void createDemoProject()}
          >
            {t('actions.loadDemo')}
          </Button>
          <Button
            size="sm"
            disabled={editor?.dirty}
            onClick={() => setCreateOpen(true)}
          >
            <Plus aria-hidden="true" />{t('actions.newProject')}
          </Button>
        </div>
      </header>

      <nav className="ss-stage-strip" aria-label={t('app.subtitle')}>
        {STAGES.map((stage, index) => {
          const number = index + 1
          const ready = stageIsReady(number, selected, production, handoff)
          return (
            <button
              type="button"
              className={`ss-stage ${ready ? 'is-ready' : ''} ${activeStage === number ? 'is-active' : ''}`}
              key={stage}
              aria-current={activeStage === number ? 'step' : undefined}
              onClick={() =>
                requestNavigation({ kind: 'stage', stage: number })
              }
            >
              <span className="ss-stage-number">{number}</span>
              <span><strong>{t(stage)}</strong><small>{t(ready ? 'stage.ready' : 'stage.pending')}</small></span>
            </button>
          )
        })}
      </nav>

      <main className={`ss-workbench ${projectsCollapsed ? 'is-projects-collapsed' : ''}`}>
        <aside className={`ss-projects ${projectsCollapsed ? 'is-collapsed' : ''}`}>
          {projectsCollapsed ? (
            <div className="ss-panel-rail">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t('actions.expandProjects')}
                title={t('actions.expandProjects')}
                onClick={() => setProjectsCollapsed(false)}
              >
                <PanelLeftOpen aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <>
              <div className="ss-panel-heading">
                <div className="ss-panel-titlebar">
                  <div><h2>{t('projects.title')}</h2><span>{total}</span></div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('actions.collapseProjects')}
                    title={t('actions.collapseProjects')}
                    onClick={() => setProjectsCollapsed(true)}
                  >
                    <PanelLeftClose aria-hidden="true" />
                  </Button>
                </div>
                <Input
                  aria-label={t('filters.search')}
                  placeholder={t('filters.search')}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    searchRef.current = event.target.value
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      pageRef.current = 1
                      requestNavigation({
                        kind: 'refresh',
                        preferredId: null,
                        requestedPage: 1
                      })
                    }
                  }}
                />
                <Select
                  value={status}
                  onValueChange={(value) => {
                    const next = readProjectStatusFilter(value)
                    if (!next) return
                    setStatus(next)
                    statusRef.current = next
                    pageRef.current = 1
                    requestNavigation({
                      kind: 'refresh',
                      preferredId: null,
                      requestedPage: 1
                    })
                  }}
                >
                  <SelectTrigger size="sm" className="ss-filter-trigger" aria-label={t('filters.allStatuses')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('filters.allStatuses')}</SelectItem>
                    {Object.entries(STATUS_KEYS).map(([value, key]) => (
                      <SelectItem key={value} value={value}>{t(key)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="ss-project-list">
                {projects.length ? projects.map((project) => (
                  <button
                    type="button"
                    className={`ss-project-item ${selected?.id === project.id ? 'is-selected' : ''}`}
                    key={project.id}
                    onClick={() => void selectProject(project.id)}
                  >
                    <span className="ss-project-avatar">{project.title.slice(0, 2).toUpperCase()}</span>
                    <span className="ss-project-copy">
                      <strong>{project.title}</strong>
                      <small>{t(FORMAT_KEYS[project.productionFormat])} · {project.aspectRatio}</small>
                    </span>
                    <Badge variant="outline">{t(STATUS_KEYS[project.status])}</Badge>
                  </button>
                )) : <div className="ss-empty">{t('projects.empty')}</div>}
              </div>
              <div className="ss-pagination">
                <Button variant="outline" size="sm" disabled={busy || page <= 1} onClick={() => requestNavigation({ kind: 'refresh', preferredId: null, requestedPage: page - 1 })}>
                  {t('pagination.previous')}
                </Button>
                <span>{t('pagination.page', { page, pages: pageCount })}</span>
                <Button variant="outline" size="sm" disabled={busy || page >= pageCount} onClick={() => requestNavigation({ kind: 'refresh', preferredId: null, requestedPage: page + 1 })}>
                  {t('pagination.next')}
                </Button>
              </div>
            </>
          )}
        </aside>

        <section className="ss-detail">
          {selected ? (
            <>
              <div className="ss-detail-hero">
                <div>
                  <span className="ss-eyebrow">{t('app.workspace')}</span>
                  <h2>{selected.title}</h2>
                  <p>{selected.premise ?? selected.description ?? t('project.noSelection')}</p>
                </div>
                <div className="ss-detail-actions">
                  <Badge className={`status-${selected.status}`}>{t(STATUS_KEYS[selected.status])}</Badge>
                  {nextStatus ? (
                    <Button size="sm" disabled={busy || editor?.dirty} onClick={() => void advanceProject()}>
                      {t('actions.advance', { stage: t(STATUS_KEYS[nextStatus]) })}
                      <ChevronRight aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </div>

              <ProductionPanel
                production={production}
                render={render}
                capability={renderCapability}
                handoff={handoff}
                activeStage={activeStage}
                busy={busy}
                generating={generating}
                handingOff={handingOff}
                onGenerate={() => void generateSeedanceVideos()}
                onQueryGeneration={() => void querySeedanceVideos()}
                onRender={() => void startRender()}
                onHandoff={() => void prepareCutHandoff()}
                inspectorCollapsed={inspectorCollapsed}
                onInspectorCollapsedChange={setInspectorCollapsed}
                editor={editor}
                onEdit={beginEdit}
                onSaveEdit={(rebase) => void saveEditor(rebase)}
                onDiscardEdit={requestDiscardEdit}
                onProjectDraftChange={updateProjectDraft}
                onProductionDraftChange={updateProductionDraft}
                onUseAgentVersion={() => void useAgentVersion()}
                t={t}
              />

              <div className="ss-next-action">
                <div><span>{t('project.nextAction')}</span><p>{t(NEXT_ACTION_KEYS[selected.status])}</p></div>
                {selected.failureCode ? (
                  <div className="ss-failure">
                    <strong>{t('project.failure')}</strong>
                    <code>{selected.failureCode}</code>
                    <p>{selected.failureMessage}</p>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="ss-no-selection">
              <div className="ss-brand-mark is-large" aria-hidden="true"><span /><span /><span /></div>
              <h2>{t('project.noSelection')}</h2>
              <Button size="sm" onClick={() => setCreateOpen(true)}><Plus aria-hidden="true" />{t('actions.newProject')}</Button>
            </div>
          )}
        </section>
      </main>

      <CreateProjectDialog
        open={createOpen}
        busy={busy}
        draft={draft}
        onOpenChange={setCreateOpen}
        onDraftChange={setDraft}
        onCreate={() => void createProject()}
        t={t}
      />
      <AlertDialog
        open={discardOpen}
        onOpenChange={(open) => {
          setDiscardOpen(open)
          if (!open) setPendingNavigation(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('editor.discardTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('editor.discardHelp')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const navigation =
                  pendingNavigation ?? ({ kind: 'discard' } as const)
                void applyNavigation(navigation)
              }}
            >
              {t('editor.discardConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function stageIsReady(
  stage: number,
  project: ProjectSummary | null,
  production: ProductionView | null,
  handoff: HandoffView | null
) {
  if (stage === 1) return Boolean(project)
  if (!production) return false
  if (stage === 2) return production.counts.sources > 0
  if (stage === 3) return production.counts.beats > 0
  if (stage === 4) return production.counts.episodes > 0
  if (stage === 5) return production.counts.assets > 0
  if (stage === 6) return production.counts.shots > 0
  if (stage === 7) {
    const readiness = readShotReadiness(production)
    return readiness.total > 0 && readiness.selected === readiness.total
  }
  return handoff?.status === 'delivered' || handoff?.status === 'proposal_ready'
}

function readShotReadiness(production: ProductionView | null) {
  if (!production) return { selected: 0, total: 0 }
  const shots = production.scenes.flatMap((scene) => scene.shots)
  return {
    selected: shots.filter((shot) =>
      shot.candidates.some((candidate) => candidate.selected && candidate.kind === 'video')
    ).length,
    total: shots.length
  }
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Story Studio remote root element was not found.')
createRoot(rootElement).render(<App />)
