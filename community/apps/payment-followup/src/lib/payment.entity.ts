import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { NAMESPACE } from './constants'
import type { CaseState } from './domain'

@Entity(pluginArtifactTableName(NAMESPACE, 'case'))
@Index(['tenantId', 'organizationId', 'userId', 'assistantId', 'requestKey'], { unique: true })
@Index(['tenantId', 'organizationId', 'userId', 'assistantId', 'updatedAt'])
export class PaymentCase {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'varchar' }) assistantId!: string
  @Column({ type: 'varchar' }) requestKey!: string
  @Column({ type: 'jsonb' }) state!: CaseState
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
