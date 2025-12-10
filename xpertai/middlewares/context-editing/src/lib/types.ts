import { BaseLanguageModel, getModelContextSize } from "@langchain/core/language_models/base";
import { BaseMessage } from "@langchain/core/messages";
import { z } from "zod/v3";

export type TokenCounter = (
  messages: BaseMessage[]
) => number | Promise<number>;
export const contextSizeSchema = z
  .object({
    fraction: z
      .number()
      .gt(0, "Fraction must be greater than 0")
      .max(1, "Fraction must be less than or equal to 1")
      .nullable()
      .optional(),
    tokens: z.number().positive("Tokens must be greater than 0").nullable().optional(),
    messages: z
      .number()
      .int("Messages must be an integer")
      .positive("Messages must be greater than 0")
      .nullable()
      .optional(),
  })
  .refine(
    (data) => {
      const count = [data.fraction, data.tokens, data.messages].filter((v) => v != null).length;
      return count === 1;
    },
    {
      message: "At least one of fraction, tokens, or messages must be provided",
    }
  );
export type ContextSize = z.infer<typeof contextSizeSchema>;

export const keepSchema = z
  .object({
    fraction: z
      .number()
      .min(0, "Messages must be non-negative")
      .max(1, "Fraction must be less than or equal to 1")
      .nullable()
      .optional(),
    tokens: z.number().min(0, "Tokens must be greater than or equal to 0").nullable().optional(),
    messages: z
      .number()
      .int("Messages must be an integer")
      .min(0, "Messages must be non-negative")
      .nullable()
      .optional(),
  })
  .refine(
    (data) => {
      const count = [data.fraction, data.tokens, data.messages].filter((v) => v != null).length;
      return count === 1;
    },
    {
      message: "Exactly one of fraction, tokens, or messages must be provided",
    }
  );
export type KeepSize = z.infer<typeof keepSchema>;


export function getProfileLimits(input: BaseLanguageModel): number | undefined {
  // Backward compatibility for langchain <1.0.0
  if (input.metadata && "profile" in input.metadata) {
    const profile = input.metadata['profile'] as object;
    if ("maxInputTokens" in profile && (typeof profile.maxInputTokens === "number" || profile.maxInputTokens == null)) {
      return (profile.maxInputTokens as number) ?? undefined;
    }
  }
  // Langchain v1.0.0+
  if (
    "profile" in input &&
    typeof input.profile === "object" &&
    input.profile &&
    "maxInputTokens" in input.profile &&
    (typeof input.profile.maxInputTokens === "number" ||
      input.profile.maxInputTokens == null)
  ) {
    return (input.profile.maxInputTokens as number) ?? undefined;
  }

  if ("model" in input && typeof input.model === "string") {
    return getModelContextSize(input.model);
  }
  if ("modelName" in input && typeof input.modelName === "string") {
    return getModelContextSize(input.modelName);
  }

  return undefined;
}