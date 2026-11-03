// Invariants: persisted actors come from host publication, never GitHub payloads.
// Restart replay preserves the actor; every worker invocation reauthorizes the current middleware.
import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Column, Entity, Index, PrimaryGeneratedColumn, Repository } from 'typeorm'
import { AssistantMiddlewareAccessRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, pluginArtifactTableName, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { NAMESPACE, MIDDLEWARE, FEATURE, ReviewError, type Scope } from './domain.js'

@Entity(pluginArtifactTableName(NAMESPACE, 'subscription'))
@Index(['tenantId', 'organizationId', 'assistantId'], { unique: true })
export class ReviewEventSubscription {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) assistantId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'varchar' }) workspaceId!: string
  @Column({ type: 'boolean', default: false }) enabled!: boolean
  @Column({ type: 'text', default: '' }) instructions!: string
  @Column({ type: 'timestamptz', nullable: true }) lastEventAt!: Date | null
  @Column({ type: 'timestamptz', nullable: true }) lastRunAt!: Date | null
}

@Injectable()
export class ReviewEvents {
  constructor(@InjectRepository(ReviewEventSubscription) readonly records: Repository<ReviewEventSubscription>,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry) {}
  where(s: Pick<Scope, 'tenantId' | 'organizationId' | 'assistantId'>) {
    return { tenantId: s.tenantId, organizationId: s.organizationId, assistantId: s.assistantId }
  }
  async access(s: Scope) {
    await this.capabilities.require(AssistantMiddlewareAccessRuntimeCapability).assertAccess({
      actor: { tenantId: s.tenantId, organizationId: s.organizationId, userId: s.userId },
      assistantId: s.assistantId, provider: MIDDLEWARE, requiredFeature: FEATURE, scope: { type: 'assistant' }
    })
  }
  async assertListening(s: Scope) {
    const subscription = await this.records.findOneBy(this.where(s))
    if (!subscription?.enabled || subscription.userId !== s.userId) throw new ReviewError('github_trigger_paused')
    try { await this.access(s) } catch { throw new ReviewError('code_review_capability_unavailable') }
  }
  async activity(s: Scope, kind: 'event' | 'run') {
    await this.records.update(this.where(s), kind === 'event' ? { lastEventAt: new Date() } : { lastRunAt: new Date() })
  }
  async instructions(s: Scope) {
    const subscription = await this.records.findOneBy(this.where(s))
    return subscription?.enabled && subscription.userId === s.userId ? subscription.instructions : ''
  }
}
