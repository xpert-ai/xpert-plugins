import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  WEEKLY_RADAR_FEATURE,
  WEEKLY_RADAR_ICON,
  WEEKLY_RADAR_MIDDLEWARE_NAME,
  WEEKLY_RADAR_PLUGIN_NAME,
  WEEKLY_RADAR_PROVIDER_KEY,
  WEEKLY_RADAR_TEMPLATE_KEY,
  WEEKLY_RADAR_TEMPLATE_PROVIDER_KEY,
  WEEKLY_RADAR_VIEW_KEY
} from './lib/constants'
import { WeeklyRadarPluginConfigSchema, readWeeklyRadarPluginEnvDefaults } from './lib/config'
import { WEEKLY_RADAR_PACKAGE_METADATA } from './package-metadata'
import { weeklyRadarTemplates } from './lib/weekly-radar.templates'
import { WeeklyRadarPlugin } from './lib/weekly-radar.plugin'

const capabilities = [
  WEEKLY_RADAR_FEATURE,
  'weekly-radar-workbench',
  'weekly-radar-agent-tools',
  'weekly-radar-assistant-template'
]

const appContribution = {
  type: 'app' as const,
  name: 'weekly-radar',
  displayName: { en_US: 'Weekly Radar', zh_Hans: '周报风险雷达' },
  description: {
    en_US: 'Turn this week into tracked entries, expose unclosed-state risks, and keep an evidence-backed weekly report.',
    zh_Hans: '把本周沉淀为可追踪条目，暴露未闭环风险，并维护一份带依据的周报。'
  },
  icon: { type: 'svg' as const, value: WEEKLY_RADAR_ICON, color: '#0f766e' },
  operations: [
    {
      name: 'capture-weekly-entries',
      displayName: { en_US: 'Capture work entries', zh_Hans: '沉淀工作条目' },
      description: {
        en_US: 'Record what actually happened this week with its evidence pointer.',
        zh_Hans: '记录本周真实发生的事情，并保留证据指针。'
      },
      access: 'write' as const
    },
    {
      name: 'scan-unclosed-risks',
      displayName: { en_US: 'Scan unclosed risks', zh_Hans: '扫描未闭环风险' },
      description: {
        en_US: 'Replay the rule engine over stored entries and list risks with ageing days.',
        zh_Hans: '用规则引擎在已存条目上复算，列出风险与滞留天数。'
      },
      access: 'read' as const
    },
    {
      name: 'assemble-weekly-report',
      displayName: { en_US: 'Assemble the weekly report', zh_Hans: '生成周报' },
      description: {
        en_US: 'Assemble the weekly report where numbers and risk rows are recomputed on the server.',
        zh_Hans: '生成周报，数字与风险行均由服务端重算。'
      },
      access: 'write' as const
    }
  ]
}

const viewContribution = {
  type: 'view' as const,
  name: WEEKLY_RADAR_VIEW_KEY,
  displayName: { en_US: 'Weekly Radar Workbench', zh_Hans: '周报风险雷达工作台' },
  description: {
    en_US: 'Workbench for entries, the risk radar, and the weekly report.',
    zh_Hans: '用于查看条目、风险雷达与周报的工作台。'
  }
}

const toolContribution = {
  type: 'tool' as const,
  name: WEEKLY_RADAR_MIDDLEWARE_NAME,
  displayName: { en_US: 'Weekly Radar Tools', zh_Hans: '周报风险雷达工具' },
  description: {
    en_US: 'Capture work entries, scan unclosed-state risks, and assemble the weekly report.',
    zh_Hans: '沉淀工作条目、扫描未闭环风险、生成周报。'
  }
}

const templateContribution = {
  type: 'assistant-template' as const,
  name: WEEKLY_RADAR_TEMPLATE_KEY,
  displayName: { en_US: 'Weekly Radar Assistant', zh_Hans: '周报风险雷达助手' },
  description: {
    en_US: 'Assistant template that records real facts and keeps the risk section rule driven.',
    zh_Hans: '只记录真实事实、风险段由规则驱动的助手模板。'
  }
}

const plugin: XpertPlugin<z.infer<typeof WeeklyRadarPluginConfigSchema>> = {
  meta: {
    name: WEEKLY_RADAR_PACKAGE_METADATA.name || WEEKLY_RADAR_PLUGIN_NAME,
    version: WEEKLY_RADAR_PACKAGE_METADATA.version,
    level: WEEKLY_RADAR_PACKAGE_METADATA.xpert.plugin.level,
    artifactNamespace: WEEKLY_RADAR_PACKAGE_METADATA.xpert.plugin.artifactNamespace,
    category: 'middleware',
    displayName: { en_US: 'Weekly Radar', zh_Hans: '周报风险雷达' },
    description: {
      en_US: 'Capture work entries, scan unclosed-state risks with reproducible rules, and assemble an evidence-backed weekly report.',
      zh_Hans: '沉淀工作条目，用可复算的规则扫描未闭环风险，并生成带依据的周报。'
    },
    author: 'XpertAI',
    icon: { type: 'svg', value: WEEKLY_RADAR_ICON, color: '#0f766e' },
    keywords: ['weekly-report', 'risk', 'radar', 'workbench', 'agent-tool', 'assistant-template'],
    targetApps: ['data-xpert', 'xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-app', 'workbench-view', 'assistant-tool'],
        capabilities,
        marketplace: {
          contents: [appContribution, viewContribution, toolContribution, templateContribution]
        },
        runtime: {
          middlewareProviders: [WEEKLY_RADAR_MIDDLEWARE_NAME],
          viewProviders: [WEEKLY_RADAR_PROVIDER_KEY],
          templateProviders: [WEEKLY_RADAR_TEMPLATE_PROVIDER_KEY]
        }
      },
      xpert: {
        types: ['business-app', 'workbench-view', 'assistant-tool'],
        capabilities,
        marketplace: {
          contents: [appContribution, viewContribution, toolContribution, templateContribution]
        },
        runtime: {
          middlewareProviders: [WEEKLY_RADAR_MIDDLEWARE_NAME],
          viewProviders: [WEEKLY_RADAR_PROVIDER_KEY],
          templateProviders: [WEEKLY_RADAR_TEMPLATE_PROVIDER_KEY]
        }
      }
    }
  },
  config: {
    schema: WeeklyRadarPluginConfigSchema,
    defaults: readWeeklyRadarPluginEnvDefaults()
  },
  templates: weeklyRadarTemplates,
  register(ctx) {
    ctx.logger.log('register weekly-radar plugin')
    return { module: WeeklyRadarPlugin, global: true }
  },
  onStart(ctx) {
    ctx.logger.log('weekly-radar plugin started')
  },
  onStop(ctx) {
    ctx.logger.log('weekly-radar plugin stopped')
  }
}

export default plugin
