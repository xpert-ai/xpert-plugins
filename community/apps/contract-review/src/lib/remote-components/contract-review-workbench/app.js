"use strict";
var XpertContractReviewWorkbench = (() => {
  // src/lib/remote-components/contract-review-workbench/src/utils.ts
  function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function asObject(value) {
    return isObject(value) ? value : null;
  }
  function asString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
  }
  function asNumber(value, fallback = 0) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }
  function asBoolean(value, fallback = false) {
    return typeof value === "boolean" ? value : fallback;
  }
  function formatDateTime(value) {
    if (!value) return "\u2014";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "\u2014";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
      date.getMinutes()
    )}`;
  }
  function truncate(value, max = 120) {
    const text = value.trim();
    return text.length <= max ? text : `${text.slice(0, max)}\u2026`;
  }

  // src/lib/remote-components/contract-review-workbench/src/bridge.ts
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
          manifest: isObject(message.manifest) ? message.manifest : void 0,
          payload: message.payload,
          initialQuery: isObject(message.initialQuery) ? message.initialQuery : {},
          locale: typeof message.locale === "string" ? message.locale : void 0,
          theme: typeof message.theme === "string" ? message.theme : void 0
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
          item.reject(
            new Error(typeof message.message === "string" ? message.message : "Remote contract review request failed")
          );
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
  function invokeClientCommand(commandKey, payload) {
    return request("invokeClientCommand", { commandKey, payload });
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

  // src/lib/remote-components/contract-review-workbench/src/styles.ts
  function injectStyles() {
    if (document.getElementById("contract-review-workbench-styles")) return;
    const style = document.createElement("style");
    style.id = "contract-review-workbench-styles";
    style.textContent = `
    :root {
      color-scheme: light;
      --crx-panel: #ffffff;
      --crx-sidebar: #f6f7f9;
      --crx-text: #1f2937;
      --crx-muted: #6b7280;
      --crx-border: #e5e7eb;
      --crx-hover: #f3f4f6;
      --crx-primary: #1d4ed8;
      --crx-high: #dc2626;
      --crx-medium: #d97706;
      --crx-low: #059669;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--crx-panel); color: var(--crx-text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      font-size: 13px; }
    .crx-shell { display: flex; min-height: 640px; background: var(--crx-panel); }
    .crx-sidebar { width: 268px; flex: 0 0 268px; border-right: 1px solid var(--crx-border); background: var(--crx-sidebar);
      display: flex; flex-direction: column; }
    .crx-sidebar-head { padding: 12px; border-bottom: 1px solid var(--crx-border); }
    .crx-sidebar-title { font-weight: 600; font-size: 13px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    .crx-list { flex: 1; overflow-y: auto; padding: 6px; }
    .crx-item { padding: 9px 10px; border-radius: 6px; cursor: pointer; margin-bottom: 4px; border: 1px solid transparent; }
    .crx-item:hover { background: var(--crx-hover); }
    .crx-item-active { background: #fff; border-color: var(--crx-primary); }
    .crx-item-title { font-weight: 500; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .crx-item-meta { font-size: 11px; color: var(--crx-muted); display: flex; gap: 6px; align-items: center; }
    .crx-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .crx-main-head { padding: 14px 18px; border-bottom: 1px solid var(--crx-border); }
    .crx-main-title { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
    .crx-main-sub { font-size: 12px; color: var(--crx-muted); display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .crx-body { flex: 1; overflow-y: auto; padding: 16px 18px; }
    .crx-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .crx-btn { border: 1px solid var(--crx-border); background: #fff; color: var(--crx-text); border-radius: 6px;
      padding: 5px 12px; font-size: 12px; cursor: pointer; font-family: inherit; }
    .crx-btn:hover:not(:disabled) { background: var(--crx-hover); }
    .crx-btn:disabled { opacity: .5; cursor: not-allowed; }
    .crx-btn-primary { background: var(--crx-primary); border-color: var(--crx-primary); color: #fff; }
    .crx-btn-primary:hover:not(:disabled) { background: #1a43b8; }
    .crx-btn-sm { padding: 3px 9px; font-size: 11px; }
    .crx-badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 11px; line-height: 17px; }
    .crx-badge-high { background: #fee2e2; color: var(--crx-high); }
    .crx-badge-medium { background: #fef3c7; color: var(--crx-medium); }
    .crx-badge-low { background: #d1fae5; color: var(--crx-low); }
    .crx-badge-neutral { background: #e5e7eb; color: #4b5563; }
    .crx-badge-info { background: #dbeafe; color: var(--crx-primary); }
    .crx-badge-ok { background: #d1fae5; color: var(--crx-low); }
    .crx-clause { border: 1px solid var(--crx-border); border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
    .crx-clause-head { display: flex; justify-content: space-between; align-items: center; gap: 10px;
      padding: 9px 12px; background: #fafbfc; border-bottom: 1px solid var(--crx-border); }
    .crx-clause-name { font-weight: 600; }
    .crx-clause-body { padding: 12px; }
    .crx-section-label { font-size: 11px; color: var(--crx-muted); margin-bottom: 4px; letter-spacing: .3px; }
    .crx-quote { border-left: 3px solid #cbd5e1; background: #f8fafc; padding: 8px 10px; border-radius: 0 6px 6px 0;
      white-space: pre-wrap; line-height: 1.6; margin-bottom: 12px; }
    .crx-ai { background: #eff6ff; border-radius: 6px; padding: 9px 11px; margin-bottom: 12px; line-height: 1.6; }
    .crx-ai-reason { color: var(--crx-muted); margin-top: 5px; }
    .crx-human { border-top: 1px dashed var(--crx-border); padding-top: 11px; }
    .crx-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
    .crx-input, .crx-textarea { width: 100%; border: 1px solid var(--crx-border); border-radius: 6px; padding: 6px 9px;
      font-family: inherit; font-size: 12px; color: var(--crx-text); background: #fff; }
    .crx-textarea { resize: vertical; min-height: 54px; line-height: 1.6; }
    .crx-field { margin-bottom: 10px; }
    .crx-empty { padding: 48px 20px; text-align: center; color: var(--crx-muted); }
    .crx-banner { border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; line-height: 1.6; }
    .crx-banner-error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    .crx-banner-info { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
    .crx-footer { border-top: 1px solid var(--crx-border); padding: 11px 18px; display: flex; justify-content: space-between;
      align-items: center; gap: 12px; background: #fafbfc; flex-wrap: wrap; }
    .crx-progress { font-size: 12px; color: var(--crx-muted); }
    .crx-progress b { color: var(--crx-text); }
    .crx-modal-mask { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: flex; align-items: center;
      justify-content: center; padding: 24px; z-index: 50; }
    .crx-modal { background: #fff; border-radius: 10px; width: 100%; max-width: 620px; max-height: 86vh; overflow-y: auto; padding: 18px; }
    .crx-modal h3 { margin: 0 0 14px; font-size: 15px; }
    .crx-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
    .crx-spin { display: inline-block; width: 11px; height: 11px; border: 2px solid #c7d2fe; border-top-color: var(--crx-primary);
      border-radius: 50%; animation: crx-spin .8s linear infinite; vertical-align: -1px; margin-right: 5px; }
    @keyframes crx-spin { to { transform: rotate(360deg); } }
    .crx-decision-active { border-color: var(--crx-primary); background: #eff6ff; color: var(--crx-primary); font-weight: 600; }
  `;
    document.head.appendChild(style);
  }

  // src/lib/remote-components/contract-review-workbench/src/vendor.ts
  var React = window.React;
  var ReactDOM = window.ReactDOM;

  // src/lib/remote-components/contract-review-workbench/src/main.tsx
  var { useCallback, useEffect, useMemo, useState } = React;
  var ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = "assistant.chat.send_message";
  var CLAUSE_LABELS = {
    payment: "\u4ED8\u6B3E\u6761\u4EF6",
    delivery: "\u4EA4\u4ED8",
    warranty: "\u8D28\u4FDD",
    liability: "\u8FDD\u7EA6\u8D23\u4EFB"
  };
  var RISK_LABELS = { high: "\u9AD8\u98CE\u9669", medium: "\u4E2D\u98CE\u9669", low: "\u4F4E\u98CE\u9669" };
  var STATUS_LABELS = {
    draft: "\u5F85\u5BA1\u67E5",
    extracting: "AI \u5BA1\u67E5\u4E2D",
    extracted: "\u5F85\u4EBA\u5DE5\u786E\u8BA4",
    confirmed: "\u5DF2\u5B8C\u6210"
  };
  var DECISION_LABELS = {
    pending: "\u5F85\u5904\u7406",
    confirmed: "\u5DF2\u786E\u8BA4",
    edited: "\u5DF2\u4FEE\u6539",
    rejected: "\u5DF2\u9A73\u56DE"
  };
  injectStyles();
  function App() {
    const [context, setContext] = useState(null);
    useEffect(() => {
      const dispose = installBridgeListener({
        onInit: setContext,
        onHostEvent: () => window.__contractReviewReload?.()
      });
      post("ready");
      return dispose;
    }, []);
    useEffect(() => {
      const root2 = document.getElementById("root");
      if (!root2 || typeof ResizeObserver === "undefined") return void 0;
      const observer = new ResizeObserver(() => setTimeout(reportResize, 0));
      observer.observe(root2);
      return () => observer.disconnect();
    }, []);
    useEffect(() => {
      setTimeout(reportResize, 0);
    });
    if (!context) {
      return /* @__PURE__ */ React.createElement("main", { className: "crx-shell" }, /* @__PURE__ */ React.createElement("div", { className: "crx-empty" }, "\u6B63\u5728\u52A0\u8F7D\u5408\u540C\u6761\u6B3E\u5BA1\u67E5\u53F0\u2026"));
    }
    return /* @__PURE__ */ React.createElement(Workbench, null);
  }
  function Workbench() {
    const [data, setData] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [drafts, setDrafts] = useState({});
    const [busy, setBusy] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState(null);
    const load = useCallback(async (caseId) => {
      try {
        const response = await requestData(caseId ? { parameters: { caseId } } : {});
        const payload = asObject(response.data) ?? asObject(response.result);
        if (!payload) return;
        const view = normalizeViewData(payload);
        setData(view);
        setSelectedId((current) => {
          if (caseId) return caseId;
          return current ?? view.selected?.id ?? null;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "\u52A0\u8F7D\u5931\u8D25");
      }
    }, []);
    useEffect(() => {
      window.__contractReviewReload = () => void load(selectedId);
      void load(null);
      return () => {
        delete window.__contractReviewReload;
      };
    }, []);
    const selected = useMemo(() => {
      if (!data?.selected) return null;
      if (selectedId && data.selected.id !== selectedId) return null;
      return data.selected;
    }, [data, selectedId]);
    const selectCase = async (caseId) => {
      setSelectedId(caseId);
      setDrafts({});
      setError(null);
      await load(caseId);
    };
    const run = async (fn) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "\u64CD\u4F5C\u5931\u8D25");
      } finally {
        setBusy(false);
      }
    };
    const handleCreate = (input) => run(async () => {
      const response = await executeAction("create_case", null, input);
      const result = asObject(response.result);
      if (result && result.success === false) throw new Error(messageOf(result));
      notify("\u5BA1\u67E5\u5355\u5DF2\u521B\u5EFA");
      setCreating(false);
      await load(null);
    });
    const handleExtraction = (caseId) => run(async () => {
      const response = await executeAction("begin_extraction", caseId, { caseId });
      const result = asObject(response.result);
      if (result && result.success === false) throw new Error(messageOf(result));
      const clientCommand = asObject(asObject(result?.data)?.clientCommand);
      if (clientCommand) {
        const commandKey = asString(clientCommand.commandKey);
        const payload = asObject(clientCommand.payload);
        if (commandKey === ASSISTANT_CHAT_SEND_MESSAGE_COMMAND && payload) {
          await invokeClientCommand(commandKey, {
            ...payload,
            clientMessageId: `contract-review:${caseId}:${Date.now()}`
          });
          notify("\u5DF2\u628A\u5BA1\u67E5\u8BF7\u6C42\u53D1\u7ED9 Agent\uFF0C\u6761\u6B3E\u4F1A\u8FB9\u62BD\u8FB9\u5199\u5165");
        } else {
          throw new Error("\u5BBF\u4E3B\u672A\u63A5\u53D7\u53D1\u9001\u6307\u4EE4");
        }
      }
      await load(caseId);
    });
    const handleSave = (caseId, clauses, allowPartial) => run(async () => {
      const decisions = clauses.map((clause) => {
        const draft = drafts[clause.id];
        return {
          clauseId: clause.id,
          decision: draft?.decision ?? clause.humanDecision,
          conclusion: draft?.conclusion ?? null,
          note: draft?.note ?? null
        };
      });
      const response = await executeAction("save_review", caseId, { caseId, decisions, allowPartial });
      const result = asObject(response.result);
      if (result && result.success === false) throw new Error(messageOf(result));
      const payload = asObject(result?.data);
      const saved = asBoolean(payload?.saved, true);
      if (!saved) {
        setError(asString(payload?.message, "\u8FD8\u6709\u6761\u6B3E\u672A\u5904\u7F6E"));
        await load(caseId);
        return;
      }
      notify(asString(payload?.message, "\u5BA1\u67E5\u7ED3\u8BBA\u5DF2\u4FDD\u5B58"));
      setDrafts({});
      await load(caseId);
    });
    const handleDelete = (caseId) => run(async () => {
      const response = await executeAction("delete_case", caseId, { caseId });
      const result = asObject(response.result);
      if (result && result.success === false) throw new Error(messageOf(result));
      notify("\u5BA1\u67E5\u5355\u5DF2\u5220\u9664");
      setSelectedId(null);
      setDrafts({});
      await load(null);
    });
    const cases = data?.list.items ?? [];
    return /* @__PURE__ */ React.createElement("div", { className: "crx-shell" }, /* @__PURE__ */ React.createElement("aside", { className: "crx-sidebar" }, /* @__PURE__ */ React.createElement("div", { className: "crx-sidebar-head" }, /* @__PURE__ */ React.createElement("div", { className: "crx-sidebar-title" }, /* @__PURE__ */ React.createElement("span", null, "\u5408\u540C\u5BA1\u67E5\u5355"), /* @__PURE__ */ React.createElement("button", { className: "crx-btn crx-btn-sm", disabled: busy, onClick: () => setCreating(true) }, "\u65B0\u5EFA\u5BA1\u67E5"))), /* @__PURE__ */ React.createElement("div", { className: "crx-list" }, cases.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "crx-empty" }, "\u8FD8\u6CA1\u6709\u5BA1\u67E5\u5355\u3002\u70B9\u300C\u65B0\u5EFA\u5BA1\u67E5\u300D\u7C98\u8D34\u4E00\u4EFD\u5408\u540C\u5F00\u59CB\u3002"), cases.map((item) => /* @__PURE__ */ React.createElement(
      "div",
      {
        key: item.id,
        className: `crx-item ${item.id === selectedId ? "crx-item-active" : ""}`,
        onClick: () => void selectCase(item.id)
      },
      /* @__PURE__ */ React.createElement("div", { className: "crx-item-title" }, item.title),
      /* @__PURE__ */ React.createElement("div", { className: "crx-item-meta" }, /* @__PURE__ */ React.createElement(StatusBadge, { status: item.status }), /* @__PURE__ */ React.createElement("span", null, "\u5DF2\u786E\u8BA4 ", item.clauseCount - item.pendingCount, "/", item.clauseCount))
    )))), /* @__PURE__ */ React.createElement("section", { className: "crx-main" }, error && /* @__PURE__ */ React.createElement("div", { style: { padding: "12px 18px 0" } }, /* @__PURE__ */ React.createElement("div", { className: "crx-banner crx-banner-error" }, error)), !selected ? /* @__PURE__ */ React.createElement("div", { className: "crx-empty" }, cases.length ? "\u4ECE\u5DE6\u4FA7\u9009\u62E9\u4E00\u5F20\u5BA1\u67E5\u5355\u67E5\u770B\u7ED3\u8BBA\u3002" : "\u7C98\u8D34\u4E00\u4EFD\u5408\u540C\uFF0C\u8BA9 AI \u5148\u62BD\u51FA\u56DB\u7C7B\u5173\u952E\u6761\u6B3E\uFF0C\u518D\u7531\u4F60\u9010\u6761\u786E\u8BA4\u3002") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("header", { className: "crx-main-head" }, /* @__PURE__ */ React.createElement("h2", { className: "crx-main-title" }, selected.title), /* @__PURE__ */ React.createElement("div", { className: "crx-main-sub" }, /* @__PURE__ */ React.createElement(StatusBadge, { status: selected.status }), selected.counterparty && /* @__PURE__ */ React.createElement("span", null, "\u76F8\u5BF9\u65B9\uFF1A", selected.counterparty), /* @__PURE__ */ React.createElement("span", null, "\u5BA1\u67E5\u5C1D\u8BD5 ", selected.extractionAttempts, " \u6B21"), selected.lastExtractionAt && /* @__PURE__ */ React.createElement("span", null, "\u4E0A\u6B21\uFF1A", formatDateTime(selected.lastExtractionAt)), selected.confirmedAt && /* @__PURE__ */ React.createElement("span", null, "\u843D\u5E93\uFF1A", formatDateTime(selected.confirmedAt))), /* @__PURE__ */ React.createElement("div", { className: "crx-toolbar", style: { marginTop: 10 } }, /* @__PURE__ */ React.createElement("button", { className: "crx-btn crx-btn-primary", disabled: busy, onClick: () => void handleExtraction(selected.id) }, busy && /* @__PURE__ */ React.createElement("span", { className: "crx-spin" }), selected.extractionAttempts > 0 ? "\u91CD\u8BD5 AI \u5BA1\u67E5" : "\u8BA9 Agent \u5BA1\u67E5"), /* @__PURE__ */ React.createElement("button", { className: "crx-btn", disabled: busy, onClick: () => void load(selected.id) }, "\u5237\u65B0"), /* @__PURE__ */ React.createElement("button", { className: "crx-btn", disabled: busy, onClick: () => void handleDelete(selected.id) }, "\u5220\u9664\u5BA1\u67E5\u5355"))), /* @__PURE__ */ React.createElement("div", { className: "crx-body" }, selected.lastExtractionError && /* @__PURE__ */ React.createElement("div", { className: "crx-banner crx-banner-error" }, "\u672C\u8F6E AI \u5BA1\u67E5\u672A\u6210\u529F\uFF1A", selected.lastExtractionError, /* @__PURE__ */ React.createElement("br", null), "\u5408\u540C\u6B63\u6587\u4E0E\u5DF2\u767B\u8BB0\u7684\u6761\u6B3E\u90FD\u8FD8\u5728\uFF0C\u76F4\u63A5\u70B9\u300C\u91CD\u8BD5 AI \u5BA1\u67E5\u300D\u5373\u53EF\u3002"), selected.status === "extracting" && /* @__PURE__ */ React.createElement("div", { className: "crx-banner crx-banner-info" }, "Agent \u6B63\u5728\u9605\u8BFB\u5408\u540C\u5E76\u9010\u6761\u767B\u8BB0\uFF0C\u6761\u6B3E\u51FA\u73B0\u540E\u4F1A\u81EA\u52A8\u5237\u65B0\u3002\u82E5\u957F\u65F6\u95F4\u65E0\u53D8\u5316\uFF0C\u53EF\u70B9\u300C\u5237\u65B0\u300D\u3002"), !selected.clauses?.length ? /* @__PURE__ */ React.createElement("div", { className: "crx-empty" }, "AI \u8FD8\u6CA1\u6709\u767B\u8BB0\u4EFB\u4F55\u6761\u6B3E\u3002", /* @__PURE__ */ React.createElement("br", null), "\u70B9\u4E0A\u65B9\u300C\u8BA9 Agent \u5BA1\u67E5\u300D\uFF0C\u5B83\u4F1A\u8BFB\u53D6\u5408\u540C\u5168\u6587\u5E76\u62BD\u51FA\u4ED8\u6B3E\u3001\u4EA4\u4ED8\u3001\u8D28\u4FDD\u3001\u8FDD\u7EA6\u56DB\u7C7B\u6761\u6B3E\u3002") : selected.clauses.map((clause) => /* @__PURE__ */ React.createElement(
      ClauseCard,
      {
        key: clause.id,
        clause,
        disabled: busy,
        draft: drafts[clause.id],
        onChange: (next) => setDrafts((current) => ({ ...current, [clause.id]: next }))
      }
    )), /* @__PURE__ */ React.createElement("details", null, /* @__PURE__ */ React.createElement("summary", { style: { cursor: "pointer", color: "var(--crx-muted)", fontSize: 12 } }, "\u67E5\u770B\u5408\u540C\u539F\u6587"), /* @__PURE__ */ React.createElement("div", { className: "crx-quote", style: { marginTop: 8, whiteSpace: "pre-wrap" } }, selected.contractText))), /* @__PURE__ */ React.createElement("footer", { className: "crx-footer" }, /* @__PURE__ */ React.createElement("div", { className: "crx-progress" }, (() => {
      const stats = computeStats(selected.clauses ?? [], drafts);
      return /* @__PURE__ */ React.createElement(React.Fragment, null, "\u5171 ", /* @__PURE__ */ React.createElement("b", null, stats.total), " \u6761 \xB7 \u5DF2\u786E\u8BA4 ", /* @__PURE__ */ React.createElement("b", null, stats.confirmed), " \xB7 \u5DF2\u4FEE\u6539 ", /* @__PURE__ */ React.createElement("b", null, stats.edited), " \xB7 \u5DF2\u9A73\u56DE", " ", /* @__PURE__ */ React.createElement("b", null, stats.rejected), " \xB7 \u5F85\u5904\u7406 ", /* @__PURE__ */ React.createElement("b", { style: { color: stats.pending ? "var(--crx-high)" : void 0 } }, stats.pending));
    })()), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "crx-btn crx-btn-primary",
        disabled: busy || !selected.clauses?.length,
        onClick: () => void handleSave(selected.id, selected.clauses ?? [], false)
      },
      "\u4FDD\u5B58\u5BA1\u67E5\u7ED3\u8BBA"
    )))), creating && /* @__PURE__ */ React.createElement(CreateCaseDialog, { onCancel: () => setCreating(false), onSubmit: handleCreate, busy }));
  }
  function ClauseCard({
    clause,
    draft,
    disabled,
    onChange
  }) {
    const [expanded, setExpanded] = useState(false);
    const current = draft ?? {
      decision: clause.humanDecision,
      conclusion: clause.humanConclusion ?? "",
      note: clause.humanNote ?? ""
    };
    const decided = current.decision !== "pending";
    const set = (patch) => onChange({ ...current, ...patch });
    return /* @__PURE__ */ React.createElement("article", { className: "crx-clause" }, /* @__PURE__ */ React.createElement("div", { className: "crx-clause-head" }, /* @__PURE__ */ React.createElement("div", { className: "crx-clause-name" }, CLAUSE_LABELS[clause.clauseType] ?? clause.clauseType, /* @__PURE__ */ React.createElement("span", { className: `crx-badge crx-badge-${clause.aiRiskLevel}`, style: { marginLeft: 8 } }, "AI \u5224\u5B9A\uFF1A", RISK_LABELS[clause.aiRiskLevel] ?? clause.aiRiskLevel)), /* @__PURE__ */ React.createElement("span", { className: `crx-badge ${decided ? "crx-badge-ok" : "crx-badge-neutral"}` }, DECISION_LABELS[current.decision])), /* @__PURE__ */ React.createElement("div", { className: "crx-clause-body" }, /* @__PURE__ */ React.createElement("div", { className: "crx-section-label" }, "\u5408\u540C\u539F\u6587\u6458\u5F55"), /* @__PURE__ */ React.createElement("div", { className: "crx-quote" }, expanded ? clause.excerpt : truncate(clause.excerpt, 160)), clause.excerpt.length > 160 && /* @__PURE__ */ React.createElement("button", { className: "crx-btn crx-btn-sm", style: { marginBottom: 12 }, onClick: () => setExpanded(!expanded) }, expanded ? "\u6536\u8D77\u539F\u6587" : "\u5C55\u5F00\u539F\u6587"), /* @__PURE__ */ React.createElement("div", { className: "crx-section-label" }, "AI \u5EFA\u8BAE\uFF08\u4F9B\u53C2\u8003\uFF0C\u4E0D\u6784\u6210\u7ED3\u8BBA\uFF09"), /* @__PURE__ */ React.createElement("div", { className: "crx-ai" }, /* @__PURE__ */ React.createElement("div", null, clause.aiConclusion ?? "\u2014"), clause.aiReason && /* @__PURE__ */ React.createElement("div", { className: "crx-ai-reason" }, "\u98CE\u9669\u7406\u7531\uFF1A", clause.aiReason)), /* @__PURE__ */ React.createElement("div", { className: "crx-human" }, /* @__PURE__ */ React.createElement("div", { className: "crx-section-label" }, "\u4EBA\u5DE5\u786E\u8BA4"), /* @__PURE__ */ React.createElement("div", { className: "crx-row" }, ["confirmed", "edited", "rejected"].map((option) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: option,
        className: `crx-btn crx-btn-sm ${current.decision === option ? "crx-decision-active" : ""}`,
        disabled,
        onClick: () => set({ decision: option })
      },
      option === "confirmed" ? "\u786E\u8BA4" : option === "edited" ? "\u4FEE\u6539" : "\u9A73\u56DE"
    )), decided && /* @__PURE__ */ React.createElement("button", { className: "crx-btn crx-btn-sm", disabled, onClick: () => set({ decision: "pending" }) }, "\u64A4\u9500")), current.decision === "edited" && /* @__PURE__ */ React.createElement("div", { className: "crx-field" }, /* @__PURE__ */ React.createElement("div", { className: "crx-section-label" }, "\u4FEE\u6539\u540E\u7684\u7ED3\u8BBA"), /* @__PURE__ */ React.createElement(
      "textarea",
      {
        className: "crx-textarea",
        value: current.conclusion,
        placeholder: "\u5199\u4E0B\u4F60\u8BA4\u53EF\u7684\u7ED3\u8BBA\uFF0C\u843D\u5E93\u65F6\u4EE5\u8FD9\u6BB5\u4E3A\u51C6",
        onChange: (event) => set({ conclusion: event.target.value })
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "crx-field" }, /* @__PURE__ */ React.createElement("div", { className: "crx-section-label" }, "\u5907\u6CE8\uFF08\u53EF\u9009\uFF09"), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "crx-input",
        value: current.note,
        placeholder: "\u4F8B\u5982\uFF1A\u5DF2\u4E0E\u6CD5\u52A1\u786E\u8BA4\uFF0C\u8D26\u671F\u53EF\u63A5\u53D7",
        onChange: (event) => set({ note: event.target.value })
      }
    )))));
  }
  function CreateCaseDialog({
    onCancel,
    onSubmit,
    busy
  }) {
    const [title, setTitle] = useState("");
    const [counterparty, setCounterparty] = useState("");
    const [contractText, setContractText] = useState("");
    const valid = title.trim().length > 0 && contractText.trim().length > 0;
    return /* @__PURE__ */ React.createElement("div", { className: "crx-modal-mask", onClick: onCancel }, /* @__PURE__ */ React.createElement("div", { className: "crx-modal", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React.createElement("h3", null, "\u65B0\u5EFA\u5408\u540C\u5BA1\u67E5\u5355"), /* @__PURE__ */ React.createElement("div", { className: "crx-field" }, /* @__PURE__ */ React.createElement("div", { className: "crx-section-label" }, "\u5408\u540C\u540D\u79F0"), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "crx-input",
        value: title,
        placeholder: "\u4F8B\u5982\uFF1AXX \u9879\u76EE\u8BBE\u5907\u91C7\u8D2D\u5408\u540C",
        onChange: (event) => setTitle(event.target.value)
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "crx-field" }, /* @__PURE__ */ React.createElement("div", { className: "crx-section-label" }, "\u76F8\u5BF9\u65B9\uFF08\u53EF\u9009\uFF09"), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "crx-input",
        value: counterparty,
        placeholder: "\u4F8B\u5982\uFF1A\u67D0\u67D0\u79D1\u6280\u6709\u9650\u516C\u53F8",
        onChange: (event) => setCounterparty(event.target.value)
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "crx-field" }, /* @__PURE__ */ React.createElement("div", { className: "crx-section-label" }, "\u5408\u540C\u6B63\u6587\uFF08\u7C98\u8D34\u5168\u6587\uFF09"), /* @__PURE__ */ React.createElement(
      "textarea",
      {
        className: "crx-textarea",
        style: { minHeight: 220 },
        value: contractText,
        placeholder: "\u628A\u5408\u540C\u6B63\u6587\u6574\u6BB5\u7C98\u8D34\u5230\u8FD9\u91CC\u3002\u6B63\u6587\u8D8A\u5B8C\u6574\uFF0CAI \u62BD\u53D6\u7684\u56DB\u7C7B\u6761\u6B3E\u8D8A\u53EF\u9760\u3002",
        onChange: (event) => setContractText(event.target.value)
      }
    ), /* @__PURE__ */ React.createElement("div", { className: "crx-item-meta", style: { marginTop: 4 } }, "\u5DF2\u8F93\u5165 ", contractText.trim().length, " \u5B57")), /* @__PURE__ */ React.createElement("div", { className: "crx-modal-actions" }, /* @__PURE__ */ React.createElement("button", { className: "crx-btn", onClick: onCancel, disabled: busy }, "\u53D6\u6D88"), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "crx-btn crx-btn-primary",
        disabled: !valid || busy,
        onClick: () => onSubmit({ title, counterparty, contractText })
      },
      "\u521B\u5EFA\u5BA1\u67E5\u5355"
    ))));
  }
  function StatusBadge({ status }) {
    const tone = status === "confirmed" ? "crx-badge-ok" : status === "extracted" ? "crx-badge-info" : status === "extracting" ? "crx-badge-medium" : "crx-badge-neutral";
    return /* @__PURE__ */ React.createElement("span", { className: `crx-badge ${tone}` }, STATUS_LABELS[status] ?? status);
  }
  function computeStats(clauses, drafts) {
    const stats = { total: clauses.length, pending: 0, confirmed: 0, edited: 0, rejected: 0 };
    for (const clause of clauses) {
      const decision = drafts[clause.id]?.decision ?? clause.humanDecision;
      if (decision === "pending") stats.pending += 1;
      else if (decision === "confirmed") stats.confirmed += 1;
      else if (decision === "edited") stats.edited += 1;
      else if (decision === "rejected") stats.rejected += 1;
    }
    return stats;
  }
  function messageOf(result) {
    const message = asObject(result.message);
    return asString(message?.zh_Hans) || asString(message?.en_US) || "\u64CD\u4F5C\u5931\u8D25";
  }
  function normalizeViewData(payload) {
    const selected = asObject(payload.item);
    const summary = asObject(payload.summary);
    const items = Array.isArray(payload.items) ? payload.items : [];
    return {
      selected: selected ? normalizeCase(selected) : null,
      list: {
        items: items.map((item) => normalizeCase(asObject(item) ?? {})),
        total: asNumber(payload.total, items.length),
        page: asNumber(summary?.page, 1),
        pageSize: asNumber(summary?.pageSize, 25)
      }
    };
  }
  function normalizeCase(raw) {
    const clauses = Array.isArray(raw.clauses) ? raw.clauses : [];
    return {
      id: asString(raw.id),
      title: asString(raw.title),
      counterparty: raw.counterparty ?? null,
      contractText: asString(raw.contractText),
      status: asString(raw.status, "draft"),
      extractionAttempts: asNumber(raw.extractionAttempts, 0),
      lastExtractionAt: raw.lastExtractionAt ?? null,
      lastExtractionError: raw.lastExtractionError ?? null,
      confirmedAt: raw.confirmedAt ?? null,
      createdAt: raw.createdAt ?? null,
      updatedAt: raw.updatedAt ?? null,
      clauseCount: asNumber(raw.clauseCount, clauses.length),
      pendingCount: asNumber(raw.pendingCount, 0),
      clauses: clauses.map((item) => normalizeClause(asObject(item) ?? {}))
    };
  }
  function normalizeClause(raw) {
    return {
      id: asString(raw.id),
      caseId: asString(raw.caseId),
      sequence: asNumber(raw.sequence, 0),
      clauseType: asString(raw.clauseType, "payment"),
      excerpt: asString(raw.excerpt),
      aiConclusion: raw.aiConclusion ?? null,
      aiRiskLevel: asString(raw.aiRiskLevel, "medium"),
      aiReason: raw.aiReason ?? null,
      humanDecision: asString(raw.humanDecision, "pending"),
      humanConclusion: raw.humanConclusion ?? null,
      humanNote: raw.humanNote ?? null,
      decidedAt: raw.decidedAt ?? null
    };
  }
  var rootElement = document.getElementById("root");
  var root = ReactDOM.createRoot ? ReactDOM.createRoot(rootElement) : null;
  if (root) {
    root.render(/* @__PURE__ */ React.createElement(App, null));
  } else {
    ReactDOM.render?.(/* @__PURE__ */ React.createElement(App, null), rootElement);
  }
})();
