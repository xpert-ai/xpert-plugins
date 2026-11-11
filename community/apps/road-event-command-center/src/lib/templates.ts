import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { FEATURE, MIDDLEWARE_NAME, PLUGIN_NAME, PROVIDER_KEY, TEMPLATE_KEY } from './constants.js'

const prompt = `你是道路事件工作台助手。引导值班人员在“道路事件”工作台填写并保存事件草稿。
当用户要求为当前已保存草稿生成或重试 AI 处置建议时，调用 generate_road_event_recommendation。工具会使用当前 Assistant 的聊天模型并持久化结构化建议。工具失败时，说明草稿仍保留、生成失败，并等待用户明确要求重试后再调用工具。
建议必须标明 AI 生成并需人工审核；不得声称已派单、已联系应急部门或已获人工确认。不要虚构事件事实、坐标或现场信息。只有工作台明确显示保存成功时，才能说明草稿已保存。用中文回应中文请求。`

export const roadEventAssistantTemplate: XpertTemplateContribution = {
  key: TEMPLATE_KEY,
  name: 'Road Event Draft Assistant',
  title: { en_US: 'Road Event Draft Assistant', zh_Hans: '道路事件草稿助手' },
  description: {
    en_US: 'A starter Assistant with the road-event draft workbench enabled.',
    zh_Hans: '预先启用道路事件草稿工作台的起步助手模板。'
  },
  category: 'Business',
  type: XpertTypeEnum.Agent,
  targetApps: ['xpert'],
  targetAppMeta: {
    xpert: {
      types: ['business-assistant'],
      capabilities: [FEATURE],
      requiredPlugins: [PLUGIN_NAME],
      defaultConfig: { viewProvider: PROVIDER_KEY }
    }
  },
  dslContent: JSON.stringify({
    team: {
      name: 'road-event-draft-assistant',
      title: '道路事件草稿助手',
      description: '引导值班人员录入并保存道路事件草稿。',
      type: 'agent',
      version: '1',
      options: { templateKey: TEMPLATE_KEY },
      agent: { key: 'road-event-duty-agent' },
      agentConfig: { recursionLimit: 20 }
    },
    nodes: [
      {
        key: 'road-event-duty-agent',
        type: 'agent',
        position: { x: 240, y: 80 },
        entity: {
          key: 'road-event-duty-agent',
          title: '道路事件草稿助手',
          description: '帮助值班人员录入道路事件草稿。',
          prompt
        }
      },
      {
        key: 'road-event-workbench',
        type: 'workflow',
        position: { x: 240, y: 280 },
        entity: {
          key: 'road-event-workbench',
          type: 'middleware',
          provider: MIDDLEWARE_NAME,
          required: true,
          options: {}
        }
      }
    ],
    connections: [
      {
        key: 'road-event-duty-agent/workbench',
        from: 'road-event-duty-agent',
        to: 'road-event-workbench',
        type: 'workflow'
      }
    ]
  }),
  startPrompts: [
    '请打开“道路事件”工作台，填写并保存一条事件草稿。',
    '根据当前已保存的道路事件草稿生成一份 AI 处置建议，供值班人员审核。'
  ],
  providerKey: 'road-event-command-center.templates',
  order: 20,
  default: false,
  releaseNotes: 'S1 草稿闭环、S2 地图定位和 S3 结构化 AI 建议。'
}
