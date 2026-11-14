import { Inject, Injectable } from '@nestjs/common'
import { ProjectAccessRuntimeCapability, ProjectPipelineCommandsRuntimeCapability, ProjectPipelinesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { EntityManager } from 'typeorm'
import { ReviewRepository, ReviewRun } from '../automation-entities.js'
import { publicationMode } from '../automation-contract.js'
import { ReviewError } from '../domain.js'
import { Reviews } from '../backend.js'
import { ReviewPipelineService } from './service.js'
import { ReviewPipelineCatalog, projectContext } from './catalog.js'
import { refs } from './contract.js'
import { ReviewPipelineDelivery } from './entity.js'
import type { AssertAutomationOwnership } from '../automation-lease.js'

/** Automation owns trigger intake; the platform owns dispatch, decisions and execution recovery. */
@Injectable()
export class ReviewPipelineAutomation {
  constructor(private readonly service: ReviewPipelineService, private readonly reviews: Reviews,
    private readonly catalog: ReviewPipelineCatalog,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry) {}
  async validate(p: ReviewRepository, run: ReviewRun) {
    const { target, publication } = this.executionTarget(run)
    await this.catalog.validate(p, target, 'github', publication)
  }
  private executionTarget(run: ReviewRun) {
    const target = run.settings.pipeline
    if (!target) throw new ReviewError('pipeline_binding_required')
    const publication = run.trigger === 'trial' ? 'confirm' : publicationMode(run.settings)
    if (publication === 'confirm') return { target, publication }
    if (!run.settings.publicationBindingId) throw new ReviewError('pipeline_binding_required')
    return { target: { projectId: target.projectId, bindingId: run.settings.publicationBindingId }, publication }
  }
  async advance(manager: EntityManager, p: ReviewRepository, run: ReviewRun, assertOwned: AssertAutomationOwnership = async () => undefined) {
    const { target, publication } = this.executionTarget(run)
    if (!run.reviewId) throw new ReviewError('pipeline_binding_required')
    const context = projectContext(p, target.projectId)
    if (!run.pipelineInstanceId || !run.pipelineRoundId) {
      const r = await this.reviews.get(p, run.reviewId)
      const started = await this.service.attach(p, { id: r.id, revision: r.revision, ...target, requestId: run.id },
        { runId: run.id, repositoryId: p.id, trial: run.trigger === 'trial', publication }, assertOwned)
      await assertOwned()
      await manager.update(ReviewRun, { id: run.id }, { pipelineInstanceId: started.instanceId, pipelineRoundId: started.roundId,
        status: 'running', reason: null })
      return
    }
    await this.capabilities.require(ProjectAccessRuntimeCapability).assertEdit(context)
      .catch(() => { throw new ReviewError('pipeline_project_unavailable') })
    const graph = await this.capabilities.require(ProjectPipelinesRuntimeCapability).graph(context, run.pipelineInstanceId)
    if (graph.roundId !== run.pipelineRoundId) {
      await assertOwned()
      await manager.update(ReviewRun, { id: run.id }, { status: 'superseded', reason: 'new_commit', finishedAt: new Date() }); return
    }
    const attention = graph.attentions.find(item => item.state === 'open')
    const status = graph.runState === 'completed' ? (publication === 'store' ? 'completed' : 'published') : graph.runState === 'cancelled' ? 'cancelled'
      : graph.runState === 'failed' ? 'failed' : graph.round.state === 'awaiting_new_subject' ? 'awaiting_revision'
      : attention?.kind === 'human' ? 'awaiting_confirmation' : attention ? 'blocked' : 'running'
    const published = graph.nodes.find(node => node.projection.nodeKey === 'publish')?.projection.evidence
      .find(ref => ref.schemaRef === refs.delivery)
    const receipt = published?.producerOperationId ? await manager.findOneBy(ReviewPipelineDelivery, {
      tenantId: p.tenantId, organizationId: p.organizationId, projectId: target.projectId,
      operationId: published.producerOperationId, headSha: run.headSha, status: 'confirmed' }) : null
    await assertOwned()
    await manager.update(ReviewRun, { id: run.id }, { status, reason: attention?.reasonCode ?? null,
      publicationUrl: receipt?.receipt?.url ?? run.publicationUrl, finishedAt: ['completed', 'published', 'failed', 'cancelled'].includes(status) ? new Date() : null })
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
