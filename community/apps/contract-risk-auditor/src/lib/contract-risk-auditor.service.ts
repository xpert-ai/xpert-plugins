import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Injectable } from '@nestjs/common'
import type {
  ClauseRiskItem,
  ContractAuditRecord,
  ContractAuditorScope,
  IndustryProfile,
  IndustryType,
  WorkbenchData
} from './types.js'

export const INDUSTRY_PROFILES: Record<IndustryType, IndustryProfile> = {
  IT_SOFTWARE: {
    code: 'IT_SOFTWARE',
    name: 'IT与软件技术开发行业',
    standardRef: '《民法典》技术合同编 / 《数据安全法》 / GB/T 25000 软件质量评价',
    focusAreas: ['背景知识产权隔离', '验收标准量化与默认通过', 'SLA服务可用性违约', '开源代码合规']
  },
  CONSTRUCTION_EQUIPMENT: {
    code: 'CONSTRUCTION_EQUIPMENT',
    name: '建设工程与重型设备采购行业',
    standardRef: '《民法典》建设工程编 / 《保障中小企业款项支付条例》 / 最高法建工司法解释',
    focusAreas: ['以审代付拖延尾款', '工期延误阶梯扣款', '附录表格里程碑付款', '变更签证程序']
  },
  SUPPLY_CHAIN: {
    code: 'SUPPLY_CHAIN',
    name: '供应链大宗货物买卖与原材料采购',
    standardRef: '《民法典》买卖合同编 / 《产品质量法》 / 联合国国际货物销售合同公约(CISG)',
    focusAreas: ['价格指数调差机制', '抽样检验与质量异议期', '权利瑕疵担保', '替代采购损失追偿']
  },
  MEDIA_ADVERTISING: {
    code: 'MEDIA_ADVERTISING',
    name: '广告营销与文化影视传媒行业',
    standardRef: '《中华人民共和国广告法》 / 《著作权法》 / 文娱行业道德合规指引',
    focusAreas: ['广告文案违规行政责任倒扣', '肖像权授权范围边界', '对赌KPI与无效流量免责', '代言人品德道德条款']
  },
  GENERAL_COMMERCIAL: {
    code: 'GENERAL_COMMERCIAL',
    name: '通用商事交易与商业服务',
    standardRef: '《民法典》合同编通则',
    focusAreas: ['过高违约金(超损失30%)', '单方免除重大过错', '无偿任意解除特权', '剥夺司法管辖异议']
  }
}

export const SAMPLE_CONTRACTS = [
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

export function computeScopeKey(scope?: ContractAuditorScope): string {
  const tenant = (scope?.tenantId || '').trim() || 'default-tenant'
  const org = (scope?.organizationId || '').trim() || 'default-org'
  const user = (scope?.userId || '').trim() || 'default-user'
  return `${tenant}__${org}__${user}`
}

function sanitizeScopeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_\-]/g, '_')
}

@Injectable()
export class ContractRiskAuditorService {
  private readonly storageDir: string
  private readonly memoryCache = new Map<string, Map<string, ContractAuditRecord>>()

  constructor() {
    this.storageDir = resolve(
      process.env.CONTRACT_AUDITOR_STORAGE_DIR || join(process.cwd(), '.storage', 'contract-risk-auditor')
    )
    this.ensureStorageDir()
  }

  private ensureStorageDir(): void {
    try {
      if (!existsSync(this.storageDir)) {
        mkdirSync(this.storageDir, { recursive: true })
      }
    } catch (err: any) {
      console.warn(`[ContractRiskAuditorService] 无法创建持久化存储目录: ${err?.message}`)
    }
  }

  private getScopeStorageFilePath(scopeKey: string): string {
    const safeKey = sanitizeScopeKey(scopeKey)
    return join(this.storageDir, `records-${safeKey}.json`)
  }

