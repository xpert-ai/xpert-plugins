import { z } from "zod/v3";
import { z as z4 } from "zod/v4";
import { Injectable } from "@nestjs/common";
import {
  AgentMiddlewareStrategy,
  IAgentMiddlewareStrategy,
  IAgentMiddlewareContext,
} from "@xpert-ai/plugin-sdk";
import {
  TAgentMiddlewareMeta,
  JsonSchemaObjectType,
} from "@metad/contracts";
import {
  interopSafeParse,
  InferInteropZodInput,
} from "@langchain/core/utils/types";
import {
  AIMessage,
  BaseMessage,
  ToolMessage,
  isAIMessage,
  HumanMessage,
} from "@langchain/core/messages";
import { ToolCall } from "@langchain/core/messages/tool";
import { PiiIcon } from "./types.js";

/**
 * PII match detected in content
 */
export interface PiiMatch {
  text: string;
  start: number;
  end: number;
  type: string;
}

/**
 * PII detection function type
 */
export type PiiDetector = (content: string) => PiiMatch[];

/**
 * Redaction strategy
 */
export type RedactionStrategy = "hash" | "mask" | "remove" | "replace";

/**
 * Built-in PII types
 */
export type BuiltInPiiType = "ssn" | "email" | "phone" | "credit_card" | "ip_address";

/**
 * Configuration Schema definition
 */
const piiMiddlewareSchema = z.object({
  piiType: z.string().optional().default("custom"),
  detector: z.custom<PiiDetector>().optional(),
  strategy: z.enum(["hash", "mask", "remove", "replace"]).default("hash"),
  replacementText: z.string().optional().default("[REDACTED]"),
  maskChar: z.string().optional().default("*"),
  maskLength: z.number().optional().default(4),
  hashAlgorithm: z.enum(["sha256", "sha1", "md5"]).optional().default("sha256"),
  detectIn: z.array(z.enum(["input", "output", "both"])).default(["both"]),
  enabled: z.boolean().default(true),
}).refine(
  (data) => {
    // If piiType is custom, detector must be provided
    if (data.piiType === "custom" && !data.detector) {
      return false;
    }
    return true;
  },
  {
    message: "Custom PII type requires a detector function",
  }
);

export type PiiMiddlewareConfig = InferInteropZodInput<
  typeof piiMiddlewareSchema
>;

/**
 * State schema for tracking PII detection
 */
const piiMiddlewareStateSchema = z.object({
  piiDetectedCount: z.record(z.string(), z.number()).optional(),
  redactedContent: z.record(z.string(), z.string()).optional(),
});

export type PiiMiddlewareState = z.infer<typeof piiMiddlewareStateSchema>;

/**
 * Built-in PII detectors
 */
const builtInDetectors: Record<BuiltInPiiType, PiiDetector> = {
  ssn: (content: string): PiiMatch[] => {
    const matches: PiiMatch[] = [];
    const pattern = /\d{3}-\d{2}-\d{4}/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const ssn = match[0];
      // Validate: first 3 digits shouldn't be 000, 666, or 900-999
      const firstThree = parseInt(ssn.substring(0, 3), 10);
      if (firstThree !== 0 && firstThree !== 666 && !(firstThree >= 900 && firstThree <= 999)) {
        matches.push({
          text: ssn,
          start: match.index ?? 0,
          end: (match.index ?? 0) + ssn.length,
          type: "ssn",
        });
      }
    }
    return matches;
  },
  
  email: (content: string): PiiMatch[] => {
    const matches: PiiMatch[] = [];
    const pattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      matches.push({
        text: match[0],
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        type: "email",
      });
    }
    return matches;
  },
  
  phone: (content: string): PiiMatch[] => {
    const matches: PiiMatch[] = [];
    const patterns = [
      /\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, // International
      /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, // US format
    ];
    
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        matches.push({
          text: match[0],
          start: match.index ?? 0,
          end: (match.index ?? 0) + match[0].length,
          type: "phone",
        });
      }
    }
    return matches;
  },
  
  credit_card: (content: string): PiiMatch[] => {
    const matches: PiiMatch[] = [];
    const patterns = [
      /\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}/g, // 16 digits
      /\d{4}[-.\s]?\d{6}[-.\s]?\d{5}/g, // 15 digits (Amex)
    ];
    
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        matches.push({
          text: match[0],
          start: match.index ?? 0,
          end: (match.index ?? 0) + match[0].length,
          type: "credit_card",
        });
      }
    }
    return matches;
  },
  
  ip_address: (content: string): PiiMatch[] => {
    const matches: PiiMatch[] = [];
    const pattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const ip = match[0];
      // Basic validation: each octet should be 0-255
      const octets = ip.split('.');
      if (octets.length === 4 && octets.every(octet => {
        const num = parseInt(octet, 10);
        return num >= 0 && num <= 255;
      })) {
        matches.push({
          text: ip,
          start: match.index ?? 0,
          end: (match.index ?? 0) + ip.length,
          type: "ip_address",
        });
      }
    }
    return matches;
  },
};

