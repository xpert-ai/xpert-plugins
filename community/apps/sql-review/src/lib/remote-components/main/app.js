/* SQL 质量审查工作台 — Remote Component (React UMD, no build step) */
;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  const h = React.createElement

  let instanceId = null
  let requestSequence = 0
  const pending = new Map()

  const STATUS_META = {
    draft: { label: '草稿', color: '#94a3b8' },
    pending_ai: { label: 'AI 审查中', color: '#f59e0b' },
    pending_confirmation: { label: '待人工确认', color: '#3b82f6' },
    confirmed: { label: '已通过', color: '#16a34a' },
    rejected: { label: '已驳回', color: '#dc2626' },
    failed: { label: '失败(可重试)', color: '#dc2626' }
  }
  const SEVERITY_META = {
    high: { label: '高危', color: '#dc2626' },
    medium: { label: '中', color: '#f59e0b' },
    low: { label: '低', color: '#64748b' }
  }
  const CATEGORY_LABELS = {
    index: '索引', scan: '扫描', spec: '规范', perf: '性能',
    injection: '注入', correctness: '正确性'
  }

  injectStyles()

  function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v) }

  function post(type, body) {
    if (!instanceId && type !== 'ready') return
    parent.postMessage(Object.assign({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type }, body || {}), '*')
  }

  function request(type, body) {
    const requestId = String(++requestSequence)
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      try { post(type, Object.assign({ requestId }, body || {})) }
      catch (e) { pending.delete(requestId); reject(e) }
    })
  }

  const requestData = (query) => request('requestData', { query: query || {} })
  const executeAction = (actionKey, input) => request('executeAction', { actionKey, targetId: null, input: input || {}, parameters: {} })
  const notify = (message, level) => post('notify', { message, level: level || 'success' })

  function reportResize() {
    const root = document.getElementById('root')
    post('resize', { height: Math.ceil(Math.max((root && root.scrollHeight) || 0, 420)) })
  }

  window.addEventListener('message', (event) => {
    const message = event.data
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return
    if (message.type === 'init') {
      instanceId = message.instanceId
      const initialQuery = message.initialQuery || {}
      App.render(initialQuery.parameters && initialQuery.parameters.caseNo)
      return
    }
    if (message.type === 'response' || message.type === 'error') {
      const entry = pending.get(message.requestId)
      if (!entry) return
      pending.delete(message.requestId)
      if (message.type === 'error') entry.reject(new Error(message.error || 'request failed'))
      else entry.resolve(message.result)
    }
  })

  post('ready')

  /* ---------------- App ---------------- */
  const App = {
    _root: null,
    _caseNo: null,
    _state: { loading: true, rows: [], snapshot: null, error: '', busy: false },

    render(caseNo) {
      this._caseNo = caseNo || null
      this._root = document.getElementById('root')
      this.load()
    },

    async load() {
      this._state.loading = true
      this._state.error = ''
      this.paint()
      try {
        if (this._caseNo) {
          const res = await requestData({ parameters: { caseNo: this._caseNo } })
          this._state.snapshot = (res && res.item) || null
          if (!this._state.snapshot) throw new Error('审查单不存在或无权访问')
        } else {
          const res = await requestData({ page: 1, pageSize: 20 })
          this._state.rows = (res && res.items) || []
        }
      } catch (e) {
        this._state.error = e.message || String(e)
      }
      this._state.loading = false
      this.paint()
    },

    async act(actionKey, input, okMessage) {
      this._state.busy = true
      this.paint()
      try {
        const res = await executeAction(actionKey, input)
        if (res && res.success === false) throw new Error((res.message && (res.message.zh_Hans || res.message.en_US)) || '操作失败')
        notify(okMessage)
        await this.load()
      } catch (e) {
        notify(e.message || String(e), 'error')
      }
      this._state.busy = false
      this.paint()
    },

    openCase(caseNo) { this._caseNo = caseNo; this.load() },
    backToList() { this._caseNo = null; this.load() },

    paint() {
      const r = this._root
      if (!r) return
      const s = this._state
      const children = s.loading
        ? [h('div', { className: 'sr-center' }, '加载中…')]
        : s.error
          ? [h('div', { className: 'sr-error' }, s.error), this._backBtnIfDetail()]
          : this._caseNo ? this.detailView(s.snapshot) : this.listView(s.rows)
      ReactDOM.render(h('div', { className: 'sr-shell' }, ...children), r)
      setTimeout(reportResize, 30)
    },

    _backBtnIfDetail() {
      return this._caseNo ? h('button', { className: 'sr-btn sr-btn-ghost', onClick: () => this.backToList() }, '← 返回列表') : null
    },

    listView(rows) {
      const header = h('div', { className: 'sr-header' },
        h('div', { className: 'sr-title' }, '🧾 SQL 质量审查'),
        h('div', { className: 'sr-sub' }, '提交 SQL 给助手 → AI 结构化审查 → 逐条人工确认 → 归档'),
        h('button', { className: 'sr-btn', onClick: () => this.load() }, '↻ 刷新'))
      if (!rows || rows.length === 0) {
        return [header, h('div', { className: 'sr-empty' },
          h('div', null, '暂无审查单'),
          h('div', { className: 'sr-hint' }, '在助手对话中发送一段 SQL（可附建表 DDL），即可创建第一个审查单'))]
      }
      const table = h('table', { className: 'sr-table' },
        h('thead', null, h('tr', null,
          ['单号', '标题', '状态', 'AI置信度', '发现数', '重试', ''].map((t) => h('th', { key: t }, t)))),
        h('tbody', null, rows.map((row) => {
          const meta = STATUS_META[row.status] || { label: row.status, color: '#94a3b8' }
          return h('tr', { key: row.caseNo, onClick: () => this.openCase(row.caseNo) },
            h('td', null, row.caseNo),
            h('td', { className: 'sr-ellipsis', title: row.title }, row.title || '-'),
            h('td', null, h('span', { className: 'sr-badge', style: { background: meta.color } }, meta.label)),
            h('td', null, row.confidence != null ? Number(row.confidence).toFixed(2) : '-'),
            h('td', null, String(row.findingCount ?? 0)),
            h('td', null, row.retryCount ? String(row.retryCount) + ' 次' : '-'),
            h('td', null, h('span', { className: 'sr-link' }, '查看 →')))
        })))
      return [header, table]
    },

    detailView(snap) {
      if (!snap) return [h('div', { className: 'sr-center' }, '无数据')]
      const meta = STATUS_META[snap.status] || { label: snap.status, color: '#94a3b8' }
      const header = h('div', { className: 'sr-header' },
        h('div', { className: 'sr-title-row' },
          h('div', { className: 'sr-title' }, '🧾 ' + snap.caseNo),
          h('span', { className: 'sr-badge', style: { background: meta.color } }, meta.label)),
        h('div', { className: 'sr-sub' }, (snap.title || '') + ' · ' + (snap.dbDialect || '')),
        h('div', { className: 'sr-row' },
          this._backBtnIfDetail(),
          snap.status === 'failed'
            ? h('button', { className: 'sr-btn sr-btn-warn', disabled: this._state.busy,
                onClick: () => this.act('retry_case', { caseNo: snap.caseNo }, '已重置为待AI审查，请让助手重新分析') }, '↻ 重试 AI 审查')
            : null,
          snap.status === 'pending_confirmation'
            ? h('button', { className: 'sr-btn sr-btn-primary', disabled: this._state.busy,
                onClick: () => this.act('finalize_case', { caseNo: snap.caseNo }, '终审完成') }, '✓ 终审提交')
            : null))

      const sqlBox = h('div', { className: 'sr-card' },
        h('div', { className: 'sr-card-title' }, 'SQL 原文'),
        h('pre', { className: 'sr-code' }, snap.sqlText || ''))

      const aiSummary = snap.summary
        ? h('div', { className: 'sr-card' },
            h('div', { className: 'sr-card-title' }, 'AI 审查结论' + (snap.confidence != null ? '（置信度 ' + Number(snap.confidence).toFixed(2) + '）' : '')),
            h('div', { className: 'sr-summary' }, snap.summary))
        : null

      const failedBox = snap.status === 'failed'
        ? h('div', { className: 'sr-card sr-card-danger' },
            h('div', { className: 'sr-card-title' }, '⚠ 上次 AI 处理失败（已保留 SQL 与规则发现，可重试）'),
            h('div', { className: 'sr-summary' }, snap.lastError || '未知错误'))
        : null

      const findings = (snap.findings || []).map((f) => {
        const sev = SEVERITY_META[f.severity] || { label: f.severity, color: '#64748b' }
        const decided = f.decision === 'accepted' || f.decision === 'rejected'
        return h('div', { key: snap.caseNo + '-' + f.seq, className: 'sr-card' + (f.decision === 'rejected' ? ' sr-card-muted' : '') },
          h('div', { className: 'sr-card-title' },
            h('span', { className: 'sr-dot', style: { background: sev.color } }),
            h('span', { className: 'sr-sev', style: { color: sev.color } }, sev.label),
            h('span', { className: 'sr-cat' }, CATEGORY_LABELS[f.category] || f.category),
            f.source === 'rule' ? h('span', { className: 'sr-tag' }, '规则 ' + (f.ruleId || '')) : h('span', { className: 'sr-tag sr-tag-ai' }, 'AI 发现'),
            f.location ? h('span', { className: 'sr-loc' }, f.location) : null,
            decided ? h('span', { className: 'sr-decision ' + (f.decision === 'accepted' ? 'sr-decision-ok' : 'sr-decision-no') },
              f.decision === 'accepted' ? '✓ 已采纳' : '✗ 已驳回') : null),
          f.originalText ? h('pre', { className: 'sr-evidence' }, f.originalText) : null,
          h('div', { className: 'sr-explain' }, f.explanation || ''),
          f.suggestion ? h('div', { className: 'sr-suggest' }, '建议：' + f.suggestion) : null,
          snap.status === 'pending_confirmation' && !decided
            ? h('div', { className: 'sr-actions' },
                h('button', { className: 'sr-btn sr-btn-primary', disabled: this._state.busy,
                  onClick: () => this.act('decide_finding', { caseNo: snap.caseNo, seq: f.seq, decision: 'accepted' }, '已采纳') }, '✓ 采纳'),
                h('button', { className: 'sr-btn sr-btn-danger', disabled: this._state.busy,
                  onClick: () => this.act('decide_finding', { caseNo: snap.caseNo, seq: f.seq, decision: 'rejected' }, '已驳回') }, '✗ 驳回'))
            : null)
      })

      const emptyFindings = (!snap.findings || snap.findings.length === 0)
        ? h('div', { className: 'sr-empty' }, snap.status === 'pending_ai' ? '等待 AI 审查…' : '无审查发现') : null

      return [header, sqlBox, failedBox, aiSummary,
        h('div', { className: 'sr-card' }, h('div', { className: 'sr-card-title' }, '审查发现（逐条确认/驳回）'), emptyFindings),
        ...findings]
    }
  }

  function injectStyles() {
    const css = `
      .sr-shell{font-family:system-ui,"Microsoft YaHei",sans-serif;padding:14px;color:#0f172a;background:#f8fafc;min-height:420px}
      .sr-header{margin-bottom:12px;display:flex;flex-direction:column;gap:6px}
      .sr-title-row{display:flex;align-items:center;gap:10px}
      .sr-title{font-size:18px;font-weight:700}
      .sr-sub{font-size:12px;color:#64748b}
      .sr-row{display:flex;gap:8px;flex-wrap:wrap}
      .sr-btn{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer}
      .sr-btn:hover:not(:disabled){background:#f1f5f9}
      .sr-btn:disabled{opacity:.5;cursor:not-allowed}
      .sr-btn-primary{background:#2563eb;border-color:#2563eb;color:#fff}
      .sr-btn-danger{background:#fff;border-color:#dc2626;color:#dc2626}
      .sr-btn-warn{background:#f59e0b;border-color:#f59e0b;color:#fff}
      .sr-btn-ghost{border:none;color:#2563eb;padding-left:0}
      .sr-table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}
      .sr-table th{background:#f1f5f9;text-align:left;padding:9px 12px;font-size:12px;color:#475569}
      .sr-table td{padding:9px 12px;border-top:1px solid #e2e8f0;font-size:13px}
      .sr-table tr:hover td{background:#f8fafc;cursor:pointer}
      .sr-ellipsis{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .sr-badge{color:#fff;font-size:11px;border-radius:10px;padding:2px 8px}
      .sr-card{background:#fff;border-radius:10px;padding:12px 14px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
      .sr-card-muted{opacity:.55}
      .sr-card-danger{border:1px solid #fecaca;background:#fef2f2}
      .sr-card-title{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;margin-bottom:8px;flex-wrap:wrap}
      .sr-code{background:#0f172a;color:#e2e8f0;border-radius:8px;padding:12px;font-size:12px;line-height:1.55;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:0}
      .sr-evidence{background:#f1f5f9;border-left:3px solid #94a3b8;border-radius:4px;padding:8px 10px;font-size:12px;white-space:pre-wrap;word-break:break-all;margin:0 0 8px}
      .sr-explain{font-size:13px;line-height:1.6;color:#334155}
      .sr-suggest{font-size:12px;color:#0f766e;margin-top:6px}
      .sr-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
      .sr-sev{font-size:12px;font-weight:700}
      .sr-cat{font-size:11px;background:#e2e8f0;border-radius:6px;padding:1px 7px;color:#475569}
      .sr-tag{font-size:11px;background:#ecfdf5;color:#047857;border-radius:6px;padding:1px 7px}
      .sr-tag-ai{background:#eef2ff;color:#4338ca}
      .sr-loc{font-size:11px;color:#94a3b8}
      .sr-decision{font-size:11px;border-radius:6px;padding:1px 7px;margin-left:auto}
      .sr-decision-ok{background:#dcfce7;color:#15803d}
      .sr-decision-no{background:#fee2e2;color:#b91c1c}
      .sr-actions{display:flex;gap:8px;margin-top:10px}
      .sr-summary{font-size:13px;line-height:1.6}
      .sr-empty{text-align:center;color:#94a3b8;padding:40px 0;font-size:13px;background:#fff;border-radius:10px}
      .sr-hint{font-size:12px;margin-top:6px;color:#cbd5e1}
      .sr-error{background:#fee2e2;color:#b91c1c;padding:12px;border-radius:10px;font-size:13px;margin-bottom:10px}
      .sr-center{text-align:center;padding:60px 0;color:#94a3b8}
      .sr-link{color:#2563eb;font-size:12px}
    `
    const style = document.createElement('style')
    style.textContent = css
    document.head.appendChild(style)
  }
})()
