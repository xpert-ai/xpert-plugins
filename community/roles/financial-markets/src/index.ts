import { z } from 'zod'
import { XpertTypeEnum, type I18nObject } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAME, pluginIcon } from './lib/constants'
import { XpertAIFinancialMarketsPluginModule } from './lib/role-plugin.module'

const ConfigSchema = z.object({})
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const workflowSkillDescription = (name: string) => text(`${name} workflow skill.`, `${name} 工作流技能。`)
const workspaceAppDescription = (role: string) => text(`Workspace app connector requirement for ${role}.`, `${role} 所需的工作区应用连接器。`)
const assistantTemplateDescription = (role: string) => text(`Assistant template for ${role} workflows.`, `面向 ${role} 工作流的助手模板。`)
const AGENT_KEY = "Agent_XpertAIFinancialMarkets"
const skillDependencies = [
  {
    "componentKey": "catalyst-calendar",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "company-tearsheet",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "comps-valuation",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "dcf-model-builder",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "deck-report-qc",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "earnings-deep-dive",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "earnings-preview",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "economic-impact-report",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "equity-model-update",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "event-driven-analyzer",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "financials-normalizer",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "idea-generation",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "initiating-coverage",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "long-short-pitch",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "meeting-prep",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "memo-builder",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "model-audit-tieout",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "portfolio-risk-management",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "public-equity-investing",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "scenario-sensitivity-generator",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "thesis-tracker",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "three-statement-model-builder",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  },
  {
    "componentKey": "user-context",
    "targetAgentKey": "Agent_XpertAIFinancialMarkets"
  }
]

