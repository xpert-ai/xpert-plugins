import type { PluginMarketplaceAppConfig } from '@xpert-ai/contracts'

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
export const dashboardAppConfig = {
  scope: 'organization',
  assistantTemplateKey: 'live-dashboard-assistant',
  workspace: {
    mode: 'dedicated', sharing: 'private',
    name: text('Live Dashboard workspace', '实时看板工作空间'),
    description: text('Assistant configuration for project-scoped dashboard authoring.', '管理按项目制作看板的助理配置。')
  },
  knowledgebases: [],
  modelRequirements: { primary: true },
  presentation: {
    developer: 'Xpert AI',
    tagline: text('Create live dashboards with your business data', '连接业务数据，对话制作实时看板'),
    longDescription: text('Create dashboards with an Assistant in ChatKit. Select a Project, connect authorized files and business sources, then review a saved draft before publication.', '在 ChatKit 中与助理一起制作看板。选择项目，连接有权限的文件及业务数据源，检查保存的草稿后再发布。'),
    screenshots: [
      './assets/branding/cover-v1.webp'
    ],
    features: [
      { key: 'project', title: text('One synchronized Project', '项目双向同步'), description: text('ChatKit and the dashboard view use the same Project and resource permissions.', 'ChatKit 与看板视图使用同一项目及资源权限。') },
      { key: 'draft', title: text('Review before publication', '先检查，再发布'), description: text('The Assistant saves a draft; a project manager publishes the reviewed revision.', '助理保存草稿，项目管理者检查后发布指定修订。') }
    ],
    useCases: [text('Sales analysis', '销售分析'), text('Production and quality review', '生产与质量分析')],
    dataScope: text('A private configuration workspace; dashboards and files belong to the selected Project. Installation does not grant data access.', '配置工作空间保持私有；看板和文件归属所选项目。安装应用不会授予数据访问权限。'),
    initializationSummary: text('Prepare a workspace and publish the authoring Assistant. Choose or create a Project when entering chat.', '准备工作空间并发布制作助理。进入聊天后选择或创建项目。'),
    initializationSteps: [text('Create the private workspace', '创建私有工作空间'), text('Install the authoring template and its dependencies', '安装制作模板及依赖'), text('Configure the primary model and publish the Assistant', '配置主模型并发布助理')]
  },
  entry: { type: 'assistant-chat' }
} satisfies PluginMarketplaceAppConfig
