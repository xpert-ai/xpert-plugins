import type { PluginMarketplaceAppConfig } from '@xpert-ai/contracts'

export const appConfig = {
  scope: 'organization',
  assistantTemplateKey: 'pencil-assistant',
  workspace: {
    mode: 'dedicated',
    name: {
      en_US: 'Pencil Workspace',
      zh_Hans: 'Pencil 设计工作空间'
    },
    sharing: 'organization'
  },
  modelRequirements: {
    primary: true
  },
  presentation: {
    tagline: {
      en_US: 'Design editable interfaces with an Assistant',
      zh_Hans: '与助手共同设计可编辑的界面'
    },
    longDescription: {
      en_US:
        'Create multi-page designs, refine layers and layouts collaboratively, import design files and export reviewed versions from Pencil Workbench.',
      zh_Hans: '创建多页面设计、协作调整图层与布局、导入设计文件，并在 Pencil 工作台导出审阅后的版本。'
    },
    developer: 'XpertAI',
    features: [
      {
        key: 'workspace',
        title: {
          en_US: 'Design canvas',
          zh_Hans: '设计画布'
        },
        description: {
          en_US: 'Edit pages, components and layouts in a live collaborative canvas.',
          zh_Hans: '在实时协作画布中编辑页面、组件与布局。'
        }
      }
    ],
    useCases: [
      {
        en_US: 'Interface design and prototypes',
        zh_Hans: '界面设计与原型'
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
