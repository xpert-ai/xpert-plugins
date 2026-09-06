import {
  McpAppBridge,
  asObject,
  extractStructuredContent,
} from "../shared/bridge.js";
import {
  createElement,
  replaceChildren,
  requiredElement,
} from "../shared/dom.js";
import { resolveLocale, type FactoryAppLocaleState } from "../shared/locale.js";

interface DashboardSummary {
  totalCases: number;
  activeCases: number;
  criticalCases: number;
  awaitingApproval: number;
  recoveredCases: number;
  failedExecutions: number;
  averageResponseSeconds: number | null;
  averageRecoveryMinutes: number | null;
  avoidedDowntimeMinutes: number;
  avoidedLossCny: number;
}

interface PipelineLane {
  laneKey: string;
  laneTitle: string;
  ready: number;
  active: number;
  blocked: number;
  completed: number;
}

interface DashboardResult {
  summary: DashboardSummary;
  pipelineHealth: PipelineLane[];
  simulation: boolean;
  refreshedAt: string;
}

const MESSAGES = {
  en: {
    documentTitle: "Factory operations dashboard",
    eyebrow: "Factory Operations",
    title: "Operations dashboard",
    waiting: "Waiting for the latest organization-scoped result…",
    refreshed: "Last refreshed",
    refresh: "Refresh",
    total: "Total cases",
    active: "Active",
    critical: "Critical",
    approval: "Awaiting approval",
    recovered: "Recovered",
    pipeline: "Recovery lane health",
    noLanes: "No recovery lanes are available yet.",
    simulation: "Simulation data",
    live: "Authorized organization data",
    laneCounts: (lane: PipelineLane) =>
      `${lane.ready} ready · ${lane.active} active · ${lane.blocked} blocked · ${lane.completed} completed`,
    requestFailed: "The dashboard could not be refreshed.",
  },
  zh: {
    documentTitle: "工厂运营看板",
    eyebrow: "工厂运营",
    title: "运营看板",
    waiting: "正在等待当前组织的最新结果…",
    refreshed: "刷新时间",
    refresh: "刷新",
    total: "事件总数",
    active: "处理中",
    critical: "严重事件",
    approval: "待审批",
    recovered: "已恢复",
    pipeline: "恢复泳道健康度",
    noLanes: "暂时没有恢复泳道数据。",
    simulation: "仿真数据",
    live: "当前组织授权数据",
    laneCounts: (lane: PipelineLane) =>
      `就绪 ${lane.ready} · 进行中 ${lane.active} · 阻塞 ${lane.blocked} · 完成 ${lane.completed}`,
    requestFailed: "无法刷新运营看板。",
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
let current: DashboardResult | undefined;

const bridge = new McpAppBridge({
  onHostContext(context) {
    locale = resolveLocale(context);
    applyLocale();
    if (current) render(current);
  },
  onToolInput() {},
  onToolResult(value) {
    applyResult(extractStructuredContent(value));
  },
  onError(value) {
    showError(value);
  },
});

refresh.addEventListener("click", async () => {
  refresh.disabled = true;
  showError();
  try {
    const result = await bridge.callTool(
      "factory_operations_dashboard_get",
      {}
    );
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
  title.textContent = message.title;
  refresh.textContent = message.refresh;
  if (!current) subtitle.textContent = message.waiting;
}

function applyResult(value: unknown) {
  const parsed = parseDashboard(value);
  if (!parsed) {
    showError(new Error(MESSAGES[locale.locale].requestFailed));
    return;
  }
  current = parsed;
  showError();
  render(parsed);
}

function render(data: DashboardResult) {
  const message = MESSAGES[locale.locale];
  subtitle.textContent = `${
    data.simulation ? message.simulation : message.live
  } · ${message.refreshed} ${formatDate(data.refreshedAt)}`;

  const metrics = createElement("section", "metric-grid");
  const definitions: Array<[string, number, string?]> = [
    [message.total, data.summary.totalCases],
    [message.active, data.summary.activeCases],
    [message.critical, data.summary.criticalCases],
    [message.approval, data.summary.awaitingApproval],
    [message.recovered, data.summary.recoveredCases],
  ];
  metrics.append(
    ...definitions.map(([label, value, note]) => metric(label, value, note))
  );

  const pipeline = createElement("section", "section");
  pipeline.append(createElement("h2", undefined, message.pipeline));
  if (!data.pipelineHealth.length) {
    pipeline.append(createElement("p", "empty", message.noLanes));
  } else {
    const lanes = createElement("div", "lane-list");
    lanes.append(...data.pipelineHealth.map((lane) => renderLane(lane)));
    pipeline.append(lanes);
  }
  replaceChildren(content, [metrics, pipeline]);
  bridge.notifySize();
}

function metric(label: string, value: number, note?: string) {
  const element = createElement("article", "metric");
  element.append(createElement("div", "metric-label", label));
  element.append(
    createElement("div", "metric-value", value.toLocaleString(locale.tag))
  );
  if (note) element.append(createElement("div", "metric-note", note));
  return element;
}

function renderLane(lane: PipelineLane) {
  const element = createElement("div", "lane");
  element.append(createElement("div", "lane-title", lane.laneTitle));
  const total = Math.max(
    1,
    lane.ready + lane.active + lane.blocked + lane.completed
  );
  const bar = createElement("div", "lane-bar");
  for (const [className, value] of [
    ["lane-ready", lane.ready],
    ["lane-active", lane.active],
    ["lane-blocked", lane.blocked],
    ["lane-completed", lane.completed],
  ] as const) {
    const segment = createElement("span", className);
    segment.style.width = `${(value / total) * 100}%`;
    bar.append(segment);
  }
  element.append(
    bar,
    createElement(
      "div",
      "lane-counts",
      MESSAGES[locale.locale].laneCounts(lane)
    )
  );
  return element;
}

function parseDashboard(value: unknown): DashboardResult | undefined {
  const record = asObject(value);
  const summary = asObject(record?.summary);
  const lanes = record?.pipelineHealth;
  const refreshedAt = record?.refreshedAt;
  if (
    !summary ||
    !Array.isArray(lanes) ||
    typeof refreshedAt !== "string" ||
    typeof record?.simulation !== "boolean"
  ) {
    return undefined;
  }
  const parsedSummary = parseSummary(summary);
  const parsedLanes = lanes.map(parseLane);
  if (!parsedSummary || parsedLanes.some((lane) => !lane)) return undefined;
  return {
    summary: parsedSummary,
    pipelineHealth: parsedLanes.filter((lane): lane is PipelineLane =>
      Boolean(lane)
    ),
    simulation: record.simulation,
    refreshedAt,
  };
}

function parseSummary(
  value: Record<string, unknown>
): DashboardSummary | undefined {
  const required = [
    "totalCases",
    "activeCases",
    "criticalCases",
    "awaitingApproval",
    "recoveredCases",
    "failedExecutions",
    "avoidedDowntimeMinutes",
    "avoidedLossCny",
  ] as const;
  if (required.some((key) => typeof value[key] !== "number")) return undefined;
  const averageResponseSeconds = nullableNumber(value.averageResponseSeconds);
  const averageRecoveryMinutes = nullableNumber(value.averageRecoveryMinutes);
  if (
    averageResponseSeconds === undefined ||
    averageRecoveryMinutes === undefined
  )
    return undefined;
  return {
    totalCases: Number(value.totalCases),
    activeCases: Number(value.activeCases),
    criticalCases: Number(value.criticalCases),
    awaitingApproval: Number(value.awaitingApproval),
    recoveredCases: Number(value.recoveredCases),
    failedExecutions: Number(value.failedExecutions),
    averageResponseSeconds,
    averageRecoveryMinutes,
    avoidedDowntimeMinutes: Number(value.avoidedDowntimeMinutes),
    avoidedLossCny: Number(value.avoidedLossCny),
  };
}

function parseLane(value: unknown): PipelineLane | undefined {
  const lane = asObject(value);
  if (
    !lane ||
    typeof lane.laneKey !== "string" ||
    typeof lane.laneTitle !== "string"
  )
    return undefined;
  if (
    ["ready", "active", "blocked", "completed"].some(
      (key) => typeof lane[key] !== "number"
    )
  )
    return undefined;
  return {
    laneKey: lane.laneKey,
    laneTitle: lane.laneTitle,
    ready: Number(lane.ready),
    active: Number(lane.active),
    blocked: Number(lane.blocked),
    completed: Number(lane.completed),
  };
}

function nullableNumber(value: unknown) {
  return value === null ? null : typeof value === "number" ? value : undefined;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale.tag, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function showError(cause?: unknown) {
  error.hidden = cause === undefined;
  error.textContent =
    cause instanceof Error ? cause.message : cause ? String(cause) : "";
  bridge.notifySize();
}

applyLocale();
bridge.observeSize(root);
bridge.initialize("factory-operations-dashboard", "0.4.0").catch(showError);

export {};
