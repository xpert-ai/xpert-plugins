import type { PluginMarketplaceAppConfig } from '@xpert-ai/contracts'

export const appConfig = {
  scope: 'organization',
  assistantTemplateKey: 'office-editor-assistant',
  workspace: {
    mode: 'dedicated',
    name: {
      en_US: 'Office Editor Workspace',
      zh_Hans: 'Office 协作编辑工作空间'
    },
    sharing: 'organization'
  },
  modelRequirements: {
    primary: true
  },
  presentation: {
    tagline: {
      en_US: 'Review Office documents with your Assistant',
      zh_Hans: '与助手共同审阅 Office 文档'
    },
    longDescription: {
      en_US:
        'Open supported Office documents in Workbench, collaborate on edits and queue Assistant changes using the configured editor service.',
      zh_Hans: '在工作台打开支持的 Office 文档、协作编辑，并通过已配置的编辑器服务处理助手修改。'
    },
    developer: 'XpertAI',
    features: [
      {
        key: 'workspace',
        title: {
          en_US: 'Collaborative editing',
          zh_Hans: '协作编辑'
        },
        description: {
          en_US: 'Review documents and coordinate human and Assistant edits.',
          zh_Hans: '审阅文档并协调用户与助手的修改。'
        }
      }
    ],
    useCases: [
      {
        en_US: 'Office document collaboration',
        zh_Hans: 'Office 文档协作'
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
