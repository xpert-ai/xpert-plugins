import type { IntegrationUsage, IntegrationUsageScope } from '@xpert-ai/contracts'
import type { IntegrationPermissionService } from '@xpert-ai/plugin-sdk'
import { INTEGRATION_WECOM, INTEGRATION_WECOM_LONG } from './types.js'

/** The scope comes from the host execution or persisted trigger binding, never model input. */
export async function requireWeComUsage(
  reader: IntegrationPermissionService,
  id: string,
  usage: IntegrationUsage,
  scope: IntegrationUsageScope
) {
  if (!reader.readForUsage) throw new Error('Upgrade the Xpert host to authorize integration usage')
  const integration = await reader.readForUsage(id, usage, scope)
  if (!integration || ![INTEGRATION_WECOM, INTEGRATION_WECOM_LONG].includes(integration.provider)) {
    throw new Error('WeCom integration is unavailable or not authorized for this organization and usage')
  }
  return integration
}
