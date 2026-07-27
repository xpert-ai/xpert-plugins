import 'tldraw/tldraw.css'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { LANGUAGES, Tldraw, createShapeId } from 'tldraw'
import type { Editor, TLFrameShape, TLShape } from 'tldraw'
import { toRichText } from '@tldraw/tlschema'
import { createTldrawOnlineFontAssetUrls } from '@xpert-ai/design-fonts'
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
  Copy,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FileJson,
  Image,
  Input,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Save,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Send,
  Separator,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Trash2,
  Upload,
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
} from '@xpert-ai/plugin-sdk/collaboration-client'
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, SidebarTitle, SidebarTrigger } from './workbench-sidebar'
import { createTranslator } from './i18n'
import { injectStyles } from './styles'
import { canvasWorkbenchDebug } from './debug-logger'
import type { CanvasDebugObject } from './debug-logger'
import {
  applyCanvasViewState,
  buildCanvasViewState,
  captureViewportSnapshotImage,
  createAutosaveSignature,
  hasPersistentCanvasViewStateChange
} from './autosave'
import type { CanvasSnapshotImagePayload, CanvasStoreEvent } from './autosave'
import {
  executeAction,
  executeFileAction,
  getErrorMessage,
  getResponsePayload,
  invokeClientCommand,
  isObject as isRemoteObject,
  notify,
  post,
  reportResize,
  requestData,
  setRuntimeText,
  startRemoteBridge
} from './runtime'
import type { RemoteBridgeContext, RemotePayloadObject, RemotePayloadValue } from './runtime'
import {
  REMOTE_TOOL_REFRESH_RETRY_DELAYS_MS,
  type RemoteSnapshotApplyResult,
  shouldRetryRemoteToolRefresh
} from './remote-refresh'
import { unwrapCanvasArtifactExport, waitForCanvasArtifactExport } from './artifact-export'
import {
  createCanvasAssistantContextCommand,
  createCanvasSelectionContext,
  createCanvasSelectionSignature
} from './selection-context'
import type { CanvasSelectionContext } from './selection-context'
import { normalizeCanvasToolEvent } from './tool-event-refresh'
import {
  LOCAL_TLDRAW_ORIGIN,
  applyTldrawChangesToYDoc,
  hasCanvasYjsContent,
  readCanvasSnapshotFromYDoc,
  type CanvasCollaborationDescriptor,
  type CanvasPresenceState
} from './collaboration'

const canvasOnlineFontAssetUrls = createTldrawOnlineFontAssetUrls()

type DocumentItem = RemotePayloadObject & {
  id: string
  title?: string
  kind?: string
  status?: string
  currentVersionId?: string | null
  currentVersionNumber?: number | null
  workingCopyRevision?: number | null
  snapshotChecksum?: string | null
  lastEditedAt?: string | null
}

type VersionItem = RemotePayloadObject & {
  id: string
  versionNumber?: number | null
  sourceType?: string
  changeSummary?: string
  snapshot?: RemotePayloadObject | null
  viewState?: RemotePayloadObject | null
  selectionSummary?: RemotePayloadObject | null
}

type LogItem = RemotePayloadObject & {
  id?: string
  action?: string
  createdAt?: string
  message?: string
  errorMessage?: string
}

type WorkingCopy = RemotePayloadObject & {
  snapshot?: RemotePayloadObject | null
  viewState?: RemotePayloadObject | null
  selectionSummary?: RemotePayloadObject | null
  autosaveUpdatedAt?: string | null
  autosaveBaseVersionId?: string | null
  workingCopyRevision?: number | null
  snapshotChecksum?: string | null
  snapshotImagePath?: string | null
}

type DetailPayload = {
  item?: DocumentItem
  currentVersion?: VersionItem | null
  workingCopy?: WorkingCopy | null
  versions?: VersionItem[]
  logs?: LogItem[]
  sceneSource?: 'autosave' | 'version'
  snapshotImagePath?: string | null
  snapshotImageUpdatedAt?: string | null
  workingCopyRevision?: number | null
  snapshotChecksum?: string | null
  artifactShare?: ArtifactShare | null
}

type CanvasWorkbenchSettings = {
  tldrawLicenseKey?: string
  artifactSharingAvailable: boolean
  artifactSharingWarning?: string
}

type ArtifactAccessSelection = 'public_link' | 'organization_all' | 'workspace_all'
type ArtifactVersionSelection = 'version' | 'latest'
type ArtifactShare = RemotePayloadObject & {
  artifactId: string
  artifactVersionId?: string | null
  artifactLinkId: string
  shareUrl: string
  publicUrl: string
  accessMode: ArtifactAccessSelection
  versionMode: ArtifactVersionSelection
  revision?: number | null
  snapshotChecksum?: string | null
}

type CanvasSnapshotFromEditor = ReturnType<Editor['store']['getStoreSnapshot']>
type CanvasViewState = ReturnType<typeof buildCanvasViewState>
type CanvasSelectionSummary = CanvasSelectionContext['currentCanvas']['selection']
type SavePayload = {
  document: DocumentItem
  snapshot: CanvasSnapshotFromEditor
  viewState: CanvasViewState
  selectionSummary: CanvasSelectionSummary
  snapshotImage: CanvasSnapshotImagePayload
  signature: string
  baseRevision: number | null
  baseSnapshotChecksum: string
}
type SyncAssistantContextOptions = {
  force?: boolean
  editorOverride?: Editor | null
  detailOverride?: DetailPayload | null
  dirtyOverride?: boolean
}
type LoadDataOptions = {
  silent?: boolean
  preserveCanvas?: boolean
  applyRemoteSnapshot?: boolean
}
type LoadDataResult = {
  requestedDocumentId: string
  selectedDocumentId: string
  loadedSignature: string
  previousSignature: string
  hasSnapshot: boolean
  sceneSource: string
  snapshotImageUpdatedAt: string
  workingCopyRevision: number | null
  snapshotChecksum: string
  remoteApplyResult: RemoteSnapshotApplyResult
}
type LoadDataFunction = (documentId?: string, options?: LoadDataOptions) => Promise<LoadDataResult | null>
type HostColorScheme = 'light' | 'dark'
type CanvasSnapshotRecord = CanvasSnapshotFromEditor['store'][keyof CanvasSnapshotFromEditor['store']]

const DEFAULT_PAGE_SIZE = 20
const AI_HOLDER_W = 512
const AI_HOLDER_H = 683
const ASPECT_PRESETS = [
  { id: '1-1', label: '1:1', w: 512, h: 512 },
  { id: '3-2', label: '3:2', w: 768, h: 512 },
  { id: '2-3', label: '2:3', w: 512, h: 768 },
  { id: '4-3', label: '4:3', w: 683, h: 512 },
  { id: '3-4', label: '3:4', w: 512, h: 683 },
  { id: '16-9', label: '16:9', w: 1024, h: 576 },
  { id: '9-16', label: '9:16', w: 512, h: 910 }
]
const AUTOSAVE_DEBOUNCE_MS = 1200
const TLDRAW_LOCALES = new Set<string>(LANGUAGES.map((language) => language.locale))
const PERSISTENT_TLDRAW_RECORD_TYPENAMES = new Set(['asset', 'binding', 'document', 'page', 'shape'])
const h: typeof React.createElement = React.createElement

function isAiImageHolderFrame(shape: TLShape): shape is TLFrameShape {
  return shape.type === 'frame' && Boolean(shape.meta?.canvasAiImageHolder || shape.meta?.cowartAiImageHolder)
}
injectStyles()

