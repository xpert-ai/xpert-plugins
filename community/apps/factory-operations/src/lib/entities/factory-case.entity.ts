import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm'
import type { FactoryCaseState, FactoryCaseStatus } from '../domain/types.js'
import { factoryTable } from '../artifact-namespace.js'

@Entity(factoryTable('case'))
@Index(['tenantId', 'organizationId', 'status', 'updatedAt'])
@Index(['scopeKey', 'caseKey'], { unique: true })
@Index(['scopeKey', 'creationOperationId'], { unique: true })
@Index(['workspaceProjectId'], { unique: true })
export class FactoryCaseEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string

  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', length: 180 })
  scopeKey!: string

  @Column({ type: 'varchar', length: 80 })
  caseKey!: string

  @Column({ type: 'varchar', length: 128 })
  creationOperationId!: string

  @Column({ type: 'varchar', length: 64 })
  creationFingerprint!: string

  @Column({ type: 'varchar', length: 64 })
  status!: FactoryCaseStatus

  @Column({ type: 'varchar' })
  createdById!: string

  @Column({ type: 'uuid' })
  workspaceProjectId!: string

  @Column({ type: 'varchar', length: 24 })
  workspaceProjectSyncStatus!: 'provisioning' | 'ready' | 'failed'

  @Column({ type: 'timestamptz' })
  workspaceProjectSyncedAt!: Date

  @Column({ type: 'varchar', length: 100, nullable: true })
  workspaceProjectErrorCode?: string | null

  @Column({ type: 'varchar', length: 500, nullable: true })
  workspaceProjectErrorSummary?: string | null

  @Column({ type: 'varchar', nullable: true })
  coordinatorXpertId?: string | null

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  assignedAssistantIds!: string[]

  @Column({ type: 'varchar', length: 100 })
  currentStage!: string

  @Column({ type: 'varchar', length: 80 })
  deviceId!: string

  @Column({ type: 'int', default: 1 })
  revision!: number

  @Column({ type: 'jsonb' })
  snapshot!: FactoryCaseState

  @Column({ type: 'varchar', nullable: true })
  lastEditedById?: string | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  failureCode?: string | null

  @Column({ type: 'text', nullable: true })
  failureMessage?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
