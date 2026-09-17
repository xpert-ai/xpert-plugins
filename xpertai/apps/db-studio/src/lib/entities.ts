import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
export type StudioRecordKind =
  | 'session'
  | 'draft'
  | 'favorite'
  | 'chart'
  | 'dashboard'
  | 'snapshot'
  | 'plan'
  | 'execution'
  | 'transfer'
export type StudioStatus =
  | 'saved'
  | 'queued'
  | 'awaiting_approval'
  | 'ready'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'unknown'
  | 'pending'
  | 'cancelled'
@Entity('plugin_db_studio_record')
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'kind', 'updatedAt'])
@Index(['tenantId', 'organizationId', 'workspaceId', 'userId', 'operationId'], { unique: true })
export class StudioRecord {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) workspaceId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'varchar' }) xpertId!: string
  @Column({ type: 'varchar' }) kind!: StudioRecordKind
  @Column({ type: 'varchar', default: 'saved' }) status!: StudioStatus
  @Column({ type: 'varchar', nullable: true }) operationId?: string
  @Column({ type: 'varchar', nullable: true }) dataSourceId?: string
  @Column({ type: 'varchar', nullable: true }) queueJobId?: string
  @Column({ type: 'varchar' }) title!: string
  @Column({ type: 'jsonb', default: {} }) payload!: Record<string, unknown>
  @Column({ type: 'int', default: 1 }) revision!: number
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
@Entity('plugin_db_studio_policy')
@Index(['tenantId', 'organizationId', 'workspaceId', 'dataSourceId'], { unique: true })
export class StudioPolicy {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) workspaceId!: string
  @Column({ type: 'varchar' }) dataSourceId!: string
  @Column({ type: 'boolean', default: true }) readOnly!: boolean
  @Column({ type: 'jsonb', default: [] }) autoActions!: string[]
  @Column({ type: 'jsonb', default: [] }) objects!: Array<{
    database?: string
    schema?: string
    name: string
    kind: 'table' | 'view'
  }>
  @Column({ type: 'int', default: 1 }) revision!: number
  @Column({ type: 'varchar' }) updatedBy!: string
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date
}
