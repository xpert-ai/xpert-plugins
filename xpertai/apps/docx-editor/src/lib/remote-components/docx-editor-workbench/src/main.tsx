import { DocxEditor, type DocxEditorRef, type EditorMode } from '@eigenpal/docx-editor-react'
import '@eigenpal/docx-editor-react/styles.css'
import { useDocxAgentTools } from '@eigenpal/docx-editor-agents/react'
import enDocxEditorI18n from '@eigenpal/docx-editor-i18n/en'
import zhCNDocxEditorI18n from '@eigenpal/docx-editor-i18n/zh-CN'
import type { Translations } from '@eigenpal/docx-editor-i18n'
import {
  Archive,
  Badge,
  Button,
  Check,
  ChevronDown,
  ChevronRight,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Separator,
  Textarea,
  Upload,
} from '@xpert-ai/plugin-shadcn-ui'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, SidebarTitle, SidebarTrigger } from './workbench-sidebar'
import { React, ReactDOM, h } from './vendor'
import { createTranslator } from './i18n'
import { injectStyles } from './styles'
import {
  buildClearDocxAssistantContextPayload,
  buildDocxAssistantContextPayload,
  numberValue,
  stringValue
} from './assistant-context'
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

type DocumentRecord = Record<string, any>
type VersionRecord = Record<string, any>
type PendingUpload = {
  file: File
  documentId: string
  documentTitle: string
}
type DetailPayload = {
  item?: DocumentRecord
  currentVersion?: VersionRecord | null
  versions?: VersionRecord[]
  snapshot?: Record<string, any> | null
  operations?: Record<string, any>[]
}
type ApplyDetailPayloadOptions = {
  preserveVersionExpanded?: boolean
  preserveEditorBuffer?: boolean
  preserveLiveState?: boolean
}
type SelectDocumentOptions = {
  force?: boolean
  toggleActive?: boolean
  versionId?: string | null
}

type SyncSnapshotOptions = {
  notifyUser?: boolean
  includeDocument?: boolean
  includePages?: boolean
  refreshRemoteVersion?: boolean
}

const ASSISTANT_CONTEXT_COMMAND = 'assistant.context.set'
const READ_ONLY_HOST_EVENT_TOOL_NAMES = new Set([
  'docx_read_document',
  'docx_read_selection',
  'docx_read_page',
  'docx_read_pages',
  'docx_find_text',
  'docx_read_comments',
  'docx_read_changes'
])
const METADATA_REFRESH_HOST_EVENT_TOOL_NAMES = new Set([
  'docx_add_comment',
  'docx_suggest_change',
  'docx_apply_formatting',
  'docx_set_paragraph_style',
  'docx_reply_comment',
  'docx_resolve_comment',
  'docx_resolve_all_comments',
  'docx_delete_comment',
  'docx_delete_all_comments',
  'docx_accept_change',
  'docx_reject_change',
  'docx_accept_all_changes',
  'docx_reject_all_changes',
  'docx_scroll'
])
const QUEUED_LIVE_OPERATION_TOOL_NAMES = new Set([
  'docx_add_comment',
  'docx_suggest_change',
  'docx_apply_formatting',
  'docx_set_paragraph_style',
  'docx_reply_comment',
  'docx_resolve_comment',
  'docx_scroll'
])
const QUEUED_LIVE_MUTATION_TOOL_NAMES = new Set([
  'docx_add_comment',
  'docx_suggest_change',
  'docx_apply_formatting',
  'docx_set_paragraph_style',
  'docx_reply_comment',
  'docx_resolve_comment'
])
injectStyles()

