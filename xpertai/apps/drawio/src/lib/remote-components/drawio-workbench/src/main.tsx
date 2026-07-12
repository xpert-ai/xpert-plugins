import {
  Archive,
  Badge,
  Button,
  Check,
  FileJson,
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
  Textarea,
  Upload,
} from '@xpert-ai/plugin-shadcn-ui'
import '@xpert-ai/plugin-shadcn-ui/style.css'
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, SidebarTitle, SidebarTrigger } from './workbench-sidebar'
import { React, ReactDOM, h } from './vendor'
import { createTranslator, TranslationKey } from './i18n'
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

type StatusFilter = '' | 'draft' | 'reviewed' | 'archived'
type Drawing = Record<string, any>
type DrawingVersion = Record<string, any>
type DetailPayload = {
  item?: Drawing
  currentVersion?: DrawingVersion | null
  versions?: DrawingVersion[]
  logs?: any[]
}

const DRAWIO_ORIGIN = 'https://embed.diagrams.net'
const DRAWIO_EDITOR_URL = `${DRAWIO_ORIGIN}/?embed=1&proto=json&spin=1&libraries=1&configure=1&noExitBtn=1&saveAndExit=0&modified=0`
const EMPTY_DRAWIO_XML = '<mxfile host="xpert"><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>'
const DEFAULT_MERMAID = `flowchart TD
  A[User Request] --> B[Agent Plans Diagram]
  B --> C{Best Format?}
  C -->|Flow| D[Save Mermaid Draft]
  C -->|Precise Layout| E[Save draw.io XML]
  D --> F[Workbench Loads diagrams.net]
  E --> G[Human Review]
  F --> G`

const SAVE_MERMAID_DRAFT_TOOL_NAME = 'drawio_save_mermaid_draft'
const DRAWIO_TOOL_NAMES = new Set([
  'drawio_create_diagram',
  'drawio_save_scene_version',
  'drawio_patch_scene',
  SAVE_MERMAID_DRAFT_TOOL_NAME,
  'drawio_search_diagrams',
  'drawio_get_diagram',
  'drawio_update_diagram_status',
  'drawio_report_failure'
])
const DRAWIO_MUTATION_TOOL_NAMES = new Set([
  'drawio_create_diagram',
  'drawio_save_scene_version',
  'drawio_patch_scene',
  SAVE_MERMAID_DRAFT_TOOL_NAME,
  'drawio_update_diagram_status',
  'drawio_report_failure'
])
injectStyles()

