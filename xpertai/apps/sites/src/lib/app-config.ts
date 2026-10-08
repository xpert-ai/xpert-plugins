import type { PluginMarketplaceAppConfig } from '@xpert-ai/contracts'

export const appConfig = {
  scope: 'organization',
  assistantTemplateKey: 'sites-builder-assistant',
  workspace: {
    mode: 'dedicated',
    name: {
      en_US: 'Sites Workspace',
      zh_Hans: 'Sites 站点工作空间'
    },
    sharing: 'organization'
  },
  modelRequirements: {
    primary: true
  },
  presentation: {
    tagline: {
      en_US: 'Build and manage hosted websites',
      zh_Hans: '构建和管理托管网站'
    },
    longDescription: {
      en_US:
        'Create site projects, save candidate versions, inspect previews and manage deployments and access with the configured hosting backend.',
      zh_Hans: '创建站点项目、保存候选版本、检查预览，并使用已配置的托管后端管理发布与访问权限。'
    },
    developer: 'XpertAI',
    features: [
      {
        key: 'workspace',
        title: {
          en_US: 'Versions and hosting',
          zh_Hans: '版本与托管'
        },
        description: {
          en_US: 'Review saved versions before publishing and manage site access.',
          zh_Hans: '发布前审阅保存的版本，并管理站点访问权限。'
        }
      }
    ],
    useCases: [
      {
        en_US: 'Portals, dashboards and project sites',
        zh_Hans: '门户、看板与项目网站'
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
