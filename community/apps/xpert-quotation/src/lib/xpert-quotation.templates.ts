import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  XPERT_QUOTATION_ASSISTANT_TEMPLATE_KEY,
  XPERT_QUOTATION_FEATURE,
  XPERT_QUOTATION_PATCH_CAPABILITY,
  XPERT_QUOTATION_PLUGIN_NAME,
  XPERT_QUOTATION_PROVIDER_KEY,
  XPERT_QUOTATION_TEMPLATE_PROVIDER_KEY,
  XPERT_QUOTATION_WORKBENCH_CAPABILITY,
  WEB_TOOLS_PLUGIN_NAME,
  OFFICE_CLI_PLUGIN_NAME,
  VIEW_IMAGE_PLUGIN_NAME,
  TOOL_RETRY_PLUGIN_NAME
} from './constants.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const templateFile = 'xpert-quotation-assistant.yaml'
const templatePlugins = [
  XPERT_QUOTATION_PLUGIN_NAME,
  WEB_TOOLS_PLUGIN_NAME,
  OFFICE_CLI_PLUGIN_NAME,
  VIEW_IMAGE_PLUGIN_NAME,
  TOOL_RETRY_PLUGIN_NAME
]
const templateSkills = [{
  pluginName: OFFICE_CLI_PLUGIN_NAME,
  componentKey: 'officecli',
  targetAgentKey: 'Agent_XpertQuotation'
}]

function readDsl() {
  const candidates = [
    join(moduleDir, '..', templateFile),
    join(moduleDir, templateFile),
    join(process.cwd(), 'apps/xpert-quotation/src', templateFile),
    join(process.cwd(), 'xpertai/apps/xpert-quotation/src', templateFile),
    join(process.cwd(), 'dist/apps/xpert-quotation', templateFile)
  ]
  const path = candidates.find((candidate) => existsSync(candidate))
  if (!path) throw new Error(`Xpert Quotation assistant template was not found: ${candidates.join(', ')}`)
  return readFileSync(path, 'utf8')
}

export const xpertQuotationTemplates: XpertTemplateContribution[] = [{
  key: XPERT_QUOTATION_ASSISTANT_TEMPLATE_KEY,
  name: 'Xpert Quotation Assistant',
  title: 'Xpert报价助手',
  description: '使用千问识别南京Xpert报价表，优先检索已连接的消耗量和价格知识库，无库或无匹配时以可追溯网页证据辅助拆解，并由确定性引擎生成可审核综合单价。',
  category: 'Productivity',
  type: XpertTypeEnum.Agent,
  targetApps: ['data-xpert', 'xpert'],
  targetAppMeta: {
    'data-xpert': {
      types: ['business-assistant'],
      capabilities: [XPERT_QUOTATION_FEATURE, XPERT_QUOTATION_WORKBENCH_CAPABILITY, XPERT_QUOTATION_PATCH_CAPABILITY],
      requiredPlugins: templatePlugins,
      defaultConfig: { assistantKind: 'business-assistant', businessDomain: 'xpert-quotation', managedBy: 'data-xpert', viewProvider: XPERT_QUOTATION_PROVIDER_KEY }
    },
    xpert: {
      types: ['assistant-template'],
      capabilities: [XPERT_QUOTATION_FEATURE, XPERT_QUOTATION_WORKBENCH_CAPABILITY, XPERT_QUOTATION_PATCH_CAPABILITY],
      requiredPlugins: templatePlugins
    }
  },
  dependencies: { plugins: templatePlugins, skills: templateSkills },
  dslContent: readDsl(),
  order: 71,
  default: false,
  startPrompts: [
    '请导入Xpert报价表，优先从已连接知识库识别并匹配；无库或无匹配时联网检索并保留来源证据。',
    '请逐条检索分部分项清单的消耗量组成，并明确列出未覆盖的工作范围。',
    '请按已匹配消耗量逐项检索人工、材料和机械资源价格。',
    '请列出当前报价中需要人工复核的价格项。',
    '请按项目特征描述中的规格检索知识库并给出带片段证据的材料价格推荐。',
    '请说明当前报价为什么还不能写入 Excel。',
    '我已确认全部匹配，请生成保格式报价文件。'
  ],
  releaseNotes: '采用 Coordinator、逐行 Worker、消耗量检索 Agent、价格检索 Agent 四层 DSL 编排：消耗量和价格 Agent 均优先使用各自知识库，无库或无可靠匹配时通过 WebTools 检索，并持久化真实 URL、逐字证据和待复核提案；人工审批、确定性计价和 Excel 写回仍由主流程控制。',
  xpertName: 'Xpert报价助手',
  providerKey: XPERT_QUOTATION_TEMPLATE_PROVIDER_KEY
}]
