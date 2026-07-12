import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Input } from '@xpert-ai/plugin-shadcn-ui'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import { canExport, exportMp4 } from './video-export.js'
import { createTranslator, localizeOptions } from './i18n'
import { createRenderableComposition } from './video-renderer'
import type { MotionVideoComposition } from './video-renderer'
import {
  applyMotionTemplate,
  findLayer,
  getLayerList,
  layerBounds,
  updateLayerInComposition
} from '../../../workbench-model'
import {
  executeAction,
  executeFileAction,
  getErrorMessage,
  getResponsePayload,
  isObject,
  notify,
  post,
  reportResize,
  requestData,
  setRuntimeText,
  startRemoteBridge
} from './runtime'
import type { RemoteBridgeContext, RemotePayloadObject, RemotePayloadValue } from './runtime'
import {
  KEYFRAME_PROPS,
  RECIPE_STATUS_OPTIONS,
  RECIPE_SURFACE_OPTIONS,
  RECIPE_TARGET_OPTIONS,
  type HeaderContext,
  type HtmlControls,
  type MotionSurface,
  type MotionViewData,
  type PagedResult,
  type ProjectDetail,
  type ProjectSummary,
  type RecipeFilters,
  type RecipeSummary,
  type TabKey
} from './motion-types'
import { Button, MotionSelect, h } from './ui'
import { WorkbenchHeader } from './workbench-header'
import { ProjectDialog } from './project-dialog'
import { ExportsDialog, VersionsDialog } from './versions-exports'
import { HtmlWorkbench } from './html-workbench'
import { VideoComposer } from './video-composer'
import { LibraryTab } from './library-tab'
import { applyHtmlSelectionMotion } from './html-workbench-utils'
import {
  controlsForRecipe,
  defaultTracks,
  kineticForRecipe,
  motionTemplateForRecipe,
  resolveHtmlRecipeSelector
} from './recipe-utils'
import './app.css'

const EMPTY_PAGED = { items: [], total: 0, page: 1, pageSize: 20 }

