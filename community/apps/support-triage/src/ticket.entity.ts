import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { NAMESPACE, type Ticket } from './domain.js'

@Entity(pluginArtifactTableName(NAMESPACE, 'ticket'))
@Index(['tenantId', 'organizationId', 'userId', 'xpertId', 'updatedAt'])
export class TicketEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 }) id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'varchar' }) xpertId!: string
  @Column({ type: 'varchar', length: 160 }) subject!: string
  @Column({ type: 'text' }) body!: string
  @Column({ type: 'int' }) revision!: number
  @Column({ type: 'varchar' }) status!: Ticket['status']
  @Column({ type: 'int' }) attempts!: number
  @Column({ type: 'text', nullable: true }) analysisJson!: string | null
  @Column({ type: 'text', nullable: true }) confirmedJson!: string | null
  @Column({ type: 'varchar', nullable: true }) failureCode!: string | null
  @Column({ type: 'varchar' }) updatedAt!: string
  @Column({ type: 'varchar' }) createdAt!: string
  @Column({ type: 'varchar', nullable: true }) confirmedAt!: string | null
}
