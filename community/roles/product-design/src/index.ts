import { z } from 'zod'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { PLUGIN_NAME, pluginIcon } from './lib/constants'
import { XpertAIProductDesignPluginModule } from './lib/role-plugin.module'

const ConfigSchema = z.object({})
const AGENT_KEY = "Agent_XpertAIProductDesign"
const skillDependencies = [
  {
    "componentKey": "audit",
    "targetAgentKey": "Agent_XpertAIProductDesign"
  },
  {
    "componentKey": "design-qa",
    "targetAgentKey": "Agent_XpertAIProductDesign"
  },
  {
    "componentKey": "get-context",
    "targetAgentKey": "Agent_XpertAIProductDesign"
  },
  {
    "componentKey": "ideate",
    "targetAgentKey": "Agent_XpertAIProductDesign"
  },
  {
    "componentKey": "image-to-code",
    "targetAgentKey": "Agent_XpertAIProductDesign"
  },
  {
    "componentKey": "index",
    "targetAgentKey": "Agent_XpertAIProductDesign"
  },
  {
    "componentKey": "prototype",
    "targetAgentKey": "Agent_XpertAIProductDesign"
  },
  {
    "componentKey": "research",
    "targetAgentKey": "Agent_XpertAIProductDesign"
  },
  {
    "componentKey": "share",
    "targetAgentKey": "Agent_XpertAIProductDesign"
  },
  {
    "componentKey": "url-to-code",
    "targetAgentKey": "Agent_XpertAIProductDesign"
  },
  {
    "componentKey": "user-context",
    "targetAgentKey": "Agent_XpertAIProductDesign"
  }
]

const roleAgent = {
  key: AGENT_KEY,
  name: "product_design",
  title: "Product Design",
  description: "Explore and prototype ideas",
  avatar: {
  "emoji": {
    "id": "pen-tool"
  },
  "background": "#FF66AD1F"
},
  prompt: "You are a product design assistant.\nUse the installed Product Design skills to clarify briefs, research references, audit flows, ideate directions, prototype from URLs or screenshots, and prepare shareable design work.\nAsk for missing constraints before building and compare visual directions when the brief is open-ended.\nKeep recommendations practical for product teams and call out accessibility, usability, and implementation risks.",
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
    name: "Product Design Assistant",
    title: "Product Design Assistant",
    description: "Explore and prototype ideas",
    type: XpertTypeEnum.Agent,
    avatar: {
  "emoji": {
    "id": "pen-tool"
  },
  "background": "#FF66AD1F"
},
    starters: [
      "Help me get started",
      "Turn this product idea into three visual directions",
      "Clone this URL into an editable prototype"
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
    version: "0.1.41",
    level: 'organization',
    category: "tools",
    icon: {
      type: 'svg',
      value: pluginIcon,
      color: "#FF66AD"
    },
    displayName: "Product Design",
    description: "The Product Design plugin is built for turning early ideas into prototypes teams can review. It starts design and build work by confirming the brief, then helps teams explore product directions, audit user flows, prototype from a live URL, and make static screenshots interactive.",
    keywords: [
      "prototype",
      "frontend",
      "ux-research",
      "ux-audit",
      "accessibility-audit",
      "research",
      "context-gathering",
      "ideation",
      "image-generation",
      "prototype"
    ],
    author: 'XpertAI',
    homepage: "https://github.com/xpert-ai/xpert-plugins/tree/main/community/roles/product-design",
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
          "prototype",
          "frontend",
          "ux-research",
          "ux-audit",
          "accessibility-audit",
          "research",
          "context-gathering",
          "ideation"
        ],
        marketplace: {
          contents: [
          {
                    "type": "skill",
                    "name": "audit",
                    "displayName": "Audit",
                    "description": "Audit workflow skill.",
                    "tags": [
                              "skill",
                              "product-design"
                    ]
          },
          {
                    "type": "skill",
                    "name": "design-qa",
                    "displayName": "Design Qa",
                    "description": "Design Qa workflow skill.",
                    "tags": [
                              "skill",
                              "product-design"
                    ]
          },
          {
                    "type": "skill",
                    "name": "get-context",
                    "displayName": "Get Context",
                    "description": "Get Context workflow skill.",
                    "tags": [
                              "skill",
                              "product-design"
                    ]
          },
          {
                    "type": "skill",
                    "name": "ideate",
                    "displayName": "Ideate",
                    "description": "Ideate workflow skill.",
                    "tags": [
                              "skill",
                              "product-design"
                    ]
          },
          {
                    "type": "skill",
                    "name": "image-to-code",
                    "displayName": "Image To Code",
                    "description": "Image To Code workflow skill.",
                    "tags": [
                              "skill",
                              "product-design"
                    ]
          },
          {
                    "type": "skill",
                    "name": "index",
                    "displayName": "Index",
                    "description": "Index workflow skill.",
                    "tags": [
                              "skill",
                              "product-design"
                    ]
          },
          {
                    "type": "skill",
                    "name": "prototype",
                    "displayName": "Prototype",
                    "description": "Prototype workflow skill.",
                    "tags": [
                              "skill",
                              "product-design"
                    ]
          },
          {
                    "type": "skill",
                    "name": "research",
                    "displayName": "Research",
                    "description": "Research workflow skill.",
                    "tags": [
                              "skill",
                              "product-design"
                    ]
          },
          {
                    "type": "skill",
                    "name": "share",
                    "displayName": "Share",
                    "description": "Share workflow skill.",
                    "tags": [
                              "skill",
                              "product-design"
                    ]
          },
          {
                    "type": "skill",
                    "name": "url-to-code",
                    "displayName": "Url To Code",
                    "description": "Url To Code workflow skill.",
                    "tags": [
                              "skill",
                              "product-design"
                    ]
          },
          {
                    "type": "skill",
                    "name": "user-context",
                    "displayName": "User Context",
                    "description": "User Context workflow skill.",
                    "tags": [
                              "skill",
                              "product-design"
                    ]
          },
          {
                    "type": "app",
                    "name": "sites",
                    "displayName": "Sites",
                    "description": "Workspace app connector requirement for Product Design.",
                    "tags": [
                              "app",
                              "required"
                    ]
          },
          {
                    "type": "assistant-template",
                    "name": "product-design-assistant",
                    "displayName": "Product Design Assistant",
                    "description": "Assistant template for Product Design workflows."
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
      key: "product-design-assistant",
      title: "Product Design Assistant",
      name: "Product Design Assistant",
      description: "Explore and prototype ideas",
      type: XpertTypeEnum.Agent,
      category: "design",
      icon: {
        type: 'svg',
        value: pluginIcon,
        color: "#FF66AD"
      },
      targetApps: ['xpert'],
      startPrompts: [
      "Help me get started",
      "Turn this product idea into three visual directions",
      "Clone this URL into an editable prototype"
    ],
      dependencies: {
        plugins: [PLUGIN_NAME],
        skills: skillDependencies
      },
      dslContent: JSON.stringify(roleDraft, null, 2)
    }
  ],
  register(ctx) {
    ctx.logger.log(`register product-design plugin`)
    return { module: XpertAIProductDesignPluginModule, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log(`product-design plugin started`)
  },
  async onStop(ctx) {
    ctx.logger.log(`product-design plugin stopped`)
  }
}

export default plugin
