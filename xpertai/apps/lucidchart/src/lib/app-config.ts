import type { PluginMarketplaceAppConfig } from '@xpert-ai/contracts'

export const appConfig = {
  scope: 'organization',
  assistantTemplateKey: 'lucidchart-assistant',
  workspace: {
    mode: 'dedicated',
    name: {
      en_US: 'Lucidchart Workspace',
      zh_Hans: 'Lucidchart 图表工作空间'
    },
    sharing: 'organization'
  },
  modelRequirements: {
    primary: true
  },
  presentation: {
    tagline: {
      en_US: 'Build structured diagrams with an Assistant',
      zh_Hans: '与助手共同构建结构化图表'
    },
    longDescription: {
      en_US:
        'Create and review structured diagrams, import supported drawing formats, edit in Workbench and preserve versions for sharing.',
      zh_Hans: '创建和审阅结构化图表、导入支持的图形格式，在工作台编辑并保存可分享的版本。'
    },
    developer: 'XpertAI',
    features: [
      {
        key: 'workspace',
        title: {
          en_US: 'Diagram workbench',
          zh_Hans: '图表工作台'
        },
        description: {
          en_US: 'Review and refine diagrams with persistent versions.',
          zh_Hans: '审阅和完善图表，保留持久化版本。'
        }
      }
    ],
    useCases: [
      {
        en_US: 'Process and architecture diagrams',
        zh_Hans: '流程与架构图'
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
