import type { PluginMarketplaceAppConfig } from '@xpert-ai/contracts'

export const appConfig = {
  scope: 'organization',
  assistantTemplateKey: 'presentation-studio-assistant',
  workspace: {
    mode: 'dedicated',
    name: {
      en_US: 'Presentation Studio Workspace',
      zh_Hans: '演示文稿工作室工作空间'
    },
    sharing: 'organization'
  },
  modelRequirements: {
    primary: true
  },
  presentation: {
    tagline: {
      en_US: 'Create and refine presentation decks',
      zh_Hans: '创作和完善演示文稿'
    },
    longDescription: {
      en_US:
        'Generate slides from structured content, edit and collaborate in Workbench, then export supported presentation formats with the configured export runtime.',
      zh_Hans: '根据结构化内容生成幻灯片，在工作台编辑和协作，并使用配置好的导出环境输出支持的演示文稿格式。'
    },
    developer: 'XpertAI',
    features: [
      {
        key: 'workspace',
        title: {
          en_US: 'Slides and export',
          zh_Hans: '幻灯片与导出'
        },
        description: {
          en_US: 'Review layouts, collaborate on slides and export finished decks.',
          zh_Hans: '审阅版式、协作编辑幻灯片并导出成稿。'
        }
      }
    ],
    useCases: [
      {
        en_US: 'Business decks and project reports',
        zh_Hans: '商务演示与项目汇报'
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