function App() {
  const [context, setContext] = React.useState<RemoteBridgeContext | null>(null)
  const [documents, setDocuments] = React.useState<DocumentItem[]>([])
  const [detail, setDetail] = React.useState<DetailPayload | null>(null)
  const [selectedId, setSelectedId] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [autosaving, setAutosaving] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [collabState, setCollabState] = React.useState<'connecting' | 'connected' | 'disconnected'>('disconnected')
  const [collaborators, setCollaborators] = React.useState<CanvasPresenceState[]>([])
  const [leftCollapsed, setLeftCollapsed] = React.useState(() => window.innerWidth < 1180)
  const [rightCollapsed, setRightCollapsed] = React.useState(() => window.innerWidth < 1180)
  const [editor, setEditor] = React.useState<Editor | null>(null)
  const [sceneKey, setSceneKey] = React.useState('empty')
  const [mountedSnapshot, setMountedSnapshot] = React.useState<CanvasSnapshotFromEditor | null>(null)
  const [settings, setSettings] = React.useState<CanvasWorkbenchSettings>({ artifactSharingAvailable: false })
  const [shareDialogOpen, setShareDialogOpen] = React.useState(false)
  const [shareAccessMode, setShareAccessMode] = React.useState<ArtifactAccessSelection>('public_link')
  const [shareVersionMode, setShareVersionMode] = React.useState<ArtifactVersionSelection>('version')
  const [publicShareConfirmationOpen, setPublicShareConfirmationOpen] = React.useState(false)
  const [revokeShareConfirmationOpen, setRevokeShareConfirmationOpen] = React.useState(false)
  const hostColorScheme = resolveHostColorScheme(context?.theme)
  const tldrawLocale = resolveTldrawLocale(context?.locale)
  const tldrawLicenseKey = normalizeOptionalString(settings.tldrawLicenseKey)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const shareLinkInputRef = React.useRef<HTMLInputElement | null>(null)
  const detailRef = React.useRef<DetailPayload | null>(null)
  const dirtyRef = React.useRef(false)
  const autosaveTimerRef = React.useRef<number | null>(null)
  const lastAutosaveSignatureRef = React.useRef('')
  const baseWorkingCopyRevisionRef = React.useRef<number | null>(null)
  const baseSnapshotChecksumRef = React.useRef('')
  const loadSequenceRef = React.useRef(0)
  const autosaveInFlightRef = React.useRef<Promise<SavePayload | null> | null>(null)
  const autosaveGenerationRef = React.useRef(0)
  const autosaveSuppressedUntilRef = React.useRef(0)
  const editorRef = React.useRef<Editor | null>(null)
  const selectedIdRef = React.useRef('')
  const loadDataRef = React.useRef<LoadDataFunction | null>(null)
  const selectionSignatureRef = React.useRef('')
  const socketRef = React.useRef<Socket | null>(null)
  const collaborationClientRef = React.useRef<CollaborationClient | null>(null)
  const presenceStoreRef = React.useRef<CollaborationPresenceStore | null>(null)
  const collaborationDocRef = React.useRef<Y.Doc | null>(null)
  const collaborationDocumentIdRef = React.useRef('')
  const collaborationHydratedRef = React.useRef(false)
  const pendingTldrawChangesRef = React.useRef(new Map<string, CanvasStoreEvent['changes'][]>())
  const t = createTranslator(context?.locale)

  const stopCollaboration = React.useCallback(() => {
    collaborationClientRef.current?.disconnect()
    collaborationClientRef.current = null
    presenceStoreRef.current?.clear()
    presenceStoreRef.current = null
    socketRef.current = null
    collaborationDocRef.current?.destroy()
    collaborationDocRef.current = null
    collaborationDocumentIdRef.current = ''
    collaborationHydratedRef.current = false
    setCollaborators([])
    setCollabState('disconnected')
  }, [])

  const applyCollaborationSnapshot = React.useCallback((doc: Y.Doc) => {
    if (!hasCanvasYjsContent(doc)) return
    const snapshot = readCanvasSnapshotFromYDoc(doc)
    const editorSnapshot = snapshot as unknown as CanvasSnapshotFromEditor
    const applied = applyRemoteSnapshotToEditor(editorRef.current, editorSnapshot)
    if (!editorRef.current) setMountedSnapshot(editorSnapshot)
    if (applied.applied) {
      autosaveSuppressedUntilRef.current = Date.now() + 1000
    }
  }, [])

  const startCollaboration = React.useCallback((collab: CanvasCollaborationDescriptor) => {
    stopCollaboration()
    const doc = new Y.Doc()
    collaborationDocRef.current = doc
    collaborationDocumentIdRef.current = collab.canvasDocumentId
    const socket = io(collab.connectionUrl, {
      autoConnect: false,
      transports: ['websocket'],
      auth: { sessionId: collab.sessionId, clientKey: collab.clientKey, documentId: collab.documentId }
    })
    socketRef.current = socket
    setCollabState('connecting')

    const presenceStore = createCollaborationPresenceStore({
      selfActor: collab.actor,
      includeSelf: true,
      onChange: (view) => setCollaborators(view.collaborators)
    })
    presenceStoreRef.current = presenceStore

    let client: CollaborationClient | null = null
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === LOCAL_TLDRAW_ORIGIN) return
      if (client && origin !== client.remoteOrigin) return
      applyCollaborationSnapshot(doc)
      if (!collaborationHydratedRef.current) {
        collaborationHydratedRef.current = true
        const pending = pendingTldrawChangesRef.current.get(collab.canvasDocumentId) ?? []
        pendingTldrawChangesRef.current.delete(collab.canvasDocumentId)
        if (pending.length) {
          globalThis.queueMicrotask(() => {
            if (collaborationDocRef.current !== doc) return
            for (const changes of pending) applyTldrawChangesToYDoc(doc, changes)
            applyCollaborationSnapshot(doc)
          })
        }
      }
      setCollabState('connected')
    }
    doc.on('update', onUpdate)
    socket.on('connect_error', (caught: Error) => {
      setCollabState('disconnected')
      notify('error', `Canvas collaboration connection failed: ${caught.message}`)
    })

    client = createCollaborationClient({
      session: collab,
      transport: createSocketIoTransportAdapter(socket),
      document: createYjsDocumentAdapter(doc, {
        applyUpdate: (document, update, origin) => Y.applyUpdate(document, update, origin),
        encodeStateVector: (document) => Y.encodeStateVector(document),
        mergeUpdates: (updates) => Y.mergeUpdates(updates)
      }),
      initialPresence: { mode: 'edit' },
      batchMs: 40,
      syncIntervalMs: 2_000,
      presenceHeartbeatMs: 5_000,
      onAck: (ack) => {
        baseWorkingCopyRevisionRef.current = ack.sequenceNumber
        setDetail((currentDetail) => currentDetail?.item
          ? { ...currentDetail, item: { ...currentDetail.item, workingCopyRevision: ack.sequenceNumber }, workingCopyRevision: ack.sequenceNumber }
          : currentDetail)
      },
      onPresence: (presence) => presenceStore.upsert(presence),
      onPresenceSnapshot: (items, metadata) => presenceStore.replace(items, metadata.selfClientId),
      onPresenceRemove: (clientId) => presenceStore.remove(clientId),
      onConnectionChange: (state) => {
        setCollabState(state === 'connected' && !collaborationHydratedRef.current ? 'connecting' : state)
      },
      onError: (caught) => notify('error', caught.message)
    })
    collaborationClientRef.current = client
    client.connect()
  }, [applyCollaborationSnapshot, stopCollaboration])

  const openCollaboration = React.useCallback(async (documentId: string) => {
    const response = await executeAction('open_document', documentId, { documentId })
    const actionPayload = asPayloadObject(getResponsePayload(response))
    const opened = asPayloadObject(actionPayload.data ?? actionPayload)
    startCollaboration(toCollaborationDescriptor(opened.collab, documentId))
  }, [startCollaboration])

  loadDataRef.current = loadData

  React.useEffect(() => {
    setRuntimeText({
      requestTimeout: t('requestTimeout'),
      remoteRequestFailed: t('remoteRequestFailed'),
      unknownError: t('unknownError')
    })
  }, [context?.locale])

  React.useEffect(() => {
    document.documentElement.dataset.theme = hostColorScheme
    document.body.dataset.theme = hostColorScheme
    if (editor) {
      editor.user.updateUserPreferences({ colorScheme: hostColorScheme, locale: tldrawLocale })
    }
  }, [editor, hostColorScheme, tldrawLocale])

  React.useEffect(() => {
    detailRef.current = detail
  }, [detail])

  React.useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  React.useEffect(() => {
    editorRef.current = editor
  }, [editor])

  React.useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  React.useEffect(() => {
    startRemoteBridge(setContext, (event) => {
      const toolEvent = normalizeCanvasToolEvent(event)
      if (!toolEvent.matched) {
        canvasWorkbenchDebug.info('toolEvent.ignored', { ...toolEvent })
        return
      }

      canvasWorkbenchDebug.info('toolEvent.normalized', { ...toolEvent })
      const targetDocumentId = normalizeDocumentId(toolEvent.documentId) || selectedIdRef.current || detailRef.current?.item?.id || ''
      canvasWorkbenchDebug.info('toolEvent.targetResolved', {
        toolName: toolEvent.toolName,
        documentIdFromEvent: toolEvent.documentId ?? '',
        selectedId: selectedIdRef.current,
        detailDocumentId: detailRef.current?.item?.id ?? '',
        targetDocumentId,
        hasLoadData: Boolean(loadDataRef.current),
        baselineSignature: shortSignature(lastAutosaveSignatureRef.current),
        baselineRevision: baseWorkingCopyRevisionRef.current,
        baselineChecksum: shortChecksum(baseSnapshotChecksumRef.current)
      })
      if (!loadDataRef.current) {
        canvasWorkbenchDebug.warn('toolEvent.loadData.missing', {
          toolName: toolEvent.toolName,
          targetDocumentId
        })
        return
      }
      void refreshAfterCanvasToolEvent(
        toolEvent.toolName,
        targetDocumentId,
        lastAutosaveSignatureRef.current,
        baseWorkingCopyRevisionRef.current,
        baseSnapshotChecksumRef.current
      ).catch((error) =>
        canvasWorkbenchDebug.error('toolEvent.loadData.unhandled', {
          toolName: toolEvent.toolName,
          targetDocumentId,
          message: getErrorMessage(error instanceof Error ? error : String(error))
        })
      )
    })
    post('ready')
    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [])

  React.useEffect(() => () => stopCollaboration(), [stopCollaboration])

  React.useEffect(() => {
    if (!context) {
      return
    }
    void loadData(normalizeDocumentId(context.initialQuery?.parameters?.documentId ?? context.initialQuery?.selectionId ?? selectedId))
  }, [context])

  React.useEffect(() => {
    if (!editor) {
      return undefined
    }

    const syncSelection = (force = false) => {
      void syncAssistantContext({ editorOverride: editor, force })
    }

    const timer = window.setInterval(syncSelection, 600)
    const unsubscribeDocument = safeCall(() =>
      editor.store.listen(
        (entry: CanvasStoreEvent) => {
          const collaborationDoc = collaborationDocRef.current
          const documentId = detailRef.current?.item?.id ?? ''
          if (
            collaborationDoc &&
            collaborationHydratedRef.current &&
            collaborationDocumentIdRef.current === documentId
          ) {
            applyTldrawChangesToYDoc(collaborationDoc, entry.changes)
          } else if (documentId) {
            const pending = pendingTldrawChangesRef.current.get(documentId) ?? []
            pending.push(entry.changes)
            pendingTldrawChangesRef.current.set(documentId, pending)
          }
          if (Date.now() < autosaveSuppressedUntilRef.current) {
            canvasWorkbenchDebug.info('autosave.suppressed_after_remote_replace', {
              scope: 'document',
              documentId: detailRef.current?.item?.id ?? '',
              generation: autosaveGenerationRef.current
            })
            syncSelection()
            return
          }
          dirtyRef.current = true
          setDirty(true)
          scheduleAutosave()
          syncSelection()
        },
        { source: 'user', scope: 'document' }
      )
    )
    const unsubscribeSession = safeCall(() =>
      editor.store.listen(
        (entry: CanvasStoreEvent) => {
          if (hasPersistentCanvasViewStateChange(entry.changes)) {
            if (Date.now() < autosaveSuppressedUntilRef.current) {
              canvasWorkbenchDebug.info('autosave.suppressed_after_remote_replace', {
                scope: 'session',
                documentId: detailRef.current?.item?.id ?? '',
                generation: autosaveGenerationRef.current
              })
              syncSelection()
              return
            }
            dirtyRef.current = true
            setDirty(true)
            scheduleAutosave()
          }
          syncSelection()
        },
        { source: 'user', scope: 'session' }
      )
    )
    syncSelection(true)

    return () => {
      window.clearInterval(timer)
      if (typeof unsubscribeDocument === 'function') {
        unsubscribeDocument()
      }
      if (typeof unsubscribeSession === 'function') {
        unsubscribeSession()
      }
    }
  }, [editor])

  async function refreshAfterCanvasToolEvent(
    toolName: string,
    targetDocumentId: string,
    baselineSignature: string,
    baselineRevision: number | null,
    baselineChecksum: string
  ) {
    const hadLocalDirty = dirtyRef.current
    if (collaborationClientRef.current && collaborationDocumentIdRef.current === targetDocumentId) {
      return loadDataRef.current?.(targetDocumentId, {
        silent: true,
        preserveCanvas: true,
        applyRemoteSnapshot: false
      }) ?? null
    }
    autosaveGenerationRef.current += 1
    cancelScheduledAutosave('tool_event')
    if (hadLocalDirty) {
      canvasWorkbenchDebug.warn('toolEvent.refresh.remote_overrides_local_dirty', {
        toolName,
        targetDocumentId,
        baselineRevision,
        baselineChecksum: shortChecksum(baselineChecksum)
      })
    }
    canvasWorkbenchDebug.info('toolEvent.refresh.start', {
      toolName,
      targetDocumentId,
      baselineSignature: shortSignature(baselineSignature),
      baselineRevision,
      baselineChecksum: shortChecksum(baselineChecksum),
      hadAutosaveInFlight: Boolean(autosaveInFlightRef.current)
    })

    let retryDelayIndex = -1
    let lastResult: LoadDataResult | null = null
    for (;;) {
      if (retryDelayIndex >= 0) {
        const delayMs = REMOTE_TOOL_REFRESH_RETRY_DELAYS_MS[retryDelayIndex]
        canvasWorkbenchDebug.info('toolEvent.refresh.retry.wait', {
          toolName,
          targetDocumentId,
          attempt: retryDelayIndex + 1,
          delayMs
        })
        await delay(delayMs)
      }

      lastResult = await loadDataRef.current?.(targetDocumentId, {
        silent: true,
        preserveCanvas: true,
        applyRemoteSnapshot: true
      }) ?? null

      const decision = shouldRetryRemoteToolRefresh({
        toolName,
        targetDocumentId,
        selectedDocumentId: lastResult?.selectedDocumentId ?? '',
        baselineSignature,
        loadedSignature: lastResult?.loadedSignature ?? '',
        baselineRevision,
        loadedRevision: lastResult?.workingCopyRevision ?? null,
        baselineChecksum,
        loadedChecksum: lastResult?.snapshotChecksum ?? '',
        hasSnapshot: Boolean(lastResult?.hasSnapshot),
        applyResult: lastResult?.remoteApplyResult ?? createRemoteSnapshotApplyResult('not_requested')
      })
      canvasWorkbenchDebug.info('toolEvent.refresh.decision', {
        toolName,
        targetDocumentId,
        retry: decision.retry,
        reason: decision.reason,
        attempt: retryDelayIndex + 1,
        selectedDocumentId: lastResult?.selectedDocumentId ?? '',
        baselineSignature: shortSignature(baselineSignature),
        loadedSignature: shortSignature(lastResult?.loadedSignature ?? ''),
        baselineRevision,
        loadedRevision: lastResult?.workingCopyRevision ?? null,
        baselineChecksum: shortChecksum(baselineChecksum),
        loadedChecksum: shortChecksum(lastResult?.snapshotChecksum ?? ''),
        applyReason: lastResult?.remoteApplyResult.reason ?? 'none'
      })

      if (!decision.retry || retryDelayIndex + 1 >= REMOTE_TOOL_REFRESH_RETRY_DELAYS_MS.length) {
        return lastResult
      }
      retryDelayIndex += 1
    }
  }

  async function syncAssistantContext(options: SyncAssistantContextOptions = {}) {
    const currentEditor = options.editorOverride ?? editorRef.current
    const currentDetail = options.detailOverride ?? detailRef.current
    const document = currentDetail?.item
    if (!document || !currentEditor) {
      return null
    }
    const pageId = safeCall(() => currentEditor.getCurrentPageId()) ?? null
    const snapshotImagePath = currentDetail.snapshotImagePath ?? currentDetail.workingCopy?.snapshotImagePath ?? ''
    const snapshotImageUpdatedAt = currentDetail.snapshotImageUpdatedAt ?? currentDetail.workingCopy?.autosaveUpdatedAt ?? ''
    const sceneSource = currentDetail.sceneSource ?? (currentDetail.workingCopy ? 'autosave' : 'version')
    const isDirty = options.dirtyOverride ?? dirtyRef.current
    const canvasContext = createCanvasSelectionContext({
      document,
      version: currentDetail.currentVersion,
      selectedShapes: safeCall(() => currentEditor.getSelectedShapes()) ?? [],
      pageId,
      dirty: isDirty,
      sceneSource,
      snapshotImagePath,
      snapshotImageUpdatedAt
    })
    publishCollaborationPresence(currentEditor, canvasContext)
    const signature = createCanvasSelectionSignature(canvasContext)
    if (!options.force && signature === selectionSignatureRef.current) {
      return canvasContext
    }
    selectionSignatureRef.current = signature
    const command = createCanvasAssistantContextCommand(canvasContext)
    try {
      await invokeClientCommand(command.commandKey, command.payload)
      canvasWorkbenchDebug.info('assistantContext.sync.success', {
        documentId: document.id,
        pageId: pageId ?? '',
        selectedShapeCount: canvasContext.currentCanvas.selection.selectedShapeCount,
        dirty: isDirty
      })
    } catch (error) {
      canvasWorkbenchDebug.warn('assistantContext.sync.failure', {
        documentId: document.id,
        pageId: pageId ?? '',
        selectedShapeCount: canvasContext.currentCanvas.selection.selectedShapeCount,
        message: getErrorMessage(error instanceof Error ? error : String(error))
      })
    }
    return canvasContext
  }

  async function loadData(documentId = selectedId, options: LoadDataOptions = {}) {
    const startedAt = Date.now()
    const sequence = ++loadSequenceRef.current
    const requestedDocumentId = normalizeDocumentId(documentId)
    const previousSignature = lastAutosaveSignatureRef.current
    const previousRevision = baseWorkingCopyRevisionRef.current
    const previousChecksum = baseSnapshotChecksumRef.current
    canvasWorkbenchDebug.info('loadData.start', {
      requestedDocumentId,
      silent: Boolean(options.silent),
      preserveCanvas: Boolean(options.preserveCanvas),
      applyRemoteSnapshot: Boolean(options.applyRemoteSnapshot),
      searchActive: Boolean(search),
      previousSignature: shortSignature(previousSignature),
      previousRevision,
      previousChecksum: shortChecksum(previousChecksum)
    })
    if (!options.silent) {
      setBusy(true)
    }
    try {
      const response = await requestData({
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        search,
        parameters: requestedDocumentId ? { documentId: requestedDocumentId } : {}
      })
      const payload = asPayloadObject(getResponsePayload(response))
      setSettings(toWorkbenchSettings(payload.settings))
      const docs = toDocumentItems(asPayloadObject(payload.documents).items ?? asPayloadObject(payload.table).items)
      setDocuments(docs)
      const nextDetail = toDetailPayload(payload.detail)
      const previousDocumentId = collaborationDocumentIdRef.current
      detailRef.current = nextDetail
      setDetail(nextDetail)
      const nextSelectedId = nextDetail?.item?.id ?? requestedDocumentId ?? docs[0]?.id ?? ''
      selectedIdRef.current = nextSelectedId
      setSelectedId(nextSelectedId)
      const loadedSnapshot = getDetailSnapshot(nextDetail)
      const loadedRevision = getDetailWorkingCopyRevision(nextDetail)
      const loadedChecksum = getDetailSnapshotChecksum(nextDetail)
      const loadedSignature = loadedSnapshot
        ? createAutosaveSignature({
            documentId: nextDetail?.item?.id ?? nextSelectedId,
            snapshot: loadedSnapshot,
            viewState: getDetailViewState(nextDetail),
            selectionSummary: getDetailSelectionSummary(nextDetail)
          })
        : ''
      lastAutosaveSignatureRef.current = loadedSignature
      baseWorkingCopyRevisionRef.current = loadedRevision
      baseSnapshotChecksumRef.current = loadedChecksum
      let remoteApplyResult = createRemoteSnapshotApplyResult('not_requested')
      if (options.applyRemoteSnapshot && options.preserveCanvas && sequence === loadSequenceRef.current) {
        remoteApplyResult = applyRemoteSnapshotToEditor(editorRef.current, loadedSnapshot)
        autosaveSuppressedUntilRef.current = Date.now() + 1000
      }
      if (!options.preserveCanvas && sequence === loadSequenceRef.current && (!options.silent || !dirtyRef.current)) {
        setMountedSnapshot(loadedSnapshot)
        setSceneKey(createSceneKey(nextSelectedId, loadedSignature, nextDetail))
      }
      if (nextSelectedId && (previousDocumentId !== nextSelectedId || !collaborationClientRef.current)) {
        await openCollaboration(nextSelectedId)
      }
      if (!options.preserveCanvas) {
        dirtyRef.current = false
        setDirty(false)
      }
      canvasWorkbenchDebug.info('loadData.success', {
        requestedDocumentId,
        nextSelectedId,
        documentCount: docs.length,
        hasDetail: Boolean(nextDetail),
        hasSnapshot: Boolean(loadedSnapshot),
        sceneSource: nextDetail?.sceneSource ?? '',
        previousSignature: shortSignature(previousSignature),
        loadedSignature: shortSignature(loadedSignature),
        previousRevision,
        loadedRevision,
        previousChecksum: shortChecksum(previousChecksum),
        loadedChecksum: shortChecksum(loadedChecksum),
        snapshotImageUpdatedAt: nextDetail?.snapshotImageUpdatedAt ?? '',
        remoteApplyResult: summarizeRemoteSnapshotApplyResult(remoteApplyResult),
        durationMs: Date.now() - startedAt
      })
      void syncAssistantContext({ detailOverride: nextDetail, dirtyOverride: dirtyRef.current, force: true })
      setTimeout(reportResize, 0)
      return {
        requestedDocumentId,
        selectedDocumentId: nextSelectedId,
        loadedSignature,
        previousSignature,
        hasSnapshot: Boolean(loadedSnapshot),
        sceneSource: nextDetail?.sceneSource ?? '',
        snapshotImageUpdatedAt: nextDetail?.snapshotImageUpdatedAt ?? '',
        workingCopyRevision: loadedRevision,
        snapshotChecksum: loadedChecksum,
        remoteApplyResult
      }
    } catch (error) {
      const message = getErrorMessage(error instanceof Error ? error : String(error))
      canvasWorkbenchDebug.error('loadData.failure', {
        requestedDocumentId,
        durationMs: Date.now() - startedAt,
        message
      })
      notify('error', message)
      return null
    } finally {
      if (!options.silent) {
        setBusy(false)
      }
    }
  }

  function publishCollaborationPresence(currentEditor: Editor, canvasContext: CanvasSelectionContext) {
    const client = collaborationClientRef.current
    if (!client) return
    const viewport = safeCall(() => currentEditor.getViewportScreenBounds())
    const zoom = safeCall(() => currentEditor.getZoomLevel()) ?? 1
    const selectedRecordIds = canvasContext.currentCanvas.selection.selectedShapeIds
    client.setPresence({
      pageId: canvasContext.currentCanvas.selection.pageId ?? null,
      focus: selectedRecordIds[0]
        ? { kind: 'element', key: selectedRecordIds[0], elementId: selectedRecordIds[0], pageId: canvasContext.currentCanvas.selection.pageId ?? null }
        : null,
      selection: selectedRecordIds.length ? { kind: 'elements', elementIds: selectedRecordIds } : null,
      viewport: viewport
        ? { zoom, width: viewport.w, height: viewport.h }
        : null,
      mode: 'edit'
    })
  }

  async function createCanvas() {
    setBusy(true)
    try {
      const response = await executeAction('create_document', null, {
        title: `${t('untitled')} ${new Date().toLocaleString()}`,
        kind: 'canvas',
        changeSummary: 'Created from Workbench'
      })
      const payload = asPayloadObject(getResponsePayload(response))
      const documentId = getActionDocumentId(payload)
      notify('success', t('created'))
      await loadData(normalizeDocumentId(documentId))
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
    } finally {
      setBusy(false)
    }
  }

  function scheduleAutosave() {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
    }
    canvasWorkbenchDebug.info('autosave.scheduled', {
      documentId: detailRef.current?.item?.id ?? '',
      delayMs: AUTOSAVE_DEBOUNCE_MS,
      generation: autosaveGenerationRef.current
    })
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null
      void performAutosave({ force: false, notifyUser: false }).catch((error) =>
        notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
      )
    }, AUTOSAVE_DEBOUNCE_MS)
  }

  function cancelScheduledAutosave(reason: string) {
    if (autosaveTimerRef.current === null) {
      return false
    }
    window.clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = null
    canvasWorkbenchDebug.info('autosave.cancelled', {
      reason,
      documentId: detailRef.current?.item?.id ?? '',
      generation: autosaveGenerationRef.current
    })
    return true
  }

  async function buildSavePayload() {
    const current = detailRef.current?.item
    const currentEditor = editorRef.current
    if (!current || !currentEditor) {
      return null
    }
    const snapshot = currentEditor.store.getStoreSnapshot()
    const viewState = buildCanvasViewState(currentEditor)
    const selectionSummary = createCanvasSelectionContext({
      document: current,
      version: detailRef.current?.currentVersion,
      selectedShapes: safeCall(() => currentEditor.getSelectedShapes()) ?? [],
      pageId: safeCall(() => currentEditor.getCurrentPageId()) ?? null,
      dirty: false
    }).currentCanvas.selection
    return {
      document: current,
      snapshot,
      viewState,
      selectionSummary,
      snapshotImage: await captureViewportSnapshotImage(currentEditor),
      signature: createAutosaveSignature({
        documentId: current.id,
        snapshot,
        viewState,
        selectionSummary
      }),
      baseRevision: baseWorkingCopyRevisionRef.current,
      baseSnapshotChecksum: baseSnapshotChecksumRef.current
    }
  }

  async function performAutosave(options: { force?: boolean; notifyUser?: boolean } = {}) {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    if (autosaveInFlightRef.current) {
      await autosaveInFlightRef.current
    }

    const generation = autosaveGenerationRef.current
    const startedAt = Date.now()
    const task = (async () => {
      const savePayload = await buildSavePayload()
      if (!savePayload) {
        canvasWorkbenchDebug.info('autosave.skipped', {
          reason: 'missing_payload',
          generation,
          durationMs: Date.now() - startedAt
        })
        return null
      }
      if (generation !== autosaveGenerationRef.current) {
        canvasWorkbenchDebug.info('autosave.skipped', {
          reason: 'stale_generation_before_request',
          documentId: savePayload.document.id,
          generation,
          currentGeneration: autosaveGenerationRef.current,
          signature: shortSignature(savePayload.signature),
          durationMs: Date.now() - startedAt
        })
        return null
      }
      if (!options.force && savePayload.signature === lastAutosaveSignatureRef.current) {
        dirtyRef.current = false
        setDirty(false)
        void syncAssistantContext({ dirtyOverride: false, force: true })
        canvasWorkbenchDebug.info('autosave.skipped', {
          reason: 'skipped_same_revision',
          documentId: savePayload.document.id,
          generation,
          baseRevision: savePayload.baseRevision,
          baseChecksum: shortChecksum(savePayload.baseSnapshotChecksum),
          signature: shortSignature(savePayload.signature),
          durationMs: Date.now() - startedAt
        })
        return savePayload
      }
      setAutosaving(true)
      canvasWorkbenchDebug.info('autosave.start', {
        documentId: savePayload.document.id,
        force: Boolean(options.force),
        notifyUser: Boolean(options.notifyUser),
        generation,
        baseRevision: savePayload.baseRevision,
        baseChecksum: shortChecksum(savePayload.baseSnapshotChecksum),
        signature: shortSignature(savePayload.signature)
      })
      let response: Awaited<ReturnType<typeof executeAction>>
      try {
        response = await executeAction('autosave_snapshot', savePayload.document.id, asRemotePayloadObject({
          documentId: savePayload.document.id,
          viewState: asRemotePayloadObject(savePayload.viewState),
          selectionSummary: asRemotePayloadObject(savePayload.selectionSummary),
          snapshotImage: asRemotePayloadObject(savePayload.snapshotImage),
          baseRevision: savePayload.baseRevision,
          baseSnapshotChecksum: savePayload.baseSnapshotChecksum,
          changeSummary: 'Workbench autosave'
        }))
      } catch (error) {
        const message = getErrorMessage(error instanceof Error ? error : String(error))
        if (isAutosaveStaleBaseMessage(message)) {
          canvasWorkbenchDebug.warn('autosave.rejected_stale_base', {
            documentId: savePayload.document.id,
            generation,
            baseRevision: savePayload.baseRevision,
            currentRevision: baseWorkingCopyRevisionRef.current,
            baseChecksum: shortChecksum(savePayload.baseSnapshotChecksum),
            currentChecksum: shortChecksum(baseSnapshotChecksumRef.current),
            message,
            durationMs: Date.now() - startedAt
          })
          autosaveGenerationRef.current += 1
          await loadDataRef.current?.(savePayload.document.id, {
            silent: true,
            preserveCanvas: true,
            applyRemoteSnapshot: true
          })
          return null
        }
        throw error
      }
      const actionPayload = asPayloadObject(getResponsePayload(response))
      const result = asPayloadObject(actionPayload.data ?? actionPayload)
      const autosaveResult = result.autosave
      if (generation !== autosaveGenerationRef.current) {
        canvasWorkbenchDebug.info('autosave.responseIgnored', {
          reason: 'response_ignored_stale_generation',
          documentId: savePayload.document.id,
          generation,
          currentGeneration: autosaveGenerationRef.current,
          signature: shortSignature(savePayload.signature),
          durationMs: Date.now() - startedAt
        })
        return null
      }
      const mergedDetail = isRemoteObject(autosaveResult) ? mergeAutosaveResult(detailRef.current, autosaveResult, savePayload) : detailRef.current
      detailRef.current = mergedDetail
      if (isRemoteObject(autosaveResult)) {
        setDetail(mergedDetail)
      }
      baseWorkingCopyRevisionRef.current = readRemoteNumber(asPayloadObject(autosaveResult), 'workingCopyRevision') ?? baseWorkingCopyRevisionRef.current
      baseSnapshotChecksumRef.current = readRemoteString(asPayloadObject(autosaveResult), 'snapshotChecksum') ?? baseSnapshotChecksumRef.current
      lastAutosaveSignatureRef.current = savePayload.signature
      dirtyRef.current = false
      setDirty(false)
      void syncAssistantContext({ detailOverride: mergedDetail, dirtyOverride: false, force: true })
      if (options.notifyUser) {
        notify('success', t('versionCreated'))
      }
      canvasWorkbenchDebug.info('autosave.success', {
        documentId: savePayload.document.id,
        generation,
        signature: shortSignature(savePayload.signature),
        workingCopyRevision: baseWorkingCopyRevisionRef.current,
        snapshotChecksum: shortChecksum(baseSnapshotChecksumRef.current),
        hasAutosaveResult: isRemoteObject(autosaveResult),
        snapshotImageUpdatedAt: readRemoteString(asPayloadObject(autosaveResult), 'autosaveUpdatedAt') ?? '',
        durationMs: Date.now() - startedAt
      })
      return savePayload
    })()

    autosaveInFlightRef.current = task
    try {
      return await task
    } catch (error) {
      canvasWorkbenchDebug.error('autosave.failure', {
        generation,
        durationMs: Date.now() - startedAt,
        message: getErrorMessage(error instanceof Error ? error : String(error))
      })
      throw error
    } finally {
      if (autosaveInFlightRef.current === task) {
        autosaveInFlightRef.current = null
      }
      setAutosaving(false)
    }
  }

  async function saveCanvas(newVersion = false) {
    setBusy(true)
    try {
      const autosaved = await performAutosave({ force: true, notifyUser: !newVersion })
      const current = autosaved?.document ?? detailRef.current?.item
      if (!current || !autosaved) {
        return
      }
      if (newVersion) {
        const response = await executeAction('save_version', current.id, asRemotePayloadObject({
          documentId: current.id,
          snapshot: asRemotePayloadObject(autosaved.snapshot),
          viewState: asRemotePayloadObject(autosaved.viewState),
          selectionSummary: asRemotePayloadObject(autosaved.selectionSummary),
          snapshotImage: asRemotePayloadObject(autosaved.snapshotImage),
          sourceType: 'workbench',
          changeSummary: 'Workbench version'
        }))
        const payload = asPayloadObject(getResponsePayload(response))
        const result = asPayloadObject(payload.data ?? payload)
        notify('success', t('saved'))
        await loadData(getActionDocumentId(result) || current.id, { silent: true, preserveCanvas: true, applyRemoteSnapshot: true })
      }
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
    } finally {
      setBusy(false)
    }
  }

  async function importSnapshot(file: File) {
    setBusy(true)
    try {
      const response = await executeFileAction('import_snapshot_file', selectedId || null, { documentId: selectedId || undefined }, { documentId: selectedId || undefined }, file)
      const payload = asPayloadObject(getResponsePayload(response))
      notify('success', t('imported'))
      await loadData(
        getActionDocumentId(payload) || selectedId
      )
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
    } finally {
      setBusy(false)
    }
  }

  function openShareDialog() {
    const activeShare = normalizeArtifactShare(detailRef.current?.artifactShare)
    if (activeShare) {
      setShareAccessMode(activeShare.accessMode)
      setShareVersionMode(activeShare.versionMode)
    }
    setShareDialogOpen(true)
  }

  async function publishArtifact(userConfirmedPublicLink = false) {
    const currentDocument = detailRef.current?.item
    const currentEditor = editorRef.current
    if (!currentDocument || !currentEditor) return null
    if (shareAccessMode === 'public_link' && !userConfirmedPublicLink) {
      setPublicShareConfirmationOpen(true)
      return null
    }
    setBusy(true)
    try {
      const collaborationClient = collaborationClientRef.current
      const collaborationSocket = socketRef.current
      if (!collaborationClient || !collaborationSocket?.connected) throw new Error(t('shareSyncRequired'))
      const synchronized = await synchronizeCanvasCollaboration(collaborationClient, collaborationSocket)
      if (!synchronized) throw new Error(t('shareSyncTimeout'))
      const autosaved = await performAutosave({ force: true })
      if (!autosaved) throw new Error(t('shareSyncRequired'))
      const revision = baseWorkingCopyRevisionRef.current ?? getDetailWorkingCopyRevision(detailRef.current)
      if (revision === null) throw new Error(t('shareSyncRequired'))
      const page = currentEditor.getCurrentPage()
      const publishInput = asRemotePayloadObject({
        documentId: currentDocument.id,
        accessMode: shareAccessMode,
        targetMode: shareVersionMode,
        userConfirmedPublicLink: shareAccessMode === 'public_link',
        baseRevision: revision,
        baseSnapshotChecksum: baseSnapshotChecksumRef.current,
        pageId: page.id
      })
      const response = await executeAction(
        'publish_artifact',
        currentDocument.id,
        publishInput,
        { documentId: currentDocument.id }
      )
      let exportResult = unwrapCanvasArtifactExport(getResponsePayload(response))
      if (exportResult.status !== 'succeeded') {
        const exportId = normalizeOptionalString(exportResult.exportId)
        if (!exportId) throw new Error(t('shareExportMissing'))
        notify('info', t('sharePreparing'))
        exportResult = await waitForCanvasArtifactExport(currentDocument.id, exportId)
      }
      const share = normalizeArtifactShare(exportResult.share ?? exportResult)
      if (!share) throw new Error(t('shareLinkMissing'))
      if (detailRef.current) {
        const nextDetail = { ...detailRef.current, artifactShare: share }
        detailRef.current = nextDetail
        setDetail(nextDetail)
      }
      notify('success', t('artifactShared'))
      return share
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function copyArtifactShareLink() {
    const share = normalizeArtifactShare(detailRef.current?.artifactShare)
    if (!share) return
    try {
      await copyText(share.shareUrl)
      notify('success', t('shareLinkCopied'))
    } catch {
      shareLinkInputRef.current?.focus()
      shareLinkInputRef.current?.select()
      notify('warning', t('shareManualCopy'))
    }
  }

  async function createOrCopyArtifactShare() {
    const activeShare = normalizeArtifactShare(detailRef.current?.artifactShare)
    const revision = getDetailWorkingCopyRevision(detailRef.current)
    if (
      activeShare &&
      activeShare.accessMode === shareAccessMode &&
      activeShare.versionMode === shareVersionMode &&
      activeShare.revision === revision
    ) {
      await copyArtifactShareLink()
      return
    }
    await publishArtifact()
  }

  async function revokeArtifactShare() {
    const currentDocument = detailRef.current?.item
    if (!currentDocument) return
    setBusy(true)
    try {
      await executeAction('revoke_artifact_share', currentDocument.id, { documentId: currentDocument.id })
      if (detailRef.current) {
        const nextDetail = { ...detailRef.current, artifactShare: null }
        detailRef.current = nextDetail
        setDetail(nextDetail)
      }
      notify('success', t('shareRevoked'))
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
    } finally {
      setBusy(false)
      setRevokeShareConfirmationOpen(false)
    }
  }

  function createAiHolder() {
    const currentEditor = editorRef.current
    if (!currentEditor) {
      return
    }
    const scale = safeCall(() => currentEditor.getResizeScaleFactor()) ?? 1
    const w = AI_HOLDER_W * scale
    const h = AI_HOLDER_H * scale
    const center = safeCall(() => currentEditor.getViewportPageBounds().center) ?? { x: 0, y: 0 }
    const id = createShapeId()
    currentEditor.createShape({
      id,
      type: 'frame',
      x: center.x - w / 2,
      y: center.y - h / 2,
      meta: {
        canvasAiImageHolder: true,
        canvasAiImageHolderVersion: 1,
        canvasAiAspectRatio: w / h
      },
      props: {
        w,
        h,
        name: t('aiHolder'),
        color: 'blue'
      }
    })
    safeCall(() => currentEditor.select(id))
    setDirty(true)
    scheduleAutosave()
  }

  function createAnnotation() {
    const currentEditor = editorRef.current
    if (!currentEditor) {
      return
    }
    const center = safeCall(() => currentEditor.getViewportPageBounds().center) ?? { x: 0, y: 0 }
    const arrowId = createShapeId()
    const textId = createShapeId()
    try {
      currentEditor.createShapes([
        {
          id: arrowId,
          type: 'arrow',
          x: center.x - 80,
          y: center.y,
          meta: { canvasAnnotation: true },
          props: {
            color: 'red',
            labelColor: 'red',
            richText: toRichText(t('annotation')),
            start: { x: 0, y: 0 },
            end: { x: 160, y: 0 }
          }
        },
        {
          id: textId,
          type: 'text',
          x: center.x + 92,
          y: center.y - 16,
          meta: { canvasAnnotation: true },
          props: {
            color: 'red',
            richText: toRichText(t('annotation')),
            autoSize: true
          }
        }
      ])
      safeCall(() => currentEditor.select(arrowId, textId))
    } catch {
      currentEditor.createShape({
        id: textId,
        type: 'text',
        x: center.x,
        y: center.y,
        meta: { canvasAnnotation: true },
        props: {
          color: 'red',
          richText: toRichText(t('annotation')),
          autoSize: true
        }
      })
    }
    setDirty(true)
    scheduleAutosave()
  }

  function applyAspectPreset(preset: { id: string; w: number; h: number }) {
    const currentEditor = editorRef.current
    if (!currentEditor) {
      return
    }
    const selected = safeCall(() => currentEditor.getSelectedShapes()) ?? []
    const holder = selected.find(isAiImageHolderFrame)
    if (!holder) {
      createAiHolder()
      return
    }
    currentEditor.updateShape({
      id: holder.id,
      type: holder.type,
      props: {
        ...holder.props,
        w: preset.w,
        h: preset.h
      },
      meta: {
        ...holder.meta,
        canvasAiImageHolder: true,
        canvasAiAspectPreset: preset.id,
        canvasAiAspectRatio: preset.w / preset.h
      }
    })
    setDirty(true)
    scheduleAutosave()
  }

  async function deleteCurrentDocument() {
    const currentDocument = detailRef.current?.item
    if (!currentDocument || !window.confirm(t('confirmDeleteCanvas'))) {
      return
    }
    setBusy(true)
    try {
      await executeAction('delete_document', currentDocument.id, { documentId: currentDocument.id })
      notify('success', t('deleted'))
      detailRef.current = null
      selectedIdRef.current = ''
      setDetail(null)
      setSelectedId('')
      setMountedSnapshot(null)
      setSceneKey('empty')
      await loadData('', { silent: true })
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
    } finally {
      setBusy(false)
    }
  }

  async function deleteVersion(versionId: string) {
    const currentDocument = detailRef.current?.item
    if (!currentDocument || !versionId || !window.confirm(t('confirmDeleteVersion'))) {
      return
    }
    setBusy(true)
    try {
      await executeAction('delete_version', currentDocument.id, { documentId: currentDocument.id, versionId })
      notify('success', t('deleted'))
      await loadData(currentDocument.id, { silent: true, preserveCanvas: true })
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
    } finally {
      setBusy(false)
    }
  }

  const current = detail?.item
  const snapshot = mountedSnapshot
  const canvasKey = `${current?.id ?? 'empty'}:${sceneKey}`
  const statusTone: 'warning' | 'success' = collabState !== 'connected' || autosaving || dirty ? 'warning' : 'success'
  const statusText = collabState === 'connecting'
    ? t('connecting')
    : collabState === 'disconnected'
      ? t('disconnected')
      : autosaving
        ? t('saving')
        : dirty
          ? t('dirty')
          : t('synced')
  const visibleCollaborators = collaborators.slice(0, 4)
  const hiddenCollaborators = collaborators.slice(4)
  const versions = detail?.versions ?? []
  const activeArtifactShare = normalizeArtifactShare(detail?.artifactShare)
  const shareSelectionMatches = Boolean(
    activeArtifactShare &&
    activeArtifactShare.accessMode === shareAccessMode &&
    activeArtifactShare.versionMode === shareVersionMode &&
    activeArtifactShare.revision === getDetailWorkingCopyRevision(detail)
  )

  return (
    <TooltipProvider delayDuration={250}>
      <div
        className={`cw-root cw-theme-${hostColorScheme} ${leftCollapsed ? 'left-collapsed' : ''} ${rightCollapsed ? 'right-collapsed' : ''}`}
        data-theme={hostColorScheme}
        data-tldraw-license={tldrawLicenseKey ? 'provided' : 'missing'}
      >
        <Sidebar className="cw-sidebar" collapsed={leftCollapsed}>
          {leftCollapsed ? (
            <SidebarRail className="cw-rail">
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarTrigger aria-label={t('documents')} onClick={() => setLeftCollapsed(false)}>
                    <PanelLeftOpen className="cw-icon" />
                  </SidebarTrigger>
                </TooltipTrigger>
                <TooltipContent>{t('documents')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" disabled={busy} onClick={createCanvas} aria-label={t('newCanvas')}>
                    <Plus className="cw-icon" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('newCanvas')}</TooltipContent>
              </Tooltip>
            </SidebarRail>
          ) : (
            <>
              <SidebarHeader className="cw-sidebar-header">
                <SidebarTrigger aria-label={t('documents')} onClick={() => setLeftCollapsed(true)}>
                  <PanelLeftClose className="cw-icon" />
                </SidebarTrigger>
                <div className="cw-panel-heading">
                  <SidebarTitle>{t('studio')}</SidebarTitle>
                  <span className="cw-panel-subtitle">{documents.length} {t('canvasItems')}</span>
                </div>
                <Button size="sm" disabled={busy} onClick={createCanvas}>
                  <Plus className="cw-button-icon" />
                  {t('newCanvas')}
                </Button>
              </SidebarHeader>
              <SidebarContent>
                <div className="cw-search">
                  <Input
                    value={search}
                    placeholder={t('search')}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearch(event.currentTarget.value)}
                    onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                      if (event.key === 'Enter') {
                        void loadData(selectedId)
                      }
                    }}
                  />
                </div>
                <div className="cw-panel-section-label">
                  <span>{t('documents')}</span>
                  <Badge variant="secondary">{documents.length}</Badge>
                </div>
                <ScrollArea className="cw-list-scroll">
                  <SidebarMenu className="cw-document-list">
                    {documents.length ? documents.map((document) => (
                      <SidebarMenuItem key={document.id}>
                        <SidebarMenuButton
                          className="cw-document-button"
                          isActive={document.id === current?.id}
                          aria-current={document.id === current?.id ? 'page' : undefined}
                          onClick={() => loadData(document.id)}
                        >
                          <span className="cw-document-heading">
                            <span className="cw-item-title">{document.title}</span>
                            {document.id === current?.id ? (
                              <Badge className="cw-document-current" variant="secondary">{t('current')}</Badge>
                            ) : null}
                          </span>
                          <span className="cw-item-meta">
                            {document.kind} / {document.status} / v{document.currentVersionNumber ?? 0}
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )) : <div className="cw-panel-empty">{t('noCanvases')}</div>}
                  </SidebarMenu>
                </ScrollArea>
              </SidebarContent>
            </>
          )}
        </Sidebar>

        <main className="cw-workspace">
          <div className="cw-toolbar">
            <div className="cw-toolbar-title">
              <div className="cw-title">{current?.title ?? t('selectCanvas')}</div>
              <div className="cw-item-meta">
                {current ? `${current.kind} / ${current.status} / ${detail?.sceneSource ?? 'version'}` : t('selectCanvas')}
              </div>
            </div>
            <div className="cw-toolbar-actions">
              <div className="cw-toolbar-presence">
                <div className="cw-collaborators" aria-label={t('collaborators')}>
                  {visibleCollaborators.map((collaborator) => (
                    <Tooltip key={collaborator.presenceId}>
                      <TooltipTrigger asChild>
                        <span
                          className="cw-collaborator"
                          tabIndex={0}
                          aria-label={collaborator.displayName}
                          style={{ '--cw-collaborator-color': collaborator.color } as React.CSSProperties}
                          data-actor={collaborator.actorType}
                          data-status={collaborator.status ?? ''}
                        >
                          {collaborator.avatarUrl ? (
                            <img src={collaborator.avatarUrl} alt="" />
                          ) : collaborator.displayName.slice(0, 1).toUpperCase()}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="cw-collaborator-tooltip">
                          <strong>{collaborator.displayName}</strong>
                          {collaborator.operationLabel ? <span>{collaborator.operationLabel}</span> : null}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {hiddenCollaborators.length ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cw-collaborator cw-collaborator-overflow" tabIndex={0}>+{hiddenCollaborators.length}</span>
                      </TooltipTrigger>
                      <TooltipContent>{hiddenCollaborators.map((collaborator) => collaborator.displayName).join(' · ')}</TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
                <Badge className="cw-status" variant="outline" data-status={statusTone}>
                  {statusText}
                </Badge>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" disabled={!current || busy || autosaving} onClick={() => saveCanvas(false)}>
                    <Save className="cw-button-icon" />
                    {t('save')}
                  </Button>
                </TooltipTrigger>
                  <TooltipContent>{t('save')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!current || busy || !settings.artifactSharingAvailable}
                    onClick={openShareDialog}
                  >
                    <Send className="cw-button-icon" />
                    {t('share')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {settings.artifactSharingAvailable ? t('shareCanvasTip') : settings.artifactSharingWarning || t('shareUnavailable')}
                </TooltipContent>
              </Tooltip>
              <Separator orientation="vertical" className="cw-separator" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" disabled={!current || busy} onClick={createAiHolder}>
                    <Image className="cw-button-icon" />
                    {t('aiHolder')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('aiHolderTip')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" disabled={!current || busy} onClick={createAnnotation}>
                    {t('annotation')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('annotationTip')}</TooltipContent>
              </Tooltip>
              <div className="cw-presets" aria-label={t('aspect')}>
                {ASPECT_PRESETS.map((preset) => (
                  <Button key={preset.id} size="sm" variant="ghost" disabled={!current || busy} onClick={() => applyAspectPreset(preset)}>
                    {preset.label}
                  </Button>
                ))}
              </div>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => fileInputRef.current?.click()}>
                <Upload className="cw-button-icon" />
                {t('import')}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button className="shrink-0" size="icon" variant="destructive" disabled={!current || busy} onClick={deleteCurrentDocument} aria-label={t('delete')}>
                    <Trash2 className="cw-icon" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('delete')}</TooltipContent>
              </Tooltip>
              <input
                ref={fileInputRef}
                className="cw-hidden-file"
                type="file"
                accept=".json,.tldr,.tldraw,application/json"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  if (file) {
                    void importSnapshot(file)
                  }
                }}
              />
            </div>
          </div>
          <div className="cw-canvas">
            {current ? (
              <Tldraw
                key={canvasKey}
                assetUrls={{ fonts: canvasOnlineFontAssetUrls }}
                locale={tldrawLocale}
                licenseKey={tldrawLicenseKey}
                snapshot={snapshot || undefined}
                onMount={(nextEditor: Editor) => {
                  editorRef.current = nextEditor
                  nextEditor.user.updateUserPreferences({ colorScheme: hostColorScheme, locale: tldrawLocale })
                  const viewState = getDetailViewState(detailRef.current)
                  applyCanvasViewState(nextEditor, viewState)
                  if (typeof window.requestAnimationFrame === 'function') {
                    window.requestAnimationFrame(() => applyCanvasViewState(nextEditor, viewState))
                  }
                  setEditor(nextEditor)
                  selectionSignatureRef.current = ''
                  void syncAssistantContext({ editorOverride: nextEditor, force: true })
                }}
              />
            ) : (
              <div className="cw-empty">{t('selectCanvas')}</div>
            )}
          </div>
        </main>

        <Sidebar className="cw-inspector" side="right" collapsed={rightCollapsed}>
          {rightCollapsed ? (
            <SidebarRail className="cw-rail">
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarTrigger aria-label={t('details')} onClick={() => setRightCollapsed(false)}>
                    <PanelRightOpen className="cw-icon" />
                  </SidebarTrigger>
                </TooltipTrigger>
                <TooltipContent>{t('details')}</TooltipContent>
              </Tooltip>
            </SidebarRail>
          ) : (
            <>
              <SidebarHeader className="cw-sidebar-header">
                <SidebarTrigger aria-label={t('details')} onClick={() => setRightCollapsed(true)}>
                  <PanelRightClose className="cw-icon" />
                </SidebarTrigger>
                <div className="cw-panel-heading">
                  <SidebarTitle>{t('inspector')}</SidebarTitle>
                  <span className="cw-panel-subtitle">{current?.title ?? t('selectCanvas')}</span>
                </div>
              </SidebarHeader>
              <SidebarContent className="cw-inspector-content">
                {current ? (
                  <Tabs defaultValue="versions" className="cw-tabs">
                    <TabsList className="cw-tabs-list">
                      <TabsTrigger value="versions">{t('versions')}</TabsTrigger>
                      <TabsTrigger value="logs">{t('logs')}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="versions" className="cw-tab-content">
                      <div className="cw-version-panel-header">
                        <div className="cw-version-panel-copy">
                          <strong>{t('versions')}</strong>
                          <span>{versions.length} {t('versionItems')} · {t('manualVersionHint')}</span>
                        </div>
                        <Button size="sm" disabled={busy || autosaving} onClick={() => void saveCanvas(true)}>
                          <FileJson className="cw-button-icon" />
                          {t('newVersion')}
                        </Button>
                      </div>
                      <ScrollArea className="cw-inspector-scroll">
                        <div className="cw-inspector-list">
                          {versions.length ? versions.map((version) => (
                            <div key={version.id} className="cw-version" data-current={version.id === current.currentVersionId}>
                              <div>
                                <strong>v{version.versionNumber}</strong>
                                <div className="cw-item-meta">{version.changeSummary || version.sourceType}</div>
                              </div>
                              <div className="cw-version-actions">
                                {version.id === current.currentVersionId ? (
                                  <Badge className="cw-version-current" variant="secondary">
                                    {t('current')}
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      executeAction('restore_version', current.id, { documentId: current.id, versionId: version.id })
                                        .then(() => loadData(current.id))
                                        .catch((error) => notify('error', getErrorMessage(error instanceof Error ? error : String(error))))
                                    }
                                  >
                                    {t('restore')}
                                  </Button>
                                )}
                                <Button
                                  size="icon"
                                  variant="destructive"
                                  disabled={busy}
                                  aria-label={t('deleteVersion')}
                                  onClick={() => void deleteVersion(version.id)}
                                >
                                  <Trash2 className="cw-icon" />
                                </Button>
                              </div>
                            </div>
                          )) : <div className="cw-panel-empty">{t('noVersions')}</div>}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                    <TabsContent value="logs" className="cw-tab-content">
                      <ScrollArea className="cw-inspector-scroll">
                        <div className="cw-inspector-list">
                          {(detail?.logs ?? []).length ? (detail?.logs ?? []).map((log) => (
                            <div key={log.id ?? `${log.action}-${log.createdAt}`} className="cw-log">
                              <strong>{log.action}</strong>
                              <div>{log.message || log.errorMessage || ''}</div>
                            </div>
                          )) : <div className="cw-panel-empty">{t('noLogs')}</div>}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                ) : null}
              </SidebarContent>
            </>
          )}
        </Sidebar>

        <Dialog open={shareDialogOpen} onOpenChange={(open: boolean) => {
          if (!busy) setShareDialogOpen(open)
        }}>
          <DialogContent className="cw-share-dialog">
            <DialogHeader>
              <DialogTitle>{t('shareCanvas')}</DialogTitle>
              <DialogDescription>{t('shareDescription')}</DialogDescription>
            </DialogHeader>

            <div className="cw-share-setting-row">
              <div className="cw-share-setting-copy">
                <strong>{t('alwaysShareLatest')}</strong>
                <span>{t('alwaysShareLatestDescription')}</span>
              </div>
              <Switch
                checked={shareVersionMode === 'latest'}
                aria-label={t('alwaysShareLatest')}
                onCheckedChange={(checked: boolean) => setShareVersionMode(checked ? 'latest' : 'version')}
              />
            </div>

            <div className="cw-share-version-row">
              <span>{shareVersionMode === 'latest' ? t('sharingLatestPublish') : t('sharingFixedPublish')}</span>
              <Badge variant="secondary">r{getDetailWorkingCopyRevision(detail) ?? 0}</Badge>
            </div>

            <div className="cw-share-access-row">
              <Select
                value={shareAccessMode}
                onValueChange={(value: string) => {
                  if (isArtifactAccessSelection(value)) setShareAccessMode(value)
                }}
              >
                <SelectTrigger className="cw-share-access-select" aria-label={t('shareAccess')}>
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
                disabled={!current || busy}
                onClick={() => void createOrCopyArtifactShare()}
              >
                {shareSelectionMatches ? <Copy className="cw-button-icon" /> : <Send className="cw-button-icon" />}
                {shareSelectionMatches ? t('copyShareLink') : activeArtifactShare ? t('updateShareLink') : t('createShareLink')}
              </Button>
            </div>

            <div className="cw-share-link-status">
              <span>{activeArtifactShare ? t('shareLinkReady') : t('shareLinkNotCreated')}</span>
              {activeArtifactShare ? (
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setRevokeShareConfirmationOpen(true)}>
                  <Archive className="cw-button-icon" />
                  {t('revokeShare')}
                </Button>
              ) : null}
            </div>

            {activeArtifactShare ? (
              <div className="cw-share-link-field">
                <Input
                  ref={shareLinkInputRef}
                  readOnly
                  value={activeArtifactShare.shareUrl}
                  aria-label={t('shareLinkReady')}
                  onFocus={(event: React.FocusEvent<HTMLInputElement>) => event.currentTarget.select()}
                />
                <Button type="button" variant="outline" size="icon" aria-label={t('copyShareLink')} onClick={() => void copyArtifactShareLink()}>
                  <Copy className="cw-icon" />
                </Button>
              </div>
            ) : null}

            <p className="cw-share-note">{t('shareVersionNote')}</p>
          </DialogContent>
        </Dialog>

        <AlertDialog open={publicShareConfirmationOpen} onOpenChange={(open: boolean) => {
          if (!busy) setPublicShareConfirmationOpen(open)
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('confirmPublicShareTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('confirmPublicShare')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                  event.preventDefault()
                  setPublicShareConfirmationOpen(false)
                  void publishArtifact(true)
                }}
              >
                {t('confirmAction')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={revokeShareConfirmationOpen} onOpenChange={(open: boolean) => {
          if (!busy) setRevokeShareConfirmationOpen(open)
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('confirmRevokeShareTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('confirmRevokeShare')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={busy}
                onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                  event.preventDefault()
                  void revokeArtifactShare()
                }}
              >
                {t('revokeShare')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  )
}

function getDetailSnapshot(detail: DetailPayload | null | undefined): CanvasSnapshotFromEditor | null {
  const snapshot = detail?.workingCopy?.snapshot ?? detail?.currentVersion?.snapshot ?? null
  return isRemoteObject(snapshot) ? (snapshot as object as CanvasSnapshotFromEditor) : null
}

function synchronizeCanvasCollaboration(client: CollaborationClient, socket: Socket) {
  if (!socket.connected) return Promise.resolve(false)
  client.flush()
  return new Promise<boolean>((resolve) => {
    const complete = () => {
      window.clearTimeout(timer)
      resolve(true)
    }
    const timer = window.setTimeout(() => {
      socket.off('sync', complete)
      resolve(false)
    }, 3_000)
    socket.once('sync', complete)
    client.requestSync()
  })
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    if (!document.execCommand('copy')) throw new Error('Copy command was rejected.')
  } finally {
    textarea.remove()
  }
}

function normalizeArtifactShare(value: RemotePayloadValue | ArtifactShare | null | undefined): ArtifactShare | null {
  const object = asPayloadObject(value as RemotePayloadValue | undefined)
  const artifactId = normalizeOptionalString(object.artifactId)
  const artifactLinkId = normalizeOptionalString(object.artifactLinkId)
  const shareUrl = normalizeOptionalString(object.shareUrl) ?? normalizeOptionalString(object.publicUrl)
  if (!artifactId || !artifactLinkId || !shareUrl || !isArtifactAccessSelection(object.accessMode)) return null
  const versionMode = object.versionMode === 'latest' ? 'latest' : object.versionMode === 'version' ? 'version' : null
  if (!versionMode) return null
  return {
    ...object,
    artifactId,
    artifactVersionId: normalizeOptionalString(object.artifactVersionId) ?? null,
    artifactLinkId,
    shareUrl,
    publicUrl: normalizeOptionalString(object.publicUrl) ?? shareUrl,
    accessMode: object.accessMode,
    versionMode,
    revision: readRemoteNumber(object, 'revision'),
    snapshotChecksum: readRemoteString(object, 'snapshotChecksum')
  }
}

function isArtifactAccessSelection(value: RemotePayloadValue | string | undefined): value is ArtifactAccessSelection {
  return value === 'public_link' || value === 'organization_all' || value === 'workspace_all'
}

function getDetailViewState(detail: DetailPayload | null | undefined): RemotePayloadObject | null {
  const viewState = detail?.workingCopy?.viewState ?? detail?.currentVersion?.viewState ?? null
  return isRemoteObject(viewState) ? viewState : null
}

function getDetailSelectionSummary(detail: DetailPayload | null | undefined): RemotePayloadObject | null {
  const selectionSummary = detail?.workingCopy?.selectionSummary ?? detail?.currentVersion?.selectionSummary ?? null
  return isRemoteObject(selectionSummary) ? selectionSummary : null
}

function getDetailWorkingCopyRevision(detail: DetailPayload | null | undefined) {
  return detail?.workingCopyRevision ?? detail?.workingCopy?.workingCopyRevision ?? detail?.item?.workingCopyRevision ?? null
}

function getDetailSnapshotChecksum(detail: DetailPayload | null | undefined) {
  return detail?.snapshotChecksum ?? detail?.workingCopy?.snapshotChecksum ?? detail?.item?.snapshotChecksum ?? ''
}

function asPayloadObject(value: RemotePayloadValue | null | undefined): RemotePayloadObject {
  return isRemoteObject(value) ? value : {}
}

function asRemotePayloadObject(value: object): RemotePayloadObject {
  return value as RemotePayloadObject
}

function getActionDocumentId(value: RemotePayloadObject) {
  return (
    normalizeDocumentId(asPayloadObject(value.item).id) ||
    normalizeDocumentId(asPayloadObject(value.document).id) ||
    normalizeDocumentId(asPayloadObject(asPayloadObject(value.document).item).id) ||
    normalizeDocumentId(asPayloadObject(asPayloadObject(value.data).document).id) ||
    normalizeDocumentId(asPayloadObject(asPayloadObject(asPayloadObject(value.data).document).item).id) ||
    normalizeDocumentId(asPayloadObject(asPayloadObject(value.data).item).id)
  )
}

function toDocumentItems(value: RemotePayloadValue | undefined): DocumentItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map(toDocumentItem).filter((item): item is DocumentItem => Boolean(item))
}

