import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { JOB_TABLE } from '../constants.js'
import type { JobQuestion } from '../types.js'

@Entity(JOB_TABLE)
@Index(['tenantId', 'organizationId', 'createdAt'])
export class CandidateJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId!: string | null

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId!: string | null

  @Column({ type: 'varchar', length: 200 })
  companyName!: string

  @Column({ type: 'varchar', length: 200 })
  roleName!: string

  @Column({ type: 'text' })
  roleDescription!: string

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  requiredCriteria!: string[]

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  preferredCriteria!: string[]

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  questions!: JobQuestion[]

  @Column({ type: 'integer', default: 7 })
  defaultExpiryDays!: number

  @Column({ type: 'boolean', default: true })
  active!: boolean

  @Column({ type: 'varchar', nullable: true })
  createdById!: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
