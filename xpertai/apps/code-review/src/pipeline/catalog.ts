import { Inject, Injectable } from '@nestjs/common'
import { z } from 'zod/v3'
import { ProjectAccessRuntimeCapability, ProjectPipelineCatalogRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry, type ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { ReviewError, type Scope } from '../domain.js'
import type { PipelineTarget } from '../automation-contract.js'
import { digest, pipelineParametersSchema } from './contract.js'
import { reviewPipelineConfiguration, localReviewPipelineConfiguration, lightweightReviewPipelineConfiguration } from './configuration.js'
import { reviewPipelineCatalogSchema, reviewPipelineConfigureSchema, reviewTemplateSources, reviewTemplateSource,
  type ReviewSource } from './setup-contract.js'

export const reviewTemplateRefs = Object.keys(reviewTemplateSources)
export const projectContext = (s: Scope, projectId: string): ProjectPipelineContext => ({ projectId,
  actor: { tenantId: s.tenantId, organizationId: s.organizationId, userId: s.userId } })
@Injectable()
export class ReviewPipelineCatalog {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry) {}
  async list(s: Scope, projectId: string, source: ReviewSource) {
    const context = projectContext(s, projectId)
    await this.capabilities.require(ProjectAccessRuntimeCapability).assertManage(context)
    const catalog = await this.capabilities.require(ProjectPipelineCatalogRuntimeCapability).list(context)
    if (!catalog.canManage) throw new ReviewError('pipeline_project_unavailable')
    return reviewPipelineCatalogSchema.parse({
      defaultAssistantId: catalog.assistants.some(item => item.id === s.assistantId) ? s.assistantId : null,
      assistants: catalog.assistants,
      templates: catalog.items.flatMap(({ contributionKey, configuration, form }) => {
        if (!form || reviewTemplateSource(configuration.binding.templateRef) !== source) return []
        return [{ contributionKey, templateRef: configuration.binding.templateRef, sourceKind: source,
          title: configuration.template.title, version: configuration.template.version,
          description: form.description ?? {}, assistantSlots: form.assistantSlots,
          parameters: pipelineParametersSchema.parse(configuration.binding.parameters) }]
      })
    })
  }
  async configure(s: Scope, projectId: string, request: z.infer<typeof reviewPipelineConfigureSchema>) {
    const input = reviewPipelineConfigureSchema.parse(request)
    // Only installed, source-compatible templates and currently authorized Assistants may be configured.
    const catalog = await this.list(s, projectId, input.sourceKind)
    const template = catalog.templates.find(item => item.templateRef === input.templateRef && item.contributionKey === input.contributionKey)
    if (!template) throw new ReviewError('pipeline_template_unavailable')
    if (Object.keys(input.assistants).length !== template.assistantSlots.length || template.assistantSlots.some(slot =>
      !catalog.assistants.some(item => item.id === input.assistants[slot.slot]))) throw new ReviewError('pipeline_assistant_required')
    const { sourceKind, ...configuration } = input
    const saved = await this.capabilities.require(ProjectPipelineCatalogRuntimeCapability).configure(projectContext(s, projectId), configuration)
    const target = { projectId, bindingId: saved.bindingId }
    await this.validate(s, target, sourceKind)
    return target
  }
  async validate(s: Scope, target: PipelineTarget, source: 'github' | 'local_git' = 'github') {
    const context = projectContext(s, target.projectId)
    await this.capabilities.require(ProjectAccessRuntimeCapability).assertManage(context)
      .catch(() => { throw new ReviewError('pipeline_project_unavailable') })
    const saved = await this.capabilities.require(ProjectPipelineCatalogRuntimeCapability).binding(context, target.bindingId)
      .catch(() => { throw new ReviewError('pipeline_binding_unavailable') })
    const binding = saved.configuration.binding
    const parameters = pipelineParametersSchema.parse(binding.parameters)
    let canonical
    if (source === 'github' && binding.templateRef === 'code-review.pull-request-light@1.0.0') {
      canonical = lightweightReviewPipelineConfiguration(z.string().uuid().parse(binding.executorBindings?.correctness?.selectionKey), parameters)
    } else {
      if (binding.templateRef !== (source === 'github' ? 'code-review.pull-request@1.0.0' : 'code-review.local-git@1.0.0'))
        throw new ReviewError('pipeline_configuration_mismatch')
      const assistants = z.object({ correctness: z.string().uuid(), security: z.string().uuid(), verifier: z.string().uuid() }).parse({
        correctness: binding.executorBindings?.correctness?.selectionKey, security: binding.executorBindings?.security?.selectionKey,
        verifier: binding.executorBindings?.verifier?.selectionKey })
      canonical = (source === 'github' ? reviewPipelineConfiguration : localReviewPipelineConfiguration)(assistants, parameters)
    }
    if (digest(saved.configuration) !== digest(canonical)) throw new ReviewError('pipeline_configuration_mismatch')
    return saved
  }
}
