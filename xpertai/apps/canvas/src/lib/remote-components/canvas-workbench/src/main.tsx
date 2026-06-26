import 'tldraw/tldraw.css'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Tldraw, createShapeId } from 'tldraw'
import type { Editor, TLFrameShape, TLShape } from 'tldraw'
import { toRichText } from '@tldraw/tlschema'
import {
  Badge,
  Button,
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
  Separator,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTitle,
  SidebarTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Upload,
  installShadcnThemeVars
} from '@xpert-ai/plugin-shadcn-ui'
import { createTranslator } from './i18n'
import { injectStyles } from './styles'
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
  CANVAS_CONTEXT_COMMAND,
  createCanvasSelectionContext,
  createCanvasSelectionSignature
} from './selection-context'
import type { CanvasSelectionContext } from './selection-context'
import { shouldRefreshForCanvasToolEvent } from './tool-event-refresh'

type DocumentItem = RemotePayloadObject & {
  id: string
  title?: string
  kind?: string
  status?: string
  currentVersionId?: string | null
  currentVersionNumber?: number | null
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
}

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
const h: typeof React.createElement = React.createElement

function isAiImageHolderFrame(shape: TLShape): shape is TLFrameShape {
  return shape.type === 'frame' && Boolean(shape.meta?.canvasAiImageHolder || shape.meta?.cowartAiImageHolder)
}

