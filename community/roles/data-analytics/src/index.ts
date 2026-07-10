import { z } from 'zod'
import { XpertTypeEnum, type I18nObject } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAME, pluginIcon } from './lib/constants'
import { XpertAIDataAnalyticsPluginModule } from './lib/role-plugin.module'

const ConfigSchema = z.object({})
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const workflowSkillDescription = (name: string) => text(`${name} workflow skill.`, `${name} 工作流技能。`)
const workspaceAppDescription = (role: string) => text(`Workspace app connector requirement for ${role}.`, `${role} 所需的工作区应用连接器。`)
const assistantTemplateDescription = (role: string) => text(`Assistant template for ${role} workflows.`, `面向 ${role} 工作流的助手模板。`)
const AGENT_KEY = "Agent_XpertAIDataAnalytics"
const skillDependencies = [
  {
    "componentKey": "analyze-data-quality",
    "targetAgentKey": "Agent_XpertAIDataAnalytics"
  },
  {
    "componentKey": "build-dashboard",
    "targetAgentKey": "Agent_XpertAIDataAnalytics"
  },
  {
    "componentKey": "build-report",
    "targetAgentKey": "Agent_XpertAIDataAnalytics"
  },
  {
    "componentKey": "design-kpis",
    "targetAgentKey": "Agent_XpertAIDataAnalytics"
  },
  {
    "componentKey": "gather-business-context",
    "targetAgentKey": "Agent_XpertAIDataAnalytics"
  },
  {
    "componentKey": "index",
    "targetAgentKey": "Agent_XpertAIDataAnalytics"
  },
  {
    "componentKey": "jupyter-notebooks",
    "targetAgentKey": "Agent_XpertAIDataAnalytics"
  },
  {
    "componentKey": "kpi-reporting",
    "targetAgentKey": "Agent_XpertAIDataAnalytics"
  },
  {
    "componentKey": "market-sizing",
    "targetAgentKey": "Agent_XpertAIDataAnalytics"
  },
  {
    "componentKey": "metric-diagnostics",
    "targetAgentKey": "Agent_XpertAIDataAnalytics"
  },
  {
    "componentKey": "product-business-analysis",
    "targetAgentKey": "Agent_XpertAIDataAnalytics"
  },
  {
    "componentKey": "spreadsheets",
    "targetAgentKey": "Agent_XpertAIDataAnalytics"
  },
  {
    "componentKey": "user-context",
    "targetAgentKey": "Agent_XpertAIDataAnalytics"
  },
  {
    "componentKey": "validate-data",
    "targetAgentKey": "Agent_XpertAIDataAnalytics"
  },
  {
    "componentKey": "visualize-data",
    "targetAgentKey": "Agent_XpertAIDataAnalytics"
  }
]
const mcpDependencies = [
  {
    "componentKey": "datascienceWidgets",
    "targetAgentKey": "Agent_XpertAIDataAnalytics"
  }
]

const roleAgent = {
  key: AGENT_KEY,
  name: "data_analytics",
  title: "Data Analytics",
  description: text("Turn data into clear decisions", "把数据转化为清晰决策"),
  avatar: {
  "emoji": {
    "id": "chart-line"
  },
  "background": "#0285FF1F"
},
  prompt: "You are a data analytics assistant.\nUse the installed Data Analytics skills to clarify business context, validate data quality, diagnose metrics, build dashboards, notebooks, KPI reports, and decision-ready analysis.\nUse the Data Analytics Widgets MCP server when a chart, table, dashboard, or report artifact should be rendered for review.\nState assumptions, cite the data sources used, and call out missing context before making recommendations.",
  options: {
    disableMessageHistory: false,
    parallelToolCalls: false
  },
  collaboratorNames: [],
  toolsetIds: [],
  knowledgebaseIds: []
}

