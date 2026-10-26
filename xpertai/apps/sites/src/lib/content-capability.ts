import { Injectable } from '@nestjs/common'
import { ModelFeature, type TXpertTeamDraft } from '@xpert-ai/contracts'
import { AssistantCapabilityProvider, applyAssistantMiddleware, hasAssistantMiddleware, type IAssistantCapabilityProvider, type AssistantCapabilityApplyContext } from '@xpert-ai/plugin-sdk'

/** Optional tool composition; installing a View never silently enables these tools. */
@Injectable()
@AssistantCapabilityProvider('sites')
export class SitesCapability implements IAssistantCapabilityProvider {
  readonly key = 'sites'
  readonly availableForBlankAssistant = true
  readonly supportsQuickCreation = true
  readonly requiredModelFeatures = [ModelFeature.TOOL_CALL]
  readonly label = { en_US: 'Static sites', zh_Hans: '静态站点' }
  readonly description = { en_US: 'Create and maintain static sites with this Assistant in a Project.', zh_Hans: '为 Assistant 增加静态站点的创建与维护工具，沿用项目权限。' }
  isEnabled(draft: TXpertTeamDraft) { return hasAssistantMiddleware(draft, 'SitesMiddleware') }
  async check() { return { available: true } }
  async apply({ draft }: AssistantCapabilityApplyContext) {
    applyAssistantMiddleware(draft, { provider: 'SitesMiddleware', key: 'Capability_SitesCapability', title: 'Static sites', instructions: 'Create and maintain static HTML/CSS/JS sites in the current Project using the Sites tools and Project workspace. Read current sources before editing, save complete versioned source bundles and handle revision conflicts. Saving a draft must not publish or modify a deployment. Require explicit user intent before deploying or changing audience. Never place credentials or live data in public source.' })
  }
}
