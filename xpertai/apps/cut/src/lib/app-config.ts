import type { PluginMarketplaceAppConfig } from '@xpert-ai/contracts'

export const appConfig = {
  scope: 'organization',
  assistantTemplateKey: 'cut-assistant',
  workspace: {
    mode: 'dedicated',
    name: {
      en_US: 'Cut Workspace',
      zh_Hans: 'Cut 视频剪辑工作空间'
    },
    sharing: 'organization'
  },
  modelRequirements: {
    primary: true
  },
  presentation: {
    tagline: {
      en_US: 'Turn media into a reviewed video timeline',
      zh_Hans: '将素材整理成可审阅的视频时间线'
    },
    longDescription: {
      en_US:
        'Create editing projects, arrange clips, review captions and export video from the shared Assistant and Workbench workflow. Rendering and transcription use their configured runtimes and models.',
      zh_Hans: '创建剪辑项目、编排片段、审阅字幕，并通过助手与工作台导出视频。渲染与转写使用已配置的运行环境和模型。'
    },
    developer: 'XpertAI',
    features: [
      {
        key: 'workspace',
        title: {
          en_US: 'Timeline and captions',
          zh_Hans: '时间线与字幕'
        },
        description: {
          en_US: 'Edit clips and caption drafts with revision-aware operations.',
          zh_Hans: '基于版本修改片段与字幕草稿。'
        }
      }
    ],
    useCases: [
      {
        en_US: 'Video editing and caption review',
        zh_Hans: '视频剪辑与字幕审阅'
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
