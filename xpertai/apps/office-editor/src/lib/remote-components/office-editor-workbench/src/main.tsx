import { OfficeHeader, type OfficeHeaderPanel, type OfficeFormat } from './office-header'
import { OfficeDocumentPicker } from './office-document-picker'
import { createOfficeUniver } from './univer-engine'
import { CommandType, LocaleType, LogLevel, Univer, UniverInstanceType, mergeLocales } from '@univerjs/core'
import { FUniver } from '@univerjs/core/facade'
import DesignEnUS from '@univerjs/design/locale/en-US'
import DesignZhCN from '@univerjs/design/locale/zh-CN'
import { UniverDocsPlugin } from '@univerjs/docs'
import { UniverDocsUIPlugin } from '@univerjs/docs-ui'
import DocsUIEnUS from '@univerjs/docs-ui/locale/en-US'
import DocsUIZhCN from '@univerjs/docs-ui/locale/zh-CN'
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import SheetsEnUS from '@univerjs/sheets/locale/en-US'
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula'
import SheetsFormulaEnUS from '@univerjs/sheets-formula/locale/en-US'
import SheetsFormulaZhCN from '@univerjs/sheets-formula/locale/zh-CN'
import { UniverSheetsFormulaUIPlugin } from '@univerjs/sheets-formula-ui'
import SheetsFormulaUIEnUS from '@univerjs/sheets-formula-ui/locale/en-US'
import SheetsFormulaUIZhCN from '@univerjs/sheets-formula-ui/locale/zh-CN'
import { UniverSheetsNumfmtPlugin } from '@univerjs/sheets-numfmt'
import { UniverSheetsNumfmtUIPlugin } from '@univerjs/sheets-numfmt-ui'
import SheetsNumfmtUIEnUS from '@univerjs/sheets-numfmt-ui/locale/en-US'
import SheetsNumfmtUIZhCN from '@univerjs/sheets-numfmt-ui/locale/zh-CN'
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui'
import SheetsUIEnUS from '@univerjs/sheets-ui/locale/en-US'
import SheetsUIZhCN from '@univerjs/sheets-ui/locale/zh-CN'
import SheetsZhCN from '@univerjs/sheets/locale/zh-CN'
import { UniverSlidesPlugin } from '@univerjs/slides'
import {
  ActivateSlidePageOperation,
  AppendSlideOperation,
  SlideAddTextOperation,
  UniverSlidesUIPlugin,
  UpdateSlideElementOperation
} from '@univerjs/slides-ui'
import SlidesUIEnUS from '@univerjs/slides-ui/locale/en-US'
import SlidesUIZhCN from '@univerjs/slides-ui/locale/zh-CN'
import { UniverUIPlugin } from '@univerjs/ui'
import UIEnUS from '@univerjs/ui/locale/en-US'
import UIZhCN from '@univerjs/ui/locale/zh-CN'
import '@univerjs/ui/facade'
import '@univerjs/docs-ui/facade'
import '@univerjs/sheets/facade'
import '@univerjs/sheets-formula/facade'
import '@univerjs/sheets-numfmt/facade'
import '@univerjs/design/lib/index.css'
import '@univerjs/ui/lib/index.css'
import '@univerjs/docs-ui/lib/index.css'
import '@univerjs/sheets-ui/lib/index.css'
import '@univerjs/sheets-formula-ui/lib/index.css'
import '@univerjs/sheets-numfmt-ui/lib/index.css'
import '@univerjs/slides-ui/lib/index.css'
import { io, type Socket } from 'socket.io-client'
import * as Y from 'yjs'
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
  Send,
  Textarea,
  PopoverTitle, Tabs, TabsList, TabsTrigger, TabsContent, TooltipProvider,
} from '@xpert-ai/plugin-shadcn-ui'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import {
  createCollaborationClient,
  createSocketIoTransportAdapter,
  createYjsDocumentAdapter,
  type CollaborationClient,
  type CollaborationSessionDescriptor
} from '@xpert-ai/plugin-sdk/collaboration-client'
import { React, ReactDOM, h } from './vendor'
import { getSuccessfulActionData, requireSuccessfulActionResult } from './action-response'
import { createTranslator } from './i18n'
import { injectStyles } from './styles'
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

type OfficeDocumentType = 'spreadsheet' | 'document' | 'presentation'
type OfficeImportFormat = 'xlsx' | 'docx' | 'pptx'
type DocumentRecord = Record<string, any>
type SnapshotRecord = Record<string, any>
type OperationRecord = Record<string, any>
type DetailPayload = {
  item?: DocumentRecord
  currentSnapshot?: SnapshotRecord | null
  snapshots?: SnapshotRecord[]
  operations?: OperationRecord[]
  fileVersions?: Array<Record<string, any>>
  collab?: CollaborationSessionDescriptor
}

