import type { PluginMarketplaceAppConfig } from '@xpert-ai/contracts'

export const appConfig = {
  scope: 'organization',
  assistantTemplateKey: 'motion-assistant',
  workspace: {
    mode: 'dedicated',
    name: {
      en_US: 'Motion Workspace',
      zh_Hans: 'Motion 动效工作空间'
    },
    sharing: 'organization'
  },
  modelRequirements: {
    primary: true
  },
  presentation: {
    tagline: {
      en_US: 'Compose animated HTML and motion videos',
      zh_Hans: '创作 HTML 动效与动态视频'
    },
    longDescription: {
      en_US:
        'Build animated compositions with an Assistant, preview them in Workbench and render approved output with the configured HyperFrames runtime.',
      zh_Hans: '通过助手构建动画，在工作台预览，并使用配置好的 HyperFrames 运行环境渲染确认后的结果。'
    },
    developer: 'XpertAI',
    features: [
      {
        key: 'workspace',
        title: {
          en_US: 'Composition and preview',
          zh_Hans: '动画编排与预览'
        },
        description: {
          en_US: 'Edit animation projects and inspect the result before export.',
          zh_Hans: '编辑动画项目，在导出前检查效果。'
        }
      }
    ],
    useCases: [
      {
        en_US: 'Product demos and launch videos',
        zh_Hans: '产品演示与发布视频'
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