function App() {
  const [context, setContext] = React.useState<any>(null)
  const [documents, setDocuments] = React.useState<DocumentRecord[]>([])
  const [detail, setDetail] = React.useState<DetailPayload | null>(null)
  const [selectedId, setSelectedId] = React.useState('')
  const [buffer, setBuffer] = React.useState<ArrayBuffer | null>(null)
  const [documentKey, setDocumentKey] = React.useState('')
  const [mode, setMode] = React.useState<EditorMode>('editing')
  const [busy, setBusy] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [assistantInstruction, setAssistantInstruction] = React.useState('')
  const [leftPanelCollapsed, setLeftPanelCollapsed] = React.useState(false)
  const [rightPanelCollapsed, setRightPanelCollapsed] = React.useState(true)
  const [versionListExpanded, setVersionListExpanded] = React.useState(false)
  const [pendingUpload, setPendingUpload] = React.useState<PendingUpload | null>(null)
  const editorRef = React.useRef<DocxEditorRef | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const selectedIdRef = React.useRef('')
  const detailRef = React.useRef<DetailPayload | null>(null)
  const bufferRef = React.useRef<ArrayBuffer | null>(null)
  const selectionContextRef = React.useRef<Record<string, any> | null>(null)
  const selectionSnapshotTimerRef = React.useRef<number | null>(null)
  const bridgeReadyRef = React.useRef(false)
  const processedOperationIdsRef = React.useRef<Set<string>>(new Set())
  const t = createTranslator(context?.locale)
  const docxEditorI18n = resolveDocxEditorI18n(context?.locale)
  const agentTools = useDocxAgentTools({
    editorRef,
    author: 'Xpert DOCX Assistant'
  })

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
    bufferRef.current = buffer
  }, [buffer])

  React.useEffect(() => {
    if (selectedId && detail?.item) {
      void updateAssistantContext()
    } else {
      void clearAssistantContext()
    }
  }, [selectedId, detail?.item?.id, detail?.currentVersion?.id, dirty, mode])

  React.useEffect(() => {
    startRemoteBridge(
      (nextContext) => {
        bridgeReadyRef.current = true
        setContext(nextContext)
        hydratePayload(nextContext.payload || null)
        setTimeout(() => reloadList(), 0)
      },
      (event) => {
        void handleHostEvent(event)
      }
    )
    post('ready')
    return () => {
      clearSelectionSnapshotTimer()
      void clearAssistantContext()
    }
  }, [])

  React.useEffect(() => {
    const query = window.matchMedia?.('(max-width: 1120px)')
    if (!query) {
      return
    }
    const syncPanelDefaults = () => {
      setLeftPanelCollapsed(query.matches)
      setRightPanelCollapsed(true)
    }
    syncPanelDefaults()
    query.addEventListener('change', syncPanelDefaults)
    return () => query.removeEventListener('change', syncPanelDefaults)
  }, [])

  React.useEffect(reportResize, [documents, detail, buffer, busy, dirty, versionListExpanded])

  React.useEffect(() => {
    void applyQueuedOperations()
  }, [detail?.operations, buffer])

  function hydratePayload(payload: any) {
    if (!payload) {
      return
    }
    if (Array.isArray(payload.items)) {
      setDocuments(payload.items)
      if (!selectedIdRef.current && payload.items[0]?.id) {
        void selectDocument(payload.items[0].id)
      }
      return
    }
    if (payload.item) {
      applyDetailPayload(payload)
    }
  }

  function applyDetailPayload(payload: DetailPayload, options?: ApplyDetailPayloadOptions) {
    detailRef.current = payload
    setDetail(payload)
    const item = payload.item
    const version = payload.currentVersion
    const nextId = item?.id || ''
    if (!options?.preserveVersionExpanded) {
      setVersionListExpanded(false)
    }
    selectedIdRef.current = nextId
    setSelectedId(nextId)
    if (!options?.preserveLiveState) {
      selectionContextRef.current = null
      clearSelectionSnapshotTimer()
      setDirty(false)
    }
    if (options?.preserveEditorBuffer) {
      return
    }
    if (version?.docxBase64) {
      setBuffer(base64ToArrayBuffer(version.docxBase64))
      setDocumentKey(`${nextId}:${version.id || version.versionNumber || Date.now()}`)
    } else {
      setBuffer(null)
      setDocumentKey(`${nextId}:empty`)
    }
  }

  async function handleHostEvent(event: unknown) {
    const toolName = getHostEventToolName(event)
    if (toolName && READ_ONLY_HOST_EVENT_TOOL_NAMES.has(toolName)) {
      return
    }
    if (toolName && METADATA_REFRESH_HOST_EVENT_TOOL_NAMES.has(toolName)) {
      await refreshAfterWorkbenchMutationEvent(event)
      return
    }
    await reloadAfterHostEvent()
  }

  async function refreshAfterWorkbenchMutationEvent(event: unknown) {
    const currentDocumentId = selectedIdRef.current
    await reloadList()
    if (!currentDocumentId) {
      return
    }
    const eventDocumentId = getHostEventDocumentId(event)
    if (eventDocumentId && eventDocumentId !== currentDocumentId) {
      return
    }
    await refreshCurrentDocumentFromServer()
  }

  async function reloadAfterHostEvent() {
    await reloadList()
    if (selectedIdRef.current) {
      await selectDocument(selectedIdRef.current, { force: true })
    }
  }

  async function reloadList() {
    const response = await requestData({ page: 1, pageSize: 50 })
    const payload = getResponsePayload(response)
    const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.table?.items) ? payload.table.items : []
    setDocuments(items)
    if (!selectedIdRef.current && items[0]?.id) {
      await selectDocument(items[0].id)
    }
    return items
  }

  function buildDocumentRequestParameters(documentId: string, versionId?: string | null) {
    const parameters: Record<string, string> = { documentId }
    const normalizedVersionId = stringValue(versionId)
    if (normalizedVersionId) {
      parameters.versionId = normalizedVersionId
    }
    return parameters
  }

  async function refreshCurrentDocumentFromServer() {
    const currentDocumentId = selectedIdRef.current
    if (!currentDocumentId) {
      return false
    }

    const currentDetail = detailRef.current
    const previousVersionId = stringValue(currentDetail?.currentVersion?.id)
    const shouldRequestLatestVersion = isViewingCurrentDocumentVersion(currentDetail)
    const response = await requestData({
      parameters: buildDocumentRequestParameters(
        currentDocumentId,
        shouldRequestLatestVersion ? undefined : previousVersionId
      )
    })
    const payload = getResponsePayload(response)
    const shouldReloadEditor = shouldReloadEditorForServerDetail(payload, previousVersionId, Boolean(bufferRef.current))
    applyDetailPayload(payload, {
      preserveVersionExpanded: true,
      preserveEditorBuffer: !shouldReloadEditor,
      preserveLiveState: !shouldReloadEditor
    })
    return shouldReloadEditor
  }

  async function selectDocument(documentId: string, options?: SelectDocumentOptions) {
    if (!documentId) {
      return
    }
    const requestedVersionId = stringValue(options?.versionId)
    const loadedVersionId = stringValue(detailRef.current?.currentVersion?.id)
    const isCurrentDocument = documentId === selectedIdRef.current && detailRef.current?.item?.id === documentId
    const requestedVersionLoaded = !requestedVersionId || requestedVersionId === loadedVersionId
    if (isCurrentDocument && requestedVersionLoaded && !options?.force) {
      if (options?.toggleActive) {
        setVersionListExpanded((expanded) => !expanded)
      }
      return
    }
    const response = await requestData({
      parameters: buildDocumentRequestParameters(documentId, requestedVersionId)
    })
    const payload = getResponsePayload(response)
    applyDetailPayload(payload, { preserveVersionExpanded: isCurrentDocument })
  }

  async function selectVersion(versionId: string) {
    const documentId = selectedIdRef.current
    if (!documentId || !versionId) {
      return
    }
    await runBusy(async () => {
      await selectDocument(documentId, { force: true, versionId })
    })
  }

  async function createDocument() {
    const title = `Untitled ${new Date().toISOString().slice(0, 10)}`
    await runBusy(async () => {
      const response = await executeAction('create_document', null, { title }, null)
      const item = getResponsePayload(response)?.data || getResponsePayload(response)
      await reloadList()
      if (item?.id) {
        await selectDocument(item.id)
      }
    })
  }

  async function uploadFile(file: File) {
    if (selectedId) {
      setPendingUpload({
        file,
        documentId: selectedId,
        documentTitle: String(detail?.item?.title || detail?.item?.fileName || selectedId)
      })
      return
    }

    await uploadFileAsTarget(file, '')
  }

  async function confirmPendingUpload() {
    const upload = pendingUpload
    if (!upload) {
      return
    }
    setPendingUpload(null)
    await uploadFileAsTarget(upload.file, upload.documentId)
  }

  async function uploadPendingAsNewDocument() {
    const upload = pendingUpload
    if (!upload) {
      return
    }
    setPendingUpload(null)
    await uploadFileAsTarget(upload.file, '')
  }

  async function uploadFileAsTarget(file: File, targetDocumentId: string) {
    await runBusy(async () => {
      const response = await executeFileAction(
        'upload_docx',
        targetDocumentId || null,
        {
          documentId: targetDocumentId || undefined,
          title: targetDocumentId ? undefined : file.name.replace(/\.docx$/i, ''),
          name: file.name
        },
        null,
        file
      )
      const payload = getResponsePayload(response)?.data || getResponsePayload(response)
      const documentId = payload?.document?.id || payload?.item?.id || payload?.id || targetDocumentId
      await reloadList()
      if (documentId) {
        await selectDocument(documentId, { force: true })
      }
    })
  }

  async function saveVersion(changeSummary = 'Saved from DOCX Editor Workbench') {
    if (!selectedId || !editorRef.current) {
      return
    }
    await runBusy(async () => {
      const saved = await editorRef.current?.save()
      if (!saved) {
        throw new Error('Editor did not return a DOCX buffer.')
      }
      const response = await executeAction(
        'save_document_version',
        selectedId,
        {
          documentId: selectedId,
          docxBase64: arrayBufferToBase64(saved),
          title: detail?.item?.title,
          fileName: detail?.item?.fileName,
          mimeType: detail?.item?.mimeType,
          size: saved.byteLength,
          changeSummary
        },
        { documentId: selectedId }
      )
      const payload = getResponsePayload(response)
      notify('success', resolveMessage(payload?.message, context?.locale) || t('save'))
      setDirty(false)
      await selectDocument(selectedId, { force: true })
      await syncSnapshot()
    })
  }

  async function syncSnapshot(options: SyncSnapshotOptions = {}) {
    if (!selectedId || !editorRef.current) {
      return
    }
    const includeDocument = options.includeDocument ?? true
    const includePages = options.includePages ?? includeDocument
    if (includeDocument && options.refreshRemoteVersion !== false) {
      const reloaded = await refreshCurrentDocumentFromServer()
      if (reloaded) {
        if (options.notifyUser !== false) {
          notify('success', t('synced'))
        }
        return
      }
    }
    const readDocument = includeDocument ? agentTools.executeToolCall('read_document', {}) : null
    const readComments = includeDocument ? agentTools.executeToolCall('read_comments', {}) : null
    const readChanges = includeDocument ? agentTools.executeToolCall('read_changes', {}) : null
    const contextSnapshot = agentTools.getContext()
    selectionContextRef.current = contextSnapshot
    const totalPages = contextSnapshot.totalPages || editorRef.current.getTotalPages?.() || 0
    const pages = []
    if (includePages) {
      for (let pageNumber = 1; pageNumber <= Math.min(totalPages, 20); pageNumber++) {
        const page = agentTools.executeToolCall('read_page', { pageNumber })
        if (page.success && page.data) {
          pages.push(page.data)
        }
      }
    }
    await executeAction(
      'sync_snapshot',
      selectedId,
      {
        documentId: selectedId,
        versionId: detailRef.current?.currentVersion?.id,
        ...(includeDocument
          ? {
              contentText: typeof readDocument?.data === 'string' ? readDocument.data : JSON.stringify(readDocument?.data ?? ''),
              paragraphCount: countParagraphLines(readDocument?.data),
              comments: readComments?.data ?? [],
              changes: readChanges?.data ?? []
            }
          : {}),
        totalPages,
        currentPage: contextSnapshot.currentPage || 0,
        selection: contextSnapshot.selection,
        ...(includePages ? { pages } : {})
      },
      { documentId: selectedId }
    )
    await updateAssistantContext()
    if (options.notifyUser !== false) {
      notify('success', t('synced'))
    }
  }

  async function askAssistant() {
    if (!selectedId) {
      return
    }
    await runBusy(async () => {
      await syncSnapshot()
      const response = await executeAction(
        'prepare_assistant_prompt',
        selectedId,
        { documentId: selectedId, instruction: assistantInstruction || t('assistantPlaceholder') },
        { documentId: selectedId }
      )
      const payload = getResponsePayload(response)?.data || getResponsePayload(response)
      if (payload?.commandKey && payload?.payload) {
        await invokeClientCommand(payload.commandKey, payload.payload)
      }
    })
  }

  async function restoreVersion(versionId: string) {
    if (!selectedId || !versionId) {
      return
    }
    await runBusy(async () => {
      await executeAction(
        'restore_version',
        selectedId,
        { documentId: selectedId, versionId, changeSummary: 'Restored from Workbench.' },
        { documentId: selectedId }
      )
      await selectDocument(selectedId, { force: true })
    })
  }

  async function deleteDocument() {
    if (!selectedId) {
      return
    }
    await runBusy(async () => {
      await executeAction('delete_document', selectedId, { documentId: selectedId }, { documentId: selectedId })
      selectedIdRef.current = ''
      setSelectedId('')
      setDetail(null)
      setBuffer(null)
      await clearAssistantContext()
      await reloadList()
    })
  }

  function handleSelectionChange(selectionState: unknown) {
    const contextSnapshot = safeGetAgentContext()
    selectionContextRef.current = {
      ...(contextSnapshot || {}),
      selection: contextSnapshot?.selection ?? selectionState ?? null
    }
    void updateAssistantContext()
    scheduleSelectionSnapshotSync()
  }

  function scheduleSelectionSnapshotSync() {
    clearSelectionSnapshotTimer()
    selectionSnapshotTimerRef.current = window.setTimeout(() => {
      selectionSnapshotTimerRef.current = null
      void syncSnapshot({ notifyUser: false, includeDocument: false, includePages: false }).catch((error) => {
        console.warn('Failed to sync DOCX selection snapshot:', error)
      })
    }, 800)
  }

  function clearSelectionSnapshotTimer() {
    if (selectionSnapshotTimerRef.current == null) {
      return
    }
    window.clearTimeout(selectionSnapshotTimerRef.current)
    selectionSnapshotTimerRef.current = null
  }

  function safeGetAgentContext() {
    try {
      return agentTools.getContext()
    } catch {
      return null
    }
  }

  async function updateAssistantContext() {
    if (!bridgeReadyRef.current) {
      return
    }
    const payload = buildAssistantContextPayload()
    if (!payload) {
      await clearAssistantContext()
      return
    }

    await invokeClientCommand(ASSISTANT_CONTEXT_COMMAND, payload).catch((error) => {
      console.warn('Failed to update DOCX assistant context:', error)
      return null
    })
  }

  async function clearAssistantContext() {
    if (!bridgeReadyRef.current) {
      return
    }
    await invokeClientCommand(ASSISTANT_CONTEXT_COMMAND, {
      ...buildClearDocxAssistantContextPayload()
    }).catch((error) => {
      console.warn('Failed to clear DOCX assistant context:', error)
      return null
    })
  }

  function buildAssistantContextPayload() {
    const selectionContext = selectionContextRef.current || safeGetAgentContext()
    return buildDocxAssistantContextPayload({
      documentId: selectedIdRef.current,
      detail: detailRef.current,
      dirty,
      mode,
      selectionContext
    })
  }

  async function applyQueuedOperations() {
    if (!editorRef.current || !detail?.operations?.length) {
      return
    }
    const queued = detail.operations.filter((operation) => operation.status === 'queued')
    let appliedMutation = false
    for (const operation of queued) {
      const operationId = stringValue(operation.id)
      if (!operationId || processedOperationIdsRef.current.has(operationId)) {
        continue
      }
      if (!QUEUED_LIVE_OPERATION_TOOL_NAMES.has(String(operation.toolName || ''))) {
        continue
      }
      processedOperationIdsRef.current.add(operationId)

      const outcome = executeQueuedLiveOperation(operation)
      if (!outcome) {
        continue
      }
      if (QUEUED_LIVE_MUTATION_TOOL_NAMES.has(String(operation.toolName || '')) && didApplyQueuedMutation(outcome)) {
        appliedMutation = true
        setDirty(true)
      }

      markOperationCompleteLocally(operationId, outcome)
      try {
        await executeAction(
          'complete_operation',
          selectedIdRef.current,
          {
            operationId,
            status: outcome.status,
            result: outcome.result,
            errorMessage: outcome.errorMessage
          },
          { documentId: selectedIdRef.current }
        )
      } catch (error) {
        console.warn('Failed to complete queued DOCX operation:', error)
      }
    }
    if (appliedMutation) {
      await syncSnapshot({ notifyUser: false, refreshRemoteVersion: false }).catch((error) => {
        console.warn('Failed to sync DOCX snapshot after queued operation:', error)
      })
    }
  }

  function executeQueuedLiveOperation(operation: Record<string, any>) {
    const toolName = String(operation.toolName || '')
    const input = isRecord(operation.input) ? operation.input : {}
    if (toolName === 'docx_scroll') {
      const paraId = stringValue(input.paraId)
      const ok = paraId ? editorRef.current?.scrollToParaId(paraId) === true : false
      return {
        status: ok ? 'applied' : 'failed',
        result: { success: ok },
        errorMessage: ok ? undefined : 'paraId was not found in the live editor.'
      }
    }

    try {
      if (toolName === 'docx_suggest_change' && Array.isArray(input.changes)) {
        return executeQueuedLiveSuggestChangeBatch(input.changes)
      }
      const result = agentTools.executeToolCall(toLiveToolName(toolName), input)
      return {
        status: result.success ? 'applied' : 'failed',
        result,
        errorMessage: result.success ? undefined : result.error || 'Live editor operation failed.'
      }
    } catch (error) {
      const message = getErrorMessage(error)
      return {
        status: 'failed',
        result: { success: false, error: message },
        errorMessage: message
      }
    }
  }

  function executeQueuedLiveSuggestChangeBatch(changes: unknown[]) {
    const results = changes.map((change, index) => {
      if (!isRecord(change)) {
        return {
          success: false,
          error: `changes[${index}] is not an object.`
        }
      }
      return agentTools.executeToolCall('suggest_change', change)
    })
    const failed = results
      .map((result, index) => ({ result, index }))
      .filter((item) => !item.result.success)
    const appliedCount = results.length - failed.length
    const success = failed.length === 0
    const message = success
      ? undefined
      : failed.map((item) => `changes[${item.index}]: ${item.result.error || 'Live editor operation failed.'}`).join('; ')
    return {
      status: success ? 'applied' : 'failed',
      result: {
        success,
        appliedCount,
        data: {
          items: results
        },
        ...(message ? { error: message } : {})
      },
      errorMessage: message
    }
  }

  function didApplyQueuedMutation(outcome: { status: string; result: unknown }) {
    if (outcome.status === 'applied') {
      return true
    }
    return isRecord(outcome.result) && (numberValue(outcome.result.appliedCount) ?? 0) > 0
  }

  function markOperationCompleteLocally(
    operationId: string,
    outcome: { status: string; result: unknown; errorMessage?: string }
  ) {
    setDetail((current) => {
      if (!current?.operations?.some((operation) => operation.id === operationId)) {
        return current
      }
      const next = {
        ...current,
        operations: current.operations.map((operation) =>
          operation.id === operationId
            ? {
                ...operation,
                status: outcome.status,
                result: outcome.result,
                errorMessage: outcome.errorMessage
              }
            : operation
        )
      }
      detailRef.current = next
      return next
    })
  }

  async function runBusy(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
      setTimeout(reportResize, 0)
    }
  }

  const currentVersionId = detail?.currentVersion?.id
  const reviewCounts = getReviewCounts(detail)
  const commentsCount = reviewCounts.comments
  const changesCount = reviewCounts.changes
  const operationsCount = detail?.operations?.length || 0
  const reviewTotal = commentsCount + changesCount
  const versions = detail?.versions || []
  const shellClass = `docx-shell ${leftPanelCollapsed ? 'left-collapsed' : ''} ${rightPanelCollapsed ? 'right-collapsed' : ''}`
  const currentDocumentTitle = detail?.item?.title || detail?.item?.fileName || (selectedId ? t('untitled') : t('noDocument'))
  const currentVersionNumber = detail?.currentVersion?.versionNumber || detail?.item?.currentVersionNumber
  const currentVersionMeta = [
    currentVersionNumber ? `v${currentVersionNumber}` : '',
    detail?.currentVersion?.source || '',
    formatDate(detail?.currentVersion?.createdAt || detail?.item?.updatedAt)
  ].filter(Boolean).join(' · ')

  return (
    <div className={shellClass}>
      <Sidebar className="docx-sidebar" side="left" collapsed={leftPanelCollapsed}>
        <SidebarHeader>
          <SidebarTrigger
            aria-label={leftPanelCollapsed ? t('expandDocuments') : t('collapseDocuments')}
            title={leftPanelCollapsed ? t('expandDocuments') : t('collapseDocuments')}
            onClick={() => setLeftPanelCollapsed((collapsed) => !collapsed)}
          >
            {leftPanelCollapsed ? <PanelLeftOpen className="docx-button-icon" aria-hidden="true" /> : <PanelLeftClose className="docx-button-icon" aria-hidden="true" />}
          </SidebarTrigger>
          {leftPanelCollapsed ? null : (
            <>
              <SidebarTitle>{t('documents')}</SidebarTitle>
              <Badge variant="secondary">{documents.length}</Badge>
            </>
          )}
        </SidebarHeader>
        {leftPanelCollapsed ? (
          <SidebarRail>
            <span>{t('documents')}</span>
          </SidebarRail>
        ) : (
          <SidebarContent>
            <ScrollArea className="docx-list-scroll">
              <div className="docx-list-stack">
                <section className="docx-section">
                  <div className="docx-section-title">{t('documents')}</div>
                  <SidebarMenu className="docx-document-menu">
                    {documents.map((item) => {
                      const active = item.id === selectedId
                      const title = item.title || item.fileName || 'Untitled'
                      return (
                        <SidebarMenuItem key={item.id} className={`docx-document-item ${active ? 'is-active' : ''}`}>
                          <SidebarMenuButton
                            className="docx-document-button"
                            isActive={active}
                            title={title}
                            onClick={() => selectDocument(item.id, { toggleActive: true })}
                          >
                            <span className="docx-row-title">{title}</span>
                            <span className="docx-row-meta">v{item.currentVersionNumber || 0} · {formatDate(item.updatedAt)}</span>
                          </SidebarMenuButton>
                          {active && versions.length ? (
                            <div className="docx-version-nest" aria-label={t('versions')}>
                              <button
                                type="button"
                                className="docx-version-toggle"
                                aria-expanded={versionListExpanded}
                                title={versionListExpanded ? t('collapseVersions') : t('expandVersions')}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setVersionListExpanded((expanded) => !expanded)
                                }}
                              >
                                {versionListExpanded ? <ChevronDown className="docx-button-icon" aria-hidden="true" /> : <ChevronRight className="docx-button-icon" aria-hidden="true" />}
                                <span>{t('versions')}</span>
                                <span className="docx-version-count">{versions.length}</span>
                              </button>
                              {versionListExpanded ? (
                                <div className="docx-version-menu">
                                  {versions.map((version) => {
                                    const versionActive = version.id === currentVersionId
                                    return (
                                      <button
                                        key={version.id}
                                        type="button"
                                        className={`docx-version-button ${versionActive ? 'is-active' : ''}`}
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          void selectVersion(version.id)
                                        }}
                                      >
                                        <span className="docx-version-text">
                                          <span className="docx-version-title">v{version.versionNumber}</span>
                                          <span className="docx-version-meta">{version.source || 'workbench'} · {formatDate(version.createdAt)}</span>
                                        </span>
                                        {versionActive ? <Check className="docx-button-icon" aria-hidden="true" /> : null}
                                      </button>
                                    )
                                  })}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenu>
                </section>
              </div>
            </ScrollArea>
          </SidebarContent>
        )}
      </Sidebar>
      <main className="docx-main">
        <div className="docx-toolbar">
          <div className="docx-toolbar-title">
            <div className="docx-brand">{currentDocumentTitle}</div>
            {currentVersionMeta ? <div className="docx-toolbar-meta">{currentVersionMeta}</div> : null}
          </div>
          <div className="docx-toolbar-actions">
            <div className="docx-toolbar-primary">
              <Button variant="outline" size="sm" title={t('new')} disabled={busy} onClick={createDocument}>
                <Plus className="docx-button-icon" aria-hidden="true" />
                <span className="docx-action-label">{t('new')}</span>
              </Button>
              <Button variant="outline" size="sm" title={t('upload')} disabled={busy} onClick={() => fileInputRef.current?.click()}>
                <Upload className="docx-button-icon" aria-hidden="true" />
                <span className="docx-action-label">{t('upload')}</span>
              </Button>
              <Button size="sm" title={t('save')} disabled={!buffer || busy} onClick={() => saveVersion()}>
                <Save className="docx-button-icon" aria-hidden="true" />
                <span className="docx-action-label">{t('save')}</span>
              </Button>
              <Button variant="outline" size="sm" title={t('sync')} disabled={!buffer || busy} onClick={syncSnapshot}>
                <RotateCcw className="docx-button-icon" aria-hidden="true" />
                <span className="docx-action-label">{t('sync')}</span>
              </Button>
            </div>
            <div className="docx-toolbar-secondary">
              <Select value={mode} onValueChange={(value) => setMode(value as EditorMode)}>
                <SelectTrigger className="docx-mode-select" aria-label={t('mode')}>
                  <SelectValue placeholder={t('mode')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editing">{t('editing')}</SelectItem>
                  <SelectItem value="suggesting">{t('suggesting')}</SelectItem>
                  <SelectItem value="viewing">{t('viewing')}</SelectItem>
                </SelectContent>
              </Select>
              <Badge className="docx-status" variant="outline" data-status={dirty ? 'warning' : 'success'}>{dirty ? t('dirty') : t('synced')}</Badge>
              <Button className="docx-danger-action" variant="ghost" size="icon" title={t('delete')} aria-label={t('delete')} disabled={!selectedId || busy} onClick={deleteDocument}>
                <Archive className="docx-button-icon" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          className="docx-hidden"
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) {
              void uploadFile(file)
            }
          }}
        />
        <Dialog open={Boolean(pendingUpload)} onOpenChange={(open) => {
          if (!open) {
            setPendingUpload(null)
          }
        }}>
          <DialogContent className="docx-upload-dialog">
            <DialogHeader>
              <DialogTitle>{t('confirmCurrentUploadTitle')}</DialogTitle>
              <DialogDescription>{t('confirmCurrentUploadDescription')}</DialogDescription>
            </DialogHeader>
            <div className="docx-upload-dialog-body">
              <div className="docx-upload-dialog-row">
                <span>{t('confirmCurrentUploadDocument')}</span>
                <strong>{pendingUpload?.documentTitle || ''}</strong>
              </div>
              <div className="docx-upload-dialog-row">
                <span>{t('confirmCurrentUploadFile')}</span>
                <strong>{pendingUpload?.file.name || ''}</strong>
              </div>
            </div>
            <DialogFooter className="docx-upload-dialog-footer">
              <Button variant="outline" disabled={busy} onClick={() => setPendingUpload(null)}>
                {t('confirmCurrentUploadCancel')}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void uploadPendingAsNewDocument()}>
                <Plus className="docx-button-icon" aria-hidden="true" />
                {t('confirmCurrentUploadNew')}
              </Button>
              <Button disabled={busy} onClick={() => void confirmPendingUpload()}>
                <Upload className="docx-button-icon" aria-hidden="true" />
                {t('confirmCurrentUploadCurrent')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="docx-editor-host">
          {buffer ? (
            <div className="docx-editor-frame">
              <DocxEditor
                key={documentKey}
                ref={editorRef}
                documentBuffer={buffer}
                mode={mode}
                author="Xpert DOCX Assistant"
                i18n={docxEditorI18n}
                documentName={detail?.item?.title || detail?.item?.fileName || 'Untitled.docx'}
                onChange={() => setDirty(true)}
                onSelectionChange={handleSelectionChange}
                onSave={(saved) => {
                  void executeAction('save_document_version', selectedId, {
                    documentId: selectedId,
                    docxBase64: arrayBufferToBase64(saved),
                    title: detail?.item?.title,
                    fileName: detail?.item?.fileName,
                    size: saved.byteLength,
                    changeSummary: 'Saved from editor toolbar.'
                  }, { documentId: selectedId })
                }}
                onError={(error) => notify('error', error.message)}
                showRuler
                showZoomControl
                renderLogo={() => <span className="docx-editor-logo">DOCX</span>}
                initialZoom={0.92}
                style={{ height: '100%' }}
              />
            </div>
          ) : (
            <div className="docx-empty">
              <div>
                <h1>{selectedId ? t('uploadHint') : t('noDocument')}</h1>
                <Button onClick={() => fileInputRef.current?.click()}>
                  <Upload className="docx-button-icon" aria-hidden="true" />
                  {t('upload')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
      <Sidebar className="docx-inspector" side="right" collapsed={rightPanelCollapsed}>
        <SidebarHeader>
          {rightPanelCollapsed ? null : (
            <>
              <SidebarTitle className="docx-sidebar-title-truncate">{t('review')}</SidebarTitle>
              <Badge variant="secondary">{reviewTotal}</Badge>
            </>
          )}
          <SidebarTrigger
            className="docx-sidebar-trigger-right"
            aria-label={rightPanelCollapsed ? t('expandReview') : t('collapseReview')}
            title={rightPanelCollapsed ? t('expandReview') : t('collapseReview')}
            onClick={() => setRightPanelCollapsed((collapsed) => !collapsed)}
          >
            {rightPanelCollapsed ? <PanelRightOpen className="docx-button-icon" aria-hidden="true" /> : <PanelRightClose className="docx-button-icon" aria-hidden="true" />}
          </SidebarTrigger>
        </SidebarHeader>
        {rightPanelCollapsed ? (
          <SidebarRail>
            <span>{t('review')}</span>
          </SidebarRail>
        ) : (
          <SidebarContent>
            <ScrollArea className="docx-inspector-scroll">
              <div className="docx-inspector-stack">
                <section className="docx-section">
                  <div className="docx-section-title">{t('review')}</div>
                  <div className="docx-review-summary">
                    <div className="docx-review-metric"><span>{t('comments')}</span><strong>{commentsCount}</strong></div>
                    <div className="docx-review-metric"><span>{t('changes')}</span><strong>{changesCount}</strong></div>
                    <div className="docx-review-metric"><span>{t('operations')}</span><strong>{operationsCount}</strong></div>
                  </div>
                </section>
                <Separator />
                <section className="docx-section">
                  <div className="docx-section-title">{t('ask')}</div>
                  <Textarea
                    className="docx-field"
                    value={assistantInstruction}
                    placeholder={t('assistantPlaceholder')}
                    onChange={(event) => setAssistantInstruction(event.target.value)}
                  />
                  <Button disabled={!selectedId || busy} onClick={askAssistant}>
                    <Send className="docx-button-icon" aria-hidden="true" />
                    {t('ask')}
                  </Button>
                </section>
              </div>
            </ScrollArea>
          </SidebarContent>
        )}
      </Sidebar>
    </div>
  )
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

function countParagraphLines(value: unknown) {
  return typeof value === 'string' ? value.split('\n').filter(Boolean).length : 0
}

function isViewingCurrentDocumentVersion(detail: DetailPayload | null) {
  const documentCurrentVersionId = stringValue(detail?.item?.currentVersionId)
  const viewedVersionId = stringValue(detail?.currentVersion?.id)
  return !documentCurrentVersionId || !viewedVersionId || documentCurrentVersionId === viewedVersionId
}

function shouldReloadEditorForServerDetail(payload: DetailPayload | null, previousVersionId: string | undefined, hasEditorBuffer: boolean) {
  if (!payload?.currentVersion?.docxBase64) {
    return false
  }
  const nextVersionId = stringValue(payload.currentVersion.id)
  if (!hasEditorBuffer) {
    return true
  }
  if (!previousVersionId) {
    return Boolean(nextVersionId)
  }
  return Boolean(nextVersionId && nextVersionId !== previousVersionId)
}

function getReviewCounts(detail: DetailPayload | null) {
  const snapshotComments = Array.isArray(detail?.snapshot?.comments) ? detail.snapshot.comments.length : 0
  const snapshotChanges = Array.isArray(detail?.snapshot?.changes) ? detail.snapshot.changes.length : 0
  const operationCounts = getOperationReviewCounts(detail?.operations)
  return {
    comments: Math.max(snapshotComments, operationCounts.comments),
    changes: Math.max(snapshotChanges, operationCounts.changes)
  }
}

function getOperationReviewCounts(operations: Record<string, any>[] | undefined) {
  let comments = 0
  let changes = 0
  for (const operation of operations ?? []) {
    if (operation?.status !== 'applied') {
      continue
    }
    const result = isRecord(operation.result) ? operation.result : null
    if (result && result.success === false) {
      continue
    }
    if (operation.toolName === 'docx_add_comment') {
      comments += countReviewItems(result?.data, 'comments') || 1
    } else if (operation.toolName === 'docx_suggest_change') {
      changes += countReviewItems(result?.data, 'changes') || numberValue(result?.appliedCount) || 1
    }
  }
  return { comments, changes }
}

function countReviewItems(data: unknown, key: string) {
  if (Array.isArray(data)) {
    return data.length
  }
  if (!isRecord(data)) {
    return 0
  }
  const items = data[key]
  return Array.isArray(items) ? items.length : 0
}

function getHostEventToolName(event: unknown) {
  return firstString(
    readPath(event, ['toolName']),
    readPath(event, ['tool', 'name']),
    readPath(event, ['data', 'toolName']),
    readPath(event, ['data', 'tool', 'name']),
    readPath(event, ['payload', 'toolName']),
    readPath(event, ['payload', 'tool', 'name'])
  )
}

function toLiveToolName(toolName: string) {
  return toolName.replace(/^docx_/, '')
}

function getHostEventDocumentId(event: unknown) {
  const output = parseMaybeRecord(readPath(event, ['data', 'output'])) || parseMaybeRecord(readPath(event, ['payload', 'output']))
  return firstString(
    readPath(event, ['documentId']),
    readPath(event, ['data', 'documentId']),
    readPath(output, ['documentId']),
    readPath(output, ['document', 'id']),
    readPath(output, ['data', 'documentId']),
    readPath(output, ['data', 'document', 'id']),
    readPath(output, ['result', 'documentId']),
    readPath(output, ['result', 'data', 'documentId']),
    readPath(output, ['result', 'data', 'document', 'id'])
  )
}

function readPath(value: unknown, path: string[]) {
  let current = value
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined
    }
    current = current[key]
  }
  return current
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const nextValue = stringValue(value)
    if (nextValue) {
      return nextValue
    }
  }
  return undefined
}

function parseMaybeRecord(value: unknown) {
  if (isRecord(value)) {
    return value
  }
  if (typeof value !== 'string' || !value.trim().startsWith('{')) {
    return null
  }
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function formatDate(value: unknown) {
  if (!value) {
    return ''
  }
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

function resolveDocxEditorI18n(locale: unknown): Translations {
  return String(locale || '').toLowerCase().startsWith('en') ? enDocxEditorI18n : zhCNDocxEditorI18n
}

const root = document.getElementById('root') || document.body.appendChild(document.createElement('div'))
ReactDOM.createRoot(root).render(<App />)