function toDocumentItem(value: RemotePayloadValue | undefined): DocumentItem | null {
  const object = asPayloadObject(value)
  return typeof object.id === 'string' ? (object as DocumentItem) : null
}

function toVersionItems(value: RemotePayloadValue | undefined): VersionItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map(toVersionItem).filter((item): item is VersionItem => Boolean(item))
}

function toVersionItem(value: RemotePayloadValue | undefined): VersionItem | null {
  const object = asPayloadObject(value)
  return typeof object.id === 'string' ? (object as VersionItem) : null
}

function toLogItems(value: RemotePayloadValue | undefined): LogItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((item) => asPayloadObject(item) as LogItem).filter((item) => item.action || item.id)
}

function toWorkingCopy(value: RemotePayloadValue | undefined): WorkingCopy | null {
  const object = asPayloadObject(value)
  return Object.keys(object).length ? (object as WorkingCopy) : null
}

function toWorkbenchSettings(value: RemotePayloadValue | undefined): CanvasWorkbenchSettings {
  const object = asPayloadObject(value)
  return {
    tldrawLicenseKey: normalizeOptionalString(object.tldrawLicenseKey),
    artifactSharingAvailable: object.artifactSharingAvailable === true,
    artifactSharingWarning: normalizeOptionalString(object.artifactSharingWarning)
  }
}

