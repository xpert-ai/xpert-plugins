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

  async function toFilePayload(file) {
    const buffer = await file.arrayBuffer()
    return {
      payload: {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        buffer
      },
      transfer: [buffer]
    }
  }

  function executeAction(actionKey, targetId, input, parameters) {
    return request('executeAction', {
      actionKey,
      targetId,
      input,
      parameters
    })
  }

  async function executeFileAction(actionKey, file, input, parameters) {
    const filePayload = await toFilePayload(file)
    return request(
      'executeFileAction',
      {
        actionKey,
        file: filePayload.payload,
        input,
        parameters
      },
      filePayload.transfer
    )
  }

  function notify(level, message) {
    post('notify', { level, message })
  }

  function App() {
    const [context, setContext] = React.useState(null)
    const [data, setData] = React.useState(null)
    const [selectedCaseId, setSelectedCaseId] = React.useState(null)
    const [search, setSearch] = React.useState('')
    const [busy, setBusy] = React.useState(false)
    const [xpertId, setXpertId] = React.useState('')
    const createRequirementInput = React.useRef(null)
    const autoRefreshRef = React.useRef(null)
    const autoRefreshRunningRef = React.useRef(false)
    const selectedCaseIdRef = React.useRef(null)
    const dataRef = React.useRef(null)
    const busyRef = React.useRef(false)

    React.useEffect(() => {
      window.__procurementSetContext = (nextContext) => {
        setContext(nextContext)
        setData(nextContext.payload || null)
        setTimeout(() => reload(null, nextContext), 0)
      }
      window.__procurementHandleHostEvent = () => {
        reload()
      }
      post('ready')
      return () => {
        window.__procurementSetContext = null
        window.__procurementHandleHostEvent = null
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
    }, [data, selectedCaseId, busy])

    async function reload(nextCaseId, nextContext, options) {
      const silent = options && options.silent === true
      const activeContext = nextContext || context
      if (!activeContext) return
      const caseId = nextCaseId === undefined ? selectedCaseId : nextCaseId
      if (!silent) setBusy(true)
      try {
        const response = await request('requestData', {
          query: {
            page: 1,
            pageSize: 20,
            search,
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

    function startAutoRefresh(caseId, latestData) {
      stopAutoRefresh()
      const currentData = latestData || dataRef.current
      const currentDetail = currentData && currentData.item ? currentData.item : null
      if (!caseId || (currentDetail && !shouldKeepAutoRefresh(currentDetail))) {
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
          const nextDetail = nextData && nextData.item ? nextData.item : null
          if (nextDetail && !shouldKeepAutoRefresh(nextDetail)) {
            stopAutoRefresh()
          }
        } finally {
          autoRefreshRunningRef.current = false
        }
      }, 3000)
    }

    async function createCaseFromRequirementFile(file) {
      if (!file) return
      setBusy(true)
      try {
        const response = await executeFileAction('create_case_from_requirement_file', file, { name: file.name }, {})
        const result = getResponsePayload(response)
        if (result && result.success === false) {
          throw new Error(resolveMessage(result.message) || '创建采购项目失败')
        }
        const payload = result && result.data ? result.data : result
        const created = payload && payload.case ? payload.case : payload
        const caseId = created && created.id
        notify('success', '已根据采购需求单创建项目')
        await reload(caseId || null)
      } catch (error) {
        notify('error', getErrorMessage(error))
      } finally {
        setBusy(false)
      }
    }

    async function uploadFile(actionKey, file, roleInput) {
      if (!selectedCaseId || !file) return
      setBusy(true)
      try {
        const response = await executeFileAction(actionKey, file, Object.assign({ caseId: selectedCaseId, name: file.name }, roleInput || {}), {
          caseId: selectedCaseId
        })
        const result = getResponsePayload(response)
        if (result && result.success === false) {
          throw new Error(resolveMessage(result.message) || '文件登记失败')
        }
        notify('success', '文件已登记')
        await reload(selectedCaseId)
      } catch (error) {
        notify('error', getErrorMessage(error))
      } finally {
        setBusy(false)
      }
    }

    async function deleteCase(caseId, title) {
      if (!caseId || busy) return
      const displayTitle = displayText(title) || '该采购项目'
      if (!window.confirm(`确认删除「${displayTitle}」？删除后项目、文件、解析任务、报价和比价结果都会移除。`)) {
        return
      }

      setBusy(true)
      try {
        const response = await executeAction('delete_comparison_case', caseId, { caseId }, { caseId })
        const result = getResponsePayload(response)
        if (result && result.success === false) {
          throw new Error(resolveMessage(result.message) || '删除失败')
        }
        notify('success', '采购项目已删除')
        await reload(null)
      } catch (error) {
        notify('error', getErrorMessage(error))
      } finally {
        setBusy(false)
      }
    }

    async function runAction(actionKey) {
      if (!selectedCaseId) return
      const detail = data && data.item
      const configuredXpertId = xpertId || (detail && detail.case && detail.case.xpertId) || ''
      setBusy(true)
      try {
        const response = await executeAction(
          actionKey,
          selectedCaseId,
          {
            caseId: selectedCaseId,
            xpertId: configuredXpertId,
            maxConcurrency: 2
          },
          { caseId: selectedCaseId }
        )
        const result = getResponsePayload(response)
        if (result && result.success === false) {
          throw new Error(resolveMessage(result.message) || '操作失败')
        }
        const payload = result && result.data ? result.data : result
        const dispatched = await dispatchAssistantCommands(payload, async (command, commandResult) => {
          if (!command.parseJobId) return
          await executeAction(
            'mark_parse_message_dispatched',
            command.caseId || selectedCaseId,
            {
              caseId: command.caseId || selectedCaseId,
              parseJobId: command.parseJobId,
              clientMessageId: commandResult.clientMessageId || command.payload.clientMessageId,
              conversationId: commandResult.conversationId,
              threadId: commandResult.threadId
            },
            { caseId: command.caseId || selectedCaseId }
          )
        })
        notify('success', dispatched ? `已发送 ${dispatched} 条任务给 Xpert，解析结果会自动刷新` : '操作已提交')
        const latestData = await reload(selectedCaseId)
        if (dispatched) {
          startAutoRefresh(selectedCaseId, latestData)
        }
      } catch (error) {
        notify('error', getErrorMessage(error))
      } finally {
        setBusy(false)
      }
    }

    const isDetail = Boolean(selectedCaseId && data && data.item)

    return h(
      'div',
      { className: 'proc-app' },
      h(
        'div',
        { className: 'proc-header' },
        h(
          'div',
          { className: 'proc-title-block' },
          h('span', { className: 'proc-eyebrow' }, 'AI Procurement Workspace'),
          h('h2', null, isDetail && data && data.item && data.item.case ? displayText(data.item.case.title) || '采购项目' : '采购比价助手'),
          h('p', null, isDetail ? '需求解析、报价比对、风险建议集中处理' : '上传采购需求单，创建项目并进入比价流程')
        ),
        h(
          'div',
          { className: 'proc-header-actions' },
          isDetail
            ? h(
                'button',
                {
                  className: 'xui-button proc-back-button',
                  onClick: () => {
                    setSelectedCaseId(null)
                    reload(null)
                  },
                  disabled: busy
                },
                h('i', { className: 'ri-arrow-left-line' }),
                h('span', null, '返回项目列表')
              )
            : null,
          isDetail && data && data.item && data.item.case
            ? h(
                'button',
                {
                  className: 'xui-button xui-button-soft proc-danger-button',
                  onClick: () => deleteCase(data.item.case.id, data.item.case.title),
                  disabled: busy
                },
                h('i', { className: 'ri-delete-bin-line' }),
                h('span', null, '删除')
              )
            : null,
          h(
            'button',
            { className: 'xui-button xui-button-soft', onClick: () => reload(selectedCaseId), disabled: busy },
            busy ? '处理中...' : '刷新'
          )
        )
      ),
      isDetail ? renderDetail(data.item, xpertId, setXpertId, uploadFile, runAction, busy) : renderList()
    )

    function renderList() {
      const items = data && Array.isArray(data.items) ? data.items : []
      const summary = getListSummary(items)
      return h(
        'div',
        { className: 'proc-list-page' },
        h(
          'section',
          { className: 'proc-list-overview' },
          h('input', {
            ref: createRequirementInput,
            className: 'proc-hidden-file',
            type: 'file',
            accept: '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg',
            onChange: (event) => {
              const file = event.target.files && event.target.files[0]
              if (file) createCaseFromRequirementFile(file)
              event.target.value = ''
            }
          }),
          h(
            'button',
            {
              className: 'proc-upload-hero',
              onClick: () => createRequirementInput.current && createRequirementInput.current.click(),
              disabled: busy
            },
            h('span', { className: 'proc-upload-mark' }, 'PR'),
            h('span', { className: 'proc-upload-copy' }, h('strong', null, '上传采购需求单'), h('small', null, '创建项目后进入解析和比价')),
            h('span', { className: 'proc-upload-arrow' }, '>')
          ),
          h(
            'div',
            { className: 'proc-list-stats' },
            dashboardMetric('项目', summary.total),
            dashboardMetric('解析中', summary.active),
            dashboardMetric('有风险', summary.risky),
            dashboardMetric('已完成', summary.completed)
          )
        ),
        h(
          'section',
          { className: 'proc-panel' },
          h(
            'div',
            { className: 'proc-list-toolbar' },
            h('div', null, h('div', { className: 'proc-panel-title' }, '采购项目'), h('div', { className: 'proc-panel-subtitle' }, `${items.length} 个项目`)),
            h('input', {
              className: 'xui-input',
              placeholder: '搜索项目名称、采购编号、供应商',
              value: search,
              onChange: (event) => setSearch(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') reload(null)
              }
            })
          ),
          items.length
            ? h(
                'div',
                { className: 'proc-case-list proc-case-ledger' },
                h(
                  'div',
                  { className: 'proc-case-row proc-case-head' },
                  h('span', null, '采购项目'),
                  h('span', null, '状态'),
                  h('span', null, '供应商 / 风险'),
                  h('span', null, 'AI 推荐'),
                  h('span', null, '操作')
                ),
                items.map((item) => renderCaseCard(item))
              )
            : h(
                'div',
                { className: 'proc-empty-state' },
                h('strong', null, '暂无采购项目'),
                h('span', null, '上传采购需求单后，项目会出现在这里。')
              )
        )
      )

      function renderCaseCard(item) {
        return h(
          'div',
          {
            key: item.id,
            className: 'proc-case-card'
          },
          h(
            'button',
            {
              className: 'proc-case-open',
              onClick: () => reload(item.id),
              disabled: busy
            },
            h(
              'div',
              { className: 'proc-case-main' },
              h('div', { className: 'proc-case-title' }, displayText(item.title) || '-'),
              h('div', { className: 'proc-case-meta' }, h('span', null, displayText(item.purchaseNo) || '-'), h('span', null, displayText(item.applicant) || '申请人待解析'))
            ),
            h('div', { className: 'proc-case-status' }, statusPill(item.status)),
            h(
              'div',
              { className: 'proc-case-stats' },
              compactMetric('供应商', item.supplierCount || 0),
              compactMetric('风险', item.riskCount || 0)
            ),
            h('div', { className: 'proc-case-summary' }, displayText(item.recommendationSummary) || '等待 AI 生成比价建议')
          ),
          h(
            'button',
            {
              className: 'proc-case-delete',
              title: '删除采购项目',
              'aria-label': '删除采购项目',
              onClick: (event) => {
                event.stopPropagation()
                deleteCase(item.id, item.title)
              },
              disabled: busy
            },
            h('span', null, '删')
          )
        )
      }
    }
  }

  function renderDetail(detail, xpertId, setXpertId, uploadFile, runAction, busy) {
    const item = detail.case || {}
    const documents = detail.documents || []
    const requirementDocs = documents.filter((document) => document.role === 'requirement')
    const quoteDocs = documents.filter((document) => document.role === 'supplier_quote')
    const supplierQuotes = detail.supplierQuotes || []
    const requirementItems = detail.requirementItems || []
    const quoteItems = detail.quoteItems || []
    const risks = detail.risks || []
    const recommendation = detail.recommendation
    const configuredXpertId = xpertId || item.xpertId || ''
    const supplierNameByQuoteId = supplierQuotes.reduce((map, quote) => {
      if (quote.id) map[quote.id] = displayText(quote.supplierName) || quote.id
      return map
    }, {})

    return h(
      'div',
      { className: 'proc-detail-page' },
      h(
        'section',
        { className: 'proc-detail-hero' },
        h(
          'div',
          { className: 'proc-detail-title' },
          statusPill(item.status),
          h('h3', null, displayText(item.title) || '采购项目'),
          h('div', { className: 'proc-case-meta' }, h('span', null, displayText(item.purchaseNo) || '-'), h('span', null, displayText(item.expectedDeliveryDate) || '交期待解析'))
        ),
        h(
          'div',
          { className: 'proc-hero-metrics' },
          metric('供应商', supplierQuotes.length || item.supplierCount || 0),
          metric('风险', risks.length || item.riskCount || 0),
          metric('需求项', requirementItems.length)
        )
      ),
      h(
        'section',
        { className: 'proc-flow-panel' },
        renderProgressStrip(detail),
        h(
          'div',
          { className: 'proc-workflow-bar' },
          actionButton('解析采购需求', 'ri-file-search-line', () => runAction('start_requirement_parse'), busy || !configuredXpertId),
          actionButton('批量解析报价单', 'ri-stack-line', () => runAction('start_supplier_quote_parse_batch'), busy || !configuredXpertId),
          actionButton('一键解析全部', 'ri-flashlight-line', () => runAction('one_click_parse_all'), busy || !configuredXpertId, true),
          actionButton('生成比价结果', 'ri-scales-3-line', () => runAction('generate_comparison_result'), busy || !configuredXpertId)
        )
      ),
      configuredXpertId
        ? null
        : h('div', { className: 'xui-notice' }, '当前项目还没有绑定采购比价 Xpert。请在数字专家工作台中打开，或填写 Xpert ID。'),
      h(
        'section',
        { className: 'proc-detail-grid' },
        h(
          'div',
          { className: 'proc-main-column' },
          recommendation ? renderRecommendationPanel(recommendation, risks) : null,
          h(
            'section',
            { className: 'proc-panel proc-summary-panel' },
            panelHeader('需求摘要', 'AI 解析后自动补全项目信息'),
            h(
              'div',
              { className: 'proc-kv-grid' },
              labelValue('申请人', item.applicant),
              labelValue('部门', item.department),
              labelValue('预算', item.budgetAmount),
              labelValue('期望交期', item.expectedDeliveryDate)
            ),
            requirementItems.length
              ? simpleTable(['采购项', '规格', '数量', '预算', '交期'], requirementItems, (row) => [
                  row.name,
                  row.specification,
                  formatQuantity(row.quantity, row.unit),
                  row.budgetAmount,
                  row.expectedDeliveryDate
                ])
              : h('div', { className: 'proc-empty-state' }, h('strong', null, '等待解析采购需求'), h('span', null, '点击“解析采购需求”后，采购项会显示在这里。'))
          ),
          h(
            'section',
            { className: 'proc-panel' },
            panelHeader('横向比价', '按供应商展示报价、交期和条款'),
            quoteItems.length
              ? simpleTable(['供应商', '商品', '数量', '单价', '合计', '交期'], quoteItems, (row) => [
                  supplierNameByQuoteId[row.supplierQuoteId] || displayText(row.supplierName) || '未知供应商',
                  row.productName,
                  formatQuantity(row.quantity, row.unit),
                  row.unitPrice,
                  row.totalPrice,
                  row.deliveryTime
                ])
              : h('div', { className: 'proc-empty-state' }, h('strong', null, '还没有报价明细'), h('span', null, '上传供应商报价单并批量解析后生成横向比价。'))
          )
        ),
        h(
          'aside',
          { className: 'proc-side-column' },
          h(
            'section',
            { className: 'proc-panel' },
            panelHeader('材料', '需求单和供应商报价单'),
            uploadCard('采购需求单', requirementDocs, (file) => uploadFile('upload_requirement_file', file), '替换或补充需求材料'),
            uploadCard('供应商报价单', quoteDocs, (file) => uploadFile('upload_supplier_quote_file', file), '可批量上传多家报价')
          ),
          h(
            'section',
            { className: 'proc-panel' },
            panelHeader('供应商', '报价解析后自动生成'),
            supplierQuotes.length
              ? supplierQuotes.map((quote) =>
                  h(
                    'div',
                    { className: 'proc-supplier', key: quote.id },
                    h('div', null, h('strong', null, displayText(quote.supplierName)), h('span', null, displayText(quote.paymentTerms) || '付款条款待确认')),
                    h('div', null, h('span', null, displayText(quote.deliveryTime) || '交期待确认'), h('span', null, displayText(quote.warranty) || '质保待确认'))
                  )
                )
              : h('div', { className: 'proc-empty-state compact' }, h('span', null, '暂无供应商报价'))
          ),
          h(
            'section',
            { className: 'proc-panel proc-risk-panel' },
            panelHeader('风险异常', `${risks.length} 项风险`),
            risks.length
              ? risks.map((risk) =>
                h(
                  'div',
                  { className: 'proc-risk', key: risk.id },
                  statusPill(risk.severity),
                  h('strong', null, displayText(risk.title)),
                  h('p', null, displayText(risk.description)),
                  risk.suggestion ? h('p', { className: 'xui-muted' }, displayText(risk.suggestion)) : null
                )
            )
              : h('div', { className: 'proc-empty-state compact' }, h('span', null, '暂无风险项'))
          ),
          recommendation ? null : h(
            'section',
            { className: 'proc-panel proc-ai-panel' },
            panelHeader('AI 建议', '推荐结论和解释'),
            h('div', { className: 'proc-empty-state compact' }, h('span', null, '等待 AI 生成推荐结论'))
          ),
          h(
            'section',
            { className: 'proc-panel proc-xpert-config' },
            panelHeader('运行配置', '默认使用当前数字专家'),
            h('input', {
              className: 'xui-input',
              placeholder: '采购比价 Xpert ID',
              value: configuredXpertId,
              onChange: (event) => setXpertId(event.target.value)
            })
          )
        )
      )
    )
  }

  function renderRecommendationPanel(recommendation, risks) {
    const recommendedSupplier = displayText(recommendation.recommendedSupplier)
    return h(
      'section',
      { className: 'proc-panel proc-verdict-card' },
      h(
        'div',
        { className: 'proc-verdict-head' },
        h('div', { className: 'proc-verdict-icon' }, 'AI'),
        h(
          'div',
          { className: 'proc-verdict-title' },
          h('span', null, 'AI 建议'),
          h('h3', null, displayText(recommendation.summary) || '等待推荐结论')
        ),
        recommendedSupplier ? h('div', { className: 'proc-verdict-supplier' }, h('span', null, '推荐'), h('strong', null, recommendedSupplier)) : null
      ),
      h(
        'div',
        { className: 'proc-verdict-metrics' },
        compactMetric('推荐供应商', recommendedSupplier || '-'),
        compactMetric('风险项', risks.length),
        compactMetric('结论状态', displayText(recommendation.decision) || '待复核')
      ),
      recommendation.explanation
        ? h(
            'div',
            { className: 'proc-recommendation-body' },
            renderTextBlocks(recommendation.explanation)
          )
        : null,
      risks.length
        ? h(
            'div',
            { className: 'proc-verdict-footer' },
            h('span', null, `${risks.length} 项风险待复核`),
            risks.slice(0, 2).map((risk) => h('strong', { key: risk.id || risk.title }, displayText(risk.title)))
          )
        : null
    )
  }

  function renderTextBlocks(value) {
    const text = displayText(value) || ''
    const lines = text
      .replace(/\*\*/g, '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
    return lines.length
      ? lines.slice(0, 8).map((line, index) => h('p', { key: index }, line))
      : h('p', null, text)
  }

  function getListSummary(items) {
    return items.reduce(
      (summary, item) => {
        const status = item && item.status
        summary.total += 1
        if (status === 'queued' || status === 'parsing' || status === 'running') summary.active += 1
        if ((item && item.riskCount) > 0) summary.risky += 1
        if (status === 'completed' || status === 'parsed' || status === 'succeeded') summary.completed += 1
        return summary
      },
      { total: 0, active: 0, risky: 0, completed: 0 }
    )
  }

  function renderProgressStrip(detail) {
    const documents = detail.documents || []
    const requirementDocs = documents.filter((document) => document.role === 'requirement')
    const quoteDocs = documents.filter((document) => document.role === 'supplier_quote')
    const requirementItems = detail.requirementItems || []
    const quoteItems = detail.quoteItems || []
    const recommendation = detail.recommendation
    const steps = [
      { label: '需求单', state: requirementDocs.length ? 'done' : 'todo', value: requirementDocs.length ? `${requirementDocs.length} 份` : '未上传' },
      { label: '需求解析', state: requirementItems.length ? 'done' : 'todo', value: requirementItems.length ? `${requirementItems.length} 项` : '待解析' },
      { label: '报价单', state: quoteDocs.length ? 'done' : 'todo', value: quoteDocs.length ? `${quoteDocs.length} 份` : '未上传' },
      { label: '报价解析', state: quoteItems.length ? 'done' : 'todo', value: quoteItems.length ? `${quoteItems.length} 行` : '待解析' },
      { label: 'AI 建议', state: recommendation ? 'done' : 'todo', value: recommendation ? '已生成' : '待生成' }
    ]

    return h(
      'div',
      { className: 'proc-progress-strip' },
      steps.map((step, index) =>
        h(
          'div',
          { className: `proc-progress-step proc-progress-${step.state}`, key: step.label },
          h('span', { className: 'proc-progress-index' }, step.state === 'done' ? '✓' : index + 1),
          h('span', { className: 'proc-progress-copy' }, h('strong', null, step.label), h('small', null, step.value))
        )
      )
    )
  }

  function panelHeader(title, subtitle) {
    return h(
      'div',
      { className: 'proc-panel-head' },
      h('div', { className: 'proc-panel-title' }, title),
      subtitle ? h('div', { className: 'proc-panel-subtitle' }, subtitle) : null
    )
  }

  function actionButton(label, icon, onClick, disabled, primary) {
    return h(
      'button',
      {
        className: primary ? 'xui-button xui-button-primary proc-action-button' : 'xui-button xui-button-soft proc-action-button',
        onClick,
        disabled
      },
      icon ? h('i', { className: icon }) : null,
      h('span', null, label)
    )
  }

  function uploadCard(title, documents, onUpload, hint) {
    const inputId = `proc-file-${title}`
    return h(
      'div',
      { className: 'proc-upload-card' },
      h('input', {
        id: inputId,
        className: 'proc-hidden-file',
        type: 'file',
        onChange: (event) => {
          const file = event.target.files && event.target.files[0]
          if (file) onUpload(file)
          event.target.value = ''
        }
      }),
      h(
        'label',
        { className: 'proc-upload-card-label', htmlFor: inputId },
        h('span', null, title),
        h('strong', null, '+')
      ),
      hint ? h('div', { className: 'proc-upload-hint' }, hint) : null,
      h(
        'div',
        { className: 'proc-file-list' },
        documents.length
          ? documents.map((document) =>
              h(
                'div',
                { className: 'proc-file', key: document.id },
                h('span', null, displayText(document.name)),
                statusPill(document.extractionStatus || document.status)
              )
            )
          : h('div', { className: 'xui-muted' }, '暂无文件')
      )
    )
  }

  function simpleTable(headers, rows, projector) {
    if (!rows || !rows.length) {
      return h('div', { className: 'xui-empty' }, '暂无数据')
    }
    return h(
      'div',
      { className: 'xui-table-wrap' },
      h(
        'table',
        { className: 'xui-table' },
        h('thead', null, h('tr', null, headers.map((header) => h('th', { key: header }, header)))),
        h(
          'tbody',
          null,
          rows.map((row) =>
            h('tr', { key: row.id }, projector(row).map((value, index) => h('td', { key: index }, value === undefined ? '-' : displayText(value))))
          )
        )
      )
    )
  }

  function labelValue(label, value) {
    return h('div', { className: 'proc-kv' }, h('span', null, label), h('strong', null, displayText(value) || '-'))
  }

  function metric(label, value) {
    return h('div', { className: 'proc-metric' }, h('span', null, label), h('strong', null, value === undefined || value === null ? '-' : displayText(value)))
  }

  function compactMetric(label, value) {
    return h('div', { className: 'proc-compact-metric' }, h('span', null, label), h('strong', null, value === undefined || value === null ? '-' : displayText(value)))
  }

  function dashboardMetric(label, value) {
    return h('div', { className: 'proc-dashboard-metric' }, h('span', null, label), h('strong', null, value === undefined || value === null ? '-' : displayText(value)))
  }

  function formatQuantity(quantity, unit) {
    if (quantity === undefined || quantity === null) return undefined
    return `${quantity}${unit ? ` ${unit}` : ''}`
  }

  function displayText(value) {
    if (value === undefined || value === null) return value
    return repairUtf8Mojibake(String(value))
  }

  function repairUtf8Mojibake(value) {
    if (!looksLikeUtf8Mojibake(value) || typeof TextDecoder === 'undefined') {
      return value
    }

    try {
      const bytes = new Uint8Array(Array.from(value, (char) => char.charCodeAt(0) & 0xff))
      const repaired = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      return repaired.includes('\uFFFD') ? value : repaired
    } catch (_error) {
      return value
    }
  }

  function looksLikeUtf8Mojibake(value) {
    return /[ÃÂ][\x80-\xBF]?|[äåæçèéêëìíîïðñòóôõöøùúûüýþ][\x80-\xBF]/i.test(value)
  }

  function statusPill(status) {
    return h('span', { className: `xui-pill proc-status proc-status-${status || 'unknown'}` }, statusLabel(status))
  }

  function statusLabel(status) {
    const labels = {
      draft: '草稿',
      files_uploaded: '已上传',
      uploaded: '已上传',
      queued: '排队中',
      parsing: '解析中',
      parsed: '已解析',
      reviewing: '待复核',
      completed: '已完成',
      failed: '失败',
      succeeded: '成功',
      running: '运行中',
      interrupted: '已中断',
      extracted: '已抽取',
      unsupported: '暂不支持',
      low: '低风险',
      medium: '中风险',
      high: '高风险'
    }
    return labels[status] || status || '-'
  }

  function shouldKeepAutoRefresh(detail) {
    if (!detail || typeof detail !== 'object') return false
    if (hasActiveStatus(detail.documents)) return true

    const caseStatus = detail.case && detail.case.status
    if (caseStatus === 'parsing' && !hasParsedWorkbenchOutputs(detail)) {
      return true
    }

    return false
  }

  function hasActiveStatus(items) {
    return Array.isArray(items) && items.some((item) => {
      const status = item && item.status
      return status === 'queued' || status === 'parsing' || status === 'running'
    })
  }

  function hasParsedWorkbenchOutputs(detail) {
    return (
      hasItems(detail.requirementItems) ||
      hasItems(detail.supplierQuotes) ||
      hasItems(detail.quoteItems) ||
      hasItems(detail.itemMatches) ||
      hasItems(detail.risks) ||
      Boolean(detail.recommendation)
    )
  }

  function hasItems(value) {
    return Array.isArray(value) && value.length > 0
  }

  function getResponsePayload(response) {
    if (!response || typeof response !== 'object') return null
    if (response.data !== undefined) return response.data
    if (response.result !== undefined) return response.result
    if (response.payload !== undefined) return response.payload
    return response
  }

  async function dispatchAssistantCommands(payload, onDispatched) {
    const commands = collectAssistantCommands(payload)
    let dispatched = 0
    for (const command of commands) {
      const commandResponse = await withTimeout(
        request('invokeClientCommand', {
          commandKey: command.commandKey,
          payload: command.payload
        }),
        15000,
        'Assistant ChatKit 未响应，解析消息未发送。'
      )
      const commandResult = getResponsePayload(commandResponse)
      if (commandResult && commandResult.success === false) {
        throw new Error(commandResult.message || 'Assistant ChatKit 发送失败')
      }
      if (onDispatched) {
        await onDispatched(command, commandResult || {})
      }
      dispatched += 1
    }
    return dispatched
  }

  function collectAssistantCommands(payload) {
    if (!payload || typeof payload !== 'object') return []
    const commands = []
    if (Array.isArray(payload.messages)) {
      payload.messages.forEach((message) => {
        const command = normalizeAssistantCommand(message)
        if (command) commands.push(command)
      })
    }
    const directCommand = normalizeAssistantCommand(payload)
    if (directCommand) {
      commands.push(directCommand)
    }
    if (typeof payload.chatPrompt === 'string' && payload.chatPrompt.trim()) {
      commands.push({
        commandKey: 'assistant.chat.send_message',
        payload: { text: payload.chatPrompt }
      })
    }
    return commands
  }

  function normalizeAssistantCommand(value) {
    if (!value || typeof value !== 'object' || value.commandKey !== 'assistant.chat.send_message' || !value.payload) {
      return null
    }
    const text = typeof value.payload.text === 'string' && value.payload.text.trim() ? value.payload.text : typeof value.payload.message === 'string' && value.payload.message.trim() ? value.payload.message : ''
    if (!text) {
      return null
    }
    return {
      commandKey: value.commandKey,
      payload: Object.assign({}, value.payload, { text }),
      caseId: value.caseId || (value.payload.state && value.payload.state.procurementQuoteComparison && value.payload.state.procurementQuoteComparison.caseId),
      documentId: value.documentId || (value.payload.state && value.payload.state.procurementQuoteComparison && value.payload.state.procurementQuoteComparison.documentId),
      parseJobId: value.parseJobId || (value.payload.state && value.payload.state.procurementQuoteComparison && value.payload.state.procurementQuoteComparison.parseJobId),
      role: value.role
    }
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
.proc-app { --proc-shadow: 0 12px 28px color-mix(in srgb, var(--xui-color-foreground) 5%, transparent); display: grid; grid-auto-rows: max-content; align-content: start; gap: 12px; min-height: 560px; padding: 10px; color: var(--xui-color-foreground); background: linear-gradient(180deg, color-mix(in srgb, var(--xui-color-muted) 62%, var(--xui-color-background) 38%), var(--xui-color-background)); }
.proc-header { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin: -10px -10px 0; border-bottom: 1px solid var(--xui-color-border); background: color-mix(in srgb, var(--xui-color-card) 96%, var(--xui-color-background) 4%); padding: 12px 14px; }
.proc-title-block { display: grid; gap: 4px; min-width: 0; }
.proc-eyebrow { color: var(--xui-color-muted-foreground); font-size: 10px; font-weight: 800; letter-spacing: 0; text-transform: uppercase; }
.proc-header h2 { margin: 0; font-size: 21px; line-height: 1.14; }
.proc-header p { margin: 0; color: var(--xui-color-muted-foreground); font-size: 12px; line-height: 1.45; }
.proc-header-actions, .proc-workflow-bar { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.proc-back-button { display: inline-flex; align-items: center; gap: 6px; border-color: color-mix(in srgb, var(--xui-color-primary) 32%, var(--xui-color-border)); color: var(--xui-color-primary); font-weight: 800; }
.proc-danger-button { display: inline-flex; align-items: center; gap: 6px; color: var(--xui-color-destructive); }
.proc-danger-button:hover { border-color: color-mix(in srgb, var(--xui-color-destructive) 34%, var(--xui-color-border)); background: var(--xui-color-destructive-background); }
.proc-list-page, .proc-detail-page { display: grid; align-content: start; gap: 12px; }
.proc-panel, .proc-flow-panel { border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-card); padding: 14px; box-shadow: var(--proc-shadow); }
.proc-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.proc-panel-title { color: var(--xui-color-foreground); font-size: 14px; font-weight: 800; }
.proc-panel-subtitle { color: var(--xui-color-muted-foreground); font-size: 12px; line-height: 1.45; }
.proc-list-overview { display: grid; grid-template-columns: minmax(280px, 0.88fr) minmax(0, 1.12fr); gap: 12px; align-items: stretch; }
.proc-upload-hero { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; width: 100%; min-height: 78px; border: 1px solid color-mix(in srgb, var(--xui-color-primary) 28%, var(--xui-color-border)); border-radius: 8px; background: linear-gradient(135deg, color-mix(in srgb, var(--xui-color-card) 86%, var(--xui-color-primary) 14%), var(--xui-color-card)); color: inherit; padding: 14px; text-align: left; box-shadow: var(--proc-shadow); }
.proc-upload-hero:hover { border-color: color-mix(in srgb, var(--xui-color-primary) 52%, var(--xui-color-border)); background: var(--xui-color-card); }
.proc-upload-mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 8px; background: var(--xui-color-primary); color: var(--xui-color-primary-foreground); font-size: 18px; }
.proc-upload-copy { display: grid; gap: 3px; min-width: 0; }
.proc-upload-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
.proc-upload-copy small { overflow: hidden; color: var(--xui-color-muted-foreground); font-size: 12px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.proc-upload-arrow { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; background: color-mix(in srgb, var(--xui-color-primary) 8%, var(--xui-color-card)); color: var(--xui-color-primary); }
.proc-list-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.proc-dashboard-metric { display: grid; align-content: center; gap: 6px; min-height: 78px; border: 1px solid var(--xui-color-border); border-radius: 8px; background: color-mix(in srgb, var(--xui-color-card) 94%, var(--xui-color-muted) 6%); padding: 12px; box-shadow: var(--proc-shadow); }
.proc-dashboard-metric span { color: var(--xui-color-muted-foreground); font-size: 11px; font-weight: 700; }
.proc-dashboard-metric strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 20px; line-height: 1; }
.proc-hidden-file { display: none; }
.proc-list-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 360px); gap: 12px; align-items: center; margin-bottom: 12px; }
.proc-case-list { display: grid; gap: 8px; }
.proc-case-ledger { gap: 0; overflow: hidden; border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-card); }
.proc-case-row { display: grid; grid-template-columns: minmax(240px, 1.4fr) 108px minmax(150px, 0.7fr) minmax(220px, 1fr) 42px; gap: 12px; align-items: center; min-width: 0; }
.proc-case-open { display: grid; grid-template-columns: minmax(240px, 1.4fr) 108px minmax(150px, 0.7fr) minmax(220px, 1fr); gap: 12px; align-items: center; min-width: 0; }
.proc-case-head { min-height: 34px; border-bottom: 1px solid var(--xui-color-border); background: color-mix(in srgb, var(--xui-color-muted) 74%, var(--xui-color-card) 26%); color: var(--xui-color-muted-foreground); padding: 0 12px; font-size: 11px; font-weight: 800; }
.proc-case-card { display: grid; grid-template-columns: minmax(0, 1fr) 42px; gap: 0; align-items: center; width: 100%; border-bottom: 1px solid var(--xui-color-border); background: var(--xui-color-card); color: inherit; text-align: left; transition: background 140ms ease; }
.proc-case-card:last-child { border-bottom: 0; }
.proc-case-card:hover { background: color-mix(in srgb, var(--xui-color-primary) 4%, var(--xui-color-card)); }
.proc-case-open { width: 100%; border: 0; background: transparent; color: inherit; padding: 12px; text-align: left; cursor: pointer; }
.proc-case-delete { display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--xui-color-muted-foreground); cursor: pointer; }
.proc-case-delete:hover { border-color: color-mix(in srgb, var(--xui-color-destructive) 32%, var(--xui-color-border)); background: var(--xui-color-destructive-background); color: var(--xui-color-destructive); }
.proc-case-open:disabled, .proc-case-delete:disabled { cursor: not-allowed; opacity: 0.58; }
.proc-case-main, .proc-detail-title, .proc-recommendation { display: grid; gap: 6px; min-width: 0; }
.proc-case-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 800; }
.proc-case-meta { display: flex; flex-wrap: wrap; gap: 8px; color: var(--xui-color-muted-foreground); font-size: 12px; }
.proc-case-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.proc-hero-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.proc-case-summary { overflow: hidden; color: var(--xui-color-muted-foreground); font-size: 12px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.proc-detail-hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; align-items: stretch; border: 1px solid var(--xui-color-border); border-left: 4px solid var(--xui-color-primary); border-radius: 8px; background: linear-gradient(180deg, color-mix(in srgb, var(--xui-color-card) 92%, var(--xui-color-primary) 8%), var(--xui-color-card)); padding: 14px; box-shadow: var(--proc-shadow); }
.proc-detail-title h3 { margin: 0; font-size: 20px; line-height: 1.2; }
.proc-metric, .proc-compact-metric { display: grid; gap: 4px; min-width: 0; border: 1px solid var(--xui-color-border); border-radius: 8px; background: color-mix(in srgb, var(--xui-color-card) 90%, var(--xui-color-muted) 10%); padding: 9px 10px; }
.proc-metric span, .proc-compact-metric span { color: var(--xui-color-muted-foreground); font-size: 11px; font-weight: 700; }
.proc-metric strong, .proc-compact-metric strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
.proc-compact-metric { padding: 7px 8px; }
.proc-compact-metric strong { font-size: 13px; }
.proc-flow-panel { display: grid; gap: 10px; }
.proc-progress-strip { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.proc-progress-step { display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 48px; border: 1px solid var(--xui-color-border); border-radius: 8px; background: color-mix(in srgb, var(--xui-color-card) 92%, var(--xui-color-muted) 8%); padding: 8px; }
.proc-progress-index { display: grid; flex: 0 0 auto; place-items: center; width: 24px; height: 24px; border-radius: 999px; background: var(--xui-color-muted); color: var(--xui-color-muted-foreground); font-size: 11px; font-weight: 900; }
.proc-progress-copy { display: grid; gap: 2px; min-width: 0; }
.proc-progress-copy strong, .proc-progress-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.proc-progress-copy strong { font-size: 12px; }
.proc-progress-copy small { color: var(--xui-color-muted-foreground); font-size: 11px; }
.proc-progress-done { border-color: color-mix(in srgb, var(--xui-color-success) 26%, var(--xui-color-border)); background: color-mix(in srgb, var(--xui-color-success-background) 42%, var(--xui-color-card)); }
.proc-progress-done .proc-progress-index { background: var(--xui-color-success); color: var(--xui-color-primary-foreground); }
.proc-workflow-bar { justify-content: flex-start; border-top: 1px solid var(--xui-color-border); padding-top: 10px; }
.proc-action-button { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; }
.proc-detail-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 340px); gap: 12px; align-items: start; }
.proc-main-column, .proc-side-column { display: grid; align-content: start; gap: 12px; min-width: 0; }
.proc-summary-panel { display: grid; gap: 12px; }
.proc-kv-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.proc-kv { display: grid; gap: 4px; border: 1px solid var(--xui-color-border); border-radius: 8px; background: color-mix(in srgb, var(--xui-color-card) 88%, var(--xui-color-muted) 12%); padding: 10px; }
.proc-kv span { color: var(--xui-color-muted-foreground); font-size: 11px; }
.proc-kv strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.proc-verdict-card { border-color: color-mix(in srgb, var(--xui-color-success) 34%, var(--xui-color-border)); border-left: 4px solid var(--xui-color-success); background: linear-gradient(135deg, color-mix(in srgb, var(--xui-color-success-background) 40%, var(--xui-color-card)), var(--xui-color-card)); }
.proc-verdict-head { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(150px, auto); gap: 12px; align-items: start; }
.proc-verdict-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 8px; background: var(--xui-color-success-background); color: var(--xui-color-success); font-size: 18px; }
.proc-verdict-title { display: grid; gap: 4px; min-width: 0; }
.proc-verdict-title span, .proc-verdict-supplier span { color: var(--xui-color-muted-foreground); font-size: 11px; font-weight: 800; }
.proc-verdict-title h3 { margin: 0; font-size: 16px; line-height: 1.45; }
.proc-verdict-supplier { display: grid; gap: 4px; min-width: 0; border: 1px solid color-mix(in srgb, var(--xui-color-success) 24%, var(--xui-color-border)); border-radius: 8px; background: var(--xui-color-card); padding: 8px 10px; }
.proc-verdict-supplier strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.proc-verdict-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.proc-recommendation-body { display: grid; gap: 8px; max-height: 190px; overflow: auto; margin-top: 12px; border-top: 1px solid color-mix(in srgb, var(--xui-color-success) 18%, var(--xui-color-border)); padding-top: 12px; color: var(--xui-color-muted-foreground); font-size: 12px; line-height: 1.6; }
.proc-recommendation-body p { margin: 0; }
.proc-verdict-footer { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 12px; color: var(--xui-color-muted-foreground); font-size: 12px; }
.proc-verdict-footer strong { border-radius: 999px; background: var(--xui-color-destructive-background); color: var(--xui-color-destructive); padding: 3px 8px; font-size: 11px; }
.proc-upload-card { display: grid; gap: 8px; border-bottom: 1px solid var(--xui-color-border); padding: 0 0 12px; }
.proc-upload-card + .proc-upload-card { padding-top: 12px; }
.proc-upload-card:last-child { border-bottom: 0; padding-bottom: 0; }
.proc-upload-card-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px dashed color-mix(in srgb, var(--xui-color-primary) 38%, var(--xui-color-border)); border-radius: 8px; background: color-mix(in srgb, var(--xui-color-primary) 5%, var(--xui-color-card)); padding: 10px 12px; cursor: pointer; }
.proc-upload-card-label span { font-size: 13px; font-weight: 800; }
.proc-upload-card-label strong { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: var(--xui-color-primary); color: var(--xui-color-primary-foreground); }
.proc-upload-hint { color: var(--xui-color-muted-foreground); font-size: 12px; }
.proc-file-list { display: grid; gap: 6px; }
.proc-file, .proc-supplier { display: grid; gap: 6px; border: 1px solid var(--xui-color-border); border-radius: 8px; background: color-mix(in srgb, var(--xui-color-card) 92%, var(--xui-color-muted) 8%); padding: 9px; font-size: 12px; }
.proc-file { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
.proc-file span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.proc-supplier strong { display: block; margin-bottom: 2px; font-size: 13px; }
.proc-supplier div { display: flex; flex-wrap: wrap; gap: 8px; color: var(--xui-color-muted-foreground); }
.proc-risk-panel { max-height: 520px; overflow: auto; }
.proc-risk { display: grid; gap: 7px; border-bottom: 1px solid var(--xui-color-border); padding: 10px 0; }
.proc-risk:last-child { border-bottom: 0; }
.proc-risk p, .proc-recommendation p { margin: 0; line-height: 1.5; }
.proc-ai-panel { border-color: color-mix(in srgb, var(--xui-color-primary) 28%, var(--xui-color-border)); }
.proc-empty-state { display: grid; gap: 4px; align-content: center; min-height: 92px; border: 1px dashed var(--xui-color-border); border-radius: 8px; background: color-mix(in srgb, var(--xui-color-card) 90%, var(--xui-color-muted) 10%); color: var(--xui-color-muted-foreground); padding: 18px; text-align: center; }
.proc-empty-state strong { color: var(--xui-color-foreground); }
.proc-empty-state.compact { min-height: 56px; padding: 12px; }
.xui-table-wrap { overflow: auto; border: 1px solid var(--xui-color-border); border-radius: 8px; background: var(--xui-color-card); }
.xui-table { width: 100%; min-width: 720px; border-collapse: collapse; font-size: 12px; }
.xui-table th, .xui-table td { border-bottom: 1px solid var(--xui-color-border); padding: 10px 11px; text-align: left; vertical-align: top; }
.xui-table th { background: color-mix(in srgb, var(--xui-color-card) 80%, var(--xui-color-muted) 20%); color: var(--xui-color-muted-foreground); font-size: 11px; font-weight: 800; }
.xui-table tr:last-child td { border-bottom: 0; }
.xui-table tbody tr:hover td { background: color-mix(in srgb, var(--xui-color-primary) 4%, transparent); }
.xui-button-soft { background: color-mix(in srgb, var(--xui-color-card) 82%, var(--xui-color-muted) 18%); }
.proc-status { display: inline-flex; width: fit-content; align-items: center; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 800; }
.proc-status-high, .proc-status-failed { color: var(--xui-color-destructive); background: var(--xui-color-destructive-background); }
.proc-status-succeeded, .proc-status-parsed, .proc-status-completed, .proc-status-extracted, .proc-status-low { color: var(--xui-color-success); background: var(--xui-color-success-background); }
.proc-status-medium, .proc-status-parsing, .proc-status-reviewing { color: var(--xui-color-warning, #b45309); background: var(--xui-color-warning-background, #fffbeb); }
.proc-status-draft, .proc-status-files_uploaded, .proc-status-uploaded, .proc-status-unsupported { color: var(--xui-color-primary); background: color-mix(in srgb, var(--xui-color-primary) 12%, transparent); }
@media (max-width: 900px) {
  .proc-header, .proc-detail-hero, .proc-list-overview, .proc-list-toolbar, .proc-detail-grid, .proc-kv-grid, .proc-verdict-head, .proc-verdict-metrics { grid-template-columns: 1fr; }
  .proc-case-head { display: none; }
  .proc-case-card, .proc-case-open, .proc-progress-strip { grid-template-columns: 1fr; }
  .proc-case-delete { justify-self: end; margin: 0 10px 10px 0; }
  .proc-hero-metrics, .proc-case-stats, .proc-list-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
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
      if (window.__procurementSetContext) {
        window.__procurementSetContext({
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

    if (message.type === 'hostEvent') {
      if (window.__procurementHandleHostEvent) {
        window.__procurementHandleHostEvent(message.event)
      }
      return
    }

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
