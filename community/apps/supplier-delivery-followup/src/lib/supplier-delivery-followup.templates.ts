import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { DELIVERY_FEATURE, DELIVERY_TEMPLATE_KEY, PLUGIN_NAME } from './constants'

export const deliveryTargetAppMeta = {
  'data-xpert': {
    types: ['business-assistant', 'workbench-view'],
    capabilities: [DELIVERY_FEATURE],
    requiredPlugins: [PLUGIN_NAME]
  },
  xpert: {
    types: ['assistant-template', 'workbench-view'],
    capabilities: [DELIVERY_FEATURE],
    requiredPlugins: [PLUGIN_NAME]
  }
}

// Both src/lib and dist/lib resolve the adjacent packaged YAML; no cwd fallback can mask a missing asset.
export const supplierDeliveryTemplates: XpertTemplateContribution[] = [
  {
    key: DELIVERY_TEMPLATE_KEY,
    name: 'Supplier Delivery Follow-up Assistant',
    title: '供应商交期跟单助手',
    description: '从供应商回复中提取带原文出处的交期提议，交由跟单员审核。',
    category: 'Procurement',
    type: XpertTypeEnum.Agent,
    targetApps: ['xpert', 'data-xpert'],
    targetAppMeta: deliveryTargetAppMeta,
    dependencies: { plugins: [PLUGIN_NAME] },
    dslContent: readFileSync(join(__dirname, '..', 'xpert-supplier-delivery-followup-assistant.yaml'), 'utf8'),
    startPrompts: [
      '请查找 DEMO-001 的订单行和当前承诺交期。',
      '我收到供应商延期回复，请指导我在工作台保存并发起解析。',
      '供应商只说尽快安排，请指导我记录回复并跟进明确交期。'
    ],
    order: 50,
    default: false,
    xpertName: '供应商交期跟单助手',
    releaseNotes: '五个交期解析工具与人工审核边界；使用平台默认主模型。'
  }
]
