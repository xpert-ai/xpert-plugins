import type { PluginMarketplaceAppConfig } from '@xpert-ai/contracts'

export const appConfig = {
  scope: 'organization',
  assistantTemplateKey: 'docx-editor-assistant',
  workspace: {
    mode: 'dedicated',
    name: {
      en_US: 'DOCX Editor Workspace',
      zh_Hans: 'DOCX 文档编辑工作空间'
    },
    sharing: 'organization'
  },
  modelRequirements: {
    primary: true
  },
  presentation: {
    tagline: {
      en_US: 'Draft and review editable Word documents',
      zh_Hans: '起草和审阅可编辑的 Word 文档'
    },
    longDescription: {
      en_US:
        'Create and edit DOCX documents with an Assistant, inspect them in Workbench, and preserve reviewable versions and controlled sharing.',
      zh_Hans: '通过助手创建和编辑 DOCX 文档，在工作台检查内容，保留可审阅的版本并管理分享。'
    },
    developer: 'XpertAI',
    features: [
      {
        key: 'workspace',
        title: {
          en_US: 'Document editing',
          zh_Hans: '文档编辑'
        },
        description: {
          en_US: 'Inspect, edit and version Word document content.',
          zh_Hans: '检查、编辑和版本化 Word 文档内容。'
        }
      }
    ],
    useCases: [
      {
        en_US: 'Document drafting and review',
        zh_Hans: '文档起草与审核'
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
