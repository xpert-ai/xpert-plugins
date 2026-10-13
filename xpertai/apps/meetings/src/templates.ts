import type { XpertTemplateContribution } from "@xpert-ai/plugin-sdk";
import {
  XpertTypeEnum,
  type PluginMarketplaceContribution,
} from "@xpert-ai/contracts";
import { readFileSync } from "node:fs";
import { FEATURE, PLUGIN, PROVIDER } from "./domain.js";
import { meetingsIcon, meetingsScreenshots } from "./branding.js";
export const TEMPLATE = "meetings-assistant";
export const templates: XpertTemplateContribution[] = [
  {
    key: TEMPLATE,
    name: "Meetings Assistant",
    title: "会议助手",
    avatar: { url: meetingsIcon.value },
    icon: meetingsIcon,
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
    ).replace("MEETINGS_LOGO_URL", JSON.stringify(meetingsIcon.value)),
    startPrompts: [
      "今天的会议里，我承诺了哪些事情？",
      "帮我准备下一次一对一会议。",
      "查找最近关于项目排期的决定。",
    ],
    releaseNotes:
      "模板 v6：会议记录和协作文档按助手共享，录音会话保留发起人绑定。",
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
    "Shared meeting notes in Xpert Desktop.",
    "在 Desktop 记录会议，整理笔记与后续事项。"
  ),
  icon: meetingsIcon,
  color: "#f59e0b",
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
      screenshots: meetingsScreenshots,
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
            "Keep meeting notes independent. Verify decisions and follow-ups against transcript excerpts.",
            "会议笔记独立保存，决策与后续事项可核对转写原文。"
          ),
        },
        {
          key: "recall",
          title: label("Find and prepare", "回顾与准备"),
          description: label(
            "Search this Assistant’s meeting history and prepare for the next conversation.",
            "搜索当前助手的会议记录，回顾承诺并准备下一次讨论。"
          ),
        },
      ],
      dataScope: label(
        "Meeting content is shared by users authorized to use this Assistant. Files stay in its shared workspace; use a separate Assistant for separate records.",
        "会议内容由有权使用当前助手的成员共享，保存在助手的共享文件空间中；需要独立记录时使用独立助手。"
      ),
      initializationSummary: label(
        "Creates a workspace and Assistant. Configure speech-to-text on the Assistant and the primary chat model on the Assistant before recording.",
        "创建工作空间和会议助手。录音前需为助手配置语音转写模型，并配置助手的主对话模型。"
      ),
    },
  },
};
