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
    tagline: text('From a working example to your live business data', '从可运行样例开始，连接你的业务数据'),
    longDescription: text('Create dashboards with an Assistant in ChatKit. Select a Project, explore clearly labeled demo data or connect authorized files and business sources, then review a saved draft before publication.', '在 ChatKit 中与助理一起制作看板。选择项目，体验明确标注的演示数据或连接有权限的文件及业务数据源，检查保存的草稿后再发布。'),
    screenshots: [
      './assets/branding/cover-v1.webp',
      './assets/previews/trend-workspace.png',
      './assets/previews/profit-atlas.png',
      './assets/previews/customer-brief.png'
    ],
    features: [
      { key: 'visual-styles', title: text('Three visual styles', '三种视觉风格'), description: text('Preview the Trend Workspace overview, Profit Atlas profitability desk and Customer Brief report prototypes. Each style includes reusable Agent recipes.', '预览 Trend Workspace 经营总览、Profit Atlas 盈利分析台与 Customer Brief 客户报告原型。每种风格均提供 Agent 可复用配方。') },
      { key: 'superstore', title: text('Enterprise retail analytics', '企业零售 BI 样例'), description: text('A reproducible Tableau Superstore dataset and three dashboards query your authorized published Data Xpert model.', '可复现的 Tableau Superstore 数据与三个企业看板，通过有权限的 Data Xpert 发布模型查询。') },
      { key: 'examples', title: text('Three runnable examples', '三个可运行样例'), description: text('Regional sales, sales overview and production quality include source, demo data and validation checks.', '区域销售、销售总览和生产质量均附带源码、演示数据与核对清单。') },
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
