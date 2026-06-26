import type { XpertTypeEnum } from '@metad/contracts'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'

type LarkPluginTargetApp = 'xpert' | 'data-xpert' | (string & {})
type LarkPluginMarketplaceOperationAccess = 'read' | 'write' | 'admin' | (string & {})

type LarkPluginMarketplaceOperation = {
  name: string
  displayName?: string | Record<string, string>
  description?: string | Record<string, string>
  access?: LarkPluginMarketplaceOperationAccess
  tags?: string[]
}

type LarkPluginMarketplaceContribution = {
  id?: string
  type: 'app' | 'view' | 'feature' | 'tool' | 'assistant-template' | (string & {})
  name: string
  displayName?: string | Record<string, string>
  description?: string | Record<string, string>
  icon?: unknown
  operations?: LarkPluginMarketplaceOperation[]
  tags?: string[]
  metadata?: Record<string, unknown>
}

type LarkPluginTargetAppMetadata = {
  types?: string[]
  capabilities?: string[]
  requiredPlugins?: string[]
  defaultConfig?: Record<string, unknown>
  marketplace?: {
    contents?: LarkPluginMarketplaceContribution[]
    category?: string
    subcategory?: string
    featured?: boolean
    screenshots?: string[]
    readme?: string
    updatedAt?: string
  }
  runtime?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * @deprecated Remove after the resolved plugin-sdk/contracts versions expose
 * targetApps/targetAppMeta on PluginMeta in this workspace.
 */
export type LarkPluginMetaWithTargetApps = XpertPlugin['meta'] & {
  targetApps?: LarkPluginTargetApp[]
  targetAppMeta?: Record<string, LarkPluginTargetAppMetadata | undefined>
}

/**
 * @deprecated Remove after XpertTemplateContribution is re-exported by the
 * resolved @xpert-ai/plugin-sdk package root in this workspace.
 */
export type LarkXpertTemplateContribution = {
  key: string
  id?: string
  name?: string
  title?: string
  description?: string
  category?: string
  type?: XpertTypeEnum | 'project'
  targetApps?: LarkPluginTargetApp[]
  targetAppMeta?: Record<string, LarkPluginTargetAppMetadata | undefined> | null
  dslContent?: string
  export_data?: string
  order?: number
  default?: boolean
  startPrompts?: string[]
  releaseNotes?: string
  xpertName?: string
  providerKey?: string
  [key: string]: unknown
}

/**
 * @deprecated Remove after the resolved plugin-sdk XpertPlugin type accepts
 * the current PluginMeta and template contribution contracts.
 */
export type LarkXpertPlugin<TConfig extends object = any> = Omit<XpertPlugin<TConfig>, 'meta' | 'templates'> & {
  meta: LarkPluginMetaWithTargetApps
  templates?: LarkXpertTemplateContribution[]
}
