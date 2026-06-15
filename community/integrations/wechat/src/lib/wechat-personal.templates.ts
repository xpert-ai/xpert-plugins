import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  WECHAT_PERSONAL_FEATURE,
  WECHAT_PERSONAL_MIDDLEWARE_NAME,
  WECHAT_PERSONAL_PLUGIN_NAME,
  WECHAT_PERSONAL_RUNTIME_FEATURE,
  WECHAT_PERSONAL_TEMPLATE_PROVIDER_KEY,
  WECHAT_PERSONAL_VIEW_PROVIDER_KEY
} from './constants.js'

const WECHAT_PERSONAL_ADMIN_TEMPLATE_KEY = 'wechat-personal-admin-assistant'
const WECHAT_PERSONAL_USER_TEMPLATE_KEY = 'wechat-personal-user-assistant'
const WECHAT_PERSONAL_ADMIN_TEMPLATE_FILE = 'xpert-wechat-personal-admin-assistant.yaml'
const WECHAT_PERSONAL_USER_TEMPLATE_FILE = 'xpert-wechat-personal-user-assistant.yaml'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function getTemplateCandidates(templateFile: string) {
  const runtimeDir = __dirname
  return [
    join(runtimeDir, '..', templateFile),
    join(runtimeDir, templateFile),
    join(process.cwd(), 'community/integrations/wechat/src', templateFile),
    join(process.cwd(), 'dist/community/integrations/wechat', templateFile)
  ]
}

function readTemplateDsl(templateFile: string) {
  const candidates = getTemplateCandidates(templateFile)
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Personal WeChat xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const wechatPersonalTemplates: XpertTemplateContribution[] = [
  {
    key: WECHAT_PERSONAL_ADMIN_TEMPLATE_KEY,
    name: 'Personal WeChat Admin Assistant',
    title: '个人微信管理员',
    description: '管理组织内 wx2.0 个人微信集成、账号、会话、消息日志和回调配置的管理员助手模板。',
    category: 'Integration',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant', 'assistant-tool', 'workbench-view'],
        capabilities: [WECHAT_PERSONAL_FEATURE, WECHAT_PERSONAL_RUNTIME_FEATURE, 'wechat-personal-workbench'],
        requiredPlugins: [WECHAT_PERSONAL_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'wechat-personal-admin-assistant',
          businessDomain: 'wechat-personal',
          role: 'admin',
          managedBy: 'data-xpert',
          middlewareProvider: WECHAT_PERSONAL_MIDDLEWARE_NAME,
          viewProvider: WECHAT_PERSONAL_VIEW_PROVIDER_KEY
        }
      }
    },
    dslContent: readTemplateDsl(WECHAT_PERSONAL_ADMIN_TEMPLATE_FILE),
    order: 45,
    default: false,
    startPrompts: [
      '请汇总组织内所有个人微信集成的账号状态和最近错误。',
      '帮我生成每个 wx2.0 账号的回调配置步骤。',
      '检查最近 AI 回复发送失败的微信消息，并给出排查建议。'
    ],
    releaseNotes: '创建组织级个人微信运行管理助手。',
    xpertName: '个人微信管理员',
    providerKey: WECHAT_PERSONAL_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution,
  {
    key: WECHAT_PERSONAL_USER_TEMPLATE_KEY,
    name: 'Personal WeChat User Assistant',
    title: '个人微信会话助手',
    description: '通过 wx2.0 接收个人微信消息、交给 Agent 处理，并把最终文本回复发回微信的使用者助手模板。',
    category: 'Integration',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant', 'assistant-tool'],
        capabilities: [WECHAT_PERSONAL_FEATURE, WECHAT_PERSONAL_RUNTIME_FEATURE, 'wechat-personal-workbench'],
        requiredPlugins: [WECHAT_PERSONAL_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'wechat-personal-user-assistant',
          businessDomain: 'wechat-personal',
          role: 'user',
          managedBy: 'data-xpert',
          middlewareProvider: WECHAT_PERSONAL_MIDDLEWARE_NAME,
          viewProvider: WECHAT_PERSONAL_VIEW_PROVIDER_KEY
        }
      }
    },
    dslContent: readTemplateDsl(WECHAT_PERSONAL_USER_TEMPLATE_FILE),
    order: 46,
    default: false,
    startPrompts: [
      '请作为微信会话助手，帮我自然回复用户消息。',
      '如果微信群消息触发了你，请只围绕当前被触发的问题简洁回复。',
      '当微信用户缺少上下文时，先提出一个澄清问题。'
    ],
    releaseNotes: '创建个人微信消息收发会话助手。',
    xpertName: '个人微信会话助手',
    providerKey: WECHAT_PERSONAL_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
