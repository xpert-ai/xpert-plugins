import { Injectable } from '@nestjs/common'
import { ModelFeature, type TXpertTeamDraft } from '@xpert-ai/contracts'
import { AssistantCapabilityProvider, applyAssistantMiddleware, hasAssistantMiddleware, type IAssistantCapabilityProvider, type AssistantCapabilityApplyContext } from '@xpert-ai/plugin-sdk'

/** Optional tool composition; installing a View never silently enables these tools. */
@Injectable()
@AssistantCapabilityProvider('live-dashboard')
export class DashboardCapability implements IAssistantCapabilityProvider {
  readonly key = 'live-dashboard'
  readonly availableForBlankAssistant = true
  readonly supportsQuickCreation = true
  readonly requiredModelFeatures = [ModelFeature.TOOL_CALL]
  readonly label = { en_US: 'Live dashboards', zh_Hans: '实时看板' }
  readonly description = { en_US: 'Create and maintain live dashboards with this Assistant in a Project.', zh_Hans: '为 Assistant 增加实时看板的创建与维护工具，沿用项目权限。' }
  isEnabled(draft: TXpertTeamDraft) { return hasAssistantMiddleware(draft, 'LiveDashboard') }
  async check() { return { available: true } }
  async apply({ draft }: AssistantCapabilityApplyContext) {
    applyAssistantMiddleware(draft, { provider: 'LiveDashboard', key: 'Capability_DashboardCapability', title: 'Live dashboards', instructions: 'Maintain live dashboard definitions in the current Project using Live Dashboard tools and registered Analytics providers. Discover and validate current data bindings before saving. Read the current draft revision and handle conflicts without overwriting another editor. Query with the current actor permissions; never copy credentials or query rows into the shared definition. Publishing a definition is separate from saving and refreshing data.' })
  }
}
