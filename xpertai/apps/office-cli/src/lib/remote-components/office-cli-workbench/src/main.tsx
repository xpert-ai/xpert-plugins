import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  executeAction,
  executeFileAction,
  getResponsePayload,
  invokeClientCommand,
  isRecord,
  notify,
  post,
  reportResize,
  requestData,
  startRemoteBridge
} from './runtime'
import './styles.css'

// The remote-component build uses the classic JSX factory (`h`) so React can
// stay external and be supplied by the Xpert iframe host.
const h = React.createElement

type DocumentItem = {
  id?: string
  title?: string
  fileName?: string
  format?: string
  currentVersionNumber?: number
  updatedAt?: string
}

type WorkbenchData = {
  items?: DocumentItem[]
  selected?: {
    document?: DocumentItem
    preview?: { html?: string; error?: string }
    file?: { fileUrl?: string; fileName?: string }
  }
}

type Operation = 'loading' | 'creating' | 'importing' | 'editing' | 'downloading' | 'deleting' | null
type StatusKind = 'info' | 'success' | 'error'
type OfficeFormat = 'docx' | 'xlsx' | 'pptx'

const DEFAULT_TITLES: Record<OfficeFormat, string> = {
  docx: '未命名 Word 文档',
  xlsx: '未命名 Excel 工作簿',
  pptx: '未命名 PowerPoint 演示文稿'
}

