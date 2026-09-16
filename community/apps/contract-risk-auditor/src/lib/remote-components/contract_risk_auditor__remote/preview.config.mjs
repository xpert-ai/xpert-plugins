import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ContractRiskAuditorService, SAMPLE_CONTRACTS } from '../../../../dist/lib/contract-risk-auditor.service.js'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(componentRoot, '../../../..')
const service = new ContractRiskAuditorService()
const mockScope = { userId: 'local-preview-user', tenantId: 'local-tenant' }

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
    if (message.type === 'view.data') {
      const data = await service.getWorkbenchData(mockScope)
      return { data }
    }

    if (message.type === 'view.action') {
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
              body: JSON.stringify({
                model: modelName,
                response_format: { type: 'json_object' },
                messages: [
                  {
                    role: 'system',
                    content: `你是一位精通《民法典》的专业法务合同审查专家。请审查合同文本并按如下 JSON 格式返回霸王条款与风险：
{
  "summary": "一段简明的合规评估总结",
  "risks": [
    {
      "id": "risk-1",
      "originalText": "合同中涉险的原句",
      "category": "违约金责任过重/知识产权归属/付款验收/单方免责/管辖不利",
      "riskLevel": "HIGH",
      "riskAnalysis": "法务原因分析及法律依据",
      "suggestedRevision": "建议修订为平衡合理的条款",
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
            console.log(`[AI 审查] 真实大模型调用成功，识别到 ${parsed.risks?.length || 0} 项风险`)
            const record = {
              id: input.id || `contract-${Date.now()}`,
              title: input.title || `采购合同审查单 (${new Date().toLocaleDateString()})`,
              originalContent: input.content,
              revisedContent: input.content,
              risks: (parsed.risks || []).map((r, i) => Object.assign({ id: r.id || `risk-${i+1}`, status: 'PENDING' }, r)),
              summary: parsed.summary || '真实 AI 审查完成',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
            await service.saveContract(mockScope, record)
            return { result: { success: true, data: record } }
          } catch (err) {
            console.warn('真实大模型调用异常，fallback 到本地语义引擎:', err.message)
          }
        }

        const record = await service.auditContract(mockScope, input.id || '', input.content, input.title)
        return { result: { success: true, data: record } }
      }

      if (actionKey === 'accept_revision') {
        const record = await service.acceptRevision(mockScope, input.recordId, input.riskId)
        return { result: { success: true, data: record } }
      }

      if (actionKey === 'ignore_risk') {
        const record = await service.ignoreRisk(mockScope, input.recordId, input.riskId)
        return { result: { success: true, data: record } }
      }

      if (actionKey === 'save_contract') {
        const record = await service.saveContract(mockScope, input.record)
        return { result: { success: true, data: record } }
      }

      return { result: { success: false, message: '未知的操作' } }
    }

    throw new Error(`Unsupported preview request '${message.type}'`)
  }
}
