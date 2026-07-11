import { z } from 'zod'
import { XpertTypeEnum, type I18nObject } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAME, pluginIcon } from './lib/constants'
import { XpertAISalesPluginModule } from './lib/role-plugin.module'

const ConfigSchema = z.object({})
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const workflowSkillDescription = (name: string) => text(`${name} workflow skill.`, `${name} 工作流技能。`)
const workspaceAppDescription = (role: string) => text(`Workspace app connector requirement for ${role}.`, `${role} 所需的工作区应用连接器。`)
const assistantTemplateDescription = (role: string) => text(`Assistant template for ${role} workflows.`, `面向 ${role} 工作流的助手模板。`)
const AGENT_KEY = "Agent_XpertAISales"
const skillDependencies = [
  {
    "componentKey": "analyze-account-signals",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "build-business-case",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "build-competitive-brief",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "enrich-company-and-contact-data",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "find-customer-quotes",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "find-key-internal-sources",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "follow-up-after-call",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "get-rep-call-feedback",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "hubspot",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "index",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "plan-deal-strategy",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "prepare-for-meeting",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "prioritize-accounts",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "review-forecast",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "review-rep-call-trends",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "sales-company-research",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "salesforce",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "suggest-sales-next-step",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "user-context",
    "targetAgentKey": "Agent_XpertAISales"
  },
  {
    "componentKey": "zoominfo",
    "targetAgentKey": "Agent_XpertAISales"
  }
]

