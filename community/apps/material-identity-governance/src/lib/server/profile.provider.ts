import { Injectable, HttpException } from '@nestjs/common'
import { AGENT_PROFILE_TABS_SLOT, type XpertResolvedViewHostContext, type XpertViewQuery, type XpertViewActionRequest, type XpertViewActionResult, type XpertRemoteComponentViewSchema } from '@xpert-ai/contracts'
import { ViewExtensionProvider, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { MaterialProfileService, profileDecisionSchema } from './profile.service.js'
import { PROFILE_PROVIDER, PROFILE_ENTRY, profileManifests, profileTab } from './profile.views.js'
import { materialRemoteEntry } from './remote-entry.js'
@Injectable()
@ViewExtensionProvider(PROFILE_PROVIDER)
export class MaterialProfileProvider implements IXpertViewExtensionProvider {
  constructor(private readonly profiles: MaterialProfileService) {}
  supports(context: XpertResolvedViewHostContext) { return context.hostType === 'agent' }
  getViewManifests(context: XpertResolvedViewHostContext, slot: string) {
    return context.hostType === 'agent' && slot === AGENT_PROFILE_TABS_SLOT ? profileManifests() : []
  }
  getViewData(context: XpertResolvedViewHostContext, key: string, query: XpertViewQuery) { return this.profiles.getData(context, key, query) }
  getRemoteComponentEntry(context: XpertResolvedViewHostContext, key: string, component: XpertRemoteComponentViewSchema['component']) {
    if (!profileTab(key) || component.entry !== PROFILE_ENTRY) throw new Error('unsupported_component')
    return materialRemoteEntry(PROFILE_ENTRY, context.locale)
  }
  async executeViewAction(context: XpertResolvedViewHostContext, key: string, action: string, request: XpertViewActionRequest): Promise<XpertViewActionResult> {
    if (action !== 'decide_proposal') return { success: false, data: { code: 'unsupported_action' } }
    try {
      const data = await this.profiles.decide(context, key, profileDecisionSchema.parse(request.input))
      return { success: true, data, refresh: true }
    } catch (error) {
      return { success: false, data: { code: error instanceof HttpException ? error.message : 'invalid_decision' }, refresh: true }
    }
  }
}
