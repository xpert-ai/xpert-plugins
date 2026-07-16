import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

jest.mock('./lib/i18n.js', () => ({
  initI18n: jest.fn()
}))

jest.mock('./lib/integration-lark.module.js', () => ({
  IntegrationLarkPlugin: class IntegrationLarkPlugin {}
}))

import plugin from './index.js'
import {
  LARK_ADMIN_TEMPLATE_KEY,
  LARK_CONVERSATION_TEMPLATE_KEY,
  LARK_FEATURE,
  LARK_RUNTIME_MIDDLEWARE_NAME,
  LARK_PLUGIN_NAME,
  LARK_PROVIDER_KEY,
  LARK_VIEW_PROVIDER_KEY
} from './lib/constants.js'

const specDir = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(specDir, '../package.json'), 'utf8')) as {
  version: string
}

describe('Lark Plugin', () => {
  it('exposes xpert marketplace metadata and contributions', () => {
    expect(plugin.meta.name).toBe(LARK_PLUGIN_NAME)
    expect(plugin.meta.version).toBe(packageJson.version)
    expect(plugin.meta.level).toBe('system')
    expect(plugin.meta.category).toBe('integration')
    expect(plugin.meta.targetApps).toEqual(['xpert'])
    expect(plugin.meta.displayName).toBe('Lark/Feishu Plugin')
    expect(plugin.meta.description).toBe('Bidirectional messaging integration with Lark (Feishu) platform')
    expect(plugin.meta.keywords).toEqual(expect.arrayContaining(['lark', 'feishu', 'document source']))
    expect(plugin.meta.author).toBe('XpertAI team')
    expect(plugin.meta.icon).toHaveProperty('type', 'image')

    const xpertMeta = plugin.meta.targetAppMeta?.xpert
    expect(xpertMeta?.marketplace?.category).toBe('communication')
    expect(xpertMeta?.capabilities).toEqual(expect.arrayContaining([LARK_FEATURE]))
    expect(xpertMeta?.runtime?.integrationProviders).toEqual([LARK_PROVIDER_KEY])
    expect(xpertMeta?.runtime?.channelProviders).toEqual([LARK_PROVIDER_KEY])
    expect(xpertMeta?.runtime?.middlewareProviders).toEqual([LARK_RUNTIME_MIDDLEWARE_NAME])
    expect(xpertMeta?.runtime?.viewProviders).toEqual([LARK_VIEW_PROVIDER_KEY])

    const contents = xpertMeta?.marketplace?.contents ?? []
    expect(contents.map((item) => `${item.type}:${item.name}`)).toEqual(
      expect.arrayContaining([
        `app:${LARK_PROVIDER_KEY}`,
        `view:${LARK_VIEW_PROVIDER_KEY}`,
        `tool:${LARK_RUNTIME_MIDDLEWARE_NAME}`,
        `assistant-template:${LARK_ADMIN_TEMPLATE_KEY}`,
        `assistant-template:${LARK_CONVERSATION_TEMPLATE_KEY}`
      ])
    )
    expect(contents.find((item) => item.type === 'app')?.operations?.map((operation) => operation.access)).toEqual(
      expect.arrayContaining(['read', 'write', 'admin'])
    )
    expect(
      contents
        .find((item) => item.type === 'app')
        ?.operations?.find((operation) => operation.name === 'send-lark-messages')?.description
    ).toContain('workspace file')
    expect(
      contents.find((item) => item.type === 'tool' && item.name === LARK_RUNTIME_MIDDLEWARE_NAME)?.description
    ).toContain('workspace file')
  })

  it('registers assistant templates with xpert target metadata', () => {
    expect(plugin.templates?.map((template) => template.key)).toEqual([
      LARK_ADMIN_TEMPLATE_KEY,
      LARK_CONVERSATION_TEMPLATE_KEY
    ])

    for (const template of plugin.templates ?? []) {
      expect(template.targetApps).toEqual(['xpert'])
      expect(template.targetAppMeta?.xpert?.requiredPlugins).toEqual([LARK_PLUGIN_NAME])
      expect(template.dslContent).toContain('team:')
      expect(template.dslContent).toContain(template.key)
    }
  })

  it('accepts empty plugin config by applying defaults', () => {
    expect(plugin.config?.schema?.safeParse({})?.success).toBe(true)
  })

  it('calls register and returns correct module', () => {
    const ctx = {
      logger: { log: jest.fn() }
    }
    const result = plugin.register(ctx as any)
    expect(ctx.logger.log).toHaveBeenCalledWith('Registering Lark integration plugin')
    expect(result).toHaveProperty('module')
    expect(result).toHaveProperty('global', true)
  })

  it('logs lifecycle events', async () => {
    const ctx = {
      logger: { log: jest.fn() }
    }
    await plugin.onStart(ctx as any)
    expect(ctx.logger.log).toHaveBeenCalledWith('Lark integration plugin started')

    await plugin.onStop(ctx as any)
    expect(ctx.logger.log).toHaveBeenCalledWith('Lark integration plugin stopped')
  })
})
