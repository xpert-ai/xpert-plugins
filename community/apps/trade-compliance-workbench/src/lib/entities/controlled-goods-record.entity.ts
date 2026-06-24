// @ts-nocheck
import { __decorate, __metadata } from "tslib";
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
let ControlledGoodsRecord = class ControlledGoodsRecord {
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], ControlledGoodsRecord.prototype, "id", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], ControlledGoodsRecord.prototype, "tenantId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], ControlledGoodsRecord.prototype, "organizationId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], ControlledGoodsRecord.prototype, "workspaceId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], ControlledGoodsRecord.prototype, "createdById", void 0);
__decorate([
    Column({ type: 'varchar' }),
    __metadata("design:type", String)
], ControlledGoodsRecord.prototype, "productName", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], ControlledGoodsRecord.prototype, "hsCode", void 0);
__decorate([
    Column({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Array)
], ControlledGoodsRecord.prototype, "keywords", void 0);
__decorate([
    Column({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], ControlledGoodsRecord.prototype, "controlNote", void 0);
__decorate([
    Column({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], ControlledGoodsRecord.prototype, "enabled", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], ControlledGoodsRecord.prototype, "sourceFileName", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], ControlledGoodsRecord.prototype, "sourceLocation", void 0);
__decorate([
    CreateDateColumn({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], ControlledGoodsRecord.prototype, "createdAt", void 0);
__decorate([
    UpdateDateColumn({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], ControlledGoodsRecord.prototype, "updatedAt", void 0);
ControlledGoodsRecord = __decorate([
    Entity('plugin_trade_compliance_controlled_goods'),
    Index(['tenantId', 'organizationId', 'hsCode']),
    Index(['tenantId', 'organizationId', 'enabled'])
], ControlledGoodsRecord);
export { ControlledGoodsRecord };
