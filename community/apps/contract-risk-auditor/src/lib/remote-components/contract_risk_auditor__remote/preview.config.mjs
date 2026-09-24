import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ContractRiskAuditorService, SAMPLE_CONTRACTS } from '../../../../dist/lib/contract-risk-auditor.service.js'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(componentRoot, '../../../..')
const storageDir = resolve(pluginRoot, '.storage')
const storageFile = resolve(storageDir, 'preview-records.json')
const service = new ContractRiskAuditorService()
const mockScope = { userId: 'local-preview-user', tenantId: 'local-tenant' }

function loadPersistedRecords() {
  try {
    if (existsSync(storageFile)) {
      const raw = readFileSync(storageFile, 'utf8')
      const list = JSON.parse(raw)
      if (Array.isArray(list) && list.length > 0) {
        for (const rec of list) {
          service.records.set(rec.id, rec)
        }
        console.log(`[Storage] 成功从本地磁盘文件载入 ${list.length} 条历史审查单 (${storageFile})`)
        return
      }
    }
  } catch (err) {
    console.warn('[Storage] 读取历史记录失败:', err.message)
  }
  persistRecords()
}

function persistRecords() {
  try {
    if (!existsSync(storageDir)) {
      mkdirSync(storageDir, { recursive: true })
    }
    const list = Array.from(service.records.values())
    writeFileSync(storageFile, JSON.stringify(list, null, 2), 'utf8')
    console.log(`[Storage] 已持久化同步 ${list.length} 条审查单至本地磁盘`)
  } catch (err) {
    console.warn('[Storage] 写入持久化记录失败:', err.message)
  }
}

loadPersistedRecords()

export default {
  title: '商务采购合同智能合规排查工作台 · 本地预览',
  workspaceRoot: pluginRoot,
  instanceId: 'contract-risk-auditor-preview-instance',
  component: {
    root: componentRoot,
    runtime: 'react'
  },
  hostContext: {
    manifest: { key: 'contract-risk-auditor.workbench' },
    payload: {},
    initialQuery: { page: 1, pageSize: 20, parameters: {} },
    locale: 'zh-CN',
    theme: {
      mode: 'light',
      primaryColor: '#2563eb'
    }
  },
  state: {
    sampleContracts: SAMPLE_CONTRACTS,
    records: []
  },
  async handleRequest(message, { state, events }) {
    if (message.type === 'view.data' || message.type === 'requestData') {
      const data = await service.getWorkbenchData(mockScope)
      return { data }
    }

    if (message.type === 'view.action' || message.type === 'executeAction') {
      const { actionKey, input } = message

      if (actionKey === 'audit_contract') {
        // 如果环境变量存在真实大模型 API Key，并且有配置
        const apiKey = process.env.LLM_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY
        if (apiKey) {
          try {
            const baseUrl = process.env.LLM_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
            const modelName = process.env.LLM_MODEL || 'qwen-plus'
            console.log(`[AI 审查] 正在调用真实大模型: ${modelName} (${baseUrl})...`)
            const resp = await fetch(baseUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              signal: AbortSignal.timeout(12000),
              body: JSON.stringify({
                model: modelName,
                response_format: { type: 'json_object' },
                messages: [
                  {
                    role: 'system',
                    content: `你是一位精通中国现行法律与跨行业合同审查的顶级企业法务专家。
请严格按如下逻辑进行审查：
1. 【行业自动判定】：根据合同标题与正文特征，自动识别所属行业：
   - IT_SOFTWARE（IT与软件技术开发）：依据《民法典》技术合同编/数据安全法/GB/T 25000，重点排查知识产权侵夺(已有专利与源代码)、无偿范围蔓延赶工、Bug无限连带赔偿；
   - CONSTRUCTION_EQUIPMENT（建设工程与重型物资设备）：依据《民法典》建工编/最高法司法解释/《保障中小企业款项支付条例》，重点排查“以审代付”无限拖延尾款、单方扣留质保金、附录里程碑表格罚则；
   - SUPPLY_CHAIN（供应链与大宗原材料买卖）：依据《民法典》买卖合同编/产品质量法，重点排查价格波动调差缺位、抽检异议期过短、无限制退换货；
   - MEDIA_ADVERTISING（广告营销与影视传媒）：依据《广告法》/著作权法，重点排查广告主虚假宣传罚款转嫁、肖像权永久免费全媒体使用、严苛销售对赌KPI、道德条款单方解约；
   - GENERAL_COMMERCIAL（通用商事采购）：排查30%畸高违约金、单方无偿任意解约、显失公平免责、剥夺司法管辖异议。

2. 【按行业专属标准输出结构化 JSON】（禁止输出任何 markdown 代码块外的多余字符）：
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
                  },
                  { role: 'user', content: input.content }
                ]
              })
            })

            const llmResult = await resp.json()
            if (llmResult.error) {
              throw new Error(`大模型接口返回错误: ${llmResult.error.message || JSON.stringify(llmResult.error)}`)
            }
            let rawContent = llmResult.choices[0].message.content.trim()
            if (rawContent.startsWith('```json')) {
              rawContent = rawContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim()
            } else if (rawContent.startsWith('```')) {
              rawContent = rawContent.replace(/^```\s*/, '').replace(/\s*```$/, '').trim()
            }
            const parsed = JSON.parse(rawContent)
            const detectedIndustry = parsed.detectedIndustry || service.detectContractIndustry(input.content, input.title)
            console.log(`[AI 审查] 真实大模型调用成功，识别行业: ${detectedIndustry.name}，发现 ${parsed.risks?.length || 0} 项行业风险`)
            const record = {
              id: input.id || `contract-${Date.now()}`,
              title: input.title || `采购合同审查单 (${new Date().toLocaleDateString()})`,
              originalContent: input.content,
              revisedContent: input.content,
              detectedIndustry,
              risks: (parsed.risks || []).map((r, i) => Object.assign({ id: r.id || `risk-${i+1}`, status: 'PENDING' }, r)),
              summary: parsed.summary || `【${detectedIndustry.name}】AI 深度审查完成`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
            await service.saveContract(mockScope, record)
            persistRecords()
            return { data: record, result: { success: true, data: record } }
          } catch (err) {
            console.warn('真实大模型调用异常，fallback 到本地语义引擎:', err.message)
          }
        }

        const record = await service.auditContract(mockScope, input.id || '', input.content, input.title)
        persistRecords()
        return { data: record, result: { success: true, data: record } }
      }

      if (actionKey === 'accept_revision') {
        const record = await service.acceptRevision(mockScope, input.recordId, input.riskId, input.customRevision)
        persistRecords()
        return { data: record, result: { success: true, data: record } }
      }

      if (actionKey === 'ignore_risk') {
        const record = await service.ignoreRisk(mockScope, input.recordId, input.riskId)
        persistRecords()
        return { data: record, result: { success: true, data: record } }
      }

      if (actionKey === 'save_contract') {
        const record = await service.saveContract(mockScope, input.record)
        persistRecords()
        return { data: record, result: { success: true, data: record } }
      }

      if (actionKey === 'delete_record') {
        await service.deleteRecord(mockScope, input.recordId)
        persistRecords()
        const records = await service.listRecords(mockScope)
        return { data: { success: true, records }, result: { success: true, records } }
      }

      if (actionKey === 'clear_records') {
        await service.clearRecords(mockScope)
        persistRecords()
        return { data: { success: true, records: [] }, result: { success: true, records: [] } }
      }

      return { result: { success: false, message: '未知的操作' } }
    }

    throw new Error(`Unsupported preview request '${message.type}'`)
  }
}
