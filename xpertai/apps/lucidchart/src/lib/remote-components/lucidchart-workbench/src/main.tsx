import {
  Archive,
  Badge,
  Button,
  Check,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Download,
  FileJson,
  Image,
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
  Textarea,
  Upload,
  installShadcnThemeVars
} from '@xpert-ai/plugin-shadcn-ui'
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
type DocumentKind = 'diagram' | 'flowchart' | 'architecture' | 'process' | 'wireframe' | 'orgchart' | 'network' | 'other'
type DocumentRecord = Record<string, any>
type DocumentVersion = Record<string, any>
type DetailPayload = {
  item?: DocumentRecord
  currentVersion?: DocumentVersion | null
  versions?: DocumentVersion[]
  logs?: any[]
}
type PreviewShape = {
  id: string
  x: number
  y: number
  w: number
  h: number
  text: string
  type: string
  fillColor: string
  strokeColor: string
  strokeWidth: number
  cornerRadius: number
}
type PreviewLine = {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  text: string
  strokeColor: string
  strokeWidth: number
}
type StandardImportPreviewModel = {
  shapes: PreviewShape[]
  lines: PreviewLine[]
  viewBox: string
}
type JsonParseResult = {
  value: Record<string, unknown> | null
  error: string | null
}

const DEFAULT_MERMAID = `flowchart TD
  A[User Request] --> B[Agent Plans Lucidchart Draft]
  B --> C{Best Path?}
  C -->|Structured import| D[Save Standard Import]
  C -->|Still exploring| E[Save Mermaid Draft]
  C -->|Already in Lucid| F[Register Lucid URL]`

const LUCIDCHART_TOOL_NAMES = new Set([
  'lucidchart_create_document',
  'lucidchart_save_standard_import_version',
  'lucidchart_patch_standard_import',
  'lucidchart_save_mermaid_draft',
  'lucidchart_register_external_document',
  'lucidchart_search_documents',
  'lucidchart_get_document',
  'lucidchart_update_document_status',
  'lucidchart_report_failure'
])

const LUCIDCHART_MUTATION_TOOL_NAMES = new Set([
  'lucidchart_create_document',
  'lucidchart_save_standard_import_version',
  'lucidchart_patch_standard_import',
  'lucidchart_save_mermaid_draft',
  'lucidchart_register_external_document',
  'lucidchart_update_document_status',
  'lucidchart_report_failure'
])

const DOCUMENT_KINDS: DocumentKind[] = ['diagram', 'flowchart', 'architecture', 'process', 'wireframe', 'orgchart', 'network', 'other']

installShadcnThemeVars({ styleId: 'lucidchart-workbench-shadcn-ui-vars' })
injectStyles()

