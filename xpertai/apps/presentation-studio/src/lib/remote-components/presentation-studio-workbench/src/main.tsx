import * as React from 'react'
import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Copy,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Download,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EyeOff,
  Image,
  Input,
  Maximize2,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Redo2,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Save,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Slider,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToggleGroup,
  ToggleGroupItem,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from '@xpert-ai/plugin-shadcn-ui'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import { io, type Socket } from 'socket.io-client'
import * as Y from 'yjs'
import {
  createCollaborationClient,
  createCollaborationPresenceStore,
  createSocketIoTransportAdapter,
  createYjsDocumentAdapter,
  type CollaborationClient,
  type CollaborationPresenceStore
} from '@xpert-ai/plugin-sdk'
import './styles.css'
import { debug, setDebugDefault } from './debug-logger'
import { translator } from './i18n'
import { executeAction, executeFileAction, invokeClientCommand, isObject, notify, payload, reportResize, requestData, startRemoteBridge } from './runtime'
import { unwrapRemoteResponse } from './response-data'
import { installDashiRuntimeBridge, loadNativeThemeRuntime, type LoadedNativeRuntime } from './native-runtime'
import { NativeSlideSurface } from './native-slide-surface'
import { normalizePresentationToolEvent } from './tool-event-refresh'
import type {
  AssetPreview,
  AssetSummary,
  CollabDescriptor,
  DeckDetail,
  DeckSummary,
  EditorState,
  ExportSummary,
  JsonObject,
  JsonValue,
  LayoutControl,
  NativeLayoutDefinition,
  NativeThemeRuntimePayload,
  OpenDeckPayload,
  PresenceState,
  RemoteContext,
  VersionSummary
} from './types'

type YValue = JsonValue | Y.Map<YValue> | Y.Array<YValue>
type InspectorTab = 'design' | 'versions' | 'exports' | 'assets'
type ShareAccessMode = 'public_link' | 'organization_all'
type ShareActionResult = Partial<ExportSummary> & {
  exportId?: string
  kind?: ExportSummary['kind']
  status?: string
  publicUrl?: string | null
  shareUrl?: string | null
  sharePending?: boolean
}
type SlideSnapshot = { id: string; layout: string; status: string; sourceSlideId?: string; props: JsonObject }
type DocumentSnapshot = { slides: SlideSnapshot[]; order: string[]; props: Record<string, JsonObject>; text: Record<string, string>; preview: JsonObject }
type AwarenessPatch = {
  protocolVersion?: 2
  pageId?: string | null
  pointer?: { x: number; y: number; visible: boolean } | null
  focus?: PresenceState['focus'] | null
  selection?: {
    kind: 'text'
    fieldKey: string
    anchorRelativeBase64: string
    headRelativeBase64: string
  } | null
  mode?: 'edit' | 'present'
  viewport?: { zoom: number; width: number; height: number } | null
}
type CollaboratorAvatarActor = {
  displayName: string
  color: string
  actorType?: PresenceState['actorType']
  avatarUrl?: string | null
  status?: PresenceState['status']
  toolName?: string | null
  operationLabel?: string | null
}

const LOCAL_ORIGIN = { source: 'presentation-studio-native-workbench' }
const STUDIO_ELEMENT_POSITIONS_KEY = '__studioElementPositions'
const ASSISTANT_CONTEXT_SET_COMMAND = 'assistant.context.set'
const PRESENTATION_ASSISTANT_CONTEXT_KEY = 'presentationStudio'
const NOOP_FIELDS = (_fields: Record<string, string>) => undefined
const NOOP_SELECTION = (_selection: PresenceState['selection'] | null, _focus: PresenceState['focus'] | null) => undefined
const NOOP_POINTER = (_pointer: { x: number; y: number; visible: boolean }) => undefined
const NOOP_ELEMENT_MOVE = (_key: string, _position: { x: number; y: number }) => undefined
const NOOP = () => undefined