function toCollaborationDescriptor(value: RemotePayloadValue | undefined, documentId: string): CanvasCollaborationDescriptor {
  const object = asPayloadObject(value)
  const actorValue = asPayloadObject(object.actor)
  const actorType = actorValue.actorType === 'agent' || actorValue.actorType === 'system' ? actorValue.actorType : 'user'
  const access = object.access === 'read' ? 'read' : 'write'
  const descriptor: CanvasCollaborationDescriptor = {
    sessionId: requireRemoteString(object, 'sessionId'),
    clientKey: requireRemoteString(object, 'clientKey'),
    documentId: requireRemoteString(object, 'documentId'),
    namespace: requireRemoteString(object, 'namespace'),
    connectionUrl: requireRemoteString(object, 'connectionUrl'),
    access,
    actor: {
      presenceId: requireRemoteString(actorValue, 'presenceId'),
      actorType,
      displayName: requireRemoteString(actorValue, 'displayName'),
      color: requireRemoteString(actorValue, 'color'),
      avatarUrl: typeof actorValue.avatarUrl === 'string' ? actorValue.avatarUrl : null
    },
    expiresAt: typeof object.expiresAt === 'number' ? object.expiresAt : Date.now() + 60_000,
    canvasDocumentId: typeof object.canvasDocumentId === 'string' ? object.canvasDocumentId : documentId
  }
  return descriptor
}

