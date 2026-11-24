import { app, APP_COVER } from "./app-config.js";
export { app } from "./app-config.js";
import { z } from "zod/v3";
import { TypeOrmModule } from "@nestjs/typeorm";
import { XpertServerPlugin, type XpertPlugin } from "@xpert-ai/plugin-sdk";
import { ENTITIES, installationSchema } from "./model.js";
import {
  NAME,
  VERSION,
  PACKAGE_METADATA,
  ICON,
  ROLES,
  middleware,
} from "./definition.js";
import { templates } from "./templates.js";
import { MarginService } from "./service.js";
import { MarginContribution } from "./configuration.js";
import { ADAPTERS } from "./adapters.js";
import { MarginTools } from "./tools.js";
@XpertServerPlugin({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  entities: ENTITIES,
  providers: [MarginService, MarginContribution, ...ADAPTERS, MarginTools],
})
export class MarginPluginModule {}

const plugin: XpertPlugin<z.input<typeof installationSchema>> = {
  meta: {
    name: NAME,
    version: VERSION,
    level: PACKAGE_METADATA.xpert.plugin.level,
    artifactNamespace: PACKAGE_METADATA.xpert.plugin.artifactNamespace,
    category: "middleware",
    displayName: "经营偏差闭环",
    description: "Project Pipelines + Live Dashboard + Data Xpert ontology.",
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
            ...ROLES.map((r) => "margin_improvement." + r.key),
          ],
          marketplace: { screenshots: [APP_COVER], contents: [app] },
          runtime: { middlewareProviders: ROLES.map((r) => middleware(r.key)) },
        },
      ]),
    ),
  },
  config: { schema: installationSchema, defaults: installationSchema.parse({}) },
  templates,
  register() {
    return { module: MarginPluginModule, global: true };
  },
};
export default plugin;
export { templates };
