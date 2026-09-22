import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { NAMESPACE, type Assessment, type Attempt, type Decision, type Status } from './domain.js'

@Entity(pluginArtifactTableName(NAMESPACE, 'record'))
@Index(['tenantId', 'organizationId', 'createdById', 'requestId'], { unique: true })
export class DemandEntity {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) createdById!: string
  @Column({ type: 'varchar' }) requestId!: string
  @Column({ type: 'varchar' }) customer!: string
  @Column({ type: 'varchar' }) title!: string
  @Column({ type: 'text' }) source!: string
  @Column({ type: 'varchar' }) status!: Status
  @Column({ type: 'int' }) revision!: number
  @Column({ type: 'simple-json', nullable: true }) assessment!: Assessment | null
  @Column({ type: 'simple-json', nullable: true }) decision!: Decision | null
  @Column({ type: 'simple-json' }) attempts!: Attempt[]
  @Column({ type: 'varchar', nullable: true }) errorCode!: string | null
  @Column({ type: 'varchar', nullable: true }) leaseUntil!: string | null
  @Column({ type: 'varchar' }) createdAt!: string
  @Column({ type: 'varchar' }) updatedAt!: string
}