function requireRemoteString(value: RemotePayloadObject, key: string) {
  const item = value[key]
  if (typeof item !== 'string' || !item.trim()) throw new Error(`Canvas collaboration session is missing ${key}.`)
  return item
}

function toDetailPayload(value: RemotePayloadValue | undefined): DetailPayload | null {
  const object = asPayloadObject(value)
  if (!Object.keys(object).length) {
    return null
  }
  const sceneSource = object.sceneSource === 'autosave' || object.sceneSource === 'version' ? object.sceneSource : undefined
  return {
    item: toDocumentItem(object.item) ?? undefined,
    currentVersion: toVersionItem(object.currentVersion),
    workingCopy: toWorkingCopy(object.workingCopy),
    versions: toVersionItems(object.versions),
    logs: toLogItems(object.logs),
    sceneSource,
    snapshotImagePath: typeof object.snapshotImagePath === 'string' ? object.snapshotImagePath : null,
    snapshotImageUpdatedAt: typeof object.snapshotImageUpdatedAt === 'string' ? object.snapshotImageUpdatedAt : null,
    workingCopyRevision: readRemoteNumber(object, 'workingCopyRevision'),
    snapshotChecksum: readRemoteString(object, 'snapshotChecksum'),
    artifactShare: normalizeArtifactShare(object.artifactShare)
  }
}