function App() {
  const [context, setContext] = React.useState<any>(null)
  const [documents, setDocuments] = React.useState<DocumentRecord[]>([])
  const [detail, setDetail] = React.useState<DetailPayload | null>(null)
  const [selectedId, setSelectedId] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<StatusFilter>('')
  const [busy, setBusy] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [newDialogOpen, setNewDialogOpen] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState('')
  const [newDescription, setNewDescription] = React.useState('')
  const [newKind, setNewKind] = React.useState<DocumentKind>('diagram')
  const [metadataTitle, setMetadataTitle] = React.useState('')
  const [metadataDescription, setMetadataDescription] = React.useState('')
  const [metadataKind, setMetadataKind] = React.useState<DocumentKind>('diagram')
  const [metadataDirty, setMetadataDirty] = React.useState(false)
  const [changeSummary, setChangeSummary] = React.useState('')
  const [assistantPrompt, setAssistantPrompt] = React.useState('')
  const [standardImportText, setStandardImportText] = React.useState(() => stringifyJson(createDefaultStandardImport('Untitled')))
  const [mermaidSource, setMermaidSource] = React.useState(DEFAULT_MERMAID)
  const [lucidDocumentId, setLucidDocumentId] = React.useState('')
  const [lucidDocumentUrl, setLucidDocumentUrl] = React.useState('')
  const [embedUrl, setEmbedUrl] = React.useState('')
  const [previewUrl, setPreviewUrl] = React.useState('')
  const [mainTab, setMainTab] = React.useState('preview')
  const [inspectorTab, setInspectorTab] = React.useState('info')
  const [leftPanelCollapsed, setLeftPanelCollapsed] = React.useState(() => isCompactViewport())
  const [rightPanelCollapsed, setRightPanelCollapsed] = React.useState(() => isCompactViewport())
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const contextRef = React.useRef<any>(null)
  const selectedIdRef = React.useRef('')
  const searchRef = React.useRef('')
  const statusRef = React.useRef<StatusFilter>('')
  const hostEventSequenceRef = React.useRef(0)
  const savedSignatureRef = React.useRef('')
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

  React.useEffect(reportResize, [documents, detail, busy, dirty, metadataDirty, mainTab, inspectorTab, leftPanelCollapsed, rightPanelCollapsed])

  function hydratePayload(payload: any) {
    if (!payload) {
      return
    }
    if (Array.isArray(payload.items)) {
      setDocuments(payload.items)
      if (!selectedIdRef.current && payload.items[0]?.id) {
        selectDocument(payload.items[0].id)
      }
      return
    }
    if (payload.item) {
      applyDetailPayload(payload)
    }
  }

  function applyDetailPayload(payload: DetailPayload) {
    setDetail(payload)
    const documentId = payload.item?.id || ''
    selectedIdRef.current = documentId
    setSelectedId(documentId)
    setChangeSummary('')
    const version = payload.currentVersion || null
    const title = payload.item?.title || t('untitled')
    const nextKind = normalizeDocumentKind(payload.item?.kind)
    setMetadataTitle(title)
    setMetadataDescription(typeof payload.item?.description === 'string' ? payload.item.description : '')
    setMetadataKind(nextKind)
    setMetadataDirty(false)
    const standardImport = isObject(version?.standardImport) ? version?.standardImport : createDefaultStandardImport(title)
    const nextText = stringifyJson(standardImport)
    setStandardImportText(nextText)
    const nextMermaidSource = typeof version?.mermaidSource === 'string' ? version.mermaidSource : ''
    const nextLucidDocumentId = firstString(version?.lucidDocumentId, payload.item?.lucidDocumentId)
    const nextLucidDocumentUrl = firstString(version?.lucidDocumentUrl, payload.item?.lucidDocumentUrl)
    const nextEmbedUrl = firstString(version?.embedUrl, payload.item?.embedUrl)
    const nextPreviewUrl = firstString(version?.previewUrl, payload.item?.previewUrl)
    setMermaidSource(nextMermaidSource)
    setLucidDocumentId(nextLucidDocumentId)
    setLucidDocumentUrl(nextLucidDocumentUrl)
    setEmbedUrl(nextEmbedUrl)
    setPreviewUrl(nextPreviewUrl)
    savedSignatureRef.current = createSignatureFromValues(
      nextText,
      nextMermaidSource,
      nextLucidDocumentId,
      nextLucidDocumentUrl,
      nextEmbedUrl,
      nextPreviewUrl
    )
    setDirty(false)
  }

  async function reloadAfterHostEvent(event: unknown) {
    const toolName = extractToolNameFromHostEvent(event)
    if (toolName && !LUCIDCHART_TOOL_NAMES.has(toolName)) {
      return
    }

    const sequence = ++hostEventSequenceRef.current
    const eventDocumentId = extractDocumentIdFromHostEvent(event)
    const items = await reloadList()
    if (sequence !== hostEventSequenceRef.current) {
      return
    }

    const shouldPreferNewest =
      !eventDocumentId &&
      (toolName === 'lucidchart_create_document' || (toolName === 'lucidchart_save_mermaid_draft' && !selectedIdRef.current))
    const nextDocumentId = eventDocumentId ?? (shouldPreferNewest ? items[0]?.id : selectedIdRef.current) ?? items[0]?.id
    if (nextDocumentId) {
      await selectDocument(nextDocumentId)
    }

    if (!toolName || LUCIDCHART_MUTATION_TOOL_NAMES.has(toolName)) {
      notify('info', createTranslator(contextRef.current?.locale)('agentDocumentUpdated'))
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
      setDocuments(items)
      if (!selectedIdRef.current && items[0]?.id) {
        await selectDocument(items[0].id)
      }
      return items
    } catch (error) {
      notify('error', getErrorMessage(error))
      return []
    } finally {
      setBusy(false)
    }
  }

  async function selectDocument(documentId: string): Promise<DetailPayload | null> {
    if (!documentId) {
      return null
    }
    setBusy(true)
    try {
      const response = await requestData({ parameters: { documentId } })
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

  function hasUnsavedChanges() {
    return dirty || metadataDirty
  }

  function confirmDiscardUnsavedChanges() {
    return !hasUnsavedChanges() || window.confirm(t('discardUnsavedChanges'))
  }

  async function selectDocumentWithGuard(documentId: string) {
    if (documentId === selectedIdRef.current) {
      return
    }
    if (!confirmDiscardUnsavedChanges()) {
      return
    }
    await selectDocument(documentId)
  }

  async function createDocument() {
    const title = newTitle.trim() || t('untitled')
    setBusy(true)
    try {
      const response = await executeAction('create_document', null, {
        title,
        description: newDescription,
        kind: newKind
      })
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('documentCreated'))
      const documentId = result?.item?.id || result?.data?.item?.id
      setNewTitle('')
      setNewDescription('')
      setNewKind('diagram')
      setNewDialogOpen(false)
      setChangeSummary('')
      if (documentId) {
        await reloadList()
        await selectDocument(documentId)
      } else {
        await reloadList()
      }
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function updateDocumentMetadata() {
    if (!selectedId) {
      notify('warning', t('noDocument'))
      return
    }
    const title = metadataTitle.trim()
    if (!title) {
      notify('warning', t('titleRequired'))
      return
    }
    setBusy(true)
    try {
      const response = await executeAction('update_document_metadata', selectedId, {
        documentId: selectedId,
        title,
        description: metadataDescription,
        kind: metadataKind,
        changeSummary: changeSummary.trim() || undefined
      })
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('metadataSaved'))
      setMetadataDirty(false)
      setChangeSummary('')
      await selectDocument(selectedId)
      await reloadList()
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function saveStandardImport() {
    if (!selectedId) {
      notify('warning', t('noDocument'))
      return
    }
    const parsed = parseStandardImportDocument(standardImportText)
    if (parsed.error || !parsed.value) {
      notify('error', `${t('invalidJson')}: ${parsed.error || t('unknownError')}`)
      return
    }
    setBusy(true)
    try {
      const response = await executeAction('save_standard_import_version', selectedId, {
        documentId: selectedId,
        standardImport: parsed.value,
        mermaidSource: mermaidSource.trim() || undefined,
        lucidDocumentId: lucidDocumentId.trim() || undefined,
        lucidDocumentUrl: lucidDocumentUrl.trim() || undefined,
        embedUrl: embedUrl.trim() || undefined,
        previewUrl: previewUrl.trim() || undefined,
        product: 'lucidchart',
        importFileName: `${detail?.item?.title || 'document'}.json`,
        changeSummary: changeSummary.trim() || undefined
      })
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('operationCompleted'))
      setChangeSummary('')
      await selectDocument(selectedId)
      await reloadList()
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function saveMermaidDraft() {
    const source = mermaidSource.trim()
    if (!source) {
      return
    }
    setBusy(true)
    try {
      const response = await executeAction('save_mermaid_draft', selectedId || null, {
        documentId: selectedId || undefined,
        title: metadataTitle.trim() || detail?.item?.title || t('untitled'),
        description: metadataDescription,
        kind: metadataKind,
        mermaidSource: source,
        changeSummary: changeSummary.trim() || undefined
      })
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('operationCompleted'))
      const documentId = result?.document?.item?.id || result?.data?.document?.item?.id || selectedId
      setChangeSummary('')
      await reloadList()
      if (documentId) {
        await selectDocument(documentId)
      }
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function registerExternalDocument() {
    if (!selectedId && !metadataTitle.trim()) {
      notify('warning', t('noDocument'))
      return
    }
    setBusy(true)
    try {
      const response = await executeAction('register_external_document', selectedId || null, {
        documentId: selectedId || undefined,
        title: metadataTitle.trim() || detail?.item?.title || t('untitled'),
        description: metadataDescription,
        kind: metadataKind,
        lucidDocumentId: lucidDocumentId.trim() || undefined,
        lucidDocumentUrl: lucidDocumentUrl.trim() || undefined,
        embedUrl: embedUrl.trim() || undefined,
        previewUrl: previewUrl.trim() || undefined,
        product: 'lucidchart',
        changeSummary: changeSummary.trim() || undefined
      })
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('operationCompleted'))
      const documentId = result?.document?.item?.id || result?.data?.document?.item?.id || selectedId
      setChangeSummary('')
      await reloadList()
      if (documentId) {
        await selectDocument(documentId)
      }
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
    if (!confirmDiscardUnsavedChanges()) {
      return
    }
    setBusy(true)
    try {
      const response = await executeAction('restore_version', selectedId, {
        documentId: selectedId,
        versionId,
        changeSummary: changeSummary.trim() || undefined
      })
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('operationCompleted'))
      await selectDocument(selectedId)
      await reloadList()
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function archiveDocument() {
    if (!selectedId) {
      return
    }
    if (!confirmDiscardUnsavedChanges() || !window.confirm(t('confirmArchive'))) {
      return
    }
    setBusy(true)
    try {
      await executeAction('archive_document', selectedId, { documentId: selectedId })
      notify('success', t('operationCompleted'))
      setDetail(null)
      setSelectedId('')
      await reloadList()
    } catch (error) {
      notify('error', getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function setDocumentReviewStatus(nextStatus: 'draft' | 'reviewed') {
    if (!selectedId) {
      return
    }
    setBusy(true)
    try {
      const response = await executeAction(nextStatus === 'reviewed' ? 'mark_reviewed' : 'mark_draft', selectedId, {
        documentId: selectedId,
        reason: changeSummary.trim() || undefined
      })
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('operationCompleted'))
      setChangeSummary('')
      await selectDocument(selectedId)
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

  async function sendAssistantPrompt() {
    const prompt = assistantPrompt.trim()
    if (!prompt) {
      return
    }
    setBusy(true)
    try {
      const response = await executeAction('prepare_agent_draw_message', selectedId || null, {
        documentId: selectedId || undefined,
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
    if (hasUnsavedChanges() && !window.confirm(t('discardUnsavedChanges'))) {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }
    setBusy(true)
    try {
      const response = await executeFileAction(
        'import_standard_import_file',
        selectedId || null,
        {
          documentId: selectedId || undefined,
          title: removeLucidchartExtension(file.name)
        },
        { documentId: selectedId || undefined },
        file
      )
      const result = getResponsePayload(response)
      notify('success', resolveMessage(result?.message, contextRef.current?.locale) || t('operationCompleted'))
      const documentId = result?.data?.item?.id || result?.item?.id || selectedId
      await reloadList()
      if (documentId) {
        await selectDocument(documentId)
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

  function updateStandardImportText(nextText: string) {
    setStandardImportText(nextText)
    updateDirtyState({ standardImportText: nextText })
  }

  function updateMermaidSource(nextSource: string) {
    setMermaidSource(nextSource)
    updateDirtyState({ mermaidSource: nextSource })
  }

  function updateLucidDocumentUrl(nextUrl: string) {
    setLucidDocumentUrl(nextUrl)
    updateDirtyState({ lucidDocumentUrl: nextUrl })
  }

  function updateEmbedUrl(nextUrl: string) {
    setEmbedUrl(nextUrl)
    updateDirtyState({ embedUrl: nextUrl })
  }

  function updateLucidDocumentId(nextId: string) {
    setLucidDocumentId(nextId)
    updateDirtyState({ lucidDocumentId: nextId })
  }

  function updatePreviewUrl(nextUrl: string) {
    setPreviewUrl(nextUrl)
    updateDirtyState({ previewUrl: nextUrl })
  }

  function updateDirtyState(overrides: Partial<{
    standardImportText: string
    mermaidSource: string
    lucidDocumentId: string
    lucidDocumentUrl: string
    embedUrl: string
    previewUrl: string
  }> = {}) {
    if (!selectedIdRef.current) {
      setDirty(false)
      return
    }
    const nextSignature = createSignatureFromValues(
      overrides.standardImportText ?? standardImportText,
      overrides.mermaidSource ?? mermaidSource,
      overrides.lucidDocumentId ?? lucidDocumentId,
      overrides.lucidDocumentUrl ?? lucidDocumentUrl,
      overrides.embedUrl ?? embedUrl,
      overrides.previewUrl ?? previewUrl
    )
    setDirty(nextSignature !== savedSignatureRef.current)
  }

  function exportJson() {
    const parsed = parseStandardImportDocument(standardImportText)
    if (parsed.error || !parsed.value) {
      notify('error', `${t('invalidJson')}: ${parsed.error || t('unknownError')}`)
      return
    }
    downloadBlob(
      new Blob([JSON.stringify(parsed.value, null, 2)], { type: 'application/json' }),
      `${detail?.item?.title || 'document'}.json`
    )
  }

  function formatStandardImportJson() {
    const parsed = parseStandardImportDocument(standardImportText)
    if (parsed.error || !parsed.value) {
      notify('error', `${t('invalidJson')}: ${parsed.error || t('unknownError')}`)
      return
    }
    updateStandardImportText(stringifyJson(parsed.value))
  }

  function revertStandardImportJson() {
    const title = detail?.item?.title || t('untitled')
    const standardImport = isObject(currentVersion?.standardImport) ? currentVersion.standardImport : createDefaultStandardImport(title)
    updateStandardImportText(stringifyJson(standardImport))
  }

  function updateMetadataTitle(nextTitle: string) {
    setMetadataTitle(nextTitle)
    setMetadataDirty(true)
  }

  function updateMetadataDescription(nextDescription: string) {
    setMetadataDescription(nextDescription)
    setMetadataDirty(true)
  }

  function updateMetadataKind(nextKind: DocumentKind) {
    setMetadataKind(nextKind)
    setMetadataDirty(true)
  }

  function openNewDocumentDialog() {
    if (!confirmDiscardUnsavedChanges()) {
      return
    }
    setNewDialogOpen(true)
  }

  const currentVersion = detail?.currentVersion || null
  const documentStatus = (detail?.item?.status || 'draft') as StatusFilter
  const embeddableUrl = embedUrl.trim()
  const imagePreviewUrl = previewUrl.trim()
  const lucidOpenUrl = embeddableUrl || lucidDocumentUrl.trim()
  const standardImportParse = React.useMemo(() => parseStandardImportDocument(standardImportText), [standardImportText])
  const standardImportPreview = React.useMemo(() => createStandardImportPreview(standardImportText), [standardImportText])
  const isJsonValid = Boolean(standardImportParse.value && !standardImportParse.error)
  const canSave = Boolean(selectedId && dirty && !busy && isJsonValid)
  const currentTitle = detail?.item?.title || t('untitled')
  const shellClassName = `lw-shell ${leftPanelCollapsed ? 'left-collapsed' : ''} ${rightPanelCollapsed ? 'right-collapsed' : ''}`
  const previewBadge = embeddableUrl
    ? t('embedPreview')
    : imagePreviewUrl
      ? t('imagePreview')
      : standardImportPreview
        ? t('standardImportPreview')
        : t('saved')

  return (
    <div className={shellClassName}>
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="lw-dialog">
          <DialogHeader>
            <DialogTitle>{t('newDocument')}</DialogTitle>
          </DialogHeader>
          <div className="lw-dialog-stack">
            <Input value={newTitle} placeholder={t('title')} onChange={(event: any) => setNewTitle(event.target.value)} />
            <Textarea value={newDescription} placeholder={t('description')} onChange={(event: any) => setNewDescription(event.target.value)} />
            <Select value={newKind} onValueChange={(value: string) => setNewKind(normalizeDocumentKind(value))}>
              <SelectTrigger aria-label={t('kind')}>
                <SelectValue placeholder={t('kind')} />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_KINDS.map((kind) => (
                  <SelectItem value={kind} key={kind}>
                    {t(kind)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setNewDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="button" disabled={busy} onClick={createDocument}>
              <Plus className="lw-button-icon" aria-hidden="true" />
              {t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sidebar className="lw-sidebar" side="left" collapsed={leftPanelCollapsed}>
        <SidebarHeader>
          <SidebarTrigger
            variant="ghost"
            size="icon"
            aria-label={leftPanelCollapsed ? t('expandDocuments') : t('collapseDocuments')}
            title={leftPanelCollapsed ? t('expandDocuments') : t('collapseDocuments')}
            onClick={() => setLeftPanelCollapsed((value) => !value)}
          >
            {leftPanelCollapsed ? <PanelLeftOpen className="lw-button-icon" aria-hidden="true" /> : <PanelLeftClose className="lw-button-icon" aria-hidden="true" />}
          </SidebarTrigger>
          {!leftPanelCollapsed ? (
            <>
              <SidebarTitle>{t('documents')}</SidebarTitle>
              <Badge variant="secondary">{documents.length}</Badge>
            </>
          ) : null}
        </SidebarHeader>
        {leftPanelCollapsed ? (
          <SidebarRail><span>{t('documents')}</span></SidebarRail>
        ) : (
          <SidebarContent>
            <div className="lw-sidebar-controls">
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
            <ScrollArea className="lw-list">
              <SidebarMenu>
                {documents.map((document) => (
                  <SidebarMenuItem key={document.id}>
                    <SidebarMenuButton type="button" active={document.id === selectedId} onClick={() => selectDocumentWithGuard(document.id)}>
                      <span className="lw-item-title">{document.title || t('untitled')}</span>
                      <span className="lw-item-meta">
                        v{document.currentVersionNumber || 0} · {t((document.status || 'draft') as TranslationKey)} · {t(normalizeDocumentKind(document.kind))}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </ScrollArea>
          </SidebarContent>
        )}
      </Sidebar>

      <main className="lw-main">
        <div className="lw-toolbar">
          <div className="lw-toolbar-title">
            <div className="lw-title-text">{selectedId ? currentTitle : t('workbenchTitle')}</div>
            <div className="lw-title-meta">
              {selectedId ? (
                <>
                  <Badge variant="secondary">{t(documentStatus as TranslationKey)}</Badge>
                  <Badge variant="secondary">v{detail?.item?.currentVersionNumber || 0}</Badge>
                  <Badge variant="secondary">{t(normalizeDocumentKind(detail?.item?.kind))}</Badge>
                  {currentVersion?.sourceType ? <Badge variant="secondary">{currentVersion.sourceType}</Badge> : null}
                </>
              ) : (
                <span>{t('noDocument')}</span>
              )}
            </div>
          </div>
          <div className="lw-toolbar-actions">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={openNewDocumentDialog}>
              <Plus className="lw-button-icon" aria-hidden="true" />
              {t('newDocument')}
            </Button>
            <Button type="button" size="sm" disabled={!canSave} onClick={saveStandardImport}>
              <Save className="lw-button-icon" aria-hidden="true" />
              {t('save')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileInputRef.current?.click()}>
              <Upload className="lw-button-icon" aria-hidden="true" />
              {t('import')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!selectedId || !isJsonValid} onClick={exportJson}>
              <Download className="lw-button-icon" aria-hidden="true" />
              {t('exportJson')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!lucidOpenUrl} onClick={() => window.open(lucidOpenUrl, '_blank', 'noopener,noreferrer')}>
              <FileJson className="lw-button-icon" aria-hidden="true" />
              {t('openLucid')}
            </Button>
            <Badge className="lw-status" variant={dirty ? 'warning' : 'secondary'}>
              {hasUnsavedChanges() ? t('dirty') : t('saved')}
            </Badge>
          </div>
          <input
            ref={fileInputRef}
            className="lw-hidden-file"
            type="file"
            accept=".json,application/json"
            onChange={(event: any) => importFile(event.target.files?.[0] || null)}
          />
        </div>
        <div className="lw-stage">
          {selectedId || detail?.item ? (
            <div className="lw-editor-pane">
              <Tabs className="lw-tabs" value={mainTab} onValueChange={(value: string) => setMainTab(value)}>
                <div className="lw-editor-header">
                  <TabsList>
                    <TabsTrigger value="preview">
                      <Image className="lw-button-icon" aria-hidden="true" />
                      {t('preview')}
                    </TabsTrigger>
                    <TabsTrigger value="json">
                      <FileJson className="lw-button-icon" aria-hidden="true" />
                      {t('json')}
                    </TabsTrigger>
                    <TabsTrigger value="mermaid">{t('mermaid')}</TabsTrigger>
                    <TabsTrigger value="links">{t('links')}</TabsTrigger>
                  </TabsList>
                  <Badge variant={embeddableUrl || imagePreviewUrl || standardImportPreview ? 'success' : 'secondary'}>{previewBadge}</Badge>
                </div>

                <TabsContent className="lw-tab-content" value="preview">
                  <div className="lw-visual-frame">
                    {embeddableUrl ? (
                      <iframe title="Lucidchart embed" src={embeddableUrl} />
                    ) : imagePreviewUrl ? (
                      <img src={imagePreviewUrl} alt={t('imagePreview')} />
                    ) : standardImportPreview ? (
                      <StandardImportPreview model={standardImportPreview} />
                    ) : (
                      <div className="lw-embed-empty">{t('previewUnavailable')}</div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent className="lw-tab-content lw-json-tab" value="json">
                  <div className="lw-tab-toolbar">
                    <div className="lw-inline-badges">
                      <Badge variant={isJsonValid ? 'success' : 'warning'}>{isJsonValid ? t('jsonValid') : t('jsonInvalid')}</Badge>
                      {standardImportParse.error ? <span className="lw-muted">{standardImportParse.error}</span> : null}
                    </div>
                    <div className="lw-inline-actions">
                      <Button type="button" variant="outline" size="sm" disabled={!isJsonValid} onClick={formatStandardImportJson}>
                        {t('formatJson')}
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={revertStandardImportJson}>
                        <RotateCcw className="lw-button-icon" aria-hidden="true" />
                        {t('revertJson')}
                      </Button>
                    </div>
                  </div>
                  <Textarea className="lw-json-editor" value={standardImportText} onChange={(event: any) => updateStandardImportText(event.target.value)} />
                </TabsContent>

                <TabsContent className="lw-tab-content lw-form-tab" value="mermaid">
                  <section className="lw-section">
                    <div className="lw-section-title">{t('mermaid')}</div>
                    <Textarea className="lw-tall-textarea" value={mermaidSource} onChange={(event: any) => updateMermaidSource(event.target.value)} />
                    <div className="lw-muted">{t('standardImportNotice')}</div>
                    <div className="lw-inline-actions">
                      <Button type="button" disabled={busy || !mermaidSource.trim()} onClick={saveMermaidDraft}>
                        <Save className="lw-button-icon" aria-hidden="true" />
                        {t('saveMermaid')}
                      </Button>
                    </div>
                  </section>
                </TabsContent>

                <TabsContent className="lw-tab-content lw-form-tab" value="links">
                  <section className="lw-section">
                    <div className="lw-section-title">{t('externalDocument')}</div>
                    <Input value={lucidDocumentUrl} placeholder={t('lucidDocumentUrl')} onChange={(event: any) => updateLucidDocumentUrl(event.target.value)} />
                    <Input value={embedUrl} placeholder={t('embedUrl')} onChange={(event: any) => updateEmbedUrl(event.target.value)} />
                    <Input value={lucidDocumentId} placeholder={t('lucidDocumentId')} onChange={(event: any) => updateLucidDocumentId(event.target.value)} />
                    <Input value={previewUrl} placeholder={t('previewUrl')} onChange={(event: any) => updatePreviewUrl(event.target.value)} />
                    <div className="lw-inline-actions">
                      <Button type="button" disabled={busy || (!lucidDocumentId.trim() && !lucidDocumentUrl.trim() && !embedUrl.trim())} onClick={registerExternalDocument}>
                        {t('registerExternal')}
                      </Button>
                    </div>
                  </section>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="lw-empty">{t('noDocument')}</div>
          )}
        </div>
      </main>

      <Sidebar className="lw-inspector" side="right" collapsed={rightPanelCollapsed}>
        <SidebarHeader>
          {!rightPanelCollapsed ? (
            <SidebarTitle className="lw-sidebar-title-truncate">{detail?.item?.title || t('inspector')}</SidebarTitle>
          ) : null}
          <SidebarTrigger
            className="lw-sidebar-trigger-right"
            variant="ghost"
            size="icon"
            aria-label={rightPanelCollapsed ? t('expandInspector') : t('collapseInspector')}
            title={rightPanelCollapsed ? t('expandInspector') : t('collapseInspector')}
            onClick={() => setRightPanelCollapsed((value) => !value)}
          >
            {rightPanelCollapsed ? <PanelRightOpen className="lw-button-icon" aria-hidden="true" /> : <PanelRightClose className="lw-button-icon" aria-hidden="true" />}
          </SidebarTrigger>
        </SidebarHeader>
        {rightPanelCollapsed ? (
          <SidebarRail><span>{t('inspector')}</span></SidebarRail>
        ) : (
          <SidebarContent>
            <ScrollArea className="lw-inspector-scroll">
              <Tabs className="lw-inspector-tabs" value={inspectorTab} onValueChange={(value: string) => setInspectorTab(value)}>
                <TabsList className="lw-inspector-tabs-list">
                  <TabsTrigger value="info">{t('info')}</TabsTrigger>
                  <TabsTrigger value="versions">{t('versions')}</TabsTrigger>
                  <TabsTrigger value="activity">{t('activity')}</TabsTrigger>
                  <TabsTrigger value="assistant">{t('assistant')}</TabsTrigger>
                </TabsList>

                <TabsContent className="lw-inspector-stack" value="info">
                  <section className="lw-section">
                    <div className="lw-section-title">{t('documentInfo')}</div>
                    <Input value={metadataTitle} placeholder={t('title')} onChange={(event: any) => updateMetadataTitle(event.target.value)} />
                    <Textarea value={metadataDescription} placeholder={t('description')} onChange={(event: any) => updateMetadataDescription(event.target.value)} />
                    <Select value={metadataKind} onValueChange={(value: string) => updateMetadataKind(normalizeDocumentKind(value))}>
                      <SelectTrigger aria-label={t('kind')}>
                        <SelectValue placeholder={t('kind')} />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_KINDS.map((kind) => (
                          <SelectItem value={kind} key={kind}>
                            {t(kind)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </section>

                  <section className="lw-section">
                    <div className="lw-section-title">{t('changeSummary')}</div>
                    <Input value={changeSummary} placeholder={t('changeSummary')} onChange={(event: any) => setChangeSummary(event.target.value)} />
                  </section>

                  <div className="lw-inline-actions">
                    <Button type="button" disabled={busy || !selectedId || !metadataDirty} onClick={updateDocumentMetadata}>
                      <Save className="lw-button-icon" aria-hidden="true" />
                      {t('saveMetadata')}
                    </Button>
                    {documentStatus === 'archived' ? (
                      <Badge variant="secondary">{t('archived')}</Badge>
                    ) : documentStatus === 'reviewed' ? (
                      <Button type="button" variant="outline" disabled={busy || !selectedId} onClick={() => setDocumentReviewStatus('draft')}>
                        <RotateCcw className="lw-button-icon" aria-hidden="true" />
                        {t('backToDraft')}
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" disabled={busy || !selectedId} onClick={() => setDocumentReviewStatus('reviewed')}>
                        <Check className="lw-button-icon" aria-hidden="true" />
                        {t('markReviewed')}
                      </Button>
                    )}
                    <Button type="button" variant="destructiveOutline" disabled={busy || !selectedId || documentStatus === 'archived'} onClick={archiveDocument}>
                      <Archive className="lw-button-icon" aria-hidden="true" />
                      {t('archive')}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent className="lw-inspector-stack" value="versions">
                  {(detail?.versions || []).length ? (
                    (detail?.versions || []).map((version) => (
                      <div className="lw-version" key={version.id}>
                        <div>
                          <div>v{version.versionNumber}</div>
                          <div className="lw-muted">{version.sourceType || 'workbench'}</div>
                          {version.changeSummary ? <div className="lw-muted">{version.changeSummary}</div> : null}
                        </div>
                        <Button
                          className="lw-version-action"
                          type="button"
                          variant="outline"
                          size="icon"
                          title={t('restore')}
                          aria-label={`${t('restore')} v${version.versionNumber}`}
                          disabled={busy}
                          onClick={() => restoreVersion(version.id)}
                        >
                          <RotateCcw className="lw-button-icon" aria-hidden="true" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="lw-empty-state">{t('noVersions')}</div>
                  )}
                </TabsContent>

                <TabsContent className="lw-inspector-stack" value="activity">
                  {(detail?.logs || []).length ? (
                    (detail?.logs || []).map((log) => (
                      <div className="lw-log" key={log.id || `${log.action}-${log.createdAt}`}>
                        <div className="lw-log-title">{formatLogTitle(log)}</div>
                        <div className="lw-muted">{formatDateTime(log.createdAt)}</div>
                        {log.message ? <div className="lw-log-message">{log.message}</div> : null}
                        {log.errorMessage ? <div className="lw-log-error">{log.errorMessage}</div> : null}
                      </div>
                    ))
                  ) : (
                    <div className="lw-empty-state">{t('noActivity')}</div>
                  )}
                </TabsContent>

                <TabsContent className="lw-inspector-stack" value="assistant">
                  <section className="lw-section">
                    <div className="lw-section-title">{t('drawingRequest')}</div>
                    <Textarea className="lw-tall-textarea" value={assistantPrompt} placeholder={t('drawingRequest')} onChange={(event: any) => setAssistantPrompt(event.target.value)} />
                    <Button type="button" disabled={busy || !assistantPrompt.trim()} onClick={sendAssistantPrompt}>
                      <Send className="lw-button-icon" aria-hidden="true" />
                      {t('askAssistant')}
                    </Button>
                  </section>
                </TabsContent>
              </Tabs>
            </ScrollArea>
          </SidebarContent>
        )}
      </Sidebar>
    </div>
  )
}

function createDefaultStandardImport(title: string) {
  return {
    title,
    product: 'lucidchart',
    pages: [
      {
        id: 'page-1',
        title: 'Page 1',
        shapes: [],
        lines: []
      }
    ]
  }
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function createSignatureFromValues(
  standardImportText: string,
  mermaidSource: string,
  lucidDocumentId: string,
  lucidDocumentUrl: string,
  embedUrl: string,
  previewUrl: string
) {
  return JSON.stringify({
    standardImportText: normalizeJsonText(standardImportText),
    mermaidSource: mermaidSource.replace(/\r\n/g, '\n'),
    lucidDocumentId,
    lucidDocumentUrl,
    embedUrl,
    previewUrl
  })
}

function normalizeJsonText(value: string) {
  try {
    return JSON.stringify(JSON.parse(value))
  } catch {
    return value
  }
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseStandardImportDocument(source: string): JsonParseResult {
  try {
    const parsed = JSON.parse(source)
    if (!isObject(parsed)) {
      return { value: null, error: 'Expected a JSON object.' }
    }
    return { value: parsed, error: null }
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error && error.message ? error.message : 'Invalid JSON.'
    }
  }
}

function normalizeDocumentKind(value: unknown): DocumentKind {
  return DOCUMENT_KINDS.includes(value as DocumentKind) ? (value as DocumentKind) : 'diagram'
}

function formatDateTime(value: unknown) {
  if (!value) {
    return ''
  }
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }
  return date.toLocaleString()
}

function formatLogTitle(log: Record<string, unknown>) {
  const action = typeof log.action === 'string' && log.action.trim() ? log.action.trim() : 'activity'
  const actor = typeof log.actorType === 'string' && log.actorType.trim() ? log.actorType.trim() : ''
  return actor ? `${action} · ${actor}` : action
}

function isCompactViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 1040
}

function StandardImportPreview({ model }: { model: StandardImportPreviewModel }) {
  return (
    <div className="lw-standard-preview">
      <svg viewBox={model.viewBox} role="img" aria-label="Lucidchart Standard Import preview">
        <defs>
          <marker id="lw-standard-preview-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--xps-muted-foreground)" />
          </marker>
        </defs>
        {model.lines.map((line) => (
          <g key={line.id}>
            <line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={line.strokeColor}
              strokeWidth={line.strokeWidth}
              strokeLinecap="round"
              markerEnd="url(#lw-standard-preview-arrow)"
            />
            {line.text ? (
              <text className="lw-preview-line-label" x={(line.x1 + line.x2) / 2} y={(line.y1 + line.y2) / 2 - 8} textAnchor="middle">
                {truncatePreviewText(line.text, 32)}
              </text>
            ) : null}
          </g>
        ))}
        {model.shapes.map((shape) => {
          const lines = splitPreviewLabel(shape.text || shape.id)
          const labelStartY = shape.y + shape.h / 2 - ((lines.length - 1) * 15) / 2
          return (
            <g key={shape.id}>
              {renderPreviewShape(shape)}
              <text className="lw-preview-label" textAnchor="middle" dominantBaseline="middle">
                {lines.map((line, index) => (
                  <tspan key={`${shape.id}-${index}`} x={shape.x + shape.w / 2} y={labelStartY + index * 15}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function renderPreviewShape(shape: PreviewShape) {
  const type = shape.type.toLowerCase()
  if (type.includes('diamond') || type.includes('rhombus') || type.includes('decision')) {
    const points = [
      `${shape.x + shape.w / 2},${shape.y}`,
      `${shape.x + shape.w},${shape.y + shape.h / 2}`,
      `${shape.x + shape.w / 2},${shape.y + shape.h}`,
      `${shape.x},${shape.y + shape.h / 2}`
    ].join(' ')
    return (
      <polygon
        className="lw-preview-shape"
        points={points}
        fill={shape.fillColor}
        stroke={shape.strokeColor}
        strokeWidth={shape.strokeWidth}
      />
    )
  }
  if (type.includes('circle') || type.includes('ellipse') || type.includes('terminator')) {
    return (
      <ellipse
        className="lw-preview-shape"
        cx={shape.x + shape.w / 2}
        cy={shape.y + shape.h / 2}
        rx={shape.w / 2}
        ry={shape.h / 2}
        fill={shape.fillColor}
        stroke={shape.strokeColor}
        strokeWidth={shape.strokeWidth}
      />
    )
  }
  return (
    <rect
      className="lw-preview-shape"
      x={shape.x}
      y={shape.y}
      width={shape.w}
      height={shape.h}
      rx={shape.cornerRadius}
      fill={shape.fillColor}
      stroke={shape.strokeColor}
      strokeWidth={shape.strokeWidth}
    />
  )
}

function createStandardImportPreview(source: string): StandardImportPreviewModel | null {
  const parsed = parseJsonLike(source)
  if (!isObject(parsed)) {
    return null
  }
  const root = isObject(parsed.standardImport) ? parsed.standardImport : parsed
  const rawShapes: Record<string, unknown>[] = []
  const rawLines: Record<string, unknown>[] = []
  collectPreviewItems(root, rawShapes, rawLines, 0, new WeakSet<object>())

  const shapes = rawShapes
    .map((shape, index) => normalizePreviewShape(shape, index))
    .filter((shape): shape is PreviewShape => Boolean(shape))
  const shapeMap = new Map(shapes.map((shape) => [shape.id, shape]))
  const lines = rawLines
    .map((line, index) => normalizePreviewLine(line, index, shapeMap))
    .filter((line): line is PreviewLine => Boolean(line))

  if (!shapes.length && !lines.length) {
    return null
  }
  const bounds = computePreviewBounds(shapes, lines)
  return {
    shapes,
    lines,
    viewBox: `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`
  }
}

function collectPreviewItems(
  value: unknown,
  shapes: Record<string, unknown>[],
  lines: Record<string, unknown>[],
  depth: number,
  seen: WeakSet<object>
) {
  if (depth > 7 || value == null) {
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectPreviewItems(item, shapes, lines, depth + 1, seen))
    return
  }
  if (!isObject(value)) {
    return
  }
  if (seen.has(value)) {
    return
  }
  seen.add(value)

  if (hasPreviewLineGeometry(value)) {
    lines.push(value)
    return
  }
  if (readPreviewBounds(value)) {
    shapes.push(value)
    return
  }

  ;['pages', 'layers', 'groups', 'children', 'items', 'objects', 'blocks', 'shapes', 'lines', 'connectors'].forEach((key) =>
    collectPreviewItems(value[key], shapes, lines, depth + 1, seen)
  )
}

function normalizePreviewShape(input: Record<string, unknown>, index: number): PreviewShape | null {
  const bounds = readPreviewBounds(input)
  if (!bounds) {
    return null
  }
  const format = firstRecord(input.format, input.style, input.styles, input.properties)
  const id = firstPreviewString(input.id, input.uuid, input.shapeId, input.name) || `shape-${index + 1}`
  const text = firstPreviewString(input.text, input.label, input.name, input.title) || id
  return {
    id,
    x: bounds.x,
    y: bounds.y,
    w: bounds.w,
    h: bounds.h,
    text,
    type: firstPreviewString(input.type, input.shape, input.shapeType, input.class, input.name) || 'rect',
    fillColor:
      firstPreviewString(input.fillColor, format?.fillColor, format?.fill, format?.backgroundColor, input.backgroundColor) || '#eff6ff',
    strokeColor:
      firstPreviewString(input.strokeColor, format?.strokeColor, format?.stroke, format?.borderColor, input.borderColor) || '#2563eb',
    strokeWidth: firstFiniteNumber(input.strokeWidth, format?.strokeWidth, format?.borderWidth) ?? 1.5,
    cornerRadius: firstFiniteNumber(input.cornerRadius, format?.cornerRadius, input.radius, format?.radius) ?? 8
  }
}

function normalizePreviewLine(
  input: Record<string, unknown>,
  index: number,
  shapeMap: Map<string, PreviewShape>
): PreviewLine | null {
  const fromId = readEndpointId(input, ['fromId', 'sourceId', 'startShapeId', 'startId', 'from', 'source', 'start'])
  const toId = readEndpointId(input, ['toId', 'targetId', 'endShapeId', 'endId', 'to', 'target', 'end'])
  const fromShape = fromId ? shapeMap.get(fromId) : null
  const toShape = toId ? shapeMap.get(toId) : null
  const startPoint = fromShape ? centerOfShape(fromShape) : readPreviewPoint(input, ['start', 'fromPoint', 'sourcePoint', 'p1', 'endpoint1'])
  const endPoint = toShape ? centerOfShape(toShape) : readPreviewPoint(input, ['end', 'toPoint', 'targetPoint', 'p2', 'endpoint2'])
  const bounds = readPreviewBounds(input)
  const x1 = startPoint?.x ?? firstFiniteNumber(input.x1, input.startX, input.fromX) ?? bounds?.x
  const y1 = startPoint?.y ?? firstFiniteNumber(input.y1, input.startY, input.fromY) ?? bounds?.y
  const x2 = endPoint?.x ?? firstFiniteNumber(input.x2, input.endX, input.toX) ?? (bounds ? bounds.x + bounds.w : null)
  const y2 = endPoint?.y ?? firstFiniteNumber(input.y2, input.endY, input.toY) ?? (bounds ? bounds.y + bounds.h : null)
  if (![x1, y1, x2, y2].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return null
  }
  const format = firstRecord(input.format, input.style, input.styles, input.properties)
  return {
    id: firstPreviewString(input.id, input.uuid, input.lineId, input.name) || `line-${index + 1}`,
    x1,
    y1,
    x2,
    y2,
    text: firstPreviewString(input.text, input.label, input.name, input.title) || '',
    strokeColor: firstPreviewString(input.strokeColor, format?.strokeColor, format?.stroke, input.color) || '#64748b',
    strokeWidth: firstFiniteNumber(input.strokeWidth, format?.strokeWidth, input.width) ?? 1.5
  }
}

function hasPreviewLineGeometry(input: Record<string, unknown>) {
  const type = (firstPreviewString(input.type, input.shape, input.shapeType, input.class) || '').toLowerCase()
  const isLineType =
    ['line', 'arrow', 'connector', 'straightline', 'elbowline'].includes(type) ||
    type.includes('connector') ||
    type.includes('arrow') ||
    type.includes('straight_line') ||
    type.includes('elbow_line')
  const hasEndpointIds =
    Boolean(readEndpointId(input, ['fromId', 'sourceId', 'startShapeId', 'startId', 'from', 'source', 'start'])) &&
    Boolean(readEndpointId(input, ['toId', 'targetId', 'endShapeId', 'endId', 'to', 'target', 'end']))
  const hasCoordinates =
    firstFiniteNumber(input.x1, input.startX, input.fromX) != null &&
    firstFiniteNumber(input.y1, input.startY, input.fromY) != null &&
    firstFiniteNumber(input.x2, input.endX, input.toX) != null &&
    firstFiniteNumber(input.y2, input.endY, input.toY) != null
  const hasPoints =
    Boolean(readPreviewPoint(input, ['start', 'fromPoint', 'sourcePoint', 'p1', 'endpoint1'])) &&
    Boolean(readPreviewPoint(input, ['end', 'toPoint', 'targetPoint', 'p2', 'endpoint2']))
  return hasEndpointIds || hasCoordinates || hasPoints || isLineType
}

function readPreviewBounds(input: Record<string, unknown>) {
  const bounds = firstRecord(input.bounds, input.boundingBox, input.box, input.geometry, input.position)
  const x = firstFiniteNumber(input.x, input.left, bounds?.x, bounds?.left)
  const y = firstFiniteNumber(input.y, input.top, bounds?.y, bounds?.top)
  const w = firstFiniteNumber(input.w, input.width, bounds?.w, bounds?.width)
  const h = firstFiniteNumber(input.h, input.height, bounds?.h, bounds?.height)
  if ([x, y, w, h].every((value) => typeof value === 'number' && Number.isFinite(value)) && w > 0 && h > 0) {
    return { x, y, w, h }
  }
  return null
}

function readPreviewPoint(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const point = input[key]
    if (isObject(point)) {
      const x = firstFiniteNumber(point.x, point.left)
      const y = firstFiniteNumber(point.y, point.top)
      if (typeof x === 'number' && typeof y === 'number') {
        return { x, y }
      }
    }
  }
  return null
}

function readEndpointId(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = input[key]
    const direct = firstPreviewString(value)
    if (direct) {
      return direct
    }
    if (isObject(value)) {
      const nested = firstPreviewString(value.id, value.shapeId, value.nodeId, value.ref, value.reference)
      if (nested) {
        return nested
      }
    }
  }
  return null
}

function centerOfShape(shape: PreviewShape) {
  return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 }
}

function computePreviewBounds(shapes: PreviewShape[], lines: PreviewLine[]) {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  shapes.forEach((shape) => {
    minX = Math.min(minX, shape.x)
    minY = Math.min(minY, shape.y)
    maxX = Math.max(maxX, shape.x + shape.w)
    maxY = Math.max(maxY, shape.y + shape.h)
  })
  lines.forEach((line) => {
    minX = Math.min(minX, line.x1, line.x2)
    minY = Math.min(minY, line.y1, line.y2)
    maxX = Math.max(maxX, line.x1, line.x2)
    maxY = Math.max(maxY, line.y1, line.y2)
  })
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
    return { x: 0, y: 0, w: 800, h: 360 }
  }
  const margin = 48
  return {
    x: minX - margin,
    y: minY - margin,
    w: Math.max(360, maxX - minX + margin * 2),
    h: Math.max(220, maxY - minY + margin * 2)
  }
}

function firstRecord(...values: unknown[]) {
  return values.find(isObject) || null
}

function firstPreviewString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
  }
  return ''
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return null
}

function splitPreviewLabel(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .flatMap((line) => chunkPreviewText(line.trim(), 18))
    .filter(Boolean)
    .slice(0, 5)
}

function chunkPreviewText(value: string, size: number) {
  if (!value) {
    return []
  }
  const chunks: string[] = []
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size))
  }
  return chunks
}

function truncatePreviewText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value
}

function extractToolNameFromHostEvent(event: unknown) {
  for (const candidate of expandHostEventCandidates(event)) {
    if (!isObject(candidate)) {
      continue
    }
    const direct = readString(candidate, 'toolName') ?? readString(candidate, 'tool_name') ?? readString(candidate, 'name')
    if (direct && LUCIDCHART_TOOL_NAMES.has(direct)) {
      return direct
    }
    const tool = candidate.tool
    if (isObject(tool)) {
      const toolName = readString(tool, 'name') ?? readString(tool, 'toolName') ?? readString(tool, 'tool_name')
      if (toolName && LUCIDCHART_TOOL_NAMES.has(toolName)) {
        return toolName
      }
    }
    if (isObject(candidate.function)) {
      const toolName = readString(candidate.function, 'name') ?? readString(candidate.function, 'toolName') ?? readString(candidate.function, 'tool_name')
      if (toolName && LUCIDCHART_TOOL_NAMES.has(toolName)) {
        return toolName
      }
    }
    const toolCall = candidate.toolCall ?? candidate.tool_call
    if (isObject(toolCall)) {
      const toolName =
        readString(toolCall, 'name') ??
        readString(toolCall, 'toolName') ??
        readString(toolCall, 'tool_name') ??
        (isObject(toolCall.function) ? readString(toolCall.function, 'name') : null)
      if (toolName && LUCIDCHART_TOOL_NAMES.has(toolName)) {
        return toolName
      }
    }
  }
  return null
}

function extractDocumentIdFromHostEvent(event: unknown) {
  for (const candidate of expandHostEventCandidates(event)) {
    if (!isObject(candidate)) {
      continue
    }
    const direct =
      readString(candidate, 'documentId') ??
      readString(candidate, 'document_id') ??
      readString(candidate, 'lucidchartDocumentId') ??
      readString(candidate, 'lucidchart_document_id') ??
      readString(candidate, 'drawingId')
    if (direct) {
      return direct
    }
    if (isObject(candidate.item)) {
      const itemId = readString(candidate.item, 'id')
      if (itemId) {
        return itemId
      }
    }
    if (isObject(candidate.document)) {
      const documentId =
        readString(candidate.document, 'documentId') ??
        readString(candidate.document, 'document_id') ??
        readString(candidate.document, 'id') ??
        (isObject(candidate.document.item) ? readString(candidate.document.item, 'id') : null)
      if (documentId) {
        return documentId
      }
    }
    if (isObject(candidate.version)) {
      const documentId = readString(candidate.version, 'documentId') ?? readString(candidate.version, 'document_id')
      if (documentId) {
        return documentId
      }
    }
    if (Array.isArray(candidate.items)) {
      const firstItem = candidate.items.find(isObject)
      if (firstItem) {
        const itemId = readString(firstItem, 'id') ?? readString(firstItem, 'documentId') ?? readString(firstItem, 'document_id')
        if (itemId) {
          return itemId
        }
      }
    }
  }
  return null
}

function expandHostEventCandidates(event: unknown) {
  const candidates: unknown[] = []
  collectHostEventCandidates(event, candidates, 0, new WeakSet<object>())
  return candidates
}

function collectHostEventCandidates(value: unknown, candidates: unknown[], depth: number, seen: WeakSet<object>) {
  if (depth > 5 || value == null) {
    return
  }
  const normalized = parseJsonLike(value)
  if ((isObject(normalized) || Array.isArray(normalized)) && seen.has(normalized)) {
    return
  }
  if (isObject(normalized) || Array.isArray(normalized)) {
    seen.add(normalized)
  }
  candidates.push(normalized)
  if (Array.isArray(normalized)) {
    normalized.forEach((item) => collectHostEventCandidates(item, candidates, depth + 1, seen))
    return
  }
  if (!isObject(normalized)) {
    return
  }
  ;[
    'payload',
    'metadata',
    'data',
    'result',
    'output',
    'content',
    'message',
    'detail',
    'response',
    'document',
    'documents',
    'item',
    'items',
    'version',
    'versions',
    'toolResult',
    'tool_result',
    'toolResponse',
    'tool_response',
    'resultText',
    'text',
    'tool',
    'toolCall',
    'tool_call',
    'function',
    'arguments',
    'args',
    'input'
  ].forEach((key) => collectHostEventCandidates(normalized[key], candidates, depth + 1, seen))
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

function readString(value: Record<string, unknown>, key: string) {
  const raw = value[key]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function removeLucidchartExtension(name: string) {
  return name.replace(/\.(lucid|lucidchart|json)(?:\.json)?$/i, '').replace(/document$/i, 'Lucidchart Document') || name
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)
root.render(<App />)
