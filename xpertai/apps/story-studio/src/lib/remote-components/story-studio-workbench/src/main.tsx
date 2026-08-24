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
  requireSuccessfulActionData,
  setRuntimeText,
  startRemoteBridge,
  type RemoteBridgeContext,
  type RemoteValue
} from './runtime'
import { buildStoryStudioAssistantContext } from './assistant-context'
import { storyStudioDebug } from './debug-logger'
import {
  destinationStageForStoryTool,
  normalizeStoryToolEvent
} from './tool-event'
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
  productionActionDocument,
  type HandoffView,
  type ProductionView
} from './production-panel'
import { DirectorWorkbench } from './director-workbench'
import type { WorkbenchSaveState } from './director-types'
import { TemplateCenterDialog } from './template-center-dialog'
import {
  STORY_TEMPLATES,
  templateToDraft,
  templateToProduction,
  type StoryTemplate
} from './story-templates'
import { hydrateProductionMediaAccess } from './production-media-access'
import { useStoryEditor } from './use-story-editor'
import { useAssetBibleActions } from './use-asset-bible-actions'
import { useMediaGenerationActions } from './use-media-generation-actions'
import { findHandoff, readHostThemeMode } from './workbench-data'
import { createManualStarterProduction } from './manual-production'
import { selectPrimaryAssetImageCandidate } from './director-production-crud'
import { selectedVideoCandidate } from './director-storyboard-media'
import {
  hasUnhydratedCompletedVideoTask,
  isActiveVideoTask,
  parseVideoGeneratorCatalog,
  parseVideoTaskList,
  parseVideoTasks,
  type VideoGenerationTask,
  type VideoGeneratorCatalog
} from './video-generation-data'

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

