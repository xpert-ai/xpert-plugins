import { LocaleType, LogLevel, Univer, UniverInstanceType, mergeLocales } from '@univerjs/core'
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
import '@univerjs/sheets-ui/facade'
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
  Badge,
  Button,
  FileJson,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Save,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Send,
  Textarea,
  Trash2,
  Upload,
} from '@xpert-ai/plugin-shadcn-ui'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import { React, ReactDOM, h } from './vendor'
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
  collab?: {
    sessionId: string
    namespace: string
    expiresAt: number
  }
}

const univerLocaleBundles = {
  [LocaleType.EN_US]: mergeLocales(
    DesignEnUS,
    UIEnUS,
    DocsUIEnUS,
    SheetsEnUS,
    SheetsUIEnUS,
    SheetsFormulaEnUS,
    SheetsFormulaUIEnUS,
    SheetsNumfmtUIEnUS,
    SlidesUIEnUS
  ),
  [LocaleType.ZH_CN]: mergeLocales(
    DesignZhCN,
    UIZhCN,
    DocsUIZhCN,
    SheetsZhCN,
    SheetsUIZhCN,
    SheetsFormulaZhCN,
    SheetsFormulaUIZhCN,
    SheetsNumfmtUIZhCN,
    SlidesUIZhCN
  )
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
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [collabState, setCollabState] = React.useState<'connecting' | 'connected' | 'disconnected'>('disconnected')
  const [assistantInstruction, setAssistantInstruction] = React.useState('')
  const selectedIdRef = React.useRef('')
  const detailRef = React.useRef<DetailPayload | null>(null)
  const editorRef = React.useRef<any>(null)
  const importInputRef = React.useRef<HTMLInputElement | null>(null)
  const ydocRef = React.useRef<Y.Doc | null>(null)
  const socketRef = React.useRef<Socket | null>(null)
  const clientIdRef = React.useRef(`office-editor-${Math.random().toString(36).slice(2)}`)
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
        hydratePayload(nextContext.payload || null)
        setTimeout(() => reloadList(), 0)
      },
      () => {
        void reloadAfterHostEvent()
      }
    )
    post('ready')
  }, [])

  React.useEffect(reportResize, [documents, detail, busy, dirty, collabState])

  React.useEffect(() => {
    void applyQueuedOperations()
  }, [detail?.operations, selectedId])

  function hydratePayload(payload: any) {
    if (!payload) {
      return
    }
    if (Array.isArray(payload.items)) {
      setDocuments(payload.items)
      if (!selectedIdRef.current && payload.items[0]?.id) {
        void openDocument(payload.items[0].id)
      }
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
    await reloadList()
    if (selectedIdRef.current) {
      await openDocument(selectedIdRef.current)
    }
  }

  async function reloadList() {
    const parameters = filterType === 'all' ? {} : { documentType: filterType }
    const response = await requestData({ page: 1, pageSize: 50, parameters })
    const payload = getResponsePayload(response)
    const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.table?.items) ? payload.table.items : []
    setDocuments(items)
    if (!selectedIdRef.current && items[0]?.id) {
      await openDocument(items[0].id)
    }
    return items
  }

  async function openDocument(documentId: string) {
    if (!documentId) {
      return
    }
    const response = await executeAction('open_document', documentId, { documentId }, { documentId })
    const payload = getResponsePayload(response)?.data || getResponsePayload(response)
    applyDetailPayload(payload)
  }

  async function createDocument() {
    const title = `${typeLabel(documentType, t)} ${new Date().toISOString().slice(0, 10)}`
    await runBusy(async () => {
      const response = await executeAction('create_document', null, { documentType, title }, null)
      const payload = getResponsePayload(response)?.data || getResponsePayload(response)
      const documentId = payload?.document?.id || payload?.item?.id || payload?.id
      await reloadList()
      if (documentId) {
        await openDocument(documentId)
      }
    })
  }

  async function importDocument(file: File) {
    const selectedImportFormat = importFormat
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
      const payload = getResponsePayload(response)?.data || getResponsePayload(response)
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
      const payload = getResponsePayload(response)
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
      const yjsStateBase64 = updateYjsSnapshot(snapshot)
      await executeAction(
        'sync_yjs_state',
        selectedId,
        {
          documentId: selectedId,
          fullStateBase64: yjsStateBase64,
          stateVectorBase64: yjsStateBase64 ? encodeStateVectorBase64(yjsStateBase64) : undefined,
          snapshot,
          snapshotText: summarizeSnapshot(snapshot, documentType),
          origin: 'workbench',
          clientId: clientIdRef.current
        },
        { documentId: selectedId }
      )
      socketRef.current?.emit('snapshot', {
        fullStateBase64: yjsStateBase64,
        stateVectorBase64: yjsStateBase64 ? encodeStateVectorBase64(yjsStateBase64) : undefined,
        snapshot,
        snapshotText: summarizeSnapshot(snapshot, documentType),
        origin: 'workbench',
        clientId: clientIdRef.current
      })
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
      const payload = getResponsePayload(response)?.data || getResponsePayload(response)
      if (payload?.commandKey && payload?.payload) {
        await invokeClientCommand(payload.commandKey, payload.payload)
      }
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
      closeSocket()
      await reloadList()
    })
  }

  async function applyQueuedOperations() {
    if (!editorRef.current || !selectedId || !detail?.operations?.length) {
      return
    }
    const queued = detail.operations.filter((operation) => operation.status === 'queued' && operation.operationType !== 'review_note')
    for (const operation of queued) {
      const result = await editorRef.current.applyOperation(operation)
      await executeAction(
        'complete_operation',
        selectedId,
        {
          operationId: operation.id,
          status: result.success ? 'applied' : 'failed',
          result,
          errorMessage: result.success ? undefined : result.error
        },
        { documentId: selectedId }
      )
      if (result.success) {
        setDirty(true)
      }
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
    nextDoc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote' || origin === 'server') {
        return
      }
      socketRef.current?.emit('yjs-update', {
        updateBase64: uint8ArrayToBase64(update),
        origin: 'workbench',
        clientId: clientIdRef.current
      })
    })
    ydocRef.current = nextDoc
  }

  function initializeSocket(payload: DetailPayload) {
    closeSocket()
    const collab = payload.collab
    if (!collab?.sessionId || !collab.namespace) {
      setCollabState('disconnected')
      return
    }
    setCollabState('connecting')
    const socket = io(collab.namespace, {
      transports: ['websocket'],
      auth: {
        sessionId: collab.sessionId
      }
    })
    socket.on('connect', () => setCollabState('connected'))
    socket.on('disconnect', () => setCollabState('disconnected'))
    socket.on('sync', (message: any) => {
      if (message?.yjsStateBase64 && ydocRef.current) {
        try {
          Y.applyUpdate(ydocRef.current, base64ToUint8Array(message.yjsStateBase64), 'remote')
        } catch {
          // Ignore malformed remote state; platform snapshot loading remains available.
        }
      }
    })
    socket.on('yjs-update', (message: any) => {
      if (!message?.updateBase64 || !ydocRef.current) {
        return
      }
      try {
        Y.applyUpdate(ydocRef.current, base64ToUint8Array(message.updateBase64), 'remote')
      } catch {
        // Ignore malformed peer updates.
      }
    })
    socket.on('snapshot', (message: any) => {
      if (message?.snapshot) {
        void openDocument(selectedIdRef.current)
      }
    })
    socket.on('office-error', (message: any) => notify('error', String(message?.message || t('remoteRequestFailed'))))
    socketRef.current = socket
  }

  function closeSocket() {
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

  const currentTitle = detail?.item?.title || (selectedId ? t('untitled') : t('noDocument'))
  const currentMeta = [
    detail?.item?.documentType ? typeLabel(detail.item.documentType, t) : '',
    detail?.item?.currentVersionNumber ? `v${detail.item.currentVersionNumber}` : '',
    formatDate(detail?.item?.updatedAt)
  ].filter(Boolean).join(' · ')
  const operations = detail?.operations || []
  const snapshots = detail?.snapshots || []

  return (
    <div className={`oe-shell ${sidebarOpen ? 'is-sidebar-open' : 'is-sidebar-collapsed'}`}>
      <aside className="oe-sidebar">
        <div className="oe-header oe-sidebar-header">
          <Button
            className="oe-icon-button"
            variant="ghost"
            size="icon"
            title={sidebarOpen ? t('collapseSidebar') : t('expandSidebar')}
            aria-label={sidebarOpen ? t('collapseSidebar') : t('expandSidebar')}
            onClick={() => setSidebarOpen((value) => !value)}
          >
            {sidebarOpen ? <PanelLeftClose className="oe-icon" aria-hidden="true" /> : <PanelLeftOpen className="oe-icon" aria-hidden="true" />}
          </Button>
          <div className="oe-title">
            <strong>{t('title')}</strong>
            <span>{documents.length} {t('documents')}</span>
          </div>
          <FileJson className="oe-sidebar-glyph" aria-hidden="true" />
        </div>
        <div className="oe-sidebar-body">
          <div className="oe-filter">
            <Select value={filterType} onValueChange={(value) => {
              setFilterType(value as any)
              setTimeout(() => reloadList(), 0)
            }}>
              <SelectTrigger className="oe-select-trigger" aria-label={t('allTypes')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allTypes')}</SelectItem>
                <SelectItem value="spreadsheet">{t('spreadsheet')}</SelectItem>
                <SelectItem value="document">{t('document')}</SelectItem>
                <SelectItem value="presentation">{t('presentation')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={documentType} onValueChange={(value) => setDocumentType(value as OfficeDocumentType)}>
              <SelectTrigger className="oe-select-trigger" aria-label={t('newDocumentType')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="spreadsheet">{t('spreadsheet')}</SelectItem>
                <SelectItem value="document">{t('document')}</SelectItem>
                <SelectItem value="presentation">{t('presentation')}</SelectItem>
              </SelectContent>
            </Select>
            <Button className="oe-wide-button" disabled={busy} onClick={createDocument}>
              <Plus className="oe-icon" aria-hidden="true" />
              {t('new')}
            </Button>
          </div>
          <div className="oe-list">
            {documents.map((item) => {
              const active = item.id === selectedId
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`oe-doc-button ${active ? 'is-active' : ''}`}
                  onClick={() => openDocument(item.id)}
                >
                  <strong>{item.title || t('untitled')}</strong>
                  <span>{typeLabel(item.documentType, t)} · v{item.currentVersionNumber || 0} · {formatDate(item.updatedAt)}</span>
                </button>
              )
            })}
          </div>
        </div>
      </aside>
      <main className="oe-main">
        <div className="oe-toolbar">
          <div className="oe-toolbar-title">
            <strong>{currentTitle}</strong>
            <span>{currentMeta || t('emptyHint')}</span>
          </div>
          <div className="oe-actions">
            <Select value={importFormat} onValueChange={(value) => setImportFormat(value as OfficeImportFormat)}>
              <SelectTrigger className="oe-select-trigger oe-format-trigger" aria-label={t('importFormat')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">{t('xlsx')}</SelectItem>
                <SelectItem value="docx">{t('docx')}</SelectItem>
                <SelectItem value="pptx">{t('pptx')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" title={t('import')} disabled={busy} onClick={() => importInputRef.current?.click()}>
              <Upload className="oe-icon" aria-hidden="true" />
              {t('import')}
            </Button>
            <Badge className="oe-status-badge" variant={collabState === 'connected' ? 'outline' : 'secondary'} data-status={collabState === 'connected' ? 'success' : undefined}>{t('collab')}: {t(collabState)}</Badge>
            <Badge className="oe-status-badge" variant="outline" data-status={dirty ? 'warning' : 'success'}>{dirty ? t('dirty') : t('synced')}</Badge>
            <Button variant="outline" title={t('sync')} disabled={!selectedId || busy} onClick={syncCollabState}>
              <RotateCcw className="oe-icon" aria-hidden="true" />
              {t('sync')}
            </Button>
            <Button title={t('save')} disabled={!selectedId || busy} onClick={() => saveSnapshot()}>
              <Save className="oe-icon" aria-hidden="true" />
              {t('save')}
            </Button>
            <Button variant="destructive" size="icon" title={t('delete')} disabled={!selectedId || busy} onClick={deleteDocument}>
              <Trash2 className="oe-icon" aria-hidden="true" />
            </Button>
          </div>
        </div>
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
      <aside className="oe-inspector">
        <div className="oe-header">
          <div className="oe-title">
            <strong>{t('operations')}</strong>
            <span>{operations.length} {t('operations')} · {snapshots.length} {t('snapshots')}</span>
          </div>
        </div>
        <div className="oe-panel-scroll">
          <section className="oe-section">
            <div className="oe-section-title">{t('ask')}</div>
            <Textarea
              className="oe-textarea"
              value={assistantInstruction}
              placeholder={t('assistantPlaceholder')}
              onChange={(event) => setAssistantInstruction(event.currentTarget.value)}
            />
            <Button className="oe-wide-button" disabled={!selectedId || busy} onClick={askAssistant}>
              <Send className="oe-icon" aria-hidden="true" />
              {t('ask')}
            </Button>
          </section>
          <section className="oe-section">
            <div className="oe-section-title">{t('operations')}</div>
            {operations.map((operation) => (
              <div className="oe-operation" key={operation.id}>
                <div className="oe-operation-row">
                  <strong>{operationLabel(operation.operationType, t)}</strong>
                  <Badge className="oe-status-badge" variant={operation.status === 'applied' || operation.status === 'failed' ? 'outline' : 'secondary'} data-status={operation.status === 'applied' ? 'success' : operation.status === 'failed' ? 'warning' : undefined}>
                    {t(operation.status || 'queued')}
                  </Badge>
                </div>
                {operation.reviewNote ? <span className="oe-operation-detail">{operation.reviewNote}</span> : null}
                {operation.operationType === 'import_document' ? (
                  <span className="oe-operation-detail">{formatImportOperation(operation, t)}</span>
                ) : (
                  <code>{JSON.stringify(operation.input ?? operation.result ?? {}, null, 2)}</code>
                )}
              </div>
            ))}
          </section>
        </div>
      </aside>
    </div>
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
    const univer = new Univer({
      locale,
      locales: univerLocaleBundles,
      logLevel: LogLevel.ERROR
    })
    univer.registerPlugin(UniverRenderEnginePlugin)
    univer.registerPlugin(UniverFormulaEnginePlugin)
    univer.registerPlugin(UniverUIPlugin, {
      container: containerRef.current,
      header: true,
      footer: true
    })
    univer.registerPlugin(UniverDocsPlugin)
    univer.registerPlugin(UniverDocsUIPlugin)
    univer.registerPlugin(UniverSheetsPlugin)
    univer.registerPlugin(UniverSheetsUIPlugin)
    univer.registerPlugin(UniverSheetsNumfmtPlugin)
    univer.registerPlugin(UniverSheetsNumfmtUIPlugin)
    univer.registerPlugin(UniverSheetsFormulaPlugin)
    univer.registerPlugin(UniverSheetsFormulaUIPlugin)
    univer.registerPlugin(UniverSlidesPlugin)
    univer.registerPlugin(UniverSlidesUIPlugin)

    const unit = univer.createUnit(toUniverInstanceType(props.documentType), props.snapshot || {})
    const api = FUniver.newAPI(univer)
    const disposable = api.onCommandExecuted?.(() => {
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