installShadcnThemeVars({ styleId: 'canvas-workbench-shadcn-ui-vars' })
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
  const [leftCollapsed, setLeftCollapsed] = React.useState(true)
  const [rightCollapsed, setRightCollapsed] = React.useState(true)
  const [editor, setEditor] = React.useState<Editor | null>(null)
  const [sceneKey, setSceneKey] = React.useState('empty')
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const detailRef = React.useRef<DetailPayload | null>(null)
  const dirtyRef = React.useRef(false)
  const autosaveTimerRef = React.useRef<number | null>(null)
  const lastAutosaveSignatureRef = React.useRef('')
  const loadSequenceRef = React.useRef(0)
  const autosaveInFlightRef = React.useRef<Promise<SavePayload | null> | null>(null)
  const editorRef = React.useRef<Editor | null>(null)
  const selectedIdRef = React.useRef('')
  const selectionSignatureRef = React.useRef('')
  const t = createTranslator(context?.locale)

  React.useEffect(() => {
    setRuntimeText({
      requestTimeout: t('requestTimeout'),
      remoteRequestFailed: t('remoteRequestFailed'),
      unknownError: t('unknownError')
    })
  }, [context?.locale])

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
      if (shouldRefreshForCanvasToolEvent(event)) {
        void loadData(selectedIdRef.current, { silent: true })
      }
    })
    post('ready')
    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [])

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

    const syncSelection = () => {
      const currentDetail = detailRef.current
      const document = currentDetail?.item
      if (!document) {
        return
      }
      const selectedShapes = safeCall(() => editor.getSelectedShapes()) ?? []
      const pageId = safeCall(() => editor.getCurrentPageId()) ?? null
      const canvasContext = createCanvasSelectionContext({
        document,
        version: currentDetail?.currentVersion,
        selectedShapes,
        pageId,
        dirty: dirtyRef.current,
        sceneSource: currentDetail?.sceneSource ?? (currentDetail?.workingCopy ? 'autosave' : 'version'),
        snapshotImagePath: currentDetail?.snapshotImagePath ?? currentDetail?.workingCopy?.snapshotImagePath ?? '',
        snapshotImageUpdatedAt: currentDetail?.snapshotImageUpdatedAt ?? currentDetail?.workingCopy?.autosaveUpdatedAt ?? ''
      })
      const signature = createCanvasSelectionSignature(canvasContext)
      if (signature === selectionSignatureRef.current) {
        return
      }
      selectionSignatureRef.current = signature
      void invokeClientCommand(CANVAS_CONTEXT_COMMAND, {
        env: {
          canvasDocumentId: document.id ?? '',
          canvasVersionId: document.currentVersionId ?? currentDetail?.currentVersion?.id ?? '',
          canvasPageId: pageId ?? '',
          canvasSelectionJson: JSON.stringify(canvasContext.currentCanvas.selection),
          canvasContextJson: JSON.stringify(canvasContext),
          canvasSceneDirty: dirtyRef.current ? 'true' : 'false',
          canvasSnapshotImagePath: currentDetail?.snapshotImagePath ?? currentDetail?.workingCopy?.snapshotImagePath ?? '',
          canvasSnapshotImageUpdatedAt: currentDetail?.snapshotImageUpdatedAt ?? currentDetail?.workingCopy?.autosaveUpdatedAt ?? '',
          canvasSceneSource: currentDetail?.sceneSource ?? (currentDetail?.workingCopy ? 'autosave' : 'version')
        },
        context: canvasContext
      }).catch(() => undefined)
    }

    const timer = window.setInterval(syncSelection, 600)
    const unsubscribeDocument = safeCall(() =>
      editor.store.listen(
        () => {
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
          if (!hasPersistentCanvasViewStateChange(entry.changes)) {
            return
          }
          setDirty(true)
          scheduleAutosave()
          syncSelection()
        },
        { source: 'user', scope: 'session' }
      )
    )
    syncSelection()

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

  async function loadData(documentId = selectedId, options: { silent?: boolean } = {}) {
    const sequence = ++loadSequenceRef.current
    const requestedDocumentId = normalizeDocumentId(documentId)
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
      const docs = toDocumentItems(asPayloadObject(payload.documents).items ?? asPayloadObject(payload.table).items)
      setDocuments(docs)
      const nextDetail = toDetailPayload(payload.detail)
      setDetail(nextDetail)
      const nextSelectedId = nextDetail?.item?.id ?? requestedDocumentId ?? docs[0]?.id ?? ''
      setSelectedId(nextSelectedId)
      const loadedSnapshot = getDetailSnapshot(nextDetail)
      const loadedSignature = loadedSnapshot
        ? createAutosaveSignature({
            documentId: nextDetail?.item?.id ?? nextSelectedId,
            snapshot: loadedSnapshot,
            viewState: getDetailViewState(nextDetail),
            selectionSummary: getDetailSelectionSummary(nextDetail)
          })
        : ''
      lastAutosaveSignatureRef.current = loadedSignature
      if (sequence === loadSequenceRef.current && (!options.silent || !dirtyRef.current)) {
        setSceneKey(createSceneKey(nextSelectedId, loadedSignature, nextDetail))
      }
      setDirty(false)
      setTimeout(reportResize, 0)
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
    } finally {
      if (!options.silent) {
        setBusy(false)
      }
    }
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
      const documentId =
        asPayloadObject(payload.item).id ??
        asPayloadObject(asPayloadObject(payload.data).item).id ??
        asPayloadObject(asPayloadObject(payload.document).item).id
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
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null
      void performAutosave({ force: false, notifyUser: false }).catch((error) =>
        notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
      )
    }, AUTOSAVE_DEBOUNCE_MS)
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
      })
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

    const task = (async () => {
      const savePayload = await buildSavePayload()
      if (!savePayload) {
        return null
      }
      if (!options.force && savePayload.signature === lastAutosaveSignatureRef.current) {
        setDirty(false)
        return savePayload
      }
      setAutosaving(true)
      const response = await executeAction('autosave_snapshot', savePayload.document.id, asRemotePayloadObject({
        documentId: savePayload.document.id,
        snapshot: asRemotePayloadObject(savePayload.snapshot),
        viewState: asRemotePayloadObject(savePayload.viewState),
        selectionSummary: asRemotePayloadObject(savePayload.selectionSummary),
        snapshotImage: asRemotePayloadObject(savePayload.snapshotImage),
        changeSummary: 'Workbench autosave'
      }))
      const actionPayload = asPayloadObject(getResponsePayload(response))
      const result = asPayloadObject(actionPayload.data ?? actionPayload)
      const autosaveResult = result.autosave
      if (isRemoteObject(autosaveResult)) {
        setDetail((previous) => mergeAutosaveResult(previous, autosaveResult, savePayload))
      }
      lastAutosaveSignatureRef.current = savePayload.signature
      setDirty(false)
      if (options.notifyUser) {
        notify('success', t('saved'))
      }
      return savePayload
    })()

    autosaveInFlightRef.current = task
    try {
      return await task
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
        await loadData(normalizeDocumentId(asPayloadObject(asPayloadObject(result.document).item).id) || current.id, { silent: true })
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
        normalizeDocumentId(asPayloadObject(asPayloadObject(payload.document).item).id) || normalizeDocumentId(asPayloadObject(payload.item).id) || selectedId
      )
    } catch (error) {
      notify('error', getErrorMessage(error instanceof Error ? error : String(error)))
    } finally {
      setBusy(false)
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

  const current = detail?.item
  const snapshot = getDetailSnapshot(detail)
  const canvasKey = `${current?.id ?? 'empty'}:${sceneKey}`
  const statusVariant: 'warning' | 'success' = autosaving ? 'warning' : dirty ? 'warning' : 'success'
  const statusText = autosaving ? t('saving') : dirty ? t('dirty') : t('synced')

  return (
    <TooltipProvider>
      <div className={`cw-root ${leftCollapsed ? 'left-collapsed' : ''} ${rightCollapsed ? 'right-collapsed' : ''}`}>
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
                <SidebarTitle>{t('documents')}</SidebarTitle>
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
                <ScrollArea className="cw-list-scroll">
                  <SidebarMenu className="cw-document-list">
                    {documents.map((document) => (
                      <SidebarMenuItem key={document.id}>
                        <SidebarMenuButton
                          className="cw-document-button"
                          active={document.id === current?.id}
                          onClick={() => loadData(document.id)}
                        >
                          <span className="cw-item-title">{document.title}</span>
                          <span className="cw-item-meta">
                            {document.kind} / {document.status} / v{document.currentVersionNumber ?? 0}
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
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
              <Badge className="cw-status" variant={statusVariant}>
                {statusText}
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" disabled={!current || busy || autosaving} onClick={() => saveCanvas(false)}>
                    <Save className="cw-button-icon" />
                    {t('save')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('save')}</TooltipContent>
              </Tooltip>
              <Button size="sm" variant="outline" disabled={!current || busy || autosaving} onClick={() => saveCanvas(true)}>
                <FileJson className="cw-button-icon" />
                {t('newVersion')}
              </Button>
              <Separator orientation="vertical" className="cw-separator" />
              <Button size="sm" variant="outline" disabled={!current || busy} onClick={createAiHolder}>
                <Image className="cw-button-icon" />
                {t('aiHolder')}
              </Button>
              <Button size="sm" variant="outline" disabled={!current || busy} onClick={createAnnotation}>
                {t('annotation')}
              </Button>
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
                snapshot={snapshot || undefined}
                onMount={(nextEditor: Editor) => {
                  const viewState = getDetailViewState(detailRef.current)
                  applyCanvasViewState(nextEditor, viewState)
                  if (typeof window.requestAnimationFrame === 'function') {
                    window.requestAnimationFrame(() => applyCanvasViewState(nextEditor, viewState))
                  }
                  setEditor(nextEditor)
                  selectionSignatureRef.current = ''
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
                <SidebarTitle>{current?.title ?? t('details')}</SidebarTitle>
              </SidebarHeader>
              <SidebarContent className="cw-inspector-content">
                {current ? (
                  <Tabs defaultValue="versions" className="cw-tabs">
                    <TabsList className="cw-tabs-list">
                      <TabsTrigger value="versions">{t('versions')}</TabsTrigger>
                      <TabsTrigger value="logs">{t('logs')}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="versions" className="cw-tab-content">
                      <ScrollArea className="cw-inspector-scroll">
                        <div className="cw-inspector-list">
                          {(detail?.versions ?? []).map((version) => (
                            <div key={version.id} className="cw-version">
                              <div>
                                <strong>v{version.versionNumber}</strong>
                                <div className="cw-item-meta">{version.changeSummary || version.sourceType}</div>
                              </div>
                              <Button
                                size="sm"
                                variant={version.id === current.currentVersionId ? 'secondary' : 'outline'}
                                onClick={() =>
                                  executeAction('restore_version', current.id, { documentId: current.id, versionId: version.id })
                                    .then(() => loadData(current.id))
                                    .catch((error) => notify('error', getErrorMessage(error instanceof Error ? error : String(error))))
                                }
                              >
                                {version.id === current.currentVersionId ? t('current') : t('restore')}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                    <TabsContent value="logs" className="cw-tab-content">
                      <ScrollArea className="cw-inspector-scroll">
                        <div className="cw-inspector-list">
                          {(detail?.logs ?? []).map((log) => (
                            <div key={log.id ?? `${log.action}-${log.createdAt}`} className="cw-log">
                              <strong>{log.action}</strong>
                              <div>{log.message || log.errorMessage || ''}</div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                ) : null}
              </SidebarContent>
            </>
          )}
        </Sidebar>
      </div>
    </TooltipProvider>
  )
}

function getDetailSnapshot(detail: DetailPayload | null | undefined): CanvasSnapshotFromEditor | null {
  const snapshot = detail?.workingCopy?.snapshot ?? detail?.currentVersion?.snapshot ?? null
  return isRemoteObject(snapshot) ? (snapshot as object as CanvasSnapshotFromEditor) : null
}

function getDetailViewState(detail: DetailPayload | null | undefined): RemotePayloadObject | null {
  const viewState = detail?.workingCopy?.viewState ?? detail?.currentVersion?.viewState ?? null
  return isRemoteObject(viewState) ? viewState : null
}

function getDetailSelectionSummary(detail: DetailPayload | null | undefined): RemotePayloadObject | null {
  const selectionSummary = detail?.workingCopy?.selectionSummary ?? detail?.currentVersion?.selectionSummary ?? null
  return isRemoteObject(selectionSummary) ? selectionSummary : null
}

function asPayloadObject(value: RemotePayloadValue | null | undefined): RemotePayloadObject {
  return isRemoteObject(value) ? value : {}
}

function asRemotePayloadObject(value: object): RemotePayloadObject {
  return value as RemotePayloadObject
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
    snapshotImageUpdatedAt: typeof object.snapshotImageUpdatedAt === 'string' ? object.snapshotImageUpdatedAt : null
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
  const snapshotImagePath = autosaveImagePath ?? detail.snapshotImagePath ?? null
  const snapshotImageUpdatedAt = autosaveUpdatedAt ?? detail.snapshotImageUpdatedAt ?? null
  return {
    ...detail,
    sceneSource: 'autosave',
    snapshotImagePath,
    snapshotImageUpdatedAt,
    item: detail.item
      ? {
          ...detail.item,
          status: detail.item.status === 'archived' ? detail.item.status : 'draft',
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
          snapshotImagePath
        }
      : {
          snapshot: asRemotePayloadObject(savePayload.snapshot),
          viewState: asRemotePayloadObject(savePayload.viewState),
          selectionSummary: asRemotePayloadObject(savePayload.selectionSummary),
          autosaveUpdatedAt,
          autosaveBaseVersionId,
          snapshotImagePath
        }
  }
}

function normalizeDocumentId(value: RemotePayloadValue | string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function safeCall<T>(fn: () => T): T | null {
  try {
    return fn()
  } catch {
    return null
  }
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Missing canvas workbench root element')
}
createRoot(rootElement).render(<App />)
