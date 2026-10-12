import type { PluginMarketplaceContribution } from '@xpert-ai/contracts'
import { SITES_ICON } from './constants.js'
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
export const sitesApp: PluginMarketplaceContribution = {
  type: 'app', name: 'sites', displayName: text('Sites', '站点'), icon: { type: 'svg', value: SITES_ICON },
  description: text('Build, preview and publish static sites from your Assistant.', '通过助手创建、预览和发布静态站点。'),
  appConfig: {
    scope: 'organization', assistantTemplateKey: 'sites-builder-assistant',
    workspace: { mode: 'dedicated', name: text('Sites', '站点工作空间'), sharing: 'organization' }, knowledgebases: [],
    modelRequirements: { primary: true }, entry: { type: 'assistant-chat' },
    presentation: {
      developer: 'XpertAI', tagline: text('An idea becomes a working site.', '让想法成为可以打开的站点。'),
      features: [
        { key: 'build', title: text('Create and iterate', '创建与迭代'), description: text('Build HTML, CSS and JavaScript in the sandbox, with local modules, images and fonts.', '在沙箱编写 HTML、CSS 和 JavaScript，支持本地模块、图片与字体。') },
        { key: 'versions', title: text('Versions and rollback', '版本与回滚'), description: text('Save immutable candidates and redeploy a previous version.', '保存不可变的候选版本，也可以重新发布历史版本。') },
        { key: 'share', title: text('Controlled publishing', '控制发布权限'), description: text('Publish an isolated artifact with private, workspace or confirmed public access.', '发布隔离的站点产物，可设为私有、工作空间可见，或确认后公开。') }
      ],
      dataScope: text('Projects are private to each user and Assistant. Published HTML runs in an isolated browser sandbox without network API access.', '项目按用户和助手隔离。发布的 HTML 在隔离浏览器沙箱运行，不能访问网络 API。'),
      initializationSummary: text('Creates a workspace and Sites Assistant. Uses your selected model and the host sandbox. Server-side storage and authentication require a separate hosting adapter.', '创建工作空间和站点助手，使用选择的模型及平台沙箱。服务端存储和认证需要独立托管适配器。')
    }
  }
}
