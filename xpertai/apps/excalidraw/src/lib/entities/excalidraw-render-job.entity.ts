import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import {
  pluginArtifactTableName,
  type WorkspacePortableFileReference,
  type SandboxJobOutput
} from '@xpert-ai/plugin-sdk'
import { EXCALIDRAW_ARTIFACT_NAMESPACE } from '../constants.js'
export type RenderJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'conflict'
@Entity(pluginArtifactTableName(EXCALIDRAW_ARTIFACT_NAMESPACE, 'render_job'))
@Index(['tenantId', 'organizationId', 'actorId', 'cacheKey'], { unique: true })
export class ExcalidrawRenderJob {
  @PrimaryGeneratedColumn('uuid') id!: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar' }) organizationId!: string
  @Column({ type: 'varchar' }) actorId!: string
  @Column({ type: 'varchar' }) userId!: string
  @Column({ type: 'varchar' }) drawingId!: string
  @Column({ type: 'varchar', length: 64 }) cacheKey!: string
  @Column({ type: 'varchar' }) kind!: 'preview' | 'export' | 'mermaid' | 'diagram_preview'
  @Column({ type: 'varchar' }) format!: 'json' | 'svg' | 'png'
  @Column({ type: 'varchar', default: 'queued' }) status!: RenderJobStatus
  @Column({ type: 'int' }) sceneRevision!: number
  @Column({ type: 'int', nullable: true }) irRevision?: number
  @Column({ type: 'jsonb', nullable: true }) inputReference?: WorkspacePortableFileReference
  @Column({ type: 'varchar', nullable: true }) inputHash?: string
  @Column({ type: 'int', nullable: true }) inputSize?: number
  @Column({ type: 'jsonb', default: [] }) outputs!: SandboxJobOutput[]
  @Column({ type: 'varchar', nullable: true }) queueJobId?: string
  @Column({ type: 'varchar', nullable: true }) errorCode?: string
  @Column({ type: 'varchar', nullable: true }) qualityRunId?: string
  @CreateDateColumn() createdAt!: Date
  @UpdateDateColumn() updatedAt!: Date
}