function App() {
  const [context, setContext] = React.useState<RemoteBridgeContext | null>(null)
  const [viewData, setViewData] = React.useState<MotionViewData>(() => emptyViewData())
  const [activeTab, setActiveTab] = React.useState<TabKey>('html')
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null)
  const [projectDialogOpen, setProjectDialogOpen] = React.useState(false)
  const [versionsDialogOpen, setVersionsDialogOpen] = React.useState(false)
  const [exportsDialogOpen, setExportsDialogOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [recipeFilters, setRecipeFilters] = React.useState<RecipeFilters>(() => ({ surface: 'all', target: 'all', status: 'ready' }))
  const [selectedRecipeId, setSelectedRecipeId] = React.useState<string | null>(null)
  const [pendingRecipeIds, setPendingRecipeIds] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const [newTitle, setNewTitle] = React.useState('Motion Launch')
  const [newBrief, setNewBrief] = React.useState('Polished motion direction for a product moment.')
  const [htmlDraft, setHtmlDraft] = React.useState(defaultHtml('Motion Launch'))
  const [videoDraft, setVideoDraft] = React.useState(() => JSON.stringify(defaultComposition('Motion Launch'), null, 2))
  const [videoTime, setVideoTime] = React.useState(0.85)
  const [exportProgress, setExportProgress] = React.useState<number | null>(null)
  const [componentSelection, setComponentSelection] = React.useState<RemotePayloadObject | null>(null)
  const [layerSelection, setLayerSelection] = React.useState<RemotePayloadObject | null>(null)
  const [htmlControls, setHtmlControls] = React.useState<HtmlControls>(() => ({
    selector: 'h1',
    trigger: 'load',
    verb: 'slide-up',
    duration: 520,
    delay: 0,
    distance: 24,
    tracksJson: JSON.stringify(defaultTracks(), null, 2)
  }))
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const dirtyRef = React.useRef(false)
  const selectedProjectIdRef = React.useRef<string | null>(null)
  const loadDataRef = React.useRef<((input?: LoadDataInput) => Promise<void>) | null>(null)
  const t = React.useMemo(() => createTranslator(context?.locale), [context?.locale])

  React.useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  React.useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId
  }, [selectedProjectId])

  const detail = viewData.detail
  const selectedProject = detail?.item ?? viewData.projects.items.find((item) => item.id === selectedProjectId) ?? null

  const syncDrafts = React.useCallback((nextDetail: ProjectDetail | null) => {
    if (!nextDetail) {
      return
    }
    const html = nextDetail.workingCopy?.html
    const composition = nextDetail.workingCopy?.videoComposition
    if (typeof html === 'string' && html.trim()) {
      setHtmlDraft(html)
    }
    if (composition && typeof composition === 'object') {
      setVideoDraft(JSON.stringify(composition, null, 2))
    }
    setComponentSelection(nextDetail.workingCopy?.componentSelection ?? null)
    setLayerSelection(nextDetail.workingCopy?.layerSelection ?? null)
    setPendingRecipeIds([])
    setDirty(false)
  }, [])

  const loadData = React.useCallback(
    async (input?: LoadDataInput) => {
      setLoading(true)
      try {
        const nextProjectId = input?.projectId ?? selectedProjectIdRef.current ?? context?.initialQuery?.selectionId
        const table = activeTab === 'library' ? 'recipes' : undefined
        const parameters = compactObject({
          table,
          projectId: typeof nextProjectId === 'string' ? nextProjectId : undefined,
          surface: table === 'recipes' && recipeFilters.surface !== 'all' ? recipeFilters.surface : undefined,
          target: table === 'recipes' && recipeFilters.target !== 'all' ? recipeFilters.target : undefined,
          status: table === 'recipes' && recipeFilters.status !== 'all' ? recipeFilters.status : undefined
        })
        const payload = getResponsePayload(
          await requestData(
            compactObject({
              page: 1,
              pageSize: table === 'recipes' ? 36 : 20,
              search: activeTab === 'library' ? search : undefined,
              parameters
            })
          )
        )
        const nextViewData = coerceViewData(payload)
        setViewData(nextViewData)
        const nextDetail = nextViewData.detail
        if (nextDetail?.item?.id) {
          setSelectedProjectId(nextDetail.item.id)
          if (!dirtyRef.current || input?.forceDraftSync) {
            syncDrafts(nextDetail)
          }
        }
        setStatus(t('statusReady'))
      } catch (error) {
        const message = getErrorMessage(error)
        setStatus(message)
        notify('error', message)
      } finally {
        setLoading(false)
        setTimeout(reportResize, 0)
      }
    },
    [activeTab, context?.initialQuery?.selectionId, recipeFilters, search, syncDrafts, t]
  )

  React.useEffect(() => {
    loadDataRef.current = loadData
  }, [loadData])

  React.useEffect(() => {
    setRuntimeText({
      requestTimeout: context?.locale?.startsWith('zh') ? '请求超时' : 'Request timed out',
      remoteRequestFailed: context?.locale?.startsWith('zh') ? '远程请求失败' : 'Remote request failed'
    })
  }, [context?.locale])

  React.useEffect(() => {
    startRemoteBridge(setContext, () => {
      if (dirtyRef.current) {
        setStatus(t('dirtyWarning'))
        notify('warning', t('dirtyWarning'))
        return
      }
      void loadDataRef.current?.({ projectId: selectedProjectIdRef.current, forceDraftSync: true })
    })
    post('ready')
  }, [t])

  React.useEffect(() => {
    if (context) {
      void loadData({ forceDraftSync: true })
    }
  }, [context, loadData])

  React.useEffect(() => {
    setTimeout(reportResize, 0)
  }, [activeTab, viewData, dirty, status])

  React.useEffect(() => {
    if (activeTab !== 'library') {
      return
    }
    const recipes = viewData.recipes.items
    if (recipes.length === 0) {
      setSelectedRecipeId(null)
      return
    }
    if (!recipes.some((recipe) => recipe.id === selectedRecipeId)) {
      setSelectedRecipeId(recipes[0].id)
    }
  }, [activeTab, selectedRecipeId, viewData.recipes.items])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    try {
      const composition = parseVideoComposition(videoDraft)
      const renderer = createRenderableComposition(composition)
      const scale = Math.min(1, 960 / renderer.w)
      canvas.width = Math.max(1, Math.round(renderer.w * scale))
      canvas.height = Math.max(1, Math.round(renderer.h * scale))
      ctx.save()
      ctx.scale(scale, scale)
      renderer.renderFrame(ctx, Math.min(videoTime, renderer.duration()))
      const selectedLayerId = typeof layerSelection?.layerId === 'string' ? layerSelection.layerId : ''
      if (selectedLayerId) {
        const selectedLayer = findLayer(composition, selectedLayerId)
        if (selectedLayer) {
          const bounds = layerBounds(selectedLayer)
          ctx.save()
          ctx.strokeStyle = '#8b5cf6'
          ctx.lineWidth = 4 / scale
          ctx.setLineDash([10 / scale, 7 / scale])
          ctx.strokeRect(bounds.x - bounds.w / 2, bounds.y - bounds.h / 2, bounds.w, bounds.h)
          ctx.restore()
        }
      }
      ctx.restore()
    } catch {
      canvas.width = 960
      canvas.height = 540
      ctx.fillStyle = '#111827'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#f8fafc'
      ctx.font = '600 22px Inter, ui-sans-serif, system-ui, sans-serif'
      ctx.fillText(t('invalidCompositionJson'), 32, 56)
    }
  }, [activeTab, layerSelection, t, videoDraft, videoTime])

  async function createProject(surface: MotionSurface) {
    setSaving(true)
    try {
      const response = await executeAction('create_project', null, {
        title: newTitle,
        brief: newBrief,
        surface,
        html: surface === 'web' ? htmlDraft : undefined,
        videoComposition: surface === 'video' ? parseVideoComposition(videoDraft) : undefined,
        changeSummary: 'Created in Motion Workbench'
      })
      const data = getActionData(response)
      const projectId = extractProjectId(data)
      if (projectId) {
        setSelectedProjectId(projectId)
      }
      setActiveTab(surface === 'video' ? 'video' : 'html')
      setDirty(false)
      setProjectDialogOpen(false)
      await loadData({ projectId, forceDraftSync: true })
      notify('success', t('projectCreated', { title: newTitle }))
    } catch (error) {
      handleError(error)
    } finally {
      setSaving(false)
    }
  }

  async function saveHtml() {
    if (!selectedProject?.id) {
      await createProject('web')
      return
    }
    setSaving(true)
    try {
      await executeAction(
        'save_web_artifact',
        selectedProject.id,
        {
          projectId: selectedProject.id,
          html: htmlDraft,
          selectedRecipeIds: uniqueStrings([...(selectedProject.selectedRecipeIds || []), ...pendingRecipeIds]),
          componentSelection: componentSelection ?? undefined,
          changeSummary: 'Saved from Motion HTML Workbench'
        },
        { projectId: selectedProject.id }
      )
      setDirty(false)
      await loadData({ projectId: selectedProject.id, forceDraftSync: true })
      notify('success', t('htmlSaved'))
    } catch (error) {
      handleError(error)
    } finally {
      setSaving(false)
    }
  }

  async function saveVideo() {
    if (!selectedProject?.id) {
      await createProject('video')
      return
    }
    setSaving(true)
    try {
      await executeAction(
        'save_video_composition',
        selectedProject.id,
        {
          projectId: selectedProject.id,
          composition: parseVideoComposition(videoDraft),
          selectedRecipeIds: uniqueStrings([...(selectedProject.selectedRecipeIds || []), ...pendingRecipeIds]),
          layerSelection: layerSelection ?? undefined,
          changeSummary: 'Saved from Motion Video Composer'
        },
        { projectId: selectedProject.id }
      )
      setDirty(false)
      await loadData({ projectId: selectedProject.id, forceDraftSync: true })
      notify('success', t('videoSaved'))
    } catch (error) {
      handleError(error)
    } finally {
      setSaving(false)
    }
  }

  async function finalizeVersion() {
    if (!selectedProject?.id) {
      return
    }
    setSaving(true)
    try {
      await executeAction(
        'finalize_version',
        selectedProject.id,
        {
          projectId: selectedProject.id,
          changeSummary: `Workbench version ${new Date().toLocaleString()}`
        },
        { projectId: selectedProject.id }
      )
      await loadData({ projectId: selectedProject.id, forceDraftSync: true })
      notify('success', t('versionSaved'))
    } catch (error) {
      handleError(error)
    } finally {
      setSaving(false)
    }
  }

  async function exportText(kind: 'html' | 'css' | 'json' | 'react' | 'lottie') {
    if (!selectedProject?.id) {
      return
    }
    setSaving(true)
    try {
      await executeAction(
        'export_artifact',
        selectedProject.id,
        {
          projectId: selectedProject.id,
          kind,
          content: kind === 'html' ? htmlDraft : undefined,
          fileName: `${slugify(selectedProject.title)}.${extensionForKind(kind)}`,
          changeSummary: `Exported ${kind} from Motion Workbench`
        },
        { projectId: selectedProject.id }
      )
      await loadData({ projectId: selectedProject.id })
      notify('success', t('artifactExported', { kind: kind.toUpperCase() }))
    } catch (error) {
      handleError(error)
    } finally {
      setSaving(false)
    }
  }

  async function exportVideoMp4() {
    if (!selectedProject?.id) {
      return
    }
    if (!canExport()) {
      notify('error', t('webCodecsUnavailable'))
      return
    }
    setSaving(true)
    setExportProgress(0)
    try {
      const composition = parseVideoComposition(videoDraft)
      const renderer = createRenderableComposition(composition)
      await renderer.preload()
      const blob = await exportMp4(
        renderer,
        {
          fps: renderer.fps,
          bitrate: 5_000_000,
          scale: 1
        },
        (progress) => setExportProgress(progress)
      )
      const file = new File([blob], `${slugify(selectedProject.title)}.mp4`, { type: 'video/mp4' })
      await executeFileAction(
        'save_export_file',
        selectedProject.id,
        {
          projectId: selectedProject.id,
          kind: 'mp4',
          changeSummary: 'Browser MP4 export from Motion Workbench'
        },
        { projectId: selectedProject.id },
        file
      )
      await loadData({ projectId: selectedProject.id })
      notify('success', t('mp4Exported'))
    } catch (error) {
      handleError(error)
    } finally {
      setSaving(false)
      setExportProgress(null)
    }
  }

  async function restoreVersion(versionId: string) {
    if (!selectedProject?.id) {
      return
    }
    setSaving(true)
    try {
      await executeAction(
        'restore_version',
        selectedProject.id,
        {
          projectId: selectedProject.id,
          versionId,
          changeSummary: 'Restored in Motion Workbench'
        },
        { projectId: selectedProject.id }
      )
      setDirty(false)
      await loadData({ projectId: selectedProject.id, forceDraftSync: true })
      notify('success', t('versionRestored'))
    } catch (error) {
      handleError(error)
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(statusValue: 'draft' | 'reviewed' | 'archived') {
    if (!selectedProject?.id) {
      return
    }
    setSaving(true)
    try {
      await executeAction(
        statusValue === 'reviewed' ? 'mark_reviewed' : statusValue === 'archived' ? 'archive_project' : 'mark_draft',
        selectedProject.id,
        { projectId: selectedProject.id },
        { projectId: selectedProject.id }
      )
      await loadData({ projectId: selectedProject.id })
      notify('success', t('projectStatusUpdated', { status: statusValue }))
    } catch (error) {
      handleError(error)
    } finally {
      setSaving(false)
    }
  }

  function markRecipeApplied(recipe: RecipeSummary) {
    setSelectedRecipeId(recipe.id)
    setPendingRecipeIds((ids) => uniqueStrings([...ids, recipe.id]))
  }

  function applyRecipeToHtml(recipe: RecipeSummary) {
    try {
      const nextControls = controlsForRecipe(recipe, htmlControls, componentSelection)
      const selectedId = typeof componentSelection?.componentId === 'string' ? componentSelection.componentId : ''
      const resolvedControls = selectedId ? nextControls : { ...nextControls, selector: resolveHtmlRecipeSelector(htmlDraft, nextControls.selector) }
      const nextHtml = selectedId ? applyHtmlSelectionMotion(htmlDraft, selectedId, resolvedControls) : applyMotionToHtml(htmlDraft, resolvedControls)
      setHtmlControls(resolvedControls)
      setComponentSelection(
        selectedId
          ? { ...(componentSelection || {}), componentId: selectedId, selectedRecipeId: recipe.id, selectedRecipeName: recipe.name }
          : { selectedRecipeId: recipe.id, selectedRecipeName: recipe.name, label: resolvedControls.selector }
      )
      updateHtmlDraft(nextHtml)
      markRecipeApplied(recipe)
      setActiveTab('html')
      setStatus(t('recipeAppliedToHtml', { name: recipe.name }))
      notify('success', t('recipeApplied', { name: recipe.name }))
    } catch (error) {
      handleError(error)
    }
  }

  function applyRecipeToVideo(recipe: RecipeSummary) {
    try {
      const composition = parseVideoComposition(videoDraft)
      const selectedLayerId = typeof layerSelection?.layerId === 'string' ? layerSelection.layerId : ''
      const selectedSceneIndex = typeof layerSelection?.sceneIndex === 'number' ? layerSelection.sceneIndex : -1
      const layers = [...(composition.shared || []), ...getLayerList(composition, selectedSceneIndex)]
      const target = selectedLayerId ? findLayer(composition, selectedLayerId, selectedSceneIndex) : layers[0] ?? null
      if (!target?.id) {
        throw new Error(t('selectLayerFirst'))
      }
      const template = motionTemplateForRecipe(recipe)
      const kinetic = kineticForRecipe(recipe)
      const next = updateLayerInComposition(composition, selectedSceneIndex, target.id, (layer) => {
        const templated = applyMotionTemplate(layer, template)
        if (kinetic && layer.type === 'text') {
          return { ...templated, kinetic: { type: kinetic, stagger: 0.04 } }
        }
        return templated
      })
      updateVideoDraft(JSON.stringify(next, null, 2))
      setLayerSelection({ layerId: target.id, sceneIndex: selectedSceneIndex, selectedRecipeId: recipe.id, selectedRecipeName: recipe.name })
      markRecipeApplied(recipe)
      setActiveTab('video')
      setStatus(t('recipeAppliedToVideo', { name: recipe.name }))
      notify('success', t('recipeApplied', { name: recipe.name }))
    } catch (error) {
      handleError(error)
    }
  }

  function handleError(error: unknown) {
    const message = getErrorMessage(error)
    setStatus(message)
    notify('error', message)
  }

  function updateHtmlDraft(value: string) {
    setHtmlDraft(value)
    setDirty(true)
  }

  function updateVideoDraft(value: string) {
    setVideoDraft(value)
    setDirty(true)
  }

  function applyHtmlMotion() {
    try {
      updateHtmlDraft(applyMotionToHtml(htmlDraft, htmlControls))
      setStatus(t('motionApplied'))
    } catch (error) {
      handleError(error)
    }
  }

  const duration = React.useMemo(() => {
    try {
      return createRenderableComposition(parseVideoComposition(videoDraft)).duration()
    } catch {
      return 5
    }
  }, [videoDraft])
  const isEditorTab = activeTab === 'html' || activeTab === 'video'
  const canSearch = activeTab === 'library'
  const selectedRecipe = viewData.recipes.items.find((recipe) => recipe.id === selectedRecipeId) ?? viewData.recipes.items[0] ?? null
  const headerContext: HeaderContext = {
    title: selectedProject?.title || 'Motion Workbench',
    dirty,
    statusLabel: selectedProject?.status || 'draft',
    activeTab,
    onTabChange: setActiveTab,
    onOpenProjects: () => setProjectDialogOpen(true),
    onOpenVersions: () => setVersionsDialogOpen(true),
    onOpenExports: () => setExportsDialogOpen(true)
  }

  return (
    <main className={isEditorTab ? 'motion-shell motion-shell-editor' : 'motion-shell'}>
      <ProjectDialog
        open={projectDialogOpen}
        projects={viewData.projects.items}
        selectedProjectId={selectedProjectId}
        title={newTitle}
        brief={newBrief}
        saving={saving}
        t={t}
        onOpenChange={setProjectDialogOpen}
        onTitleChange={setNewTitle}
        onBriefChange={setNewBrief}
        onCreate={createProject}
        onSelect={(projectId) => void loadData({ projectId, forceDraftSync: true })}
      />
      <VersionsDialog
        open={versionsDialogOpen}
        versions={detail?.versions || []}
        currentId={detail?.currentVersion?.id}
        saving={saving}
        t={t}
        onOpenChange={setVersionsDialogOpen}
        onCreateVersion={finalizeVersion}
        onRestore={restoreVersion}
      />
      <ExportsDialog
        open={exportsDialogOpen}
        exports={detail?.exports || []}
        selectedProject={selectedProject}
        t={t}
        onOpenChange={setExportsDialogOpen}
        onReviewed={() => void updateStatus('reviewed')}
        onDraft={() => void updateStatus('draft')}
        onArchive={() => void updateStatus('archived')}
      />
      {!isEditorTab ? <WorkbenchHeader header={headerContext} t={t} /> : null}

      {canSearch && !isEditorTab ? (
        <section className="motion-status-row">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void loadData()
              }
            }}
            placeholder={t('search')}
          />
          <Button onClick={() => void loadData()} disabled={loading}>
            {t('search')}
          </Button>
          <span>{loading ? t('loading') : status}</span>
        </section>
      ) : null}

      {activeTab === 'library' ? (
        <section className="motion-library-command">
          <div>
            <strong>{t('library')}</strong>
            <span>{t('libraryHelp')}</span>
          </div>
          <div className="motion-filter-row">
            <MotionSelect
              className="library-filter-select"
              value={recipeFilters.surface}
              options={localizeOptions(RECIPE_SURFACE_OPTIONS, t)}
              onValueChange={(value) => setRecipeFilters((filters) => ({ ...filters, surface: value }))}
            />
            <MotionSelect
              className="library-filter-select"
              value={recipeFilters.target}
              options={localizeOptions(RECIPE_TARGET_OPTIONS, t)}
              onValueChange={(value) => setRecipeFilters((filters) => ({ ...filters, target: value }))}
            />
            <MotionSelect
              className="library-filter-select"
              value={recipeFilters.status}
              options={localizeOptions(RECIPE_STATUS_OPTIONS, t)}
              onValueChange={(value) => setRecipeFilters((filters) => ({ ...filters, status: value }))}
            />
          </div>
        </section>
      ) : null}

      {activeTab === 'library' ? (
        <LibraryTab
          recipes={viewData.recipes.items}
          stats={viewData.libraryStats}
          selectedRecipe={selectedRecipe}
          selectedProject={selectedProject}
          componentSelection={componentSelection}
          layerSelection={layerSelection}
          t={t}
          onSelectRecipe={setSelectedRecipeId}
          onApplyHtml={applyRecipeToHtml}
          onApplyVideo={applyRecipeToVideo}
        />
      ) : null}

      {activeTab === 'html' ? (
        <HtmlWorkbench
          controls={htmlControls}
          htmlDraft={htmlDraft}
          componentSelection={componentSelection}
          saving={saving}
          selectedProject={selectedProject}
          header={headerContext}
          t={t}
          onControlsChange={setHtmlControls}
          onApply={applyHtmlMotion}
          onDraftChange={updateHtmlDraft}
          onComponentSelectionChange={setComponentSelection}
          onSave={() => void saveHtml()}
          onExport={exportText}
        />
      ) : null}

      {activeTab === 'video' ? (
        <VideoComposer
          canvasRef={canvasRef}
          videoDraft={videoDraft}
          videoTime={videoTime}
          selectedProject={selectedProject}
          layerSelection={layerSelection}
          header={headerContext}
          t={t}
          duration={duration}
          saving={saving}
          exportProgress={exportProgress}
          parseVideoComposition={parseVideoComposition}
          defaultComposition={defaultComposition}
          extractMediaPayload={extractMediaPayload}
          onDraftChange={updateVideoDraft}
          onTimeChange={setVideoTime}
          onLayerSelectionChange={setLayerSelection}
          onSave={() => void saveVideo()}
          onExportMp4={() => void exportVideoMp4()}
        />
      ) : null}
    </main>
  )
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim())))
}
function extractMediaPayload(value: RemotePayloadValue | null) {
  const data = getActionData(value)
  if (!isObject(data) || !isObject(data.media)) {
    return null
  }
  const media = data.media
  const src = typeof media.src === 'string' ? media.src : typeof media.fileUrl === 'string' ? media.fileUrl : typeof media.workspacePath === 'string' ? media.workspacePath : typeof media.filePath === 'string' ? media.filePath : ''
  return {
    src,
    filePath: typeof media.filePath === 'string' ? media.filePath : undefined,
    fileUrl: typeof media.fileUrl === 'string' ? media.fileUrl : undefined,
    mimeType: typeof media.mimeType === 'string' ? media.mimeType : undefined
  }
}

