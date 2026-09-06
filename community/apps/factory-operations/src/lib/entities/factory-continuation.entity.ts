import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { factoryTable } from '../artifact-namespace.js'

export type FactoryContinuationStatus = 'pending' | 'running' | 'waiting' | 'completed' | 'blocked' | 'failed'

@Entity(factoryTable('continuation'))
@Index(['scopeKey', 'operationId'], { unique: true })
@Index(['caseId', 'approvedRevision'], { unique: true })
@Index(['installationScopeKey', 'status', 'availableAt'])
export class FactoryContinuationEntity {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId!: string | null
  @Column({ type: 'varchar', length: 180 }) scopeKey!: string
  @Column({ type: 'varchar', length: 180 }) installationScopeKey!: string
  @Column({ type: 'uuid' }) caseId!: string
  @Column({ type: 'varchar', length: 128 }) operationId!: string
  @Column({ type: 'varchar', length: 128 }) executionOperationId!: string
  @Column({ type: 'varchar', length: 128, nullable: true }) verificationOperationId!: string | null
  @Column({ type: 'varchar' }) actorId!: string
  @Column({ type: 'varchar', nullable: true }) coordinatorXpertId!: string | null
  @Column({ type: 'int' }) approvedRevision!: number
  @Column({ type: 'int' }) expectedRevision!: number
  @Column({ type: 'int' }) planRevision!: number
  @Column({ type: 'varchar', length: 24, default: 'pending' }) status!: FactoryContinuationStatus
  @Column({ type: 'varchar', length: 24, default: 'execute' }) step!: 'execute' | 'verify' | 'complete'
  @Column({ type: 'varchar', length: 128, nullable: true }) reasonCode!: string | null
  @Column({ type: 'uuid', nullable: true }) verificationRecordId!: string | null
  @Column({ type: 'int', default: 0 }) verificationAttempt!: number
  @Column({ type: 'int', default: 0 }) generation!: number
  @Column({ type: 'int', default: 0 }) failures!: number
  @Column({ type: 'uuid', nullable: true }) leaseToken!: string | null
  @Column({ type: 'timestamptz', nullable: true }) leaseUntil!: Date | null
  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' }) availableAt!: Date
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
