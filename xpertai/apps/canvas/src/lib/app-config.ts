import type { PluginMarketplaceAppConfig } from '@xpert-ai/contracts'

export const appConfig = {
  scope: 'organization',
  assistantTemplateKey: 'canvas-assistant',
  workspace: {
    mode: 'dedicated',
    name: {
      en_US: 'Canvas Workspace',
      zh_Hans: 'Canvas 画布工作空间'
    },
    sharing: 'organization'
  },
  modelRequirements: {
    primary: true
  },
  presentation: {
    tagline: {
      en_US: 'Explore ideas on an editable visual canvas',
      zh_Hans: '在可编辑的可视化画布中探索创意'
    },
    longDescription: {
      en_US:
        'Create whiteboards, moodboards, image holders and annotations with an Assistant, then review and refine the same canvas in Workbench. Image generation uses separately configured model tools.',
      zh_Hans:
        '与助手共同创建白板、情绪板、图片占位与标注，在工作台继续审阅和编辑画布。图片生成使用另行配置的模型工具。'
    },
    developer: 'XpertAI',
    features: [
      {
        key: 'workspace',
        title: {
          en_US: 'Visual collaboration',
          zh_Hans: '可视化协作'
        },
        description: {
          en_US: 'Edit structured canvas elements and review intentional versions.',
          zh_Hans: '编辑结构化画布元素，审阅主动保存的版本。'
        }
      }
    ],
    useCases: [
      {
        en_US: 'Whiteboards and moodboards',
        zh_Hans: '白板与情绪板'
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
