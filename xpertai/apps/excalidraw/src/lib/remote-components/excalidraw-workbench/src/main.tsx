import '@excalidraw/excalidraw/index.css'
import {
  Excalidraw,
  exportToBlob,
  exportToSvg,
  serializeAsJSON,
  restore,
  convertToExcalidrawElements
} from '@excalidraw/excalidraw'
import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw'
import {
  Archive,
  Badge,
  Button,
  Check,
  ChevronDown,
  FileJson,
  Image,
  Input,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Save,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Send,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTitle,
  SidebarTrigger,
  Textarea,
  Upload,
  installShadcnThemeVars
} from '@xpert-ai/plugin-shadcn-ui'
import { React, ReactDOM, h } from './vendor'
import { createTranslator, TranslationKey } from './i18n'
import { injectStyles } from './styles'
import {
  beginMermaidAutoSave,
  createMermaidAutoSaveGuard,
  createMermaidAutoSaveKey,
  finishMermaidAutoSave
} from './mermaid-auto-save'
import {
  decideToolEventRefresh,
  normalizeToolCompletedEvent,
  SAVE_MERMAID_DRAFT_TOOL_NAME
} from './tool-event-refresh'
import {
  executeAction,
  executeFileAction,
  getErrorMessage,
  getResponsePayload,
  invokeClientCommand,
  notify,
  post,
  reportResize,
  requestData,
  resolveMessage,
  setRuntimeText,
  startRemoteBridge
} from './runtime'

type StatusFilter = '' | 'draft' | 'reviewed' | 'archived'
type Drawing = Record<string, any>
type DrawingVersion = Record<string, any>
type ExcalidrawTheme = 'light' | 'dark'
type DetailPayload = {
  item?: Drawing
  currentVersion?: DrawingVersion | null
  versions?: DrawingVersion[]
  logs?: any[]
}

const DEFAULT_MERMAID = `flowchart TD
  A[User Request] --> B[Agent Plans Diagram]
  B --> C{Best Format?}
  C -->|Flow| D[Save Mermaid Draft]
  C -->|Precise Layout| E[Save Excalidraw JSON]
  D --> F[Workbench Converts]
  E --> G[Human Review]
  F --> G`

const SCENE_APP_STATE_SIGNATURE_KEYS = [
  'viewBackgroundColor',
  'gridSize',
  'objectsSnapModeEnabled',
  'frameRendering'
]

installShadcnThemeVars({ styleId: 'excalidraw-workbench-shadcn-ui-vars' })
injectStyles()

