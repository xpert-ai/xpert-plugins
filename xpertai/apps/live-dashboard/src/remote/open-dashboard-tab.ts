import { z } from 'zod/v3'
import { requestHost, captureViewScope } from './bridge'
import { DASHBOARD_DOCUMENT_VIEW_KEY } from '../lib/dashboard-navigation'

const resolved = z.object({ success: z.literal(true), navigation: z.object({
  target: z.literal('workbench.view'), viewKey: z.literal(DASHBOARD_DOCUMENT_VIEW_KEY),
  selectionId: z.string().uuid(), parameters: z.object({ contentId: z.string().uuid() }).passthrough()
}) })
/** Source authoring only. Shared references use their scoped presentation transport, never this path. */
export async function openDashboardTab(artifactId: string, versionId?: string, mode?: 'draft' | 'published') {
  const assertCurrent = captureViewScope()
  const result = resolved.parse(await requestHost('invokeClientCommand', { commandKey: 'workbench.content.resolve',
    payload: { providerKey: 'live-dashboard.content', resourceId: artifactId } }))
  assertCurrent()
  if (result.navigation.selectionId !== artifactId) throw new Error('DASHBOARD_NAVIGATION_INVALID')
  const response = await requestHost('invokeClientCommand', { commandKey: 'workbench.navigation.open', payload: {
    ...result.navigation, parameters: { ...result.navigation.parameters, ...(versionId ? { versionId } : {}), ...(mode ? { mode } : {}) }
  } })
  assertCurrent()
  z.object({ success: z.literal(true) }).parse(response)
}
