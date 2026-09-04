import {
  McpAppBridge,
  asObject,
  extractStructuredContent,
  extractToolArguments,
} from "../shared/bridge.js";
import {
  createElement,
  replaceChildren,
  requiredElement,
} from "../shared/dom.js";
import { resolveLocale, type FactoryAppLocaleState } from "../shared/locale.js";

interface CaseProgress {
  completedSteps: number;
  totalSteps: number;
  percent: number;
}

interface CaseMetrics {
  responseSeconds: number | null;
  recoveryMinutes: number | null;
  avoidedDowntimeMinutes: number;
  avoidedLossCny: number;
}

interface CaseSummary {
  id: string;
  caseKey: string;
  title: string;
  revision: number;
  status: string;
  currentStage: string;
  event: Record<string, unknown>;
  findings: Record<string, unknown>;
  plan: Record<string, unknown> | null;
  execution: Record<string, unknown> | null;
  verification: Record<string, unknown> | null;
  metrics: CaseMetrics;
  progress: CaseProgress;
  nextAction: string;
}

const MESSAGES = {
  en: {
    documentTitle: "Factory Case summary",
    eyebrow: "Factory Case",
    waiting: "Waiting for the selected Factory Case…",
    refresh: "Refresh",
    revision: "Revision",
    progress: "Recovery progress",
    steps: (done: number, total: number) =>
      `${done} of ${total} steps completed`,
    incident: "Incident",
    device: "Device",
    line: "Line",
    severity: "Severity",
    occurredAt: "Occurred",
    currentStage: "Current stage",
    findings: "Specialist findings",
    equipment: "Equipment",
    quality: "Quality",
    production: "Production",
    resources: "Resources",
    completed: "Completed",
    pending: "Pending",
    governance: "Recovery governance",
    plan: "Plan",
    execution: "Execution",
    verification: "Verification",
    available: "Available",
    notAvailable: "Not available",
    nextAction: "Next action",
    requestFailed: "The Factory Case summary could not be loaded.",
  },
  zh: {
    documentTitle: "Factory Case 摘要",
    eyebrow: "工厂事件",
    waiting: "正在等待所选 Factory Case…",
    refresh: "刷新",
    revision: "修订号",
    progress: "恢复进度",
    steps: (done: number, total: number) => `已完成 ${done}/${total} 个步骤`,
    incident: "事件信息",
    device: "设备",
    line: "产线",
    severity: "严重程度",
    occurredAt: "发生时间",
    currentStage: "当前阶段",
    findings: "专业研判",
    equipment: "设备诊断",
    quality: "质量影响",
    production: "生产影响",
    resources: "资源就绪",
    completed: "已完成",
    pending: "待处理",
    governance: "恢复治理",
    plan: "恢复方案",
    execution: "执行确认",
    verification: "恢复验证",
    available: "已有记录",
    notAvailable: "暂无记录",
    nextAction: "下一步",
    requestFailed: "无法加载 Factory Case 摘要。",
  },
} as const;

const root = requiredElement<HTMLElement>("app");
const eyebrow = requiredElement<HTMLElement>("eyebrow");
const title = requiredElement<HTMLHeadingElement>("title");
const subtitle = requiredElement<HTMLParagraphElement>("subtitle");
const content = requiredElement<HTMLDivElement>("content");
const error = requiredElement<HTMLParagraphElement>("error");
const refresh = requiredElement<HTMLButtonElement>("refresh");
let locale: FactoryAppLocaleState = resolveLocale();
let current: CaseSummary | undefined;
let caseId: string | undefined;

const bridge = new McpAppBridge({
  onHostContext(context) {
    locale = resolveLocale(context);
    applyLocale();
    if (current) render(current);
  },
  onToolInput(value) {
    const input = extractToolArguments(value);
    if (typeof input?.caseId === "string") caseId = input.caseId;
  },
  onToolResult(value) {
    applyResult(extractStructuredContent(value));
  },
  onError(value) {
    showError(value);
  },
});

