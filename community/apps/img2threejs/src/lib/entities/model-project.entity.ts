import { Column, Entity, Index } from 'typeorm'
import { IMG2THREEJS_TABLES } from '../constants.js'
import type {
  HumanReviewStatus,
  ModelRoute,
  ModelingMode,
  NextDecision,
  ProjectStatus
} from '../domain/types.js'
import { ScopedRevisionEntity } from './scoped.entity.js'

@Entity(IMG2THREEJS_TABLES.project)
@Index(['tenantId', 'organizationId', 'updatedAt'])
@Index(['tenantId', 'organizationId', 'platformProjectId'])
export class ModelProjectEntity extends ScopedRevisionEntity {
  @Column({ type: 'varchar' })
  name!: string

  @Column({ type: 'varchar' })
  route!: ModelRoute

  @Column({ type: 'varchar', default: 'semantic-3d' })
  modelingMode!: ModelingMode

  @Column({ type: 'varchar', default: 'awaiting_images' })
  status!: ProjectStatus

  @Column({ type: 'uuid', nullable: true })
  currentSpecVersionId!: string | null

  @Column({ type: 'uuid', nullable: true })
  currentCodeVersionId!: string | null

  @Column({ type: 'uuid', nullable: true })
  activeRunId!: string | null

  @Column({ type: 'varchar', default: 'continue' })
  nextDecision!: NextDecision

  @Column({ type: 'varchar', default: 'pending' })
  humanReviewStatus!: HumanReviewStatus

  @Column({ type: 'float', default: 0 })
  confidence!: number

  @Column({ type: 'json', default: () => "'[]'" })
  failureReasons!: string[]

  @Column({ type: 'boolean', default: false })
  cancelRequested!: boolean
}
