import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { FEATURE_KEY, PLUGIN_NAME, TEMPLATE_PROVIDER_KEY, VIEW_KEY, VIEW_PROVIDER_KEY } from './constants.js'

const here = dirname(fileURLToPath(import.meta.url))
function readDsl() {
  const candidates = [join(here, '..', 'support-ticket-triage-assistant.yaml'), join(here, 'support-ticket-triage-assistant.yaml')]
  const found = candidates.find(existsSync)
  if (!found) throw new Error(`Assistant template not found: ${candidates.join(', ')}`)
  return readFileSync(found, 'utf8')
}

export const supportTicketTemplates: XpertTemplateContribution[] = [{
  key: 'support-ticket-triage-assistant',
  name: 'Support Ticket Triage Assistant',
  title: '售后工单分诊助手',
  description: '对工单进行 AI 分类、优先级判断和回复草拟，并由人工确认后完成闭环。',
  category: 'Customer Support',
  type: XpertTypeEnum.Agent,
  targetApps: ['data-xpert'],
  targetAppMeta: { 'data-xpert': { types: ['business-assistant'], capabilities: [FEATURE_KEY, VIEW_KEY], requiredPlugins: [PLUGIN_NAME], defaultConfig: { assistantKind: 'business-assistant', businessDomain: 'customer-support', managedBy: 'data-xpert', viewProvider: VIEW_PROVIDER_KEY } } },
  dslContent: readDsl(), order: 20, default: false,
  startPrompts: ['请读取待处理工单，完成分类、优先级判断并生成回复草稿。', '请说明当前有哪些待人工确认的高优先级工单。'],
  releaseNotes: 'Initial support ticket triage business loop.',
  xpertName: '售后工单分诊助手', providerKey: TEMPLATE_PROVIDER_KEY
} as XpertTemplateContribution]