function App() {
  const [hostContext, setHostContext] = useState<Record<string, unknown> | null>(null)
  const [data, setData] = useState<WorkbenchData>({})
  const [selectedDocumentId, setSelectedDocumentId] = useState('')
  const [operation, setOperation] = useState<Operation>(null)
  const [status, setStatus] = useState('')
  const [statusKind, setStatusKind] = useState<StatusKind>('info')
  const [createOpen, setCreateOpen] = useState(false)
  const [createFormat, setCreateFormat] = useState<OfficeFormat>('docx')
  const [createTitle, setCreateTitle] = useState(DEFAULT_TITLES.docx)
  const [selectedPath, setSelectedPath] = useState('')
  const [selectedText, setSelectedText] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const previewFrameRef = useRef<HTMLIFrameElement>(null)
  const initializedRef = useRef(false)
  const selectedDocumentIdRef = useRef('')
  const selectedDocumentRef = useRef<DocumentItem | undefined>(undefined)
  const selectedPathRef = useRef('')
  const selectedTextRef = useRef('')
  const refreshSequenceRef = useRef(0)
  const refreshTargetRef = useRef('')
  const refreshInFlightRef = useRef<Promise<void> | null>(null)
  const documents = data.items ?? []
  const selected = data.selected
  const busy = operation !== null

  useEffect(() => {
    startRemoteBridge(
      (context) => {
        setHostContext(context)
        const payload = context.payload
        if (isRecord(payload)) {
          applyWorkbenchData(payload as WorkbenchData)
        }
        if (!initializedRef.current) {
          initializedRef.current = true
          void refresh()
        }
      },
      () => void refresh(selectedDocumentIdRef.current)
    )
    window.addEventListener('message', handlePreviewMessage)
    post('ready')
    return () => window.removeEventListener('message', handlePreviewMessage)
  }, [])

  useEffect(() => {
    reportResize()
  }, [data, operation, createOpen, deleteTarget])

  function setCurrentDocumentId(documentId: string) {
    selectedDocumentIdRef.current = documentId
    setSelectedDocumentId(documentId)
  }

  function applyWorkbenchData(nextData: WorkbenchData) {
    setData(nextData)
    const documentId = readSelectedDocumentId(nextData)
    if (documentId) {
      setCurrentDocumentId(documentId)
      selectedDocumentRef.current = nextData.selected?.document
      void syncAssistantContext(nextData.selected?.document, selectedPathRef.current, selectedTextRef.current)
    } else if (!nextData.selected) {
      setCurrentDocumentId('')
      selectedDocumentRef.current = undefined
      clearSelectedElement(false)
    }
  }

  function handlePreviewMessage(event: MessageEvent) {
    const message = event.data
    if (
      event.source !== previewFrameRef.current?.contentWindow
      || !isRecord(message)
      || message.channel !== 'xpert.officecli.preview'
    ) {
      return
    }
    const path = typeof message.path === 'string' ? message.path : ''
    const text = typeof message.text === 'string' ? message.text : ''
    if (!path) return
    if (message.type === 'save') {
      void saveInlineEdit(path, text)
      return
    }
    if (message.type !== 'selection') return
    const document = selectedDocumentRef.current
    selectedPathRef.current = path
    selectedTextRef.current = text
    setSelectedPath(path)
    setSelectedText(text)
    void syncAssistantContext(document, path, text)
  }

  async function refresh(documentId = selectedDocumentIdRef.current, force = false) {
    if (!force && refreshInFlightRef.current && refreshTargetRef.current === documentId) {
      return refreshInFlightRef.current
    }
    const sequence = ++refreshSequenceRef.current
    refreshTargetRef.current = documentId
    const task = (async () => {
      setOperation('loading')
      setStatus(documentId ? '正在更新文件预览…' : '正在加载文件列表…')
      setStatusKind('info')
      try {
        const response = await requestData({
          parameters: documentId ? { documentId } : {}
        })
        if (sequence !== refreshSequenceRef.current) return
        const payload = getResponsePayload(response)
        if (isRecord(payload)) {
          applyWorkbenchData(payload as WorkbenchData)
        }
        setStatus('')
      } catch (error) {
        if (sequence === refreshSequenceRef.current) {
          showError(error)
        }
      } finally {
        if (sequence === refreshSequenceRef.current) {
          setOperation(null)
        }
      }
    })()
    refreshInFlightRef.current = task
    try {
      await task
    } finally {
      if (refreshInFlightRef.current === task) {
        refreshInFlightRef.current = null
        refreshTargetRef.current = ''
      }
    }
  }

  async function selectDocument(documentId: string) {
    const document = documents.find((item) => item.id === documentId)
    setCurrentDocumentId(documentId)
    selectedDocumentRef.current = document
    clearSelectedElement(false)
    void syncAssistantContext(document)
    await refresh(documentId, true)
  }

  function openCreateDialog() {
    setCreateFormat('docx')
    setCreateTitle(DEFAULT_TITLES.docx)
    setCreateOpen(true)
  }

  function changeCreateFormat(format: OfficeFormat) {
    const previousDefault = DEFAULT_TITLES[createFormat]
    setCreateFormat(format)
    if (!createTitle.trim() || createTitle === previousDefault) {
      setCreateTitle(DEFAULT_TITLES[format])
    }
  }

  async function createDocument(event: React.FormEvent) {
    event.preventDefault()
    const title = createTitle.trim()
    if (!title) {
      setStatus('请输入文件名称。')
      setStatusKind('error')
      return
    }
    setCreateOpen(false)
    setOperation('creating')
    setStatus('正在创建原生 Office 文件。首次使用需要准备 OfficeCLI 运行环境，请稍候…')
    setStatusKind('info')
    try {
      const response = await executeAction('create_document', null, {
        format: createFormat,
        title
      })
      const payload = getResponsePayload(response)
      assertSuccessfulAction(payload)
      const documentId = readDocumentId(payload)
      if (!documentId) {
        throw new Error('文件已创建，但没有返回文件标识。')
      }
      setCurrentDocumentId(documentId)
      notify('success', '文件创建成功')
      await refresh(documentId, true)
    } catch (error) {
      showError(error)
    } finally {
      setOperation(null)
    }
  }

  async function importDocument(file: File) {
    setOperation('importing')
    setStatus(`正在上传并处理“${file.name}”…`)
    setStatusKind('info')
    try {
      const response = await executeFileAction('import_document', file, { name: file.name })
      const payload = getResponsePayload(response)
      assertSuccessfulAction(payload)
      const documentId = readDocumentId(payload)
      if (!documentId) {
        throw new Error('文件已上传，但没有返回文件标识。')
      }
      setCurrentDocumentId(documentId)
      notify('success', '文件上传成功')
      await refresh(documentId, true)
    } catch (error) {
      showError(error)
    } finally {
      setOperation(null)
      if (uploadRef.current) uploadRef.current.value = ''
    }
  }

  async function downloadCurrent() {
    const documentId = selectedDocumentIdRef.current
    if (!documentId) return
    setOperation('downloading')
    setStatus('正在准备下载文件…')
    setStatusKind('info')
    try {
      const response = await executeAction('get_file', documentId, { documentId })
      const payload = getResponsePayload(response)
      assertSuccessfulAction(payload)
      const fileUrl = findString(payload, 'fileUrl')
      if (!fileUrl) throw new Error('当前文件没有可用的下载地址。')
      window.open(fileUrl, '_blank', 'noopener,noreferrer')
      setStatus('')
    } catch (error) {
      showError(error)
    } finally {
      setOperation(null)
    }
  }

  async function saveInlineEdit(path: string, value: string) {
    const document = selectedDocumentRef.current
    const documentId = selectedDocumentIdRef.current
    if (!documentId || !document || !path) {
      showError(new Error('请先在预览中选择需要修改的内容。'))
      sendPreviewSaveResult(false, '没有找到需要修改的内容。')
      return
    }

    setOperation('editing')
    setStatus('正在保存修改…')
    setStatusKind('info')
    try {
      const propertyKey = contentProperty(normalizeFormat(document.format))
      const response = await executeAction('run_command', documentId, {
        documentId,
        command: 'set',
        args: [path, '--prop', `${propertyKey}=${value}`],
        expectedVersionNumber: document.currentVersionNumber,
        changeSummary: `手动修改 ${path}`
      })
      assertSuccessfulAction(getResponsePayload(response))
      selectedPathRef.current = path
      selectedTextRef.current = value
      setSelectedPath(path)
      setSelectedText(value)
      sendPreviewSaveResult(true, '保存成功')
      notify('success', '修改已保存')
      await refresh(documentId, true)
      setStatus('')
    } catch (error) {
      sendPreviewSaveResult(false, error instanceof Error ? error.message : String(error))
      showError(error)
    } finally {
      setOperation(null)
    }
  }

  function sendPreviewSaveResult(success: boolean, message: string) {
    previewFrameRef.current?.contentWindow?.postMessage({
      channel: 'xpert.officecli.preview',
      type: 'save-result',
      success,
      message
    }, '*')
  }

  async function deleteDocument() {
    const document = deleteTarget
    const documentId = document?.id
    if (!documentId) return
    setDeleteTarget(null)
    setOperation('deleting')
    setStatus(`正在永久删除“${document.title || document.fileName || 'Office 文件'}”…`)
    setStatusKind('info')
    try {
      const response = await executeAction('delete_document', documentId, { documentId })
      assertSuccessfulAction(getResponsePayload(response))
      if (selectedDocumentIdRef.current === documentId) {
        setCurrentDocumentId('')
        selectedDocumentRef.current = undefined
        clearSelectedElement(false)
        setData((current) => ({ ...current, selected: undefined }))
      }
      notify('success', '文件已永久删除')
      await refresh(selectedDocumentIdRef.current, true)
      setStatus('')
    } catch (error) {
      showError(error)
    } finally {
      setOperation(null)
    }
  }

  function clearSelectedElement(syncContext = true) {
    selectedPathRef.current = ''
    selectedTextRef.current = ''
    setSelectedPath('')
    setSelectedText('')
    if (syncContext) {
      void syncAssistantContext(selectedDocumentRef.current)
    }
  }

  async function syncAssistantContext(document?: DocumentItem, elementPath?: string, elementText?: string) {
    if (!document?.id) return
    await invokeClientCommand('assistant.context.set', {
      key: 'office_cli_workbench',
      context: {
        documentId: document.id,
        title: document.title,
        fileName: document.fileName,
        format: document.format,
        versionNumber: document.currentVersionNumber,
        ...(elementPath ? { elementPath } : {}),
        ...(elementText ? { selectedText: elementText.slice(0, 500) } : {})
      }
    }).catch(() => undefined)
  }

  function showError(error: unknown) {
    const rawMessage = error instanceof Error ? error.message : String(error)
    const message = rawMessage.includes('timed out') || rawMessage.includes('超时') || rawMessage.includes('没有响应')
      ? 'OfficeCLI 预览在 45 秒内没有完成。已停止等待，请点击“刷新”重试；原文件和已保存修改不会丢失。'
      : rawMessage
    setStatus(message)
    setStatusKind('error')
    notify('error', message)
  }

  if (!hostContext) {
    return <div className="app"><div className="empty loading">正在连接 OfficeCLI 工作区…</div></div>
  }

  const currentPreviewHtml = selected?.document?.id === selectedDocumentId
    ? selected.preview?.html
    : undefined

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">O</div>
          <div>
            <h1>OfficeCLI 原生 Office</h1>
            <p>支持 Word、Excel 和 PowerPoint</p>
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => void refresh(selectedDocumentIdRef.current, true)} disabled={busy}>刷新</button>
          <button className="btn" onClick={() => uploadRef.current?.click()} disabled={busy}>上传文件</button>
          <button className="btn primary" onClick={openCreateDialog} disabled={busy}>新建文件</button>
          <input
            ref={uploadRef}
            hidden
            type="file"
            accept=".docx,.xlsx,.pptx"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importDocument(file)
            }}
          />
        </div>
      </header>

      {status ? <div className={`status ${statusKind}`}>{status}</div> : null}

      <main className="layout">
        <section className="panel document-panel">
          <div className="panel-head">
            <h2>文件</h2>
            <span className="hint">共 {documents.length} 个</span>
          </div>
          <div className="panel-body document-list">
            {documents.length ? documents.map((document) => (
              <div
                key={document.id}
                className={`document ${document.id === selectedDocumentId ? 'active' : ''}`}
              >
                <button
                  className="document-open"
                  onClick={() => document.id && void selectDocument(document.id)}
                  disabled={busy}
                >
                  <div className="document-title">{document.title || document.fileName}</div>
                  <div className="document-meta">
                    {formatLabel(document.format)} · 版本 {document.currentVersionNumber ?? 0}
                  </div>
                </button>
                <button
                  className="document-delete"
                  type="button"
                  title="永久删除文件"
                  aria-label={`永久删除${document.title || document.fileName || '文件'}`}
                  onClick={() => setDeleteTarget(document)}
                  disabled={busy}
                >
                  删除
                </button>
              </div>
            )) : (
              <div className="empty-list">
                <strong>还没有 Office 文件</strong>
                <span>请上传现有文件，或新建一个文件。</span>
              </div>
            )}
          </div>
        </section>

        <section className="panel preview-panel">
          <div className="panel-head">
            <div>
              <h2>{selected?.document?.title || '文件预览'}</h2>
              <div className="hint">
                {selected?.document?.fileName || '选择左侧文件后，可在这里预览并通过右侧 AI 进行编辑'}
              </div>
            </div>
            <button
              className="btn"
              onClick={() => void downloadCurrent()}
              disabled={!selectedDocumentId || busy}
            >
              下载文件
            </button>
          </div>
          <div className="preview-shell">
            {currentPreviewHtml ? (
              <iframe
                ref={previewFrameRef}
                className="preview-frame"
                title="OfficeCLI 原生 Office 文件预览"
                sandbox="allow-scripts"
                srcDoc={currentPreviewHtml}
              />
            ) : operation === 'loading' && selectedDocumentId ? (
              <div className="empty loading">正在使用 OfficeCLI 生成预览…</div>
            ) : (
              <div className="empty">
                <div>
                  <strong>{selected?.preview?.error ? '暂时无法生成预览' : '请选择一个 Office 文件'}</strong>
                  <p className={selected?.preview?.error ? 'error' : 'hint'}>
                    {selected?.preview?.error || '上传或新建文件后，可以直接在右侧告诉 AI 需要怎样修改。'}
                  </p>
                </div>
              </div>
            )}
            {operation === 'loading' && currentPreviewHtml ? (
              <div className="preview-loading-indicator">
                <span className="loading">正在更新预览…</span>
              </div>
            ) : null}
          </div>
          {currentPreviewHtml ? (
            <div className="selection-tip">
              {selectedPath
                ? `已选择：${selectedText.slice(0, 60) || selectedPath}。请在预览中的编辑框修改并保存。`
                : '点击预览中的文字、单元格或形状，可直接修改并保存。'}
            </div>
          ) : null}
        </section>
      </main>

      {createOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCreateOpen(false)}>
          <form className="modal" onSubmit={(event) => void createDocument(event)} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>新建 Office 文件</h2>
                <p>选择文件类型并输入名称。</p>
              </div>
              <button className="icon-button" type="button" aria-label="关闭" onClick={() => setCreateOpen(false)}>×</button>
            </div>
            <label className="field">
              <span>文件类型</span>
              <select value={createFormat} onChange={(event) => changeCreateFormat(event.target.value as OfficeFormat)}>
                <option value="docx">Word 文档（DOCX）</option>
                <option value="xlsx">Excel 工作簿（XLSX）</option>
                <option value="pptx">PowerPoint 演示文稿（PPTX）</option>
              </select>
            </label>
            <label className="field">
              <span>文件名称</span>
              <input
                autoFocus
                value={createTitle}
                maxLength={160}
                onChange={(event) => setCreateTitle(event.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button className="btn" type="button" onClick={() => setCreateOpen(false)}>取消</button>
              <button className="btn primary" type="submit">创建</button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDeleteTarget(null)}>
          <div className="modal delete-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>永久删除这个文件？</h2>
                <p>“{deleteTarget.title || deleteTarget.fileName}”及其历史版本将被删除，此操作无法撤销。</p>
              </div>
              <button className="icon-button" type="button" aria-label="关闭" onClick={() => setDeleteTarget(null)}>×</button>
            </div>
            <div className="modal-actions">
              <button className="btn" type="button" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="btn danger" type="button" onClick={() => void deleteDocument()}>永久删除</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function readSelectedDocumentId(payload: WorkbenchData) {
  return readDocumentId(payload.selected)
}

function readDocumentId(value: unknown): string {
  if (!isRecord(value)) return ''
  if (typeof value.documentId === 'string') return value.documentId
  if (isRecord(value.document) && typeof value.document.id === 'string') return value.document.id
  if (isRecord(value.selected)) return readDocumentId(value.selected)
  if (isRecord(value.data)) return readDocumentId(value.data)
  return ''
}

function findString(value: unknown, key: string): string {
  if (!isRecord(value)) return ''
  if (typeof value[key] === 'string') return value[key] as string
  for (const candidate of Object.values(value)) {
    const nested = findString(candidate, key)
    if (nested) return nested
  }
  return ''
}

function assertSuccessfulAction(value: unknown) {
  if (!isRecord(value) || value.success !== false) return
  const message = value.message
  if (typeof message === 'string') {
    throw new Error(message)
  }
  if (isRecord(message)) {
    const localized = message.zh_Hans ?? message.en_US
    if (typeof localized === 'string') {
      throw new Error(localized)
    }
  }
  throw new Error('OfficeCLI 操作失败。')
}

function formatLabel(format?: string) {
  if (format === 'docx') return 'Word'
  if (format === 'xlsx') return 'Excel'
  if (format === 'pptx') return 'PowerPoint'
  return String(format || 'Office').toUpperCase()
}

function normalizeFormat(format?: string): OfficeFormat {
  return format === 'xlsx' || format === 'pptx' ? format : 'docx'
}

function contentProperty(format: OfficeFormat) {
  return format === 'xlsx' ? 'value' : 'text'
}

createRoot(document.getElementById('root')!).render(<App />)
