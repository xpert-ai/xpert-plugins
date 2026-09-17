import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  MEETING_ARTIFACT_NAMESPACE,
  MEETING_FEATURE,
  MEETING_ICON,
  MEETING_MIDDLEWARE_NAME,
  MEETING_PLUGIN_NAME,
  MEETING_PROVIDER_KEY,
  MEETING_TEMPLATE_KEY,
  MEETING_TEMPLATE_PROVIDER_KEY,
  MEETING_VIEW_KEY
} from './lib/constants'
import { MeetingActionWorkbenchPlugin } from './lib/meeting.plugin'
import { meetingTemplates } from './lib/meeting.templates'

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({}).strict()

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name || MEETING_PLUGIN_NAME,
    version: packageJson.version,
    level: 'system',
    artifactNamespace: MEETING_ARTIFACT_NAMESPACE,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-app', 'workbench-view', 'assistant-tool', 'assistant-template'],
        capabilities: [MEETING_FEATURE, 'meeting-ai-extraction', 'meeting-human-review', 'meeting-execution-tracking', 'meeting-agent-risk-review'],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: MEETING_ARTIFACT_NAMESPACE,
              displayName: '会议决议与行动项工作台',
              description: '将会议内容提取为可追溯的决议和行动项，并通过人工校对后确认。',
              icon: { type: 'svg', value: MEETING_ICON, color: '#0369a1' },
              operations: [
                {
                  name: 'extract-meeting-actions',
                  displayName: '提取会议决议与行动项',
                  description: '通过 Assistant 对会议文本进行结构化提取。',
                  access: 'write'
                },
                {
                  name: 'review-meeting-actions',
                  displayName: '审核会议结果',
                  description: '在工作台中编辑、驳回并确认 AI 结果。',
                  access: 'write'
                },
                {
                  name: 'track-meeting-execution',
                  displayName: '跟踪行动项执行',
                  description: '更新确认后的行动项状态并查看逾期和缺失信息。',
                  access: 'write'
                },
                {
                  name: 'review-execution-risks',
                  displayName: 'Agent 执行风险巡检',
                  description: '分析跨会议语义风险并生成下一次会议跟进简报。',
                  access: 'write'
                }
              ]
            },
            {
              type: 'view',
              name: MEETING_VIEW_KEY,
              displayName: '会议决议与行动项工作台',
              description: '会议复核、行动项执行看板、风险雷达与跟进简报视图。'
            },
            {
              type: 'tool',
              name: MEETING_MIDDLEWARE_NAME,
              displayName: '会议提取与执行治理工具',
              description: '用于会议提取、执行风险巡检、跟进简报和失败恢复的原生 Agent 工具。'
            },
            {
              type: 'assistant-template',
              name: MEETING_TEMPLATE_KEY,
              displayName: '会议决议与行动项助手',
              description: '预置会议内容提取和人工复核流程的 Assistant 模板。'
            }
          ]
        },
        runtime: {
          middlewareProviders: [MEETING_MIDDLEWARE_NAME],
          viewProviders: [MEETING_PROVIDER_KEY],
          templateProviders: [MEETING_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: { type: 'svg', value: MEETING_ICON, color: '#0369a1' },
    displayName: { en_US: 'Meeting Action Workbench', zh_Hans: '会议决议与行动项工作台' },
    description: {
      en_US: 'Extract and confirm meeting outcomes, track action execution, review risks, and prepare follow-up briefs.',
      zh_Hans: '提取并确认会议结果，持续跟踪行动项、巡检执行风险并生成跟进简报。'
    },
    keywords: ['meeting', 'decision', 'action-item', 'execution-tracking', 'risk-review', 'follow-up-brief', 'workbench', 'human-review'],
    author: 'XpertAI Team'
  },
  config: { schema: ConfigSchema, defaults: {} },
  templates: meetingTemplates,
  register(ctx) {
    ctx.logger.log('register meeting-action-workbench plugin')
    return { module: MeetingActionWorkbenchPlugin, global: true }
  },
  onStart(ctx) {
    ctx.logger.log('meeting-action-workbench plugin started')
  },
  onStop(ctx) {
    ctx.logger.log('meeting-action-workbench plugin stopped')
  }
}

export default plugin
