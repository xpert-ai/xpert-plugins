import { z } from 'zod'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAME, pluginIcon } from './lib/constants'
import { XpertAIFinancialMarketsPluginModule } from './lib/role-plugin.module'

const ConfigSchema = z.object({})
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
  description: "Public equity PM research, long/short, earnings, ETF/index diligence, and memos",
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
    description: "Public equity PM research, long/short, earnings, ETF/index diligence, and memos",
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
                    "description": "Catalyst Calendar workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "company-tearsheet",
                    "displayName": "Company Tearsheet",
                    "description": "Company Tearsheet workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "comps-valuation",
                    "displayName": "Comps Valuation",
                    "description": "Comps Valuation workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "dcf-model-builder",
                    "displayName": "Dcf Model Builder",
                    "description": "Dcf Model Builder workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "deck-report-qc",
                    "displayName": "Deck Report Qc",
                    "description": "Deck Report Qc workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "earnings-deep-dive",
                    "displayName": "Earnings Deep Dive",
                    "description": "Earnings Deep Dive workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "earnings-preview",
                    "displayName": "Earnings Preview",
                    "description": "Earnings Preview workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "economic-impact-report",
                    "displayName": "Economic Impact Report",
                    "description": "Economic Impact Report workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "equity-model-update",
                    "displayName": "Equity Model Update",
                    "description": "Equity Model Update workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "event-driven-analyzer",
                    "displayName": "Event Driven Analyzer",
                    "description": "Event Driven Analyzer workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "financials-normalizer",
                    "displayName": "Financials Normalizer",
                    "description": "Financials Normalizer workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "idea-generation",
                    "displayName": "Idea Generation",
                    "description": "Idea Generation workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "initiating-coverage",
                    "displayName": "Initiating Coverage",
                    "description": "Initiating Coverage workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "long-short-pitch",
                    "displayName": "Long Short Pitch",
                    "description": "Long Short Pitch workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "meeting-prep",
                    "displayName": "Meeting Prep",
                    "description": "Meeting Prep workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "memo-builder",
                    "displayName": "Memo Builder",
                    "description": "Memo Builder workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "model-audit-tieout",
                    "displayName": "Model Audit Tieout",
                    "description": "Model Audit Tieout workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "portfolio-risk-management",
                    "displayName": "Portfolio Risk Management",
                    "description": "Portfolio Risk Management workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "public-equity-investing",
                    "displayName": "Public Equity Investing",
                    "description": "Public Equity Investing workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "scenario-sensitivity-generator",
                    "displayName": "Scenario Sensitivity Generator",
                    "description": "Scenario Sensitivity Generator workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "thesis-tracker",
                    "displayName": "Thesis Tracker",
                    "description": "Thesis Tracker workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "three-statement-model-builder",
                    "displayName": "Three Statement Model Builder",
                    "description": "Three Statement Model Builder workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "skill",
                    "name": "user-context",
                    "displayName": "User Context",
                    "description": "User Context workflow skill.",
                    "tags": [
                              "skill",
                              "financial-markets"
                    ]
          },
          {
                    "type": "app",
                    "name": "slack",
                    "displayName": "Slack",
                    "description": "Workspace app connector requirement for Financial Markets.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "pitchbook",
                    "displayName": "Pitchbook",
                    "description": "Workspace app connector requirement for Financial Markets.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "factset",
                    "displayName": "Factset",
                    "description": "Workspace app connector requirement for Financial Markets.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "morningstar",
                    "displayName": "Morningstar",
                    "description": "Workspace app connector requirement for Financial Markets.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "lseg",
                    "displayName": "Lseg",
                    "description": "Workspace app connector requirement for Financial Markets.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "s-p",
                    "displayName": "S P",
                    "description": "Workspace app connector requirement for Financial Markets.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "third-bridge",
                    "displayName": "Third Bridge",
                    "description": "Workspace app connector requirement for Financial Markets.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "daloopa",
                    "displayName": "Daloopa",
                    "description": "Workspace app connector requirement for Financial Markets.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "quartr",
                    "displayName": "Quartr",
                    "description": "Workspace app connector requirement for Financial Markets.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "alpaca",
                    "displayName": "Alpaca",
                    "description": "Workspace app connector requirement for Financial Markets.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "google_drive",
                    "displayName": "Google Drive",
                    "description": "Workspace app connector requirement for Financial Markets.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "gmail_connector",
                    "displayName": "Gmail Connector",
                    "description": "Workspace app connector requirement for Financial Markets.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "outlook_email_connector",
                    "displayName": "Outlook Email Connector",
                    "description": "Workspace app connector requirement for Financial Markets.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "sharepoint_connector",
                    "displayName": "Sharepoint Connector",
                    "description": "Workspace app connector requirement for Financial Markets.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "app",
                    "name": "teams_connector",
                    "displayName": "Teams Connector",
                    "description": "Workspace app connector requirement for Financial Markets.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "assistant-template",
                    "name": "financial-markets-assistant",
                    "displayName": "Financial Markets Assistant",
                    "description": "Assistant template for Financial Markets workflows."
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
      description: "Public equity PM research, long/short, earnings, ETF/index diligence, and memos",
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
