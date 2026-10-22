import { Inject, Injectable } from '@nestjs/common'
import { ProjectAccessRuntimeCapability, ProjectPipelineCommandsRuntimeCapability, ProjectPipelinesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { EntityManager } from 'typeorm'
import { ReviewRepository, ReviewRun } from '../automation-entities.js'
import { ReviewError } from '../domain.js'
import { Reviews } from '../backend.js'
import { ReviewPipelineService } from './service.js'
import { ReviewPipelineCatalog, projectContext } from './catalog.js'
import { ReviewPipelineDelivery } from './entity.js'

/** Automation owns trigger intake; the platform owns dispatch, decisions and execution recovery. */
@Injectable()
export class ReviewPipelineAutomation {
  constructor(private readonly service: ReviewPipelineService, private readonly reviews: Reviews,
    private readonly catalog: ReviewPipelineCatalog,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry) {}
  async validate(p: ReviewRepository, run: ReviewRun) {
    if (!run.settings.pipeline) throw new ReviewError('pipeline_binding_required')
    await this.catalog.validate(p, run.settings.pipeline)
  }
  async advance(manager: EntityManager, p: ReviewRepository, run: ReviewRun) {
    const target = run.settings.pipeline
    if (!target || !run.reviewId) throw new ReviewError('pipeline_binding_required')
    const context = projectContext(p, target.projectId)
    await this.capabilities.require(ProjectAccessRuntimeCapability).assertManage(context)
      .catch(() => { throw new ReviewError('pipeline_project_unavailable') })
    if (!run.pipelineInstanceId || !run.pipelineRoundId) {
      await this.validate(p, run)
      const r = await this.reviews.get(p, run.reviewId)
      const started = await this.service.attach(p, { id: r.id, revision: r.revision, ...target, requestId: run.id },
        { runId: run.id, repositoryId: p.id, trial: run.trigger === 'trial' })
      await manager.update(ReviewRun, { id: run.id }, { pipelineInstanceId: started.instanceId, pipelineRoundId: started.roundId,
        status: 'running', reason: null })
      return
    }
    const graph = await this.capabilities.require(ProjectPipelinesRuntimeCapability).graph(context, run.pipelineInstanceId)
    if (graph.roundId !== run.pipelineRoundId) {
      await manager.update(ReviewRun, { id: run.id }, { status: 'superseded', reason: 'new_commit', finishedAt: new Date() }); return
    }
    const attention = graph.attentions.find(item => item.state === 'open')
    const status = graph.runState === 'completed' ? 'published' : graph.runState === 'cancelled' ? 'cancelled'
      : graph.runState === 'failed' ? 'failed' : graph.round.state === 'awaiting_new_subject' ? 'awaiting_revision'
      : attention?.kind === 'human' ? 'awaiting_confirmation' : attention ? 'blocked' : 'running'
    const receipt = status === 'published' ? await manager.findOne(ReviewPipelineDelivery, { where: {
      tenantId: p.tenantId, organizationId: p.organizationId, projectId: target.projectId,
      reviewId: (await this.service.bindings.findOneByOrFail({ tenantId: p.tenantId, organizationId: p.organizationId, projectId: target.projectId, instanceId: run.pipelineInstanceId })).id,
      headSha: run.headSha, status: 'confirmed' }, order: { createdAt: 'DESC' } }) : null
    await manager.update(ReviewRun, { id: run.id }, { status, reason: attention?.reasonCode ?? null,
      publicationUrl: receipt?.receipt?.url ?? null, finishedAt: ['published', 'failed', 'cancelled'].includes(status) ? new Date() : null })
  }
  async cancel(p: ReviewRepository, run: ReviewRun) {
    if (!run.settings.pipeline || !run.pipelineInstanceId) return
    const context = projectContext(p, run.settings.pipeline.projectId)
    const graph = await this.capabilities.require(ProjectPipelinesRuntimeCapability).graph(context, run.pipelineInstanceId)
    if (graph.roundId !== run.pipelineRoundId || !graph.actions.cancel) return
    await this.capabilities.require(ProjectPipelineCommandsRuntimeCapability).cancel(context, {
      instanceId: run.pipelineInstanceId, requestId: run.id, expectedRevision: graph.instance.revision })
  }
}
