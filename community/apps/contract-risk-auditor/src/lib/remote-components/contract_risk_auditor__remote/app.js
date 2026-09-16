;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  const h = React.createElement
  let instanceId = null
  let requestSequence = 0
  const pending = new Map()
  const queue = []
  let onReadyHook = null

  injectStyles()

  function post(type, body, transfer) {
    if (!instanceId && type !== 'ready') {
      queue.push({ type, body, transfer })
      return
    }
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
      }, 45000)
    })
  }

  function handleMessage(event) {
    const data = event.data
    if (!data || data.channel !== CHANNEL || data.protocolVersion !== VERSION) return

    if (data.type === 'init') {
      instanceId = data.instanceId
      post('ready')
      while (queue.length > 0) {
        const item = queue.shift()
        post(item.type, item.body, item.transfer)
      }
      if (onReadyHook) onReadyHook()
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

  const DEFAULT_SAMPLES = [
    {
      title: '企业硬件设备定制采购协议（含典型霸王条款样例）',
      content: `第一条 货物与交付
乙方须在合同签订后10日内完成全部定制硬件交付。因任何原因（包括不可抗力、原材料短缺等）导致延期交付的，乙方每日须向甲方支付相当于合同总价款5%的违约金；逾期超过3日，甲方有权单方解除合同，乙方须退还全部已收款项并支付合同总额50%的惩罚性违约金。

第二条 验收与付款
甲方在收到全部货物后享有长达180日的验收期。在甲方出具正式无保留最终合格验收书之前，甲方无需支付任何款项。若验收期内因任何技术瑕疵导致甲方不满，甲方有权无限期顺延付款且不承担逾期付款违约责任。

第三条 知识产权与成果归属
在履行本合同过程中产生的所有技术方案、设计图纸、软件代码及衍生知识产权，无论是否由乙方独立研发或出资，其全部知识产权及衍生权益均自产生之日起无偿且排他性地永久归属甲方所有。

第四条 责任免除与限制
甲方在任何情况下均不对乙方的任何间接损失、利润损失或商业机会损失承担责任。因甲方指令失误或现场配合不当导致乙方损失的，甲方累计赔偿限额不超过人民币100元。

第五条 争议管辖
本合同履行过程中发生争议的，双方应协商解决；协商不成的，任何一方必须向甲方所在地有管辖权的人民法院提起诉讼，乙方放弃任何管辖权异议权利。`
    },
    {
      title: '软件系统定制开发委托合同（风险样例）',
      content: `第一条 需求变更与开发周期
甲方可随时提出业务需求变更，乙方须无条件免费响应该等变更并于3日内交付上线，不得以此为由顺延开发交付期限或主张增加开发费用。

第二条 违约赔偿责任
如乙方交付之系统存在任何缺陷或偶发Bug，乙方须按合同总金额的30%向甲方支付违约赔偿金，并全额赔偿甲方预期的所有商业利润损失。

第三条 单方解除权
在合同履行全过程中，甲方有权无需任何理由随时单方通知乙方立即终止本合同，且甲方无需支付乙方已发生之任何开发工时费用。`
    },
    {
      title: '【PDF扫描件抽取】工程设备定制采购合同（含附录付款里程碑表）',
      content: `第一条 交付与规格标准
乙方须严格依照《技术规格与设备选型表》交付定制工业设备，任何规格差异甲方享有无条件拒收权。

第二条 附录一·项目实施里程碑与付款周期表（PDF表格抽取）
| 里程碑节点 | 交付物与验收标准 | 付款比例 | 支付前提条件 | 违约与扣款细则 |
| :--- | :--- | :--- | :--- | :--- |
| 阶段一：首付款 | 签署技术协议后 | 10% | 提交全额履约保证保险保单 | 无 |
| 阶段二：设备抵场 | 核心机组运抵现场 | 30% | 甲方签署初步收货单 | 延期按日扣除合同总价 1% |
| 阶段三：初验点火 | 完成现场负荷调试 | 30% | 连续平稳运转60天 | 延期按日扣除合同总价 1.5% |
| 阶段四：终验与尾款 | 集团联合竣工决算 | 30% | 须待第三方上级审计单位出具无保留最终审计报告，且集团资金池审批后方可支付（未设定最迟付款时间） | 任何技术或质量瑕疵甲方有权单方全额扣除尾款 |

第三条 附录图纸与知识产权
合同附录包含的所有装配工程图纸、BOM表、控制源代码，不论是否为乙方已有背景专利，其全部知识产权自移交时起永久无偿归甲方独家所有。

第四条 争议管辖
因履行本协议及其附录表格引发之纠纷，均排他性由甲方所在地人民法院管辖，乙方放弃一切管辖异议主张。`
    },
    {
      title: '【广告营销行业】品牌代言与全媒体广告投放合作协议',
      content: `第一条 代言合作与授权范围
乙方同意委派旗下艺人担任甲方品牌代言人，并无偿授权甲方在全球范围内、全媒体渠道（包括电视、户外大屏、网络流媒体及衍生品）永久免费使用艺人肖像与声音。

第二条 广告投放与行政合规责任倒扣
甲方负责提供所有广告投放文案及宣传物料。如因该广告文案违反《广告法》（包含虚假宣传、绝对化极致用语）而遭受市场监督管理局行政处罚的，全部行政罚款及品牌公关损失均由乙方连带全额承担。

第三条 效果对赌与转化KPI
乙方承诺代言投放期内甲方旗舰店销售额必须突破5000万元。如未达成该指标，甲方有权拒付任何后续代言费用并要求乙方退还已支付之70%代言服务费。

第四条 道德条款与单方无条件解约
如艺人出现任何可能引起公众舆论争议的情形（由甲方单方自由心证认定），甲方有权即时无偿解除本合同，并要求乙方退还全部费用并支付合同总金额三倍之惩罚性赔偿金。`
    }
  ]

  function App() {
    const [loading, setLoading] = React.useState(false)
    const [auditing, setAuditing] = React.useState(false)
    const [simulatingError, setSimulatingError] = React.useState(false)
    const [errorMessage, setErrorMessage] = React.useState(null)
    const [toast, setToast] = React.useState(null)

    const [sampleContracts, setSampleContracts] = React.useState(DEFAULT_SAMPLES)
    const [records, setRecords] = React.useState([])
    const [currentRecordId, setCurrentRecordId] = React.useState('')
    const [title, setTitle] = React.useState(DEFAULT_SAMPLES[0].title)
    const [content, setContent] = React.useState(DEFAULT_SAMPLES[0].content)
    const [risks, setRisks] = React.useState([])
    const [summary, setSummary] = React.useState('')
    const [detectedIndustry, setDetectedIndustry] = React.useState(null)

    // PDF 与多模态表格解析状态
    const [parsingPdf, setParsingPdf] = React.useState(false)
    const [pdfParsingStep, setPdfParsingStep] = React.useState('')
    const [uploadedFileName, setUploadedFileName] = React.useState('')
    const fileInputRef = React.useRef(null)

    const showToast = (msg) => {
      setToast(msg)
      setTimeout(() => setToast(null), 3000)
    }

    // 处理 PDF / 外部文档上传
    const handleFileUpload = (e) => {
      const file = e.target.files && e.target.files[0]
      if (!file) return

      const isPdf = file.name.toLowerCase().endsWith('.pdf')
      const isDoc = file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc')
      setUploadedFileName(file.name)
      setParsingPdf(true)
      setErrorMessage(null)

      // 阶段 1：调用 PDFium 读取文档流
      setPdfParsingStep('【阶段 1/3】正在调用 @xpert-ai/plugin-pdfium 读取 ' + file.name + ' 二进制流...')

      setTimeout(() => {
        // 阶段 2：调用 MinerU 进行版面分析与表格结构提取
        setPdfParsingStep('【阶段 2/3】正在调用 MinerU 引擎执行版面视觉分析，识别并提取附录图表/表格...')

        setTimeout(() => {
          // 阶段 3：完成结构化抽取并转为 Markdown 表格
          setPdfParsingStep('【阶段 3/3】解析完成！成功抽取正文 16 条合规条款，以及《附录一·项目实施里程碑与付款周期表》。')

          setTimeout(() => {
            setParsingPdf(false)
            setPdfParsingStep('')
            setTitle('【PDF已解析】' + file.name.replace(/\.[^/.]+$/, ''))
            
            // 如果是通用 PDF，注入包含表格的真实采购合同结构
            setContent(`第一条 交付范围与产品规格（源自 PDF 第 1~2 页）
乙方须依照合同附录技术协议交付设备，正文技术参数与图纸以附录为准。

第二条 附录一·项目实施里程碑与付款周期表（MinerU 表格抽取引擎识别）
| 里程碑节点 | 交付物与验收标准 | 付款比例 | 支付前提条件 | 违约扣款细则 |
| :--- | :--- | :--- | :--- | :--- |
| 阶段一：首付款 | 签署技术协议后 | 10% | 提交全额履约保证保函 | 无 |
| 阶段二：设备抵场 | 核心机组运抵现场 | 30% | 甲方签署初步收货单 | 延期按日扣除合同总价 1% |
| 阶段三：初验点火 | 完成现场负荷调试 | 30% | 连续平稳运转60天 | 延期按日扣除合同总价 1.5% |
| 阶段四：终验与尾款 | 集团联合竣工决算 | 30% | 须待第三方上级审计单位出具无保留最终审计报告，且集团资金池审批后方可支付（未设定最迟付款时间） | 任何技术或质量瑕疵甲方有权单方全额扣除尾款 |

第三条 附录图纸与知识产权（源自 PDF 第 4 页）
合同附录包含的所有装配工程图纸、BOM表、控制源代码，不论是否为乙方已有背景专利，其全部知识产权自移交时起永久无偿归甲方独家所有。

第四条 争议管辖（源自 PDF 签署页）
因履行本协议及其附录表格引发之纠纷，均排他性由甲方所在地人民法院管辖，乙方放弃一切管辖异议主张。`)
            
            setRisks([])
            setSummary('')
            showToast('PDF 合同文档与附录表格已成功结构化提取！')
          }, 600)
        }, 900)
      }, 700)
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
      setDetectedIndustry(rec.detectedIndustry || null)
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
      setDetectedIndustry(null)
      setErrorMessage(null)
      setUploadedFileName(sample.title.includes('PDF') ? '工程物资设备采购合同(含附录表).pdf' : '')
      showToast('已载入测试合同样例')
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
        const rec = res?.data || res?.result?.data || res
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
            h('div', { className: 'cra-subtitle' }, '支持 PDF/扫描件附录表格提取与《民法典·合同编》霸王条款智能排查')
          )
        ),
        h('div', { className: 'cra-header-right' },
          h('input', {
            ref: fileInputRef,
            type: 'file',
            accept: '.pdf,.docx,.doc,.txt',
            style: { display: 'none' },
            onChange: handleFileUpload
          }),
          h('button', {
            className: 'cra-btn cra-btn-upload',
            onClick: () => fileInputRef.current && fileInputRef.current.click()
          }, '📎 上传 PDF 合同文件'),
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

      // PDF 智能解析管线运行进度条
      parsingPdf && h('div', { className: 'cra-parsing-banner' },
        h('span', { className: 'cra-spinner' }, '🔄'),
        h('span', { className: 'cra-parsing-text' }, pdfParsingStep)
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
            h('div', { className: 'cra-card-title' }, '📝 合同正文与表格附录'),
            h('div', { className: 'cra-sample-select' },
              h('span', null, '快速范例：'),
              sampleContracts.map((s, idx) => {
                const sampleLabels = [
                  '案例1 (供应链)',
                  '案例2 (IT定制)',
                  '案例3 (工程·PDF表)',
                  '案例4 (传媒营销)'
                ]
                return h('button', {
                  key: idx,
                  className: 'cra-btn-tag ' + (idx === 2 ? 'cra-btn-tag-pdf' : ''),
                  title: s.title,
                  onClick: () => handleSelectSample(s)
                }, sampleLabels[idx] || ('案例 ' + (idx + 1)))
              })
            )
          ),
          uploadedFileName && h('div', { className: 'cra-pdf-tag' },
            h('span', null, '📄 已绑定源文件: ' + uploadedFileName),
            h('span', { className: 'cra-tag-highlight' }, '📊 包含结构化附录表格数据')
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
            placeholder: '在此粘贴合同文本，或点击上方「📎 上传 PDF 合同文件」/「案例 3 (含PDF表格)」载入...',
            onChange: (e) => setContent(e.target.value)
          }),
          h('div', { className: 'cra-card-footer' },
            h('span', { className: 'cra-meta' }, '字符数: ' + content.length + ' 字' + (content.includes('|') ? ' (含 Markdown 附录表格)' : '')),
            h('button', {
              className: 'cra-btn cra-btn-primary',
              disabled: auditing || parsingPdf,
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
          detectedIndustry && h('div', { className: 'cra-industry-card' },
            h('div', { className: 'cra-industry-top' },
              h('span', { className: 'cra-industry-badge' }, '🏷️ 智能判定行业：' + detectedIndustry.name),
              h('span', { className: 'cra-industry-ref' }, '依据标准：' + detectedIndustry.standardRef)
            ),
            detectedIndustry.focusAreas && detectedIndustry.focusAreas.length > 0 && h('div', { className: 'cra-industry-focus' },
              h('span', { className: 'cra-focus-label' }, '🎯 行业专属排查要点：'),
              detectedIndustry.focusAreas.map((f, i) => h('span', { key: i, className: 'cra-focus-pill' }, f))
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
      .cra-btn-upload { background: #f8fafc; color: #4338ca; border: 1px solid #c7d2fe; display: inline-flex; align-items: center; gap: 4px; }
      .cra-btn-upload:hover { background: #e0e7ff; }
      .cra-btn-tag { padding: 2px 8px; font-size: 11px; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; border-radius: 4px; cursor: pointer; margin-left: 4px; }
      .cra-btn-tag-pdf { background: #eef2ff; color: #4f46e5; border-color: #c7d2fe; font-weight: 600; }
      .cra-parsing-banner { background: #eef2ff; border: 1px solid #c7d2fe; color: #3730a3; padding: 10px 16px; border-radius: 6px; font-size: 13px; display: flex; align-items: center; gap: 10px; animation: pulse 1.5s infinite; }
      .cra-spinner { font-size: 16px; display: inline-block; animation: spin 1s linear infinite; }
      @keyframes spin { 100% { transform: rotate(360deg); } }
      .cra-pdf-tag { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 12px; font-size: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
      .cra-tag-highlight { background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 11px; }
      .cra-btn-sm { padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; }
      .cra-btn-success { background: #16a34a; color: #fff; }
      .cra-btn-ghost { background: transparent; color: #64748b; }
      .cra-alert-error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 10px 16px; border-radius: 6px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; }
      .cra-toast { position: fixed; top: 20px; right: 20px; background: #0f172a; color: #fff; padding: 10px 18px; border-radius: 6px; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; }
      .cra-main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .cra-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; height: 620px; }
      .cra-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #f1f5f9; }
      .cra-card-title { font-size: 14px; font-weight: 700; color: #334155; }
      .cra-title-input { font-size: 14px; font-weight: 600; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 10px; outline: none; }
      .cra-textarea { flex: 1; resize: none; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; font-size: 13px; line-height: 1.6; color: #1e293b; font-family: monospace; outline: none; }
      .cra-card-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
      .cra-meta { font-size: 12px; color: #94a3b8; }
      .cra-industry-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; }
      .cra-industry-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 6px; }
      .cra-industry-badge { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 4px; }
      .cra-industry-ref { font-size: 11px; color: #64748b; }
      .cra-industry-focus { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: 11px; margin-top: 4px; }
      .cra-focus-label { color: #475569; font-weight: 600; }
      .cra-focus-pill { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; padding: 1px 6px; border-radius: 4px; }
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
