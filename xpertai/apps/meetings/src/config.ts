import { z } from "zod/v3";
export const configSchema = z
  .object({
    dataDirectory: z.string().min(1).default("data/plugins/meetings"),
    // Accepted for existing installations; summaries now use the published Assistant model.
    summaryCopilotId: z.string().optional(),
    summaryModel: z.string().optional(),
    inlineTranscription: z
      .object({
        copilotId: z.string().uuid(),
        model: z.string().min(1).max(100),
      })
      .strict()
      .optional(),
    silenceSeconds: z.number().min(1).max(300).default(10),
    silenceThresholdDb: z.number().min(-80).max(-20).default(-50),
    failedAudioRetentionDays: z.number().int().min(1).max(30).default(7),
  })
  .strict();
export type Config = z.infer<typeof configSchema>;
