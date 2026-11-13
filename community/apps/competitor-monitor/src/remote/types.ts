import { z } from "zod";
// 在消息边界校验服务端结果；前端不传入或推断租户、组织权限。
export const itemSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  title: z.string(),
  status: z.enum(["active", "paused"]),
});
export const roundSchema = z.object({
  id: z.string(),
  status: z.enum(["running", "success", "failed", "partial", "paused"]),
  startedAt: z.string(),
  errorReason: z.string().nullish(),
});
export const changeSchema = z.object({
  id: z.string(),
  roundId: z.string(),
  itemId: z.string(),
  dimension: z.enum(["price", "title", "promo"]),
  beforeValue: z.string(),
  afterValue: z.string(),
  evidence: z.string(),
  severity: z.enum(["low", "medium", "high"]),
});
export const adviceSchema = z.object({
  id: z.string(),
  changeId: z.string(),
  category: z.enum([
    "title_optimization",
    "promotion_adjustment",
    "creative_request",
  ]),
  content: z.string(),
  reason: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  revision: z.number(),
});
export const datasetSchema = z.object({
  items: z.array(itemSchema),
  rounds: z.array(roundSchema),
  changes: z.array(changeSchema),
  advice: z.array(adviceSchema),
});
export type Dataset = z.infer<typeof datasetSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Round = z.infer<typeof roundSchema>;
export type Change = z.infer<typeof changeSchema>;
export type Advice = z.infer<typeof adviceSchema>;
export const emptyDataset: Dataset = {
  items: [],
  rounds: [],
  changes: [],
  advice: [],
};
export const deletionSchema = z.object({
  confirmation: z.string(),
  counts: z.object({
    items: z.number(),
    rounds: z.number(),
    snapshots: z.number(),
    changes: z.number(),
    advice: z.number(),
  }),
  deleted: z.boolean(),
});
export type DeleteTarget = keyof Dataset;
export type DeletePlan = {
  target: DeleteTarget | "all";
  ids: string[];
  confirmation: string;
  counts: z.infer<typeof deletionSchema>["counts"];
};
export type ActionKey =
  | "add_item"
  | "toggle_item"
  | "run_collection"
  | "retry_collection"
  | "resume_collection"
  | "prepare_analysis"
  | "cancel_analysis_request"
  | "approve_advice"
  | "reject_advice"
  | "delete_records";
export type ActionInput = {
  itemId?: string;
  title?: string;
  idempotencyKey?: string;
  failOnItemId?: string;
  roundId?: string;
  id?: string;
  expectedRevision?: number;
  target?: DeleteTarget | "all";
  ids?: string[];
  confirmation?: string;
};
export const actionDataSchema = z
  .object({
    // 采集动作返回精简回执，不包含列表的 startedAt；不能复用完整列表 schema。
    round: roundSchema.pick({ id: true, status: true, errorReason: true }).optional(),
    roundId: z.string().optional(),
    analysisMessage: z.string().optional(),
    changes: z.array(changeSchema.omit({ roundId: true })).optional(),
    confirmation: z.string().optional(),
    counts: deletionSchema.shape.counts.optional(),
    deleted: z.boolean().optional(),
  })
  .passthrough();
export type ActionData = z.infer<typeof actionDataSchema>;
export type Action = (
  key: ActionKey,
  input: ActionInput,
) => Promise<ActionData>;
