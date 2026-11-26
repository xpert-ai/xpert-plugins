import { Column, Entity, Index, PrimaryColumn } from './host-orm.js'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { ARTIFACT_NAMESPACE } from './constants.js'
import type { Analysis, Category, FailureCode, Ticket } from './domain.js'

@Entity(pluginArtifactTableName(ARTIFACT_NAMESPACE, 'ticket'))
@Index(['tenantId', 'organizationId', 'userId', 'requestId'], { unique: true })
@Index(['tenantId', 'organizationId', 'userId', 'createdAt', 'id'])
export class FeedbackTicket {
  @PrimaryColumn('uuid') id!: string
  @Column('uuid') tenantId!: string
  @Column('uuid') organizationId!: string
  @Column('uuid') userId!: string
  @Column('uuid') requestId!: string
  @Column('text') source!: string
  @Column('varchar') status!: Ticket['status']
  @Column('simple-json', { nullable: true }) analysis!: Analysis | null
  @Column('varchar', { nullable: true }) confirmedCategory!: Category | null
  @Column('varchar', { nullable: true }) errorCode!: FailureCode | null
  @Column('int') attempts!: number
  @Column('varchar') createdAt!: string
  @Column('varchar') updatedAt!: string
}
