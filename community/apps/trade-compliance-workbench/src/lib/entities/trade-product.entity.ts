// @ts-nocheck
import { __decorate, __metadata } from "tslib";
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
let TradeProduct = class TradeProduct {
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], TradeProduct.prototype, "id", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeProduct.prototype, "tenantId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeProduct.prototype, "organizationId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeProduct.prototype, "workspaceId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeProduct.prototype, "createdById", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeProduct.prototype, "supplierId", void 0);
__decorate([
    Column({ type: 'varchar' }),
    __metadata("design:type", String)
], TradeProduct.prototype, "supplierName", void 0);
__decorate([
    Column({ type: 'varchar' }),
    __metadata("design:type", String)
], TradeProduct.prototype, "productName", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeProduct.prototype, "model", void 0);
__decorate([
    Column({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], TradeProduct.prototype, "description", void 0);
__decorate([
    Column({ type: 'float', nullable: true }),
    __metadata("design:type", Number)
], TradeProduct.prototype, "quantity", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeProduct.prototype, "unit", void 0);
__decorate([
    Column({ type: 'float', nullable: true }),
    __metadata("design:type", Number)
], TradeProduct.prototype, "taxInclusiveUnitPrice", void 0);
__decorate([
    Column({ type: 'float', nullable: true }),
    __metadata("design:type", Number)
], TradeProduct.prototype, "taxInclusiveTotalAmount", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeProduct.prototype, "contractHsCode", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeProduct.prototype, "enrichedHsCode", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeProduct.prototype, "taxRefundRate", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeProduct.prototype, "englishName", void 0);
__decorate([
    Column({ type: 'varchar', default: 'unchecked' }),
    __metadata("design:type", String)
], TradeProduct.prototype, "controlledStatus", void 0);
__decorate([
    Column({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], TradeProduct.prototype, "controlNote", void 0);
__decorate([
    Column({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Array)
], TradeProduct.prototype, "matchedControlledGoods", void 0);
__decorate([
    CreateDateColumn({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], TradeProduct.prototype, "createdAt", void 0);
__decorate([
    UpdateDateColumn({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], TradeProduct.prototype, "updatedAt", void 0);
TradeProduct = __decorate([
    Entity('plugin_trade_compliance_product'),
    Index(['tenantId', 'organizationId', 'supplierName']),
    Index(['tenantId', 'organizationId', 'enrichedHsCode']),
    Index(['tenantId', 'organizationId', 'controlledStatus'])
], TradeProduct);
export { TradeProduct };
