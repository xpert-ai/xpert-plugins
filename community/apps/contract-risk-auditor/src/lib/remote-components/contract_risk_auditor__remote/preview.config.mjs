import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ContractRiskAuditorService, SAMPLE_CONTRACTS } from '../../../../dist/lib/contract-risk-auditor.service.js'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(componentRoot, '../../../..')
const service = new ContractRiskAuditorService()
const mockScope = { userId: 'local-preview-user', tenantId: 'local-tenant', organizationId: 'local-org' }

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
        try {
          const record = await service.auditContract(mockScope, input.id || '', input.content, input.title)
          return { data: record, result: { success: true, data: record } }
        } catch (err) {
          return { result: { success: false, message: err.message || '审查失败' }, error: err.message }
        }
      }

      if (actionKey === 'accept_revision') {
        try {
          const record = await service.acceptRevision(mockScope, input.recordId, input.riskId, input.customRevision)
          return { data: record, result: { success: true, data: record } }
        } catch (err) {
          return { result: { success: false, message: err.message || '采纳修订失败' }, error: err.message }
        }
      }

      if (actionKey === 'ignore_risk') {
        try {
          const record = await service.ignoreRisk(mockScope, input.recordId, input.riskId)
          return { data: record, result: { success: true, data: record } }
        } catch (err) {
          return { result: { success: false, message: err.message || '忽略风险失败' }, error: err.message }
        }
      }

      if (actionKey === 'save_contract') {
        try {
          const record = await service.saveContract(mockScope, input.record)
          return { data: record, result: { success: true, data: record } }
        } catch (err) {
          return { result: { success: false, message: err.message || '保存合同失败' }, error: err.message }
        }
      }

      if (actionKey === 'delete_record') {
        try {
          await service.deleteRecord(mockScope, input.recordId)
          const records = await service.listRecords(mockScope)
          return { data: { success: true, records }, result: { success: true, records } }
        } catch (err) {
          return { result: { success: false, message: err.message || '删除记录失败' }, error: err.message }
        }
      }

      if (actionKey === 'clear_records') {
        try {
          await service.clearRecords(mockScope)
          return { data: { success: true, records: [] }, result: { success: true, records: [] } }
        } catch (err) {
          return { result: { success: false, message: err.message || '清空记录失败' }, error: err.message }
        }
      }

      return { result: { success: false, message: '未知的操作' } }
    }

    throw new Error(`Unsupported preview request '${message.type}'`)
  }
}
