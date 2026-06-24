// @ts-nocheck
import { __decorate, __metadata } from "tslib";
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
let CustomsWorkbookGeneration = class CustomsWorkbookGeneration {
};
__decorate([
    PrimaryGeneratedColumn('uuid'),
    __metadata("design:type", String)
], CustomsWorkbookGeneration.prototype, "id", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], CustomsWorkbookGeneration.prototype, "tenantId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], CustomsWorkbookGeneration.prototype, "organizationId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], CustomsWorkbookGeneration.prototype, "workspaceId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], CustomsWorkbookGeneration.prototype, "assistantId", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], CustomsWorkbookGeneration.prototype, "createdById", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], CustomsWorkbookGeneration.prototype, "sourceFileName", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], CustomsWorkbookGeneration.prototype, "invoiceNo", void 0);
__decorate([
    Column({ type: 'varchar', nullable: true }),
    __metadata("design:type", String)
], CustomsWorkbookGeneration.prototype, "contractNo", void 0);
__decorate([
    Column({ type: 'varchar' }),
    __metadata("design:type", String)
], CustomsWorkbookGeneration.prototype, "fileName", void 0);
__decorate([
    Column({ type: 'varchar', default: 'generated' }),
    __metadata("design:type", String)
], CustomsWorkbookGeneration.prototype, "status", void 0);
__decorate([
    Column({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Array)
], CustomsWorkbookGeneration.prototype, "sheetNames", void 0);
__decorate([
    Column({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], CustomsWorkbookGeneration.prototype, "workbookData", void 0);
__decorate([
    CreateDateColumn({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], CustomsWorkbookGeneration.prototype, "createdAt", void 0);
__decorate([
    UpdateDateColumn({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], CustomsWorkbookGeneration.prototype, "updatedAt", void 0);
CustomsWorkbookGeneration = __decorate([
    Entity('plugin_trade_compliance_customs_workbook'),
    Index(['tenantId', 'organizationId', 'invoiceNo']),
    Index(['tenantId', 'organizationId', 'status'])
], CustomsWorkbookGeneration);
export { CustomsWorkbookGeneration };
