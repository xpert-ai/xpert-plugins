import type { PluginMarketplaceAppConfig } from '@xpert-ai/contracts'
export const appConfig: PluginMarketplaceAppConfig = {
  scope: 'organization',
  assistantTemplateKey: 'db-studio-assistant',
  workspace: {
    mode: 'dedicated',
    name: {
      en_US: 'DB Studio Workspace',
      zh_Hans: 'DB Studio 工作空间',
    },
    sharing: 'organization',
  },
  modelRequirements: {
    primary: true,
  },
  presentation: {
    tagline: {
      en_US: 'Your database workspace, with an Agent',
      zh_Hans: '数据库工作区，原生智能体协同',
    },
    developer: 'XpertAI',
    features: [
      {
        key: 'sql',
        title: {
          en_US: 'SQL and objects',
          zh_Hans: 'SQL 与对象',
        },
        description: {
          en_US: 'Query and inspect real metadata',
          zh_Hans: '查询与真实结构元数据',
        },
      },
      {
        key: 'governance',
        title: {
          en_US: 'Governed execution',
          zh_Hans: '受控执行',
        },
        description: {
          en_US: 'Frozen plans, scoped policies and durable receipts',
          zh_Hans: '冻结计划、连接策略与执行回执',
        },
      },
    ],
  },
}
