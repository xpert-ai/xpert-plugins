import type { PluginMarketplaceAppConfig } from '@xpert-ai/contracts'

export const appConfig = {
  scope: 'organization',
  assistantTemplateKey: 'story-studio-assistant',
  workspace: {
    mode: 'dedicated',
    name: {
      en_US: 'Story Studio Workspace',
      zh_Hans: '故事工作室工作空间'
    },
    sharing: 'organization'
  },
  modelRequirements: {
    primary: true
  },
  presentation: {
    tagline: {
      en_US: 'Develop stories into reviewable video plans',
      zh_Hans: '将故事发展为可审阅的视频方案'
    },
    longDescription: {
      en_US:
        'Plan stories, scripts and shots with an Assistant, review production artifacts in Workbench and prepare a structured handoff to Cut. Video generation uses separately configured provider tools.',
      zh_Hans:
        '与助手规划故事、剧本和镜头，在工作台审阅制作产物，并准备向 Cut 交接的结构化内容。视频生成使用另行配置的提供商工具。'
    },
    developer: 'XpertAI',
    features: [
      {
        key: 'workspace',
        title: {
          en_US: 'Story production',
          zh_Hans: '故事制作'
        },
        description: {
          en_US: 'Manage story projects, review workflow stages and prepare editing handoffs.',
          zh_Hans: '管理故事项目、审阅工作流阶段并准备剪辑交接。'
        }
      }
    ],
    useCases: [
      {
        en_US: 'Storyboards and video production planning',
        zh_Hans: '分镜与视频制作规划'
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
