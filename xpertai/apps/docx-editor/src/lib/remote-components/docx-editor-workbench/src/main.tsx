import { DocxEditor, type DocxEditorRef, type EditorMode } from '@eigenpal/docx-editor-react'
import '@eigenpal/docx-editor-react/styles.css'
import { useDocxAgentTools } from '@eigenpal/docx-editor-agents/react'
import {
  Archive,
  Badge,
  Button,
  Check,
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

type DocumentRecord = Record<string, any>
type VersionRecord = Record<string, any>
type DetailPayload = {
  item?: DocumentRecord
  currentVersion?: VersionRecord | null
  versions?: VersionRecord[]
  snapshot?: Record<string, any> | null
  operations?: Record<string, any>[]
}

installShadcnThemeVars({ styleId: 'docx-editor-workbench-shadcn-ui-vars' })
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
  const [rightPanelCollapsed, setRightPanelCollapsed] = React.useState(false)
  const editorRef = React.useRef<DocxEditorRef | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const selectedIdRef = React.useRef('')
  const detailRef = React.useRef<DetailPayload | null>(null)
  const t = createTranslator(context?.locale)
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

  React.useEffect(reportResize, [documents, detail, buffer, busy, dirty])

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

  function applyDetailPayload(payload: DetailPayload) {
    setDetail(payload)
    const item = payload.item
    const version = payload.currentVersion
    const nextId = item?.id || ''
    selectedIdRef.current = nextId
    setSelectedId(nextId)
    setDirty(false)
    if (version?.docxBase64) {
      setBuffer(base64ToArrayBuffer(version.docxBase64))
      setDocumentKey(`${nextId}:${version.id || version.versionNumber || Date.now()}`)
    } else {
      setBuffer(null)
      setDocumentKey(`${nextId}:empty`)
    }
  }

  async function reloadAfterHostEvent() {
    await reloadList()
    if (selectedIdRef.current) {
      await selectDocument(selectedIdRef.current)
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

  async function selectDocument(documentId: string) {
    if (!documentId) {
      return
    }
    const response = await requestData({ parameters: { documentId } })
    const payload = getResponsePayload(response)
    applyDetailPayload(payload)
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
    await runBusy(async () => {
      const response = await executeFileAction(
        'upload_docx',
        selectedId || null,
        { documentId: selectedId || undefined, title: file.name.replace(/\.docx$/i, ''), name: file.name },
        null,
        file
      )
      const payload = getResponsePayload(response)?.data || getResponsePayload(response)
      const documentId = payload?.document?.id || payload?.item?.id || payload?.id || selectedId
      await reloadList()
      if (documentId) {
        await selectDocument(documentId)
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
      await selectDocument(selectedId)
      await syncSnapshot()
    })
  }

  async function syncSnapshot() {
    if (!selectedId || !editorRef.current) {
      return
    }
    const readDocument = agentTools.executeToolCall('read_document', {})
    const readComments = agentTools.executeToolCall('read_comments', {})
    const readChanges = agentTools.executeToolCall('read_changes', {})
    const contextSnapshot = agentTools.getContext()
    const totalPages = contextSnapshot.totalPages || editorRef.current.getTotalPages?.() || 0
    const pages = []
    for (let pageNumber = 1; pageNumber <= Math.min(totalPages, 20); pageNumber++) {
      const page = agentTools.executeToolCall('read_page', { pageNumber })
      if (page.success && page.data) {
        pages.push(page.data)
      }
    }
    await executeAction(
      'sync_snapshot',
      selectedId,
      {
        documentId: selectedId,
        versionId: detailRef.current?.currentVersion?.id,
        contentText: typeof readDocument.data === 'string' ? readDocument.data : JSON.stringify(readDocument.data ?? ''),
        paragraphCount: countParagraphLines(readDocument.data),
        totalPages,
        currentPage: contextSnapshot.currentPage || 0,
        selection: contextSnapshot.selection,
        comments: readComments.data ?? [],
        changes: readChanges.data ?? [],
        pages
      },
      { documentId: selectedId }
    )
    notify('success', t('synced'))
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
      await selectDocument(selectedId)
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
      await reloadList()
    })
  }

  async function applyQueuedOperations() {
    if (!editorRef.current || !detail?.operations?.length) {
      return
    }
    const queued = detail.operations.filter((operation) => operation.status === 'queued')
    for (const operation of queued) {
      if (operation.toolName === 'docx_scroll' && operation.input?.paraId) {
        const ok = editorRef.current.scrollToParaId(String(operation.input.paraId))
        await executeAction(
          'complete_operation',
          selectedId,
          {
            operationId: operation.id,
            status: ok ? 'applied' : 'failed',
            result: { success: ok },
            errorMessage: ok ? undefined : 'paraId was not found in the live editor.'
          },
          { documentId: selectedId }
        )
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

  const currentVersionId = detail?.currentVersion?.id
  const commentsCount = Array.isArray(detail?.snapshot?.comments) ? detail?.snapshot?.comments.length : 0
  const changesCount = Array.isArray(detail?.snapshot?.changes) ? detail?.snapshot?.changes.length : 0
  const operationsCount = detail?.operations?.length || 0
  const versions = detail?.versions || []
  const shellClass = `docx-shell ${leftPanelCollapsed ? 'left-collapsed' : ''} ${rightPanelCollapsed ? 'right-collapsed' : ''}`
  const currentModeLabel = mode === 'suggesting' ? t('suggesting') : mode === 'viewing' ? t('viewing') : t('editing')

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
                  <SidebarMenu>
                    {documents.map((item) => (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton active={item.id === selectedId} onClick={() => selectDocument(item.id)}>
                          <span className="docx-row-title">{item.title || item.fileName || 'Untitled'}</span>
                          <span className="docx-row-meta">v{item.currentVersionNumber || 0} · {formatDate(item.updatedAt)}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </section>
                <Separator />
                <section className="docx-section">
                  <div className="docx-section-title">{t('versions')}</div>
                  <SidebarMenu>
                    {versions.map((version) => (
                      <SidebarMenuItem key={version.id}>
                        <SidebarMenuButton active={version.id === currentVersionId} onClick={() => restoreVersion(version.id)}>
                          <span className="docx-version-line">
                            <span className="docx-row-title">v{version.versionNumber}</span>
                            {version.id === currentVersionId ? <Check className="docx-button-icon" aria-hidden="true" /> : null}
                          </span>
                          <span className="docx-row-meta">{version.source || 'workbench'} · {formatDate(version.createdAt)}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
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
            <div className="docx-brand">{t('title')}</div>
            <Badge variant="secondary">{currentModeLabel}</Badge>
          </div>
          <div className="docx-toolbar-actions">
            <Button variant="outline" size="sm" title={t('new')} disabled={busy} onClick={createDocument}>
              <Plus className="docx-button-icon" aria-hidden="true" />
              {t('new')}
            </Button>
            <Button variant="outline" size="sm" title={t('upload')} disabled={busy} onClick={() => fileInputRef.current?.click()}>
              <Upload className="docx-button-icon" aria-hidden="true" />
              {t('upload')}
            </Button>
            <Button size="sm" title={t('save')} disabled={!buffer || busy} onClick={() => saveVersion()}>
              <Save className="docx-button-icon" aria-hidden="true" />
              {t('save')}
            </Button>
            <Button variant="outline" size="sm" title={t('sync')} disabled={!buffer || busy} onClick={syncSnapshot}>
              <RotateCcw className="docx-button-icon" aria-hidden="true" />
              {t('sync')}
            </Button>
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
            <Badge className="docx-status" variant={dirty ? 'warning' : 'success'}>{dirty ? t('dirty') : t('synced')}</Badge>
            <Button className="docx-toolbar-push" variant="outline" size="sm" title={t('ask')} disabled={!selectedId || busy} onClick={askAssistant}>
              <Send className="docx-button-icon" aria-hidden="true" />
              {t('ask')}
            </Button>
            <Button variant="destructiveOutline" size="sm" title={t('delete')} disabled={!selectedId || busy} onClick={deleteDocument}>
              <Archive className="docx-button-icon" aria-hidden="true" />
              {t('delete')}
            </Button>
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
        <div className="docx-editor-host">
          {buffer ? (
            <div className="docx-editor-frame">
              <DocxEditor
                key={documentKey}
                ref={editorRef}
                documentBuffer={buffer}
                mode={mode}
                author="Xpert DOCX Assistant"
                documentName={detail?.item?.title || detail?.item?.fileName || 'Untitled.docx'}
                onChange={() => setDirty(true)}
                onSelectionChange={() => {
                  if (!dirty) {
                    return
                  }
                }}
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
              <Badge variant={dirty ? 'warning' : 'secondary'}>{dirty ? t('dirty') : t('synced')}</Badge>
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
                  <div className="docx-stat"><span>{t('comments')}</span><Badge variant="secondary">{commentsCount}</Badge></div>
                  <div className="docx-stat"><span>{t('changes')}</span><Badge variant="secondary">{changesCount}</Badge></div>
                  <div className="docx-stat"><span>{t('operations')}</span><Badge variant="secondary">{operationsCount}</Badge></div>
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

function formatDate(value: unknown) {
  if (!value) {
    return ''
  }
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

const root = document.getElementById('root') || document.body.appendChild(document.createElement('div'))
ReactDOM.createRoot(root).render(<App />)
