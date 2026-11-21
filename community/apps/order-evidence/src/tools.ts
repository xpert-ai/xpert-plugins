import {
  XpertTool,
  XpertToolProvider,
  type XpertBusinessToolContext,
} from "@xpert-ai/plugin-sdk";
import { z } from "zod/v3";
import { ICON, ROLES, ARTIFACT_NAMESPACE, middleware } from "./definition.js";
import { demoScenarioSchema, type DemoScenario } from "./routing.js";
import { finalizeSchema, type Finalize } from "./model.js";
import { OrderService } from "./service.js";
@XpertToolProvider({
  provider: `${ARTIFACT_NAMESPACE}_tools`,
  componentKey: "order-evidence-tools",
  name: "订单全流程证据",
  description: "Governed order evidence and human decision boundaries.",
  icon: ICON,
  defaultMiddleware: middleware("coordinator"),
  middlewares: ROLES.map((r) => ({
    provider: middleware(r.key),
    meta: {
      name: middleware(r.key),
      label: { en_US: r.key, zh_Hans: r.title },
      description: {
        en_US: "Bounded order responsibility",
        zh_Hans: "受项目和执行身份约束的订单角色能力",
      },
      icon: { type: "emoji" as const, value: r.emoji, background: r.color },
      features: ["project.tasks", `${ARTIFACT_NAMESPACE}.${r.key}`],
      configSchema: { type: "object", properties: {}, required: [] },
    },
  })),
})
export class OrderTools {
  constructor(private readonly service: OrderService) {}
  @XpertTool({
    name: "order_start_pipeline",
    title: "启动订单证据流水线",
    description:
      "Start the current typed manufacturing order Project once; published role members and human approvers must be configured. Does not approve business decisions.",
    inputSchema: z
      .object({
        title: z.string().min(3).max(120),
        scenario: demoScenarioSchema
          .optional()
          .describe(
            "Synthetic demo pack: standard runs the complete evidence flow; requirements_missing demonstrates the missing-evidence Router. Omit for standard.",
          ),
      })
      .strict(),
    middleware: middleware("coordinator"),
  })
  start(
    input: { title: string; scenario?: DemoScenario },
    c: XpertBusinessToolContext,
  ) {
    return this.service.start(c, input.title, input.scenario);
  }
  @XpertTool({
    name: "order_contract_read",
    title: "读取合同阶段证据",
    description:
      "Read this exact execution’s ordered source evidence and approved predecessor results. Do not supply project or actor identifiers.",
    inputSchema: z.object({}).strict(),
    middleware: middleware("contract"),
  })
  read_contract(_input: object, c: XpertBusinessToolContext) {
    return this.service.read(c);
  }
  @XpertTool({
    name: "order_contract_finalize",
    title: "提交合同判断与建议",
    description:
      "Persist an evidence-grounded assessment. Cite all sourceEvidenceIds returned by read. This does not grant human approval or perform external transactions.",
    inputSchema: finalizeSchema,
    middleware: middleware("contract"),
  })
  finalize_contract(input: Finalize, c: XpertBusinessToolContext) {
    return this.service.finalize(c, input);
  }
  @XpertTool({
    name: "order_engineering_read",
    title: "读取工程阶段证据",
    description:
      "Read this exact execution’s ordered source evidence and approved predecessor results. Do not supply project or actor identifiers.",
    inputSchema: z.object({}).strict(),
    middleware: middleware("engineering"),
  })
  read_engineering(_input: object, c: XpertBusinessToolContext) {
    return this.service.read(c);
  }
  @XpertTool({
    name: "order_engineering_finalize",
    title: "提交工程判断与建议",
    description:
      "Persist an evidence-grounded assessment. Cite all sourceEvidenceIds returned by read. This does not grant human approval or perform external transactions.",
    inputSchema: finalizeSchema,
    middleware: middleware("engineering"),
  })
  finalize_engineering(input: Finalize, c: XpertBusinessToolContext) {
    return this.service.finalize(c, input);
  }
  @XpertTool({
    name: "order_procurement_read",
    title: "读取采购阶段证据",
    description:
      "Read this exact execution’s ordered source evidence and approved predecessor results. Do not supply project or actor identifiers.",
    inputSchema: z.object({}).strict(),
    middleware: middleware("procurement"),
  })
  read_procurement(_input: object, c: XpertBusinessToolContext) {
    return this.service.read(c);
  }
  @XpertTool({
    name: "order_procurement_finalize",
    title: "提交采购判断与建议",
    description:
      "Persist an evidence-grounded assessment. Cite all sourceEvidenceIds returned by read. This does not grant human approval or perform external transactions.",
    inputSchema: finalizeSchema,
    middleware: middleware("procurement"),
  })
  finalize_procurement(input: Finalize, c: XpertBusinessToolContext) {
    return this.service.finalize(c, input);
  }
  @XpertTool({
    name: "order_production_read",
    title: "读取计划阶段证据",
    description:
      "Read this exact execution’s ordered source evidence and approved predecessor results. Do not supply project or actor identifiers.",
    inputSchema: z.object({}).strict(),
    middleware: middleware("production"),
  })
  read_production(_input: object, c: XpertBusinessToolContext) {
    return this.service.read(c);
  }
  @XpertTool({
    name: "order_production_finalize",
    title: "提交计划判断与建议",
    description:
      "Persist an evidence-grounded assessment. Cite all sourceEvidenceIds returned by read. This does not grant human approval or perform external transactions.",
    inputSchema: finalizeSchema,
    middleware: middleware("production"),
  })
  finalize_production(input: Finalize, c: XpertBusinessToolContext) {
    return this.service.finalize(c, input);
  }
  @XpertTool({
    name: "order_quality_read",
    title: "读取质量阶段证据",
    description:
      "Read this exact execution’s ordered source evidence and approved predecessor results. Do not supply project or actor identifiers.",
    inputSchema: z.object({}).strict(),
    middleware: middleware("quality"),
  })
  read_quality(_input: object, c: XpertBusinessToolContext) {
    return this.service.read(c);
  }
  @XpertTool({
    name: "order_quality_finalize",
    title: "提交质量判断与建议",
    description:
      "Persist an evidence-grounded assessment. Cite all sourceEvidenceIds returned by read. This does not grant human approval or perform external transactions.",
    inputSchema: finalizeSchema,
    middleware: middleware("quality"),
  })
  finalize_quality(input: Finalize, c: XpertBusinessToolContext) {
    return this.service.finalize(c, input);
  }
  @XpertTool({
    name: "order_aftercare_read",
    title: "读取售后阶段证据",
    description:
      "Read this exact execution’s ordered source evidence and approved predecessor results. Do not supply project or actor identifiers.",
    inputSchema: z.object({}).strict(),
    middleware: middleware("aftercare"),
  })
  read_aftercare(_input: object, c: XpertBusinessToolContext) {
    return this.service.read(c);
  }
  @XpertTool({
    name: "order_aftercare_finalize",
    title: "提交售后判断与建议",
    description:
      "Persist an evidence-grounded assessment. Cite all sourceEvidenceIds returned by read. This does not grant human approval or perform external transactions.",
    inputSchema: finalizeSchema,
    middleware: middleware("aftercare"),
  })
  finalize_aftercare(input: Finalize, c: XpertBusinessToolContext) {
    return this.service.finalize(c, input);
  }
}
