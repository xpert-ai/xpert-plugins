import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { PluginContext, XpertTemplateCatalogProvider } from '@xpert-ai/plugin-sdk'
import { roleAgentKey, roleTemplate } from './role-template'
import { rolePluginDependencies } from './role-runtime'

export const PLUGIN_NAME = '@xpert-ai/community-agency-agents'
export const PLUGIN_VERSION = '0.1.0'
// Both the local TS loader and the packaged JS entry consume the generated assets.
const catalogRoot = join(__dirname, '..', 'dist')
const labelSchema = z.object({ en_US: z.string(), zh_Hans: z.string().optional() })
const avatarSchema = z.object({
  emoji: z.object({ id: z.string(), unified: z.string(), set: z.literal('') }),
  background: z.string().regex(/^#[\da-f]{6}$/i), url: z.string().optional()
})
const entrySchema = z.object({
  key: z.string(), title: labelSchema, description: labelSchema, category: z.string(),
  availableLocales: z.array(z.string()).min(1), defaultLocale: z.string(), avatar: avatarSchema, skillKeys: z.record(z.string())
})
const roleSchema = z.object({ title: z.string(), description: z.string(), body: z.string(), skillKey: z.string(), contentHash: z.string(), avatar: avatarSchema })

export class AgencyCatalogProvider implements XpertTemplateCatalogProvider {
  readonly kind = 'catalog' as const
  private readonly entries = z.array(entrySchema).parse(JSON.parse(readFileSync(join(catalogRoot, 'catalog.json'), 'utf8')))

  listTemplates(_ctx?: PluginContext) {
    return this.entries.map((entry) => ({
      ...entry, name: entry.key, type: XpertTypeEnum.Agent, targetApps: ['xpert'], targetAppMeta: {},
      default: false, pluginVersion: PLUGIN_VERSION, dependencies: this.dependencies(entry.key, entry.skillKeys[entry.defaultLocale])
    }))
  }

  private dependencies(key: string, skillKey: string) {
    return { ...rolePluginDependencies(), skills: [{
      pluginName: PLUGIN_NAME, componentKey: skillKey, targetAgentKey: roleAgentKey(key)
    }] }
  }

  resolveTemplate(_ctx: PluginContext | undefined, key: string, requestedLocale?: string) {
    const entry = this.entries.find((item) => item.key === key)
    if (!entry) throw new Error(`Unknown Agency role: ${key}`)
    const preferred = requestedLocale
      ? requestedLocale.toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en-US'
      : entry.defaultLocale
    const locale = entry.availableLocales.includes(requestedLocale ?? '') ? requestedLocale!
      : entry.availableLocales.includes(preferred) ? preferred : entry.defaultLocale
    // Paths are derived exclusively from the validated catalog, never from request values.
    const role = roleSchema.parse(JSON.parse(readFileSync(join(catalogRoot, 'roles', entry.key, `${locale}.json`), 'utf8')))
    const draft = roleTemplate({
      id: entry.key, ...role, pluginName: PLUGIN_NAME, pluginVersion: PLUGIN_VERSION, locale
    })
    return {
      ...entry, name: entry.key, title: role.title, description: role.description,
      type: XpertTypeEnum.Agent, targetApps: ['xpert'], targetAppMeta: {}, default: false,
      locale, pluginVersion: PLUGIN_VERSION, contentHash: role.contentHash,
      dependencies: this.dependencies(entry.key, role.skillKey),
      dslContent: JSON.stringify(draft)
    }
  }
}
