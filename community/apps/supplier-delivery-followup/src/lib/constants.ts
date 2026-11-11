import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PluginLevel } from '@xpert-ai/contracts'

const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as {
  name: string
  version: string
  xpert: {
    plugin: {
      level: PluginLevel
      artifactNamespace: string
    }
  }
}

export const PLUGIN_NAME = packageJson.name
export const PLUGIN_VERSION = packageJson.version
export const DELIVERY_MIDDLEWARE_NAME = 'SupplierDeliveryFollowupMiddleware'
export const PLUGIN_LEVEL = packageJson.xpert.plugin.level
// Persisted table identity must never silently change with release metadata.
export const PLUGIN_ARTIFACT_NAMESPACE = 'supplier_delivery' as const
// Fixed time zone for this demo's delivery-date interpretation.
export const DELIVERY_TIME_ZONE = 'Asia/Shanghai'
export const DELIVERY_FEATURE = PLUGIN_ARTIFACT_NAMESPACE
export const DELIVERY_WORKBENCH_KEY = `${PLUGIN_ARTIFACT_NAMESPACE}.workbench` as const
export const DELIVERY_TEMPLATE_KEY = 'supplier-delivery-followup-assistant'
export const DELIVERY_TOOL_NAMES = [
  'supplier_delivery_get_reply',
  'supplier_delivery_search_order_lines',
  'supplier_delivery_save_proposal',
  'supplier_delivery_finalize_parse',
  'supplier_delivery_report_parse_failure'
] as const
export const PLUGIN_PACKAGE_ARTIFACT_NAMESPACE = packageJson.xpert.plugin.artifactNamespace
if (PLUGIN_PACKAGE_ARTIFACT_NAMESPACE !== PLUGIN_ARTIFACT_NAMESPACE) {
  throw new Error('supplier_delivery_artifact_namespace_mismatch')
}

// Long multi-line replies can take minutes; retain this timeout as a fallback.
export const PARSE_TIMEOUT_MS = 5 * 60 * 1000
