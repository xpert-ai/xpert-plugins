;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  const VIEW_KEY = 'relnote_release_review_workbench'
  const h = React.createElement
  let instanceId = null
  let requestSequence = 0
  const pending = new Map()

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
  }

  function post(type, body, transfer) {
    if (!instanceId && type !== 'ready') return
    parent.postMessage(
      Object.assign({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type }, body || {}),
      '*',
      transfer || []
    )
  }

  function request(type, body, transfer) {
    const requestId = String(++requestSequence)
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      try {
        post(type, Object.assign({ requestId }, body || {}), transfer)
      } catch (error) {
        pending.delete(requestId)
        reject(error)
      }
    })
  }

  function reportResize() {
    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 620)
    post('resize', { height, viewportBound: true })
  }

  function resolveText(value, fallback) {
    if (typeof value === 'string') return value
    if (value && typeof value === 'object') return value.zh_Hans || value.en_US || fallback
    return fallback
  }

  function releaseTitle(item) {
    return `${item.deviceModel || '未知机型'} · ${item.version || '未填写版本'}`
  }

  function App() {
    const [context, setContext] = React.useState(null)
    const [data, setData] = React.useState({ items: [], total: 0, summary: {}, meta: {} })
    const [loading, setLoading] = React.useState(false)
    const [busy, setBusy] = React.useState('')
    const [notice, setNotice] = React.useState(null)
    const [selectedId, setSelectedId] = React.useState('')
    const [form, setForm] = React.useState({ deviceModel: '', version: '', changesRaw: '' })

    const loadData = React.useCallback(async () => {
      if (!instanceId) return
      setLoading(true)
      try {
        const response = await request('requestData', { viewKey: VIEW_KEY, query: {} })
        const next = response.data || {}
        setData({ items: next.items || [], total: next.total || 0, summary: next.summary || {}, meta: next.meta || {} })
        setSelectedId((current) => current || (next.items && next.items[0] && next.items[0].id) || '')
      } catch (error) {
        setNotice({ type: 'error', message: error.message || '加载发布单失败。' })
      } finally {
        setLoading(false)
      }
    }, [])

    window.__relnoteSetContext = setContext
    window.__relnoteReload = loadData

    React.useEffect(() => {
      if (context) loadData()
    }, [context, loadData])

    React.useEffect(() => {
      reportResize()
    }, [context, data, loading, busy, notice, selectedId])

    async function run(actionKey, input, targetId) {
      setBusy(actionKey)
      setNotice(null)
      try {
        const response = await request('executeAction', {
          actionKey,
          targetId,
          input: input || {},
          parameters: {}
        })
        const result = response.result || response
        if (result && result.success === false) {
          throw new Error(resolveText(result.message, '操作失败。'))
        }
        setNotice({ type: 'success', message: resolveText(result.message, '操作已完成。') })
        await loadData()
        return result
      } catch (error) {
        setNotice({ type: 'error', message: error.message || '操作失败。' })
        return null
      } finally {
        setBusy('')
      }
    }

    async function createDraft() {
      if (!form.deviceModel.trim() || !form.version.trim() || !form.changesRaw.trim()) {
        setNotice({ type: 'error', message: '请填写目标机型、版本号和至少一条变更条目。' })
        return
      }
      const result = await run('create_draft', {
        deviceModel: form.deviceModel.trim(),
        version: form.version.trim(),
        changesRaw: form.changesRaw.trim()
      })
      if (result) setForm({ deviceModel: '', version: '', changesRaw: '' })
    }

    async function requestAi(actionKey = 'request_ai') {
      if (!selectedId) {
        setNotice({ type: 'error', message: '请先选择一条发布单。' })
        return
      }
      const result = await run(actionKey, {}, selectedId)
      const promptText = result && result.data && result.data.promptText
      if (!promptText) return
      try {
        await request('invokeClientCommand', {
          commandKey: 'assistant.chat.send_message',
          payload: {
            text: promptText,
            clientMessageId: `relnote-workbench:${Date.now()}`,
            files: [], attachments: [], references: [], followUpMode: 'queue',
            state: { relnote: { source: 'workbench', releaseId: selectedId } }
          }
        })
      } catch (error) {
        setNotice({ type: 'error', message: error.message || '无法将生成请求发送到助手对话。' })
      }
    }

    if (!context) {
      return h('main', { className: 'relnote shell' }, h('p', { className: 'muted' }, '正在连接 OTA 发布说明审核台…'))
    }

    const releases = data.items || []
    const selected = releases.find((item) => item.id === selectedId) || null
    const readonly = selected && selected.status === 'confirmed'
    const aiRunning = selected && selected.status === 'ai_running'

    return h('main', { className: 'relnote shell' },
      h('header', { className: 'header' },
        h('div', null, h('h1', null, 'OTA 发布说明审核台'), h('p', { className: 'muted' }, 'AI 只生成待审核草案；工程师确认后才可归档。')),
        h('button', { className: 'button secondary', disabled: loading || !!busy, onClick: loadData }, loading ? '刷新中…' : '刷新')
      ),
      notice && h('div', { className: `notice ${notice.type}` }, notice.message),
      h('section', { className: 'new-release card' },
        h('h2', null, '新建发布单'),
        h('div', { className: 'form-grid' },
          field('目标机型', form.deviceModel, (value) => setForm({ ...form, deviceModel: value }), '例如：G7'),
          field('版本号', form.version, (value) => setForm({ ...form, version: value }), '例如：2026.09.20')
        ),
        h('label', null, '变更条目（每行一条）', h('textarea', { value: form.changesRaw, rows: 4, onChange: (event) => setForm({ ...form, changesRaw: event.target.value }), placeholder: '修复唤醒词误触发\n优化导航投屏帧率\n补充回滚方案' })),
        h('button', { className: 'button', disabled: !!busy, onClick: createDraft }, busy === 'create_draft' ? '创建中…' : '创建草稿')
      ),
      h('section', { className: 'workspace' },
        h('aside', { className: 'card list' },
          h('h2', null, `发布单列表（${data.total || 0}）`),
          loading ? h('p', { className: 'muted' }, '正在加载…') : releases.length
            ? h('ul', null, releases.map((item) => h('li', { key: item.id }, h('button', { className: item.id === selectedId ? 'release active' : 'release', onClick: () => setSelectedId(item.id) }, h('strong', null, releaseTitle(item)), h('span', { className: `status ${item.status || 'draft'}` }, item.status || 'draft')))))
            : h('div', { className: 'empty' }, h('h3', null, '暂无发布单'), h('p', null, '填写上方表单后创建第一条 OTA 发布草稿。'))
        ),
        h('section', { className: 'card detail' },
          selected
            ? h(ReleaseDetail, { key: `${selected.id}:${selected.revision}:${selected.status}`, release: selected, readonly, aiRunning, busy, onSaveDraft: (draft) => run('save_draft', { ...draft, expectedRevision: selected.revision ?? 0 }, selected.id), onRequestAi: () => requestAi(), onRetry: () => requestAi('retry_ai'), onConfirm: (review) => run('confirm_release', { expectedRevision: selected.revision ?? 0, ...review }, selected.id) })
            : h('div', { className: 'empty' }, h('h2', null, '选择一条发布单'), h('p', null, '创建或从左侧选择发布单后，可查看审核详情。'))
        )
      ),
      h('p', { className: 'footnote' }, '审核修改仅在确认归档时保存；刷新或切换发布单会丢弃未提交修改。归档不触发真实 OTA 发布。')
    )
  }

  function ReleaseDetail({ release, readonly, aiRunning, busy, onSaveDraft, onRequestAi, onRetry, onConfirm }) {
    const [draft, setDraft] = React.useState({ deviceModel: release.deviceModel || '', version: release.version || '', changesRaw: release.changesRaw || '' })
    const [draftError, setDraftError] = React.useState('')
    const draftEditable = release.status === 'draft'
    const draftDirty = draftEditable && ['deviceModel', 'version', 'changesRaw'].some(key => draft[key] !== (release[key] || ''))
    function updateDraft(key, value) { setDraft({ ...draft, [key]: value }); setDraftError('') }
    async function saveDraft() {
      if (!draft.deviceModel.trim() || !draft.version.trim() || !draft.changesRaw.trim()) {
        setDraftError('请填写目标机型、版本号和至少一条变更条目。')
        return
      }
      await onSaveDraft({ deviceModel: draft.deviceModel.trim(), version: draft.version.trim(), changesRaw: draft.changesRaw.trim() })
    }
    const [note, setNote] = React.useState(release.noteMarkdown || '')
    const [risks, setRisks] = React.useState(Array.isArray(release.risks) ? release.risks : [])
    const [checked, setChecked] = React.useState([])
    const [reviewed, setReviewed] = React.useState(false)
    const [rollout, setRollout] = React.useState(release.rollout || 'full')
    const editable = release.status === 'ai_done' && !busy
    const ready = editable && reviewed && note.trim() && risks.every((_, i) => checked.includes(i))
    function removeRisk(index) {
      setRisks(risks.filter((_, i) => i !== index)); setChecked([]); setReviewed(false)
    }
    return h(React.Fragment, null,
      h('div', { className: 'detail-header' }, h('div', null, h('h2', null, releaseTitle(release)), h('p', { className: 'muted' }, `状态：${release.status || 'draft'} · 修订版本：${release.revision ?? 0}`)), h('span', { className: `status ${release.status || 'draft'}` }, release.status || 'draft')),
      draftEditable ? h('fieldset', { disabled: !!busy },
        h('legend', null, '编辑草稿'),
        field('草稿目标机型', draft.deviceModel, value => updateDraft('deviceModel', value)),
        field('草稿版本号', draft.version, value => updateDraft('version', value)),
        h('label', null, '草稿变更条目（每行一条）', h('textarea', { rows: 5, value: draft.changesRaw, onChange: e => updateDraft('changesRaw', e.target.value) })),
        draftError && h('p', { className: 'notice error', role: 'alert' }, draftError),
        draftDirty && h('p', { className: 'muted' }, '草稿有未保存修改，请先保存再生成；刷新或切换发布单会丢弃修改。'),
        h('button', { className: 'button secondary', disabled: !!busy || !draftDirty, onClick: saveDraft }, busy === 'save_draft' ? '保存中…' : '保存草稿')
      ) : h(React.Fragment, null, h('h3', null, '变更条目'), h('pre', { className: 'changes' }, release.changesRaw || '暂无变更条目')),
      h('div', { className: 'actions' },
        h('button', { className: 'button', disabled: readonly || aiRunning || !!busy || draftDirty, onClick: onRequestAi }, aiRunning ? 'AI 生成中…' : '生成发布说明'),
        h('button', { className: 'button secondary', disabled: readonly || release.status !== 'ai_failed' || !!busy, onClick: onRetry }, '重试 AI'),
        h('button', { className: 'button secondary', disabled: !ready, onClick: () => onConfirm({ noteMarkdown: note, risks, rollout }) }, '确认归档')
      ),
      h('h3', null, '发布说明（人工审核）'), editable
        ? h('label', null, '编辑发布说明', h('textarea', { rows: 12, value: note, onChange: e => { setNote(e.target.value); setReviewed(false) } }))
        : h('div', { className: 'output' }, release.noteMarkdown || '尚未生成。'),
      h('label', null, '灰度建议（不执行发布）', h('select', { value: rollout, disabled: !editable, onChange: e => { setRollout(e.target.value); setReviewed(false) } }, h('option', { value: 'full' }, 'full · 全量建议'), h('option', { value: 'canary' }, 'canary · 灰度建议'))),
      h('h3', null, `风险清单（${risks.length}）`), risks.length ? h('ul', { className: 'risks' }, risks.map((risk, index) => h('li', { key: `${risk.category || 'risk'}-${index}` }, h('strong', null, `${risk.level || 'low'} · ${risk.category || 'other'}`), h('div', null, risk.item), h('small', null, `依据：${risk.evidence || '无'}`), h('small', null, `建议：${risk.suggestion || '无'}`), editable && h('label', null, h('input', { type: 'checkbox', checked: checked.includes(index), onChange: e => { setChecked(e.target.checked ? [...checked, index] : checked.filter(i => i !== index)); setReviewed(false) } }), '已审核此风险'), editable && h('button', { className: 'button secondary', onClick: () => removeRisk(index) }, '移除此风险（归档时生效）')))) : h('p', { className: 'muted' }, '暂无风险项。'),
      editable && h('label', null, h('input', { type: 'checkbox', checked: reviewed, onChange: e => setReviewed(e.target.checked) }), '我已核对发布说明、全部保留风险及灰度建议，确认仅归档，不发布 OTA'),
      h('h3', null, 'AI 运行记录'), (Array.isArray(release.runs) && release.runs.length) ? h('ul', { className: 'runs' }, release.runs.map((run) => h('li', { key: run.id || run.attempt }, `#${run.attempt || '?'} · ${run.status || 'unknown'}${run.errorMessage ? ` · ${run.errorMessage}` : ''}`))) : h('p', { className: 'muted' }, '暂无 AI 运行记录。')
    )
  }

  function field(label, value, onChange, placeholder) {
    return h('label', null, label, h('input', { value, onChange: (event) => onChange(event.target.value), placeholder }))
  }

  const style = document.createElement('style')
  style.textContent = `
    :root{color:#172033;background:#f8fafc;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.shell{max-width:1180px;margin:0 auto;padding:22px}.header,.detail-header,.actions{display:flex;align-items:center;justify-content:space-between;gap:12px}.header h1{margin:0;font-size:24px}.muted,.footnote{color:#64748b}.card{border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:18px;box-shadow:0 1px 2px #0f172a0a}.new-release{margin:16px 0}.form-grid,.workspace{display:grid;gap:16px}.form-grid{grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:12px}.workspace{grid-template-columns:minmax(230px,.72fr) minmax(0,1.6fr)}label{display:grid;gap:6px;font-size:14px;font-weight:600}input,textarea,select{box-sizing:border-box;width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:9px;font:inherit;font-weight:400}input[type=checkbox]{width:auto;justify-self:start}textarea{resize:vertical}.button{border:0;border-radius:8px;padding:9px 13px;background:#0f766e;color:#fff;font:inherit;cursor:pointer}.button.secondary{background:#e2e8f0;color:#172033}.button:disabled{cursor:not-allowed;opacity:.55}.list ul,.risks{padding:0;margin:0;list-style:none}.release{display:grid;width:100%;gap:5px;text-align:left;border:0;border-radius:8px;background:transparent;padding:10px;cursor:pointer}.release:hover,.release.active{background:#ecfdf5}.status{display:inline-flex;width:max-content;border-radius:999px;padding:2px 8px;font-size:12px;background:#e2e8f0;color:#334155}.status.ai_done{background:#dcfce7;color:#166534}.status.ai_failed{background:#fee2e2;color:#991b1b}.status.ai_running{background:#fef3c7;color:#92400e}.status.confirmed{background:#dbeafe;color:#1d4ed8}.changes,.output{white-space:pre-wrap;border-radius:8px;background:#f8fafc;padding:12px;font-family:inherit;line-height:1.55}.risks,.runs{display:grid;gap:8px;padding:0;list-style:none}.risks li,.runs li{display:grid;gap:3px;border-left:3px solid #f59e0b;background:#fffbeb;padding:9px}.risks small{color:#64748b}.empty{border:1px dashed #cbd5e1;border-radius:8px;padding:20px;text-align:center}.notice{border-radius:8px;padding:10px 12px;margin-bottom:12px}.notice.error{background:#fee2e2;color:#991b1b}.notice.success{background:#dcfce7;color:#166534}.footnote{font-size:13px;margin-top:16px}@media(max-width:760px){.workspace,.form-grid{grid-template-columns:1fr}.header,.detail-header{align-items:flex-start;flex-direction:column}}
  `
  document.head.appendChild(style)

  window.addEventListener('message', (event) => {
    const message = event.data
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return

    if (message.type === 'init') {
      instanceId = message.instanceId
      window.__relnoteSetContext && window.__relnoteSetContext({
        manifest: message.manifest,
        payload: message.payload,
        initialQuery: message.initialQuery || {},
        locale: message.locale,
        theme: message.theme
      })
      setTimeout(reportResize, 0)
      return
    }

    if (message.instanceId !== instanceId) return
    if (message.type === 'hostEvent') {
      window.__relnoteReload && window.__relnoteReload()
      return
    }
    if (message.requestId && pending.has(message.requestId)) {
      const item = pending.get(message.requestId)
      pending.delete(message.requestId)
      if (message.type === 'error') item.reject(new Error(message.message || '远程请求失败。'))
      else item.resolve(message)
    }
  })

  ReactDOM.createRoot(document.getElementById('root')).render(h(App))
  post('ready')
})()