function App() {
  const [context, setContext] = React.useState<RemoteContext>({})
  const [ready, setReady] = React.useState(false)
  const [decks, setDecks] = React.useState<DeckSummary[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<DeckDetail | null>(null)
  const [doc, setDoc] = React.useState<Y.Doc | null>(null)
  const [docRevision, setDocRevision] = React.useState(0)
  const [textRevision, setTextRevision] = React.useState(0)
  const [activeSlideId, setActiveSlideId] = React.useState<string | null>(null)
  const [runtimePayload, setRuntimePayload] = React.useState<NativeThemeRuntimePayload | null>(null)
  const [nativeRuntime, setNativeRuntime] = React.useState<LoadedNativeRuntime | null>(null)
  const [runtimeBusy, setRuntimeBusy] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [collabState, setCollabState] = React.useState<'connecting' | 'connected' | 'disconnected'>('disconnected')
  const [presences, setPresences] = React.useState<Record<string, PresenceState>>({})
  const [collaborators, setCollaborators] = React.useState<PresenceState[]>([])
  const [leftCollapsed, setLeftCollapsed] = React.useState(() => readPanelCollapsed('left', false))
  const [rightCollapsed, setRightCollapsed] = React.useState(() => globalThis.innerWidth < 960 ? true : readPanelCollapsed('right', globalThis.innerWidth < 1180))
  const [inspectorTab, setInspectorTab] = React.useState<InspectorTab>('design')
  const [showCreate, setShowCreate] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState('')
  const [newGoal, setNewGoal] = React.useState('')
  const [newTheme, setNewTheme] = React.useState('theme01')
  const [newPages, setNewPages] = React.useState(8)
  const [assetPickerOpen, setAssetPickerOpen] = React.useState(false)
  const [assetPreviews, setAssetPreviews] = React.useState<Record<string, AssetPreview>>({})
  const [presenting, setPresenting] = React.useState(false)
  const [zoom, setZoom] = React.useState(1)
  const [controlDrafts, setControlDrafts] = React.useState<Record<string, Record<string, JsonValue>>>({})
  const socketRef = React.useRef<Socket | null>(null)
  const collaborationClientRef = React.useRef<CollaborationClient | null>(null)
  const presenceStoreRef = React.useRef<CollaborationPresenceStore | null>(null)
  const docRef = React.useRef<Y.Doc | null>(null)
  const undoRef = React.useRef<Y.UndoManager | null>(null)
  const selectedRef = React.useRef<string | null>(null)
  const decksRef = React.useRef<DeckSummary[]>([])
  const detailRef = React.useRef<DeckDetail | null>(null)
  const hostEventRef = React.useRef<(event: JsonObject) => void>(() => undefined)
  const localUpdateCountRef = React.useRef(0)
  const awarenessRef = React.useRef<AwarenessPatch>({ protocolVersion: 2, mode: 'edit' })
  const requestedTextFieldsRef = React.useRef(new Set<string>())
  const downloadedExportsRef = React.useRef(new Set<string>())
  const autoDownloadExportsRef = React.useRef(new Set<string>())
  const controlTimersRef = React.useRef(new Map<string, number>())
  const autoOpenAttemptedRef = React.useRef(false)
  const pendingActiveSlideIdRef = React.useRef<string | null>(null)
  const knownServerSlideIdsRef = React.useRef(new Set<string>())
  const processedHostEventKeysRef = React.useRef<string[]>([])
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const t = React.useMemo(() => translator(context.locale), [context.locale])

  React.useEffect(() => { selectedRef.current = selectedId }, [selectedId])
  React.useEffect(() => { decksRef.current = decks }, [decks])
  React.useEffect(() => { detailRef.current = detail }, [detail])
  React.useEffect(() => persistPanelCollapsed('left', leftCollapsed), [leftCollapsed])
  React.useEffect(() => persistPanelCollapsed('right', rightCollapsed), [rightCollapsed])
  React.useEffect(reportResize, [ready, decks.length, detail, leftCollapsed, rightCollapsed, showCreate, assetPickerOpen])

  const loadDecks = React.useCallback(async () => {
    const response = await requestData({ page: 1, pageSize: 50, parameters: { table: 'decks' } })
    const value = unwrapRemoteResponse(response)
    const object = isObject(value) ? value : {}
    const table = isObject(object.table) ? object.table : undefined
    const items = Array.isArray(table?.items) ? table.items : Array.isArray(object.items) ? object.items : []
    const next = items.map(toDeckSummary).filter((item): item is DeckSummary => item !== null)
    decksRef.current = next
    setDecks(next)
    return next
  }, [])

  /** Dispose the current document session before switching Decks or unmounting the Workbench. */
  const stopCollaboration = React.useCallback(() => {
    collaborationClientRef.current?.disconnect()
    collaborationClientRef.current = null
    presenceStoreRef.current?.clear()
    presenceStoreRef.current = null
    socketRef.current = null
    undoRef.current?.destroy()
    undoRef.current = null
    docRef.current?.destroy()
    docRef.current = null
    setDoc(null)
    setPresences({})
    setCollaborators([])
    setCollabState('disconnected')
    requestedTextFieldsRef.current.clear()
    for (const timer of controlTimersRef.current.values()) window.clearTimeout(timer)
    controlTimersRef.current.clear()
  }, [])

  const updateRevisionFromAck = React.useCallback((message: JsonObject) => {
    const revision = typeof message.sequenceNumber === 'number' ? message.sequenceNumber : message.revision
    if (typeof revision !== 'number') return
    setDetail((current) => current ? { ...current, item: { ...current.item, revision } } : current)
  }, [])

  /** Bind the Deck's Y.Doc to the platform transport and hydrate state through the initial sync. */
  const startCollaboration = React.useCallback((opened: OpenDeckPayload) => {
    stopCollaboration()
    const nextDoc = new Y.Doc()
    const texts = nextDoc.getMap<string | Y.Text>('texts')
    const slides = nextDoc.getMap<Y.Map<YValue>>('slides')
    const order = nextDoc.getArray<string>('slideOrder')
    const preview = nextDoc.getMap<YValue>('preview')
    const undo = new Y.UndoManager([texts, slides, order, preview], { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 500 })
    undoRef.current = undo
    docRef.current = nextDoc
    setDoc(nextDoc)
    setDocRevision((value) => value + 1)

    const collaborationUrl = opened.collab.connectionUrl
    const socket = io(collaborationUrl, {
      autoConnect: false,
      transports: ['websocket'],
      auth: { sessionId: opened.collab.sessionId, clientKey: opened.collab.clientKey, documentId: opened.collab.documentId }
    })
    socketRef.current = socket
    setCollabState('connecting')
    awarenessRef.current = { protocolVersion: 2, mode: 'edit' }
    const presenceStore = createCollaborationPresenceStore({
      selfActor: opened.collab.actor,
      includeSelf: true,
      onChange: (view) => {
        const remote = view.remoteSessions.map(toPresenceState).filter((item): item is PresenceState => item !== null)
        const actors = view.collaborators.map(toPresenceState).filter((item): item is PresenceState => item !== null)
        setPresences(Object.fromEntries(remote.map((item) => [item.clientId, item])))
        setCollaborators(actors)
      }
    })
    presenceStoreRef.current = presenceStore

    const onUpdate = (update: Uint8Array, origin: object | string | null) => {
      setDocRevision((value) => value + 1)
      setTextRevision((value) => value + 1)
      if (origin === LOCAL_ORIGIN || origin === undo) localUpdateCountRef.current += 1
    }
    nextDoc.on('update', onUpdate)
    socket.on('connect_error', (caught: Error) => {
      setCollabState('disconnected')
      setError(`Presentation collaboration connection failed: ${caught.message}`)
      debug.warn('collaboration-connect-failed', { origin: new URL(collaborationUrl).origin, message: caught.message })
    })
    const collaborationClient = createCollaborationClient({
      session: { ...opened.collab, connectionUrl: collaborationUrl, access: opened.collab.access ?? 'write' },
      transport: createSocketIoTransportAdapter(socket),
      document: createYjsDocumentAdapter(nextDoc, {
        applyUpdate: (document, update, origin) => Y.applyUpdate(document, update, origin),
        encodeStateVector: (document) => Y.encodeStateVector(document),
        mergeUpdates: (updates) => Y.mergeUpdates(updates)
      }),
      initialPresence: awarenessRef.current,
      batchMs: 40,
      syncIntervalMs: 2_000,
      presenceHeartbeatMs: 5_000,
      onAck: (message) => updateRevisionFromAck(message),
      onPresence: (message) => presenceStore.upsert(message),
      onPresenceSnapshot: (items, metadata) => presenceStore.replace(items, metadata.selfClientId),
      onPresenceRemove: (clientId) => presenceStore.remove(clientId),
      onConnectionChange: (state) => {
        setCollabState(state)
        if (state === 'connected') setError('')
      },
      onError: (caught) => setError(caught.message)
    })
    collaborationClientRef.current = collaborationClient
    collaborationClient.connect()
    debug.info('collaboration-connecting', { origin: new URL(collaborationUrl).origin, namespace: opened.collab.namespace })
  }, [stopCollaboration, updateRevisionFromAck])

  const openDeck = React.useCallback(async (deckId: string) => {
    setBusy(true)
    setRuntimeBusy(true)
    setError('')
    try {
      const opened = actionData<OpenDeckPayload>(await executeAction('open_deck', deckId, { deckId }))
      const nextDetail: DeckDetail = { item: opened.item, versions: opened.versions ?? [], exports: opened.exports ?? [], assets: opened.assets ?? [] }
      setSelectedId(deckId)
      setDetail(nextDetail)
      knownServerSlideIdsRef.current = new Set(deckDetailSlideIds(nextDetail))
      pendingActiveSlideIdRef.current = null
      setActiveSlideId(null)
      setAssetPreviews({})
      setControlDrafts({})
      startCollaboration(opened)
      const runtime = actionData<NativeThemeRuntimePayload>(await executeAction('load_theme_runtime', deckId, { deckId }))
      setRuntimePayload(runtime)
      setNativeRuntime(await loadNativeThemeRuntime(runtime))
      debug.info('deck-opened', { deckId, themePack: runtime.themePack })
    } catch (caught) {
      setError(messageOf(caught))
      notify('error', messageOf(caught))
    } finally {
      setBusy(false)
      setRuntimeBusy(false)
    }
  }, [startCollaboration])

  const refreshDetail = React.useCallback(async (deckId: string) => {
    const response = await requestData({ parameters: { table: 'deck_detail', deckId } })
    const next = deckDetailFromResponse(response)
    setDetail((current) => current && current.item.deckId === deckId ? {
      ...current,
      item: { ...current.item, ...next.item, deckSpec: current.item.deckSpec, editorState: current.item.editorState },
      versions: next.versions,
      exports: next.exports,
      assets: next.assets
    } : next)
    setDecks((current) => current.map((item) => item.deckId === deckId ? { ...item, ...next.item } : item))
    return next
  }, [])

  React.useEffect(() => {
    const cleanup = startRemoteBridge((nextContext) => {
      setContext(nextContext)
      setDebugDefault(Boolean(nextContext.debug?.enabled))
      setReady(true)
    }, (event) => hostEventRef.current(event))
    return cleanup
  }, [])

  React.useEffect(() => {
    if (!ready) return
    if (autoOpenAttemptedRef.current) {
      void loadDecks().catch((caught) => setError(messageOf(caught)))
      return
    }
    autoOpenAttemptedRef.current = true
    void loadDecks()
      .then((items) => {
        if (selectedRef.current || !items.length) return
        void openDeck(items[0].deckId)
      })
      .catch((caught) => setError(messageOf(caught)))
  }, [ready, loadDecks, openDeck])

  React.useEffect(() => () => stopCollaboration(), [stopCollaboration])

  React.useEffect(() => {
    hostEventRef.current = (event) => {
      const normalized = normalizePresentationToolEvent(event)
      if (!normalized || !rememberHostEvent(processedHostEventKeysRef.current, normalized.eventKey)) return
      void (async () => {
        const previousDeckIds = new Set(decksRef.current.map((item) => item.deckId))
        const previousSlideIds = new Set(knownServerSlideIdsRef.current)
        const items = await loadDecks()
        let targetDeckId = normalized.deckId

        if (normalized.toolName === 'presentation_create_deck') {
          targetDeckId ??= items.filter((item) => !previousDeckIds.has(item.deckId)).map((item) => item.deckId).at(-1)
          if (targetDeckId && targetDeckId !== selectedRef.current) await openDeck(targetDeckId)
          return
        }
        if (!targetDeckId) return
        if (targetDeckId !== selectedRef.current) return
        const nextDetail = await refreshDetail(targetDeckId)
        const nextSlideIds = deckDetailSlideIds(nextDetail)
        knownServerSlideIdsRef.current = new Set(nextSlideIds)
        if (normalized.toolName === 'presentation_add_slide') {
          const slideId = normalized.slideId ?? nextSlideIds.filter((item) => !previousSlideIds.has(item)).at(-1)
          if (!slideId) return
          pendingActiveSlideIdRef.current = slideId
          setActiveSlideId(slideId)
        }
      })().catch((caught) => debug.warn('host-event-refresh-failed', { message: messageOf(caught), toolName: normalized.toolName }))
    }
  }, [loadDecks, openDeck, refreshDetail])

  React.useEffect(() => {
    if (!doc) return
    return installDashiRuntimeBridge({
      getState: () => {
        const snapshot = snapshotDocument(doc)
        return { props: snapshot.props, text: snapshot.text }
      },
      peek: (key) => {
        const snapshot = snapshotDocument(doc)
        return key === 'props' ? snapshot.props : snapshot.text
      },
      setProps: (slideId, props) => replaceSlideProps(doc, slideId, props),
      setTextState: (text) => replaceTextState(doc, text)
    })
  }, [doc])

  const snapshot = React.useMemo(() => doc ? snapshotDocument(doc) : EMPTY_SNAPSHOT, [doc, docRevision])
  const visibleSlides = React.useMemo(() => snapshot.slides.filter((slide) => slide.status !== 'deleted'), [snapshot.slides])
  const activeSlide = visibleSlides.find((slide) => slide.id === activeSlideId) ?? visibleSlides[0] ?? null
  const activeIndex = activeSlide ? visibleSlides.findIndex((slide) => slide.id === activeSlide.id) : -1
  const activeLayout = activeSlide && runtimePayload ? runtimePayload.layouts[activeSlide.layout] : undefined
  const slidePropsById = React.useMemo(() => {
    const next: Record<string, JsonObject> = {}
    for (const slide of visibleSlides) {
      const drafts = controlDrafts[slide.id] ?? {}
      next[slide.id] = Object.keys(drafts).length ? { ...slide.props, ...drafts } : slide.props
    }
    return next
  }, [visibleSlides, controlDrafts])
  const activeProps = activeSlide ? slidePropsById[activeSlide.id] ?? activeSlide.props : {}
  const remotePresences = React.useMemo(() => Object.values(presences).filter((presence) => !presence.slideId || presence.slideId === activeSlide?.id), [presences, activeSlide?.id])
  const latestHtmlExport = React.useMemo(
    () => detail?.exports.find((item) => item.kind === 'html' && item.status === 'succeeded') ?? null,
    [detail?.exports]
  )

  React.useEffect(() => {
    const pending = pendingActiveSlideIdRef.current
    if (pending) {
      if (visibleSlides.some((slide) => slide.id === pending)) {
        pendingActiveSlideIdRef.current = null
        if (activeSlideId !== pending) setActiveSlideId(pending)
      }
      return
    }
    if (!activeSlide && activeSlideId) setActiveSlideId(null)
    else if (activeSlide && activeSlide.id !== activeSlideId) setActiveSlideId(activeSlide.id)
  }, [activeSlide, activeSlideId, visibleSlides])

  React.useEffect(() => {
    awarenessRef.current = { ...awarenessRef.current, protocolVersion: 2, pageId: activeSlide?.id ?? null, mode: presenting ? 'present' : 'edit' }
    collaborationClientRef.current?.setPresence(awarenessRef.current)
  }, [activeSlide?.id, presenting])

  React.useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => {
      if (!detail) {
        void clearAssistantContext()
        return
      }
      const contextPayload = buildPresentationAssistantContext({
        detail,
        activeSlide,
        activeIndex,
        slideCount: visibleSlides.length,
        slideLabel: activeLayout?.label ?? null
      })
      if (!contextPayload) return
      void executeAction('set_current_context', detail.item.deckId, contextPayload.contextInput)
        .catch((caught) => debug.warn('server-context-update-failed', { message: messageOf(caught) }))
      void invokeClientCommand(ASSISTANT_CONTEXT_SET_COMMAND, contextPayload.assistantPayload)
        .catch((caught) => debug.warn('assistant-context-update-failed', { message: messageOf(caught) }))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [ready, detail, activeSlide?.id, activeSlide?.layout, activeIndex, visibleSlides.length, activeLayout?.label])

  React.useEffect(() => {
    const ids = collectAssetIds(activeProps).filter((id) => !assetPreviews[id]).slice(0, 8)
    if (!ids.length || !selectedId) return
    void loadAssetPreviewBatch(selectedId, ids).then((items) => {
      setAssetPreviews((current) => ({ ...current, ...Object.fromEntries(items.map((item) => [item.id, item])) }))
    }).catch((caught) => debug.warn('asset-preview-failed', { message: messageOf(caught), count: ids.length }))
  }, [activeProps, assetPreviews, selectedId])

  React.useEffect(() => {
    const pending = detail?.exports.filter((item) => item.status === 'queued' || item.status === 'running') ?? []
    if (!pending.length || !selectedId) return
    const timer = window.setInterval(() => void refreshDetail(selectedId), 2_000)
    return () => window.clearInterval(timer)
  }, [detail?.exports, selectedId, refreshDetail])

  React.useEffect(() => {
    for (const item of detail?.exports ?? []) {
      if (item.status === 'failed' || item.status === 'cancelled') {
        autoDownloadExportsRef.current.delete(item.exportId)
        continue
      }
      if (item.status !== 'succeeded' || !autoDownloadExportsRef.current.has(item.exportId) || downloadedExportsRef.current.has(item.exportId)) continue
      downloadedExportsRef.current.add(item.exportId)
      autoDownloadExportsRef.current.delete(item.exportId)
      void triggerExportDownload(item).then((started) => notify(started ? 'success' : 'warning', started ? t('downloadStarted') : t('downloadUnavailable')))
    }
  }, [detail?.exports, t])

  React.useEffect(() => {
    if (!presenting) return
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPresenting(false)
      if (event.key === 'ArrowRight') navigateSlide(1)
      if (event.key === 'ArrowLeft') navigateSlide(-1)
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  })

  /** Merge semantic UI location into the heartbeat payload without persisting it in the Deck. */
  const updateAwareness = React.useCallback((patch: AwarenessPatch) => {
    awarenessRef.current = { ...awarenessRef.current, ...patch, protocolVersion: 2 }
    collaborationClientRef.current?.setPresence(awarenessRef.current)
  }, [])

  const discoverTextFields = React.useCallback((fields: Record<string, string>) => {
    const currentDoc = docRef.current
    if (!currentDoc) return
    const texts = currentDoc.getMap<string | Y.Text>('texts')
    const missing = Object.entries(fields).filter(([key]) => !(texts.get(key) instanceof Y.Text) && !requestedTextFieldsRef.current.has(key))
    const keys = missing.map(([key]) => key)
    if (!keys.length) return
    keys.forEach((key) => requestedTextFieldsRef.current.add(key))
    currentDoc.transact(() => {
      for (const [key, value] of missing) {
        const text = new Y.Text()
        if (value) text.insert(0, value)
        texts.set(key, text)
      }
    }, LOCAL_ORIGIN)
  }, [])

  const setSelectionAwareness = React.useCallback((selection: PresenceState['selection'] | null, focus: PresenceState['focus'] | null) => {
    updateAwareness({
      selection: selection ? {
        kind: 'text',
        fieldKey: selection.textKey,
        anchorRelativeBase64: selection.anchorRelativeBase64,
        headRelativeBase64: selection.headRelativeBase64
      } : null,
      focus
    })
  }, [updateAwareness])

  /** Publish normalized canvas coordinates so collaborators with different zoom levels align. */
  const setPointerAwareness = React.useCallback((pointer: { x: number; y: number; visible: boolean }) => {
    updateAwareness({ pointer })
  }, [updateAwareness])

  const setControlAwareness = React.useCallback((key: string | null) => {
    updateAwareness({ selection: null, focus: key ? { kind: 'control', key } : null })
  }, [updateAwareness])

  const openAssetPicker = React.useCallback(() => setAssetPickerOpen(true), [])

  function navigateSlide(delta: number) {
    if (!visibleSlides.length) return
    const next = Math.min(visibleSlides.length - 1, Math.max(0, activeIndex + delta))
    pendingActiveSlideIdRef.current = null
    setActiveSlideId(visibleSlides[next].id)
  }

  async function createDeck() {
    if (!newTitle.trim() || !newGoal.trim()) return
    setBusy(true)
    try {
      const created = actionData<DeckSummary>(await executeAction('create_deck', null, {
        title: newTitle.trim(), goal: newGoal.trim(), themePack: newTheme, pageCount: newPages
      }))
      setShowCreate(false)
      setNewTitle('')
      setNewGoal('')
      await loadDecks()
      await openDeck(created.deckId)
    } catch (caught) { setError(messageOf(caught)) } finally { setBusy(false) }
  }

  async function saveVersion() {
    if (!detail) return
    setBusy(true)
    try {
      await synchronizeCollaboration(collaborationClientRef.current, socketRef.current)
      const revision = detailRef.current?.item.revision ?? detail.item.revision
      await executeAction('finalize_deck', detail.item.deckId, { deckId: detail.item.deckId, expectedRevision: revision })
      await refreshDetail(detail.item.deckId)
      notify('success', t('saveVersion'))
    } catch (caught) { notify('error', messageOf(caught)); setError(messageOf(caught)) } finally { setBusy(false) }
  }

  async function requestExport(kind: ExportSummary['kind']) {
    if (!detail) return
    setBusy(true)
    try {
      await synchronizeCollaboration(collaborationClientRef.current, socketRef.current)
      const revision = detailRef.current?.item.revision ?? detail.item.revision
      const queued = actionData<{ exportId: string }>(await executeAction('request_export', detail.item.deckId, { deckId: detail.item.deckId, kind, expectedRevision: revision }))
      if (queued.exportId) autoDownloadExportsRef.current.add(queued.exportId)
      setInspectorTab('exports')
      await refreshDetail(detail.item.deckId)
      notify('success', `${kind.toUpperCase()} ${t('exportQueued')}`)
    } catch (caught) { notify('error', messageOf(caught)); setError(messageOf(caught)) } finally { setBusy(false) }
  }

  async function shareExport(item: ExportSummary, options: { versionMode: 'latest' | 'version'; accessMode: ShareAccessMode }) {
    if (!detail) throw new Error(t('shareUnavailable'))
    const result = actionData<ExportSummary & { publicUrl?: string }>(await executeAction('share_export', detail.item.deckId, {
      deckId: detail.item.deckId,
      exportId: item.exportId,
      versionMode: options.versionMode,
      accessMode: options.accessMode,
      allowDownload: true
    }))
    await refreshDetail(detail.item.deckId)
    return result.publicUrl ?? result.shareUrl
  }

  async function shareCurrentDeck(options: { versionMode: 'latest' | 'version'; accessMode: ShareAccessMode }) {
    if (!detail) throw new Error(t('shareUnavailable'))
    await synchronizeCollaboration(collaborationClientRef.current, socketRef.current)
    const deckId = detail.item.deckId
    const revision = detailRef.current?.item.revision ?? detail.item.revision
    setInspectorTab('exports')
    const result = actionData<ShareActionResult>(await executeAction('share_deck_html', deckId, {
      deckId,
      expectedRevision: revision,
      versionMode: options.versionMode,
      accessMode: options.accessMode,
      allowDownload: true
    }))
    const immediateUrl = result.publicUrl ?? result.shareUrl
    if (immediateUrl) {
      await refreshDetail(deckId)
      return immediateUrl
    }

    const exportId = result.exportId
    if (!exportId) throw new Error(t('shareUnavailable'))
    notify('info', t('sharePreparingExport'))
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await delay(1500)
      const nextDetail = await refreshDetail(deckId)
      const item = nextDetail.exports.find((candidate) => candidate.exportId === exportId)
      if (!item) continue
      if (item.status === 'failed' || item.status === 'cancelled') {
        throw new Error(item.errorMessage || t('shareUnavailable'))
      }
      if (item.status === 'succeeded') {
        return shareExport(item, options)
      }
    }
    throw new Error(t('shareStillPreparing'))
  }

  async function restoreVersion(versionId: string) {
    if (!detail) return
    setBusy(true)
    try {
      await executeAction('restore_version', detail.item.deckId, { deckId: detail.item.deckId, versionId, expectedRevision: detail.item.revision })
      await openDeck(detail.item.deckId)
    } catch (caught) { notify('error', messageOf(caught)) } finally { setBusy(false) }
  }

  async function deleteVersion(versionId: string) {
    if (!detail) return
    setBusy(true)
    try {
      await executeAction('delete_version', detail.item.deckId, { deckId: detail.item.deckId, versionId })
      await refreshDetail(detail.item.deckId)
      notify('success', t('versionDeleted'))
    } catch (caught) { notify('error', messageOf(caught)) } finally { setBusy(false) }
  }

  async function cancelExport(exportId: string) {
    if (!detail) return
    await executeAction('cancel_export', detail.item.deckId, { exportId })
    await refreshDetail(detail.item.deckId)
  }

  async function deleteExport(exportId: string) {
    if (!detail) return
    setBusy(true)
    try {
      await executeAction('delete_export', detail.item.deckId, { exportId })
      await refreshDetail(detail.item.deckId)
      notify('success', t('exportDeleted'))
    } catch (caught) { notify('error', messageOf(caught)) } finally { setBusy(false) }
  }

  async function uploadAsset(file: File) {
    if (!detail) return
    setBusy(true)
    try {
      await executeFileAction('upload_asset', detail.item.deckId, { deckId: detail.item.deckId, role: 'media' }, file)
      await refreshDetail(detail.item.deckId)
      setInspectorTab('assets')
    } catch (caught) { notify('error', messageOf(caught)) } finally { setBusy(false) }
  }

  function commitProp(key: string, value: JsonValue) {
    if (!doc || !activeSlide) return
    const slideId = activeSlide.id
    doc.transact(() => {
      const slide = doc.getMap<Y.Map<YValue>>('slides').get(slideId)
      if (!slide) return
      const propsMap = ensureYMap(slide, 'props')
      propsMap.set(key, jsonToY(value))
    }, LOCAL_ORIGIN)
    setControlDrafts((current) => removeControlDraft(current, slideId, key))
  }

  function scheduleProp(key: string, value: JsonValue) {
    if (!activeSlide) return
    const slideId = activeSlide.id
    setControlDrafts((current) => ({ ...current, [slideId]: { ...(current[slideId] ?? {}), [key]: value } }))
    const timerKey = `${slideId}\0${key}`
    const existing = controlTimersRef.current.get(timerKey)
    if (existing !== undefined) window.clearTimeout(existing)
    controlTimersRef.current.set(timerKey, window.setTimeout(() => {
      controlTimersRef.current.delete(timerKey)
      commitProp(key, value)
    }, 250))
  }

  function reorderVisibleSlides(event: DragEndEvent) {
    if (!doc || !event.over || event.active.id === event.over.id) return
    const visibleIds = visibleSlides.map((slide) => slide.id)
    const from = visibleIds.indexOf(String(event.active.id))
    const to = visibleIds.indexOf(String(event.over.id))
    if (from < 0 || to < 0) return
    const reordered = arrayMove(visibleIds, from, to)
    const hidden = snapshot.order.filter((id) => !reordered.includes(id))
    doc.transact(() => {
      const order = doc.getArray<string>('slideOrder')
      order.delete(0, order.length)
      order.insert(0, [...reordered, ...hidden])
    }, LOCAL_ORIGIN)
    undoRef.current?.stopCapturing()
  }

  function updateSlideStatus(slideId: string, status: 'active' | 'skipped' | 'deleted') {
    if (!doc) return
    doc.transact(() => doc.getMap<Y.Map<YValue>>('slides').get(slideId)?.set('status', status), LOCAL_ORIGIN)
    undoRef.current?.stopCapturing()
  }

  function moveSlideElement(textKey: string, position: { x: number; y: number }) {
    if (!doc || !activeSlide) return
    doc.transact(() => {
      const slide = doc.getMap<Y.Map<YValue>>('slides').get(activeSlide.id)
      if (!slide) return
      const propsMap = ensureYMap(slide, 'props')
      const positions = ensureYMap(propsMap, STUDIO_ELEMENT_POSITIONS_KEY)
      positions.set(textKey, jsonToY({ x: Math.round(position.x), y: Math.round(position.y) }))
    }, LOCAL_ORIGIN)
  }

  function duplicateSlide(slideId: string) {
    if (!doc) return
    const source = snapshot.slides.find((slide) => slide.id === slideId)
    if (!source) return
    const copyId = crypto.randomUUID()
    doc.transact(() => {
      const copy = new Y.Map<YValue>()
      copy.set('id', copyId)
      copy.set('layout', source.layout)
      copy.set('status', 'active')
      copy.set('sourceSlideId', source.id)
      copy.set('props', jsonToY(source.props))
      doc.getMap<Y.Map<YValue>>('slides').set(copyId, copy)
      const order = doc.getArray<string>('slideOrder')
      order.insert(Math.max(0, order.toArray().indexOf(slideId)) + 1, [copyId])
    }, LOCAL_ORIGIN)
    pendingActiveSlideIdRef.current = null
    setActiveSlideId(copyId)
    undoRef.current?.stopCapturing()
  }

  async function selectAsset(asset: AssetSummary) {
    if (!activeSlide || !activeLayout) return
    const mediaControl = activeLayout.controls?.find((control) => control.type === 'images')
    const key = mediaControl?.publicKey ?? mediaControl?.key ?? 'images'
    const current = Array.isArray(activeSlide.props[key]) ? activeSlide.props[key] as JsonValue[] : []
    commitProp(key, [asset.reference, ...current.slice(1)])
    if (mediaControl?.countKey) commitProp(mediaControl.countKey, Math.max(1, current.length))
    setAssetPickerOpen(false)
  }

  async function startPresenting() {
    setPresenting(true)
    try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }) } catch { /* in-frame presentation remains active */ }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  if (!ready) return <div className="ps-loading">Presentation Studio</div>

  return <div className="ps-studio" data-theme-mode={context.theme?.mode === 'dark' ? 'dark' : 'light'}>
    <header className="ps-topbar">
      <div className="ps-topbar-leading">
        <Button variant="ghost" size="icon" title={leftCollapsed ? t('showDeckPanel') : t('hideDeckPanel')} onClick={() => setLeftCollapsed((value) => !value)}>
          {leftCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
        <strong className="ps-product-title">{t('title')}</strong>
        <Select value={selectedId ?? undefined} onValueChange={(value) => void openDeck(value)}>
          <SelectTrigger className="ps-deck-switcher"><SelectValue placeholder={t('noDeck')} /></SelectTrigger>
          <SelectContent>{decks.map((deck) => <SelectItem value={deck.deckId} key={deck.deckId}>{deck.title}</SelectItem>)}</SelectContent>
        </Select>
        <Badge variant={collabState === 'connected' || collabState === 'connecting' ? 'outline' : 'secondary'} data-status={collabState === 'connected' ? 'success' : collabState === 'connecting' ? 'warning' : undefined}>{t(collabState)}</Badge>
      </div>
      <div className="ps-topbar-actions">
        <div className="ps-avatar-stack">
          {collaborators.slice(0, 5).map((presence) => <CollaboratorAvatar actor={presence} key={presence.presenceId} t={t} />)}
        </div>
        <Button variant="ghost" size="icon" disabled={!undoRef.current?.canUndo()} onClick={() => undoRef.current?.undo()} title={t('undo')}><Undo2 /></Button>
        <Button variant="ghost" size="icon" disabled={!undoRef.current?.canRedo()} onClick={() => undoRef.current?.redo()} title={t('redo')}><Redo2 /></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" title={t('deckActions')}><Plus /><span>{t('deckActions')}</span><ChevronDown /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowCreate(true)}><Plus />{t('newDeck')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!detail || busy} onClick={() => void saveVersion()}><Save />{t('saveVersion')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" disabled={!activeSlide} onClick={() => void startPresenting()}><Play />{t('play')}</Button>
        <ExportSharePopover
          item={latestHtmlExport}
          onShare={shareExport}
          onShareDeck={shareCurrentDeck}
          t={t}
          trigger={<Button variant="outline" disabled={!detail || busy}><Copy />{t('share')}</Button>}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" disabled={!detail || busy}><Download />{t('export')}<ChevronDown /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void requestExport('html')}>{t('exportHtml')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void requestExport('pdf')}>{t('exportPdf')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void requestExport('pptx')}>{t('exportPptx')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" title={rightCollapsed ? t('showInspector') : t('hideInspector')} onClick={() => setRightCollapsed((value) => !value)}>
          {rightCollapsed ? <PanelRightOpen /> : <PanelRightClose />}
        </Button>
      </div>
    </header>

    {error ? <div className="ps-error-banner">{error}<Button variant="ghost" size="sm" onClick={() => setError('')}>×</Button></div> : null}

    <main className="ps-workspace">
      <ResizablePanelGroup orientation="horizontal">
        {!leftCollapsed ? <>
          <ResizablePanel defaultSize={18} minSize={14} maxSize={24} className="ps-panel ps-left-panel">
            <div className="ps-left-panel-shell">
              <div className="ps-panel-title"><strong>{t('slides')}</strong><span>{visibleSlides.length}</span></div>
              <ScrollArea className="ps-panel-scroll">
                {runtimeBusy ? <div className="ps-empty">{t('loadingRuntime')}</div> : null}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderVisibleSlides}>
                  <SortableContext items={visibleSlides.map((slide) => slide.id)} strategy={verticalListSortingStrategy}>
                    <div className="ps-slide-list">{visibleSlides.map((slide, index) => <SortableSlideItem
                      key={slide.id}
                      slide={slide}
                      slideProps={slidePropsById[slide.id] ?? slide.props}
                      index={index}
                      total={visibleSlides.length}
                      selected={slide.id === activeSlide?.id}
                      runtime={nativeRuntime}
                      doc={doc}
                      textRevision={textRevision}
                      assetPreviews={assetPreviews}
                      onSelect={() => { pendingActiveSlideIdRef.current = null; setActiveSlideId(slide.id) }}
                      onDuplicate={() => duplicateSlide(slide.id)}
                      onSkip={() => updateSlideStatus(slide.id, slide.status === 'skipped' ? 'active' : 'skipped')}
                      onDelete={() => updateSlideStatus(slide.id, 'deleted')}
                      labels={{ duplicate: t('duplicate'), skip: t('skip'), unskip: t('unskip'), delete: t('delete') }}
                    />)}</div>
                  </SortableContext>
                </DndContext>
              </ScrollArea>
            </div>
          </ResizablePanel>
          <ResizableHandle />
        </> : null}

        <ResizablePanel minSize={38} className="ps-center-panel">
          <div className="ps-canvas-toolbar">
            <div><span className="ps-live-dot" /> <strong>{activeSlide ? runtimePayload?.layouts[activeSlide.layout]?.label ?? activeSlide.layout : t('presentationConsole')}</strong><span className="ps-page-indicator">{activeIndex + 1}/{visibleSlides.length}</span></div>
            <div className="ps-zoom-controls">
              <Button variant="ghost" size="icon" onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}><ZoomOut /></Button>
              <span>{Math.round(zoom * 100)}%</span>
              <Button variant="ghost" size="icon" onClick={() => setZoom((value) => Math.min(2, value + 0.1))}><ZoomIn /></Button>
              <Button variant="ghost" size="icon" onClick={() => setZoom(1)}><Maximize2 /></Button>
            </div>
          </div>
          <div className="ps-stage-scroll">
            {activeSlide && nativeRuntime && doc ? <div className="ps-stage-zoom" style={{ width: `${Math.min(100, 94 * zoom)}%` }}>
              <NativeSlideSurface
                slideId={activeSlide.id}
                layout={activeSlide.layout}
                props={resolveAssetObject(activeProps, assetPreviews)}
                index={activeIndex}
                total={visibleSlides.length}
                runtime={nativeRuntime}
                doc={doc}
                localOrigin={LOCAL_ORIGIN}
                editable
                textRevision={textRevision}
                presences={remotePresences}
                onTextFieldsDiscovered={discoverTextFields}
                onSelectionChange={setSelectionAwareness}
                onPointerChange={setPointerAwareness}
                onElementMove={moveSlideElement}
                onAssetSlot={openAssetPicker}
              />
            </div> : <div className="ps-empty-state"><Image /><strong>{detail ? t('waitingForSlides') : t('noDeck')}</strong></div>}
          </div>
          <div className="ps-pager"><Button variant="ghost" size="icon" onClick={() => navigateSlide(-1)} disabled={activeIndex <= 0}><ChevronLeft /></Button><strong>{String(activeIndex + 1).padStart(2, '0')} / {String(visibleSlides.length).padStart(2, '0')}</strong><Button variant="ghost" size="icon" onClick={() => navigateSlide(1)} disabled={activeIndex >= visibleSlides.length - 1}><ChevronRight /></Button></div>
        </ResizablePanel>

        {!rightCollapsed ? <>
          <ResizableHandle />
          <ResizablePanel defaultSize={27} minSize={22} maxSize={38} className="ps-panel ps-right-panel">
            <Tabs value={inspectorTab} onValueChange={(value) => setInspectorTab(value as InspectorTab)} className="ps-panel-tabs">
              <div className="ps-inspector-title"><strong>{t('inspector')}</strong><Button variant="ghost" size="icon" onClick={() => setRightCollapsed(true)}><PanelRightClose /></Button></div>
              <TabsList className="ps-inspector-tabs"><TabsTrigger value="design">{t('design')}</TabsTrigger><TabsTrigger value="versions">{t('versions')} <span>{detail?.versions.length ?? 0}</span></TabsTrigger><TabsTrigger value="exports">{t('exports')} <span>{detail?.exports.length ?? 0}</span></TabsTrigger><TabsTrigger value="assets">{t('assets')} <span>{detail?.assets.length ?? 0}</span></TabsTrigger></TabsList>
              <TabsContent value="design" className="ps-panel-tab-content"><ScrollArea className="ps-panel-scroll"><DesignInspector layout={activeLayout} props={activeProps} onCommit={commitProp} onSchedule={scheduleProp} onFocusControl={setControlAwareness} onOpenAssets={openAssetPicker} t={t} /></ScrollArea></TabsContent>
              <TabsContent value="versions" className="ps-panel-tab-content"><ScrollArea className="ps-panel-scroll"><div className="ps-card-list">{detail?.versions.map((version) => <Card key={version.id}><CardContent><div className="ps-card-row"><strong>v{version.versionNumber}</strong><Badge variant="secondary">{version.source}</Badge></div><div className="ps-card-actions"><Button variant="outline" size="sm" onClick={() => void restoreVersion(version.id)}>{t('restore')}</Button><Button variant="destructive" size="sm" onClick={() => void deleteVersion(version.id)}><Trash2 />{t('delete')}</Button></div></CardContent></Card>)}</div></ScrollArea></TabsContent>
              <TabsContent value="exports" className="ps-panel-tab-content"><ScrollArea className="ps-panel-scroll"><div className="ps-card-list">{detail?.exports.map((item) => <ExportCard item={item} onCancel={() => void cancelExport(item.exportId)} onDelete={() => void deleteExport(item.exportId)} onDownload={() => void triggerExportDownload(item).then((started) => notify(started ? 'success' : 'warning', started ? t('downloadStarted') : t('downloadUnavailable')))} onShare={shareExport} t={t} key={item.exportId} />)}</div></ScrollArea></TabsContent>
              <TabsContent value="assets" className="ps-panel-tab-content"><ScrollArea className="ps-panel-scroll"><div className="ps-asset-toolbar"><Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload />{t('upload')}</Button></div><div className="ps-asset-grid">{detail?.assets.map((asset) => <button onClick={() => void selectAsset(asset)} key={asset.id}><Image /><span>{asset.fileName}</span></button>)}</div></ScrollArea></TabsContent>
            </Tabs>
          </ResizablePanel>
        </> : null}
      </ResizablePanelGroup>
    </main>

    <input ref={fileInputRef} className="ps-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file); event.currentTarget.value = '' }} />

    <Dialog open={showCreate} onOpenChange={setShowCreate}><DialogContent><DialogHeader><DialogTitle>{t('newDeck')}</DialogTitle><DialogDescription>{t('goal')}</DialogDescription></DialogHeader><div className="ps-dialog-form"><Input value={newTitle} placeholder={t('title')} onChange={(event) => setNewTitle(event.target.value)} /><Input value={newGoal} placeholder={t('goal')} onChange={(event) => setNewGoal(event.target.value)} /><Select value={newTheme} onValueChange={setNewTheme}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 12 }, (_, index) => `theme${String(index + 1).padStart(2, '0')}`).map((theme) => <SelectItem value={theme} key={theme}>{theme}</SelectItem>)}</SelectContent></Select><Input type="number" min={3} max={30} value={newPages} onChange={(event) => setNewPages(Number(event.target.value))} /></div><DialogFooter><Button variant="outline" onClick={() => setShowCreate(false)}>{t('cancel')}</Button><Button onClick={() => void createDeck()} disabled={busy}>{t('create')}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={assetPickerOpen} onOpenChange={setAssetPickerOpen}><DialogContent className="ps-asset-dialog"><DialogHeader><DialogTitle>{t('chooseAsset')}</DialogTitle><DialogDescription>{t('assetDialogDescription')}</DialogDescription></DialogHeader><ScrollArea className="ps-asset-dialog-scroll"><div className="ps-asset-grid ps-asset-grid-large">{detail?.assets.map((asset) => <button onClick={() => void selectAsset(asset)} key={asset.id}>{assetPreviews[asset.id]?.dataUrl ? <img src={assetPreviews[asset.id].dataUrl} alt="" /> : <Image />}<span>{asset.fileName}</span></button>)}</div></ScrollArea><DialogFooter><Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload />{t('upload')}</Button></DialogFooter></DialogContent></Dialog>

    {presenting && activeSlide && nativeRuntime && doc ? <div className="ps-present-overlay">
      <NativeSlideSurface slideId={activeSlide.id} layout={activeSlide.layout} props={resolveAssetObject(activeProps, assetPreviews)} index={activeIndex} total={visibleSlides.length} runtime={nativeRuntime} doc={doc} localOrigin={LOCAL_ORIGIN} textRevision={textRevision} presences={[]} onTextFieldsDiscovered={NOOP_FIELDS} onSelectionChange={NOOP_SELECTION} onPointerChange={NOOP_POINTER} onElementMove={NOOP_ELEMENT_MOVE} onAssetSlot={NOOP} />
      <div className="ps-present-controls"><Button variant="secondary" size="icon" onClick={() => navigateSlide(-1)}><ChevronLeft /></Button><span>{activeIndex + 1} / {visibleSlides.length}</span><Button variant="secondary" size="icon" onClick={() => navigateSlide(1)}><ChevronRight /></Button><Button variant="secondary" onClick={() => { setPresenting(false); void document.exitFullscreen?.() }}>{t('exit')}</Button></div>
    </div> : null}
  </div>
}

