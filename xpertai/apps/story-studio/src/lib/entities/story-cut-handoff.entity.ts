import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'
import type {
  StoryCutHandoffContract,
  StoryCutHandoffMode,
  StoryCutHandoffStatus
} from '../story-cut-handoff.types.js'
import { storyStudioTable } from '../story-studio-artifact-namespace.js'

@Entity(storyStudioTable('cut_handoff'))
@Index(['tenantId', 'scopeKey', 'operationId'], { unique: true })
@Index(['tenantId', 'scopeKey', 'projectId', 'sourceRevision'], {
  unique: true
})
@Index(['tenantId', 'organizationId', 'projectId', 'createdAt'])
export class StoryCutHandoff {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string | null

  @Column({ type: 'varchar', nullable: true })
  hostProjectId?: string | null

  @Column({ type: 'varchar', length: 64 })
  scopeKey!: string

  @Column({ type: 'uuid' })
  projectId!: string

  @Column({ type: 'varchar', length: 128 })
  operationId!: string

  @Column({ type: 'varchar', length: 16, default: '1.0' })
  contractVersion!: '1.0'

  @Column({ type: 'int' })
  sourceRevision!: number

  @Column({ type: 'int', default: 1 })
  handoffRevision!: number

  @Column({ type: 'varchar', length: 24 })
  mode!: StoryCutHandoffMode

  @Column({ type: 'varchar', length: 24, default: 'ready' })
  status!: StoryCutHandoffStatus

  @Column({ type: 'varchar', length: 64 })
  checksum!: string

  @Column({ type: 'jsonb' })
  contract!: StoryCutHandoffContract

  @Column({ type: 'uuid', nullable: true })
  cutProjectId?: string | null

  @Column({ type: 'int', nullable: true })
  cutProjectRevision?: number | null

  @Column({ type: 'uuid', nullable: true })
  cutProposalId?: string | null

  @Column({ type: 'varchar', length: 120, nullable: true })
  failureCode?: string | null

  @Column({ type: 'text', nullable: true })
  failureMessage?: string | null

  @Column({ type: 'varchar', length: 240 })
  changeSummary!: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt?: Date | null
}