function productionCandidateIds(production: ProductionView | null) {
  const candidateIds = new Set<string>()
  for (const scene of production?.scenes ?? []) {
    for (const shot of scene.shots) {
      for (const candidate of shot.candidates) candidateIds.add(candidate.id)
    }
  }
  return candidateIds
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
  const [saveState, setSaveState] = React.useState<WorkbenchSaveState>('saved')
  const [handingOff, setHandingOff] = React.useState(false)
  const [production, setProduction] = React.useState<ProductionView | null>(null)
  const [handoff, setHandoff] = React.useState<HandoffView | null>(null)
  const [videoGenerators, setVideoGenerators] = React.useState<VideoGeneratorCatalog | null>(null)
  const [videoTasks, setVideoTasks] = React.useState<VideoGenerationTask[]>([])
  const [activeStage, setActiveStage] = React.useState(6)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [templateCenterOpen, setTemplateCenterOpen] = React.useState(false)
  const [pendingTemplateId, setPendingTemplateId] = React.useState<string | null>(null)
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
  const productionRef = React.useRef<ProductionView | null>(null)
  const videoTaskPollInFlightRef = React.useRef(false)
  const t = React.useMemo(
    () => createTranslator(context?.locale),
    [context?.locale]
  )
  const themeMode = readHostThemeMode(context?.theme)
  const pendingTemplate = React.useMemo(
    () => pendingTemplateId
      ? STORY_TEMPLATES.find((template) => template.id === pendingTemplateId) ?? null
      : null,
    [pendingTemplateId]
  )
  const workingProduction = React.useMemo(
    () =>
      production ??
      (selected ? createManualStarterProduction(selected, t) : null),
    [production, selected?.id, selected?.revision, context?.locale]
  )
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
    production: workingProduction,
    getProject: () => selectedRef.current,
    getSnapshot: requestProjectSnapshot,
    reload: (projectId) => reloadProjects(projectId),
    t
  })
  const assetBibleActions = useAssetBibleActions({
    project: selected,
    production: workingProduction,
    reload: (projectId) => reloadProjects(projectId),
    t
  })
  const mediaGenerationActions = useMediaGenerationActions({
    project: selected,
    production: workingProduction,
    reload: (projectId) => reloadProjects(projectId),
    refreshVideoTasks,
    selectVideoGenerator: (toolsetId) => {
      setVideoGenerators((current) => current
        ? { ...current, selectedToolsetId: toolsetId }
        : current)
    },
    setBusy,
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
        void applyInitialWorkbenchPayload(nextContext.payload)
      },
      (event) => void refreshAfterToolEventRef.current(event)
    )
    post('ready')
  }, [])

  React.useEffect(reportResize, [
    projects,
    selected,
    production,
    handoff,
    page,
    total,
    busy,
    mediaGenerationActions.generating,
    handingOff,
    createOpen,
    templateCenterOpen,
    activeStage,
    themeMode,
    projectsCollapsed,
    inspectorCollapsed,
    editor,
    discardOpen,
    context?.locale
  ])

  React.useEffect(() => {
    const projectId = selected?.id
    if (!projectId || !videoTasks.some(isActiveVideoTask)) return
    const timer = window.setInterval(() => {
      if (editorRef.current?.dirty) return
      void refreshVideoTasks(projectId, true)
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [selected?.id, videoTasks])

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

  async function applyInitialWorkbenchPayload(value: RemoteValue) {
    const applied = await applyWorkbenchPayload(value)
    if (!applied) await reloadProjects()
  }

  async function applyWorkbenchPayload(value: RemoteValue) {
    const payload = isRemoteObject(value) ? value : null
    if (!payload || (!isRemoteObject(payload.projects) && !isRemoteObject(payload.table))) {
      return false
    }
    const nextProjects = readProjectList(payload)
    const pagination = readPagination(payload, PROJECT_PAGE_SIZE)
    const nextDetail = parseProject(payload.detail)
    const nextProduction = await hydrateProductionMediaAccess(
      parseProductionView(payload.production),
      nextDetail?.id ?? null
    )
    setProjects(nextProjects)
    setPage(pagination.page)
    pageRef.current = pagination.page
    setTotal(pagination.total)
    productionRef.current = nextProduction
    setProduction(nextProduction)
    setHandoff(parseHandoffView(payload.handoff))
    setVideoGenerators(parseVideoGeneratorCatalog(payload))
    setVideoTasks(parseVideoTasks(payload))
    if (nextDetail) {
      selectedRef.current = nextDetail
      setSelected(nextDetail)
    }
    return true
  }

  async function refreshVideoTasks(projectId: string, silent = false) {
    if (videoTaskPollInFlightRef.current) return
    videoTaskPollInFlightRef.current = true
    try {
      const response = await executeAction('list_shot_video_tasks', projectId, {
        projectId,
        page: 1,
        pageSize: 50
      })
      const data = requireSuccessfulActionData(response)
      const nextTasks = parseVideoTaskList(data)
      setVideoTasks(nextTasks)
      if (hasUnhydratedCompletedVideoTask(
        nextTasks,
        productionCandidateIds(productionRef.current)
      )) {
        storyStudioDebug.info('videoTasks.completed.refreshProduction', {
          projectId
        })
        await reloadProjects(projectId, pageRef.current, true)
      }
    } catch (error) {
      if (!silent) throw error
      storyStudioDebug.warn('videoTasks.refresh.failed', {
        message: getErrorMessage(error instanceof Error ? error : String(error))
      })
    } finally {
      videoTaskPollInFlightRef.current = false
    }
  }

  async function reloadProjects(
    preferredId = selectedRef.current?.id ?? null,
    requestedPage = pageRef.current,
    silent = false
  ) {
    if (!silent) setBusy(true)
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
      const nextProduction = await hydrateProductionMediaAccess(
        object ? parseProductionView(object.production) : null,
        nextDetail?.id ?? preferredId
      )
      productionRef.current = nextProduction
      setProduction(nextProduction)
      setHandoff(object ? parseHandoffView(object.handoff) : null)
      setVideoGenerators(object ? parseVideoGeneratorCatalog(object) : null)
      setVideoTasks(object ? parseVideoTasks(object) : [])
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
      if (!silent) setBusy(false)
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
      setPendingTemplateId(null)
      setActiveStage(4)
      notify('success', t('messages.created'))
      pageRef.current = 1
      await reloadProjects(projectId, 1)
      const createdProject = selectedRef.current
      if (createdProject?.id === projectId) {
        const starterProduction = pendingTemplate
          ? templateToProduction(pendingTemplate, createdProject, t)
          : createManualStarterProduction(createdProject, t)
        const saved = await commitProduction(
          4,
          starterProduction,
          pendingTemplate
            ? t('changes.templateProductionStarted', { template: t(pendingTemplate.title) })
            : t('changes.manualProductionStarted')
        )
        if (!saved) {
          productionRef.current = starterProduction
          setProduction(starterProduction)
        }
      }
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
    } finally {
      setBusy(false)
    }
  }

  function useStoryTemplate(template: StoryTemplate) {
    setPendingTemplateId(template.id)
    setDraft(templateToDraft(template, (key) => t(key)))
    setTemplateCenterOpen(false)
    setCreateOpen(true)
  }

  function openCreateProject() {
    setPendingTemplateId(null)
    setDraft(EMPTY_PROJECT_DRAFT)
    setCreateOpen(true)
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

  async function commitProduction(
    stage: 4 | 5 | 6,
    draft: ProductionView,
    changeSummary: string,
    options?: { silent?: boolean }
  ) {
    const project = selectedRef.current
    if (!project) return false
    setSaveState('saving')
    setBusy(true)
    try {
      requireSuccessfulAction(
        await executeAction('save_production', project.id, {
          projectId: project.id,
          operationId: crypto.randomUUID(),
          baseRevision: project.revision,
          production: productionActionDocument(draft),
          changeSummary: changeSummary || t('changes.productionSaved', { title: project.title, stage })
        })
      )
      if (!options?.silent) notify('success', t('editor.saved'))
      await reloadProjects(project.id)
      setSaveState('saved')
      return true
    } catch (error) {
      notify(
        'error',
        getErrorMessage(error instanceof Error ? error : String(error))
      )
      setSaveState('error')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function lockAssetReference(assetId: string, candidateId: string) {
    const currentProduction = productionRef.current
    if (!currentProduction) return
    const draft = structuredClone(currentProduction)
    const asset = draft.assets.find((item) => item.id === assetId)
    if (!asset) return
    if (!selectPrimaryAssetImageCandidate(draft, assetId, candidateId)) {
      storyStudioDebug.debug('assetReference.lock.skipped', {
        assetId,
        candidateId,
        reason: 'already-selected-or-invalid'
      })
      return
    }
    await commitProduction(5, draft, t('changes.assetSaved', { name: asset.name }))
  }

  function requestScriptSuggestion(input: {
    episodeId: string
    sceneId?: string
    shotId?: string
    focusText: string
  }) {
    const project = selectedRef.current
    if (!project) return
    const text = [
      `Review Story Studio project ${project.id} at revision ${project.revision}.`,
      `Create one concrete AI adaptation suggestion for episode ${input.episodeId}${input.sceneId ? `, scene ${input.sceneId}` : ''}${input.shotId ? `, shot ${input.shotId}` : ''}.`,
      `Focus on this selected material: ${input.focusText}`,
      'First read the latest production, then use story_create_adaptation_suggestion. Return the suggestion to the Workbench through that middleware tool. Do not rewrite or accept the script automatically.'
    ].join('\n\n')
    void invokeClientCommand(ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, {
      text,
      clientMessageId: `story-studio:adaptation-suggestion:${Date.now()}`,
      state: { source: '@xpert-ai/plugin-story-studio', action: 'create_adaptation_suggestion', projectId: project.id, ...input }
    }).catch((error) => notify('error', getErrorMessage(error instanceof Error ? error : String(error))))
  }

  function generateFourTakes(input: {
    sceneId: string
    shotId: string
    prompt: string
    toolsetId: string
    model: string
    resolution: string
    aspectRatio: string
    fps: number
    takeCount: number
    referenceAssetIds: string[]
    referenceImageCandidateIds: string[]
    redoScope?: string
  }) {
    void mediaGenerationActions.generateTakes(input)
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
    const destinationStage = destinationStageForStoryTool(normalized.toolName)
    if (destinationStage !== null) {
      setActiveStage(destinationStage)
    }
    notify('info', t('messages.agentRefresh'))
  }

  refreshAfterToolEventRef.current = refreshAfterToolEvent

  return (
    <>
      <DirectorWorkbench
        projects={projects}
        selected={selected}
        production={workingProduction}
        productionLoaded={Boolean(production)}
        saveState={saveState}
        onSaveStateChange={setSaveState}
        handoff={handoff}
        activeStage={activeStage}
        busy={busy}
        generating={mediaGenerationActions.generating}
        videoGenerators={videoGenerators}
        videoTasks={videoTasks}
        handingOff={handingOff}
        t={t}
        onNavigate={(stage) => requestNavigation({ kind: 'stage', stage })}
        onRefresh={() => requestNavigation({ kind: 'refresh' })}
        onLoadDemo={() => void createDemoProject()}
        onNewProject={openCreateProject}
        onOpenTemplateCenter={() => setTemplateCenterOpen(true)}
        onSelectProject={(projectId) => selectProject(projectId)}
        onCommitProduction={commitProduction}
        onRequestScriptSuggestion={requestScriptSuggestion}
        onGenerateAsset={(asset, referenceSet) =>
          void assetBibleActions.generate(asset, referenceSet)
        }
        onUploadAsset={assetBibleActions.upload}
        onUploadAssetBatch={assetBibleActions.uploadMany}
        onUploadVoiceReference={assetBibleActions.uploadVoiceReference}
        onUploadShotReference={(sceneId, shotId, prompt, file) =>
          void assetBibleActions.uploadShotReference(
            sceneId,
            shotId,
            prompt,
            file
          )
        }
        onLockAsset={(assetId, candidateId) =>
          void lockAssetReference(assetId, candidateId)
        }
        onGenerateTakes={generateFourTakes}
        onSetVideoGenerator={(toolsetId) =>
          void mediaGenerationActions.setGenerator(toolsetId)
        }
        onCancelVideoTask={(taskId) =>
          void mediaGenerationActions.cancelTask(taskId)
        }
        onRetryVideoTask={(taskId) =>
          void mediaGenerationActions.retryTask(taskId)
        }
        onSelectTake={(sceneId, shotId, candidateId) =>
          void mediaGenerationActions.selectCandidate(
            sceneId,
            shotId,
            candidateId
          )
        }
        onHandoff={() => void prepareCutHandoff()}
      />
      <CreateProjectDialog
        open={createOpen}
        busy={busy}
        draft={draft}
        templateName={pendingTemplate ? t(pendingTemplate.title) : null}
        onOpenChange={setCreateOpen}
        onDraftChange={setDraft}
        onCreate={() => void createProject()}
        t={t}
      />
      <TemplateCenterDialog
        open={templateCenterOpen}
        onOpenChange={setTemplateCenterOpen}
        onUseTemplate={useStoryTemplate}
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
    </>
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
      Boolean(selectedVideoCandidate(shot.candidates))
    ).length,
    total: shots.length
  }
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Story Studio remote root element was not found.')
createRoot(rootElement).render(<App />)
