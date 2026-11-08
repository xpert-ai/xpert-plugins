"use strict";
var XpertCrmWorkbench = (() => {
  // src/lib/remote-components/weekly-radar-workbench/src/utils.ts
  var PAGE_SIZE = 50;
  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function unwrap(response) {
    if (!isObject(response)) return {};
    if (Object.prototype.hasOwnProperty.call(response, "data")) return response.data;
    if (Object.prototype.hasOwnProperty.call(response, "result")) return response.result;
    if (Object.prototype.hasOwnProperty.call(response, "payload")) return response.payload;
    return response;
  }
  function buildQuery(context, weekKey, search) {
    const payload = context.payload ?? {};
    const initialQuery = context.initialQuery ?? {};
    return {
      page: 1,
      pageSize: PAGE_SIZE,
      ...initialQuery,
      search: search || void 0,
      parameters: {
        ...payload.parameters ?? {},
        ...initialQuery.parameters ?? {},
        weekKey: weekKey || void 0
      }
    };
  }
  function normalizeRadarData(raw) {
    const value = isObject(raw) ? raw : {};
    const summary = isObject(value.summary) ? value.summary : {};
    const metrics = isObject(summary.metrics) ? summary.metrics : null;
    const weekly = isObject(summary.weekly) ? summary.weekly : null;
    return {
      weekKey: typeof summary.weekKey === "string" ? summary.weekKey : "",
      entries: Array.isArray(value.items) ? value.items : [],
      total: typeof value.total === "number" ? value.total : 0,
      metrics,
      risks: Array.isArray(summary.risks) ? summary.risks : [],
      weekly,
      weeklies: Array.isArray(summary.weeklies) ? summary.weeklies : []
    };
  }
  function getInitialWeekKey(context) {
    const fromInitial = context.initialQuery?.parameters?.weekKey;
    const fromPayload = context.payload?.parameters?.weekKey;
    const value = Array.isArray(fromInitial) ? fromInitial[0] : fromInitial || fromPayload;
    return typeof value === "string" && value.trim() ? value.trim() : "";
  }
  function formatDate(value, locale) {
    if (!value) return "";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(locale === "zh_Hans" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }
  function createOperationId() {
    const globalCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : void 0;
    if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
      return globalCrypto.randomUUID();
    }
    return `workbench-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  // src/lib/remote-components/weekly-radar-workbench/src/bridge.ts
  var CHANNEL = "xpertai.remote_component";
  var VERSION = 1;
  var instanceId = null;
  var requestSequence = 0;
  var pending = /* @__PURE__ */ new Map();
  function installBridgeListener(handlers) {
    const listener = (event) => {
      const rawMessage = event.data;
      if (!isObject(rawMessage) || rawMessage.channel !== CHANNEL || rawMessage.protocolVersion !== VERSION) return;
      const message = rawMessage;
      if (message.type === "init") {
        instanceId = typeof message.instanceId === "string" ? message.instanceId : null;
        handlers.onInit({
          manifest: message.manifest,
          payload: message.payload,
          initialQuery: message.initialQuery ?? {},
          locale: message.locale,
          theme: message.theme
        });
        setTimeout(reportResize, 0);
        return;
      }
      if (message.instanceId !== instanceId) return;
      if (message.type === "hostEvent") {
        handlers.onHostEvent();
        return;
      }
      const requestId = typeof message.requestId === "string" ? message.requestId : "";
      if (requestId && pending.has(requestId)) {
        const item = pending.get(requestId);
        pending.delete(requestId);
        if (!item) return;
        if (message.type === "error") {
          item.reject(new Error(typeof message.message === "string" ? message.message : "Remote RADAR request failed"));
        } else {
          item.resolve(message);
        }
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }
  function post(type, body) {
    if (!instanceId && type !== "ready") return;
    window.parent.postMessage(
      {
        channel: CHANNEL,
        protocolVersion: VERSION,
        instanceId,
        type,
        ...body ?? {}
      },
      "*"
    );
  }
  function request(type, body) {
    const requestId = String(++requestSequence);
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      try {
        post(type, { requestId, ...body ?? {} });
      } catch (error) {
        pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  function requestData(query) {
    return request("requestData", { query });
  }
  function executeAction(actionKey, targetId, input, parameters) {
    return request("executeAction", { actionKey, targetId, input, parameters });
  }
  function notify(message, level = "success") {
    post("notify", { message, level });
  }
  function reportResize() {
    const root2 = document.getElementById("root");
    const shell = root2?.firstElementChild;
    const height = Math.max(shell?.scrollHeight ?? 0, 640);
    post("resize", { height: Math.ceil(height), viewportBound: false });
  }

  // src/lib/remote-components/weekly-radar-workbench/src/i18n.ts
  var TEXT = {
    zh_Hans: {
      loading: "\u6B63\u5728\u52A0\u8F7D\u5468\u62A5\u98CE\u9669\u96F7\u8FBE\u2026",
      title: "\u5468\u62A5\u98CE\u9669\u96F7\u8FBE",
      subtitle: "\u6A21\u578B\u53EA\u8D1F\u8D23\u5199\u53D9\u8FF0\uFF0C\u98CE\u9669\u7531\u670D\u52A1\u7AEF\u89C4\u5219\u5224\u5B9A\uFF0C\u6BCF\u6761\u98CE\u9669\u90FD\u53EF\u590D\u7B97\u3001\u53EF\u56DE\u770B\u3002",
      week: "\u5468\u6B21",
      refresh: "\u5237\u65B0",
      entries: "\u672C\u5468\u6761\u76EE",
      risks: "\u98CE\u9669\u96F7\u8FBE",
      report: "\u5468\u62A5",
      addEntry: "\u624B\u5DE5\u65B0\u589E\u6761\u76EE",
      entryTitle: "\u6807\u9898",
      entryTitlePlaceholder: "\u4F8B\u5982\uFF1A\u62A5\u4EF7\u7CFB\u7EDF\u5BF9\u63A5\u7B49\u5BF9\u65B9\u63A5\u53E3\u6587\u6863",
      owner: "\u8D1F\u8D23\u4EBA",
      dueDate: "\u622A\u6B62\u65E5\u671F",
      status: "\u72B6\u6001",
      generate: "\u751F\u6210\u5468\u62A5\u8349\u7A3F",
      confirm: "\u786E\u8BA4\u5E76\u5F52\u6863",
      emptyEntries: "\u672C\u5468\u8FD8\u6CA1\u6709\u6761\u76EE\u3002\u5728\u52A9\u624B\u91CC\u628A\u672C\u5468\u53D1\u751F\u7684\u4E8B\u8BF4\u4E00\u904D\uFF0C\u6216\u5728\u8FD9\u91CC\u624B\u5DE5\u65B0\u589E\u3002",
      emptyRisks: "\u5F53\u524D\u6CA1\u6709\u547D\u4E2D\u89C4\u5219\u7684\u98CE\u9669\u3002\u6240\u6709\u6761\u76EE\u90FD\u95ED\u73AF\uFF0C\u6216\u8FD8\u6CA1\u6709\u8DE8\u5468\u3001\u903E\u671F\u3001\u5F85\u786E\u8BA4\u7684\u8BB0\u5F55\u3002",
      emptyReport: "\u8FD8\u6CA1\u6709\u751F\u6210\u5468\u62A5\u3002\u70B9\u51FB\u300C\u751F\u6210\u5468\u62A5\u8349\u7A3F\u300D\uFF0C\u6570\u5B57\u4E0E\u98CE\u9669\u884C\u7531\u670D\u52A1\u7AEF\u91CD\u7B97\u3002",
      total: "\u6761\u76EE\u603B\u6570",
      open: "\u672A\u95ED\u73AF",
      riskCount: "\u98CE\u9669\u6570",
      highRisk: "\u9AD8\u5371",
      highlights: "\u672C\u5468\u8981\u70B9\uFF08\u52A9\u624B\u64B0\u5199\uFF09",
      nextActions: "\u4E0B\u5468\u52A8\u4F5C\uFF08\u52A9\u624B\u64B0\u5199\uFF09",
      history: "\u5386\u53F2\u5468\u62A5",
      draft: "\u8349\u7A3F",
      confirmed: "\u5DF2\u5F52\u6863",
      ageDays: "\u6EDE\u7559",
      evidence: "\u8BC1\u636E",
      suggestion: "\u5EFA\u8BAE\u52A8\u4F5C",
      save: "\u4FDD\u5B58",
      saving: "\u4FDD\u5B58\u4E2D\u2026",
      loadFailed: "\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u91CD\u8BD5\u3002",
      actionFailed: "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
      noValue: "\u672A\u586B\u5199",
      statusLabels: {
        planned: "\u8BA1\u5212\u4E2D",
        in_progress: "\u8FDB\u884C\u4E2D",
        blocked: "\u53D7\u963B",
        pending_confirm: "\u5F85\u786E\u8BA4",
        ai_failed: "\u5931\u8D25\u672A\u91CD\u8BD5",
        done: "\u5DF2\u5B8C\u6210"
      },
      levelLabels: { high: "\u9AD8\u5371", medium: "\u4E2D\u5371", low: "\u4F4E\u5371" }
    },
    en_US: {
      loading: "Loading the weekly radar\u2026",
      title: "Weekly Radar",
      subtitle: "The model writes the narrative only. Risks are decided by server rules and can be replayed.",
      week: "Week",
      refresh: "Refresh",
      entries: "This week",
      risks: "Risk radar",
      report: "Weekly report",
      addEntry: "Add entry",
      entryTitle: "Title",
      entryTitlePlaceholder: "For example: waiting for the vendor API spec",
      owner: "Owner",
      dueDate: "Due date",
      status: "Status",
      generate: "Generate draft",
      confirm: "Confirm and archive",
      emptyEntries: "No entries for this week yet. Tell the assistant what happened, or add one here.",
      emptyRisks: "No rule matched. Everything is closed, or nothing has aged across a week yet.",
      emptyReport: "No report yet. Generate a draft; numbers and risk rows are recomputed on the server.",
      total: "Entries",
      open: "Not closed",
      riskCount: "Risks",
      highRisk: "High risk",
      highlights: "Highlights (written by the assistant)",
      nextActions: "Next actions (written by the assistant)",
      history: "History",
      draft: "Draft",
      confirmed: "Archived",
      ageDays: "Ageing",
      evidence: "Evidence",
      suggestion: "Suggested action",
      save: "Save",
      saving: "Saving\u2026",
      loadFailed: "Failed to load. Refresh and try again.",
      actionFailed: "Action failed. Please retry.",
      noValue: "Not set",
      statusLabels: {
        planned: "Planned",
        in_progress: "In progress",
        blocked: "Blocked",
        pending_confirm: "Pending confirm",
        ai_failed: "Failed, not retried",
        done: "Done"
      },
      levelLabels: { high: "High", medium: "Medium", low: "Low" }
    }
  };

  // src/lib/remote-components/weekly-radar-workbench/src/vendor.ts
  var React = window.React;
  var ReactDOM = window.ReactDOM;

  // src/lib/remote-components/weekly-radar-workbench/src/components/workbench.tsx
  var { useCallback, useEffect, useMemo, useState } = React;
  var STATUS_ORDER = [
    "planned",
    "in_progress",
    "blocked",
    "pending_confirm",
    "ai_failed",
    "done"
  ];
  var STATUS_DOT = {
    planned: "#9ca3af",
    in_progress: "#2563eb",
    blocked: "#dc2626",
    pending_confirm: "#d97706",
    ai_failed: "#b91c1c",
    done: "#059669"
  };
  var LEVEL_COLOR = {
    high: "#dc2626",
    medium: "#d97706",
    low: "#64748b"
  };
  function WeeklyRadarWorkbench({ context }) {
    const locale = context.locale === "en_US" ? "en_US" : "zh_Hans";
    const t = TEXT[locale];
    const [weekKey, setWeekKey] = useState(getInitialWeekKey(context));
    const [search, setSearch] = useState("");
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    const [draftTitle, setDraftTitle] = useState("");
    const [draftOwner, setDraftOwner] = useState("");
    const [draftDueDate, setDraftDueDate] = useState("");
    const [draftStatus, setDraftStatus] = useState("in_progress");
    const load = useCallback(
      async (options) => {
        if (!options?.silent) setBusy(true);
        try {
          const response = await requestData(buildQuery(context, weekKey, search));
          const next = normalizeRadarData(unwrap(response));
          setData(next);
          if (!weekKey && next.weekKey) setWeekKey(next.weekKey);
          setNotice("");
        } catch {
          setNotice(t.loadFailed);
        } finally {
          if (!options?.silent) setBusy(false);
        }
      },
      [context, search, t.loadFailed, weekKey]
    );
    useEffect(() => {
      load();
    }, [load]);
    useEffect(() => {
      window.__radarReload = () => load({ silent: true });
      return () => {
        window.__radarReload = void 0;
      };
    }, [load]);
    const metrics = data?.metrics ?? null;
    const risks = useMemo(() => data?.risks ?? [], [data]);
    const weekly = data?.weekly ?? null;
    const runAction = async (actionKey, input, targetId) => {
      setBusy(true);
      try {
        await executeAction(actionKey, targetId ?? null, input);
        notify(t.saving === "" ? "" : "\u5DF2\u4FDD\u5B58");
        await load({ silent: true });
        setNotice("");
      } catch {
        setNotice(t.actionFailed);
        notify(t.actionFailed, "error");
      } finally {
        setBusy(false);
      }
    };
    const createEntry = async () => {
      const title = draftTitle.trim();
      if (!title) {
        setNotice(t.entryTitlePlaceholder);
        return;
      }
      await runAction(
        "create_entry",
        {
          title,
          owner: draftOwner.trim() || void 0,
          dueDate: draftDueDate || void 0,
          status: draftStatus,
          weekKey: weekKey || void 0,
          operationId: createOperationId()
        }
      );
      setDraftTitle("");
      setDraftOwner("");
      setDraftDueDate("");
    };
    const updateStatus = async (entry, status) => {
      if (status === entry.status) return;
      await runAction("update_entry", { status }, entry.id);
    };
    if (!data) {
      return /* @__PURE__ */ React.createElement("main", { className: "radar-shell" }, /* @__PURE__ */ React.createElement("div", { className: "radar-loading" }, t.loading));
    }
    return /* @__PURE__ */ React.createElement("main", { className: "radar-shell" }, /* @__PURE__ */ React.createElement("header", { className: "radar-header" }, /* @__PURE__ */ React.createElement("div", { className: "radar-title" }, /* @__PURE__ */ React.createElement("h1", null, t.title), /* @__PURE__ */ React.createElement("p", null, t.subtitle)), /* @__PURE__ */ React.createElement("div", { className: "radar-header-actions" }, /* @__PURE__ */ React.createElement("label", { className: "radar-header-actions" }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "#6b7280" } }, t.week), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "radar-input",
        value: weekKey,
        placeholder: "2026-W45",
        onChange: (event) => setWeekKey(event.target.value)
      }
    )), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "radar-input",
        value: search,
        placeholder: t.entries,
        onChange: (event) => setSearch(event.target.value)
      }
    ), /* @__PURE__ */ React.createElement("button", { className: "radar-button", disabled: busy, onClick: () => load() }, t.refresh))), notice ? /* @__PURE__ */ React.createElement("div", { className: "radar-notice" }, notice) : null, /* @__PURE__ */ React.createElement("section", { className: "radar-metrics" }, /* @__PURE__ */ React.createElement("div", { className: "radar-metric" }, /* @__PURE__ */ React.createElement("span", null, t.total), /* @__PURE__ */ React.createElement("strong", null, metrics?.total ?? 0)), /* @__PURE__ */ React.createElement("div", { className: "radar-metric" }, /* @__PURE__ */ React.createElement("span", null, t.open), /* @__PURE__ */ React.createElement("strong", null, metrics?.openEntries ?? 0)), /* @__PURE__ */ React.createElement("div", { className: "radar-metric" }, /* @__PURE__ */ React.createElement("span", null, t.riskCount), /* @__PURE__ */ React.createElement("strong", null, metrics?.riskCount ?? 0)), /* @__PURE__ */ React.createElement("div", { className: "radar-metric is-high" }, /* @__PURE__ */ React.createElement("span", null, t.highRisk), /* @__PURE__ */ React.createElement("strong", null, metrics?.highRiskCount ?? 0))), /* @__PURE__ */ React.createElement("section", { className: "radar-columns" }, /* @__PURE__ */ React.createElement("div", { className: "radar-panel" }, /* @__PURE__ */ React.createElement("h2", null, t.entries, /* @__PURE__ */ React.createElement("small", null, data.total)), /* @__PURE__ */ React.createElement("div", { className: "radar-form" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        value: draftTitle,
        placeholder: t.entryTitlePlaceholder,
        onChange: (event) => setDraftTitle(event.target.value)
      }
    ), /* @__PURE__ */ React.createElement(
      "input",
      {
        value: draftOwner,
        placeholder: t.owner,
        onChange: (event) => setDraftOwner(event.target.value)
      }
    ), /* @__PURE__ */ React.createElement(
      "input",
      {
        value: draftDueDate,
        placeholder: t.dueDate,
        onChange: (event) => setDraftDueDate(event.target.value)
      }
    ), /* @__PURE__ */ React.createElement("button", { className: "radar-button is-primary", disabled: busy, onClick: createEntry }, t.addEntry)), data.entries.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "radar-empty" }, t.emptyEntries) : /* @__PURE__ */ React.createElement("table", { className: "radar-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", null, t.entryTitle), /* @__PURE__ */ React.createElement("th", null, t.status), /* @__PURE__ */ React.createElement("th", null, t.owner), /* @__PURE__ */ React.createElement("th", null, t.dueDate), /* @__PURE__ */ React.createElement("th", null, t.ageDays))), /* @__PURE__ */ React.createElement("tbody", null, data.entries.map((entry) => /* @__PURE__ */ React.createElement("tr", { key: entry.id }, /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("strong", null, entry.title), /* @__PURE__ */ React.createElement("small", null, entry.evidenceRef ?? t.noValue)), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("span", { className: "radar-status", style: { ["--dot"]: STATUS_DOT[entry.status] } }, /* @__PURE__ */ React.createElement("span", null), t.statusLabels[entry.status]), /* @__PURE__ */ React.createElement(
      "select",
      {
        className: "radar-select",
        style: { marginTop: 6, width: "100%" },
        value: entry.status,
        disabled: busy,
        onChange: (event) => updateStatus(entry, event.target.value)
      },
      STATUS_ORDER.map((status) => /* @__PURE__ */ React.createElement("option", { key: status, value: status }, t.statusLabels[status]))
    )), /* @__PURE__ */ React.createElement("td", null, entry.owner ?? t.noValue), /* @__PURE__ */ React.createElement("td", null, entry.dueDate ?? t.noValue), /* @__PURE__ */ React.createElement("td", null, entry.ageDays, "d")))))), /* @__PURE__ */ React.createElement("div", { className: "radar-panel" }, /* @__PURE__ */ React.createElement("h2", null, t.risks, /* @__PURE__ */ React.createElement("small", null, risks.length)), risks.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "radar-empty" }, t.emptyRisks) : risks.map((risk) => /* @__PURE__ */ React.createElement(RiskCard, { key: risk.id, risk, t })))), /* @__PURE__ */ React.createElement("section", { className: "radar-panel" }, /* @__PURE__ */ React.createElement("h2", null, t.report, /* @__PURE__ */ React.createElement("span", { style: { display: "flex", gap: 8, alignItems: "center" } }, weekly ? /* @__PURE__ */ React.createElement("span", { className: `radar-badge ${weekly.status === "confirmed" ? "is-confirmed" : "is-draft"}` }, weekly.status === "confirmed" ? t.confirmed : t.draft) : null, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "radar-button",
        disabled: busy,
        onClick: () => runAction("generate_weekly", { weekKey: weekKey || data.weekKey })
      },
      t.generate
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "radar-button is-primary",
        disabled: busy || !weekly || weekly.status === "confirmed",
        onClick: () => runAction("confirm_weekly", { weekKey: weekKey || data.weekKey })
      },
      t.confirm
    ))), !weekly ? /* @__PURE__ */ React.createElement("div", { className: "radar-empty" }, t.emptyReport) : /* @__PURE__ */ React.createElement("div", { className: "radar-report" }, /* @__PURE__ */ React.createElement("div", { className: "radar-report-block" }, /* @__PURE__ */ React.createElement("h3", null, t.highlights), /* @__PURE__ */ React.createElement("p", null, weekly.highlights ?? t.noValue)), /* @__PURE__ */ React.createElement("div", { className: "radar-report-block" }, /* @__PURE__ */ React.createElement("h3", null, t.nextActions), /* @__PURE__ */ React.createElement("p", null, weekly.nextActions ?? t.noValue)), /* @__PURE__ */ React.createElement("div", { className: "radar-report-block" }, /* @__PURE__ */ React.createElement("h3", null, t.risks), /* @__PURE__ */ React.createElement("p", null, (weekly.risks ?? []).length === 0 ? t.emptyRisks : (weekly.risks ?? []).map((risk) => `[${t.levelLabels[risk.level]}] ${risk.title} \xB7 ${risk.reasons.join(" / ")}`).join("\n"))), /* @__PURE__ */ React.createElement("div", { className: "radar-report-block" }, /* @__PURE__ */ React.createElement("h3", null, t.history), /* @__PURE__ */ React.createElement("p", null, data.weeklies.length === 0 ? t.noValue : data.weeklies.map((item) => `${item.weekKey} \xB7 ${item.status === "confirmed" ? t.confirmed : t.draft} \xB7 ${formatDate(item.updatedAt, locale)}`).join("\n"))))));
  }
  function RiskCard({ risk, t }) {
    return /* @__PURE__ */ React.createElement("article", { className: "radar-risk", style: { ["--level"]: LEVEL_COLOR[risk.level] ?? LEVEL_COLOR.low } }, /* @__PURE__ */ React.createElement("header", null, /* @__PURE__ */ React.createElement("strong", null, risk.title), /* @__PURE__ */ React.createElement("span", { className: "radar-badge" }, t.levelLabels[risk.level])), /* @__PURE__ */ React.createElement("p", null, risk.detail), /* @__PURE__ */ React.createElement("dl", null, /* @__PURE__ */ React.createElement("dt", null, t.ageDays), /* @__PURE__ */ React.createElement("dd", null, risk.ageDays, "d"), /* @__PURE__ */ React.createElement("dt", null, t.evidence), /* @__PURE__ */ React.createElement("dd", null, risk.evidenceRefs.length ? risk.evidenceRefs.join("\u3001") : t.noValue), /* @__PURE__ */ React.createElement("dt", null, t.suggestion), /* @__PURE__ */ React.createElement("dd", null, risk.suggestion)));
  }

  // src/lib/remote-components/weekly-radar-workbench/src/styles.ts
  function injectStyles() {
    if (document.getElementById("weekly-radar-styles")) return;
    const style = document.createElement("style");
    style.id = "weekly-radar-styles";
    style.textContent = `
    :root {
      color-scheme: light;
      --radar-panel: #ffffff;
      --radar-bg: #f7f8fa;
      --radar-text: #1f2937;
      --radar-muted: #6b7280;
      --radar-soft: #9ca3af;
      --radar-border: #e5e7eb;
      --radar-primary: var(--primary, var(--xui-color-primary, #2563eb));
      --radar-high: #dc2626;
      --radar-medium: #d97706;
      --radar-low: #64748b;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--radar-bg); color: var(--radar-text); }
    body, button, input, select, textarea { font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    .radar-shell { min-height: 640px; display: grid; grid-template-rows: auto 1fr; gap: 12px; padding: 16px; background: var(--radar-bg); }
    .radar-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .radar-title h1 { margin: 0; font-size: 18px; font-weight: 750; color: #111827; }
    .radar-title p { margin: 6px 0 0; font-size: 12px; color: var(--radar-muted); max-width: 640px; }
    .radar-header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .radar-input, .radar-select { height: 32px; border: 1px solid var(--radar-border); border-radius: 6px; padding: 0 8px; font-size: 13px; color: var(--radar-text); background: #fff; }
    .radar-button { height: 32px; border: 1px solid var(--radar-border); background: #fff; border-radius: 6px; padding: 0 12px; font-size: 13px; font-weight: 600; color: #374151; cursor: pointer; }
    .radar-button:hover { background: #f3f4f6; }
    .radar-button:disabled { opacity: 0.55; cursor: not-allowed; }
    .radar-button.is-primary { background: var(--radar-primary); border-color: var(--radar-primary); color: #fff; }
    .radar-notice { border: 1px solid #f2c94c; background: #fffbeb; color: #7a4d00; padding: 8px 10px; border-radius: 6px; font-size: 13px; }
    .radar-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
    .radar-metric { background: var(--radar-panel); border: 1px solid var(--radar-border); border-radius: 8px; padding: 12px; }
    .radar-metric span { display: block; font-size: 12px; color: var(--radar-muted); }
    .radar-metric strong { display: block; margin-top: 4px; font-size: 22px; font-weight: 750; color: #111827; }
    .radar-metric.is-high strong { color: var(--radar-high); }
    .radar-columns { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 12px; align-items: start; }
    .radar-panel { background: var(--radar-panel); border: 1px solid var(--radar-border); border-radius: 8px; padding: 14px; min-width: 0; }
    .radar-panel h2 { margin: 0 0 10px; font-size: 14px; font-weight: 750; color: #111827; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .radar-panel h2 small { font-weight: 600; color: var(--radar-soft); font-size: 12px; }
    .radar-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .radar-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--radar-soft); font-weight: 700; padding: 6px 8px; border-bottom: 1px solid var(--radar-border); }
    .radar-table td { padding: 8px; border-bottom: 1px solid #f1f2f4; color: #374151; vertical-align: top; }
    .radar-table td strong { color: #111827; font-weight: 650; display: block; }
    .radar-table td small { color: var(--radar-soft); font-size: 11px; }
    .radar-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 650; }
    .radar-status span { width: 7px; height: 7px; border-radius: 50%; background: var(--dot, #9ca3af); }
    .radar-risk { border: 1px solid var(--radar-border); border-left: 3px solid var(--level, #9ca3af); border-radius: 6px; padding: 10px; margin-bottom: 8px; }
    .radar-risk header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .radar-risk header strong { font-size: 13px; color: #111827; }
    .radar-risk p { margin: 6px 0; font-size: 12px; color: #4b5563; line-height: 1.55; }
    .radar-risk dl { margin: 6px 0 0; display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 4px 8px; font-size: 12px; }
    .radar-risk dt { color: var(--radar-soft); font-weight: 650; }
    .radar-risk dd { margin: 0; color: #4b5563; }
    .radar-empty { padding: 18px; border: 1px dashed var(--radar-border); border-radius: 6px; color: var(--radar-muted); font-size: 13px; text-align: center; }
    .radar-form { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto; gap: 8px; align-items: center; margin-bottom: 12px; }
    .radar-form input, .radar-form select { height: 32px; border: 1px solid var(--radar-border); border-radius: 6px; padding: 0 8px; font-size: 13px; }
    .radar-report { display: grid; gap: 10px; }
    .radar-report-block { border: 1px solid var(--radar-border); border-radius: 6px; padding: 10px; }
    .radar-report-block h3 { margin: 0 0 6px; font-size: 12px; color: var(--radar-muted); font-weight: 700; }
    .radar-report-block p { margin: 0; font-size: 13px; color: #374151; white-space: pre-wrap; line-height: 1.6; }
    .radar-badge { display: inline-flex; align-items: center; gap: 4px; border-radius: 10px; padding: 1px 8px; font-size: 11px; font-weight: 700; background: #f3f4f6; color: #4b5563; }
    .radar-badge.is-draft { background: #fff7ed; color: #b45309; }
    .radar-badge.is-confirmed { background: #ecfdf5; color: #047857; }
    .radar-loading { min-height: 320px; display: flex; align-items: center; justify-content: center; color: var(--radar-muted); }
    @media (max-width: 980px) {
      .radar-columns { grid-template-columns: minmax(0, 1fr); }
      .radar-form { grid-template-columns: minmax(0, 1fr); }
    }
  `;
    document.head.appendChild(style);
  }

  // src/lib/remote-components/weekly-radar-workbench/src/main.tsx
  var { useEffect: useEffect2, useState: useState2 } = React;
  injectStyles();
  function App() {
    const [context, setContext] = useState2(null);
    useEffect2(() => {
      const disposeBridge = installBridgeListener({
        onInit: setContext,
        onHostEvent: () => window.__radarReload?.()
      });
      post("ready");
      return disposeBridge;
    }, []);
    useEffect2(() => {
      const root2 = document.getElementById("root");
      if (!root2 || typeof ResizeObserver === "undefined") return void 0;
      const observer = new ResizeObserver(() => setTimeout(reportResize, 0));
      observer.observe(root2);
      return () => observer.disconnect();
    }, []);
    useEffect2(() => {
      setTimeout(reportResize, 0);
    });
    if (!context) {
      return /* @__PURE__ */ React.createElement("main", { className: "radar-shell" }, /* @__PURE__ */ React.createElement("div", { className: "radar-loading" }, TEXT.zh_Hans.loading));
    }
    return /* @__PURE__ */ React.createElement(WeeklyRadarWorkbench, { context });
  }
  var rootElement = document.getElementById("root");
  var root = ReactDOM.createRoot ? ReactDOM.createRoot(rootElement) : null;
  if (root) {
    root.render(/* @__PURE__ */ React.createElement(App, null));
  } else {
    ReactDOM.render?.(/* @__PURE__ */ React.createElement(App, null), rootElement);
  }
})();