injectStyles()

function App() {
  const [context, setContext] = React.useState<any>(null)
  const [documents, setDocuments] = React.useState<DocumentRecord[]>([])
  const [detail, setDetail] = React.useState<DetailPayload | null>(null)
  const [selectedId, setSelectedId] = React.useState('')
  const [documentType, setDocumentType] = React.useState<OfficeDocumentType>('spreadsheet')
  const [importFormat, setImportFormat] = React.useState<OfficeImportFormat>('xlsx')
  const [filterType, setFilterType] = React.useState<OfficeDocumentType | 'all'>('all')
  const [busy, setBusy] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [headerPanel, setHeaderPanel] = React.useState<OfficeHeaderPanel>(null)
  const listRequestSequenceRef = React.useRef(0)
  const importFormatRef = React.useRef<OfficeImportFormat>('xlsx')
  const [deleteTarget, setDeleteTarget] = React.useState<DocumentRecord | null>(null)
  const [collabState, setCollabState] = React.useState<'connecting' | 'connected' | 'disconnected'>('disconnected')
  const [assistantInstruction, setAssistantInstruction] = React.useState('')
  const selectedIdRef = React.useRef('')
  const detailRef = React.useRef<DetailPayload | null>(null)
  const editorRef = React.useRef<any>(null)
  const importInputRef = React.useRef<HTMLInputElement | null>(null)
  const ydocRef = React.useRef<Y.Doc | null>(null)
  const socketRef = React.useRef<Socket | null>(null)
  const collaborationClientRef = React.useRef<CollaborationClient | null>(null)
  const openingDocumentRef = React.useRef<{ documentId: string; promise: Promise<void> } | null>(null)
  const openRequestSequenceRef = React.useRef(0)
  const clientIdRef = React.useRef(`office-editor-${Math.random().toString(36).slice(2)}`)
  const applyingOperationsRef = React.useRef(false)
  const unsavedRef = React.useRef(false)
  unsavedRef.current = dirty || busy
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
    startRemoteBridge(
      (nextContext) => {
        setContext(nextContext)
        const payload = nextContext.payload || null
        const requestedId = nextContext.initialQuery?.selectionId ?? nextContext.initialQuery?.parameters?.documentId
        if (typeof requestedId === 'string' && requestedId && requestedId !== selectedIdRef.current) {
          void openDocument(requestedId)
        } else if (!detailRef.current) {
          hydratePayload(payload)
        }
        if (!requestedId && !payload?.item && !Array.isArray(payload?.items) && !Array.isArray(payload?.table?.items)) {
          setTimeout(() => reloadList(), 0)
        }
      },
      () => {
        if (!unsavedRef.current) void reloadAfterHostEvent()
      },
      (event) => {
        if (event.kind === 'prepareClose' && event.resourceId === selectedIdRef.current && typeof event.requestId === 'string') {
          post('closePrepared', { requestId: event.requestId, ready: !unsavedRef.current })
        }
      }
    )
    post('ready')
  }, [])

  React.useEffect(reportResize, [documents, detail, busy, dirty, collabState])
  React.useEffect(() => {
    if (selectedId) void invokeClientCommand('workbench.content.status', {
      resourceId: selectedId, title: detail?.item?.title, dirty: dirty || busy,
      label: t(dirty ? 'dirty' : 'synced')
    }).catch(() => undefined)
  }, [selectedId, detail?.item?.title, dirty, busy, context?.locale])

  React.useEffect(() => {
    void applyQueuedOperations()
  }, [detail?.operations, selectedId])

  function hydratePayload(payload: any) {
    if (!payload) {
      return
    }
    if (Array.isArray(payload.items)) {
      setDocuments(payload.items)
      return
    }
    if (payload.item) {
      applyDetailPayload(payload)
    }
  }

  function applyDetailPayload(payload: DetailPayload) {
    setDetail(payload)
    const item = payload.item
    const nextId = item?.id || ''
    selectedIdRef.current = nextId
    setSelectedId(nextId)
    if (item?.documentType) {
      setDocumentType(item.documentType)
    }
    setDirty(false)
    initializeYjs(payload)
    initializeSocket(payload)
  }

  async function reloadAfterHostEvent() {
    const selectedBeforeReload = selectedIdRef.current
    await reloadList()
    if (selectedBeforeReload && selectedIdRef.current === selectedBeforeReload) {
      await openDocument(selectedBeforeReload)
    }
  }

  async function reloadList(nextFilter = filterType) {
    const request = ++listRequestSequenceRef.current
    const parameters = nextFilter === 'all' ? {} : { documentType: nextFilter }
    const response = await requestData({ page: 1, pageSize: 50, parameters })
    const payload = getResponsePayload(response)
    const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.table?.items) ? payload.table.items : []
    if (request === listRequestSequenceRef.current) setDocuments(items)
    return items
  }

  function openDocument(documentId: string): Promise<void> {
    if (!documentId) {
      return Promise.resolve()
    }
    if (selectedIdRef.current !== documentId) {
      selectedIdRef.current = documentId
      setSelectedId(documentId)
      detailRef.current = null
      setDetail(null)
      setDirty(false)
      closeSocket()
      setCollabState('disconnected')
    }
    if (openingDocumentRef.current?.documentId === documentId) {
      return openingDocumentRef.current.promise
    }
    const requestSequence = ++openRequestSequenceRef.current
    const promise = (async () => {
      try {
        const response = await executeAction('open_document', documentId, { documentId }, { documentId })
        const payload = getSuccessfulActionData(response, context?.locale)
        if (requestSequence === openRequestSequenceRef.current && selectedIdRef.current === documentId) {
          applyDetailPayload(payload)
        }
      } catch (error) {
        if (requestSequence === openRequestSequenceRef.current && selectedIdRef.current === documentId) {
          notify('error', getErrorMessage(error))
        }
      }
    })()
    const request = { documentId, promise }
    openingDocumentRef.current = request
    void promise.finally(() => {
      if (openingDocumentRef.current === request) {
        openingDocumentRef.current = null
      }
    })
    return promise
  }

  async function createDocument(kind: OfficeDocumentType) {
    const title = `${typeLabel(kind, t)} ${new Date().toISOString().slice(0, 10)}`
    await runBusy(async () => {
      const response = await executeAction('create_document', null, { documentType: kind, title }, null)
      const payload = getSuccessfulActionData(response, context?.locale)
      const documentId = payload?.document?.id || payload?.item?.id || payload?.id
      await reloadList()
      if (documentId) {
        await openDocument(documentId)
      }
    })
  }

  async function importDocument(file: File) {
    const selectedImportFormat = importFormatRef.current
    const importDocumentType = documentTypeForImportFormat(selectedImportFormat)
    await runBusy(async () => {
      const response = await executeFileAction(
        'import_document',
        null,
        {
          importFormat: selectedImportFormat,
          documentType: importDocumentType,
          title: stripKnownExtension(file.name),
          name: file.name,
          mimeType: file.type,
          size: file.size
        },
        null,
        file
      )
      const payload = getSuccessfulActionData(response, context?.locale)
      const documentId = payload?.document?.id || payload?.item?.id || payload?.id
      const warnings = Array.isArray(payload?.warnings) ? payload.warnings : Array.isArray(payload?.import?.warnings) ? payload.import.warnings : []
      await reloadList()
      if (documentId) {
        await openDocument(documentId)
      }
      notify('success', warnings.length ? `${t('importedWithWarnings')}: ${warnings.slice(0, 2).join(' ')}` : t('imported'))
    })
  }

  async function saveSnapshot(changeSummary = 'Saved from Office Editor Workbench') {
    if (!selectedId || !editorRef.current) {
      return
    }
    await runBusy(async () => {
      const snapshot = editorRef.current.getSnapshot()
      const yjsStateBase64 = updateYjsSnapshot(snapshot)
      const response = await executeAction(
        'save_snapshot',
        selectedId,
        {
          documentId: selectedId,
          snapshot,
          snapshotText: summarizeSnapshot(snapshot, documentType),
          yjsStateBase64,
          yjsStateVectorBase64: yjsStateBase64 ? encodeStateVectorBase64(yjsStateBase64) : undefined,
          changeSummary
        },
        { documentId: selectedId }
      )
      const payload = requireSuccessfulActionResult(response, context?.locale)
      notify('success', resolveMessage(payload?.message, context?.locale) || t('save'))
      setDirty(false)
      await openDocument(selectedId)
    })
  }

  async function syncCollabState() {
    if (!selectedId || !editorRef.current) {
      return
    }
    await runBusy(async () => {
      const snapshot = editorRef.current.getSnapshot()
      updateYjsSnapshot(snapshot)
      collaborationClientRef.current?.flush()
      setDirty(false)
      notify('success', t('synced'))
    })
  }

  async function askAssistant() {
    if (!selectedId) {
      return
    }
    await runBusy(async () => {
      await syncCollabState()
      const response = await executeAction(
        'prepare_assistant_prompt',
        selectedId,
        { documentId: selectedId, instruction: assistantInstruction || t('assistantPlaceholder') },
        { documentId: selectedId }
      )
      const payload = getSuccessfulActionData(response, context?.locale)
      if (payload?.commandKey && payload?.payload) {
        await invokeClientCommand(payload.commandKey, payload.payload)
      }
    })
  }

  async function deleteDocument(documentId: string) {
    if (!documentId) {
      return
    }
    await runBusy(async () => {
      const response = await executeAction('delete_document', documentId, { documentId }, { documentId })
      requireSuccessfulActionResult(response, context?.locale)
      if (selectedIdRef.current === documentId) {
        openRequestSequenceRef.current += 1
        openingDocumentRef.current = null
        selectedIdRef.current = ''
        setSelectedId('')
        detailRef.current = null
        setDetail(null)
        closeSocket()
        setCollabState('disconnected')
      }
      await reloadList()
      setDeleteTarget(null)
      notify('success', t('deleted'))
    })
  }

  async function downloadExcel() {
    if (!selectedId || detail?.item?.documentType !== 'spreadsheet') {
      return
    }
    await runBusy(async () => {
      const response = await executeAction(
        'get_excel_file',
        selectedId,
        { documentId: selectedId },
        { documentId: selectedId }
      )
      const payload = getSuccessfulActionData(response, context?.locale)
      if (!payload?.fileBase64) {
        throw new Error('The current XLSX file is unavailable.')
      }
      const bytes = base64ToUint8Array(payload.fileBase64)
      const blob = new Blob([bytes], { type: payload.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = payload.fileName || `${detail?.item?.title || 'workbook'}.xlsx`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      notify('success', t('downloaded'))
    })
  }

  async function applyQueuedOperations() {
    if (applyingOperationsRef.current || !editorRef.current || !selectedId || !detail?.operations?.length) {
      return
    }
    applyingOperationsRef.current = true
    const queued = detail.operations.filter((operation) => operation.status === 'queued' && operation.operationType !== 'review_note')
    let appliedCount = 0
    try {
      for (const operation of queued) {
        const result = await editorRef.current.applyOperation(operation)
        const response = await executeAction(
          'complete_operation',
          selectedId,
          {
            operationId: operation.id,
            status: result.success ? 'applied' : 'failed',
            result: result.success ? { applied: true, snapshotPersisted: false } : result,
            errorMessage: result.success ? undefined : result.error
          },
          { documentId: selectedId }
        )
        requireSuccessfulActionResult(response, context?.locale)
        if (result.success) {
          appliedCount += 1
          setDirty(true)
        }
      }
      if (appliedCount > 0) {
        await saveSnapshot(`Applied ${appliedCount} queued Office operation(s).`)
      }
    } finally {
      applyingOperationsRef.current = false
    }
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

  function initializeYjs(payload: DetailPayload) {
    const nextDoc = new Y.Doc()
    const stateBase64 = payload.item?.yjsStateBase64 || payload.currentSnapshot?.yjsStateBase64
    if (stateBase64) {
      try {
        Y.applyUpdate(nextDoc, base64ToUint8Array(stateBase64), 'server')
      } catch {
        // The persisted Univer snapshot remains the source of recovery if Yjs state is unreadable.
      }
    }
    const map = nextDoc.getMap('office')
    if (!map.get('snapshot') && payload.currentSnapshot?.snapshot) {
      map.set('snapshot', payload.currentSnapshot.snapshot)
    }
    ydocRef.current = nextDoc
  }

  function initializeSocket(payload: DetailPayload) {
    closeSocket()
    const collab = payload.collab
    if (!collab?.sessionId || !collab.namespace || !collab.connectionUrl || !collab.clientKey || !ydocRef.current) {
      setCollabState('disconnected')
      return
    }
    setCollabState('connecting')
    const socket = io(collab.connectionUrl, {
      autoConnect: false,
      transports: ['websocket'],
      auth: {
        sessionId: collab.sessionId,
        clientKey: collab.clientKey,
        documentId: collab.documentId
      }
    })
    socketRef.current = socket
    const collaborationClient = createCollaborationClient({
      session: collab,
      transport: createSocketIoTransportAdapter(socket),
      document: createYjsDocumentAdapter(ydocRef.current, {
        applyUpdate: (document, update, origin) => Y.applyUpdate(document, update, origin),
        encodeStateVector: (document) => Y.encodeStateVector(document),
        mergeUpdates: (updates) => Y.mergeUpdates(updates)
      }),
      initialPresence: { mode: collab.access === 'read' ? 'view' : 'edit' },
      onConnectionChange: setCollabState,
      onError: (error) => notify('error', error.message)
    })
    collaborationClientRef.current = collaborationClient
    collaborationClient.connect()
  }

  function closeSocket() {
    collaborationClientRef.current?.disconnect()
    collaborationClientRef.current = null
    socketRef.current?.disconnect()
    socketRef.current = null
  }

  function updateYjsSnapshot(snapshot: unknown) {
    if (!ydocRef.current) {
      return undefined
    }
    const map = ydocRef.current.getMap('office')
    map.set('documentId', selectedId)
    map.set('documentType', documentType)
    map.set('snapshot', snapshot ?? {})
    return uint8ArrayToBase64(Y.encodeStateAsUpdate(ydocRef.current))
  }

  const selectedDocument = documents.find((item) => item.id === selectedId)
  const currentTitle = detail?.item?.title || selectedDocument?.title || (selectedId ? t('untitled') : t('noDocument'))
  const currentMeta = [
    detail?.item?.documentType || selectedDocument?.documentType ? typeLabel(detail?.item?.documentType || selectedDocument?.documentType, t) : '',
    detail?.item?.currentVersionNumber || selectedDocument?.currentVersionNumber ? `v${detail?.item?.currentVersionNumber || selectedDocument?.currentVersionNumber}` : '',
    formatDate(detail?.item?.updatedAt || selectedDocument?.updatedAt)
  ].filter(Boolean).join(' · ')
  const operations = detail?.operations || []
  const snapshots = detail?.snapshots || []

  const pickerDocuments = detail?.item?.id && !documents.some(item => item.id === detail.item!.id)
    ? [detail.item, ...documents] : documents
  const filteredDocuments = pickerDocuments.filter(item => filterType === 'all' || item.documentType === filterType)
  const typeOptions = (['spreadsheet', 'document', 'presentation'] as const).map(value => ({ value, label: t(value) }))
  function changeHeaderPanel(panel: OfficeHeaderPanel) {
    setHeaderPanel(panel)
    if (panel === 'documents' && headerPanel !== 'documents') void reloadList().catch(error => notify('error', getErrorMessage(error)))
  }
  function chooseImport(format: OfficeFormat) {
    importFormatRef.current = format
    setImportFormat(format)
    if (importInputRef.current) {
      importInputRef.current.accept = acceptForImportFormat(format)
      importInputRef.current.click()
    }
  }

  return (
    <TooltipProvider delayDuration={250}>
    <div className="oe-shell">
      <main className="oe-main">
        <OfficeHeader title={currentTitle} kind={detail?.item?.documentType} locale={context?.locale}
          panel={headerPanel} onPanelChange={changeHeaderPanel} hasDocument={Boolean(selectedId)} busy={busy} dirty={dirty}
          connected={collabState === 'connected'} status={dirty ? t('dirty') : collabState === 'connected' ? t('synced') : t(collabState)}
          statusDetail={`${t('collab')}: ${t(collabState)} · ${dirty ? t('dirty') : t('synced')}`}
          labels={{ documents: t('documents'), save: t('save'), sync: t('sync'), import: t('import'), download: t('download'), delete: t('delete') }}
          formats={(['xlsx', 'docx', 'pptx'] as const).map(value => ({ value, label: t(value) }))}
          canDownload={detail?.item?.documentType === 'spreadsheet' && Boolean(detail.item.currentFileVersionId)}
          onSave={() => void saveSnapshot()} onSync={() => void syncCollabState()} onDownload={() => void downloadExcel()}
          onImport={chooseImport} onDelete={() => setDeleteTarget(selectedDocument || { id: selectedId, title: currentTitle })}
          documents={<OfficeDocumentPicker
            items={filteredDocuments.map(item => ({ id: item.id, title: item.title, documentType: item.documentType }))}
            selectedId={selectedId} filter={filterType} busy={busy} types={typeOptions}
            labels={{ title: t('documents'), allTypes: t('allTypes'), new: t('new'), untitled: t('untitled'), empty: t('emptyHint') }}
            onFilter={value => { setFilterType(value); void reloadList(value).catch(error => notify('error', getErrorMessage(error))) }}
            onCreate={kind => { setHeaderPanel(null); void createDocument(kind) }}
            onSelect={id => { setHeaderPanel(null); void openDocument(id) }} />}
          details={<div className="oe-inspector-content">
            <PopoverTitle>{currentTitle}</PopoverTitle>
            <p className="oe-document-meta">{currentMeta} · {snapshots.length} {t('snapshots')}</p>
            <Tabs defaultValue="operations">
              <TabsList><TabsTrigger value="operations">{t('operations')} <Badge variant="secondary">{operations.length}</Badge></TabsTrigger><TabsTrigger value="assistant">{t('ask')}</TabsTrigger></TabsList>
              <TabsContent value="assistant"><div className="oe-section">
                <Textarea className="oe-textarea" value={assistantInstruction} aria-label={t('ask')}
                  placeholder={t('assistantPlaceholder')} onChange={event => setAssistantInstruction(event.currentTarget.value)} />
                <Button disabled={!selectedId || busy || !assistantInstruction.trim()} onClick={askAssistant}><Send />{t('ask')}</Button>
              </div></TabsContent>
              <TabsContent value="operations"><div className="oe-operation-list">
                {operations.map(operation => <div className="oe-operation" key={operation.id}>
                  <div className="oe-operation-row"><strong>{operationLabel(operation.operationType, t)}</strong>
                    <Badge variant={operation.status === 'failed' || operation.status === 'conflict' ? 'destructive' : 'secondary'}>{t(operation.status || 'queued')}</Badge>
                  </div>
                  {operation.reviewNote ? <span className="oe-operation-detail">{operation.reviewNote}</span> : null}
                  {operation.operationType === 'import_document' ? <span className="oe-operation-detail">{formatImportOperation(operation, t)}</span> : <pre className="oe-operation-data"><code>{JSON.stringify(operation.input ?? operation.result ?? {}, null, 2)}</code></pre>}
                </div>)}
              </div></TabsContent>
            </Tabs>
          </div>} />
        <input
          ref={importInputRef}
          className="oe-hidden"
          type="file"
          accept={acceptForImportFormat(importFormat)}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) {
              void importDocument(file)
            }
          }}
        />
        <div className="oe-editor-wrap">
          {detail?.item ? (
            <OfficeUniverHost
              ref={editorRef}
              key={`${detail.item.id}:${detail.currentSnapshot?.id || 'empty'}`}
              documentType={detail.item.documentType}
              snapshot={detail.currentSnapshot?.snapshot || {}}
              locale={context?.locale}
              onDirty={() => setDirty(true)}
            />
          ) : (
            <div className="oe-empty">
              <div>{t('emptyHint')}</div>
            </div>
          )}
        </div>
      </main>
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDeleteTarget(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteConfirm').replace('{title}', deleteTarget?.title || t('untitled'))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy || !deleteTarget?.id}
              onClick={() => {
                if (deleteTarget?.id) {
                  void deleteDocument(deleteTarget.id)
                }
              }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  )
}

const OfficeUniverHost = React.forwardRef(function OfficeUniverHost(props: any, ref: any) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const univerRef = React.useRef<any>(null)
  const apiRef = React.useRef<any>(null)
  const unitRef = React.useRef<any>(null)
  const snapshotRef = React.useRef<any>(props.snapshot || {})

  React.useEffect(() => {
    if (!containerRef.current) {
      return
    }
    const locale = resolveUniverLocale(props.locale)
    const univer = createOfficeUniver(containerRef.current, locale)
    const unit = univer.createUnit(toUniverInstanceType(props.documentType), props.snapshot || {})
    const api = FUniver.newAPI(univer)
    const disposable = api.onCommandExecuted?.((command) => {
      // Slides 0.25 stores edits through operations; navigation and thumbnail
      // commands are transient and must not create an unsaved draft.
      const slideEdit = ['slide.operation.append-slide', 'slide.operation.delete-element',
        'slide.operation.update-element', 'slide.operation.insert-float-shape.rectangle',
        'slide.operation.insert-float-shape.ellipse', 'slide.operation.add-text',
        'slide.command.insert-float-image'].includes(command.id)
      if (command.type !== CommandType.MUTATION && !slideEdit) return
      snapshotRef.current = readSnapshot(api, unit, props.documentType)
      props.onDirty?.()
    })

    univerRef.current = univer
    apiRef.current = api
    unitRef.current = unit
    snapshotRef.current = props.snapshot || {}
    setTimeout(reportResize, 0)

    return () => {
      disposable?.dispose?.()
      univer.dispose?.()
      univerRef.current = null
      apiRef.current = null
      unitRef.current = null
    }
  }, [props.documentType, props.snapshot, props.locale])

  React.useImperativeHandle(ref, () => ({
    getSnapshot() {
      snapshotRef.current = readSnapshot(apiRef.current, unitRef.current, props.documentType)
      return snapshotRef.current
    },
    async applyOperation(operation: any) {
      try {
        const api = apiRef.current
        if (!api) {
          throw new Error('Univer API is not ready.')
        }
        const input = operation.input || {}
        if (input.operationType === 'sheet_set_range_values') {
          const workbook = api.getActiveWorkbook?.()
          const sheet = input.sheetName ? workbook?.getSheetByName?.(input.sheetName) : workbook?.getActiveSheet?.()
          const range = sheet?.getRange?.(input.range)
          if (!range?.setValues) {
            throw new Error('Spreadsheet range API is not available.')
          }
          await range.setValues(input.values)
        } else if (input.operationType === 'doc_append_text') {
          const doc = api.getActiveDocument?.()
          if (!doc?.appendText) {
            throw new Error('Document append API is not available.')
          }
          await doc.appendText(input.text)
        } else if (input.operationType === 'doc_replace_text') {
          await replaceDocumentText(api, unitRef.current, input)
        } else if (input.operationType === 'slide_create_outline') {
          await createSlideOutline(api, unitRef.current, input)
        } else if (input.operationType === 'slide_update_text') {
          await updateSlideText(api, unitRef.current, input)
        } else {
          throw new Error(`${input.operationType} is queued for manual review in this v1 Workbench.`)
        }
        snapshotRef.current = readSnapshot(apiRef.current, unitRef.current, props.documentType)
        props.onDirty?.()
        return { success: true, snapshot: snapshotRef.current }
      } catch (error) {
        return { success: false, error: getErrorMessage(error), operationId: operation.id }
      }
    }
  }))

  return <div className="oe-univer" ref={containerRef} />
})