function App() {
  const [context, setContext] = React.useState<any>(null)
  const [drawings, setDrawings] = React.useState<Drawing[]>([])
  const [detail, setDetail] = React.useState<DetailPayload | null>(null)
  const [selectedId, setSelectedId] = React.useState<string>('')
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<StatusFilter>('')
  const [busy, setBusy] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState('')
  const [newDescription, setNewDescription] = React.useState('')
  const [changeSummary, setChangeSummary] = React.useState('')
  const [assistantPrompt, setAssistantPrompt] = React.useState('')
  const [mermaidSource, setMermaidSource] = React.useState(DEFAULT_MERMAID)
  const [leftPanelCollapsed, setLeftPanelCollapsed] = React.useState(true)
  const [rightPanelCollapsed, setRightPanelCollapsed] = React.useState(true)
  const [versionsOpen, setVersionsOpen] = React.useState(false)
  const [excalidrawTheme, setExcalidrawTheme] = React.useState<ExcalidrawTheme>(() => resolveExcalidrawTheme(null))
  const [api, setApi] = React.useState<any>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const contextRef = React.useRef<any>(null)
  const selectedIdRef = React.useRef('')
  const searchRef = React.useRef('')
  const statusRef = React.useRef<StatusFilter>('')
  const hostEventSequenceRef = React.useRef(0)
  const pendingMermaidPreviewRef = React.useRef<{ versionId?: string; source: string; autoSave?: boolean; autoSaveKey?: string } | null>(null)
  const mermaidAutoSaveGuardRef = React.useRef(createMermaidAutoSaveGuard())
  const excalidrawThemeRef = React.useRef<ExcalidrawTheme>(excalidrawTheme)
  const themeSyncRef = React.useRef(false)
  const elementsRef = React.useRef<any[]>([])
  const appStateRef = React.useRef<Record<string, unknown>>({})
  const filesRef = React.useRef<Record<string, unknown>>({})
  const mermaidSourceRef = React.useRef(DEFAULT_MERMAID)
  const dirtyRef = React.useRef(false)
  const savedSceneSignatureRef = React.useRef('')
  const suppressedDetailSceneVersionRef = React.useRef<string | null>(null)
  const t = createTranslator(context?.locale)

  React.useEffect(() => {
    setRuntimeText({
      requestTimeout: t('requestTimeout'),
      remoteRequestFailed: t('remoteRequestFailed'),
      unknownError: t('unknownError')
    })
  }, [context?.locale])

  React.useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  React.useEffect(() => {
    searchRef.current = search
  }, [search])

  React.useEffect(() => {
    statusRef.current = status
  }, [status])

  React.useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  React.useEffect(() => {
    excalidrawThemeRef.current = excalidrawTheme
  }, [excalidrawTheme])

  React.useEffect(() => {
    mermaidSourceRef.current = mermaidSource
  }, [mermaidSource])

  React.useEffect(() => {
    const syncTheme = () => setExcalidrawTheme(resolveExcalidrawTheme(contextRef.current?.theme))
    syncTheme()

    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    media?.addEventListener?.('change', syncTheme)
    const observer = new MutationObserver(syncTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme']
    })
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme']
      })
    }

    return () => {
      media?.removeEventListener?.('change', syncTheme)
      observer.disconnect()
    }
  }, [context?.theme])

  React.useEffect(() => {
    startRemoteBridge(
      (nextContext) => {
        contextRef.current = nextContext
        setContext(nextContext)
        setExcalidrawTheme(resolveExcalidrawTheme(nextContext?.theme))
        const payload = nextContext.payload || null
        hydratePayload(payload)
        setTimeout(() => reloadList(), 0)
      },
      (event) => {
        void reloadAfterHostEvent(event)
      }
    )
    post('ready')
  }, [])

  React.useEffect(reportResize, [drawings, detail, busy, dirty, leftPanelCollapsed, rightPanelCollapsed, versionsOpen])

  React.useEffect(() => {
    if (!api) {
      return
    }
    const nextAppState = withHostThemeAppState(appStateRef.current, excalidrawTheme)
    appStateRef.current = nextAppState
    themeSyncRef.current = true
    api.updateScene({
      appState: nextAppState
    })
    window.setTimeout(() => {
      themeSyncRef.current = false
    }, 0)
  }, [api, excalidrawTheme])

  React.useEffect(() => {
    const currentVersion = detail?.currentVersion
    if (!api || !detail?.item) {
      return
    }
    const suppressedVersionKey = suppressedDetailSceneVersionRef.current
    if (suppressedVersionKey && suppressedVersionKey === sceneVersionKey(currentVersion)) {
      suppressedDetailSceneVersionRef.current = null
      return
    }
    if (!currentVersion) {
      applyBlankScene({ clearMermaid: true })
      return
    }
    applyVersion(currentVersion)
    const pendingPreview = pendingMermaidPreviewRef.current
    if (pendingPreview && (!pendingPreview.versionId || pendingPreview.versionId === currentVersion.id)) {
      pendingMermaidPreviewRef.current = null
      void previewMermaidSource(pendingPreview.source, {
        automatic: true,
        autoSave: pendingPreview.autoSave,
        autoSaveKey: pendingPreview.autoSaveKey
      })
      return
    }
    if (shouldAutoSaveMermaidVersion(currentVersion)) {
      const autoSaveKey = createMermaidAutoSaveKey(currentVersion.id, currentVersion.mermaidSource)
      void previewMermaidSource(currentVersion.mermaidSource, {
        automatic: true,
        autoSave: true,
        autoSaveKey
      })
    }
  }, [api, detail?.item?.id, detail?.currentVersion?.id])

  function hydratePayload(payload: any) {
    if (!payload) {
      return
    }
    if (Array.isArray(payload.items)) {
      setDrawings(payload.items)
      if (!selectedIdRef.current && payload.items[0]?.id) {
        selectDrawing(payload.items[0].id)
      }
      return
    }
    if (payload.item) {
      setDetail(payload)
      setDirty(false)
      setVersionsOpen(false)
      const drawingId = payload.item.id || ''
      selectedIdRef.current = drawingId
      setSelectedId(drawingId)
      if (payload.currentVersion?.mermaidSource) {
        updateMermaidSource(payload.currentVersion.mermaidSource)
      } else {
        updateMermaidSource('')
      }
      if (!payload.currentVersion) {
        applyBlankScene({ clearMermaid: true })
      }
    }
  }

  async function reloadAfterHostEvent(event: unknown) {
    const normalizedEvent = normalizeToolCompletedEvent(event)
    console.info('[excalidraw-workbench] handling hostEvent', {
      rawEvent: event,
      normalizedEvent,
      selectedId: selectedIdRef.current,
      dirty: dirtyRef.current
    })
    const initialDecision = decideToolEventRefresh(normalizedEvent, {
      selectedDrawingId: selectedIdRef.current,
      isDirty: dirtyRef.current
    })
    if (!initialDecision.shouldReloadList) {
      console.info('[excalidraw-workbench] hostEvent ignored', {
        normalizedEvent,
        decision: initialDecision
      })
      return
    }

    const sequence = ++hostEventSequenceRef.current
    const items = await reloadList()
    console.info('[excalidraw-workbench] hostEvent list reloaded', {
      sequence,
      currentSequence: hostEventSequenceRef.current,
      itemCount: items.length,
      targetDrawingId: normalizedEvent.drawingId
    })
    if (sequence !== hostEventSequenceRef.current) {
      // A newer tool event won the race; avoid applying an older scene after the list reload.
      console.info('[excalidraw-workbench] hostEvent refresh skipped because a newer event arrived', {
        sequence,
        currentSequence: hostEventSequenceRef.current
      })
      return
    }

    const decision = decideToolEventRefresh(normalizedEvent, {
      selectedDrawingId: selectedIdRef.current,
      isDirty: dirtyRef.current
    })
    console.info('[excalidraw-workbench] hostEvent refresh decision', decision)
    let selectedPayload: DetailPayload | null = null
    if (decision.shouldProtectDirtyScene) {
      // Preserve unsaved local canvas edits; only refresh version metadata unless applying is explicitly safe.
      if (decision.shouldLoadProtectedDetail && decision.targetDrawingId) {
        console.info('[excalidraw-workbench] loading detail without applying scene because canvas is dirty', {
          drawingId: decision.targetDrawingId
        })
        selectedPayload = await loadDrawingDetail(decision.targetDrawingId, {
          applyScene: false,
          resetDirty: false,
          closeVersions: false,
          clearChangeSummary: false
        })
      }
      const translate = createTranslator(contextRef.current?.locale)
      notify('warning', translate('agentDrawingUpdatedWithLocalChanges'))
      return
    }

    if (decision.shouldSelectDrawing && decision.targetDrawingId) {
      console.info('[excalidraw-workbench] selecting drawing after hostEvent', {
        drawingId: decision.targetDrawingId
      })
      selectedPayload = await selectDrawing(decision.targetDrawingId)
      console.info('[excalidraw-workbench] selected drawing after hostEvent', {
        drawingId: decision.targetDrawingId,
        currentVersionId: selectedPayload?.currentVersion?.id,
        currentVersionNumber: selectedPayload?.currentVersion?.versionNumber
      })
    }

    if (decision.shouldQueueMermaidPreview && selectedPayload?.currentVersion?.mermaidSource) {
      console.info('[excalidraw-workbench] queueing Mermaid auto-preview after hostEvent', {
        drawingId: decision.targetDrawingId,
        versionId: selectedPayload.currentVersion.id
      })
      queueMermaidPreview(selectedPayload.currentVersion, { autoSave: true })
      return
    }

    if (decision.shouldNotify) {
      const translate = createTranslator(contextRef.current?.locale)
      notify('info', translate('agentDrawingUpdated'))
    }
  }

  async function reloadList(overrides: Partial<{ search: string; status: StatusFilter }> = {}) {
    const nextSearch = overrides.search ?? searchRef.current
    const nextStatus = overrides.status ?? statusRef.current
    setBusy(true)
    try {
      const response = await requestData({
        page: 1,
        pageSize: 50,
        search: nextSearch,
        parameters: {
          ...(nextStatus ? { status: nextStatus } : {})
        }
      })
      const payload = getResponsePayload(response) || {}
      const items = Array.isArray(payload.items) ? payload.items : []
      console.info('[excalidraw-workbench] reloadList result', {
        search: nextSearch,
        status: nextStatus,
        itemCount: items.length,
        selectedId: selectedIdRef.current,
        currentVersionNumbers: items.slice(0, 5).map((item) => ({
          id: item?.id,
          currentVersionNumber: item?.currentVersionNumber,
          currentVersionId: item?.currentVersionId
        }))
      })
      setDrawings(items)
      if (!selectedIdRef.current && items[0]?.id) {
        await selectDrawing(items[0].id)
      }
      return items
    } catch (error) {
      notify('error', getErrorMessage(error))
      return []
    } finally {
      setBusy(false)
    }
  }

  async function selectDrawing(drawingId: string): Promise<DetailPayload | null> {
    return loadDrawingDetail(drawingId, {
      applyScene: true,
      resetDirty: true,
      closeVersions: true,
      clearChangeSummary: true
    })
  }

  async function loadDrawingDetail(
    drawingId: string,
    options: { applyScene?: boolean; resetDirty?: boolean; closeVersions?: boolean; clearChangeSummary?: boolean } = {}
  ): Promise<DetailPayload | null> {
    if (!drawingId) {
      return null
    }
    const applyScene = options.applyScene ?? true
    const resetDirty = options.resetDirty ?? applyScene
    const closeVersions = options.closeVersions ?? true
    const clearChangeSummary = options.clearChangeSummary ?? true
    setBusy(true)
    try {
      const response = await requestData({
        parameters: {
          drawingId
        }
      })
      const payload = getResponsePayload(response) || {}
      console.info('[excalidraw-workbench] loadDrawingDetail result', {
        drawingId,
        applyScene,
        currentVersionId: payload.currentVersion?.id,
        currentVersionNumber: payload.currentVersion?.versionNumber,
        versionCount: Array.isArray(payload.versions) ? payload.versions.length : undefined
      })
      selectedIdRef.current = drawingId
      setSelectedId(drawingId)
      if (!applyScene) {
        suppressedDetailSceneVersionRef.current = sceneVersionKey(payload.currentVersion)
      }
      setDetail(payload)
      if (resetDirty) {
        setDirty(false)
      }
      if (closeVersions) {
        setVersionsOpen(false)
      }
      if (clearChangeSummary) {
        setChangeSummary('')
      }
      if (applyScene) {
        if (payload.currentVersion?.mermaidSource) {
          updateMermaidSource(payload.currentVersion.mermaidSource)
        } else {
          updateMermaidSource('')
        }
        if (api && payload.currentVersion) {
          applyVersion(payload.currentVersion)
        } else if (api) {
          applyBlankScene({ clearMermaid: true })
        }
      }
      return payload
    } catch (error) {
      notify('error', getErrorMessage(error))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function createDrawing() {
    const title = newTitle.trim() || t('untitled')
    setBusy(true)
    try {
      const response = await executeAction('create_drawing', null, {
        title,
        description: newDescription
      })
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('drawingCreated'))
      const drawingId = result?.item?.id || result?.data?.item?.id
      const drawingItem = result?.item || result?.data?.item || null
      setNewTitle('')
      setNewDescription('')
      setChangeSummary('')
      if (drawingId) {
        selectedIdRef.current = drawingId
        setSelectedId(drawingId)
        setDetail({
          item: drawingItem || { id: drawingId, title, currentVersionNumber: 0, status: 'draft' },
          currentVersion: null,
          versions: [],
          logs: []
        })
        applyBlankScene({ clearMermaid: true })
      }
      await reloadList()
      if (drawingId) {
        await selectDrawing(drawingId)
      }
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function saveCurrentScene(
    sourceAction = 'save_scene_version',
    options: { force?: boolean; changeSummary?: string; silent?: boolean } = {}
  ) {
    if (!selectedId) {
      notify('warning', t('noDrawing'))
      return false
    }
    if (!options.force && !dirtyRef.current) {
      notify('info', t('saveNoChanges'))
      return false
    }
    setBusy(true)
    try {
      const scene = currentSerializableScene()
      const response = await executeAction(sourceAction, selectedId, {
        drawingId: selectedId,
        elements: scene.elements,
        appState: scene.appState,
        files: scene.files,
        mermaidSource: mermaidSourceRef.current,
        changeSummary: options.changeSummary ?? (changeSummary.trim() || undefined)
      })
      const result = getResponsePayload(response)
      if (!options.silent) {
        notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('operationCompleted'))
      }
      markCurrentSceneSaved()
      setChangeSummary('')
      await selectDrawing(selectedId)
      await reloadList()
      return true
    } catch (error) {
      notify('error', getErrorMessage(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function restoreVersion(versionId: string) {
    if (!selectedId || !versionId) {
      return
    }
    setBusy(true)
    try {
      const response = await executeAction('restore_version', selectedId, {
        drawingId: selectedId,
        versionId,
        changeSummary: changeSummary.trim() || undefined
      })
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('operationCompleted'))
      await selectDrawing(selectedId)
      await reloadList()
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function archiveDrawing() {
    if (!selectedId) {
      return
    }
    setBusy(true)
    try {
      await executeAction('archive_drawing', selectedId, {
        drawingId: selectedId
      })
      notify('success', t('operationCompleted'))
      setDetail(null)
      setSelectedId('')
      await reloadList()
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function setDrawingReviewStatus(nextStatus: 'draft' | 'reviewed') {
    if (!selectedId) {
      return
    }
    setBusy(true)
    try {
      const response = await executeAction(nextStatus === 'reviewed' ? 'mark_reviewed' : 'mark_draft', selectedId, {
        drawingId: selectedId,
        reason: changeSummary.trim() || undefined
      })
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('operationCompleted'))
      setChangeSummary('')
      await selectDrawing(selectedId)
      if (statusRef.current && statusRef.current !== nextStatus) {
        statusRef.current = ''
        setStatus('')
        await reloadList({ status: '' })
      } else {
        await reloadList()
      }
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function convertMermaid() {
    await previewMermaidSource(mermaidSource)
  }

  async function previewMermaidSource(sourceValue: string, options: { automatic?: boolean; autoSave?: boolean; autoSaveKey?: string } = {}) {
    const source = sourceValue.trim()
    if (!source || !api) {
      return false
    }
    const translate = createTranslator(contextRef.current?.locale)
    setBusy(true)
    try {
      const result = await parseMermaidToExcalidraw(source, {
        themeVariables: {
          fontSize: '25px'
        },
        maxEdges: 1000,
        maxTextSize: 50000
      })
      const elements = convertToExcalidrawElements(result.elements || [])
      const files = result.files || {}
      const appState = {
        ...(appStateRef.current || {}),
        theme: excalidrawThemeRef.current,
        viewBackgroundColor: defaultCanvasBackground(excalidrawThemeRef.current)
      }
      api?.updateScene({
        elements,
        appState
      })
      if (files && api?.addFiles) {
        api.addFiles(Object.values(files))
      }
      updateMermaidSource(source)
      elementsRef.current = elements as any[]
      appStateRef.current = appState
      filesRef.current = files
      updateDirtyState(source)
      notify(options.automatic ? 'info' : 'success', options.automatic ? translate('mermaidAutoPreviewed') : translate('operationCompleted'))
      if (options.autoSave && selectedIdRef.current) {
        const autoSaveKey = options.autoSaveKey || createMermaidAutoSaveKey(undefined, source)
        if (beginMermaidAutoSave(mermaidAutoSaveGuardRef.current, autoSaveKey)) {
          const saved = await saveCurrentScene('save_converted_mermaid_scene', {
            force: true,
            silent: true,
            changeSummary: translate('mermaidAutoChangeSummary')
          })
          finishMermaidAutoSave(mermaidAutoSaveGuardRef.current, autoSaveKey, saved)
          if (saved) {
            notify('success', translate('mermaidAutoSaved'))
          }
        }
      }
      return true
    } catch (error) {
      notify('error', `${translate('convertFailed')}: ${getErrorMessage(error)}`)
      return false
    } finally {
      setBusy(false)
    }
  }

  function queueMermaidPreview(version: DrawingVersion, options: { autoSave?: boolean } = {}) {
    const source = typeof version.mermaidSource === 'string' ? version.mermaidSource.trim() : ''
    if (!source) {
      return
    }
    const autoSaveKey = options.autoSave ? createMermaidAutoSaveKey(version.id, source) : undefined
    pendingMermaidPreviewRef.current = {
      versionId: typeof version.id === 'string' ? version.id : undefined,
      source,
      autoSave: options.autoSave,
      autoSaveKey
    }
  }

  async function sendAssistantPrompt() {
    const prompt = assistantPrompt.trim()
    if (!prompt) {
      return
    }
    setBusy(true)
    try {
      const response = await executeAction('prepare_agent_draw_message', selectedId || null, {
        drawingId: selectedId || undefined,
        prompt
      })
      const result = getResponsePayload(response)
      const commandKey = result?.data?.commandKey || result?.commandKey
      const payload = result?.data?.payload || result?.payload
      if (commandKey && payload) {
        await invokeClientCommand(commandKey, payload)
      }
      setAssistantPrompt('')
      notify('success', t('operationCompleted'))
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function importFile(file: File | null) {
    if (!file) {
      return
    }
    setBusy(true)
    try {
      const response = await executeFileAction(
        'import_scene_file',
        selectedId || null,
        {
          drawingId: selectedId || undefined,
          title: removeExcalidrawExtension(file.name)
        },
        {
          drawingId: selectedId || undefined
        },
        file
      )
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('operationCompleted'))
      const drawingId = result?.data?.item?.id || result?.item?.id || selectedId
      await reloadList()
      if (drawingId) {
        await selectDrawing(drawingId)
      }
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  function sceneVersionKey(version: DrawingVersion | null | undefined) {
    if (!version) {
      return 'blank'
    }
    if (typeof version.id === 'string' && version.id.trim()) {
      return `id:${version.id.trim()}`
    }
    if (typeof version.versionNumber === 'number' && Number.isFinite(version.versionNumber)) {
      return `number:${Math.trunc(version.versionNumber)}`
    }
    return 'unknown'
  }

  function applyVersion(version: DrawingVersion) {
    const scene = restorePersistedScene(version, excalidrawThemeRef.current)
    const elements = scene.elements
    const appState = scene.appState
    const files = scene.files
    const mermaid = typeof version.mermaidSource === 'string' ? version.mermaidSource : ''
    elementsRef.current = elements
    appStateRef.current = appState
    filesRef.current = files
    updateMermaidSource(mermaid)
    themeSyncRef.current = true
    api?.updateScene({
      elements,
      appState,
      collaborators: new Map()
    })
    if (api?.addFiles && Object.keys(files).length > 0) {
      api.addFiles(Object.values(files))
    }
    window.setTimeout(() => {
      themeSyncRef.current = false
    }, 0)
    markCurrentSceneSaved(mermaid)
  }

  function applyBlankScene(options: { clearMermaid?: boolean } = {}) {
    const appState = withHostThemeAppState({}, excalidrawThemeRef.current)
    elementsRef.current = []
    appStateRef.current = appState
    filesRef.current = {}
    if (options.clearMermaid) {
      updateMermaidSource('')
    }
    themeSyncRef.current = true
    api?.updateScene({
      elements: [],
      appState,
      collaborators: new Map()
    })
    window.setTimeout(() => {
      themeSyncRef.current = false
    }, 0)
    markCurrentSceneSaved()
  }

  function updateMermaidSource(nextSource: string, options: { compareDirty?: boolean } = {}) {
    mermaidSourceRef.current = nextSource
    setMermaidSource(nextSource)
    if (options.compareDirty) {
      updateDirtyState(nextSource)
    }
  }

  function markCurrentSceneSaved(mermaidOverride = mermaidSourceRef.current) {
    savedSceneSignatureRef.current = createSceneSignature(
      elementsRef.current,
      appStateRef.current,
      filesRef.current,
      mermaidOverride
    )
    setDirty(false)
  }

  function updateDirtyState(mermaidOverride = mermaidSourceRef.current) {
    if (!selectedIdRef.current) {
      setDirty(false)
      return
    }
    const currentSceneSignature = createSceneSignature(
      elementsRef.current,
      appStateRef.current,
      filesRef.current,
      mermaidOverride
    )
    setDirty(currentSceneSignature !== savedSceneSignatureRef.current)
  }

  function currentSerializableScene() {
    try {
      const json = serializeAsJSON(elementsRef.current as any, appStateRef.current as any, filesRef.current as any, 'local')
      const parsed = JSON.parse(json)
      return {
        elements: Array.isArray(parsed.elements) ? parsed.elements : elementsRef.current,
        appState: isObject(parsed.appState) ? parsed.appState : appStateRef.current,
        files: isObject(parsed.files) ? parsed.files : filesRef.current
      }
    } catch {
      return {
        elements: elementsRef.current,
        appState: appStateRef.current,
        files: filesRef.current
      }
    }
  }

  async function exportJson() {
    const scene = currentSerializableScene()
    downloadBlob(
      new Blob([JSON.stringify({ type: 'excalidraw', version: 2, source: 'xpert-excalidraw', ...scene }, null, 2)], {
        type: 'application/json'
      }),
      `${detail?.item?.title || 'drawing'}.excalidraw`
    )
  }

  async function exportPng() {
    const scene = currentSerializableScene()
    const blob = await exportToBlob({
      elements: scene.elements as any,
      appState: scene.appState as any,
      files: scene.files as any,
      mimeType: 'image/png'
    } as any)
    downloadBlob(blob, `${detail?.item?.title || 'drawing'}.png`)
  }

  async function exportSvgFile() {
    const scene = currentSerializableScene()
    const svg = await exportToSvg({
      elements: scene.elements as any,
      appState: scene.appState as any,
      files: scene.files as any
    } as any)
    downloadBlob(new Blob([svg.outerHTML], { type: 'image/svg+xml' }), `${detail?.item?.title || 'drawing'}.svg`)
  }

  const currentVersion = detail?.currentVersion || null
  const versionCount = detail?.versions?.length || 0
  const drawingStatus = (detail?.item?.status || 'draft') as StatusFilter
  const canSaveScene = Boolean(selectedId && dirty && !busy)
  const saveButtonTitle = !selectedId ? t('noDrawing') : dirty ? t('saveChanges') : t('saveNoChanges')
  const initialData = {
    ...restorePersistedScene(currentVersion, excalidrawTheme)
  }
  const shellClassName = `exw-shell ${leftPanelCollapsed ? 'left-collapsed' : ''} ${rightPanelCollapsed ? 'right-collapsed' : ''}`

  return (
    <div className={shellClassName}>
      <Sidebar className="exw-sidebar" side="left" collapsed={leftPanelCollapsed}>
        <SidebarHeader>
          <SidebarTrigger
            variant="ghost"
            size="icon"
            aria-label={leftPanelCollapsed ? t('expandDrawings') : t('collapseDrawings')}
            title={leftPanelCollapsed ? t('expandDrawings') : t('collapseDrawings')}
            onClick={() => setLeftPanelCollapsed((value) => !value)}
          >
            {leftPanelCollapsed ? <PanelLeftOpen className="exw-button-icon" aria-hidden="true" /> : <PanelLeftClose className="exw-button-icon" aria-hidden="true" />}
          </SidebarTrigger>
          {!leftPanelCollapsed ? (
            <>
              <SidebarTitle>{t('drawings')}</SidebarTitle>
              <Badge variant="secondary">{drawings.length}</Badge>
            </>
          ) : null}
        </SidebarHeader>
        {leftPanelCollapsed ? (
          <SidebarRail>
            <span>{t('drawings')}</span>
          </SidebarRail>
        ) : (
          <SidebarContent>
            <div className="exw-sidebar-controls">
              <Input
                value={search}
                placeholder={t('search')}
                onChange={(event: any) => {
                  const next = event.target.value
                  searchRef.current = next
                  setSearch(next)
                  reloadList({ search: next })
                }}
              />
              <Select
                value={status || 'all'}
                onValueChange={(value: string) => {
                  const next = value === 'all' ? '' : (value as StatusFilter)
                  statusRef.current = next
                  setStatus(next)
                  reloadList({ status: next })
                }}
              >
                <SelectTrigger aria-label={t('allStatuses')}>
                  <SelectValue placeholder={t('allStatuses')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allStatuses')}</SelectItem>
                  <SelectItem value="draft">{t('draft')}</SelectItem>
                  <SelectItem value="reviewed">{t('reviewed')}</SelectItem>
                  <SelectItem value="archived">{t('archived')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <ScrollArea className="exw-list">
              <SidebarMenu>
                {drawings.map((drawing) => (
                  <SidebarMenuItem key={drawing.id}>
                    <SidebarMenuButton type="button" active={drawing.id === selectedId} onClick={() => selectDrawing(drawing.id)}>
                      <span className="exw-item-title">{drawing.title || t('untitled')}</span>
                      <span className="exw-item-meta">
                        v{drawing.currentVersionNumber || 0} · {t((drawing.status || 'draft') as TranslationKey)}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </ScrollArea>
          </SidebarContent>
        )}
      </Sidebar>

      <main className="exw-main">
        <div className="exw-toolbar">
          <div className="exw-toolbar-title">
            <Input
              className="exw-title-input"
              value={newTitle}
              placeholder={t('title')}
              onChange={(event: any) => setNewTitle(event.target.value)}
            />
          </div>
          <div className="exw-toolbar-actions">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={createDrawing}>
              <Plus className="exw-button-icon" aria-hidden="true" />
              {t('newDrawing')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSaveScene}
              title={saveButtonTitle}
              aria-label={saveButtonTitle}
              onClick={() => saveCurrentScene()}
            >
              <Save className="exw-button-icon" aria-hidden="true" />
              {t('save')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileInputRef.current?.click()}>
              <Upload className="exw-button-icon" aria-hidden="true" />
              {t('import')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!selectedId} onClick={exportJson}>
              <FileJson className="exw-button-icon" aria-hidden="true" />
              {t('exportJson')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!selectedId} onClick={exportPng}>
              <Image className="exw-button-icon" aria-hidden="true" />
              {t('exportPng')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!selectedId} onClick={exportSvgFile}>
              <Image className="exw-button-icon" aria-hidden="true" />
              {t('exportSvg')}
            </Button>
            <Badge className="exw-status" variant={dirty ? 'warning' : 'secondary'}>
              {dirty ? t('dirty') : t('saved')}
            </Badge>
          </div>
          <input
            ref={fileInputRef}
            className="exw-hidden-file"
            type="file"
            accept=".excalidraw,.json,application/json"
            onChange={(event: any) => importFile(event.target.files?.[0] || null)}
          />
        </div>
        <div className="exw-canvas">
          {selectedId || currentVersion ? (
            <Excalidraw
              initialData={initialData as any}
              theme={excalidrawTheme}
              excalidrawAPI={(nextApi: any) => setApi(nextApi)}
              onChange={(elements: any[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
                elementsRef.current = elements || []
                appStateRef.current = appState || {}
                filesRef.current = files || {}
                if (!themeSyncRef.current) {
                  updateDirtyState()
                }
              }}
            />
          ) : (
            <div className="exw-empty">{t('noDrawing')}</div>
          )}
        </div>
      </main>

      <Sidebar className="exw-inspector" side="right" collapsed={rightPanelCollapsed}>
        <SidebarHeader>
          {!rightPanelCollapsed ? (
            <SidebarTitle className="exw-sidebar-title-truncate">{detail?.item?.title || t('inspector')}</SidebarTitle>
          ) : null}
          <SidebarTrigger
            className="exw-sidebar-trigger-right"
            variant="ghost"
            size="icon"
            aria-label={rightPanelCollapsed ? t('expandInspector') : t('collapseInspector')}
            title={rightPanelCollapsed ? t('expandInspector') : t('collapseInspector')}
            onClick={() => setRightPanelCollapsed((value) => !value)}
          >
            {rightPanelCollapsed ? <PanelRightOpen className="exw-button-icon" aria-hidden="true" /> : <PanelRightClose className="exw-button-icon" aria-hidden="true" />}
          </SidebarTrigger>
        </SidebarHeader>
        {rightPanelCollapsed ? (
          <SidebarRail>
            <span>{t('inspector')}</span>
          </SidebarRail>
        ) : (
          <SidebarContent className="exw-inspector-content">
            <div className="exw-inspector-panel-header">
              <div className="exw-inspector-actions">
                {drawingStatus === 'archived' ? (
                  <Badge variant="secondary">{t('archived')}</Badge>
                ) : drawingStatus === 'reviewed' ? (
                  <Button type="button" variant="outline" size="sm" disabled={busy || !selectedId} onClick={() => setDrawingReviewStatus('draft')}>
                    <RotateCcw className="exw-button-icon" aria-hidden="true" />
                    {t('backToDraft')}
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled={busy || !selectedId} onClick={() => setDrawingReviewStatus('reviewed')}>
                    <Check className="exw-button-icon" aria-hidden="true" />
                    {t('markReviewed')}
                  </Button>
                )}
                <Button type="button" variant="destructiveOutline" size="sm" disabled={busy || !selectedId || drawingStatus === 'archived'} onClick={archiveDrawing}>
                  <Archive className="exw-button-icon" aria-hidden="true" />
                  {t('archive')}
                </Button>
                <Button
                  className="exw-versions-toggle"
                  type="button"
                  variant={versionsOpen ? 'secondary' : 'outline'}
                  size="sm"
                  disabled={!selectedId || versionCount === 0}
                  aria-expanded={versionsOpen}
                  onClick={() => setVersionsOpen((value) => !value)}
                >
                  <ChevronDown className={`exw-button-icon exw-versions-toggle-icon ${versionsOpen ? 'is-open' : ''}`} aria-hidden="true" />
                  {t('versions')}
                  {currentVersion?.versionNumber ? ` v${currentVersion.versionNumber}` : ''}
                </Button>
              </div>
              {versionsOpen ? (
                <div className="exw-version-panel">
                  {(detail?.versions || []).map((version) => {
                    const isCurrentVersion = currentVersion?.id === version.id
                    const versionTime = formatVersionTime(version, context?.locale)
                    return (
                      <div className={`exw-version ${isCurrentVersion ? 'is-current' : ''}`} key={version.id}>
                        <div className="exw-version-main">
                          <div className="exw-version-title">v{version.versionNumber}</div>
                          <div className="exw-version-meta">{version.sourceType || 'workbench'}</div>
                          {versionTime ? <div className="exw-version-meta">{versionTime}</div> : null}
                          {version.changeSummary ? <div className="exw-version-summary">{version.changeSummary}</div> : null}
                        </div>
                        <Button
                          className="exw-version-action"
                          type="button"
                          variant="outline"
                          size="icon"
                          title={t('restore')}
                          aria-label={`${t('restore')} v${version.versionNumber}`}
                          disabled={busy || isCurrentVersion}
                          onClick={() => restoreVersion(version.id)}
                        >
                          <RotateCcw className="exw-button-icon" aria-hidden="true" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
            <ScrollArea className="exw-inspector-scroll">
              <div className="exw-inspector-stack">
                <section className="exw-section">
                  <div className="exw-section-title">{t('changeSummary')}</div>
                  <Input
                    value={changeSummary}
                    placeholder={t('changeSummary')}
                    onChange={(event: any) => setChangeSummary(event.target.value)}
                  />
                </section>

                <section className="exw-section">
                  <div className="exw-section-title">{t('mermaid')}</div>
                  <Textarea value={mermaidSource} onChange={(event: any) => updateMermaidSource(event.target.value, { compareDirty: true })} />
                  <div className="exw-muted">{t('mermaidNotice')}</div>
                  <div className="exw-inline-actions">
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={convertMermaid}>
                      {t('convert')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!canSaveScene}
                      title={saveButtonTitle}
                      aria-label={saveButtonTitle}
                      onClick={() => saveCurrentScene('save_converted_mermaid_scene')}
                    >
                      {t('saveConverted')}
                    </Button>
                  </div>
                </section>

                <section className="exw-section">
                  <div className="exw-section-title">{t('drawingRequest')}</div>
                  <Textarea
                    value={assistantPrompt}
                    placeholder={t('drawingRequest')}
                    onChange={(event: any) => setAssistantPrompt(event.target.value)}
                  />
                  <Button type="button" disabled={busy || !assistantPrompt.trim()} onClick={sendAssistantPrompt}>
                    <Send className="exw-button-icon" aria-hidden="true" />
                    {t('askAssistant')}
                  </Button>
                </section>

                <section className="exw-section">
                  <div className="exw-section-title">{t('description')}</div>
                  <Textarea
                    value={newDescription}
                    placeholder={t('description')}
                    onChange={(event: any) => setNewDescription(event.target.value)}
                  />
                </section>
              </div>
            </ScrollArea>
          </SidebarContent>
        )}
      </Sidebar>
    </div>
  )
}

function restorePersistedScene(version: DrawingVersion | null | undefined, theme: ExcalidrawTheme) {
  const fallbackAppState = withHostThemeAppState(isObject(version?.appState) ? version?.appState : {}, theme)
  const fallbackScene = {
    elements: Array.isArray(version?.elements) ? version?.elements : [],
    appState: fallbackAppState,
    files: isObject(version?.files) ? version?.files : {}
  }
  try {
    const restored = restore(
      {
        elements: fallbackScene.elements as any,
        appState: fallbackAppState as any,
        files: fallbackScene.files as any
      },
      fallbackAppState as any,
      null,
      {
        repairBindings: true
      }
    ) as any
    return {
      elements: Array.isArray(restored?.elements) ? restored.elements : fallbackScene.elements,
      appState: withHostThemeAppState(isObject(restored?.appState) ? restored.appState : fallbackScene.appState, theme),
      files: isObject(restored?.files) ? restored.files : fallbackScene.files
    }
  } catch {
    return fallbackScene
  }
}

function shouldAutoSaveMermaidVersion(version: DrawingVersion | null | undefined) {
  return Boolean(
    version?.sourceType === 'agent_mermaid'
      && typeof version.mermaidSource === 'string'
      && version.mermaidSource.trim()
      && (!Array.isArray(version.elements) || version.elements.length === 0)
  )
}

function formatVersionTime(version: DrawingVersion, locale: unknown) {
  const value = version.createdAt ?? version.created_at ?? version.updatedAt ?? version.updated_at
  const date = parseDateValue(value)
  if (!date) {
    return ''
  }
  try {
    return new Intl.DateTimeFormat(resolveDateLocale(locale), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date : null
  }
  return null
}

function resolveDateLocale(locale: unknown) {
  return String(locale || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

function withHostThemeAppState(appState: Record<string, unknown>, theme: ExcalidrawTheme) {
  return {
    ...appState,
    theme,
    viewBackgroundColor: typeof appState.viewBackgroundColor === 'string' && appState.viewBackgroundColor
      ? appState.viewBackgroundColor
      : defaultCanvasBackground(theme)
  }
}

function defaultCanvasBackground(theme: ExcalidrawTheme) {
  return theme === 'dark' ? '#121212' : '#ffffff'
}

function resolveExcalidrawTheme(hostTheme: unknown): ExcalidrawTheme {
  const explicitTheme = normalizeThemeInput(hostTheme)
  if (explicitTheme) {
    return explicitTheme
  }

  const documentTheme = normalizeThemeInput(document.documentElement.dataset.theme)
    ?? normalizeThemeInput(document.documentElement.dataset.colorScheme)
    ?? normalizeThemeInput(document.body?.dataset.theme)
    ?? normalizeThemeInput(document.body?.dataset.colorScheme)
    ?? normalizeThemeInput(document.documentElement.className)
    ?? normalizeThemeInput(document.body?.className)
  if (documentTheme) {
    return documentTheme
  }

  const backgroundTheme = themeFromCssColor(readCssColor('--xps-background') || readCssColor('--xui-color-background'))
  if (backgroundTheme) {
    return backgroundTheme
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function normalizeThemeInput(value: unknown): ExcalidrawTheme | null {
  if (typeof value === 'boolean') {
    return value ? 'dark' : 'light'
  }
  if (typeof value === 'string') {
    const normalized = value.toLowerCase()
    if (normalized.includes('dark') || normalized.includes('night')) {
      return 'dark'
    }
    if (normalized.includes('light') || normalized.includes('day')) {
      return 'light'
    }
    return null
  }
  if (!isObject(value)) {
    return null
  }
  if (value.isDark === true || value.dark === true) {
    return 'dark'
  }
  if (value.isDark === false || value.dark === false) {
    return 'light'
  }
  for (const key of ['mode', 'theme', 'colorScheme', 'appearance', 'name', 'type']) {
    const resolved = normalizeThemeInput(value[key])
    if (resolved) {
      return resolved
    }
  }
  return null
}

function readCssColor(variableName: string) {
  if (typeof window === 'undefined') {
    return ''
  }
  return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim()
    || getComputedStyle(document.body).getPropertyValue(variableName).trim()
}

function themeFromCssColor(color: string): ExcalidrawTheme | null {
  const rgb = parseCssColor(color)
  if (!rgb) {
    return null
  }
  const [r, g, b] = rgb.map((value) => {
    const normalized = value / 255
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance < 0.36 ? 'dark' : 'light'
}

function parseCssColor(color: string): [number, number, number] | null {
  const trimmed = color.trim()
  if (!trimmed) {
    return null
  }
  const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const value = hex[1].length === 3
      ? hex[1].split('').map((part) => part + part).join('')
      : hex[1]
    return [
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16)
    ]
  }

  const rgb = trimmed.match(/^rgba?\(([^)]+)\)$/i)
  if (rgb) {
    const parts = rgb[1].split(',').slice(0, 3).map((part) => Number.parseFloat(part.trim()))
    if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) {
      return parts as [number, number, number]
    }
  }
  return null
}

function createSceneSignature(
  elements: unknown[],
  appState: Record<string, unknown>,
  files: Record<string, unknown>,
  mermaidSource: string
) {
  const comparableAppState = SCENE_APP_STATE_SIGNATURE_KEYS.reduce<Record<string, unknown>>((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(appState, key)) {
      acc[key] = appState[key]
    }
    return acc
  }, {})
  return stableStringify({
    elements,
    appState: comparableAppState,
    files,
    mermaidSource: mermaidSource.replace(/\r\n/g, '\n')
  })
}

function stableStringify(value: unknown) {
  return JSON.stringify(normalizeJsonValue(value))
}

function normalizeJsonValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return undefined
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (seen.has(value)) {
    return '[Circular]'
  }
  seen.add(value)
  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = normalizeJsonValue(item, seen)
      return normalized === undefined ? null : normalized
    })
  }
  if (value instanceof Map) {
    return Array.from(value.entries())
      .map(([key, mapValue]) => [String(key), normalizeJsonValue(mapValue, seen)] as const)
      .sort(([left], [right]) => left.localeCompare(right))
  }
  if (value instanceof Set) {
    return Array.from(value.values()).map((item) => normalizeJsonValue(item, seen))
  }

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      const normalized = normalizeJsonValue((value as Record<string, unknown>)[key], seen)
      if (normalized !== undefined) {
        acc[key] = normalized
      }
      return acc
    }, {})
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function removeExcalidrawExtension(name: string) {
  return name.replace(/\.excalidraw(?:\.json)?$/i, '').replace(/\.json$/i, '') || name
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(<App />)
