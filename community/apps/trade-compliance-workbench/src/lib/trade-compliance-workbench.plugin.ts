// @ts-nocheck
var TradeComplianceWorkbenchPlugin_1;
import { __decorate } from "tslib";
import { TypeOrmModule } from '@nestjs/typeorm';
import { XpertServerPlugin } from '@xpert-ai/plugin-sdk';
import { ControlledGoodsRecord, CustomsWorkbookGeneration, TradeComplianceImportBatch, TradeComplianceReviewItem, TradeProduct, TradeSupplier } from './entities/index.js';
import { TradeComplianceWorkbenchMiddleware } from './trade-compliance-workbench.middleware.js';
import { TradeComplianceWorkbenchService } from './trade-compliance-workbench.service.js';
import { TradeComplianceWorkbenchViewProvider } from './trade-compliance-workbench-view.provider.js';
export const TRADE_COMPLIANCE_ENTITIES = [
    TradeComplianceImportBatch,
    TradeComplianceReviewItem,
    ControlledGoodsRecord,
    TradeSupplier,
    TradeProduct,
    CustomsWorkbookGeneration
];
let TradeComplianceWorkbenchPlugin = TradeComplianceWorkbenchPlugin_1 = class TradeComplianceWorkbenchPlugin {
    onPluginBootstrap() {
        console.log(`${TradeComplianceWorkbenchPlugin_1.name} is being bootstrapped...`);
    }
    onPluginDestroy() {
        console.log(`${TradeComplianceWorkbenchPlugin_1.name} is being destroyed...`);
    }
};
TradeComplianceWorkbenchPlugin = TradeComplianceWorkbenchPlugin_1 = __decorate([
    XpertServerPlugin({
        imports: [TypeOrmModule.forFeature(TRADE_COMPLIANCE_ENTITIES)],
        entities: TRADE_COMPLIANCE_ENTITIES,
        providers: [
            TradeComplianceWorkbenchService,
            TradeComplianceWorkbenchMiddleware,
            TradeComplianceWorkbenchViewProvider
        ],
        exports: [TradeComplianceWorkbenchService]
    })
], TradeComplianceWorkbenchPlugin);
export { TradeComplianceWorkbenchPlugin };
