import { debug, configureDebug } from './debug'
import { restorePersistedScene, restoreImportedExcalidrawFile, restoreExcalidrawScenePayload, isRecoverableSceneError, shouldAutoSaveMermaidVersion, isBlankPersistedVersion, isBlankSceneData, hasVisibleElements, formatVersionTime, parseDateValue, resolveDateLocale, withHostThemeAppState, defaultCanvasBackground, resolveExcalidrawTheme, normalizeThemeInput, readCssColor, themeFromCssColor, parseCssColor, wait, createSceneSignature, createDraftRecoverySnapshot, cloneDraftRecoverySnapshot, cloneScenePayload, stableStringify, normalizeJsonValue, isObject, synchronizeCollaboration, buildExcalidrawCollaborators, normalizeExcalidrawPointer, readZoom, readPositiveNumber, readFiniteNumber, clamp, collaboratorInitials, copyTextWithTextarea, normalizeArtifactShare, readOptionalString, isArtifactAccessSelection, localizedText, removeExcalidrawExtension, downloadBlob } from './scene-runtime'
import type { StatusFilter, Drawing, DrawingVersion, ExcalidrawTheme, DetailPayload, ArtifactShareSummary, ArtifactAccessSelection, ArtifactVersionSelection, CollaborationDescriptor, DiagramTemplateSummary, DiagramQualitySummary, SceneApplyPayload, DraftRecoverySnapshot, SaveCurrentSceneOptions, LoadDrawingDetailOptions, DeleteTarget, ConfirmationRequest } from './workbench-types'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Archive,
  Badge,
  Button,
  buttonVariants,
  Check,
  ChevronDown,
  Copy,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FileJson,
  Image as ImageIcon,
  Input,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Save,
  Send,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  Trash2,
  Upload,
} from '@xpert-ai/plugin-shadcn-ui'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, SidebarTitle, SidebarTrigger } from './workbench-sidebar'
import { io, type Socket } from 'socket.io-client'
import * as Y from 'yjs'
import {
  createCollaborationClient,
  createCollaborationPresenceStore,
  createSocketIoTransportAdapter,
  createYjsDocumentAdapter,
  type CollaborationClient,
  type CollaborationPresenceStore,
  type CollaborationSessionDescriptor,
  type ICollaborationPresence
} from '@xpert-ai/plugin-sdk/collaboration-client'
import { React, ReactDOM, h } from './vendor'
import { createTranslator, TranslationKey } from './i18n'
import { injectStyles } from './styles'
import {
  beginMermaidAutoSave,
  createMermaidAutoSaveGuard,
  createMermaidAutoSaveKey,
  finishMermaidAutoSave
} from './mermaid-auto-save'
import { decideDiagramIrRerender, decideTemplateInstantiation } from './diagram-template-actions'
import {
  decideToolEventRefresh,
  isAnimatedPatchTool,
  normalizeToolCompletedEvent,
  SAVE_MERMAID_DRAFT_TOOL_NAME
} from './tool-event-refresh'
import {
  buildSceneDiffSteps,
  DEFAULT_SCENE_ANIMATION_STEP_DELAY_MS,
  prepareSceneAnimationBaseElements
} from './scene-diff-animation'
import { normalizeMermaidSourceForExcalidrawConversion } from './mermaid-source-normalization'
import {
  copyArtifactShareText,
  decideArtifactPublishSync,
  isArtifactShareSelectionCurrent
} from './artifact-share-actions'
import {
  countSceneFiles,
  isSingleImageMermaidResult
} from './mermaid-conversion-result'
import {
  createExcalidrawSelectionContextCommand,
  createExcalidrawSelectionContextSignature,
  createExcalidrawSelectionClearCommand,
  getSelectedElementIds
} from './selection-context'
import { normalizeExcalidrawElementsForPersistence } from '../../../excalidraw-scene.validation'
import { materializeExcalidrawYDoc, writeExcalidrawSceneToYDoc } from '../../../excalidraw-yjs'
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

const DEFAULT_MERMAID = `flowchart TD
  A[User Request] --> B[Agent Plans Diagram]
  B --> C{Best Format?}
  C -->|Flow| D[Save Mermaid Draft]
  C -->|Precise Layout| E[Save Excalidraw JSON]
  D --> F[Workbench Converts]
  E --> G[Human Review]
  F --> G`