refresh.addEventListener("click", async () => {
  const targetCaseId = caseId ?? current?.id;
  if (!targetCaseId) return;
  refresh.disabled = true;
  showError();
  try {
    const result = await bridge.callTool("factory_case_get_summary", {
      caseId: targetCaseId,
    });
    applyResult(extractStructuredContent(result));
  } catch (cause) {
    showError(cause);
  } finally {
    refresh.disabled = false;
  }
});

function applyLocale() {
  const message = MESSAGES[locale.locale];
  document.title = message.documentTitle;
  eyebrow.textContent = message.eyebrow;
  refresh.textContent = message.refresh;
  if (!current) {
    title.textContent = message.documentTitle;
    subtitle.textContent = message.waiting;
  }
}

function applyResult(value: unknown) {
  const parsed = parseCaseSummary(value);
  if (!parsed) {
    showError(new Error(MESSAGES[locale.locale].requestFailed));
    return;
  }
  current = parsed;
  caseId = parsed.id;
  showError();
  render(parsed);
}

function render(data: CaseSummary) {
  const message = MESSAGES[locale.locale];
  title.textContent = data.title;
  subtitle.textContent = `${data.caseKey} · ${message.revision} ${data.revision}`;

  const caseHeader = createElement("section", "case-header-grid");
  const progress = createElement("div");
  progress.append(createElement("h2", undefined, message.progress));
  const track = createElement("div", "progress-track");
  const value = createElement("div", "progress-value");
  value.style.width = `${Math.max(0, Math.min(100, data.progress.percent))}%`;
  track.append(value);
  const progressMeta = createElement("div", "progress-meta");
  progressMeta.append(
    createElement(
      "span",
      undefined,
      message.steps(data.progress.completedSteps, data.progress.totalSteps)
    ),
    createElement("span", undefined, `${formatNumber(data.progress.percent)}%`)
  );
  progress.append(track, progressMeta);
  caseHeader.append(
    progress,
    createElement("span", "status-pill", labelCode(data.status))
  );

  const details = createElement("div", "detail-grid");
  details.append(
    detailSection(message.incident, [
      [
        message.device,
        displayValue(data.event.deviceName) ||
          displayValue(data.event.deviceId),
      ],
      [message.line, displayValue(data.event.lineId)],
      [message.severity, labelCode(displayValue(data.event.severity))],
      [message.occurredAt, formatDate(displayValue(data.event.occurredAt))],
      [message.currentStage, labelCode(data.currentStage)],
    ]),
    findingsSection(data),
    governanceSection(data)
  );
  const next = createElement("div", "next-action");
  next.append(
    createElement("strong", undefined, `${message.nextAction}: `),
    document.createTextNode(data.nextAction)
  );
  replaceChildren(content, [caseHeader, details, next]);
  bridge.notifySize();
}

function detailSection(titleText: string, rows: Array<[string, string]>) {
  const section = createElement("section", "detail-section");
  section.append(createElement("h2", undefined, titleText));
  const list = createElement("dl", "detail-list");
  for (const [label, value] of rows) {
    const row = createElement("div", "detail-row");
    row.append(
      createElement("dt", undefined, label),
      createElement("dd", undefined, value || "—")
    );
    list.append(row);
  }
  section.append(list);
  return section;
}

function findingsSection(data: CaseSummary) {
  const message = MESSAGES[locale.locale];
  const section = createElement("section", "detail-section");
  section.append(createElement("h2", undefined, message.findings));
  const list = createElement("div", "finding-list");
  for (const [key, label] of [
    ["equipment", message.equipment],
    ["quality", message.quality],
    ["production", message.production],
    ["resources", message.resources],
  ] as const) {
    const present = asObject(data.findings[key]) !== undefined;
    const item = createElement("div", "finding");
    item.append(
      createElement("strong", undefined, label),
      createElement(
        "span",
        undefined,
        present ? message.completed : message.pending
      )
    );
    list.append(item);
  }
  section.append(list);
  return section;
}