function App() {
  const [context, setContext] = React.useState<any>(null)
  const [drawings, setDrawings] = React.useState<Drawing[]>([])
  const [detail, setDetail] = React.useState<DetailPayload | null>(null)
  const [selectedId, setSelectedId] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<StatusFilter>('')
  const [busy, setBusy] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [editorReady, setEditorReady] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState('')
  const [newDescription, setNewDescription] = React.useState('')
  const [changeSummary, setChangeSummary] = React.useState('')
  const [assistantPrompt, setAssistantPrompt] = React.useState('')
  const [mermaidSource, setMermaidSource] = React.useState(DEFAULT_MERMAID)
  const [xml, setXml] = React.useState(EMPTY_DRAWIO_XML)
  const [leftPanelCollapsed, setLeftPanelCollapsed] = React.useState(true)
  const [rightPanelCollapsed, setRightPanelCollapsed] = React.useState(true)
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const contextRef = React.useRef<any>(null)
  const selectedIdRef = React.useRef('')
  const searchRef = React.useRef('')
  const statusRef = React.useRef<StatusFilter>('')
  const hostEventSequenceRef = React.useRef(0)
  const pendingSaveActionRef = React.useRef<string | null>(null)
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
    startRemoteBridge(
      (nextContext) => {
        contextRef.current = nextContext
        setContext(nextContext)
        hydratePayload(nextContext.payload || null)
        setTimeout(() => reloadList(), 0)
      },
      (event) => {
        void reloadAfterHostEvent(event)
      }
    )
    post('ready')
  }, [])

  React.useEffect(reportResize, [drawings, detail, busy, dirty, editorReady, leftPanelCollapsed, rightPanelCollapsed])

  React.useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (iframeRef.current?.contentWindow && event.source !== iframeRef.current.contentWindow) {
        return
      }
      const message = parseMessage(event.data)
      if (!message || typeof message.event !== 'string') {
        return
      }
      if (message.event === 'configure') {
        postToEditor({
          action: 'configure',
          config: {
            defaultFonts: ['Inter', 'Arial'],
            compressXml: true,
            libraries: true
          }
        })
        return
      }
      if (message.event === 'init') {
        setEditorReady(true)
        loadCurrentSceneIntoEditor()
        return
      }
      if (message.event === 'save') {
        const nextXml = typeof message.xml === 'string' && message.xml.trim() ? message.xml : xml
        setXml(nextXml)
        setDirty(true)
        const sourceAction = pendingSaveActionRef.current || 'save_scene_version'
        pendingSaveActionRef.current = null
        void saveCurrentScene(nextXml, sourceAction)
      }
      if (message.event === 'exit') {
        pendingSaveActionRef.current = null
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [xml, selectedId, mermaidSource, detail?.item?.id, context?.theme])

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
      applyDetailPayload(payload)
    }
  }

  function applyDetailPayload(payload: DetailPayload) {
    setDetail(payload)
    const drawingId = payload.item?.id || ''
    selectedIdRef.current = drawingId
    setSelectedId(drawingId)
    setDirty(false)
    setChangeSummary('')
    const version = payload.currentVersion || null
    const nextXml = typeof version?.xml === 'string' && version.xml.trim() ? version.xml : EMPTY_DRAWIO_XML
    const nextMermaid = typeof version?.mermaidSource === 'string' ? version.mermaidSource : ''
    setXml(nextXml)
    setMermaidSource(nextMermaid)
    if (editorReady) {
      loadVersionIntoEditor(version, payload.item?.title)
    }
  }

  async function reloadAfterHostEvent(event: unknown) {
    const toolName = extractToolNameFromHostEvent(event)
    if (toolName && !DRAWIO_TOOL_NAMES.has(toolName)) {
      return
    }

    const sequence = ++hostEventSequenceRef.current
    const eventDrawingId = extractDrawingIdFromHostEvent(event)
    const items = await reloadList()
    if (sequence !== hostEventSequenceRef.current) {
      return
    }

    const nextDrawingId = eventDrawingId ?? selectedIdRef.current ?? items[0]?.id
    if (nextDrawingId) {
      await selectDrawing(nextDrawingId)
    }

    if (!toolName || DRAWIO_MUTATION_TOOL_NAMES.has(toolName)) {
      notify('info', createTranslator(contextRef.current?.locale)('agentDrawingUpdated'))
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
    if (!drawingId) {
      return null
    }
    setBusy(true)
    try {
      const response = await requestData({ parameters: { drawingId } })
      const payload = getResponsePayload(response) || {}
      applyDetailPayload(payload)
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
      setNewTitle('')
      setNewDescription('')
      setChangeSummary('')
      setXml(EMPTY_DRAWIO_XML)
      setMermaidSource('')
      setDirty(false)
      if (drawingId) {
        await reloadList()
        await selectDrawing(drawingId)
      } else {
        await reloadList()
      }
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function requestEditorSave(sourceAction = 'save_scene_version') {
    if (!selectedId) {
      notify('warning', t('noDrawing'))
      return
    }
    if (!editorReady) {
      await saveCurrentScene(xml, sourceAction)
      return
    }
    pendingSaveActionRef.current = sourceAction
    postToEditor({ action: 'save' })
  }

  async function saveCurrentScene(xmlValue: string, sourceAction = 'save_scene_version') {
    if (!selectedId) {
      notify('warning', t('noDrawing'))
      return
    }
    setBusy(true)
    try {
      const response = await executeAction(sourceAction, selectedId, {
        drawingId: selectedId,
        xml: xmlValue,
        mermaidSource,
        descriptor: mermaidSource.trim() ? { format: 'mermaid', data: mermaidSource.trim() } : undefined,
        changeSummary: changeSummary.trim() || undefined
      })
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('operationCompleted'))
      setDirty(false)
      setChangeSummary('')
      await selectDrawing(selectedId)
      await reloadList()
    } catch (error) {
      notify('error', getErrorMessage(error))
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
      await executeAction('archive_drawing', selectedId, { drawingId: selectedId })
      notify('success', t('operationCompleted'))
      setDetail(null)
      setSelectedId('')
      setXml(EMPTY_DRAWIO_XML)
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
      await reloadList(statusRef.current && statusRef.current !== nextStatus ? { status: '' } : {})
      if (statusRef.current && statusRef.current !== nextStatus) {
        statusRef.current = ''
        setStatus('')
      }
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function loadMermaidIntoEditor() {
    const source = mermaidSource.trim()
    if (!source) {
      return
    }
    postToEditor({
      action: 'load',
      descriptor: { format: 'mermaid', data: source },
      sourceMetadata: { key: 'mermaidSource', value: source },
      title: detail?.item?.title || newTitle || t('untitled'),
      modified: 0,
      noExitBtn: 1,
      saveAndExit: 0,
      exportProtocol: true,
      dark: isDarkTheme(contextRef.current?.theme) ? 1 : 0
    })
    setDirty(true)
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
          title: removeDrawioExtension(file.name)
        },
        { drawingId: selectedId || undefined },
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

  function exportXml() {
    downloadBlob(new Blob([xml || EMPTY_DRAWIO_XML], { type: 'application/xml' }), `${detail?.item?.title || 'diagram'}.drawio`)
  }

  function loadCurrentSceneIntoEditor() {
    loadVersionIntoEditor(detail?.currentVersion || null, detail?.item?.title)
  }

  function loadVersionIntoEditor(version: DrawingVersion | null, title?: string) {
    const versionXml = typeof version?.xml === 'string' && version.xml.trim() ? version.xml : ''
    const versionMermaid = typeof version?.mermaidSource === 'string' ? version.mermaidSource.trim() : ''
    const loadMessage: Record<string, unknown> = {
      action: 'load',
      title: title || t('untitled'),
      modified: 0,
      noExitBtn: 1,
      saveAndExit: 0,
      exportProtocol: true,
      dark: isDarkTheme(contextRef.current?.theme) ? 1 : 0
    }
    if (versionXml) {
      loadMessage.xml = versionXml
    } else if (versionMermaid) {
      loadMessage.descriptor = { format: 'mermaid', data: versionMermaid }
      loadMessage.sourceMetadata = { key: 'mermaidSource', value: versionMermaid }
    } else {
      loadMessage.xml = EMPTY_DRAWIO_XML
    }
    postToEditor(loadMessage)
  }

  function postToEditor(message: Record<string, unknown>) {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(message), DRAWIO_ORIGIN)
  }

  const currentVersion = detail?.currentVersion || null
  const drawingStatus = (detail?.item?.status || 'draft') as StatusFilter
  const shellClassName = `dw-shell ${leftPanelCollapsed ? 'left-collapsed' : ''} ${rightPanelCollapsed ? 'right-collapsed' : ''}`

  return (
    <div className={shellClassName}>
      <Sidebar className="dw-sidebar" side="left" collapsed={leftPanelCollapsed}>
        <SidebarHeader>
          <SidebarTrigger
            variant="ghost"
            size="icon"
            aria-label={leftPanelCollapsed ? t('expandDrawings') : t('collapseDrawings')}
            title={leftPanelCollapsed ? t('expandDrawings') : t('collapseDrawings')}
            onClick={() => setLeftPanelCollapsed((value) => !value)}
          >
            {leftPanelCollapsed ? <PanelLeftOpen className="dw-button-icon" aria-hidden="true" /> : <PanelLeftClose className="dw-button-icon" aria-hidden="true" />}
          </SidebarTrigger>
          {!leftPanelCollapsed ? (
            <>
              <SidebarTitle>{t('drawings')}</SidebarTitle>
              <Badge variant="secondary">{drawings.length}</Badge>
            </>
          ) : null}
        </SidebarHeader>
        {leftPanelCollapsed ? (
          <SidebarRail><span>{t('drawings')}</span></SidebarRail>
        ) : (
          <SidebarContent>
            <div className="dw-sidebar-controls">
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
            <ScrollArea className="dw-list">
              <SidebarMenu>
                {drawings.map((drawing) => (
                  <SidebarMenuItem key={drawing.id}>
                    <SidebarMenuButton type="button" isActive={drawing.id === selectedId} onClick={() => selectDrawing(drawing.id)}>
                      <span className="dw-item-title">{drawing.title || t('untitled')}</span>
                      <span className="dw-item-meta">v{drawing.currentVersionNumber || 0} · {t((drawing.status || 'draft') as TranslationKey)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </ScrollArea>
          </SidebarContent>
        )}
      </Sidebar>

      <main className="dw-main">
        <div className="dw-toolbar">
          <div className="dw-toolbar-title">
            <Input className="dw-title-input" value={newTitle} placeholder={t('title')} onChange={(event: any) => setNewTitle(event.target.value)} />
          </div>
          <div className="dw-toolbar-actions">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={createDrawing}>
              <Plus className="dw-button-icon" aria-hidden="true" />
              {t('newDrawing')}
            </Button>
            <Button type="button" size="sm" disabled={busy || !selectedId} onClick={() => requestEditorSave()}>
              <Save className="dw-button-icon" aria-hidden="true" />
              {t('save')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy || !selectedId || !editorReady} onClick={() => postToEditor({ action: 'save' })}>
              <FileJson className="dw-button-icon" aria-hidden="true" />
              {t('syncEditor')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileInputRef.current?.click()}>
              <Upload className="dw-button-icon" aria-hidden="true" />
              {t('import')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!selectedId} onClick={exportXml}>
              <FileJson className="dw-button-icon" aria-hidden="true" />
              {t('exportXml')}
            </Button>
            <Badge className="dw-status" variant={dirty ? 'outline' : 'secondary'} data-status={dirty ? 'warning' : undefined}>{dirty ? t('dirty') : t('saved')}</Badge>
            <Badge variant={editorReady ? 'secondary' : 'outline'}>{editorReady ? t('editorReady') : t('editorLoading')}</Badge>
          </div>
          <input
            ref={fileInputRef}
            className="dw-hidden-file"
            type="file"
            accept=".drawio,.diagram,.xml,.svg,.json,application/xml,text/xml,application/json"
            onChange={(event: any) => importFile(event.target.files?.[0] || null)}
          />
        </div>
        <div className="dw-editor">
          {selectedId || currentVersion ? (
            <>
              <iframe ref={iframeRef} title="draw.io editor" src={DRAWIO_EDITOR_URL} />
              {!editorReady ? <div className="dw-editor-placeholder">{t('editorLoading')}</div> : null}
            </>
          ) : (
            <div className="dw-empty">{t('noDrawing')}</div>
          )}
        </div>
      </main>

      <Sidebar className="dw-inspector" side="right" collapsed={rightPanelCollapsed}>
        <SidebarHeader>
          {!rightPanelCollapsed ? (
            <>
              <div className="dw-inspector-actions">
                {drawingStatus === 'archived' ? (
                  <Badge variant="secondary">{t('archived')}</Badge>
                ) : drawingStatus === 'reviewed' ? (
                  <Button type="button" variant="outline" size="sm" disabled={busy || !selectedId} onClick={() => setDrawingReviewStatus('draft')}>
                    <RotateCcw className="dw-button-icon" aria-hidden="true" />
                    {t('backToDraft')}
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled={busy || !selectedId} onClick={() => setDrawingReviewStatus('reviewed')}>
                    <Check className="dw-button-icon" aria-hidden="true" />
                    {t('markReviewed')}
                  </Button>
                )}
                <Button type="button" variant="destructive" size="sm" disabled={busy || !selectedId || drawingStatus === 'archived'} onClick={archiveDrawing}>
                  <Archive className="dw-button-icon" aria-hidden="true" />
                  {t('archive')}
                </Button>
              </div>
              <SidebarTitle className="dw-sidebar-title-truncate">{detail?.item?.title || t('inspector')}</SidebarTitle>
            </>
          ) : null}
          <SidebarTrigger
            className="dw-sidebar-trigger-right"
            variant="ghost"
            size="icon"
            aria-label={rightPanelCollapsed ? t('expandInspector') : t('collapseInspector')}
            title={rightPanelCollapsed ? t('expandInspector') : t('collapseInspector')}
            onClick={() => setRightPanelCollapsed((value) => !value)}
          >
            {rightPanelCollapsed ? <PanelRightOpen className="dw-button-icon" aria-hidden="true" /> : <PanelRightClose className="dw-button-icon" aria-hidden="true" />}
          </SidebarTrigger>
        </SidebarHeader>
        {rightPanelCollapsed ? (
          <SidebarRail><span>{t('inspector')}</span></SidebarRail>
        ) : (
          <SidebarContent>
            <ScrollArea className="dw-inspector-scroll">
              <div className="dw-inspector-stack">
                <section className="dw-section">
                  <div className="dw-section-title">{t('changeSummary')}</div>
                  <Input value={changeSummary} placeholder={t('changeSummary')} onChange={(event: any) => setChangeSummary(event.target.value)} />
                </section>

                <section className="dw-section">
                  <div className="dw-section-title">{t('versions')}</div>
                  {(detail?.versions || []).map((version) => (
                    <div className="dw-version" key={version.id}>
                      <div>
                        <div>v{version.versionNumber}</div>
                        <div className="dw-muted">{version.sourceType || 'workbench'}</div>
                      </div>
                      <Button className="dw-version-action" type="button" variant="outline" size="icon" title={t('restore')} aria-label={`${t('restore')} v${version.versionNumber}`} disabled={busy} onClick={() => restoreVersion(version.id)}>
                        <RotateCcw className="dw-button-icon" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                </section>

                <section className="dw-section">
                  <div className="dw-section-title">{t('mermaid')}</div>
                  <Textarea value={mermaidSource} onChange={(event: any) => {
                    setMermaidSource(event.target.value)
                    setDirty(true)
                  }} />
                  <div className="dw-muted">{t('mermaidNotice')}</div>
                  <div className="dw-inline-actions">
                    <Button type="button" variant="outline" size="sm" disabled={busy || !editorReady || !mermaidSource.trim()} onClick={loadMermaidIntoEditor}>
                      {t('loadMermaid')}
                    </Button>
                    <Button type="button" size="sm" disabled={busy || !selectedId} onClick={() => requestEditorSave('save_converted_mermaid_scene')}>
                      {t('saveConverted')}
                    </Button>
                  </div>
                </section>

                <section className="dw-section">
                  <div className="dw-section-title">{t('drawingRequest')}</div>
                  <Textarea value={assistantPrompt} placeholder={t('drawingRequest')} onChange={(event: any) => setAssistantPrompt(event.target.value)} />
                  <Button type="button" disabled={busy || !assistantPrompt.trim()} onClick={sendAssistantPrompt}>
                    <Send className="dw-button-icon" aria-hidden="true" />
                    {t('askAssistant')}
                  </Button>
                </section>

                <section className="dw-section">
                  <div className="dw-section-title">{t('description')}</div>
                  <Textarea value={newDescription} placeholder={t('description')} onChange={(event: any) => setNewDescription(event.target.value)} />
                </section>
              </div>
            </ScrollArea>
          </SidebarContent>
        )}
      </Sidebar>
    </div>
  )
}

function parseMessage(data: unknown) {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, any> : null
}

function isDarkTheme(theme: unknown) {
  if (typeof theme === 'boolean') {
    return theme
  }
  if (typeof theme === 'string') {
    return /dark|night/i.test(theme)
  }
  return Boolean(theme && typeof theme === 'object' && ((theme as any).dark === true || (theme as any).isDark === true))
}

function extractToolNameFromHostEvent(event: unknown) {
  for (const candidate of expandHostEventCandidates(event)) {
    if (!isObject(candidate)) {
      continue
    }
    const direct = readString(candidate, 'toolName') ?? readString(candidate, 'tool_name') ?? readString(candidate, 'name')
    if (direct && DRAWIO_TOOL_NAMES.has(direct)) {
      return direct
    }
    const tool = candidate.tool
    if (isObject(tool)) {
      const toolName = readString(tool, 'name') ?? readString(tool, 'toolName') ?? readString(tool, 'tool_name')
      if (toolName && DRAWIO_TOOL_NAMES.has(toolName)) {
        return toolName
      }
    }
  }
  return null
}

function extractDrawingIdFromHostEvent(event: unknown) {
  for (const candidate of expandHostEventCandidates(event)) {
    if (!isObject(candidate)) {
      continue
    }
    const direct = readString(candidate, 'drawingId') ?? readString(candidate, 'drawing_id')
    if (direct) {
      return direct
    }
    if (isObject(candidate.item)) {
      const itemId = readString(candidate.item, 'id')
      if (itemId) {
        return itemId
      }
    }
    if (isObject(candidate.drawing)) {
      const drawingId = readString(candidate.drawing, 'drawingId') ?? readString(candidate.drawing, 'drawing_id') ?? readString(candidate.drawing, 'id')
      if (drawingId) {
        return drawingId
      }
    }
    if (isObject(candidate.version)) {
      const drawingId = readString(candidate.version, 'drawingId') ?? readString(candidate.version, 'drawing_id')
      if (drawingId) {
        return drawingId
      }
    }
  }
  return null
}

function expandHostEventCandidates(event: unknown) {
  const candidates: unknown[] = []
  collectHostEventCandidates(event, candidates, 0)
  return candidates
}

function collectHostEventCandidates(value: unknown, candidates: unknown[], depth: number) {
  if (depth > 5 || value == null) {
    return
  }
  const normalized = parseJsonLike(value)
  candidates.push(normalized)
  if (Array.isArray(normalized)) {
    normalized.forEach((item) => collectHostEventCandidates(item, candidates, depth + 1))
    return
  }
  if (!isObject(normalized)) {
    return
  }
  ;['payload', 'metadata', 'data', 'result', 'output', 'content', 'message', 'detail', 'response', 'tool', 'toolCall', 'tool_call', 'function', 'arguments', 'args', 'input'].forEach((key) => collectHostEventCandidates(normalized[key], candidates, depth + 1))
}

function parseJsonLike(value: unknown) {
  if (typeof value !== 'string') {
    return value
  }
  const trimmed = value.trim()
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return value
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function removeDrawioExtension(name: string) {
  return name.replace(/\.(drawio|diagram|xml)(?:\.json)?$/i, '').replace(/\.json$/i, '') || name
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

const root = ReactDOM.createRoot(document.getElementById('root')!)
root.render(<App />)