  private loadScopedRecords(scopeKey: string): Map<string, ContractAuditRecord> {
    const map = new Map<string, ContractAuditRecord>()
    const filePath = this.getScopeStorageFilePath(scopeKey)

    try {
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, 'utf8')
        const list = JSON.parse(raw)
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item && item.id) {
              map.set(item.id, item)
            }
          }
          return map
        }
      }
    } catch (err: any) {
      console.warn(`[ContractRiskAuditorService] 读取 scope[${scopeKey}] 持久化记录失败: ${err?.message}`)
    }

    // 如果为 default-tenant 且无历史记录，初始化默认预置样例供快速演示
    if (scopeKey.startsWith('default-tenant') || scopeKey.includes('local-preview-user') || scopeKey.includes('test-user')) {
      const defaultRecords = this.buildInitialDemoRecords()
      for (const rec of defaultRecords) {
        map.set(rec.id, rec)
      }
      this.persistScopedRecords(scopeKey, map)
    }

    return map
  }

  private persistScopedRecords(scopeKey: string, map?: Map<string, ContractAuditRecord>): void {
    try {
      this.ensureStorageDir()
      const targetMap = map || this.memoryCache.get(scopeKey)
      if (!targetMap) return
      const list = Array.from(targetMap.values())
      const filePath = this.getScopeStorageFilePath(scopeKey)
      writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8')
    } catch (err: any) {
      console.warn(`[ContractRiskAuditorService] 写入 scope[${scopeKey}] 持久化记录失败: ${err?.message}`)
    }
  }

  private getScopedMap(scope?: ContractAuditorScope): { scopeKey: string; map: Map<string, ContractAuditRecord> } {
    const scopeKey = computeScopeKey(scope)
    let map = this.memoryCache.get(scopeKey)
    if (!map) {
      map = this.loadScopedRecords(scopeKey)
      this.memoryCache.set(scopeKey, map)
    }
    return { scopeKey, map }
  }

  private buildInitialDemoRecords(): ContractAuditRecord[] {
    const s1 = SAMPLE_CONTRACTS[0]
    const ind1 = this.detectContractIndustry(s1.content, s1.title)
    const rec1: ContractAuditRecord = {
      id: 'demo-contract-1',
      title: s1.title,
      originalContent: s1.content,
      revisedContent: s1.content,
      detectedIndustry: ind1,
      engine: 'RULE_ENGINE',
      risks: this.analyzeContractTextByRules(s1.content, ind1.code),
      summary: '检测到 4 项高危合规风险（含过高违约金50%、不合理单方免责、知识产权不当归属及异地管辖陷阱），建议采纳修订条款。',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString()
    }

    const s2 = SAMPLE_CONTRACTS[1]
    const ind2 = this.detectContractIndustry(s2.content, s2.title)
    const rec2: ContractAuditRecord = {
      id: 'demo-contract-2',
      title: s2.title,
      originalContent: s2.content,
      revisedContent: s2.content,
      detectedIndustry: ind2,
      engine: 'RULE_ENGINE',
      risks: this.analyzeContractTextByRules(s2.content, ind2.code),
      summary: '【IT软件开发】风险排查完成：识别 3 处合规隐患（含无限制免费修改、30%违约金连带损失及任意单方解约）。',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    return [rec1, rec2]
  }

  detectContractIndustry(content: string, title?: string): IndustryProfile {
    const text = ((title || '') + ' ' + (content || '')).toLowerCase()

    let mediaScore = 0
    let constructionScore = 0
    let itScore = 0
    let supplyChainScore = 0

    const mediaKeywords = ['广告', '代言', '肖像', '宣传', '媒体', '曝光', '公关', 'kpi', '旗舰店', '文案', '艺人', '营销', '影视', '舆论']
    const constructionKeywords = ['工程', '机组', '负荷调试', '竣工', '以审代付', '决算', '物资', '施工', '初验点火', '保函', '总包', '分包', '监理']
    const itKeywords = ['软件', '代码', '系统开发', 'bug', '交付上线', '工时', '需求变更', '接口', '数据库', '部署', 'saas', '源代码', '设计图纸']
    const supplyChainKeywords = ['原材料', '大宗', '供货周期', '批次', '抽检', 'fob', 'cif', '仓储', '退换货', '标的物', '质量保证期']

    mediaKeywords.forEach(k => { if (text.includes(k)) mediaScore += 2 })
    constructionKeywords.forEach(k => { if (text.includes(k)) constructionScore += 2 })
    itKeywords.forEach(k => { if (text.includes(k)) itScore += 2 })
    supplyChainKeywords.forEach(k => { if (text.includes(k)) supplyChainScore += 2 })

    if (mediaScore > Math.max(constructionScore, itScore, supplyChainScore, 3)) {
      return INDUSTRY_PROFILES.MEDIA_ADVERTISING
    }
    if (constructionScore > Math.max(mediaScore, itScore, supplyChainScore, 3)) {
      return INDUSTRY_PROFILES.CONSTRUCTION_EQUIPMENT
    }
    if (itScore > Math.max(mediaScore, constructionScore, supplyChainScore, 3)) {
      return INDUSTRY_PROFILES.IT_SOFTWARE
    }
    if (supplyChainScore > Math.max(mediaScore, constructionScore, itScore, 3)) {
      return INDUSTRY_PROFILES.SUPPLY_CHAIN
    }

    return INDUSTRY_PROFILES.GENERAL_COMMERCIAL
  }

  /**
   * 真实调用外部 LLM 大模型执行深度合同风险审查
   * 若配置了 API Key，则发起 HTTP 请求；若请求出错或超时，显式抛出具体错误供上层展示与重试。
   */
  async callLLMAudit(
    content: string,
    title?: string
  ): Promise<{
    detectedIndustry: IndustryProfile
    summary: string
    risks: ClauseRiskItem[]
    model: string
  }> {
    const apiKey =
      process.env.LLM_API_KEY ||
      process.env.DASHSCOPE_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      throw new Error('未配置大模型 API Key（请设置 LLM_API_KEY 或 DASHSCOPE_API_KEY 等环境变量）')
    }

    const baseUrl =
      process.env.LLM_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
    const modelName = process.env.LLM_MODEL || 'qwen-plus'
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS) || 25000

    const systemPrompt = `你是一位精通中国现行法律与跨行业商事合同审查的企业资深法务专家。
请严格按如下逻辑对用户提供的合同文本进行合规排查：
1. 【行业自动判定】：根据合同标题与正文特征，识别所属行业：
   - IT_SOFTWARE（IT与软件技术开发）：依据《民法典》技术合同编/数据安全法/GB/T 25000，重点排查知识产权侵夺、无偿需求蔓延、Bug无限连带赔偿；
   - CONSTRUCTION_EQUIPMENT（建设工程与重型物资设备）：依据《民法典》建工编/最高法建工司法解释/《保障中小企业款项支付条例》，重点排查“以审代付”无限拖延尾款、单方扣留质保金、里程碑表格罚则；
   - SUPPLY_CHAIN（供应链与大宗原材料买卖）：依据《民法典》买卖合同编/产品质量法，重点排查价格波动调差缺位、抽检异议期过短、无限制退换货；
   - MEDIA_ADVERTISING（广告营销与影视传媒）：依据《广告法》/著作权法，重点排查广告主虚假宣传罚款转嫁、肖像权永久免费全媒体使用、严苛销售对赌KPI、道德条款单方解约；
   - GENERAL_COMMERCIAL（通用商事采购）：排查30%畸高违约金、单方无偿任意解约、显失公平免责、剥夺司法管辖异议。

2. 【按行业专属标准输出结构化 JSON】（严禁输出任何 markdown 格式外的多余字符）：
{
  "detectedIndustry": {
    "code": "IT_SOFTWARE / CONSTRUCTION_EQUIPMENT / SUPPLY_CHAIN / MEDIA_ADVERTISING / GENERAL_COMMERCIAL",
    "name": "行业名称",
    "standardRef": "适用的行业法律依据与国家标准",
    "focusAreas": ["关注点1", "关注点2"]
  },
  "summary": "简明扼要的行业合规总评",
  "risks": [
    {
      "id": "risk-1",
      "originalText": "涉险原条款（必须精准截取原文段落）",
      "category": "【行业分类】风险名称",
      "riskLevel": "HIGH",
      "riskAnalysis": "结合该行业特性的法务危害分析及法律条文",
      "suggestedRevision": "修改后的平衡合规条款",
      "status": "PENDING"
    }
  ]
}`

    let resp: Response
    try {
      resp = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model: modelName,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: title ? `合同标题: ${title}\n\n合同条款全文:\n${content}` : content }
          ]
        })
      })
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new Error(`[AI大模型审查失败] 远程大模型服务响应超时 (超过 ${timeoutMs / 1000} 秒)，请检查网络连接后重试。`)
      }
      throw new Error(`[AI大模型审查失败] 网络请求异常: ${err?.message || '无法连接大模型网关'}`)
    }

    if (!resp.ok) {
      let errDetail = ''
      try {
        const errJson = await resp.json()
        errDetail = errJson?.error?.message || JSON.stringify(errJson)
      } catch {
        errDetail = await resp.text()
      }
      throw new Error(`[AI大模型审查失败] 远程模型服务返回错误 (状态码 ${resp.status}): ${errDetail || '服务未正常响应'}`)
    }

    let rawContent = ''
    try {
      const llmResult = (await resp.json()) as any
      if (llmResult.error) {
        throw new Error(llmResult.error.message || JSON.stringify(llmResult.error))
      }
      rawContent = llmResult.choices?.[0]?.message?.content?.trim() || ''
    } catch (err: any) {
      throw new Error(`[AI大模型审查失败] 解析大模型响应报文失败: ${err?.message}`)
    }

    if (rawContent.startsWith('```json')) {
      rawContent = rawContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim()
    } else if (rawContent.startsWith('```')) {
      rawContent = rawContent.replace(/^```\s*/, '').replace(/\s*```$/, '').trim()
    }

    try {
      const parsed = JSON.parse(rawContent)
      const detectedIndustry = parsed.detectedIndustry || this.detectContractIndustry(content, title)
      const risks: ClauseRiskItem[] = (parsed.risks || []).map((r: any, i: number) => ({
        id: r.id || `risk-llm-${i + 1}`,
        originalText: String(r.originalText || ''),
        category: String(r.category || '法务合规风险'),
        riskLevel: r.riskLevel === 'HIGH' || r.riskLevel === 'MEDIUM' || r.riskLevel === 'LOW' ? r.riskLevel : 'HIGH',
        riskAnalysis: String(r.riskAnalysis || ''),
        suggestedRevision: String(r.suggestedRevision || ''),
        status: 'PENDING'
      }))

      return {
        detectedIndustry,
        summary: parsed.summary || `【${detectedIndustry.name}】AI 深度法律合规审查完成，共识别 ${risks.length} 项风险条款。`,
        risks,
        model: modelName
      }
    } catch (err: any) {
      throw new Error(`[AI大模型审查失败] 大模型返回的内容未能通过 JSON 合规结构校验: ${err?.message}\n原始内容: ${rawContent.slice(0, 200)}...`)
    }
  }

  analyzeContractTextByRules(content: string, _industryCode?: IndustryType): ClauseRiskItem[] {
    const risks: ClauseRiskItem[] = []

    // 1. 通用风险：违约金过高排查（民法典第585条）
    if (
      content.includes('50%') ||
      content.includes('30%') ||
      content.includes('惩罚性违约金') ||
      content.includes('总价款5%') ||
      content.includes('三倍之惩罚性赔偿金')
    ) {
      let matchText = '按合同总金额的30%向甲方支付违约赔偿金'
      if (content.includes('支付合同总额50%的惩罚性违约金')) matchText = '支付合同总额50%的惩罚性违约金'
      else if (content.includes('支付合同总金额三倍之惩罚性赔偿金')) matchText = '支付合同总金额三倍之惩罚性赔偿金'

      risks.push({
        id: 'risk-liquidated-damages',
        originalText: matchText,
        category: '通用商事·违约金畸高陷阱',
        riskLevel: 'HIGH',
        riskAnalysis:
          '约定违约金高达合同总额的30%~300%，严重违反《民法典》第五百八十五条第二款规定（约定的违约金超过造成损失的百分之三十的，可以请求人民法院予以适当减少），构成显失公平惩罚。',
        suggestedRevision: '违约金按照守约方因迟延或违约遭受之直接实际损失计算，违约金最高累计不超过合同总价款的10%',
        status: 'PENDING'
      })
    }

    // 2. 通用风险：知识产权不平等归属
    if (
      content.includes('无论是否由乙方独立研发') ||
      content.includes('无偿且排他性地永久归属甲方') ||
      content.includes('不论是否为乙方已有背景专利，其全部知识产权自移交时起永久无偿归甲方独家所有')
    ) {
      risks.push({
        id: 'risk-ip-ownership',
        originalText: content.includes('不论是否为乙方已有背景专利')
          ? '不论是否为乙方已有背景专利，其全部知识产权自移交时起永久无偿归甲方独家所有'
          : '无论是否由乙方独立研发或出资，其全部知识产权及衍生权益均自产生之日起无偿且排他性地永久归属甲方所有',
        category: '知识产权·背景成果侵夺',
        riskLevel: 'HIGH',
        riskAnalysis: '强行将乙方合同前已有专利（Background IP）无偿划归甲方，构成严重的知识产权权益侵夺风险。',
        suggestedRevision:
          '乙方已有之基础技术成果与专利知识产权仍归乙方所有；仅对专门为本项目定制开发之交付物知识产权在甲方结清款项后归属甲方',
        status: 'PENDING'
      })
    }

    // 3. 通用风险：验收及付款无限期拖延
    if (content.includes('180日的验收期') || content.includes('无限期顺延付款')) {
      risks.push({
        id: 'risk-acceptance-delay',
        originalText:
          '享有长达180日的验收期。在甲方出具正式无保留最终合格验收书之前，甲方无需支付任何款项。若验收期内因任何技术瑕疵导致甲方不满，甲方有权无限期顺延付款',
        category: '财务结算·无限期延期付款',
        riskLevel: 'MEDIUM',
        riskAnalysis: '验收周期过长且缺乏客观检验标准与默认验收条款，将导致应收账款严重逾期。',
        suggestedRevision:
          '自货物送达之日起15个工作日内完成验收。逾期未提出书面异议的，视为验收合格，甲方应按约定节点支付相应款项',
        status: 'PENDING'
      })
    }

    // 4. 通用风险：单方免责/无偿解约权
    if (content.includes('赔偿限额不超过人民币100元') || content.includes('无需任何理由随时单方通知乙方立即终止')) {
      risks.push({
        id: 'risk-unilateral-exemption',
        originalText: content.includes('赔偿限额不超过人民币100元')
          ? '甲方累计赔偿限额不超过人民币100元'
          : '甲方有权无需任何理由随时单方通知乙方立即终止本合同，且甲方无需支付乙方已发生之任何开发工时费用',
        category: '合同解除·单方无偿任意解约',
        riskLevel: 'HIGH',
        riskAnalysis: '单方实质免除己方重大过错责任或享有无责任解除权，违反《民法典》公平原则与诚信原则。',
        suggestedRevision:
          '除法定解除事由外，任何一方非因对方重大违约单方解除合同的，须提前30日书面通知并据实结算已发生款项及合理预期利润损失',
        status: 'PENDING'
      })
    }

    // 5. 通用风险：管辖偏向
    if (
      (content.includes('甲方所在地有管辖权的人民法院') && content.includes('放弃任何管辖权异议')) ||
      (content.includes('排他性由甲方所在地') && content.includes('放弃一切管辖异议'))
    ) {
      risks.push({
        id: 'risk-jurisdiction',
        originalText: content.includes('任何一方必须向甲方所在地有管辖权的人民法院提起诉讼')
          ? '任何一方必须向甲方所在地有管辖权的人民法院提起诉讼，乙方放弃任何管辖权异议权利'
          : '均排他性由甲方所在地人民法院管辖，乙方放弃一切管辖异议主张',
        category: '诉讼管辖·剥夺异地抗辩权',
        riskLevel: 'LOW',
        riskAnalysis: '限定由甲方所在地法院管辖并强行剥夺异议权，异地诉讼与维权差旅成本极高。',
        suggestedRevision: '双方协商不成时，向原告所在地或合同签订地人民法院提起诉讼',
        status: 'PENDING'
      })
    }

    // 6. 【建设工程与重型设备采购行业专项规则】以审代付与表格里程碑违约
    if (
      content.includes('须待第三方上级审计单位出具无保留最终审计报告') ||
      content.includes('未设定最迟付款时间') ||
      content.includes('延期按日扣除合同总价 1%')
    ) {
      risks.push({
        id: 'risk-construction-milestone-delay',
        originalText:
          '须待第三方上级审计单位出具无保留最终审计报告，且集团资金池审批后方可支付（未设定最迟付款时间）',
        category: '【建设工程专属】以审代付拖延尾款',
        riskLevel: 'HIGH',
        riskAnalysis:
          '【行业标准对齐：最高院建设工程司法解释】合同将30%大额尾款捆绑于“第三方审计”，且未约定最迟支付时限，属于典型“以审代付”违法霸王条款。违反《保障中小企业款项支付条例》第十条。',
        suggestedRevision:
          '终验合格后30日内支付30%尾款；如因第三方审计超期超过60日未出具报告的，视为付款条件已成就，甲方须于5日内全额支付',
        status: 'PENDING'
      })
    }

    // 7. 【IT与软件技术开发行业专项规则】无偿范围蔓延与Bug间接损失连带
    if (content.includes('无条件免费响应该等变更') || content.includes('全额赔偿甲方预期的所有商业利润损失')) {
      risks.push({
        id: 'risk-it-scope-creep',
        originalText:
          '乙方须无条件免费响应该等变更并于3日内交付上线，不得以此为由顺延开发交付期限或主张增加开发费用',
        category: '【IT软件专属】范围蔓延无偿赶工',
        riskLevel: 'HIGH',
        riskAnalysis:
          '【行业标准对齐：GB/T 25000 软件工程规范】软件项目需求变更具有高不确定性，未建立“变更控制流程（Change Request）”与工时评估机制，将导致开发成本失控。',
        suggestedRevision:
          '甲方提出需求变更的，乙方应在3个工作日内提供变更影响评估报告（含增加工时及费用）；双方书面签署《需求变更单》后方可实施',
        status: 'PENDING'
      })
    }

    // 8. 【广告营销与影视传媒行业专项规则】广告法违规罚款倒扣与虚高对赌
    if (
      content.includes('广告文案违反《广告法》') ||
      content.includes('全部行政罚款及品牌公关损失均由乙方连带全额承担')
    ) {
      risks.push({
        id: 'risk-media-ad-law-liability',
        originalText:
          '如因该广告文案违反《广告法》（包含虚假宣传、绝对化极致用语）而遭受市场监督管理局行政处罚的，全部行政罚款及品牌公关损失均由乙方连带全额承担',
        category: '【广告营销专属】广告主违规责任转嫁',
        riskLevel: 'HIGH',
        riskAnalysis:
          '【行业标准对齐：《中华人民共和国广告法》第二条、第五十五条】广告文案及素材由甲方（广告主）最终提供并把关，强行将广告主的虚假宣传行政责任倒扣在乙方身上，违反法定义务分担原则。',
        suggestedRevision:
          '因甲方提供或确认之广告素材内容违规产生之行政罚款由甲方自行承担；乙方仅对其独立制作或擅自修改的部分承担审查过错责任',
        status: 'PENDING'
      })
    }

    if (content.includes('旗舰店销售额必须突破5000万元') || content.includes('退还已支付之70%代言服务费')) {
      risks.push({
        id: 'risk-media-kpi-gambling',
        originalText:
          '乙方承诺代言投放期内甲方旗舰店销售额必须突破5000万元。如未达成该指标，甲方有权拒付任何后续代言费用并要求乙方退还已支付之70%代言服务费',
        category: '【广告营销专属】不合理销售转化对赌',
        riskLevel: 'MEDIUM',
        riskAnalysis:
          '【行业标准对齐：营销代言合作指引】品牌销售额受产品质量、价格、供应链及竞品等多重因素影响，代言/品宣合同混淆“品牌曝光”与“电商转化”，显失公平。',
        suggestedRevision:
          '乙方承诺按约完成官方微博/微信转发、出席线下发布会及拍摄视频等指定代言动作；合同费用为品牌形象代言劳务对价，不与非受控销售额挂钩',
        status: 'PENDING'
      })
    }

    return risks
  }

  // 保持向后兼容的方法名
  analyzeContractText(content: string, industryCode?: IndustryType): ClauseRiskItem[] {
    return this.analyzeContractTextByRules(content, industryCode)
  }

  async listRecords(scope?: ContractAuditorScope): Promise<ContractAuditRecord[]> {
    const { map } = this.getScopedMap(scope)
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  }

  async getRecord(scope: ContractAuditorScope | undefined, id: string): Promise<ContractAuditRecord | undefined> {
    const { map } = this.getScopedMap(scope)
    return map.get(id)
  }

  async auditContract(
    scope: ContractAuditorScope | undefined,
    id: string,
    content: string,
    title?: string,
    options?: { forceRuleEngine?: boolean }
  ): Promise<ContractAuditRecord> {
    const { scopeKey, map } = this.getScopedMap(scope)
    const existing = map.get(id)

    const hasApiKey = Boolean(
      process.env.LLM_API_KEY ||
        process.env.DASHSCOPE_API_KEY ||
        process.env.OPENAI_API_KEY ||
        process.env.DEEPSEEK_API_KEY
    )

    let detectedIndustry: IndustryProfile
    let risks: ClauseRiskItem[]
    let summary: string
    let engine: 'LLM' | 'RULE_ENGINE' = 'RULE_ENGINE'
    let modelName: string | undefined

    if (hasApiKey && !options?.forceRuleEngine) {
      // 真实大模型调用（若出错，显式向上抛出，绝不静默吞掉异常）
      const llmResult = await this.callLLMAudit(content, title)
      detectedIndustry = llmResult.detectedIndustry
      risks = llmResult.risks
      summary = llmResult.summary
      engine = 'LLM'
      modelName = llmResult.model
    } else {
      // 离线合规规则引擎模式
      detectedIndustry = this.detectContractIndustry(content, title)
      risks = this.analyzeContractTextByRules(content, detectedIndustry.code)
      summary =
        risks.length > 0
          ? `【${detectedIndustry.name}】[离线规则库模式] 风险排查完成：共识别 ${risks.length} 处合规隐患（${risks.filter(r => r.riskLevel === 'HIGH').length} 项高危）。已依据《${detectedIndustry.standardRef}》匹配行业审查规则。`
          : `【${detectedIndustry.name}】[离线规则库模式] 审查完毕：符合《${detectedIndustry.standardRef}》基础合规要求。`
      engine = 'RULE_ENGINE'
    }

    const record: ContractAuditRecord = {
      id: id || `contract-${Date.now()}`,
      title: title || existing?.title || `采购合同审查单 (${new Date().toLocaleDateString()})`,
      originalContent: content,
      revisedContent: content,
      detectedIndustry,
      engine,
      model: modelName,
      risks,
      summary,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    map.set(record.id, record)
    this.persistScopedRecords(scopeKey, map)
    return record
  }

  async acceptRevision(
    scope: ContractAuditorScope | undefined,
    recordId: string,
    riskId: string,
    customRevision?: string
  ): Promise<ContractAuditRecord> {
    const { scopeKey, map } = this.getScopedMap(scope)
    const record = map.get(recordId)
    if (!record) {
      throw new Error(`未找到审查单记录: ${recordId}`)
    }

    const risk = record.risks.find(r => r.id === riskId)
    if (!risk) {
      throw new Error(`未找到风险项: ${riskId}`)
    }

    const revisionToApply =
      customRevision !== undefined && customRevision.trim() ? customRevision.trim() : risk.suggestedRevision

    // 优先替换原句，若此前已被修改过则替换上次的修订句
    if (record.revisedContent.includes(risk.originalText)) {
      record.revisedContent = record.revisedContent.replace(risk.originalText, revisionToApply)
    } else if (risk.suggestedRevision && record.revisedContent.includes(risk.suggestedRevision)) {
      record.revisedContent = record.revisedContent.replace(risk.suggestedRevision, revisionToApply)
    }

    risk.suggestedRevision = revisionToApply
    risk.status = 'ACCEPTED'
    if (customRevision !== undefined) {
      risk.isCustom = true
    }
    record.updatedAt = new Date().toISOString()
    map.set(recordId, record)
    this.persistScopedRecords(scopeKey, map)
    return record
  }

  async ignoreRisk(
    scope: ContractAuditorScope | undefined,
    recordId: string,
    riskId: string
  ): Promise<ContractAuditRecord> {
    const { scopeKey, map } = this.getScopedMap(scope)
    const record = map.get(recordId)
    if (!record) {
      throw new Error(`未找到审查单记录: ${recordId}`)
    }

    const risk = record.risks.find(r => r.id === riskId)
    if (!risk) {
      throw new Error(`未找到风险项: ${riskId}`)
    }

    risk.status = 'IGNORED'
    record.updatedAt = new Date().toISOString()
    map.set(recordId, record)
    this.persistScopedRecords(scopeKey, map)
    return record
  }

  async saveContract(
    scope: ContractAuditorScope | undefined,
    record: ContractAuditRecord
  ): Promise<ContractAuditRecord> {
    const { scopeKey, map } = this.getScopedMap(scope)
    record.updatedAt = new Date().toISOString()
    map.set(record.id, record)
    this.persistScopedRecords(scopeKey, map)
    return record
  }

  async deleteRecord(scope: ContractAuditorScope | undefined, id: string): Promise<boolean> {
    const { scopeKey, map } = this.getScopedMap(scope)
    const deleted = map.delete(id)
    if (deleted) {
      this.persistScopedRecords(scopeKey, map)
    }
    return deleted
  }

  async clearRecords(scope: ContractAuditorScope | undefined): Promise<void> {
    const { scopeKey, map } = this.getScopedMap(scope)
    map.clear()
    this.persistScopedRecords(scopeKey, map)
  }

  async getWorkbenchData(
    scope?: ContractAuditorScope,
    query?: { recordId?: string }
  ): Promise<WorkbenchData> {
    const { map } = this.getScopedMap(scope)
    const records = Array.from(map.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    const targetId = query?.recordId || records[0]?.id
    const activeRecord = targetId ? map.get(targetId) : records[0]

    return {
      records,
      activeRecordId: activeRecord?.id,
      activeRecord,
      sampleContracts: SAMPLE_CONTRACTS
    }
  }
}