const roleDraft = {
  team: {
    name: "Data Analytics Assistant",
    title: "Data Analytics Assistant",
    description: text("Turn data into clear decisions", "把数据转化为清晰决策"),
    type: XpertTypeEnum.Agent,
    avatar: {
  "emoji": {
    "id": "chart-line"
  },
  "background": "#0285FF1F"
},
    starters: [
      "Help me get started and set up reusable data context for future data work",
      "Analyze product usage and recommend where the team should focus next",
      "Diagnose why a key metric changed and identify the biggest drivers"
    ],
    features: {
      sandbox: {
        enabled: true
      }
    },
    agent: roleAgent
  },
  nodes: [
    {
      type: 'agent',
      key: AGENT_KEY,
      position: {
        x: 0,
        y: 0
      },
      entity: roleAgent
    }
  ],
  connections: []
}

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: PLUGIN_NAME,
    version: "0.1.34",
    level: 'organization',
    category: "tools",
    icon: {
      type: 'svg',
      value: pluginIcon,
      color: "#0285FF"
    },
    displayName: "Data Analytics",
    description: "Analyze product usage, investigate metric movements, prepare KPI reports, build high-quality dashboards and notebooks, create source-backed semantic layers, guide first-run analytics setup, and generate analytics-grade report apps.",
    keywords: [
      "data-analytics",
      "analytics",
      "business-context",
      "dashboards",
      "funnel-analysis",
      "kpi-reporting",
      "market-sizing",
      "metric-diagnostics",
      "post-launch-updates",
      "product-analysis",
      "retention",
      "root-cause-analysis",
      "scorecards",
      "validation",
      "visualization",
      "jupyter-notebooks",
      "databricks",
      "bigquery",
      "snowflake",
      "deepnote",
      "mixpanel",
      "mixpanel-headless",
      "metabase",
      "thoughtspot",
      "onboarding",
      "semantic-layer"
    ],
    author: 'XpertAI',
    homepage: "https://github.com/xpert-ai/xpert-plugins/tree/main/community/roles/data-analytics",
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: [
          "assistant-template",
          "skill",
          "mcp-server",
          "app",
          "xpertai-bundle"
        ],
        capabilities: [
          "data-analytics",
          "analytics",
          "business-context",
          "dashboards",
          "funnel-analysis",
          "kpi-reporting",
          "market-sizing",
          "metric-diagnostics"
        ],
        marketplace: {
          contents: [
          {
                    "type": "skill",
                    "name": "analyze-data-quality",
                    "displayName": "Analyze Data Quality",
                    "description": workflowSkillDescription("Analyze Data Quality"),
                    "tags": [
                              "skill",
                              "data-analytics"
                    ]
          },
          {
                    "type": "skill",
                    "name": "build-dashboard",
                    "displayName": "Build Dashboard",
                    "description": workflowSkillDescription("Build Dashboard"),
                    "tags": [
                              "skill",
                              "data-analytics"
                    ]
          },
          {
                    "type": "skill",
                    "name": "build-report",
                    "displayName": "Build Report",
                    "description": workflowSkillDescription("Build Report"),
                    "tags": [
                              "skill",
                              "data-analytics"
                    ]
          },
          {
                    "type": "skill",
                    "name": "design-kpis",
                    "displayName": "Design Kpis",
                    "description": workflowSkillDescription("Design Kpis"),
                    "tags": [
                              "skill",
                              "data-analytics"
                    ]
          },
          {
                    "type": "skill",
                    "name": "gather-business-context",
                    "displayName": "Gather Business Context",
                    "description": workflowSkillDescription("Gather Business Context"),
                    "tags": [
                              "skill",
                              "data-analytics"
                    ]
          },
          {
                    "type": "skill",
                    "name": "index",
                    "displayName": "Index",
                    "description": workflowSkillDescription("Index"),
                    "tags": [
                              "skill",
                              "data-analytics"
                    ]
          },
          {
                    "type": "skill",
                    "name": "jupyter-notebooks",
                    "displayName": "Jupyter Notebooks",
                    "description": workflowSkillDescription("Jupyter Notebooks"),
                    "tags": [
                              "skill",
                              "data-analytics"
                    ]
          },
          {
                    "type": "skill",
                    "name": "kpi-reporting",
                    "displayName": "Kpi Reporting",
                    "description": workflowSkillDescription("Kpi Reporting"),
                    "tags": [
                              "skill",
                              "data-analytics"
                    ]
          },
          {
                    "type": "skill",
                    "name": "market-sizing",
                    "displayName": "Market Sizing",
                    "description": workflowSkillDescription("Market Sizing"),
                    "tags": [
                              "skill",
                              "data-analytics"
                    ]
          },
          {
                    "type": "skill",
                    "name": "metric-diagnostics",
                    "displayName": "Metric Diagnostics",
                    "description": workflowSkillDescription("Metric Diagnostics"),
                    "tags": [
                              "skill",
                              "data-analytics"
                    ]
          },
          {
                    "type": "skill",
                    "name": "product-business-analysis",
                    "displayName": "Product Business Analysis",
                    "description": workflowSkillDescription("Product Business Analysis"),
                    "tags": [
                              "skill",
                              "data-analytics"
                    ]
          },
          {
                    "type": "skill",
                    "name": "spreadsheets",
                    "displayName": "Spreadsheets",
                    "description": workflowSkillDescription("Spreadsheets"),
                    "tags": [
                              "skill",
                              "data-analytics"
                    ]
          },
          {
                    "type": "skill",
                    "name": "user-context",
                    "displayName": "User Context",
                    "description": workflowSkillDescription("User Context"),
                    "tags": [
                              "skill",
                              "data-analytics"
                    ]
          },
          {
                    "type": "skill",
                    "name": "validate-data",
                    "displayName": "Validate Data",
                    "description": workflowSkillDescription("Validate Data"),
                    "tags": [
                              "skill",
                              "data-analytics"
                    ]
          },
          {
                    "type": "skill",
                    "name": "visualize-data",
                    "displayName": "Visualize Data",
                    "description": workflowSkillDescription("Visualize Data"),
                    "tags": [
                              "skill",
                              "data-analytics"
                    ]
          },
          {
                    "type": "tool",
                    "name": "datascienceWidgets",
                    "displayName": "DatascienceWidgets",
                    "description": text("Plugin-managed MCP server for Data Analytics.", "Data Analytics 插件托管的 MCP 服务器。"),
                    "tags": [
                              "mcp-server",
                              "data-analytics"
                    ]
          },
          {
                    "type": "app",
                    "name": "slack",
                    "displayName": "Slack",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "teams",
                    "displayName": "Teams",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "app",
                    "name": "notion",
                    "displayName": "Notion",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "gmail",
                    "displayName": "Gmail",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "app",
                    "name": "outlook_email",
                    "displayName": "Outlook Email",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "app",
                    "name": "outlook_calendar",
                    "displayName": "Outlook Calendar",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "app",
                    "name": "google_calendar",
                    "displayName": "Google Calendar",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "app",
                    "name": "google_drive",
                    "displayName": "Google Drive",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "databricks",
                    "displayName": "Databricks",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "app",
                    "name": "bigquery",
                    "displayName": "Bigquery",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "app",
                    "name": "snowflake",
                    "displayName": "Snowflake",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "app",
                    "name": "sharepoint",
                    "displayName": "Sharepoint",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "app",
                    "name": "github",
                    "displayName": "Github",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "statsig",
                    "displayName": "Statsig",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "app",
                    "name": "hex",
                    "displayName": "Hex",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "app",
                    "name": "deepnote",
                    "displayName": "Deepnote",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "app",
                    "name": "amplitude",
                    "displayName": "Amplitude",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "app",
                    "name": "mixpanel",
                    "displayName": "Mixpanel",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "app",
                    "name": "omni-analytics",
                    "displayName": "Omni Analytics",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "app",
                    "name": "metabase",
                    "displayName": "Metabase",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "app",
                    "name": "thoughtspot",
                    "displayName": "Thoughtspot",
                    "description": workspaceAppDescription("Data Analytics"),
                    "tags": [
                              "app",
                              "optional"
                    ]
          },
          {
                    "type": "assistant-template",
                    "name": "data-analytics-assistant",
                    "displayName": "Data Analytics Assistant",
                    "description": assistantTemplateDescription("Data Analytics")
          }
]
        }
      }
    }
  },
  config: {
    schema: ConfigSchema
  },
  templates: [
    {
      key: "data-analytics-assistant",
      title: "Data Analytics Assistant",
      name: "Data Analytics Assistant",
      description: "把数据转化为清晰决策",
      type: XpertTypeEnum.Agent,
      category: "analytics",
      icon: {
        type: 'svg',
        value: pluginIcon,
        color: "#0285FF"
      },
      targetApps: ['xpert'],
      startPrompts: [
      "Help me get started and set up reusable data context for future data work",
      "Analyze product usage and recommend where the team should focus next",
      "Diagnose why a key metric changed and identify the biggest drivers"
    ],
      dependencies: {
        plugins: [PLUGIN_NAME],
        skills: skillDependencies,
        mcpServers: mcpDependencies
      },
      dslContent: JSON.stringify(roleDraft, null, 2)
    }
  ],
  register(ctx) {
    ctx.logger.log(`register data-analytics plugin`)
    return { module: XpertAIDataAnalyticsPluginModule, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log(`data-analytics plugin started`)
  },
  async onStop(ctx) {
    ctx.logger.log(`data-analytics plugin stopped`)
  }
}

export default plugin
