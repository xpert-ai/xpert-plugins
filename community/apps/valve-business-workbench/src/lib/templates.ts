import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { VALVE_FEATURE, VALVE_PLUGIN_NAME, VALVE_PROVIDER_KEY, VALVE_TEMPLATE_KEY, VALVE_TEMPLATE_PROVIDER_KEY } from './constants'

const TEMPLATE_FILE = 'xpert-valve-business-workbench-assistant.yaml'
const templateSkills = [
  {
    pluginName: '@xpert-ai/plugin-valve-business-workbench',
    componentKey: 'valve-business-operations',
    targetAgentKey: 'Agent_ValveBusinessWorkbench'
  }
]

function readTemplateDsl() {
  const candidates = [
    join(__dirname, '..', TEMPLATE_FILE),
    join(__dirname, TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/valve-business-workbench/src', TEMPLATE_FILE),
    join(process.cwd(), 'apps/valve-business-workbench/src', TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/valve-business-workbench', TEMPLATE_FILE)
  ]
  const path = candidates.find(existsSync)
  if (!path) throw new Error(`Valve Assistant template not found: ${candidates.join(', ')}`)
  return readFileSync(path, 'utf8')
}

export const valveTemplates: XpertTemplateContribution[] = [
  {
    key: VALVE_TEMPLATE_KEY,
    name: 'Valve Engineering Business Assistant',
    title: '阀门工程业务助手',
    description: '基于已发布阀门本体快照，提供对象 360、证据、约束分析和受控动作草案。',
    category: 'Engineering',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [VALVE_FEATURE, 'valve-object-360', 'valve-governed-proposals'],
        requiredPlugins: [VALVE_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'valve-engineering',
          managedBy: 'data-xpert',
          viewProvider: VALVE_PROVIDER_KEY
        }
      }
    },
    dependencies: {
      plugins: [VALVE_PLUGIN_NAME],
      skills: templateSkills
    },
    dslContent: readTemplateDsl(),
    order: 48,
    default: false,
    startPrompts: [
      '分析工作台当前选中的阀门，按本体事实、证据、风险和建议给出结论。',
      '检查当前阀门的部件、材料和符合标准关系，指出证据或数据缺口。',
      '发现当前阀门可用的 Actions，并对最合适的一项执行预检，但先不要创建草案。',
      '查看当前阀门的待审核动作草案和审计记录，告诉我下一步需要人工处理什么。'
    ],
    releaseNotes: '新增上下文感知阀门业务 Skill 和面向对象分析、证据、Action 预检及人工处理的初始问题。',
    xpertName: '阀门工程业务助手',
    providerKey: VALVE_TEMPLATE_PROVIDER_KEY
  }
]
