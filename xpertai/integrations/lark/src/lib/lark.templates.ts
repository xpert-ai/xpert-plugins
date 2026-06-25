import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@metad/contracts'
import {
  LARK_ADMIN_TEMPLATE_KEY,
  LARK_ADMIN_VIEW_FEATURE,
  LARK_ASSISTANT_TEMPLATE_FEATURE,
  LARK_CONVERSATION_CONTEXT_MIDDLEWARE_NAME,
  LARK_CONVERSATION_TEMPLATE_KEY,
  LARK_DOCUMENT_SOURCE_FEATURE,
  LARK_FEATURE,
  LARK_LONG_CONNECTION_FEATURE,
  LARK_MESSAGING_FEATURE,
  LARK_NOTIFY_MIDDLEWARE_NAME,
  LARK_PLUGIN_NAME,
  LARK_TEMPLATE_PROVIDER_KEY,
  LARK_VIEW_PROVIDER_KEY
} from './constants.js'
import type { LarkXpertTemplateContribution } from './plugin-metadata-compat.js'

const LARK_ADMIN_TEMPLATE_FILE = 'xpert-lark-admin-assistant.yaml'
const LARK_CONVERSATION_TEMPLATE_FILE = 'xpert-lark-conversation-assistant.yaml'
const moduleDir = dirname(fileURLToPath(import.meta.url))

function getTemplateCandidates(templateFile: string) {
  return [
    join(moduleDir, '..', templateFile),
    join(moduleDir, templateFile),
    join(moduleDir, '..', '..', 'src', templateFile),
    join(process.cwd(), 'integrations/lark/src', templateFile),
    join(process.cwd(), 'xpertai/integrations/lark/src', templateFile),
    join(process.cwd(), 'dist/integrations/lark', templateFile)
  ]
}

function readTemplateDsl(templateFile: string) {
  const candidates = getTemplateCandidates(templateFile)
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Lark xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const larkTemplates: LarkXpertTemplateContribution[] = [
  {
    key: LARK_ADMIN_TEMPLATE_KEY,
    name: 'Lark Admin Assistant',
    title: '飞书管理员',
    description: '管理组织内飞书/Lark 集成、长连接、用户目录和会话绑定的管理员助手模板。',
    category: 'Integration',
    type: XpertTypeEnum.Agent,
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['assistant-template', 'integration', 'workbench-view'],
        capabilities: [
          LARK_FEATURE,
          LARK_LONG_CONNECTION_FEATURE,
          LARK_ADMIN_VIEW_FEATURE,
          LARK_ASSISTANT_TEMPLATE_FEATURE
        ],
        requiredPlugins: [LARK_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: LARK_ADMIN_TEMPLATE_KEY,
          businessDomain: 'lark',
          role: 'admin',
          managedBy: 'xpert',
          middlewareProviders: [LARK_CONVERSATION_CONTEXT_MIDDLEWARE_NAME],
          viewProvider: LARK_VIEW_PROVIDER_KEY
        }
      }
    },
    dslContent: readTemplateDsl(LARK_ADMIN_TEMPLATE_FILE),
    order: 50,
    default: false,
    startPrompts: [
      '请汇总组织内飞书集成的连接方式、最近心跳和最近错误。',
      '帮我检查某个飞书长连接为什么没有在线，并给出排查步骤。',
      '说明飞书机器人权限、事件订阅和回调配置需要如何设置。'
    ],
    releaseNotes: '创建组织级飞书集成管理助手。',
    xpertName: '飞书管理员',
    providerKey: LARK_TEMPLATE_PROVIDER_KEY
  } as LarkXpertTemplateContribution,
  {
    key: LARK_CONVERSATION_TEMPLATE_KEY,
    name: 'Lark Conversation Assistant',
    title: '飞书会话助手',
    description: '通过飞书/Lark 接收消息、理解会话上下文，并自然回复或发送通知的助手模板。',
    category: 'Integration',
    type: XpertTypeEnum.Agent,
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['assistant-template', 'assistant-tool', 'integration'],
        capabilities: [
          LARK_FEATURE,
          LARK_MESSAGING_FEATURE,
          LARK_LONG_CONNECTION_FEATURE,
          LARK_DOCUMENT_SOURCE_FEATURE,
          LARK_ASSISTANT_TEMPLATE_FEATURE
        ],
        requiredPlugins: [LARK_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: LARK_CONVERSATION_TEMPLATE_KEY,
          businessDomain: 'lark',
          role: 'conversation',
          managedBy: 'xpert',
          middlewareProviders: [LARK_CONVERSATION_CONTEXT_MIDDLEWARE_NAME, LARK_NOTIFY_MIDDLEWARE_NAME],
          viewProvider: LARK_VIEW_PROVIDER_KEY
        }
      }
    },
    dslContent: readTemplateDsl(LARK_CONVERSATION_TEMPLATE_FILE),
    order: 51,
    default: false,
    startPrompts: [
      '请作为飞书会话助手，帮我自然回复当前飞书消息。',
      '请查看当前群聊最近消息，再回答用户刚才的问题。',
      '请给刚才提到的同事发送一条简短的飞书提醒。'
    ],
    releaseNotes: '创建飞书消息收发与会话上下文助手。',
    xpertName: '飞书会话助手',
    providerKey: LARK_TEMPLATE_PROVIDER_KEY
  } as LarkXpertTemplateContribution
]
