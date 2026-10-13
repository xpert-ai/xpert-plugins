import type { PluginMarketplaceAppConfig } from '@xpert-ai/contracts'

export const appConfig = {
  scope: 'organization',
  assistantTemplateKey: 'drawio-assistant',
  workspace: {
    mode: 'dedicated',
    name: {
      en_US: 'draw.io Workspace',
      zh_Hans: 'draw.io 图表工作空间'
    },
    sharing: 'organization'
  },
  modelRequirements: {
    primary: true
  },
  presentation: {
    tagline: {
      en_US: 'Create diagrams you can keep editing',
      zh_Hans: '创建可继续编辑的图表'
    },
    longDescription: {
      en_US:
        'Generate draw.io diagrams, import Mermaid drafts, refine the XML-backed drawing in Workbench and share reviewed versions.',
      zh_Hans: '生成 draw.io 图表、导入 Mermaid 草稿，在工作台编辑图形并分享审阅后的版本。'
    },
    developer: 'XpertAI',
    features: [
      {
        key: 'workspace',
        title: {
          en_US: 'Structured diagrams',
          zh_Hans: '结构化图表'
        },
        description: {
          en_US: 'Create, inspect and version editable diagram elements.',
          zh_Hans: '创建、检查和版本化可编辑的图表元素。'
        }
      }
    ],
    useCases: [
      {
        en_US: 'Flowcharts and system architecture',
        zh_Hans: '流程图与系统架构'
      }
    ],
    dataScope: {
      en_US:
        'Application resources are scoped to the current organization. Workspace access and sharing follow platform permissions.',
      zh_Hans: '应用资源限定在当前组织范围内；工作空间访问与分享遵循平台权限。'
    },
    initializationSummary: {
      en_US:
        'Create a dedicated workspace and publish the bundled Assistant. Configure any external services separately.',
      zh_Hans: '创建专用工作空间并发布内置助手。所需外部服务需要另行配置。'
    },
    initializationSteps: [
      {
        en_US: 'Create the application workspace',
        zh_Hans: '创建应用工作空间'
      },
      {
        en_US: 'Install the Assistant template and dependencies',
        zh_Hans: '安装助手模板及依赖'
      },
      {
        en_US: 'Publish the Assistant chat entry',
        zh_Hans: '发布助手对话入口'
      }
    ]
  },
  entry: {
    type: 'assistant-chat'
  }
} satisfies PluginMarketplaceAppConfig
