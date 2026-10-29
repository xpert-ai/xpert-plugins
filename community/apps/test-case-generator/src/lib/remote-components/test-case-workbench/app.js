;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  const h = React.createElement
  const ASSISTANT_CHAT_COMMAND_KEY = 'assistant.chat.send_message'
  let instanceId = null
  let requestSequence = 0
  const pending = new Map()

  const PRIORITY_LABELS = { P0: 'P0', P1: 'P1', P2: 'P2' }
  const PRIORITY_COLORS = { P0: '#dc2626', P1: '#d97706', P2: '#2563eb' }

  injectStyles()

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
  }

  function post(type, body) {
    if (!instanceId && type !== 'ready') return
    parent.postMessage(
      Object.assign(
        { channel: CHANNEL, protocolVersion: VERSION, instanceId, type },
        body || {}
      ),
      '*'
    )
  }

  function request(type, body) {
    const requestId = String(++requestSequence)
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      try {
        post(type, Object.assign({ requestId }, body || {}))
      } catch (error) {
        pending.delete(requestId)
        reject(error)
      }
    })
  }

  function requestData(query) {
    return request('requestData', { query: query || {} })
  }

  function executeAction(actionKey, targetId, input, parameters) {
    return request('executeAction', { actionKey, targetId, input, parameters })
  }

  function invokeClientCommand(commandKey, payload) {
    return request('invokeClientCommand', { commandKey, payload })
  }

  function notify(message, level) {
    post('notify', { message, level: level || 'success' })
  }

  function reportResize() {
    const root = document.getElementById('root')
    const shell = root && root.firstElementChild
    const content = shell && shell.querySelector('.tcg-content')
    const shellRectHeight = shell && shell.getBoundingClientRect ? shell.getBoundingClientRect().height : 0
    const contentHeight = Math.max(content ? content.scrollHeight : 0, shellRectHeight, 520)
    post('resize', { height: Math.ceil(contentHeight), viewportBound: contentHeight > window.innerHeight })
  }

  window.addEventListener('message', function (event) {
    const message = event.data
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return
    if (message.type === 'ready') return
    if (message.type === 'init') {
      instanceId = message.instanceId
      window.__tcgSetContext &&
        window.__tcgSetContext({
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
      window.__tcgHandleHostEvent && window.__tcgHandleHostEvent(message.event)
      return
    }
    if (message.requestId && pending.has(message.requestId)) {
      const item = pending.get(message.requestId)
      pending.delete(message.requestId)
      if (message.type === 'error') {
        item.reject(new Error(message.message || 'Remote request failed'))
      } else {
        item.resolve(message)
      }
    }
  })

  function unwrapResponse(response) {
    if (!response) return {}
    if (Object.prototype.hasOwnProperty.call(response, 'data')) return response.data
    if (Object.prototype.hasOwnProperty.call(response, 'result')) return response.result
    if (Object.prototype.hasOwnProperty.call(response, 'payload')) return response.payload
    return response
  }

  function App() {
    const [context, setContext] = React.useState(null)
    React.useEffect(function () {
      window.__tcgSetContext = setContext
      window.__tcgHandleHostEvent = function () {
        window.__tcgReload && window.__tcgReload()
      }
      post('ready')
      return function () {
        delete window.__tcgSetContext
        delete window.__tcgHandleHostEvent
        delete window.__tcgReload
      }
    }, [])
    React.useEffect(function () {
      const root = document.getElementById('root')
      if (!root || typeof ResizeObserver === 'undefined') return undefined
      const observer = new ResizeObserver(function () {
        setTimeout(reportResize, 0)
      })
      observer.observe(root)
      return function () { observer.disconnect() }
    }, [])
    React.useEffect(function () { setTimeout(reportResize, 0) })
    if (!context) {
      return h('main', { className: 'tcg-shell' }, h('div', { className: 'tcg-empty' }, '正在初始化测试用例工作台...'))
    }
    return h(Workbench, { context: context })
  }

  function Workbench({ context }) {
    const [screen, setScreen] = React.useState('generate')
    const [requirementText, setRequirementText] = React.useState('')
    const [granularity, setGranularity] = React.useState('basic')
    const [cases, setCases] = React.useState([])
    const [notice, setNotice] = React.useState('')
    const [noticeType, setNoticeType] = React.useState('info')
    const [busy, setBusy] = React.useState(false)
    const [listData, setListData] = React.useState({ items: [], total: 0 })
    const [currentProject, setCurrentProject] = React.useState(null)

    function showNotice(msg, type) {
      setNotice(msg)
      setNoticeType(type || 'info')
      setTimeout(function () { setNotice('') }, 5000)
    }

    function loadHistory() {
      requestData({ page: 1, pageSize: 20 }).then(function (resp) {
        const data = unwrapResponse(resp)
        setListData(data && data.list ? data.list : { items: [], total: 0 })
      }).catch(function () {})
    }

    React.useEffect(function () {
      loadHistory()
    }, [])

    function resetForm() {
      setRequirementText('')
      setGranularity('basic')
      setCases([])
      setNotice('')
    }

    function handleGenerate() {
      if (requirementText.trim().length < 20) {
        showNotice('需求描述过于简略，请补充功能规则、输入输出约束等细节（至少 20 字）。', 'error')
        return
      }
      setBusy(true)
      invokeClientCommand(ASSISTANT_CHAT_COMMAND_KEY, {
        text: '请根据以下需求描述生成测试用例，调用 test_case_generate 工具。\n粒度：' + granularity + '\n需求描述：' + requirementText
      }).then(function () {
        showNotice('已发送到 Assistant 对话，等待 AI 生成用例...', 'info')
      }).catch(function () {
        showNotice('发送失败，请重试。', 'error')
      }).finally(function () {
        setBusy(false)
      })
    }

    function handleSave() {
      if (!requirementText.trim()) {
        showNotice('请先输入需求描述。', 'error')
        return
      }
      if (!cases.length) {
        showNotice('没有可保存的测试用例。', 'error')
        return
      }
      setBusy(true)
      executeAction('save_project', null, {
        requirementText: requirementText,
        granularity: granularity,
        testCases: cases
      }).then(function (resp) {
        const result = unwrapResponse(resp)
        if (resp && resp.success !== false) {
          showNotice('已保存到用例库。', 'success')
          loadHistory()
        } else {
          showNotice((resp && resp.message) || '保存失败。', 'error')
        }
      }).catch(function (err) {
        showNotice(err.message || '保存失败。', 'error')
      }).finally(function () {
        setBusy(false)
      })
    }

    function addEmptyCase() {
      setCases(cases.concat([{ name: '', precondition: '', steps: [''], expectedResult: '', priority: 'P1' }]))
    }

    function updateCase(index, field, value) {
      const next = cases.slice()
      next[index] = Object.assign({}, next[index], { [field]: value })
      setCases(next)
    }

    function removeCase(index) {
      setCases(cases.filter(function (_, i) { return i !== index }))
    }

    function openProject(project) {
      requestData({ projectId: project.id, page: 1, pageSize: 20 }).then(function (resp) {
        const data = unwrapResponse(resp)
        if (data && data.project) {
          setCurrentProject(data.project)
          setRequirementText(data.project.requirementText || '')
          setGranularity(data.project.granularity || 'basic')
          setCases((data.project.testCases || []).map(function (tc) {
            return { name: tc.name, precondition: tc.precondition || '', steps: tc.steps || [''], expectedResult: tc.expectedResult || '', priority: tc.priority || 'P1' }
          }))
          setScreen('generate')
        }
      }).catch(function () {})
    }

    return h('div', { className: 'tcg-shell' },
      notice ? h('div', { className: 'tcg-notice tcg-notice-' + noticeType }, notice) : null,
      h('div', { className: 'tcg-toolbar' },
        h('button', {
          className: 'tcg-tab' + (screen === 'generate' ? ' tcg-tab-active' : ''),
          onClick: function () { setScreen('generate') }
        }, '生成用例'),
        h('button', {
          className: 'tcg-tab' + (screen === 'history' ? ' tcg-tab-active' : ''),
          onClick: function () { setScreen('history'); loadHistory() }
        }, '历史项目 (' + (listData.total || 0) + ')')
      ),
      h('div', { className: 'tcg-content' },
        screen === 'history'
          ? h(HistoryPanel, { listData: listData, openProject: openProject, reload: loadHistory })
          : h(GeneratePanel, {
              requirementText: requirementText, setRequirementText: setRequirementText,
              granularity: granularity setGranularity: setGranularity,
              cases: cases, updateCase: updateCase, removeCase: removeCase, addEmptyCase: addEmptyCase,
              handleGenerate: handleGenerate, handleSave: handleSave, resetForm: resetForm,
              busy: busy, currentProject: currentProject
            })
      )
    )
  }

  function GeneratePanel(props) {
    return h('div', { className: 'tcg-grid' },
      h('div', { className: 'tcg-left' },
        h('label', { className: 'tcg-label' }, '需求描述'),
        h('textarea', {
          className: 'tcg-textarea',
          placeholder: '请输入需求描述，至少 20 字，包含功能规则、输入输出约束等...',
          value: props.requirementText,
          onChange: function (e) { props.setRequirementText(e.target.value) }
        }),
        h('label', { className: 'tcg-label' }, '用例粒度'),
        h('select', {
          className: 'tcg-select',
          value: props.granularity,
          onChange: function (e) { props.setGranularity(e.target.value) }
        },
          h('option', { value: 'basic' }, '基础'),
          h('option', { value: 'detailed' }, '详细')
        ),
        h('button', {
          className: 'tcg-btn tcg-btn-primary',
          onClick: props.handleGenerate,
          disabled: props.busy
        }, props.busy ? '生成中...' : '生成用例'),
        h('button', {
          className: 'tcg-btn',
          onClick: props.resetForm
        }, '重置')
      ),
      h('div', { className: 'tcg-right' },
        h('div', { className: 'tcg-case-header' },
          h('span', null, '生成的用例 (' + props.cases.length + ')'),
          h('button', { className: 'tcg-btn tcg-btn-sm', onClick: props.addEmptyCase }, '+ 手动新增')
        ),
        props.cases.length === 0
          ? h('div', { className: 'tcg-empty' }, '暂无用例，请在左侧输入需求描述后点击「生成用例」。')
          : h('div', { className: 'tcg-case-list' },
              props.cases.map(function (tc, idx) {
                return h(CaseRow, {
                  key: idx, tc: tc, index: idx,
                  updateCase: props.updateCase, removeCase: props.removeCase
                })
              })
            ),
        h('div', { className: 'tcg-footer' },
          h('button', {
            className: 'tcg-btn tcg-btn-success',
            onClick: props.handleSave,
            disabled: props.busy || !props.cases.length
          }, '保存到用例库')
        )
      )
    )
  }

  function CaseRow({ tc, index, updateCase, removeCase }) {
    return h('div', { className: 'tcg-case-card' },
      h('div', { className: 'tcg-case-title-row' },
        h('input', {
          className: 'tcg-input tcg-input-name',
          value: tc.name,
          placeholder: '用例名称',
          onChange: function (e) { updateCase(index, 'name', e.target.value) }
        }),
        h('select', {
          className: 'tcg-select tcg-select-sm',
          value: tc.priority,
          onChange: function (e) { updateCase(index, 'priority', e.target.value) }
        },
          h('option', { value: 'P0' }, 'P0'),
          h('option', { value: 'P1' }, 'P1'),
          h('option', { value: 'P2' }, 'P2')
        ),
        h('button', { className: 'tcg-btn tcg-btn-danger tcg-btn-sm', onClick: function () { removeCase(index) } }, '删除')
      ),
      h('input', {
        className: 'tcg-input',
        value: tc.precondition,
        placeholder: '前置条件',
        onChange: function (e) { updateCase(index, 'precondition', e.target.value) }
      }),
      h('textarea', {
        className: 'tcg-textarea tcg-textarea-sm',
        value: (tc.steps || []).join('\n'),
        placeholder: '操作步骤（每行一步）',
        onChange: function (e) {
          updateCase(index, 'steps', e.target.value.split('\n').filter(function (s) { return s.trim() }))
        }
      }),
      h('input', {
        className: 'tcg-input',
        value: tc.expectedResult,
        placeholder: '预期结果',
        onChange: function (e) { updateCase(index, 'expectedResult', e.target.value) }
      })
    )
  }

  function HistoryPanel({ listData, openProject, reload }) {
    return h('div', { className: 'tcg-history' },
      h('div', { className: 'tcg-case-header' },
        h('span', null, '已保存项目 (' + (listData.total || 0) + ')'),
        h('button', { className: 'tcg-btn tcg-btn-sm', onClick: reload }, '刷新')
      ),
      !listData.items || listData.items.length === 0
        ? h('div', { className: 'tcg-empty' }, '暂无已保存的项目。')
        : h('div', { className: 'tcg-project-list' },
            listData.items.map(function (p) {
              return h('div', {
                key: p.id,
                className: 'tcg-project-card',
                onClick: function () { openProject(p) }
              },
                h('div', { className: 'tcg-project-title' }, p.requirementText || '(无标题)'),
                h('div', { className: 'tcg-project-meta' },
                  h('span', null, '用例数：' + (p.testCaseCount || 0)),
                  h('span', null, '粒度：' + (p.granularity === 'detailed' ? '详细' : '基础')),
                  h('span', null, p.createdAt ? new Date(p.createdAt).toLocaleString('zh-CN') : '')
                )
              )
            })
          )
    )
  }

  function injectStyles() {
    const style = document.createElement('style')
    style.textContent = [
      '.tcg-shell{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f8fafc;color:#1e293b;padding:16px;min-height:100vh;box-sizing:border-box}',
      '.tcg-notice{padding:10px 14px;border-radius:8px;margin-bottom:12px;font-size:13px}',
      '.tcg-notice-error{background:#fef2f2;color:#dc2626;border:1px solid #fecaca}',
      '.tcg-notice-success{background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0}',
      '.tcg-notice-info{background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe}',
      '.tcg-toolbar{display:flex;gap:8px;margin-bottom:16px}',
      '.tcg-tab{padding:8px 16px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-size:13px}',
      '.tcg-tab-active{background:#2563eb;color:#fff;border-color:#2563eb}',
      '.tcg-grid{display:grid;grid-template-columns:380px 1fr;gap:16px}',
      '.tcg-left,.tcg-right{background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)}',
      '.tcg-label{display:block;font-size:12px;font-weight:600;color:#475569;margin:8px 0 4px}',
      '.tcg-textarea{width:100%;min-height:120px;padding:8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;box-sizing:border-box;resize:vertical}',
      '.tcg-textarea-sm{min-height:60px}',
      '.tcg-select{padding:8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;width:100%;box-sizing:border-box}',
      '.tcg-select-sm{width:auto;padding:4px 8px;font-size:12px}',
      '.tcg-input{width:100%;padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;box-sizing:border-box;margin-bottom:6px}',
      '.tcg-input-name{font-weight:600}',
      '.tcg-btn{padding:8px 16px;border:1px solid #e2e8f0;background:#fff;border-radius:6px;cursor:pointer;font-size:13px;margin-right:8px}',
      '.tcg-btn-primary{background:#2563eb;color:#fff;border-color:#2563eb}',
      '.tcg-btn-success{background:#16a34a;color:#fff;border-color:#16a34a}',
      '.tcg-btn-danger{background:#fff;color:#dc2626;border-color:#fecaca}',
      '.tcg-btn-sm{padding:4px 10px;font-size:12px;margin-right:4px}',
      '.tcg-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.tcg-case-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;font-weight:600;font-size:14px}',
      '.tcg-case-list{display:flex;flex-direction:column;gap:10px}',
      '.tcg-case-card{border:1px solid #e2e8f0;border-radius:8px;padding:10px;background:#f8fafc}',
      '.tcg-case-title-row{display:flex;gap:8px;align-items:center;margin-bottom:6px}',
      '.tcg-case-title-row .tcg-input{flex:1;margin-bottom:0}',
      '.tcg-footer{margin-top:16px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:right}',
      '.tcg-empty{color:#94a3b8;font-size:13px;text-align:center;padding:40px 0}',
      '.tcg-history{background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)}',
      '.tcg-project-list{display:flex;flex-direction:column;gap:10px}',
      '.tcg-project-card{border:1px solid #e2e8f0;border-radius:8px;padding:12px;cursor:pointer;transition:box-shadow .15s}',
      '.tcg-project-card:hover{box-shadow:0 2px 8px rgba(0,0,0,.08)}',
      '.tcg-project-title{font-size:14px;font-weight:600;margin-bottom:6px}',
      '.tcg-project-meta{display:flex;gap:12px;font-size:12px;color:#64748b}'
    ].join('\n')
    document.head.appendChild(style)
  }

  ReactDOM.createRoot(document.getElementById('root')).render(h(App, null))
})();
