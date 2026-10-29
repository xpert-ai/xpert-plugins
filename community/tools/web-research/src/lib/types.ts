export const WebResearch = 'web-research'
export const PLUGIN_NAME = '@xpert-ai/plugin-web-research'
export const PLUGIN_VERSION = '0.0.4'
export const PLUGIN_LEVEL = 'tenant' as const
export const PLUGIN_ARTIFACT_NAMESPACE = 'web_research' as const

export interface FirecrawlConfig {
  apiKey: string
  apiUrl?: string
}

export const svg = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 9h-3.1a15.7 15.7 0 0 0-1.3-5 8.1 8.1 0 0 1 4.4 5ZM12 4c.9 1.3 1.8 3.6 2 7h-4c.2-3.4 1.1-5.7 2-7Zm-2 9h4c-.2 3.4-1.1 5.7-2 7-.9-1.3-1.8-3.6-2-7Zm-1.8-2H5.1a8.1 8.1 0 0 1 4.4-5 15.7 15.7 0 0 0-1.3 5Zm-3.1 2h3.1a15.7 15.7 0 0 0 1.3 5 8.1 8.1 0 0 1-4.4-5Zm9.4 5a15.7 15.7 0 0 0 1.3-5h3.1a8.1 8.1 0 0 1-4.4 5Z"/></svg>'
