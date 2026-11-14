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
    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 560)
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

  function getResponsePayload(response) {
    if (!response || typeof response !== 'object') return null
    if (response.data !== undefined) return response.data
    if (response.result !== undefined) return response.result
    if (response.payload !== undefined) return response.payload
    return response
  }

  function App() {
    const [context, setContext] = React.useState(null)
    const [data, setData] = React.useState(null)
    const [selectedCaseId, setSelectedCaseId] = React.useState(null)
    const [search, setSearch] = React.useState('')
    const [busy, setBusy] = React.useState(false)
    const [showCreate, setShowCreate] = React.useState(false)
    const [createForm, setCreateForm] = React.useState(emptyCreateForm())
    const [resolution, setResolution] = React.useState('')
    const [closeAfterConfirm, setCloseAfterConfirm] = React.useState(false)
    const [resolvedBy, setResolvedBy] = React.useState('')
    const searchRef = React.useRef('')
    const selectedCaseIdRef = React.useRef(null)
    const dataRef = React.useRef(null)
    const busyRef = React.useRef(false)
    const autoRefreshRef = React.useRef(null)
    const autoRefreshRunningRef = React.useRef(false)

    React.useEffect(() => {
      window.__inspectionSetContext = (nextContext) => {
        setContext(nextContext)
        setData(nextContext.payload || null)
        setTimeout(() => reload(null, nextContext), 0)
      }
      window.__inspectionHandleHostEvent = () => {
        reload()
      }
      post('ready')
      return () => {
        window.__inspectionSetContext = null
        window.__inspectionHandleHostEvent = null
        stopAutoRefresh()
      }
    }, [])

    React.useEffect(() => {
      selectedCaseIdRef.current = selectedCaseId
    }, [selectedCaseId])

    React.useEffect(() => {
      dataRef.current = data
    }, [data])

    React.useEffect(() => {
      busyRef.current = busy
    }, [busy])

    React.useEffect(() => {
      reportResize()
    }, [data, selectedCaseId, busy, showCreate])

    async function reload(nextCaseId, nextContext, options) {
      const silent = options && options.silent === true
      const activeContext = nextContext || context
      if (!activeContext) return
      const caseId = nextCaseId === undefined ? selectedCaseIdRef.current : nextCaseId
      if (!silent) setBusy(true)
      try {
        const response = await request('requestData', {
          query: {
            page: 1,
            pageSize: 20,
            search: searchRef.current,
            parameters: caseId ? { caseId } : {}
          }
        })
        const nextData = getResponsePayload(response) || null
        dataRef.current = nextData
        setData(nextData)
        setSelectedCaseId(caseId || null)
        return nextData
      } catch (error) {
        if (!silent) notify('error', getErrorMessage(error))
        return null
      } finally {
        if (!silent) setBusy(false)
      }
    }

    function stopAutoRefresh() {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current)
        autoRefreshRef.current = null
      }
      autoRefreshRunningRef.current = false
    }

    function startAutoRefresh(caseId) {
      stopAutoRefresh()
      if (!caseId) return
      const currentDetail = dataRef.current && dataRef.current.detail
      if (currentDetail && !isActiveDetail(currentDetail)) {
        return
      }
      let attempts = 0
      autoRefreshRef.current = setInterval(async () => {
        const activeCaseId = selectedCaseIdRef.current
        if (!activeCaseId || activeCaseId !== caseId || attempts >= 40) {
          stopAutoRefresh()
          return
        }
        if (busyRef.current || autoRefreshRunningRef.current) {
          return
        }
        attempts += 1
        autoRefreshRunningRef.current = true
        try {
          const nextData = await reload(caseId, undefined, { silent: true })
          const nextDetail = nextData && nextData.detail
          if (nextDetail && !isActiveDetail(nextDetail)) {
            stopAutoRefresh()
          }
        } finally {
          autoRefreshRunningRef.current = false
        }
      }, 3000)
    }

    function handleSearchChange(value) {
      setSearch(value)
      searchRef.current = value
    }

    async function submitSearch() {
      await reload(null)
    }

    function selectCase(caseId) {
      setSelectedCaseId(caseId)
      reload(caseId)
    }

    async function createCase() {
      const title = (createForm.title || '').trim()
      const faultDescription = (createForm.faultDescription || '').trim()
      if (!title || !faultDescription) {
        notify('warning', '请填写工单标题和故障描述')
        return
      }
      setBusy(true)
      try {
        const response = await executeAction(
          'create_case',
          null,
          {
            title,
            deviceType: createForm.deviceType,
            faultDescription,
            severity: createForm.severity || undefined,
            impact: createForm.impact
          },
          {}
        )
        const result = getResponsePayload(response)
        if (result && result.success === false) {
          throw new Error(resolveMessage(result.message) || '创建工单失败')
        }
        notify('success', '巡检工单已创建，可点击「发送到 Assistant 分析」')
        setShowCreate(false)
        setCreateForm(emptyCreateForm())
        await reload(null)
      } catch (error) {
        notify('error', getErrorMessage(error))
      } finally {
        setBusy(false)
      }
    }

    async function sendToAssistant() {
      const detail = data && data.detail
      if (!detail) return
      setBusy(true)
      try {
        const prompt = buildAnalyzePrompt(detail)
        const response = await request('invokeClientCommand', {
          commandKey: 'assistant.chat.send_message',
          payload: { text: prompt }
        })
        const commandResult = getResponsePayload(response)
        if (commandResult && commandResult.success === false) {
          throw new Error(resolveMessage(commandResult.message) || 'Assistant 对话发送失败')
        }
        notify('success', '已发送到 Assistant 对话，AI 分析完成后将自动刷新')
        startAutoRefresh(detail.id)
      } catch (error) {
        notify('error', getErrorMessage(error))
      } finally {
        setBusy(false)
      }
    }

    async function retryAnalysis() {
      const detail = data && data.detail
      if (!detail) return
      setBusy(true)
      try {
        const response = await executeAction('retry_analysis', detail.id, { caseId: detail.id }, { caseId: detail.id })
        const result = getResponsePayload(response)
        if (result && result.success === false) {
          throw new Error(resolveMessage(result.message) || '重试失败')
        }
        notify('success', '已重置工单状态，请重新「发送到 Assistant 分析」')
        await reload(detail.id)
      } catch (error) {
        notify('error', getErrorMessage(error))
      } finally {
        setBusy(false)
      }
    }

    async function confirmResolution() {
      const detail = data && data.detail
      if (!detail) return
      const resolutionText = (resolution || '').trim()
      if (!resolutionText) {
        notify('warning', '请填写处理方案')
        return
      }
      setBusy(true)
      try {
        const response = await executeAction(
          'confirm_resolution',
          detail.id,
          {
            caseId: detail.id,
            resolution: resolutionText,
            close: closeAfterConfirm,
            resolvedBy: resolvedBy || undefined
          },
          { caseId: detail.id }
        )
        const result = getResponsePayload(response)
        if (result && result.success === false) {
          throw new Error(resolveMessage(result.message) || '确认失败')
        }
        notify('success', '处理方案已确认' + (closeAfterConfirm ? '，工单已关闭' : ''))
        setResolution('')
        setCloseAfterConfirm(false)
        await reload(detail.id)
      } catch (error) {
        notify('error', getErrorMessage(error))
      } finally {
        setBusy(false)
      }
    }

    async function deleteCase() {
      const detail = data && data.detail
      if (!detail) return
      if (!window.confirm(`确认删除工单「${displayText(detail.title) || detail.caseNo}」？删除后不可恢复。`)) {
        return
      }
      setBusy(true)
      try {
        const response = await executeAction('delete_case', detail.id, { caseId: detail.id }, { caseId: detail.id })
        const result = getResponsePayload(response)
        if (result && result.success === false) {
          throw new Error(resolveMessage(result.message) || '删除失败')
        }
        notify('success', '工单已删除')
        await reload(null)
      } catch (error) {
        notify('error', getErrorMessage(error))
      } finally {
        setBusy(false)
      }
    }

    const cases = (data && Array.isArray(data.items) ? data.items : [])
    const total = (data && data.total) || cases.length
    const detail = data && data.item
    const historyCount = (data && data.summary && data.summary.historyCount) || 0

    return h('div', { className: 'insp-app' },
      h('div', { className: 'insp-header' },
        h('div', { className: 'insp-title-block' },
          h('div', { className: 'insp-eyebrow' }, 'TELECOM O&M WORKBENCH'),
          h('h2', null, '机房/基站巡检与故障处理'),
          h('p', null, '提交故障描述 → AI 解析与历史方案检索 → 人工确认处理方案')
        ),
        h('div', { className: 'insp-header-actions' },
          h('button', { className: 'insp-button insp-button-primary', disabled: busy, onClick: function () { setShowCreate(true) } }, '+ 新建巡检工单')
        )
      ),
      h('div', { className: 'insp-stats' },
        h('div', { className: 'insp-stat' }, h('div', { className: 'insp-stat-value' }, String(total)), h('div', { className: 'insp-stat-label' }, '工单总数')),
        h('div', { className: 'insp-stat' }, h('div', { className: 'insp-stat-value' }, String(historyCount)), h('div', { className: 'insp-stat-label' }, '历史方案库')),
        h('div', { className: 'insp-stat' }, h('div', { className: 'insp-stat-value' }, String(countByStatus(cases, 'failed'))), h('div', { className: 'insp-stat-label' }, '待重试'))
      ),
      h('div', { className: 'insp-search-bar' },
        h('input', {
          className: 'insp-input',
          placeholder: '按标题搜索工单…',
          value: search,
          onChange: function (event) { handleSearchChange(event.target.value) },
          onKeyDown: function (event) { if (event.key === 'Enter') submitSearch() }
        }),
        h('button', { className: 'insp-button', disabled: busy, onClick: submitSearch }, '搜索')
      ),
      h('div', { className: 'insp-layout' },
        h('div', { className: 'insp-list' },
          cases.length === 0
            ? h('div', { className: 'insp-empty' }, '暂无工单，点击「+ 新建巡检工单」开始。')
            : cases.map(function (item) {
                return h('div',
                  {
                    key: item.id,
                    className: 'insp-case-row' + (selectedCaseId === item.id ? ' insp-case-row-active' : ''),
                    onClick: function () { selectCase(item.id) }
                  },
                  h('div', { className: 'insp-case-row-main' },
                    h('div', { className: 'insp-case-row-title' }, displayText(item.title) || item.caseNo),
                    h('div', { className: 'insp-case-row-meta' },
                      h('span', { className: 'insp-tag' }, item.caseNo),
                      item.deviceType ? h('span', { className: 'insp-tag' }, displayText(item.deviceType)) : null,
                      h('span', { className: 'insp-sev insp-sev-' + (item.severity || 'low') }, severityLabel(item.severity)),
                      h('span', { className: 'insp-status insp-status-' + item.status }, statusLabel(item.status))
                    )
                  ),
                  h('div', { className: 'insp-case-row-time' }, formatTime(item.updatedAt))
                )
              })
        ),
        h('div', { className: 'insp-detail' },
          !detail
            ? h('div', { className: 'insp-empty' }, '选择左侧工单查看详情，或新建工单后发送到 Assistant 分析。')
            : h('div', { className: 'insp-detail-body' },
                h('div', { className: 'insp-detail-header' },
                  h('div', { className: 'insp-detail-title-row' },
                    h('h3', null, displayText(detail.title) || detail.caseNo),
                    h('span', { className: 'insp-status insp-status-' + detail.status }, statusLabel(detail.status))
                  ),
                  h('div', { className: 'insp-detail-meta' },
                    h('span', { className: 'insp-tag' }, detail.caseNo),
                    detail.deviceType ? h('span', { className: 'insp-tag' }, displayText(detail.deviceType)) : null,
                    h('span', { className: 'insp-sev insp-sev-' + (detail.severity || 'low') }, severityLabel(detail.severity)),
                    h('span', { className: 'insp-muted' }, '更新于 ' + formatTime(detail.updatedAt))
                  )
                ),
                h('div', { className: 'insp-section' },
                  h('div', { className: 'insp-section-title' }, '故障描述'),
                  h('p', { className: 'insp-text' }, displayText(detail.faultDescription) || '（无）'),
                  detail.impact ? h('p', { className: 'insp-text insp-muted' }, '影响范围：' + displayText(detail.impact)) : null
                ),
                detail.failureReason
                  ? h('div', { className: 'insp-section insp-section-failed' },
                      h('div', { className: 'insp-section-title' }, '处理失败'),
                      h('p', { className: 'insp-text' }, displayText(detail.failureReason)),
                      h('p', { className: 'insp-muted' }, '已重试 ' + (detail.retryCount || 0) + ' 次'),
                      h('button', { className: 'insp-button insp-button-warn', disabled: busy, onClick: retryAnalysis }, '重置并重试')
                    )
                  : null,
                h('div', { className: 'insp-section' },
                  h('div', { className: 'insp-section-title' }, 'AI 结构化解析'),
                  detail.aiAnalysis && Object.keys(detail.aiAnalysis).length > 0
                    ? h('div', { className: 'insp-analysis-grid' },
                        analysisItem('故障类别', detail.aiAnalysis.faultCategory),
                        analysisItem('紧急程度', detail.aiAnalysis.severity ? severityLabel(detail.aiAnalysis.severity) : null),
                        analysisItem('影响范围', detail.aiAnalysis.impact),
                        analysisItem('故障摘要', detail.aiAnalysis.faultSummary),
                        detail.aiAnalysis.possibleCauses && detail.aiAnalysis.possibleCauses.length > 0
                          ? h('div', { className: 'insp-analysis-item insp-analysis-wide' },
                              h('div', { className: 'insp-analysis-label' }, '可能原因'),
                              h('ul', { className: 'insp-list' },
                                detail.aiAnalysis.possibleCauses.map(function (cause, index) {
                                  return h('li', { key: index }, displayText(cause))
                                })
                              )
                            )
                          : null
                      )
                    : h('p', { className: 'insp-muted' }, '尚未分析，点击「发送到 Assistant 分析」。')
                ),
                h('div', { className: 'insp-section' },
                  h('div', { className: 'insp-section-title' }, '历史处理方案检索'),
                  detail.historyReferences && detail.historyReferences.length > 0
                    ? detail.historyReferences.map(function (ref) {
                        return h('div', { key: ref.id, className: 'insp-history-card' },
                          h('div', { className: 'insp-history-head' },
                            h('span', { className: 'insp-tag' }, displayText(ref.deviceType) || '未分类'),
                            h('span', { className: 'insp-tag' }, displayText(ref.faultCategory) || '未分类'),
                            ref.sourceCaseNo ? h('span', { className: 'insp-muted' }, '来源 ' + ref.sourceCaseNo) : h('span', { className: 'insp-muted' }, '内置知识库')
                          ),
                          h('p', { className: 'insp-text' }, displayText(ref.description)),
                          h('div', { className: 'insp-history-resolution' }, '处理方案：' + displayText(ref.resolution)),
                          ref.effectiveness ? h('p', { className: 'insp-muted' }, '效果：' + displayText(ref.effectiveness)) : null
                        )
                      })
                    : h('p', { className: 'insp-muted' }, '暂无可引用的历史方案。')
                ),
                h('div', { className: 'insp-section' },
                  h('div', { className: 'insp-section-title' }, 'AI 处理建议'),
                  detail.recommendedAction
                    ? h('div', { className: 'insp-recommendation' }, renderMultiline(displayText(detail.recommendedAction)))
                    : h('p', { className: 'insp-muted' }, 'AI 尚未给出建议。')
                ),
                h('div', { className: 'insp-section' },
                  h('div', { className: 'insp-section-title' }, '处理结果'),
                  detail.resolution
                    ? h('div', { className: 'insp-resolution-done' },
                        h('p', { className: 'insp-text' }, renderMultiline(displayText(detail.resolution))),
                        h('p', { className: 'insp-muted' },
                          '由 ' + (displayText(detail.resolvedBy) || '未知') + ' 于 ' + formatTime(detail.resolvedAt) + ' 确认')
                      )
                    : h('div', { className: 'insp-confirm-form' },
                        h('textarea', {
                          className: 'insp-textarea',
                          placeholder: '填写/修改最终处理方案，确认后将沉淀到历史方案库…',
                          value: resolution,
                          rows: 4,
                          onChange: function (event) { setResolution(event.target.value) }
                        }),
                        h('div', { className: 'insp-confirm-row' },
                          h('label', { className: 'insp-checkbox' },
                            h('input', {
                              type: 'checkbox',
                              checked: closeAfterConfirm,
                              onChange: function (event) { setCloseAfterConfirm(event.target.checked) }
                            }),
                            '确认后关闭工单'
                          ),
                          h('input', {
                            className: 'insp-input insp-input-inline',
                            placeholder: '处理人（可选）',
                            value: resolvedBy,
                            onChange: function (event) { setResolvedBy(event.target.value) }
                          })
                        ),
                        h('button', { className: 'insp-button insp-button-primary', disabled: busy || !resolution.trim(), onClick: confirmResolution }, '确认处理方案')
                      )
                ),
                h('div', { className: 'insp-detail-actions' },
                  h('button', { className: 'insp-button insp-button-accent', disabled: busy, onClick: sendToAssistant }, '发送到 Assistant 分析'),
                  h('button', { className: 'insp-button insp-button-danger', disabled: busy, onClick: deleteCase }, '删除工单')
                )
              )
        )
      ),
      showCreate
        ? h('div', { className: 'insp-modal-mask', onClick: function () { setShowCreate(false) } },
            h('div', { className: 'insp-modal', onClick: function (event) { event.stopPropagation() } },
              h('h3', null, '新建巡检工单'),
              h('label', { className: 'insp-field-label' }, '工单标题 *'),
              h('input', {
                className: 'insp-input',
                placeholder: '如：晋中 XX 基站 BBU 反复掉电',
                value: createForm.title,
                onChange: function (event) { setCreateForm(Object.assign({}, createForm, { title: event.target.value })) }
              }),
              h('label', { className: 'insp-field-label' }, '设备类型'),
              h('input', {
                className: 'insp-input',
                placeholder: '如：BBU / RRU / 传输设备 / 动环监控',
                value: createForm.deviceType,
                onChange: function (event) { setCreateForm(Object.assign({}, createForm, { deviceType: event.target.value })) }
              }),
              h('label', { className: 'insp-field-label' }, '故障描述 *'),
              h('textarea', {
                className: 'insp-textarea',
                placeholder: '描述故障现象、告警信息、影响范围…',
                rows: 5,
                value: createForm.faultDescription,
                onChange: function (event) { setCreateForm(Object.assign({}, createForm, { faultDescription: event.target.value })) }
              }),
              h('label', { className: 'insp-field-label' }, '紧急程度'),
              h('select', {
                className: 'insp-input',
                value: createForm.severity || '',
                onChange: function (event) { setCreateForm(Object.assign({}, createForm, { severity: event.target.value })) }
              },
                h('option', { value: '' }, '未指定'),
                h('option', { value: 'low' }, '低'),
                h('option', { value: 'medium' }, '中'),
                h('option', { value: 'high' }, '高'),
                h('option', { value: 'critical' }, '严重')
              ),
              h('label', { className: 'insp-field-label' }, '影响范围'),
              h('input', {
                className: 'insp-input',
                placeholder: '如：影响 3 个小区',
                value: createForm.impact,
                onChange: function (event) { setCreateForm(Object.assign({}, createForm, { impact: event.target.value })) }
              }),
              h('div', { className: 'insp-modal-actions' },
                h('button', { className: 'insp-button', onClick: function () { setShowCreate(false) } }, '取消'),
                h('button', { className: 'insp-button insp-button-primary', disabled: busy, onClick: createCase }, '创建工单')
              )
            )
          )
        : null
    )
  }

  function emptyCreateForm() {
    return { title: '', deviceType: '', faultDescription: '', severity: '', impact: '' }
  }

  function analysisItem(label, value) {
    if (!value) return null
    return h('div', { className: 'insp-analysis-item' },
      h('div', { className: 'insp-analysis-label' }, label),
      h('div', { className: 'insp-analysis-value' }, displayText(value))
    )
  }

  function isActiveDetail(detail) {
    if (!detail) return false
    return detail.status === 'analyzing' || detail.status === 'analyzed' || detail.status === 'reviewing'
  }

  function countByStatus(cases, status) {
    return cases.filter(function (item) { return item.status === status }).length
  }

  function buildAnalyzePrompt(detail) {
    var lines = [
      '请分析巡检工单并给出处理建议：',
      '工单：' + displayText(detail.title) + '（' + detail.caseNo + '）',
      'caseId: ' + detail.id
    ]
    if (detail.deviceType) {
      lines.push('设备类型: ' + displayText(detail.deviceType))
    }
    lines.push('故障描述: ' + displayText(detail.faultDescription))
    if (detail.impact) {
      lines.push('影响范围: ' + displayText(detail.impact))
    }
    lines.push('请调用 inspection_analyze_fault 保存结构化解析，调用 inspection_search_history 检索历史处理方案，最后调用 inspection_save_recommendation 保存处理建议。')
    return lines.join('\n')
  }

  function renderMultiline(text) {
    if (!text) return null
    return text.split('\n').map(function (line, index) {
      return h('div', { key: index }, line || '\u00A0')
    })
  }

  function severityLabel(value) {
    var map = { low: '低', medium: '中', high: '高', critical: '严重' }
    return map[value] || '未指定'
  }

  function statusLabel(value) {
    var map = {
      draft: '草稿',
      analyzing: '分析中',
      analyzed: '已分析',
      reviewing: '待确认',
      confirmed: '已确认',
      closed: '已关闭',
      failed: '失败'
    }
    return map[value] || value || '未知'
  }

  function displayText(value) {
    if (value == null) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'object' && value.zh_Hans) return value.zh_Hans
    if (typeof value === 'object' && value.en_US) return value.en_US
    return String(value)
  }

  function resolveMessage(message) {
    if (!message) return ''
    if (typeof message === 'string') return message
    return message.zh_Hans || message.en_US || ''
  }

  function formatTime(value) {
    if (!value) return ''
    var date = new Date(value)
    if (isNaN(date.getTime())) return value
    var pad = function (n) { return String(n).padStart(2, '0') }
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  }

  function getErrorMessage(error) {
    return error && error.message ? error.message : '操作失败'
  }

  function injectStyles() {
    var style = document.createElement('style')
    style.textContent = [
      '.insp-app { display: grid; grid-auto-rows: max-content; align-content: start; gap: 12px; min-height: 560px; padding: 12px; color: var(--xui-color-foreground, #1a1b1c); background: linear-gradient(180deg, color-mix(in srgb, var(--xui-color-muted, #eef0f3) 55%, var(--xui-color-background, #ffffff) 45%), var(--xui-color-background, #ffffff)); font-family: "PingFang SC", "Microsoft YaHei", Roboto, Segoe UI, Arial, sans-serif; box-sizing: border-box; }',
      '.insp-app *, .insp-app *::before, .insp-app *::after { box-sizing: border-box; }',
      '.insp-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 4px 2px 10px; border-bottom: 1px solid var(--xui-color-border, #e4e3dd); }',
      '.insp-title-block { display: grid; gap: 4px; min-width: 0; }',
      '.insp-eyebrow { color: var(--xui-color-muted-foreground, #6b7280); font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }',
      '.insp-header h2 { margin: 0; font-size: 21px; line-height: 1.2; }',
      '.insp-header p { margin: 0; color: var(--xui-color-muted-foreground, #6b7280); font-size: 12px; line-height: 1.45; }',
      '.insp-header-actions { display: flex; gap: 8px; flex-shrink: 0; }',
      '.insp-stats { display: flex; gap: 10px; flex-wrap: wrap; }',
      '.insp-stat { flex: 1 1 120px; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--xui-color-card, #ffffff) 90%, var(--xui-color-muted, #eef0f3) 10%); border: 0.5px solid rgba(0,0,0,0.08); }',
      '.insp-stat-value { font-size: 20px; font-weight: 700; color: var(--xui-color-primary, #0e7490); }',
      '.insp-stat-label { font-size: 11px; color: var(--xui-color-muted-foreground, #6b7280); margin-top: 2px; }',
      '.insp-search-bar { display: flex; gap: 8px; }',
      '.insp-input { flex: 1; min-width: 0; padding: 8px 10px; font-size: 13px; border: 1px solid var(--xui-color-border, #e4e3dd); border-radius: 8px; background: var(--xui-color-card, #ffffff); color: var(--xui-color-foreground, #1a1b1c); outline: none; }',
      '.insp-input:focus { border-color: var(--xui-color-primary, #0e7490); }',
      '.insp-input-inline { flex: 0 1 160px; }',
      '.insp-textarea { width: 100%; padding: 8px 10px; font-size: 13px; line-height: 1.55; border: 1px solid var(--xui-color-border, #e4e3dd); border-radius: 8px; background: var(--xui-color-card, #ffffff); color: var(--xui-color-foreground, #1a1b1c); outline: none; resize: vertical; font-family: inherit; }',
      '.insp-textarea:focus { border-color: var(--xui-color-primary, #0e7490); }',
      '.insp-button { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; font-size: 13px; font-weight: 600; border: 1px solid var(--xui-color-border, #e4e3dd); border-radius: 8px; background: var(--xui-color-card, #ffffff); color: var(--xui-color-foreground, #1a1b1c); cursor: pointer; }',
      '.insp-button:disabled { opacity: 0.5; cursor: not-allowed; }',
      '.insp-button-primary { background: var(--xui-color-primary, #0e7490); border-color: transparent; color: #ffffff; }',
      '.insp-button-accent { border-color: color-mix(in srgb, var(--xui-color-primary, #0e7490) 40%, var(--xui-color-border, #e4e3dd)); color: var(--xui-color-primary, #0e7490); font-weight: 700; }',
      '.insp-button-warn { color: #b45309; border-color: #fbbf24; }',
      '.insp-button-danger { color: var(--xui-color-destructive, #dc2626); }',
      '.insp-layout { display: grid; grid-template-columns: minmax(300px, 2fr) minmax(0, 5fr); gap: 12px; align-items: start; }',
      '@media (max-width: 900px) { .insp-layout { grid-template-columns: 1fr; } }',
      '.insp-list { display: grid; gap: 8px; max-height: 640px; overflow-y: auto; padding-right: 2px; }',
      '.insp-case-row { padding: 10px 12px; border: 1px solid var(--xui-color-border, #e4e3dd); border-radius: 10px; background: var(--xui-color-card, #ffffff); cursor: pointer; display: flex; justify-content: space-between; gap: 10px; }',
      '.insp-case-row:hover { border-color: var(--xui-color-primary, #0e7490); }',
      '.insp-case-row-active { border-color: var(--xui-color-primary, #0e7490); box-shadow: 0 0 0 1px var(--xui-color-primary, #0e7490); }',
      '.insp-case-row-main { min-width: 0; display: grid; gap: 6px; }',
      '.insp-case-row-title { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.insp-case-row-meta { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }',
      '.insp-case-row-time { font-size: 11px; color: var(--xui-color-muted-foreground, #6b7280); flex-shrink: 0; }',
      '.insp-tag { display: inline-flex; align-items: center; padding: 2px 8px; font-size: 11px; border-radius: 999px; background: color-mix(in srgb, var(--xui-color-muted, #eef0f3) 70%, transparent); color: var(--xui-color-muted-foreground, #6b7280); white-space: nowrap; }',
      '.insp-sev { display: inline-flex; align-items: center; padding: 2px 8px; font-size: 11px; border-radius: 999px; font-weight: 600; white-space: nowrap; }',
      '.insp-sev-low { background: #dcfce7; color: #166534; }',
      '.insp-sev-medium { background: #fef9c3; color: #854d0e; }',
      '.insp-sev-high { background: #ffedd5; color: #9a3412; }',
      '.insp-sev-critical { background: #fee2e2; color: #991b1b; }',
      '.insp-status { display: inline-flex; align-items: center; padding: 2px 8px; font-size: 11px; border-radius: 999px; font-weight: 600; white-space: nowrap; }',
      '.insp-status-draft { background: #f3f4f6; color: #374151; }',
      '.insp-status-analyzing { background: #dbeafe; color: #1e40af; }',
      '.insp-status-analyzed { background: #cffafe; color: #155e75; }',
      '.insp-status-reviewing { background: #ede9fe; color: #5b21b6; }',
      '.insp-status-confirmed { background: #dcfce7; color: #166534; }',
      '.insp-status-closed { background: #e5e7eb; color: #374151; }',
      '.insp-status-failed { background: #fee2e2; color: #991b1b; }',
      '.insp-detail { min-width: 0; }',
      '.insp-detail-body { display: grid; gap: 12px; }',
      '.insp-detail-header { padding: 12px 14px; border-radius: 12px; background: var(--xui-color-card, #ffffff); border: 0.5px solid rgba(0,0,0,0.08); }',
      '.insp-detail-title-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }',
      '.insp-detail-title-row h3 { margin: 0; font-size: 17px; line-height: 1.3; }',
      '.insp-detail-meta { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 8px; }',
      '.insp-section { padding: 12px 14px; border-radius: 12px; background: var(--xui-color-card, #ffffff); border: 0.5px solid rgba(0,0,0,0.08); display: grid; gap: 8px; }',
      '.insp-section-failed { border-color: #fecaca; background: color-mix(in srgb, #fee2e2 30%, var(--xui-color-card, #ffffff)); }',
      '.insp-section-title { font-size: 12px; font-weight: 700; color: var(--xui-color-muted-foreground, #6b7280); text-transform: uppercase; letter-spacing: 0.04em; }',
      '.insp-text { margin: 0; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }',
      '.insp-muted { margin: 0; font-size: 12px; color: var(--xui-color-muted-foreground, #6b7280); }',
      '.insp-analysis-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; }',
      '.insp-analysis-item { padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--xui-color-muted, #eef0f3) 55%, transparent); }',
      '.insp-analysis-wide { grid-column: 1 / -1; }',
      '.insp-analysis-label { font-size: 11px; color: var(--xui-color-muted-foreground, #6b7280); margin-bottom: 3px; }',
      '.insp-analysis-value { font-size: 13px; font-weight: 600; line-height: 1.5; }',
      '.insp-list { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.7; }',
      '.insp-history-card { padding: 10px 12px; border: 1px solid var(--xui-color-border, #e4e3dd); border-radius: 10px; display: grid; gap: 6px; }',
      '.insp-history-head { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }',
      '.insp-history-resolution { font-size: 13px; line-height: 1.6; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--xui-color-primary, #0e7490) 8%, transparent); }',
      '.insp-recommendation { padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, #fef9c3 45%, var(--xui-color-card, #ffffff)); font-size: 13px; line-height: 1.7; }',
      '.insp-resolution-done { padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, #dcfce7 45%, var(--xui-color-card, #ffffff)); display: grid; gap: 6px; }',
      '.insp-confirm-form { display: grid; gap: 8px; }',
      '.insp-confirm-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }',
      '.insp-checkbox { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--xui-color-foreground, #1a1b1c); cursor: pointer; }',
      '.insp-detail-actions { display: flex; gap: 8px; flex-wrap: wrap; }',
      '.insp-empty { padding: 28px 16px; text-align: center; color: var(--xui-color-muted-foreground, #6b7280); font-size: 13px; border: 1px dashed var(--xui-color-border, #e4e3dd); border-radius: 12px; background: color-mix(in srgb, var(--xui-color-card, #ffffff) 70%, transparent); }',
      '.insp-modal-mask { position: fixed; inset: 0; z-index: 10; display: flex; align-items: flex-start; justify-content: center; padding: 48px 16px; background: rgba(0,0,0,0.35); overflow-y: auto; }',
      '.insp-modal { width: 100%; max-width: 480px; padding: 16px 18px; border-radius: 14px; background: var(--xui-color-card, #ffffff); box-shadow: 0 12px 32px rgba(0,0,0,0.18); display: grid; gap: 8px; }',
      '.insp-modal h3 { margin: 0 0 6px; font-size: 17px; }',
      '.insp-field-label { font-size: 12px; font-weight: 600; color: var(--xui-color-muted-foreground, #6b7280); margin-top: 4px; }',
      '.insp-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }'
    ].join('\n')
    document.head.appendChild(style)
  }

  ReactDOM.createRoot(document.getElementById('root')).render(h(App))
})()
