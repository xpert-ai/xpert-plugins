import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import type { Analysis, TicketStatus } from './domain.js'
export const NAMESPACE = 'aftersales_ticket'
@Entity(pluginArtifactTableName(NAMESPACE, 'ticket'))
@Index(['tenantId', 'organizationId', 'ownerId'])
export class Ticket {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({type: 'varchar'}) tenantId!: string
  @Column({type: 'varchar'}) organizationId!: string
  @Column({type: 'varchar'}) ownerId!: string
  @Column({type: 'varchar', length: 160}) title!: string
  @Column({type: 'text'}) description!: string
  @Column({type: 'varchar', default: 'draft'}) status!: TicketStatus
  @Column({type: 'int', default: 0}) attempt!: number
  @Column({type: 'json', nullable: true}) analysis!: Analysis | null
  @Column({type: 'text', nullable: true}) finalReply!: string | null
  @Column({type: 'varchar', nullable: true}) confirmedBy!: string | null
  @Column({type: 'varchar', nullable: true}) errorCode!: string | null
  @CreateDateColumn() createdAt!: Date
  @UpdateDateColumn() updatedAt!: Date
}
