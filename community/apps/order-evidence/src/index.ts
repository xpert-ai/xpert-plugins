import { app, APP_COVER } from "./app-config.js";
export { app } from "./app-config.js";
import { z } from "zod/v3";
import { TypeOrmModule } from "@nestjs/typeorm";
import { XpertServerPlugin, type XpertPlugin } from "@xpert-ai/plugin-sdk";
import { CONFIG, ENTITIES, installationSchema } from "./model.js";
import {
  NAME,
  VERSION,
  PACKAGE_METADATA,
  LEVEL,
  ICON,
  ALL_ROLES,
  middleware,
} from "./definition.js";
import { templates } from "./templates.js";
import { OrderService } from "./service.js";
import { OrderContribution } from "./configuration.js";
import { ADAPTERS } from "./adapters.js";
import { OrderTools } from "./tools.js";
import { IMPROVEMENT_ENTITIES } from "./improvement/entities.js";
import { OrderRulesService } from "./improvement/rules.service.js";
import { OrderImprovementService } from "./improvement/source.service.js";
import { OrderImprovementTools } from "./improvement/tools.js";
import { OrderMethodEvolution } from "./improvement/evolution.js";
@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature([...ENTITIES, ...IMPROVEMENT_ENTITIES])],
  entities: [...ENTITIES, ...IMPROVEMENT_ENTITIES],
  providers: [
    OrderRulesService,
    OrderService,
    OrderContribution,
    ...ADAPTERS,
    OrderTools,
    OrderImprovementService,
    OrderImprovementTools,
    OrderMethodEvolution,
  ],
})
export class OrderPluginModule {}

const plugin: XpertPlugin<z.input<typeof installationSchema>> = {
  meta: {
    name: NAME,
    version: VERSION,
    level: LEVEL,
    artifactNamespace: PACKAGE_METADATA.xpert.plugin.artifactNamespace,
    category: "middleware",
    displayName: "订单全流程证据",
    description:
      "Project Pipelines + six specialist Assistants + human decisions.",
    author: "XpertAI",
    icon: ICON,
    targetApps: ["xpert", "data-xpert"],
    targetAppMeta: Object.fromEntries(
      ["xpert", "data-xpert"].map((k) => [
        k,
        {
          types: ["business-app", "assistant-template"],
          capabilities: [
            "project.tasks",
            ...ALL_ROLES.map((r) => "order_evidence." + r.key),
          ],
          marketplace: { screenshots: [APP_COVER], contents: [app] },
          runtime: {
            middlewareProviders: ALL_ROLES.map((r) => middleware(r.key)),
          },
        },
      ]),
    ),
  },
  config: { schema: installationSchema, defaults: installationSchema.parse({}) },
  templates,
  register(ctx) {
    return {
      module: OrderPluginModule,
      global: true,
      providers: [
        { provide: CONFIG, useValue: installationSchema.parse(ctx.config) },
      ],
      exports: [CONFIG],
    };
  },
};
export default plugin;
export { templates };