function createSceneKey(documentId: string, sceneSignature: string, detail: DetailPayload | null) {
  const fallbackVersion = detail?.currentVersion?.id ?? detail?.item?.currentVersionId ?? 'none'
  const source = detail?.sceneSource ?? (detail?.workingCopy ? 'autosave' : 'version')
  return `${documentId || 'empty'}:${source}:${sceneSignature || fallbackVersion}`
}

function mergeAutosaveResult(detail: DetailPayload | null, autosave: RemotePayloadObject, savePayload: SavePayload): DetailPayload | null {
  if (!detail) {
    return detail
  }
  const autosaveUpdatedAt = typeof autosave.autosaveUpdatedAt === 'string' ? autosave.autosaveUpdatedAt : null
  const autosaveBaseVersionId = typeof autosave.autosaveBaseVersionId === 'string' ? autosave.autosaveBaseVersionId : null
  const autosaveImagePath = typeof autosave.snapshotImagePath === 'string' ? autosave.snapshotImagePath : null
  const workingCopyRevision = readRemoteNumber(autosave, 'workingCopyRevision') ?? detail.workingCopyRevision ?? null
  const snapshotChecksum = readRemoteString(autosave, 'snapshotChecksum') ?? detail.snapshotChecksum ?? null
  const snapshotImagePath = autosaveImagePath ?? detail.snapshotImagePath ?? null
  const snapshotImageUpdatedAt = autosaveUpdatedAt ?? detail.snapshotImageUpdatedAt ?? null
  return {
    ...detail,
    sceneSource: 'autosave',
    snapshotImagePath,
    snapshotImageUpdatedAt,
    workingCopyRevision,
    snapshotChecksum,
    item: detail.item
      ? {
          ...detail.item,
          status: detail.item.status === 'archived' ? detail.item.status : 'draft',
          workingCopyRevision,
          snapshotChecksum,
          lastEditedAt: autosaveUpdatedAt ?? detail.item.lastEditedAt
        }
      : detail.item,
    workingCopy: detail.workingCopy
      ? {
          ...detail.workingCopy,
          snapshot: asRemotePayloadObject(savePayload.snapshot),
          viewState: asRemotePayloadObject(savePayload.viewState),
          selectionSummary: asRemotePayloadObject(savePayload.selectionSummary),
          autosaveUpdatedAt: autosaveUpdatedAt ?? detail.workingCopy.autosaveUpdatedAt,
          autosaveBaseVersionId: autosaveBaseVersionId ?? detail.workingCopy.autosaveBaseVersionId,
          workingCopyRevision,
          snapshotChecksum,
          snapshotImagePath
        }
      : {
          snapshot: asRemotePayloadObject(savePayload.snapshot),
          viewState: asRemotePayloadObject(savePayload.viewState),
          selectionSummary: asRemotePayloadObject(savePayload.selectionSummary),
          autosaveUpdatedAt,
          autosaveBaseVersionId,
          workingCopyRevision,
          snapshotChecksum,
          snapshotImagePath
        }
  }
}

