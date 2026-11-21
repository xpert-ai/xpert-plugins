import { z } from "zod/v3";
import { routingFactsSchema, type DemoScenario } from "./routing.js";
import type { Step } from "./definition.js";
import { factsSchema } from "./improvement/rule.js";
export const documentSchema = z
  .object({
    id: z.string(),
    kind: z.enum([
      "contract",
      "clarification",
      "bom",
      "material",
      "purchase",
      "work_order",
      "serial",
      "test",
      "delivery",
      "service",
      "inspection",
      "change",
    ]),
    title: z.string(),
    version: z.string(),
    objectKeys: z.array(z.string()),
    facts: z.array(z.string()),
  })
  .strict();
export const snapshotSchema = z
  .object({
    version: z.string(),
    orderId: z.string(),
    quantity: z.number().int().positive(),
    product: z.string(),
    dataLabel: z.string(),
    improvementSuggested: z.boolean(),
    routingFacts: routingFactsSchema.optional(),
    aftercareFacts: factsSchema.optional(),
    adoptPublishedMethod: z.boolean().optional(),
    documents: z.array(documentSchema),
  })
  .strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export const fixture: Snapshot = {
  version: "demo-2026-11-v2",
  orderId: "SO-DEMO-1201",
  quantity: 12,
  product: "M200 驱动电机",
  dataLabel: "合成业务资料 · 演示订单 · 非 SAP 生产记录",
  improvementSuggested: true,
  routingFacts: {
    materials: { available: 8, inTransit: 4, arrivalConfirmed: true },
    quality: {
      tested: 12,
      passed: 12,
      traceable: 12,
      deliveryPackComplete: true,
    },
  },
  documents: [
    {
      id: "CON-1201",
      kind: "contract",
      title: "12 台 M200 电机合同",
      version: "1",
      objectKeys: ["SO-DEMO-1201", "M200"],
      facts: [
        "数量 12 台；合同条款写明 IP67，但未写清适用部位。",
        "请求按约定日期交付；本演示不作真实客户承诺。",
      ],
    },
    {
      id: "CLR-1201",
      kind: "clarification",
      title: "要求澄清建议",
      version: "draft-1",
      objectKeys: ["SO-DEMO-1201", "M200"],
      facts: [
        "建议将 IP67 对象明确为电机壳体总成，接插件按独立技术条件验收。",
        "此为草案，只有销售和工程人工确认后才作为后续设计输入。",
      ],
    },
    {
      id: "BOM-1201",
      kind: "bom",
      title: "技术 BOM 与设计差异",
      version: "draft-B",
      objectKeys: ["SO-DEMO-1201", "M200", "SEAL-B"],
      facts: [
        "原 A 版采用 SEAL-A；建议换为 SEAL-B 并补充装配扭矩检验要求。",
        "本版建议引用 CLR-1201，需工程负责人批准，助手不能批准 BOM。",
      ],
    },
    {
      id: "MAT-1201",
      kind: "material",
      title: "库存与齐套核对",
      version: "1",
      objectKeys: ["SO-DEMO-1201", "SEAL-B", "PO-DEMO-801"],
      facts: [
        "12 套需求；库存 8 套 SEAL-B，在途 4 套预计 11 月 26 日到厂。",
        "须确认在途回执并完成来料检验，不能把在途数量视为已可用库存。",
      ],
    },
    {
      id: "PO-DEMO-801",
      kind: "purchase",
      title: "供应方案草案",
      version: "1",
      objectKeys: ["SO-DEMO-1201", "SEAL-B"],
      facts: [
        "供应商书面回复 4 套于 11 月 26 日到厂；附件为合成演示回复。",
        "采购负责人确认供应方案后再交计划；本插件不发送采购订单。",
      ],
    },
    {
      id: "WO-DEMO-901",
      kind: "work_order",
      title: "生产工单与工位负荷",
      version: "draft-1",
      objectKeys: ["SO-DEMO-1201", "LOT-DEMO-B", "WO-DEMO-901"],
      facts: [
        "工单数量 12 台；装配工位 11 月 27 日有 12 台空档，试验工位 11 月 28 日可安排。",
        "计划建议以 4 套在途材料入库合格为前置条件；计划负责人批准排程。",
      ],
    },
    {
      id: "SER-1201",
      kind: "serial",
      title: "实装序列号与批次",
      version: "1",
      objectKeys: ["SO-DEMO-1201", "LOT-DEMO-B", "SN-DEMO-01~12"],
      facts: [
        "12 台实物序列号与同一订单、工单、密封批次关联。",
        "以下试验和售后材料是后续阶段的合成演示快照，不代表等待后真实发生。",
      ],
    },
    {
      id: "TEST-1201",
      kind: "test",
      title: "壳体密封试验记录",
      version: "1",
      objectKeys: ["SO-DEMO-1201", "SN-DEMO-01~12", "WO-DEMO-901"],
      facts: [
        "合成试验记录：12 台壳体总成按经确认要求试验，记录均为通过。",
        "接插件另按其技术条件验收；质量放行和客户交付承诺由授权人员决定。",
      ],
    },
    {
      id: "DEL-1201",
      kind: "delivery",
      title: "交付证据包",
      version: "draft-1",
      objectKeys: ["SO-DEMO-1201", "SN-DEMO-01~12"],
      facts: [
        "包装、试验和序列号清单齐备；待质量与授权人确认后形成演示放行回执。",
        "本插件不触发真实出库、发货或质量放行交易。",
      ],
    },
    {
      id: "SVC-1201",
      kind: "service",
      title: "在役设备报修线索",
      version: "1",
      objectKeys: ["SO-DEMO-1201", "SN-DEMO-08", "LOT-DEMO-B"],
      facts: [
        "客户称 SN-DEMO-08 疑似进水，现场为间歇冲洗工况。",
        "报修描述本身不能证明根因。",
      ],
    },
    {
      id: "INS-1201",
      kind: "inspection",
      title: "拆检与装配复核",
      version: "1",
      objectKeys: ["SN-DEMO-08", "LOT-DEMO-B", "WO-DEMO-901"],
      facts: [
        "合成拆检记录：密封圈存在局部挤压，装配复核记录显示扭矩记录缺失。",
        "复现实验在不均匀压紧条件下出现相似现象；尚不能排除全部其他原因。",
        "质量负责人须判断现有证据是否支持根因结论，必要时补充试验。",
      ],
    },
    {
      id: "ECR-1201",
      kind: "change",
      title: "下一单工程改进建议",
      version: "draft-1",
      objectKeys: ["SO-DEMO-1201", "M200", "WO-DEMO-901"],
      facts: [
        "建议增加扭矩记录与密封装配防错，并在下一单安排独立抽检。",
        "工程负责人批准后方可采用；下一单及在役改善效果仍待后续验证，不能宣称已降低故障率。",
      ],
    },
  ],
};
export const sourceKinds: Record<
  Step,
  Snapshot["documents"][number]["kind"][]
