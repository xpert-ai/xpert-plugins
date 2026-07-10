import { createApp, computed, defineComponent, h, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { Label } from '@xpert-ai/plugin-shadcn-vue'
import '@xpert-ai/plugin-shadcn-vue/style.css'
import './styles/theme.css'
import pencilLogoSvg from '../../../../../assets/logo.svg?raw'
import {
  EDITOR_TOOLS,
  LayerTreeRoot,
  PageListRoot,
  ToolbarRoot,
  createEditor,
  provideEditor,
  toolCursor,
  useCanvas,
  useCanvasInput,
  useEditor,
  useTextEdit
} from '@open\u002dpencil/vue'
import { BUILTIN_IO_FORMATS, IORegistry } from '@open\u002dpencil/core'
import { renderJSX } from '@open\u002dpencil/core/design-jsx'
import { computeAllLayouts } from '@open\u002dpencil/core/layout'
import { SceneGraph } from '@open\u002dpencil/core/scene-graph'
import type { Color, Fill, SceneNode, Stroke } from '@open\u002dpencil/core/scene-graph'
import type { Tool } from '@open\u002dpencil/vue'
import {
  executeAction,
  executeFileAction,
  getErrorMessage,
  getResponsePayload,
  invokeClientCommand,
  isObject,
  notify,
  reportResize,
  requestData,
  startRemoteBridge
} from './runtime.js'
import type { RemoteBridgeContext, RemotePayloadObject, RemotePayloadValue } from './runtime.js'
import { pencilWorkbenchDebug } from './debug-logger.js'
import { preparePencilFonts } from './fonts.js'
import { actionLabel, editorToolLabel, formatDate, normalizeLocale, statusText, translate, uiValueLabel } from './i18n.js'
import type { MessageKey } from './i18n.js'
import {
  findSnapshotNode,
  flattenLayerTreeItems,
  formatNumberLike,
  graphFromSnapshot,
  isGraphSnapshot,
  nodeToPayloadObject,
  normalizeSummary,
  parseGraphText,
  readLayerEntry,
  readNestedString,
  snapshotFromGraph,
  summarizeEditorGraph,
  summarizeSnapshot
} from './graph.js'
import { layerIcon, renderIcon, toolIcon } from './icons.js'
import {
  renderBadge,
  renderButton,
  renderColorControl,
  renderDefinitionList,
  renderInput,
  renderNumberControl,
  renderPanel,
  renderSegmented,
  renderSelect,
  renderSelectControl,
  renderTabButton,
  renderTextAreaControl
} from './ui.js'
import type { DetailPayload, DocumentItem, GraphSnapshot, InspectorTab, Summary } from './types.js'
import CodeInspector from './components/CodeInspector.vue'
import DeleteDocumentDialog from './components/DeleteDocumentDialog.vue'
import DocumentSwitcher from './components/DocumentSwitcher.vue'
import InlineDocumentTitle from './components/InlineDocumentTitle.vue'
import TopToolbar from './components/TopToolbar.vue'
import WorkbenchShell from './components/WorkbenchShell.vue'

type LeftPanelTab = 'file' | 'assets'
type InlineDocumentTitleHandle = { focus: () => void }

const ASSISTANT_CONTEXT_SET_COMMAND = 'assistant.context.set'
const AUTOSAVE_DELAY_MS = 1200
const DOCUMENT_CREATING_TOOL_NAMES = new Set(['pencil_create_document', 'pencil_create_sample_document'])
const PAGE_CREATING_TOOL_NAMES = new Set(['pencil_create_page', 'create_page'])
const PENCIL_LOGO_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pencilLogoSvg)}`
const STUDIO_RULER_THEME = {
  background: { r: 0.902, g: 0.925, b: 0.961, a: 1 },
  tick: { r: 0.565, g: 0.639, b: 0.741, a: 1 },
  text: { r: 0.392, g: 0.455, b: 0.545, a: 1 },
  label: { r: 1, g: 1, b: 1, a: 1 }
}
const DEFAULT_SOLID_FILL: Fill = {
  type: 'SOLID',
  color: { r: 1, g: 1, b: 1, a: 1 },
  opacity: 1,
  visible: true
}
const DEFAULT_STROKE: Stroke = {
  color: { r: 0, g: 0, b: 0, a: 1 },
  weight: 1,
  opacity: 1,
  visible: true,
  align: 'INSIDE'
}

type PencilEditor = ReturnType<typeof createEditor>

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, value))
}

function positiveNumber(value: number) {
  return Math.max(1, Number.isFinite(value) ? value : 1)
}

function colorChannelToHex(value: number) {
  return Math.round(clampNumber(value, 0, 1) * 255)
    .toString(16)
    .padStart(2, '0')
}

function colorToHex(color?: Color | null) {
  const next = color ?? DEFAULT_SOLID_FILL.color
  return `#${colorChannelToHex(next.r)}${colorChannelToHex(next.g)}${colorChannelToHex(next.b)}`
}

function hexToColor(value: string, alpha = 1): Color {
  const normalized = /^#[0-9a-f]{6}$/iu.test(value) ? value.slice(1) : 'ffffff'
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16) / 255,
    g: Number.parseInt(normalized.slice(2, 4), 16) / 255,
    b: Number.parseInt(normalized.slice(4, 6), 16) / 255,
    a: alpha
  }
}

function cloneFills(fills: Fill[]): Fill[] {
  return fills.map((fill) => ({ ...fill, color: { ...fill.color } }))
}

function cloneStrokes(strokes: Stroke[]): Stroke[] {
  return strokes.map((stroke) => ({
    ...stroke,
    color: { ...stroke.color },
    ...(stroke.dashPattern ? { dashPattern: [...stroke.dashPattern] } : {})
  }))
}

/** Defers zoom-to-fit until both canvases have measured their final Workbench size. */
function scheduleCanvasFocus(editor: PencilEditor) {
  requestAnimationFrame(() => {
    editor.zoomToFit()
    editor.requestRender()
    window.setTimeout(() => editor.requestRender(), 80)
  })
}

/** Draws document content; pointer interaction is intentionally delegated to the overlay canvas. */
const PencilSceneCanvas = defineComponent({
  name: 'PencilSceneCanvas',
  emits: ['ready'],
  setup(_props, { emit }) {
    const editor = useEditor()
    const canvasRef = ref<HTMLCanvasElement | null>(null)
    useCanvas(canvasRef, editor, {
      layer: 'scene',
      showRulers: false,
      preserveDrawingBuffer: true,
      onReady: () => {
        pencilWorkbenchDebug('scene canvas ready', {
          width: canvasRef.value?.clientWidth ?? 0,
          height: canvasRef.value?.clientHeight ?? 0,
          pageId: editor.state.currentPageId,
          renderers: editor.canvasRenderers.length
        })
        emit('ready')
        scheduleCanvasFocus(editor)
      }
    })
    return () =>
      h('canvas', {
        ref: canvasRef,
        class: 'pencil-canvas-layer pencil-scene-canvas',
        'aria-hidden': 'true'
      })
  }
})

/** Draws rulers, selection affordances, and owns pointer and text-edit input. */
const PencilOverlayCanvas = defineComponent({
  name: 'PencilOverlayCanvas',
  setup() {
    const editor = useEditor()
    const canvasRef = ref<HTMLCanvasElement | null>(null)
    const { hitTestSectionTitle, hitTestComponentLabel, hitTestFrameTitle } = useCanvas(canvasRef, editor, {
      layer: 'overlays',
      showRulers: true,
      preserveDrawingBuffer: true,
      onReady: () => {
        pencilWorkbenchDebug('overlay canvas ready', {
          width: canvasRef.value?.clientWidth ?? 0,
          height: canvasRef.value?.clientHeight ?? 0,
          pageId: editor.state.currentPageId,
          renderers: editor.canvasRenderers.length
        })
        editor.requestRender()
      }
    })
    const { cursorOverride } = useCanvasInput(canvasRef, editor, hitTestSectionTitle, hitTestComponentLabel, hitTestFrameTitle)
    useTextEdit(canvasRef, editor)
    const cursor = computed(() => toolCursor(editor.state.activeTool, cursorOverride.value))
    return () =>
      h('canvas', {
        ref: canvasRef,
        class: 'pencil-canvas-layer pencil-overlay-canvas',
        tabindex: '-1',
        style: { cursor: cursor.value }
      })
  }
})

