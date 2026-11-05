;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  const h = React.createElement
  let instanceId = null
  let requestSequence = 0
  const pending = new Map()

  injectStyles()

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
  }

  function post(type, body, transfer) {
    if (!instanceId && type !== 'ready') return
    parent.postMessage(
      Object.assign(
        {
          channel: CHANNEL,
          protocolVersion: VERSION,
          instanceId,
          type
        },
        body || {}
      ),
      '*',
      transfer || []
    )
  }

  function request(type, body, transfer) {
    const requestId = String(++requestSequence)
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      post(type, Object.assign({ requestId }, body || {}), transfer)
      setTimeout(() => {
        if (!pending.has(requestId)) return
        pending.delete(requestId)
        reject(new Error('请求超时'))
      }, 30000)
    })
  }

  function reportResize() {
    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 600)
    post('resize', { height })
  }

  function executeAction(actionKey, targetId, input, parameters) {
    return request('executeAction', {
      actionKey,
      targetId,
      input,
      parameters
    })
  }

  function notify(level, message) {
    post('notify', { level, message })
  }

  function App() {
    const [context, setContext] = React.useState(null)
    const [view, setView] = React.useState('input')
    const [data, setData] = React.useState(null)
    const [draft, setDraft] = React.useState('')
    const [draftTitle, setDraftTitle] = React.useState('')
    const [selectedRecordId, setSelectedRecordId] = React.useState(null)
    const [search, setSearch] = React.useState('')
    const [busy, setBusy] = React.useState(false)
    const [processing, setProcessing] = React.useState(false)
    const [deleteTarget, setDeleteTarget] = React.useState(null)

    const selectedRecordIdRef = React.useRef(null)
    const dataRef = React.useRef(null)
    const busyRef = React.useRef(false)
    const viewRef = React.useRef('input')
    const pollTimerRef = React.useRef(null)

    React.useEffect(() => {
      window.__blogAiHelperSetContext = (nextContext) => {
        setContext(nextContext)
        setData(nextContext.payload || null)
        const initial = nextContext.payload || null
        if (initial && initial.item) {
          setSelectedRecordId(initial.item.id)
          setView('detail')
        }
        setTimeout(() => reload(null, nextContext), 0)
      }
      window.__blogAiHelperHandleHostEvent = () => {
        reload(null, null, { silent: true })
      }
      post('ready')
      return () => {
        window.__blogAiHelperSetContext = null
        window.__blogAiHelperHandleHostEvent = null
        stopPolling()
      }
    }, [])

    React.useEffect(() => {
      selectedRecordIdRef.current = selectedRecordId
    }, [selectedRecordId])

    React.useEffect(() => {
      dataRef.current = data
    }, [data])

    React.useEffect(() => {
      busyRef.current = busy
    }, [busy])

    React.useEffect(() => {
      viewRef.current = view
    }, [view])

    React.useEffect(() => {
      reportResize()
    }, [data, view, busy, processing])

    function stopPolling() {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }

    function schedulePolling(recordId) {
      stopPolling()
      pollTimerRef.current = setTimeout(async () => {
        const nextData = await reload(recordId, null, { silent: true })
        const item = nextData && nextData.item ? nextData.item : null
        if (item && (item.status === 'analyzing' || item.status === 'draft')) {
          schedulePolling(recordId)
        }
      }, 3000)
    }

    async function reload(nextRecordId, nextContext, options) {
      const silent = options && options.silent === true
      const activeContext = nextContext || context
      if (!activeContext) return null
      const recordId = nextRecordId === undefined ? selectedRecordIdRef.current : nextRecordId
      if (!silent) setBusy(true)
      try {
        const response = await request('requestData', {
          query: {
            page: 1,
            pageSize: 50,
            search,
            parameters: recordId ? { recordId } : {}
          }
        })
        const nextData = getResponsePayload(response) || null
        dataRef.current = nextData
        setData(nextData)
        if (recordId && nextData && nextData.item) {
          const status = nextData.item.status
          if (status === 'analyzing' || status === 'draft') {
            schedulePolling(recordId)
          } else {
            stopPolling()
            setProcessing(false)
          }
        } else if (!recordId) {
          stopPolling()
        }
        return nextData
      } catch (error) {
        if (!silent) notify('error', getErrorMessage(error))
        return null
      } finally {
        if (!silent) setBusy(false)
      }
    }

    async function dispatchCommand(command) {
      if (!command || !command.commandKey || !command.payload) {
        return false
      }
      try {
        const commandResponse = await withTimeout(
          request('invokeClientCommand', {
            commandKey: command.commandKey,
            payload: command.payload
          }),
          15000,
          'Assistant ChatKit 未响应，消息未发送。'
        )
        const commandResult = getResponsePayload(commandResponse)
        if (commandResult && commandResult.success === false) {
          throw new Error(commandResult.message || 'Assistant ChatKit 发送失败')
        }
        return true
      } catch (error) {
        notify('error', getErrorMessage(error))
        return false
      }
    }

    async function handleProcessArticle() {
      const content = draft.trim()
      if (!content) {
        notify('error', '文章内容不能为空，请先粘贴文章草稿。')
        return
      }
      if (processing) return
      setProcessing(true)
      setBusy(true)
      try {
        const response = await executeAction('process_article', null, {
          content,
          title: draftTitle.trim() || undefined
        })
        const result = getResponsePayload(response)
        if (!response || response.success === false) {
          throw new Error(resolveMessage(response ? response.message : null) || '文章处理启动失败')
        }
        const recordId = result && result.recordId ? result.recordId : null
        if (result && result.commandKey) {
          const dispatched = await dispatchCommand({
            commandKey: result.commandKey,
            payload: result.payload
          })
          if (!dispatched && recordId) {
            notify('warning', '消息已准备好但发送失败，可点击「重新生成」重试。')
          }
        }
        if (recordId) {
          setSelectedRecordId(recordId)
          setView('detail')
          schedulePolling(recordId)
          reload(recordId, null, { silent: true })
        }
      } catch (error) {
        notify('error', getErrorMessage(error))
        setProcessing(false)
      } finally {
        setBusy(false)
      }
    }

    async function handleRegenerate(recordId) {
      if (!recordId || processing) return
      setProcessing(true)
      setBusy(true)
      try {
        const response = await executeAction('regenerate_article', recordId)
        if (!response || response.success === false) {
          throw new Error(resolveMessage(response ? response.message : null) || '重新生成失败')
        }
        const result = getResponsePayload(response)
        const dispatched = await dispatchCommand({
          commandKey: result.commandKey,
          payload: result.payload
        })
        if (!dispatched) {
          notify('warning', '消息已准备好但发送失败，请重试。')
        }
        schedulePolling(recordId)
        reload(recordId, null, { silent: true })
      } catch (error) {
        notify('error', getErrorMessage(error))
        setProcessing(false)
      } finally {
        setBusy(false)
      }
    }

    async function handleConfirm(recordId) {
      if (!recordId || busyRef.current) return
      setBusy(true)
      try {
        const response = await executeAction('confirm_record', recordId)
        if (!response || response.success === false) {
          throw new Error(resolveMessage(response ? response.message : null) || '保存失败')
        }
        notify('success', resolveMessage(response.message) || '结果已保存')
        reload(recordId, null, { silent: true })
      } catch (error) {
        notify('error', getErrorMessage(error))
      } finally {
        setBusy(false)
      }
    }

    async function handleDelete(recordId) {
      if (!recordId) return
      setDeleteTarget(recordId)
    }

    async function confirmDelete(recordId) {
      setDeleteTarget(null)
      setBusy(true)
      try {
        const response = await executeAction('delete_record', recordId)
        if (!response || response.success === false) {
          throw new Error(resolveMessage(response ? response.message : null) || '删除失败')
        }
        notify('success', resolveMessage(response.message) || '记录已删除')
        setSelectedRecordId(null)
        setView('input')
        reload(null, null, { silent: true })
      } catch (error) {
        notify('error', getErrorMessage(error))
      } finally {
        setBusy(false)
      }
    }

    async function handleSearch(nextSearch) {
      setSearch(nextSearch)
      const nextData = await reload(null, null, { silent: true })
      return nextData
    }

    function openRecord(recordId) {
      setSelectedRecordId(recordId)
      setView('detail')
      reload(recordId, null, { silent: true })
    }

    const currentItem = data && data.item ? data.item : null
    const listItems = data && Array.isArray(data.items) ? data.items : []

    return h(
      'div',
      { className: 'blog-app' },
      h(Header, {
        view,
        onViewChange: (nextView) => {
          if (nextView === 'input') {
            setSelectedRecordId(null)
          }
          setView(nextView)
          reload(null, null, { silent: true })
        },
        busy: busy || processing
      }),
      view === 'input'
        ? h(InputPage, {
            draft,
            draftTitle,
            onDraftChange: setDraft,
            onTitleChange: setDraftTitle,
            onProcess: handleProcessArticle,
            processing: processing || busy
          })
        : view === 'history'
          ? h(HistoryPage, {
              items: listItems,
              total: data && typeof data.total === 'number' ? data.total : listItems.length,
              search,
              onSearch: handleSearch,
              onOpen: openRecord,
              busy: busy
            })
          : h(
              'div',
              { className: 'blog-page' },
              currentItem
                ? h(DetailPage, {
                    record: currentItem,
                    processing: processing,
                    onBack: () => {
                      setSelectedRecordId(null)
                      setView('history')
                      reload(null, null, { silent: true })
                    },
                    onRegenerate: () => handleRegenerate(currentItem.id),
                    onConfirm: () => handleConfirm(currentItem.id),
                    onDelete: () => handleDelete(currentItem.id)
                  })
                : h(EmptyState, {
                    title: '记录不存在或已被删除',
                    hint: '返回历史记录查看其他文章。',
                    actionLabel: '返回历史记录',
                    onAction: () => {
                      setSelectedRecordId(null)
                      setView('history')
                      reload(null, null, { silent: true })
                    }
                  })
            ),
      deleteTarget
        ? h(ConfirmDialog, {
            title: '删除文章处理记录',
            description: '确定删除这条文章处理记录吗？删除后不可恢复。',
            confirmLabel: '确认删除',
            cancelLabel: '取消',
            onCancel: () => setDeleteTarget(null),
            onConfirm: () => confirmDelete(deleteTarget)
          })
        : null
    )
  }

  function Header(props) {
    const tabs = [
      { key: 'input', label: '新建文章' },
      { key: 'history', label: '历史记录' }
    ]
    return h(
      'header',
      { className: 'blog-header' },
      h(
        'div',
        { className: 'blog-header-title-block' },
        h('div', { className: 'blog-eyebrow' }, 'BLOG ARTICLE AI HELPER'),
        h('h2', null, '博客文章AI智能助手'),
        h(
          'p',
          null,
          '粘贴文章草稿，AI 生成摘要、标签和标题建议；审核确认后保存，历史记录随时可查。'
        )
      ),
      h(
        'div',
        { className: 'blog-header-right' },
        h(
          'nav',
          { className: 'blog-tabs' },
          tabs.map((tab) =>
            h(
              'button',
              {
                key: tab.key,
                className: 'blog-tab' + (props.view === tab.key ? ' blog-tab-active' : ''),
                onClick: () => props.onViewChange(tab.key)
              },
              tab.label
            )
          )
        )
      )
    )
  }

  function InputPage(props) {
    return h(
      'div',
      { className: 'blog-page' },
      h(
        'div',
        { className: 'blog-panel blog-input-panel' },
        h(
          'div',
          { className: 'blog-panel-head' },
          h('div', null, h('div', { className: 'blog-panel-title' }, '新建文章'),
            h('div', { className: 'blog-panel-subtitle' }, '粘贴你的博客文章草稿，一键交给 AI 智能处理。'))
        ),
        h(
          'label',
          { className: 'blog-field-label' },
          '文章标题（可选）'
        ),
        h('input', {
          className: 'blog-input',
          type: 'text',
          placeholder: '输入文章标题，留空则由 AI 根据内容建议',
          value: props.draftTitle,
          onChange: (event) => props.onTitleChange(event.target.value)
        }),
        h('label', { className: 'blog-field-label' }, '文章草稿'),
        h('textarea', {
          className: 'blog-textarea',
          rows: 12,
          placeholder: '在此粘贴博客文章草稿…\n\nAI 将为你生成：\n• 2-3 句核心摘要\n• 3-6 个中文标签\n• 3-5 个备选标题',
          value: props.draft,
          onChange: (event) => props.onDraftChange(event.target.value)
        }),
        props.draft && !props.draft.trim()
          ? h('div', { className: 'blog-hint-error' }, '文章内容不能为空。')
          : null,
        h(
          'div',
          { className: 'blog-actions-row' },
          h(
            'button',
            {
              className: 'blog-btn blog-btn-primary',
              disabled: props.processing || !props.draft || !props.draft.trim(),
              onClick: props.onProcess
            },
            props.processing ? 'AI 处理中…' : '一键智能处理'
          )
        ),
        props.processing
          ? h(
              'div',
              { className: 'blog-processing-banner' },
              'AI 正在分析文章，生成摘要、标签和标题建议，请稍候…'
            )
          : null
      )
    )
  }

  function HistoryPage(props) {
    return h(
      'div',
      { className: 'blog-page' },
      h(
        'div',
        { className: 'blog-panel' },
        h(
          'div',
          { className: 'blog-panel-head blog-panel-head-wrap' },
          h('div', null,
            h('div', { className: 'blog-panel-title' }, '历史记录'),
            h('div', { className: 'blog-panel-subtitle' }, `共 ${props.total} 条已处理文章记录`)),
          h('input', {
            className: 'blog-input blog-search',
            type: 'text',
            placeholder: '搜索文章标题…',
            value: props.search,
            onChange: (event) => props.onSearch(event.target.value)
          })
        ),
        props.busy && props.items.length === 0
          ? h('div', { className: 'blog-empty' }, '加载中…')
          : props.items.length === 0
            ? h(
                'div',
                { className: 'blog-empty' },
                '还没有文章处理记录。',
                h(
                  'button',
                  { className: 'blog-btn blog-btn-ghost', onClick: () => {} },
                  '去新建一篇文章'
                )
              )
            : h(
                'div',
                { className: 'blog-record-list' },
                props.items.map((item) => h(RecordRow, { key: item.id, item, onOpen: props.onOpen }))
              )
      )
    )
  }

  function RecordRow(props) {
    const item = props.item
    const statusMeta = getStatusMeta(item.status)
    return h(
      'button',
      { className: 'blog-record-row', onClick: () => props.onOpen(item.id) },
      h(
        'div',
        { className: 'blog-record-main' },
        h('div', { className: 'blog-record-title' }, item.title || '未命名文章'),
        h('div', { className: 'blog-record-meta' },
          h('span', { className: 'blog-status ' + statusMeta.className }, statusMeta.label),
          item.summary
            ? h('span', { className: 'blog-record-summary' }, truncate(item.summary, 60))
            : h('span', { className: 'blog-record-summary' }, truncate(item.content || '', 60))
        )
      ),
      h('div', { className: 'blog-record-time' }, formatDate(item.createdAt))
    )
  }

  function DetailPage(props) {
    const record = props.record
    const statusMeta = getStatusMeta(record.status)
    const isProcessing = record.status === 'analyzing' || record.status === 'draft' || props.processing

    return h(
      'div',
      { className: 'blog-page' },
      h(
        'div',
        { className: 'blog-detail-toolbar' },
        h(
          'button',
          { className: 'blog-btn blog-btn-ghost', onClick: props.onBack },
          '← 返回历史记录'
        ),
        h('span', { className: 'blog-status ' + statusMeta.className }, statusMeta.label)
      ),
      record.status === 'failed'
        ? h(
            'div',
            { className: 'blog-panel blog-failed-panel' },
            h('div', { className: 'blog-panel-title' }, 'AI 处理失败'),
            h('div', { className: 'blog-error-message' }, record.errorMessage || '未知错误'),
            h(
              'div',
              { className: 'blog-actions-row' },
              h(
                'button',
                { className: 'blog-btn blog-btn-primary', onClick: props.onRegenerate, disabled: props.processing },
                props.processing ? '重新生成中…' : '重新生成'
              )
            )
          )
        : isProcessing
          ? h(
              'div',
              { className: 'blog-panel' },
              h('div', { className: 'blog-panel-title' }, 'AI 正在处理文章…'),
              h(
                'div',
                { className: 'blog-processing-banner' },
                '正在生成摘要、标签和标题建议，页面会自动刷新结果，请稍候。'
              )
            )
          : h(
              'div',
              { className: 'blog-result-grid' },
              h(
                'div',
                { className: 'blog-panel' },
                h('div', { className: 'blog-panel-title' }, 'AI 摘要'),
                h('p', { className: 'blog-summary' }, record.summary || '（暂无摘要）')
              ),
              h(
                'div',
                { className: 'blog-panel' },
                h('div', { className: 'blog-panel-title' }, '标签'),
                record.tags && record.tags.length > 0
                  ? h(
                      'div',
                      { className: 'blog-tags' },
                      record.tags.map((tag) => h('span', { key: tag, className: 'blog-tag' }, tag))
                    )
                  : h('p', { className: 'blog-muted' }, '（暂无标签）')
              ),
              h(
                'div',
                { className: 'blog-panel' },
                h('div', { className: 'blog-panel-title' }, '备选标题'),
                record.titleSuggestions && record.titleSuggestions.length > 0
                  ? h(
                      'ul',
                      { className: 'blog-title-list' },
                      record.titleSuggestions.map((title) => h('li', { key: title }, title))
                    )
                  : h('p', { className: 'blog-muted' }, '（暂无标题建议）')
              ),
              h(
                'div',
                { className: 'blog-panel' },
                h('div', { className: 'blog-panel-title' }, '原文'),
                h('pre', { className: 'blog-content-preview' }, truncate(record.content || '', 600))
              ),
              h(
                'div',
                { className: 'blog-panel blog-actions-panel' },
                h(
                  'div',
                  { className: 'blog-actions-row' },
                  h(
                    'button',
                    { className: 'blog-btn blog-btn-ghost', onClick: props.onRegenerate, disabled: props.processing },
                    props.processing ? '重新生成中…' : '重新生成'
                  ),
                  h(
                    'button',
                    { className: 'blog-btn blog-btn-primary', onClick: props.onConfirm, disabled: props.processing || record.status === 'saved' },
                    record.status === 'saved' ? '已保存' : '保存结果'
                  ),
                  h(
                    'button',
                    { className: 'blog-btn blog-btn-danger', onClick: props.onDelete, disabled: props.processing },
                    '删除'
                  )
                ),
                record.status === 'saved'
                  ? h('div', { className: 'blog-saved-hint' }, '✓ 该结果已保存到历史记录')
                  : h(
                      'div',
                      { className: 'blog-muted' },
                      '确认无误后点击「保存结果」，记录将进入历史列表。'
                    )
              )
            )
    )
  }

  function EmptyState(props) {
    return h(
      'div',
      { className: 'blog-empty' },
      props.title,
      h('p', { className: 'blog-muted' }, props.hint),
      h(
        'button',
        { className: 'blog-btn blog-btn-primary', onClick: props.onAction },
        props.actionLabel
      )
    )
  }

  function ConfirmDialog(props) {
    return h(
      'div',
      { className: 'blog-dialog-backdrop' },
      h(
        'div',
        { className: 'blog-dialog', role: 'dialog', 'aria-modal': 'true' },
        h('div', { className: 'blog-dialog-title' }, props.title),
        h('div', { className: 'blog-dialog-description' }, props.description),
        h(
          'div',
          { className: 'blog-dialog-actions' },
          h(
            'button',
            { className: 'blog-btn', onClick: props.onCancel },
            props.cancelLabel
          ),
          h(
            'button',
            { className: 'blog-btn blog-btn-danger', onClick: props.onConfirm },
            props.confirmLabel
          )
        )
      )
    )
  }

  function getResponsePayload(response) {
    if (!response || typeof response !== 'object') return null
    if (response.data !== undefined) return response.data
    if (response.result !== undefined) return response.result
    if (response.payload !== undefined) return response.payload
    return response
  }

  function resolveMessage(message) {
    if (!message) return ''
    if (typeof message === 'string') return message
    return message.zh_Hans || message.en_US || ''
  }

  function getErrorMessage(error) {
    return error && error.message ? error.message : '操作失败'
  }

  function withTimeout(promise, timeoutMs, message) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      promise.then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (error) => {
          clearTimeout(timer)
          reject(error)
        }
      )
    })
  }

  function truncate(value, max) {
    if (!value) return ''
    return value.length > max ? value.slice(0, max) + '…' : value
  }

  function formatDate(value) {
    if (!value) return ''
    const date = new Date(value)
    if (isNaN(date.getTime())) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  function getStatusMeta(status) {
    switch (status) {
      case 'analyzing':
        return { label: 'AI 处理中', className: 'blog-status-analyzing' }
      case 'reviewing':
        return { label: '待确认', className: 'blog-status-reviewing' }
      case 'saved':
        return { label: '已保存', className: 'blog-status-saved' }
      case 'failed':
        return { label: '处理失败', className: 'blog-status-failed' }
      default:
        return { label: '草稿', className: 'blog-status-draft' }
    }
  }

  function injectStyles() {
    const style = document.createElement('style')
    style.textContent = `
.blog-app { display: grid; grid-auto-rows: max-content; align-content: start; gap: 12px; min-height: 600px; padding: 10px; color: var(--xui-color-foreground); background: linear-gradient(180deg, color-mix(in srgb, var(--xui-color-muted) 58%, var(--xui-color-background) 42%), var(--xui-color-background)); font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
.blog-header { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin: -10px -10px 0; border-bottom: 1px solid var(--xui-color-border); background: color-mix(in srgb, var(--xui-color-card) 96%, var(--xui-color-background) 4%); padding: 14px 16px; }
.blog-header-title-block { display: grid; gap: 4px; min-width: 0; }
.blog-eyebrow { color: var(--xui-color-muted-foreground); font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
.blog-header h2 { margin: 0; font-size: 20px; line-height: 1.2; }
.blog-header p { margin: 0; color: var(--xui-color-muted-foreground); font-size: 12px; line-height: 1.45; }
.blog-header-right { display: flex; align-items: center; }
.blog-tabs { display: flex; gap: 4px; padding: 3px; border-radius: 8px; background: var(--xui-color-muted); }
.blog-tab { border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--xui-color-muted-foreground); font-size: 13px; font-weight: 600; padding: 6px 14px; cursor: pointer; }
.blog-tab:hover { color: var(--xui-color-foreground); }
.blog-tab-active { background: var(--xui-color-card); color: var(--xui-color-foreground); border-color: var(--xui-color-border); box-shadow: 0 1px 2px color-mix(in srgb, var(--xui-color-foreground) 8%, transparent); }
.blog-page { display: grid; align-content: start; gap: 12px; }
.blog-panel { border: 1px solid var(--xui-color-border); border-radius: 10px; background: var(--xui-color-card); padding: 16px; box-shadow: 0 10px 24px color-mix(in srgb, var(--xui-color-foreground) 4%, transparent); }
.blog-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.blog-panel-head-wrap { flex-wrap: wrap; }
.blog-panel-title { color: var(--xui-color-foreground); font-size: 14px; font-weight: 800; }
.blog-panel-subtitle { color: var(--xui-color-muted-foreground); font-size: 12px; line-height: 1.45; margin-top: 2px; }
.blog-field-label { display: block; color: var(--xui-color-foreground); font-size: 12px; font-weight: 700; margin: 10px 0 6px; }
.blog-input, .blog-textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-background); color: var(--xui-color-foreground); padding: 10px 12px; font-size: 13px; line-height: 1.5; outline: none; }
.blog-input:focus, .blog-textarea:focus { border-color: var(--xui-color-ring); box-shadow: 0 0 0 2px color-mix(in srgb, var(--xui-color-ring) 22%, transparent); }
.blog-input::placeholder, .blog-textarea::placeholder { color: var(--xui-color-muted-foreground); opacity: 0.75; }
.blog-textarea { resize: vertical; min-height: 200px; font-family: inherit; }
.blog-search { max-width: 260px; }
.blog-actions-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 14px; }
.blog-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-card); color: var(--xui-color-foreground); font-size: 13px; font-weight: 700; padding: 8px 16px; cursor: pointer; }
.blog-btn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--xui-color-primary) 42%, var(--xui-color-border)); }
.blog-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.blog-btn-primary { background: var(--xui-color-primary); border-color: var(--xui-color-primary); color: var(--xui-color-primary-foreground, #fff); }
.blog-btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
.blog-btn-ghost { background: transparent; }
.blog-btn-danger { color: var(--xui-color-destructive); border-color: color-mix(in srgb, var(--xui-color-destructive) 32%, var(--xui-color-border)); background: transparent; }
.blog-btn-danger:hover:not(:disabled) { background: var(--xui-color-destructive-background); border-color: color-mix(in srgb, var(--xui-color-destructive) 46%, var(--xui-color-border)); }
.blog-hint-error { color: var(--xui-color-destructive); font-size: 12px; margin-top: 6px; }
.blog-processing-banner { display: flex; align-items: center; gap: 8px; margin-top: 12px; border: 1px dashed color-mix(in srgb, var(--xui-color-primary) 38%, var(--xui-color-border)); border-radius: 8px; background: color-mix(in srgb, var(--xui-color-primary) 6%, var(--xui-color-card)); color: var(--xui-color-primary); font-size: 12px; padding: 10px 12px; }
.blog-record-list { display: grid; gap: 8px; }
.blog-record-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; text-align: left; border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-card); padding: 12px 14px; cursor: pointer; color: inherit; }
.blog-record-row:hover { border-color: color-mix(in srgb, var(--xui-color-primary) 40%, var(--xui-color-border)); }
.blog-record-main { display: grid; gap: 4px; min-width: 0; }
.blog-record-title { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.blog-record-meta { display: flex; align-items: center; gap: 8px; }
.blog-record-summary { color: var(--xui-color-muted-foreground); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.blog-record-time { color: var(--xui-color-muted-foreground); font-size: 11px; white-space: nowrap; }
.blog-status { display: inline-flex; align-items: center; border-radius: 999px; font-size: 11px; font-weight: 700; padding: 2px 8px; white-space: nowrap; }
.blog-status-analyzing { background: color-mix(in srgb, var(--xui-color-primary) 14%, transparent); color: var(--xui-color-primary); }
.blog-status-reviewing { background: color-mix(in srgb, #d97706 14%, transparent); color: #d97706; }
.blog-status-saved { background: color-mix(in srgb, #059669 14%, transparent); color: #059669; }
.blog-status-failed { background: color-mix(in srgb, var(--xui-color-destructive) 14%, transparent); color: var(--xui-color-destructive); }
.blog-status-draft { background: var(--xui-color-muted); color: var(--xui-color-muted-foreground); }
.blog-empty { display: grid; place-items: center; gap: 8px; border: 1px dashed var(--xui-color-border); border-radius: 10px; color: var(--xui-color-muted-foreground); font-size: 13px; padding: 40px 16px; text-align: center; }
.blog-muted { color: var(--xui-color-muted-foreground); font-size: 12px; line-height: 1.5; }
.blog-summary { color: var(--xui-color-foreground); font-size: 13px; line-height: 1.65; margin: 0; white-space: pre-wrap; }
.blog-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.blog-tag { border-radius: 999px; background: color-mix(in srgb, var(--xui-color-primary) 12%, var(--xui-color-card)); border: 1px solid color-mix(in srgb, var(--xui-color-primary) 26%, var(--xui-color-border)); color: var(--xui-color-primary); font-size: 12px; font-weight: 600; padding: 3px 10px; }
.blog-title-list { margin: 0; padding-left: 18px; display: grid; gap: 6px; color: var(--xui-color-foreground); font-size: 13px; line-height: 1.5; }
.blog-content-preview { margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--xui-color-muted-foreground); font-size: 12px; line-height: 1.6; max-height: 220px; overflow: auto; }
.blog-result-grid { display: grid; gap: 12px; }
.blog-actions-panel { display: grid; gap: 6px; }
.blog-saved-hint { color: #059669; font-size: 12px; font-weight: 600; margin-top: 8px; }
.blog-detail-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.blog-failed-panel { display: grid; gap: 6px; }
.blog-error-message { color: var(--xui-color-destructive); font-size: 13px; line-height: 1.5; }
.blog-dialog-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: color-mix(in srgb, #0b1220 48%, transparent); }
.blog-dialog { width: min(400px, calc(100% - 32px)); border: 1px solid var(--xui-color-border); border-radius: 12px; background: var(--xui-color-card); padding: 20px; box-shadow: 0 20px 48px color-mix(in srgb, #0b1220 36%, transparent); }
.blog-dialog-title { color: var(--xui-color-foreground); font-size: 15px; font-weight: 800; }
.blog-dialog-description { color: var(--xui-color-muted-foreground); font-size: 13px; line-height: 1.55; margin-top: 8px; }
.blog-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
`
    document.head.appendChild(style)
  }

  ReactDOM.createRoot(document.getElementById('root')).render(h(App))
})()
