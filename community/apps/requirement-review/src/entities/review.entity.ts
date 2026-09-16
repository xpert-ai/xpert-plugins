import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import { PLUGIN_ARTIFACT_NAMESPACE } from '../constants.js'
import { OwnedRecord } from './owned-record.js'
import type {
  AiDraft,
  ConfirmedSnapshot,
  EditableDraft,
  ReviewStatus
} from '../domain/contracts.js'
import type { SourceSegment } from '../domain/source.js'

@Entity(pluginArtifactTableName(PLUGIN_ARTIFACT_NAMESPACE, 'review'))
@Index(['tenantId', 'organizationId', 'ownerId'])
export class Review extends OwnedRecord {
  @PrimaryColumn({ type: 'varchar', length: 36 }) id!: string
  @Column({ type: 'varchar', length: 80 }) title!: string
  @Column({ type: 'text' }) sourceText!: string
  @Column({ type: 'json' }) sourceSegments!: SourceSegment[]
  @Column({ type: 'varchar', length: 64 }) sourceHash!: string
  @Column({ type: 'varchar' }) status!: ReviewStatus
  @Column({ type: 'int' }) version!: number
  @Column({ type: 'int', default: 1 }) inputVersion!: number
  @Column({ type: 'json', nullable: true }) aiDraft!: AiDraft | null
  @Column({ type: 'json', nullable: true }) editableDraft!: EditableDraft | null
  @Column({ type: 'json', nullable: true })
  confirmedSnapshot!: ConfirmedSnapshot | null
  @Column({ type: 'varchar', nullable: true }) confirmedAt!: string | null
  @Column({ type: 'varchar' }) createdAt!: string
  @Column({ type: 'varchar' }) updatedAt!: string
}
