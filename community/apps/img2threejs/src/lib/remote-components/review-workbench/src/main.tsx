import * as React from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowClockwise,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  CheckCircle,
  Circle,
  Cube,
  Export,
  Eye,
  ImageSquare,
  MagicWand,
  MagnifyingGlass,
  Plus,
  SlidersHorizontal,
  Sparkle,
  StopCircle,
  UploadSimple,
  WarningCircle
} from '@phosphor-icons/react'
import {
  executeAction,
  executeFileAction,
  installBridge,
  invokeClientCommand,
  post,
  reportResize,
  requestData
} from './bridge.js'
import { createRemoteLogger } from './debug.js'
import { createI18n, resolveLocale } from './i18n.js'
import { ReferencePreview } from './reference-preview.js'
import { ThreeViewer } from './three-viewer.js'
import type {
  BridgeMessage,
  HostContext,
  JsonObject,
  JsonValue,
  ProjectRow,
  SelectedData,
  WorkbenchData
} from './types.js'

const STAGES = [
  'blockout',
  'structural-pass',
  'form-refinement',
  'material-pass',
  'surface-pass',
  'lighting-pass',
  'interaction-pass',
  'optimization-pass'
] as const

const IMAGE_VIEWS = [
  'front',
  'three-quarter',
  'left',
  'right',
  'back',
  'top',
  'bottom',
  'detail'
] as const

const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'

type ImageView = (typeof IMAGE_VIEWS)[number]
type I18nFacade = ReturnType<typeof createI18n>

function isNarrowViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 880px)').matches
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )

  React.useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])

  return matches
}

