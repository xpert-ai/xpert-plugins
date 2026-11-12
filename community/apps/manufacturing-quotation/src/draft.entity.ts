import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type { ImageSource, ProposalLine, Quote, Status } from './contracts.js'

@Entity('plugin_manufacturing_quotation_draft')
@Index(['tenantId', 'organizationId', 'createdById', 'assistantId', 'updatedAt'])
export class QuotationDraft {
  @PrimaryColumn('uuid') id!: string
  @Column({ type: 'varchar', nullable: true }) tenantId!: string
  @Column({ type: 'varchar', nullable: true }) organizationId!: string | null
  @Column('varchar') createdById!: string
  @Column('varchar') assistantId!: string
  @Column('varchar', { length: 120 }) title!: string
  @Column('text') inquiry!: string
  @Column('jsonb', { nullable: true }) source!: ImageSource | null
  @Column('varchar', { default: 'draft' }) status!: Status
  @Column('integer', { default: 1 }) revision!: number
  @Column('integer', { default: 0 }) modelRequests!: number
  @Column('varchar') catalogVersion!: string
  @Column('jsonb', { default: () => "'[]'" }) lines!: ProposalLine[]
  @Column('jsonb', { nullable: true }) quote!: Quote | null
  @Column('varchar', { nullable: true }) errorCode!: string | null
  @Column('varchar', { nullable: true }) attemptId!: string | null
  @Column('timestamp', { nullable: true }) retryAt!: Date | null
  @Column('varchar', { nullable: true }) confirmedById!: string | null
  @Column('timestamp', { nullable: true }) confirmedAt!: Date | null
  @CreateDateColumn() createdAt!: Date
  @UpdateDateColumn() updatedAt!: Date
}

export function draftDto(draft: QuotationDraft) {
  return {
    id: draft.id, title: draft.title, inquiry: draft.inquiry, status: draft.status,
    revision: draft.revision, catalogVersion: draft.catalogVersion, lines: draft.lines, source: draft.source ?? null,
    // Project current fields without rewriting historical stored quotes.
    quote: draft.quote && { ...draft.quote, lines: draft.quote.lines.map((line) => ({
      productId: line.productId, category: line.category, productName: line.productName,
      specification: line.specification, quantityCartons: line.quantityCartons,
      packingQuantity: line.packingQuantity, unitPrice: line.unitPrice, lineAmount: line.lineAmount,
      priceMarker: line.priceMarker ?? null, totalPieces: line.totalPieces,
      status: line.status
    })) }, errorCode: draft.errorCode,
    retryAt: draft.retryAt?.toISOString() ?? null,
    createdAt: draft.createdAt.toISOString(), updatedAt: draft.updatedAt.toISOString()
  }
}