type LoadDataInput = {
  projectId?: string | null
  forceDraftSync?: boolean
}

function emptyViewData(): MotionViewData {
  return {
    projects: EMPTY_PAGED,
    recipes: EMPTY_PAGED,
    styles: [],
    detail: null,
    libraryStats: {}
  }
}

function coerceViewData(value: RemotePayloadValue | null): MotionViewData {
  if (!isObject(value)) {
    return emptyViewData()
  }
  return {
    projects: coercePaged<ProjectSummary>(value.projects),
    recipes: coercePaged<RecipeSummary>(value.recipes),
    styles: Array.isArray(value.styles) ? value.styles : [],
    detail: coerceDetail(value.detail),
    libraryStats: isObject(value.libraryStats) ? value.libraryStats : {}
  }
}

function coercePaged<T>(value: RemotePayloadValue | undefined): PagedResult<T> {
  if (!isObject(value)) {
    return { ...EMPTY_PAGED, items: [] as T[] }
  }
  return {
    items: Array.isArray(value.items) ? (value.items as T[]) : [],
    total: typeof value.total === 'number' ? value.total : 0,
    page: typeof value.page === 'number' ? value.page : 1,
    pageSize: typeof value.pageSize === 'number' ? value.pageSize : 20
  }
}

function coerceDetail(value: RemotePayloadValue | undefined): ProjectDetail | null {
  if (!isObject(value) || !isObject(value.item) || typeof value.item.id !== 'string') {
    return null
  }
  return value as ProjectDetail
}

