import type { PluginMarketplaceAppConfig } from '@xpert-ai/contracts'

export const appConfig = {
  scope: 'organization',
  assistantTemplateKey: 'office-cli-assistant',
  workspace: {
    mode: 'dedicated',
    name: {
      en_US: 'OfficeCLI Workspace',
      zh_Hans: 'OfficeCLI 办公助手工作空间'
    },
    sharing: 'organization'
  },
  modelRequirements: {
    primary: true
  },
  presentation: {
    tagline: {
      en_US: 'Create and inspect native Office files',
      zh_Hans: '创建和检查原生 Office 文件'
    },
    longDescription: {
      en_US:
        'Use the OfficeCLI Assistant to create, inspect, edit and render DOCX, XLSX and PPTX files with the configured document runtime.',
      zh_Hans: '通过 OfficeCLI 助手和已配置的文档运行环境创建、检查、编辑和渲染 DOCX、XLSX、PPTX 文件。'
    },
    developer: 'XpertAI',
    features: [
      {
        key: 'workspace',
        title: {
          en_US: 'Native Office workflows',
          zh_Hans: '原生 Office 工作流'
        },
        description: {
          en_US: 'Work with document structures and rendered previews.',
          zh_Hans: '处理文档结构并检查渲染预览。'
        }
      }
    ],
    useCases: [
      {
        en_US: 'Reports, spreadsheets and presentations',
        zh_Hans: '报告、电子表格与演示文稿'
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