function createRemoteSnapshotApplyResult(
  reason: RemoteSnapshotApplyResult['reason'],
  values: Partial<Omit<RemoteSnapshotApplyResult, 'applied' | 'reason'>> = {}
): RemoteSnapshotApplyResult {
  return {
    applied: reason === 'applied',
    reason,
    currentRecordCount: values.currentRecordCount ?? 0,
    nextRecordCount: values.nextRecordCount ?? 0,
    putCount: values.putCount ?? 0,
    removeCount: values.removeCount ?? 0,
    hasEditor: values.hasEditor,
    hasSnapshot: values.hasSnapshot
  }
}

function summarizeRemoteSnapshotApplyResult(result: RemoteSnapshotApplyResult): CanvasDebugObject {
  return {
    applied: result.applied,
    reason: result.reason,
    currentRecordCount: result.currentRecordCount,
    nextRecordCount: result.nextRecordCount,
    putCount: result.putCount,
    removeCount: result.removeCount,
    hasEditor: result.hasEditor,
    hasSnapshot: result.hasSnapshot
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function shortSignature(signature: string) {
  if (!signature) {
    return ''
  }
  return signature.length > 16 ? `${signature.slice(0, 16)}...${signature.slice(-8)}` : signature
}

function readRemoteString(value: RemotePayloadObject, key: string) {
  const item = value[key]
  return typeof item === 'string' ? item : null
}

function readRemoteNumber(value: RemotePayloadObject, key: string) {
  const item = value[key]
  return typeof item === 'number' && Number.isFinite(item) ? item : null
}

function isAutosaveStaleBaseMessage(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes('baserevision') || normalized.includes('basesnapshotchecksum') || normalized.includes('working copy has changed')
}

function shortChecksum(checksum: string | null | undefined) {
  const normalized = checksum ?? ''
  if (!normalized) {
    return ''
  }
  return normalized.length > 16 ? `${normalized.slice(0, 12)}...${normalized.slice(-6)}` : normalized
}

function applyRemoteSnapshotToEditor(editor: Editor | null, snapshot: CanvasSnapshotFromEditor | null) {
  if (!editor || !snapshot) {
    const result = createRemoteSnapshotApplyResult('missing_editor_or_snapshot', {
      hasEditor: Boolean(editor),
      hasSnapshot: Boolean(snapshot),
      currentRecordCount: 0,
      nextRecordCount: 0,
      putCount: 0,
      removeCount: 0
    })
    canvasWorkbenchDebug.info('snapshot.replace.skipped', summarizeRemoteSnapshotApplyResult(result))
    return result
  }
  const currentSnapshot = safeCall(() => editor.store.getStoreSnapshot())
  if (!currentSnapshot) {
    const result = createRemoteSnapshotApplyResult('missing_current_snapshot', {
      hasEditor: true,
      hasSnapshot: true,
      currentRecordCount: 0,
      nextRecordCount: Object.keys(snapshot.store).length,
      putCount: 0,
      removeCount: 0
    })
    canvasWorkbenchDebug.info('snapshot.replace.skipped', summarizeRemoteSnapshotApplyResult(result))
    return result
  }

  const nextRecords = Object.values(snapshot.store).filter(isCanvasDocumentRecord)
  const nextIds = new Set(nextRecords.map((record) => record.id))
  const currentRecords = Object.values(currentSnapshot.store).filter(isCanvasDocumentRecord)
  const removeIds = currentRecords.map((record) => record.id).filter((id) => !nextIds.has(id))
  const putRecords = nextRecords.filter((record) => !sameCanvasRecord(currentSnapshot.store[record.id], record))

  if (!removeIds.length && !putRecords.length) {
    const result = createRemoteSnapshotApplyResult('no_diff', {
      hasEditor: true,
      hasSnapshot: true,
      currentRecordCount: currentRecords.length,
      nextRecordCount: nextRecords.length,
      putCount: 0,
      removeCount: 0
    })
    canvasWorkbenchDebug.info('snapshot.replace.skipped', summarizeRemoteSnapshotApplyResult(result))
    return result
  }
  const applied = safeCall(() => {
    editor.store.mergeRemoteChanges(() => {
      if (removeIds.length) {
        editor.store.remove(removeIds)
      }
      if (putRecords.length) {
        editor.store.put(putRecords)
      }
    })
    return true
  })
  if (!applied) {
    const result = createRemoteSnapshotApplyResult('merge_failed', {
      hasEditor: true,
      hasSnapshot: true,
      currentRecordCount: currentRecords.length,
      nextRecordCount: nextRecords.length,
      putCount: putRecords.length,
      removeCount: removeIds.length
    })
    canvasWorkbenchDebug.warn('snapshot.replace.skipped', summarizeRemoteSnapshotApplyResult(result))
    return result
  }
  const result = createRemoteSnapshotApplyResult('applied', {
    currentRecordCount: currentRecords.length,
    nextRecordCount: nextRecords.length,
    putCount: putRecords.length,
    removeCount: removeIds.length
  })
  canvasWorkbenchDebug.info('snapshot.replace.applied', summarizeRemoteSnapshotApplyResult(result))
  return result
}

function isCanvasDocumentRecord(record: CanvasSnapshotRecord) {
  return typeof record.typeName === 'string' && PERSISTENT_TLDRAW_RECORD_TYPENAMES.has(record.typeName)
}

function sameCanvasRecord(left: CanvasSnapshotRecord | undefined, right: CanvasSnapshotRecord) {
  return Boolean(left) && JSON.stringify(left) === JSON.stringify(right)
}

function normalizeDocumentId(value: RemotePayloadValue | string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function normalizeOptionalString(value: RemotePayloadValue | string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function safeCall<T>(fn: () => T): T | null {
  try {
    return fn()
  } catch {
    return null
  }
}

function resolveTldrawLocale(locale: string | null | undefined) {
  const normalized = normalizeHostLocale(locale)
  const candidates = normalized ? [normalized, normalized.split('-')[0]] : []
  if (normalized === 'zh' || normalized === 'zh-cn' || normalized === 'zh-hans' || normalized === 'zh-sg') {
    candidates.unshift('zh-cn')
  }
  if (normalized === 'zh-tw' || normalized === 'zh-hant' || normalized === 'zh-hk' || normalized === 'zh-mo') {
    candidates.unshift('zh-tw')
  }
  for (const candidate of candidates) {
    if (candidate && TLDRAW_LOCALES.has(candidate)) {
      return candidate
    }
  }
  return 'en'
}

function normalizeHostLocale(locale: string | null | undefined) {
  return locale?.trim().replace(/_/g, '-').toLowerCase() ?? ''
}

function resolveHostColorScheme(theme: RemotePayloadValue | undefined): HostColorScheme {
  return (
    readColorSchemeFromValue(theme) ??
    readColorSchemeFromString(document.documentElement.dataset.theme) ??
    readColorSchemeFromString(document.body?.dataset.theme) ??
    readColorSchemeFromString(document.documentElement.className) ??
    readColorSchemeFromString(document.body?.className) ??
    colorSchemeFromCssBackground() ??
    (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  )
}

function readColorSchemeFromValue(value: RemotePayloadValue | undefined): HostColorScheme | null {
  const direct = typeof value === 'string' ? readColorSchemeFromString(value) : null
  if (direct || !isRemoteObject(value)) {
    return direct
  }
  for (const key of ['mode', 'theme', 'colorScheme', 'appearance', 'name', 'type']) {
    const nested = value[key]
    if (typeof nested === 'string') {
      const scheme = readColorSchemeFromString(nested)
      if (scheme) {
        return scheme
      }
    }
  }
  return null
}

function readColorSchemeFromString(value: string | undefined): HostColorScheme | null {
  const normalized = value?.toLowerCase()
  if (!normalized) {
    return null
  }
  if (normalized.includes('dark')) {
    return 'dark'
  }
  if (normalized.includes('light')) {
    return 'light'
  }
  return null
}

function colorSchemeFromCssBackground(): HostColorScheme | null {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
  const match = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(value)
  if (!match) {
    return null
  }
  const red = Number(match[1])
  const green = Number(match[2])
  const blue = Number(match[3])
  if (![red, green, blue].every((channel) => Number.isFinite(channel))) {
    return null
  }
  return (red * 299 + green * 587 + blue * 114) / 1000 < 128 ? 'dark' : 'light'
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Missing canvas workbench root element')
}
createRoot(rootElement).render(<App />)