const App = defineComponent({
  name: 'PencilWorkbench',
  setup() {
    // Prevent remote hydration and JSON synchronization from being mistaken for local edits.
    let applyingRemoteGraph = false
    let sceneCanvasReady = false
    let graphMutationRevision = 0
    let autosaveTimer: number | null = null
    let autosavePromise: Promise<void> | null = null
    let autosaveQueued = false
    const editor = createEditor({
      getViewportSize: () => ({
        width: Math.max(320, window.innerWidth - 640),
        height: Math.max(320, window.innerHeight - 120)
      })
    })
    editor.state.rulerTheme = STUDIO_RULER_THEME
    provideEditor(editor)
    const state = reactive({
      documents: [] as DocumentItem[],
      detail: null as DetailPayload | null,
      selectedDocumentId: '',
      selectedNodeId: '',
      graphText: '',
      search: '',
      status: '',
      titleDraft: '',
      editingTitle: false,
      deleteDialogOpen: false,
      exportFormat: 'fig',
      exportMessage: '',
      busy: false,
      autosaving: false,
      dirty: false,
      error: '',
      editorRevision: 0,
      graphTextEdited: false,
      leftPanelTab: 'file' as LeftPanelTab,
      inspectorTab: 'properties' as InspectorTab,
      leftPanelCollapsed: false,
      inspectorPanelCollapsed: false,
      locale: normalizeLocale(typeof navigator === 'undefined' ? undefined : navigator.language)
    })
    const titleEditor = ref<InlineDocumentTitleHandle | null>(null)
    const editorUnsubscribers: Array<() => void> = []

    const text = (key: MessageKey, values?: Record<string, string | number>) => translate(state.locale, key, values)
    const selectEntries = (values: string[]) => values.map((value) => ({ value, label: uiValueLabel(value, state.locale) }))

    const getActionPayload = (response: Parameters<typeof getResponsePayload>[0]) => {
      const payload = getResponsePayload(response)
      if (isObject(payload) && payload.success === false) {
        throw new Error(readActionMessage(payload) ?? text('actionFailed'))
      }
      return isObject(payload) && isObject(payload.data) ? payload.data : payload
    }

    function readActionMessage(payload: RemotePayloadObject) {
      const message = payload.message
      if (typeof message === 'string' && message.trim()) {
        return message.trim()
      }
      if (!isObject(message)) {
        return undefined
      }
      return (
        readNestedString(message, [state.locale === 'zh' ? 'zh_Hans' : 'en_US']) ??
        readNestedString(message, ['zh_Hans']) ??
        readNestedString(message, ['en_US'])
      )
    }

    const selectedSnapshot = computed<GraphSnapshot | null>(() => {
      const graphSnapshot = state.detail?.graphSnapshot
      if (isGraphSnapshot(graphSnapshot)) {
        return graphSnapshot
      }
      const workingCopy = state.detail?.workingCopy
      const workingGraph = isObject(workingCopy) ? workingCopy.graphSnapshot : null
      return isGraphSnapshot(workingGraph) ? workingGraph : null
    })

    const canUseDocument = computed(() => Boolean(state.detail?.item?.id))
    const summary = computed<Summary>(() => {
      state.editorRevision
      return canUseDocument.value ? summarizeEditorGraph(editor) : normalizeSummary(state.detail?.snapshotSummary, selectedSnapshot.value)
    })
    const versions = computed(() => (Array.isArray(state.detail?.versions) ? state.detail?.versions ?? [] : []))
    const logs = computed(() => (Array.isArray(state.detail?.logs) ? state.detail?.logs ?? [] : []))
    const selectedNode = computed(() => {
      state.editorRevision
      return nodeToPayloadObject(editor.graph.getNode(state.selectedNodeId)) ?? findSnapshotNode(selectedSnapshot.value, state.selectedNodeId)
    })
    const currentTitle = computed(() => state.detail?.item?.title ?? text('noDocument'))

    /** Loads the paged document list and one full detail graph through the host bridge. */
    async function loadData(documentId?: string, options?: { pageId?: string | null }) {
      state.busy = true
      state.error = ''
      try {
        const response = await requestData({
          search: state.search || undefined,
          parameters: {
            ...(documentId ? { documentId } : {}),
            ...(state.status ? { status: state.status } : {})
          }
        })
        const payload = getResponsePayload(response)
        if (!isObject(payload)) {
          throw new Error(text('errorEmptyResponse'))
        }
        const documentsPayload = isObject(payload.documents) ? payload.documents : null
        state.documents = Array.isArray(documentsPayload?.items) ? (documentsPayload.items.filter(isObject) as DocumentItem[]) : []
        state.detail = isObject(payload.detail) ? (payload.detail as DetailPayload) : null
        state.selectedDocumentId = state.detail?.item?.id ?? state.documents[0]?.id ?? ''
        state.titleDraft = state.detail?.item?.title ?? ''
        state.editingTitle = false
        state.selectedNodeId = ''
        applyingRemoteGraph = true
        const snapshot = selectedSnapshot.value
        await applySnapshotToEditor(snapshot, options?.pageId ?? editor.state.currentPageId)
        state.dirty = false
        await updateAssistantContext()
      } catch (error) {
        state.error = friendlyErrorMessage(error)
      } finally {
        state.busy = false
        setTimeout(reportResize, 0)
      }
    }

    /** Publishes only compact selection/document context to the Assistant host. */
    async function updateAssistantContext() {
      const detail = state.detail
      const documentId = detail?.item?.id ?? ''
      if (!documentId) {
        await invokeClientCommand(ASSISTANT_CONTEXT_SET_COMMAND, {
          variables: {
            pencilDocumentId: '',
            pencilVersionId: '',
            pencilNodeId: '',
            pencilDirty: 'false',
            pencilSelectionJson: '',
            pencilContextJson: ''
          }
        }).catch((error) => pencilWorkbenchDebug('assistant context clear failed', error))
        return
      }
      const selectedNodeIds = state.selectedNodeId ? [state.selectedNodeId] : []
      const snapshot = currentGraphSnapshot()
      const context = {
        pencilDocumentId: documentId,
        pencilVersionId: String(detail?.item?.currentVersionId ?? ''),
        pencilNodeId: state.selectedNodeId,
        pencilDirty: state.dirty ? 'true' : 'false',
        pencilSelectionJson: JSON.stringify({ type: 'pencil.selection.v1', documentId, selectedNodeIds }),
        pencilContextJson: JSON.stringify({
          type: 'pencil.context.v1',
          documentId,
          title: detail?.item?.title,
          status: detail?.item?.status,
          currentVersionNumber: detail?.item?.currentVersionNumber,
          workingCopyRevision: detail?.workingCopyRevision,
          graphChecksum: detail?.graphChecksum,
          selectedNode: selectedNode.value,
          summary: summarizeSnapshot(snapshot)
        })
      }
      try {
        await invokeClientCommand(ASSISTANT_CONTEXT_SET_COMMAND, { variables: context })
      } catch (error) {
        pencilWorkbenchDebug('assistant context command failed', error)
      }
    }

    async function selectDocument(id: string | undefined) {
      if (!id || id === state.selectedDocumentId) {
        return
      }
      if (!(await ensureDraftSavedBeforeNavigation())) {
        return
      }
      await loadData(id)
    }

    async function createDocument() {
      state.busy = true
      state.error = ''
      try {
        if (!(await ensureDraftSavedBeforeNavigation())) {
          return
        }
        const response = await executeAction('create_document', null, {
          title: text('defaultDesignTitle'),
          changeSummary: text('documentCreated')
        })
        const payload = getActionPayload(response)
        const documentId = readNestedString(payload, ['item', 'id'])
        notify('success', text('documentCreated'))
        await loadData(documentId)
      } catch (error) {
        state.error = friendlyErrorMessage(error)
      } finally {
        state.busy = false
      }
    }

    async function createSampleDocument() {
      if (!(await ensureDraftSavedBeforeNavigation())) {
        return
      }
      state.busy = true
      state.error = ''
      try {
        const response = await executeAction('create_sample_document', null, {
          changeSummary: text('sampleCreated')
        })
        const payload = getActionPayload(response)
        const documentId = readNestedString(payload, ['item', 'id'])
        notify('success', text('sampleCreated'))
        await loadData(documentId)
      } catch (error) {
        state.error = friendlyErrorMessage(error)
      } finally {
        state.busy = false
      }
    }

    async function saveWorkingCopy() {
      const documentId = state.detail?.item?.id
      if (!documentId) {
        return
      }
      cancelAutosaveTimer()
      state.busy = true
      state.error = ''
      try {
        await persistWorkingCopy(documentId, text('workingCopySaved'))
        notify('success', text('workingCopySaved'))
        await loadData(documentId)
      } catch (error) {
        state.error = friendlyErrorMessage(error)
      } finally {
        state.busy = false
      }
    }

    async function persistWorkingCopy(documentId: string, changeSummary: string) {
      // Send both revision and checksum so stale tabs cannot silently overwrite newer graph state.
      const mutationRevisionAtStart = graphMutationRevision
      const graphSnapshot = graphSnapshotForAction()
      const response = await executeAction(
        'save_working_copy',
        documentId,
        {
          documentId,
          graphSnapshot,
          baseRevision: state.detail?.workingCopyRevision,
          baseGraphChecksum: state.detail?.graphChecksum,
          changeSummary
        },
        { documentId }
      )
      const payload = getActionPayload(response)
      applyWorkingCopyMetadata(payload)
      state.dirty = graphMutationRevision !== mutationRevisionAtStart
      await updateAssistantContext()
      return payload
    }

    /** Merges save_working_copy metadata into the local detail payload without remounting the canvas. */
    function applyWorkingCopyMetadata(payload: RemotePayloadValue | null | undefined) {
      if (!state.detail || !isObject(payload)) {
        return
      }
      const document = isObject(payload.document) ? payload.document : null
      const workingCopy = isObject(payload.workingCopy) ? payload.workingCopy : null
      const revision = readNumberField(document, 'workingCopyRevision') ?? readNumberField(workingCopy, 'workingCopyRevision')
      const checksum = readStringField(document, 'graphChecksum') ?? readStringField(workingCopy, 'graphChecksum')
      if (revision !== undefined) {
        state.detail.workingCopyRevision = revision
        if (state.detail.item) {
          state.detail.item.workingCopyRevision = revision
        }
      }
      if (checksum) {
        state.detail.graphChecksum = checksum
        if (state.detail.item) {
          state.detail.item.graphChecksum = checksum
        }
      }
      if (state.detail.item) {
        const status = readStringField(document, 'status')
        const updatedAt = readStringField(document, 'updatedAt') ?? readStringField(workingCopy, 'workingUpdatedAt')
        if (status) {
          state.detail.item.status = status
        }
        if (updatedAt) {
          state.detail.item.updatedAt = updatedAt
        }
      }
      if (isObject(payload.snapshotSummary)) {
        state.detail.snapshotSummary = payload.snapshotSummary
      }
    }

    function readNumberField(value: RemotePayloadObject | null, key: string) {
      const field = value?.[key]
      return typeof field === 'number' && Number.isFinite(field) ? field : undefined
    }

    function readStringField(value: RemotePayloadObject | null, key: string) {
      const field = value?.[key]
      return typeof field === 'string' && field.trim() ? field.trim() : undefined
    }

    function cancelAutosaveTimer() {
      if (autosaveTimer !== null) {
        window.clearTimeout(autosaveTimer)
        autosaveTimer = null
      }
    }

    function scheduleAutosave() {
      if (!state.detail?.item?.id) {
        return
      }
      cancelAutosaveTimer()
      autosaveTimer = window.setTimeout(() => {
        autosaveTimer = null
        void runAutosave()
      }, AUTOSAVE_DELAY_MS)
    }

    /** Saves local graph edits as a draft before navigation without forcing a full Workbench reload. */
    async function flushAutosaveNow() {
      cancelAutosaveTimer()
      await runAutosave(true)
    }

    async function ensureDraftSavedBeforeNavigation() {
      if (!state.dirty) {
        return true
      }
      try {
        await flushAutosaveNow()
        return true
      } catch {
        return window.confirm(text('discardConfirm'))
      }
    }

    async function runAutosave(force = false): Promise<void> {
      if (autosavePromise) {
        autosaveQueued = true
        return autosavePromise
      }
      const documentId = state.detail?.item?.id
      if (!documentId || !state.dirty || applyingRemoteGraph) {
        return
      }
      if (state.busy && !force) {
        scheduleAutosave()
        return
      }
      state.autosaving = true
      autosavePromise = (async () => {
        try {
          await persistWorkingCopy(documentId, text('autosaveChangeSummary'))
        } catch (error) {
          state.error = friendlyErrorMessage(error)
          state.dirty = true
          throw error
        } finally {
          state.autosaving = false
          autosavePromise = null
          if (autosaveQueued) {
            autosaveQueued = false
            if (state.dirty) {
              scheduleAutosave()
            }
          }
        }
      })()
      return autosavePromise
    }

    async function saveVersion() {
      const documentId = state.detail?.item?.id
      if (!documentId) {
        return
      }
      cancelAutosaveTimer()
      state.busy = true
      state.error = ''
      try {
        const graphSnapshot = graphSnapshotForAction()
        await executeAction(
          'save_version',
          documentId,
          {
            documentId,
            graphSnapshot,
            changeSummary: text('versionSaved')
          },
          { documentId }
        )
        state.dirty = false
        notify('success', text('versionSaved'))
        await loadData(documentId)
      } catch (error) {
        state.error = friendlyErrorMessage(error)
      } finally {
        state.busy = false
      }
    }

    async function restoreVersion(versionId: string | undefined) {
      const documentId = state.detail?.item?.id
      if (!documentId || !versionId) {
        return
      }
      state.busy = true
      state.error = ''
      try {
        await executeAction('restore_version', documentId, { documentId, versionId, changeSummary: text('versionRestored') }, { documentId })
        notify('success', text('versionRestored'))
        await loadData(documentId)
      } catch (error) {
        state.error = friendlyErrorMessage(error)
      } finally {
        state.busy = false
      }
    }

    async function updateStatus(status: 'draft' | 'reviewed' | 'archived') {
      const documentId = state.detail?.item?.id
      if (!documentId) {
        return
      }
      const action = status === 'archived' ? 'archive_document' : status === 'reviewed' ? 'mark_reviewed' : 'mark_draft'
      state.busy = true
      state.error = ''
      try {
        await executeAction(action, documentId, { documentId, reason: text('statusUpdated', { status: statusText(status, state.locale) }) }, { documentId })
        notify('success', text('statusUpdated', { status: statusText(status, state.locale) }))
        await loadData(documentId)
      } catch (error) {
        state.error = friendlyErrorMessage(error)
      } finally {
        state.busy = false
      }
    }

    /** Executes the irreversible aggregate deletion only after the controlled AlertDialog confirms intent. */
    async function deleteDocument() {
      const documentId = state.detail?.item?.id
      if (!documentId || state.busy) {
        return
      }
      state.busy = true
      state.error = ''
      try {
        await executeAction('delete_document', documentId, { documentId }, { documentId })
        state.deleteDialogOpen = false
        state.dirty = false
        state.detail = null
        state.selectedDocumentId = ''
        notify('success', text('documentDeleted'))
        await loadData()
      } catch (error) {
        state.error = friendlyErrorMessage(error)
      } finally {
        state.busy = false
      }
    }

    async function exportDocument() {
      const documentId = state.detail?.item?.id
      if (!documentId) {
        return
      }
      cancelAutosaveTimer()
      state.busy = true
      state.error = ''
      state.exportMessage = ''
      try {
        const result = await exportDocumentWithFallback(documentId)
        downloadExportBlob(result.blob, buildExportFileName(result.extension))
        state.exportMessage = text('exportSummary', {
          format: result.format,
          size: result.size,
          sha: result.sha256.slice(0, 12)
        })
        notify('success', state.exportMessage)
      } catch (error) {
        state.error = exportErrorMessage(error)
      } finally {
        state.busy = false
      }
    }

    async function exportDocumentWithFallback(documentId: string) {
      try {
        return await exportCurrentDocument(documentId)
      } catch (error) {
        if (state.exportFormat !== 'fig' || !canFallbackToClientFigExport(error)) {
          throw error
        }
        // Compatibility fallback is limited to known writer alignment failures.
        pencilWorkbenchDebug('server fig export failed, falling back to client export', getErrorMessage(error))
        return exportCurrentGraph()
      }
    }

    async function exportCurrentDocument(documentId: string) {
      if (state.dirty) {
        await persistWorkingCopy(documentId, text('workingCopySaved'))
      }
      const format = state.exportFormat
      const response = await executeAction(
        'export_document',
        documentId,
        {
          documentId,
          format,
          target: { scope: 'document' },
          fileName: buildExportFileName(format)
        },
        { documentId }
      )
      const payload = getActionPayload(response)
      if (!isObject(payload)) {
        throw new Error(text('errorEmptyResponse'))
      }
      return portableExportToDownload(payload, format)
    }

    async function exportCurrentGraph() {
      const format = state.exportFormat
      const graph = graphFromSnapshot(graphSnapshotForAction())
      normalizeGraphForClientExport(graph, format)
      const registry = new IORegistry(BUILTIN_IO_FORMATS)
      const target = buildClientExportTarget(graph, format)
      const options = buildClientExportOptions(format)
      const result =
        format === 'fig' && target.scope === 'document'
          ? await writeFigDocumentWithoutWorker(registry, graph, options)
          : await registry.exportContent(format, { graph, target, fileName: buildExportFileName(format) }, options)
      const bytes = exportDataToBytes(result.data)
      const blob = new Blob([typeof result.data === 'string' ? result.data : bytesToArrayBuffer(bytes)], { type: result.mimeType })
      return {
        format,
        extension: result.extension,
        mimeType: result.mimeType,
        size: bytes.byteLength,
        sha256: await sha256Hex(bytes),
        blob
      }
    }

    async function writeFigDocumentWithoutWorker(registry: IORegistry, graph: SceneGraph, options: Record<string, unknown>) {
      // The bundled writer can run synchronously when a worker URL is unavailable inside the isolated iframe.
      const workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
      try {
        Object.defineProperty(globalThis, 'Worker', {
          configurable: true,
          writable: true,
          value: undefined
        })
        return await registry.writeDocument('fig', graph, options)
      } finally {
        if (workerDescriptor) {
          Object.defineProperty(globalThis, 'Worker', workerDescriptor)
        } else {
          Reflect.deleteProperty(globalThis, 'Worker')
        }
      }
    }

    function buildClientExportTarget(graph: SceneGraph, format: string) {
      if (format === 'jsx') {
        const firstPage = graph.getPages()[0]
        return { scope: 'selection' as const, nodeIds: firstPage?.childIds ?? [] }
      }
      return { scope: 'document' as const }
    }

    function buildClientExportOptions(format: string): Record<string, unknown> {
      if (format === 'png') {
        return { scale: 1 }
      }
      if (format === 'jpg' || format === 'webp') {
        return { scale: 1, quality: 0.92 }
      }
      if (format === 'svg') {
        return { colorSpace: 'srgb' }
      }
      if (format === 'fig') {
        return { renderThumbnail: false }
      }
      if (format === 'jsx') {
        return { format: 'pencil' }
      }
      return {}
    }

    function normalizeGraphForClientExport(graph: SceneGraph, format: string) {
      if (format !== 'fig') {
        return
      }
      for (const node of graph.nodes.values()) {
        if (node.counterAxisAlign === 'STRETCH') {
          node.counterAxisAlign = 'MIN'
        }
        prepareTextGlyphFallbackForFigExport(node)
      }
    }

    function prepareTextGlyphFallbackForFigExport(node: SceneNode) {
      if (node.type !== 'TEXT') {
        return
      }
      const textNode = node as unknown as Record<string, unknown>
      if (Array.isArray(textNode.figmaDerivedTextGlyphs) && textNode.figmaDerivedTextGlyphs.length > 0) {
        return
      }
      const textValue = typeof textNode.text === 'string' ? textNode.text : ''
      if (!textValue) {
        return
      }
      const width = typeof textNode.width === 'number' && Number.isFinite(textNode.width) ? textNode.width : textValue.length
      const fontSize = typeof textNode.fontSize === 'number' && Number.isFinite(textNode.fontSize) ? textNode.fontSize : 12
      const glyphAdvance = width / Math.max(textValue.length, 1)
      // Empty command blobs preserve character advances when source glyph outlines are absent.
      textNode.figmaDerivedTextGlyphs = Array.from({ length: textValue.length }, (_, index) => ({
        commandsBlob: new Uint8Array(0),
        x: index * glyphAdvance,
        y: 0,
        fontSize
      }))
    }

    function exportDataToBytes(data: string | Uint8Array) {
      return typeof data === 'string' ? new TextEncoder().encode(data) : data
    }

    function portableExportToDownload(payload: RemotePayloadObject, fallbackFormat: string) {
      const inline = typeof payload.inline === 'string' ? payload.inline : ''
      if (!inline) {
        throw new Error(text('errorEmptyResponse'))
      }
      const encoding = typeof payload.encoding === 'string' ? payload.encoding : ''
      const bytes = encoding === 'utf8' ? new TextEncoder().encode(inline) : base64ToBytes(inline)
      const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType : 'application/octet-stream'
      const extension = typeof payload.extension === 'string' ? payload.extension : fallbackFormat
      const format = typeof payload.format === 'string' ? payload.format : fallbackFormat
      const sha256 = typeof payload.sha256 === 'string' ? payload.sha256 : ''
      const reportedSize = typeof payload.size === 'number' ? payload.size : bytes.byteLength
      return {
        format,
        extension,
        mimeType,
        size: reportedSize,
        sha256,
        blob: new Blob([bytesToArrayBuffer(bytes)], { type: mimeType })
      }
    }

    function base64ToBytes(value: string) {
      const binary = atob(value)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
      }
      return bytes
    }

    function bytesToArrayBuffer(bytes: Uint8Array) {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    }

    async function sha256Hex(bytes: Uint8Array) {
      if (!globalThis.crypto?.subtle) {
        return ''
      }
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytesToArrayBuffer(bytes))
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    }

    function downloadExportBlob(blob: Blob, fileName: string) {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      anchor.rel = 'noopener'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    }

    function buildExportFileName(extension: string) {
      const normalizedExtension = extension.replace(/^\./, '') || state.exportFormat
      const baseName = currentTitle.value
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim() || 'pencil-export'
      return `${baseName}.${normalizedExtension}`
    }

    function exportErrorMessage(error: unknown) {
      const friendly = friendlyErrorMessage(error)
      return friendly || getErrorMessage(error) || text('exportFailed')
    }

    function canFallbackToClientFigExport(error: unknown) {
      const message = getErrorMessage(error)
      return message.includes('StackAlign') || message.includes('STRETCH')
    }

    async function importFile(file: File | null | undefined) {
      if (!file) {
        return
      }
      if (!(await ensureDraftSavedBeforeNavigation())) {
        return
      }
      state.busy = true
      state.error = ''
      try {
        const response = await executeFileAction('import_document_file', null, { title: file.name.replace(/\.(fig|pen)$/i, '') }, null, file)
        const payload = getActionPayload(response)
        const documentId = readNestedString(payload, ['item', 'id'])
        notify('success', text('fileImported'))
        await loadData(documentId)
      } catch (error) {
        state.error = friendlyErrorMessage(error)
      } finally {
        state.busy = false
      }
    }

    async function applySnapshotToEditor(snapshot: GraphSnapshot | null, preferredPageId?: string | null) {
      // replaceGraph is followed by layout and page selection because snapshots do not carry editor runtime state.
      applyingRemoteGraph = true
      try {
        editor.replaceGraph(snapshot ? graphFromSnapshot(snapshot) : new SceneGraph())
        recomputeEditorLayouts()
        const preferredPage = preferredPageId ? editor.graph.getNode(preferredPageId) : null
        const firstPage = editor.graph.getPages()[0]
        const targetPage = preferredPage?.type === 'CANVAS' ? preferredPage : firstPage
        if (targetPage) {
          await editor.switchPage(targetPage.id)
        }
        pencilWorkbenchDebug('editor graph hydrated', {
          rootId: editor.graph.rootId,
          currentPageId: editor.state.currentPageId,
          pageIds: editor.graph.getPages().map((page) => page.id),
          firstPageChildren: firstPage?.childIds.length ?? 0,
          nodeCount: Array.from(editor.graph.nodes.values()).length,
          rendererCount: editor.canvasRenderers.length,
          viewport: {
            panX: editor.state.panX,
            panY: editor.state.panY,
            zoom: editor.state.zoom
          }
        })
        state.selectedNodeId = ''
        syncGraphTextFromSnapshot(snapshotFromGraph(editor.graph))
        state.editorRevision += 1
        await nextTick()
        if (sceneCanvasReady) {
          refreshDerivedTextLayouts()
        }
        scheduleCanvasFocus(editor)
      } catch (error) {
        state.error = friendlyErrorMessage(error)
      } finally {
        setTimeout(() => {
          applyingRemoteGraph = false
        }, 0)
      }
    }

    function currentGraphSnapshot() {
      return snapshotFromGraph(editor.graph)
    }

    function graphSnapshotForAction() {
      // The JSON inspector becomes authoritative only after the user edits it explicitly.
      const graphSnapshot = state.graphTextEdited ? parseGraphText(state.graphText, text('errorGraphJson')) : currentGraphSnapshot()
      syncGraphTextFromSnapshot(graphSnapshot)
      return graphSnapshot
    }

    function syncGraphTextFromEditor() {
      syncGraphTextFromSnapshot(currentGraphSnapshot())
    }

    function syncGraphTextFromSnapshot(snapshot: GraphSnapshot) {
      applyingRemoteGraph = true
      state.graphText = JSON.stringify(snapshot, null, 2)
      state.graphTextEdited = false
      setTimeout(() => {
        applyingRemoteGraph = false
      }, 0)
    }

    function registerEditorEvents() {
      // Structural events mark persistence dirty; selection/tool events only refresh derived UI state.
      editorUnsubscribers.push(
        editor.onEditorEvent('selection:changed', (selectedIds) => {
          state.selectedNodeId = selectedIds[0] ?? ''
          state.editorRevision += 1
          updateAssistantContext()
        }),
        editor.onEditorEvent('tool:changed', () => {
          state.editorRevision += 1
        }),
        editor.onEditorEvent('page:changed', () => {
          state.editorRevision += 1
        }),
        editor.onEditorEvent('viewport:changed', () => {
          state.editorRevision += 1
        }),
        editor.onEditorEvent('graph:replaced', () => {
          state.editorRevision += 1
        }),
        editor.onEditorEvent('node:created', () => markEditorDirty()),
        editor.onEditorEvent('node:updated', () => markEditorDirty()),
        editor.onEditorEvent('node:deleted', () => markEditorDirty()),
        editor.onEditorEvent('node:reparented', () => markEditorDirty()),
        editor.onEditorEvent('node:reordered', () => markEditorDirty())
      )
    }

    function markEditorDirty() {
      state.editorRevision += 1
      if (applyingRemoteGraph || !state.detail) {
        return
      }
      markGraphDirty()
    }

    /** Centralizes graph dirty state so canvas edits, property edits, and JSON edits autosave consistently. */
    function markGraphDirty(syncGraphText = true) {
      graphMutationRevision += 1
      state.dirty = true
      if (syncGraphText) {
        syncGraphTextFromEditor()
      }
      void updateAssistantContext()
      scheduleAutosave()
    }

    function friendlyErrorMessage(error: unknown) {
      const message = getErrorMessage(error)
      if (message.includes('substitutionType') && message.includes('substFormat')) {
        pencilWorkbenchDebug('suppressed canvas text shaping warning', message)
        return ''
      }
      return message === 'Request timed out' ? text('errorRequestTimedOut') : message
    }

    function applyContext(context: RemoteBridgeContext) {
      state.locale = normalizeLocale(context.locale)
    }

    /** Reacts to Assistant tool-completion events forwarded by the Xpert host. */
    async function handleHostToolEvent(event: RemotePayloadValue | undefined) {
      const toolName = readHostEventToolName(event)
      const eventDocumentId = readHostEventDocumentId(event)
      const eventPageId = readHostEventPageId(event, toolName)
      if (eventDocumentId && toolName && DOCUMENT_CREATING_TOOL_NAMES.has(toolName)) {
        await openDocumentFromHostEvent(eventDocumentId)
        return
      }
      const targetDocumentId = eventDocumentId === state.selectedDocumentId ? eventDocumentId : state.selectedDocumentId || eventDocumentId
      if (targetDocumentId) {
        await refreshCurrentDocument(targetDocumentId, toolName && PAGE_CREATING_TOOL_NAMES.has(toolName) ? eventPageId : null)
      } else {
        await loadData()
      }
    }

    async function openDocumentFromHostEvent(documentId: string) {
      if (!(await ensureDraftSavedBeforeNavigation())) {
        return
      }
      await loadData(documentId)
    }

    async function refreshCurrentDocument(documentId = state.selectedDocumentId, pageId?: string | null) {
      if (state.dirty && !(await ensureDraftSavedBeforeNavigation())) {
        return
      }
      await loadData(documentId, { pageId })
    }

    function readHostEventToolName(event: RemotePayloadValue | undefined) {
      return (
        readStringAtPath(event, ['toolName']) ??
        readStringAtPath(event, ['tool']) ??
        readStringAtPath(event, ['toolCall', 'name']) ??
        readStringAtPath(event, ['request', 'toolCall', 'name']) ??
        readStringAtPath(event, ['data', 'toolName']) ??
        readStringAtPath(event, ['data', 'tool']) ??
        readStringAtPath(event, ['payload', 'toolName']) ??
        readStringAtPath(event, ['payload', 'tool']) ??
        readFirstStringKey(event, new Set(['toolName', 'tool']))
      )
    }

    function readHostEventDocumentId(event: RemotePayloadValue | undefined) {
      return readFirstStringKey(event, new Set(['documentId']))
    }

    function readHostEventPageId(event: RemotePayloadValue | undefined, toolName?: string) {
      return (
        readFirstStringKey(event, new Set(['pageId'])) ??
        (toolName && PAGE_CREATING_TOOL_NAMES.has(toolName)
          ? readStringAtPath(event, ['result', 'id']) ??
            readStringAtPath(event, ['output', 'result', 'id']) ??
            readStringAtPath(event, ['data', 'result', 'id']) ??
            readStringAtPath(event, ['data', 'output', 'result', 'id']) ??
            readStringAtPath(event, ['payload', 'result', 'id']) ??
            readStringAtPath(event, ['payload', 'output', 'result', 'id'])
          : undefined)
      )
    }

    function readStringAtPath(value: RemotePayloadValue | undefined, path: string[]): string | undefined {
      const normalized = normalizeRemotePayloadValue(value)
      if (!isObject(normalized)) {
        return undefined
      }
      let cursor: RemotePayloadValue | undefined = normalized
      for (const segment of path) {
        cursor = isObject(cursor) ? cursor[segment] : undefined
        cursor = normalizeRemotePayloadValue(cursor)
      }
      return typeof cursor === 'string' && cursor.trim() ? cursor.trim() : undefined
    }

    function readFirstStringKey(value: RemotePayloadValue | undefined, keys: Set<string>, depth = 0): string | undefined {
      if (depth > 8) {
        return undefined
      }
      const normalized = normalizeRemotePayloadValue(value)
      if (Array.isArray(normalized)) {
        for (const item of normalized) {
          const found = readFirstStringKey(item, keys, depth + 1)
          if (found) {
            return found
          }
        }
        return undefined
      }
      if (!isObject(normalized)) {
        return undefined
      }
      for (const key of keys) {
        const field = normalizeRemotePayloadValue(normalized[key])
        if (typeof field === 'string' && field.trim()) {
          return field.trim()
        }
      }
      for (const field of Object.values(normalized)) {
        const found = readFirstStringKey(field, keys, depth + 1)
        if (found) {
          return found
        }
      }
      return undefined
    }

    function normalizeRemotePayloadValue(value: RemotePayloadValue | undefined): RemotePayloadValue | undefined {
      if (typeof value !== 'string') {
        return value
      }
      const trimmed = value.trim()
      if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
        return value
      }
      try {
        return JSON.parse(trimmed) as RemotePayloadValue
      } catch {
        return value
      }
    }

    function selectNode(nodeId: string) {
      state.selectedNodeId = nodeId
      state.inspectorTab = 'properties'
      if (editor.graph.getNode(nodeId)) {
        editor.select([nodeId])
        editor.zoomToSelection()
      }
      updateAssistantContext()
    }

    async function switchWorkbenchPage(pageId: string, switchPage?: (pageId: string) => void | Promise<void>) {
      if (!pageId || pageId === editor.state.currentPageId) {
        return
      }
      const page = editor.graph.getNode(pageId)
      if (page?.type !== 'CANVAS') {
        return
      }
      try {
        await (switchPage ? switchPage(pageId) : editor.switchPage(pageId))
        state.selectedNodeId = ''
        state.editorRevision += 1
        await updateAssistantContext()
      } catch (error) {
        state.error = friendlyErrorMessage(error)
      }
    }

    function updateSelectedNode(changes: Partial<SceneNode>) {
      const nodeId = state.selectedNodeId
      const node = nodeId ? editor.graph.getNode(nodeId) : undefined
      if (!nodeId || !node) {
        return
      }
      editor.graph.updateNode(nodeId, changes)
      recomputeEditorLayouts()
      editor.requestRender()
      state.editorRevision += 1
      markGraphDirty()
    }

    function updateSelectedPositionProp(key: 'x' | 'y' | 'width' | 'height' | 'rotation', value: number) {
      const node = editor.graph.getNode(state.selectedNodeId)
      if (!node) {
        return
      }
      const changes: Partial<SceneNode> = { [key]: key === 'width' || key === 'height' ? positiveNumber(value) : value }
      const parent = node.parentId ? editor.graph.getNode(node.parentId) : null
      if ((key === 'x' || key === 'y') && parent?.layoutMode !== 'NONE' && node.layoutPositioning !== 'ABSOLUTE') {
        changes.layoutPositioning = 'ABSOLUTE'
      }
      updateSelectedNode(changes)
    }

    function updateSelectedCornerRadius(value: number) {
      const radius = Math.max(0, Number.isFinite(value) ? value : 0)
      updateSelectedNode({
        cornerRadius: radius,
        topLeftRadius: radius,
        topRightRadius: radius,
        bottomRightRadius: radius,
        bottomLeftRadius: radius,
        independentCorners: false
      })
    }

    function patchSelectedFirstSolidFill(changes: Partial<Fill>) {
      const node = editor.graph.getNode(state.selectedNodeId)
      if (!node) {
        return
      }
      const fills = cloneFills(node.fills ?? [])
      const index = fills.findIndex((fill) => fill.type === 'SOLID')
      if (index >= 0) {
        fills[index] = { ...fills[index], ...changes, color: changes.color ? { ...changes.color } : fills[index].color }
      } else {
        fills.unshift({ ...DEFAULT_SOLID_FILL, ...changes, color: changes.color ? { ...changes.color } : { ...DEFAULT_SOLID_FILL.color } })
      }
      updateSelectedNode({ fills })
    }

    function patchSelectedFirstStroke(changes: Partial<Stroke>) {
      const node = editor.graph.getNode(state.selectedNodeId)
      if (!node) {
        return
      }
      const strokes = cloneStrokes(node.strokes ?? [])
      if (strokes.length) {
        strokes[0] = { ...strokes[0], ...changes, color: changes.color ? { ...changes.color } : strokes[0].color }
      } else {
        strokes.push({ ...DEFAULT_STROKE, ...changes, color: changes.color ? { ...changes.color } : { ...DEFAULT_STROKE.color } })
      }
      updateSelectedNode({ strokes })
    }

    function alignSelectedPosition(axis: 'x' | 'y', placement: 'min' | 'center' | 'max') {
      const node = editor.graph.getNode(state.selectedNodeId)
      const parent = node?.parentId ? editor.graph.getNode(node.parentId) : null
      if (!node || !parent) {
        return
      }
      const parentSize = axis === 'x' ? parent.width : parent.height
      const nodeSize = axis === 'x' ? node.width : node.height
      if (!Number.isFinite(parentSize) || !Number.isFinite(nodeSize)) {
        return
      }
      const maxOffset = Math.max(0, Number(parentSize) - Number(nodeSize))
      const next = placement === 'center' ? maxOffset / 2 : placement === 'max' ? maxOffset : 0
      updateSelectedNode({ [axis]: next } as Partial<SceneNode>)
    }

    function setSelectedLayoutMode(mode: SceneNode['layoutMode']) {
      const nodeId = state.selectedNodeId
      if (!nodeId || !editor.graph.getNode(nodeId)) {
        return
      }
      const editorWithLayout = editor as PencilEditor & { setLayoutMode?: (id: string, mode: SceneNode['layoutMode']) => void }
      if (typeof editorWithLayout.setLayoutMode === 'function') {
        editorWithLayout.setLayoutMode(nodeId, mode)
        recomputeEditorLayouts()
        state.editorRevision += 1
        markGraphDirty()
        return
      }
      updateSelectedNode({ layoutMode: mode })
    }

    function renderIconChoice(label: string, icon: string, active: boolean, onClick: () => void) {
      return h(
        'button',
        {
          class: ['pencil-icon-choice', active ? 'is-active' : ''],
          type: 'button',
          title: label,
          onClick
        },
        renderIcon(icon)
      )
    }

    function recomputeEditorLayouts() {
      try {
        const currentPage = editor.graph.getNode(editor.state.currentPageId)
        const pageId = currentPage?.type === 'CANVAS' ? currentPage.id : (editor.graph.getPages(true)[0]?.id ?? editor.graph.rootId)
        computeAllLayouts(editor.graph, pageId)
      } catch (error) {
        pencilWorkbenchDebug('layout recompute failed', error)
      }
    }

    async function importPencilJsx(source: string) {
      const normalized = source.trim()
      if (!normalized) {
        throw new Error(text('codeImportEmpty'))
      }
      const page = editor.graph.getNode(editor.state.currentPageId)
      const parentId = page?.type === 'CANVAS' ? page.id : (editor.graph.getPages(true)[0]?.id ?? editor.graph.rootId)
      const results = await renderJSX(editor.graph, normalized, { parentId })
      recomputeEditorLayouts()
      const importedIds = results.map((result) => result.id).filter((id) => Boolean(editor.graph.getNode(id)))
      if (importedIds.length) {
        editor.select(importedIds)
        state.selectedNodeId = importedIds[0]
      }
      state.editorRevision += 1
      markGraphDirty()
      editor.requestRender()
      notify('success', text('codeImportSuccess'))
    }

    /** Re-measures auto-sized text after CanvasKit has attached its fully populated font provider. */
    function refreshDerivedTextLayouts() {
      if (!state.detail) {
        return
      }
      const wasApplyingRemoteGraph = applyingRemoteGraph
      applyingRemoteGraph = true
      try {
        recomputeEditorLayouts()
        syncGraphTextFromEditor()
        state.editorRevision += 1
        editor.requestRender()
      } finally {
        // Vue flushes the graph-text watcher asynchronously; keep hydration suppression through that flush.
        window.setTimeout(() => {
          applyingRemoteGraph = wasApplyingRemoteGraph
        }, 0)
      }
    }

    function handleSceneCanvasReady() {
      sceneCanvasReady = true
      refreshDerivedTextLayouts()
    }

    // Tool completion events refresh the active document so Agent edits appear without remounting the app.
    startRemoteBridge(
      (context) => {
        applyContext(context)
      },
      (event) => {
        void handleHostToolEvent(event)
      }
    )

    onMounted(() => {
      registerEditorEvents()
      loadData()
    })

    onUnmounted(() => {
      cancelAutosaveTimer()
      while (editorUnsubscribers.length) {
        editorUnsubscribers.pop()?.()
      }
    })

    watch(
      () => state.graphText,
      () => {
        if (applyingRemoteGraph || !state.detail) {
          return
        }
        state.graphTextEdited = true
        markGraphDirty(false)
      }
    )

    function renderTopbar() {
      const summaryText = [
        statusText(state.detail?.item?.status, state.locale),
        text('nodeCount', { count: summary.value.nodeCount }),
        text('pageCount', { count: summary.value.pageCount })
      ].join(' · ')

      return h(
        TopToolbar,
        {
          logoSrc: PENCIL_LOGO_DATA_URL,
          brandSubtitle: text('brandSubtitle'),
          summaryText,
          busy: state.busy,
          dirty: !state.busy && (state.dirty || state.autosaving),
          canUseDocument: canUseDocument.value,
          exportFormat: state.exportFormat,
          exportFormats: ['fig', 'png', 'jpg', 'webp', 'svg', 'pdf', 'jsx'],
          statusLabel: state.busy ? text('busy') : state.autosaving ? text('savingDraft') : state.dirty ? text('save') : text('saved'),
          labels: {
            actions: text('actionsLabel'),
            create: text('create'),
            blankDesign: text('blankDesign'),
            sample: text('createSample'),
            importFile: text('importFile'),
            refresh: text('refresh'),
            save: text('save'),
            saveVersion: text('saveVersion'),
            export: text('export'),
            review: text('review'),
            archive: text('archive'),
            deleteDocument: text('deleteDocument')
          },
          onCreateBlank: () => void createDocument(),
          onCreateSample: () => void createSampleDocument(),
          onImportFile: (file: File) => void importFile(file),
          onRefresh: () => void refreshCurrentDocument(),
          onSave: () => void saveWorkingCopy(),
          onSaveVersion: () => void saveVersion(),
          'onUpdate:exportFormat': (value: string) => {
            state.exportFormat = value
          },
          onExport: () => void exportDocument(),
          onReview: () => void updateStatus('reviewed'),
          onArchive: () => void updateStatus('archived'),
          onDeleteDocument: () => {
            state.deleteDialogOpen = true
          }
        },
        { title: () => renderDocumentSwitcherSelect('pencil-document-switcher-header', 'header') }
      )
    }

    function renderInlineDocumentTitle() {
      return h(InlineDocumentTitle, {
        ref: titleEditor,
        title: currentTitle.value,
        draft: state.titleDraft,
        editing: state.editingTitle,
        disabled: state.busy || !canUseDocument.value,
        titleLabel: text('title'),
        editLabel: text('editTitle'),
        onEdit: beginTitleEditing,
        onCancel: cancelTitleEditing,
        onSave: () => void saveDocumentTitle(),
        'onUpdate:draft': (value: string) => {
          state.titleDraft = value
        }
      })
    }

    function beginTitleEditing() {
      if (state.busy || !canUseDocument.value) {
        return
      }
      state.titleDraft = currentTitle.value
      state.editingTitle = true
    }

    function cancelTitleEditing() {
      state.titleDraft = currentTitle.value
      state.editingTitle = false
      state.error = ''
    }

    /** Persists title metadata independently from the canvas dirty state. */
    async function saveDocumentTitle() {
      const documentId = state.detail?.item?.id
      if (!documentId || !state.editingTitle || state.busy) {
        return
      }
      const title = state.titleDraft.trim()
      if (!title) {
        state.error = text('titleRequired')
        void nextTick(() => titleEditor.value?.focus())
        return
      }
      if (title === currentTitle.value) {
        cancelTitleEditing()
        return
      }

      state.busy = true
      state.error = ''
      try {
        await executeAction('rename_document', documentId, { documentId, title }, { documentId })
        if (state.detail?.item) {
          state.detail.item.title = title
        }
        state.editingTitle = false
        notify('success', text('titleSaved'))
        await loadData(documentId)
      } catch (error) {
        state.error = friendlyErrorMessage(error)
        void nextTick(() => titleEditor.value?.focus())
      } finally {
        state.busy = false
      }
    }

    function renderDocumentSwitcherSelect(className: string, variant: 'default' | 'header' = 'default') {
      const options = state.documents.flatMap((document) => {
        if (!document.id) return []
        const meta = [
          statusText(document.status, state.locale),
          `${text('version')} ${String(document.currentVersionNumber ?? 0)}`,
          document.updatedAt ? formatDate(document.updatedAt, state.locale) : ''
        ]
          .filter(Boolean)
          .join(' · ')
        return [{ id: document.id, title: document.title ?? text('defaultDesignTitle'), meta }]
      })
      return h(DocumentSwitcher, {
        options,
        selectedId: state.selectedDocumentId,
        busy: state.busy,
        label: text('documentSwitcher'),
        emptyLabel: text('documentsEmpty'),
        className,
        variant,
        onSelect: (documentId: string) => void selectDocument(documentId)
      })
    }

    function setLeftPanelCollapsed(collapsed: boolean) {
      state.leftPanelCollapsed = collapsed
      void nextTick(reportResize)
    }

    function setInspectorPanelCollapsed(collapsed: boolean) {
      state.inspectorPanelCollapsed = collapsed
      void nextTick(reportResize)
    }

    function renderPanelToggleButton(icon: string, label: string, onClick: () => void) {
      return renderButton({ variant: 'ghost', class: 'pencil-panel-toggle-button', title: label, onClick }, renderIcon(icon))
    }

    function renderCollapsedPanel(side: 'left' | 'right', label: string, icon: string, onClick: () => void) {
      return h('section', { class: ['pencil-panel pencil-collapsed-panel', side === 'left' ? 'is-left' : 'is-right'] }, [
        renderButton({ variant: 'ghost', class: 'pencil-panel-toggle-button pencil-panel-expand-button', title: label, onClick }, renderIcon(icon)),
        h('span', { class: 'pencil-collapsed-panel-label' }, side === 'left' ? text('documents') : text('properties'))
      ])
    }

    function renderDocumentsPanel() {
      if (state.leftPanelCollapsed) {
        return renderCollapsedPanel('left', text('expandLeftPanel'), 'chevronRight', () => setLeftPanelCollapsed(false))
      }
      return renderPanel(renderInlineDocumentTitle(), renderStudioSidePanelBody(), {
        class: 'pencil-documents-panel pencil-layers-panel',
        titleClass: 'pencil-side-title',
        actions: [renderPanelToggleButton('chevronLeft', text('collapseLeftPanel'), () => setLeftPanelCollapsed(true))]
      })
    }

    function renderStudioSidePanelBody() {
      return h('div', { class: 'pencil-left-studio' }, [
        renderSegmented<LeftPanelTab>(
          [
            { value: 'file', label: text('filePanel') },
            { value: 'assets', label: text('assets') }
          ],
          state.leftPanelTab,
          (tab) => {
            state.leftPanelTab = tab
          },
          { class: 'pencil-side-tabs' }
        ),
        state.leftPanelTab === 'assets' ? renderAssetsPanelBody() : renderFilePanelBody()
      ])
    }

    function renderFilePanelBody() {
      return h('div', { class: 'pencil-file-panel-body' }, [renderLayerPanelBody()])
    }

    function renderDocumentPanelBody() {
      return h('div', { class: 'pencil-document-panel-body' }, [
        renderInput({
          value: state.search,
          placeholder: text('searchDocuments'),
          onInput: (value) => {
            state.search = value
          },
          onEnter: () => loadData()
        }),
        state.documents.length
          ? h('div', { class: 'pencil-document-list' }, state.documents.map(renderDocumentButton))
          : h('div', { class: 'pencil-empty-stack' }, [
              h('div', { class: 'pencil-empty-note' }, text('documentsEmpty')),
              renderButton({ variant: 'secondary', disabled: state.busy, onClick: createSampleDocument }, text('createSample'))
            ])
      ])
    }

    function renderDocumentButton(document: DocumentItem) {
      return h(
        'button',
        {
          class: ['pencil-document-item', document.id === state.selectedDocumentId ? 'is-active' : ''],
          type: 'button',
          onClick: () => selectDocument(document.id)
        },
        [
          h('span', { class: 'pencil-document-title' }, document.title ?? text('defaultDesignTitle')),
          h('span', { class: 'pencil-document-meta' }, [
            statusText(document.status, state.locale),
            ' · ',
            text('version'),
            ' ',
            String(document.currentVersionNumber ?? 0)
          ]),
          document.updatedAt ? h('span', { class: 'pencil-document-date' }, `${text('updated')} ${formatDate(document.updatedAt, state.locale)}`) : null
        ]
      )
    }

    function renderAssetsPanelBody() {
      return h('div', { class: 'pencil-assets-panel-body' }, [
        h('div', { class: 'pencil-asset-card' }, [
          h('strong', text('imageCount', { count: summary.value.imageCount })),
          h('span', text('variableCount', { count: summary.value.variableCount }))
        ]),
        h('div', { class: 'pencil-asset-card' }, [
          h('strong', text('graphSnapshot')),
          h('span', [
            text('nodeCount', { count: summary.value.nodeCount }),
            ' · ',
            text('pageCount', { count: summary.value.pageCount })
          ])
        ])
      ])
    }

    function renderLayerPanelBody() {
      if (!canUseDocument.value) {
        return h('div', { class: 'pencil-empty-note' }, text('stageEmpty'))
      }
      return h('div', { class: 'pencil-layer-panel-body' }, [
        h('div', { class: 'pencil-layer-group' }, [
          h('div', { class: 'pencil-layer-heading' }, [
            h('span', text('pages')),
            h(
              'button',
              {
                class: 'pencil-layer-add',
                type: 'button',
                title: text('create'),
                onClick: () => {
                  editor.addPage(text('defaultPageName'))
                }
              },
              '+'
            )
          ]),
          h(PageListRoot, {}, { default: (slot: unknown) => renderPageList(slot) })
        ]),
        h('div', { class: 'pencil-layer-group' }, [
          h('div', { class: 'pencil-layer-heading' }, text('layers')),
          h(
            LayerTreeRoot,
            {
              indentPerLevel: 14,
              onSelect: (id: string) => {
                selectNode(id)
              },
              onToggleVisibility: (id: string) => {
                editor.toggleNodeVisibility(id)
              },
              onToggleLock: (id: string) => {
                editor.toggleNodeLock(id)
              }
            },
            { default: (slot: unknown) => renderLayerTree(slot) }
          )
        ])
      ])
    }

    function renderPageList(slot: unknown) {
      const pageSlot = slot as {
        pages?: SceneNode[]
        currentPageId?: string
        switchPage?: (pageId: string) => void | Promise<void>
        actions?: { switch?: (pageId: string) => void | Promise<void> }
      }
      const pages = Array.isArray(pageSlot.pages) ? pageSlot.pages : editor.graph.getPages()
      const currentPageId = pageSlot.currentPageId ?? editor.state.currentPageId
      if (!pages.length) {
        return h('div', { class: 'pencil-empty-note' }, text('stageEmpty'))
      }
      return pages.map((page) =>
        h(
          'button',
          {
            class: ['pencil-layer-item', page.id === currentPageId ? 'is-active' : ''],
            type: 'button',
            onClick: () => {
              void switchWorkbenchPage(page.id, pageSlot.switchPage ?? pageSlot.actions?.switch)
            }
          },
          h('span', { class: 'pencil-layer-row' }, [
            renderIcon('file', 'pencil-layer-icon'),
            h('span', { class: 'pencil-layer-name' }, page.name || page.id)
          ])
        )
      )
    }

    function renderLayerTree(slot: unknown) {
      const treeSlot = slot as {
        flattenItems?: unknown[]
        items?: unknown[]
        expanded?: string[]
        actions?: { select?: (id: string, additive: boolean) => void; toggleExpand?: (id: string) => void }
      }
      const items = Array.isArray(treeSlot.flattenItems) && treeSlot.flattenItems.length ? treeSlot.flattenItems : flattenLayerTreeItems(treeSlot.items)
      if (!items.length) {
        return h('div', { class: 'pencil-empty-note' }, text('noNodeSelected'))
      }
      return h(
        'div',
        { class: 'pencil-headless-tree' },
        items.map((entry) => renderLayerTreeItem(entry, treeSlot.actions, treeSlot.expanded ?? []))
      )
    }

    function renderLayerTreeItem(
      entry: unknown,
      actions?: { select?: (id: string, additive: boolean) => void; toggleExpand?: (id: string) => void },
      expandedIds: string[] = []
    ) {
      const layer = readLayerEntry(entry)
      if (!layer.id) {
        return null
      }
      const isExpanded = expandedIds.includes(layer.id)
      return h(
        'button',
        {
          class: ['pencil-layer-item pencil-layer-tree-item', state.selectedNodeId === layer.id ? 'is-active' : '', isExpanded ? 'is-expanded' : ''],
          style: { paddingLeft: `${6 + layer.level * 12}px` },
          type: 'button',
          title: `${layer.name} (${layer.type})`,
          onClick: (event: MouseEvent) => {
            actions?.select?.(layer.id, event.shiftKey || event.metaKey || event.ctrlKey)
            selectNode(layer.id)
            if (layer.hasChildren) {
              actions?.toggleExpand?.(layer.id)
            }
          },
        },
        h('span', { class: 'pencil-layer-row' }, [
          h('span', { class: 'pencil-layer-disclosure' }, layer.hasChildren ? renderIcon(isExpanded ? 'chevronDown' : 'chevronRight', 'pencil-layer-chevron') : undefined),
          renderIcon(layerIcon(layer.type), 'pencil-layer-icon'),
          h('span', { class: 'pencil-layer-name' }, layer.name)
        ])
      )
    }

    function renderStagePanel() {
      return renderPanel(
        text('document'),
        h('div', { class: 'pencil-stage-shell' }, [
          state.error ? h('div', { class: 'pencil-error' }, state.error) : null,
          state.exportMessage ? h('div', { class: 'pencil-export-toast' }, state.exportMessage) : null,
          canUseDocument.value
            ? renderEditorCanvas()
            : h('div', { class: 'pencil-preview-empty' }, [
                h('span', text('stageEmpty')),
                renderButton({ variant: 'secondary', disabled: state.busy, onClick: createSampleDocument }, text('createSample'))
              ])
        ]),
        {
          class: 'pencil-stage-panel',
          actions: [
            renderBadge(text('imageCount', { count: summary.value.imageCount })),
            renderBadge(text('variableCount', { count: summary.value.variableCount }))
          ]
        }
      )
    }

    function renderEditorCanvas() {
      return h('div', { class: 'pencil-canvas-root' }, [
        h(PencilSceneCanvas, { onReady: handleSceneCanvasReady }),
        h(PencilOverlayCanvas),
        renderCanvasToolbar()
      ])
    }

    function renderCanvasToolbar() {
      return h(
        'div',
        { class: 'pencil-editor-toolstrip' },
        h(ToolbarRoot, { tools: EDITOR_TOOLS }, { default: (slot: unknown) => renderToolbarItems(slot) })
      )
    }

    function renderToolbarItems(slot: unknown) {
      const toolbar = slot as {
        tools?: Array<{ key: Tool; label: string; shortcut?: string; flyout?: string[] }>
        activeTool?: Tool
        expandedFlyout?: Tool | null
        actions?: { setTool?: (tool: Tool) => void; toggleFlyout?: (tool: Tool) => void; closeFlyout?: () => void }
      }
      state.editorRevision
      const tools = Array.isArray(toolbar.tools) ? toolbar.tools : EDITOR_TOOLS
      const activeTool = editor.state.activeTool ?? readToolValue(toolbar.activeTool) ?? 'SELECT'
      const expandedFlyout = readToolValue(toolbar.expandedFlyout)
      return tools.map((tool) => {
        const flyout = normalizeToolFlyout(tool.flyout)
        const hasFlyout = flyout.length > 1
        const isActive = activeTool === tool.key || flyout.includes(activeTool)
        const isOpen = expandedFlyout === tool.key
        return h('div', { class: ['pencil-tool-group', isOpen ? 'is-open' : ''] }, [
          h(
            'button',
            {
              class: ['pencil-tool-button', isActive ? 'is-active' : ''],
              type: 'button',
              title: `${toolLabel(tool.key)}${tool.shortcut ? ` (${tool.shortcut})` : ''}`,
              onClick: () => {
                selectToolbarTool(tool.key, toolbar.actions)
              }
            },
            renderIcon(toolIcon(tool.key))
          ),
          hasFlyout
            ? h(
                'button',
                {
                  class: ['pencil-tool-flyout-trigger', isOpen ? 'is-active' : ''],
                  type: 'button',
                  title: text('toolOptions', { tool: toolLabel(tool.key) }),
                  'aria-expanded': isOpen,
                  onClick: (event: MouseEvent) => {
                    event.stopPropagation()
                    toolbar.actions?.toggleFlyout?.(tool.key)
                  }
                },
                renderIcon('chevronDown', 'pencil-tool-chevron')
              )
            : null,
          isOpen ? renderToolFlyoutMenu(tool.key, flyout, activeTool, toolbar.actions) : null
        ])
      })
    }

    function readToolValue(value: unknown): Tool | null {
      if (typeof value === 'string') {
        return value as Tool
      }
      if (isObject(value) && typeof value.value === 'string') {
        return value.value as Tool
      }
      return null
    }

    function normalizeToolFlyout(flyout: string[] | undefined): Tool[] {
      return Array.isArray(flyout) ? flyout.filter((item): item is Tool => typeof item === 'string') as Tool[] : []
    }

    function renderToolFlyoutMenu(
      owner: Tool,
      tools: Tool[],
      activeTool: Tool,
      actions?: { setTool?: (tool: Tool) => void; closeFlyout?: () => void }
    ) {
      return h(
        'div',
        { class: 'pencil-tool-flyout-menu', role: 'menu' },
        tools.map((tool) =>
          h(
            'button',
            {
              class: ['pencil-tool-flyout-item', activeTool === tool ? 'is-active' : ''],
              type: 'button',
              role: 'menuitem',
              title: toolLabel(tool),
              onClick: (event: MouseEvent) => {
                event.stopPropagation()
                selectToolbarTool(tool, actions)
              }
            },
            [renderIcon(toolIcon(tool)), h('span', toolLabel(tool)), tool === owner ? h('small', text('defaultOption')) : null]
          )
        )
      )
    }

    function selectToolbarTool(tool: Tool, actions?: { setTool?: (tool: Tool) => void; closeFlyout?: () => void }) {
      actions?.setTool?.(tool)
      if (editor.state.activeTool !== tool) {
        editor.setTool(tool)
      }
      actions?.closeFlyout?.()
      state.editorRevision += 1
    }

    function toolLabel(tool: Tool | string) {
      return editorToolLabel(String(tool), state.locale)
    }

    function renderInspectorPanel() {
      if (state.inspectorPanelCollapsed) {
        return renderCollapsedPanel('right', text('expandInspectorPanel'), 'chevronLeft', () => setInspectorPanelCollapsed(false))
      }
      const actions = [
        renderPanelToggleButton('chevronRight', text('collapseInspectorPanel'), () => setInspectorPanelCollapsed(true)),
        renderInspectorTab('properties', 'columns', text('design')),
        renderInspectorTab('code', 'code', text('code')),
        h('span', { class: 'pencil-zoom-label' }, text('zoomLevel'))
      ]
      return renderPanel(text('design'), renderInspectorBody(), { class: 'pencil-inspector-panel', actions })
    }

    function renderInspectorTab(tab: InspectorTab, icon: string, label: string) {
      return renderTabButton<InspectorTab>(
        tab,
        state.inspectorTab,
        [renderIcon(icon), h('span', label)],
        (nextTab) => {
          state.inspectorTab = nextTab
        },
        label
      )
    }

    function renderInspectorBody() {
      if (state.inspectorTab === 'code') {
        return h(CodeInspector, {
          graph: editor.graph,
          selectedNodeIds: Array.from(editor.state.selectedIds),
          graphText: state.graphText,
          locale: state.locale,
          revision: state.editorRevision,
          busy: state.busy,
          canUseDocument: canUseDocument.value,
          importPencilJsx,
          updateGraphText: (value: string) => {
            state.graphText = value
          }
        })
      }
      if (state.inspectorTab === 'activity') {
        return h('div', { class: 'pencil-activity-inline' }, [renderVersionsList(), renderLogsList()])
      }
      return renderPropertiesBody()
    }

    function renderPropertiesBody() {
      const item = state.detail?.item
      const node = selectedNode.value
      if (node) {
        return h('div', { class: 'pencil-properties' }, [
          h('div', { class: 'pencil-selection-summary' }, [
            h('span', { class: 'pencil-selection-kind' }, String(node.type ?? 'NODE')),
            h('strong', String(node.name ?? state.selectedNodeId))
          ]),
          renderDefinitionList([
            [text('title'), String(node.name ?? state.selectedNodeId)],
            [text('type'), String(node.type ?? 'NODE')],
            [text('revision'), String(state.detail?.workingCopyRevision ?? 0)],
            [text('colorSpace'), editor.graph.documentColorSpace ?? '-']
          ]),
          h('div', { class: 'pencil-native-controls' }, renderPencilNativeControls())
        ])
      }
      if (!item) {
        return h('div', { class: 'pencil-empty-note' }, text('noDocument'))
      }
      return h('div', { class: 'pencil-properties' }, [
        h('h3', text('document')),
        renderDefinitionList([
          [text('title'), item.title ?? text('defaultDesignTitle')],
          [text('status'), statusText(item.status, state.locale)],
          [text('version'), String(item.currentVersionNumber ?? 0)],
          [text('revision'), String(state.detail?.workingCopyRevision ?? item.workingCopyRevision ?? 0)],
          [text('checksum'), state.detail?.graphChecksum ?? item.graphChecksum ?? '-'],
          [text('updated'), item.updatedAt ? formatDate(item.updatedAt, state.locale) : '-']
        ])
      ])
    }

    function renderPencilNativeControls() {
      return [
        renderPositionControls(),
        renderLayoutControls(),
        renderAppearanceControls(),
        renderPaintControls(),
        renderTextControls()
      ].filter(Boolean)
    }

    function renderPositionControls() {
      const node = editor.graph.getNode(state.selectedNodeId)
      if (!node) {
        return null
      }
      return h('section', { class: 'pencil-control-section' }, [
        h('h3', text('position')),
        h('div', { class: 'pencil-icon-row' }, [
          renderIconChoice(text('alignLeft'), 'alignLeft', false, () => alignSelectedPosition('x', 'min')),
          renderIconChoice(text('alignCenter'), 'alignCenter', false, () => alignSelectedPosition('x', 'center')),
          renderIconChoice(text('alignRight'), 'alignRight', false, () => alignSelectedPosition('x', 'max')),
          renderIconChoice(text('alignTop'), 'alignTop', false, () => alignSelectedPosition('y', 'min')),
          renderIconChoice(text('alignMiddle'), 'alignMiddle', false, () => alignSelectedPosition('y', 'center')),
          renderIconChoice(text('alignBottom'), 'alignBottom', false, () => alignSelectedPosition('y', 'max'))
        ]),
        h('div', { class: 'pencil-control-grid' }, [
          renderNumberControl('X', node.x, (value) => updateSelectedPositionProp('x', value)),
          renderNumberControl('Y', node.y, (value) => updateSelectedPositionProp('y', value)),
          renderNumberControl('W', node.width, (value) => updateSelectedPositionProp('width', value)),
          renderNumberControl('H', node.height, (value) => updateSelectedPositionProp('height', value)),
          renderNumberControl('R', node.rotation, (value) => updateSelectedPositionProp('rotation', value))
        ])
      ])
    }

    function renderLayoutControls() {
      const node = editor.graph.getNode(state.selectedNodeId)
      if (!node) {
        return null
      }
      const layoutMode = node.layoutMode ?? 'NONE'
      const layoutWrap = node.layoutWrap ?? 'NO_WRAP'
      const primaryAxisAlign = node.primaryAxisAlign ?? 'MIN'
      const counterAxisAlign = node.counterAxisAlign ?? 'MIN'
      return h('section', { class: 'pencil-control-section' }, [
        h('h3', text('layout')),
        h('div', { class: 'pencil-icon-row pencil-layout-mode-row' }, [
          renderIconChoice(`${text('layout')}: ${uiValueLabel('NONE', state.locale)}`, 'minus', layoutMode === 'NONE', () => setSelectedLayoutMode('NONE')),
          renderIconChoice(`${text('layout')}: ${uiValueLabel('HORIZONTAL', state.locale)}`, 'horizontal', layoutMode === 'HORIZONTAL', () => setSelectedLayoutMode('HORIZONTAL')),
          renderIconChoice(`${text('layout')}: ${uiValueLabel('VERTICAL', state.locale)}`, 'vertical', layoutMode === 'VERTICAL', () => setSelectedLayoutMode('VERTICAL')),
          renderIconChoice(`${text('layout')}: ${uiValueLabel('GRID', state.locale)}`, 'grid', layoutMode === 'GRID', () => setSelectedLayoutMode('GRID')),
          renderIconChoice(text('wrapChildren'), 'wrap', layoutWrap === 'WRAP', () =>
            updateSelectedNode({ layoutWrap: layoutWrap === 'WRAP' ? 'NO_WRAP' : 'WRAP' })
          )
        ]),
        h('div', { class: 'pencil-control-grid' }, [
          renderSelectControl(
            text('mode'),
            layoutMode,
            selectEntries(['NONE', 'HORIZONTAL', 'VERTICAL', 'GRID']),
            (value) => setSelectedLayoutMode(value as SceneNode['layoutMode'])
          ),
          renderSelectControl(
            text('wrap'),
            layoutWrap,
            selectEntries(['NO_WRAP', 'WRAP']),
            (value) => updateSelectedNode({ layoutWrap: value as SceneNode['layoutWrap'] })
          )
        ]),
        h('h3', text('layoutSizing')),
        h('div', { class: 'pencil-control-grid' }, [
          renderSelectControl(
            text('primary'),
            node.primaryAxisSizing ?? 'FIXED',
            selectEntries(['FIXED', 'HUG', 'FILL']),
            (value) => updateSelectedNode({ primaryAxisSizing: value as SceneNode['primaryAxisSizing'] })
          ),
          renderSelectControl(
            text('counter'),
            node.counterAxisSizing ?? 'FIXED',
            selectEntries(['FIXED', 'HUG', 'FILL']),
            (value) => updateSelectedNode({ counterAxisSizing: value as SceneNode['counterAxisSizing'] })
          ),
          renderNumberControl(text('gap'), node.itemSpacing, (value) => updateSelectedNode({ itemSpacing: value })),
          renderNumberControl(text('crossGap'), node.counterAxisSpacing, (value) => updateSelectedNode({ counterAxisSpacing: value }))
        ]),
        h('h3', text('layoutPadding')),
        h('div', { class: 'pencil-control-grid' }, [
          renderNumberControl(text('top'), node.paddingTop, (value) => updateSelectedNode({ paddingTop: value })),
          renderNumberControl(text('right'), node.paddingRight, (value) => updateSelectedNode({ paddingRight: value })),
          renderNumberControl(text('bottom'), node.paddingBottom, (value) => updateSelectedNode({ paddingBottom: value })),
          renderNumberControl(text('left'), node.paddingLeft, (value) => updateSelectedNode({ paddingLeft: value }))
        ]),
        h('h3', text('layoutAlignment')),
        h('div', { class: 'pencil-icon-row' }, [
          renderIconChoice(text('primaryStart'), 'alignLeft', primaryAxisAlign === 'MIN', () => updateSelectedNode({ primaryAxisAlign: 'MIN' })),
          renderIconChoice(text('primaryCenter'), 'alignCenter', primaryAxisAlign === 'CENTER', () => updateSelectedNode({ primaryAxisAlign: 'CENTER' })),
          renderIconChoice(text('primaryEnd'), 'alignRight', primaryAxisAlign === 'MAX', () => updateSelectedNode({ primaryAxisAlign: 'MAX' })),
          renderIconChoice(text('spaceBetween'), 'wrap', primaryAxisAlign === 'SPACE_BETWEEN', () => updateSelectedNode({ primaryAxisAlign: 'SPACE_BETWEEN' })),
          renderIconChoice(text('counterStart'), 'alignTop', counterAxisAlign === 'MIN', () => updateSelectedNode({ counterAxisAlign: 'MIN' })),
          renderIconChoice(text('counterCenter'), 'alignMiddle', counterAxisAlign === 'CENTER', () => updateSelectedNode({ counterAxisAlign: 'CENTER' })),
          renderIconChoice(text('counterEnd'), 'alignBottom', counterAxisAlign === 'MAX', () => updateSelectedNode({ counterAxisAlign: 'MAX' })),
          renderIconChoice(text('counterStretch'), 'alignStretch', counterAxisAlign === 'STRETCH', () => updateSelectedNode({ counterAxisAlign: 'STRETCH' }))
        ]),
        h('div', { class: 'pencil-control-grid' }, [
          renderSelectControl(
            text('primary'),
            primaryAxisAlign,
            selectEntries(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN']),
            (value) => updateSelectedNode({ primaryAxisAlign: value as SceneNode['primaryAxisAlign'] })
          ),
          renderSelectControl(
            text('counter'),
            counterAxisAlign,
            selectEntries(['MIN', 'CENTER', 'MAX', 'STRETCH', 'BASELINE']),
            (value) => updateSelectedNode({ counterAxisAlign: value as SceneNode['counterAxisAlign'] })
          )
        ]),
        h('h3', text('layoutChild')),
        h('div', { class: 'pencil-control-grid' }, [
          renderNumberControl(text('grow'), node.layoutGrow, (value) => updateSelectedNode({ layoutGrow: value })),
          renderSelectControl(
            text('self'),
            node.layoutAlignSelf ?? 'AUTO',
            selectEntries(['AUTO', 'MIN', 'CENTER', 'MAX', 'STRETCH', 'BASELINE']),
            (value) => updateSelectedNode({ layoutAlignSelf: value as SceneNode['layoutAlignSelf'] })
          ),
          renderSelectControl(
            text('position'),
            node.layoutPositioning ?? 'AUTO',
            selectEntries(['AUTO', 'ABSOLUTE']),
            (value) => updateSelectedNode({ layoutPositioning: value as SceneNode['layoutPositioning'] })
          ),
          renderNumberControl(text('gridGap'), node.gridColumnGap, (value) => updateSelectedNode({ gridColumnGap: value, gridRowGap: value }))
        ])
      ])
    }

    function renderAppearanceControls() {
      const node = editor.graph.getNode(state.selectedNodeId)
      if (!node) {
        return null
      }
      const visible = node.visible !== false
      const locked = Boolean(node.locked)
      return h('section', { class: 'pencil-control-section' }, [
        h('h3', text('appearance')),
        h('div', { class: 'pencil-icon-row' }, [
          renderIconChoice(text('toggleVisibility'), 'eye', visible, () => updateSelectedNode({ visible: !visible })),
          renderIconChoice(text('toggleLock'), 'lock', locked, () => updateSelectedNode({ locked: !locked })),
          renderIconChoice(text('clipContent'), 'frame', Boolean(node.clipsContent), () => updateSelectedNode({ clipsContent: !node.clipsContent }))
        ]),
        h('div', { class: 'pencil-control-grid' }, [
          renderNumberControl(text('opacity'), Math.round(clampNumber(node.opacity ?? 1, 0, 1) * 100), (value) =>
            updateSelectedNode({ opacity: clampNumber(value, 0, 100) / 100 })
          ),
          renderNumberControl(text('radius'), node.cornerRadius ?? 0, (value) => updateSelectedCornerRadius(value)),
          renderNumberControl(text('smooth'), node.cornerSmoothing ?? 0, (value) => updateSelectedNode({ cornerSmoothing: clampNumber(value, 0, 1) })),
          renderSelectControl(
            text('blend'),
            node.blendMode ?? 'NORMAL',
            selectEntries(['NORMAL', 'MULTIPLY', 'SCREEN', 'OVERLAY', 'PASS_THROUGH']),
            (value) => updateSelectedNode({ blendMode: value as SceneNode['blendMode'] })
          )
        ])
      ])
    }

    function renderPaintControls() {
      const node = editor.graph.getNode(state.selectedNodeId)
      if (!node || node.type === 'CANVAS') {
        return null
      }
      const fill = node.fills?.find((entry) => entry.type === 'SOLID') ?? node.fills?.[0] ?? DEFAULT_SOLID_FILL
      const stroke = node.strokes?.[0] ?? DEFAULT_STROKE
      const fillLabel = node.type === 'TEXT' ? text('textColor') : text('fill')
      const fillOpacityLabel = node.type === 'TEXT' ? text('textColorOpacity') : text('fillOpacity')
      return h('section', { class: 'pencil-control-section' }, [
        h('h3', text('paint')),
        h('div', { class: 'pencil-control-grid' }, [
          renderColorControl(fillLabel, colorToHex(fill.color), (value) => patchSelectedFirstSolidFill({ color: hexToColor(value, fill.color?.a ?? 1) })),
          renderNumberControl(fillOpacityLabel, Math.round(clampNumber(fill.opacity ?? 1, 0, 1) * 100), (value) =>
            patchSelectedFirstSolidFill({ opacity: clampNumber(value, 0, 100) / 100, visible: value > 0 })
          ),
          renderColorControl(text('stroke'), colorToHex(stroke.color), (value) => patchSelectedFirstStroke({ color: hexToColor(value, stroke.color?.a ?? 1) })),
          renderNumberControl(text('strokeWeight'), stroke.weight ?? 0, (value) => patchSelectedFirstStroke({ weight: Math.max(0, value), visible: value > 0 })),
          renderNumberControl(text('strokeOpacity'), Math.round(clampNumber(stroke.opacity ?? 1, 0, 1) * 100), (value) =>
            patchSelectedFirstStroke({ opacity: clampNumber(value, 0, 100) / 100, visible: value > 0 })
          ),
          renderSelectControl(
            text('strokeAlign'),
            stroke.align ?? 'INSIDE',
            selectEntries(['INSIDE', 'CENTER', 'OUTSIDE']),
            (value) => patchSelectedFirstStroke({ align: value as Stroke['align'] })
          )
        ])
      ])
    }

    function renderTextControls() {
      const node = editor.graph.getNode(state.selectedNodeId)
      if (!node || node.type !== 'TEXT') {
        return null
      }
      return h('section', { class: 'pencil-control-section' }, [
        h('h3', text('text')),
        h('div', { class: 'pencil-control-grid' }, [
          renderTextAreaControl(text('content'), node.text ?? '', (value) => updateSelectedNode({ text: value })),
          h(Label, { class: 'pencil-control-field' }, {
            default: () => [
              h('span', text('fontFamily')),
              renderInput({
                label: text('fontFamily'),
                value: node.fontFamily ?? 'Inter',
                onInput: (value) => updateSelectedNode({ fontFamily: value })
              })
            ]
          }),
          renderNumberControl(text('fontSize'), node.fontSize ?? 16, (value) => updateSelectedNode({ fontSize: Math.max(1, value) })),
          renderNumberControl(text('weight'), node.fontWeight ?? 400, (value) => updateSelectedNode({ fontWeight: Math.round(clampNumber(value, 1, 1000)) })),
          renderNumberControl(text('letterSpacing'), node.letterSpacing ?? 0, (value) => updateSelectedNode({ letterSpacing: value })),
          renderNumberControl(text('lineHeight'), node.lineHeight ?? 0, (value) => updateSelectedNode({ lineHeight: value <= 0 ? null : value })),
          renderSelectControl(
            text('align'),
            node.textAlignHorizontal ?? 'LEFT',
            selectEntries(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED']),
            (value) => updateSelectedNode({ textAlignHorizontal: value as SceneNode['textAlignHorizontal'] })
          ),
          renderSelectControl(
            text('vertical'),
            node.textAlignVertical ?? 'TOP',
            selectEntries(['TOP', 'CENTER', 'BOTTOM']),
            (value) => updateSelectedNode({ textAlignVertical: value as SceneNode['textAlignVertical'] })
          ),
          renderSelectControl(
            text('case'),
            node.textCase ?? 'ORIGINAL',
            selectEntries(['ORIGINAL', 'UPPER', 'LOWER', 'TITLE']),
            (value) => updateSelectedNode({ textCase: value as SceneNode['textCase'] })
          ),
          renderSelectControl(
            text('decoration'),
            node.textDecoration ?? 'NONE',
            selectEntries(['NONE', 'UNDERLINE', 'STRIKETHROUGH']),
            (value) => updateSelectedNode({ textDecoration: value as SceneNode['textDecoration'] })
          )
        ])
      ])
    }

    function renderActivityPanel() {
      return renderPanel(text('actionLog'), h('div', { class: 'pencil-activity-body' }, [renderVersionsList(), renderLogsList()]), {
        class: 'pencil-activity-panel'
      })
    }

    function renderVersionsList() {
      return h('div', { class: 'pencil-activity-section' }, [
        h('h3', text('versions')),
        versions.value.length
          ? versions.value.map((version) =>
              h('div', { class: 'pencil-version-item' }, [
                h('div', [
                  h('strong', `${text('version')} ${version.versionNumber ?? '?'}`),
                  h('span', version.sourceType ? `${text('source')} ${uiValueLabel(version.sourceType, state.locale)}` : '')
                ]),
                version.changeSummary ? h('small', version.changeSummary) : null,
                version.createdAt ? h('small', formatDate(version.createdAt, state.locale)) : null,
                renderButton({ disabled: state.busy, onClick: () => restoreVersion(version.id) }, text('restore'))
              ])
            )
          : h('p', { class: 'pencil-empty-note' }, text('versionsEmpty'))
      ])
    }

    function renderLogsList() {
      return h('div', { class: 'pencil-activity-section' }, [
        h('h3', text('actionLog')),
        logs.value.length
          ? logs.value.map((log) =>
              h('div', { class: 'pencil-log-item' }, [
                h('strong', actionLabel(log.action, state.locale)),
                h('span', String(log.message ?? log.errorMessage ?? ''))
              ])
            )
          : h('p', { class: 'pencil-empty-note' }, text('logsEmpty'))
      ])
    }

    return () =>
      h(
        WorkbenchShell,
        {
          leftCollapsed: state.leftPanelCollapsed,
          inspectorCollapsed: state.inspectorPanelCollapsed
        },
        {
          header: () => renderTopbar(),
          left: () => renderDocumentsPanel(),
          stage: () => renderStagePanel(),
          inspector: () => renderInspectorPanel(),
          dialogs: () =>
            h(DeleteDocumentDialog, {
              open: state.deleteDialogOpen,
              busy: state.busy,
              title: text('deleteDocumentTitle'),
              description: text('deleteDocumentDescription', { title: currentTitle.value }),
              cancelLabel: text('cancel'),
              confirmLabel: text('deleteDocumentConfirm'),
              'onUpdate:open': (open: boolean) => {
                state.deleteDialogOpen = open
              },
              onConfirm: () => void deleteDocument()
            })
        }
      )
  }
})

/** Mounts only after font bytes are cached so the first text layout uses real glyph metrics. */
async function bootstrapPencilWorkbench() {
  try {
    await preparePencilFonts()
  } catch (error) {
    pencilWorkbenchDebug('bundled font preparation failed', error)
  }
  createApp(App).mount('#root')
}

void bootstrapPencilWorkbench()