const roleAgent = {
  key: AGENT_KEY,
  name: "sales",
  title: "Sales",
  description: text("Prepare sales work faster", "更快完成销售准备和跟进工作"),
  avatar: {
  "emoji": {
    "id": "briefcase-business"
  },
  "background": "#FB6A221F"
},
  prompt: "You are a sales workflow assistant.\nUse the installed Sales skills to prepare meetings, prioritize accounts, follow up after calls, review forecasts, and assemble customer evidence.\nGround recommendations in the CRM records, call notes, email, calendar, docs, chat messages, uploaded files, and pasted context available in the workspace.\nWhen a connected app is unavailable, ask for the needed source or suggest installing the matching workspace app resource.",
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
    name: "Sales Assistant",
    title: "Sales Assistant",
    description: text("Prepare sales work faster", "更快完成销售准备和跟进工作"),
    type: XpertTypeEnum.Agent,
    avatar: {
  "emoji": {
    "id": "briefcase-business"
  },
  "background": "#FB6A221F"
},
    starters: [
      "Let's get started",
      "Prep me for my next customer meeting",
      "Help me prioritize my accounts"
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
    version: "0.2.16",
    level: 'organization',
    category: "tools",
    icon: {
      type: 'svg',
      value: pluginIcon,
      color: "#FB6A22"
    },
    displayName: "Sales",
    description: "Practical sales workflows that help sellers prepare meetings, follow up after calls, plan deals, review pipeline, find internal answers, and reuse saved preferences.",
    keywords: [
      "sales",
      "competitive-brief",
      "account-intelligence",
      "meeting-preparation",
      "product-feedback",
      "forecasting",
      "pipeline",
      "coaching",
      "follow-up"
    ],
    author: 'XpertAI',
    homepage: "https://github.com/xpert-ai/xpert-plugins/tree/main/community/roles/sales",
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: [
          "assistant-template",
          "skill",
          "app",
          "xpertai-bundle"
        ],
        capabilities: [
          "sales",
          "competitive-brief",
          "account-intelligence",
          "meeting-preparation",
          "product-feedback",
          "forecasting",
          "pipeline",
          "coaching"
        ],
        marketplace: {
          contents: [
          {
                    "type": "skill",
                    "name": "analyze-account-signals",
                    "displayName": "Analyze Account Signals",
                    "description": workflowSkillDescription("Analyze Account Signals"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "build-business-case",
                    "displayName": "Build Business Case",
                    "description": workflowSkillDescription("Build Business Case"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "build-competitive-brief",
                    "displayName": "Build Competitive Brief",
                    "description": workflowSkillDescription("Build Competitive Brief"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "enrich-company-and-contact-data",
                    "displayName": "Enrich Company And Contact Data",
                    "description": workflowSkillDescription("Enrich Company And Contact Data"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "find-customer-quotes",
                    "displayName": "Find Customer Quotes",
                    "description": workflowSkillDescription("Find Customer Quotes"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "find-key-internal-sources",
                    "displayName": "Find Key Internal Sources",
                    "description": workflowSkillDescription("Find Key Internal Sources"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "follow-up-after-call",
                    "displayName": "Follow Up After Call",
                    "description": workflowSkillDescription("Follow Up After Call"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "get-rep-call-feedback",
                    "displayName": "Get Rep Call Feedback",
                    "description": workflowSkillDescription("Get Rep Call Feedback"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "hubspot",
                    "displayName": "Hubspot",
                    "description": workflowSkillDescription("Hubspot"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "index",
                    "displayName": "Index",
                    "description": workflowSkillDescription("Index"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "plan-deal-strategy",
                    "displayName": "Plan Deal Strategy",
                    "description": workflowSkillDescription("Plan Deal Strategy"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "prepare-for-meeting",
                    "displayName": "Prepare For Meeting",
                    "description": workflowSkillDescription("Prepare For Meeting"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "prioritize-accounts",
                    "displayName": "Prioritize Accounts",
                    "description": workflowSkillDescription("Prioritize Accounts"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "review-forecast",
                    "displayName": "Review Forecast",
                    "description": workflowSkillDescription("Review Forecast"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "review-rep-call-trends",
                    "displayName": "Review Rep Call Trends",
                    "description": workflowSkillDescription("Review Rep Call Trends"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "sales-company-research",
                    "displayName": "Sales Company Research",
                    "description": workflowSkillDescription("Sales Company Research"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "salesforce",
                    "displayName": "Salesforce",
                    "description": workflowSkillDescription("Salesforce"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "suggest-sales-next-step",
                    "displayName": "Suggest Sales Next Step",
                    "description": workflowSkillDescription("Suggest Sales Next Step"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "user-context",
                    "displayName": "User Context",
                    "description": workflowSkillDescription("User Context"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "zoominfo",
                    "displayName": "Zoominfo",
                    "description": workflowSkillDescription("Zoominfo"),
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "app",
                    "name": "slack",
                    "displayName": "Slack",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "microsoft_teams",
                    "displayName": "Microsoft Teams",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "zoom",
                    "displayName": "Zoom",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "granola",
                    "displayName": "Granola",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "fireflies",
                    "displayName": "Fireflies",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "otter_ai",
                    "displayName": "Otter Ai",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "salesforce",
                    "displayName": "Salesforce",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "hubspot",
                    "displayName": "Hubspot",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "close",
                    "displayName": "Close",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "zoho",
                    "displayName": "Zoho",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "pipedrive",
                    "displayName": "Pipedrive",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "zoominfo",
                    "displayName": "Zoominfo",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "clay",
                    "displayName": "Clay",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "hg_insights",
                    "displayName": "Hg Insights",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "rox",
                    "displayName": "Rox",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "apollo",
                    "displayName": "Apollo",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "actively",
                    "displayName": "Actively",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "meticulate",
                    "displayName": "Meticulate",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "gmail",
                    "displayName": "Gmail",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "outlook_email",
                    "displayName": "Outlook Email",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "outreach",
                    "displayName": "Outreach",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "notion",
                    "displayName": "Notion",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "google_drive",
                    "displayName": "Google Drive",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "microsoft_sharepoint",
                    "displayName": "Microsoft Sharepoint",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "google_calendar",
                    "displayName": "Google Calendar",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "outlook_calendar",
                    "displayName": "Outlook Calendar",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "calendly",
                    "displayName": "Calendly",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "monday",
                    "displayName": "Monday",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "docusign",
                    "displayName": "Docusign",
                    "description": workspaceAppDescription("Sales"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "assistant-template",
                    "name": "sales-assistant",
                    "displayName": "Sales Assistant",
                    "description": assistantTemplateDescription("Sales")
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
      key: "sales-assistant",
      title: "Sales Assistant",
      name: "Sales Assistant",
      description: "更快完成销售准备和跟进工作",
      type: XpertTypeEnum.Agent,
      category: "business",
      icon: {
        type: 'svg',
        value: pluginIcon,
        color: "#FB6A22"
      },
      targetApps: ['xpert'],
      startPrompts: [
      "Let's get started",
      "Prep me for my next customer meeting",
      "Help me prioritize my accounts"
    ],
      dependencies: {
        plugins: [PLUGIN_NAME],
        skills: skillDependencies
      },
      dslContent: JSON.stringify(roleDraft, null, 2)
    }
  ],
  register(ctx) {
    ctx.logger.log(`register sales plugin`)
    return { module: XpertAISalesPluginModule, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log(`sales plugin started`)
  },
  async onStop(ctx) {
    ctx.logger.log(`sales plugin stopped`)
  }
}

export default plugin
