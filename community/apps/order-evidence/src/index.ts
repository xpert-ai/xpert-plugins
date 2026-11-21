import { app, APP_COVER } from "./app-config.js";
export { app } from "./app-config.js";
import { z } from "zod/v3";
import { TypeOrmModule } from "@nestjs/typeorm";
import { XpertServerPlugin, type XpertPlugin } from "@xpert-ai/plugin-sdk";
import { CONFIG, ENTITIES, configSchema, type Config } from "./model.js";
import {
  NAME,
  VERSION,
  PACKAGE_METADATA,
  LEVEL,
  ICON,
  ROLES,
  middleware,
} from "./definition.js";
import { templates } from "./templates.js";
import { OrderService } from "./service.js";
import { OrderContribution } from "./configuration.js";
import { ADAPTERS } from "./adapters.js";
import { OrderTools } from "./tools.js";
@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  entities: ENTITIES,
  providers: [OrderService, OrderContribution, ...ADAPTERS, OrderTools],
})
export class OrderPluginModule {}

const plugin: XpertPlugin<z.input<typeof configSchema>> = {
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
            ...ROLES.map((r) => "order_evidence." + r.key),
          ],
          marketplace: { screenshots: [APP_COVER], contents: [app] },
          runtime: { middlewareProviders: ROLES.map((r) => middleware(r.key)) },
        },
      ]),
    ),
  },
  config: { schema: configSchema, defaults: configSchema.parse({}) },
  templates,
  register(ctx) {
    return {
      module: OrderPluginModule,
      global: true,
      providers: [
        { provide: CONFIG, useValue: configSchema.parse(ctx.config) },
      ],
      exports: [CONFIG],
    };
  },
};
export default plugin;
export { templates };
