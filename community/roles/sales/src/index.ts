import { z } from 'zod'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAME, pluginIcon } from './lib/constants'
import { XpertAISalesPluginModule } from './lib/role-plugin.module'

const ConfigSchema = z.object({})
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
  description: "Prepare sales work faster",
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
    description: "Prepare sales work faster",
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
                    "description": "Analyze Account Signals workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "build-business-case",
                    "displayName": "Build Business Case",
                    "description": "Build Business Case workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "build-competitive-brief",
                    "displayName": "Build Competitive Brief",
                    "description": "Build Competitive Brief workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "enrich-company-and-contact-data",
                    "displayName": "Enrich Company And Contact Data",
                    "description": "Enrich Company And Contact Data workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "find-customer-quotes",
                    "displayName": "Find Customer Quotes",
                    "description": "Find Customer Quotes workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "find-key-internal-sources",
                    "displayName": "Find Key Internal Sources",
                    "description": "Find Key Internal Sources workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "follow-up-after-call",
                    "displayName": "Follow Up After Call",
                    "description": "Follow Up After Call workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "get-rep-call-feedback",
                    "displayName": "Get Rep Call Feedback",
                    "description": "Get Rep Call Feedback workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "hubspot",
                    "displayName": "Hubspot",
                    "description": "Hubspot workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "index",
                    "displayName": "Index",
                    "description": "Index workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "plan-deal-strategy",
                    "displayName": "Plan Deal Strategy",
                    "description": "Plan Deal Strategy workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "prepare-for-meeting",
                    "displayName": "Prepare For Meeting",
                    "description": "Prepare For Meeting workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "prioritize-accounts",
                    "displayName": "Prioritize Accounts",
                    "description": "Prioritize Accounts workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "review-forecast",
                    "displayName": "Review Forecast",
                    "description": "Review Forecast workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "review-rep-call-trends",
                    "displayName": "Review Rep Call Trends",
                    "description": "Review Rep Call Trends workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "sales-company-research",
                    "displayName": "Sales Company Research",
                    "description": "Sales Company Research workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "salesforce",
                    "displayName": "Salesforce",
                    "description": "Salesforce workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "suggest-sales-next-step",
                    "displayName": "Suggest Sales Next Step",
                    "description": "Suggest Sales Next Step workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "user-context",
                    "displayName": "User Context",
                    "description": "User Context workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "skill",
                    "name": "zoominfo",
                    "displayName": "Zoominfo",
                    "description": "Zoominfo workflow skill.",
                    "tags": [
                              "skill",
                              "sales"
                    ]
          },
          {
                    "type": "app",
                    "name": "slack",
                    "displayName": "Slack",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "microsoft_teams",
                    "displayName": "Microsoft Teams",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "zoom",
                    "displayName": "Zoom",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "granola",
                    "displayName": "Granola",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "fireflies",
                    "displayName": "Fireflies",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "otter_ai",
                    "displayName": "Otter Ai",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "salesforce",
                    "displayName": "Salesforce",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "hubspot",
                    "displayName": "Hubspot",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "close",
                    "displayName": "Close",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "zoho",
                    "displayName": "Zoho",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "pipedrive",
                    "displayName": "Pipedrive",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "zoominfo",
                    "displayName": "Zoominfo",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "clay",
                    "displayName": "Clay",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "hg_insights",
                    "displayName": "Hg Insights",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "rox",
                    "displayName": "Rox",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "apollo",
                    "displayName": "Apollo",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "actively",
                    "displayName": "Actively",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "meticulate",
                    "displayName": "Meticulate",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "gmail",
                    "displayName": "Gmail",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "outlook_email",
                    "displayName": "Outlook Email",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "outreach",
                    "displayName": "Outreach",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "notion",
                    "displayName": "Notion",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "google_drive",
                    "displayName": "Google Drive",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "microsoft_sharepoint",
                    "displayName": "Microsoft Sharepoint",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "google_calendar",
                    "displayName": "Google Calendar",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "outlook_calendar",
                    "displayName": "Outlook Calendar",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "calendly",
                    "displayName": "Calendly",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "monday",
                    "displayName": "Monday",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "docusign",
                    "displayName": "Docusign",
                    "description": "Workspace app connector requirement for Sales.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "assistant-template",
                    "name": "sales-assistant",
                    "displayName": "Sales Assistant",
                    "description": "Assistant template for Sales workflows."
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
      description: "Prepare sales work faster",
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