function governanceSection(data: CaseSummary) {
  const message = MESSAGES[locale.locale];
  return detailSection(message.governance, [
    [message.plan, data.plan ? message.available : message.notAvailable],
    [
      message.execution,
      data.execution ? message.available : message.notAvailable,
    ],
    [
      message.verification,
      data.verification ? message.available : message.notAvailable,
    ],
  ]);
}

function parseCaseSummary(value: unknown): CaseSummary | undefined {
  const record = asObject(value);
  const event = asObject(record?.event);
  const findings = asObject(record?.findings);
  const progress = asObject(record?.progress);
  const metrics = asObject(record?.metrics);
  if (!record || !event || !findings || !progress || !metrics) return undefined;
  if (
    !isStringFields(record, [
      "id",
      "caseKey",
      "title",
      "status",
      "currentStage",
      "nextAction",
    ]) ||
    typeof record.revision !== "number" ||
    !isNumberFields(progress, ["completedSteps", "totalSteps", "percent"]) ||
    !isNumberFields(metrics, ["avoidedDowntimeMinutes", "avoidedLossCny"])
  ) {
    return undefined;
  }
  const responseSeconds = nullableNumber(metrics.responseSeconds);
  const recoveryMinutes = nullableNumber(metrics.recoveryMinutes);
  if (responseSeconds === undefined || recoveryMinutes === undefined)
    return undefined;
  return {
    id: String(record.id),
    caseKey: String(record.caseKey),
    title: String(record.title),
    revision: record.revision,
    status: String(record.status),
    currentStage: String(record.currentStage),
    event,
    findings,
    plan: nullableObject(record.plan),
    execution: nullableObject(record.execution),
    verification: nullableObject(record.verification),
    metrics: {
      responseSeconds,
      recoveryMinutes,
      avoidedDowntimeMinutes: Number(metrics.avoidedDowntimeMinutes),
      avoidedLossCny: Number(metrics.avoidedLossCny),
    },
    progress: {
      completedSteps: Number(progress.completedSteps),
      totalSteps: Number(progress.totalSteps),
      percent: Number(progress.percent),
    },
    nextAction: String(record.nextAction),
  };
}

function isStringFields(
  value: Record<string, unknown>,
  keys: readonly string[]
) {
  return keys.every((key) => typeof value[key] === "string");
}

function isNumberFields(
  value: Record<string, unknown>,
  keys: readonly string[]
) {
  return keys.every((key) => typeof value[key] === "number");
}

function nullableObject(value: unknown) {
  return value === null ? null : asObject(value) ?? null;
}

function nullableNumber(value: unknown) {
  return value === null ? null : typeof value === "number" ? value : undefined;
}

function displayValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(locale.tag, { maximumFractionDigits: 1 }).format(
    value
  );
}

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale.tag, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function labelCode(value: string) {
  const labels: Record<string, [string, string]> = {
    investigating: ["Investigating", "研判中"],
    planning: ["Planning", "规划中"],
    awaiting_approval: ["Awaiting approval", "待审批"],
    approved: ["Approved", "已批准"],
    executing: ["Executing", "执行中"],
    verifying: ["Verifying", "验证中"],
    recovered: ["Recovered", "已恢复"],
    escalated: ["Escalated", "已升级"],
    rejected: ["Rejected", "已驳回"],
    medium: ["Medium", "中等"],
    high: ["High", "高"],
    critical: ["Critical", "严重"],
    detection: ["Detection", "异常检测"],
    triage: ["Triage", "异常研判"],
    specialist_analysis: ["Specialist analysis", "专业分析"],
    recovery_planning: ["Recovery planning", "恢复规划"],
  };
  const normalized = value
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
  return (
    labels[normalized]?.[locale.locale === "zh" ? 1 : 0] ??
    value.replaceAll("_", " ")
  );
}

function showError(cause?: unknown) {
  error.hidden = cause === undefined;
  error.textContent =
    cause instanceof Error ? cause.message : cause ? String(cause) : "";
  bridge.notifySize();
}

applyLocale();
bridge.observeSize(root);
bridge.initialize("factory-case-summary", "0.4.0").catch(showError);

export {};