function SortableSlideItem(props: {
  slide: SlideSnapshot
  slideProps: JsonObject
  index: number
  total: number
  selected: boolean
  runtime: LoadedNativeRuntime | null
  doc: Y.Doc | null
  textRevision: number
  assetPreviews: Record<string, AssetPreview>
  onSelect(): void
  onDuplicate(): void
  onSkip(): void
  onDelete(): void
  labels: { duplicate: string; skip: string; unskip: string; delete: string }
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.slide.id })
  const visibilityRef = React.useRef<HTMLDivElement | null>(null)
  const visible = useNearViewport(visibilityRef)
  return <ContextMenu><ContextMenuTrigger asChild><div ref={setNodeRef} className={`ps-slide-item${props.selected ? ' is-active' : ''}${props.slide.status === 'skipped' ? ' is-skipped' : ''}${isDragging ? ' is-dragging' : ''}`} style={{ transform: CSS.Transform.toString(transform), transition }}>
    <button className="ps-slide-thumb-button" onClick={props.onSelect} {...attributes} {...listeners}>
      <div ref={visibilityRef} className="ps-slide-thumb">
        {visible && props.runtime && props.doc ? <NativeSlideSurface slideId={props.slide.id} layout={props.slide.layout} props={resolveAssetObject(props.slideProps, props.assetPreviews)} index={props.index} total={props.total} runtime={props.runtime} doc={props.doc} localOrigin={LOCAL_ORIGIN} textRevision={props.textRevision} presences={[]} onTextFieldsDiscovered={NOOP_FIELDS} onSelectionChange={NOOP_SELECTION} onPointerChange={NOOP_POINTER} onElementMove={NOOP_ELEMENT_MOVE} onAssetSlot={NOOP} /> : null}
      </div>
      <span className="ps-slide-number">{String(props.index + 1).padStart(2, '0')}</span>
    </button>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="ps-slide-more" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={props.onDuplicate}><Copy />{props.labels.duplicate}</DropdownMenuItem><DropdownMenuItem onSelect={props.onSkip}><EyeOff />{props.slide.status === 'skipped' ? props.labels.unskip : props.labels.skip}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="ps-destructive-menu-item" onSelect={props.onDelete}><Trash2 />{props.labels.delete}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  </div></ContextMenuTrigger><ContextMenuContent><ContextMenuItem onSelect={props.onDuplicate}><Copy />{props.labels.duplicate}</ContextMenuItem><ContextMenuItem onSelect={props.onSkip}><EyeOff />{props.slide.status === 'skipped' ? props.labels.unskip : props.labels.skip}</ContextMenuItem><ContextMenuSeparator /><ContextMenuItem onSelect={props.onDelete}><Trash2 />{props.labels.delete}</ContextMenuItem></ContextMenuContent></ContextMenu>
}

