// @ts-nocheck
import { __decorate, __metadata } from "tslib";
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
let TradeComplianceImportBatch = class TradeComplianceImportBatch {
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], TradeComplianceImportBatch.prototype, "id", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeComplianceImportBatch.prototype, "tenantId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeComplianceImportBatch.prototype, "organizationId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeComplianceImportBatch.prototype, "workspaceId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeComplianceImportBatch.prototype, "assistantId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeComplianceImportBatch.prototype, "createdById", void 0);
__decorate([
    Column({ type: 'varchar' }),
    __metadata("design:type", String)
], TradeComplianceImportBatch.prototype, "type", void 0);
__decorate([
    Column({ type: 'varchar', default: 'pending_review' }),
    __metadata("design:type", String)
], TradeComplianceImportBatch.prototype, "status", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeComplianceImportBatch.prototype, "sourceFileName", void 0);
__decorate([
    Column({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], TradeComplianceImportBatch.prototype, "metadata", void 0);
__decorate([
    CreateDateColumn({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], TradeComplianceImportBatch.prototype, "createdAt", void 0);
__decorate([
    UpdateDateColumn({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], TradeComplianceImportBatch.prototype, "updatedAt", void 0);
TradeComplianceImportBatch = __decorate([
    Entity('plugin_trade_compliance_import_batch'),
    Index(['tenantId', 'organizationId', 'assistantId', 'type']),
    Index(['tenantId', 'organizationId', 'status'])
], TradeComplianceImportBatch);
export { TradeComplianceImportBatch };