function toUniverInstanceType(documentType: OfficeDocumentType) {
  if (documentType === 'spreadsheet') {
    return UniverInstanceType.UNIVER_SHEET
  }
  if (documentType === 'document') {
    return UniverInstanceType.UNIVER_DOC
  }
  return UniverInstanceType.UNIVER_SLIDE
}

function resolveUniverLocale(locale: unknown) {
  return String(locale || '').toLowerCase().startsWith('en') ? LocaleType.EN_US : LocaleType.ZH_CN
}

function readSnapshot(api: any, unit: any, documentType: OfficeDocumentType) {
  try {
    if (documentType === 'spreadsheet') {
      return api?.getActiveWorkbook?.()?.getSnapshot?.() ?? unit?.getSnapshot?.() ?? {}
    }
    if (documentType === 'document') {
      return api?.getActiveDocument?.()?.getSnapshot?.() ?? unit?.getSnapshot?.() ?? {}
    }
    return unit?.getSnapshot?.() ?? {}
  } catch {
    return {}
  }
}

function typeLabel(value: OfficeDocumentType | string | undefined, t: ReturnType<typeof createTranslator>) {
  if (value === 'spreadsheet') {
    return t('spreadsheet')
  }
  if (value === 'document') {
    return t('document')
  }
  if (value === 'presentation') {
    return t('presentation')
  }
  return t('document')
}

