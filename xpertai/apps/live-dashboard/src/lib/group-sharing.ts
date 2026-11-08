import { BadRequestException } from '@nestjs/common'
import { z } from 'zod/v3'
import { ArtifactUseGrantsRuntimeCapability, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { DashboardService } from './dashboard.service'
import { resourceAnalysisPolicySchema } from '@xpert-ai/plugin-sdk/analytics'

export const groupGrantAction = z.enum(['group-grant-targets', 'group-grants', 'group-grant-offer', 'group-grant-revoke', 'group-grant-analysis-options'])
const source = z.object({ artifactId: z.string().uuid() })
const page = source.extend({ offset: z.number().int().min(0).max(100000).default(0), limit: z.number().int().min(1).max(100).default(50) }).strict()
const offer = source.extend({ versionId: z.string().uuid(), targetGroupId: z.string().uuid(), days: z.number().int().min(1).max(30), analysis: resourceAnalysisPolicySchema.optional() }).strict()
const analysisOptions = source.extend({ versionId: z.string().uuid() }).strict()
const revoke = source.extend({ grantId: z.string().uuid(), expectedRevision: z.number().int().positive() }).strict()

/** Authoring only: the host rechecks the human login; the plugin cannot turn a group session into grant authority. */
export async function executeGroupGrant(runtime: RuntimeCapabilityRegistry, dashboards: DashboardService, context: XpertResolvedViewHostContext, action: z.infer<typeof groupGrantAction>, input: unknown) {
  await dashboards.authorizeProject(context, 'manage')
  const api = runtime.require(ArtifactUseGrantsRuntimeCapability)
  if (action === 'group-grant-offer') {
    const parsed = offer.parse(input)
    const versions = await dashboards.history(context, parsed.artifactId)
    if (!versions.some(version => version.versionId === parsed.versionId)) throw new BadRequestException('DASHBOARD_PUBLISH_BEFORE_SHARING')
    return api.offer({ artifactId: parsed.artifactId, versionId: parsed.versionId, targetGroupId: parsed.targetGroupId, expiresAt: new Date(Date.now() + parsed.days * 86400000).toISOString(), ...(parsed.analysis ? { analysis: parsed.analysis } : {}) })
  }
  if (action === 'group-grant-analysis-options') {
    const parsed = analysisOptions.parse(input)
    await dashboards.history(context, parsed.artifactId)
    return api.analysisOptions(parsed)
  }
  if (action === 'group-grant-revoke') {
    const parsed = revoke.parse(input)
    await dashboards.history(context, parsed.artifactId)
    return api.revoke(parsed)
  }
  const parsed = page.parse(input)
  await dashboards.history(context, parsed.artifactId)
  return action === 'group-grant-targets' ? api.targets(parsed) : api.issued(parsed)
}
