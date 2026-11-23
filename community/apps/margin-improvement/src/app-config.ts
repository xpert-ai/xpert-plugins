import type { PluginMarketplaceContribution } from "@xpert-ai/contracts";
import { analyticsSetup } from "./analytics-setup.js";
import { ICON, ROLES, templateKey, agentKey } from "./definition.js";

export const APP_COVER = "./assets/brand/margin-improvement-cover-zh-v1.png";

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans });

const organizationSetup = {
  analyticsSetup,
  organizationSetup: [
    {key:"analysisBinding", label:text("Margin analysis query","毛利分析查询"), requiredNumericFields:["actual","budget"]},
    {key:"factsBinding", label:text("Procurement evidence query","采购事实查询")},
    {key:"reviewBinding", label:text("Margin review query","毛利复查查询"), requiredNumericFields:["actual","budget"]}
  ].map(field => ({...field, kind:"analytics" as const, providerId:"data-xpert.ontology"}))
};

export const app = {
  type: "app",
  name: "margin-improvement",
  displayName: text("Margin Improvement", "经营偏差闭环"),
  description: text(
    "Evidence, approval, execution and review in one Project.",
    "在同一项目中贯通本体分析、人工批准、执行回执与复查。",
  ),
  icon: ICON,
  color: "#0F766E",
  tags: ["manufacturing", "business-analysis", "project-pipeline"],
  projectTypes: [
    {
      key: "improvement",
      title: text("Business Improvement Project", "经营改善项目"),
      icon: ICON,
      binding: { kind: "project" },
    },
  ],
  appConfig: {
    ...organizationSetup,
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
      name: text("Margin Improvement", "经营偏差闭环"),
      description: text(
        "Governed manufacturing demonstration",
        "制造业经营闭环演示",
      ),
      sharing: "organization",
    },
    knowledgebases: [],
    modelRequirements: { primary: true },
    presentation: {
      tagline: text(
        "Understand the variance. Drive improvement.",
        "看清偏差，推动改善。",
      ),
      longDescription: text(
        "Use an authorized Data Xpert ontology to investigate margin variance, verify procurement evidence, propose an action, obtain human approval and review the result. Four independent Assistants work in a native Project Pipeline; Finance can author a Live Dashboard.",
        "基于已授权的 Data Xpert 本体发现经营偏差、核实采购事实、形成方案，经人工批准后记录执行回执，再按同一口径复查。四个独立 Assistant 在原生项目流水线中分工，财务 Assistant 可制作 Live Dashboard。",
      ),
      developer: "XpertAI",
      screenshots: [APP_COVER],
      features: [
        {
          key: "ontology-analysis",
          title: text("Ontology-backed analysis", "本体分析"),
          description: text(
            "Query published Data Xpert models through explicit bindings and retain source evidence.",
            "通过明确配置的查询绑定读取已发布本体模型，保留指标口径与来源证据。",
          ),
        },
        {
          key: "project-pipeline",
          title: text("Four-role collaboration", "四个角色协作"),
          description: text(
            "Coordinate finance, procurement and execution Assistants in a Project; route variance to action or monitoring.",
            "协调、财务、采购与执行 Assistant 分工，Router 根据偏差阈值选择处置或持续观察。",
          ),
        },
        {
          key: "human-decisions",
          title: text("Human approval and acceptance", "人工批准与验收"),
          description: text(
            "People approve the exact proposal version and accept review results. Execution creates a local demo receipt only.",
            "业务负责人批准准确版本的方案并验收复查结果；当前执行节点仅生成本地演示回执。",
          ),
        },
        {
          key: "live-dashboard",
          title: text("Live Dashboard", "持续查看经营变化"),
          description: text(
            "Finance can create and refresh a Live Dashboard using authorized ontology queries.",
            "财务 Assistant 可基于已授权本体查询创建并刷新 Live Dashboard，持续查看经营变化。",
          ),
        },
      ],
      useCases: [
        text(
          "Manufacturing margin variance investigation",
          "制造业毛利偏差分析",
        ),
        text("Procurement cost evidence review", "采购成本事实核对"),
        text("Approved action and next-period review", "获批处置与下一期复查"),
      ],
      dataScope: text(
        "Access follows organization, workspace and Project permissions. Data Xpert resources and read actions require explicit authorization. Bundled data is synthetic; local receipts do not write to SAP or establish business impact.",
        "访问遵循组织、工作空间及项目权限；Data Xpert 资源与只读动作需明确授权。内置数据为合成样本，本地回执不代表 SAP 写回或真实业务成效。",
      ),
      initializationSummary: text(
        "Initialization binds the published Assistants for this organization. Choose an authorized connection and model to preview the November 2026 Suzhou M200 margin, purchase facts and review. Existing installations can complete these selections in place.",
        "初始化时自动绑定本组织的财务、采购和执行角色。选择已授权的连接和业务模型，试读 2026 年 11 月苏州一厂精密电机 M200 的毛利、采购及复查数据。已有实例可在应用详情补全配置。",
      ),
      initializationSteps: [
        text("Check an available primary model.", "检查可用主模型。"),
        text(
          "Create the dedicated application workspace.",
          "创建应用专用工作空间。",
        ),
        text(
          "Install and publish four Assistant roles.",
          "安装并发布四个 Assistant 角色。",
        ),
      ],
    },
    entry: { type: "assistant-chat" },
  },
} satisfies PluginMarketplaceContribution;
