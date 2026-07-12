import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { presentationStudioTable } from '../constants.js'
import type { PresentationJsonObject } from '../types.js'

@Entity(presentationStudioTable('action_log'))
@Index(['tenantId', 'organizationId', 'deckId', 'createdAt'])
export class PresentationActionLog {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Index() @Column({ type: 'varchar', nullable: true }) tenantId?: string
  @Index() @Column({ type: 'varchar', nullable: true }) organizationId?: string
  @Column({ type: 'varchar', nullable: true }) workspaceId?: string
  @Column({ type: 'varchar', nullable: true }) projectId?: string
  @Column({ type: 'varchar', nullable: true }) deckId?: string
  @Column({ type: 'varchar', nullable: true }) versionId?: string
  @Column({ type: 'varchar', nullable: true }) exportId?: string
  @Column({ type: 'varchar' }) action!: string
  @Column({ type: 'varchar' }) actor!: 'agent' | 'workbench' | 'system' | 'collaboration'
  @Column({ type: 'varchar' }) status!: 'succeeded' | 'failed'
  @Column({ type: 'text', nullable: true }) message?: string
  @Column({ type: 'json', nullable: true }) summary?: PresentationJsonObject
  @Column({ type: 'text', nullable: true }) errorMessage?: string
  @Column({ type: 'varchar', nullable: true }) createdById?: string
  @CreateDateColumn({ type: 'timestamptz' }) createdAt?: Date
}
