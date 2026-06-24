// @ts-nocheck
import { __decorate, __metadata } from "tslib";
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
let TradeComplianceReviewItem = class TradeComplianceReviewItem {
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], TradeComplianceReviewItem.prototype, "id", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeComplianceReviewItem.prototype, "tenantId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeComplianceReviewItem.prototype, "organizationId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeComplianceReviewItem.prototype, "workspaceId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeComplianceReviewItem.prototype, "assistantId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeComplianceReviewItem.prototype, "createdById", void 0);
__decorate([
    Column({ type: 'varchar' }),
    __metadata("design:type", String)
], TradeComplianceReviewItem.prototype, "batchId", void 0);
__decorate([
    Column({ type: 'varchar' }),
    __metadata("design:type", String)
], TradeComplianceReviewItem.prototype, "type", void 0);
__decorate([
    Column({ type: 'varchar' }),
    __metadata("design:type", String)
], TradeComplianceReviewItem.prototype, "title", void 0);
__decorate([
    Column({ type: 'varchar', default: 'pending' }),
    __metadata("design:type", String)
], TradeComplianceReviewItem.prototype, "reviewStatus", void 0);
__decorate([
    Column({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], TradeComplianceReviewItem.prototype, "extractedData", void 0);
__decorate([
    Column({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], TradeComplianceReviewItem.prototype, "defaultData", void 0);
__decorate([
    Column({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], TradeComplianceReviewItem.prototype, "confirmedData", void 0);
__decorate([
    Column({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Array)
], TradeComplianceReviewItem.prototype, "fields", void 0);
__decorate([
    Column({ type: 'float', nullable: true }),
    __metadata("design:type", Number)
], TradeComplianceReviewItem.prototype, "confidence", void 0);
__decorate([
    Column({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], TradeComplianceReviewItem.prototype, "sourceLocation", void 0);
__decorate([
    CreateDateColumn({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], TradeComplianceReviewItem.prototype, "createdAt", void 0);
__decorate([
    UpdateDateColumn({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], TradeComplianceReviewItem.prototype, "updatedAt", void 0);
TradeComplianceReviewItem = __decorate([
    Entity('plugin_trade_compliance_review_item'),
    Index(['tenantId', 'organizationId', 'batchId']),
    Index(['tenantId', 'organizationId', 'reviewStatus'])
], TradeComplianceReviewItem);
export { TradeComplianceReviewItem };
