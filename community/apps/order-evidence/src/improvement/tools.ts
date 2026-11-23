import {
  XpertTool,
  XpertToolProvider,
  type XpertBusinessToolContext,
} from "@xpert-ai/plugin-sdk";
import { z } from "zod/v3";
import { ARTIFACT_NAMESPACE, middleware } from "../definition.js";
import { proposeSchema, type ProposeInput } from "./rule.js";
import { OrderImprovementService } from "./source.service.js";

@XpertToolProvider({
  provider: `${ARTIFACT_NAMESPACE}_improvement_tools`,
  componentKey: "order-improvement-tools",
  name: "售后判断方法维护",
  description:
    "Prepare evidence-bound candidates; human publication remains in Agent Evolution.",
  icon: { type: "emoji", value: "🧩" },
  defaultMiddleware: middleware("capability"),
  middlewares: [
    {
      provider: middleware("capability"),
      meta: {
        name: middleware("capability"),
        label: {
          en_US: "Capability Maintenance Assistant",
          zh_Hans: "能力维护 Assistant",
        },
        description: {
          en_US: "Evidence-grounded candidate preparation",
          zh_Hans: "基于人类已确认的售后证据提交方法候选；无批准或发布权限",
        },
        icon: { type: "emoji", value: "🧩" },
        features: ["project.tasks", `${ARTIFACT_NAMESPACE}.capability`],
        configSchema: { type: "object", properties: {}, required: [] },
      },
    },
  ],
})
export class OrderImprovementTools {
  constructor(private readonly service: OrderImprovementService) {}
  @XpertTool({
    name: "order_improvement_read",
    title: "读取人类已确认的售后改进依据",
    description:
      "Read approved evidence in the current order Project and the current published baseline. No project or actor IDs are accepted.",
    inputSchema: z.object({}).strict(),
    middleware: middleware("capability"),
  })
  read(_input: object, context: XpertBusinessToolContext) {
    return this.service.read(context);
  }
  @XpertTool({
    name: "order_improvement_submit",
    title: "提交判断方法候选并启动平台核对",
    description:
      "Submit a candidate bound to the exact sourceDigest. The platform checks independent synthetic holdouts asynchronously. This never approves, publishes, changes an engineering specification or adopts the candidate in another order.",
    inputSchema: proposeSchema,
    middleware: middleware("capability"),
  })
  submit(input: ProposeInput, context: XpertBusinessToolContext) {
    return this.service.submit(context, input);
  }
}