function operationLabel(value: string | undefined, t: ReturnType<typeof createTranslator>) {
  if (value === 'import_document') {
    return t('operationImportDocument')
  }
  if (value === 'review_note') {
    return t('operationReviewNote')
  }
  if (value === 'failure_report') {
    return t('operationFailureReport')
  }
  if (value === 'excel_automation') {
    return t('operationExcelAutomation')
  }
  if (value === 'excel_restore') {
    return t('operationExcelRestore')
  }
  if (value === 'sheet_set_range_values') {
    return t('operationSheetSetRangeValues')
  }
  if (value === 'doc_append_text') {
    return t('operationDocAppendText')
  }
  if (value === 'doc_replace_text') {
    return t('operationDocReplaceText')
  }
  if (value === 'slide_create_outline') {
    return t('operationSlideCreateOutline')
  }
  if (value === 'slide_update_text') {
    return t('operationSlideUpdateText')
  }
  return value || t('operations')
}

function formatImportOperation(operation: OperationRecord, t: ReturnType<typeof createTranslator>) {
  const input = operation.input || operation.result?.input || {}
  const parts = [
    input.fileName ? `${t('operationFile')}: ${input.fileName}` : '',
    input.importFormat ? `${t('operationFormat')}: ${String(input.importFormat).toUpperCase()}` : '',
    input.documentType ? `${t('operationType')}: ${typeLabel(input.documentType, t)}` : ''
  ].filter(Boolean)
  return parts.join(' · ') || t('operationImportDocument')
}

