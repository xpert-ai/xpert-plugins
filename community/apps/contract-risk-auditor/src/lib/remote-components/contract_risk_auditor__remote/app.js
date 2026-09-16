;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  const h = React.createElement
  let instanceId = null
  let requestSequence = 0
  const pending = new Map()

  injectStyles()

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
        reject(new Error('请求超时，请检查网络或稍后重试'))
      }, 15000)
    })
  }

  function handleMessage(event) {
    const data = event.data
    if (!data || data.channel !== CHANNEL || data.protocolVersion !== VERSION) return

    if (data.type === 'init') {
      instanceId = data.instanceId
      post('ready')
      return
    }

    if (data.instanceId && instanceId && data.instanceId !== instanceId) return

    if (data.requestId && pending.has(data.requestId)) {
      const { resolve, reject } = pending.get(data.requestId)
      pending.delete(data.requestId)
      if (data.type === 'response.error') {
        reject(new Error(data.message || '操作失败'))
      } else {
        resolve(data.data !== undefined ? data.data : data)
      }
    }
  }

  window.addEventListener('message', handleMessage)
  post('ready')

  function App() {
    const [loading, setLoading] = React.useState(true)
    const [auditing, setAuditing] = React.useState(false)
    const [simulatingError, setSimulatingError] = React.useState(false)
    const [errorMessage, setErrorMessage] = React.useState(null)
    const [toast, setToast] = React.useState(null)

    const [sampleContracts, setSampleContracts] = React.useState([])
    const [records, setRecords] = React.useState([])
    const [currentRecordId, setCurrentRecordId] = React.useState('')
    const [title, setTitle] = React.useState('采购合同合规排查草稿')
    const [content, setContent] = React.useState('')
    const [risks, setRisks] = React.useState([])
    const [summary, setSummary] = React.useState('')

    const showToast = (msg) => {
      setToast(msg)
      setTimeout(() => setToast(null), 3000)
    }

    // 初始化加载数据
    const loadWorkbenchData = async () => {
      setLoading(true)
      try {
        const res = await request('view.data', { query: {} })
        const payload = res?.data || res || {}
        setSampleContracts(payload.sampleContracts || [])
        setRecords(payload.records || [])
        if (payload.activeRecord) {
          applyRecord(payload.activeRecord)
        } else if (payload.sampleContracts && payload.sampleContracts.length > 0) {
          setTitle(payload.sampleContracts[0].title)
          setContent(payload.sampleContracts[0].content)
        }
      } catch (err) {
        console.warn('加载数据警告:', err)
      } finally {
        setLoading(false)
      }
    }

    const applyRecord = (rec) => {
      setCurrentRecordId(rec.id)
      setTitle(rec.title || '未命名合同审查单')
      setContent(rec.revisedContent || rec.originalContent || '')
      setRisks(rec.risks || [])
      setSummary(rec.summary || '')
    }

    React.useEffect(() => {
      loadWorkbenchData()
    }, [])

    // 载入样例
    const handleSelectSample = (sample) => {
      setTitle(sample.title)
      setContent(sample.content)
      setRisks([])
      setSummary('')
      setErrorMessage(null)
      showToast('已载入测试霸王合同样例')
    }

    // 执行 AI 合规审查
    const handleRunAudit = async () => {
      if (!content || !content.trim()) {
        setErrorMessage('请输入或载入合同条款文本后再开始审查！')
        return
      }

      setErrorMessage(null)

      // 模拟失败场景
      if (simulatingError) {
        setAuditing(true)
        setTimeout(() => {
          setAuditing(false)
          setErrorMessage('【模拟异常触发】法务大模型网关响应超时 (504 Gateway Timeout)。您的输入草稿已完整保留在页面中，未丢失任何数据。')
        }, 800)
        return
      }

      setAuditing(true)
      try {
        const res = await request('view.action', {
          actionKey: 'audit_contract',
          input: {
            id: currentRecordId || undefined,
            title: title || '采购合同审查单',
            content: content
          }
        })
        const rec = res?.data || res
        if (rec) {
          applyRecord(rec)
          showToast('AI 合规排查完成！共发现 ' + (rec.risks?.length || 0) + ' 处风险')
        }
      } catch (err) {
        setErrorMessage(err.message || '合规审查失败，请重试')
      } finally {
        setAuditing(false)
      }
    }

    // 采纳修订
    const handleAcceptRevision = async (risk) => {
      if (!currentRecordId) {
        // 本地更新
        if (content.includes(risk.originalText)) {
          setContent(content.replace(risk.originalText, risk.suggestedRevision))
        }
        setRisks(risks.map(r => r.id === risk.id ? Object.assign({}, r, { status: 'ACCEPTED' }) : r))
        showToast('已采纳并替换原文条款')
        return
      }

      try {
        const res = await request('view.action', {
          actionKey: 'accept_revision',
          input: {
            recordId: currentRecordId,
            riskId: risk.id
          }
        })
        const rec = res?.data || res
        if (rec) {
          applyRecord(rec)
          showToast('已采纳建议并同步保存')
        }
      } catch (err) {
        setErrorMessage(err.message || '采纳失败')
      }
    }

    // 忽略风险
    const handleIgnoreRisk = async (risk) => {
      if (!currentRecordId) {
        setRisks(risks.map(r => r.id === risk.id ? Object.assign({}, r, { status: 'IGNORED' }) : r))
        showToast('已忽略该项风险')
        return
      }

      try {
        const res = await request('view.action', {
          actionKey: 'ignore_risk',
          input: {
            recordId: currentRecordId,
            riskId: risk.id
          }
        })
        const rec = res?.data || res
        if (rec) {
          applyRecord(rec)
          showToast('已忽略该项风险')
        }
      } catch (err) {
        setErrorMessage(err.message || '操作失败')
      }
    }

    // 保存合同审查单
    const handleSaveRecord = async () => {
      try {
        const res = await request('view.action', {
          actionKey: 'save_contract',
          input: {
            record: {
              id: currentRecordId || ('contract-' + Date.now()),
              title,
              originalContent: content,
              revisedContent: content,
              risks,
              summary
            }
          }
        })
        const rec = res?.data || res
        if (rec) {
          applyRecord(rec)
          showToast('审查单已成功持久化保存！刷新后可随时恢复。')
          loadWorkbenchData()
        }
      } catch (err) {
        setErrorMessage(err.message || '保存失败')
      }
    }

    if (loading) {
      return h('div', { className: 'cra-loading' }, '正在加载合同排查工作台...')
    }

    const pendingCount = risks.filter(r => r.status === 'PENDING').length
    const acceptedCount = risks.filter(r => r.status === 'ACCEPTED').length

    return h('div', { className: 'cra-container' },
      // 顶部工具栏
      h('div', { className: 'cra-header' },
        h('div', { className: 'cra-header-left' },
          h('div', { className: 'cra-logo' }, '🛡️'),
          h('div', null,
            h('div', { className: 'cra-title' }, '商务采购合同智能合规排查工作台'),
            h('div', { className: 'cra-subtitle' }, '基于《民法典·合同编》排查霸王条款、过度违约责任与不对等解约权')
          )
        ),
        h('div', { className: 'cra-header-right' },
          h('label', { className: 'cra-error-switch' },
            h('input', {
              type: 'checkbox',
              checked: simulatingError,
              onChange: (e) => setSimulatingError(e.target.checked)
            }),
            h('span', null, '模拟网关超时/错误')
          ),
          h('button', {
            className: 'cra-btn cra-btn-secondary',
            onClick: handleSaveRecord
          }, '💾 保存审查单')
        )
      ),

      // 错误与提示条
      errorMessage && h('div', { className: 'cra-alert-error' },
        h('span', null, errorMessage),
        h('button', {
          className: 'cra-btn-sm',
          onClick: () => {
            setSimulatingError(false)
            setErrorMessage(null)
            handleRunAudit()
          }
        }, '立即重试')
      ),

      toast && h('div', { className: 'cra-toast' }, toast),

      // 主工作区
      h('div', { className: 'cra-main-grid' },
        // 左栏：合同原文与编辑
        h('div', { className: 'cra-card' },
          h('div', { className: 'cra-card-header' },
            h('div', { className: 'cra-card-title' }, '📝 合同条款原文与改写定稿'),
            h('div', { className: 'cra-sample-select' },
              h('span', null, '载入测试案例：'),
              sampleContracts.map((s, idx) =>
                h('button', {
                  key: idx,
                  className: 'cra-btn-tag',
                  onClick: () => handleSelectSample(s)
                }, '案例 ' + (idx + 1))
              )
            )
          ),
          h('input', {
            className: 'cra-title-input',
            value: title,
            placeholder: '合同文件名称',
            onChange: (e) => setTitle(e.target.value)
          }),
          h('textarea', {
            className: 'cra-textarea',
            value: content,
            placeholder: '在此粘贴需要排查的合同文本，或点击上方样例快速载入...',
            onChange: (e) => setContent(e.target.value)
          }),
          h('div', { className: 'cra-card-footer' },
            h('span', { className: 'cra-meta' }, '字符数: ' + content.length + ' 字'),
            h('button', {
              className: 'cra-btn cra-btn-primary',
              disabled: auditing,
              onClick: handleRunAudit
            }, auditing ? '正在进行 AI 合规扫描...' : '⚡ 开始 AI 合规审查')
          )
        ),

        // 右栏：风险清单与修订建议
        h('div', { className: 'cra-card' },
          h('div', { className: 'cra-card-header' },
            h('div', { className: 'cra-card-title' }, '🔍 法律风险与条款修订建议'),
            risks.length > 0 && h('div', { className: 'cra-stats' },
              '待处理: ' + pendingCount + ' | 已采纳: ' + acceptedCount
            )
          ),
          summary && h('div', { className: 'cra-summary-box' }, summary),

          risks.length === 0
            ? h('div', { className: 'cra-empty-state' },
                h('div', { className: 'cra-empty-icon' }, '📄'),
                h('div', { className: 'cra-empty-text' }, '暂无审查结果'),
                h('div', { className: 'cra-empty-hint' }, '请在左侧输入合同内容并点击「开始 AI 合规审查」')
              )
            : h('div', { className: 'cra-risk-list' },
                risks.map((risk) => {
                  const isHigh = risk.riskLevel === 'HIGH'
                  const isAccepted = risk.status === 'ACCEPTED'
                  const isIgnored = risk.status === 'IGNORED'

                  return h('div', {
                    key: risk.id,
                    className: 'cra-risk-card ' + (isAccepted ? 'cra-card-accepted' : isIgnored ? 'cra-card-ignored' : isHigh ? 'cra-card-high' : 'cra-card-warn')
                  },
                    h('div', { className: 'cra-risk-header' },
                      h('span', { className: 'cra-badge ' + (isHigh ? 'cra-badge-danger' : 'cra-badge-warn') },
                        isHigh ? '🔴 高危风险' : '🟡 提示风险'
                      ),
                      h('span', { className: 'cra-risk-category' }, risk.category),
                      h('span', { className: 'cra-risk-status' },
                        isAccepted ? '✅ 已采纳替换' : isIgnored ? '⚪ 已忽略' : '⏳ 待审核'
                      )
                    ),
                    h('div', { className: 'cra-clause-section' },
                      h('div', { className: 'cra-section-label' }, '【涉险原条款】:'),
                      h('div', { className: 'cra-clause-origin' }, risk.originalText)
                    ),
                    h('div', { className: 'cra-clause-section' },
                      h('div', { className: 'cra-section-label' }, '【法务剖析】:'),
                      h('div', { className: 'cra-clause-analysis' }, risk.riskAnalysis)
                    ),
                    h('div', { className: 'cra-clause-section' },
                      h('div', { className: 'cra-section-label' }, '【建议修订条款】:'),
                      h('div', { className: 'cra-clause-suggest' }, risk.suggestedRevision)
                    ),
                    !isAccepted && !isIgnored && h('div', { className: 'cra-risk-actions' },
                      h('button', {
                        className: 'cra-btn-sm cra-btn-success',
                        onClick: () => handleAcceptRevision(risk)
                      }, '✨ 采纳建议并替换原文'),
                      h('button', {
                        className: 'cra-btn-sm cra-btn-ghost',
                        onClick: () => handleIgnoreRisk(risk)
                      }, '忽略')
                    )
                  )
                })
              )
        )
      ),

      // 底部历史审查单列表（持久化恢复展示）
      records.length > 0 && h('div', { className: 'cra-history-panel' },
        h('div', { className: 'cra-history-title' }, '📚 历史审查单记录（点击可随时还原历史审查快照）'),
        h('div', { className: 'cra-history-chips' },
          records.map(rec =>
            h('div', {
              key: rec.id,
              className: 'cra-chip ' + (rec.id === currentRecordId ? 'cra-chip-active' : ''),
              onClick: () => applyRecord(rec)
            },
              h('span', null, '📄 ' + (rec.title || rec.id)),
              h('small', null, ' (' + new Date(rec.updatedAt).toLocaleTimeString() + ')')
            )
          )
        )
      )
    )
  }

  function injectStyles() {
    const css = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: #f8fafc; color: #1e293b; padding: 16px; }
      .cra-container { display: flex; flex-direction: column; gap: 16px; max-width: 1400px; margin: 0 auto; }
      .cra-header { display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 16px 20px; border-radius: 8px; border: 1px solid #e2e8f0; }
      .cra-header-left { display: flex; align-items: center; gap: 12px; }
      .cra-logo { font-size: 28px; }
      .cra-title { font-size: 18px; font-weight: 700; color: #0f172a; }
      .cra-subtitle { font-size: 13px; color: #64748b; margin-top: 2px; }
      .cra-header-right { display: flex; align-items: center; gap: 14px; }
      .cra-error-switch { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #b91c1c; font-weight: 500; cursor: pointer; }
      .cra-btn { padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s; }
      .cra-btn-primary { background: #2563eb; color: #fff; }
      .cra-btn-primary:hover { background: #1d4ed8; }
      .cra-btn-secondary { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
      .cra-btn-secondary:hover { background: #e2e8f0; }
      .cra-btn-tag { padding: 2px 8px; font-size: 11px; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; border-radius: 4px; cursor: pointer; margin-left: 4px; }
      .cra-btn-sm { padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; }
      .cra-btn-success { background: #16a34a; color: #fff; }
      .cra-btn-ghost { background: transparent; color: #64748b; }
      .cra-alert-error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 10px 16px; border-radius: 6px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; }
      .cra-toast { position: fixed; top: 20px; right: 20px; background: #0f172a; color: #fff; padding: 10px 18px; border-radius: 6px; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; }
      .cra-main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .cra-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; height: 600px; }
      .cra-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #f1f5f9; }
      .cra-card-title { font-size: 14px; font-weight: 700; color: #334155; }
      .cra-title-input { font-size: 14px; font-weight: 600; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 10px; outline: none; }
      .cra-textarea { flex: 1; resize: none; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; font-size: 13px; line-height: 1.6; color: #1e293b; font-family: monospace; outline: none; }
      .cra-card-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
      .cra-meta { font-size: 12px; color: #94a3b8; }
      .cra-summary-box { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 10px; border-radius: 6px; font-size: 12px; margin-bottom: 12px; }
      .cra-risk-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
      .cra-risk-card { border-radius: 6px; padding: 12px; font-size: 12px; border: 1px solid #e2e8f0; background: #fff; }
      .cra-card-high { border-left: 4px solid #ef4444; background: #fff5f5; }
      .cra-card-warn { border-left: 4px solid #f59e0b; background: #fffbeb; }
      .cra-card-accepted { border-left: 4px solid #10b981; background: #f0fdf4; opacity: 0.85; }
      .cra-card-ignored { opacity: 0.5; background: #f8fafc; }
      .cra-risk-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
      .cra-badge { font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 700; }
      .cra-badge-danger { background: #fee2e2; color: #b91c1c; }
      .cra-badge-warn { background: #fef3c7; color: #b45309; }
      .cra-risk-category { font-weight: 700; color: #334155; }
      .cra-risk-status { margin-left: auto; font-size: 11px; color: #64748b; font-weight: 600; }
      .cra-clause-section { margin-top: 6px; }
      .cra-section-label { font-weight: 700; color: #475569; font-size: 11px; }
      .cra-clause-origin { color: #991b1b; text-decoration: line-through; background: #fef2f2; padding: 4px 6px; border-radius: 4px; margin-top: 2px; }
      .cra-clause-analysis { color: #475569; line-height: 1.5; margin-top: 2px; }
      .cra-clause-suggest { color: #15803d; background: #f0fdf4; padding: 4px 6px; border-radius: 4px; margin-top: 2px; font-weight: 600; }
      .cra-risk-actions { display: flex; gap: 8px; margin-top: 10px; }
      .cra-empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #94a3b8; }
      .cra-empty-icon { font-size: 40px; margin-bottom: 8px; }
      .cra-history-panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
      .cra-history-title { font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 8px; }
      .cra-history-chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .cra-chip { font-size: 12px; padding: 6px 12px; border: 1px solid #cbd5e1; border-radius: 16px; cursor: pointer; background: #f8fafc; }
      .cra-chip:hover { border-color: #2563eb; background: #eff6ff; }
      .cra-chip-active { border-color: #2563eb; background: #eff6ff; color: #2563eb; font-weight: 600; }
    `
    const style = document.createElement('style')
    style.textContent = css
    document.head.appendChild(style)
  }

  ReactDOM.render(h(App), document.getElementById('root') || document.body)
})()
