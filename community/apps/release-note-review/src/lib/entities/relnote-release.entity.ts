import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { RelnoteRisk, RelnoteRollout, RelnoteStatus } from '../types.js'
@Entity('plugin_relnote_release')
@Index(['tenantId', 'organizationId', 'assistantId', 'status'])
export class RelnoteRelease {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Index() @Column({ type: 'varchar', nullable: true }) tenantId?: string
  @Index() @Column({ type: 'varchar', nullable: true }) organizationId?: string
  @Index() @Column({ type: 'varchar', nullable: true }) assistantId?: string
  @Column({ type: 'varchar' }) deviceModel?: string
  @Column({ type: 'varchar' }) version?: string
  @Column({ type: 'text' }) changesRaw?: string
  @Column({ type: 'text', nullable: true }) noteMarkdown?: string
  @Column({ type: 'jsonb', nullable: true }) risks?: RelnoteRisk[]
  @Column({ type: 'varchar', nullable: true }) rollout?: RelnoteRollout
  @Index() @Column({ type: 'varchar', default: 'draft' }) status?: RelnoteStatus
  @Column({ type: 'int', default: 0 }) revision?: number
  @CreateDateColumn({ type: 'timestamptz' }) createdAt?: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt?: Date
}