function documentTypeForImportFormat(importFormat: OfficeImportFormat): OfficeDocumentType {
  if (importFormat === 'xlsx') {
    return 'spreadsheet'
  }
  if (importFormat === 'docx') {
    return 'document'
  }
  return 'presentation'
}

function acceptForImportFormat(importFormat: OfficeImportFormat) {
  if (importFormat === 'xlsx') {
    return '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  if (importFormat === 'docx') {
    return '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  return '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation'
}

function stripKnownExtension(fileName: string) {
  return fileName.replace(/\.(xlsx|docx|pptx)$/i, '').trim() || 'Imported Office document'
}

function summarizeSnapshot(snapshot: any, documentType: OfficeDocumentType) {
  if (!snapshot || typeof snapshot !== 'object') {
    return ''
  }
  if (documentType === 'document') {
    return typeof snapshot.body?.dataStream === 'string' ? snapshot.body.dataStream.slice(0, 10000) : ''
  }
  return JSON.stringify(snapshot).slice(0, 10000)
}

async function replaceDocumentText(api: any, unit: any, input: any) {
  const document = api.getActiveDocument?.()
  const snapshot = document?.getSnapshot?.() ?? unit?.getSnapshot?.() ?? {}
  const dataStream = snapshot?.body?.dataStream
  if (typeof dataStream !== 'string') {
    throw new Error('Document snapshot does not expose body.dataStream.')
  }
  const haystack = input.matchCase ? dataStream : dataStream.toLowerCase()
  const needle = input.matchCase ? input.search : String(input.search).toLowerCase()
  const startOffset = haystack.indexOf(needle)
  if (startOffset < 0) {
    throw new Error('Document search text was not found.')
  }
  const endOffset = startOffset + input.search.length
  if (!document?.insertText) {
    throw new Error('Document insertText API is not available.')
  }
  document.setSelection?.(startOffset, endOffset)
  const replaced = await document.insertText(input.replaceWith, {
    startOffset,
    endOffset,
    cursorOffset: startOffset + input.replaceWith.length
  })
  if (replaced === false) {
    throw new Error('Document replace command was not accepted by Univer.')
  }
}

async function createSlideOutline(api: any, unit: any, input: any) {
  const unitId = unit?.getUnitId?.()
  if (!unitId || !api.executeCommand) {
    throw new Error('Slides command API is not available.')
  }
  for (const slide of input.slides || []) {
    const appended = await api.executeCommand(AppendSlideOperation.id, { unitId })
    if (appended === false) {
      throw new Error('Slide append command was not accepted by Univer.')
    }
    const text = [
      slide.title,
      ...(slide.bullets || []).map((bullet: string) => `- ${bullet}`),
      slide.speakerNotes ? `Notes: ${slide.speakerNotes}` : ''
    ].filter(Boolean).join('\n')
    const added = await api.executeCommand(SlideAddTextOperation.id, { unitId, text })
    if (added === false) {
      throw new Error('Slide text command was not accepted by Univer.')
    }
  }
}

async function updateSlideText(api: any, unit: any, input: any) {
  const unitId = unit?.getUnitId?.()
  const snapshot = unit?.getSnapshot?.() ?? {}
  const match = findSlideTextElement(snapshot, input)
  if (!match) {
    throw new Error('Slide target text was not found.')
  }
  if (!unitId || !api.executeCommand) {
    throw new Error('Slides command API is not available.')
  }
  const activated = await api.executeCommand(ActivateSlidePageOperation.id, {
    unitId,
    id: match.pageId
  })
  if (activated === false) {
    throw new Error('Slide activation command was not accepted by Univer.')
  }
  const updated = await api.executeCommand(UpdateSlideElementOperation.id, {
    unitId,
    oKey: match.elementId,
    props: match.props
  })
  if (updated === false) {
    throw new Error('Slide text update command was not accepted by Univer.')
  }
}

function findSlideTextElement(snapshot: any, input: any) {
  const pages = snapshot?.body?.pages ?? snapshot?.slides
  if (!pages || typeof pages !== 'object') {
    return null
  }
  const pageOrder = Array.isArray(snapshot?.body?.pageOrder)
    ? snapshot.body.pageOrder
    : Array.isArray(snapshot?.slideOrder)
      ? snapshot.slideOrder
      : Object.keys(pages)
  const targetPageId = input.slideId || (typeof input.slideIndex === 'number' ? pageOrder[input.slideIndex] : undefined)
  const candidates = targetPageId ? [[targetPageId, pages[targetPageId]]] : Object.entries(pages)
  for (const [pageId, page] of candidates as Array<[string, any]>) {
    const elements = page?.pageElements || {}
    for (const [elementId, element] of Object.entries(elements as Record<string, any>)) {
      const replacement = replaceElementText(element, input.targetText, input.replaceWith)
      if (replacement) {
        return {
          pageId,
          elementId,
          props: replacement
        }
      }
    }
  }
  return null
}

function replaceElementText(element: any, targetText: string, replaceWith: string) {
  if (typeof element?.richText?.text === 'string' && element.richText.text.includes(targetText)) {
    return {
      richText: {
        ...element.richText,
        text: element.richText.text.replace(targetText, replaceWith)
      }
    }
  }
  if (typeof element?.shape?.text === 'string' && element.shape.text.includes(targetText)) {
    return {
      shape: {
        ...element.shape,
        text: element.shape.text.replace(targetText, replaceWith)
      }
    }
  }
  if (typeof element?.text === 'string' && element.text.includes(targetText)) {
    return {
      text: element.text.replace(targetText, replaceWith)
    }
  }
  return null
}

function base64ToUint8Array(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function uint8ArrayToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }
  return btoa(binary)
}

function encodeStateVectorBase64(stateBase64: string) {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, base64ToUint8Array(stateBase64))
  return uint8ArrayToBase64(Y.encodeStateVector(doc))
}

function formatDate(value: unknown) {
  if (!value) {
    return ''
  }
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

const root = document.getElementById('root') || document.body.appendChild(document.createElement('div'))
ReactDOM.createRoot(root).render(<App />)
