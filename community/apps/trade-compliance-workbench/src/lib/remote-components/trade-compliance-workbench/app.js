;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  const REQUEST_TIMEOUT_MS = 120000
  const h = React.createElement
  let instanceId = null
  let requestSequence = 0
  const pending = new Map()

  injectStyles()

  function post(type, body, transfer) {
    if (!instanceId && type !== 'ready') return
    parent.postMessage(Object.assign({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type }, body || {}), '*', transfer || [])
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
      }, REQUEST_TIMEOUT_MS)
    })
  }

  function reportResize() {
    post('resize', { height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 720) })
  }

  async function toFilePayload(file) {
    const buffer = await file.arrayBuffer()
    return {
      payload: { name: file.name, type: file.type, size: file.size, lastModified: file.lastModified, buffer },
      transfer: [buffer]
    }
  }

  function executeAction(actionKey, targetId, input, parameters) {
    return request('executeAction', { actionKey, targetId, input, parameters })
  }

  async function executeFileAction(actionKey, file, input, parameters) {
    const filePayload = await toFilePayload(file)
    return request('executeFileAction', { actionKey, file: filePayload.payload, input, parameters }, filePayload.transfer)
  }

  function notify(level, message) {
    post('notify', { level, message })
  }

  async function dispatchAssistantCommands(payload) {
    const commands = collectAssistantCommands(payload)
    let dispatched = 0
    for (const command of commands) {
      const response = await request('invokeClientCommand', { commandKey: command.commandKey, payload: command.payload })
      const result = getResponsePayload(response)
      if (result && result.success === false) throw new Error(resolveMessage(result.message) || '智能体消息发送失败')
      dispatched += 1
    }
    return dispatched
  }

  function App() {
    const [context, setContext] = React.useState(null)
    const [data, setData] = React.useState(normalizeData(null))
    const [activePage, setActivePage] = React.useState('overview-page')
    const [selectedIds, setSelectedIds] = React.useState([])
    const [statusFilter, setStatusFilter] = React.useState('all')
    const [overviewTab, setOverviewTab] = React.useState('all')
    const [busy, setBusy] = React.useState(false)
    const [query, setQuery] = React.useState('')
    const [pageByList, setPageByList] = React.useState({})
    const [pageSizeByList, setPageSizeByList] = React.useState({})
    const [pageJumpByList, setPageJumpByList] = React.useState({})
    const [detailItem, setDetailItem] = React.useState(null)
    const [formDialog, setFormDialog] = React.useState(null)
    const [deleteDialog, setDeleteDialog] = React.useState(null)
    const [hsCodeDetailDialog, setHsCodeDetailDialog] = React.useState(null)
    const [hsCodeSearch, setHsCodeSearch] = React.useState({
      keywords: '',
      page: 1,
      loading: false,
      searched: false,
      error: '',
      jumpPage: '',
      result: null
    })
    const pollingRef = React.useRef(null)
    const fileInputsRef = React.useRef({})

    React.useEffect(() => {
      window.__tradeComplianceSetContext = (nextContext) => {
        setContext(nextContext)
        setData(normalizeData(nextContext && nextContext.payload))
        setTimeout(() => reload(nextContext), 0)
      }
      window.__tradeComplianceHostEvent = () => reload()
      post('ready')
      return () => {
        window.__tradeComplianceSetContext = null
        window.__tradeComplianceHostEvent = null
        stopRecognitionPolling()
      }
    }, [])

    React.useEffect(reportResize, [data, activePage, selectedIds, statusFilter, overviewTab, pageByList, pageSizeByList, busy, formDialog, deleteDialog, hsCodeSearch, hsCodeDetailDialog])

    const reviewItems = data.reviewItems.filter((item) => !isPlaceholderReviewItem(item))
    const pendingItems = reviewItems.filter((item) => (item.reviewStatus || 'pending') === 'pending')
    const filteredPendingItems = filterItems(pendingItems, query, overviewSearchKeys)
    const controlledReviewRows = reviewItems.filter((item) => item.type === 'controlled_goods' && item.reviewStatus !== 'confirmed')
    const controlledRows = controlledReviewRows.concat(data.controlledGoods.map(toControlledGoodsReviewRow))
    const controlledReviews = applyStatusFilter(filterItems(controlledRows, query, reviewSearchKeys), statusFilter)
    const pendingControlledReviews = controlledReviews.filter((item) => (item.reviewStatus || 'pending') === 'pending')
    const supplierReviewRows = reviewItems.filter((item) => item.type === 'supplier_product' && item.reviewStatus !== 'confirmed')
    const supplierRows = supplierReviewRows.concat(data.products.map(toSupplierProductReviewRow))
    const supplierReviews = applyStatusFilter(filterItems(supplierRows, query, reviewSearchKeys), statusFilter)
    const pendingSupplierReviews = supplierReviews.filter((item) => (item.reviewStatus || 'pending') === 'pending')
    const salesReviews = applyStatusFilter(filterItems(reviewItems.filter((item) => item.type === 'customs_workbook'), query, reviewSearchKeys), statusFilter)
    const pendingSalesReviews = salesReviews.filter((item) => (item.reviewStatus || 'pending') === 'pending')
    const filteredControlledGoods = filterItems(data.controlledGoods, query, ['productName', 'hsCode', 'controlNote'])
    const filteredProducts = filterItems(data.products, query, ['supplierName', 'productName', 'model', 'enrichedHsCode', 'englishName'])
    const filteredWorkbooks = filterItems(data.workbookGenerations, query, ['fileName', 'invoiceNo', 'contractNo', 'sourceFileName'])

    async function reload(nextContext) {
      const activeContext = nextContext || context
      if (!activeContext) return
      setBusy(true)
      try {
        const response = await request('requestData', { query: { page: 1, pageSize: 200, search: query, parameters: {} } })
        setData(normalizeData(getResponsePayload(response)))
      } catch (error) {
        showNotice('刷新失败：' + getErrorMessage(error), 'error')
      } finally {
        setBusy(false)
      }
    }

    async function searchHsCodePage(page) {
      const keywords = String(hsCodeSearch.keywords || '').trim()
      if (!keywords) {
        setHsCodeSearch(Object.assign({}, hsCodeSearch, { error: '请输入商品名称或海关编码', searched: false }))
        return
      }
      const nextPage = Math.max(1, Number(page) || 1)
      setHsCodeSearch(Object.assign({}, hsCodeSearch, { loading: true, error: '', page: nextPage }))
      try {
        const response = await executeAction('search_hs_code', null, {
          keywords,
          page: nextPage,
          filterFailureCode: true,
          displayChapter: false,
          displayEnName: true
        }, {})
        assertActionSuccess(response)
        const result = getActionDataPayload(response)
        setHsCodeSearch((current) => Object.assign({}, current, {
          loading: false,
          searched: true,
          page: nextPage,
          error: '',
          result
        }))
      } catch (error) {
        setHsCodeSearch((current) => Object.assign({}, current, {
          loading: false,
          searched: true,
          error: getErrorMessage(error)
        }))
      }
    }

    function updateHsCodeSearch(patch) {
      setHsCodeSearch(Object.assign({}, hsCodeSearch, patch))
    }

    function submitHsCodeSearch(event) {
      event.preventDefault()
      searchHsCodePage(1)
    }

    async function loadHsCodeDetail(item) {
      if (!item || (!item.code && !item.detailUrl)) return
      setHsCodeDetailDialog({ loading: true, item, detail: null, error: '' })
      try {
        const response = await executeAction('get_hs_code_detail', null, {
          code: item.code,
          detailUrl: item.detailUrl
        }, {})
        assertActionSuccess(response)
        setHsCodeDetailDialog({ loading: false, item, detail: getActionDataPayload(response), error: '' })
      } catch (error) {
        setHsCodeDetailDialog({ loading: false, item, detail: null, error: getErrorMessage(error) })
      }
    }

    async function searchSupplierHsCandidatesForForm(page) {
      if (!formDialog || formDialog.type !== 'supplier_product' || busy) return
      const keyword = String(formDialog.hsCandidateKeyword || buildSupplierHsCandidateKeyword(formDialog.values) || '').trim()
      if (!keyword) {
        setFormDialog(Object.assign({}, formDialog, { hsCandidateError: '请输入商品名称、型号或海关编码后再查询。' }))
        return
      }
      const nextPage = Math.max(1, Number(page) || 1)
      setFormDialog(Object.assign({}, formDialog, {
        hsCandidateKeyword: keyword,
        hsCandidatePage: nextPage,
        hsCandidateLoading: true,
        hsCandidateError: '',
        hsCandidateStatus: ''
      }))
      try {
        const response = await executeAction('search_hs_code', null, {
          keywords: keyword,
          page: nextPage,
          filterFailureCode: true,
          displayChapter: false,
          displayEnName: true
        }, {})
        assertActionSuccess(response)
        const result = getActionDataPayload(response)
        const candidates = Array.isArray(result && result.results) ? result.results : []
        setFormDialog((current) => current ? Object.assign({}, current, {
          hsCandidateKeyword: keyword,
          hsCandidatePage: nextPage,
          hsCandidateLocalPage: 1,
          hsCandidateLoading: false,
          hsCandidateError: '',
          hsCandidateStatus: candidates.length ? 'pending_confirmation' : 'not_found',
          hsCandidates: candidates,
          hsCandidatePagination: result && result.pagination ? result.pagination : null
        }) : current)
      } catch (error) {
        setFormDialog((current) => current ? Object.assign({}, current, {
          hsCandidateLoading: false,
          hsCandidateStatus: 'failed',
          hsCandidateError: getErrorMessage(error)
        }) : current)
      }
    }

    function selectHsCandidate(candidate) {
      if (!formDialog || formDialog.type !== 'supplier_product' || !candidate) return
      setFormDialog(Object.assign({}, formDialog, {
        values: Object.assign({}, formDialog.values, {
          enrichedHsCode: candidate.code || '',
          taxRefundRate: candidate.taxRefundRate || '',
          englishName: candidate.englishName || candidate.name || ''
        }),
        hsCandidateStatus: 'confirmed'
      }))
      showNotice('已选用海关编码，请检查后保存。', 'success')
    }

    async function handleFile(actionKey, file) {
      debugUpload('file change received', { actionKey, hasFile: !!file, busy })
      if (!file) {
        debugUpload('file selection was empty', { actionKey })
        return
      }
      if (busy) {
        debugUpload('file upload ignored because workbench is busy', { actionKey, fileName: file.name })
        return
      }
      const expectedType = reviewTypeForUploadAction(actionKey)
      const previousCount = countReviewItemsByType(data.reviewItems, expectedType)
      setBusy(true)
      try {
        debugUpload('executing plugin file action with workspace upload path', { actionKey, fileName: file.name, size: file.size, type: file.type })
        const response = await executeFileAction(actionKey, file, Object.assign(
          { name: file.name, fileName: file.name },
          {
            originalFileName: file.name,
            mimeType: file.type,
            size: file.size,
            workspaceUploadPath: workspaceUploadPathForAction(actionKey)
          }
        ), {})
        assertActionSuccess(response)
        const actionData = getActionDataPayload(response)
        debugUpload('dispatching assistant commands', { actionKey, fileName: file.name })
        const dispatched = await dispatchAssistantCommands(actionData)
        debugUpload('file workflow completed', { actionKey, fileName: file.name, dispatched })
        showNotice(dispatched ? '文件已发送给智能体解析，识别结果会进入待审核列表。' : '文件已登记，等待识别结果。', 'success')
        await reload()
        if (dispatched && expectedType) startRecognitionPolling(expectedType, previousCount, readExpectedCount(actionData))
      } catch (error) {
        debugUpload('file workflow failed', { actionKey, fileName: file.name, message: getErrorMessage(error) })
        showNotice(getErrorMessage(error), 'error')
      } finally {
        setBusy(false)
      }
    }

    async function saveProductForm(event) {
      event.preventDefault()
      if (!formDialog || busy) return
      const payload = normalizeFormPayload(formDialog.type, formDialog.values)
      if (formDialog.type === 'controlled_goods' && !payload.productName) {
        showNotice('请填写商品名称。', 'error')
        return
      }
      if (formDialog.type === 'supplier_product' && (!payload.supplierName || !payload.productName)) {
        showNotice('请填写供应商和商品名称。', 'error')
        return
      }
      const isCreate = formDialog.mode === 'create'
      const actionKey = isCreate
        ? (formDialog.type === 'controlled_goods' ? 'save_controlled_goods' : 'save_supplier_product')
        : formDialog.item.materializedOnly
          ? (formDialog.type === 'controlled_goods' ? 'update_controlled_goods' : 'update_supplier_product')
          : 'update_review_item'
      const input = isCreate
        ? payload
        : formDialog.item.materializedOnly
          ? Object.assign({ id: formDialog.item.materializedId || parseMaterializedId(formDialog.item.id) }, payload)
          : { itemId: formDialog.item.id, confirmedData: payload }
      setBusy(true)
      try {
        const response = await executeAction(actionKey, null, input, {})
        assertActionSuccess(response)
        setFormDialog(null)
        showNotice(isCreate ? '商品已新增。' : '记录已更新。', 'success')
        await reload()
      } catch (error) {
        showNotice(getErrorMessage(error), 'error')
      } finally {
        setBusy(false)
      }
    }

    async function confirmReview(item) {
      if (!item || !item.id || busy) return
      setBusy(true)
      try {
        const confirmedData = buildConfirmReviewData(item)
        const response = await executeAction('confirm_review_item', item.id, { itemId: item.id, confirmedData }, {})
        assertActionSuccess(response)
        showNotice('审核项已确认并写入业务列表。', 'success')
        await reload()
      } catch (error) {
        showNotice(getErrorMessage(error), 'error')
      } finally {
        setBusy(false)
      }
    }

    async function rejectReview(item) {
      if (!item || !item.id || busy) return
      setBusy(true)
      try {
        const response = item.materializedOnly
          ? await executeAction(materializedDeleteAction(item), null, { id: item.materializedId || parseMaterializedId(item.id) }, {})
          : await executeAction('reject_review_item', item.id, { itemId: item.id }, {})
        assertActionSuccess(response)
        setSelectedIds(selectedIds.filter((id) => id !== item.id))
        showNotice(item.materializedOnly ? '记录已驳回并移出正式列表。' : '审核项已驳回。', 'success')
        await reload()
      } catch (error) {
        showNotice(getErrorMessage(error), 'error')
      } finally {
        setBusy(false)
      }
    }

    async function batchApproveSelected() {
      if (!selectedIds.length || busy) return
      const rows = getSelectedRows().filter((row) => !row.materializedOnly && row.reviewStatus !== 'confirmed' && row.reviewStatus !== 'rejected')
      if (!rows.length) return
      setBusy(true)
      try {
        const response = await executeAction('confirm_review_items', null, { itemIds: rows.map((row) => row.id) }, {})
        assertActionSuccess(response)
        setSelectedIds([])
        showNotice(`已批量审核 ${rows.length} 条记录。`, 'success')
        await reload()
      } catch (error) {
        showNotice(getErrorMessage(error), 'error')
      } finally {
        setBusy(false)
      }
    }

    async function batchRejectSelected() {
      const rows = getSelectedRows().filter((row) => row.reviewStatus !== 'rejected')
      if (!rows.length || busy) return
      setBusy(true)
      try {
        for (const row of rows) {
          if (row.materializedOnly) {
            await executeAction(materializedDeleteAction(row), null, { id: row.materializedId || parseMaterializedId(row.id) }, {})
          } else {
            await executeAction('reject_review_item', row.id, { itemId: row.id }, {})
          }
        }
        setSelectedIds([])
        showNotice(`已批量驳回 ${rows.length} 条记录。`, 'success')
        await reload()
      } catch (error) {
        showNotice(getErrorMessage(error), 'error')
      } finally {
        setBusy(false)
      }
    }

    async function batchDeleteSelected() {
      const rows = getSelectedRows()
      if (!rows.length || busy) return
      setDeleteDialog({
        type: 'batch-rows',
        title: '确认批量删除',
        message: `确定要删除选中的 ${rows.length} 条记录吗？此操作不可撤销。`,
        rows
      })
    }

    async function performBatchDelete(rows) {
      setBusy(true)
      try {
        for (const row of rows) {
          await deleteRowRequest(row)
        }
        setSelectedIds([])
        showNotice(`已批量删除 ${rows.length} 条记录。`, 'success')
        await reload()
      } catch (error) {
        showNotice(getErrorMessage(error), 'error')
      } finally {
        setBusy(false)
      }
    }

    async function deleteRow(item) {
      if (!item || !item.id || busy) return
      setDeleteDialog({
        type: 'row',
        title: '确认删除',
        message: `确定要删除「${readMerged(item).productName || item.title || '当前记录'}」吗？此操作不可撤销。`,
        item
      })
    }

    async function performDeleteRow(item) {
      setBusy(true)
      try {
        await deleteRowRequest(item)
        setSelectedIds(selectedIds.filter((id) => id !== item.id))
        showNotice('记录已删除。', 'success')
        await reload()
      } catch (error) {
        showNotice(getErrorMessage(error), 'error')
      } finally {
        setBusy(false)
      }
    }

    async function deleteRowRequest(item) {
      const actionKey = item.materializedOnly ? materializedDeleteAction(item) : 'delete_review_item'
      const input = item.materializedOnly ? { id: item.materializedId || parseMaterializedId(item.id) } : { itemId: item.id }
      const response = await executeAction(actionKey, null, input, {})
      assertActionSuccess(response)
      return response
    }

    function openEdit(item) {
      const merged = readMerged(item || {})
      setFormDialog({
        mode: 'edit',
        type: item.type,
        item,
        values: valuesFromItem(item.type, item),
        hsCandidates: Array.isArray(merged.hsCodeCandidates) ? merged.hsCodeCandidates : [],
        hsCandidateKeyword: merged.hsCodeLookupKeyword || buildSupplierHsCandidateKeyword(merged),
        hsCandidatePage: 1,
        hsCandidateJumpPage: '',
        hsCandidateLocalPage: 1,
        hsCandidateLocalPageSize: 5,
        hsCandidateLocalJumpPage: '',
        hsCandidatePagination: null,
        hsCandidateStatus: merged.hsCodeLookupStatus || '',
        hsCandidateError: merged.hsCodeLookupError || '',
        hsCandidateLoading: false
      })
    }

    function openCreate(type) {
      setFormDialog({
        mode: 'create',
        type,
        item: null,
        values: emptyFormValues(type),
        hsCandidates: [],
        hsCandidateKeyword: '',
        hsCandidatePage: 1,
        hsCandidateJumpPage: '',
        hsCandidateLocalPage: 1,
        hsCandidateLocalPageSize: 5,
        hsCandidateLocalJumpPage: '',
        hsCandidatePagination: null,
        hsCandidateStatus: '',
        hsCandidateError: '',
        hsCandidateLoading: false
      })
    }

    async function deleteWorkbook(item) {
      if (!item || !item.id || busy) return
      setDeleteDialog({
        type: 'workbook',
        title: '确认删除销售发票',
        message: `确定要删除「${item.fileName || item.invoiceNo || '当前销售发票'}」吗？此操作不可撤销。`,
        item
      })
    }

    async function performDeleteWorkbook(item) {
      setBusy(true)
      try {
        const response = await executeAction('delete_customs_workbook', null, { id: item.id }, {})
        assertActionSuccess(response)
        showNotice('销售发票记录已删除。', 'success')
        await reload()
      } catch (error) {
        showNotice(getErrorMessage(error), 'error')
      } finally {
        setBusy(false)
      }
    }

    async function confirmDeleteDialog() {
      if (!deleteDialog || busy) return
      const current = deleteDialog
      setDeleteDialog(null)
      if (current.type === 'batch-rows') {
        await performBatchDelete(current.rows)
      } else if (current.type === 'workbook') {
        await performDeleteWorkbook(current.item)
      } else {
        await performDeleteRow(current.item)
      }
    }

    async function downloadWorkbook(item) {
      if (!item || !item.id || busy) return
      setBusy(true)
      try {
        const response = await executeAction('download_customs_workbook', null, { id: item.id }, {})
        assertActionSuccess(response)
        const payload = getResponsePayload(response)
        const data = payload && payload.data ? payload.data : payload
        const base64 = data && data.base64
        if (!base64) throw new Error('未返回 Excel 文件内容')
        const bytes = base64ToBytes(base64)
        const blob = new Blob([bytes], { type: data.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = data.fileName || item.fileName || '销售发票.xlsx'
        link.click()
        URL.revokeObjectURL(url)
      } catch (error) {
        showNotice(getErrorMessage(error), 'error')
      } finally {
        setBusy(false)
      }
    }

    async function generateWorkbook() {
      if (busy) return
      const salesItem = salesReviews.find((item) => item.reviewStatus === 'confirmed') || salesReviews[0]
      setBusy(true)
      try {
        const base = readMerged(salesItem || {})
        const invoiceNo = base.invoiceNo || ('INV-' + new Date().toISOString().slice(0, 10).replace(/-/g, ''))
        const response = await executeAction('generate_customs_workbook', null, {
          invoiceNo,
          contractNo: base.contractNo,
          sourceFileName: base.sourceFileName,
          fileName: invoiceNo + '-销售发票.xlsx',
          workbookData: base
        }, {})
        assertActionSuccess(response)
        showNotice('销售发票已生成并写入历史。', 'success')
        await reload()
      } catch (error) {
        showNotice(getErrorMessage(error), 'error')
      } finally {
        setBusy(false)
      }
    }

    function showNotice(message, level) {
      notify(level || 'info', message)
    }

    function startRecognitionPolling(expectedType, previousCount, expectedCount) {
      stopRecognitionPolling()
      let attempts = 0
      let lastCount = previousCount
      let stableTicks = 0
      const targetCount = expectedCount > 0 ? previousCount + expectedCount : null
      pollingRef.current = setInterval(async () => {
        attempts += 1
        try {
          const response = await request('requestData', { query: { page: 1, pageSize: 1000, search: query, parameters: {} } })
          const nextData = normalizeData(getResponsePayload(response))
          setData(nextData)
          const nextCount = countReviewItemsByType(nextData.reviewItems, expectedType)
          stableTicks = nextCount === lastCount ? stableTicks + 1 : 0
          lastCount = nextCount
          if ((targetCount && nextCount >= targetCount) || (!targetCount && nextCount > previousCount && stableTicks >= 4) || attempts >= 160) {
            stopRecognitionPolling()
          }
        } catch (_error) {
          if (attempts >= 160) stopRecognitionPolling()
        }
      }, 2500)
    }

    function stopRecognitionPolling() {
      if (!pollingRef.current) return
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    return h('div', { className: 'tcw-shell' },
      renderSidebar(),
      h('section', { className: 'tcw-workspace' },
        h('header', { className: 'tcw-header' },
          h('div', { className: 'tcw-title-block' },
            h('span', { className: 'tcw-kicker' }, pageBreadcrumb(activePage)),
            h('h1', null, pageTitle(activePage)),
            h('p', null, pageSubtitle(activePage))
          ),
          h('div', { className: 'tcw-header-actions' },
            h('input', { className: 'tcw-search', value: query, placeholder: '搜索商品、供应商、海关编码、文件名', onChange: (event) => setQuery(event.target.value) }),
            h('button', { className: 'tcw-btn tcw-btn-soft', disabled: busy, onClick: () => reload() }, busy ? '处理中' : '刷新')
          )
        ),
        h('main', { className: 'tcw-main' },
          h('section', { className: 'tcw-content' },
            activePage === 'overview-page' ? renderOverviewPage() : null,
            activePage === 'controlled-goods-page' ? renderControlledGoodsPage() : null,
            activePage === 'products-page' ? renderProductsPage() : null,
            activePage === 'workbooks-page' ? renderWorkbooksPage() : null,
            activePage === 'hs-code-search-page' ? renderHsCodeSearchPage() : null
          )
        )
      ),
      detailItem ? renderDetailModal() : null,
      formDialog ? renderFormModal() : null,
      deleteDialog ? renderDeleteConfirmModal() : null,
      hsCodeDetailDialog ? renderHsCodeDetailModal() : null
    )

    function renderSidebar() {
      return h('aside', { className: 'tcw-sidebar' },
        h('div', { className: 'tcw-brand' },
          h('div', { className: 'tcw-brand-mark' }, 'TC'),
          h('div', null,
            h('strong', null, '外贸合规工作台'),
            h('span', null, 'Trade Compliance')
          )
        ),
        h('nav', { className: 'tcw-nav', 'aria-label': '主导航' }, [
          tab('overview-page', '总览', 'dashboard', pendingItems.length, 'blue'),
          tab('controlled-goods-page', '管控商品', 'shield', controlledReviews.length, 'green'),
          tab('products-page', '供应商商品', 'box', supplierReviews.length, 'orange'),
          tab('workbooks-page', '销售发票', 'invoice', salesReviews.length + filteredWorkbooks.length, 'violet'),
          tab('hs-code-search-page', '工具', 'search', null, 'slate')
        ])
      )
    }

    function tab(key, label, icon, count, tone) {
      return h('button', { key, className: key === activePage ? 'tcw-tab active' : 'tcw-tab', onClick: () => setActivePage(key) },
        h('span', { className: 'tcw-nav-icon ' + (tone || 'blue') }, iconImage(icon, label, tone)),
        h('span', null, label),
        count == null ? null : h('em', null, count)
      )
    }

    function renderOverviewPage() {
      const filteredPendingControlledItems = filteredPendingItems.filter((item) => item.type === 'controlled_goods')
      const filteredPendingSupplierItems = filteredPendingItems.filter((item) => item.type === 'supplier_product')
      const filteredPendingSalesItems = filteredPendingItems.filter((item) => item.type === 'customs_workbook')
      const overviewRows = overviewTab === 'all'
        ? filteredPendingItems
        : filteredPendingItems.filter((item) => item.type === overviewTab)
      const overviewListKey = `overview-${overviewTab}`
      const overviewPage = paginateRows(overviewListKey, overviewRows)
      return h('div', { className: 'tcw-page overview-page' },
        h('section', { className: 'tcw-metrics' },
          metric('待审核', filteredPendingItems.length, 'dashboard', 'blue'),
          metric('管控识别待审', filteredPendingControlledItems.length, 'shield', 'green'),
          metric('供应商商品待审', filteredPendingSupplierItems.length, 'box', 'orange'),
          metric('销售合同待审', filteredPendingSalesItems.length, 'invoice', 'violet'),
          metric('已入库管控商品', data.controlledGoods.length, 'archive', 'slate'),
          metric('已入库供应商商品', data.products.length, 'supplier', 'green'),
          metric('销售发票历史', data.workbookGenerations.length, 'document', 'violet'),
          metric('全部审核记录', reviewItems.length, 'records', 'blue')
        ),
        panel('待办事项明细',
          h('div', { className: 'tcw-overview-panel' },
            h('div', { className: 'tcw-overview-tabs' }, [
              overviewTabButton('all', '全部', filteredPendingItems.length),
              overviewTabButton('controlled_goods', '管控商品', filteredPendingControlledItems.length),
              overviewTabButton('supplier_product', '供应商商品', filteredPendingSupplierItems.length),
              overviewTabButton('customs_workbook', '销售发票', filteredPendingSalesItems.length)
            ]),
            overviewPage.rows.length
              ? compactReviewList(overviewPage.rows)
              : empty('暂无待审核记录。智能体识别结果会先出现在这里。'),
            pagination(overviewListKey, overviewRows.length)
          )
        )
      )

      function overviewTabButton(key, label, count) {
        return h('button', {
          key,
          type: 'button',
          className: overviewTab === key ? 'tcw-overview-tab active' : 'tcw-overview-tab',
          onClick: () => setOverviewTab(key)
        }, `${label}${typeof count === 'number' ? ` ${count}` : ''}`)
      }
    }

    function renderControlledGoodsPage() {
      const page = paginateRows('controlled-goods', controlledReviews)
      return h('div', { className: 'tcw-page controlled-goods-page' },
        businessPanel('管控商品', '上传管控目录后，识别结果在列表内完成审核、驳回和入库。', [
          uploadButton('upload_controlled_goods_file', '上传管控商品文件'),
          h('button', { className: 'tcw-btn tcw-btn-primary', disabled: busy, onClick: () => openCreate('controlled_goods') }, '新增管控商品')
        ], [
          renderListToolbar('管控商品列表', controlledReviews.length),
          h('div', { className: 'pending-controlled-goods confirmed-controlled-goods tcw-table-section' },
            reviewTable(['商品名称/候选', '海关编码', '解析状态', '管控说明', '来源'], page.rows, (item) => {
            const row = readMerged(item)
            const warnings = Array.isArray(row.parseWarnings) ? row.parseWarnings : []
            const status = warnings.length ? `需核对：${warnings.join('、')}` : '已解析'
            return [
              value(row.productName || row.referenceNameCandidate || item.title),
              value(row.hsCode),
              value(status),
              value(row.controlNote),
              value(item.sourceLocation || row.sourceFileName)
            ]
            }, '暂无管控商品识别结果。上传目录并等待智能体调用工具后会显示在这里。', renderProductActions)
          ),
          pagination('controlled-goods', controlledReviews.length)
        ])
      )
    }

    function renderProductsPage() {
      const page = paginateRows('supplier-products', supplierReviews)
      return h('div', { className: 'tcw-page products-page' },
        businessPanel('供应商商品', '上传供应商合同后，识别结果在列表内完成审核、驳回和入库。', [
          uploadButton('upload_supplier_contract', '上传供应商合同'),
          h('button', { className: 'tcw-btn tcw-btn-primary', disabled: busy, onClick: () => openCreate('supplier_product') }, '新增供应商商品')
        ], [
          renderListToolbar('供应商商品列表', supplierReviews.length),
          h('div', { className: 'pending-supplier-products tcw-table-section' },
            reviewTable(['供应商', '商品', '型号', '海关编码', '编码确认', '退税率', '英文品名', '管控状态'], page.rows, (item) => {
            const row = readSupplierEditableMerged(item)
            return [
              value(row.supplierName),
              value(row.productName || item.title),
              value(row.model),
              value(resolveDisplayHsCode(row)),
              status(hsCodeReviewStatusText(row), hsCodeReviewStatusLevel(row)),
              value(row.taxRefundRate),
              value(row.englishName),
              status(controlStatusText(row.controlledStatus), controlStatusLevel(row.controlledStatus))
            ]
            }, '暂无供应商商品识别结果。上传供应商合同并等待智能体识别后会显示在这里。', renderProductActions)
          ),
          pagination('supplier-products', supplierReviews.length)
        ])
      )
    }

    function renderWorkbooksPage() {
      const salesPage = paginateRows('sales-contracts', salesReviews)
      const workbookPage = paginateRows('sales-workbooks', filteredWorkbooks)
      return h('div', { className: 'tcw-page workbooks-page' },
        businessPanel('销售发票', '上传购销合同后，先审核发票字段，再生成固定模板 Excel。', [
          uploadButton('upload_sales_contract', '上传购销合同'),
          h('button', { className: 'tcw-btn tcw-btn-primary', disabled: busy, onClick: generateWorkbook }, '生成销售发票')
        ], [
          renderListToolbar('购销合同识别列表', salesReviews.length),
          h('div', { className: 'pending-sales-contracts tcw-table-section' },
            reviewTable(['文件/标题', '发票号', '合同号', '买方', '卖方'], salesPage.rows, (item) => {
            const row = readMerged(item)
            return [
              value(item.title),
              value(row.invoiceNo),
              value(row.contractNo),
              value(row.buyerName),
              value(row.sellerName)
            ]
            }, '暂无购销合同识别结果。', renderSalesReviewActions)
          ),
          pagination('sales-contracts', salesReviews.length),
          h('section', { className: 'tcw-history-section' },
            h('div', { className: 'tcw-subsection-head' },
              h('div', null, h('h3', null, '已生成销售发票'), h('p', null, `${filteredWorkbooks.length} 条生成历史`))
            ),
            table(['文件名', '发票号', '合同号', '模板工作表', '状态', '操作'], workbookPage.rows, (item) => [
              value(item.fileName),
              value(item.invoiceNo),
              value(item.contractNo),
              Array.isArray(item.sheetNames) ? item.sheetNames.join('、') : '-',
              status(value(item.status, 'generated'), 'ok'),
              h('div', { className: 'tcw-row-actions' },
                h('button', { className: 'tcw-mini-btn', onClick: () => downloadWorkbook(item) }, '下载'),
                h('button', { className: 'tcw-mini-btn danger', onClick: () => deleteWorkbook(item) }, '删除')
              )
            ], '暂无销售发票生成历史。'),
            pagination('sales-workbooks', filteredWorkbooks.length)
          )
        ])
      )
    }

    function renderHsCodeSearchPage() {
      const result = hsCodeSearch.result || {}
      const rows = Array.isArray(result.results) ? result.results : []
      return h('div', { className: 'tcw-page hs-code-search-page' },
        businessPanel('海关编码查询', '输入商品名称或海关编码，查询 HS 编码网返回的结果。', [], [
          h('form', { className: 'tcw-hs-search-form', onSubmit: submitHsCodeSearch },
            h('div', { className: 'tcw-hs-search-row' },
              h('input', {
                className: 'tcw-search hs-code-search-input',
                value: hsCodeSearch.keywords,
                placeholder: '请输入商品名称或海关编码，例如：帽子、8471499100',
                onChange: (event) => updateHsCodeSearch({ keywords: event.target.value })
              }),
              h('button', { className: 'tcw-btn tcw-btn-primary', disabled: hsCodeSearch.loading }, hsCodeSearch.loading ? '查询中' : '查询')
            )
          ),
          hsCodeSearch.error ? h('div', { className: 'tcw-error' }, hsCodeSearch.error) : null,
          !hsCodeSearch.searched && !hsCodeSearch.loading ? empty('请输入商品名称或海关编码后查询。') : null,
          hsCodeSearch.loading ? empty('正在查询 HS 编码网，请稍候。') : null,
          hsCodeSearch.searched && !hsCodeSearch.loading && !hsCodeSearch.error ? h('section', { className: 'tcw-history-section' },
            h('div', { className: 'tcw-subsection-head' },
              h('div', null,
                h('h3', null, `和「${value(result.keywords || hsCodeSearch.keywords, '')}」有关的 HS 编码`),
                h('p', null, `第 ${result.page || hsCodeSearch.page} 页，${rows.length} 条结果`)
              )
            ),
            table(['商品编码', '商品名称', '英文名称', '计量单位', '出口退税率(%)', '监管条件', '检验检疫', '来源', '操作'], rows, (item) => [
              h('strong', { className: 'tcw-hs-code-text' }, value(item.code)),
              value(item.name),
              value(item.englishName),
              value(item.unit),
              value(item.taxRefundRate),
              value(item.regulatoryConditions),
              value(item.inspectionQuarantine),
              `第 ${item.sourcePage || result.page || hsCodeSearch.page} 页`,
              h('div', { className: 'tcw-row-actions' },
                h('button', { className: 'tcw-mini-btn', disabled: !item.code && !item.detailUrl, onClick: () => loadHsCodeDetail(item) }, '详情')
              )
            ], '未查询到相关编码。可换关键词或海关编码重新查询。'),
            renderHsCodePagination(result.pagination)
          ) : null
        ])
      )
    }

    function renderHsCodeDetailModal() {
      const state = hsCodeDetailDialog || {}
      const item = state.item || {}
      const detail = state.detail || {}
      const sections = Array.isArray(detail.sections) ? detail.sections : []
      return h('div', { className: 'tcw-modal-backdrop' },
        h('section', { className: 'tcw-modal tcw-hs-detail-modal' },
          h('div', { className: 'tcw-modal-head' },
            h('div', null,
              h('h2', null, '海关编码详情'),
              h('p', { className: 'tcw-modal-subtitle' }, `${value(detail.code || item.code, '-')} ${value(detail.name || item.name, '')}`)
            ),
            h('button', { type: 'button', className: 'tcw-icon-btn', onClick: () => setHsCodeDetailDialog(null) }, '×')
          ),
          state.loading ? empty('正在读取源站详情，请稍候。') : null,
          state.error ? h('div', { className: 'tcw-error' }, state.error) : null,
          !state.loading && !state.error && sections.length === 0 ? empty('源站详情页暂无可展示内容。') : null,
          !state.loading && !state.error && sections.length > 0 ? h('div', { className: 'tcw-hs-detail-sections' },
            sections.map((section) => h('section', { className: 'tcw-hs-detail-section', key: section.title },
              h('h3', null, section.title),
              h('div', { className: 'tcw-detail-grid' },
                (Array.isArray(section.rows) ? section.rows : []).map((row) =>
                  h('div', { className: 'tcw-detail-field', key: `${section.title}:${row.label}` },
                    h('span', null, row.label),
                    h('strong', null, value(row.value, '-'))
                  )
                )
              )
            ))
          ) : null,
          h('div', { className: 'tcw-modal-actions' },
            h('button', { type: 'button', className: 'tcw-btn tcw-btn-soft', onClick: () => setHsCodeDetailDialog(null) }, '关闭')
          )
        )
      )
    }

    function renderHsCodePagination(pagination) {
      if (!pagination || (!pagination.hasPrevious && !pagination.hasNext && (!pagination.pages || pagination.pages.length <= 1))) return null
      const pages = Array.isArray(pagination.pages) ? pagination.pages.filter((item) => item.page) : []
      const maxPage = Number(pagination.maxVisiblePage) || Math.max(...pages.map((item) => Number(item.page) || 0), pagination.currentPage || hsCodeSearch.page || 1)
      const currentPage = pagination.currentPage || hsCodeSearch.page || 1
      return renderUnifiedPagination({
        page: currentPage,
        totalPages: Math.max(1, maxPage),
        pageSize: 10,
        fixedPageSize: true,
        loading: hsCodeSearch.loading,
        hasPrevious: pagination.hasPrevious,
        hasNext: pagination.hasNext,
        jumpValue: hsCodeSearch.jumpPage || '',
        onPageChange: searchHsCodePage,
        onJumpInput: (nextValue) => setHsCodeSearch(Object.assign({}, hsCodeSearch, { jumpPage: nextValue })),
        onJump: () => {
          const nextPage = Number(hsCodeSearch.jumpPage)
          if (!Number.isFinite(nextPage) || nextPage <= 0) return
          searchHsCodePage(nextPage)
          setHsCodeSearch((current) => Object.assign({}, current, { jumpPage: '' }))
        }
      })
    }

    function compactReviewList(items) {
      return h('div', { className: 'tcw-compact-list' }, items.map((item) =>
        h('div', { className: 'tcw-compact-row', key: item.id || item.title },
          h('span', null, reviewTypeText(item.type)),
          h('strong', null, item.title),
          h('em', null, reviewStatusText(item.reviewStatus))
        )
      ))
    }

    function renderListPanel(title, className, rows, headers, mapRow, emptyText) {
      return panel(title, h('div', { className },
        renderListToolbar(null, rows.length),
        reviewTable(headers, rows, mapRow, emptyText)
      ))
    }

    function businessPanel(title, subtitle, actions, content) {
      return h('section', { className: 'tcw-business-panel' },
        h('div', { className: 'tcw-business-head' },
          h('div', null, h('h2', null, title), h('p', null, subtitle)),
          h('div', { className: 'tcw-button-row' }, actions)
        ),
        h('div', { className: 'tcw-business-body' }, content)
      )
    }

    function renderListToolbar(title, total) {
      return h('div', { className: 'tcw-list-toolbar' },
        h('div', { className: 'tcw-list-title' },
          title ? h('h3', null, title) : null,
          h('span', null, `${total || 0} 条记录`)
        ),
        h('div', { className: 'tcw-list-actions' },
          h('label', { className: 'tcw-filter' },
            h('span', null, '状态'),
            h('select', { className: 'status-filter', value: statusFilter, onChange: (event) => { setStatusFilter(event.target.value); setSelectedIds([]) } },
              h('option', { value: 'all' }, '全部'),
              h('option', { value: 'pending' }, '待审核'),
              h('option', { value: 'confirmed' }, '已审核'),
              h('option', { value: 'rejected' }, '已驳回')
            )
          ),
          h('button', { className: 'tcw-btn tcw-btn-primary', disabled: busy || selectedIds.length === 0, onClick: batchApproveSelected }, `批量审核${selectedIds.length ? ` (${selectedIds.length})` : ''}`),
          h('button', { className: 'tcw-btn tcw-btn-soft', disabled: busy || selectedIds.length === 0, onClick: batchRejectSelected }, '批量驳回'),
          h('button', { className: 'tcw-btn tcw-btn-danger', disabled: busy || selectedIds.length === 0, onClick: batchDeleteSelected }, '批量删除')
        )
      )
    }

    function renderProductActions(row) {
      return h('div', { className: 'tcw-row-actions' },
        h('button', { className: 'tcw-mini-btn', disabled: busy || row.materializedOnly || row.reviewStatus === 'confirmed', onClick: () => confirmReview(row) }, '审核'),
        h('button', { className: 'tcw-mini-btn', disabled: busy, onClick: () => openEdit(row) }, '编辑'),
        h('button', { className: 'tcw-mini-btn danger', disabled: busy || row.reviewStatus === 'rejected', onClick: () => rejectReview(row) }, '驳回'),
        h('button', { className: 'tcw-mini-btn danger', disabled: busy, onClick: () => deleteRow(row) }, '删除')
      )
    }

    function renderSalesReviewActions(row) {
      return h('div', { className: 'tcw-row-actions' },
        h('button', { className: 'tcw-mini-btn', disabled: busy || row.reviewStatus === 'confirmed', onClick: () => confirmReview(row) }, '审核'),
        h('button', { className: 'tcw-mini-btn', disabled: busy, onClick: () => setDetailItem(row) }, '详情'),
        h('button', { className: 'tcw-mini-btn danger', disabled: busy || row.reviewStatus === 'rejected', onClick: () => rejectReview(row) }, '驳回'),
        h('button', { className: 'tcw-mini-btn danger', disabled: busy, onClick: () => deleteRow(row) }, '删除')
      )
    }

    function reviewTable(headers, rows, mapRow, emptyText, renderActions) {
      const selectableIds = getSelectableRowIds(rows)
      const selectedVisibleIds = selectableIds.filter((id) => selectedIds.includes(id))
      const allVisibleSelected = selectableIds.length > 0 && selectedVisibleIds.length === selectableIds.length
      const partiallySelected = selectedVisibleIds.length > 0 && selectedVisibleIds.length < selectableIds.length
      return table([
        h('input', {
          className: 'row-selection-checkbox',
          type: 'checkbox',
          'aria-label': '全选当前列表',
          checked: allVisibleSelected,
          disabled: selectableIds.length === 0,
          ref: (node) => {
            if (node) node.indeterminate = partiallySelected
          },
          onChange: (event) => toggleAllVisibleRows(rows, event.target.checked)
        }),
        ...headers,
        '状态',
        '操作'
      ], rows, (row) => [
        h('input', {
          className: 'row-selection-checkbox',
          type: 'checkbox',
          checked: selectedIds.includes(row.id),
          disabled: !row.id,
          onChange: (event) => toggleSelected(row.id, event.target.checked)
        }),
        ...mapRow(row),
        status(reviewStatusText(row.reviewStatus), row.reviewStatus === 'confirmed' ? 'ok' : row.reviewStatus === 'rejected' ? 'danger' : 'warn'),
        renderActions ? renderActions(row) : h('div', { className: 'tcw-row-actions' },
          h('button', { className: 'tcw-mini-btn', disabled: busy || row.materializedOnly || row.reviewStatus === 'confirmed', onClick: () => confirmReview(row) }, '审核'),
          h('button', { className: 'tcw-mini-btn danger', disabled: busy || row.materializedOnly || row.reviewStatus === 'rejected', onClick: () => rejectReview(row) }, '驳回')
        )
      ], emptyText)
    }

    function toggleSelected(id, checked) {
      if (!id) return
      setSelectedIds(checked ? Array.from(new Set([...selectedIds, id])) : selectedIds.filter((item) => item !== id))
    }

    function toggleAllVisibleRows(rows, checked) {
      const visibleIds = getSelectableRowIds(rows)
      if (checked) {
        setSelectedIds(Array.from(new Set([...selectedIds, ...visibleIds])))
        return
      }
      setSelectedIds(selectedIds.filter((id) => !visibleIds.includes(id)))
    }

    function getSelectableRowIds(rows) {
      return (rows || [])
        .filter((row) => row.id)
        .map((row) => row.id)
    }

    function getSelectedRows() {
      const rows = activePage === 'controlled-goods-page'
        ? controlledReviews
        : activePage === 'products-page'
          ? supplierReviews
          : activePage === 'workbooks-page'
            ? salesReviews
            : []
      const selected = new Set(selectedIds)
      return rows.filter((row) => selected.has(row.id))
    }

    function materializedDeleteAction(item) {
      return item.type === 'controlled_goods' ? 'delete_controlled_goods' : 'delete_supplier_product'
    }

    function paginateRows(listKey, rows) {
      const pageSize = getPageSize(listKey)
      const total = rows.length
      const totalPages = Math.max(1, Math.ceil(total / pageSize))
      const current = Math.min(Math.max(pageByList[listKey] || 1, 1), totalPages)
      return { rows: rows.slice((current - 1) * pageSize, current * pageSize), page: current, totalPages, pageSize }
    }

    function pagination(listKey, total) {
      if (total <= 0) return null
      const page = paginateRows(listKey, Array.from({ length: total }))
      return renderUnifiedPagination({
        total,
        page: page.page,
        totalPages: page.totalPages,
        pageSize: page.pageSize,
        pageSizeOptions: [10, 20, 50],
        jumpValue: pageJumpByList[listKey] || '',
        onPageChange: (nextPage) => setLocalPage(listKey, nextPage, page.totalPages),
        onPageSizeChange: (nextSize) => setLocalPageSize(listKey, nextSize),
        onJumpInput: (nextValue) => setPageJumpByList(Object.assign({}, pageJumpByList, { [listKey]: nextValue })),
        onJump: () => jumpLocalPage(listKey, page.totalPages)
      })
    }

    function getPageSize(listKey) {
      const value = Number(pageSizeByList[listKey])
      return Number.isFinite(value) && value > 0 ? value : 10
    }

    function setLocalPage(listKey, nextPage, totalPages) {
      const page = Math.min(Math.max(Number(nextPage) || 1, 1), totalPages || 1)
      setPageByList(Object.assign({}, pageByList, { [listKey]: page }))
    }

    function setLocalPageSize(listKey, nextSize) {
      const pageSize = Number(nextSize) || 10
      setPageSizeByList(Object.assign({}, pageSizeByList, { [listKey]: pageSize }))
      setPageByList(Object.assign({}, pageByList, { [listKey]: 1 }))
      setPageJumpByList(Object.assign({}, pageJumpByList, { [listKey]: '' }))
    }

    function jumpLocalPage(listKey, totalPages) {
      const value = Number(pageJumpByList[listKey])
      if (!Number.isFinite(value) || value <= 0) return
      setLocalPage(listKey, value, totalPages)
      setPageJumpByList(Object.assign({}, pageJumpByList, { [listKey]: '' }))
    }

    function renderDetailModal() {
      const data = readMerged(detailItem)
      const items = Array.isArray(data.items) ? data.items : []
      const entries = Object.entries(data).filter(([key]) => key !== 'items')
      return h('div', { className: 'tcw-modal-backdrop' },
        h('section', { className: 'tcw-modal' },
          h('div', { className: 'tcw-modal-head' },
            h('h2', null, '识别详情'),
            h('button', { className: 'tcw-icon-btn', onClick: () => setDetailItem(null) }, '×')
          ),
          h('div', { className: 'tcw-detail-grid' }, entries.map(([key, val]) =>
            h('div', { className: 'tcw-detail-field', key },
              h('span', null, fieldLabel(key)),
              h('strong', null, stringify(val))
            )
          )),
          items.length ? h('section', { className: 'tcw-detail-items' },
            h('h3', null, '商品明细'),
            table(['序号', '商品名称', '型号', '数量', '单价', '金额', '海关编码'], items, (item, index) => [
              index + 1,
              value(item.productName || item.englishName),
              value(item.model),
              value(item.quantity),
              value(item.unitPrice || item.taxInclusiveUnitPrice),
              value(item.amount || item.taxInclusiveTotalAmount),
              value(item.hsCode || item.contractHsCode || item.enrichedHsCode)
            ], '暂无商品明细。')
          ) : null,
          h('div', { className: 'tcw-modal-actions' },
            h('button', { className: 'tcw-btn tcw-btn-soft', onClick: () => setDetailItem(null) }, '关闭')
          )
        )
      )
    }

    function renderFormModal() {
      const fields = formDialog.type === 'controlled_goods' ? controlledGoodsFormFields : supplierProductFormFields
      const title = `${formDialog.mode === 'create' ? '新增' : '编辑'}${formDialog.type === 'controlled_goods' ? '管控商品' : '供应商商品'}`
      return h('div', { className: 'tcw-modal-backdrop' },
        h('form', { className: formDialog.type === 'supplier_product' ? 'tcw-modal tcw-form-modal tcw-form-modal-supplier' : 'tcw-modal tcw-form-modal', onSubmit: saveProductForm },
          h('div', { className: 'tcw-modal-head' },
            h('h2', null, title),
            h('button', { type: 'button', className: 'tcw-icon-btn', onClick: () => setFormDialog(null) }, '×')
          ),
          h('div', { className: formDialog.type === 'supplier_product' ? 'tcw-edit-grid tcw-edit-grid-two' : 'tcw-edit-grid' },
            fields.map((config) => formField(config))
          ),
          formDialog.type === 'supplier_product' ? renderSupplierHsCandidatePanel() : null,
          h('div', { className: 'tcw-modal-actions' },
            h('button', { type: 'button', className: 'tcw-btn tcw-btn-soft', onClick: () => setFormDialog(null) }, '取消'),
            h('button', { type: 'submit', className: 'tcw-btn tcw-btn-primary', disabled: busy }, '保存')
          )
        )
      )
    }

    function renderSupplierHsCandidatePanel() {
      const candidates = Array.isArray(formDialog.hsCandidates) ? formDialog.hsCandidates : []
      const pagination = formDialog.hsCandidatePagination || null
      const hasSourcePagination = pagination && (pagination.hasPrevious || pagination.hasNext || (pagination.pages && pagination.pages.length > 1))
      const localPageSize = Math.max(1, Number(formDialog.hsCandidateLocalPageSize) || 5)
      const localTotalPages = Math.max(1, Math.ceil(candidates.length / localPageSize))
      const localPage = Math.min(Math.max(Number(formDialog.hsCandidateLocalPage) || 1, 1), localTotalPages)
      const visibleCandidates = hasSourcePagination
        ? candidates
        : candidates.slice((localPage - 1) * localPageSize, localPage * localPageSize)
      return h('section', { className: 'tcw-hs-candidate-panel' },
        h('div', { className: 'tcw-subsection-head' },
          h('div', null,
            h('h3', null, '海关编码查询'),
            h('p', null, hsCodeLookupStatusText(formDialog.hsCandidateStatus, candidates.length))
          ),
          h('div', { className: 'tcw-hs-candidate-search' },
            h('input', {
              className: 'tcw-search',
              value: formDialog.hsCandidateKeyword || '',
              placeholder: '商品名称、型号或海关编码',
              onChange: (event) => setFormDialog(Object.assign({}, formDialog, { hsCandidateKeyword: event.target.value }))
            }),
            h('button', { type: 'button', className: 'tcw-mini-btn', disabled: busy || formDialog.hsCandidateLoading, onClick: () => searchSupplierHsCandidatesForForm(1) }, formDialog.hsCandidateLoading ? '查询中' : '查询')
          )
        ),
        formDialog.hsCandidateError ? h('div', { className: 'tcw-error' }, formDialog.hsCandidateError) : null,
        candidates.length ? h('div', { className: 'tcw-hs-candidate-result' },
          table(['编码', '商品名称', '英文名称', '单位', '退税率', '监管', '检验检疫', '操作'], visibleCandidates, (candidate) => [
            h('strong', { className: 'tcw-hs-code-text' }, value(candidate.code)),
            value(candidate.name),
            value(candidate.englishName),
            value(candidate.unit),
            value(candidate.taxRefundRate),
            value(candidate.regulatoryConditions),
            value(candidate.inspectionQuarantine),
            h('div', { className: 'tcw-row-actions' },
              h('button', { type: 'button', className: 'tcw-mini-btn', onClick: () => selectHsCandidate(candidate) }, '选用'),
              h('button', { type: 'button', className: 'tcw-mini-btn', disabled: !candidate.code && !candidate.detailUrl, onClick: () => loadHsCodeDetail(candidate) }, '详情')
            )
          ], '暂无查询结果。'),
          hasSourcePagination
            ? renderSupplierHsCandidatePagination(pagination)
            : renderSupplierHsCandidateLocalPagination(candidates.length, localPage, localTotalPages, localPageSize)
        ) : empty('暂无查询结果，可调整关键词后查询。')
      )
    }

    function renderSupplierHsCandidateLocalPagination(total, page, totalPages, pageSize) {
      if (total <= pageSize) return null
      return renderUnifiedPagination({
        total,
        page,
        totalPages,
        pageSize,
        pageSizeOptions: [5, 10, 20],
        jumpValue: formDialog.hsCandidateLocalJumpPage || '',
        onPageChange: (nextPage) => setFormDialog(Object.assign({}, formDialog, { hsCandidateLocalPage: Math.min(Math.max(Number(nextPage) || 1, 1), totalPages) })),
        onPageSizeChange: (nextSize) => setFormDialog(Object.assign({}, formDialog, { hsCandidateLocalPageSize: Number(nextSize) || 5, hsCandidateLocalPage: 1, hsCandidateLocalJumpPage: '' })),
        onJumpInput: (nextValue) => setFormDialog(Object.assign({}, formDialog, { hsCandidateLocalJumpPage: nextValue })),
        onJump: () => {
          const nextPage = Number(formDialog.hsCandidateLocalJumpPage)
          if (!Number.isFinite(nextPage) || nextPage <= 0) return
          setFormDialog(Object.assign({}, formDialog, {
            hsCandidateLocalPage: Math.min(Math.max(nextPage, 1), totalPages),
            hsCandidateLocalJumpPage: ''
          }))
        }
      })
    }

    function renderSupplierHsCandidatePagination(pagination) {
      if (!pagination || (!pagination.hasPrevious && !pagination.hasNext && (!pagination.pages || pagination.pages.length <= 1))) return null
      const pages = Array.isArray(pagination.pages) ? pagination.pages.filter((item) => item.page) : []
      const currentPage = pagination.currentPage || formDialog.hsCandidatePage || 1
      const maxPage = Number(pagination.maxVisiblePage) || Math.max(...pages.map((item) => Number(item.page) || 0), currentPage)
      return renderUnifiedPagination({
        page: currentPage,
        totalPages: Math.max(1, maxPage),
        pageSize: 10,
        fixedPageSize: true,
        loading: formDialog.hsCandidateLoading,
        hasPrevious: pagination.hasPrevious,
        hasNext: pagination.hasNext,
        jumpValue: formDialog.hsCandidateJumpPage || '',
        onPageChange: searchSupplierHsCandidatesForForm,
        onJumpInput: (nextValue) => setFormDialog(Object.assign({}, formDialog, { hsCandidateJumpPage: nextValue })),
        onJump: () => {
          const nextPage = Number(formDialog.hsCandidateJumpPage)
          if (!Number.isFinite(nextPage) || nextPage <= 0) return
          searchSupplierHsCandidatesForForm(nextPage)
          setFormDialog((current) => current ? Object.assign({}, current, { hsCandidateJumpPage: '' }) : current)
        }
      })
    }

    function renderUnifiedPagination(config) {
      const totalPages = Math.max(1, Number(config.totalPages) || 1)
      const page = Math.min(Math.max(Number(config.page) || 1, 1), totalPages)
      const canPrevious = config.hasPrevious === undefined ? page > 1 : Boolean(config.hasPrevious)
      const canNext = config.hasNext === undefined ? page < totalPages : Boolean(config.hasNext)
      const loading = Boolean(config.loading)
      const jumpValue = config.jumpValue || ''
      const pageSize = Number(config.pageSize) || 10
      return h('div', { className: 'tcw-pagination tcw-pagination-unified' },
        config.total == null ? null : h('span', { className: 'tcw-pagination-total' }, `共 ${config.total} 条`),
        h('button', { className: 'tcw-page-btn', disabled: loading || !canPrevious, onClick: () => config.onPageChange(1) }, '首页'),
        h('button', { className: 'tcw-page-btn', disabled: loading || !canPrevious, onClick: () => config.onPageChange(page - 1) }, '上一页'),
        h('span', { className: 'tcw-page-current' }, `第 ${page} / ${totalPages} 页`),
        h('button', { className: 'tcw-page-btn', disabled: loading || !canNext, onClick: () => config.onPageChange(page + 1) }, '下一页'),
        h('button', { className: 'tcw-page-btn', disabled: loading || !canNext, onClick: () => config.onPageChange(totalPages) }, '末页'),
        h('span', { className: 'tcw-page-size-label' }, '每页'),
        config.fixedPageSize
          ? h('span', { className: 'tcw-page-size-fixed' }, `${pageSize} 条/页`)
          : h('select', {
            className: 'tcw-page-size-select',
            value: pageSize,
            onChange: (event) => config.onPageSizeChange(Number(event.target.value))
          }, (config.pageSizeOptions || [10, 20, 50]).map((size) => h('option', { key: size, value: size }, `${size} 条/页`))),
        h('input', {
          className: 'tcw-page-jump-input',
          type: 'number',
          min: 1,
          max: totalPages,
          value: jumpValue,
          placeholder: String(page),
          onChange: (event) => config.onJumpInput(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              config.onJump()
            }
          }
        }),
        h('button', { className: 'tcw-page-btn', disabled: loading, onClick: config.onJump }, '跳转')
      )
    }

    function renderDeleteConfirmModal() {
      return h('div', { className: 'tcw-modal-backdrop' },
        h('section', { className: 'tcw-modal tcw-confirm-modal' },
          h('div', { className: 'tcw-modal-head' },
            h('h2', null, deleteDialog.title),
            h('button', { type: 'button', className: 'tcw-icon-btn', onClick: () => setDeleteDialog(null) }, '×')
          ),
          h('p', { className: 'tcw-confirm-text' }, deleteDialog.message),
          h('div', { className: 'tcw-modal-actions' },
            h('button', { type: 'button', className: 'tcw-btn tcw-btn-soft', onClick: () => setDeleteDialog(null) }, '取消'),
            h('button', { type: 'button', className: 'tcw-btn tcw-btn-danger', disabled: busy, onClick: confirmDeleteDialog }, '确认删除')
          )
        )
      )
    }

    function formField(config) {
      const value = formDialog.values[config.key]
      if (config.type === 'checkbox') {
        return h('label', { className: fieldClass(config, 'tcw-field-check'), key: config.key },
          h('span', null, config.label),
          h('input', { type: 'checkbox', checked: Boolean(value), onChange: (event) => updateFormValue(config.key, event.target.checked) })
        )
      }
      if (config.type === 'select') {
        return h('label', { className: fieldClass(config), key: config.key }, h('span', null, config.label), h('select', {
          value: value || '',
          onChange: (event) => updateFormValue(config.key, event.target.value)
        }, config.options.map((option) => h('option', { key: option.value, value: option.value }, option.label))))
      }
      if (config.type === 'textarea') {
        return h('label', { className: fieldClass(config), key: config.key }, h('span', null, config.label), h('textarea', {
          value: value || '',
          onChange: (event) => updateFormValue(config.key, event.target.value),
          placeholder: config.placeholder || ''
        }))
      }
      return h('label', { className: fieldClass(config), key: config.key }, h('span', null, config.label), h('input', {
        type: config.type === 'number' ? 'number' : 'text',
        value: value || '',
        onChange: (event) => updateFormValue(config.key, event.target.value),
        placeholder: config.placeholder || ''
      }))
    }

    function updateFormValue(key, value) {
      setFormDialog(Object.assign({}, formDialog, {
        values: Object.assign({}, formDialog.values, { [key]: value })
      }))
    }

    function fieldClass(config, extra) {
      return ['tcw-field', config.wide ? 'tcw-field-wide' : '', extra || ''].filter(Boolean).join(' ')
    }

    function pageToolbar(title, subtitle, actions) {
      return h('div', { className: 'tcw-page-head' },
        h('div', null, h('h2', null, title), h('p', null, subtitle)),
        h('div', { className: 'tcw-button-row' }, actions)
      )
    }

    function uploadButton(actionKey, label) {
      return h(React.Fragment, null,
        h('input', {
          ref: (node) => {
            if (node) fileInputsRef.current[actionKey] = node
            else delete fileInputsRef.current[actionKey]
          },
          className: 'tcw-upload-input',
          type: 'file',
          disabled: busy,
          onChange: (event) => {
            const file = event.target.files && event.target.files[0]
            event.target.value = ''
            debugUpload('file picker returned', { actionKey, hasFile: !!file, fileName: file && file.name, size: file && file.size })
            handleFile(actionKey, file)
          }
        }),
        h('button', {
          type: 'button',
          className: 'tcw-upload',
          disabled: busy,
          onClick: () => openFilePicker(actionKey)
        }, label)
      )
    }

    function openFilePicker(actionKey) {
      debugUpload('upload button clicked', { actionKey, busy })
      if (busy) return
      const input = fileInputsRef.current[actionKey]
      if (!input) {
        debugUpload('file input was not registered', { actionKey })
        showNotice('上传控件未准备好，请刷新页面后重试。', 'error')
        return
      }
      input.click()
    }

    function workspaceUploadPathForAction(actionKey) {
      if (actionKey === 'upload_controlled_goods_file') return 'trade-compliance-workbench/uploads/controlled-goods'
      if (actionKey === 'upload_supplier_contract') return 'trade-compliance-workbench/uploads/supplier-contracts'
      if (actionKey === 'upload_sales_contract') return 'trade-compliance-workbench/uploads/sales-contracts'
      return 'trade-compliance-workbench/uploads/source-files'
    }

  }

  function metric(label, valueText, icon, tone) {
    return h('div', { className: 'tcw-metric' },
      h('span', { className: 'tcw-metric-icon ' + (tone || 'blue') }, iconImage(icon, label, tone)),
      h('div', { className: 'tcw-metric-body' },
        h('span', null, label),
        h('strong', null, valueText)
      )
    )
  }

  function iconImage(name, label, tone) {
    return h('img', { src: iconDataUri(name, tone), alt: label || '', 'aria-hidden': label ? undefined : true })
  }

  function iconDataUri(name, tone) {
    const colors = {
      blue: '#2563eb',
      green: '#139160',
      orange: '#e07818',
      violet: '#7c3aed',
      slate: '#526174'
    }
    const color = colors[tone] || colors.blue
    const paths = {
      dashboard: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
      shield: '<path d="M12 3l7 3v5c0 4.8-2.9 8.2-7 10-4.1-1.8-7-5.2-7-10V6l7-3z"/><path d="M9 12l2 2 4-5"/>',
      box: '<path d="M4 8l8-4 8 4-8 4-8-4z"/><path d="M4 8v8l8 4 8-4V8"/><path d="M12 12v8"/>',
      invoice: '<path d="M7 3h8l4 4v14l-3-1.5L13 21l-3-1.5L7 21V3z"/><path d="M15 3v5h4"/><path d="M9 11h6"/><path d="M9 15h6"/>',
      search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
      archive: '<path d="M4 7h16v13H4V7z"/><path d="M3 4h18v3H3z"/><path d="M9 11h6"/>',
      supplier: '<path d="M4 20V8l8-4 8 4v12"/><path d="M8 20v-7h8v7"/><path d="M10 9h4"/>',
      document: '<path d="M7 3h7l5 5v13H7V3z"/><path d="M14 3v6h5"/><path d="M9 13h6"/><path d="M9 17h6"/>',
      records: '<path d="M6 5h12v16H6V5z"/><path d="M9 3h6v4H9z"/><path d="M9 11h6"/><path d="M9 15h6"/>'
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.dashboard}</svg>`
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
  }

  function panel(title, content) {
    return h('section', { className: 'tcw-panel' }, h('h3', null, title), content)
  }

  function field(label, child) {
    return h('label', { className: 'tcw-field' }, h('span', null, label), child)
  }

  function table(headers, rows, mapRow, emptyText, onRowClick) {
    if (!rows || rows.length === 0) return empty(emptyText || '暂无数据。')
    return h('div', { className: 'tcw-table-wrap' },
      h('table', { className: 'tcw-table' },
        h('thead', null, h('tr', null, headers.map((item, index) => h('th', { key: index }, item)))),
        h('tbody', null, rows.map((row, index) =>
          h('tr', { key: row.id || index, className: onRowClick ? 'clickable' : '', onClick: onRowClick ? () => onRowClick(row) : undefined },
            mapRow(row, index).map((cell, cellIndex) => h('td', { key: cellIndex }, cell))
          )
        ))
      )
    )
  }

  function compareBlock(label, data) {
    const entries = Object.entries(isObject(data) ? data : {})
    return h('section', { className: 'tcw-compare' },
      h('h3', null, label),
      entries.length === 0 ? h('p', null, '暂无') : entries.slice(0, 16).map(([key, val]) =>
        h('div', { className: 'tcw-kv', key }, h('span', null, key), h('strong', null, stringify(val)))
      )
    )
  }

  function status(text, level) {
    return h('span', { className: 'tcw-status ' + (level || 'muted') }, text)
  }

  function empty(text) {
    return h('div', { className: 'tcw-empty' }, text)
  }

  const reviewSearchKeys = ['title', 'sourceLocation']
  const overviewSearchKeys = [
    'title',
    'sourceLocation',
    'sourceFileName',
    'fileName',
    'supplierName',
    'supplierCreditCode',
    'productName',
    'model',
    'description',
    'hsCode',
    'contractHsCode',
    'enrichedHsCode',
    'englishName',
    'invoiceNo',
    'contractNo',
    'buyerName',
    'sellerName',
    'controlNote',
    'keywords',
    'referenceNameCandidate',
    'parseStatus',
    'parseWarnings',
    'rawText'
  ]
  const controlledGoodsFormFields = [
    { key: 'productName', label: '商品名称', placeholder: '例如：高性能服务器' },
    { key: 'referenceNameCandidate', label: '候选商品名' },
    { key: 'parseStatus', label: '解析状态' },
    { key: 'parseWarnings', label: '解析提示' },
    { key: 'hsCode', label: '海关编码', placeholder: '例如：8471501010' },
    { key: 'keywords', label: '关键词', placeholder: '逗号或空格分隔' },
    { key: 'controlNote', label: '管控说明', type: 'textarea', wide: true, placeholder: '许可证、两用物项、禁限说明' },
    { key: 'rawText', label: '原文片段', type: 'textarea', wide: true },
    { key: 'sourceFileName', label: '来源文件' },
    { key: 'sourceLocation', label: '来源位置' },
    { key: 'enabled', label: '启用', type: 'checkbox' }
  ]
  const supplierProductFormFields = [
    { key: 'supplierName', label: '供应商名称', placeholder: '例如：某某科技有限公司' },
    { key: 'supplierCreditCode', label: '供应商统一社会信用代码' },
    { key: 'supplierAddress', label: '供应商地址' },
    { key: 'productName', label: '商品名称', placeholder: '例如：服务器' },
    { key: 'model', label: '型号' },
    { key: 'description', label: '商品描述', type: 'textarea', wide: true },
    { key: 'quantity', label: '数量', type: 'number' },
    { key: 'unit', label: '单位' },
    { key: 'taxInclusiveUnitPrice', label: '含税单价', type: 'number' },
    { key: 'taxInclusiveTotalAmount', label: '含税金额', type: 'number' },
    { key: 'contractHsCode', label: '合同海关编码' },
    { key: 'enrichedHsCode', label: '补全海关编码' },
    { key: 'taxRefundRate', label: '退税率' },
    { key: 'englishName', label: '英文品名' },
    {
      key: 'controlledStatus',
      label: '管控状态',
      type: 'select',
      options: [
        { value: 'unchecked', label: '未检查' },
        { value: 'not_controlled', label: '非管控' },
        { value: 'suspected', label: '疑似管控' },
        { value: 'controlled', label: '管控' }
      ]
    },
    { key: 'controlNote', label: '管控说明', type: 'textarea', wide: true }
  ]
  const fieldLabels = {
    productName: '商品名称',
    hsCode: '海关编码',
    keywords: '关键词',
    controlNote: '管控说明',
    enabled: '启用',
    supplierName: '供应商名称',
    supplierCreditCode: '供应商统一社会信用代码',
    supplierAddress: '供应商地址',
    model: '型号',
    description: '商品描述',
    quantity: '数量',
    unit: '单位',
    taxInclusiveUnitPrice: '含税单价',
    taxInclusiveTotalAmount: '含税金额',
    contractHsCode: '合同海关编码',
    enrichedHsCode: '补全海关编码',
    suggestedHsCode: '建议海关编码',
    suggestedHsCodeName: '建议编码品名',
    suggestedHsCodeEnglishName: '建议英文品名',
    suggestedTaxRefundRate: '建议退税率',
    hsCodeCandidateCount: '查询结果数量',
    taxRefundRate: '退税率',
    englishName: '英文品名',
    controlledStatus: '管控状态',
    date: '日期',
    origin: '起运地',
    freight: '运费',
    currency: '币制',
    buyerName: '买方',
    buyerAddress: '买方地址',
    sellerName: '卖方',
    sellerEnglishName: '卖方英文名',
    invoiceNo: '发票号',
    contractNo: '合同号',
    netWeight: '净重',
    grossWeight: '毛重',
    taxNature: '征免性质',
    taxExemptionNature: '征免性质',
    tradeTerm: '贸易术语',
    paymentTerm: '付款条款',
    destination: '目的地',
    packageType: '包装种类',
    supervisionMode: '监管方式',
    domesticSourceLocation: '境内货源地',
    bankBeneficiary: '收款人',
    bankName: '开户银行',
    bankAddress: '银行地址',
    bankAccountNo: '银行账号',
    cnapsCode: 'CNAPS 代码',
    swiftCode: 'Swift 代码',
    sourceFileName: '来源文件'
  }

  function emptyFormValues(type) {
    if (type === 'controlled_goods') {
      return {
        productName: '',
        hsCode: '',
        keywords: '',
        referenceNameCandidate: '',
        parseStatus: '',
        parseWarnings: '',
        rawText: '',
        controlNote: '',
        sourceFileName: '',
        sourceLocation: '',
        enabled: true
      }
    }
    return {
      supplierName: '',
      supplierCreditCode: '',
      supplierAddress: '',
      productName: '',
      model: '',
      description: '',
      quantity: '',
      unit: '',
      taxInclusiveUnitPrice: '',
      taxInclusiveTotalAmount: '',
      contractHsCode: '',
      enrichedHsCode: '',
      taxRefundRate: '',
      englishName: '',
      controlledStatus: 'unchecked',
      controlNote: ''
    }
  }

  function valuesFromItem(type, item) {
    const merged = type === 'supplier_product' ? readSupplierEditableMerged(item || {}) : readMerged(item || {})
    const base = emptyFormValues(type)
    for (const key of Object.keys(base)) {
      const value = merged[key]
      if (key === 'keywords' && Array.isArray(value)) {
        base[key] = value.join('，')
      } else if (value !== undefined && value !== null) {
        base[key] = String(value)
      }
    }
    if (type === 'controlled_goods') {
      base.enabled = merged.enabled === undefined ? true : Boolean(merged.enabled)
    }
    return base
  }

  function normalizeFormPayload(type, values) {
    if (type === 'controlled_goods') {
      return compactObject({
        productName: normalizeText(values.productName),
        referenceNameCandidate: normalizeText(values.referenceNameCandidate),
        parseStatus: normalizeText(values.parseStatus),
        parseWarnings: splitKeywords(values.parseWarnings),
        rawText: normalizeText(values.rawText),
        hsCode: normalizeText(values.hsCode),
        keywords: splitKeywords(values.keywords),
        controlNote: normalizeText(values.controlNote),
        sourceFileName: normalizeText(values.sourceFileName),
        sourceLocation: normalizeText(values.sourceLocation),
        enabled: Boolean(values.enabled)
      })
    }
    return compactObject({
      supplierName: normalizeText(values.supplierName),
      supplierCreditCode: normalizeText(values.supplierCreditCode),
      supplierAddress: normalizeText(values.supplierAddress),
      productName: normalizeText(values.productName),
      model: normalizeText(values.model),
      description: normalizeText(values.description),
      quantity: normalizeNumber(values.quantity),
      unit: normalizeText(values.unit),
      taxInclusiveUnitPrice: normalizeNumber(values.taxInclusiveUnitPrice),
      taxInclusiveTotalAmount: normalizeNumber(values.taxInclusiveTotalAmount),
      contractHsCode: normalizeText(values.contractHsCode),
      enrichedHsCode: normalizeText(values.enrichedHsCode),
      taxRefundRate: normalizeText(values.taxRefundRate),
      englishName: normalizeText(values.englishName),
      controlledStatus: normalizeText(values.controlledStatus) || 'unchecked',
      controlNote: normalizeText(values.controlNote)
    })
  }

  function normalizeText(value) {
    const text = String(value ?? '').trim()
    return text ? text : undefined
  }

  function normalizeNumber(value) {
    if (value === '' || value === undefined || value === null) return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  function buildSupplierHsCandidateKeyword(values) {
    const contractHsCode = normalizeHsCode(values && values.contractHsCode)
    if (contractHsCode) return contractHsCode
    const keyword = [values && values.productName, values && values.model].map(normalizeText).filter(Boolean).join(' ').trim()
    if (keyword) return keyword
    const description = normalizeText(values && values.description)
    return description ? description.slice(0, 100) : ''
  }

  function resolveDisplayHsCode(row) {
    return normalizeHsCode(row && row.enrichedHsCode) || normalizeHsCode(row && row.contractHsCode)
  }

  function normalizeHsCode(value) {
    const text = normalizeText(value)
    if (!text) return ''
    const digits = text.replace(/\D/g, '')
    return /^\d{8,10}$/.test(digits) ? digits : ''
  }

  function buildConfirmReviewData(item) {
    if (!item || item.type !== 'supplier_product') {
      return Object.assign({}, item && item.defaultData || {}, item && item.extractedData || {}, item && item.confirmedData || {})
    }
    return Object.assign(
      {},
      item.defaultData,
      item.extractedData,
      item.confirmedData || {}
    )
  }

  function readSupplierEditableMerged(item) {
    return Object.assign(
      {},
      item && item.defaultData,
      item && item.extractedData,
      item && item.confirmedData
    )
  }

  function hsCodeLookupStatusText(statusValue, count) {
    if (statusValue === 'confirmed') return '已选用海关编码，保存后写入供应商商品。'
    if (statusValue === 'pending_confirmation') return count ? `已查询到 ${count} 条结果，可选用一条写入商品信息。` : '可查询海关编码并选用结果。'
    if (statusValue === 'not_found') return '未查询到候选编码，可调整关键词重新查询。'
    if (statusValue === 'failed') return '海关编码查询失败，可稍后重试。'
    if (statusValue === 'not_ready') return '缺少商品名称、型号或编码，可补充信息后查询。'
    return count ? `已查询到 ${count} 条结果。` : '可按商品名称、型号或海关编码查询。'
  }

  function hsCodeReviewStatusText(row) {
    if (row.enrichedHsCode) return '已确认'
    if (Array.isArray(row.hsCodeCandidates) && row.hsCodeCandidates.length > 0) return '待确认'
    if (row.hsCodeLookupStatus === 'failed') return '查询失败'
    if (row.hsCodeLookupStatus === 'not_found') return '未匹配'
    if (normalizeHsCode(row.contractHsCode)) return '合同编码'
    return '待查询'
  }

  function hsCodeReviewStatusLevel(row) {
    if (row.enrichedHsCode) return 'ok'
    if (Array.isArray(row.hsCodeCandidates) && row.hsCodeCandidates.length > 0) return 'warn'
    if (row.hsCodeLookupStatus === 'failed') return 'danger'
    if (row.hsCodeLookupStatus === 'not_found') return 'muted'
    return 'muted'
  }

  function splitKeywords(value) {
    if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
    return String(value || '').split(/[,\s，、]+/).map(normalizeText).filter(Boolean)
  }

  function compactObject(value) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
  }

  function normalizeData(payload) {
    const body = payload && payload.summary ? payload.summary : payload || {}
    return {
      reviewItems: Array.isArray(body.reviewItems) ? body.reviewItems : [],
      controlledGoods: Array.isArray(body.controlledGoods) ? body.controlledGoods : [],
      products: Array.isArray(body.products) ? body.products : [],
      workbookGenerations: Array.isArray(body.workbookGenerations) ? body.workbookGenerations : []
    }
  }

  function toControlledGoodsReviewRow(item) {
    return {
      id: `controlled:${item.id || item.productName || item.hsCode}`,
      materializedId: item.id,
      type: 'controlled_goods',
      title: item.productName || item.hsCode || '管控商品',
      reviewStatus: 'confirmed',
      extractedData: item,
      defaultData: {},
      confirmedData: item,
      sourceLocation: item.sourceLocation || item.sourceFileName,
      materializedOnly: true
    }
  }

  function toSupplierProductReviewRow(item) {
    return {
      id: `product:${item.id || item.productName || item.model}`,
      materializedId: item.id,
      type: 'supplier_product',
      title: item.productName || item.model || '供应商商品',
      reviewStatus: 'confirmed',
      extractedData: item,
      defaultData: {},
      confirmedData: item,
      sourceLocation: item.sourceFileName,
      materializedOnly: true
    }
  }

  function getResponsePayload(response) {
    if (!response) return null
    if (Object.prototype.hasOwnProperty.call(response, 'payload')) return response.payload
    if (Object.prototype.hasOwnProperty.call(response, 'data')) return response.data
    if (response.result) return response.result
    return response
  }

  function getActionDataPayload(response) {
    const result = getResponsePayload(response)
    if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'data')) return result.data
    return result
  }

  function readExpectedCount(payload) {
    if (!payload || typeof payload !== 'object') return 0
    const value = payload.expectedCount
    return Number.isFinite(value) && value > 0 ? value : 0
  }

  function assertActionSuccess(response) {
    const payload = getResponsePayload(response)
    if (payload && payload.success === false) throw new Error(resolveMessage(payload.message) || '操作失败')
  }

  function collectAssistantCommands(payload) {
    if (!payload || typeof payload !== 'object') return []
    const commands = []
    if (Array.isArray(payload.messages)) payload.messages.forEach((message) => {
      const command = normalizeAssistantCommand(message)
      if (command) commands.push(command)
    })
    const directCommand = normalizeAssistantCommand(payload)
    if (directCommand) commands.push(directCommand)
    return commands
  }

  function normalizeAssistantCommand(value) {
    if (!value || typeof value !== 'object' || value.commandKey !== 'assistant.chat.send_message' || !value.payload) return null
    const text = typeof value.payload.text === 'string' && value.payload.text.trim() ? value.payload.text : ''
    if (!text) return null
    return { commandKey: value.commandKey, payload: Object.assign({}, value.payload, { text }) }
  }

  function resolveMessage(message) {
    if (!message) return ''
    if (typeof message === 'string') return message
    if (typeof message.zh_Hans === 'string') return message.zh_Hans
    if (typeof message.en_US === 'string') return message.en_US
    return ''
  }

  function getErrorMessage(error) {
    return error && error.message ? error.message : String(error || '操作失败')
  }

  function debugUpload(message, details) {
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug('[trade-compliance-workbench:upload] ' + message, details || {})
    }
  }

  function filterItems(items, query, keys) {
    const keyword = String(query || '').trim().toLowerCase()
    if (!keyword) return items
    return items.filter((item) => {
      const merged = Object.assign({}, item || {}, readMerged(item || {}))
      return keys.some((key) => String(merged[key] || '').toLowerCase().includes(keyword))
    })
  }

  function applyStatusFilter(items, statusFilter) {
    if (!statusFilter || statusFilter === 'all') return items
    return items.filter((item) => (item.reviewStatus || 'pending') === statusFilter)
  }

  function reviewTypeForUploadAction(actionKey) {
    if (actionKey === 'upload_controlled_goods_file') return 'controlled_goods'
    if (actionKey === 'upload_supplier_contract') return 'supplier_product'
    if (actionKey === 'upload_sales_contract') return 'customs_workbook'
    return null
  }

  function countReviewItemsByType(items, type) {
    if (!type || !Array.isArray(items)) return 0
    return items.filter((item) => item.type === type && !isPlaceholderReviewItem(item)).length
  }

  function parseMaterializedId(id) {
    return String(id || '').split(':').slice(1).join(':') || id
  }

  function isPlaceholderReviewItem(item) {
    const merged = readMerged(item || {})
    if (!item || !item.type) return true
    if (item.type === 'controlled_goods' && !merged.productName && !merged.hsCode && String(item.title || '').startsWith('管控商品文件：')) return true
    if (item.type === 'supplier_product' && !merged.productName && !merged.supplierName && String(item.title || '').startsWith('供应商合同：')) return true
    if (item.type === 'customs_workbook' && !merged.invoiceNo && !merged.contractNo && String(item.title || '').startsWith('购销合同：')) return true
    return false
  }

  function groupBy(items, keyFn) {
    return items.reduce((acc, item) => {
      const key = keyFn(item)
      acc[key] = acc[key] || []
      acc[key].push(item)
      return acc
    }, {})
  }

  function readMerged(item) {
    return Object.assign({}, item && item.defaultData, item && item.extractedData, item && item.confirmedData)
  }

  function value(input, fallback) {
    if (input === 0) return '0'
    return input == null || input === '' ? (fallback || '-') : String(input)
  }

  function stringify(input) {
    if (input == null || input === '') return '-'
    if (typeof input === 'object') return JSON.stringify(input)
    return String(input)
  }

  function fieldLabel(key) {
    return fieldLabels[key] || key
  }

  function base64ToBytes(base64) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  }

  function escapeHtml(input) {
    return String(input ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]))
  }

  function reviewTypeText(type) {
    if (type === 'controlled_goods') return '管控'
    if (type === 'supplier_product') return '商品'
    if (type === 'customs_workbook') return '发票'
    return value(type)
  }

  function reviewStatusText(statusText) {
    if (statusText === 'confirmed') return '已确认'
    if (statusText === 'rejected') return '已驳回'
    if (statusText === 'needs_revision') return '需修订'
    return '待审核'
  }

  function controlStatusText(statusText) {
    if (statusText === 'controlled') return '管控'
    if (statusText === 'suspected') return '疑似管控'
    if (statusText === 'not_controlled') return '非管控'
    return '未检查'
  }

  function controlStatusLevel(statusText) {
    if (statusText === 'controlled') return 'danger'
    if (statusText === 'suspected') return 'warn'
    if (statusText === 'not_controlled') return 'ok'
    return 'muted'
  }

    function pageTitle(key) {
      if (key === 'overview-page') return '总览'
      if (key === 'controlled-goods-page') return '管控商品'
      if (key === 'products-page') return '供应商商品'
      if (key === 'hs-code-search-page') return '工具'
      return '销售发票'
    }

  function pageSubtitle(key) {
    if (key === 'overview-page') return '按业务顺序聚合待审核事项，先确认基础资料，再生成销售发票。'
      if (key === 'controlled-goods-page') return '上传管控目录、审核识别结果、维护正式管控商品库。'
      if (key === 'products-page') return '上传供应商合同，审核商品、HS Code、退税率和管控状态。'
      if (key === 'hs-code-search-page') return '输入商品名称或海关编码，查询 HS 编码网结果。'
      return '上传购销合同，审核发票字段并生成固定模板 Excel。'
    }

    function pageBreadcrumb(key) {
      if (key === 'overview-page') return 'Workspace / 总览'
      if (key === 'controlled-goods-page') return 'Workspace / 管控商品'
      if (key === 'products-page') return 'Workspace / 供应商商品'
      if (key === 'workbooks-page') return 'Workspace / 销售发票'
      return 'Workspace / 工具'
    }

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
  }

  function injectStyles() {
    const style = document.createElement('style')
    style.textContent = `
:root { color-scheme: light; --tcw-bg:#f5f7fa; --tcw-card:#fff; --tcw-soft:#f8fafc; --tcw-text:#152033; --tcw-muted:#66758a; --tcw-border:#dbe3ed; --tcw-primary:#176b87; --tcw-primary-dark:#0f5167; --tcw-success:#147a46; --tcw-warning:#9a5b00; --tcw-danger:#b42318; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--tcw-bg); color: var(--tcw-text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
button, input, textarea, select { font: inherit; letter-spacing: 0; }
.tcw-shell { display: grid; grid-template-rows: auto auto auto 1fr; gap: 10px; min-height: 100vh; padding: 12px 8px 18px; }
.tcw-frame { width: 100%; max-width: none; margin: 0; justify-self: stretch; }
.tcw-header { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(340px, 520px); gap: 12px; align-items: center; border: 1px solid var(--tcw-border); border-radius: 8px; background: var(--tcw-card); padding: 12px 14px; }
.tcw-title-block { display: grid; gap: 3px; }
.tcw-kicker { color: var(--tcw-primary); font-size: 12px; font-weight: 900; }
.tcw-title-block h1 { margin: 0; font-size: 20px; line-height: 1.22; }
.tcw-title-block p, .tcw-page-head p, .tcw-drawer-head p { margin: 0; color: var(--tcw-muted); font-size: 13px; }
.tcw-header-actions { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.tcw-search, .tcw-field input, .tcw-field textarea, .tcw-field select { width: 100%; min-height: 36px; border: 1px solid var(--tcw-border); border-radius: 6px; background: var(--tcw-card); color: var(--tcw-text); padding: 8px 10px; }
.tcw-field textarea { min-height: 78px; resize: vertical; }
.tcw-btn, .tcw-upload { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; border: 1px solid var(--tcw-border); border-radius: 6px; background: var(--tcw-card); color: var(--tcw-text); padding: 8px 12px; cursor: pointer; white-space: nowrap; }
.tcw-btn:disabled, .tcw-upload:has(input:disabled) { cursor: not-allowed; opacity: .55; }
.tcw-btn-primary { border-color: var(--tcw-primary); background: var(--tcw-primary); color: #fff; }
.tcw-btn-primary:hover:not(:disabled) { background: var(--tcw-primary-dark); }
.tcw-btn-soft { background: var(--tcw-soft); }
.tcw-btn-danger { border-color: color-mix(in srgb, var(--tcw-danger) 35%, var(--tcw-border)); background: color-mix(in srgb, var(--tcw-danger) 6%, var(--tcw-card)); color: var(--tcw-danger); }
.tcw-wide { width: 100%; }
.tcw-upload { border-style: dashed; border-color: color-mix(in srgb, var(--tcw-primary) 42%, var(--tcw-border)); color: var(--tcw-primary); font-weight: 800; }
.tcw-upload-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.tcw-tabs { display: flex; gap: 6px; overflow-x: auto; border-bottom: 1px solid var(--tcw-border); padding: 0 2px; }
.tcw-tab { min-height: 34px; border: 0; border-bottom: 3px solid transparent; background: transparent; color: var(--tcw-muted); padding: 7px 12px; cursor: pointer; font-weight: 900; }
.tcw-tab.active { border-color: var(--tcw-primary); color: var(--tcw-primary); }
.tcw-main { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-items: start; }
.tcw-main.with-drawer { grid-template-columns: minmax(0, 1fr) minmax(340px, 410px); }
.tcw-content, .tcw-drawer, .tcw-panel, .tcw-supplier-block { border: 1px solid var(--tcw-border); border-radius: 8px; background: var(--tcw-card); }
.tcw-content { min-width: 0; border: 0; background: transparent; padding: 0; }
.tcw-page { display: grid; gap: 12px; width: 100%; }
.tcw-page-head, .tcw-drawer-head, .tcw-supplier-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.tcw-page-head h2, .tcw-drawer-head h2, .tcw-panel h3 { margin: 0 0 4px; font-size: 16px; line-height: 1.35; }
.tcw-button-row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.tcw-panel { display: grid; gap: 10px; padding: 12px; }
.tcw-business-panel { display: grid; width: 100%; gap: 0; border: 1px solid var(--tcw-border); border-radius: 8px; background: var(--tcw-card); overflow: hidden; }
.tcw-business-head { display: flex; min-height: 118px; align-items: flex-start; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--tcw-border); background: var(--tcw-card); padding: 22px 28px; }
.tcw-business-head h2 { margin: 0 0 4px; font-size: 18px; line-height: 1.25; }
.tcw-business-head p { margin: 0; color: var(--tcw-muted); font-size: 13px; }
.tcw-business-body { display: grid; gap: 12px; padding: 20px 28px 24px; }
.tcw-table-section { display: grid; gap: 0; }
.tcw-history-section { display: grid; gap: 10px; border-top: 1px solid var(--tcw-border); padding-top: 14px; }
.tcw-subsection-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.tcw-subsection-head h3, .tcw-list-title h3 { margin: 0; font-size: 15px; line-height: 1.3; }
.tcw-subsection-head p, .tcw-list-title span { margin: 0; color: var(--tcw-muted); font-size: 12px; }
.tcw-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.tcw-metric {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  border: 1px solid var(--tcw-border);
  border-radius: 8px;
  background: var(--tcw-card);
  padding: 12px;
}
.tcw-metric-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  font-size: 18px;
  font-weight: 900;
}
.tcw-metric-icon img {
  width: 22px;
  height: 22px;
  color: currentColor;
}
.tcw-metric-icon.blue { background: #e8f0ff; color: var(--tcw-primary); }
.tcw-metric-icon.green { background: #e7f8ef; color: var(--tcw-success); }
.tcw-metric-icon.orange { background: #fff2df; color: var(--tcw-warning); }
.tcw-metric-icon.violet { background: #f1eaff; color: var(--tcw-violet); }
.tcw-metric-icon.slate { background: #eef2f6; color: var(--tcw-slate); }
.tcw-metric-body { display: grid; gap: 2px; }
.tcw-metric-body span { color: var(--tcw-muted); font-size: 12px; }
.tcw-metric-body strong { font-size: 22px; line-height: 1; }
.tcw-field { display: grid; gap: 5px; min-width: 0; }
.tcw-field span { color: var(--tcw-muted); font-size: 12px; font-weight: 800; }
.tcw-field-check { align-content: end; }
.tcw-field-check input { width: 18px; height: 18px; min-height: 18px; padding: 0; }
.tcw-check { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; color: var(--tcw-muted); font-size: 13px; }
.tcw-table-wrap { overflow: auto; border: 1px solid var(--tcw-border); border-radius: 8px; }
.tcw-table { width: 100%; min-width: 840px; border-collapse: collapse; font-size: 12px; }
.tcw-table th, .tcw-table td { border-bottom: 1px solid var(--tcw-border); padding: 10px; text-align: left; vertical-align: top; }
.tcw-table th { background: var(--tcw-soft); color: var(--tcw-muted); font-size: 11px; font-weight: 900; }
.tcw-table tr:last-child td { border-bottom: 0; }
.tcw-table tr.clickable { cursor: pointer; }
.tcw-table tr.clickable:hover td { background: color-mix(in srgb, var(--tcw-primary) 5%, transparent); }
.tcw-list-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.tcw-list-title { display: grid; gap: 2px; min-width: 160px; }
.tcw-list-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.tcw-filter { display: inline-flex; align-items: center; gap: 8px; color: var(--tcw-muted); font-size: 13px; font-weight: 800; }
.tcw-filter select { min-height: 34px; border: 1px solid var(--tcw-border); border-radius: 6px; background: var(--tcw-card); color: var(--tcw-text); padding: 6px 28px 6px 9px; }
.tcw-row-actions { display: flex; flex-wrap: wrap; gap: 6px; }
	.tcw-mini-btn { min-height: 28px; border: 1px solid color-mix(in srgb, var(--tcw-primary) 35%, var(--tcw-border)); border-radius: 6px; background: color-mix(in srgb, var(--tcw-primary) 6%, var(--tcw-card)); color: var(--tcw-primary); padding: 4px 8px; cursor: pointer; font-size: 12px; font-weight: 800; }
	.tcw-mini-btn.active { background: var(--tcw-primary); color: #fff; }
	.tcw-mini-btn.danger { border-color: color-mix(in srgb, var(--tcw-danger) 35%, var(--tcw-border)); background: color-mix(in srgb, var(--tcw-danger) 6%, var(--tcw-card)); color: var(--tcw-danger); }
	.tcw-mini-btn:disabled { cursor: not-allowed; opacity: .5; }
		.tcw-hs-code-text { overflow-wrap: anywhere; font-size: 12px; }
		.tcw-hs-search-form { display: grid; gap: 10px; }
		.tcw-hs-search-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
		.tcw-hs-candidate-panel { display: grid; gap: 10px; border-top: 1px solid var(--tcw-border); padding-top: 12px; }
		.tcw-hs-candidate-search { display: grid; grid-template-columns: minmax(220px, 320px) auto; gap: 8px; align-items: center; }
		.tcw-error { border: 1px solid color-mix(in srgb, var(--tcw-danger) 35%, var(--tcw-border)); border-radius: 8px; background: color-mix(in srgb, var(--tcw-danger) 6%, var(--tcw-card)); color: var(--tcw-danger); padding: 10px 12px; font-size: 13px; font-weight: 800; }
	.row-selection-checkbox { width: 16px; height: 16px; }
.tcw-empty { display: grid; place-items: center; min-height: 86px; border: 1px dashed var(--tcw-border); border-radius: 8px; background: var(--tcw-soft); color: var(--tcw-muted); padding: 16px; text-align: center; }
.tcw-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--tcw-border);
  border-radius: 8px;
  background: var(--tcw-card);
  padding: 8px 10px;
  color: var(--tcw-muted);
  font-size: 12px;
}
.tcw-pagination-unified { justify-content: flex-start; }
.tcw-page-buttons { display: flex; gap: 8px; }
.tcw-pagination-total {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  color: var(--tcw-primary);
}
.tcw-page-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  min-height: 28px;
  border: 1px solid var(--tcw-border);
  border-radius: 6px;
  background: #fff;
  color: var(--tcw-primary);
  padding: 4px 9px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}
.tcw-page-btn:disabled {
  cursor: not-allowed;
  background: var(--tcw-soft);
  color: #9aa7b8;
}
.tcw-page-current {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  border-radius: 6px;
  background: var(--tcw-primary);
  color: #fff;
  padding: 4px 12px;
  font-weight: 800;
}
.tcw-page-size-label {
  color: var(--tcw-primary);
  font-weight: 800;
}
.tcw-page-size-select,
.tcw-page-jump-input,
.tcw-page-size-fixed {
  min-height: 28px;
  border: 1px solid var(--tcw-border);
  border-radius: 6px;
  background: #fff;
  color: var(--tcw-text);
  padding: 4px 8px;
  font-size: 12px;
}
.tcw-page-size-select { min-width: 92px; }
.tcw-page-size-fixed { display: inline-flex; align-items: center; }
.tcw-page-jump-input { width: 56px; }
.tcw-modal-backdrop { position: fixed; inset: 0; z-index: 10; display: grid; place-items: center; background: rgba(15, 23, 42, .32); padding: 20px; }
.tcw-modal { display: grid; gap: 12px; width: min(900px, 100%); max-height: calc(100vh - 48px); overflow: auto; border: 1px solid var(--tcw-border); border-radius: 8px; background: var(--tcw-card); padding: 16px; box-shadow: 0 18px 48px rgba(15, 23, 42, .18); }
.tcw-form-modal { width: min(960px, 100%); }
.tcw-form-modal-supplier {
  width: min(1180px, calc(100vw - 96px));
  max-height: min(760px, calc(100vh - 56px));
  gap: 10px;
  padding: 14px;
}
.tcw-confirm-modal { width: min(480px, 100%); }
.tcw-hs-detail-modal { width: min(980px, 100%); }
.tcw-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.tcw-modal-head h2 { margin: 0; font-size: 18px; line-height: 1.3; }
.tcw-modal-subtitle { margin: 3px 0 0; color: var(--tcw-muted); font-size: 13px; font-weight: 800; }
.tcw-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.tcw-edit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.tcw-edit-grid-two { grid-template-columns: repeat(2, minmax(260px, 1fr)); }
.tcw-field-wide { grid-column: 1 / -1; }
.tcw-form-modal-supplier .tcw-modal-head h2 { font-size: 17px; }
.tcw-form-modal-supplier .tcw-edit-grid-two {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 12px;
}
.tcw-form-modal-supplier .tcw-field { gap: 4px; }
.tcw-form-modal-supplier .tcw-field span { font-size: 11px; }
.tcw-form-modal-supplier .tcw-field input,
.tcw-form-modal-supplier .tcw-field select {
  min-height: 32px;
  padding: 6px 9px;
}
.tcw-form-modal-supplier .tcw-field textarea {
  min-height: 58px;
  padding: 7px 9px;
}
.tcw-form-modal-supplier .tcw-field-wide {
  grid-column: span 3;
}
.tcw-form-modal-supplier .tcw-hs-candidate-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, .55fr);
  gap: 10px;
  align-items: start;
  border-top: 1px solid var(--tcw-border);
  padding-top: 10px;
}
.tcw-form-modal-supplier .tcw-hs-candidate-panel > .tcw-subsection-head {
  align-items: center;
}
.tcw-form-modal-supplier .tcw-hs-candidate-panel > .tcw-table-wrap,
.tcw-form-modal-supplier .tcw-hs-candidate-panel > .tcw-empty,
.tcw-form-modal-supplier .tcw-hs-candidate-panel > .tcw-error {
  grid-column: 1 / -1;
  max-height: 210px;
  overflow: auto;
}
.tcw-form-modal-supplier .tcw-hs-candidate-result {
  display: grid;
  gap: 8px;
  grid-column: 1 / -1;
}
.tcw-form-modal-supplier .tcw-hs-candidate-result .tcw-table-wrap {
  max-height: 210px;
}
.tcw-form-modal-supplier .tcw-hs-candidate-search {
  grid-template-columns: minmax(0, 1fr) auto;
}
.tcw-form-modal-supplier .tcw-modal-actions {
  position: sticky;
  bottom: -14px;
  border-top: 1px solid var(--tcw-border);
  background: var(--tcw-card);
  padding-top: 10px;
}
.tcw-confirm-text { margin: 0; color: var(--tcw-text); font-size: 14px; line-height: 1.7; }
.tcw-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.tcw-detail-field { display: grid; grid-template-columns: 108px minmax(0, 1fr); gap: 8px; align-items: start; border: 1px solid var(--tcw-border); border-radius: 6px; background: var(--tcw-soft); padding: 8px 10px; }
.tcw-detail-field span { color: var(--tcw-muted); font-size: 12px; font-weight: 800; }
.tcw-detail-field strong { overflow-wrap: anywhere; font-size: 12px; line-height: 1.5; }
.tcw-detail-items { display: grid; gap: 8px; }
.tcw-detail-items h3 { margin: 0; font-size: 14px; }
.tcw-hs-detail-sections { display: grid; gap: 12px; }
.tcw-hs-detail-section { display: grid; gap: 8px; }
.tcw-hs-detail-section h3 { margin: 0; font-size: 15px; line-height: 1.35; }
.tcw-supplier-block { display: grid; gap: 10px; padding: 12px; }
.tcw-supplier-head strong { font-size: 15px; }
.tcw-supplier-head span { color: var(--tcw-muted); font-size: 12px; }
.tcw-drawer { position: sticky; top: 10px; display: grid; gap: 12px; padding: 14px; max-height: calc(100vh - 24px); overflow: auto; }
.tcw-icon-btn { display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid var(--tcw-border); border-radius: 6px; background: var(--tcw-card); cursor: pointer; }
.tcw-compact-list { display: grid; gap: 7px; }
.tcw-compact-row { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; gap: 8px; align-items: center; width: 100%; border: 1px solid var(--tcw-border); border-radius: 6px; background: var(--tcw-soft); padding: 9px; cursor: pointer; text-align: left; }
.tcw-compact-row span { color: var(--tcw-primary); font-size: 12px; font-weight: 900; }
.tcw-compact-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.tcw-compact-row em { color: var(--tcw-muted); font-size: 12px; font-style: normal; }
.tcw-compare { display: grid; gap: 6px; border-top: 1px solid var(--tcw-border); padding-top: 10px; }
.tcw-compare h3 { margin: 0; font-size: 13px; }
.tcw-kv { display: grid; grid-template-columns: minmax(92px, .34fr) minmax(0, 1fr); gap: 8px; border: 1px solid var(--tcw-border); border-radius: 6px; background: var(--tcw-soft); padding: 7px 8px; }
.tcw-kv span { color: var(--tcw-muted); font-size: 11px; }
.tcw-kv strong { overflow-wrap: anywhere; font-size: 12px; font-weight: 700; }
.tcw-evidence { display: grid; gap: 4px; border: 1px solid color-mix(in srgb, var(--tcw-primary) 24%, var(--tcw-border)); border-radius: 6px; background: color-mix(in srgb, var(--tcw-primary) 6%, var(--tcw-card)); padding: 10px; }
.tcw-evidence span { color: var(--tcw-muted); font-size: 11px; font-weight: 900; }
.tcw-evidence strong { overflow-wrap: anywhere; font-size: 12px; }
.tcw-status { display: inline-flex; width: fit-content; align-items: center; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 900; }
.tcw-status.ok { background: #e8f7ef; color: var(--tcw-success); }
.tcw-status.warn { background: #fff4df; color: var(--tcw-warning); }
.tcw-status.danger { background: #fde8e6; color: var(--tcw-danger); }
.tcw-status.muted { background: #eef2f6; color: var(--tcw-muted); }
@media (max-width: 1040px) {
	  .tcw-header, .tcw-main.with-drawer, .tcw-edit-grid { grid-template-columns: 1fr; }
	  .tcw-detail-grid { grid-template-columns: 1fr; }
	  .tcw-hs-candidate-search { grid-template-columns: 1fr; }
  .tcw-business-head { align-items: stretch; flex-direction: column; }
  .tcw-button-row, .tcw-list-actions { justify-content: flex-start; }
  .tcw-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tcw-drawer { position: static; max-height: none; }
}

/* V2 process-oriented shell */
:root {
  --tcw-bg:#f4f7fb;
  --tcw-card:#ffffff;
  --tcw-soft:#f8fafc;
  --tcw-text:#172033;
  --tcw-muted:#65758c;
  --tcw-border:#dbe5f0;
  --tcw-primary:#2563eb;
  --tcw-primary-dark:#1d4ed8;
  --tcw-success:#139160;
  --tcw-warning:#e07818;
  --tcw-danger:#bd2f2f;
  --tcw-violet:#7c3aed;
  --tcw-slate:#526174;
  --tcw-shadow:0 14px 42px rgba(20, 35, 55, .08);
}
body { background: var(--tcw-bg); letter-spacing: 0; }
.tcw-shell {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  grid-template-rows: 1fr;
  gap: 0;
  min-height: 100vh;
  padding: 0;
  background: var(--tcw-bg);
}
.tcw-sidebar {
  display: grid;
  grid-template-rows: auto auto auto 1fr;
  align-content: start;
  gap: 18px;
  min-width: 0;
  border-right: 1px solid var(--tcw-border);
  background: var(--tcw-card);
  padding: 20px 14px;
}
.tcw-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px 6px;
}
.tcw-brand-mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: #e8f0ff;
  color: var(--tcw-primary);
  font-size: 12px;
  font-weight: 900;
}
.tcw-brand strong { display: block; font-size: 16px; line-height: 1.2; }
.tcw-brand span { display: block; color: var(--tcw-muted); font-size: 12px; }
.tcw-nav { display: grid; gap: 6px; }
.tcw-tab {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--tcw-text);
  padding: 7px 8px;
  text-align: left;
  font-weight: 800;
}
.tcw-tab.active {
  border-color: #d8e7ff;
  background: #eff6ff;
  color: #174ea6;
}
.tcw-overview-panel {
  display: grid;
  gap: 12px;
}
.tcw-overview-tabs {
  display: inline-flex;
  align-items: center;
  gap: 0;
  width: fit-content;
  border: 1px solid var(--tcw-border);
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}
.tcw-overview-tab {
  min-height: 38px;
  border: 0;
  border-right: 1px solid var(--tcw-border);
  background: #fff;
  color: var(--tcw-muted);
  padding: 8px 16px;
  font-weight: 800;
}
.tcw-overview-tab:last-child { border-right: 0; }
.tcw-overview-tab.active {
  background: #eff6ff;
  color: var(--tcw-primary);
}
.tcw-tab em {
  min-width: 22px;
  border-radius: 999px;
  background: #edf2f7;
  color: var(--tcw-muted);
  padding: 2px 6px;
  font-size: 11px;
  font-style: normal;
  text-align: center;
}
.tcw-nav-icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 900;
}
.tcw-nav-icon img {
  width: 16px;
  height: 16px;
  color: currentColor;
}
.tcw-nav-icon.blue { background: #e8f0ff; color: var(--tcw-primary); }
.tcw-nav-icon.green { background: #e7f8ef; color: var(--tcw-success); }
.tcw-nav-icon.orange { background: #fff2df; color: var(--tcw-warning); }
.tcw-nav-icon.violet { background: #f1eaff; color: var(--tcw-violet); }
.tcw-nav-icon.slate { background: #eef2f6; color: var(--tcw-slate); }
.tcw-workspace {
  display: grid;
  grid-template-rows: auto 1fr;
  min-width: 0;
  padding: 18px;
}
.tcw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 64px;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0 0 14px;
}
.tcw-kicker {
  margin: 0 0 3px;
  color: var(--tcw-muted);
  font-size: 12px;
  font-weight: 700;
}
.tcw-title-block h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
}
.tcw-title-block p {
  margin: 4px 0 0;
  color: var(--tcw-muted);
  font-size: 13px;
}
.tcw-header-actions {
  display: grid;
  grid-template-columns: minmax(260px, 380px) auto;
  gap: 8px;
  align-items: center;
}
.tcw-main { display: grid; min-width: 0; }
.tcw-content { min-width: 0; border: 0; background: transparent; padding: 0; }
.tcw-business-panel, .tcw-panel {
  border: 1px solid var(--tcw-border);
  border-radius: 8px;
  background: var(--tcw-card);
  box-shadow: var(--tcw-shadow);
}
.tcw-business-head {
  min-height: auto;
  align-items: center;
  border-bottom: 1px solid var(--tcw-border);
  background: linear-gradient(90deg, #ffffff, #f7fbff);
  padding: 20px 22px;
}
.tcw-business-head h2 { font-size: 18px; }
.tcw-business-body { padding: 18px 22px 22px; }
.tcw-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.tcw-metric {
  border-color: var(--tcw-border);
  background: var(--tcw-card);
  box-shadow: var(--tcw-shadow);
}
.tcw-metric strong { color: var(--tcw-text); font-size: 24px; }
.tcw-btn, .tcw-upload, .tcw-mini-btn, .tcw-icon-btn {
  border-radius: 7px;
}
.tcw-btn-primary {
  border-color: var(--tcw-primary);
  background: var(--tcw-primary);
}
.tcw-btn-primary:hover:not(:disabled) { background: var(--tcw-primary-dark); }
.tcw-upload {
  border-color: #bcd3ff;
  background: #eff6ff;
  color: var(--tcw-primary);
}
.tcw-table-wrap {
  border-color: var(--tcw-border);
  border-radius: 8px;
}
.tcw-table th {
  background: var(--tcw-soft);
  color: var(--tcw-muted);
  font-size: 11px;
}
.tcw-table td { background: var(--tcw-card); }
.tcw-table tr:hover td { background: #fbfdff; }
.tcw-status.ok { background: #e7f8ef; color: var(--tcw-success); }
.tcw-status.warn { background: #fff2df; color: #b35b00; }
.tcw-status.danger { background: #fde8e6; color: var(--tcw-danger); }
.tcw-status.muted { background: #eef2f6; color: var(--tcw-muted); }
@media (max-width: 1280px) {
  .tcw-shell { grid-template-columns: 230px minmax(0, 1fr); }
}
@media (max-width: 900px) {
  .tcw-shell { grid-template-columns: 1fr; }
  .tcw-sidebar {
    position: static;
    border-right: 0;
    border-bottom: 1px solid var(--tcw-border);
  }
  .tcw-nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tcw-workspace { padding: 14px; }
  .tcw-header, .tcw-business-head, .tcw-list-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .tcw-header-actions { grid-template-columns: 1fr; }
  .tcw-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .tcw-nav { grid-template-columns: 1fr; }
  .tcw-metrics, .tcw-edit-grid, .tcw-edit-grid-two { grid-template-columns: 1fr; }
}
`
    document.head.appendChild(style)
  }

  window.addEventListener('message', (event) => {
    const message = event.data
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return
    if (message.type === 'init') {
      instanceId = message.instanceId
      if (window.XpertRemoteUI && typeof window.XpertRemoteUI.applyTheme === 'function') window.XpertRemoteUI.applyTheme(message.theme)
      if (window.__tradeComplianceSetContext) {
        window.__tradeComplianceSetContext({ manifest: message.manifest, payload: message.payload, initialQuery: message.initialQuery || {}, locale: message.locale, theme: message.theme })
      }
      setTimeout(reportResize, 0)
      return
    }
    if (message.instanceId !== instanceId) return
    if (message.type === 'hostEvent') {
      if (window.__tradeComplianceHostEvent) window.__tradeComplianceHostEvent(message.event)
      return
    }
    if (message.requestId && pending.has(message.requestId)) {
      const item = pending.get(message.requestId)
      pending.delete(message.requestId)
      if (message.type === 'error') item.reject(new Error(message.message || '远程请求失败'))
      else item.resolve(message)
    }
  })

  ReactDOM.render(h(App), document.getElementById('root'))
})()
