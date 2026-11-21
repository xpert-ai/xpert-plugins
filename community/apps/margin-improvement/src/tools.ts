import {
  XpertTool,
  XpertToolProvider,
  type XpertBusinessToolContext,
} from "@xpert-ai/plugin-sdk";
import { z } from "zod/v3";
import { ICON, ROLES, middleware } from "./definition.js";
import { finalizeSchema, type Finalize } from "./model.js";
import { MarginService } from "./service.js";
@XpertToolProvider({
  provider: "margin_improvement_tools",
  componentKey: "margin-improvement-tools",
  name: "经营偏差闭环",
  description: "Evidence-governed Project Pipeline role tools.",
  icon: ICON,
  defaultMiddleware: middleware("coordinator"),
  middlewares: ROLES.map((r) => ({
    provider: middleware(r.key),
    meta: {
      name: middleware(r.key),
      label: { en_US: r.key, zh_Hans: r.title },
      description: {
        en_US: "Bounded business role",
        zh_Hans: "按项目与执行身份校验的角色能力",
      },
      icon: { type: "emoji" as const, value: r.emoji, background: r.color },
      features: ["project.tasks", "margin_improvement." + r.key],
      configSchema: { type: "object", properties: {}, required: [] },
    },
  })),
})
export class MarginTools {
  constructor(private readonly service: MarginService) {}
  @XpertTool({
    name: "margin_start_pipeline",
    title: "启动经营偏差闭环",
    description:
      "Start this Project’s governed pipeline once. Required published finance, procurement and execution members must already belong to the Project. This tool cannot approve any action.",
    inputSchema: z.object({ title: z.string().min(3).max(120) }).strict(),
    middleware: middleware("coordinator"),
  })
  start(input: { title: string }, c: XpertBusinessToolContext) {
    return this.service.start(c, input.title);
  }
  @XpertTool({
    name: "margin_finance_read",
    title: "读取当前任务证据",
    description:
      "Read the current exact pipeline task, authorized Data Xpert ontology query results and predecessor evidence. Identity and operation are derived by the server. No cross-project selection.",
    inputSchema: z.object({}).strict(),
    middleware: middleware("finance"),
  })
  read_finance(_input: object, c: XpertBusinessToolContext) {
    return this.service.read(c);
  }
  @XpertTool({
    name: "margin_finance_finalize",
    title: "提交本角色验收结果",
    description:
      "Persist this role’s assessment using evidence IDs returned by the current task. Does not approve proposals. Execution requires exact human decision evidence and produces a clearly labelled local demo receipt.",
    inputSchema: finalizeSchema,
    middleware: middleware("finance"),
  })
  finalize_finance(input: Finalize, c: XpertBusinessToolContext) {
    return this.service.finalize(c, input);
  }
  @XpertTool({
    name: "margin_procurement_read",
    title: "读取当前任务证据",
    description:
      "Read the current exact pipeline task, authorized Data Xpert ontology query results and predecessor evidence. Identity and operation are derived by the server. No cross-project selection.",
    inputSchema: z.object({}).strict(),
    middleware: middleware("procurement"),
  })
  read_procurement(_input: object, c: XpertBusinessToolContext) {
    return this.service.read(c);
  }
  @XpertTool({
    name: "margin_procurement_finalize",
    title: "提交本角色验收结果",
    description:
      "Persist this role’s assessment using evidence IDs returned by the current task. Does not approve proposals. Execution requires exact human decision evidence and produces a clearly labelled local demo receipt.",
    inputSchema: finalizeSchema,
    middleware: middleware("procurement"),
  })
  finalize_procurement(input: Finalize, c: XpertBusinessToolContext) {
    return this.service.finalize(c, input);
  }
  @XpertTool({
    name: "margin_execution_read",
    title: "读取当前任务证据",
    description:
      "Read the current exact pipeline task, authorized Data Xpert ontology query results and predecessor evidence. Identity and operation are derived by the server. No cross-project selection.",
    inputSchema: z.object({}).strict(),
    middleware: middleware("execution"),
  })
  read_execution(_input: object, c: XpertBusinessToolContext) {
    return this.service.read(c);
  }
  @XpertTool({
    name: "margin_execution_finalize",
    title: "提交本角色验收结果",
    description:
      "Persist this role’s assessment using evidence IDs returned by the current task. Does not approve proposals. Execution requires exact human decision evidence and produces a clearly labelled local demo receipt.",
    inputSchema: finalizeSchema,
    middleware: middleware("execution"),
  })
  finalize_execution(input: Finalize, c: XpertBusinessToolContext) {
    return this.service.finalize(c, input);
  }
}