function getActionData(value: RemotePayloadValue | null) {
  const payload = getResponsePayload(value)
  if (isObject(payload) && payload.data !== undefined) {
    return payload.data
  }
  return payload
}

function extractProjectId(value: RemotePayloadValue | null) {
  if (isObject(value) && isObject(value.item) && typeof value.item.id === 'string') {
    return value.item.id
  }
  if (isObject(value) && isObject(value.project) && typeof value.project.id === 'string') {
    return value.project.id
  }
  return null
}

function compactObject(input: Record<string, RemotePayloadValue | undefined>): RemotePayloadObject {
  const output: RemotePayloadObject = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && value !== '') {
      output[key] = value
    }
  }
  return output
}

function parseVideoComposition(value: string): MotionVideoComposition {
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Composition must be a JSON object.')
  }
  return parsed as MotionVideoComposition
}

function applyMotionToHtml(html: string, controls: HtmlControls) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const selector = controls.selector.trim() || 'body > *'
  let elements: Element[]
  try {
    elements = Array.from(doc.querySelectorAll(selector))
  } catch {
    throw new Error('Selector is invalid.')
  }
  if (elements.length === 0) {
    throw new Error('Selector matched no elements.')
  }
  const tracks = parseTracks(controls.tracksJson)
  for (const element of elements.slice(0, 50)) {
    element.setAttribute('data-ma-anim', controls.verb)
    element.setAttribute('data-ma-trigger', controls.trigger)
    element.setAttribute('data-ma-dur', String(clampNumber(controls.duration, 80, 4000)))
    element.setAttribute('data-ma-delay', String(clampNumber(controls.delay, 0, 8000)))
    element.setAttribute('data-ma-dist', String(clampNumber(controls.distance, -400, 400)))
    element.setAttribute('data-ma-tracks', JSON.stringify(tracks))
  }
  return `<!doctype html>\n${doc.documentElement.outerHTML}`
}

