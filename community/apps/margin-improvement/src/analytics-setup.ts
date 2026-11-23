import { readFileSync } from "node:fs";
import type { JSONValue } from "@xpert-ai/contracts";

// The manufacturing demonstration compares the same plant, product and month in both stages.
const scope = [
  { field: "Period", op: "eq", value: "2026-11" },
  { field: "Product", op: "eq", value: "精密电机 M200" },
  { field: "Plant", op: "eq", value: "苏州一厂" },
];
const margin = (stage: string): JSONValue => ({
  kind: "sql-cube-slice",
  cube: "OperatingMargin",
  dimensions: ["Period", "Product", "Plant"],
  measures: ["ActualMargin", "BudgetMargin"],
  legacyOutputTypes: { Period: "string", Product: "string", Plant: "string", ActualMargin: "decimal", BudgetMargin: "decimal" },
  aliases: { actual: "ActualMargin", budget: "BudgetMargin" },
  filters: [...scope, { field: "Stage", op: "eq", value: stage }],
  limit: 2,
  singleRow: true,
});
export const analyticsSetup = {
  kind: "connection-model" as const,
  providerId: "data-xpert.ontology",
  bootstrap: {
    key: "m200_synthetic_margin",
    version: "1.0.0",
    modes: [
      { id: "demo-views", label: { en_US: "Read-only synthetic demo views", zh_Hans: "插件内置的只读合成演示视图" } },
      { id: "existing-tables", label: { en_US: "Bind existing demo tables", zh_Hans: "绑定已有演示表" } },
    ],
    bundle: {
      format: "data-xpert.sql-model/v1",
      key: "m200_synthetic_margin",
      version: "1.0.0",
      name: "M200 经营毛利与采购事实（合成演示）",
      catalog: "margin_demo_20261120",
      schema: readFileSync(new URL("../fixtures/ontology-schema.json", import.meta.url), "utf8"),
      views: readFileSync(new URL("../fixtures/m200-readonly-views.json", import.meta.url), "utf8"),
    },
  },
  recipes: {
    analysisBinding: margin("baseline"),
    factsBinding: {
      kind: "sql-cube-slice",
      cube: "PurchaseFacts",
      dimensions: ["PurchaseOrder", "Supplier", "Material"],
      measures: ["Quantity", "ActualPrice", "BudgetPrice", "ExcessCost"],
      legacyOutputTypes: {
        PurchaseOrder: "string", Supplier: "string", Material: "string", Quantity: "decimal",
        ActualPrice: "decimal", BudgetPrice: "decimal", ExcessCost: "decimal",
      },
      aliases: {},
      filters: scope,
      limit: 100,
      singleRow: false,
    },
    reviewBinding: margin("review"),
  } satisfies Record<string, JSONValue>,
};