function App() {
  const [context, setContext] = React.useState<HostContext | null>(null)
  const [data, setData] = React.useState<WorkbenchData | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [creationMode, setCreationMode] = React.useState(false)
  const [projectName, setProjectName] = React.useState('')
  const [projectRoute, setProjectRoute] = React.useState<'object' | 'character'>('object')
  const [modelingMode, setModelingMode] = React.useState<'semantic-3d' | 'relief'>('semantic-3d')
  const [uploadView, setUploadView] = React.useState<ImageView>('front')
  const [dragActive, setDragActive] = React.useState(false)
  const [notes, setNotes] = React.useState('')
  const [projectsCollapsed, setProjectsCollapsed] = React.useState(isNarrowViewport)
  const [inspectorCollapsed, setInspectorCollapsed] = React.useState(isNarrowViewport)
  const [stagesCollapsed, setStagesCollapsed] = React.useState(isNarrowViewport)
  const cancelDialog = React.useRef<HTMLDialogElement>(null)
  const reviewSection = React.useRef<HTMLDetailsElement>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)
  const contextRef = React.useRef<HostContext | null>(null)
  const selectedRef = React.useRef<string | null>(null)
  const loggerRef = React.useRef(createRemoteLogger(false))
  const narrowLayout = useMediaQuery('(max-width: 880px)')
  const previousNarrowLayout = React.useRef(narrowLayout)

  const i18n = React.useMemo(() => createI18n(resolveLocale(context?.locale)), [context?.locale])

  const load = React.useCallback(async (projectId = selectedRef.current, nextSearch = search) => {
    try {
      setError(null)
      const response = await requestData({
        page: 1,
        pageSize: 20,
        search: nextSearch,
        parameters: projectId ? { projectId } : {}
      })
      const parsed = parseWorkbenchData(response)
      setData(parsed)
      loggerRef.current.debug('response_applied', {
        projectCount: parsed.table.items.length,
        selected: Boolean(parsed.selected)
      })
    } catch {
      setError(i18n.t('loadFailed'))
      loggerRef.current.warn('request_failed')
    }
  }, [i18n, search])

  React.useEffect(() => {
    const dispose = installBridge({
      onInit: (nextContext) => {
        contextRef.current = nextContext
        loggerRef.current = createRemoteLogger(Boolean(nextContext.debug?.enabled))
        document.documentElement.lang = resolveLocale(nextContext.locale)
        setContext(nextContext)
      },
      onHostEvent: () => void load(selectedRef.current)
    })
    post('ready')
    return dispose
  }, [load])

  React.useEffect(() => {
    if (context) void load()
  }, [context, load])

  React.useEffect(() => {
    const timer = setTimeout(() => void load(selectedRef.current, search), 250)
    return () => clearTimeout(timer)
  }, [search, load])

  React.useEffect(() => {
    const observer = new ResizeObserver(() => reportResize())
    observer.observe(document.body)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    if (narrowLayout && !previousNarrowLayout.current) {
      setProjectsCollapsed(true)
      setInspectorCollapsed(true)
      setStagesCollapsed(true)
    }
    previousNarrowLayout.current = narrowLayout
  }, [narrowLayout])

  React.useEffect(() => {
    if (!data || selectedRef.current || creationMode || data.table.items.length === 0) return
    const first = data.table.items[0]
    selectedRef.current = first.id
    setSelectedId(first.id)
    void load(first.id)
  }, [creationMode, data, load])

  const selectProject = (row: ProjectRow) => {
    setCreationMode(false)
    if (narrowLayout) setProjectsCollapsed(true)
    selectedRef.current = row.id
    setSelectedId(row.id)
    void load(row.id)
  }

  const toggleProjects = () => {
    if (narrowLayout && projectsCollapsed) setInspectorCollapsed(true)
    setProjectsCollapsed((value) => !value)
  }

  const toggleInspector = () => {
    if (narrowLayout && inspectorCollapsed) setProjectsCollapsed(true)
    setInspectorCollapsed((value) => !value)
  }

  const runAction = async (actionKey: string, input: JsonObject): Promise<JsonObject | undefined> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const response = await executeAction(actionKey, input)
      const result = actionResult(response)
      if (result.success === false) throw new Error(actionFailureCode(result))
      await load(selectedRef.current)
      return object(result.data)
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'ACTION_FAILED'
      if (code.startsWith('REVISION_CONFLICT')) {
        await load(selectedRef.current)
        return { retry: true }
      }
      setError(i18n.t('actionFailedWithCode', { code }))
      return undefined
    } finally {
      setBusy(false)
    }
  }

  const createProject = async () => {
    const name = projectName.trim()
    if (!name) {
      setError(i18n.t('projectNameRequired'))
      return
    }
    const result = await runAction('create_project', {
      name,
      route: projectRoute,
      modelingMode
    })
    const projectId = stringValue(result?.projectId)
    if (!projectId) return
    selectedRef.current = projectId
    setSelectedId(projectId)
    setCreationMode(false)
    setNotice(i18n.t('projectCreated'))
    await load(projectId)
  }

  const uploadFiles = async (files: File[]) => {
    const selected = data?.selected
    if (!selected || files.length === 0) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      for (const file of files.slice(0, 12)) {
        const response = await executeFileAction(
          'upload_reference',
          selected.project.projectId,
          {
            projectId: selected.project.projectId,
            label: file.name,
            view: uploadView
          },
          file
        )
        const result = actionResult(response)
        if (result.success === false) throw new Error('UPLOAD_FAILED')
      }
      setNotice(i18n.t('uploadComplete', { count: Math.min(files.length, 12) }))
      await load(selected.project.projectId)
    } catch {
      setError(i18n.t('uploadFailed'))
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const startGeneration = async () => {
    const selected = data?.selected
    if (!selected) return
    const result = await runAction('start_generation', {
      projectId: selected.project.projectId
    })
    if (!result) return
    const clientCommand = object(result.clientCommand)
    if (clientCommand) {
      const commandKey = stringValue(clientCommand.commandKey)
      const payload = object(clientCommand.payload)
      if (commandKey !== ASSISTANT_CHAT_SEND_MESSAGE_COMMAND || !payload) {
        setError(i18n.t('agentRequestFailed'))
        return
      }
      setBusy(true)
      try {
        const response = await invokeClientCommand(commandKey, {
          ...payload,
          clientMessageId: `img2threejs:${selected.project.projectId}:${selected.project.cursor}:${Date.now()}`
        })
        const commandResult = object(response.result)
        if (commandResult?.success === false) throw new Error(actionFailureCode(commandResult))
        setNotice(i18n.t('agentRequestSent'))
        await load(selected.project.projectId)
      } catch {
        setError(i18n.t('agentRequestFailed'))
      } finally {
        setBusy(false)
      }
      return
    }
    setNotice(i18n.t('generationStageQueued'))
  }

  const submitReview = (humanReviewStatus: string, decision: string) => {
    const selected = data?.selected?.project
    if (!selected?.runId) return
    void runAction('submit_review', {
      projectId: selected.projectId,
      runId: selected.runId,
      humanReviewStatus,
      decision,
      notes
    })
  }

  if (!context || !data) {
    return <main className="studio-shell loading">{i18n.t('loading')}</main>
  }

  const selected = data.selected
  return (
    <main className="studio-shell">
      <StudioHeader
        i18n={i18n}
        selected={selected}
        busy={busy}
        onReview={() => {
          if (!reviewSection.current) return
          reviewSection.current.open = true
        }}
        onExport={() => {
          if (selected) void runAction('export_artifact', { projectId: selected.project.projectId })
        }}
      />
      {error ? <div className="studio-alert error" role="alert"><WarningCircle aria-hidden="true" />{error}</div> : null}
      {notice ? <div className="studio-alert success" role="status"><CheckCircle aria-hidden="true" />{notice}</div> : null}
      <div className={[
        'studio-workspace',
        projectsCollapsed ? 'projects-collapsed' : '',
        inspectorCollapsed ? 'inspector-collapsed' : '',
        narrowLayout ? 'narrow-layout' : ''
      ].filter(Boolean).join(' ')}>
        <ProjectRail
          i18n={i18n}
          projects={data.table.items}
          total={data.table.total}
          selectedId={selectedId}
          search={search}
          collapsed={projectsCollapsed}
          onToggle={toggleProjects}
          onSearch={setSearch}
          onSelect={selectProject}
          onCreate={() => {
            selectedRef.current = null
            setSelectedId(null)
            setCreationMode(true)
            setProjectName('')
            setProjectRoute('object')
            setModelingMode('semantic-3d')
            if (narrowLayout) {
              setProjectsCollapsed(true)
              setInspectorCollapsed(false)
            }
          }}
        />
        <StudioCanvas
          i18n={i18n}
          selected={selected}
          creationMode={creationMode}
          stagesCollapsed={stagesCollapsed}
          onToggleStages={() => setStagesCollapsed((value) => !value)}
        />
        <ProductionInspector
          i18n={i18n}
          selected={selected}
          creationMode={creationMode}
          projectName={projectName}
          onProjectName={setProjectName}
          projectRoute={projectRoute}
          onProjectRoute={setProjectRoute}
          modelingMode={modelingMode}
          onModelingMode={setModelingMode}
          uploadView={uploadView}
          onUploadView={setUploadView}
          busy={busy}
          dragActive={dragActive}
          collapsed={inspectorCollapsed}
          onToggle={toggleInspector}
          fileInput={fileInput}
          onCreate={createProject}
          onStart={startGeneration}
          onFiles={uploadFiles}
          onDragActive={setDragActive}
        />
      </div>
      {selected
        ? <ReviewDrawer
            ref={reviewSection}
            selected={selected}
            i18n={i18n}
            notes={notes}
            onNotes={setNotes}
            busy={busy}
            onReview={submitReview}
            onRetry={() => {
              const project = selected.project
              if (project.runId) void runAction('retry_run', {
                projectId: project.projectId,
                runId: project.runId
              })
            }}
            onCancel={() => cancelDialog.current?.showModal()}
          />
        : null}
      <dialog ref={cancelDialog} className="confirm-dialog" onCancel={() => cancelDialog.current?.close()}>
        <h2>{i18n.t('cancelTitle')}</h2>
        <p>{i18n.t('cancelDescription')}</p>
        <div className="dialog-actions">
          <button onClick={() => cancelDialog.current?.close()}>{i18n.t('keepRunning')}</button>
          <button
            className="destructive"
            disabled={busy}
            onClick={() => {
              cancelDialog.current?.close()
              const project = selected?.project
              if (project?.runId) void runAction('cancel_run', {
                projectId: project.projectId,
                runId: project.runId
              })
            }}
          >
            {i18n.t('confirmCancel')}
          </button>
        </div>
      </dialog>
    </main>
  )
}

