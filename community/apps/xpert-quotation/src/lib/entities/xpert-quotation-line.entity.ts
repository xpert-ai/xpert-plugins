import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  ExternalPriceSource,
  KnowledgePriceCandidate,
  MatchStatus,
  QuotaBreakdownProposal,
  QuotaKnowledgeCandidate,
  QuotaPricingResource,
  QuotaResourcePriceState,
  QuotationLinePricingCalculation,
  UnitConversionTrace,
  QuotationLineKind
} from '../types.js'
import { xpertQuotationTable } from '../constants.js'

@Entity(xpertQuotationTable('line'))
@Index(['tenantId', 'organizationId', 'quotationId', 'sheetName', 'rowNumber'], { unique: true })
@Index(['tenantId', 'organizationId', 'quotationId', 'matchStatus'])
export class XpertQuotationLine {
  @PrimaryGeneratedColumn('uuid') id?: string
  @Column({ type: 'varchar' }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId?: string | null
  @Column({ type: 'varchar' }) quotationId!: string
  @Column({ type: 'varchar' }) sheetName!: string
  @Column({ type: 'int' }) rowNumber!: number
  @Column({ type: 'varchar' }) discipline!: 'building' | 'installation'
  @Column({ type: 'varchar' }) kind!: QuotationLineKind
  @Column({ type: 'boolean', default: false }) materialReferenceOnly!: boolean
  @Column({ type: 'varchar', nullable: true }) code?: string | null
  @Column({ type: 'text' }) name!: string
  @Column({ type: 'text', nullable: true }) specification?: string | null
  @Column({ type: 'varchar', nullable: true }) unit?: string | null
  @Column({ type: 'varchar', nullable: true }) quantity?: string | null
  @Column({ type: 'varchar', nullable: true }) quantityAddress?: string | null
  @Column({ type: 'varchar' }) targetPriceAddress!: string
  @Column({ type: 'varchar', nullable: true }) targetAmountAddress?: string | null
  @Column({ type: 'varchar', default: 'unmatched' }) matchStatus!: MatchStatus
  @Column({ type: 'varchar', nullable: true }) matchedPriceItemId?: string | null
  @Column({ type: 'varchar', nullable: true }) matchedUnitPrice?: string | null
  @Column({ type: 'varchar', nullable: true }) calculatedAmount?: string | null
  @Column({ type: 'jsonb', nullable: true }) candidateIds?: string[] | null
  @Column({ type: 'text', nullable: true }) matchEvidence?: string | null
  @Column({ type: 'varchar', nullable: true }) aiRecommendedPriceItemId?: string | null
  @Column({ type: 'jsonb', nullable: true }) knowledgeCandidates?: KnowledgePriceCandidate[] | null
  @Column({ type: 'timestamptz', nullable: true }) knowledgeSearchedAt?: Date | null
  @Column({ type: 'text', nullable: true }) knowledgeNoMatchReason?: string | null
  @Column({ type: 'timestamptz', nullable: true }) knowledgeNoMatchAt?: Date | null
  @Column({ type: 'jsonb', nullable: true }) quotaWorkScopes?: string[] | null
  @Column({ type: 'jsonb', nullable: true }) quotaCandidates?: QuotaKnowledgeCandidate[] | null
  @Column({ type: 'timestamptz', nullable: true }) quotaSearchedAt?: Date | null
  @Column({ type: 'jsonb', nullable: true }) quotaBreakdown?: QuotaBreakdownProposal | null
  @Column({ type: 'jsonb', nullable: true }) quotaPricingResources?: QuotaPricingResource[] | null
  @Column({ type: 'jsonb', nullable: true }) quotaResourcePrices?: QuotaResourcePriceState[] | null
  @Column({ type: 'jsonb', nullable: true }) pricingCalculation?: QuotationLinePricingCalculation | null
  @Column({ type: 'varchar', nullable: true }) aiRecommendedKnowledgeCandidateId?: string | null
  @Column({ type: 'varchar', nullable: true }) aiRecommendedKnowledgebaseId?: string | null
  @Column({ type: 'varchar', nullable: true }) aiRecommendedDocumentId?: string | null
  @Column({ type: 'varchar', nullable: true }) aiRecommendedChunkId?: string | null
  @Column({ type: 'text', nullable: true }) aiMatchedMaterialName?: string | null
  @Column({ type: 'text', nullable: true }) aiMatchedSpecification?: string | null
  @Column({ type: 'text', nullable: true }) aiKnowledgeEvidence?: string | null
  @Column({ type: 'varchar', nullable: true }) aiRecommendedUnitPrice?: string | null
  @Column({ type: 'varchar', nullable: true }) aiRecommendedSourceUnitPrice?: string | null
  @Column({ type: 'varchar', nullable: true }) aiRecommendedSourceUnit?: string | null
  @Column({ type: 'jsonb', nullable: true }) aiUnitConversion?: UnitConversionTrace | null
  @Column({ type: 'double precision', nullable: true }) aiConfidence?: number | null
  @Column({ type: 'text', nullable: true }) aiRationale?: string | null
  @Column({ type: 'jsonb', nullable: true }) aiDifferences?: string[] | null
  @Column({ type: 'jsonb', nullable: true }) aiSources?: ExternalPriceSource[] | null
  @Column({ type: 'timestamptz', nullable: true }) aiRecommendedAt?: Date | null
  @CreateDateColumn({ type: 'timestamptz' }) createdAt?: Date
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt?: Date
}