/**
 * Apply redaction to content based on matches and strategy
 */
function applyRedaction(
  content: string,
  matches: PiiMatch[],
  strategy: RedactionStrategy,
  options: {
    replacementText?: string;
    maskChar?: string;
    maskLength?: number;
    hashAlgorithm?: string;
  }
): string {
  if (matches.length === 0) {
    return content;
  }

  // Sort matches by start position in reverse order to avoid index shifting
  const sortedMatches = [...matches].sort((a, b) => b.start - a.start);
  
  let result = content;
  
  for (const match of sortedMatches) {
    const replacement = getReplacementText(match.text, strategy, options);
    result = result.slice(0, match.start) + replacement + result.slice(match.end);
  }
  
  return result;
}

/**
 * Get replacement text for a PII match
 */
function getReplacementText(
  original: string,
  strategy: RedactionStrategy,
  options: {
    replacementText?: string;
    maskChar?: string;
    maskLength?: number;
    hashAlgorithm?: string;
  }
): string {
  switch (strategy) {
    case "hash":
      // Simple hash simulation (in real implementation, use crypto library)
      const hash = simpleHash(original, options.hashAlgorithm || "sha256");
      return `[HASH:${hash.slice(0, 8)}]`;
    
    case "mask":
      const maskLength = options.maskLength || 4;
      const maskChar = options.maskChar || "*";
      if (original.length <= maskLength) {
        return maskChar.repeat(original.length);
      }
      const visibleStart = Math.floor((original.length - maskLength) / 2);
      return (
        original.slice(0, visibleStart) +
        maskChar.repeat(maskLength) +
        original.slice(visibleStart + maskLength)
      );
    
    case "remove":
      return "";
    
    case "replace":
    default:
      return options.replacementText || "[REDACTED]";
  }
}

/**
 * Simple hash function (for demonstration)
 * In production, use crypto.createHash
 */