> = {
  contract: ["contract", "clarification"],
  engineering: ["clarification", "bom"],
  procurement: ["material", "purchase"],
  production: ["work_order", "serial"],
  quality: ["test", "delivery", "serial"],
  aftercare: ["service", "inspection", "change", "serial"],
};
export function documentsFor(snapshot: Snapshot, step: Step) {
  return snapshot.documents.filter((d) => sourceKinds[step].includes(d.kind));
}

export function fixtureFor(scenario: DemoScenario): Snapshot {
  const snapshot = snapshotSchema.parse(structuredClone(fixture));
  if (scenario === "next_order_adoption") {
    const next = snapshotSchema.parse(
      JSON.parse(
        JSON.stringify(snapshot)
          .replaceAll("1201", "1202")
          .replaceAll("SN-DEMO", "SN-NEXT"),
      ),
    );
    next.version = "next-order-demo-v1";
    next.adoptPublishedMethod = true;
    next.aftercareFacts = {
      productFamily: "M200",
      availableEvidence: ["service_report"],
    };
    next.documents = next.documents.filter(
      (document) => document.kind !== "inspection",
    );
    const service = next.documents.find(
      (document) => document.kind === "service",
    )!;
    service.facts = [
      "新订单设备报修称疑似进水；只有报修描述，运行工况、拆检、复现实验均未取得。",
      "本条为独立后续订单的合成输入。不能从上一单推断本单根因。",
    ];
    return next;
  }
  if (scenario === "requirements_missing") {
    snapshot.version += "-requirements-missing";
    snapshot.documents = snapshot.documents.filter(
      (d) => d.kind !== "clarification",
    );
  }
  return snapshot;
}
