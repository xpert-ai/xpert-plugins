import type { PluginMarketplaceContribution } from "@xpert-ai/contracts";
import { ICON, ROLES, templateKey, agentKey } from "./definition.js";

export const APP_COVER = "./assets/brand/order-evidence-cover-zh-v1.png";

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans });
export const app = {
  type: "app",
  name: "order-evidence",
  displayName: text("Order Evidence", "订单全流程证据"),
  description: text(
    "Order evidence, six specialist Assistants and accountable human decisions.",
    "围绕一张订单关联业务证据，组织六个专业助手与人类负责人协作。",
  ),
  icon: ICON,
  color: "#0F766E",
  tags: ["manufacturing", "order-evidence", "project-pipeline"],
  projectTypes: [
    {
      key: "order",
      title: text("Manufacturing Order Project", "制造业订单项目"),
      icon: ICON,
      binding: { kind: "project" },
    },
  ],
  appConfig: {
    scope: "organization",
    assistantTemplateKey: templateKey("coordinator"),
    assistantSuite: {
      version: "1",
      coordinatorAgentKey: agentKey("coordinator"),
      roles: ROLES.filter((r) => r.key !== "coordinator").map((r) => ({
        key: r.key,
        templateKey: templateKey(r.key),
        primaryAgentKey: agentKey(r.key),
        title: text(r.key, r.title),
      })),
    },
    workspace: {
      mode: "dedicated",
      name: text("Order Evidence", "订单全流程证据"),
      description: text(
        "Governed manufacturing demonstration",
        "制造业订单证据演示",
      ),
      sharing: "organization",
    },
    knowledgebases: [],
    modelRequirements: { primary: true },
    presentation: {
      tagline: text(
        "One order. Connected collaboration.",
        "一张订单，贯通协作。",
      ),
      longDescription: text(
        "Connect contract, engineering, procurement, production, quality and after-sales evidence around one manufacturing order. A coordinator and six specialist Assistants work through four explicit Routers and six human decisions in a native Project Pipeline.",
        "围绕一张制造业订单关联合同、工程、采购、计划、质量与售后证据。一个协调者与六个专业 Assistant 通过四个 Router 和六个人工决定节点，在原生项目流水线中推进工作。",
      ),
      developer: "XpertAI",
      screenshots: [APP_COVER],
      features: [
        {
          key: "specialist-assistants",
          title: text("Six specialist roles", "六个专业角色"),
          description: text(
            "Separate specialist work across contract, engineering, procurement, production planning, quality and after-sales.",
            "合同、工程、采购、计划、质量与售后 Assistant 各自审阅证据、提出建议。",
          ),
        },
        {
          key: "evidence-routing",
          title: text("Evidence-based routing", "按证据条件路由"),
          description: text(
            "Four Routers check requirements, supply readiness, quality evidence and follow-up improvement; missing evidence blocks progression.",
            "四个 Router 检查要求资料、供应条件、质量证据与后续改进；条件不足时等待补证。",
          ),
        },
        {
          key: "human-accountability",
          title: text("Accountable human decisions", "人类负责关键决定"),
          description: text(
            "Configured responsible users confirm each stage against the exact recommendation version.",
            "配置的责任人逐阶段确认准确版本的建议，能力使用权与业务批准权分开。",
          ),
        },
        {
          key: "evidence-traceability",
          title: text("Traceable evidence and history", "证据与履历可追溯"),
          description: text(
            "Retain evidence versions, Assistant work and human decisions in the order Project.",
            "在订单项目中保留证据版本、Assistant 工作与人工决定，便于复核和追溯。",
          ),
        },
      ],
      useCases: [
        text("Order requirement clarification", "订单要求澄清"),
        text("BOM and supply readiness review", "BOM 与物料齐套复核"),
        text(
          "Quality release and after-sales improvement review",
          "质量放行与售后改进复核",
        ),
      ],
      dataScope: text(
        "Access follows organization, workspace and Project permissions. This demo uses synthetic business snapshots and local decisions; it does not call SAP or Data Xpert or create production transactions.",
        "访问遵循组织、工作空间及项目权限。当前演示使用合成业务快照与本地决定记录，不调用 SAP 或 Data Xpert，不产生生产交易。",
      ),
      initializationSummary: text(
        "Prepare a dedicated workspace and publish the coordinator and six specialists. Before running a Project, bind the published role members and assign authorized human approvers for each stage.",
        "准备专用工作空间并发布协调者与六个专业 Assistant。运行项目前，需绑定已发布的角色成员，并为各阶段配置具备权限的人类批准人。",
      ),
      initializationSteps: [
        text("Check an available primary model.", "检查可用主模型。"),
        text(
          "Create the dedicated application workspace.",
          "创建应用专用工作空间。",
        ),
        text(
          "Install and publish seven Assistant roles.",
          "安装并发布七个 Assistant 角色。",
        ),
      ],
    },
    entry: { type: "assistant-chat" },
  },
} satisfies PluginMarketplaceContribution;
