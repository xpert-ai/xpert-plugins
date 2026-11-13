import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { RelnoteRunStatus } from '../types.js'
@Entity('plugin_relnote_ai_run')
@Index(['tenantId', 'organizationId', 'releaseId'])
export class RelnoteAiRun {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Index() @Column({ type: 'varchar', nullable: true }) tenantId?: string
  @Index() @Column({ type: 'varchar', nullable: true }) organizationId?: string
  @Index() @Column({ type: 'uuid' }) releaseId?: string
  @Column({ type: 'int', default: 1 }) attempt?: number
  @Column({ type: 'varchar' }) status?: RelnoteRunStatus
  @Column({ type: 'text', nullable: true }) errorMessage?: string
  @CreateDateColumn({ type: 'timestamptz' }) startedAt?: Date
  @Column({ type: 'timestamptz', nullable: true }) finishedAt?: Date
}
