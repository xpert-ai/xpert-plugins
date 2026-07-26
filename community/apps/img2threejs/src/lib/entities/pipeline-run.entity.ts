import { Column, Entity, Index } from 'typeorm'
import { IMG2THREEJS_TABLES } from '../constants.js'
import type {
  BuildStage,
  DeterministicReview,
  BrowserRenderReport,
  HumanReviewStatus,
  NextDecision,
  StageGateResult,
  VisualReview,
  WorkspaceAssetReference
} from '../domain/types.js'
import { ScopedRevisionEntity } from './scoped.entity.js'

@Entity(IMG2THREEJS_TABLES.pipelineRun)
@Index(['tenantId', 'organizationId', 'projectId', 'createdAt'])
@Index(['tenantId', 'organizationId', 'queueJobId'])
@Index(['tenantId', 'organizationId', 'renderQueueJobId'])
export class PipelineRunEntity extends ScopedRevisionEntity {
  @Column({ type: 'uuid' })
  projectId!: string

  @Column({ type: 'uuid' })
  specVersionId!: string

  @Column({ type: 'uuid', nullable: true })
  codeVersionId!: string | null

  @Column({ type: 'varchar' })
  status!: 'queued' | 'running' | 'review_required' | 'completed' | 'failed' | 'cancelled'

  @Column({ type: 'varchar', nullable: true })
  currentStage!: BuildStage | null

  @Column({ type: 'varchar', nullable: true })
  queueJobId!: string | null

  @Column({ type: 'varchar', nullable: true })
  renderQueueJobId!: string | null

  @Column({ type: 'uuid', nullable: true })
  sandboxJobId!: string | null

  @Column({ type: 'json', nullable: true })
  renderReport!: BrowserRenderReport | null

  @Column({ type: 'json', default: () => "'[]'" })
  stageResults!: StageGateResult[]

  @Column({ type: 'json' })
  deterministicReview!: DeterministicReview

  @Column({ type: 'json' })
  visualReview!: VisualReview

  @Column({ type: 'json', nullable: true })
  comparisonAsset!: WorkspaceAssetReference | null

  @Column({ type: 'varchar', default: 'pending' })
  humanReviewStatus!: HumanReviewStatus

  @Column({ type: 'varchar', default: 'continue' })
  nextDecision!: NextDecision

  @Column({ type: 'float', default: 0 })
  confidence!: number

  @Column({ type: 'json', default: () => "'[]'" })
  failureReasons!: string[]

  @Column({ type: 'varchar', default: 'agent_poll' })
  completionMode!: 'agent_poll' | 'background_callback'
}