function StudioHeader(props: {
  i18n: I18nFacade
  selected: SelectedData | null
  busy: boolean
  onReview: () => void
  onExport: () => void
}) {
  return (
    <header className="studio-header">
      <div className="studio-brand">
        <span className="brand-mark">3D</span>
        <div><strong>{props.i18n.t('studioTitle')}</strong><small>{props.i18n.t('studioEdition')}</small></div>
      </div>
      <div className="connection-state">
        <span className="status-dot ok" />
        {props.i18n.t('connected')}
      </div>
      <div className="header-actions">
        <button disabled={!props.selected} onClick={props.onReview}><Eye aria-hidden="true" /><span className="header-action-label">{props.i18n.t('openReview')}</span></button>
        <button disabled={!props.selected?.artifact.sourceAsset || props.busy} onClick={props.onExport}><Export aria-hidden="true" /><span className="header-action-label">{props.i18n.t('exportModel')}</span></button>
      </div>
    </header>
  )
}

function ProjectRail(props: {
  i18n: I18nFacade
  projects: ProjectRow[]
  total: number
  selectedId: string | null
  search: string
  collapsed: boolean
  onToggle: () => void
  onSearch: (value: string) => void
  onSelect: (project: ProjectRow) => void
  onCreate: () => void
}) {
  return (
    <aside className={`project-rail ${props.collapsed ? 'is-collapsed' : ''}`}>
      <div className="panel-toolbar project-panel-toolbar">
        {!props.collapsed
          ? <button className="new-project-button" onClick={props.onCreate}><Plus weight="bold" aria-hidden="true" />{props.i18n.t('newProject')}</button>
          : null}
        <button
          type="button"
          className="panel-collapse-button"
          aria-label={props.i18n.t(props.collapsed ? 'expandProjects' : 'collapseProjects')}
          title={props.i18n.t(props.collapsed ? 'expandProjects' : 'collapseProjects')}
          aria-expanded={!props.collapsed}
          onClick={props.onToggle}
        >
          {props.collapsed ? <CaretRight aria-hidden="true" /> : <CaretLeft aria-hidden="true" />}
        </button>
      </div>
      {!props.collapsed
        ? <>
            <div className="rail-heading"><span>{props.i18n.t('recentProjects')}</span><small>{props.total}</small></div>
            <label className="search-field">
              <MagnifyingGlass aria-hidden="true" />
              <input
                aria-label={props.i18n.t('search')}
                placeholder={props.i18n.t('search')}
                value={props.search}
                onChange={(event) => props.onSearch(event.currentTarget.value)}
              />
            </label>
            <div className="project-list">
              {props.projects.length === 0 ? <p className="empty">{props.i18n.t('emptyProjects')}</p> : null}
              {props.projects.map((project) => (
                <button
                  key={project.id}
                  className={`project-row ${props.selectedId === project.id ? 'selected' : ''}`}
                  onClick={() => props.onSelect(project)}
                >
                  <span className="project-icon"><Cube weight="duotone" aria-hidden="true" /></span>
                  <span className="project-copy">
                    <strong>{project.name}</strong>
                    <small>{props.i18n.route(project.route)} · {props.i18n.status(project.status)}</small>
                    <small><span className={`status-dot ${projectStatusTone(project.status)}`} />{props.i18n.formatDate(project.updatedAt)}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="rail-footer"><span>{props.i18n.t('workspaceScope')}</span></div>
          </>
        : <span className="collapsed-panel-label" aria-hidden="true">{props.i18n.t('recentProjects')}</span>}
    </aside>
  )
}

function StudioCanvas(props: {
  i18n: I18nFacade
  selected: SelectedData | null
  creationMode: boolean
  stagesCollapsed: boolean
  onToggleStages: () => void
}) {
  const resultByStage = new Map(props.selected?.stages.map((stage) => [stage.stage, stage]) ?? [])
  return (
    <section className={`canvas-stage ${props.stagesCollapsed ? 'stages-collapsed' : ''}`}>
      <div className="canvas-heading">
        <div>
          <h1>{props.selected?.project.name ?? props.i18n.t(props.creationMode ? 'untitledProject' : 'studioPreview')}</h1>
          <span className="route-chip"><Cube aria-hidden="true" />{props.i18n.route(props.selected?.project.route ?? 'object')}</span>
        </div>
        <div className="canvas-status">
          <span className={`status-dot ${projectStatusTone(props.selected?.project.status ?? 'draft')}`} />
          {props.i18n.status(props.selected?.project.status ?? 'draft')}
        </div>
      </div>
      <div className="studio-viewer">
        {props.selected?.viewerScene
          ? <ThreeViewer
              scene={props.selected.viewerScene}
              modelUrl={props.selected.artifact.modelPreviewUrl}
              labels={{
                ariaLabel: props.i18n.t('viewerAriaLabel'),
                autoRotate: props.i18n.t('autoRotate'),
                dragHint: props.i18n.t('viewerHint'),
                loading: props.i18n.t('viewerLoading'),
                playAnimation: props.i18n.t('playAnimation'),
                ready: props.i18n.t('viewerReady'),
                resetView: props.i18n.t('resetView'),
                unavailable: props.i18n.t('viewerUnavailable')
              }}
            />
          : <div className="viewer-empty-note">
              <Sparkle weight="fill" aria-hidden="true" />
              <strong>{props.creationMode ? props.i18n.t('createToBegin') : props.i18n.t('uploadToBegin')}</strong>
              <span>{props.i18n.t('noGeneratedModelHint')}</span>
            </div>}
      </div>
      <section className={`stage-monitor ${props.stagesCollapsed ? 'is-collapsed' : ''}`} aria-label={props.i18n.t('generationProgress')}>
        <div className="stage-monitor-heading">
          <div><strong>{props.i18n.t('generationProgress')}</strong><span>{passedCount(props.selected)} / {STAGES.length}</span></div>
          <div className="stage-monitor-actions">
            <small>{props.selected?.project.currentStage ? props.i18n.stage(props.selected.project.currentStage) : props.i18n.t('ready')}</small>
            <button
              type="button"
              className="panel-collapse-button"
              aria-label={props.i18n.t(props.stagesCollapsed ? 'expandStages' : 'collapseStages')}
              title={props.i18n.t(props.stagesCollapsed ? 'expandStages' : 'collapseStages')}
              aria-expanded={!props.stagesCollapsed}
              onClick={props.onToggleStages}
            >
              <CaretDown className={props.stagesCollapsed ? '' : 'caret-open'} aria-hidden="true" />
            </button>
          </div>
        </div>
        {!props.stagesCollapsed
          ? <ol>
              {STAGES.map((stage, index) => {
                const result = resultByStage.get(stage)
                const current = props.selected?.project.currentStage === stage &&
                  (props.selected.project.status === 'queued' || props.selected.project.status === 'running')
                const tone = result?.status === 'passed' ? 'passed' : result?.status === 'failed' ? 'failed' : current ? 'active' : 'waiting'
                return (
                  <li key={stage} className={tone}>
                    <span>{result?.status === 'passed' ? <Check weight="bold" /> : index + 1}</span>
                    <small>{props.i18n.stage(stage)}</small>
                  </li>
                )
              })}
            </ol>
          : null}
      </section>
    </section>
  )
}

function ProductionInspector(props: {
  i18n: I18nFacade
  selected: SelectedData | null
  creationMode: boolean
  projectName: string
  onProjectName: (value: string) => void
  projectRoute: 'object' | 'character'
  onProjectRoute: (value: 'object' | 'character') => void
  modelingMode: 'semantic-3d' | 'relief'
  onModelingMode: (value: 'semantic-3d' | 'relief') => void
  uploadView: ImageView
  onUploadView: (view: ImageView) => void
  busy: boolean
  dragActive: boolean
  collapsed: boolean
  onToggle: () => void
  fileInput: React.RefObject<HTMLInputElement>
  onCreate: () => void
  onStart: () => void
  onFiles: (files: File[]) => void
  onDragActive: (active: boolean) => void
}) {
  const selected = props.selected
  const images = selected?.images ?? []
  const completed = passedCount(selected)
  const generating = Boolean(selected && ['queued', 'running'].includes(selected.project.status))
  const finished = completed === STAGES.length
  const started = completed > 0
  const activeStep = props.creationMode ? 1 : images.length === 0 ? 2 : 3
  const handleFiles = (list: FileList | null) => {
    if (list) void props.onFiles(Array.from(list))
  }
  return (
    <aside className={`production-inspector ${props.collapsed ? 'is-collapsed' : ''}`}>
      <div className="panel-toolbar inspector-panel-toolbar">
        {!props.collapsed ? <strong>{props.i18n.t('creationWorkflow')}</strong> : null}
        <button
          type="button"
          className="panel-collapse-button"
          aria-label={props.i18n.t(props.collapsed ? 'expandInspector' : 'collapseInspector')}
          title={props.i18n.t(props.collapsed ? 'expandInspector' : 'collapseInspector')}
          aria-expanded={!props.collapsed}
          onClick={props.onToggle}
        >
          {props.collapsed ? <CaretLeft aria-hidden="true" /> : <CaretRight aria-hidden="true" />}
        </button>
      </div>
      {props.collapsed
        ? <span className="collapsed-panel-label" aria-hidden="true">{props.i18n.t('creationWorkflow')}</span>
        : <>
      <ol className="workflow-steps" aria-label={props.i18n.t('creationWorkflow')}>
        {[props.i18n.t('stepProject'), props.i18n.t('stepReferences'), props.i18n.t('stepGenerate')].map((label, index) => {
          const number = index + 1
          return (
            <li key={label} className={number === activeStep ? 'active' : number < activeStep ? 'done' : ''}>
              <span>{number < activeStep ? <Check weight="bold" /> : number}</span>
              <small>{label}</small>
            </li>
          )
        })}
      </ol>
      <div className="inspector-scroll">
        <details className="inspector-section collapsible-section" open>
          <summary className="section-title"><SlidersHorizontal aria-hidden="true" /><h2>{props.i18n.t('projectSetup')}</h2><CaretDown className="section-caret" aria-hidden="true" /></summary>
          <div className="inspector-section-content">
          <label>
            <span>{props.i18n.t('projectType')}</span>
            <div className="segmented-control">
              <button
                type="button"
                className={(props.creationMode ? props.projectRoute : selected?.project.route) === 'object' ? 'selected' : ''}
                disabled={!props.creationMode}
                onClick={() => props.onProjectRoute('object')}
              ><Cube aria-hidden="true" />{props.i18n.t('objectRoute')}</button>
              <button
                type="button"
                className={(props.creationMode ? props.projectRoute : selected?.project.route) === 'character' ? 'selected' : ''}
                disabled={!props.creationMode}
                onClick={() => props.onProjectRoute('character')}
              ><Circle aria-hidden="true" />{props.i18n.t('characterRoute')}</button>
            </div>
          </label>
          <label>
            <span>{props.i18n.t('modelingMode')}</span>
            <select
              value={props.creationMode ? props.modelingMode : selected?.project.modelingMode ?? 'semantic-3d'}
              disabled={!props.creationMode}
              onChange={(event) => props.onModelingMode(event.currentTarget.value as 'semantic-3d' | 'relief')}
            >
              <option value="semantic-3d">{props.i18n.t('semantic3dMode')}</option>
              <option value="relief">{props.i18n.t('reliefMode')}</option>
            </select>
            <small>
              {props.i18n.t(
                (props.creationMode ? props.modelingMode : selected?.project.modelingMode) === 'relief'
                  ? 'reliefModeHint'
                  : 'semantic3dModeHint'
              )}
            </small>
          </label>
          <label>
            <span>{props.i18n.t('projectName')}</span>
            <input
              value={props.creationMode ? props.projectName : selected?.project.name ?? ''}
              disabled={!props.creationMode}
              maxLength={160}
              placeholder={props.i18n.t('projectNamePlaceholder')}
              onInput={(event) => props.onProjectName(event.currentTarget.value)}
            />
          </label>
          </div>
        </details>
        {!props.creationMode
          ? <details className="inspector-section collapsible-section" open>
              <summary className="section-title">
                <ImageSquare aria-hidden="true" />
                <h2>{props.i18n.t('referenceImages')}</h2>
                <small>{images.length} / 12</small>
                <CaretDown className="section-caret" aria-hidden="true" />
              </summary>
              <div className="inspector-section-content">
              {images.length
                ? <div className="reference-strip">
                    {images.map((image) => (
                      <article key={image.id} className="reference-thumb">
                        <ReferencePreview
                          fileKey={image.previewFileKey}
                          projectId={selected?.project.projectId ?? ''}
                          previewUrl={image.previewUrl}
                          alt={image.label}
                          unavailableLabel={props.i18n.t('previewUnavailable')}
                        />
                        <div><strong>{image.label}</strong><small>{props.i18n.view(image.view)}</small></div>
                        <span className={`admission-state ${image.admissionStatus}`}>
                          {image.admissionStatus === 'admitted' ? <CheckCircle weight="fill" /> : <WarningCircle weight="fill" />}
                        </span>
                      </article>
                    ))}
                  </div>
                : <p className="inspector-empty">{props.i18n.t('noReferences')}</p>}
              <label>
                <span>{props.i18n.t('declaredView')}</span>
                <select value={props.uploadView} onChange={(event) => props.onUploadView(event.currentTarget.value as ImageView)}>
                  {IMAGE_VIEWS.map((view) => <option key={view} value={view}>{props.i18n.view(view)}</option>)}
                </select>
              </label>
              <button
                type="button"
                className={`upload-zone ${props.dragActive ? 'dragging' : ''}`}
                disabled={props.busy}
                onClick={() => props.fileInput.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault()
                  props.onDragActive(true)
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => props.onDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  props.onDragActive(false)
                  handleFiles(event.dataTransfer.files)
                }}
              >
                <UploadSimple size={30} weight="duotone" aria-hidden="true" />
                <strong>{props.i18n.t('uploadDropTitle')}</strong>
                <small>{props.i18n.t('uploadDropHint')}</small>
              </button>
              <input
                ref={props.fileInput}
                className="visually-hidden"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                aria-label={props.i18n.t('chooseImages')}
                onChange={(event) => handleFiles(event.currentTarget.files)}
              />
              <p className="upload-tip">{props.i18n.t('multiViewTip')}</p>
              </div>
            </details>
          : null}
      </div>
      <div className="inspector-primary">
        {props.creationMode
          ? <button className="primary-action" disabled={props.busy} onClick={props.onCreate}>
              <Plus weight="bold" aria-hidden="true" />{props.i18n.t('createProject')}
            </button>
          : <button
              className="primary-action"
              disabled={props.busy || images.every((image) => image.admissionStatus !== 'admitted') || generating}
              onClick={props.onStart}
            >
              {generating ? <ArrowClockwise className="spin" aria-hidden="true" /> : <MagicWand weight="fill" aria-hidden="true" />}
              {finished
                ? props.i18n.t('regenerateFromImages')
                : generating
                  ? props.i18n.t('generating')
                  : props.i18n.t(
                      selected?.project.modelingMode === 'semantic-3d'
                        ? 'askAgentToGenerate'
                        : started ? 'continueGeneration' : 'startGeneration'
                    )}
            </button>}
        {!props.creationMode && images.length === 0 ? <small>{props.i18n.t('uploadBeforeGenerate')}</small> : null}
      </div>
        </>}
    </aside>
  )
}

const ReviewDrawer = React.forwardRef<HTMLDetailsElement, {
  selected: SelectedData
  i18n: I18nFacade
  notes: string
  onNotes: (value: string) => void
  busy: boolean
  onReview: (status: string, decision: string) => void
  onRetry: () => void
  onCancel: () => void
}>(function ReviewDrawer(props, ref) {
  const quality = object(props.selected.artifact.renderReport?.quality)
  const alignment = object(quality?.referenceAlignment)
  const multiAngle = object(quality?.multiAngle)
  const correction = object(props.selected.artifact.renderReport?.correction)
  const featureResults = Array.isArray(quality?.featureResults)
    ? quality.featureResults.map((item) => object(item)).filter((item): item is JsonObject => Boolean(item))
    : []
  const hardGateBlocked = Boolean(quality && quality.passed !== true)
  return (
    <details ref={ref} className="review-drawer">
      <summary><Eye aria-hidden="true" /><strong>{props.i18n.t('reviewAndDiagnostics')}</strong><span>{props.i18n.t('reviewSummary')}</span></summary>
      <div className="review-drawer-content">
        <section>
          <h3>{props.i18n.t('qualityStatus')}</h3>
          <dl className="quality-facts">
            <div><dt>{props.i18n.t('deterministic')}</dt><dd>{props.i18n.status(props.selected.project.deterministicStatus)}</dd></div>
            <div><dt>{props.i18n.t('visual')}</dt><dd>{props.i18n.status(props.selected.project.visualStatus)}</dd></div>
            <div><dt>{props.i18n.t('codePackage')}</dt><dd>{props.selected.artifact.sourceAsset ? props.i18n.t('available') : props.i18n.t('unavailable')}</dd></div>
            <div><dt>{props.i18n.t('sandboxRender')}</dt><dd>{props.selected.artifact.capabilities.sandboxRender.available ? props.i18n.t('available') : props.i18n.t('unavailable')}</dd></div>
          </dl>
          {quality
            ? <section className="fidelity-diagnostics" aria-label={props.i18n.t('fidelityDiagnostics')}>
                <h3>{props.i18n.t('fidelityDiagnostics')}</h3>
                <dl className="fidelity-grid">
                  <Metric label={props.i18n.t('silhouetteIoU')} value={alignment?.silhouetteIoU} />
                  <Metric label={props.i18n.t('scaleScore')} value={alignment?.scaleScore} />
                  <Metric label={props.i18n.t('edgeScore')} value={alignment?.edgeScore} />
                  <Metric label={props.i18n.t('perceptualScore')} value={alignment?.perceptualScore} />
                  <Metric label={props.i18n.t('maskConfidence')} value={alignment?.maskConfidence} />
                  <Metric label={props.i18n.t('silhouetteRetention')} value={multiAngle?.silhouetteRetention} />
                  <Metric label={props.i18n.t('volumeAxisRatio')} value={multiAngle?.volumeAxisRatio} />
                  <CountMetric
                    label={props.i18n.t('runtimeMeshes')}
                    value={quality.runtimeMeshCount}
                    minimum={quality.minimumRuntimeMeshCount}
                  />
                </dl>
                {featureResults.length
                  ? <ul className="feature-gates">
                      {featureResults.map((feature) => (
                        <li key={String(feature.id)}>
                          <span>{String(feature.label ?? feature.id)}</span>
                          <strong className={feature.passed === true ? 'gate-pass' : 'gate-fail'}>
                            {formatMetric(feature.score)} / {formatMetric(feature.threshold)}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  : null}
                {correction
                  ? <p className="correction-route">
                      {props.i18n.t('correctionRoute', {
                        iteration: Number(correction.iteration ?? 0),
                        maximum: Number(correction.maximumIterations ?? 0),
                        decision: String(correction.recommendedDecision ?? props.selected.project.nextDecision)
                      })}
                    </p>
                  : null}
              </section>
            : null}
          {props.selected.artifact.comparisonPreviewUrl
            ? <img className="comparison-preview" src={props.selected.artifact.comparisonPreviewUrl} alt={props.i18n.t('comparison')} />
            : null}
        </section>
        <section className="review-form">
          <label>{props.i18n.t('notes')}<textarea value={props.notes} onChange={(event) => props.onNotes(event.currentTarget.value)} placeholder={props.i18n.t('notesPlaceholder')} /></label>
          {hardGateBlocked ? <p className="gate-blocked-note">{props.i18n.t('hardGateBlocked')}</p> : null}
          <div className="action-row">
            <button disabled={props.busy || hardGateBlocked} onClick={() => props.onReview('approved', 'continue')}>{props.i18n.t('approveContinue')}</button>
            <button disabled={props.busy || hardGateBlocked} onClick={() => props.onReview('approved', 'stop')}>{props.i18n.t('approveStop')}</button>
            <button disabled={props.busy} onClick={() => props.onReview('changes_requested', 'refine-spec')}>{props.i18n.t('requestSpec')}</button>
            <button disabled={props.busy} onClick={props.onRetry}><ArrowClockwise aria-hidden="true" />{props.i18n.t('retry')}</button>
            <button className="destructive-outline" disabled={props.busy} onClick={props.onCancel}><StopCircle aria-hidden="true" />{props.i18n.t('cancel')}</button>
          </div>
        </section>
      </div>
    </details>
  )
})

function Metric(props: { label: string; value: JsonValue | undefined }) {
  return <div><dt>{props.label}</dt><dd>{formatMetric(props.value)}</dd></div>
}

function CountMetric(props: { label: string; value: JsonValue | undefined; minimum: JsonValue | undefined }) {
  const value = typeof props.value === 'number' && Number.isFinite(props.value) ? Math.round(props.value) : null
  const minimum = typeof props.minimum === 'number' && Number.isFinite(props.minimum) ? Math.round(props.minimum) : null
  return <div><dt>{props.label}</dt><dd>{value === null ? '—' : minimum === null ? value : `${value} / ${minimum}`}</dd></div>
}

function formatMetric(value: JsonValue | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : '—'
}

function actionResult(response: BridgeMessage): JsonObject {
  const result = object(response.result)
  if (!result) throw new Error('INVALID_ACTION_RESULT')
  return result
}

function actionFailureCode(result: JsonObject): string {
  if (typeof result.message === 'string' && result.message.trim()) return result.message.trim().slice(0, 120)
  const localized = object(result.message)
  for (const key of ['zh_Hans', 'en_US']) {
    const value = localized?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 120)
  }
  return 'ACTION_FAILED'
}

function parseWorkbenchData(response: BridgeMessage): WorkbenchData {
  const payload = object(response.data) ?? object(response.result)
  if (!payload) throw new Error('INVALID_VIEW_DATA')
  const meta = object(payload.meta)
  return (meta ?? payload) as WorkbenchData
}

function object(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function numberValue(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function passedCount(selected: SelectedData | null): number {
  return selected?.stages.filter((stage) => stage.status === 'passed').length ?? 0
}

function projectStatusTone(status: string): string {
  if (status === 'completed' || status === 'review_required' || status === 'passed') return 'ok'
  if (status === 'failed' || status === 'cancelled') return 'off'
  if (status === 'queued' || status === 'running' || status === 'building') return 'busy'
  return 'idle'
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Remote component root is missing.')
createRoot(rootElement).render(<App />)
