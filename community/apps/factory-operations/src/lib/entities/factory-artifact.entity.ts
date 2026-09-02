import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn
} from 'typeorm'
import type { EvidenceRecord } from '../domain/types.js'
import { factoryTable } from '../artifact-namespace.js'

@Entity(factoryTable('artifact'))
@Index(['tenantId', 'organizationId', 'caseId', 'artifactKey', 'artifactRevision'], {
  unique: true
})
export class FactoryArtifactEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', nullable: true })
  tenantId?: string | null

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'uuid' })
  caseId!: string

  @Column({ type: 'varchar', length: 100 })
  artifactKey!: string

  @Column({ type: 'int' })
  artifactRevision!: number

  @Column({ type: 'varchar', length: 64 })
  status!: string

  @Column({ type: 'jsonb' })
  payload!: object

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  evidence!: EvidenceRecord[]

  @Column({ type: 'float', nullable: true })
  confidence?: number | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  createdByAgentKey?: string | null

  @Column({ type: 'varchar', length: 128 })
  operationId!: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date
}
