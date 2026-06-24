// @ts-nocheck
import { __decorate, __metadata } from "tslib";
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
let TradeSupplier = class TradeSupplier {
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], TradeSupplier.prototype, "id", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeSupplier.prototype, "tenantId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeSupplier.prototype, "organizationId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeSupplier.prototype, "workspaceId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeSupplier.prototype, "createdById", void 0);
__decorate([
    Column({ type: 'varchar' }),
    __metadata("design:type", String)
], TradeSupplier.prototype, "name", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeSupplier.prototype, "creditCode", void 0);
__decorate([
    Column({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], TradeSupplier.prototype, "address", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], TradeSupplier.prototype, "contact", void 0);
__decorate([
    CreateDateColumn({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], TradeSupplier.prototype, "createdAt", void 0);
__decorate([
    UpdateDateColumn({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], TradeSupplier.prototype, "updatedAt", void 0);
TradeSupplier = __decorate([
    Entity('plugin_trade_compliance_supplier'),
    Index(['tenantId', 'organizationId', 'name'])
], TradeSupplier);
export { TradeSupplier };