const roleAgent = {
  key: AGENT_KEY,
  name: "financial_markets",
  title: "Financial Markets",
  description: text("Public equity PM research, long/short, earnings, ETF/index diligence, and memos", "面向公开市场投资研究、多空策略、财报、ETF/指数尽调和备忘录的助手"),
  avatar: {
  "emoji": {
    "id": "landmark"
  },
  "background": "#04B84C1F"
},
  prompt: "You are a financial markets research assistant.\nUse the installed Financial Markets skills to research listed companies, earnings, valuation, catalysts, portfolio risk, investment memos, and long/short pitches.\nSeparate evidence from interpretation, identify what is priced in, and explain what would prove or weaken the thesis.\nFlag missing sources, stale data, uncertainty, and investment risks before giving conclusions.",
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
    name: "Financial Markets Assistant",
    title: "Financial Markets Assistant",
    description: text("Public equity PM research, long/short, earnings, ETF/index diligence, and memos", "面向公开市场投资研究、多空策略、财报、ETF/指数尽调和备忘录的助手"),
    type: XpertTypeEnum.Agent,
    avatar: {
  "emoji": {
    "id": "landmark"
  },
  "background": "#04B84C1F"
},
    starters: [
      "Help me get started",
      "Analyze Apple's latest earnings: what changed, what is priced in, and what should an investor watch next",
      "Screen listed-equity beneficiaries of AI data-center power demand and rank the best ideas, risks, and false positives"
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
    version: "0.1.27",
    level: 'organization',
    category: "tools",
    icon: {
      type: 'svg',
      value: pluginIcon,
      color: "#04B84C"
    },
    displayName: "Financial Markets",
    description: "Public equity investing workflows for listed-company research, earnings analysis, valuation, model updates, long/short pitches, catalysts, thesis tracking, ETF/index and constituent diligence, sell-side research notes, risk sizing, hedging, dashboards, and investment memos.",
    keywords: [
      "financial-markets",
      "public-equity-investing",
      "public-equity",
      "listed-equities",
      "equity-research",
      "long-only",
      "hedge-fund",
      "long-short",
      "earnings",
      "valuation",
      "catalysts",
      "investment-memo",
      "etf-index-diligence",
      "benchmark-relative-equity",
      "sell-side-research",
      "public-equity-diligence",
      "portfolio-manager"
    ],
    author: 'XpertAI',
    homepage: "https://github.com/xpert-ai/xpert-plugins/tree/main/community/roles/financial-markets",
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
          "financial-markets",
          "public-equity-investing",
          "public-equity",
          "listed-equities",
          "equity-research",
          "long-only",
          "hedge-fund",
          "long-short"
        ],
        marketplace: {
          contents: [
          {
                    "type": "skill",
                    "name": "catalyst-calendar",
                    "displayName": "Catalyst Calendar",
                    "description": workflowSkillDescription("Catalyst Calendar"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "company-tearsheet",
                    "displayName": "Company Tearsheet",
                    "description": workflowSkillDescription("Company Tearsheet"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "comps-valuation",
                    "displayName": "Comps Valuation",
                    "description": workflowSkillDescription("Comps Valuation"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "dcf-model-builder",
                    "displayName": "Dcf Model Builder",
                    "description": workflowSkillDescription("Dcf Model Builder"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "deck-report-qc",
                    "displayName": "Deck Report Qc",
                    "description": workflowSkillDescription("Deck Report Qc"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "earnings-deep-dive",
                    "displayName": "Earnings Deep Dive",
                    "description": workflowSkillDescription("Earnings Deep Dive"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "earnings-preview",
                    "displayName": "Earnings Preview",
                    "description": workflowSkillDescription("Earnings Preview"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "economic-impact-report",
                    "displayName": "Economic Impact Report",
                    "description": workflowSkillDescription("Economic Impact Report"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "equity-model-update",
                    "displayName": "Equity Model Update",
                    "description": workflowSkillDescription("Equity Model Update"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "event-driven-analyzer",
                    "displayName": "Event Driven Analyzer",
                    "description": workflowSkillDescription("Event Driven Analyzer"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "financials-normalizer",
                    "displayName": "Financials Normalizer",
                    "description": workflowSkillDescription("Financials Normalizer"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "idea-generation",
                    "displayName": "Idea Generation",
                    "description": workflowSkillDescription("Idea Generation"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "initiating-coverage",
                    "displayName": "Initiating Coverage",
                    "description": workflowSkillDescription("Initiating Coverage"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "long-short-pitch",
                    "displayName": "Long Short Pitch",
                    "description": workflowSkillDescription("Long Short Pitch"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "meeting-prep",
                    "displayName": "Meeting Prep",
                    "description": workflowSkillDescription("Meeting Prep"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "memo-builder",
                    "displayName": "Memo Builder",
                    "description": workflowSkillDescription("Memo Builder"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "model-audit-tieout",
                    "displayName": "Model Audit Tieout",
                    "description": workflowSkillDescription("Model Audit Tieout"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "portfolio-risk-management",
                    "displayName": "Portfolio Risk Management",
                    "description": workflowSkillDescription("Portfolio Risk Management"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "public-equity-investing",
                    "displayName": "Public Equity Investing",
                    "description": workflowSkillDescription("Public Equity Investing"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "scenario-sensitivity-generator",
                    "displayName": "Scenario Sensitivity Generator",
                    "description": workflowSkillDescription("Scenario Sensitivity Generator"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "thesis-tracker",
                    "displayName": "Thesis Tracker",
                    "description": workflowSkillDescription("Thesis Tracker"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "three-statement-model-builder",
                    "displayName": "Three Statement Model Builder",
                    "description": workflowSkillDescription("Three Statement Model Builder"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "user-context",
                    "displayName": "User Context",
                    "description": workflowSkillDescription("User Context"),
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "app",
                    "name": "slack",
                    "displayName": "Slack",
                    "description": workspaceAppDescription("Financial Markets"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "pitchbook",
                    "displayName": "Pitchbook",
                    "description": workspaceAppDescription("Financial Markets"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "factset",
                    "displayName": "Factset",
                    "description": workspaceAppDescription("Financial Markets"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "morningstar",
                    "displayName": "Morningstar",
                    "description": workspaceAppDescription("Financial Markets"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "lseg",
                    "displayName": "Lseg",
                    "description": workspaceAppDescription("Financial Markets"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "s-p",
                    "displayName": "S P",
                    "description": workspaceAppDescription("Financial Markets"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "third-bridge",
                    "displayName": "Third Bridge",
                    "description": workspaceAppDescription("Financial Markets"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "daloopa",
                    "displayName": "Daloopa",
                    "description": workspaceAppDescription("Financial Markets"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "quartr",
                    "displayName": "Quartr",
                    "description": workspaceAppDescription("Financial Markets"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "alpaca",
                    "displayName": "Alpaca",
                    "description": workspaceAppDescription("Financial Markets"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "google_drive",
                    "displayName": "Google Drive",
                    "description": workspaceAppDescription("Financial Markets"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "gmail_connector",
                    "displayName": "Gmail Connector",
                    "description": workspaceAppDescription("Financial Markets"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "outlook_email_connector",
                    "displayName": "Outlook Email Connector",
                    "description": workspaceAppDescription("Financial Markets"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "sharepoint_connector",
                    "displayName": "Sharepoint Connector",
                    "description": workspaceAppDescription("Financial Markets"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "teams_connector",
                    "displayName": "Teams Connector",
                    "description": workspaceAppDescription("Financial Markets"),
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "assistant-template",
                    "name": "financial-markets-assistant",
                    "displayName": "Financial Markets Assistant",
                    "description": assistantTemplateDescription("Financial Markets")
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
      key: "financial-markets-assistant",
      title: "Financial Markets Assistant",
      name: "Financial Markets Assistant",
      description: "公开市场投资研究、多空策略、财报、ETF/指数尽调和备忘录助手",
      type: XpertTypeEnum.Agent,
      category: "business",
      icon: {
        type: 'svg',
        value: pluginIcon,
        color: "#04B84C"
      },
      targetApps: ['xpert'],
      startPrompts: [
      "Help me get started",
      "Analyze Apple's latest earnings: what changed, what is priced in, and what should an investor watch next",
      "Screen listed-equity beneficiaries of AI data-center power demand and rank the best ideas, risks, and false positives"
    ],
      dependencies: {
        plugins: [PLUGIN_NAME],
        skills: skillDependencies
      },
      dslContent: JSON.stringify(roleDraft, null, 2)
    }
  ],
  register(ctx) {
    ctx.logger.log(`register financial-markets plugin`)
    return { module: XpertAIFinancialMarketsPluginModule, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log(`financial-markets plugin started`)
  },
  async onStop(ctx) {
    ctx.logger.log(`financial-markets plugin stopped`)
  }
}

export default plugin