const AUTO_SAVE_DELAY_MS = 1200
const MAX_DRAFT_RECOVERY_SNAPSHOTS = 20
const HOST_EVENT_DETAIL_RETRY_DELAYS_MS = [150, 350, 700, 1200]
const LOCAL_COLLABORATION_ORIGIN = { source: 'excalidraw-workbench' }
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
  const [draftRecoveryCount, setDraftRecoveryCount] = React.useState(0)
  const [newTitle, setNewTitle] = React.useState('')
  const [changeSummary, setChangeSummary] = React.useState('')
  const [diagramTemplates, setDiagramTemplates] = React.useState<DiagramTemplateSummary[]>([])
  const [selectedTemplateKey, setSelectedTemplateKey] = React.useState('')
  const [templateSearch, setTemplateSearch] = React.useState('')
  const [templateCategory, setTemplateCategory] = React.useState('all')
  const [templateTag, setTemplateTag] = React.useState('all')
  const [templateTitle, setTemplateTitle] = React.useState('')
  const [templateColorScheme, setTemplateColorScheme] = React.useState<ExcalidrawTheme>('light')
  const [templateRendering, setTemplateRendering] = React.useState<'clean' | 'sketch'>('clean')
  const [mermaidSource, setMermaidSource] = React.useState(DEFAULT_MERMAID)
  const [leftPanelCollapsed, setLeftPanelCollapsed] = React.useState(true)
  const [rightPanelCollapsed, setRightPanelCollapsed] = React.useState(true)
  const [versionsOpen, setVersionsOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null)
  const [confirmationRequest, setConfirmationRequest] = React.useState<ConfirmationRequest | null>(null)
  const [shareDialogOpen, setShareDialogOpen] = React.useState(false)
  const [shareAccessMode, setShareAccessMode] = React.useState<ArtifactAccessSelection>('public_link')
  const [shareVersionMode, setShareVersionMode] = React.useState<ArtifactVersionSelection>('latest')
  const [collaborationState, setCollaborationState] = React.useState<'connecting' | 'connected' | 'disconnected'>('disconnected')
  const [collaborators, setCollaborators] = React.useState<ICollaborationPresence[]>([])
  const [remoteSessions, setRemoteSessions] = React.useState<ICollaborationPresence[]>([])
  const [excalidrawTheme, setExcalidrawTheme] = React.useState<ExcalidrawTheme>(() => resolveExcalidrawTheme(null))
  const [api, setApi] = React.useState<any>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const shareLinkInputRef = React.useRef<HTMLInputElement | null>(null)
  const confirmationResolverRef = React.useRef<((confirmed: boolean) => void) | null>(null)
  const apiRef = React.useRef<any>(null)
  const contextRef = React.useRef<any>(null)
  const detailRef = React.useRef<DetailPayload | null>(null)
  const selectedIdRef = React.useRef('')
  const searchRef = React.useRef('')
  const statusRef = React.useRef<StatusFilter>('')
  const hostEventSequenceRef = React.useRef(0)
  const sceneAnimationSequenceRef = React.useRef(0)
  const pendingMermaidPreviewRef = React.useRef<{ versionId?: string; source: string; autoSave?: boolean; autoSaveKey?: string } | null>(null)
  const mermaidAutoSaveGuardRef = React.useRef(createMermaidAutoSaveGuard())
  const excalidrawThemeRef = React.useRef<ExcalidrawTheme>(excalidrawTheme)
  const themeSyncRef = React.useRef(false)
  const elementsRef = React.useRef<any[]>([])
  const appStateRef = React.useRef<Record<string, unknown>>({})
  const filesRef = React.useRef<Record<string, unknown>>({})
  const selectedElementIdsRef = React.useRef<string[]>([])
  const selectionContextSignatureRef = React.useRef('')
  const selectionContextSyncTimerRef = React.useRef<number | null>(null)
  const mermaidSourceRef = React.useRef(DEFAULT_MERMAID)
  const dirtyRef = React.useRef(false)
  const savedSceneSignatureRef = React.useRef('')
  const autoSaveTimerRef = React.useRef<number | null>(null)
  const autoSaveInFlightRef = React.useRef(false)
  const autoSaveRequestedRef = React.useRef(false)
  const autoSaveFailureNotifiedRef = React.useRef(false)
  const lastSavedSnapshotRef = React.useRef<DraftRecoverySnapshot | null>(null)
  const draftRecoverySnapshotsRef = React.useRef<DraftRecoverySnapshot[]>([])
  const suppressedDetailSceneVersionRef = React.useRef<string | null>(null)
  const collaborationClientRef = React.useRef<CollaborationClient | null>(null)
  const collaborationSocketRef = React.useRef<Socket | null>(null)
  const collaborationPresenceStoreRef = React.useRef<CollaborationPresenceStore | null>(null)
  const collaborationDocRef = React.useRef<Y.Doc | null>(null)
  const collaborationDrawingIdRef = React.useRef('')
  const applyingCollaborativeSceneRef = React.useRef(false)
  const lastCollaborativeSignatureRef = React.useRef('')
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
    detailRef.current = detail
  }, [detail])

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
    apiRef.current = api
  }, [api])

  React.useEffect(() => () => {
    confirmationResolverRef.current?.(false)
    confirmationResolverRef.current = null
  }, [])

  function setCurrentDetail(nextDetail: DetailPayload | null) {
    detailRef.current = nextDetail
    setDetail(nextDetail)
  }

  function requestConfirmation(request: ConfirmationRequest): Promise<boolean> {
    confirmationResolverRef.current?.(false)
    return new Promise((resolve) => {
      confirmationResolverRef.current = resolve
      setConfirmationRequest(request)
    })
  }

  function settleConfirmation(confirmed: boolean) {
    const resolve = confirmationResolverRef.current
    confirmationResolverRef.current = null
    setConfirmationRequest(null)
    resolve?.(confirmed)
  }

  function stopCollaboration() {
    collaborationClientRef.current?.disconnect()
    collaborationClientRef.current = null
    collaborationSocketRef.current = null
    collaborationPresenceStoreRef.current?.clear()
    collaborationPresenceStoreRef.current = null
    collaborationDocRef.current?.destroy()
    collaborationDocRef.current = null
    collaborationDrawingIdRef.current = ''
    lastCollaborativeSignatureRef.current = ''
    setCollaborationState('disconnected')
    setCollaborators([])
    setRemoteSessions([])
    updateSceneSafely({ collaborators: new Map() }, { fallbackToBlank: false })
  }

  async function startCollaboration(drawingId: string) {
    if (!drawingId || collaborationDrawingIdRef.current === drawingId) return
    stopCollaboration()
    setCollaborationState('connecting')
    try {
      const response = await executeAction('open_collaboration', drawingId, { drawingId })
      const actionResult = getResponsePayload(response)
      const opened = (actionResult?.data ?? actionResult) as CollaborationDescriptor
      if (!opened?.connectionUrl || !opened?.sessionId || selectedIdRef.current !== drawingId) {
        throw new Error('Collaboration session was not returned for this drawing.')
      }
      const doc = new Y.Doc()
      const socket = io(opened.connectionUrl, {
        autoConnect: false,
        transports: ['websocket'],
        auth: {
          sessionId: opened.sessionId,
          clientKey: opened.clientKey,
          documentId: opened.documentId
        }
      })
      collaborationDrawingIdRef.current = drawingId
      collaborationDocRef.current = doc
      collaborationSocketRef.current = socket
      const presenceStore = createCollaborationPresenceStore({
        selfActor: opened.actor,
        includeSelf: true,
        onChange: (view) => {
          if (collaborationDrawingIdRef.current !== drawingId) return
          setCollaborators(view.collaborators)
          setRemoteSessions(view.remoteSessions)
          applyNativeCollaborators(view.remoteSessions)
        }
      })
      collaborationPresenceStoreRef.current = presenceStore

      doc.on('update', (_update, origin) => {
        if (origin === LOCAL_COLLABORATION_ORIGIN) return
        window.queueMicrotask(() => {
          if (collaborationDocRef.current === doc && selectedIdRef.current === drawingId) {
            applyCollaborativeDocument(doc)
          }
        })
      })
      socket.on('connect_error', (error: Error) => {
        if (collaborationDrawingIdRef.current !== drawingId) return
        setCollaborationState('disconnected')
        notify('warning', `${t('collaborationUnavailable')}: ${error.message}`)
      })
      const client = createCollaborationClient({
        session: opened,
        transport: createSocketIoTransportAdapter(socket),
        document: createYjsDocumentAdapter(doc, {
          applyUpdate: (document, update, origin) => Y.applyUpdate(document, update, origin),
          encodeStateVector: (document) => Y.encodeStateVector(document),
          mergeUpdates: (updates) => Y.mergeUpdates(updates)
        }),
        initialPresence: { mode: 'edit', status: 'editing' },
        batchMs: 40,
        syncIntervalMs: 2_000,
        presenceHeartbeatMs: 5_000,
        onAck: (ack) => {
          setCurrentDetail(detailRef.current ? {
            ...detailRef.current,
            item: { ...detailRef.current.item, revision: ack.sequenceNumber }
          } : null)
          const currentSignature = createSceneSignature(
            elementsRef.current,
            appStateRef.current,
            filesRef.current,
            mermaidSourceRef.current
          )
          if (lastCollaborativeSignatureRef.current === currentSignature) markCurrentSceneSaved()
        },
        onPresence: (presence) => presenceStore.upsert(presence),
        onPresenceSnapshot: (items, metadata) => presenceStore.replace(items, metadata.selfClientId),
        onPresenceRemove: (clientId) => presenceStore.remove(clientId),
        onConnectionChange: (state) => {
          if (collaborationDrawingIdRef.current !== drawingId) return
          setCollaborationState(state)
          if (state === 'connected') publishCollaborationPresence()
        },
        onError: (error) => notify('warning', `${t('collaborationUnavailable')}: ${error.message}`)
      })
      collaborationClientRef.current = client
      client.connect()
    } catch (error) {
      if (selectedIdRef.current === drawingId) notify('warning', getErrorMessage(error))
      stopCollaboration()
    }
  }

  function applyCollaborativeDocument(doc: Y.Doc) {
    const collaborative = materializeExcalidrawYDoc(doc)
    const restored = restoreExcalidrawScenePayload(collaborative, excalidrawThemeRef.current)
    const signature = createSceneSignature(restored.elements, restored.appState, restored.files, collaborative.mermaidSource ?? '')
    const currentSignature = createSceneSignature(elementsRef.current, appStateRef.current, filesRef.current, mermaidSourceRef.current)
    lastCollaborativeSignatureRef.current = signature
    if (signature === currentSignature) {
      markCurrentSceneSaved(collaborative.mermaidSource ?? '')
      return
    }
    applyingCollaborativeSceneRef.current = true
    elementsRef.current = restored.elements
    appStateRef.current = restored.appState
    filesRef.current = restored.files
    updateMermaidSource(collaborative.mermaidSource ?? '')
    void addFilesSafely(restored.files)
    updateSceneSafely({
      elements: restored.elements,
      appState: restored.appState,
      collaborators: buildExcalidrawCollaborators(collaborationPresenceStoreRef.current?.snapshot().remoteSessions ?? [], restored.appState)
    }, { fallbackToBlank: true })
    markCurrentSceneSaved(collaborative.mermaidSource ?? '')
    window.setTimeout(() => {
      applyingCollaborativeSceneRef.current = false
    }, 0)
  }

  function publishSceneToCollaboration() {
    const doc = collaborationDocRef.current
    if (!doc || applyingCollaborativeSceneRef.current || themeSyncRef.current) return
    const scene = currentSerializableScene()
    const signature = createSceneSignature(scene.elements, scene.appState, scene.files, mermaidSourceRef.current)
    if (signature === lastCollaborativeSignatureRef.current) return
    lastCollaborativeSignatureRef.current = signature
    writeExcalidrawSceneToYDoc(doc, {
      ...scene,
      mermaidSource: mermaidSourceRef.current || null
    }, LOCAL_COLLABORATION_ORIGIN)
  }

  function publishCollaborationPresence(pointer?: { x: number; y: number; visible: boolean } | null) {
    const appState = appStateRef.current
    collaborationClientRef.current?.setPresence({
      mode: 'edit',
      status: 'editing',
      pageId: selectedIdRef.current || null,
      pointer,
      selection: {
        kind: 'elements',
        elementIds: getSelectedElementIds(appState, selectedElementIdsRef.current)
      },
      viewport: {
        zoom: readZoom(appState),
        width: readPositiveNumber(appState.width, window.innerWidth),
        height: readPositiveNumber(appState.height, window.innerHeight)
      }
    })
  }

  function applyNativeCollaborators(items: ICollaborationPresence[]) {
    updateSceneSafely({ collaborators: buildExcalidrawCollaborators(items, appStateRef.current) }, { fallbackToBlank: false })
  }

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

  React.useEffect(() => {
    return () => {
      cancelSceneAnimation()
      cancelAutoSave()
      stopCollaboration()
      if (selectionContextSyncTimerRef.current !== null) {
        window.clearTimeout(selectionContextSyncTimerRef.current)
      }
    }
  }, [])

  // Refresh metadata independently from scene synchronization, including MCP changes
  // that have no ChatKit completion event. Never replace dirty canvas contents.
  const refreshMetadataRef=React.useRef<() => Promise<void>>(async()=>undefined)
  refreshMetadataRef.current=async()=>{
    const id=selectedIdRef.current
    await reloadList()
    if(id&&selectedIdRef.current===id)await loadDrawingDetail(id,{applyScene:false,resetDirty:false,closeVersions:false,clearChangeSummary:false,suppressErrorNotify:true})
  }
  React.useEffect(()=>{
    let running=false
    const timer=window.setInterval(()=>{
      if(document.visibilityState==='hidden'||running)return
      running=true
      void refreshMetadataRef.current().catch(()=>undefined).finally(()=>{running=false})
    },5000)
    return ()=>window.clearInterval(timer)
  },[])

  React.useEffect(reportResize, [drawings, detail, busy, dirty, collaborators, collaborationState, leftPanelCollapsed, rightPanelCollapsed, versionsOpen, deleteTarget])

  React.useEffect(() => {
    if (!api) {
      return
    }
    const nextAppState = withHostThemeAppState(appStateRef.current, excalidrawTheme)
    appStateRef.current = nextAppState
    themeSyncRef.current = true
    updateSceneSafely({
      appState: nextAppState
    })
    window.setTimeout(() => {
      themeSyncRef.current = false
    }, 0)
  }, [api, excalidrawTheme])

  React.useEffect(() => {
    const handleRecoverableSceneError = (error: unknown) => {
      if (!isRecoverableSceneError(error)) {
        return false
      }
      const translate = createTranslator(contextRef.current?.locale)
      debug.warn('[excalidraw-workbench] recovered from Excalidraw scene error', error)
      notify('warning', translate('sceneDataInvalid'))
      applyBlankScene({ clearMermaid: false })
      return true
    }
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (handleRecoverableSceneError(event.reason)) {
        event.preventDefault()
      }
    }
    const handleWindowError = (event: ErrorEvent) => {
      if (handleRecoverableSceneError(event.error || event.message)) {
        event.preventDefault()
      }
    }
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('error', handleWindowError)
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('error', handleWindowError)
    }
  }, [api])

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
    applyDiagramTemplatesPayload(payload)
    if (Array.isArray(payload.items)) {
      setDrawings(payload.items)
      if (!selectedIdRef.current && payload.items[0]?.id) {
        selectDrawing(payload.items[0].id)
      }
      return
    }
    if (payload.item) {
      detailRef.current = payload
      setCurrentDetail(payload)
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

  function applyDiagramTemplatesPayload(payload: any) {
    if (!Array.isArray(payload?.diagramTemplates)) return
    setDiagramTemplates(payload.diagramTemplates)
    setSelectedTemplateKey((current) => current || payload.diagramTemplates[0]?.key || '')
  }

  async function reloadAfterHostEvent(event: unknown) {
    const normalizedEvent = normalizeToolCompletedEvent(event)
    const refreshOptions = {
      selectedDrawingId: selectedIdRef.current,
      isDirty: dirtyRef.current,
      canReplaceDirtyScene: canReplaceCurrentDirtyScene()
    }
    debug.info('[excalidraw-workbench] handling hostEvent', {
      rawEvent: event,
      normalizedEvent,
      selectedId: selectedIdRef.current,
      dirty: dirtyRef.current,
      canReplaceDirtyScene: refreshOptions.canReplaceDirtyScene
    })
    const initialDecision = decideToolEventRefresh(normalizedEvent, refreshOptions)
    if (!initialDecision.shouldReloadList) {
      debug.info('[excalidraw-workbench] hostEvent ignored', {
        normalizedEvent,
        decision: initialDecision
      })
      return
    }

    cancelSceneAnimation()
    const sequence = ++hostEventSequenceRef.current
    const items = await reloadList()
    debug.info('[excalidraw-workbench] hostEvent list reloaded', {
      sequence,
      currentSequence: hostEventSequenceRef.current,
      itemCount: items.length,
      targetDrawingId: normalizedEvent.drawingId
    })
    if (sequence !== hostEventSequenceRef.current) {
      // A newer tool event won the race; avoid applying an older scene after the list reload.
      debug.info('[excalidraw-workbench] hostEvent refresh skipped because a newer event arrived', {
        sequence,
        currentSequence: hostEventSequenceRef.current
      })
      return
    }

    const decision = decideToolEventRefresh(normalizedEvent, {
      selectedDrawingId: selectedIdRef.current,
      isDirty: dirtyRef.current,
      canReplaceDirtyScene: canReplaceCurrentDirtyScene()
    })
    debug.info('[excalidraw-workbench] hostEvent refresh decision', decision)
    let selectedPayload: DetailPayload | null = null
    let sceneApplied = true
    const shouldAnimateScene = isAnimatedPatchTool(normalizedEvent) && Boolean(apiRef.current)
    const shouldPreviewMermaidDraft = decision.shouldQueueMermaidPreview && Boolean(apiRef.current)
    const shouldLoadDetailWithoutApplyingScene = shouldAnimateScene || shouldPreviewMermaidDraft
    if (decision.shouldProtectDirtyScene) {
      // Preserve unsaved local canvas edits; only refresh version metadata unless applying is explicitly safe.
      if (decision.shouldLoadProtectedDetail && decision.targetDrawingId) {
        debug.info('[excalidraw-workbench] loading detail without applying scene because canvas is dirty', {
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
      debug.info('[excalidraw-workbench] selecting drawing after hostEvent', {
        drawingId: decision.targetDrawingId,
        animated: shouldAnimateScene,
        mermaidPreview: shouldPreviewMermaidDraft
      })
      selectedPayload = await loadDrawingDetailAfterHostEvent(
        decision.targetDrawingId,
        shouldLoadDetailWithoutApplyingScene
          ? {
              applyScene: false,
              resetDirty: true,
              closeVersions: true,
              clearChangeSummary: true
            }
          : {
              applyScene: true,
              resetDirty: true,
              closeVersions: true,
              clearChangeSummary: true
            },
        sequence
      )
      if (sequence !== hostEventSequenceRef.current) {
        debug.info('[excalidraw-workbench] hostEvent scene apply skipped because a newer event arrived', {
          sequence,
          currentSequence: hostEventSequenceRef.current
        })
        return
      }
      if (normalizedEvent?.isCreateDrawing && selectedPayload?.item && !items.some((item) => item?.id === selectedPayload?.item?.id)) {
        await reloadList()
        if (sequence !== hostEventSequenceRef.current) {
          debug.info('[excalidraw-workbench] hostEvent post-create list refresh skipped because a newer event arrived', {
            sequence,
            currentSequence: hostEventSequenceRef.current
          })
          return
        }
      }
      if (shouldAnimateScene) {
        if (selectedPayload?.currentVersion) {
          sceneApplied = await animateApplyVersion(selectedPayload.currentVersion)
        } else if (apiRef.current) {
          applyBlankScene({ clearMermaid: true })
        }
        if (!sceneApplied) {
          return
        }
      }
      debug.info('[excalidraw-workbench] selected drawing after hostEvent', {
        drawingId: decision.targetDrawingId,
        currentVersionId: selectedPayload?.currentVersion?.id,
        currentVersionNumber: selectedPayload?.currentVersion?.versionNumber,
        animated: shouldAnimateScene,
        mermaidPreview: shouldPreviewMermaidDraft
      })
    }

    if (decision.shouldQueueMermaidPreview && selectedPayload?.currentVersion?.mermaidSource) {
      debug.info('[excalidraw-workbench] previewing Mermaid draft after hostEvent', {
        drawingId: decision.targetDrawingId,
        versionId: selectedPayload.currentVersion.id
      })
      const autoSaveKey = createMermaidAutoSaveKey(selectedPayload.currentVersion.id, selectedPayload.currentVersion.mermaidSource)
      prepareMermaidPreviewCanvas(selectedPayload.currentVersion.mermaidSource)
      await previewMermaidSource(selectedPayload.currentVersion.mermaidSource, {
        automatic: true,
        autoSave: true,
        autoSaveKey
      })
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
      applyDiagramTemplatesPayload(payload)
      const items = Array.isArray(payload.items) ? payload.items : []
      debug.info('[excalidraw-workbench] reloadList result', {
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

  async function loadDrawingDetailAfterHostEvent(
    drawingId: string,
    options: LoadDrawingDetailOptions,
    sequence: number
  ): Promise<DetailPayload | null> {
    for (let attempt = 0; attempt <= HOST_EVENT_DETAIL_RETRY_DELAYS_MS.length; attempt += 1) {
      if (sequence !== hostEventSequenceRef.current) {
        return null
      }
      const isFinalAttempt = attempt === HOST_EVENT_DETAIL_RETRY_DELAYS_MS.length
      const payload = await loadDrawingDetail(drawingId, {
        ...options,
        suppressErrorNotify: !isFinalAttempt
      })
      if (payload?.item) {
        return payload
      }
      if (isFinalAttempt || sequence !== hostEventSequenceRef.current) {
        return null
      }
      const retryDelay = HOST_EVENT_DETAIL_RETRY_DELAYS_MS[attempt]
      debug.info('[excalidraw-workbench] hostEvent detail not ready; retrying', {
        drawingId,
        attempt: attempt + 1,
        retryDelay
      })
      await wait(retryDelay)
    }
    return null
  }

  async function loadDrawingDetail(
    drawingId: string,
    options: LoadDrawingDetailOptions = {}
  ): Promise<DetailPayload | null> {
    if (!drawingId) {
      return null
    }
    const applyScene = options.applyScene ?? true
    const resetDirty = options.resetDirty ?? applyScene
    const closeVersions = options.closeVersions ?? true
    const clearChangeSummary = options.clearChangeSummary ?? true
    if (resetDirty && drawingId !== selectedIdRef.current) {
      cancelAutoSave()
      clearDraftRecovery()
    }
    setBusy(true)
    try {
      const response = await requestData({
        parameters: {
          drawingId
        }
      })
      const payload = getResponsePayload(response) || {}
      applyDiagramTemplatesPayload(payload)
      if (!payload.item) {
        debug.warn('[excalidraw-workbench] loadDrawingDetail returned no drawing item', {
          drawingId,
          payload
        })
        if (!options.suppressErrorNotify) {
          const translate = createTranslator(contextRef.current?.locale)
          notify('warning', translate('drawingNotReady'))
        }
        return null
      }
      debug.info('[excalidraw-workbench] loadDrawingDetail result', {
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
      detailRef.current = payload
      setCurrentDetail(payload)
      if (resetDirty) {
        dirtyRef.current = false
        setDirty(false)
        cancelAutoSave()
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
        if (apiRef.current && payload.currentVersion) {
          applyVersion(payload.currentVersion)
        } else if (apiRef.current) {
          applyBlankScene({ clearMermaid: true })
        }
      }
      if (payload.item.status !== 'archived' && collaborationDrawingIdRef.current !== drawingId) {
        void startCollaboration(drawingId)
      } else if (payload.item.status === 'archived') {
        stopCollaboration()
      }
      return payload
    } catch (error) {
      if (!options.suppressErrorNotify) {
        notify('error', getErrorMessage(error))
      }
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
        title
      })
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('drawingCreated'))
      const drawingId = result?.item?.id || result?.data?.item?.id
      const drawingItem = result?.item || result?.data?.item || null
      setNewTitle('')
      setChangeSummary('')
      if (drawingId) {
        const detailPayload = {
          item: drawingItem || { id: drawingId, title, currentVersionNumber: 0, status: 'draft' },
          currentVersion: null,
          versions: [],
          logs: []
        }
        cancelAutoSave()
        selectedIdRef.current = drawingId
        setSelectedId(drawingId)
        detailRef.current = detailPayload
        setCurrentDetail(detailPayload)
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

  async function instantiateSelectedTemplate(applyToCurrent: boolean) {
    const template = diagramTemplates.find((item) => item.key === selectedTemplateKey)
    if (!template) return
    const decision = decideTemplateInstantiation({ applyToCurrent, selectedDrawingId: selectedId, dirty: dirtyRef.current })
    if (decision.blockReason === 'no-drawing') {
      notify('warning', t('noDrawing'))
      return
    }
    if (decision.blockReason === 'dirty') {
      notify('warning', t('templateDirtyBlocked'))
      return
    }
    if (!decision.allowed) return
    if (decision.requiresConfirmation && !(await requestConfirmation({
      title: t('confirmTemplateReplaceTitle'),
      description: t('confirmTemplateReplace'),
      confirmLabel: t('confirmAction')
    }))) return
    const title = templateTitle.trim() || localizedText(template.title, contextRef.current?.locale) || template.key
    setBusy(true)
    try {
      const response = await executeAction('instantiate_diagram_template', applyToCurrent ? selectedId : null, {
        key: template.key,
        version: template.version,
        ...(applyToCurrent ? {
          drawingId: selectedId,
          confirmedReplace: true,
          ...(detailRef.current?.diagramQuality?.revision ? { expectedRevision: detailRef.current.diagramQuality.revision } : {})
        } : {}),
        parameters: {
          title,
          colorScheme: templateColorScheme,
          rendering: templateRendering
        }
      })
      const result = getResponsePayload(response)
      const drawingId = result?.data?.drawingId || result?.drawingId
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('templateCreated'))
      await reloadList()
      if (drawingId) await selectDrawing(drawingId)
      setTemplateTitle('')
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function renderCurrentDiagramIr() {
    const quality = detailRef.current?.diagramQuality
    const diverged = quality?.status === 'diverged'
    const decision = decideDiagramIrRerender({ selectedDrawingId: selectedId, revision: quality?.revision, dirty: dirtyRef.current, diverged })
    if (decision.blockReason === 'dirty') {
      notify('warning', t('rerenderDirtyBlocked'))
      return
    }
    if (!decision.allowed || !quality?.revision) return
    if (decision.requiresConfirmation && !(await requestConfirmation({
      title: t('confirmIrReplaceTitle'),
      description: t('confirmIrReplace'),
      confirmLabel: t('confirmAction')
    }))) return
    setBusy(true)
    try {
      const response = await executeAction('render_diagram_ir', selectedId, {
        drawingId: selectedId,
        expectedRevision: quality.revision,
        confirmedReplace: diverged
      })
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('diagramRendered'))
      await selectDrawing(selectedId)
      await reloadList()
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function saveCurrentScene(
    sourceAction = 'save_current_scene',
    options: SaveCurrentSceneOptions = {}
  ) {
    const drawingId = selectedIdRef.current || selectedId
    if (!drawingId) {
      if (!options.background) {
        notify('warning', t('noDrawing'))
      }
      return false
    }
    if (!options.force && !dirtyRef.current) {
      if (!options.background) {
        notify('info', t('saveNoChanges'))
      }
      return false
    }
    const shouldSetBusy = !options.background
    if (shouldSetBusy) {
      setBusy(true)
    }
    try {
      publishSceneToCollaboration()
      await synchronizeCollaboration(collaborationClientRef.current, collaborationSocketRef.current)
      const scene = currentSerializableScene()
      const mermaidSourceAtSave = mermaidSourceRef.current
      const savedSceneSignature = createSceneSignature(
        scene.elements,
        scene.appState,
        scene.files,
        mermaidSourceAtSave
      )
      const savedSnapshot = createDraftRecoverySnapshot(drawingId, {
        ...scene,
        mermaidSource: mermaidSourceAtSave
      }, savedSceneSignature)
      const previousSavedSnapshot = lastSavedSnapshotRef.current
      const response = await executeAction(sourceAction, drawingId, {
        drawingId,
        expectedRevision:detailRef.current?.item?.revision,
        elements: scene.elements,
        appState: scene.appState,
        files: scene.files,
        mermaidSource: mermaidSourceAtSave,
        changeSummary: options.changeSummary ?? (options.background ? undefined : changeSummary.trim() || undefined)
      })
      const result = getResponsePayload(response)
      if (!options.silent) {
        notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('operationCompleted'))
      }
      autoSaveFailureNotifiedRef.current = false
      if (options.background && selectedIdRef.current !== drawingId) {
        return true
      }
      if (previousSavedSnapshot?.drawingId === drawingId && previousSavedSnapshot.signature !== savedSceneSignature) {
        rememberDraftRecovery(previousSavedSnapshot)
      }
      markSceneSignatureSaved(savedSceneSignature, savedSnapshot)
      if (!options.background) {
        setChangeSummary('')
      }
      if (options.reloadAfterSave !== false) {
        await loadDrawingDetail(drawingId, {
          applyScene: false,
          resetDirty: false,
          closeVersions: false,
          clearChangeSummary: false
        })
        await reloadList()
      }
      return true
    } catch (error) {
      if (options.background) {
        debug.warn('[excalidraw-workbench] auto-save failed', error)
        if (!autoSaveFailureNotifiedRef.current) {
          autoSaveFailureNotifiedRef.current = true
          notify('warning', getErrorMessage(error))
        }
      } else {
        notify('error', getErrorMessage(error))
      }
      return false
    } finally {
      if (shouldSetBusy) {
        setBusy(false)
      }
    }
  }

  async function saveNewVersion() {
    await saveCurrentScene('save_scene_version', { force: true })
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
      stopCollaboration()
      setCurrentDetail(null)
      setSelectedId('')
      await reloadList()
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function requestDeleteDrawing(drawing?: Drawing) {
    const drawingId = drawing?.id || selectedId
    if (!drawingId) {
      return
    }
    setDeleteTarget({
      type: 'drawing',
      drawingId,
      title: drawing?.title || detailRef.current?.item?.title || t('untitled')
    })
  }

  function requestDeleteVersion(version: DrawingVersion) {
    if (!selectedId || !version?.id) {
      return
    }
    setDeleteTarget({
      type: 'version',
      drawingId: selectedId,
      versionId: version.id,
      versionNumber: version.versionNumber
    })
  }

  async function confirmDeleteTarget() {
    const target = deleteTarget
    if (!target) {
      return
    }
    const deletingSelectedDrawing = target.type === 'drawing' && target.drawingId === selectedIdRef.current
    setBusy(true)
    try {
      if (target.type === 'drawing') {
        const response = await executeAction('delete_drawing', target.drawingId, {
          drawingId: target.drawingId
        })
        const result = getResponsePayload(response)
        notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('operationCompleted'))
        setDeleteTarget(null)
        setDrawings((items) => items.filter((item) => item?.id !== target.drawingId))
        if (deletingSelectedDrawing) {
          stopCollaboration()
          await selectFallbackDrawingAfterDelete(target.drawingId)
        } else {
          await reloadList()
        }
        return
      }

      const response = await executeAction('delete_version', target.drawingId, {
        drawingId: target.drawingId,
        versionId: target.versionId
      })
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('operationCompleted'))
      setDeleteTarget(null)
      await loadDrawingDetail(target.drawingId, {
        applyScene: true,
        resetDirty: true,
        closeVersions: false,
        clearChangeSummary: false
      })
      await reloadList()
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function selectFallbackDrawingAfterDelete(deletedDrawingId: string) {
    cancelAutoSave()
    cancelSceneAnimation()
    setVersionsOpen(false)
    dirtyRef.current = false
    setDirty(false)
    suppressedDetailSceneVersionRef.current = null

    const items = await reloadList()
    const remainingItems = items.filter((item) => item?.id && item.id !== deletedDrawingId)
    if (remainingItems.length !== items.length) {
      setDrawings(remainingItems)
    }
    const fallbackDrawingId = remainingItems[0]?.id
    if (fallbackDrawingId) {
      const payload = await selectDrawing(fallbackDrawingId)
      if (payload?.item) {
        return
      }
    }

    selectedIdRef.current = ''
    setSelectedId('')
    setCurrentDetail(null)
    setChangeSummary('')
    applyBlankScene({ clearMermaid: true })
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
    if (!source || !apiRef.current) {
      return false
    }
    const translate = createTranslator(contextRef.current?.locale)
    setBusy(true)
    try {
      const conversionSource = normalizeMermaidSourceForExcalidrawConversion(source)
      const result = await parseMermaidToExcalidraw(conversionSource, {
        themeVariables: {
          fontSize: '25px'
        },
        maxEdges: 1000,
        maxTextSize: 50000
      })
      const elements = convertToExcalidrawElements(result.elements || [])
      const files = result.files || {}
      const imageFallback = isSingleImageMermaidResult(elements, files)
      debug.info('[excalidraw-workbench] Mermaid conversion result', {
        elementCount: elements.length,
        elementTypes: elements.slice(0, 20).map((element: any) => element?.type),
        fileCount: countSceneFiles(files),
        imageFallback
      })
      const appState = {
        ...(appStateRef.current || {}),
        theme: excalidrawThemeRef.current,
        viewBackgroundColor: defaultCanvasBackground(excalidrawThemeRef.current)
      }
      const scene = {
        elements,
        appState,
        files,
        mermaidSource: source
      }
      const applied = imageFallback
        ? await applySceneImmediately(scene, { clearBeforeApply: true, markSaved: false, preloadFiles: true })
        : await animateApplyScene(scene, { discardCurrentImages: true, markSaved: false })
      if (!applied) {
        return false
      }
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

  function scheduleAssistantSelectionContextSync(options: { immediate?: boolean } = {}) {
    if (selectionContextSyncTimerRef.current !== null) {
      window.clearTimeout(selectionContextSyncTimerRef.current)
    }
    selectionContextSyncTimerRef.current = window.setTimeout(() => {
      selectionContextSyncTimerRef.current = null
      void syncAssistantSelectionContext()
    }, options.immediate ? 0 : 250)
  }

  async function syncAssistantSelectionContext() {
    const input = {
      drawing: detailRef.current?.item ?? (selectedIdRef.current ? { id: selectedIdRef.current } : null),
      version: detailRef.current?.currentVersion,
      selectedElementIds: getSelectedElementIds(appStateRef.current, selectedElementIdsRef.current),
      elements: elementsRef.current,
      isDirty: dirtyRef.current
    }
    const signature = createExcalidrawSelectionContextSignature(input)
    if (signature === selectionContextSignatureRef.current) {
      return
    }
    selectionContextSignatureRef.current = signature

    const command = createExcalidrawSelectionContextCommand(input) || createExcalidrawSelectionClearCommand()
    try {
      const response = await invokeClientCommand(command.commandKey, command.payload)
      const result = getResponsePayload(response)
      if (result?.success === false) {
        debug.warn('[excalidraw-workbench] assistant selection context command failed', result)
      }
    } catch (error) {
      debug.warn('[excalidraw-workbench] failed to sync assistant selection context', error)
    }
  }

  async function importFile(file: File | null) {
    if (!file) {
      return
    }
    setBusy(true)
    try {
      const scene = await restoreImportedExcalidrawFile(file, excalidrawThemeRef.current)
      const drawingId = selectedIdRef.current || selectedId || undefined
      const response = await executeAction(
        'import_restored_scene',
        drawingId || null,
        {
          drawingId,
          title: removeExcalidrawExtension(file.name),
          elements: scene.elements,
          appState: scene.appState,
          files: scene.files,
          changeSummary: `Imported ${file.name || 'Excalidraw file'}`
        },
        {
          drawingId
        }
      )
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('operationCompleted'))
      const importedDrawingId = result?.data?.item?.id || result?.data?.drawing?.item?.id || result?.item?.id || drawingId
      await reloadList()
      if (importedDrawingId) {
        await selectDrawing(importedDrawingId)
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

  function updateSceneSafely(scene: Record<string, unknown>, options: { fallbackToBlank?: boolean } = {}) {
    const currentApi = apiRef.current
    if (!currentApi) {
      return false
    }
    try {
      const result = currentApi.updateScene(scene)
      if (result && typeof result.then === 'function') {
        void result.catch((error: unknown) => {
          handleSceneApplicationError(error, options)
        })
      }
      return true
    } catch (error) {
      handleSceneApplicationError(error, options)
      return false
    }
  }

  async function addFilesSafely(files: Record<string, unknown>) {
    const currentApi = apiRef.current
    if (!currentApi?.addFiles || Object.keys(files).length === 0) {
      return true
    }
    try {
      const result = currentApi.addFiles(Object.values(files))
      if (result && typeof result.then === 'function') {
        await result
      }
      return true
    } catch (error) {
      handleSceneApplicationError(error, { fallbackToBlank: false })
      return false
    }
  }

  function handleSceneApplicationError(error: unknown, options: { fallbackToBlank?: boolean } = {}) {
    const translate = createTranslator(contextRef.current?.locale)
    debug.warn('[excalidraw-workbench] failed to apply Excalidraw scene', error)
    notify('warning', `${translate('sceneDataInvalid')}: ${getErrorMessage(error)}`)
    if (options.fallbackToBlank) {
      applyBlankScene({ clearMermaid: false })
    }
  }

  function cancelSceneAnimation() {
    sceneAnimationSequenceRef.current += 1
  }

  function isCurrentSceneAnimation(sequence: number) {
    return sequence === sceneAnimationSequenceRef.current
  }

  function waitForSceneAnimationStep(sequence: number, delayMs = DEFAULT_SCENE_ANIMATION_STEP_DELAY_MS) {
    return new Promise<boolean>((resolve) => {
      window.setTimeout(() => {
        resolve(isCurrentSceneAnimation(sequence))
      }, delayMs)
    })
  }

  async function animateApplyScene(scene: SceneApplyPayload, options: { discardCurrentImages?: boolean; markSaved: boolean }) {
    const sequence = sceneAnimationSequenceRef.current + 1
    sceneAnimationSequenceRef.current = sequence
    const targetElements = scene.elements
    const appState = scene.appState
    const files = scene.files
    const mermaid = scene.mermaidSource
    const baseElements = prepareSceneAnimationBaseElements(elementsRef.current, targetElements, {
      discardCurrentImages: options.discardCurrentImages
    })
    const steps = buildSceneDiffSteps(baseElements, targetElements)

    selectedElementIdsRef.current = []
    updateMermaidSource(mermaid)
    appStateRef.current = appState
    filesRef.current = files
    themeSyncRef.current = true
    if (!(await addFilesSafely(files))) {
      return false
    }
    if (hasSceneAnimationBaseChanged(elementsRef.current, baseElements)) {
      elementsRef.current = baseElements
      updateSceneSafely({
        elements: baseElements,
        appState,
        collaborators: new Map()
      }, { fallbackToBlank: true })
    }

    try {
      if (steps.length === 0) {
        elementsRef.current = targetElements
        if (!updateSceneSafely({
          elements: targetElements,
          appState,
          collaborators: new Map()
        }, { fallbackToBlank: true })) {
          return false
        }
        completeAnimatedSceneApply(sequence, options.markSaved, mermaid)
        return true
      }

      for (const step of steps) {
        if (!isCurrentSceneAnimation(sequence)) {
          return false
        }
        elementsRef.current = step.elements
        if (!updateSceneSafely({
          elements: step.elements,
          appState,
          collaborators: new Map()
        }, { fallbackToBlank: true })) {
          return false
        }
        if (step.type === 'delete') {
          continue
        }
        if (!(await waitForSceneAnimationStep(sequence))) {
          return false
        }
      }

      if (!isCurrentSceneAnimation(sequence)) {
        return false
      }
      elementsRef.current = targetElements
      appStateRef.current = appState
      filesRef.current = files
      completeAnimatedSceneApply(sequence, options.markSaved, mermaid)
      return true
    } finally {
      if (isCurrentSceneAnimation(sequence)) {
        themeSyncRef.current = false
      }
    }
  }

  async function applySceneImmediately(
    scene: SceneApplyPayload,
    options: { clearBeforeApply?: boolean; markSaved: boolean; preloadFiles?: boolean }
  ) {
    const sequence = sceneAnimationSequenceRef.current + 1
    sceneAnimationSequenceRef.current = sequence
    const targetElements = scene.elements
    const appState = scene.appState
    const files = scene.files
    const mermaid = scene.mermaidSource

    selectedElementIdsRef.current = []
    updateMermaidSource(mermaid)
    appStateRef.current = appState
    themeSyncRef.current = true

    try {
      if (options.clearBeforeApply) {
        elementsRef.current = []
        filesRef.current = {}
        if (!updateSceneSafely({
          elements: [],
          appState,
          collaborators: new Map()
        }, { fallbackToBlank: false })) {
          return false
        }
      }
      if (options.preloadFiles) {
        await preloadSceneFiles(files)
        if (!isCurrentSceneAnimation(sequence)) {
          return false
        }
      }
      filesRef.current = files
      if (!(await addFilesSafely(files))) {
        return false
      }
      if (options.preloadFiles && !(await waitForSceneAnimationFrames(sequence, 2))) {
        return false
      }
      elementsRef.current = targetElements
      if (!updateSceneSafely({
        elements: targetElements,
        appState,
        collaborators: new Map()
      }, { fallbackToBlank: true })) {
        return false
      }
      completeAnimatedSceneApply(sequence, options.markSaved, mermaid)
      return true
    } finally {
      if (isCurrentSceneAnimation(sequence)) {
        themeSyncRef.current = false
      }
    }
  }

  function prepareMermaidPreviewCanvas(source: string) {
    cancelSceneAnimation()
    const appState = withHostThemeAppState(appStateRef.current || {}, excalidrawThemeRef.current)
    elementsRef.current = []
    appStateRef.current = appState
    filesRef.current = {}
    selectedElementIdsRef.current = []
    updateMermaidSource(source)
    themeSyncRef.current = true
    updateSceneSafely({
      elements: [],
      appState,
      collaborators: new Map()
    }, { fallbackToBlank: false })
    window.setTimeout(() => {
      themeSyncRef.current = false
    }, 0)
    dirtyRef.current = false
    setDirty(false)
    cancelAutoSave()
  }

  async function preloadSceneFiles(files: Record<string, unknown>) {
    const dataUrls = Object.values(files)
      .map(readSceneFileDataUrl)
      .filter((dataUrl): dataUrl is string => Boolean(dataUrl && dataUrl.startsWith('data:image/')))
    await Promise.all(dataUrls.map(preloadImageDataUrl))
  }

  function readSceneFileDataUrl(file: unknown) {
    return isObject(file) && typeof file.dataURL === 'string' ? file.dataURL : null
  }

  function preloadImageDataUrl(dataUrl: string) {
    return new Promise<boolean>((resolve) => {
      if (typeof window.Image === 'undefined') {
        resolve(false)
        return
      }
      let settled = false
      const finish = (loaded: boolean) => {
        if (settled) {
          return
        }
        settled = true
        resolve(loaded)
      }
      const image = new window.Image()
      image.onload = () => finish(true)
      image.onerror = () => finish(false)
      window.setTimeout(() => finish(false), 2000)
      image.src = dataUrl
    })
  }

  async function waitForSceneAnimationFrames(sequence: number, frameCount: number) {
    for (let index = 0; index < frameCount; index += 1) {
      if (!(await waitForSceneAnimationFrame(sequence))) {
        return false
      }
    }
    return true
  }

  function waitForSceneAnimationFrame(sequence: number) {
    return new Promise<boolean>((resolve) => {
      window.requestAnimationFrame(() => {
        resolve(isCurrentSceneAnimation(sequence))
      })
    })
  }

  function hasSceneAnimationBaseChanged(currentElements: unknown[], baseElements: unknown[]) {
    if (currentElements.length !== baseElements.length) {
      return true
    }
    return baseElements.some((element, index) => currentElements[index] !== element)
  }

  function completeAnimatedSceneApply(sequence: number, markSaved: boolean, mermaid: string) {
    if (!isCurrentSceneAnimation(sequence)) {
      return
    }
    themeSyncRef.current = false
    if (markSaved) {
      markCurrentSceneSaved(mermaid)
    } else {
      updateDirtyState(mermaid)
    }
  }

  async function animateApplyVersion(version: DrawingVersion) {
    if (!apiRef.current) {
      applyVersion(version)
      return true
    }

    const scene = restorePersistedScene(version, excalidrawThemeRef.current)
    return animateApplyScene({
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
      mermaidSource: typeof version.mermaidSource === 'string' ? version.mermaidSource : ''
    }, { markSaved: true })
  }

  function applyVersion(version: DrawingVersion) {
    cancelSceneAnimation()
    const scene = restorePersistedScene(version, excalidrawThemeRef.current)
    const elements = scene.elements
    const appState = scene.appState
    const files = scene.files
    const mermaid = typeof version.mermaidSource === 'string' ? version.mermaidSource : ''
    elementsRef.current = elements
    appStateRef.current = appState
    filesRef.current = files
    selectedElementIdsRef.current = []
    scheduleAssistantSelectionContextSync({ immediate: true })
    updateMermaidSource(mermaid)
    themeSyncRef.current = true
    const applied = updateSceneSafely({
      elements,
      appState,
      collaborators: new Map()
    }, { fallbackToBlank: true })
    if (!applied) {
      return
    }
    void addFilesSafely(files)
    window.setTimeout(() => {
      themeSyncRef.current = false
    }, 0)
    markCurrentSceneSaved(mermaid)
  }

  function applyBlankScene(options: { clearMermaid?: boolean } = {}) {
    cancelSceneAnimation()
    const appState = withHostThemeAppState({}, excalidrawThemeRef.current)
    elementsRef.current = []
    appStateRef.current = appState
    filesRef.current = {}
    selectedElementIdsRef.current = []
    scheduleAssistantSelectionContextSync({ immediate: true })
    if (options.clearMermaid) {
      updateMermaidSource('')
    }
    themeSyncRef.current = true
    updateSceneSafely({
      elements: [],
      appState,
      collaborators: new Map()
    }, { fallbackToBlank: false })
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
      publishSceneToCollaboration()
    }
  }

  function markCurrentSceneSaved(mermaidOverride = mermaidSourceRef.current) {
    const signature = createSceneSignature(
      elementsRef.current,
      appStateRef.current,
      filesRef.current,
      mermaidOverride
    )
    markSceneSignatureSaved(signature, createDraftRecoverySnapshot(selectedIdRef.current, {
      elements: elementsRef.current,
      appState: appStateRef.current,
      files: filesRef.current,
      mermaidSource: mermaidOverride
    }, signature))
  }

  function markSceneSignatureSaved(savedSceneSignature: string, savedSnapshot?: DraftRecoverySnapshot) {
    savedSceneSignatureRef.current = savedSceneSignature
    if (savedSnapshot?.drawingId) {
      lastSavedSnapshotRef.current = savedSnapshot
    }
    const currentSceneSignature = createSceneSignature(
      elementsRef.current,
      appStateRef.current,
      filesRef.current,
      mermaidSourceRef.current
    )
    const nextDirty = Boolean(selectedIdRef.current && currentSceneSignature !== savedSceneSignature)
    dirtyRef.current = nextDirty
    setDirty(nextDirty)
    scheduleAssistantSelectionContextSync()
    if (nextDirty) {
      publishSceneToCollaboration()
      scheduleAutoSave()
    } else {
      cancelAutoSave()
    }
  }

  function rememberDraftRecovery(snapshot: DraftRecoverySnapshot) {
    const snapshots = draftRecoverySnapshotsRef.current
    if (snapshots[snapshots.length - 1]?.signature === snapshot.signature) return
    draftRecoverySnapshotsRef.current = [...snapshots, cloneDraftRecoverySnapshot(snapshot)]
      .slice(-MAX_DRAFT_RECOVERY_SNAPSHOTS)
    setDraftRecoveryCount(draftRecoverySnapshotsRef.current.length)
  }

  function clearDraftRecovery() {
    draftRecoverySnapshotsRef.current = []
    lastSavedSnapshotRef.current = null
    setDraftRecoveryCount(0)
  }

  async function recoverPreviousDraft() {
    const snapshot = draftRecoverySnapshotsRef.current.pop()
    setDraftRecoveryCount(draftRecoverySnapshotsRef.current.length)
    if (!snapshot || snapshot.drawingId !== selectedIdRef.current) {
      notify('info', t('noRecoveryDraft'))
      return
    }
    cancelAutoSave()
    const applied = await applySceneImmediately(snapshot, {
      clearBeforeApply: true,
      markSaved: false,
      preloadFiles: true
    })
    if (applied) {
      notify('success', t('draftRecovered'))
    }
  }

  function updateDirtyState(mermaidOverride = mermaidSourceRef.current) {
    if (!selectedIdRef.current) {
      dirtyRef.current = false
      setDirty(false)
      scheduleAssistantSelectionContextSync()
      cancelAutoSave()
      return
    }
    const currentSceneSignature = createSceneSignature(
      elementsRef.current,
      appStateRef.current,
      filesRef.current,
      mermaidOverride
    )
    const nextDirty = currentSceneSignature !== savedSceneSignatureRef.current
    dirtyRef.current = nextDirty
    setDirty(nextDirty)
    scheduleAssistantSelectionContextSync()
    if (nextDirty) {
      scheduleAutoSave()
    } else {
      cancelAutoSave()
    }
  }

  function scheduleAutoSave() {
    if (!selectedIdRef.current || !dirtyRef.current || collaborationClientRef.current) {
      return
    }
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current)
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null
      void flushAutoSave()
    }, AUTO_SAVE_DELAY_MS)
  }

  function cancelAutoSave() {
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    autoSaveRequestedRef.current = false
  }

  async function flushAutoSave() {
    if (!selectedIdRef.current || !dirtyRef.current) {
      return
    }
    if (autoSaveInFlightRef.current) {
      autoSaveRequestedRef.current = true
      return
    }
    autoSaveInFlightRef.current = true
    autoSaveRequestedRef.current = false
    try {
      await saveCurrentScene('save_current_scene', {
        force: true,
        silent: true,
        background: true,
        reloadAfterSave: false
      })
    } finally {
      autoSaveInFlightRef.current = false
      if ((autoSaveRequestedRef.current || dirtyRef.current) && selectedIdRef.current) {
        scheduleAutoSave()
      }
    }
  }

  function canReplaceCurrentDirtyScene() {
    if (!dirtyRef.current) {
      return true
    }
    return isBlankPersistedVersion(detailRef.current?.currentVersion) && isBlankSceneData(
      elementsRef.current,
      filesRef.current,
      mermaidSourceRef.current
    )
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

  function openShareDialog() {
    const activeShare = normalizeArtifactShare(detailRef.current?.artifactShare)
    if (isArtifactAccessSelection(activeShare?.accessMode)) setShareAccessMode(activeShare.accessMode)
    if (activeShare?.versionMode === 'latest' || activeShare?.versionMode === 'version') {
      setShareVersionMode(activeShare.versionMode)
    }
    setShareDialogOpen(true)
  }

  async function publishArtifact(accessMode: ArtifactAccessSelection, versionMode: ArtifactVersionSelection) {
    const drawingId = selectedIdRef.current
    if (!drawingId) return null
    if (accessMode === 'public_link' && !(await requestConfirmation({
      title: t('confirmPublicShareTitle'),
      description: t('confirmPublicShare'),
      confirmLabel: t('confirmAction')
    }))) return null
    setBusy(true)
    try {
      const collaborationClient = collaborationClientRef.current
      const collaborationSocket = collaborationSocketRef.current
      const syncDecision = decideArtifactPublishSync({
        dirty: dirtyRef.current,
        hasCollaborationClient: Boolean(collaborationClient),
        collaborationConnected: Boolean(collaborationSocket?.connected)
      })
      if (!syncDecision.allowed) throw new Error(t('shareSyncRequired'))
      if (syncDecision.shouldSynchronize && collaborationClient && collaborationSocket) {
        publishSceneToCollaboration()
        const synchronized = await synchronizeCollaboration(collaborationClient, collaborationSocket)
        if (dirtyRef.current && !synchronized) throw new Error(t('shareSyncTimeout'))
      }
      const response = await executeAction('publish_artifact', drawingId, {
        drawingId,
        versionMode,
        accessMode,
        userConfirmedPublicLink: accessMode === 'public_link'
      }, { drawingId })
      const actionResult = getResponsePayload(response)
      const share = normalizeArtifactShare(actionResult)
      if (!share?.shareUrl) throw new Error(t('shareLinkMissing'))
      if (detailRef.current) {
        setCurrentDetail({
          ...detailRef.current,
          item: { ...detailRef.current.item, ...(share.revision !== undefined ? { revision: share.revision } : {}) },
          artifactShare: share
        })
      }
      notify('success', t('artifactShared'))
      return share
    } catch (error) {
      notify('error', getErrorMessage(error))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function copyArtifactShareLink() {
    const shareUrl = normalizeArtifactShare(detailRef.current?.artifactShare)?.shareUrl
    if (!shareUrl) return
    try {
      await copyArtifactShareText(shareUrl, {
        writeClipboard: navigator.clipboard?.writeText
          ? (value) => navigator.clipboard.writeText(value)
          : undefined,
        fallbackCopy: copyTextWithTextarea
      })
      notify('success', t('shareLinkCopied'))
    } catch (error) {
      shareLinkInputRef.current?.focus()
      shareLinkInputRef.current?.select()
      notify('warning', t('shareManualCopy'))
    }
  }

  async function createOrCopyArtifactShare() {
    const activeShare = normalizeArtifactShare(detailRef.current?.artifactShare)
    if (isArtifactShareSelectionCurrent(activeShare, {
      accessMode: shareAccessMode,
      versionMode: shareVersionMode,
      revision: detailRef.current?.item?.revision
    })) {
      await copyArtifactShareLink()
      return
    }
    await publishArtifact(shareAccessMode, shareVersionMode)
  }

  async function revokeArtifactShare() {
    const drawingId = selectedIdRef.current
    if (!drawingId || !(await requestConfirmation({
      title: t('confirmRevokeShareTitle'),
      description: t('confirmRevokeShare'),
      confirmLabel: t('revokeShare'),
      destructive: true
    }))) return
    setBusy(true)
    try {
      await executeAction('revoke_artifact_share', drawingId, { drawingId })
      if (detailRef.current) setCurrentDetail({ ...detailRef.current, artifactShare: null })
      notify('success', t('shareRevoked'))
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const currentVersion = detail?.currentVersion || null
  const versionCount = detail?.versions?.length || 0
  const drawingStatus = (detail?.item?.status || 'draft') as StatusFilter
  const diagramQuality = detail?.diagramQuality ?? null
  const activeArtifactShare = normalizeArtifactShare(detail?.artifactShare)
  const shareSelectionMatches = isArtifactShareSelectionCurrent(activeArtifactShare, {
    accessMode: shareAccessMode,
    versionMode: shareVersionMode,
    revision: detail?.item?.revision
  })
  const selectedTemplate = diagramTemplates.find((item) => item.key === selectedTemplateKey) ?? null
  const templateCategories = Array.from(new Set(diagramTemplates.map((item) => item.category))).sort()
  const templateTags = Array.from(new Set(diagramTemplates.flatMap((item) => item.tags || []))).sort()
  const filteredTemplates = diagramTemplates.filter((item) => {
    const searchValue = templateSearch.trim().toLowerCase()
    return (templateCategory === 'all' || item.category === templateCategory)
      && (templateTag === 'all' || item.tags?.includes(templateTag))
      && (!searchValue || [item.key, item.category, ...(item.tags || []), ...Object.values(item.title || {})]
        .some((value) => String(value).toLowerCase().includes(searchValue)))
  })
  const canSaveScene = Boolean(selectedId && dirty && !busy)
  const saveButtonTitle = !selectedId ? t('noDrawing') : dirty ? t('saveChanges') : t('saveNoChanges')
  const initialData = {
    ...restorePersistedScene(currentVersion, excalidrawTheme)
  }
  const shellClassName = `exw-shell ${leftPanelCollapsed ? 'left-collapsed' : ''} ${rightPanelCollapsed ? 'right-collapsed' : ''}`
  const deleteDialogTitle =
    deleteTarget?.type === 'version'
      ? t('deleteVersionTitle')
      : t('deleteDrawingTitle')
  const deleteDialogDescription =
    deleteTarget?.type === 'version'
      ? `${t('deleteVersionDescription')}${deleteTarget.versionNumber ? ` v${deleteTarget.versionNumber}` : ''}`
      : `${t('deleteDrawingDescription')}${deleteTarget?.title ? ` ${deleteTarget.title}` : ''}`

  return (
    <div className={shellClassName}>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open: boolean) => {
        if (!open && !busy) {
          setDeleteTarget(null)
        }
      }}>
        <AlertDialogContent className="exw-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{deleteDialogDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} onClick={() => setDeleteTarget(null)}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                event.preventDefault()
                void confirmDeleteTarget()
              }}
            >
              <Trash2 className="exw-button-icon" aria-hidden="true" />
              {t('confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(confirmationRequest)} onOpenChange={(open: boolean) => {
        if (!open) settleConfirmation(false)
      }}>
        <AlertDialogContent className="exw-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmationRequest?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmationRequest?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} onClick={() => settleConfirmation(false)}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={confirmationRequest?.destructive ? 'destructive' : 'default'}
              disabled={busy}
              onClick={() => settleConfirmation(true)}
            >
              {confirmationRequest?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={shareDialogOpen} onOpenChange={(open: boolean) => {
        if (!busy) setShareDialogOpen(open)
      }}>
        <DialogContent className="exw-share-dialog">
          <DialogHeader className="exw-share-header">
            <DialogTitle>{t('shareDrawing')}</DialogTitle>
            <DialogDescription>{t('shareDescription')}</DialogDescription>
          </DialogHeader>

          <div className="exw-share-version-section">
            <div className="exw-share-setting-row">
              <div className="exw-share-setting-copy">
                <strong>{t('alwaysShareLatest')}</strong>
                <span>{t('alwaysShareLatestDescription')}</span>
              </div>
              <Switch
                checked={shareVersionMode === 'latest'}
                aria-label={t('alwaysShareLatest')}
                onCheckedChange={(checked: boolean) => setShareVersionMode(checked ? 'latest' : 'version')}
              />
            </div>
            <div className="exw-share-version-row">
              <span>{shareVersionMode === 'latest' ? t('sharingLatestScene') : t('sharingCurrentVersion')}</span>
              <Badge variant="secondary">v{detail?.item?.currentVersionNumber ?? currentVersion?.versionNumber ?? 0}</Badge>
            </div>
          </div>

          <div className="exw-share-access-row">
            <Select
              value={shareAccessMode}
              onValueChange={(value: string) => {
                if (isArtifactAccessSelection(value)) setShareAccessMode(value)
              }}
            >
              <SelectTrigger className="exw-share-access-select" aria-label={t('shareAccess')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public_link">{t('sharePublicLink')}</SelectItem>
                <SelectItem value="organization_all">{t('shareOrganization')}</SelectItem>
                <SelectItem value="workspace_all">{t('shareWorkspace')}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              className="exw-share-primary-action"
              disabled={!selectedId || busy}
              onClick={() => void createOrCopyArtifactShare()}
            >
              {shareSelectionMatches ? <Copy className="exw-button-icon" aria-hidden="true" /> : <Send className="exw-button-icon" aria-hidden="true" />}
              {shareSelectionMatches ? t('copyShareLink') : activeArtifactShare?.artifactLinkId ? t('updateShareLink') : t('createShareLink')}
            </Button>
          </div>

          <div className="exw-share-link-status">
            <span>{activeArtifactShare?.shareUrl ? t('shareLinkReady') : t('shareLinkNotCreated')}</span>
            {activeArtifactShare?.artifactLinkId ? (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void revokeArtifactShare()}>
                <Archive className="exw-button-icon" aria-hidden="true" />
                {t('revokeShare')}
              </Button>
            ) : null}
          </div>

          {activeArtifactShare?.shareUrl ? (
            <div className="exw-share-link-field">
              <Input
                ref={shareLinkInputRef}
                readOnly
                value={activeArtifactShare.shareUrl}
                aria-label={t('shareLinkReady')}
                onFocus={(event: React.FocusEvent<HTMLInputElement>) => event.currentTarget.select()}
              />
            </div>
          ) : null}

          <div className="exw-share-export-section">
            <div className="exw-share-export-heading">
              <strong>{t('exportDrawing')}</strong>
              <span>{t('exportDrawingDescription')}</span>
            </div>
            <div className="exw-share-export-actions">
              <Button type="button" variant="outline" disabled={!selectedId || busy} onClick={exportJson}>
                <FileJson className="exw-button-icon" aria-hidden="true" />
                {t('exportJson')}
              </Button>
              <Button type="button" variant="outline" disabled={!selectedId || busy} onClick={exportPng}>
                <ImageIcon className="exw-button-icon" aria-hidden="true" />
                {t('exportPng')}
              </Button>
              <Button type="button" variant="outline" disabled={!selectedId || busy} onClick={exportSvgFile}>
                <ImageIcon className="exw-button-icon" aria-hidden="true" />
                {t('exportSvg')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
                    <div className="exw-list-row">
                      <SidebarMenuButton className="exw-list-select" type="button" isActive={drawing.id === selectedId} onClick={() => selectDrawing(drawing.id)}>
                        <span className="exw-item-title">{drawing.title || t('untitled')}</span>
                        <span className="exw-item-meta">
                          v{drawing.currentVersionNumber || 0} · {t((drawing.status || 'draft') as TranslationKey)}
                        </span>
                      </SidebarMenuButton>
                      <Button
                        className="exw-list-delete"
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={t('deleteDrawing')}
                        aria-label={`${t('deleteDrawing')} ${drawing.title || t('untitled')}`}
                        disabled={busy}
                        onClick={() => requestDeleteDrawing(drawing)}
                      >
                        <Trash2 className="exw-button-icon" aria-hidden="true" />
                      </Button>
                    </div>
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
            <DropdownMenu>
              <DropdownMenuTrigger
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                disabled={busy}
              >
                <Plus className="exw-button-icon" aria-hidden="true" />
                {t('newDrawing')}
                <ChevronDown className="exw-button-icon" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => void createDrawing()}>
                  <Plus className="exw-button-icon" aria-hidden="true" />
                  {t('newDrawingMenu')}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!selectedId || busy} onSelect={() => void saveNewVersion()}>
                  <Save className="exw-button-icon" aria-hidden="true" />
                  {t('newVersion')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
            <Badge
              className="exw-collaboration-status"
              variant={collaborationState === 'connected' ? 'secondary' : 'outline'}
              data-status={collaborationState === 'connecting' ? 'warning' : undefined}
              title={t(collaborationState === 'connected' ? 'collaborationConnected' : collaborationState === 'connecting' ? 'collaborationConnecting' : 'collaborationDisconnected')}
            >
              <span className="exw-presence-dot" aria-hidden="true" />
              {collaborationState === 'connected' ? collaborators.length : '—'}
            </Badge>
            {collaborators.length > 0 ? (
              <div className="exw-collaborators" aria-label={t('collaborators')}>
                {collaborators.slice(0, 4).map((item) => (
                  <span
                    key={item.presenceId}
                    className="exw-collaborator"
                    title={item.displayName}
                    style={{ '--exw-collaborator-color': item.color } as any}
                  >
                    {collaboratorInitials(item.displayName)}
                  </span>
                ))}
              </div>
            ) : null}
            <Button type="button" variant="outline" size="sm" disabled={!selectedId || busy} onClick={openShareDialog}>
              <Send className="exw-button-icon" aria-hidden="true" />
              {t('share')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!selectedId || busy || draftRecoveryCount === 0}
              title={t('recoverPreviousDraft')}
              aria-label={t('recoverPreviousDraft')}
              onClick={recoverPreviousDraft}
            >
              <RotateCcw className="exw-button-icon" aria-hidden="true" />
              {t('recoverDraft')} {draftRecoveryCount > 0 ? `(${draftRecoveryCount})` : ''}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileInputRef.current?.click()}>
              <Upload className="exw-button-icon" aria-hidden="true" />
              {t('import')}
            </Button>
            <Badge className="exw-status" variant={dirty ? 'outline' : 'secondary'} data-status={dirty ? 'warning' : undefined}>
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
            <CanvasErrorBoundary resetKey={`${selectedId || 'unselected'}:${currentVersion?.id || 'no-version'}`}>
              <Excalidraw
                key={selectedId || 'unselected'}
                initialData={initialData as any}
                theme={excalidrawTheme}
                autoFocus={false}
                isCollaborating={collaborationState !== 'disconnected'}
                excalidrawAPI={(nextApi: any) => {
                  apiRef.current = nextApi
                  setApi(nextApi)
                }}
                onChange={(elements: any[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
                  elementsRef.current = elements || []
                  appStateRef.current = appState || {}
                  filesRef.current = files || {}
                  selectedElementIdsRef.current = getSelectedElementIds(appStateRef.current, selectedElementIdsRef.current)
                  if (!themeSyncRef.current) {
                    updateDirtyState()
                    publishSceneToCollaboration()
                  }
                  scheduleAssistantSelectionContextSync()
                  publishCollaborationPresence()
                }}
                onPointerUpdate={(payload: any) => {
                  const pointer = payload?.pointer
                  const appState = appStateRef.current
                  const width = readPositiveNumber(appState.width, window.innerWidth)
                  const height = readPositiveNumber(appState.height, window.innerHeight)
                  publishCollaborationPresence(pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y)
                    ? normalizeExcalidrawPointer(pointer, appState, width, height)
                    : null)
                }}
              />
            </CanvasErrorBoundary>
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
                <Button type="button" variant="destructive" size="sm" disabled={busy || !selectedId || drawingStatus === 'archived'} onClick={archiveDrawing}>
                  <Archive className="exw-button-icon" aria-hidden="true" />
                  {t('archive')}
                </Button>
                <Button type="button" variant="destructive" size="sm" disabled={busy || !selectedId} onClick={() => requestDeleteDrawing()}>
                  <Trash2 className="exw-button-icon" aria-hidden="true" />
                  {t('delete')}
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
                        <div className="exw-version-actions">
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
                          <Button
                            className="exw-version-action"
                            type="button"
                            variant="destructive"
                            size="icon"
                            title={t('deleteVersion')}
                            aria-label={`${t('deleteVersion')} v${version.versionNumber}`}
                            disabled={busy}
                            onClick={() => requestDeleteVersion(version)}
                          >
                            <Trash2 className="exw-button-icon" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
            <ScrollArea className="exw-inspector-scroll">
              <div className="exw-inspector-stack">
                <section className="exw-section exw-template-panel">
                  <div className="exw-section-title">{t('diagramTemplates')}</div>
                  <Input value={templateSearch} placeholder={t('searchTemplates')} onChange={(event: any) => setTemplateSearch(event.target.value)} />
                  <div className="exw-template-filters">
                    <Select value={templateCategory} onValueChange={setTemplateCategory}>
                      <SelectTrigger aria-label={t('templateCategory')}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('allCategories')}</SelectItem>
                        {templateCategories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={templateTag} onValueChange={setTemplateTag}>
                      <SelectTrigger aria-label={t('templateTag')}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('allTags')}</SelectItem>
                        {templateTags.map((tag) => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="exw-template-list">
                    {filteredTemplates.map((template) => (
                      <button
                        type="button"
                        key={`${template.key}@${template.version}`}
                        className={`exw-template-card ${selectedTemplateKey === template.key ? 'is-selected' : ''}`}
                        onClick={() => {
                          setSelectedTemplateKey(template.key)
                          setTemplateTitle(String(template.defaults?.title || localizedText(template.title, context?.locale) || template.key))
                          setTemplateColorScheme(template.defaults?.colorScheme === 'dark' ? 'dark' : 'light')
                          setTemplateRendering(template.defaults?.rendering === 'sketch' ? 'sketch' : 'clean')
                        }}
                      >
                        {template.previewDataUrl ? <img className="exw-template-thumbnail" src={template.previewDataUrl} alt={localizedText(template.preview?.alt, context?.locale)} /> : null}
                        <span className="exw-template-card-title">{localizedText(template.title, context?.locale) || template.key}</span>
                        <span className="exw-template-card-meta">{template.category} · {template.tags?.slice(0, 2).join(', ')}</span>
                      </button>
                    ))}
                  </div>
                  {selectedTemplate ? (
                    <div className="exw-template-form">
                      <Input value={templateTitle} placeholder={t('templateTitle')} onChange={(event: any) => setTemplateTitle(event.target.value)} />
                      <div className="exw-template-filters">
                        <Select value={templateColorScheme} onValueChange={(value: ExcalidrawTheme) => setTemplateColorScheme(value)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent>
                        </Select>
                        <Select value={templateRendering} onValueChange={(value: 'clean' | 'sketch') => setTemplateRendering(value)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="clean">Clean</SelectItem><SelectItem value="sketch">Sketch</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="exw-inline-actions">
                        <Button type="button" size="sm" disabled={busy} onClick={() => instantiateSelectedTemplate(false)}>{t('createFromTemplate')}</Button>
                        <Button type="button" variant="outline" size="sm" disabled={busy || !selectedId} onClick={() => instantiateSelectedTemplate(true)}>{t('applyToCurrent')}</Button>
                      </div>
                      <div className="exw-muted">{t('templateReplaceNotice')}</div>
                    </div>
                  ) : null}
                </section>

                {diagramQuality ? (
                  <section className="exw-section exw-quality-panel">
                    <div className="exw-section-title">{t('diagramQuality')}</div>
                    <div className="exw-quality-grid">
                      <span>{t('irRevision')}</span><strong>r{diagramQuality.revision}</strong>
                      <span>{t('syncState')}</span><Badge variant={diagramQuality.status === 'diverged' ? 'outline' : 'secondary'} data-status={diagramQuality.status === 'diverged' ? 'warning' : undefined}>{diagramQuality.status === 'diverged' ? t('diverged') : diagramQuality.renderedExcalidrawVersionId ? t('synced') : t('pendingRender')}</Badge>
                      <span>{t('validationIssues')}</span><strong>{diagramQuality.validationReport?.issues?.length || 0}</strong>
                      <span>{t('visualReviews')}</span><strong>{diagramQuality.visualReviews?.length || 0}/3</strong>
                    </div>
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={renderCurrentDiagramIr}>{t('rerenderFromIr')}</Button>
                  </section>
                ) : null}

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

              </div>
            </ScrollArea>
          </SidebarContent>
        )}
      </Sidebar>
    </div>
  )
}

const root = ReactDOM.createRoot(document.getElementById('root'))

class CanvasErrorBoundary extends React.Component {
  state = { error: null as Error | null, resetKey: null as string | null }

  static getDerivedStateFromProps(props: any, state: { error: Error | null; resetKey: string | null }) {
    if (props.resetKey !== state.resetKey) {
      return {
        error: null,
        resetKey: props.resetKey
      }
    }
    return null
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    debug.error('[excalidraw-workbench] recovered from canvas render crash', error)
  }

  render() {
    if (this.state.error) {
      return h('div', { className: 'exw-empty' }, [
        h('strong', { key: 'title' }, '图形渲染异常。'),
        h('span', { key: 'body' }, 'Please choose another drawing or refresh.')
      ])
    }
    return (this.props as any).children
  }
}

class WorkbenchErrorBoundary extends React.Component {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    debug.error('[excalidraw-workbench] recovered from render crash', error)
  }

  render() {
    if (this.state.error) {
      return h('div', { className: 'exw-empty' }, [
        h('strong', { key: 'title' }, '图形数据异常，页面已进入保护模式。'),
        h('span', { key: 'body' }, 'Invalid drawing data was caught before the workbench could crash. Please choose another drawing or refresh.')
      ])
    }
    return (this.props as any).children
  }
}

root.render(
  <WorkbenchErrorBoundary>
    <App />
  </WorkbenchErrorBoundary>
)
