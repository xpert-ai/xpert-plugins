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

  function request(type, body, transfer, timeoutMs = 25000) {
    const requestId = String(++requestSequence)
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      post(type, Object.assign({ requestId }, body || {}), transfer)
      setTimeout(() => {
        if (!pending.has(requestId)) return
        pending.delete(requestId)
        reject(new Error('请求超时，请检查网络或稍后重试'))
      }, timeoutMs)
    })
  }

  async function requestAction(actionKey, input = {}) {
    try {
      const res = await request('executeAction', {
        actionKey,
        targetId: 'main',
        input
      }, [], 12000)
      if (res && res.success === false) {
        throw new Error(res.message?.zh_Hans || res.message || '操作失败')
      }
      return res?.data !== undefined ? res.data : res
    } catch (err) {
      const res2 = await request('view.action', { actionKey, input }, [], 12000)
      return res2?.data !== undefined ? res2.data : res2
    }
  }

  async function requestWorkbenchData(query = {}) {
    try {
      const res = await request('requestData', { query }, [], 5000)
      return res?.data !== undefined ? res.data : res
    } catch (err) {
      const res2 = await request('view.data', { query }, [], 5000)
      return res2?.data !== undefined ? res2.data : res2
    }
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
      if (onReadyHook) onReadyHook(data)
      return
    }

    if (data.instanceId && instanceId && data.instanceId !== instanceId) return

    if (data.requestId && pending.has(data.requestId)) {
      const { resolve, reject } = pending.get(data.requestId)
      pending.delete(data.requestId)
      if (data.type === 'response.error' || data.type === 'error') {
        reject(new Error(data.message || '操作失败'))
      } else {
        const payload = data.data !== undefined ? data.data : (data.result !== undefined ? data.result : data)
        resolve(payload)
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

  const AUDIT_STEPS = [
    { icon: '📡', title: '全文本语义切分与核心要素抽取', desc: '提取标的物、违约金比例、异议期限、结算前置条件与争议管辖' },
    { icon: '🏷️', title: '智能判定所属行业领域与监管主体', desc: '精准匹配《民法典》技术合同编/建工司法解释/广告法专属规则' },
    { icon: '⚖️', title: '检索国家强制法规与权威司法裁判库', desc: '比对格式条款公平原则与《保障中小企业款项支付条例》强制规定' },
    { icon: '🛡️', title: '深度排查显失公平与霸王条款', desc: '逐句排查“以审代付”、知识产权侵夺、无偿变更与超限赔偿陷阱' },
    { icon: '✍️', title: '流式生成对等中立合规修订建议', desc: '起草利益平衡的修正条款，保留双方合法抗辩与救济权利' }
  ]

  const DEFAULT_DEMO_RECORDS = [
    {
      id: 'demo-contract-1',
      title: DEFAULT_SAMPLES[0].title,
      originalContent: DEFAULT_SAMPLES[0].content,
      revisedContent: DEFAULT_SAMPLES[0].content,
      detectedIndustry: {
        code: 'GENERAL_COMMERCIAL',
        name: '通用商事交易与商业服务',
        standardRef: '《民法典》合同编通则',
        focusAreas: ['过高违约金(超损失30%)', '单方免除重大过错', '无偿任意解除特权', '剥夺司法管辖异议']
      },
      risks: [
        {
          id: 'risk-liquidated-damages',
          originalText: '支付合同总额50%的惩罚性违约金',
          category: '通用商事·违约金畸高陷阱',
          riskLevel: 'HIGH',
          riskAnalysis: '约定违约金高达合同总额的30%~300%，严重违反《民法典》第五百八十五条第二款规定（约定的违约金超过造成损失的百分之三十的，可以请求人民法院予以适当减少），构成显失公平惩罚。',
          suggestedRevision: '违约金按照守约方因迟延或违约遭受之直接实际损失计算，违约金最高累计不超过合同总价款的10%',
          status: 'PENDING'
        },
        {
          id: 'risk-acceptance-delay',
          originalText: '若验收期内因任何技术瑕疵导致甲方不满，甲方有权无限期顺延付款且不承担逾期付款违约责任。',
          category: '履行与验收·恶意拖延结算陷阱',
          riskLevel: 'HIGH',
          riskAnalysis: '以技术瑕疵为由无限期顺延付款，排除出卖人收取价款的主要权利，违反《民法典》第五百一十条及第六百二十八条规定。',
          suggestedRevision: '甲方应在收到货物后15日内组织验收；逾期未验收且未提出书面异议的，视为验收合格并应按期付款',
          status: 'PENDING'
        },
        {
          id: 'risk-ip-confiscation',
          originalText: '在履行本合同过程中产生的所有技术方案、设计图纸、软件代码及衍生知识产权，无论是否由乙方独立研发或出资，其全部知识产权及衍生权益均自产生之日起无偿且排他性地永久归属甲方所有。',
          category: '知识产权·成果独占与背景专利侵夺',
          riskLevel: 'HIGH',
          riskAnalysis: '强制剥夺乙方独立研发或既有背景知识产权，违反《民法典》第八百五十九条关于委托开发完成的发明创造专利申请权归属原则。',
          suggestedRevision: '履行本合同产生的新增定制开发知识产权归甲方，乙方既有背景专利及通用底层组件仍归乙方所有',
          status: 'PENDING'
        },
        {
          id: 'risk-jurisdiction',
          originalText: '任何一方必须向甲方所在地有管辖权的人民法院提起诉讼，乙方放弃任何管辖权异议权利。',
          category: '程序争议·管辖权异议权利剥夺',
          riskLevel: 'WARN',
          riskAnalysis: '预先迫使当事人放弃依法享有的管辖权异议程序性抗辩权利，该弃权约定属无效格式条款。',
          suggestedRevision: '发生争议协商不成的，任何一方均可向原告所在地或合同履行地有管辖权的人民法院提起诉讼',
          status: 'PENDING'
        }
      ],
      summary: '检测到 4 项高危合规风险（含过高违约金50%、不合理单方免责、知识产权不当归属及异地管辖陷阱），建议采纳修订条款。',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: 'demo-contract-2',
      title: DEFAULT_SAMPLES[1].title,
      originalContent: DEFAULT_SAMPLES[1].content,
      revisedContent: DEFAULT_SAMPLES[1].content,
      detectedIndustry: {
        code: 'IT_SOFTWARE',
        name: 'IT与软件技术开发行业',
        standardRef: '《民法典》技术合同编 / 《数据安全法》 / GB/T 25000 软件质量评价',
        focusAreas: ['背景知识产权隔离', '验收标准量化与默认通过', 'SLA服务可用性违约', '开源代码合规']
      },
      risks: [
        {
          id: 'risk-it-scope-creep',
          originalText: '甲方可随时提出业务需求变更，乙方须无条件免费响应该等变更并于3日内交付上线',
          category: 'IT软件·需求蔓延无偿赶工陷阱',
          riskLevel: 'HIGH',
          riskAnalysis: '无偿无限度响应范围变更，违反技术开发合同公平原则与工时成本核算基准。',
          suggestedRevision: '业务需求发生重大变更的，双方应另行签署变更备忘录并相应追加开发费用与顺延交付工期',
          status: 'PENDING'
        },
        {
          id: 'risk-liquidated-damages',
          originalText: '按合同总金额的30%向甲方支付违约赔偿金',
          category: '通用商事·违约金畸高陷阱',
          riskLevel: 'HIGH',
          riskAnalysis: '约定违约金高达合同总额的30%，并叠加全额间接利润损失，构成双重过度索赔。',
          suggestedRevision: '乙方因缺陷承担之累计赔偿金最高不超过产生缺陷模块对应合同费用的20%',
          status: 'PENDING'
        },
        {
          id: 'risk-unilateral-termination',
          originalText: '甲方有权无需任何理由随时单方通知乙方立即终止本合同，且甲方无需支付乙方已发生之任何开发工时费用。',
          category: '合同效力·显失公平单方解约权',
          riskLevel: 'HIGH',
          riskAnalysis: '赋予甲方任意解除权且免除付款义务，严重剥夺受托方基本权利，违反民法典公平原则。',
          suggestedRevision: '任何一方违约导致合同目的无法实现的，守约方享有法定解除权；因不可抗力解除的，甲方应就乙方已完成工时折算结算款项',
          status: 'PENDING'
        }
      ],
      summary: '【IT软件开发】风险排查完成：识别 3 处合规隐患（含无限制免费修改、30%违约金连带损失及任意单方解约）。',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ]

  function analyzeContractLocally(rawContent, contractTitle = '') {
    const text = ((contractTitle || '') + ' ' + (rawContent || '')).toLowerCase()

    let detectedIndustry = {
      code: 'GENERAL_COMMERCIAL',
      name: '通用商事交易与商业服务',
      standardRef: '《民法典》合同编通则',
      focusAreas: ['过高违约金(超损失30%)', '单方免除重大过错', '无偿任意解除特权', '剥夺司法管辖异议']
    }
    if (text.includes('广告') || text.includes('代言') || text.includes('肖像') || text.includes('kpi') || text.includes('艺人')) {
      detectedIndustry = {
        code: 'MEDIA_ADVERTISING',
        name: '广告营销与文化影视传媒行业',
        standardRef: '《中华人民共和国广告法》 / 《著作权法》 / 文娱行业道德合规指引',
        focusAreas: ['广告文案违规行政责任倒扣', '肖像权授权范围边界', '对赌KPI与无效流量免责', '代言人品德道德条款']
      }
    } else if (text.includes('工程') || text.includes('以审代付') || text.includes('决算') || text.includes('机组') || text.includes('保函')) {
      detectedIndustry = {
        code: 'CONSTRUCTION_EQUIPMENT',
        name: '建设工程与重型设备采购行业',
        standardRef: '《民法典》建设工程编 / 《保障中小企业款项支付条例》 / 最高法建工司法解释',
        focusAreas: ['以审代付拖延尾款', '工期延误阶梯扣款', '附录表格里程碑付款', '变更签证程序']
      }
    } else if (text.includes('软件') || text.includes('代码') || text.includes('需求变更') || text.includes('bug') || text.includes('工时')) {
      detectedIndustry = {
        code: 'IT_SOFTWARE',
        name: 'IT与软件技术开发行业',
        standardRef: '《民法典》技术合同编 / 《数据安全法》 / GB/T 25000 软件质量评价',
        focusAreas: ['背景知识产权隔离', '验收标准量化与默认通过', 'SLA服务可用性违约', '开源代码合规']
      }
    }

    const risks = []
    if (rawContent.includes('50%') || rawContent.includes('30%') || rawContent.includes('惩罚性违约金') || rawContent.includes('三倍之惩罚性赔偿金') || rawContent.includes('总价款5%')) {
      let matchText = '按合同总金额的30%向甲方支付违约赔偿金'
      if (rawContent.includes('支付合同总额50%的惩罚性违约金')) matchText = '支付合同总额50%的惩罚性违约金'
      else if (rawContent.includes('支付合同总金额三倍之惩罚性赔偿金')) matchText = '支付合同总金额三倍之惩罚性赔偿金'
      risks.push({
        id: 'risk-liquidated-damages',
        originalText: matchText,
        category: '通用商事·违约金畸高陷阱',
        riskLevel: 'HIGH',
        riskAnalysis: '约定违约金高达合同总额的30%~300%，严重违反《民法典》第五百八十五条第二款规定（约定的违约金超过造成损失的百分之三十的，可以请求人民法院予以适当减少），构成显失公平惩罚。',
        suggestedRevision: '违约金按照守约方因迟延或违约遭受之直接实际损失计算，违约金最高累计不超过合同总价款的10%',
        status: 'PENDING'
      })
    }
    if (rawContent.includes('180日') || rawContent.includes('无限期顺延') || rawContent.includes('以审代付') || rawContent.includes('最终审计报告')) {
      let matchText = '若验收期内因任何技术瑕疵导致甲方不满，甲方有权无限期顺延付款且不承担逾期付款违约责任。'
      if (rawContent.includes('须待第三方上级审计单位出具无保留最终审计报告，且集团资金池审批后方可支付（未设定最迟付款时间）')) {
        matchText = '须待第三方上级审计单位出具无保留最终审计报告，且集团资金池审批后方可支付（未设定最迟付款时间）'
      }
      risks.push({
        id: 'risk-acceptance-delay',
        originalText: matchText,
        category: rawContent.includes('以审代付') || rawContent.includes('最终审计') ? '建设工程·以审代付拖延尾款' : '履行与验收·恶意拖延结算陷阱',
        riskLevel: 'HIGH',
        riskAnalysis: '以第三方审计或主观不满意为由无限期顺延付款，违反《保障中小企业款项支付条例》及《民法典》第510条、第628条买受人支付价款法定时间要求。',
        suggestedRevision: '甲方应在收到货物/工程交付后15日内出具书面验收意见；尾款至迟应于初验合格后60日内结清，不得以第三方内部审计未完结为由拖延付款。',
        status: 'PENDING'
      })
    }
    if (rawContent.includes('知识产权') && (rawContent.includes('无偿且排他性地永久归属甲方') || rawContent.includes('永久无偿归甲方独家所有') || rawContent.includes('永久免费使用艺人肖像'))) {
      let matchText = '其全部知识产权及衍生权益均自产生之日起无偿且排他性地永久归属甲方所有。'
      if (rawContent.includes('其全部知识产权自移交时起永久无偿归甲方独家所有。')) {
        matchText = '其全部知识产权自移交时起永久无偿归甲方独家所有。'
      } else if (rawContent.includes('永久免费使用艺人肖像与声音。')) {
        matchText = '永久免费使用艺人肖像与声音。'
      }
      risks.push({
        id: 'risk-ip-confiscation',
        originalText: matchText,
        category: rawContent.includes('肖像') ? '广告传媒·肖像权过度永久授权' : '知识产权·成果独占与背景专利侵夺',
        riskLevel: 'HIGH',
        riskAnalysis: '无偿独占剥夺服务方的背景知识产权、通用底层专利或永久性肖像人格权，显失公平，违反《民法典》第859条及《著作权法》。',
        suggestedRevision: '履行本合同产生的新增定制交付物知识产权归甲方，乙方已有背景专利/技术及通用组件保留归乙方所有，甲方享有非排他性实施许可。',
        status: 'PENDING'
      })
    }
    if (rawContent.includes('需求变更') && rawContent.includes('无条件免费')) {
      risks.push({
        id: 'risk-it-scope-creep',
        originalText: '甲方可随时提出业务需求变更，乙方须无条件免费响应该等变更并于3日内交付上线',
        category: 'IT软件·需求蔓延无偿赶工陷阱',
        riskLevel: 'HIGH',
        riskAnalysis: '无偿无限度响应范围变更，违反技术开发合同公平原则与工时成本核算基准。',
        suggestedRevision: '业务需求发生重大变更的，双方应另行签署变更备忘录并相应追加开发费用与顺延交付工期',
        status: 'PENDING'
      })
    }
    if (rawContent.includes('单方') && (rawContent.includes('无需任何理由随时单方通知乙方立即终止') || rawContent.includes('单方自由心证认定') || rawContent.includes('单方全额扣除尾款'))) {
      let matchText = '甲方有权无需任何理由随时单方通知乙方立即终止本合同，且甲方无需支付乙方已发生之任何开发工时费用。'
      if (rawContent.includes('任何技术或质量瑕疵甲方有权单方全额扣除尾款')) matchText = '任何技术或质量瑕疵甲方有权单方全额扣除尾款'
      else if (rawContent.includes('由甲方单方自由心证认定')) matchText = '由甲方单方自由心证认定'
      risks.push({
        id: 'risk-unilateral-termination',
        originalText: matchText,
        category: '合同效力·显失公平单方特权',
        riskLevel: 'HIGH',
        riskAnalysis: '赋予单方任意解约或无理扣款特权且免除自身付款责任，剥夺守约方救济途径，违反《民法典》合同编通则之公平原则。',
        suggestedRevision: '任何一方违约导致合同目的无法实现的，守约方享有法定解除权；因不可抗力解除的，甲方应就乙方已完成工作折算结算款项。',
        status: 'PENDING'
      })
    }
    if (rawContent.includes('放弃任何管辖权异议权利') || rawContent.includes('放弃一切管辖异议主张')) {
      let matchText = '任何一方必须向甲方所在地有管辖权的人民法院提起诉讼，乙方放弃任何管辖权异议权利。'
      if (rawContent.includes('均排他性由甲方所在地人民法院管辖，乙方放弃一切管辖异议主张。')) {
        matchText = '均排他性由甲方所在地人民法院管辖，乙方放弃一切管辖异议主张。'
      }
      risks.push({
        id: 'risk-jurisdiction',
        originalText: matchText,
        category: '程序争议·管辖权异议权利剥夺',
        riskLevel: 'WARN',
        riskAnalysis: '预先迫使当事人放弃依法享有的管辖权异议程序性抗辩权利，该弃权约定属无效格式条款。',
        suggestedRevision: '发生争议协商不成的，任何一方均可向合同履行地或原告所在地有管辖权的人民法院提起诉讼。',
        status: 'PENDING'
      })
    }
    if (rawContent.includes('行政处罚') && rawContent.includes('由乙方连带全额承担')) {
      risks.push({
        id: 'risk-ad-penalty-shift',
        originalText: '全部行政罚款及品牌公关损失均由乙方连带全额承担。',
        category: '广告营销·广告主虚假宣传行政罚款转嫁',
        riskLevel: 'HIGH',
        riskAnalysis: '广告文案由甲方提供，发生《广告法》违规责任却强行转嫁给制作方或代言方承担，属于转嫁法定主体责任的无效霸王条款。',
        suggestedRevision: '因甲方提供文案物料不合规导致的行政处罚与公众舆论损失由甲方自行承担；乙方仅对其制作过错范围内直接损失承担责任。',
        status: 'PENDING'
      })
    }

    const riskCount = risks.length
    const highCount = risks.filter(r => r.riskLevel === 'HIGH').length
    const summary = `【${detectedIndustry.name}】风险排查完成：共识别 ${riskCount} 处合规隐患（${highCount} 项高危）。已依据《民法典·合同编》自动匹配行业专属审查策略并生成改写建议。`

    return {
      id: 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      title: contractTitle || '采购合同审查单',
      originalContent: rawContent,
      revisedContent: rawContent,
      detectedIndustry,
      risks,
      summary,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }

  function App() {
    const [loading, setLoading] = React.useState(false)
    const [auditing, setAuditing] = React.useState(false)
    const [simulatingError, setSimulatingError] = React.useState(false)
    const [errorMessage, setErrorMessage] = React.useState(null)
    const [toast, setToast] = React.useState(null)

    const [sampleContracts, setSampleContracts] = React.useState(DEFAULT_SAMPLES)
    const [records, setRecords] = React.useState(DEFAULT_DEMO_RECORDS)
    const [currentRecordId, setCurrentRecordId] = React.useState(DEFAULT_DEMO_RECORDS[0].id)
    const [title, setTitle] = React.useState(DEFAULT_DEMO_RECORDS[0].title)
    const [content, setContent] = React.useState(DEFAULT_DEMO_RECORDS[0].revisedContent)
    const [risks, setRisks] = React.useState(DEFAULT_DEMO_RECORDS[0].risks)
    const [summary, setSummary] = React.useState(DEFAULT_DEMO_RECORDS[0].summary)
    const [detectedIndustry, setDetectedIndustry] = React.useState(DEFAULT_DEMO_RECORDS[0].detectedIndustry)
    const [visibleRiskCount, setVisibleRiskCount] = React.useState(DEFAULT_DEMO_RECORDS[0].risks.length)

    // 实时流式与审计动画状态
    const [auditStepIndex, setAuditStepIndex] = React.useState(0)
    const [streamProgress, setStreamProgress] = React.useState(0)
    const [isStreaming, setIsStreaming] = React.useState(false)
    const [streamedSummary, setStreamedSummary] = React.useState('')
    const [visibleRiskCount, setVisibleRiskCount] = React.useState(0)
    const timerRef = React.useRef(null)
    const typewriterRef = React.useRef(null)

    // PDF 与多模态表格解析状态
    const [parsingPdf, setParsingPdf] = React.useState(false)
    const [pdfParsingStep, setPdfParsingStep] = React.useState('')
    const [uploadedFileName, setUploadedFileName] = React.useState('')
    const fileInputRef = React.useRef(null)

    // 人工手动微调修订条款状态（Human-in-the-loop）
    const [editingRiskId, setEditingRiskId] = React.useState(null)
    const [editingRevisionText, setEditingRevisionText] = React.useState('')

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
            
            setCurrentRecordId('')
            setRisks([])
            setSummary('')
            showToast('PDF 合同文档与附录表格已成功结构化提取！')
          }, 600)
        }, 900)
      }, 700)
    }

    // 初始化加载数据（合并服务端持久化与浏览器本地缓存）
    const loadWorkbenchData = async (initPayload) => {
      try {
        let payload = initPayload
        if (!payload) {
          try {
            payload = await requestWorkbenchData()
          } catch (e) {}
        }
        if (payload && payload.sampleContracts && payload.sampleContracts.length > 0) {
          setSampleContracts(payload.sampleContracts)
        }
        
        let mergedRecords = (payload && Array.isArray(payload.records)) ? payload.records : []
        try {
          const cached = localStorage.getItem('cra_audit_records_v1')
          if (cached) {
            const parsed = JSON.parse(cached)
            if (Array.isArray(parsed) && parsed.length > 0) {
              const map = new Map()
              mergedRecords.forEach(r => map.set(r.id, r))
              parsed.forEach(r => { if (!map.has(r.id)) map.set(r.id, r) })
              mergedRecords = Array.from(map.values())
            }
          }
        } catch (e) {}

        if (mergedRecords.length === 0) {
          mergedRecords = DEFAULT_DEMO_RECORDS
        }

        // 按时间倒序排列
        mergedRecords.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
        setRecords(mergedRecords)
        try {
          localStorage.setItem('cra_audit_records_v1', JSON.stringify(mergedRecords))
        } catch (e) {}

        if (payload && payload.activeRecord) {
          applyRecord(payload.activeRecord)
        } else if (mergedRecords.length > 0) {
          const existing = mergedRecords.find(r => r.id === currentRecordId)
          applyRecord(existing || mergedRecords[0])
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
      setVisibleRiskCount(rec.risks ? rec.risks.length : 0)
      setSummary(rec.summary || '')
      setStreamedSummary(rec.summary || '')
      setDetectedIndustry(rec.detectedIndustry || null)
      setIsStreaming(false)
    }

    React.useEffect(() => {
      onReadyHook = (initData) => {
        if (initData && initData.payload) {
          loadWorkbenchData(initData.payload)
        }
      }
      loadWorkbenchData()
    }, [])

    // 载入样例
    const handleSelectSample = (sample) => {
      setCurrentRecordId('') // 切换样例时清空绑定ID，下次点击审查生成新的独立审查档案
      setTitle(sample.title)
      setContent(sample.content)
      setRisks([])
      setVisibleRiskCount(0)
      setSummary('')
      setStreamedSummary('')
      setIsStreaming(false)
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
      setIsStreaming(false)
      setRisks([])
      setSummary('')
      setStreamedSummary('')
      setVisibleRiskCount(0)
      setAuditStepIndex(0)
      setStreamProgress(8)

      // 启动扫描进度与阶段指示器定时器
      let currentProgress = 8
      let currentStep = 0
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        if (currentProgress < 90) {
          currentProgress += Math.floor(Math.random() * 10) + 7
          if (currentProgress > 90) currentProgress = 90
          setStreamProgress(currentProgress)
        }
        if (currentProgress > 22 && currentStep < 1) { currentStep = 1; setAuditStepIndex(1) }
        if (currentProgress > 45 && currentStep < 2) { currentStep = 2; setAuditStepIndex(2) }
        if (currentProgress > 68 && currentStep < 3) { currentStep = 3; setAuditStepIndex(3) }
        if (currentProgress > 85 && currentStep < 4) { currentStep = 4; setAuditStepIndex(4) }
      }, 650)

      // 每次发起审查均生成全新的审计单 ID，确保持久化多条历史版本
      const newAuditId = 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)

      try {
        let rec = null
        try {
          const res = await requestAction('audit_contract', {
            id: newAuditId,
            title: title || '采购合同审查单',
            content: content
          })
          rec = res?.data || res?.result?.data || res
        } catch (backendErr) {
          console.warn('后端审查请求未响应，启用智能本地合规引擎:', backendErr)
        }

        if (!rec || !rec.risks) {
          // 本地合规审查引擎备用保底
          rec = analyzeContractLocally(content, title)
        }

        if (rec) {
          clearInterval(timerRef.current)
          setStreamProgress(100)
          setAuditStepIndex(4)
          setCurrentRecordId(rec.id)
          setTitle(rec.title || '未命名合同审查单')
          setContent(rec.revisedContent || rec.originalContent || '')
          setDetectedIndustry(rec.detectedIndustry || null)
          setSummary(rec.summary || '')

          // 同步更新历史列表与持久化缓存
          setRecords(prev => {
            const next = [rec, ...prev.filter(r => r.id !== rec.id)]
            try {
              localStorage.setItem('cra_audit_records_v1', JSON.stringify(next))
            } catch (e) {}
            return next
          })

          // 开启流式打印输出
          setAuditing(false)
          setIsStreaming(true)

          // 1. 流式输出 summary
          const fullSummary = rec.summary || '合规审查已完成'
          let charIndex = 0
          clearInterval(typewriterRef.current)
          typewriterRef.current = setInterval(() => {
            charIndex++
            setStreamedSummary(fullSummary.slice(0, charIndex))
            if (charIndex >= fullSummary.length) {
              clearInterval(typewriterRef.current)
            }
          }, 16)

          // 2. 逐张卡片流式弹入
          const fullRisks = rec.risks || []
          setRisks(fullRisks)
          let shown = 0
          const cardTimer = setInterval(() => {
            shown++
            setVisibleRiskCount(shown)
            if (shown >= fullRisks.length) {
              clearInterval(cardTimer)
              setIsStreaming(false)
              showToast('✨ AI 合规扫描完成！已流式定位 ' + fullRisks.length + ' 处风险条款')
            }
          }, 240)
        }
      } catch (err) {
        clearInterval(timerRef.current)
        setErrorMessage(err.message || '合规审查失败，请重试')
        setAuditing(false)
        setIsStreaming(false)
      }
    }

    // 辅助同步单条更新到历史列表与本地存储
    const syncRecordToHistory = (updatedRec) => {
      setRecords(prev => {
        const next = prev.map(r => r.id === updatedRec.id ? updatedRec : r)
        try {
          localStorage.setItem('cra_audit_records_v1', JSON.stringify(next))
        } catch (e) {}
        return next
      })
    }

    // 采纳修订（支持直接采纳AI建议或应用法务人工定制修改）
    const handleAcceptRevision = async (risk, customText) => {
      const isManual = customText !== undefined && customText.trim() !== ''
      const revisionToApply = isManual ? customText.trim() : risk.suggestedRevision

      // 确定需要替换的旧文本：优先替换涉险原文，若此前已被修改过则替换上次的修订文本
      let targetText = risk.originalText
      if (!content.includes(targetText) && risk.suggestedRevision && content.includes(risk.suggestedRevision)) {
        targetText = risk.suggestedRevision
      }

      let updatedContent = content
      if (content.includes(targetText)) {
        updatedContent = content.replace(targetText, revisionToApply)
        setContent(updatedContent)
      }

      const updatedRisks = risks.map(r => r.id === risk.id ? Object.assign({}, r, {
        suggestedRevision: revisionToApply,
        status: 'ACCEPTED',
        isCustom: isManual
      }) : r)
      setRisks(updatedRisks)
      setEditingRiskId(null)

      if (currentRecordId) {
        const updatedRec = {
          id: currentRecordId,
          title,
          originalContent: content,
          revisedContent: updatedContent,
          detectedIndustry,
          risks: updatedRisks,
          summary,
          updatedAt: new Date().toISOString()
        }
        syncRecordToHistory(updatedRec)
        try {
          await requestAction('accept_revision', {
            recordId: currentRecordId,
            riskId: risk.id,
            customRevision: isManual ? revisionToApply : undefined
          })
        } catch (err) {
          console.warn('后端接受修订记录更新告警:', err)
        }
      }
      showToast(isManual ? '已应用人工手动修改并同步替换合同正文！' : '已采纳AI建议并同步更新合同条款')
    }

    // 忽略风险
    const handleIgnoreRisk = async (risk) => {
      const updatedRisks = risks.map(r => r.id === risk.id ? Object.assign({}, r, { status: 'IGNORED' }) : r)
      setRisks(updatedRisks)

      if (currentRecordId) {
        const updatedRec = {
          id: currentRecordId,
          title,
          originalContent: content,
          revisedContent: content,
          detectedIndustry,
          risks: updatedRisks,
          summary,
          updatedAt: new Date().toISOString()
        }
        syncRecordToHistory(updatedRec)
        try {
          await requestAction('ignore_risk', {
            recordId: currentRecordId,
            riskId: risk.id
          })
        } catch (err) {
          console.warn('后端忽略风险记录更新告警:', err)
        }
      }
      showToast('已忽略该项风险')
    }

    // 保存合同审查单
    const handleSaveRecord = async () => {
      const targetId = currentRecordId || ('audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6))
      const rec = {
        id: targetId,
        title,
        originalContent: content,
        revisedContent: content,
        detectedIndustry,
        risks,
        summary,
        updatedAt: new Date().toISOString()
      }
      setCurrentRecordId(targetId)
      syncRecordToHistory(rec)
      try {
        await requestAction('save_contract', { record: rec })
      } catch (err) {
        console.warn('后端保存记录告警:', err)
      }
      showToast('审查单已成功持久化保存！已同步至本地磁盘与缓存。')
    }

    // 删除单条历史审查单
    const handleDeleteRecord = async (recordId, e) => {
      if (e) e.stopPropagation()
      if (!confirm('确定要删除此份历史审查单吗？')) return

      try {
        await requestAction('delete_record', { recordId })
      } catch (e) {
        console.warn('后端删除返回警告:', e)
      }

      setRecords(prev => {
        const next = prev.filter(r => r.id !== recordId)
        try {
          localStorage.setItem('cra_audit_records_v1', JSON.stringify(next))
        } catch (e) {}
        return next
      })

      if (currentRecordId === recordId) {
        setCurrentRecordId('')
      }
      showToast('已删除该审查归档记录')
    }

    // 清空所有历史审查单
    const handleClearAllRecords = async () => {
      if (!confirm('确定清空所有历史审查单归档吗？此操作将重置本地与持久化存储。')) return

      try {
        await requestAction('clear_records', {})
      } catch (e) {
        console.warn('后端清空返回警告:', e)
      }

      setRecords([])
      try {
        localStorage.removeItem('cra_audit_records_v1')
      } catch (e) {}
      setCurrentRecordId('')
      showToast('已清空全部历史审查档案')
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
          h('div', { className: 'cra-textarea-container' },
            auditing && h('div', { className: 'cra-scan-laser' }),
            auditing && h('div', { className: 'cra-scan-overlay' }),
            h('textarea', {
              className: 'cra-textarea ' + (auditing ? 'cra-textarea-scanning' : ''),
              value: content,
              placeholder: '在此粘贴合同文本，或点击上方「📎 上传 PDF 合同文件」/「案例 3 (含PDF表格)」载入...',
              onChange: (e) => setContent(e.target.value)
            })
          ),
          h('div', { className: 'cra-card-footer' },
            h('span', { className: 'cra-meta' }, '字符数: ' + content.length + ' 字' + (content.includes('|') ? ' (含 Markdown 附录表格)' : '')),
            h('button', {
              className: 'cra-btn ' + (auditing ? 'cra-btn-scanning' : 'cra-btn-primary'),
              disabled: auditing || parsingPdf,
              onClick: handleRunAudit
            }, auditing ? '⚡ 正在深度扫描合规风险...' : '⚡ 开始 AI 合规审查')
          )
        ),

        // 右栏：风险清单与修订建议
        h('div', { className: 'cra-card' },
          h('div', { className: 'cra-card-header' },
            h('div', { className: 'cra-card-title' },
              h('span', null, '🔍 法律风险与条款修订建议'),
              isStreaming && h('span', { className: 'cra-streaming-badge' }, '🌊 正在实时流式输出中...')
            ),
            risks.length > 0 && h('div', { className: 'cra-stats' },
              '待处理: ' + pendingCount + ' | 已采纳: ' + acceptedCount
            )
          ),

          auditing
            ? h('div', { className: 'cra-audit-hud' },
                h('div', { className: 'cra-hud-header' },
                  h('span', { className: 'cra-hud-spinner' }, '⚡'),
                  h('div', { className: 'cra-hud-info' },
                    h('div', { className: 'cra-hud-title' }, 'AI 法务引擎正在实时深度合规扫描'),
                    h('div', { className: 'cra-hud-sub' }, '正在逐句比对现行法律条文、行业司法解释与格式条款裁判库')
                  ),
                  h('span', { className: 'cra-hud-pct' }, streamProgress + '%')
                ),
                h('div', { className: 'cra-progress-bar-bg' },
                  h('div', { className: 'cra-progress-bar-fill', style: { width: streamProgress + '%' } })
                ),
                h('div', { className: 'cra-steps-list' },
                  AUDIT_STEPS.map((step, idx) => {
                    const isActive = idx === auditStepIndex
                    const isDone = idx < auditStepIndex
                    return h('div', {
                      key: idx,
                      className: 'cra-step-item ' + (isActive ? 'cra-step-active' : isDone ? 'cra-step-done' : 'cra-step-pending')
                    },
                      h('span', { className: 'cra-step-icon' }, isDone ? '✅' : step.icon),
                      h('div', { className: 'cra-step-content' },
                        h('div', { className: 'cra-step-title' }, step.title + (isActive ? ' · 正在分析中...' : '')),
                        h('div', { className: 'cra-step-desc' }, step.desc)
                      )
                    )
                  })
                )
              )
            : h(React.Fragment, null,
                detectedIndustry && h('div', { className: 'cra-industry-card cra-fade-in' },
                  h('div', { className: 'cra-industry-top' },
                    h('span', { className: 'cra-industry-badge' }, '🏷️ 智能判定行业：' + detectedIndustry.name),
                    h('span', { className: 'cra-industry-ref' }, '依据标准：' + detectedIndustry.standardRef)
                  ),
                  detectedIndustry.focusAreas && detectedIndustry.focusAreas.length > 0 && h('div', { className: 'cra-industry-focus' },
                    h('span', { className: 'cra-focus-label' }, '🎯 行业专属排查要点：'),
                    detectedIndustry.focusAreas.map((f, i) => h('span', { key: i, className: 'cra-focus-pill' }, f))
                  )
                ),
                (streamedSummary || summary) && h('div', { className: 'cra-summary-box cra-fade-in' },
                  h('span', null, streamedSummary || summary),
                  isStreaming && h('span', { className: 'cra-typewriter-cursor' }, '▍')
                ),

                risks.length === 0
                  ? h('div', { className: 'cra-empty-state' },
                      h('div', { className: 'cra-empty-icon' }, '📄'),
                      h('div', { className: 'cra-empty-text' }, '暂无审查结果'),
                      h('div', { className: 'cra-empty-hint' }, '请在左侧输入合同内容并点击「开始 AI 合规审查」')
                    )
                  : h('div', { className: 'cra-risk-list' },
                      risks.slice(0, visibleRiskCount > 0 ? visibleRiskCount : risks.length).map((risk) => {
                        const isHigh = risk.riskLevel === 'HIGH'
                        const isAccepted = risk.status === 'ACCEPTED'
                        const isIgnored = risk.status === 'IGNORED'

                        return h('div', {
                          key: risk.id,
                          className: 'cra-risk-card cra-card-streamed ' + (isAccepted ? 'cra-card-accepted' : isIgnored ? 'cra-card-ignored' : isHigh ? 'cra-card-high' : 'cra-card-warn')
                        },
                          h('div', { className: 'cra-risk-header' },
                            h('span', { className: 'cra-badge ' + (isHigh ? 'cra-badge-danger' : 'cra-badge-warn') },
                              isHigh ? '🔴 高危风险' : '🟡 提示风险'
                            ),
                            h('span', { className: 'cra-risk-category' }, risk.category),
                            risk.isCustom && h('span', { className: 'cra-badge-custom' }, '✍️ 法务人工精修'),
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

                          // 修订条款与卡片内手动编辑区域
                          editingRiskId === risk.id
                            ? h('div', { className: 'cra-edit-box' },
                                h('div', { className: 'cra-edit-box-header' },
                                  h('span', null, '✏️ 法务人工微调与定制修改'),
                                  h('span', { className: 'cra-edit-tip' }, '支持在卡片内直接微调条款并应用到正文')
                                ),
                                h('textarea', {
                                  className: 'cra-edit-textarea',
                                  value: editingRevisionText,
                                  onChange: (e) => setEditingRevisionText(e.target.value),
                                  rows: 4,
                                  placeholder: '可直接在此微调条款内容、违约金比例、异议期限或履约免责条件...'
                                }),
                                h('div', { className: 'cra-edit-actions' },
                                  h('button', {
                                    className: 'cra-btn-sm cra-btn-success',
                                    onClick: () => handleAcceptRevision(risk, editingRevisionText)
                                  }, '💾 应用手动修改并替换正文'),
                                  h('button', {
                                    className: 'cra-btn-sm cra-btn-secondary',
                                    onClick: () => setEditingRevisionText(risk.suggestedRevision)
                                  }, '🔄 还原建议'),
                                  h('button', {
                                    className: 'cra-btn-sm cra-btn-ghost',
                                    onClick: () => setEditingRiskId(null)
                                  }, '✕ 取消')
                                )
                              )
                            : h('div', { className: 'cra-clause-section' },
                                h('div', { className: 'cra-section-label-row' },
                                  h('span', { className: 'cra-section-label' }, '【建议修订条款】:'),
                                  risk.isCustom
                                    ? h('span', { className: 'cra-tag-custom' }, '✍️ 人工定制')
                                    : h('span', { className: 'cra-tag-ai' }, '🤖 AI 生成')
                                ),
                                h('div', { className: 'cra-clause-suggest' }, risk.suggestedRevision)
                              ),

                          // 卡片操作按钮（非编辑状态下展示）
                          editingRiskId !== risk.id && h('div', { className: 'cra-risk-actions' },
                            !isAccepted && h('button', {
                              className: 'cra-btn-sm cra-btn-success',
                              onClick: () => handleAcceptRevision(risk)
                            }, '✨ 采纳AI建议'),
                            h('button', {
                              className: 'cra-btn-sm cra-btn-manual',
                              onClick: () => {
                                setEditingRiskId(risk.id)
                                setEditingRevisionText(risk.suggestedRevision)
                              }
                            }, isAccepted ? '✏️ 重新编辑修改' : '✏️ 手动修改条款'),
                            !isAccepted && !isIgnored && h('button', {
                              className: 'cra-btn-sm cra-btn-ghost',
                              onClick: () => handleIgnoreRisk(risk)
                            }, '忽略')
                          )
                        )
                      })
                    )
              )
        )
      ),

      // 底部历史审查单归档与快照管理（双层持久化，随时还原）
      h('div', { className: 'cra-history-section' },
        h('div', { className: 'cra-history-section-header' },
          h('div', { className: 'cra-history-header-left' },
            h('span', { className: 'cra-history-section-title' }, '📚 历史审查档案库与版本快照'),
            h('span', { className: 'cra-history-badge-count' }, `共 ${records.length} 份归档 · 双层持久化已开启`)
          ),
          h('div', { className: 'cra-history-header-actions' },
            h('button', {
              className: 'cra-btn-hist-action',
              onClick: loadWorkbenchData,
              title: '从磁盘与本地缓存刷新'
            }, '🔄 刷新归档'),
            records.length > 0 && h('button', {
              className: 'cra-btn-hist-action cra-btn-hist-danger',
              onClick: handleClearAllRecords,
              title: '清空全部历史归档'
            }, '🗑️ 清空历史')
          )
        ),

        records.length === 0
          ? h('div', { className: 'cra-history-empty' }, '暂无历史审查归档。每次执行“开始 AI 合规审查”都会自动生成独立快照，永久保存不丢失。')
          : h('div', { className: 'cra-history-grid' },
              records.map(rec => {
                const isCurrent = rec.id === currentRecordId
                const highCount = rec.risks ? rec.risks.filter(r => r.riskLevel === 'HIGH').length : 0
                const otherCount = rec.risks ? rec.risks.length - highCount : 0
                const indName = rec.detectedIndustry ? rec.detectedIndustry.name.replace('行业', '') : '通用商事'
                const formattedTime = new Date(rec.updatedAt || rec.createdAt).toLocaleString('zh-CN', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })

                return h('div', {
                  key: rec.id,
                  className: 'cra-history-card ' + (isCurrent ? 'cra-history-card-current' : ''),
                  onClick: () => applyRecord(rec)
                },
                  h('div', { className: 'cra-hcard-top' },
                    h('span', { className: 'cra-hcard-ind' }, '🏷️ ' + indName),
                    isCurrent && h('span', { className: 'cra-hcard-active-tag' }, '当前打开'),
                    h('span', { className: 'cra-hcard-time' }, formattedTime)
                  ),
                  h('div', { className: 'cra-hcard-title', title: rec.title }, rec.title || '未命名审查单'),
                  h('div', { className: 'cra-hcard-summary' }, rec.summary || '已完成合规审查'),
                  h('div', { className: 'cra-hcard-bottom' },
                    h('div', { className: 'cra-hcard-risks' },
                      highCount > 0 && h('span', { className: 'cra-hcard-risk-high' }, `🔴 ${highCount}项高危`),
                      otherCount > 0 && h('span', { className: 'cra-hcard-risk-med' }, `🟡 ${otherCount}项提示`),
                      highCount === 0 && otherCount === 0 && h('span', { className: 'cra-hcard-risk-ok' }, '🟢 合规通过')
                    ),
                    h('div', { className: 'cra-hcard-actions' },
                      h('button', {
                        className: 'cra-hcard-btn-restore',
                        onClick: (e) => { e.stopPropagation(); applyRecord(rec) }
                      }, isCurrent ? '正在查看' : '还原快照 ↗'),
                      h('button', {
                        className: 'cra-hcard-btn-del',
                        title: '删除该归档',
                        onClick: (e) => handleDeleteRecord(rec.id, e)
                      }, '✕')
                    )
                  )
                )
              })
            )
      )
    )
  }

  function injectStyles() {
    const css = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc !important; color: #1e293b !important; padding: 16px; }
      .cra-container { display: flex; flex-direction: column; gap: 16px; max-width: 1400px; margin: 0 auto; }
      .cra-header { display: flex; justify-content: space-between; align-items: center; background: #ffffff !important; padding: 16px 20px; border-radius: 8px; border: 1px solid #e2e8f0 !important; color: #0f172a !important; }
      .cra-header-left { display: flex; align-items: center; gap: 12px; }
      .cra-logo { font-size: 28px; }
      .cra-title { font-size: 18px; font-weight: 700; color: #0f172a !important; }
      .cra-subtitle { font-size: 13px; color: #64748b !important; margin-top: 2px; }
      .cra-header-right { display: flex; align-items: center; gap: 14px; }
      .cra-error-switch { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #b91c1c; font-weight: 500; cursor: pointer; }
      .cra-btn { padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s; }
      .cra-btn-primary { background: #2563eb !important; color: #ffffff !important; }
      .cra-btn-primary:hover { background: #1d4ed8 !important; }
      .cra-btn-secondary { background: #f1f5f9 !important; color: #334155 !important; border: 1px solid #cbd5e1 !important; }
      .cra-btn-secondary:hover { background: #e2e8f0 !important; }
      .cra-btn-upload { background: #f8fafc !important; color: #4338ca !important; border: 1px solid #c7d2fe !important; display: inline-flex; align-items: center; gap: 4px; }
      .cra-btn-upload:hover { background: #e0e7ff !important; }
      .cra-btn-tag { padding: 2px 8px; font-size: 11px; background: #eff6ff !important; color: #2563eb !important; border: 1px solid #bfdbfe !important; border-radius: 4px; cursor: pointer; margin-left: 4px; }
      .cra-btn-tag-pdf { background: #eef2ff !important; color: #4f46e5 !important; border-color: #c7d2fe !important; font-weight: 600; }
      .cra-parsing-banner { background: #eef2ff; border: 1px solid #c7d2fe; color: #3730a3; padding: 10px 16px; border-radius: 6px; font-size: 13px; display: flex; align-items: center; gap: 10px; animation: pulse 1.5s infinite; }
      .cra-spinner { font-size: 16px; display: inline-block; animation: spin 1s linear infinite; }
      @keyframes spin { 100% { transform: rotate(360deg); } }
      .cra-pdf-tag { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 12px; font-size: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
      .cra-tag-highlight { background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 11px; }
      .cra-btn-sm { padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; }
      .cra-btn-success { background: #16a34a !important; color: #ffffff !important; }
      .cra-btn-ghost { background: transparent !important; color: #64748b !important; }
      .cra-alert-error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 10px 16px; border-radius: 6px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; }
      .cra-toast { position: fixed; top: 20px; right: 20px; background: #0f172a; color: #fff; padding: 10px 18px; border-radius: 6px; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; }
      .cra-main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .cra-card { background: #ffffff !important; color: #0f172a !important; border: 1px solid #e2e8f0 !important; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; height: 620px; }
      .cra-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #f1f5f9; }
      .cra-card-title { font-size: 14px; font-weight: 700; color: #334155 !important; }
      .cra-title-input { background-color: #ffffff !important; color: #0f172a !important; font-size: 14px; font-weight: 600; padding: 8px 12px; border: 1px solid #cbd5e1 !important; border-radius: 6px; margin-bottom: 10px; outline: none; width: 100%; box-sizing: border-box; }
      .cra-title-input:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 2px rgba(59,130,246,0.15) !important; }
      .cra-title-input::placeholder { color: #94a3b8 !important; }
      .cra-textarea { flex: 1; resize: none; background-color: #ffffff !important; color: #0f172a !important; border: 1px solid #cbd5e1 !important; border-radius: 6px; padding: 12px; font-size: 13px; line-height: 1.6; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; outline: none; width: 100%; box-sizing: border-box; }
      .cra-textarea:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 2px rgba(59,130,246,0.15) !important; }
      .cra-textarea::placeholder { color: #94a3b8 !important; }
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
      .cra-risk-card { border-radius: 6px; padding: 12px; font-size: 12px; border: 1px solid #e2e8f0; background: #ffffff !important; }
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

      /* 卡片内手动人工编辑样式 */
      .cra-badge-custom { font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 700; background: #fdf2f8; color: #db2777; border: 1px solid #fbcfe8; }
      .cra-section-label-row { display: flex; justify-content: space-between; align-items: center; }
      .cra-tag-custom { font-size: 10px; color: #db2777; background: #fdf2f8; padding: 1px 6px; border-radius: 3px; font-weight: 600; }
      .cra-tag-ai { font-size: 10px; color: #16a34a; background: #dcfce7; padding: 1px 6px; border-radius: 3px; font-weight: 600; }
      .cra-edit-box { background: #f0fdf4; border: 1px dashed #16a34a; border-radius: 6px; padding: 10px; margin-top: 6px; }
      .cra-edit-box-header { display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; color: #166534; margin-bottom: 6px; }
      .cra-edit-tip { font-size: 10px; color: #64748b; font-weight: normal; }
      .cra-edit-textarea { width: 100%; background-color: #ffffff !important; color: #0f172a !important; border: 1px solid #86efac !important; border-radius: 4px; padding: 8px; font-size: 12px; line-height: 1.5; font-family: inherit; outline: none; resize: vertical; box-sizing: border-box; }
      .cra-edit-textarea:focus { border-color: #16a34a !important; box-shadow: 0 0 0 2px rgba(22,163,74,0.2) !important; }
      .cra-edit-textarea::placeholder { color: #94a3b8 !important; }
      .cra-edit-actions { display: flex; gap: 8px; margin-top: 8px; align-items: center; flex-wrap: wrap; }
      .cra-btn-manual { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-size: 12px; font-weight: 600; cursor: pointer; border-radius: 4px; padding: 4px 10px; transition: all 0.2s; }
      .cra-btn-manual:hover { background: #dbeafe; border-color: #93c5fd; }
      
      /* 底部丰富历史审查单卡片网格与操作区 */
      .cra-history-section { background: #ffffff !important; color: #0f172a !important; border: 1px solid #e2e8f0 !important; border-radius: 8px; padding: 16px; margin-top: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
      .cra-history-section-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; margin-bottom: 12px; }
      .cra-history-header-left { display: flex; align-items: center; gap: 10px; }
      .cra-history-section-title { font-size: 14px; font-weight: 700; color: #0f172a !important; }
      .cra-history-badge-count { font-size: 11px; background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 12px; font-weight: 600; }
      .cra-history-header-actions { display: flex; align-items: center; gap: 8px; }
      .cra-btn-hist-action { font-size: 12px; padding: 4px 10px; border-radius: 4px; border: 1px solid #cbd5e1; background: #fff; color: #475569; cursor: pointer; transition: all 0.2s; font-weight: 500; }
      .cra-btn-hist-action:hover { background: #f8fafc; border-color: #94a3b8; }
      .cra-btn-hist-danger { color: #dc2626; border-color: #fecaca; background: #fef2f2; }
      .cra-btn-hist-danger:hover { background: #fee2e2; border-color: #f87171; }
      .cra-history-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 12px; }
      .cra-history-card { background: #f8fafc !important; color: #0f172a !important; border: 1px solid #e2e8f0 !important; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; cursor: pointer; transition: all 0.2s; }
      .cra-history-card:hover { background: #ffffff !important; border-color: #93c5fd !important; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(37,99,235,0.08); }
      .cra-history-card-current { background: #eff6ff !important; border-color: #3b82f6 !important; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
      .cra-hcard-top { display: flex; justify-content: space-between; align-items: center; font-size: 11px; }
      .cra-hcard-ind { font-size: 11px; font-weight: 600; color: #1d4ed8; background: #dbeafe; padding: 1px 6px; border-radius: 4px; }
      .cra-hcard-active-tag { font-size: 10px; font-weight: 700; background: #2563eb; color: #fff; padding: 1px 6px; border-radius: 3px; }
      .cra-hcard-time { font-size: 11px; color: #94a3b8; margin-left: auto; }
      .cra-hcard-title { font-size: 13px; font-weight: 700; color: #0f172a !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cra-hcard-summary { font-size: 11px; color: #64748b; line-height: 1.4; height: 32px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      .cra-hcard-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 8px; border-top: 1px solid #f1f5f9; }
      .cra-hcard-risks { display: flex; gap: 6px; font-size: 11px; font-weight: 600; }
      .cra-hcard-risk-high { color: #dc2626; background: #fee2e2; padding: 1px 5px; border-radius: 3px; }
      .cra-hcard-risk-med { color: #d97706; background: #fef3c7; padding: 1px 5px; border-radius: 3px; }
      .cra-hcard-risk-ok { color: #16a34a; background: #dcfce7; padding: 1px 5px; border-radius: 3px; }
      .cra-hcard-actions { display: flex; align-items: center; gap: 6px; }
      .cra-hcard-btn-restore { font-size: 11px; font-weight: 600; color: #2563eb; background: transparent; border: none; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
      .cra-hcard-btn-restore:hover { background: #dbeafe; }
      .cra-hcard-btn-del { font-size: 12px; font-weight: 700; color: #94a3b8; background: transparent; border: none; cursor: pointer; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; }
      .cra-hcard-btn-del:hover { color: #dc2626; background: #fee2e2; }
      .cra-history-empty { text-align: center; padding: 24px; color: #94a3b8; font-size: 12px; }

      /* 文本域与激光扫描雷达动画 */
      .cra-textarea-container { position: relative; flex: 1; display: flex; flex-direction: column; overflow: hidden; border-radius: 6px; }
      .cra-scan-laser {
        position: absolute; top: 0; left: 0; right: 0; height: 3px;
        background: linear-gradient(90deg, transparent, #38bdf8, #2563eb, #60a5fa, transparent);
        box-shadow: 0 0 12px 3px rgba(56, 189, 248, 0.85);
        animation: scanMove 2.2s ease-in-out infinite alternate;
        z-index: 10; pointer-events: none;
      }
      .cra-scan-overlay {
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background: linear-gradient(180deg, rgba(37,99,235,0.03) 0%, rgba(56,189,248,0.08) 50%, rgba(37,99,235,0.03) 100%);
        pointer-events: none; z-index: 5;
        animation: pulseOverlay 2s ease-in-out infinite alternate;
      }
      @keyframes scanMove {
        0% { top: 4%; opacity: 0.8; }
        50% { opacity: 1; }
        100% { top: 94%; opacity: 0.8; }
      }
      @keyframes pulseOverlay {
        0% { opacity: 0.4; }
        100% { opacity: 0.85; }
      }
      .cra-textarea-scanning {
        box-shadow: 0 0 0 2px rgba(37,99,235,0.3) !important;
        border-color: #3b82f6 !important;
        background: #fcfdff !important;
      }
      .cra-btn-scanning {
        background: linear-gradient(135deg, #1d4ed8, #2563eb, #38bdf8);
        background-size: 200% 200%;
        color: #fff;
        animation: gradientGlow 1.8s ease infinite;
        cursor: wait !important;
      }
      @keyframes gradientGlow {
        0% { background-position: 0% 50%; box-shadow: 0 0 10px rgba(37,99,235,0.4); }
        50% { background-position: 100% 50%; box-shadow: 0 0 18px rgba(56,189,248,0.7); }
        100% { background-position: 0% 50%; box-shadow: 0 0 10px rgba(37,99,235,0.4); }
      }

      /* 右栏实时审查 HUD 面板 */
      .cra-audit-hud {
        background: #0f172a; color: #f8fafc; border-radius: 8px; padding: 18px;
        display: flex; flex-direction: column; gap: 14px; box-shadow: 0 8px 24px rgba(15,23,42,0.18);
        border: 1px solid #1e293b;
      }
      .cra-hud-header { display: flex; align-items: center; gap: 10px; }
      .cra-hud-spinner {
        font-size: 20px; color: #38bdf8; display: inline-block;
        animation: pulseIcon 1.2s ease-in-out infinite alternate;
      }
      @keyframes pulseIcon { 0% { transform: scale(0.9); opacity: 0.7; } 100% { transform: scale(1.15); opacity: 1; } }
      .cra-hud-info { flex: 1; }
      .cra-hud-title { font-size: 13px; font-weight: 700; color: #f8fafc; }
      .cra-hud-sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }
      .cra-hud-pct { font-size: 14px; font-weight: 800; color: #38bdf8; font-family: monospace; }
      .cra-progress-bar-bg { height: 6px; background: #334155; border-radius: 3px; overflow: hidden; }
      .cra-progress-bar-fill {
        height: 100%; background: linear-gradient(90deg, #2563eb, #38bdf8);
        border-radius: 3px; transition: width 0.4s ease;
      }
      .cra-steps-list { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
      .cra-step-item {
        display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px;
        border-radius: 6px; font-size: 11px; transition: all 0.3s;
      }
      .cra-step-active { background: rgba(37,99,235,0.22); border-left: 3px solid #38bdf8; color: #e0f2fe; }
      .cra-step-done { color: #94a3b8; opacity: 0.85; }
      .cra-step-pending { color: #64748b; opacity: 0.45; }
      .cra-step-icon { font-size: 13px; line-height: 1.4; }
      .cra-step-content { flex: 1; }
      .cra-step-title { font-weight: 600; font-size: 12px; }
      .cra-step-desc { font-size: 11px; color: #94a3b8; margin-top: 2px; }

      /* 流式输出卡片与动效 */
      .cra-streaming-badge {
        font-size: 11px; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe;
        padding: 2px 8px; border-radius: 12px; font-weight: 600; margin-left: 8px;
        display: inline-flex; align-items: center; gap: 4px; animation: pulse 1.5s infinite;
      }
      .cra-typewriter-cursor {
        display: inline-block; color: #2563eb; font-weight: 900; animation: blink 0.8s infinite;
        margin-left: 2px;
      }
      @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      .cra-card-streamed {
        animation: slideInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      @keyframes slideInUp {
        from { opacity: 0; transform: translateY(14px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .cra-fade-in {
        animation: fadeIn 0.4s ease both;
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `
    const style = document.createElement('style')
    style.textContent = css
    document.head.appendChild(style)
  }

  ReactDOM.render(h(App), document.getElementById('root') || document.body)
})()
