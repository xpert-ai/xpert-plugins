import "reflect-metadata";
import { readFileSync } from "node:fs";
import { z } from "zod/v3";
import { XpertServerPlugin, type XpertPlugin } from "@xpert-ai/plugin-sdk";
import { configSchema, type Config } from "./config.js";
import { PLUGIN, FEATURE, PROVIDER, CONTEXT } from "./domain.js";
import { MeetingsBackend, MeetingsProcessor } from "./backend.js";
import { MeetingsView } from "./view.js";
import { MeetingsMiddleware } from "./middleware.js";
import { MeetingDocuments, MeetingDocumentProvider } from "./documents.js";
import { appContribution, templates } from "./templates.js";
import { meetingsIcon } from "./branding.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as {
  version: string;
  xpert: {
    plugin: Required<Pick<XpertPlugin["meta"], "level" | "artifactNamespace">>;
  };
};

@XpertServerPlugin({
  providers: [
    MeetingDocuments,
    MeetingDocumentProvider,
    MeetingsBackend,
    MeetingsProcessor,
    MeetingsView,
    MeetingsMiddleware,
  ],
})
export class MeetingsPlugin {}
const plugin: XpertPlugin<z.input<typeof configSchema>> = {
  meta: {
    name: PLUGIN,
    version: packageJson.version,
    author: "XpertAI",
    level: packageJson.xpert.plugin.level,
    artifactNamespace: packageJson.xpert.plugin.artifactNamespace,
    displayName: "Meetings",
    icon: meetingsIcon,
    description: "Private file-backed meeting notes for Xpert Desktop",
    category: "middleware",
    targetApps: ["xpert", "data-xpert"],
    targetAppMeta: {
      xpert: {
        types: ["business-app", "workbench-view", "assistant-tool"],
        capabilities: [FEATURE],
        runtime: {
          middlewareProviders: ["meetings.tools"],
          viewProviders: [PROVIDER],
          templateProviders: ["meetings.templates"],
        },
        marketplace: {
          contents: [
            appContribution,
            {
              type: "view",
              name: "meetings.workspace",
              displayName: { en_US: "Meetings", zh_Hans: "会议记录" },
              description:
                "Record meetings and review notes in the Desktop plugin view.",
            },
            {
              type: "middleware",
              name: "meetings.tools",
              displayName: "Meetings tools",
              description: "Search private meetings and review follow-ups.",
            },
          ],
        },
      },
      "data-xpert": {
        types: ["workbench-view", "assistant-tool"],
        capabilities: [FEATURE],
        runtime: {
          middlewareProviders: ["meetings.tools"],
          viewProviders: [PROVIDER],
        },
      },
    },
  },
  config: { schema: configSchema },
  templates,
  permissions: [{ type: "speech_to_text", operations: ["transcribe"] }],
  register(context) {
    return {
      module: MeetingsPlugin,
      global: true,
      providers: [
        {
          provide: CONTEXT,
          useValue: { ...context, config: configSchema.parse(context.config) },
        },
      ],
    };
  },
};
export default plugin;