function DesignInspector({ layout, props, onCommit, onSchedule, onFocusControl, onOpenAssets, t }: {
  layout?: NativeLayoutDefinition
  props: JsonObject
  onCommit(key: string, value: JsonValue): void
  onSchedule(key: string, value: JsonValue): void
  onFocusControl(key: string | null): void
  onOpenAssets(): void
  t: ReturnType<typeof translator>
}) {
  if (!layout) return <div className="ps-empty">{t('selectSlideForDesign')}</div>
  return <div className="ps-control-list"><div className="ps-layout-summary"><Badge variant="secondary">{layout.dataLayout}</Badge><strong>{layout.label ?? layout.key}</strong></div><Separator />{layout.controls?.map((control, index) => <ControlEditor control={control} value={controlValue(control, props)} onCommit={onCommit} onSchedule={onSchedule} onFocusControl={onFocusControl} onOpenAssets={onOpenAssets} chooseAssetLabel={t('chooseAsset')} key={`${control.publicKey ?? control.key}-${index}`} />)}</div>
}

function ControlEditor({ control, value, onCommit, onSchedule, onFocusControl, onOpenAssets, chooseAssetLabel }: {
  control: LayoutControl
  value: JsonValue | undefined
  onCommit(key: string, value: JsonValue): void
  onSchedule(key: string, value: JsonValue): void
  onFocusControl(key: string | null): void
  onOpenAssets(): void
  chooseAssetLabel: string
}) {
  const key = control.publicKey ?? control.key
  if (!key) return null
  const label = control.label ?? key
  const type = String(control.type ?? '').toLowerCase()
  const focusControl = () => onFocusControl(key)
  if (type === 'range' || type === 'slider' || type === 'number') {
    const number = typeof value === 'number' ? value : typeof control.default === 'number' ? control.default : control.min ?? 0
    return <div className="ps-control" data-control-key={key} onFocusCapture={focusControl} onPointerDown={focusControl}><div className="ps-control-label"><span>{label}</span><strong>{number}</strong></div><Slider min={control.min ?? 0} max={control.max ?? 100} step={control.step ?? 1} value={[number]} onValueChange={(next) => { focusControl(); onSchedule(key, next[0] ?? number) }} onValueCommit={(next) => { focusControl(); onCommit(key, next[0] ?? number) }} />{control.desc ? <small>{control.desc}</small> : null}</div>
  }
  if (type === 'toggle' || type === 'boolean' || type === 'checkbox') {
    return <div className="ps-control ps-control-inline" data-control-key={key} onFocusCapture={focusControl} onPointerDown={focusControl}><div><span>{label}</span>{control.desc ? <small>{control.desc}</small> : null}</div><Switch checked={value === true} onCheckedChange={(checked) => { focusControl(); onCommit(key, checked) }} /></div>
  }
  if (type === 'images' || type === 'image' || type === 'media') {
    return <div className="ps-control" data-control-key={key} onFocusCapture={focusControl} onPointerDown={focusControl}><div className="ps-control-label"><span>{label}</span></div><Button variant="outline" onClick={() => { focusControl(); onOpenAssets() }}><Image />{chooseAssetLabel}</Button>{control.desc ? <small>{control.desc}</small> : null}</div>
  }
  const options = (control.options ?? []).map(optionValue).filter((option): option is { value: string; label: string; color?: string } => option !== null)
  if (options.length && options.length <= 6 && options.every((option) => option.color)) {
    return <div className="ps-control" data-control-key={key} onFocusCapture={focusControl} onPointerDown={focusControl}><div className="ps-control-label"><span>{label}</span></div><ToggleGroup type="single" value={String(value ?? control.default ?? '')} onValueChange={(next) => { if (next) { focusControl(); onSchedule(key, next) } }} className="ps-color-options">{options.map((option) => <ToggleGroupItem value={option.value} title={option.label} style={{ background: option.color }} key={option.value}><span className="ps-sr-only">{option.label}</span></ToggleGroupItem>)}</ToggleGroup>{control.desc ? <small>{control.desc}</small> : null}</div>
  }
  if (options.length) {
    return <div className="ps-control" data-control-key={key} onFocusCapture={focusControl} onPointerDown={focusControl}><div className="ps-control-label"><span>{label}</span></div><Select value={String(value ?? control.default ?? '')} onValueChange={(next) => { focusControl(); onCommit(key, next) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem value={option.value} key={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>{control.desc ? <small>{control.desc}</small> : null}</div>
  }
  return null
}

function ExportSharePopover({ item, trigger, onShare, onShareDeck, t }: {
  item?: ExportSummary | null
  trigger: React.ReactElement
  onShare(item: ExportSummary, options: { versionMode: 'latest' | 'version'; accessMode: ShareAccessMode }): Promise<string | undefined>
  onShareDeck?(options: { versionMode: 'latest' | 'version'; accessMode: ShareAccessMode }): Promise<string | undefined>
  t: ReturnType<typeof translator>
}) {
  const [shareLatest, setShareLatest] = React.useState(item?.artifactLinkVersionMode !== 'version')
  const [accessMode, setAccessMode] = React.useState<ShareAccessMode>(item?.artifactLinkAccessMode === 'organization_all' ? 'organization_all' : 'public_link')
  const [sharing, setSharing] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const versionMode = shareLatest ? 'latest' : 'version'
  const existingUrl = item?.shareUrl && item.artifactLinkVersionMode === versionMode && item.artifactLinkAccessMode === accessMode
    ? item.shareUrl
    : undefined

  React.useEffect(() => {
    setShareLatest(item?.artifactLinkVersionMode !== 'version')
    setAccessMode(item?.artifactLinkAccessMode === 'organization_all' ? 'organization_all' : 'public_link')
    setCopied(false)
  }, [item?.exportId, item?.artifactLinkVersionMode, item?.artifactLinkAccessMode])

  async function copyShareLink() {
    if (item && (item.kind !== 'html' || item.status !== 'succeeded')) {
      notify('warning', t('shareUnavailable'))
      return
    }
    setSharing(true)
    try {
      const url = existingUrl
        ?? (item ? await onShare(item, { versionMode, accessMode }) : await onShareDeck?.({ versionMode, accessMode }))
      if (!url) throw new Error(t('shareUnavailable'))
      await copyText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
      notify('success', t('shareLinkCopied'))
    } catch (caught) {
      notify('error', messageOf(caught))
    } finally {
      setSharing(false)
    }
  }

  return <Popover><PopoverTrigger asChild>{trigger}</PopoverTrigger><PopoverContent align="end" className="ps-share-popover">
    <div className="ps-share-title"><strong>{t('share')}</strong><Badge variant={existingUrl ? 'outline' : 'secondary'} data-status={existingUrl ? 'success' : undefined}>{existingUrl ? t('shareLinkReady') : t('shareHtml')}</Badge></div>
    <label className="ps-share-row">
      <div><span>{t('alwaysShareLatest')}</span><small>{shareLatest ? t('sharingLatestVersion') : t('sharingThisVersion')}</small></div>
      <Switch checked={shareLatest} onCheckedChange={setShareLatest} />
    </label>
    <div className="ps-share-controls">
      <Select value={accessMode} onValueChange={(value) => setAccessMode(value === 'organization_all' ? 'organization_all' : 'public_link')}>
        <SelectTrigger className="ps-share-access"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="public_link">{t('anyoneWithLink')}</SelectItem>
          <SelectItem value="organization_all">{t('everyoneInOrganization')}</SelectItem>
        </SelectContent>
      </Select>
      <Button onClick={() => void copyShareLink()} disabled={sharing}>{copied ? <Check /> : <Copy />}{copied ? t('copied') : t('copyLink')}</Button>
    </div>
    <p>{item ? t('publicLinkNotice') : t('shareWillExportHtml')}</p>
  </PopoverContent></Popover>
}

function ExportCard({ item, onCancel, onDelete, onDownload, onShare, t }: {
  item: ExportSummary
  onCancel(): void
  onDelete(): void
  onDownload(): void
  onShare(item: ExportSummary, options: { versionMode: 'latest' | 'version'; accessMode: ShareAccessMode }): Promise<string | undefined>
  t: ReturnType<typeof translator>
}) {
  const statusKey = exportStatusKey(item.status)
  return <Card><CardContent><div className="ps-card-row"><strong>{item.kind.toUpperCase()}</strong><Badge variant={item.status === 'failed' ? 'destructive' : item.status === 'succeeded' || item.status === 'running' ? 'outline' : 'secondary'} data-status={item.status === 'succeeded' ? 'success' : item.status === 'running' ? 'warning' : undefined}>{t(statusKey)}</Badge></div><Progress value={item.progress} />{item.errorMessage ? <p className="ps-export-error">{item.errorMessage}</p> : null}<div className="ps-card-actions">{item.status === 'succeeded' ? <Button variant="outline" size="sm" onClick={onDownload}><Download />{t('download')}</Button> : item.status === 'queued' || item.status === 'running' ? <Button variant="outline" size="sm" onClick={onCancel}>{t('cancel')}</Button> : null}{item.status === 'succeeded' && item.kind === 'html' ? <ExportSharePopover item={item} onShare={onShare} t={t} trigger={<Button variant="outline" size="sm"><Copy />{t('share')}</Button>} /> : null}<Button variant="destructive" size="sm" onClick={onDelete}><Trash2 />{t('delete')}</Button></div></CardContent></Card>
}

function CollaboratorAvatar({ actor, t }: { actor: CollaboratorAvatarActor; t: ReturnType<typeof translator> }) {
  const isAgent = actor.actorType === 'agent'
  const subtitle = isAgent ? `${t('agent')} · ${agentOperationText(actor, t)} · ${agentStatusText(actor.status, t)}` : null
  return <Popover><PopoverTrigger asChild><Avatar className={isAgent ? 'is-agent' : undefined} style={{ borderColor: actor.color }}>{actor.avatarUrl ? <AvatarImage src={actor.avatarUrl} alt="" /> : null}<AvatarFallback style={{ color: actor.color }}>{isAgent ? 'AI' : initials(actor.displayName)}</AvatarFallback></Avatar></PopoverTrigger><PopoverContent className="ps-collaborator-popover"><strong>{actor.displayName}</strong>{subtitle ? <small>{subtitle}</small> : null}</PopoverContent></Popover>
}

function agentStatusText(status: CollaboratorAvatarActor['status'], t: ReturnType<typeof translator>) {
  return status === 'thinking' ? t('agentThinking')
    : status === 'editing' ? t('agentEditing')
      : status === 'done' ? t('agentDone')
        : status === 'failed' ? t('agentFailed')
          : t('agentThinking')
}

function agentOperationText(actor: CollaboratorAvatarActor, t: ReturnType<typeof translator>) {
  return actor.toolName === 'presentation_create_deck' ? t('opCreateDeck')
    : actor.toolName === 'presentation_search_decks' ? t('opSearchDecks')
      : actor.toolName === 'presentation_get_deck' ? t('opGetDeck')
        : actor.toolName === 'presentation_search_layouts' ? t('opSearchLayouts')
          : actor.toolName === 'presentation_inspect_layouts' ? t('opInspectLayouts')
            : actor.toolName === 'presentation_add_slide' ? t('opAddSlide')
              : actor.toolName === 'presentation_patch_slide' ? t('opPatchSlide')
                : actor.toolName === 'presentation_reorder_slides' ? t('opReorderSlides')
                  : actor.toolName === 'presentation_add_asset' ? t('opAddAsset')
                    : actor.toolName === 'presentation_finalize_deck' ? t('opFinalizeDeck')
                      : actor.toolName === 'presentation_request_export' ? t('opRequestExport')
                        : actor.toolName === 'presentation_get_export' ? t('opGetExport')
                          : actor.toolName === 'presentation_update_status' ? t('opUpdateStatus')
                            : actor.operationLabel ?? t('agentThinking')
}

function useNearViewport(ref: React.RefObject<HTMLElement>) {
  const [visible, setVisible] = React.useState(false)
  React.useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver((entries) => setVisible(entries.some((entry) => entry.isIntersecting)), { rootMargin: '300px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return visible
}

const EMPTY_SNAPSHOT: DocumentSnapshot = { slides: [], order: [], props: {}, text: {}, preview: {} }

function snapshotDocument(doc: Y.Doc): DocumentSnapshot {
  const order = doc.getArray<string>('slideOrder').toArray()
  const slideMap = doc.getMap<Y.Map<YValue>>('slides')
  const slides = order.flatMap((id): SlideSnapshot[] => {
    const map = slideMap.get(id)
    if (!map) return []
    const layout = map.get('layout')
    const status = map.get('status')
    const sourceSlideId = map.get('sourceSlideId')
    const props = map.get('props')
    if (typeof layout !== 'string') return []
    return [{ id, layout, status: typeof status === 'string' ? status : 'active', ...(typeof sourceSlideId === 'string' ? { sourceSlideId } : {}), props: props instanceof Y.Map ? yMapToJson(props) : {} }]
  })
  const text = Object.fromEntries([...doc.getMap<string | Y.Text>('texts').entries()].map(([key, value]) => [key, value instanceof Y.Text ? value.toString() : value]))
  return { order, slides, props: Object.fromEntries(slides.map((slide) => [slide.id, slide.props])), text, preview: yMapToJson(doc.getMap<YValue>('preview')) }
}

function replaceSlideProps(doc: Y.Doc, slideId: string, props: JsonObject) {
  doc.transact(() => {
    const slide = doc.getMap<Y.Map<YValue>>('slides').get(slideId)
    if (slide) replaceYMap(ensureYMap(slide, 'props'), props)
  }, LOCAL_ORIGIN)
}

function replaceTextState(doc: Y.Doc, text: Record<string, string>) {
  doc.transact(() => {
    const map = doc.getMap<string | Y.Text>('texts')
    for (const [key, value] of Object.entries(text)) {
      const current = map.get(key)
      if (current instanceof Y.Text) { current.delete(0, current.length); current.insert(0, value) }
    }
  }, LOCAL_ORIGIN)
}

function ensureYMap(parent: Y.Map<YValue>, key: string) {
  const current = parent.get(key)
  if (current instanceof Y.Map) return current
  const map = new Y.Map<YValue>()
  parent.set(key, map)
  return map
}

function replaceYMap(map: Y.Map<YValue>, value: JsonObject) {
  for (const key of [...map.keys()]) if (!(key in value)) map.delete(key)
  for (const [key, item] of Object.entries(value)) map.set(key, jsonToY(item))
}

function jsonToY(value: JsonValue): YValue {
  if (Array.isArray(value)) { const array = new Y.Array<YValue>(); array.push(value.map(jsonToY)); return array }
  if (isPlainObject(value)) { const map = new Y.Map<YValue>(); for (const [key, item] of Object.entries(value)) map.set(key, jsonToY(item)); return map }
  return value
}

function yToJson(value: YValue | undefined): JsonValue {
  if (value instanceof Y.Map) return yMapToJson(value)
  if (value instanceof Y.Array) return value.toArray().map(yToJson)
  return value ?? null
}
function yMapToJson(map: Y.Map<YValue>): JsonObject { const output: JsonObject = {}; for (const [key, value] of map.entries()) output[key] = yToJson(value); return output }
function isPlainObject(value: JsonValue | undefined): value is JsonObject { return Boolean(value && typeof value === 'object' && !Array.isArray(value)) }

function resolveAssetReferences(value: JsonValue, previews: Record<string, AssetPreview>): JsonValue {
  if (typeof value === 'string' && value.startsWith('asset://')) return previews[value.slice(8)]?.dataUrl ?? ''
  if (Array.isArray(value)) return value.map((item) => resolveAssetReferences(item, previews))
  if (!isPlainObject(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveAssetReferences(item, previews)]))
}

function resolveAssetObject(value: JsonObject, previews: Record<string, AssetPreview>): JsonObject {
  const resolved = resolveAssetReferences(value, previews)
  return isPlainObject(resolved) ? resolved : {}
}

function collectAssetIds(value: JsonValue): string[] {
  if (typeof value === 'string') return value.startsWith('asset://') ? [value.slice(8)] : []
  if (Array.isArray(value)) return value.flatMap(collectAssetIds)
  if (!isPlainObject(value)) return []
  return Object.values(value).flatMap(collectAssetIds)
}

async function loadAssetPreviewBatch(deckId: string, assetIds: string[]) {
  const result = actionData<{ deckId: string; items: AssetPreview[] }>(await executeAction('load_asset_previews', deckId, { deckId, assetIds }))
  return Array.isArray(result.items) ? result.items : []
}

function toDeckSummary(value: JsonValue): DeckSummary | null {
  if (!isObject(value) || typeof value.deckId !== 'string' || typeof value.title !== 'string') return null
  return {
    deckId: value.deckId, title: value.title, goal: typeof value.goal === 'string' ? value.goal : '', themePack: typeof value.themePack === 'string' ? value.themePack : 'theme01', status: typeof value.status === 'string' ? value.status : 'draft', revision: typeof value.revision === 'number' ? value.revision : 0, currentVersionId: typeof value.currentVersionId === 'string' ? value.currentVersionId : undefined, currentVersionNumber: typeof value.currentVersionNumber === 'number' ? value.currentVersionNumber : 0, pageCount: typeof value.pageCount === 'number' ? value.pageCount : 0, activeSlides: typeof value.activeSlides === 'number' ? value.activeSlides : 0, checksum: typeof value.checksum === 'string' ? value.checksum : undefined
  }
}

function deckDetailFromResponse(response: JsonObject): DeckDetail {
  const value = unwrapRemoteResponse(response)
  if (!isObject(value) || !isObject(value.item)) throw new Error('Presentation detail response is invalid.')
  const item = toDeckSummary(value.item)
  if (!item) throw new Error('Presentation detail response is missing its deck item.')
  return {
    item: { ...item, ...(isObject(value.item.deckSpec) ? { deckSpec: value.item.deckSpec } : {}), ...(isObject(value.item.editorState) ? { editorState: toEditorState(value.item.editorState) } : {}) },
    versions: Array.isArray(value.versions) ? value.versions.map(toVersionSummary).filter((entry): entry is VersionSummary => entry !== null) : [],
    exports: Array.isArray(value.exports) ? value.exports.map(toExportSummary).filter((entry): entry is ExportSummary => entry !== null) : [],
    assets: Array.isArray(value.assets) ? value.assets.map(toAssetSummary).filter((entry): entry is AssetSummary => entry !== null) : []
  }
}

function toEditorState(value: JsonObject): EditorState {
  return {
    slideOrder: Array.isArray(value.slideOrder) ? value.slideOrder.filter((item): item is string => typeof item === 'string') : [],
    skippedSlides: Array.isArray(value.skippedSlides) ? value.skippedSlides.filter((item): item is string => typeof item === 'string') : [],
    deletedSlides: Array.isArray(value.deletedSlides) ? value.deletedSlides.filter((item): item is string => typeof item === 'string') : [],
    duplicatedSlides: [], text: isObject(value.text) ? stringRecord(value.text) : {}, props: isObject(value.props) ? objectRecord(value.props) : {}, preview: isObject(value.preview) ? value.preview : {}
  }
}

function toVersionSummary(value: JsonValue): VersionSummary | null { return isObject(value) && typeof value.id === 'string' && typeof value.versionNumber === 'number' ? { id: value.id, versionNumber: value.versionNumber, source: typeof value.source === 'string' ? value.source : 'unknown', checksum: typeof value.checksum === 'string' ? value.checksum : '', changeSummary: typeof value.changeSummary === 'string' ? value.changeSummary : undefined } : null }
function toExportSummary(value: JsonValue): ExportSummary | null {
  if (!isObject(value) || typeof value.exportId !== 'string' || (value.kind !== 'html' && value.kind !== 'pdf' && value.kind !== 'pptx')) return null
  return {
    exportId: value.exportId,
    kind: value.kind,
    status: typeof value.status === 'string' ? value.status : 'queued',
    progress: typeof value.progress === 'number' ? value.progress : 0,
    versionId: typeof value.versionId === 'string' || value.versionId === null ? value.versionId : undefined,
    workingRevision: typeof value.workingRevision === 'number' ? value.workingRevision : undefined,
    stage: typeof value.stage === 'string' ? value.stage : undefined,
    fileName: typeof value.fileName === 'string' ? value.fileName : undefined,
    fileUrl: typeof value.fileUrl === 'string' ? value.fileUrl : undefined,
    workspacePath: typeof value.workspacePath === 'string' ? value.workspacePath : undefined,
    errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : undefined,
    artifactId: typeof value.artifactId === 'string' ? value.artifactId : undefined,
    artifactVersionId: typeof value.artifactVersionId === 'string' ? value.artifactVersionId : undefined,
    artifactLinkId: typeof value.artifactLinkId === 'string' ? value.artifactLinkId : undefined,
    artifactLinkVersionMode: value.artifactLinkVersionMode === 'latest' || value.artifactLinkVersionMode === 'version' ? value.artifactLinkVersionMode : undefined,
    artifactLinkAccessMode: typeof value.artifactLinkAccessMode === 'string' ? value.artifactLinkAccessMode : undefined,
    shareUrl: typeof value.shareUrl === 'string' ? value.shareUrl : undefined
  }
}
function toAssetSummary(value: JsonValue): AssetSummary | null { return isObject(value) && typeof value.id === 'string' && typeof value.fileName === 'string' ? { id: value.id, role: typeof value.role === 'string' ? value.role : 'media', fileName: value.fileName, size: typeof value.size === 'number' ? value.size : 0, reference: typeof value.reference === 'string' ? value.reference : `asset://${value.id}` } : null }

function toPresenceState(value: unknown): PresenceState | null {
  if (!isObject(value) || typeof value.clientId !== 'string' || typeof value.presenceId !== 'string' || typeof value.displayName !== 'string' || typeof value.color !== 'string') return null
  const pointer = isObject(value.pointer) && typeof value.pointer.x === 'number' && typeof value.pointer.y === 'number' ? { x: value.pointer.x, y: value.pointer.y, visible: value.pointer.visible !== false } : undefined
  const focus: PresenceState['focus'] = isObject(value.focus) && (value.focus.kind === 'text' || value.focus.kind === 'control' || value.focus.kind === 'element') && typeof value.focus.key === 'string'
    ? { kind: value.focus.kind, key: value.focus.key }
    : isObject(value.focus) && value.focus.kind === 'slide'
      ? { kind: 'slide', key: typeof value.focus.key === 'string' ? value.focus.key : undefined }
      : undefined
  const selectionKey = isObject(value.selection) ? (typeof value.selection.fieldKey === 'string' ? value.selection.fieldKey : typeof value.selection.textKey === 'string' ? value.selection.textKey : undefined) : undefined
  const selection = isObject(value.selection) && selectionKey && typeof value.selection.anchorRelativeBase64 === 'string' && typeof value.selection.headRelativeBase64 === 'string' ? { textKey: selectionKey, anchorRelativeBase64: value.selection.anchorRelativeBase64, headRelativeBase64: value.selection.headRelativeBase64 } : undefined
  const status = value.status === 'thinking' || value.status === 'editing' || value.status === 'done' || value.status === 'failed' ? value.status : undefined
  return {
    clientId: value.clientId,
    presenceId: value.presenceId,
    displayName: value.displayName,
    color: value.color,
    actorType: value.actorType === 'agent' ? 'agent' : 'user',
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : undefined,
    slideId: typeof value.pageId === 'string' ? value.pageId : typeof value.slideId === 'string' ? value.slideId : undefined,
    pointer,
    focus,
    selection,
    mode: value.mode === 'present' ? 'present' : 'edit',
    status,
    toolName: typeof value.toolName === 'string' ? value.toolName : undefined,
    operationLabel: typeof value.operationLabel === 'string' ? value.operationLabel : undefined,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now()
  }
}

function actionData<T>(response: JsonObject): T {
  const result = payload<JsonObject>(response)
  if (result.success === false) throw new Error(actionResultMessage(result.message))
  return unwrapRemoteResponse(response) as T
}

function actionResultMessage(value: JsonValue | undefined) {
  if (typeof value === 'string' && value) return value
  if (isObject(value)) return typeof value.zh_Hans === 'string' ? value.zh_Hans : typeof value.en_US === 'string' ? value.en_US : 'Operation failed'
  return 'Operation failed'
}

function synchronizeCollaboration(client: CollaborationClient | null, socket: Socket | null) {
  if (!client || !socket?.connected) return Promise.resolve(false)
  client.flush()
  return new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => { socket.off('sync', complete); resolve(false) }, 3_000)
    const complete = () => { window.clearTimeout(timer); resolve(true) }
    socket.once('sync', complete)
    client.requestSync()
  })
}

function clearAssistantContext() {
  return invokeClientCommand(ASSISTANT_CONTEXT_SET_COMMAND, { key: PRESENTATION_ASSISTANT_CONTEXT_KEY, clear: true })
}

function buildPresentationAssistantContext(input: {
  detail: DeckDetail
  activeSlide: SlideSnapshot | null
  activeIndex: number
  slideCount: number
  slideLabel?: string | null
}): { contextInput: JsonObject; assistantPayload: JsonObject } | null {
  const deck = input.detail.item
  if (!deck.deckId) return null
  const slideNumber = input.activeIndex >= 0 ? input.activeIndex + 1 : null
  const contextInput: JsonObject = {
    deckId: deck.deckId,
    slideId: input.activeSlide?.id ?? null,
    deckTitle: deck.title,
    themePack: deck.themePack,
    slideLayout: input.activeSlide?.layout ?? null,
    slideLabel: input.slideLabel ?? null,
    activeIndex: input.activeIndex >= 0 ? input.activeIndex : null,
    slideCount: input.slideCount,
    revision: deck.revision,
    currentVersionNumber: deck.currentVersionNumber
  }
  const env: JsonObject = {
    presentationStudioDeckId: deck.deckId,
    presentationStudioThemePack: deck.themePack,
    presentationStudioDeckTitle: deck.title,
    presentationStudioRevision: String(deck.revision),
    presentationStudioCurrentVersionNumber: String(deck.currentVersionNumber),
    ...(input.activeSlide?.id ? { presentationStudioSlideId: input.activeSlide.id } : {}),
    ...(input.activeSlide?.layout ? { presentationStudioSlideLayout: input.activeSlide.layout } : {}),
    ...(slideNumber !== null ? { presentationStudioSlideNumber: String(slideNumber), presentationStudioSlideCount: String(input.slideCount) } : {})
  }
  return {
    contextInput,
    assistantPayload: {
      key: PRESENTATION_ASSISTANT_CONTEXT_KEY,
      env,
      context: {
        currentPresentation: {
          type: 'presentation-studio.context.v1',
          deckId: deck.deckId,
          title: deck.title,
          goal: deck.goal,
          themePack: deck.themePack,
          status: deck.status,
          revision: deck.revision,
          currentVersionId: deck.currentVersionId ?? null,
          currentVersionNumber: deck.currentVersionNumber,
          pageCount: deck.pageCount,
          activeSlides: deck.activeSlides,
          currentSlide: input.activeSlide ? {
            slideId: input.activeSlide.id,
            slideNumber,
            slideCount: input.slideCount,
            layout: input.activeSlide.layout,
            label: input.slideLabel ?? null
          } : null,
          instruction: 'When the user says current presentation, this deck, current deck, current slide, or this slide, use these Presentation Studio ids instead of creating a new deck.'
        }
      }
    }
  }
}

async function triggerExportDownload(item: ExportSummary) {
  if (!item.fileUrl) return false
  try {
    const url = new URL(item.fileUrl)
    url.searchParams.set('download', '1')
    const anchor = document.createElement('a')
    anchor.href = url.toString()
    anchor.download = item.fileName ?? `presentation.${item.kind}`
    anchor.target = '_blank'
    anchor.rel = 'noopener'
    document.body.appendChild(anchor); anchor.click(); anchor.remove()
    return true
  } catch { return false }
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function exportStatusKey(status: string): 'exportStatusQueued' | 'exportStatusRunning' | 'exportStatusSucceeded' | 'exportStatusFailed' | 'exportStatusCancelled' | 'exportStatusUnknown' {
  return status === 'queued' ? 'exportStatusQueued' : status === 'running' ? 'exportStatusRunning' : status === 'succeeded' ? 'exportStatusSucceeded' : status === 'failed' ? 'exportStatusFailed' : status === 'cancelled' ? 'exportStatusCancelled' : 'exportStatusUnknown'
}

function controlValue(control: LayoutControl, props: JsonObject) { const key = control.publicKey ?? control.key; return key ? props[key] ?? control.default : control.default }
function optionValue(value: JsonValue): { value: string; label: string; color?: string } | null {
  if (typeof value === 'string' || typeof value === 'number') return { value: String(value), label: String(value), ...(isColor(String(value)) ? { color: String(value) } : {}) }
  if (!isObject(value)) return null
  const raw = value.value ?? value.key ?? value.id
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const text = String(raw)
  return { value: text, label: typeof value.label === 'string' ? value.label : text, ...(typeof value.color === 'string' ? { color: value.color } : isColor(text) ? { color: text } : {}) }
}
function isColor(value: string) { return /^#[0-9a-f]{3,8}$/i.test(value) || /^rgba?\(/i.test(value) }
function initials(value: string) { return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'U' }
function stringRecord(value: JsonObject) { return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) }
function objectRecord(value: JsonObject) { return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, JsonObject] => isObject(entry[1]))) }
function messageOf(error: unknown) { return error instanceof Error ? error.message : String(error ?? 'Operation failed') }

