import { appConfig } from './app-config.js'
import type { PluginMarketplaceContribution } from '@xpert-ai/contracts'
import { SITES_ICON } from './constants.js'
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
export const sitesApp: PluginMarketplaceContribution = {
  type: 'app', name: 'sites', displayName: text('Sites', '站点'), icon: { type: 'svg', value: SITES_ICON },
  description: text('Build, preview and publish static sites from your Assistant.', '通过助手创建、预览和发布静态站点。'),
  appConfig
}
