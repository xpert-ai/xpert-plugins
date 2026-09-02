import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn
} from 'typeorm'
import { factoryTable } from '../artifact-namespace.js'

@Entity(factoryTable('audit'))
@Index(['scopeKey', 'operationId'], { unique: true })
@Index(['tenantId', 'organizationId', 'caseId', 'createdAt'])
export class FactoryAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', length: 180 })
  scopeKey!: string

  @Column({ type: 'uuid' })
  caseId!: string

  @Column({ type: 'varchar', length: 128 })
  operationId!: string

  @Column({ type: 'varchar', length: 64 })
  operationFingerprint!: string

  @Column({ type: 'varchar', length: 100 })
  eventType!: string

  @Column({ type: 'varchar', length: 32 })
  actorType!: 'agent' | 'user' | 'system'

  @Column({ type: 'varchar', nullable: true })
  actorId?: string | null

  @Column({ type: 'int', nullable: true })
  previousRevision?: number | null

  @Column({ type: 'int' })
  resultingRevision!: number

  @Column({ type: 'varchar', length: 180 })
  changeSummary!: string

  @Column({ type: 'jsonb' })
  receipt!: object

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date
}
