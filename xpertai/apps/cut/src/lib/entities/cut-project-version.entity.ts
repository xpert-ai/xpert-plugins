import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { CutProjectDocument } from '../types.js'

@Entity('plugin_cut_project_version')
@Index(['tenantId', 'organizationId', 'cutProjectId', 'versionNumber'], { unique: true })
export class CutProjectVersion {
  @PrimaryGeneratedColumn('uuid')
  id?: string

  @Column({ type: 'varchar' })
  tenantId!: string

  @Column({ type: 'varchar', nullable: true })
  organizationId?: string | null

  @Column({ type: 'varchar', nullable: true })
  workspaceId?: string | null

  @Column({ type: 'varchar', nullable: true })
  platformProjectId?: string | null

  @Column({ type: 'varchar' })
  cutProjectId!: string

  @Column({ type: 'int' })
  versionNumber!: number

  @Column({ type: 'jsonb' })
  document!: CutProjectDocument

  @Column({ type: 'int' })
  revision!: number

  @Column({ type: 'text' })
  changeSummary!: string

  @Column({ type: 'varchar', nullable: true })
  createdById?: string | null

  @Column({ type: 'varchar', nullable: true })
  assistantId?: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt?: Date
}