function deckDetailSlideIds(value: DeckDetail | null | undefined) {
  const slides = value?.item.deckSpec?.slides
  if (!Array.isArray(slides)) return []
  return slides.flatMap((slide) => isObject(slide) && typeof slide.id === 'string' ? [slide.id] : [])
}

function rememberHostEvent(keys: string[], key?: string) {
  if (!key) return true
  if (keys.includes(key)) return false
  keys.push(key)
  if (keys.length > 200) keys.splice(0, keys.length - 200)
  return true
}

function removeControlDraft(drafts: Record<string, Record<string, JsonValue>>, slideId: string, key: string) {
  const current = drafts[slideId]
  if (!current || !(key in current)) return drafts
  const nextSlideDrafts = { ...current }
  delete nextSlideDrafts[key]
  const next = { ...drafts }
  if (Object.keys(nextSlideDrafts).length) next[slideId] = nextSlideDrafts
  else delete next[slideId]
  return next
}

function readPanelCollapsed(panel: 'left' | 'right', fallback: boolean) { try { const value = localStorage.getItem(`presentation-studio.panel.${panel}`); return value === null ? fallback : value === 'collapsed' } catch { return fallback } }
function persistPanelCollapsed(panel: 'left' | 'right', collapsed: boolean) { try { localStorage.setItem(`presentation-studio.panel.${panel}`, collapsed ? 'collapsed' : 'open') } catch { /* storage unavailable */ } }

class StudioErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null; stack: string }> {
  override state = { error: null as Error | null, stack: '' }

  static getDerivedStateFromError(error: unknown) {
    const normalized = error instanceof Error ? error : new Error(String(error))
    return { error: normalized, stack: normalized.stack ?? '' }
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    debug.error('studio-render-failed', { message: error.message })
    this.setState((current) => ({ ...current, stack: `${current.stack}\n${info.componentStack ?? ''}`.trim() }))
  }

  override render() {
    if (!this.state.error) return this.props.children
    return <main className="ps-fatal-error" role="alert">
      <strong>Presentation Studio failed to render.</strong>
      <p>{this.state.error.message}</p>
      <pre>{this.state.stack}</pre>
      <Button onClick={() => globalThis.location.reload()}>Reload</Button>
    </main>
  }
}

createRoot(document.getElementById('root') ?? document.body.appendChild(document.createElement('div'))).render(<StudioErrorBoundary><App /></StudioErrorBoundary>)