function simpleHash(str: string, algorithm: string): string {
  // This is a simplified version for demonstration
  // In real implementation, import crypto and use createHash
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * PII Middleware
 *
 * Detect and redact Personally Identifiable Information (PII) in agent messages.
 * Supports built-in PII types (SSN, email, phone, credit card, IP address) and custom detectors.
 * Multiple redaction strategies: hash, mask, remove, or replace with custom text.
 */
@Injectable()
@AgentMiddlewareStrategy("PiiMiddleware")
export class PiiMiddleware implements IAgentMiddlewareStrategy {
  readonly meta: TAgentMiddlewareMeta = {
    name: "PiiMiddleware",
    label: {
      en_US: "PII Detection Middleware",
      zh_Hans: "PII检测中间件",
    },
    icon: {
      type: "svg",
      value: PiiIcon,
    },
    description: {
      en_US:
        "Detect and redact Personally Identifiable Information (PII) in agent messages. Supports built-in PII types (SSN, email, phone, credit card, IP address) and custom detectors with multiple redaction strategies.",
      zh_Hans:
        "检测和编辑代理消息中的个人身份信息（PII）。支持内置PII类型（SSN、电子邮件、电话、信用卡、IP地址）和具有多种编辑策略的自定义检测器。",
    },
    configSchema: {
      type: "object",
      properties: {
        piiType: {
          type: "string",
          default: "custom",
          title: {
            en_US: "PII Type",
            zh_Hans: "PII类型",
          },
          description: {
            en_US:
              "Type of PII to detect: 'ssn', 'email', 'phone', 'credit_card', 'ip_address', or 'custom' for custom detector.",
            zh_Hans:
              "要检测的PII类型：'ssn'、'email'、'phone'、'credit_card'、'ip_address'，或使用'custom'进行自定义检测。",
          },
          'x-ui': {
            enumLabels: {
              ssn: {
                en_US: 'SSN (Social Security Number)',
                zh_Hans: 'SSN（社会安全号码）',
              },
              email: {
                en_US: 'Email Address',
                zh_Hans: '电子邮件地址',
              },
              phone: {
                en_US: 'Phone Number',
                zh_Hans: '电话号码',
              },
              credit_card: {
                en_US: 'Credit Card Number',
                zh_Hans: '信用卡号码',
              },
              ip_address: {
                en_US: 'IP Address',
                zh_Hans: 'IP地址',
              },
              custom: {
                en_US: 'Custom Detector',
                zh_Hans: '自定义检测器',
              },
            }
          }
        },
        detector: {
          type: "string",
          nullable: true,
          title: {
            en_US: "Custom Detector Function",
            zh_Hans: "自定义检测函数",
          },
          description: {
            en_US:
              "Custom JavaScript function for detecting PII. Required when piiType is 'custom'. Function signature: (content: string) => Array<{text: string, start: number, end: number, type: string}>",
            zh_Hans:
              "用于检测PII的自定义JavaScript函数。当piiType为'custom'时必需。函数签名：(content: string) => Array<{text: string, start: number, end: number, type: string}>",
          },
        },
        strategy: {
          type: "string",
          enum: ["hash", "mask", "remove", "replace"],
          default: "hash",
          title: {
            en_US: "Redaction Strategy",
            zh_Hans: "编辑策略",
          },
          description: {
            en_US:
              "How to handle detected PII: 'hash' (replace with hash), 'mask' (partially mask), 'remove' (completely remove), 'replace' (replace with custom text).",
            zh_Hans:
              "如何处理检测到的PII：'hash'（替换为哈希）、'mask'（部分屏蔽）、'remove'（完全删除）、'replace'（替换为自定义文本）。",
          },
          'x-ui': {
            enumLabels: {
              hash: {
                en_US: 'Hash',
                zh_Hans: '哈希',
              },
              mask: {
                en_US: 'Mask',
                zh_Hans: '屏蔽',
              },
              remove: {
                en_US: 'Remove',
                zh_Hans: '删除',
              },
              replace: {
                en_US: 'Replace',
                zh_Hans: '替换',
              },
            }
          }
        },
        replacementText: {
          type: "string",
          default: "[REDACTED]",
          title: {
            en_US: "Replacement Text",
            zh_Hans: "替换文本",
          },
          description: {
            en_US:
              "Text to use when strategy is 'replace'. Ignored for other strategies.",
            zh_Hans:
              "当策略为'replace'时使用的文本。其他策略忽略此设置。",
          },
        },
        maskChar: {
          type: "string",
          default: "*",
          title: {
            en_US: "Mask Character",
            zh_Hans: "屏蔽字符",
          },
          description: {
            en_US:
              "Character to use for masking when strategy is 'mask'.",
            zh_Hans:
              "当策略为'mask'时使用的屏蔽字符。",
          },
        },
        maskLength: {
          type: "number",
          default: 4,
          minimum: 1,
          maximum: 20,
          title: {
            en_US: "Mask Length",
            zh_Hans: "屏蔽长度",
          },
          description: {
            en_US:
              "Number of characters to mask when strategy is 'mask'.",
            zh_Hans:
              "当策略为'mask'时要屏蔽的字符数。",
          },
        },
        hashAlgorithm: {
          type: "string",
          enum: ["sha256", "sha1", "md5"],
          default: "sha256",
          title: {
            en_US: "Hash Algorithm",
            zh_Hans: "哈希算法",
          },
          description: {
            en_US:
              "Hash algorithm to use when strategy is 'hash'.",
            zh_Hans:
              "当策略为'hash'时使用的哈希算法。",
          },
        },
        detectIn: {
          type: "array",
          items: {
            type: "string",
            enum: ["input", "output", "both"]
          },
          default: ["both"],
          title: {
            en_US: "Detect In",
            zh_Hans: "检测范围",
          },
          description: {
            en_US:
              "Where to detect PII: 'input' (user messages), 'output' (AI responses), or 'both'.",
            zh_Hans:
              "在何处检测PII：'input'（用户消息）、'output'（AI响应）或'both'（两者）。",
          },
        },
        enabled: {
          type: "boolean",
          default: true,
          title: {
            en_US: "Enabled",
            zh_Hans: "启用",
          },
          description: {
            en_US:
              "Enable or disable PII detection.",
            zh_Hans:
              "启用或禁用PII检测。",
          },
        },
      } as unknown as JsonSchemaObjectType["properties"],
      required: [],
    },
  };

  async createMiddleware(
    options: PiiMiddlewareConfig,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: IAgentMiddlewareContext
  ) {
    const { data: userOptions, error } = interopSafeParse(
      piiMiddlewareSchema,
      options
    );
    if (error) {
      throw new Error(
        `Invalid PII middleware options: ${z4.prettifyError(error)}`
      );
    }

    const piiType = userOptions.piiType;
    const detector = userOptions.detector;
    const strategy = userOptions.strategy;
    const replacementText = userOptions.replacementText;
    const maskChar = userOptions.maskChar;
    const maskLength = userOptions.maskLength;
    const hashAlgorithm = userOptions.hashAlgorithm;
    const detectIn = userOptions.detectIn;
    const enabled = userOptions.enabled;

    // Get the appropriate detector
    const getDetector = (): PiiDetector => {
      if (piiType === "custom" && detector) {
        return detector;
      }
      if (piiType in builtInDetectors) {
        return builtInDetectors[piiType as BuiltInPiiType];
      }
      // Default to SSN detector
      return builtInDetectors.ssn;
    };

    const piiDetector = getDetector();
    const redactionOptions = {
      replacementText,
      maskChar,
      maskLength,
      hashAlgorithm,
    };

    // Helper function to process messages for PII
    const processMessagesForPii = (
      messages: BaseMessage[],
      state: Record<string, unknown>
    ): { updatedMessages: BaseMessage[]; piiCounts: Record<string, number> } => {
      const updatedMessages: BaseMessage[] = [];
      let piiCounts: Record<string, number> = {};
      const existingPiiCounts = (state["piiDetectedCount"] as Record<string, number>) || {};
      const existingRedactedContent = (state["redactedContent"] as Record<string, string>) || {};

      for (const message of messages) {
        let content = "";
        let shouldProcess = false;

        // Determine if we should process this message based on detectIn setting
        if (isAIMessage(message) && detectIn.includes("output")) {
          content = typeof message.content === "string" ? message.content : "";
          shouldProcess = true;
        } else if (message instanceof HumanMessage && detectIn.includes("input")) {
          content = typeof message.content === "string" ? message.content : "";
          shouldProcess = true;
        }

        if (!shouldProcess || !content) {
          updatedMessages.push(message);
          continue;
        }

        // Detect PII in content
        const matches = piiDetector(content);
        
        if (matches.length > 0) {
          // Update PII counts by type
          const typeCounts: Record<string, number> = {};
          for (const match of matches) {
            typeCounts[match.type] = (typeCounts[match.type] || 0) + 1;
            piiCounts[match.type] = (piiCounts[match.type] || 0) + 1;
          }

          // Apply redaction
          const redactedContent = applyRedaction(content, matches, strategy, redactionOptions);
          
          // Create new message with redacted content
          let newMessage: BaseMessage;
          if (isAIMessage(message)) {
            newMessage = new AIMessage({
              ...message,
              content: redactedContent,
            });
          } else if (message instanceof HumanMessage) {
            newMessage = new HumanMessage({
              ...message,
              content: redactedContent,
            });
          } else {
            newMessage = message;
          }

          updatedMessages.push(newMessage);

          // Log detection
          console.log(
            `[PiiMiddleware] Detected ${matches.length} PII instance(s) in ${isAIMessage(message) ? 'AI response' : 'user input'}:`,
            matches.map(m => `${m.type}: "${m.text}"`).join(", ")
          );

          // Store redacted content for reference
          const messageId = (message as any).id || `msg_${Date.now()}`;
          existingRedactedContent[messageId] = redactedContent;
        } else {
          updatedMessages.push(message);
        }
      }

      // Merge with existing counts
      const mergedPiiCounts = { ...existingPiiCounts };
      for (const [type, count] of Object.entries(piiCounts)) {
        mergedPiiCounts[type] = (mergedPiiCounts[type] || 0) + count;
      }

      return {
        updatedMessages,
        piiCounts: mergedPiiCounts,
      };
    };

    return {
      name: `PiiMiddleware[${piiType}]`,
      stateSchema: piiMiddlewareStateSchema,
      beforeAgent: {
        hook: async (state: Record<string, unknown>) => {
          if (!enabled) {
            return undefined;
          }

          // Get messages from state
          const messages = (state["messages"] as BaseMessage[]) || [];
          if (messages.length === 0) {
            return undefined;
          }

          console.log(
            `[PiiMiddleware] Processing ${messages.length} message(s) for PII detection`
          );

          const { updatedMessages, piiCounts } = processMessagesForPii(messages, state);

          if (updatedMessages.length === messages.length) {
            // No changes made
            return undefined;
          }

          return {
            messages: updatedMessages,
            piiDetectedCount: piiCounts,
          };
        },
      },
      afterModel: {
        hook: async (state: Record<string, unknown>) => {
          if (!enabled) {
            return undefined;
          }

          // Get messages from state
          const messages = (state["messages"] as BaseMessage[]) || [];
          if (messages.length === 0) {
            return undefined;
          }

          // Find the last AIMessage (the model's response)
          let lastAIMessage: AIMessage | null = null;
          for (let i = messages.length - 1; i >= 0; i--) {
            if (isAIMessage(messages[i])) {
              lastAIMessage = messages[i] as AIMessage;
              break;
            }
          }

          if (!lastAIMessage) {
            return undefined;
          }

          console.log(
            `[PiiMiddleware] Processing AI response for PII detection`
          );

          const { updatedMessages, piiCounts } = processMessagesForPii([lastAIMessage], state);

          if (updatedMessages.length === 0 || updatedMessages[0] === lastAIMessage) {
            // No changes made
            return undefined;
          }

          // Replace the last AIMessage with the redacted version
          const updatedMessagesList = [...messages];
          const lastAIMessageIndex = updatedMessagesList.findIndex(
            (msg, idx) => idx === updatedMessagesList.length - 1 && isAIMessage(msg)
          );
          if (lastAIMessageIndex !== -1) {
            updatedMessagesList[lastAIMessageIndex] = updatedMessages[0];
          }

          return {
            messages: updatedMessagesList,
            piiDetectedCount: piiCounts,
          };
        },
      },
    };
  }
}