function parseTracks(value: string) {
  const parsed = JSON.parse(value) as Record<string, unknown>
  const tracks: Record<string, unknown> = {}
  for (const prop of KEYFRAME_PROPS) {
    if (Array.isArray(parsed[prop])) {
      tracks[prop] = parsed[prop]
    }
  }
  return tracks
}

function defaultVideoEntranceTracks(y: number, distance = 40) {
  return {
    opacity: [
      { t: 0, v: 0 },
      { t: 0.5, v: 1 }
    ],
    y: [
      { t: 0, v: y + distance },
      { t: 0.5, v: y, ease: 'ease-out' }
    ],
    scale: [
      { t: 0, v: 0.96 },
      { t: 0.5, v: 1 }
    ],
    blur: [
      { t: 0, v: 8 },
      { t: 0.5, v: 0 }
    ]
  }
}

function defaultHtml(title: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f8fafc;color:#111827}
    main{min-height:100vh;display:grid;place-items:center;padding:56px}
    section{max-width:860px}
    h1{font-size:72px;line-height:1;margin:0 0 18px}
    p{font-size:21px;line-height:1.55;color:#475569}
  </style>
</head>
<body>
  <main>
    <section>
      <h1 data-ma-anim="slide-up" data-ma-trigger="load" data-ma-dur="520">Motion Launch</h1>
      <p data-ma-anim="fade" data-ma-trigger="load" data-ma-dur="520" data-ma-delay="140">A focused, tasteful animated artifact.</p>
    </section>
  </main>
</body>
</html>`
}

function defaultComposition(title: string): MotionVideoComposition {
  return {
    w: 1280,
    h: 720,
    fps: 30,
    bg: '#111827',
    duration: 5,
    shared: [
      {
        id: 'backplate',
        type: 'rect',
        x: 640,
        y: 360,
        w: 920,
        h: 360,
        color: '#1f2937',
        opacity: 0.86,
        tracks: {
          scale: [
            { t: 0, v: 0.94 },
            { t: 0.8, v: 1, ease: 'ease-out' }
          ],
          opacity: [
            { t: 0, v: 0 },
            { t: 0.6, v: 0.86 }
          ]
        }
      }
    ],
    layers: [
      {
        id: 'title',
        type: 'text',
        text: title,
        x: 640,
        y: 330,
        size: 76,
        weight: 800,
        color: '#ffffff',
        tracks: defaultVideoEntranceTracks(330, 46)
      },
      {
        id: 'subtitle',
        type: 'text',
        text: 'Agent-crafted motion, ready for review.',
        x: 640,
        y: 430,
        size: 34,
        weight: 500,
        color: '#a7f3d0',
        tracks: {
          opacity: [
            { t: 0.25, v: 0 },
            { t: 1.1, v: 1 }
          ],
          y: [
            { t: 0.25, v: 458 },
            { t: 1.1, v: 430, ease: 'ease-out' }
          ]
        }
      }
    ]
  }
}

function extensionForKind(kind: string) {
  if (kind === 'react') return 'tsx'
  if (kind === 'lottie') return 'lottie.json'
  return kind
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'motion'
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char)
}

createRoot(document.getElementById('root') || document.body.appendChild(document.createElement('div'))).render(<App />)
