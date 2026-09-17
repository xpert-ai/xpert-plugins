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

  function post(type, body) {
    if (!instanceId && type !== 'ready') return
    parent.postMessage(Object.assign({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type }, body || {}), '*')
  }

  function request(type, body) {
    const requestId = String(++requestSequence)
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      post(type, Object.assign({ requestId }, body || {}))
      setTimeout(() => {
        if (!pending.has(requestId)) return
        pending.delete(requestId)
        reject(new Error('请求超时'))
      }, 30000)
    })
  }

  function notify(level, message) {
    post('notify', { level, message })
  }

  function executeAction(actionKey, targetId, input, parameters) {
    return request('executeAction', {
      actionKey,
      targetId,
      input,
      parameters
    })
  }

  async function dispatchAssistantCommands(payload) {
    const messages = payload && Array.isArray(payload.messages) ? payload.messages : []
    let dispatched = 0
    for (const command of messages) {
      if (!command || command.commandKey !== 'assistant.chat.send_message' || !command.payload) {
        continue
      }
      await request('invokeClientCommand', {
        commandKey: command.commandKey,
        payload: command.payload
      })
      dispatched += 1
    }
    return dispatched
  }

  function getResponsePayload(response) {
    return response && response.payload !== undefined ? response.payload : response && response.data !== undefined ? response.data : response
  }

  function reportResize() {
    post('resize', { height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 620) })
  }

  function App() {
    const [context, setContext] = React.useState(null)
    const [data, setData] = React.useState(null)
    const [selectedJobId, setSelectedJobId] = React.useState(null)
    const [busy, setBusy] = React.useState(false)
    const [jobForm, setJobForm] = React.useState({
      title: '',
      jd: '',
      mustHaveSkills: '',
      niceToHaveSkills: '',
      minYearsExperience: '',
      screeningNotes: ''
    })
    const [resumeForm, setResumeForm] = React.useState({
      sourceName: '',
      rawText: ''
    })
    const [xpertId, setXpertId] = React.useState('')

    React.useEffect(() => {
      window.__resumeScreeningSetContext = (nextContext) => {
        setContext(nextContext)
        setData(nextContext.payload || null)
      }
      post('ready')
      return () => {
        window.__resumeScreeningSetContext = null
      }
    }, [])

    React.useEffect(() => {
      if (!context) return
      reload(selectedJobId)
    }, [context])

    React.useEffect(reportResize, [data, selectedJobId, busy])

    async function reload(jobId) {
      if (!context) return
      setBusy(true)
      try {
        const response = await request('requestData', {
          query: {
            page: 1,
            pageSize: 20,
            parameters: jobId ? { jobId } : {}
          }
        })
        const payload = response.payload || response.data || null
        setData(payload)
        setSelectedJobId(jobId || null)
      } catch (error) {
        notify('error', error.message || '刷新失败')
      } finally {
        setBusy(false)
      }
    }

    async function createJob(event) {
      event.preventDefault()
      setBusy(true)
      try {
        const response = await executeAction('create_screening_job', null, {
          title: jobForm.title,
          jd: jobForm.jd,
          mustHaveSkills: jobForm.mustHaveSkills,
          niceToHaveSkills: jobForm.niceToHaveSkills,
          minYearsExperience: jobForm.minYearsExperience,
          screeningNotes: jobForm.screeningNotes,
          xpertId
        }, {})
        const result = getResponsePayload(response)
        if (result && result.success === false) {
          throw new Error(resolveMessage(result.message) || '创建岗位失败')
        }
        const created = result && result.data && result.data.job ? result.data.job : result && result.job
        setJobForm({ title: '', jd: '', mustHaveSkills: '', niceToHaveSkills: '', minYearsExperience: '', screeningNotes: '' })
        notify('success', '岗位已创建')
        await reload(created && created.id ? created.id : null)
      } catch (error) {
        notify('error', getErrorMessage(error))
      } finally {
        setBusy(false)
      }
    }

    async function addResume(event) {
      event.preventDefault()
      if (!selectedJobId) return
      setBusy(true)
      try {
        const response = await executeAction('add_candidate_resume', selectedJobId, {
          jobId: selectedJobId,
          sourceName: resumeForm.sourceName,
          rawText: resumeForm.rawText
        }, { jobId: selectedJobId })
        const result = getResponsePayload(response)
        if (result && result.success === false) {
          throw new Error(resolveMessage(result.message) || '添加简历失败')
        }
        setResumeForm({ sourceName: '', rawText: '' })
        notify('success', '简历已添加')
        await reload(selectedJobId)
      } catch (error) {
        notify('error', getErrorMessage(error))
      } finally {
        setBusy(false)
      }
    }

    async function startAnalysis(candidateId) {
      if (!selectedJobId) return
      setBusy(true)
      try {
        const response = await executeAction('start_resume_analysis', selectedJobId, {
          jobId: selectedJobId,
          candidateId,
          xpertId
        }, { jobId: selectedJobId })
        const result = getResponsePayload(response)
        if (result && result.success === false) {
          throw new Error(resolveMessage(result.message) || '启动 AI 初筛失败')
        }
        const payload = result && result.data ? result.data : result
        const dispatched = await dispatchAssistantCommands(payload)
        notify('success', dispatched ? `已发送 ${dispatched} 份简历给 Assistant` : '分析任务已准备')
        await reload(selectedJobId)
      } catch (error) {
        notify('error', getErrorMessage(error))
      } finally {
        setBusy(false)
      }
    }

    async function retryCandidate(candidateId) {
      if (!selectedJobId) return
      setBusy(true)
      try {
        const response = await executeAction('retry_candidate_analysis', selectedJobId, {
          jobId: selectedJobId,
          candidateId
        }, { jobId: selectedJobId })
        const result = getResponsePayload(response)
        if (result && result.success === false) {
          throw new Error(resolveMessage(result.message) || '重试失败')
        }
        notify('success', '候选人已进入待分析状态')
        await reload(selectedJobId)
      } catch (error) {
        notify('error', getErrorMessage(error))
      } finally {
        setBusy(false)
      }
    }

    async function saveDecision(candidate, decision) {
      if (!selectedJobId || !candidate.id) return
      const note = window.prompt('请输入复核备注，可留空。', candidate.reviewerNote || '')
      setBusy(true)
      try {
        const response = await executeAction('update_reviewer_decision', selectedJobId, {
          jobId: selectedJobId,
          candidateId: candidate.id,
          reviewerDecision: decision,
          reviewerScore: candidate.reviewerScore == null ? candidate.matchResult && candidate.matchResult.score : candidate.reviewerScore,
          reviewerNote: note || ''
        }, { jobId: selectedJobId })
        const result = getResponsePayload(response)
        if (result && result.success === false) {
          throw new Error(resolveMessage(result.message) || '保存复核结论失败')
        }
        notify('success', '复核结论已保存')
        await reload(selectedJobId)
      } catch (error) {
        notify('error', getErrorMessage(error))
      } finally {
        setBusy(false)
      }
    }

    const isDetail = Boolean(selectedJobId && data && data.item)
    const jobs = data && Array.isArray(data.items) ? data.items : []
    const candidates = data && data.item && Array.isArray(data.item.candidates) ? data.item.candidates : []
    const job = data && data.item ? data.item.job : null

    return h(
      'div',
      { className: 'rsa-app' },
      h(
        'header',
        { className: 'rsa-header' },
        h('div', null, h('h2', null, isDetail && job ? job.title : '简历初筛助手'), h('p', null, '岗位、简历、AI 评分和人工复核集中处理')),
        h(
          'div',
          { className: 'rsa-actions' },
          isDetail ? h('button', { onClick: () => reload(null), disabled: busy }, '返回岗位列表') : null,
          h('button', { onClick: () => reload(selectedJobId), disabled: busy }, busy ? '刷新中...' : '刷新')
        )
      ),
      isDetail
        ? h(
            'main',
            { className: 'rsa-grid' },
            h(
              'section',
              { className: 'rsa-panel' },
              h(
                'div',
                { className: 'rsa-panel-head' },
                h('h3', null, '候选人排序'),
                h('button', { onClick: () => startAnalysis(null), disabled: busy || !candidates.length }, '开始 AI 初筛')
              ),
              candidates.length
                ? candidates.map((candidate) => renderCandidate(candidate, { busy, retryCandidate, saveDecision, startAnalysis }))
                : h('div', { className: 'rsa-empty' }, '暂无候选人，下一步添加简历文本并启动 AI 初筛。')
            ),
            h(
              'aside',
              { className: 'rsa-panel' },
              h('h3', null, '岗位标准'),
              h('p', null, job && job.jd ? job.jd : '暂无 JD'),
              h('label', { className: 'rsa-field' }, h('span', null, 'Assistant / Xpert ID'), h('input', { value: xpertId, onChange: (event) => setXpertId(event.target.value), placeholder: job && job.xpertId ? job.xpertId : '可选' })),
              h('div', { className: 'rsa-muted' }, `候选人：${candidates.length}`),
              h(
                'form',
                { className: 'rsa-form', onSubmit: addResume },
                h('h3', null, '添加简历'),
                h('label', { className: 'rsa-field' }, h('span', null, '来源名称'), h('input', { value: resumeForm.sourceName, onChange: (event) => setResumeForm(Object.assign({}, resumeForm, { sourceName: event.target.value })), placeholder: 'candidate-a.txt' })),
                h('label', { className: 'rsa-field' }, h('span', null, '简历文本'), h('textarea', { value: resumeForm.rawText, onChange: (event) => setResumeForm(Object.assign({}, resumeForm, { rawText: event.target.value })), rows: 9, placeholder: '粘贴候选人简历文本' })),
                h('button', { type: 'submit', disabled: busy || !resumeForm.rawText.trim() }, '保存简历记录')
              )
            )
          )
        : h(
            'main',
            { className: 'rsa-grid' },
            h(
              'section',
              { className: 'rsa-panel' },
              h('h3', null, '岗位列表'),
              jobs.length
                ? jobs.map((item) =>
                    h(
                      'button',
                      { key: item.id, className: 'rsa-job', onClick: () => reload(item.id), disabled: busy },
                      h('strong', null, item.title),
                      h('span', null, `${item.candidateCount || 0} 份简历 · ${item.completedCount || 0} 已完成 · ${item.failedCount || 0} 失败`)
                    )
                  )
                : h('div', { className: 'rsa-empty' }, '暂无岗位。请在右侧创建第一条岗位。')
            ),
            h(
              'aside',
              { className: 'rsa-panel' },
              h(
                'form',
                { className: 'rsa-form', onSubmit: createJob },
                h('h3', null, '新建岗位'),
                h('label', { className: 'rsa-field' }, h('span', null, '岗位名称'), h('input', { value: jobForm.title, onChange: (event) => setJobForm(Object.assign({}, jobForm, { title: event.target.value })), placeholder: '前端工程师' })),
                h('label', { className: 'rsa-field' }, h('span', null, 'JD'), h('textarea', { value: jobForm.jd, onChange: (event) => setJobForm(Object.assign({}, jobForm, { jd: event.target.value })), rows: 8, placeholder: '粘贴岗位职责和任职要求' })),
                h('label', { className: 'rsa-field' }, h('span', null, '必备技能'), h('input', { value: jobForm.mustHaveSkills, onChange: (event) => setJobForm(Object.assign({}, jobForm, { mustHaveSkills: event.target.value })), placeholder: 'React, TypeScript' })),
                h('label', { className: 'rsa-field' }, h('span', null, '加分技能'), h('input', { value: jobForm.niceToHaveSkills, onChange: (event) => setJobForm(Object.assign({}, jobForm, { niceToHaveSkills: event.target.value })), placeholder: 'Node.js, AI 产品经验' })),
                h('label', { className: 'rsa-field' }, h('span', null, '最低年限'), h('input', { value: jobForm.minYearsExperience, onChange: (event) => setJobForm(Object.assign({}, jobForm, { minYearsExperience: event.target.value })), placeholder: '3' })),
                h('label', { className: 'rsa-field' }, h('span', null, '筛选说明'), h('textarea', { value: jobForm.screeningNotes, onChange: (event) => setJobForm(Object.assign({}, jobForm, { screeningNotes: event.target.value })), rows: 4, placeholder: '强调 B 端项目、复杂表单和协作经验' })),
                h('label', { className: 'rsa-field' }, h('span', null, 'Assistant / Xpert ID'), h('input', { value: xpertId, onChange: (event) => setXpertId(event.target.value), placeholder: '可选' })),
                h('button', { type: 'submit', disabled: busy || !jobForm.title.trim() || !jobForm.jd.trim() }, '创建岗位')
              )
            )
          )
    )
  }

  function renderCandidate(candidate, actions) {
    const score = candidate.reviewerScore == null ? candidate.matchResult && candidate.matchResult.score : candidate.reviewerScore
    const summary = candidate.summaryOverride || (candidate.extracted && candidate.extracted.summary) || '等待 AI 结构化摘要'
    return h(
      'article',
      { key: candidate.id, className: `rsa-candidate rsa-${candidate.status}` },
      h(
        'div',
        null,
        h('strong', null, candidate.extracted && candidate.extracted.candidateName ? candidate.extracted.candidateName : candidate.sourceName),
        h('p', null, summary),
        candidate.matchResult && candidate.matchResult.reason ? h('p', null, candidate.matchResult.reason) : null,
        candidate.errorMessage ? h('p', { className: 'rsa-error' }, candidate.errorMessage) : null
      ),
      h(
        'div',
        { className: 'rsa-candidate-side' },
        h('span', null, score == null ? candidate.status : `${score} 分`),
        h(
          'div',
          { className: 'rsa-mini-actions' },
          h('button', { onClick: () => actions.startAnalysis(candidate.id), disabled: actions.busy }, '分析'),
          candidate.status === 'failed' ? h('button', { onClick: () => actions.retryCandidate(candidate.id), disabled: actions.busy }, '重试') : null,
          h('button', { onClick: () => actions.saveDecision(candidate, 'interview'), disabled: actions.busy }, '面试'),
          h('button', { onClick: () => actions.saveDecision(candidate, 'hold'), disabled: actions.busy }, '待定'),
          h('button', { onClick: () => actions.saveDecision(candidate, 'reject'), disabled: actions.busy }, '淘汰')
        )
      )
    )
  }

  function resolveMessage(message) {
    if (!message) return ''
    if (typeof message === 'string') return message
    return message.zh_Hans || message.en_US || ''
  }

  function getErrorMessage(error) {
    return error && error.message ? error.message : '操作失败'
  }

  function injectStyles() {
    const style = document.createElement('style')
    style.textContent = `
.rsa-app { display: grid; gap: 12px; min-height: 620px; padding: 12px; color: var(--xui-color-foreground); background: var(--xui-color-background); }
.rsa-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-card); padding: 14px; }
.rsa-header h2, .rsa-panel h3 { margin: 0; }
.rsa-header p, .rsa-muted, .rsa-candidate p { color: var(--xui-color-muted-foreground); margin: 4px 0 0; }
.rsa-actions { display: flex; gap: 8px; }
.rsa-actions button, .rsa-job, .rsa-form button, .rsa-mini-actions button, .rsa-panel-head button { border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-card); color: inherit; padding: 8px 12px; cursor: pointer; }
.rsa-actions button:disabled, .rsa-job:disabled, .rsa-form button:disabled, .rsa-mini-actions button:disabled, .rsa-panel-head button:disabled { cursor: not-allowed; opacity: 0.55; }
.rsa-grid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 12px; align-items: start; }
.rsa-panel { display: grid; gap: 10px; border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-card); padding: 14px; }
.rsa-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.rsa-job { display: grid; gap: 4px; width: 100%; text-align: left; }
.rsa-job:hover, .rsa-actions button:hover, .rsa-form button:hover, .rsa-mini-actions button:hover, .rsa-panel-head button:hover { border-color: var(--xui-color-primary); }
.rsa-job span { color: var(--xui-color-muted-foreground); font-size: 12px; }
.rsa-candidate { display: grid; grid-template-columns: minmax(0, 1fr) 210px; gap: 12px; align-items: start; border: 1px solid var(--xui-color-border); border-radius: 8px; padding: 10px; }
.rsa-candidate span { border-radius: 999px; background: color-mix(in srgb, var(--xui-color-primary) 12%, transparent); color: var(--xui-color-primary); padding: 4px 8px; font-size: 12px; font-weight: 800; }
.rsa-failed span { background: var(--xui-color-destructive-background); color: var(--xui-color-destructive); }
.rsa-candidate-side { display: grid; justify-items: end; gap: 8px; }
.rsa-mini-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.rsa-mini-actions button { min-height: 28px; padding: 4px 8px; font-size: 12px; }
.rsa-form { display: grid; gap: 10px; }
.rsa-field { display: grid; gap: 5px; font-size: 12px; font-weight: 700; }
.rsa-field input, .rsa-field textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-background); color: var(--xui-color-foreground); padding: 8px 10px; font: inherit; font-weight: 400; resize: vertical; }
.rsa-field input:focus, .rsa-field textarea:focus { border-color: var(--xui-color-primary); outline: none; }
.rsa-error { color: var(--xui-color-destructive) !important; }
.rsa-empty { border: 1px dashed var(--xui-color-border); border-radius: 8px; color: var(--xui-color-muted-foreground); padding: 18px; text-align: center; }
@media (max-width: 860px) { .rsa-header, .rsa-grid, .rsa-candidate { grid-template-columns: 1fr; } .rsa-candidate-side { justify-items: start; } .rsa-mini-actions { justify-content: flex-start; } }
`
    document.head.appendChild(style)
  }

  window.addEventListener('message', (event) => {
    const message = event.data
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return

    if (message.type === 'init') {
      instanceId = message.instanceId
      if (window.XpertRemoteUI && typeof window.XpertRemoteUI.applyTheme === 'function') {
        window.XpertRemoteUI.applyTheme(message.theme)
      }
      if (window.__resumeScreeningSetContext) {
        window.__resumeScreeningSetContext({
          manifest: message.manifest,
          payload: message.payload,
          initialQuery: message.initialQuery || {},
          locale: message.locale,
          theme: message.theme
        })
      }
      setTimeout(reportResize, 0)
      return
    }

    if (message.instanceId !== instanceId) return

    if (message.requestId && pending.has(message.requestId)) {
      const item = pending.get(message.requestId)
      pending.delete(message.requestId)
      if (message.type === 'error') {
        item.reject(new Error(message.message || '远程请求失败'))
      } else {
        item.resolve(message)
      }
    }
  })

  ReactDOM.render(h(App), document.getElementById('root'))
})()
