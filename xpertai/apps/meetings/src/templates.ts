import type { XpertTemplateContribution } from "@xpert-ai/plugin-sdk";
import {
  XpertTypeEnum,
  type PluginMarketplaceContribution,
} from "@xpert-ai/contracts";
import { readFileSync } from "node:fs";
import { FEATURE, PLUGIN, PROVIDER } from "./domain.js";
export const TEMPLATE = "meetings-assistant";
export const templates: XpertTemplateContribution[] = [
  {
    key: TEMPLATE,
    name: "Meetings Assistant",
    title: "会议助手",
    description: "记录会议，回顾决策与后续事项。",
    category: "Productivity",
    type: XpertTypeEnum.Agent,
    targetApps: ["xpert"],
    targetAppMeta: {
      xpert: {
        types: ["business-assistant"],
        capabilities: [FEATURE],
        requiredPlugins: [PLUGIN],
        defaultConfig: { viewProvider: PROVIDER },
      },
    },
    dslContent: readFileSync(
      new URL("./meetings-assistant.yaml", import.meta.url),
      "utf8"
    ),
    startPrompts: [
      "今天的会议里，我承诺了哪些事情？",
      "帮我准备下一次一对一会议。",
      "查找最近关于项目排期的决定。",
    ],
    releaseNotes:
      "模板 v3：静音分段提交 Assistant、同一会话持续追问、最终 Markdown 纪要。",
    providerKey: "meetings.templates",
    order: 30,
    default: false,
  },
];
const label = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans });
export const appContribution: PluginMarketplaceContribution = {
  type: "app",
  name: "meetings",
  displayName: "Meetings",
  description: label(
    "Private meeting notes in Xpert Desktop.",
    "在 Desktop 记录会议，整理笔记与后续事项。"
  ),
  icon: { type: "font", value: "ri-calendar-check-line" },
  appConfig: {
    scope: "organization",
    assistantTemplateKey: TEMPLATE,
    workspace: {
      mode: "dedicated",
      name: label("Meetings", "会议工作空间"),
      sharing: "organization",
    },
    knowledgebases: [],
    modelRequirements: { primary: true },
    entry: { type: "assistant-chat" },
    presentation: {
      tagline: label(
        "Stay in the conversation. Keep what matters.",
        "专注讨论，留下重点。"
      ),
      developer: "XpertAI",
      features: [
        {
          key: "capture",
          title: label("Desktop recording", "桌面录音"),
          description: label(
            "Manually record microphone and system audio on macOS 15+.",
            "在 macOS 15+ 手动记录麦克风与系统音频。"
          ),
        },
        {
          key: "notes",
          title: label("Notes and evidence", "笔记与原文依据"),
          description: label(
            "Keep personal notes independent. Verify decisions and follow-ups against transcript excerpts.",
            "个人笔记独立保存，决策与后续事项可核对转写原文。"
          ),
        },
        {
          key: "recall",
          title: label("Find and prepare", "回顾与准备"),
          description: label(
            "Search private meeting history and prepare for the next conversation.",
            "搜索自己的会议记录，回顾承诺并准备下一次讨论。"
          ),
        },
      ],
      dataScope: label(
        "Meeting content is private to each user in the current organization. Files are kept in the administrator-configured data directory.",
        "会议内容按当前组织中的用户隔离，以文件保存到管理员配置的持久目录。"
      ),
      initializationSummary: label(
        "Creates a workspace and Assistant. Configure speech-to-text on the Assistant and the primary chat model on the Assistant before recording.",
        "创建工作空间和会议助手。录音前需为助手配置语音转写模型，并配置助手的主对话模型。"
      ),
    },
  },
};
