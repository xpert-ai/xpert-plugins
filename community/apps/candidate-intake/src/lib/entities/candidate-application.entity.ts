import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { APPLICATION_TABLE } from '../constants.js'
import type { ApplicationStatus, CandidateProfile, HrDecision, ScreeningResult } from '../types.js'

@Entity(APPLICATION_TABLE)
@Index(['tenantId', 'organizationId', 'jobId', 'createdAt'])
export class CandidateApplication {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Index()
  @Column({ type: 'varchar', nullable: true })
  tenantId!: string | null

  @Index()
  @Column({ type: 'varchar', nullable: true })
  organizationId!: string | null

  @Index()
  @Column({ type: 'uuid' })
  jobId!: string

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string

  @Column({ type: 'varchar', length: 8 })
  tokenHint!: string

  @Index()
  @Column({ type: 'varchar', length: 32, default: 'invited' })
  status!: ApplicationStatus

  @Column({ type: 'timestamptz' })
  expiresAt!: Date

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  profile!: CandidateProfile

  @Column({ type: 'varchar', nullable: true })
  resumeFileName!: string | null

  @Column({ type: 'varchar', nullable: true })
  resumeMimeType!: string | null

  @Column({ type: 'bytea', nullable: true, select: false })
  resumeData!: Buffer | null

  @Column({ type: 'text', nullable: true, select: false })
  resumeText!: string | null

  @Column({ type: 'varchar', nullable: true })
  photoFileName!: string | null

  @Column({ type: 'varchar', nullable: true })
  photoMimeType!: string | null

  @Column({ type: 'bytea', nullable: true, select: false })
  photoData!: Buffer | null

  @Column({ type: 'text', nullable: true })
  parseError!: string | null

  @Column({ type: 'jsonb', nullable: true })
  screeningResult!: ScreeningResult | null

  @Column({ type: 'text', nullable: true })
  screeningError!: string | null

  @Column({ type: 'varchar', nullable: true })
  hrDecision!: HrDecision | null

  @Column({ type: 'text', nullable: true })
  hrNote!: string | null

  @Column({ type: 'boolean', default: false })
  informationConsent!: boolean

  @Column({ type: 'boolean', default: false })
  accuracyConfirmed!: boolean

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt!: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null

  @Column({ type: 'varchar', nullable: true })
  createdById!: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
