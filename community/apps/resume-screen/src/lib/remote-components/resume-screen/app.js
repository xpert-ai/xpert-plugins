"use strict";
var XpertResumeScreen = (() => {
  var __defProp = Object.defineProperty;
  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
  var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
  var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);

  // src/lib/remote-components/resume-screen/src/react-shim.ts
  var react_shim_exports = {};
  __export(react_shim_exports, {
    Children: () => Children,
    Component: () => Component,
    Fragment: () => Fragment,
    Profiler: () => Profiler,
    PureComponent: () => PureComponent,
    StrictMode: () => StrictMode,
    Suspense: () => Suspense,
    cloneElement: () => cloneElement,
    createContext: () => createContext,
    createElement: () => createElement,
    createFactory: () => createFactory,
    createRef: () => createRef,
    default: () => react_shim_default,
    forwardRef: () => forwardRef,
    isValidElement: () => isValidElement,
    lazy: () => lazy,
    memo: () => memo,
    startTransition: () => startTransition,
    useCallback: () => useCallback,
    useContext: () => useContext,
    useDebugValue: () => useDebugValue,
    useDeferredValue: () => useDeferredValue,
    useEffect: () => useEffect,
    useId: () => useId,
    useImperativeHandle: () => useImperativeHandle,
    useInsertionEffect: () => useInsertionEffect,
    useLayoutEffect: () => useLayoutEffect,
    useMemo: () => useMemo,
    useReducer: () => useReducer,
    useRef: () => useRef,
    useState: () => useState,
    useSyncExternalStore: () => useSyncExternalStore,
    useTransition: () => useTransition,
    version: () => version
  });
  var ReactGlobal = window.React;
  var react_shim_default = ReactGlobal;
  var Children = ReactGlobal.Children;
  var Component = ReactGlobal.Component;
  var Fragment = ReactGlobal.Fragment;
  var Profiler = ReactGlobal.Profiler;
  var PureComponent = ReactGlobal.PureComponent;
  var StrictMode = ReactGlobal.StrictMode;
  var Suspense = ReactGlobal.Suspense;
  var cloneElement = ReactGlobal.cloneElement;
  var createContext = ReactGlobal.createContext;
  var createElement = ReactGlobal.createElement;
  var createFactory = ReactGlobal.createFactory;
  var createRef = ReactGlobal.createRef;
  var forwardRef = ReactGlobal.forwardRef;
  var isValidElement = ReactGlobal.isValidElement;
  var lazy = ReactGlobal.lazy;
  var memo = ReactGlobal.memo;
  var startTransition = ReactGlobal.startTransition;
  var useCallback = ReactGlobal.useCallback;
  var useContext = ReactGlobal.useContext;
  var useDebugValue = ReactGlobal.useDebugValue;
  var useDeferredValue = ReactGlobal.useDeferredValue;
  var useEffect = ReactGlobal.useEffect;
  var useId = ReactGlobal.useId;
  var useImperativeHandle = ReactGlobal.useImperativeHandle;
  var useInsertionEffect = ReactGlobal.useInsertionEffect;
  var useLayoutEffect = ReactGlobal.useLayoutEffect;
  var useMemo = ReactGlobal.useMemo;
  var useReducer = ReactGlobal.useReducer;
  var useRef = ReactGlobal.useRef;
  var useState = ReactGlobal.useState;
  var useSyncExternalStore = ReactGlobal.useSyncExternalStore;
  var useTransition = ReactGlobal.useTransition;
  var version = ReactGlobal.version;

  // src/lib/remote-components/resume-screen/src/react-dom-client-shim.ts
  var ReactDOMGlobal = window.ReactDOM;
  var createRoot = ReactDOMGlobal.createRoot;
  var hydrateRoot = ReactDOMGlobal.hydrateRoot;

  // src/lib/remote-components/resume-screen/src/utils.ts
  var PAGE_SIZE = 20;
  var DOM_ROW_CAP = 200;
  var PARSE_POLL_MS = 3e4;
  var PARSE_TIMEOUT_MS = 10 * 60 * 1e3;
  var UPLOAD_STILL_WORKING_MS = 6e4;
  var UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
  var UPLOAD_OVERSIZE_HINT = "\u6587\u4EF6\u8D85\u8FC7 10MB\uFF0C\u8BF7\u7CBE\u7B80\u6216\u62C6\u5206\u540E\u91CD\u65B0\u4E0A\u4F20";
  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function unwrap(response) {
    if (!isObject(response)) return {};
    if (Object.prototype.hasOwnProperty.call(response, "data")) return asRecord(response.data);
    if (Object.prototype.hasOwnProperty.call(response, "result")) return asRecord(response.result);
    if (Object.prototype.hasOwnProperty.call(response, "payload")) return asRecord(response.payload);
    return response;
  }
  function asRecord(value) {
    return isObject(value) ? value : {};
  }
  function resolveText(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (isObject(value)) return String(value.zh_Hans || value.en_US || "");
    return String(value);
  }
  function parseActionResult(response) {
    const value = unwrap(response);
    return {
      success: value.success !== false,
      message: value.message,
      refresh: value.refresh === true,
      data: isObject(value.data) ? value.data : void 0
    };
  }
  function looksLikeRevisionConflict(message) {
    return /(刷新|冲突|其他人|已被|stale|conflict|revision)/i.test(message);
  }
  function normalizeViewData(raw) {
    const value = unwrap(raw);
    const stats = isObject(value.stats) ? value.stats : {};
    const page = isObject(value.page) ? value.page : {};
    return {
      jobs: Array.isArray(value.jobs) ? value.jobs : [],
      job: isObject(value.job) ? value.job : void 0,
      candidates: (Array.isArray(value.candidates) ? value.candidates : []).map(
        (item) => item.status === "draft" ? { ...item, status: "parsing" } : item
      ),
      stats: {
        total: num(stats.total),
        pendingReview: num(stats.pendingReview),
        accepted: num(stats.accepted),
        hold: num(stats.hold),
        rejected: num(stats.rejected),
        failed: num(stats.failed),
        parsing: num(stats.parsing)
      },
      page: { number: num(page.number, 1), size: num(page.size, PAGE_SIZE), total: num(page.total) }
    };
  }
  function num(value, fallback = 0) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }
  function buildQuery(options2) {
    const parameters = {
      jobId: options2.jobId || void 0,
      status: options2.status === "all" ? void 0 : options2.status,
      sortBy: options2.sortBy,
      sortDir: options2.sortDir
    };
    return {
      page: options2.page,
      pageSize: options2.pageSize,
      search: options2.search || void 0,
      parameters
    };
  }
  function scoreTier(score) {
    if (score === void 0 || score === null || Number.isNaN(score)) return "none";
    if (score >= 70) return "blue";
    if (score >= 40) return "amber";
    return "red";
  }
  function formatMonthDay(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  function isParsingTimedOut(candidate, now) {
    if (candidate.status !== "parsing") return false;
    const base = Date.parse(candidate.updatedAt || candidate.createdAt || "");
    if (Number.isNaN(base)) return false;
    return now - base > PARSE_TIMEOUT_MS;
  }
  function elapsedLabel(fromIso, now) {
    const base = Date.parse(fromIso || "");
    if (Number.isNaN(base)) return "";
    const minutes = Math.max(0, Math.floor((now - base) / 6e4));
    return minutes < 1 ? "\u4E0D\u5230 1 \u5206\u949F" : `${minutes} \u5206\u949F`;
  }
  function mapUploadFailure(message) {
    const text = message.trim();
    if (!text) return "\u4E0A\u4F20\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u4E0A\u4F20";
    if (/加密|password/i.test(text)) return "\u6587\u4EF6\u5DF2\u52A0\u5BC6\uFF0C\u8BF7\u89E3\u9664\u5BC6\u7801\u540E\u91CD\u65B0\u4E0A\u4F20";
    if (/扫描|无文本|无法提取文字/.test(text)) return "\u8BE5 PDF \u65E0\u6CD5\u63D0\u53D6\u6587\u5B57\uFF08\u53EF\u80FD\u4E3A\u626B\u63CF\u4EF6\uFF09\uFF0C\u8BF7\u8F6C\u5B58\u4E3A Word \u540E\u91CD\u65B0\u4E0A\u4F20";
    if (/格式|不支持/.test(text)) return "\u4EC5\u652F\u6301 .docx / .pdf\uFF08\u226410MB\uFF09\uFF0C\u8BF7\u8F6C\u6362\u683C\u5F0F\u540E\u91CD\u65B0\u4E0A\u4F20";
    if (/超过|过大|10MB|size/i.test(text)) return UPLOAD_OVERSIZE_HINT;
    return text;
  }
  function summarizeQueue(rows) {
    const count3 = (status) => rows.filter((row) => row.status === status).length;
    return {
      total: rows.length,
      queued: count3("queued"),
      uploading: count3("uploading"),
      created: count3("created"),
      skipped: count3("skipped"),
      failed: count3("failed"),
      active: count3("queued") + count3("uploading")
    };
  }
  function nextPendingId(list, afterId) {
    const startIndex = afterId ? list.findIndex((item) => item.id === afterId) : -1;
    for (let offset4 = 1; offset4 <= list.length; offset4 += 1) {
      const item = list[(startIndex + offset4 + list.length) % list.length];
      if (item && item.status === "pending_review") return item.id;
    }
    return null;
  }

  // src/lib/remote-components/resume-screen/src/bridge.ts
  var CHANNEL = "xpertai.remote_component";
  var VERSION = 1;
  var REQUEST_TIMEOUT_MS = 15e3;
  var REQUEST_TIMEOUT_MESSAGE = "\u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5";
  var FILE_ACTION_TIMEOUT_MS = 6e4;
  var FILE_ACTION_TIMEOUT_MESSAGE = "\u56DE\u6267\u8D85\u65F6\uFF1A\u6587\u4EF6\u53EF\u80FD\u5DF2\u5F55\u5165\uFF0C\u8BF7\u5237\u65B0\u5217\u8868\u786E\u8BA4\uFF1B\u5982\u9700\u53EF\u91CD\u65B0\u4E0A\u4F20\uFF08\u91CD\u590D\u5185\u5BB9\u5C06\u81EA\u52A8\u8DF3\u8FC7\uFF09";
  var LATE_RECEIPT_TTL_MS = 10 * 6e4;
  var onLateReceipt = null;
  function setOnLateReceipt(handler) {
    onLateReceipt = handler;
  }
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
        handlers.onHostEvent(message.event);
        return;
      }
      const requestId = typeof message.requestId === "string" ? message.requestId : "";
      if (requestId && pending.has(requestId)) {
        const item = pending.get(requestId);
        if (!item) return;
        if (item.timedOut) {
          pending.delete(requestId);
          if (item.ttlTimer) window.clearTimeout(item.ttlTimer);
          if (onLateReceipt) onLateReceipt();
          return;
        }
        pending.delete(requestId);
        if (message.type === "error") {
          item.reject(new Error(typeof message.message === "string" ? message.message : "\u7B80\u5386\u5DE5\u4F5C\u53F0\u8FDC\u7AEF\u8BF7\u6C42\u5931\u8D25"));
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
  function request(type, body, timeout) {
    const requestId = String(++requestSequence);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        if (timeout.trackLate) {
          const item = pending.get(requestId);
          if (item) {
            item.timedOut = true;
            item.ttlTimer = window.setTimeout(() => pending.delete(requestId), LATE_RECEIPT_TTL_MS);
          }
        } else {
          pending.delete(requestId);
        }
        reject(new Error(timeout.message));
      }, timeout.ms);
      pending.set(requestId, {
        resolve: (message) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          resolve(message);
        },
        reject: (error) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          reject(error);
        }
      });
      try {
        post(type, { requestId, ...body ?? {} });
      } catch (error) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  function requestData(query) {
    return request("requestData", { query }, { ms: REQUEST_TIMEOUT_MS, message: REQUEST_TIMEOUT_MESSAGE });
  }
  function executeAction(actionKey, targetId, input, parameters) {
    return request("executeAction", { actionKey, targetId, input, parameters }, { ms: REQUEST_TIMEOUT_MS, message: REQUEST_TIMEOUT_MESSAGE });
  }
  function executeFileAction(actionKey, targetId, input, parameters, file) {
    return file.arrayBuffer().then(
      (buffer) => request(
        "executeFileAction",
        {
          actionKey,
          targetId,
          input,
          parameters,
          file: { name: file.name, type: file.type, size: file.size, buffer }
        },
        { ms: FILE_ACTION_TIMEOUT_MS, message: FILE_ACTION_TIMEOUT_MESSAGE, trackLate: true }
      )
    );
  }
  function notify(message, level = "success") {
    post("notify", { message, level });
  }
  function reportResize() {
    const root = document.getElementById("root");
    const shell = root?.firstElementChild;
    const height = Math.max(shell?.scrollHeight ?? 0, 640);
    post("resize", { height: Math.ceil(height), viewportBound: false });
  }

  // src/lib/remote-components/resume-screen/src/styles.ts
  function injectStyles() {
    if (document.getElementById("resume-screen-styles")) return;
    const style = document.createElement("style");
    style.id = "resume-screen-styles";
    style.textContent = `
    :root {
      color-scheme: light;
      /* \u7ED3\u6784\uFF08= crm --crm20-*\uFF09 */
      --rs-panel: #ffffff;
      --rs-bg-soft: #fbfbfc;
      --rs-border: #e5e7eb;
      --rs-border-soft: #f0f1f3;
      --rs-hover: #fafafa;
      --rs-active: #f1f5ff;
      /* \u6587\u5B57\u4E09\u7EA7 */
      --rs-text: #1f2937;
      --rs-muted: #6b7280;
      --rs-soft: #9ca3af;
      /* \u4E3B\u8272\uFF1A\u8BFB\u5BBF\u4E3B token\uFF0C\u56DE\u9000 crm \u7CFB\u84DD */
      --rs-primary: var(--primary, var(--xui-color-primary, #2563eb));
      --rs-primary-soft: #eff3ff;
      /* \u72B6\u6001\u8272\u8F6F/\u5F3A\u6210\u5BF9\uFF08\u8BED\u4E49\u6620\u5C04\u84DD\u56FE \xA78\uFF09 */
      --rs-blue: var(--info, #2563eb);        --rs-blue-soft: #eff6ff;
      --rs-green: var(--success, #047857);    --rs-green-soft: #e8f7ee;
      --rs-amber: var(--warning, #b45309);    --rs-amber-soft: #fff6df;
      --rs-red: var(--destructive, #dc2626);  --rs-red-soft: #fff0ee;
      --rs-neutral: #536174;                  --rs-neutral-soft: #edf2f7;
      /* \u89C4\u683C\uFF08= crm/sm \u5B9E\u6D4B\u516C\u5171\u503C\uFF09 */
      --rs-radius: 5px;
      --rs-radius-lg: 8px;
      --rs-pill: 11px;
      --rs-pill-round: 999px;
      --rs-control-h: 1.875rem;
      --rs-font-control: 0.8125rem;
      /* \u52A8\u753B\u4E09\u6863 + \u7F13\u52A8\uFF08\u84DD\u56FE \xA77\uFF09 */
      --rs-motion-fast: 120ms;
      --rs-motion-base: 160ms;
      --rs-motion-slow: 240ms;
      --rs-ease-entry: cubic-bezier(0.2, 0, 0, 1);
      --rs-ease-exit: cubic-bezier(0.4, 0, 1, 1);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--rs-panel); color: var(--rs-text); }
    body, button, input, select, textarea { font-family: Inter, "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: 0; }
    [data-slot="button"], [data-slot="input"], [data-slot="select-trigger"], [data-slot="textarea"] { font-size: var(--rs-font-control); }
    /* \u7126\u70B9\u73AF\u4FDD\u7559\uFF08\u84DD\u56FE \xA76.8\uFF0C\u5BF9\u9F50 crm \u641C\u7D22\u6846 focus \u5708\uFF09 */
    [data-slot="input"]:focus-visible, [data-slot="textarea"]:focus-visible, [data-slot="select-trigger"]:focus-visible, .rs-pill:focus-visible, .rs-item:focus-visible, [data-slot="button"]:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12); }
    i[class^="ri-"] { font-style: normal; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }

    /* ===== \u9AA8\u67B6\u5E03\u5C40\uFF08\u84DD\u56FE \xA73.1\uFF1A48/40/1fr/auto \u56DB\u884C\uFF1B\u4E2D\u7F1D 1px\uFF09 ===== */
    .rs-shell { min-height: 640px; display: grid; grid-template-rows: 48px 40px minmax(0, 1fr) auto; background: var(--rs-panel); position: relative; overflow: hidden; container-type: inline-size; }
    .rs-shell.rs-shell-loading { display: flex; align-items: center; justify-content: center; }
    .rs-boot-loading { color: var(--rs-muted); font-size: 13px; }
    .rs-header { display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--rs-border); min-width: 0; }
    .rs-statsbar { display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--rs-border); overflow-x: auto; scrollbar-width: none; }
    .rs-statsbar::-webkit-scrollbar { display: none; }
    .rs-content { min-height: 0; display: grid; grid-template-columns: 320px minmax(0, 1fr); }
    .rs-list-panel { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; border-right: 1px solid var(--rs-border); }
    /* \u8BE6\u60C5\u9762\u677F\u5BB9\u5668\uFF08\u5BBD\u680F\uFF09\uFF1A\u5185\u90E8 rs-detail-stack \u81EA\u5E26\u4E09\u884C\u6805\u683C\uFF0CSheet \u590D\u7528\u540C\u7ED3\u6784 */
    .rs-detail-panel { min-width: 0; min-height: 0; overflow: hidden; }
    .rs-detail-stack { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 0; height: 100%; }
    /* \u9996\u8F7D\u5931\u8D25\u9519\u8BEF\u5361\uFF08\xA76.1\uFF1Acrm notice \u7EA2\u53D8\u4F53 + \u91CD\u8BD5\uFF0C\u5C45\u4E2D\uFF09 */
    .rs-error-card { grid-column: 1 / -1; margin: 10px; min-height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; border: 1px solid color-mix(in srgb, var(--rs-red) 40%, transparent); background: var(--rs-red-soft); color: var(--rs-red); border-radius: var(--rs-radius-lg); font-size: 13px; padding: 22px 14px; text-align: center; }
    .rs-error-card i { font-size: 34px; }
    /* \u7A84\u5BB9\u5668\uFF08<720px JS \u5C5E\u6027\u964D\u7EA7\uFF0C\u84DD\u56FE \xA74\uFF09\uFF1A\u53F3\u8BE6\u60C5\u9690\u85CF\uFF0C\u8D70 Sheet \u62BD\u5C49 */
    .rs-shell[data-rs-width="narrow"] .rs-content { grid-template-columns: minmax(0, 1fr); }
    .rs-shell[data-rs-width="narrow"] .rs-detail-panel { display: none; }

    /* ===== \u5C97\u4F4D\u5207\u6362\u533A\uFF08\u84DD\u56FE \xA73.2\uFF09 ===== */
    .rs-job-icon { color: var(--rs-muted); width: 30px; height: 30px; font-size: 16px; flex: 0 0 auto; }
    .rs-job-select [data-slot="select-trigger"] { height: var(--rs-control-h); border-radius: var(--rs-radius); border-color: var(--rs-border); background: var(--rs-panel); font-weight: 650; max-width: 260px; }
    .rs-header-spacer { flex: 1 1 auto; }
    .rs-header-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
    .rs-header-actions [data-slot="button"] i { margin-right: 6px; font-size: 14px; }
    .rs-header-actions [data-slot="button"][data-size="icon"] i { margin-right: 0; }
    .rs-jd-popover [data-slot="popover-content"] { max-width: 420px; }
    .rs-jd-text { max-height: 240px; overflow: auto; font-size: 12px; line-height: 1.6; color: var(--rs-muted); white-space: pre-wrap; overflow-wrap: anywhere; }

    /* ===== \u7EDF\u8BA1\u6761 pill\uFF08\u84DD\u56FE \xA73.3\uFF0Csm .sm-stat-pill \u89C4\u683C\uFF09 ===== */
    .rs-pill { display: inline-flex; align-items: center; gap: 6px; height: 24px; border: 1px solid var(--rs-border); border-radius: var(--rs-pill-round); background: var(--rs-panel); color: var(--rs-muted); padding: 0 9px; font-size: 12px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: color var(--rs-motion-base) var(--rs-ease-entry), background-color var(--rs-motion-base) var(--rs-ease-entry), border-color var(--rs-motion-base) var(--rs-ease-entry); flex: 0 0 auto; }
    .rs-pill strong { font-weight: 750; font-variant-numeric: tabular-nums; color: var(--rs-text); transition: color var(--rs-motion-base) var(--rs-ease-entry); }
    .rs-pill.is-zero strong { color: var(--rs-soft); }
    .rs-pill.is-selected { background: var(--pill-strong, var(--rs-blue)); border-color: var(--pill-strong, var(--rs-blue)); color: #fff; }
    .rs-pill.is-selected strong { color: #fff; }
    .rs-pill .rs-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pill-strong, var(--rs-blue)); }
    .rs-pill-total { cursor: default; }
    .rs-timeout-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--rs-amber); }

    /* ===== \u5DE6\u5217\u8868\uFF08\u84DD\u56FE \xA73.4\uFF09 ===== */
    .rs-list-tools { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 8px; padding: 7px 10px; border-bottom: 1px solid var(--rs-border-soft); min-height: 44px; align-items: center; }
    .rs-search { height: 30px; min-width: 0; display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: center; gap: 6px; border: 1px solid var(--rs-border); background: var(--rs-bg-soft); border-radius: var(--rs-radius); padding: 0 8px; color: var(--rs-soft); }
    .rs-search:focus-within { border-color: #a9bdf7; box-shadow: 0 0 0 3px rgba(65, 105, 225, 0.12); }
    .rs-search [data-slot="input"] { height: 28px; border: 0; padding: 0; background: transparent; box-shadow: none; }
    .rs-list-filter { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .rs-list-filter [data-slot="select-trigger"] { height: 28px; border-radius: var(--rs-radius); font-size: 12px; }
    .rs-toolbar-button { color: #5f6368; gap: 6px; height: 28px; font-size: 12px; }
    .rs-toolbar-button.is-active { color: var(--rs-text); background: var(--rs-primary-soft); border-color: #ccd8ff; }
    .rs-toolbar-button i { font-size: 14px; }
    .rs-status-select { width: 96px; min-width: 0; }
    .rs-search-chip { grid-column: 1 / -1; display: flex; gap: 6px; align-items: center; }
    .rs-list { min-height: 0; overflow: auto; position: relative; outline: none; }
    .rs-list-skeleton { padding: 10px; display: grid; gap: 10px; }
    /* \u9996\u5C4F\u9AA8\u67B6\u884C\uFF08\xA73.4\uFF1A\u5934\u50CF\u5757 + \u53CC\u884C\u6761 + \u5206\u6570\u4F4D\uFF09\uFF0C\u5C3A\u5BF8\u5BF9\u9F50\u771F\u5B9E\u884C\u9632 CLS */
    .rs-sk-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) 46px; gap: 8px; align-items: center; min-height: 52px; }
    .rs-sk-lines { display: grid; gap: 6px; min-width: 0; }
    .rs-sk-avatar { width: 28px; height: 28px; border-radius: var(--rs-radius); }
    .rs-sk-avatar-lg { width: 36px; height: 36px; border-radius: var(--rs-radius-lg); }
    .rs-sk-line { height: 14px; border-radius: var(--rs-radius); }
    .rs-sk-half { width: 50%; }
    .rs-sk-third { width: 33%; }
    .rs-sk-two-thirds { width: 66%; }
    .rs-sk-score { width: 64px; height: 24px; border-radius: var(--rs-radius); }
    .rs-sk-bar { flex: 1 1 auto; height: 6px; border-radius: 3px; }
    .rs-sk-pill { width: 96px; height: 22px; border-radius: var(--rs-pill); }
    .rs-sk-pill-sm { width: 80px; }
    .rs-sk-stack { display: grid; gap: 8px; }
    .rs-sk-score-row { display: flex; align-items: center; gap: 8px; }
    .rs-sk-pill-row { display: flex; gap: 6px; }
    .rs-item { display: grid; grid-template-columns: 28px minmax(0, 1fr) 46px; align-items: center; gap: 8px; min-height: 52px; padding: 0 10px; border-bottom: 1px solid var(--rs-border-soft); cursor: pointer; background: var(--rs-panel); transition: background-color var(--rs-motion-fast) var(--rs-ease-entry); }
    .rs-item:hover { background: var(--rs-hover); }
    .rs-item[aria-current="true"] { background: var(--rs-active); }
    .rs-item-main { min-width: 0; display: grid; gap: 2px; }
    .rs-item-title { min-width: 0; display: flex; align-items: center; gap: 6px; }
    .rs-item-name { font-size: 13px; font-weight: 650; color: var(--rs-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rs-item-source { color: var(--rs-soft); font-size: 10px; flex: 0 0 auto; }
    .rs-item-meta { font-size: 12px; color: var(--rs-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rs-mark { width: 28px; height: 28px; border-radius: var(--rs-radius); color: #fff; font-size: 9px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; background: var(--rs-soft); flex: 0 0 auto; }
    .rs-item-score { display: grid; gap: 3px; justify-items: end; width: 46px; }
    /* \u5339\u914D\u5206\u5448\u73B0\uFF08P2 \u88C1\u51B3\uFF09\uFF1ABadge \u6570\u5B57 + Progress \u7EC6\u6761\uFF1Btabular-nums \u9632\u5237\u65B0\u8DF3\u52A8 */
    .rs-score-badge { height: 20px; min-width: 40px; justify-content: center; border-radius: var(--rs-radius); background: transparent; color: var(--rs-text); font-size: 13px; font-weight: 750; font-variant-numeric: tabular-nums; padding: 0 2px; }
    /* Progress \u8986\u5199\uFF1A\u6307\u793A\u6761\u989C\u8272\u968F\u5206\u6863\uFF08\u6839\u7EC4\u4EF6\u7528 translateX \u8868\u73B0\u8FDB\u5EA6\uFF0C\u65E0\u9700\u6539\u5BBD\u5EA6\u52A8\u753B\uFF09 */
    .rs-score-bar { width: 40px; height: 3px; border-radius: 2px; background: var(--rs-border-soft); }
    .rs-score-bar [data-slot="progress-indicator"] { background: var(--rs-blue); border-radius: 2px; }
    .rs-score-bar.tier-amber [data-slot="progress-indicator"] { background: var(--rs-amber); }
    .rs-score-bar.tier-red [data-slot="progress-indicator"] { background: var(--rs-red); }
    .rs-list-foot { min-height: 40px; border-top: 1px solid var(--rs-border); display: flex; align-items: center; gap: 10px; padding: 0 10px; color: var(--rs-soft); font-size: 12px; }
    .rs-list-foot [data-slot="button"] { height: 28px; }

    /* \u7A7A\u6001\uFF08\u84DD\u56FE \xA73.4\uFF1Acrm \u5C45\u4E2D\u7AD6\u6392 + sm \u8F6F\u5E95\u5757\uFF09 */
    .rs-empty { min-height: 280px; margin: 10px; border-radius: 7px; background: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--rs-muted); padding: 22px 14px; text-align: center; font-size: 13px; }
    .rs-empty i.rs-empty-icon { width: 42px; height: 42px; border-radius: var(--rs-radius); background: var(--rs-border); color: #4b5563; font-size: 22px; }
    .rs-empty strong { font-weight: 700; color: var(--rs-text); }
    .rs-empty small { color: var(--rs-soft); font-weight: 600; }

    /* ===== \u5FBD\u6807\u516D\u6001\uFF08\u84DD\u56FE \xA78\uFF1A\u9AD8 22\u3001\u5706\u89D2 5\u3001\u5B57 12/650\u3001\u8F6F\u5E95\u5F3A\u5B57 + \u72B6\u6001\u56FE\u6807/\u5706\u70B9\uFF09 ===== */
    .rs-badge { display: inline-flex; align-items: center; gap: 5px; height: 22px; border-radius: var(--rs-radius); padding: 0 8px; font-size: 12px; font-weight: 650; border: 1px solid transparent; background: var(--rs-neutral-soft); color: var(--rs-neutral); white-space: nowrap; transition: color var(--rs-motion-base) var(--rs-ease-entry), background-color var(--rs-motion-base) var(--rs-ease-entry), border-color var(--rs-motion-base) var(--rs-ease-entry); }
    .rs-badge i { font-size: 12px; }
    .rs-badge.tone-blue { background: var(--rs-blue-soft); color: var(--rs-blue); }
    .rs-badge.tone-green { background: var(--rs-green-soft); color: var(--rs-green); }
    .rs-badge.tone-amber { background: var(--rs-amber-soft); color: var(--rs-amber); }
    .rs-badge.tone-red { background: var(--rs-red-soft); color: var(--rs-red); }
    /* \u5931\u8D25\uFF1A\u6D45\u7EA2\u5E95 + 40% \u7EA2\u63CF\u8FB9\uFF0C\u4E0E\u300C\u6DD8\u6C70\u300D\u8F6F\u5E95\u5E73\u8272\u5728\u8272\u5F31\u4E0B\u533A\u5206\uFF08\u84DD\u56FE \xA78 \u8F85\u52A9\u89C4\u5219\uFF09 */
    .rs-badge.tone-failed { background: #fff5f5; color: #b91c1c; border-color: color-mix(in srgb, var(--rs-red) 40%, transparent); }
    /* \u6392\u961F\u4E2D/\u8DF3\u8FC7(\u91CD\u590D)\u5171\u7528\u4E2D\u6027\u5BF9\uFF08\xA78 v2 \u6CE8\uFF1A\u5BF9\u9F50 sm .sm-badge \u9ED8\u8BA4\u6001\uFF0C\u4E0D\u65B0\u589E\u989C\u8272\uFF09 */
    .rs-badge.tone-neutral { background: var(--rs-neutral-soft); color: var(--rs-neutral); }
    .rs-badge-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
    .rs-badge-edit { background: var(--rs-blue-soft); color: var(--rs-blue); cursor: default; }

    /* ===== \u53F3\u8BE6\u60C5\uFF08\u84DD\u56FE \xA73.5\uFF09 ===== */
    .rs-detail-head { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--rs-border); min-height: 76px; align-items: start; }
    .rs-detail-avatar { width: 36px; height: 36px; border-radius: var(--rs-radius-lg); color: #fff; font-weight: 800; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; background: var(--rs-soft); }
    .rs-detail-title { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
    .rs-detail-title strong { font-size: 16px; font-weight: 650; color: var(--rs-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    .rs-detail-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--rs-muted); font-size: 12px; margin-top: 4px; }
    .rs-detail-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    .rs-detail-meta i { font-size: 12px; margin-right: 3px; color: var(--rs-soft); }
    .rs-detail-body { min-height: 0; overflow: hidden; display: grid; grid-template-rows: minmax(0, 1fr); }
    .rs-detail-scroll { height: 100%; }
    .rs-detail-pad { padding: 2px 14px 12px; }
    /* \u9996\u5C4F\u8BE6\u60C5\u6574\u5757\u9AA8\u67B6\uFF08\xA76.1\uFF09\uFF1A\u5934\u50CF + \u591A\u6761\u7070\u6761 */
    .rs-detail-skeleton { padding: 14px; display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 12px; align-items: start; }
    .rs-sk-blocks { display: grid; gap: 10px; min-width: 0; }
    .rs-section { padding: 12px 0; border-bottom: 1px solid var(--rs-border-soft); }
    .rs-section:last-child { border-bottom: 0; }
    .rs-section-title { color: var(--rs-soft); font-size: 12px; font-weight: 700; letter-spacing: 0.02em; margin-bottom: 8px; }
    .rs-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; }
    .rs-field { display: grid; gap: 4px; min-width: 0; }
    .rs-field > span { color: var(--rs-muted); font-size: 12px; font-weight: 650; }
    .rs-field strong { min-width: 0; color: var(--rs-text); font-size: 13px; font-weight: 650; overflow-wrap: anywhere; }
    .rs-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 22px; max-width: 100%; border: 1px solid var(--rs-border); border-radius: var(--rs-pill); background: #f3f4f6; color: #4b5563; padding: 0 9px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rs-chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .rs-chip-edit button { border: 0; background: transparent; color: var(--rs-soft); cursor: pointer; padding: 0; font-size: 12px; }
    .rs-chip-edit button:hover { color: var(--rs-red); }
    .rs-score-big { display: flex; align-items: baseline; gap: 6px; }
    .rs-score-big strong { font-size: 24px; font-weight: 750; font-variant-numeric: tabular-nums; }
    .rs-score-big span { color: var(--rs-soft); font-size: 12px; }
    .rs-score-detail { height: 6px; margin-top: 6px; border-radius: 3px; background: var(--rs-border-soft); }
    .rs-score-detail [data-slot="progress-indicator"] { background: var(--rs-blue); border-radius: 3px; }
    .rs-score-detail.tier-amber [data-slot="progress-indicator"] { background: var(--rs-amber); }
    .rs-score-detail.tier-red [data-slot="progress-indicator"] { background: var(--rs-red); }
    .rs-reason { font-size: 13px; line-height: 1.6; color: var(--rs-text); overflow-wrap: anywhere; white-space: pre-wrap; }
    .rs-reason.is-collapsed { display: -webkit-box; -webkit-line-clamp: 8; -webkit-box-orient: vertical; overflow: hidden; }
    .rs-expand { color: var(--rs-blue); cursor: pointer; border: 0; background: transparent; font-size: 12px; font-weight: 650; padding: 4px 0 0; }
    .rs-hit { display: flex; flex-wrap: wrap; gap: 6px; }
    .rs-hit span { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; border-radius: var(--rs-pill); padding: 2px 9px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* \u547D\u4E2D\u70B9\u7EFF\u5BF9 / \u98CE\u9669\u70B9\u7EA2\u5BF9\uFF08\u8F6F\u5E95\u5F3A\u5B57\uFF0C\xA73.5 \u533A\u5757\u4E09/\u56DB\uFF09 */
    .rs-hit .hit-good { background: var(--rs-green-soft); color: var(--rs-green); }
    .rs-hit .hit-risk { background: var(--rs-red-soft); color: var(--rs-red); }
    .rs-detail-empty { min-height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--rs-soft); font-size: 13px; }

    /* \u7F16\u8F91\u6001\u8868\u5355 */
    .rs-form { display: grid; gap: 10px; }
    .rs-form-field { display: grid; gap: 5px; }
    .rs-form-field > span { color: var(--rs-muted); font-size: 12px; font-weight: 650; }
    .rs-form-field em { margin-left: 6px; color: #dc2626; font-style: normal; font-weight: 600; }
    .rs-form-field small { margin-left: 8px; color: var(--rs-soft); font-size: 11px; font-weight: 600; }
    .rs-form-field [data-slot="textarea"] { min-height: 88px; resize: vertical; }
    .rs-form-error { color: var(--rs-red); font-size: 12px; }

    /* ===== \u5904\u7F6E\u52A8\u4F5C\u6761\uFF08\u84DD\u56FE \xA73.6\uFF09 ===== */
    .rs-detail-foot { min-height: 56px; border-top: 1px solid var(--rs-border); display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 10px 14px; background: var(--rs-panel); }
    .rs-detail-foot [data-slot="button"] i { margin-right: 6px; font-size: 14px; }

    /* ===== \u5E95\u90E8\u5F55\u5165\u533A\uFF08\u84DD\u56FE \xA73.7\uFF09 ===== */
    .rs-intake { border-top: 1px solid var(--rs-border); background: var(--rs-panel); }
    /* v4.1 \xA73.7 \u628A\u624B\u884C\uFF1A\u300C\u4E0A\u4F20\u7B80\u5386\u6587\u4EF6\u300D\u4E3B\u6309\u94AE + \u961F\u5217\u5C55\u5F00\u89E6\u53D1\u5668\u540C\u7EA7\u6392\u5E03\uFF0C\u6536\u8D77\u6001\u6574\u884C\u9AD8 44px */
    .rs-intake-row { min-height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 12px; }
    .rs-intake-row [data-slot="button"] i { margin-right: 6px; font-size: 14px; }
    .rs-intake-handle { flex: 1 1 auto; min-width: 0; height: 44px; display: flex; align-items: center; gap: 8px; padding: 0; border: 0; background: transparent; color: var(--rs-muted); font-size: 13px; font-weight: 650; cursor: pointer; text-align: left; }
    .rs-intake-handle i.rs-handle-icon { font-size: 16px; color: var(--rs-soft); }
    .rs-intake-handle .rs-chevron { margin-left: auto; transition: transform var(--rs-motion-base) var(--rs-ease-entry); }
    .rs-intake-handle[aria-expanded="true"] .rs-chevron { transform: rotate(180deg); }
    .rs-intake-hint { color: var(--rs-soft); font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* \u628A\u624B\u8BA1\u6570\u5FBD\u6807\uFF08\u8FDB\u884C\u4E2D/\u5931\u8D25\uFF09\uFF1A\u5931\u8D25\u4F4D\u7EA2\u5F3A\u8C03\uFF08\xA73.7\uFF09 */
    .rs-handle-badge { height: 18px; border-radius: var(--rs-radius); font-size: 10px; padding: 0 6px; background: var(--rs-blue-soft); color: var(--rs-blue); font-weight: 650; }
    .rs-handle-badge-fail { background: var(--rs-red-soft); color: var(--rs-red); }
    .rs-intake-collapse { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 200ms var(--rs-ease-exit); }
    .rs-intake-collapse.is-open { grid-template-rows: 1fr; transition: grid-template-rows 200ms var(--rs-ease-entry); }
    .rs-intake-collapse > div { min-height: 0; overflow: hidden; }
    .rs-intake-body { padding: 0 12px 10px; display: grid; gap: 8px; }
    .rs-queue-summary { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--rs-muted); flex-wrap: wrap; }
    .rs-queue-summary b { font-weight: 750; font-variant-numeric: tabular-nums; color: var(--rs-text); }
    .rs-queue-summary .is-fail { color: var(--rs-red); }
    .rs-queue-clear { margin-left: auto; }
    .rs-queue-scroll { flex: 0 0 auto; }
    .rs-queue-list { display: grid; gap: 2px; padding-right: 6px; }
    .rs-queue-row { min-height: 32px; display: grid; grid-template-columns: 16px minmax(0, 1fr) auto auto; align-items: center; gap: 8px; font-size: 12px; color: var(--rs-text); padding: 0 2px; border-radius: var(--rs-radius); }
    .rs-queue-row:hover { background: var(--rs-hover); }
    .rs-queue-row > i { color: var(--rs-soft); font-size: 14px; }
    .rs-queue-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rs-queue-actions { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
    .rs-queue-hint { color: var(--rs-soft); font-size: 11px; }
    .rs-queue-span { grid-column: 3 / -1; }
    /* \u5931\u8D25\u884C\u6307\u5F15\uFF1A\u7EA2\u8F6F\u5E95 notice\uFF08\xA76.6 \u53EF\u6267\u884C\u91CD\u65B0\u4E0A\u4F20\u6307\u5F15\uFF0Crole=alert\uFF09 */
    .rs-queue-fail { grid-column: 1 / -1; margin: 2px 0 6px; display: flex; align-items: flex-start; gap: 6px; border: 1px solid color-mix(in srgb, var(--rs-red) 40%, transparent); background: var(--rs-red-soft); color: var(--rs-red); border-radius: var(--rs-radius); padding: 6px 8px; font-size: 12px; line-height: 1.5; }
    .rs-queue-guidance { font-size: 12px; color: var(--rs-muted); line-height: 1.6; }

    /* ===== notice \u6761\uFF08\u84DD\u56FE \xA76.1 \u901A\u7528\u9519\u8BEF\u51FA\u53E3\uFF1Bcrm .crm20-notice \u540C\u6784\u7EA2/\u7425\u73C0\u53D8\u4F53\uFF09 ===== */
    .rs-notice { position: absolute; left: 12px; right: 12px; top: 92px; z-index: 20; display: flex; align-items: flex-start; gap: 8px; border: 1px solid var(--rs-red); background: var(--rs-red-soft); color: var(--rs-red); padding: 8px 10px; border-radius: var(--rs-radius); font-size: 13px; box-shadow: 0 6px 20px rgba(31, 41, 55, 0.08); }
    .rs-notice.tone-amber { border-color: #f2c94c; background: #fffbeb; color: #7a4d00; }
    .rs-notice button { margin-left: auto; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 14px; padding: 0 2px; }
    .rs-notice-inline { position: static; margin: 8px 12px 0; }

    /* ===== \u52A8\u753B\u6E05\u5355\uFF08\u84DD\u56FE \xA77\uFF09 ===== */
    /* A1 \u589E\u91CF\u5237\u65B0\u626B\u63CF\u7EBF\uFF08\u9996\u5C4F\u4E0D\u7528\uFF0C\u7528 Skeleton\uFF09 */
    .rs-scanline { position: absolute; top: 0; left: 0; height: 2px; width: 35%; background: var(--rs-primary); z-index: 30; animation: rs-scan 1s ease-in-out infinite; }
    @keyframes rs-scan { 0% { transform: translateX(-100%); } 50% { transform: translateX(160%); } 100% { transform: translateX(360%); } }
    /* A6 \u8BE6\u60C5\u5185\u5BB9\u5207\u6362 */
    .rs-detail-anim { animation: rs-detail-in var(--rs-motion-base) var(--rs-ease-entry); }
    @keyframes rs-detail-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    /* A7 \u65B0\u7ED3\u679C\u884C\u56DE\u586B\uFF08\u9010\u884C stagger \u4EC5\u524D 10 \u884C\uFF0C\u884C\u5185\u8054 delay \u53D8\u91CF\uFF09 */
    .rs-enter { animation: rs-row-in var(--rs-motion-slow) var(--rs-ease-entry) both; animation-delay: var(--rs-stagger, 0ms); }
    @keyframes rs-row-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    /* A8 \u884C\u79FB\u51FA\u6DE1\u51FA */
    .rs-leaving { animation: rs-row-out var(--rs-motion-base) var(--rs-ease-exit) both; }
    @keyframes rs-row-out { from { opacity: 1; } to { opacity: 0; } }
    /* A9 \u8FDB\u884C\u4E2D loader\uFF08\u552F\u4E00\u65E0\u9650\u52A8\u753B\u8C41\u514D\u4E4B\u4E00\uFF09 */
    .rs-spin { animation: rs-rotate 1s linear infinite; display: inline-flex; }
    @keyframes rs-rotate { to { transform: rotate(360deg); } }
    /* A13 \u672A\u9009\u5C97\u4F4D\u84DD\u5708\u8109\u51B2\u4E00\u6B21 */
    .rs-pulse-job { animation: rs-pulse-once 320ms var(--rs-ease-entry); }
    @keyframes rs-pulse-once { 0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.35); } 100% { box-shadow: 0 0 0 8px rgba(37, 99, 235, 0); } }
    /* A15 \u961F\u5217\u300C\u67E5\u770B\u300D\u8DF3\u8F6C\u884C\u9AD8\u4EAE\u8109\u51B2\uFF08#eff3ff\u2192transparent \u4E24\u6B21\u5F80\u590D\uFF09 */
    .rs-jump { animation: rs-jump-pulse 240ms ease-in-out 2; }
    @keyframes rs-jump-pulse { from { background-color: var(--rs-primary-soft); } to { background-color: transparent; } }

    /* ===== <720px Sheet \u62BD\u5C49\uFF08\u84DD\u56FE \xA74/A11\uFF1A\u5BBD min(400px,100%-24px)\uFF09 ===== */
    .rs-sheet-content { width: min(400px, calc(100% - 24px)); max-width: calc(100% - 24px); padding: 0; gap: 0; display: grid; grid-template-rows: minmax(0, 1fr); }
    .rs-sheet-body { min-height: 0; }
    /* SheetTitle \u53EA\u670D\u52A1\u65E0\u969C\u788D\uFF08aria-labelledby\uFF09\uFF0C\u4E0D\u5360\u89C6\u89C9\uFF08\u8BE6\u60C5\u5934\u90E8\u81EA\u5E26\u6807\u9898\uFF09 */
    .rs-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

    /* \u5904\u7F6E\u6309\u94AE/\u786E\u8BA4\u6846\u7EA2\u5F3A\u8C03\uFF08\u6DD8\u6C70\u8BED\u4E49\uFF0C\xA73.6\uFF09 */
    .rs-action-destructive { color: var(--rs-red); }
    .rs-action-destructive:hover { color: var(--rs-red); background: var(--rs-red-soft); }
    .rs-reject-confirm-action [data-slot="alert-dialog-action"], [data-slot="alert-dialog-action"].rs-reject-confirm-action { background-color: var(--rs-red); color: #fff; }

    /* \u7EDF\u8BA1\u6761\u9AA8\u67B6 pill\uFF08\u4E0E\u771F\u5B9E pill \u540C\u89C4\u683C\u9632 CLS\uFF0CA2 \u8109\u51B2\u7531 Skeleton \u7EC4\u4EF6\u81EA\u5E26\uFF09 */
    .rs-pill-skeleton { width: 74px; height: 24px; border-radius: var(--rs-pill-round); }

    /* \u964D\u7EA7\u7EAA\u5F8B\uFF08\u84DD\u56FE \xA77\uFF09\uFF1Areduced-motion \u5168\u91CF\u7981\u7528\uFF0Cloader \u4FDD\u7559\u4F46\u9759\u6B62 */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
    }
    /* \u65AD\u70B9\u4E3B\u901A\u9053 = \u5BB9\u5668\u67E5\u8BE2\uFF08\xA74\uFF1Aiframe \u89C6\u53E3\u2260\u5BBF\u4E3B\u89C6\u53E3\uFF1B\u4E0D\u7528\u89C6\u53E3\u5A92\u4F53\u67E5\u8BE2\uFF09 */
    @container (max-width: 719px) {
      .rs-content { grid-template-columns: minmax(0, 1fr); }
      .rs-detail-panel { display: none; }
    }
    /* <560px\uFF1A\u7EDF\u8BA1\u6761\u6A2A\u6EDA\uFF08\u57FA\u7840\u6837\u5F0F\u5DF2 overflow-x:auto\uFF09\u3001\u62BD\u53D6\u5B57\u6BB5\u5355\u5217\u3001\u5934\u90E8\u6807\u7B7E\u6536\u7EB3 */
    @container (max-width: 559px) {
      .rs-fields { grid-template-columns: minmax(0, 1fr); }
      .rs-header-label { display: none; }
    }
    /* JS \u5C5E\u6027\u964D\u7EA7\u901A\u9053\uFF08ResizeObserver \u4E0D\u652F\u6301\u5BB9\u5668\u67E5\u8BE2\u7684\u73AF\u5883\uFF0C\u4E0E\u5BB9\u5668\u67E5\u8BE2\u540C\u6548\uFF09 */
    .rs-shell[data-rs-width="xs"] .rs-header-label { display: none; }
    .rs-shell[data-rs-width="xs"] .rs-fields { grid-template-columns: minmax(0, 1fr); }
  `;
    document.head.appendChild(style);
  }

  // ../../node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
  function r(e) {
    var t, f, n = "";
    if ("string" == typeof e || "number" == typeof e) n += e;
    else if ("object" == typeof e) if (Array.isArray(e)) {
      var o = e.length;
      for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
    } else for (f in e) e[f] && (n && (n += " "), n += f);
    return n;
  }
  function clsx() {
    for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
    return n;
  }

  // ../../node_modules/.pnpm/tailwind-merge@3.7.0/node_modules/tailwind-merge/dist/bundle-mjs.mjs
  var concatArrays = (array1, array2) => {
    const combinedArray = new Array(array1.length + array2.length);
    for (let i = 0; i < array1.length; i++) {
      combinedArray[i] = array1[i];
    }
    for (let i = 0; i < array2.length; i++) {
      combinedArray[array1.length + i] = array2[i];
    }
    return combinedArray;
  };
  var createClassValidatorObject = (classGroupId, validator) => ({
    classGroupId,
    validator
  });
  var createClassPartObject = (nextPart = /* @__PURE__ */ new Map(), validators = null, classGroupId) => ({
    nextPart,
    validators,
    classGroupId
  });
  var CLASS_PART_SEPARATOR = "-";
  var EMPTY_CONFLICTS = [];
  var ARBITRARY_PROPERTY_PREFIX = "arbitrary..";
  var createClassGroupUtils = (config) => {
    const classMap = createClassMap(config);
    const {
      conflictingClassGroups,
      conflictingClassGroupModifiers
    } = config;
    const getClassGroupId = (className) => {
      if (className.startsWith("[") && className.endsWith("]")) {
        return getGroupIdForArbitraryProperty(className);
      }
      const classParts = className.split(CLASS_PART_SEPARATOR);
      const startIndex = classParts[0] === "" && classParts.length > 1 ? 1 : 0;
      return getGroupRecursive(classParts, startIndex, classMap);
    };
    const getConflictingClassGroupIds = (classGroupId, hasPostfixModifier) => {
      if (hasPostfixModifier) {
        const modifierConflicts = conflictingClassGroupModifiers[classGroupId];
        const baseConflicts = conflictingClassGroups[classGroupId];
        if (modifierConflicts) {
          if (baseConflicts) {
            return concatArrays(baseConflicts, modifierConflicts);
          }
          return modifierConflicts;
        }
        return baseConflicts || EMPTY_CONFLICTS;
      }
      return conflictingClassGroups[classGroupId] || EMPTY_CONFLICTS;
    };
    return {
      getClassGroupId,
      getConflictingClassGroupIds
    };
  };
  var getGroupRecursive = (classParts, startIndex, classPartObject) => {
    const classPathsLength = classParts.length - startIndex;
    if (classPathsLength === 0) {
      return classPartObject.classGroupId;
    }
    const currentClassPart = classParts[startIndex];
    const nextClassPartObject = classPartObject.nextPart.get(currentClassPart);
    if (nextClassPartObject) {
      const result = getGroupRecursive(classParts, startIndex + 1, nextClassPartObject);
      if (result) return result;
    }
    const validators = classPartObject.validators;
    if (validators === null) {
      return void 0;
    }
    const classRest = startIndex === 0 ? classParts.join(CLASS_PART_SEPARATOR) : classParts.slice(startIndex).join(CLASS_PART_SEPARATOR);
    const validatorsLength = validators.length;
    for (let i = 0; i < validatorsLength; i++) {
      const validatorObj = validators[i];
      if (validatorObj.validator(classRest)) {
        return validatorObj.classGroupId;
      }
    }
    return void 0;
  };
  var getGroupIdForArbitraryProperty = (className) => className.slice(1, -1).indexOf(":") === -1 ? void 0 : (() => {
    const content = className.slice(1, -1);
    const colonIndex = content.indexOf(":");
    const property = content.slice(0, colonIndex);
    return property ? ARBITRARY_PROPERTY_PREFIX + property : void 0;
  })();
  var createClassMap = (config) => {
    const {
      theme,
      classGroups
    } = config;
    return processClassGroups(classGroups, theme);
  };
  var processClassGroups = (classGroups, theme) => {
    const classMap = createClassPartObject();
    for (const classGroupId in classGroups) {
      const group = classGroups[classGroupId];
      processClassesRecursively(group, classMap, classGroupId, theme);
    }
    return classMap;
  };
  var processClassesRecursively = (classGroup, classPartObject, classGroupId, theme) => {
    const len = classGroup.length;
    for (let i = 0; i < len; i++) {
      const classDefinition = classGroup[i];
      processClassDefinition(classDefinition, classPartObject, classGroupId, theme);
    }
  };
  var processClassDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
    if (typeof classDefinition === "string") {
      processStringDefinition(classDefinition, classPartObject, classGroupId);
      return;
    }
    if (typeof classDefinition === "function") {
      processFunctionDefinition(classDefinition, classPartObject, classGroupId, theme);
      return;
    }
    processObjectDefinition(classDefinition, classPartObject, classGroupId, theme);
  };
  var processStringDefinition = (classDefinition, classPartObject, classGroupId) => {
    const classPartObjectToEdit = classDefinition === "" ? classPartObject : getPart(classPartObject, classDefinition);
    classPartObjectToEdit.classGroupId = classGroupId;
  };
  var processFunctionDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
    if (isThemeGetter(classDefinition)) {
      processClassesRecursively(classDefinition(theme), classPartObject, classGroupId, theme);
      return;
    }
    if (classPartObject.validators === null) {
      classPartObject.validators = [];
    }
    classPartObject.validators.push(createClassValidatorObject(classGroupId, classDefinition));
  };
  var processObjectDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
    const entries = Object.entries(classDefinition);
    const len = entries.length;
    for (let i = 0; i < len; i++) {
      const [key, value] = entries[i];
      processClassesRecursively(value, getPart(classPartObject, key), classGroupId, theme);
    }
  };
  var getPart = (classPartObject, path) => {
    let current = classPartObject;
    const parts = path.split(CLASS_PART_SEPARATOR);
    const len = parts.length;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      let next = current.nextPart.get(part);
      if (!next) {
        next = createClassPartObject();
        current.nextPart.set(part, next);
      }
      current = next;
    }
    return current;
  };
  var isThemeGetter = (func) => "isThemeGetter" in func && func.isThemeGetter === true;
  var createLruCache = (maxCacheSize) => {
    if (maxCacheSize < 1) {
      return {
        get: () => void 0,
        set: () => {
        }
      };
    }
    let cacheSize = 0;
    let cache = /* @__PURE__ */ Object.create(null);
    let previousCache = /* @__PURE__ */ Object.create(null);
    const update = (key, value) => {
      cache[key] = value;
      cacheSize++;
      if (cacheSize > maxCacheSize) {
        cacheSize = 0;
        previousCache = cache;
        cache = /* @__PURE__ */ Object.create(null);
      }
    };
    return {
      get(key) {
        let value = cache[key];
        if (value !== void 0) {
          return value;
        }
        if ((value = previousCache[key]) !== void 0) {
          update(key, value);
          return value;
        }
      },
      set(key, value) {
        if (key in cache) {
          cache[key] = value;
        } else {
          update(key, value);
        }
      }
    };
  };
  var IMPORTANT_MODIFIER = "!";
  var MODIFIER_SEPARATOR = ":";
  var EMPTY_MODIFIERS = [];
  var createResultObject = (modifiers, hasImportantModifier, baseClassName, maybePostfixModifierPosition, isExternal) => ({
    modifiers,
    hasImportantModifier,
    baseClassName,
    maybePostfixModifierPosition,
    isExternal
  });
  var createParseClassName = (config) => {
    const {
      prefix,
      experimentalParseClassName
    } = config;
    let parseClassName = (className) => {
      const modifiers = [];
      let bracketDepth = 0;
      let parenDepth = 0;
      let modifierStart = 0;
      let postfixModifierPosition;
      const len = className.length;
      for (let index2 = 0; index2 < len; index2++) {
        const currentCharacter = className[index2];
        if (bracketDepth === 0 && parenDepth === 0) {
          if (currentCharacter === MODIFIER_SEPARATOR) {
            modifiers.push(className.slice(modifierStart, index2));
            modifierStart = index2 + 1;
            continue;
          }
          if (currentCharacter === "/") {
            postfixModifierPosition = index2;
            continue;
          }
        }
        if (currentCharacter === "[") bracketDepth++;
        else if (currentCharacter === "]") bracketDepth--;
        else if (currentCharacter === "(") parenDepth++;
        else if (currentCharacter === ")") parenDepth--;
      }
      const baseClassNameWithImportantModifier = modifiers.length === 0 ? className : className.slice(modifierStart);
      let baseClassName = baseClassNameWithImportantModifier;
      let hasImportantModifier = false;
      if (baseClassNameWithImportantModifier.endsWith(IMPORTANT_MODIFIER)) {
        baseClassName = baseClassNameWithImportantModifier.slice(0, -1);
        hasImportantModifier = true;
      } else if (
        /**
         * In Tailwind CSS v3 the important modifier was at the start of the base class name. This is still supported for legacy reasons.
         * @see https://github.com/dcastil/tailwind-merge/issues/513#issuecomment-2614029864
         */
        baseClassNameWithImportantModifier.startsWith(IMPORTANT_MODIFIER)
      ) {
        baseClassName = baseClassNameWithImportantModifier.slice(1);
        hasImportantModifier = true;
      }
      const maybePostfixModifierPosition = postfixModifierPosition && postfixModifierPosition > modifierStart ? postfixModifierPosition - modifierStart : void 0;
      return createResultObject(modifiers, hasImportantModifier, baseClassName, maybePostfixModifierPosition);
    };
    if (prefix) {
      const fullPrefix = prefix + MODIFIER_SEPARATOR;
      const parseClassNameOriginal = parseClassName;
      parseClassName = (className) => className.startsWith(fullPrefix) ? parseClassNameOriginal(className.slice(fullPrefix.length)) : createResultObject(EMPTY_MODIFIERS, false, className, void 0, true);
    }
    if (experimentalParseClassName) {
      const parseClassNameOriginal = parseClassName;
      parseClassName = (className) => experimentalParseClassName({
        className,
        parseClassName: parseClassNameOriginal
      });
    }
    return parseClassName;
  };
  var createSortModifiers = (config) => {
    const modifierWeights = /* @__PURE__ */ new Map();
    config.orderSensitiveModifiers.forEach((mod, index2) => {
      modifierWeights.set(mod, 1e6 + index2);
    });
    return (modifiers) => {
      const result = [];
      let currentSegment = [];
      for (let i = 0; i < modifiers.length; i++) {
        const modifier = modifiers[i];
        const isArbitrary = modifier[0] === "[";
        const isOrderSensitive = modifierWeights.has(modifier);
        if (isArbitrary || isOrderSensitive) {
          if (currentSegment.length > 0) {
            currentSegment.sort();
            result.push(...currentSegment);
            currentSegment = [];
          }
          result.push(modifier);
        } else {
          currentSegment.push(modifier);
        }
      }
      if (currentSegment.length > 0) {
        currentSegment.sort();
        result.push(...currentSegment);
      }
      return result;
    };
  };
  var createConfigUtils = (config) => ({
    cache: createLruCache(config.cacheSize),
    parseClassName: createParseClassName(config),
    sortModifiers: createSortModifiers(config),
    postfixLookupClassGroupIds: createPostfixLookupClassGroupIds(config),
    ...createClassGroupUtils(config)
  });
  var createPostfixLookupClassGroupIds = (config) => {
    const lookup = /* @__PURE__ */ Object.create(null);
    const classGroupIds = config.postfixLookupClassGroups;
    if (classGroupIds) {
      for (let i = 0; i < classGroupIds.length; i++) {
        lookup[classGroupIds[i]] = true;
      }
    }
    return lookup;
  };
  var SPLIT_CLASSES_REGEX = /\s+/;
  var mergeClassList = (classList, configUtils) => {
    const {
      parseClassName,
      getClassGroupId,
      getConflictingClassGroupIds,
      sortModifiers,
      postfixLookupClassGroupIds
    } = configUtils;
    const classGroupsInConflict = [];
    const classNames = classList.trim().split(SPLIT_CLASSES_REGEX);
    let result = "";
    for (let index2 = classNames.length - 1; index2 >= 0; index2 -= 1) {
      const originalClassName = classNames[index2];
      const {
        isExternal,
        modifiers,
        hasImportantModifier,
        baseClassName,
        maybePostfixModifierPosition
      } = parseClassName(originalClassName);
      if (isExternal) {
        result = originalClassName + (result.length > 0 ? " " + result : result);
        continue;
      }
      let hasPostfixModifier = !!maybePostfixModifierPosition;
      let classGroupId;
      if (hasPostfixModifier) {
        const baseClassNameWithoutPostfix = baseClassName.substring(0, maybePostfixModifierPosition);
        classGroupId = getClassGroupId(baseClassNameWithoutPostfix);
        const classGroupIdWithPostfix = classGroupId && postfixLookupClassGroupIds[classGroupId] ? getClassGroupId(baseClassName) : void 0;
        if (classGroupIdWithPostfix && classGroupIdWithPostfix !== classGroupId) {
          classGroupId = classGroupIdWithPostfix;
          hasPostfixModifier = false;
        }
      } else {
        classGroupId = getClassGroupId(baseClassName);
      }
      if (!classGroupId) {
        if (!hasPostfixModifier) {
          result = originalClassName + (result.length > 0 ? " " + result : result);
          continue;
        }
        classGroupId = getClassGroupId(baseClassName);
        if (!classGroupId) {
          result = originalClassName + (result.length > 0 ? " " + result : result);
          continue;
        }
        hasPostfixModifier = false;
      }
      const variantModifier = modifiers.length === 0 ? "" : modifiers.length === 1 ? modifiers[0] : sortModifiers(modifiers).join(":");
      const modifierId = hasImportantModifier ? variantModifier + IMPORTANT_MODIFIER : variantModifier;
      const classId = modifierId + classGroupId;
      if (classGroupsInConflict.indexOf(classId) > -1) {
        continue;
      }
      classGroupsInConflict.push(classId);
      const conflictGroups = getConflictingClassGroupIds(classGroupId, hasPostfixModifier);
      for (let i = 0; i < conflictGroups.length; ++i) {
        const group = conflictGroups[i];
        classGroupsInConflict.push(modifierId + group);
      }
      result = originalClassName + (result.length > 0 ? " " + result : result);
    }
    return result;
  };
  var twJoin = (...classLists) => {
    let index2 = 0;
    let argument;
    let resolvedValue;
    let string = "";
    while (index2 < classLists.length) {
      if (argument = classLists[index2++]) {
        if (resolvedValue = toValue(argument)) {
          string && (string += " ");
          string += resolvedValue;
        }
      }
    }
    return string;
  };
  var toValue = (mix) => {
    if (typeof mix === "string") {
      return mix;
    }
    let resolvedValue;
    let string = "";
    for (let k2 = 0; k2 < mix.length; k2++) {
      if (mix[k2]) {
        if (resolvedValue = toValue(mix[k2])) {
          string && (string += " ");
          string += resolvedValue;
        }
      }
    }
    return string;
  };
  var createTailwindMerge = (createConfigFirst, ...createConfigRest) => {
    let configUtils;
    let cacheGet;
    let cacheSet;
    let functionToCall;
    const initTailwindMerge = (classList) => {
      const config = createConfigRest.reduce((previousConfig, createConfigCurrent) => createConfigCurrent(previousConfig), createConfigFirst());
      configUtils = createConfigUtils(config);
      cacheGet = configUtils.cache.get;
      cacheSet = configUtils.cache.set;
      functionToCall = tailwindMerge;
      return tailwindMerge(classList);
    };
    const tailwindMerge = (classList) => {
      const cachedResult = cacheGet(classList);
      if (cachedResult) {
        return cachedResult;
      }
      const result = mergeClassList(classList, configUtils);
      cacheSet(classList, result);
      return result;
    };
    functionToCall = initTailwindMerge;
    return (...args) => functionToCall(twJoin(...args));
  };
  var fallbackThemeArr = [];
  var fromTheme = (key) => {
    const themeGetter = (theme) => theme[key] || fallbackThemeArr;
    themeGetter.isThemeGetter = true;
    themeGetter.themeKey = key;
    return themeGetter;
  };
  var arbitraryValueRegex = /^\[(?:(\w[\w-]*):)?(.+)\]$/i;
  var arbitraryVariableRegex = /^\((?:(\w[\w-]*):)?(.+)\)$/i;
  var fractionRegex = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/;
  var tshirtUnitRegex = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/;
  var lengthUnitRegex = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/;
  var colorFunctionRegex = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix|color|light-dark)\(.+\)$/;
  var shadowRegex = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/;
  var imageRegex = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/;
  var isFraction = (value) => fractionRegex.test(value);
  var isNumber = (value) => !!value && !Number.isNaN(Number(value));
  var isInteger = (value) => !!value && Number.isInteger(Number(value));
  var isPercent = (value) => value.endsWith("%") && isNumber(value.slice(0, -1));
  var isTshirtSize = (value) => tshirtUnitRegex.test(value);
  var isAny = () => true;
  var isLengthOnly = (value) => (
    // `colorFunctionRegex` check is necessary because color functions can have percentages in them which which would be incorrectly classified as lengths.
    // For example, `hsl(0 0% 0%)` would be classified as a length without this check.
    // I could also use lookbehind assertion in `lengthUnitRegex` but that isn't supported widely enough.
    lengthUnitRegex.test(value) && !colorFunctionRegex.test(value)
  );
  var isNever = () => false;
  var isShadow = (value) => shadowRegex.test(value);
  var isImage = (value) => imageRegex.test(value);
  var isAnyNonArbitrary = (value) => !isArbitraryValue(value) && !isArbitraryVariable(value);
  var isNamedContainerQuery = (value) => value.startsWith("@container") && (value[10] === "/" && value[11] !== void 0 || value[11] === "s" && value[16] !== void 0 && value.startsWith("-size/", 10) || value[11] === "n" && value[18] !== void 0 && value.startsWith("-normal/", 10));
  var isArbitrarySize = (value) => getIsArbitraryValue(value, isLabelSize, isNever);
  var isArbitraryValue = (value) => arbitraryValueRegex.test(value);
  var isArbitraryLength = (value) => getIsArbitraryValue(value, isLabelLength, isLengthOnly);
  var isArbitraryNumber = (value) => getIsArbitraryValue(value, isLabelNumber, isNumber);
  var isArbitraryWeight = (value) => getIsArbitraryValue(value, isLabelWeight, isAny);
  var isArbitraryFamilyName = (value) => getIsArbitraryValue(value, isLabelFamilyName, isNever);
  var isArbitraryPosition = (value) => getIsArbitraryValue(value, isLabelPosition, isNever);
  var isArbitraryImage = (value) => getIsArbitraryValue(value, isLabelImage, isImage);
  var isArbitraryShadow = (value) => getIsArbitraryValue(value, isLabelShadow, isShadow);
  var isArbitraryVariable = (value) => arbitraryVariableRegex.test(value);
  var isArbitraryVariableLength = (value) => getIsArbitraryVariable(value, isLabelLength);
  var isArbitraryVariableFamilyName = (value) => getIsArbitraryVariable(value, isLabelFamilyName);
  var isArbitraryVariablePosition = (value) => getIsArbitraryVariable(value, isLabelPosition);
  var isArbitraryVariableSize = (value) => getIsArbitraryVariable(value, isLabelSize);
  var isArbitraryVariableImage = (value) => getIsArbitraryVariable(value, isLabelImage);
  var isArbitraryVariableShadow = (value) => getIsArbitraryVariable(value, isLabelShadow, true);
  var isArbitraryVariableWeight = (value) => getIsArbitraryVariable(value, isLabelWeight, true);
  var getIsArbitraryValue = (value, testLabel, testValue) => {
    const result = arbitraryValueRegex.exec(value);
    if (result) {
      if (result[1]) {
        return testLabel(result[1]);
      }
      return testValue(result[2]);
    }
    return false;
  };
  var getIsArbitraryVariable = (value, testLabel, shouldMatchNoLabel = false) => {
    const result = arbitraryVariableRegex.exec(value);
    if (result) {
      if (result[1]) {
        return testLabel(result[1]);
      }
      return shouldMatchNoLabel;
    }
    return false;
  };
  var isLabelPosition = (label) => label === "position" || label === "percentage";
  var isLabelImage = (label) => label === "image" || label === "url";
  var isLabelSize = (label) => label === "length" || label === "size" || label === "bg-size";
  var isLabelLength = (label) => label === "length";
  var isLabelNumber = (label) => label === "number";
  var isLabelFamilyName = (label) => label === "family-name";
  var isLabelWeight = (label) => label === "number" || label === "weight";
  var isLabelShadow = (label) => label === "shadow";
  var getDefaultConfig = () => {
    const themeColor = fromTheme("color");
    const themeFont = fromTheme("font");
    const themeText = fromTheme("text");
    const themeFontWeight = fromTheme("font-weight");
    const themeTracking = fromTheme("tracking");
    const themeLeading = fromTheme("leading");
    const themeBreakpoint = fromTheme("breakpoint");
    const themeContainer = fromTheme("container");
    const themeSpacing = fromTheme("spacing");
    const themeRadius = fromTheme("radius");
    const themeShadow = fromTheme("shadow");
    const themeInsetShadow = fromTheme("inset-shadow");
    const themeTextShadow = fromTheme("text-shadow");
    const themeDropShadow = fromTheme("drop-shadow");
    const themeBlur = fromTheme("blur");
    const themePerspective = fromTheme("perspective");
    const themeAspect = fromTheme("aspect");
    const themeEase = fromTheme("ease");
    const themeAnimate = fromTheme("animate");
    const scaleBreak = () => ["auto", "avoid", "all", "avoid-page", "page", "left", "right", "column"];
    const scalePosition = () => [
      "center",
      "top",
      "bottom",
      "left",
      "right",
      "top-left",
      // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
      "left-top",
      "top-right",
      // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
      "right-top",
      "bottom-right",
      // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
      "right-bottom",
      "bottom-left",
      // Deprecated since Tailwind CSS v4.1.0, see https://github.com/tailwindlabs/tailwindcss/pull/17378
      "left-bottom"
    ];
    const scalePositionWithArbitrary = () => [...scalePosition(), isArbitraryVariable, isArbitraryValue];
    const scaleOverflow = () => ["auto", "hidden", "clip", "visible", "scroll"];
    const scaleOverscroll = () => ["auto", "contain", "none"];
    const scaleUnambiguousSpacing = () => [isArbitraryVariable, isArbitraryValue, themeSpacing];
    const scaleInset = () => [isFraction, "full", "auto", ...scaleUnambiguousSpacing()];
    const scaleGridTemplateColsRows = () => [isInteger, "none", "subgrid", isArbitraryVariable, isArbitraryValue];
    const scaleGridColRowStartAndEnd = () => ["auto", {
      span: ["full", isInteger, isArbitraryVariable, isArbitraryValue]
    }, isInteger, isArbitraryVariable, isArbitraryValue];
    const scaleGridColRowStartOrEnd = () => [isInteger, "auto", isArbitraryVariable, isArbitraryValue];
    const scaleGridAutoColsRows = () => ["auto", "min", "max", "fr", isArbitraryVariable, isArbitraryValue];
    const scaleAlignPrimaryAxis = () => ["start", "end", "center", "between", "around", "evenly", "stretch", "baseline", "center-safe", "end-safe"];
    const scaleAlignSecondaryAxis = () => ["start", "end", "center", "stretch", "center-safe", "end-safe"];
    const scaleMargin = () => ["auto", ...scaleUnambiguousSpacing()];
    const scaleSizing = () => [isFraction, "auto", "full", "dvw", "dvh", "lvw", "lvh", "svw", "svh", "min", "max", "fit", ...scaleUnambiguousSpacing()];
    const scaleSizingInline = () => [themeContainer, isFraction, "screen", "full", "dvw", "lvw", "svw", "min", "max", "fit", ...scaleUnambiguousSpacing()];
    const scaleSizingBlock = () => [isFraction, "screen", "full", "lh", "dvh", "lvh", "svh", "min", "max", "fit", ...scaleUnambiguousSpacing()];
    const scaleColor = () => [themeColor, isArbitraryVariable, isArbitraryValue];
    const scaleBgPosition = () => [...scalePosition(), isArbitraryVariablePosition, isArbitraryPosition, {
      position: [isArbitraryVariable, isArbitraryValue]
    }];
    const scaleBgRepeat = () => ["no-repeat", {
      repeat: ["", "x", "y", "space", "round"]
    }];
    const scaleBgSize = () => ["auto", "cover", "contain", isArbitraryVariableSize, isArbitrarySize, {
      size: [isArbitraryVariable, isArbitraryValue]
    }];
    const scaleGradientStopPosition = () => [isPercent, isArbitraryVariableLength, isArbitraryLength];
    const scaleRadius = () => [
      // Deprecated since Tailwind CSS v4.0.0
      "",
      "none",
      "full",
      themeRadius,
      isArbitraryVariable,
      isArbitraryValue
    ];
    const scaleBorderWidth = () => ["", isNumber, isArbitraryVariableLength, isArbitraryLength];
    const scaleLineStyle = () => ["solid", "dashed", "dotted", "double"];
    const scaleBlendMode = () => ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];
    const scaleMaskImagePosition = () => [isNumber, isPercent, isArbitraryVariablePosition, isArbitraryPosition];
    const scaleBlur = () => [
      // Deprecated since Tailwind CSS v4.0.0
      "",
      "none",
      themeBlur,
      isArbitraryVariable,
      isArbitraryValue
    ];
    const scaleRotate = () => ["none", isNumber, isArbitraryVariable, isArbitraryValue];
    const scaleScale = () => ["none", isNumber, isArbitraryVariable, isArbitraryValue];
    const scaleSkew = () => [isNumber, isArbitraryVariable, isArbitraryValue];
    const scaleTranslate = () => [isFraction, "full", ...scaleUnambiguousSpacing()];
    return {
      cacheSize: 500,
      theme: {
        animate: ["spin", "ping", "pulse", "bounce"],
        aspect: ["video"],
        blur: [isTshirtSize],
        breakpoint: [isTshirtSize],
        color: [isAny],
        container: [isTshirtSize],
        "drop-shadow": [isTshirtSize],
        ease: ["in", "out", "in-out"],
        font: [isAnyNonArbitrary],
        "font-weight": ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"],
        "inset-shadow": [isTshirtSize],
        leading: ["none", "tight", "snug", "normal", "relaxed", "loose"],
        perspective: ["dramatic", "near", "normal", "midrange", "distant", "none"],
        radius: [isTshirtSize],
        shadow: [isTshirtSize],
        spacing: ["px", isNumber],
        text: [isTshirtSize],
        "text-shadow": [isTshirtSize],
        tracking: ["tighter", "tight", "normal", "wide", "wider", "widest"]
      },
      classGroups: {
        // --------------
        // --- Layout ---
        // --------------
        /**
         * Aspect Ratio
         * @see https://tailwindcss.com/docs/aspect-ratio
         */
        aspect: [{
          aspect: ["auto", "square", isFraction, isArbitraryValue, isArbitraryVariable, themeAspect]
        }],
        /**
         * Container
         * @see https://tailwindcss.com/docs/container
         * @deprecated since Tailwind CSS v4.0.0
         */
        container: ["container"],
        /**
         * Container Type
         * @see https://tailwindcss.com/docs/responsive-design#container-queries
         */
        "container-type": [{
          "@container": ["", "normal", "size", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Container Name
         * @see https://tailwindcss.com/docs/responsive-design#named-containers
         */
        "container-named": [isNamedContainerQuery],
        /**
         * Columns
         * @see https://tailwindcss.com/docs/columns
         */
        columns: [{
          columns: [isNumber, "auto", isArbitraryValue, isArbitraryVariable, themeContainer]
        }],
        /**
         * Break After
         * @see https://tailwindcss.com/docs/break-after
         */
        "break-after": [{
          "break-after": scaleBreak()
        }],
        /**
         * Break Before
         * @see https://tailwindcss.com/docs/break-before
         */
        "break-before": [{
          "break-before": scaleBreak()
        }],
        /**
         * Break Inside
         * @see https://tailwindcss.com/docs/break-inside
         */
        "break-inside": [{
          "break-inside": ["auto", "avoid", "avoid-page", "avoid-column"]
        }],
        /**
         * Box Decoration Break
         * @see https://tailwindcss.com/docs/box-decoration-break
         */
        "box-decoration": [{
          "box-decoration": ["slice", "clone"]
        }],
        /**
         * Box Sizing
         * @see https://tailwindcss.com/docs/box-sizing
         */
        box: [{
          box: ["border", "content"]
        }],
        /**
         * Display
         * @see https://tailwindcss.com/docs/display
         */
        display: ["block", "inline-block", "inline", "flex", "inline-flex", "table", "inline-table", "table-caption", "table-cell", "table-column", "table-column-group", "table-footer-group", "table-header-group", "table-row-group", "table-row", "flow-root", "grid", "inline-grid", "contents", "list-item", "hidden"],
        /**
         * Screen Reader Only
         * @see https://tailwindcss.com/docs/display#screen-reader-only
         */
        sr: ["sr-only", "not-sr-only"],
        /**
         * Floats
         * @see https://tailwindcss.com/docs/float
         */
        float: [{
          float: ["right", "left", "none", "start", "end"]
        }],
        /**
         * Clear
         * @see https://tailwindcss.com/docs/clear
         */
        clear: [{
          clear: ["left", "right", "both", "none", "start", "end"]
        }],
        /**
         * Isolation
         * @see https://tailwindcss.com/docs/isolation
         */
        isolation: ["isolate", "isolation-auto"],
        /**
         * Object Fit
         * @see https://tailwindcss.com/docs/object-fit
         */
        "object-fit": [{
          object: ["contain", "cover", "fill", "none", "scale-down"]
        }],
        /**
         * Object Position
         * @see https://tailwindcss.com/docs/object-position
         */
        "object-position": [{
          object: scalePositionWithArbitrary()
        }],
        /**
         * Overflow
         * @see https://tailwindcss.com/docs/overflow
         */
        overflow: [{
          overflow: scaleOverflow()
        }],
        /**
         * Overflow X
         * @see https://tailwindcss.com/docs/overflow
         */
        "overflow-x": [{
          "overflow-x": scaleOverflow()
        }],
        /**
         * Overflow Y
         * @see https://tailwindcss.com/docs/overflow
         */
        "overflow-y": [{
          "overflow-y": scaleOverflow()
        }],
        /**
         * Overscroll Behavior
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        overscroll: [{
          overscroll: scaleOverscroll()
        }],
        /**
         * Overscroll Behavior X
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        "overscroll-x": [{
          "overscroll-x": scaleOverscroll()
        }],
        /**
         * Overscroll Behavior Y
         * @see https://tailwindcss.com/docs/overscroll-behavior
         */
        "overscroll-y": [{
          "overscroll-y": scaleOverscroll()
        }],
        /**
         * Position
         * @see https://tailwindcss.com/docs/position
         */
        position: ["static", "fixed", "absolute", "relative", "sticky"],
        /**
         * Inset
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        inset: [{
          inset: scaleInset()
        }],
        /**
         * Inset Inline
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-x": [{
          "inset-x": scaleInset()
        }],
        /**
         * Inset Block
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-y": [{
          "inset-y": scaleInset()
        }],
        /**
         * Inset Inline Start
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         * @todo class group will be renamed to `inset-s` in next major release
         */
        start: [{
          "inset-s": scaleInset(),
          /**
           * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-s-*` utilities.
           * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
           */
          start: scaleInset()
        }],
        /**
         * Inset Inline End
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         * @todo class group will be renamed to `inset-e` in next major release
         */
        end: [{
          "inset-e": scaleInset(),
          /**
           * @deprecated since Tailwind CSS v4.2.0 in favor of `inset-e-*` utilities.
           * @see https://github.com/tailwindlabs/tailwindcss/pull/19613
           */
          end: scaleInset()
        }],
        /**
         * Inset Block Start
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-bs": [{
          "inset-bs": scaleInset()
        }],
        /**
         * Inset Block End
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        "inset-be": [{
          "inset-be": scaleInset()
        }],
        /**
         * Top
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        top: [{
          top: scaleInset()
        }],
        /**
         * Right
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        right: [{
          right: scaleInset()
        }],
        /**
         * Bottom
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        bottom: [{
          bottom: scaleInset()
        }],
        /**
         * Left
         * @see https://tailwindcss.com/docs/top-right-bottom-left
         */
        left: [{
          left: scaleInset()
        }],
        /**
         * Visibility
         * @see https://tailwindcss.com/docs/visibility
         */
        visibility: ["visible", "invisible", "collapse"],
        /**
         * Z-Index
         * @see https://tailwindcss.com/docs/z-index
         */
        z: [{
          z: [isInteger, "auto", isArbitraryVariable, isArbitraryValue]
        }],
        // ------------------------
        // --- Flexbox and Grid ---
        // ------------------------
        /**
         * Flex Basis
         * @see https://tailwindcss.com/docs/flex-basis
         */
        basis: [{
          basis: [isFraction, "full", "auto", themeContainer, ...scaleUnambiguousSpacing()]
        }],
        /**
         * Flex Direction
         * @see https://tailwindcss.com/docs/flex-direction
         */
        "flex-direction": [{
          flex: ["row", "row-reverse", "col", "col-reverse"]
        }],
        /**
         * Flex Wrap
         * @see https://tailwindcss.com/docs/flex-wrap
         */
        "flex-wrap": [{
          flex: ["nowrap", "wrap", "wrap-reverse"]
        }],
        /**
         * Flex
         * @see https://tailwindcss.com/docs/flex
         */
        flex: [{
          flex: [isNumber, isFraction, "auto", "initial", "none", isArbitraryValue]
        }],
        /**
         * Flex Grow
         * @see https://tailwindcss.com/docs/flex-grow
         */
        grow: [{
          grow: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Flex Shrink
         * @see https://tailwindcss.com/docs/flex-shrink
         */
        shrink: [{
          shrink: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Order
         * @see https://tailwindcss.com/docs/order
         */
        order: [{
          order: [isInteger, "first", "last", "none", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Grid Template Columns
         * @see https://tailwindcss.com/docs/grid-template-columns
         */
        "grid-cols": [{
          "grid-cols": scaleGridTemplateColsRows()
        }],
        /**
         * Grid Column Start / End
         * @see https://tailwindcss.com/docs/grid-column
         */
        "col-start-end": [{
          col: scaleGridColRowStartAndEnd()
        }],
        /**
         * Grid Column Start
         * @see https://tailwindcss.com/docs/grid-column
         */
        "col-start": [{
          "col-start": scaleGridColRowStartOrEnd()
        }],
        /**
         * Grid Column End
         * @see https://tailwindcss.com/docs/grid-column
         */
        "col-end": [{
          "col-end": scaleGridColRowStartOrEnd()
        }],
        /**
         * Grid Template Rows
         * @see https://tailwindcss.com/docs/grid-template-rows
         */
        "grid-rows": [{
          "grid-rows": scaleGridTemplateColsRows()
        }],
        /**
         * Grid Row Start / End
         * @see https://tailwindcss.com/docs/grid-row
         */
        "row-start-end": [{
          row: scaleGridColRowStartAndEnd()
        }],
        /**
         * Grid Row Start
         * @see https://tailwindcss.com/docs/grid-row
         */
        "row-start": [{
          "row-start": scaleGridColRowStartOrEnd()
        }],
        /**
         * Grid Row End
         * @see https://tailwindcss.com/docs/grid-row
         */
        "row-end": [{
          "row-end": scaleGridColRowStartOrEnd()
        }],
        /**
         * Grid Auto Flow
         * @see https://tailwindcss.com/docs/grid-auto-flow
         */
        "grid-flow": [{
          "grid-flow": ["row", "col", "dense", "row-dense", "col-dense"]
        }],
        /**
         * Grid Auto Columns
         * @see https://tailwindcss.com/docs/grid-auto-columns
         */
        "auto-cols": [{
          "auto-cols": scaleGridAutoColsRows()
        }],
        /**
         * Grid Auto Rows
         * @see https://tailwindcss.com/docs/grid-auto-rows
         */
        "auto-rows": [{
          "auto-rows": scaleGridAutoColsRows()
        }],
        /**
         * Gap
         * @see https://tailwindcss.com/docs/gap
         */
        gap: [{
          gap: scaleUnambiguousSpacing()
        }],
        /**
         * Gap X
         * @see https://tailwindcss.com/docs/gap
         */
        "gap-x": [{
          "gap-x": scaleUnambiguousSpacing()
        }],
        /**
         * Gap Y
         * @see https://tailwindcss.com/docs/gap
         */
        "gap-y": [{
          "gap-y": scaleUnambiguousSpacing()
        }],
        /**
         * Justify Content
         * @see https://tailwindcss.com/docs/justify-content
         */
        "justify-content": [{
          justify: [...scaleAlignPrimaryAxis(), "normal"]
        }],
        /**
         * Justify Items
         * @see https://tailwindcss.com/docs/justify-items
         */
        "justify-items": [{
          "justify-items": [...scaleAlignSecondaryAxis(), "normal"]
        }],
        /**
         * Justify Self
         * @see https://tailwindcss.com/docs/justify-self
         */
        "justify-self": [{
          "justify-self": ["auto", ...scaleAlignSecondaryAxis()]
        }],
        /**
         * Align Content
         * @see https://tailwindcss.com/docs/align-content
         */
        "align-content": [{
          content: ["normal", ...scaleAlignPrimaryAxis()]
        }],
        /**
         * Align Items
         * @see https://tailwindcss.com/docs/align-items
         */
        "align-items": [{
          items: [...scaleAlignSecondaryAxis(), {
            baseline: ["", "last"]
          }]
        }],
        /**
         * Align Self
         * @see https://tailwindcss.com/docs/align-self
         */
        "align-self": [{
          self: ["auto", ...scaleAlignSecondaryAxis(), {
            baseline: ["", "last"]
          }]
        }],
        /**
         * Place Content
         * @see https://tailwindcss.com/docs/place-content
         */
        "place-content": [{
          "place-content": scaleAlignPrimaryAxis()
        }],
        /**
         * Place Items
         * @see https://tailwindcss.com/docs/place-items
         */
        "place-items": [{
          "place-items": [...scaleAlignSecondaryAxis(), "baseline"]
        }],
        /**
         * Place Self
         * @see https://tailwindcss.com/docs/place-self
         */
        "place-self": [{
          "place-self": ["auto", ...scaleAlignSecondaryAxis()]
        }],
        // Spacing
        /**
         * Padding
         * @see https://tailwindcss.com/docs/padding
         */
        p: [{
          p: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Inline
         * @see https://tailwindcss.com/docs/padding
         */
        px: [{
          px: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Block
         * @see https://tailwindcss.com/docs/padding
         */
        py: [{
          py: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Inline Start
         * @see https://tailwindcss.com/docs/padding
         */
        ps: [{
          ps: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Inline End
         * @see https://tailwindcss.com/docs/padding
         */
        pe: [{
          pe: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Block Start
         * @see https://tailwindcss.com/docs/padding
         */
        pbs: [{
          pbs: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Block End
         * @see https://tailwindcss.com/docs/padding
         */
        pbe: [{
          pbe: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Top
         * @see https://tailwindcss.com/docs/padding
         */
        pt: [{
          pt: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Right
         * @see https://tailwindcss.com/docs/padding
         */
        pr: [{
          pr: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Bottom
         * @see https://tailwindcss.com/docs/padding
         */
        pb: [{
          pb: scaleUnambiguousSpacing()
        }],
        /**
         * Padding Left
         * @see https://tailwindcss.com/docs/padding
         */
        pl: [{
          pl: scaleUnambiguousSpacing()
        }],
        /**
         * Margin
         * @see https://tailwindcss.com/docs/margin
         */
        m: [{
          m: scaleMargin()
        }],
        /**
         * Margin Inline
         * @see https://tailwindcss.com/docs/margin
         */
        mx: [{
          mx: scaleMargin()
        }],
        /**
         * Margin Block
         * @see https://tailwindcss.com/docs/margin
         */
        my: [{
          my: scaleMargin()
        }],
        /**
         * Margin Inline Start
         * @see https://tailwindcss.com/docs/margin
         */
        ms: [{
          ms: scaleMargin()
        }],
        /**
         * Margin Inline End
         * @see https://tailwindcss.com/docs/margin
         */
        me: [{
          me: scaleMargin()
        }],
        /**
         * Margin Block Start
         * @see https://tailwindcss.com/docs/margin
         */
        mbs: [{
          mbs: scaleMargin()
        }],
        /**
         * Margin Block End
         * @see https://tailwindcss.com/docs/margin
         */
        mbe: [{
          mbe: scaleMargin()
        }],
        /**
         * Margin Top
         * @see https://tailwindcss.com/docs/margin
         */
        mt: [{
          mt: scaleMargin()
        }],
        /**
         * Margin Right
         * @see https://tailwindcss.com/docs/margin
         */
        mr: [{
          mr: scaleMargin()
        }],
        /**
         * Margin Bottom
         * @see https://tailwindcss.com/docs/margin
         */
        mb: [{
          mb: scaleMargin()
        }],
        /**
         * Margin Left
         * @see https://tailwindcss.com/docs/margin
         */
        ml: [{
          ml: scaleMargin()
        }],
        /**
         * Space Between X
         * @see https://tailwindcss.com/docs/margin#adding-space-between-children
         */
        "space-x": [{
          "space-x": scaleUnambiguousSpacing()
        }],
        /**
         * Space Between X Reverse
         * @see https://tailwindcss.com/docs/margin#adding-space-between-children
         */
        "space-x-reverse": ["space-x-reverse"],
        /**
         * Space Between Y
         * @see https://tailwindcss.com/docs/margin#adding-space-between-children
         */
        "space-y": [{
          "space-y": scaleUnambiguousSpacing()
        }],
        /**
         * Space Between Y Reverse
         * @see https://tailwindcss.com/docs/margin#adding-space-between-children
         */
        "space-y-reverse": ["space-y-reverse"],
        // --------------
        // --- Sizing ---
        // --------------
        /**
         * Size
         * @see https://tailwindcss.com/docs/width#setting-both-width-and-height
         */
        size: [{
          size: scaleSizing()
        }],
        /**
         * Inline Size
         * @see https://tailwindcss.com/docs/inline-size
         */
        "inline-size": [{
          inline: ["auto", ...scaleSizingInline()]
        }],
        /**
         * Min-Inline Size
         * @see https://tailwindcss.com/docs/min-inline-size
         */
        "min-inline-size": [{
          "min-inline": ["auto", ...scaleSizingInline()]
        }],
        /**
         * Max-Inline Size
         * @see https://tailwindcss.com/docs/max-inline-size
         */
        "max-inline-size": [{
          "max-inline": ["none", ...scaleSizingInline()]
        }],
        /**
         * Block Size
         * @see https://tailwindcss.com/docs/block-size
         */
        "block-size": [{
          block: ["auto", ...scaleSizingBlock()]
        }],
        /**
         * Min-Block Size
         * @see https://tailwindcss.com/docs/min-block-size
         */
        "min-block-size": [{
          "min-block": ["auto", ...scaleSizingBlock()]
        }],
        /**
         * Max-Block Size
         * @see https://tailwindcss.com/docs/max-block-size
         */
        "max-block-size": [{
          "max-block": ["none", ...scaleSizingBlock()]
        }],
        /**
         * Width
         * @see https://tailwindcss.com/docs/width
         */
        w: [{
          w: [themeContainer, "screen", ...scaleSizing()]
        }],
        /**
         * Min-Width
         * @see https://tailwindcss.com/docs/min-width
         */
        "min-w": [{
          "min-w": [
            themeContainer,
            "screen",
            /** Deprecated. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
            "none",
            ...scaleSizing()
          ]
        }],
        /**
         * Max-Width
         * @see https://tailwindcss.com/docs/max-width
         */
        "max-w": [{
          "max-w": [
            themeContainer,
            "screen",
            "none",
            /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
            "prose",
            /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
            {
              screen: [themeBreakpoint]
            },
            ...scaleSizing()
          ]
        }],
        /**
         * Height
         * @see https://tailwindcss.com/docs/height
         */
        h: [{
          h: ["screen", "lh", ...scaleSizing()]
        }],
        /**
         * Min-Height
         * @see https://tailwindcss.com/docs/min-height
         */
        "min-h": [{
          "min-h": ["screen", "lh", "none", ...scaleSizing()]
        }],
        /**
         * Max-Height
         * @see https://tailwindcss.com/docs/max-height
         */
        "max-h": [{
          "max-h": ["screen", "lh", "none", ...scaleSizing()]
        }],
        // ------------------
        // --- Typography ---
        // ------------------
        /**
         * Font Size
         * @see https://tailwindcss.com/docs/font-size
         */
        "font-size": [{
          text: ["base", themeText, isArbitraryVariableLength, isArbitraryLength]
        }],
        /**
         * Font Smoothing
         * @see https://tailwindcss.com/docs/font-smoothing
         */
        "font-smoothing": ["antialiased", "subpixel-antialiased"],
        /**
         * Font Style
         * @see https://tailwindcss.com/docs/font-style
         */
        "font-style": ["italic", "not-italic"],
        /**
         * Font Weight
         * @see https://tailwindcss.com/docs/font-weight
         */
        "font-weight": [{
          font: [themeFontWeight, isArbitraryVariableWeight, isArbitraryWeight]
        }],
        /**
         * Font Stretch
         * @see https://tailwindcss.com/docs/font-stretch
         */
        "font-stretch": [{
          "font-stretch": ["ultra-condensed", "extra-condensed", "condensed", "semi-condensed", "normal", "semi-expanded", "expanded", "extra-expanded", "ultra-expanded", isPercent, isArbitraryValue]
        }],
        /**
         * Font Family
         * @see https://tailwindcss.com/docs/font-family
         */
        "font-family": [{
          font: [isArbitraryVariableFamilyName, isArbitraryFamilyName, themeFont]
        }],
        /**
         * Font Feature Settings
         * @see https://tailwindcss.com/docs/font-feature-settings
         */
        "font-features": [{
          "font-features": [isArbitraryValue]
        }],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-normal": ["normal-nums"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-ordinal": ["ordinal"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-slashed-zero": ["slashed-zero"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-figure": ["lining-nums", "oldstyle-nums"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-spacing": ["proportional-nums", "tabular-nums"],
        /**
         * Font Variant Numeric
         * @see https://tailwindcss.com/docs/font-variant-numeric
         */
        "fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
        /**
         * Letter Spacing
         * @see https://tailwindcss.com/docs/letter-spacing
         */
        tracking: [{
          tracking: [themeTracking, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Line Clamp
         * @see https://tailwindcss.com/docs/line-clamp
         */
        "line-clamp": [{
          "line-clamp": [isNumber, "none", isArbitraryVariable, isArbitraryNumber]
        }],
        /**
         * Line Height
         * @see https://tailwindcss.com/docs/line-height
         */
        leading: [{
          leading: [
            "none",
            /** Deprecated since Tailwind CSS v4.0.0. @see https://github.com/tailwindlabs/tailwindcss.com/issues/2027#issuecomment-2620152757 */
            themeLeading,
            ...scaleUnambiguousSpacing()
          ]
        }],
        /**
         * List Style Image
         * @see https://tailwindcss.com/docs/list-style-image
         */
        "list-image": [{
          "list-image": ["none", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * List Style Position
         * @see https://tailwindcss.com/docs/list-style-position
         */
        "list-style-position": [{
          list: ["inside", "outside"]
        }],
        /**
         * List Style Type
         * @see https://tailwindcss.com/docs/list-style-type
         */
        "list-style-type": [{
          list: ["disc", "decimal", "none", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Text Alignment
         * @see https://tailwindcss.com/docs/text-align
         */
        "text-alignment": [{
          text: ["left", "center", "right", "justify", "start", "end"]
        }],
        /**
         * Placeholder Color
         * @deprecated since Tailwind CSS v3.0.0
         * @see https://v3.tailwindcss.com/docs/placeholder-color
         */
        "placeholder-color": [{
          placeholder: scaleColor()
        }],
        /**
         * Text Color
         * @see https://tailwindcss.com/docs/text-color
         */
        "text-color": [{
          text: scaleColor()
        }],
        /**
         * Text Decoration
         * @see https://tailwindcss.com/docs/text-decoration
         */
        "text-decoration": ["underline", "overline", "line-through", "no-underline"],
        /**
         * Text Decoration Style
         * @see https://tailwindcss.com/docs/text-decoration-style
         */
        "text-decoration-style": [{
          decoration: [...scaleLineStyle(), "wavy"]
        }],
        /**
         * Text Decoration Thickness
         * @see https://tailwindcss.com/docs/text-decoration-thickness
         */
        "text-decoration-thickness": [{
          decoration: [isNumber, "from-font", "auto", isArbitraryVariable, isArbitraryLength]
        }],
        /**
         * Text Decoration Color
         * @see https://tailwindcss.com/docs/text-decoration-color
         */
        "text-decoration-color": [{
          decoration: scaleColor()
        }],
        /**
         * Text Underline Offset
         * @see https://tailwindcss.com/docs/text-underline-offset
         */
        "underline-offset": [{
          "underline-offset": [isNumber, "auto", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Text Transform
         * @see https://tailwindcss.com/docs/text-transform
         */
        "text-transform": ["uppercase", "lowercase", "capitalize", "normal-case"],
        /**
         * Text Overflow
         * @see https://tailwindcss.com/docs/text-overflow
         */
        "text-overflow": ["truncate", "text-ellipsis", "text-clip"],
        /**
         * Text Wrap
         * @see https://tailwindcss.com/docs/text-wrap
         */
        "text-wrap": [{
          text: ["wrap", "nowrap", "balance", "pretty"]
        }],
        /**
         * Text Indent
         * @see https://tailwindcss.com/docs/text-indent
         */
        indent: [{
          indent: scaleUnambiguousSpacing()
        }],
        /**
         * Tab Size
         * @see https://tailwindcss.com/docs/tab-size
         */
        "tab-size": [{
          tab: [isInteger, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Vertical Alignment
         * @see https://tailwindcss.com/docs/vertical-align
         */
        "vertical-align": [{
          align: ["baseline", "top", "middle", "bottom", "text-top", "text-bottom", "sub", "super", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Whitespace
         * @see https://tailwindcss.com/docs/whitespace
         */
        whitespace: [{
          whitespace: ["normal", "nowrap", "pre", "pre-line", "pre-wrap", "break-spaces"]
        }],
        /**
         * Word Break
         * @see https://tailwindcss.com/docs/word-break
         */
        break: [{
          break: ["normal", "words", "all", "keep"]
        }],
        /**
         * Overflow Wrap
         * @see https://tailwindcss.com/docs/overflow-wrap
         */
        wrap: [{
          wrap: ["break-word", "anywhere", "normal"]
        }],
        /**
         * Hyphens
         * @see https://tailwindcss.com/docs/hyphens
         */
        hyphens: [{
          hyphens: ["none", "manual", "auto"]
        }],
        /**
         * Content
         * @see https://tailwindcss.com/docs/content
         */
        content: [{
          content: ["none", isArbitraryVariable, isArbitraryValue]
        }],
        // -------------------
        // --- Backgrounds ---
        // -------------------
        /**
         * Background Attachment
         * @see https://tailwindcss.com/docs/background-attachment
         */
        "bg-attachment": [{
          bg: ["fixed", "local", "scroll"]
        }],
        /**
         * Background Clip
         * @see https://tailwindcss.com/docs/background-clip
         */
        "bg-clip": [{
          "bg-clip": ["border", "padding", "content", "text"]
        }],
        /**
         * Background Origin
         * @see https://tailwindcss.com/docs/background-origin
         */
        "bg-origin": [{
          "bg-origin": ["border", "padding", "content"]
        }],
        /**
         * Background Position
         * @see https://tailwindcss.com/docs/background-position
         */
        "bg-position": [{
          bg: scaleBgPosition()
        }],
        /**
         * Background Repeat
         * @see https://tailwindcss.com/docs/background-repeat
         */
        "bg-repeat": [{
          bg: scaleBgRepeat()
        }],
        /**
         * Background Size
         * @see https://tailwindcss.com/docs/background-size
         */
        "bg-size": [{
          bg: scaleBgSize()
        }],
        /**
         * Background Image
         * @see https://tailwindcss.com/docs/background-image
         */
        "bg-image": [{
          bg: ["none", {
            linear: [{
              to: ["t", "tr", "r", "br", "b", "bl", "l", "tl"]
            }, isInteger, isArbitraryVariable, isArbitraryValue],
            radial: ["", isArbitraryVariable, isArbitraryValue],
            conic: ["", isInteger, isArbitraryVariable, isArbitraryValue]
          }, isArbitraryVariableImage, isArbitraryImage]
        }],
        /**
         * Background Color
         * @see https://tailwindcss.com/docs/background-color
         */
        "bg-color": [{
          bg: scaleColor()
        }],
        /**
         * Gradient Color Stops From Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-from-pos": [{
          from: scaleGradientStopPosition()
        }],
        /**
         * Gradient Color Stops Via Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-via-pos": [{
          via: scaleGradientStopPosition()
        }],
        /**
         * Gradient Color Stops To Position
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-to-pos": [{
          to: scaleGradientStopPosition()
        }],
        /**
         * Gradient Color Stops From
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-from": [{
          from: scaleColor()
        }],
        /**
         * Gradient Color Stops Via
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-via": [{
          via: scaleColor()
        }],
        /**
         * Gradient Color Stops To
         * @see https://tailwindcss.com/docs/gradient-color-stops
         */
        "gradient-to": [{
          to: scaleColor()
        }],
        // ---------------
        // --- Borders ---
        // ---------------
        /**
         * Border Radius
         * @see https://tailwindcss.com/docs/border-radius
         */
        rounded: [{
          rounded: scaleRadius()
        }],
        /**
         * Border Radius Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-s": [{
          "rounded-s": scaleRadius()
        }],
        /**
         * Border Radius End
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-e": [{
          "rounded-e": scaleRadius()
        }],
        /**
         * Border Radius Top
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-t": [{
          "rounded-t": scaleRadius()
        }],
        /**
         * Border Radius Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-r": [{
          "rounded-r": scaleRadius()
        }],
        /**
         * Border Radius Bottom
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-b": [{
          "rounded-b": scaleRadius()
        }],
        /**
         * Border Radius Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-l": [{
          "rounded-l": scaleRadius()
        }],
        /**
         * Border Radius Start Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-ss": [{
          "rounded-ss": scaleRadius()
        }],
        /**
         * Border Radius Start End
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-se": [{
          "rounded-se": scaleRadius()
        }],
        /**
         * Border Radius End End
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-ee": [{
          "rounded-ee": scaleRadius()
        }],
        /**
         * Border Radius End Start
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-es": [{
          "rounded-es": scaleRadius()
        }],
        /**
         * Border Radius Top Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-tl": [{
          "rounded-tl": scaleRadius()
        }],
        /**
         * Border Radius Top Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-tr": [{
          "rounded-tr": scaleRadius()
        }],
        /**
         * Border Radius Bottom Right
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-br": [{
          "rounded-br": scaleRadius()
        }],
        /**
         * Border Radius Bottom Left
         * @see https://tailwindcss.com/docs/border-radius
         */
        "rounded-bl": [{
          "rounded-bl": scaleRadius()
        }],
        /**
         * Border Width
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w": [{
          border: scaleBorderWidth()
        }],
        /**
         * Border Width Inline
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-x": [{
          "border-x": scaleBorderWidth()
        }],
        /**
         * Border Width Block
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-y": [{
          "border-y": scaleBorderWidth()
        }],
        /**
         * Border Width Inline Start
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-s": [{
          "border-s": scaleBorderWidth()
        }],
        /**
         * Border Width Inline End
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-e": [{
          "border-e": scaleBorderWidth()
        }],
        /**
         * Border Width Block Start
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-bs": [{
          "border-bs": scaleBorderWidth()
        }],
        /**
         * Border Width Block End
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-be": [{
          "border-be": scaleBorderWidth()
        }],
        /**
         * Border Width Top
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-t": [{
          "border-t": scaleBorderWidth()
        }],
        /**
         * Border Width Right
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-r": [{
          "border-r": scaleBorderWidth()
        }],
        /**
         * Border Width Bottom
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-b": [{
          "border-b": scaleBorderWidth()
        }],
        /**
         * Border Width Left
         * @see https://tailwindcss.com/docs/border-width
         */
        "border-w-l": [{
          "border-l": scaleBorderWidth()
        }],
        /**
         * Divide Width X
         * @see https://tailwindcss.com/docs/border-width#between-children
         */
        "divide-x": [{
          "divide-x": scaleBorderWidth()
        }],
        /**
         * Divide Width X Reverse
         * @see https://tailwindcss.com/docs/border-width#between-children
         */
        "divide-x-reverse": ["divide-x-reverse"],
        /**
         * Divide Width Y
         * @see https://tailwindcss.com/docs/border-width#between-children
         */
        "divide-y": [{
          "divide-y": scaleBorderWidth()
        }],
        /**
         * Divide Width Y Reverse
         * @see https://tailwindcss.com/docs/border-width#between-children
         */
        "divide-y-reverse": ["divide-y-reverse"],
        /**
         * Border Style
         * @see https://tailwindcss.com/docs/border-style
         */
        "border-style": [{
          border: [...scaleLineStyle(), "hidden", "none"]
        }],
        /**
         * Divide Style
         * @see https://tailwindcss.com/docs/border-style#setting-the-divider-style
         */
        "divide-style": [{
          divide: [...scaleLineStyle(), "hidden", "none"]
        }],
        /**
         * Border Color
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color": [{
          border: scaleColor()
        }],
        /**
         * Border Color Inline
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-x": [{
          "border-x": scaleColor()
        }],
        /**
         * Border Color Block
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-y": [{
          "border-y": scaleColor()
        }],
        /**
         * Border Color Inline Start
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-s": [{
          "border-s": scaleColor()
        }],
        /**
         * Border Color Inline End
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-e": [{
          "border-e": scaleColor()
        }],
        /**
         * Border Color Block Start
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-bs": [{
          "border-bs": scaleColor()
        }],
        /**
         * Border Color Block End
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-be": [{
          "border-be": scaleColor()
        }],
        /**
         * Border Color Top
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-t": [{
          "border-t": scaleColor()
        }],
        /**
         * Border Color Right
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-r": [{
          "border-r": scaleColor()
        }],
        /**
         * Border Color Bottom
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-b": [{
          "border-b": scaleColor()
        }],
        /**
         * Border Color Left
         * @see https://tailwindcss.com/docs/border-color
         */
        "border-color-l": [{
          "border-l": scaleColor()
        }],
        /**
         * Divide Color
         * @see https://tailwindcss.com/docs/divide-color
         */
        "divide-color": [{
          divide: scaleColor()
        }],
        /**
         * Outline Style
         * @see https://tailwindcss.com/docs/outline-style
         */
        "outline-style": [{
          outline: [...scaleLineStyle(), "none", "hidden"]
        }],
        /**
         * Outline Offset
         * @see https://tailwindcss.com/docs/outline-offset
         */
        "outline-offset": [{
          "outline-offset": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Outline Width
         * @see https://tailwindcss.com/docs/outline-width
         */
        "outline-w": [{
          outline: ["", isNumber, isArbitraryVariableLength, isArbitraryLength]
        }],
        /**
         * Outline Color
         * @see https://tailwindcss.com/docs/outline-color
         */
        "outline-color": [{
          outline: scaleColor()
        }],
        // ---------------
        // --- Effects ---
        // ---------------
        /**
         * Box Shadow
         * @see https://tailwindcss.com/docs/box-shadow
         */
        shadow: [{
          shadow: [
            // Deprecated since Tailwind CSS v4.0.0
            "",
            // Deprecated since Tailwind CSS v4.0.0
            "inner",
            "none",
            themeShadow,
            isArbitraryVariableShadow,
            isArbitraryShadow
          ]
        }],
        /**
         * Box Shadow Color
         * @see https://tailwindcss.com/docs/box-shadow#setting-the-shadow-color
         */
        "shadow-color": [{
          shadow: scaleColor()
        }],
        /**
         * Inset Box Shadow
         * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-shadow
         */
        "inset-shadow": [{
          "inset-shadow": ["none", themeInsetShadow, isArbitraryVariableShadow, isArbitraryShadow]
        }],
        /**
         * Inset Box Shadow Color
         * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-shadow-color
         */
        "inset-shadow-color": [{
          "inset-shadow": scaleColor()
        }],
        /**
         * Ring Width
         * @see https://tailwindcss.com/docs/box-shadow#adding-a-ring
         */
        "ring-w": [{
          ring: scaleBorderWidth()
        }],
        /**
         * Ring Width Inset
         * @see https://v3.tailwindcss.com/docs/ring-width#inset-rings
         * @deprecated since Tailwind CSS v4.0.0
         * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
         */
        "ring-w-inset": ["ring-inset"],
        /**
         * Ring Color
         * @see https://tailwindcss.com/docs/box-shadow#setting-the-ring-color
         */
        "ring-color": [{
          ring: scaleColor()
        }],
        /**
         * Ring Offset Width
         * @see https://v3.tailwindcss.com/docs/ring-offset-width
         * @deprecated since Tailwind CSS v4.0.0
         * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
         */
        "ring-offset-w": [{
          "ring-offset": [isNumber, isArbitraryLength]
        }],
        /**
         * Ring Offset Color
         * @see https://v3.tailwindcss.com/docs/ring-offset-color
         * @deprecated since Tailwind CSS v4.0.0
         * @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
         */
        "ring-offset-color": [{
          "ring-offset": scaleColor()
        }],
        /**
         * Inset Ring Width
         * @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-ring
         */
        "inset-ring-w": [{
          "inset-ring": scaleBorderWidth()
        }],
        /**
         * Inset Ring Color
         * @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-ring-color
         */
        "inset-ring-color": [{
          "inset-ring": scaleColor()
        }],
        /**
         * Text Shadow
         * @see https://tailwindcss.com/docs/text-shadow
         */
        "text-shadow": [{
          "text-shadow": ["none", themeTextShadow, isArbitraryVariableShadow, isArbitraryShadow]
        }],
        /**
         * Text Shadow Color
         * @see https://tailwindcss.com/docs/text-shadow#setting-the-shadow-color
         */
        "text-shadow-color": [{
          "text-shadow": scaleColor()
        }],
        /**
         * Opacity
         * @see https://tailwindcss.com/docs/opacity
         */
        opacity: [{
          opacity: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Mix Blend Mode
         * @see https://tailwindcss.com/docs/mix-blend-mode
         */
        "mix-blend": [{
          "mix-blend": [...scaleBlendMode(), "plus-darker", "plus-lighter"]
        }],
        /**
         * Background Blend Mode
         * @see https://tailwindcss.com/docs/background-blend-mode
         */
        "bg-blend": [{
          "bg-blend": scaleBlendMode()
        }],
        /**
         * Mask Clip
         * @see https://tailwindcss.com/docs/mask-clip
         */
        "mask-clip": [{
          "mask-clip": ["border", "padding", "content", "fill", "stroke", "view"]
        }, "mask-no-clip"],
        /**
         * Mask Composite
         * @see https://tailwindcss.com/docs/mask-composite
         */
        "mask-composite": [{
          mask: ["add", "subtract", "intersect", "exclude"]
        }],
        /**
         * Mask Image
         * @see https://tailwindcss.com/docs/mask-image
         */
        "mask-image-linear-pos": [{
          "mask-linear": [isNumber]
        }],
        "mask-image-linear-from-pos": [{
          "mask-linear-from": scaleMaskImagePosition()
        }],
        "mask-image-linear-to-pos": [{
          "mask-linear-to": scaleMaskImagePosition()
        }],
        "mask-image-linear-from-color": [{
          "mask-linear-from": scaleColor()
        }],
        "mask-image-linear-to-color": [{
          "mask-linear-to": scaleColor()
        }],
        "mask-image-t-from-pos": [{
          "mask-t-from": scaleMaskImagePosition()
        }],
        "mask-image-t-to-pos": [{
          "mask-t-to": scaleMaskImagePosition()
        }],
        "mask-image-t-from-color": [{
          "mask-t-from": scaleColor()
        }],
        "mask-image-t-to-color": [{
          "mask-t-to": scaleColor()
        }],
        "mask-image-r-from-pos": [{
          "mask-r-from": scaleMaskImagePosition()
        }],
        "mask-image-r-to-pos": [{
          "mask-r-to": scaleMaskImagePosition()
        }],
        "mask-image-r-from-color": [{
          "mask-r-from": scaleColor()
        }],
        "mask-image-r-to-color": [{
          "mask-r-to": scaleColor()
        }],
        "mask-image-b-from-pos": [{
          "mask-b-from": scaleMaskImagePosition()
        }],
        "mask-image-b-to-pos": [{
          "mask-b-to": scaleMaskImagePosition()
        }],
        "mask-image-b-from-color": [{
          "mask-b-from": scaleColor()
        }],
        "mask-image-b-to-color": [{
          "mask-b-to": scaleColor()
        }],
        "mask-image-l-from-pos": [{
          "mask-l-from": scaleMaskImagePosition()
        }],
        "mask-image-l-to-pos": [{
          "mask-l-to": scaleMaskImagePosition()
        }],
        "mask-image-l-from-color": [{
          "mask-l-from": scaleColor()
        }],
        "mask-image-l-to-color": [{
          "mask-l-to": scaleColor()
        }],
        "mask-image-x-from-pos": [{
          "mask-x-from": scaleMaskImagePosition()
        }],
        "mask-image-x-to-pos": [{
          "mask-x-to": scaleMaskImagePosition()
        }],
        "mask-image-x-from-color": [{
          "mask-x-from": scaleColor()
        }],
        "mask-image-x-to-color": [{
          "mask-x-to": scaleColor()
        }],
        "mask-image-y-from-pos": [{
          "mask-y-from": scaleMaskImagePosition()
        }],
        "mask-image-y-to-pos": [{
          "mask-y-to": scaleMaskImagePosition()
        }],
        "mask-image-y-from-color": [{
          "mask-y-from": scaleColor()
        }],
        "mask-image-y-to-color": [{
          "mask-y-to": scaleColor()
        }],
        "mask-image-radial": [{
          "mask-radial": [isArbitraryVariable, isArbitraryValue]
        }],
        "mask-image-radial-from-pos": [{
          "mask-radial-from": scaleMaskImagePosition()
        }],
        "mask-image-radial-to-pos": [{
          "mask-radial-to": scaleMaskImagePosition()
        }],
        "mask-image-radial-from-color": [{
          "mask-radial-from": scaleColor()
        }],
        "mask-image-radial-to-color": [{
          "mask-radial-to": scaleColor()
        }],
        "mask-image-radial-shape": [{
          "mask-radial": ["circle", "ellipse"]
        }],
        "mask-image-radial-size": [{
          "mask-radial": [{
            closest: ["side", "corner"],
            farthest: ["side", "corner"]
          }]
        }],
        "mask-image-radial-pos": [{
          "mask-radial-at": scalePosition()
        }],
        "mask-image-conic-pos": [{
          "mask-conic": [isNumber]
        }],
        "mask-image-conic-from-pos": [{
          "mask-conic-from": scaleMaskImagePosition()
        }],
        "mask-image-conic-to-pos": [{
          "mask-conic-to": scaleMaskImagePosition()
        }],
        "mask-image-conic-from-color": [{
          "mask-conic-from": scaleColor()
        }],
        "mask-image-conic-to-color": [{
          "mask-conic-to": scaleColor()
        }],
        /**
         * Mask Mode
         * @see https://tailwindcss.com/docs/mask-mode
         */
        "mask-mode": [{
          mask: ["alpha", "luminance", "match"]
        }],
        /**
         * Mask Origin
         * @see https://tailwindcss.com/docs/mask-origin
         */
        "mask-origin": [{
          "mask-origin": ["border", "padding", "content", "fill", "stroke", "view"]
        }],
        /**
         * Mask Position
         * @see https://tailwindcss.com/docs/mask-position
         */
        "mask-position": [{
          mask: scaleBgPosition()
        }],
        /**
         * Mask Repeat
         * @see https://tailwindcss.com/docs/mask-repeat
         */
        "mask-repeat": [{
          mask: scaleBgRepeat()
        }],
        /**
         * Mask Size
         * @see https://tailwindcss.com/docs/mask-size
         */
        "mask-size": [{
          mask: scaleBgSize()
        }],
        /**
         * Mask Type
         * @see https://tailwindcss.com/docs/mask-type
         */
        "mask-type": [{
          "mask-type": ["alpha", "luminance"]
        }],
        /**
         * Mask Image
         * @see https://tailwindcss.com/docs/mask-image
         */
        "mask-image": [{
          mask: ["none", isArbitraryVariable, isArbitraryValue]
        }],
        // ---------------
        // --- Filters ---
        // ---------------
        /**
         * Filter
         * @see https://tailwindcss.com/docs/filter
         */
        filter: [{
          filter: [
            // Deprecated since Tailwind CSS v3.0.0
            "",
            "none",
            isArbitraryVariable,
            isArbitraryValue
          ]
        }],
        /**
         * Blur
         * @see https://tailwindcss.com/docs/blur
         */
        blur: [{
          blur: scaleBlur()
        }],
        /**
         * Brightness
         * @see https://tailwindcss.com/docs/brightness
         */
        brightness: [{
          brightness: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Contrast
         * @see https://tailwindcss.com/docs/contrast
         */
        contrast: [{
          contrast: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Drop Shadow
         * @see https://tailwindcss.com/docs/drop-shadow
         */
        "drop-shadow": [{
          "drop-shadow": [
            // Deprecated since Tailwind CSS v4.0.0
            "",
            "none",
            themeDropShadow,
            isArbitraryVariableShadow,
            isArbitraryShadow
          ]
        }],
        /**
         * Drop Shadow Color
         * @see https://tailwindcss.com/docs/filter-drop-shadow#setting-the-shadow-color
         */
        "drop-shadow-color": [{
          "drop-shadow": scaleColor()
        }],
        /**
         * Grayscale
         * @see https://tailwindcss.com/docs/grayscale
         */
        grayscale: [{
          grayscale: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Hue Rotate
         * @see https://tailwindcss.com/docs/hue-rotate
         */
        "hue-rotate": [{
          "hue-rotate": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Invert
         * @see https://tailwindcss.com/docs/invert
         */
        invert: [{
          invert: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Saturate
         * @see https://tailwindcss.com/docs/saturate
         */
        saturate: [{
          saturate: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Sepia
         * @see https://tailwindcss.com/docs/sepia
         */
        sepia: [{
          sepia: ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Filter
         * @see https://tailwindcss.com/docs/backdrop-filter
         */
        "backdrop-filter": [{
          "backdrop-filter": [
            // Deprecated since Tailwind CSS v3.0.0
            "",
            "none",
            isArbitraryVariable,
            isArbitraryValue
          ]
        }],
        /**
         * Backdrop Blur
         * @see https://tailwindcss.com/docs/backdrop-blur
         */
        "backdrop-blur": [{
          "backdrop-blur": scaleBlur()
        }],
        /**
         * Backdrop Brightness
         * @see https://tailwindcss.com/docs/backdrop-brightness
         */
        "backdrop-brightness": [{
          "backdrop-brightness": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Contrast
         * @see https://tailwindcss.com/docs/backdrop-contrast
         */
        "backdrop-contrast": [{
          "backdrop-contrast": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Grayscale
         * @see https://tailwindcss.com/docs/backdrop-grayscale
         */
        "backdrop-grayscale": [{
          "backdrop-grayscale": ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Hue Rotate
         * @see https://tailwindcss.com/docs/backdrop-hue-rotate
         */
        "backdrop-hue-rotate": [{
          "backdrop-hue-rotate": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Invert
         * @see https://tailwindcss.com/docs/backdrop-invert
         */
        "backdrop-invert": [{
          "backdrop-invert": ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Opacity
         * @see https://tailwindcss.com/docs/backdrop-opacity
         */
        "backdrop-opacity": [{
          "backdrop-opacity": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Saturate
         * @see https://tailwindcss.com/docs/backdrop-saturate
         */
        "backdrop-saturate": [{
          "backdrop-saturate": [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Backdrop Sepia
         * @see https://tailwindcss.com/docs/backdrop-sepia
         */
        "backdrop-sepia": [{
          "backdrop-sepia": ["", isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        // --------------
        // --- Tables ---
        // --------------
        /**
         * Border Collapse
         * @see https://tailwindcss.com/docs/border-collapse
         */
        "border-collapse": [{
          border: ["collapse", "separate"]
        }],
        /**
         * Border Spacing
         * @see https://tailwindcss.com/docs/border-spacing
         */
        "border-spacing": [{
          "border-spacing": scaleUnambiguousSpacing()
        }],
        /**
         * Border Spacing X
         * @see https://tailwindcss.com/docs/border-spacing
         */
        "border-spacing-x": [{
          "border-spacing-x": scaleUnambiguousSpacing()
        }],
        /**
         * Border Spacing Y
         * @see https://tailwindcss.com/docs/border-spacing
         */
        "border-spacing-y": [{
          "border-spacing-y": scaleUnambiguousSpacing()
        }],
        /**
         * Table Layout
         * @see https://tailwindcss.com/docs/table-layout
         */
        "table-layout": [{
          table: ["auto", "fixed"]
        }],
        /**
         * Caption Side
         * @see https://tailwindcss.com/docs/caption-side
         */
        caption: [{
          caption: ["top", "bottom"]
        }],
        // ---------------------------------
        // --- Transitions and Animation ---
        // ---------------------------------
        /**
         * Transition Property
         * @see https://tailwindcss.com/docs/transition-property
         */
        transition: [{
          transition: ["", "all", "colors", "opacity", "shadow", "transform", "none", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Transition Behavior
         * @see https://tailwindcss.com/docs/transition-behavior
         */
        "transition-behavior": [{
          transition: ["normal", "discrete"]
        }],
        /**
         * Transition Duration
         * @see https://tailwindcss.com/docs/transition-duration
         */
        duration: [{
          duration: [isNumber, "initial", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Transition Timing Function
         * @see https://tailwindcss.com/docs/transition-timing-function
         */
        ease: [{
          ease: ["linear", "initial", themeEase, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Transition Delay
         * @see https://tailwindcss.com/docs/transition-delay
         */
        delay: [{
          delay: [isNumber, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Animation
         * @see https://tailwindcss.com/docs/animation
         */
        animate: [{
          animate: ["none", themeAnimate, isArbitraryVariable, isArbitraryValue]
        }],
        // ------------------
        // --- Transforms ---
        // ------------------
        /**
         * Backface Visibility
         * @see https://tailwindcss.com/docs/backface-visibility
         */
        backface: [{
          backface: ["hidden", "visible"]
        }],
        /**
         * Perspective
         * @see https://tailwindcss.com/docs/perspective
         */
        perspective: [{
          perspective: [themePerspective, isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Perspective Origin
         * @see https://tailwindcss.com/docs/perspective-origin
         */
        "perspective-origin": [{
          "perspective-origin": scalePositionWithArbitrary()
        }],
        /**
         * Rotate
         * @see https://tailwindcss.com/docs/rotate
         */
        rotate: [{
          rotate: scaleRotate()
        }],
        /**
         * Rotate X
         * @see https://tailwindcss.com/docs/rotate
         */
        "rotate-x": [{
          "rotate-x": scaleRotate()
        }],
        /**
         * Rotate Y
         * @see https://tailwindcss.com/docs/rotate
         */
        "rotate-y": [{
          "rotate-y": scaleRotate()
        }],
        /**
         * Rotate Z
         * @see https://tailwindcss.com/docs/rotate
         */
        "rotate-z": [{
          "rotate-z": scaleRotate()
        }],
        /**
         * Scale
         * @see https://tailwindcss.com/docs/scale
         */
        scale: [{
          scale: scaleScale()
        }],
        /**
         * Scale X
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-x": [{
          "scale-x": scaleScale()
        }],
        /**
         * Scale Y
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-y": [{
          "scale-y": scaleScale()
        }],
        /**
         * Scale Z
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-z": [{
          "scale-z": scaleScale()
        }],
        /**
         * Scale 3D
         * @see https://tailwindcss.com/docs/scale
         */
        "scale-3d": ["scale-3d"],
        /**
         * Skew
         * @see https://tailwindcss.com/docs/skew
         */
        skew: [{
          skew: scaleSkew()
        }],
        /**
         * Skew X
         * @see https://tailwindcss.com/docs/skew
         */
        "skew-x": [{
          "skew-x": scaleSkew()
        }],
        /**
         * Skew Y
         * @see https://tailwindcss.com/docs/skew
         */
        "skew-y": [{
          "skew-y": scaleSkew()
        }],
        /**
         * Transform
         * @see https://tailwindcss.com/docs/transform
         */
        transform: [{
          transform: [isArbitraryVariable, isArbitraryValue, "", "none", "gpu", "cpu"]
        }],
        /**
         * Transform Origin
         * @see https://tailwindcss.com/docs/transform-origin
         */
        "transform-origin": [{
          origin: scalePositionWithArbitrary()
        }],
        /**
         * Transform Style
         * @see https://tailwindcss.com/docs/transform-style
         */
        "transform-style": [{
          transform: ["3d", "flat"]
        }],
        /**
         * Translate
         * @see https://tailwindcss.com/docs/translate
         */
        translate: [{
          translate: scaleTranslate()
        }],
        /**
         * Translate X
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-x": [{
          "translate-x": scaleTranslate()
        }],
        /**
         * Translate Y
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-y": [{
          "translate-y": scaleTranslate()
        }],
        /**
         * Translate Z
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-z": [{
          "translate-z": scaleTranslate()
        }],
        /**
         * Translate None
         * @see https://tailwindcss.com/docs/translate
         */
        "translate-none": ["translate-none"],
        /**
         * Zoom
         * @see https://tailwindcss.com/docs/zoom
         */
        zoom: [{
          zoom: [isInteger, isArbitraryVariable, isArbitraryValue]
        }],
        // ---------------------
        // --- Interactivity ---
        // ---------------------
        /**
         * Accent Color
         * @see https://tailwindcss.com/docs/accent-color
         */
        accent: [{
          accent: scaleColor()
        }],
        /**
         * Appearance
         * @see https://tailwindcss.com/docs/appearance
         */
        appearance: [{
          appearance: ["none", "auto"]
        }],
        /**
         * Caret Color
         * @see https://tailwindcss.com/docs/just-in-time-mode#caret-color-utilities
         */
        "caret-color": [{
          caret: scaleColor()
        }],
        /**
         * Color Scheme
         * @see https://tailwindcss.com/docs/color-scheme
         */
        "color-scheme": [{
          scheme: ["normal", "dark", "light", "light-dark", "only-dark", "only-light"]
        }],
        /**
         * Cursor
         * @see https://tailwindcss.com/docs/cursor
         */
        cursor: [{
          cursor: ["auto", "default", "pointer", "wait", "text", "move", "help", "not-allowed", "none", "context-menu", "progress", "cell", "crosshair", "vertical-text", "alias", "copy", "no-drop", "grab", "grabbing", "all-scroll", "col-resize", "row-resize", "n-resize", "e-resize", "s-resize", "w-resize", "ne-resize", "nw-resize", "se-resize", "sw-resize", "ew-resize", "ns-resize", "nesw-resize", "nwse-resize", "zoom-in", "zoom-out", isArbitraryVariable, isArbitraryValue]
        }],
        /**
         * Field Sizing
         * @see https://tailwindcss.com/docs/field-sizing
         */
        "field-sizing": [{
          "field-sizing": ["fixed", "content"]
        }],
        /**
         * Pointer Events
         * @see https://tailwindcss.com/docs/pointer-events
         */
        "pointer-events": [{
          "pointer-events": ["auto", "none"]
        }],
        /**
         * Resize
         * @see https://tailwindcss.com/docs/resize
         */
        resize: [{
          resize: ["none", "", "y", "x"]
        }],
        /**
         * Scroll Behavior
         * @see https://tailwindcss.com/docs/scroll-behavior
         */
        "scroll-behavior": [{
          scroll: ["auto", "smooth"]
        }],
        /**
         * Scrollbar Thumb Color
         * @see https://tailwindcss.com/docs/scrollbar-color
         */
        "scrollbar-thumb-color": [{
          "scrollbar-thumb": scaleColor()
        }],
        /**
         * Scrollbar Track Color
         * @see https://tailwindcss.com/docs/scrollbar-color
         */
        "scrollbar-track-color": [{
          "scrollbar-track": scaleColor()
        }],
        /**
         * Scrollbar Gutter
         * @see https://tailwindcss.com/docs/scrollbar-gutter
         */
        "scrollbar-gutter": [{
          "scrollbar-gutter": ["auto", "stable", "both"]
        }],
        /**
         * Scrollbar Width
         * @see https://tailwindcss.com/docs/scrollbar-width
         */
        "scrollbar-w": [{
          scrollbar: ["auto", "thin", "none"]
        }],
        /**
         * Scroll Margin
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-m": [{
          "scroll-m": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Inline
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mx": [{
          "scroll-mx": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Block
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-my": [{
          "scroll-my": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Inline Start
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-ms": [{
          "scroll-ms": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Inline End
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-me": [{
          "scroll-me": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Block Start
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mbs": [{
          "scroll-mbs": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Block End
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mbe": [{
          "scroll-mbe": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Top
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mt": [{
          "scroll-mt": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Right
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mr": [{
          "scroll-mr": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Bottom
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-mb": [{
          "scroll-mb": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Margin Left
         * @see https://tailwindcss.com/docs/scroll-margin
         */
        "scroll-ml": [{
          "scroll-ml": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-p": [{
          "scroll-p": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Inline
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-px": [{
          "scroll-px": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Block
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-py": [{
          "scroll-py": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Inline Start
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-ps": [{
          "scroll-ps": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Inline End
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pe": [{
          "scroll-pe": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Block Start
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pbs": [{
          "scroll-pbs": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Block End
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pbe": [{
          "scroll-pbe": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Top
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pt": [{
          "scroll-pt": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Right
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pr": [{
          "scroll-pr": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Bottom
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pb": [{
          "scroll-pb": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Padding Left
         * @see https://tailwindcss.com/docs/scroll-padding
         */
        "scroll-pl": [{
          "scroll-pl": scaleUnambiguousSpacing()
        }],
        /**
         * Scroll Snap Align
         * @see https://tailwindcss.com/docs/scroll-snap-align
         */
        "snap-align": [{
          snap: ["start", "end", "center", "align-none"]
        }],
        /**
         * Scroll Snap Stop
         * @see https://tailwindcss.com/docs/scroll-snap-stop
         */
        "snap-stop": [{
          snap: ["normal", "always"]
        }],
        /**
         * Scroll Snap Type
         * @see https://tailwindcss.com/docs/scroll-snap-type
         */
        "snap-type": [{
          snap: ["none", "x", "y", "both"]
        }],
        /**
         * Scroll Snap Type Strictness
         * @see https://tailwindcss.com/docs/scroll-snap-type
         */
        "snap-strictness": [{
          snap: ["mandatory", "proximity"]
        }],
        /**
         * Touch Action
         * @see https://tailwindcss.com/docs/touch-action
         */
        touch: [{
          touch: ["auto", "none", "manipulation"]
        }],
        /**
         * Touch Action X
         * @see https://tailwindcss.com/docs/touch-action
         */
        "touch-x": [{
          "touch-pan": ["x", "left", "right"]
        }],
        /**
         * Touch Action Y
         * @see https://tailwindcss.com/docs/touch-action
         */
        "touch-y": [{
          "touch-pan": ["y", "up", "down"]
        }],
        /**
         * Touch Action Pinch Zoom
         * @see https://tailwindcss.com/docs/touch-action
         */
        "touch-pz": ["touch-pinch-zoom"],
        /**
         * User Select
         * @see https://tailwindcss.com/docs/user-select
         */
        select: [{
          select: ["none", "text", "all", "auto"]
        }],
        /**
         * Will Change
         * @see https://tailwindcss.com/docs/will-change
         */
        "will-change": [{
          "will-change": ["auto", "scroll", "contents", "transform", isArbitraryVariable, isArbitraryValue]
        }],
        // -----------
        // --- SVG ---
        // -----------
        /**
         * Fill
         * @see https://tailwindcss.com/docs/fill
         */
        fill: [{
          fill: ["none", ...scaleColor()]
        }],
        /**
         * Stroke Width
         * @see https://tailwindcss.com/docs/stroke-width
         */
        "stroke-w": [{
          stroke: [isNumber, isArbitraryVariableLength, isArbitraryLength, isArbitraryNumber]
        }],
        /**
         * Stroke
         * @see https://tailwindcss.com/docs/stroke
         */
        stroke: [{
          stroke: ["none", ...scaleColor()]
        }],
        // ---------------------
        // --- Accessibility ---
        // ---------------------
        /**
         * Forced Color Adjust
         * @see https://tailwindcss.com/docs/forced-color-adjust
         */
        "forced-color-adjust": [{
          "forced-color-adjust": ["auto", "none"]
        }]
      },
      conflictingClassGroups: {
        "container-named": ["container-type"],
        overflow: ["overflow-x", "overflow-y"],
        overscroll: ["overscroll-x", "overscroll-y"],
        inset: ["inset-x", "inset-y", "inset-bs", "inset-be", "start", "end", "top", "right", "bottom", "left"],
        "inset-x": ["start", "end", "right", "left"],
        "inset-y": ["inset-bs", "inset-be", "top", "bottom"],
        flex: ["basis", "grow", "shrink"],
        gap: ["gap-x", "gap-y"],
        p: ["px", "py", "ps", "pe", "pbs", "pbe", "pt", "pr", "pb", "pl"],
        px: ["ps", "pe", "pr", "pl"],
        py: ["pbs", "pbe", "pt", "pb"],
        m: ["mx", "my", "ms", "me", "mbs", "mbe", "mt", "mr", "mb", "ml"],
        mx: ["ms", "me", "mr", "ml"],
        my: ["mbs", "mbe", "mt", "mb"],
        size: ["w", "h"],
        "font-size": ["leading"],
        "fvn-normal": ["fvn-ordinal", "fvn-slashed-zero", "fvn-figure", "fvn-spacing", "fvn-fraction"],
        "fvn-ordinal": ["fvn-normal"],
        "fvn-slashed-zero": ["fvn-normal"],
        "fvn-figure": ["fvn-normal"],
        "fvn-spacing": ["fvn-normal"],
        "fvn-fraction": ["fvn-normal"],
        "line-clamp": ["display", "overflow"],
        rounded: ["rounded-s", "rounded-e", "rounded-t", "rounded-r", "rounded-b", "rounded-l", "rounded-ss", "rounded-se", "rounded-ee", "rounded-es", "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl"],
        "rounded-s": ["rounded-ss", "rounded-es"],
        "rounded-e": ["rounded-se", "rounded-ee"],
        "rounded-t": ["rounded-tl", "rounded-tr"],
        "rounded-r": ["rounded-tr", "rounded-br"],
        "rounded-b": ["rounded-br", "rounded-bl"],
        "rounded-l": ["rounded-tl", "rounded-bl"],
        "border-spacing": ["border-spacing-x", "border-spacing-y"],
        "border-w": ["border-w-x", "border-w-y", "border-w-s", "border-w-e", "border-w-bs", "border-w-be", "border-w-t", "border-w-r", "border-w-b", "border-w-l"],
        "border-w-x": ["border-w-s", "border-w-e", "border-w-r", "border-w-l"],
        "border-w-y": ["border-w-bs", "border-w-be", "border-w-t", "border-w-b"],
        "border-color": ["border-color-x", "border-color-y", "border-color-s", "border-color-e", "border-color-bs", "border-color-be", "border-color-t", "border-color-r", "border-color-b", "border-color-l"],
        "border-color-x": ["border-color-s", "border-color-e", "border-color-r", "border-color-l"],
        "border-color-y": ["border-color-bs", "border-color-be", "border-color-t", "border-color-b"],
        translate: ["translate-x", "translate-y", "translate-none"],
        "translate-none": ["translate", "translate-x", "translate-y", "translate-z"],
        "scroll-m": ["scroll-mx", "scroll-my", "scroll-ms", "scroll-me", "scroll-mbs", "scroll-mbe", "scroll-mt", "scroll-mr", "scroll-mb", "scroll-ml"],
        "scroll-mx": ["scroll-ms", "scroll-me", "scroll-mr", "scroll-ml"],
        "scroll-my": ["scroll-mbs", "scroll-mbe", "scroll-mt", "scroll-mb"],
        "scroll-p": ["scroll-px", "scroll-py", "scroll-ps", "scroll-pe", "scroll-pbs", "scroll-pbe", "scroll-pt", "scroll-pr", "scroll-pb", "scroll-pl"],
        "scroll-px": ["scroll-ps", "scroll-pe", "scroll-pr", "scroll-pl"],
        "scroll-py": ["scroll-pbs", "scroll-pbe", "scroll-pt", "scroll-pb"],
        touch: ["touch-x", "touch-y", "touch-pz"],
        "touch-x": ["touch"],
        "touch-y": ["touch"],
        "touch-pz": ["touch"]
      },
      conflictingClassGroupModifiers: {
        "font-size": ["leading"]
      },
      postfixLookupClassGroups: ["container-type"],
      orderSensitiveModifiers: ["*", "**", "after", "backdrop", "before", "details-content", "file", "first-letter", "first-line", "marker", "placeholder", "selection"]
    };
  };
  var twMerge = /* @__PURE__ */ createTailwindMerge(getDefaultConfig);

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/mergeClasses.mjs
  var mergeClasses = (...classes) => classes.filter((className, index2, array) => {
    return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index2;
  }).join(" ").trim();

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toKebabCase.mjs
  var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toCamelCase.mjs
  var toCamelCase = (string) => string.replace(
    /^([A-Z])|[\s-_]+(\w)/g,
    (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase()
  );

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toPascalCase.mjs
  var toPascalCase = (string) => {
    const camelCase = toCamelCase(string);
    return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
  };

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/defaultAttributes.mjs
  var defaultAttributes = {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/hasA11yProp.mjs
  var hasA11yProp = (props) => {
    for (const prop in props) {
      if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
        return true;
      }
    }
    return false;
  };

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/context.mjs
  var LucideContext = createContext({});
  var useLucideContext = () => useContext(LucideContext);

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/Icon.mjs
  var Icon = forwardRef(
    ({ color, size: size4, strokeWidth, absoluteStrokeWidth, className = "", children, iconNode, ...rest }, ref) => {
      const {
        size: contextSize = 24,
        strokeWidth: contextStrokeWidth = 2,
        absoluteStrokeWidth: contextAbsoluteStrokeWidth = false,
        color: contextColor = "currentColor",
        className: contextClass = ""
      } = useLucideContext() ?? {};
      const calculatedStrokeWidth = absoluteStrokeWidth ?? contextAbsoluteStrokeWidth ? Number(strokeWidth ?? contextStrokeWidth) * 24 / Number(size4 ?? contextSize) : strokeWidth ?? contextStrokeWidth;
      return createElement(
        "svg",
        {
          ref,
          ...defaultAttributes,
          width: size4 ?? contextSize ?? defaultAttributes.width,
          height: size4 ?? contextSize ?? defaultAttributes.height,
          stroke: color ?? contextColor,
          strokeWidth: calculatedStrokeWidth,
          className: mergeClasses("lucide", contextClass, className),
          ...!children && !hasA11yProp(rest) && { "aria-hidden": "true" },
          ...rest
        },
        [
          ...iconNode.map(([tag, attrs]) => createElement(tag, attrs)),
          ...Array.isArray(children) ? children : [children]
        ]
      );
    }
  );

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/createLucideIcon.mjs
  var createLucideIcon = (iconName, iconNode) => {
    const Component2 = forwardRef(
      ({ className, ...props }, ref) => createElement(Icon, {
        ref,
        iconNode,
        className: mergeClasses(
          `lucide-${toKebabCase(toPascalCase(iconName))}`,
          `lucide-${iconName}`,
          className
        ),
        ...props
      })
    );
    Component2.displayName = toPascalCase(iconName);
    return Component2;
  };

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/check.mjs
  var __iconNode = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]];
  var Check = createLucideIcon("check", __iconNode);

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/chevron-down.mjs
  var __iconNode2 = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]];
  var ChevronDown = createLucideIcon("chevron-down", __iconNode2);

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/chevron-up.mjs
  var __iconNode3 = [["path", { d: "m18 15-6-6-6 6", key: "153udz" }]];
  var ChevronUp = createLucideIcon("chevron-up", __iconNode3);

  // ../../node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/x.mjs
  var __iconNode4 = [
    ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
    ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
  ];
  var X = createLucideIcon("x", __iconNode4);

  // src/lib/remote-components/resume-screen/src/react-jsx-runtime-shim.ts
  var ReactGlobal2 = window.React;
  var Fragment2 = ReactGlobal2.Fragment;
  function jsx(type, props, key) {
    return ReactGlobal2.createElement(type, key === void 0 ? props : { ...props, key });
  }
  var jsxs = jsx;

  // src/lib/remote-components/resume-screen/src/react-dom-shim.ts
  var ReactDOMGlobal2 = window.ReactDOM;
  var createPortal = ReactDOMGlobal2.createPortal;
  var flushSync = ReactDOMGlobal2.flushSync;
  var findDOMNode = ReactDOMGlobal2.findDOMNode;
  var hydrate = ReactDOMGlobal2.hydrate;
  var render = ReactDOMGlobal2.render;
  var unstable_batchedUpdates = ReactDOMGlobal2.unstable_batchedUpdates;
  var unmountComponentAtNode = ReactDOMGlobal2.unmountComponentAtNode;
  var version2 = ReactDOMGlobal2.version;

  // ../../node_modules/.pnpm/@radix-ui+react-slot@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-slot/dist/index.mjs
  var dist_exports = {};
  __export(dist_exports, {
    Root: () => Slot,
    Slot: () => Slot,
    Slottable: () => Slottable,
    createSlot: () => createSlot,
    createSlottable: () => createSlottable
  });

  // ../../node_modules/.pnpm/@radix-ui+react-compose-refs@1.1.5_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-compose-refs/dist/index.mjs
  var __defProp2 = Object.defineProperty;
  var __name = (target, value) => __defProp2(target, "name", { value, configurable: true });
  function setRef(ref, value) {
    if (typeof ref === "function") {
      return ref(value);
    } else if (ref !== null && ref !== void 0) {
      ref.current = value;
    }
  }
  __name(setRef, "setRef");
  function composeRefs(...refs) {
    return (node) => {
      let hasCleanup = false;
      const cleanups = refs.map((ref) => {
        const cleanup = setRef(ref, node);
        if (!hasCleanup && typeof cleanup == "function") {
          hasCleanup = true;
        }
        return cleanup;
      });
      if (hasCleanup) {
        return () => {
          for (let i = 0; i < cleanups.length; i++) {
            const cleanup = cleanups[i];
            if (typeof cleanup == "function") {
              cleanup();
            } else {
              setRef(refs[i], null);
            }
          }
        };
      }
    };
  }
  __name(composeRefs, "composeRefs");
  function useComposedRefs(...refs) {
    return useCallback(composeRefs(...refs), refs);
  }
  __name(useComposedRefs, "useComposedRefs");

  // ../../node_modules/.pnpm/@radix-ui+react-slot@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-slot/dist/index.mjs
  var __defProp3 = Object.defineProperty;
  var __name2 = (target, value) => __defProp3(target, "name", { value, configurable: true });
  // @__NO_SIDE_EFFECTS__
  function createSlot(ownerName) {
    const Slot22 = forwardRef((props, forwardedRef) => {
      let { children, ...slotProps } = props;
      let slottableElement = null;
      let hasSlottable = false;
      const newChildren = [];
      if (isLazyComponent(children) && typeof use === "function") {
        children = use(children._payload);
      }
      Children.forEach(children, (maybeSlottable) => {
        if (isSlottable(maybeSlottable)) {
          hasSlottable = true;
          const slottable = maybeSlottable;
          let child = "child" in slottable.props ? slottable.props.child : slottable.props.children;
          if (isLazyComponent(child) && typeof use === "function") {
            child = use(child._payload);
          }
          slottableElement = getSlottableElementFromSlottable(slottable, child);
          newChildren.push(slottableElement?.props?.children);
        } else {
          newChildren.push(maybeSlottable);
        }
      });
      if (slottableElement) {
        slottableElement = cloneElement(slottableElement, void 0, newChildren);
      } else if (
        // A `Slottable` was found but it didn't resolve to a single element (e.g.
        // it wrapped multiple elements, text, or a render-prop `child` that
        // wasn't an element). Don't fall back to treating the `Slottable` wrapper
        // itself as the slot target — throw a descriptive error below instead.
        !hasSlottable && Children.count(children) === 1 && isValidElement(children)
      ) {
        slottableElement = children;
      }
      const slottableElementRef = slottableElement ? getElementRef(slottableElement) : void 0;
      const composedRef = useComposedRefs(forwardedRef, slottableElementRef);
      if (!slottableElement) {
        if (children || children === 0) {
          throw new Error(
            hasSlottable ? createSlottableError(ownerName) : createSlotError(ownerName)
          );
        }
        return children;
      }
      const mergedProps = mergeProps(slotProps, slottableElement.props ?? {});
      if (slottableElement.type !== Fragment) {
        mergedProps.ref = forwardedRef ? composedRef : slottableElementRef;
      }
      return cloneElement(slottableElement, mergedProps);
    });
    Slot22.displayName = `${ownerName}.Slot`;
    return Slot22;
  }
  __name2(createSlot, "createSlot");
  var Slot = /* @__PURE__ */ createSlot("Slot");
  var SLOTTABLE_IDENTIFIER = /* @__PURE__ */ Symbol.for("radix.slottable");
  // @__NO_SIDE_EFFECTS__
  function createSlottable(ownerName) {
    const Slottable22 = /* @__PURE__ */ __name2((props) => "child" in props ? props.children(props.child) : props.children, "Slottable");
    Slottable22.displayName = `${ownerName}.Slottable`;
    Slottable22.__radixId = SLOTTABLE_IDENTIFIER;
    return Slottable22;
  }
  __name2(createSlottable, "createSlottable");
  var Slottable = /* @__PURE__ */ createSlottable("Slottable");
  var getSlottableElementFromSlottable = /* @__PURE__ */ __name2((slottable, child) => {
    if ("child" in slottable.props) {
      const child2 = slottable.props.child;
      if (!isValidElement(child2)) return null;
      return cloneElement(child2, void 0, slottable.props.children(child2.props.children));
    }
    return isValidElement(child) ? child : null;
  }, "getSlottableElementFromSlottable");
  function mergeProps(slotProps, childProps) {
    const overrideProps = { ...childProps };
    for (const propName in childProps) {
      const slotPropValue = slotProps[propName];
      const childPropValue = childProps[propName];
      const isHandler = /^on[A-Z]/.test(propName);
      if (isHandler) {
        if (slotPropValue && childPropValue) {
          overrideProps[propName] = (...args) => {
            const result = childPropValue(...args);
            slotPropValue(...args);
            return result;
          };
        } else if (slotPropValue) {
          overrideProps[propName] = slotPropValue;
        }
      } else if (propName === "style") {
        overrideProps[propName] = { ...slotPropValue, ...childPropValue };
      } else if (propName === "className") {
        overrideProps[propName] = [slotPropValue, childPropValue].filter(Boolean).join(" ");
      }
    }
    return { ...slotProps, ...overrideProps };
  }
  __name2(mergeProps, "mergeProps");
  function getElementRef(element) {
    let getter = Object.getOwnPropertyDescriptor(element.props, "ref")?.get;
    let mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.ref;
    }
    getter = Object.getOwnPropertyDescriptor(element, "ref")?.get;
    mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.props.ref;
    }
    return element.props.ref || element.ref;
  }
  __name2(getElementRef, "getElementRef");
  function isSlottable(child) {
    return isValidElement(child) && typeof child.type === "function" && "__radixId" in child.type && child.type.__radixId === SLOTTABLE_IDENTIFIER;
  }
  __name2(isSlottable, "isSlottable");
  var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
  function isLazyComponent(element) {
    return element != null && typeof element === "object" && "$$typeof" in element && element.$$typeof === REACT_LAZY_TYPE && "_payload" in element && isPromiseLike(element._payload);
  }
  __name2(isLazyComponent, "isLazyComponent");
  function isPromiseLike(value) {
    return typeof value === "object" && value !== null && "then" in value;
  }
  __name2(isPromiseLike, "isPromiseLike");
  var createSlotError = /* @__PURE__ */ __name2((ownerName) => {
    return `${ownerName} failed to slot onto its children. Expected a single React element child or \`Slottable\`.`;
  }, "createSlotError");
  var createSlottableError = /* @__PURE__ */ __name2((ownerName) => {
    return `${ownerName} failed to slot onto its \`Slottable\`. Expected \`Slottable\` to receive a single React element child.`;
  }, "createSlottableError");
  var use = react_shim_exports[" use ".trim().toString()];

  // ../../node_modules/.pnpm/@radix-ui+react-primitive@2.1.10_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-primitive/dist/index.mjs
  var __defProp4 = Object.defineProperty;
  var __name3 = (target, value) => __defProp4(target, "name", { value, configurable: true });
  var NODES = [
    "a",
    "button",
    "div",
    "form",
    "h2",
    "h3",
    "img",
    "input",
    "label",
    "li",
    "nav",
    "ol",
    "p",
    "select",
    "span",
    "svg",
    "ul"
  ];
  var Primitive = NODES.reduce((primitive, node) => {
    const Slot6 = createSlot(`Primitive.${node}`);
    const Node2 = forwardRef((props, forwardedRef) => {
      const { asChild, ...primitiveProps } = props;
      const Comp = asChild ? Slot6 : node;
      if (typeof window !== "undefined") {
        window[/* @__PURE__ */ Symbol.for("radix-ui")] = true;
      }
      return /* @__PURE__ */ jsx(Comp, { ...primitiveProps, ref: forwardedRef });
    });
    Node2.displayName = `Primitive.${node}`;
    return { ...primitive, [node]: Node2 };
  }, {});
  function dispatchDiscreteCustomEvent(target, event) {
    if (target) flushSync(() => target.dispatchEvent(event));
  }
  __name3(dispatchDiscreteCustomEvent, "dispatchDiscreteCustomEvent");

  // ../../node_modules/.pnpm/@radix-ui+react-visually-hidden@1.2.11_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-visually-hidden/dist/index.mjs
  var __defProp5 = Object.defineProperty;
  var __name4 = (target, value) => __defProp5(target, "name", { value, configurable: true });
  var VISUALLY_HIDDEN_STYLES = Object.freeze({
    // See: https://github.com/twbs/bootstrap/blob/main/scss/mixins/_visually-hidden.scss
    position: "absolute",
    border: 0,
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    wordWrap: "normal"
  });
  var VisuallyHidden = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name4(function VisuallyHidden2(props, forwardedRef) {
      return /* @__PURE__ */ jsx(
        Primitive.span,
        {
          ...props,
          ref: forwardedRef,
          style: { ...VISUALLY_HIDDEN_STYLES, ...props.style }
        }
      );
    }, "VisuallyHidden")
  );
  var Root = VisuallyHidden;

  // ../../node_modules/.pnpm/@radix-ui+react-context@1.2.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-context/dist/index.mjs
  var __defProp6 = Object.defineProperty;
  var __name5 = (target, value) => __defProp6(target, "name", { value, configurable: true });
  // @__NO_SIDE_EFFECTS__
  function createContext2(rootComponentName, defaultContext) {
    const Context = createContext(defaultContext);
    Context.displayName = rootComponentName + "Context";
    const Provider2 = /* @__PURE__ */ __name5((props) => {
      const { children, ...context } = props;
      const value = useMemo(() => context, Object.values(context));
      return /* @__PURE__ */ jsx(Context.Provider, { value, children });
    }, "Provider");
    Provider2.displayName = rootComponentName + "Provider";
    function useContext2(consumerName, options2 = {}) {
      const { optional = false } = options2;
      const context = useContext(Context);
      if (context) return context;
      if (defaultContext !== void 0) return defaultContext;
      if (optional) return void 0;
      throw new Error(`\`${consumerName}\` must be used within \`${rootComponentName}\``);
    }
    __name5(useContext2, "useContext");
    return [Provider2, useContext2];
  }
  __name5(createContext2, "createContext");
  // @__NO_SIDE_EFFECTS__
  function createContextScope(scopeName, createContextScopeDeps = []) {
    let defaultContexts = [];
    function createContext3(rootComponentName, defaultContext) {
      const BaseContext = createContext(defaultContext);
      BaseContext.displayName = rootComponentName + "Context";
      const index2 = defaultContexts.length;
      defaultContexts = [...defaultContexts, defaultContext];
      const Provider2 = /* @__PURE__ */ __name5((props) => {
        const { scope, children, ...context } = props;
        const Context = scope?.[scopeName]?.[index2] || BaseContext;
        const value = useMemo(() => context, Object.values(context));
        return /* @__PURE__ */ jsx(Context.Provider, { value, children });
      }, "Provider");
      Provider2.displayName = rootComponentName + "Provider";
      function useContext2(consumerName, scope, options2 = {}) {
        const { optional = false } = options2;
        const Context = scope?.[scopeName]?.[index2] || BaseContext;
        const context = useContext(Context);
        if (context) return context;
        if (defaultContext !== void 0) return defaultContext;
        if (optional) return void 0;
        throw new Error(`\`${consumerName}\` must be used within \`${rootComponentName}\``);
      }
      __name5(useContext2, "useContext");
      return [Provider2, useContext2];
    }
    __name5(createContext3, "createContext");
    const createScope = /* @__PURE__ */ __name5(() => {
      const scopeContexts = defaultContexts.map((defaultContext) => {
        return createContext(defaultContext);
      });
      return /* @__PURE__ */ __name5(function useScope(scope) {
        const contexts = scope?.[scopeName] || scopeContexts;
        return useMemo(
          () => ({ [`__scope${scopeName}`]: { ...scope, [scopeName]: contexts } }),
          [scope, contexts]
        );
      }, "useScope");
    }, "createScope");
    createScope.scopeName = scopeName;
    return [createContext3, composeContextScopes(createScope, ...createContextScopeDeps)];
  }
  __name5(createContextScope, "createContextScope");
  function composeContextScopes(...scopes) {
    const baseScope = scopes[0];
    if (scopes.length === 1) return baseScope;
    const createScope = /* @__PURE__ */ __name5(() => {
      const scopeHooks = scopes.map((createScope2) => ({
        useScope: createScope2(),
        scopeName: createScope2.scopeName
      }));
      return /* @__PURE__ */ __name5(function useComposedScopes(overrideScopes) {
        const nextScopes = scopeHooks.reduce((nextScopes2, { useScope, scopeName }) => {
          const scopeProps = useScope(overrideScopes);
          const currentScope = scopeProps[`__scope${scopeName}`];
          return { ...nextScopes2, ...currentScope };
        }, {});
        return useMemo(() => ({ [`__scope${baseScope.scopeName}`]: nextScopes }), [nextScopes]);
      }, "useComposedScopes");
    }, "createScope");
    createScope.scopeName = baseScope.scopeName;
    return createScope;
  }
  __name5(composeContextScopes, "composeContextScopes");

  // ../../node_modules/.pnpm/@radix-ui+react-collection@1.1.15_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-collection/dist/index.mjs
  var __defProp7 = Object.defineProperty;
  var __name6 = (target, value) => __defProp7(target, "name", { value, configurable: true });
  // @__NO_SIDE_EFFECTS__
  function createCollection(name) {
    const PROVIDER_NAME2 = name + "CollectionProvider";
    const [createCollectionContext, createCollectionScope4] = createContextScope(PROVIDER_NAME2);
    const [CollectionProviderImpl, useCollectionContext] = createCollectionContext(
      PROVIDER_NAME2,
      { collectionRef: { current: null }, itemMap: /* @__PURE__ */ new Map() }
    );
    const CollectionProvider = /* @__PURE__ */ __name6((props) => {
      const { scope, children } = props;
      const ref = useRef(null);
      const itemMap = useRef(/* @__PURE__ */ new Map()).current;
      return /* @__PURE__ */ jsx(CollectionProviderImpl, { scope, itemMap, collectionRef: ref, children });
    }, "CollectionProvider");
    CollectionProvider.displayName = PROVIDER_NAME2;
    const COLLECTION_SLOT_NAME = name + "CollectionSlot";
    const CollectionSlotImpl = createSlot(COLLECTION_SLOT_NAME);
    const CollectionSlot = forwardRef(
      (props, forwardedRef) => {
        const { scope, children } = props;
        const context = useCollectionContext(COLLECTION_SLOT_NAME, scope);
        const composedRefs = useComposedRefs(forwardedRef, context.collectionRef);
        return /* @__PURE__ */ jsx(CollectionSlotImpl, { ref: composedRefs, children });
      }
    );
    CollectionSlot.displayName = COLLECTION_SLOT_NAME;
    const ITEM_SLOT_NAME = name + "CollectionItemSlot";
    const ITEM_DATA_ATTR = "data-radix-collection-item";
    const CollectionItemSlotImpl = createSlot(ITEM_SLOT_NAME);
    const CollectionItemSlot = forwardRef(
      (props, forwardedRef) => {
        const { scope, children, ...itemData } = props;
        const ref = useRef(null);
        const composedRefs = useComposedRefs(forwardedRef, ref);
        const context = useCollectionContext(ITEM_SLOT_NAME, scope);
        useEffect(() => {
          context.itemMap.set(ref, { ref, ...itemData });
          return () => void context.itemMap.delete(ref);
        });
        return /* @__PURE__ */ jsx(CollectionItemSlotImpl, { ...{ [ITEM_DATA_ATTR]: "" }, ref: composedRefs, children });
      }
    );
    CollectionItemSlot.displayName = ITEM_SLOT_NAME;
    function useCollection4(scope) {
      const context = useCollectionContext(name + "CollectionConsumer", scope);
      const getItems = useCallback(() => {
        const collectionNode = context.collectionRef.current;
        if (!collectionNode) return [];
        const orderedNodes = Array.from(collectionNode.querySelectorAll(`[${ITEM_DATA_ATTR}]`));
        const items = Array.from(context.itemMap.values());
        const orderedItems = items.sort(
          (a2, b) => orderedNodes.indexOf(a2.ref.current) - orderedNodes.indexOf(b.ref.current)
        );
        return orderedItems;
      }, [context.collectionRef, context.itemMap]);
      return getItems;
    }
    __name6(useCollection4, "useCollection");
    return [
      { Provider: CollectionProvider, Slot: CollectionSlot, ItemSlot: CollectionItemSlot },
      useCollection4,
      createCollectionScope4
    ];
  }
  __name6(createCollection, "createCollection");
  var __instanciated = /* @__PURE__ */ new WeakMap();
  var _keys, _a;
  var OrderedDict = (_a = class extends Map {
    constructor(entries) {
      super(entries);
      __privateAdd(this, _keys);
      __privateSet(this, _keys, [...super.keys()]);
      __instanciated.set(this, true);
    }
    set(key, value) {
      if (__instanciated.get(this)) {
        if (this.has(key)) {
          __privateGet(this, _keys)[__privateGet(this, _keys).indexOf(key)] = key;
        } else {
          __privateGet(this, _keys).push(key);
        }
      }
      super.set(key, value);
      return this;
    }
    insert(index2, key, value) {
      const has = this.has(key);
      const length = __privateGet(this, _keys).length;
      const relativeIndex = toSafeInteger(index2);
      let actualIndex = relativeIndex >= 0 ? relativeIndex : length + relativeIndex;
      const safeIndex = actualIndex < 0 || actualIndex >= length ? -1 : actualIndex;
      if (safeIndex === this.size || has && safeIndex === this.size - 1 || safeIndex === -1) {
        this.set(key, value);
        return this;
      }
      const size4 = this.size + (has ? 0 : 1);
      if (relativeIndex < 0) {
        actualIndex++;
      }
      const keys = [...__privateGet(this, _keys)];
      let nextValue;
      let shouldSkip = false;
      for (let i = actualIndex; i < size4; i++) {
        if (actualIndex === i) {
          let nextKey = keys[i];
          if (keys[i] === key) {
            nextKey = keys[i + 1];
          }
          if (has) {
            this.delete(key);
          }
          nextValue = this.get(nextKey);
          this.set(key, value);
        } else {
          if (!shouldSkip && keys[i - 1] === key) {
            shouldSkip = true;
          }
          const currentKey = keys[shouldSkip ? i : i - 1];
          const currentValue = nextValue;
          nextValue = this.get(currentKey);
          this.delete(currentKey);
          this.set(currentKey, currentValue);
        }
      }
      return this;
    }
    with(index2, key, value) {
      const copy = new _a(this);
      copy.insert(index2, key, value);
      return copy;
    }
    before(key) {
      const index2 = __privateGet(this, _keys).indexOf(key) - 1;
      if (index2 < 0) {
        return void 0;
      }
      return this.entryAt(index2);
    }
    /**
     * Sets a new key-value pair at the position before the given key.
     */
    setBefore(key, newKey, value) {
      const index2 = __privateGet(this, _keys).indexOf(key);
      if (index2 === -1) {
        return this;
      }
      return this.insert(index2, newKey, value);
    }
    after(key) {
      let index2 = __privateGet(this, _keys).indexOf(key);
      index2 = index2 === -1 || index2 === this.size - 1 ? -1 : index2 + 1;
      if (index2 === -1) {
        return void 0;
      }
      return this.entryAt(index2);
    }
    /**
     * Sets a new key-value pair at the position after the given key.
     */
    setAfter(key, newKey, value) {
      const index2 = __privateGet(this, _keys).indexOf(key);
      if (index2 === -1) {
        return this;
      }
      return this.insert(index2 + 1, newKey, value);
    }
    first() {
      return this.entryAt(0);
    }
    last() {
      return this.entryAt(-1);
    }
    clear() {
      __privateSet(this, _keys, []);
      return super.clear();
    }
    delete(key) {
      const deleted = super.delete(key);
      if (deleted) {
        __privateGet(this, _keys).splice(__privateGet(this, _keys).indexOf(key), 1);
      }
      return deleted;
    }
    deleteAt(index2) {
      const key = this.keyAt(index2);
      if (key !== void 0) {
        return this.delete(key);
      }
      return false;
    }
    at(index2) {
      const key = at(__privateGet(this, _keys), index2);
      if (key !== void 0) {
        return this.get(key);
      }
    }
    entryAt(index2) {
      const key = at(__privateGet(this, _keys), index2);
      if (key !== void 0) {
        return [key, this.get(key)];
      }
    }
    indexOf(key) {
      return __privateGet(this, _keys).indexOf(key);
    }
    keyAt(index2) {
      return at(__privateGet(this, _keys), index2);
    }
    from(key, offset4) {
      const index2 = this.indexOf(key);
      if (index2 === -1) {
        return void 0;
      }
      let dest = index2 + offset4;
      if (dest < 0) dest = 0;
      if (dest >= this.size) dest = this.size - 1;
      return this.at(dest);
    }
    keyFrom(key, offset4) {
      const index2 = this.indexOf(key);
      if (index2 === -1) {
        return void 0;
      }
      let dest = index2 + offset4;
      if (dest < 0) dest = 0;
      if (dest >= this.size) dest = this.size - 1;
      return this.keyAt(dest);
    }
    find(predicate, thisArg) {
      let index2 = 0;
      for (const entry of this) {
        if (Reflect.apply(predicate, thisArg, [entry, index2, this])) {
          return entry;
        }
        index2++;
      }
      return void 0;
    }
    findIndex(predicate, thisArg) {
      let index2 = 0;
      for (const entry of this) {
        if (Reflect.apply(predicate, thisArg, [entry, index2, this])) {
          return index2;
        }
        index2++;
      }
      return -1;
    }
    filter(predicate, thisArg) {
      const entries = [];
      let index2 = 0;
      for (const entry of this) {
        if (Reflect.apply(predicate, thisArg, [entry, index2, this])) {
          entries.push(entry);
        }
        index2++;
      }
      return new _a(entries);
    }
    map(callbackfn, thisArg) {
      const entries = [];
      let index2 = 0;
      for (const entry of this) {
        entries.push([entry[0], Reflect.apply(callbackfn, thisArg, [entry, index2, this])]);
        index2++;
      }
      return new _a(entries);
    }
    reduce(...args) {
      const [callbackfn, initialValue] = args;
      let index2 = 0;
      let accumulator = initialValue ?? this.at(0);
      for (const entry of this) {
        if (index2 === 0 && args.length === 1) {
          accumulator = entry;
        } else {
          accumulator = Reflect.apply(callbackfn, this, [accumulator, entry, index2, this]);
        }
        index2++;
      }
      return accumulator;
    }
    reduceRight(...args) {
      const [callbackfn, initialValue] = args;
      let accumulator = initialValue ?? this.at(-1);
      for (let index2 = this.size - 1; index2 >= 0; index2--) {
        const entry = this.at(index2);
        if (index2 === this.size - 1 && args.length === 1) {
          accumulator = entry;
        } else {
          accumulator = Reflect.apply(callbackfn, this, [accumulator, entry, index2, this]);
        }
      }
      return accumulator;
    }
    toSorted(compareFn) {
      const entries = [...this.entries()].sort(compareFn);
      return new _a(entries);
    }
    toReversed() {
      const reversed = new _a();
      for (let index2 = this.size - 1; index2 >= 0; index2--) {
        const key = this.keyAt(index2);
        const element = this.get(key);
        reversed.set(key, element);
      }
      return reversed;
    }
    toSpliced(...args) {
      const entries = [...this.entries()];
      entries.splice(...args);
      return new _a(entries);
    }
    slice(start, end) {
      const result = new _a();
      let stop = this.size - 1;
      if (start === void 0) {
        return result;
      }
      if (start < 0) {
        start = start + this.size;
      }
      if (end !== void 0 && end > 0) {
        stop = end - 1;
      }
      for (let index2 = start; index2 <= stop; index2++) {
        const key = this.keyAt(index2);
        const element = this.get(key);
        result.set(key, element);
      }
      return result;
    }
    every(predicate, thisArg) {
      let index2 = 0;
      for (const entry of this) {
        if (!Reflect.apply(predicate, thisArg, [entry, index2, this])) {
          return false;
        }
        index2++;
      }
      return true;
    }
    some(predicate, thisArg) {
      let index2 = 0;
      for (const entry of this) {
        if (Reflect.apply(predicate, thisArg, [entry, index2, this])) {
          return true;
        }
        index2++;
      }
      return false;
    }
  }, _keys = new WeakMap(), __name6(_a, "OrderedDict"), _a);
  function at(array, index2) {
    if ("at" in Array.prototype) {
      return Array.prototype.at.call(array, index2);
    }
    const actualIndex = toSafeIndex(array, index2);
    return actualIndex === -1 ? void 0 : array[actualIndex];
  }
  __name6(at, "at");
  function toSafeIndex(array, index2) {
    const length = array.length;
    const relativeIndex = toSafeInteger(index2);
    const actualIndex = relativeIndex >= 0 ? relativeIndex : length + relativeIndex;
    return actualIndex < 0 || actualIndex >= length ? -1 : actualIndex;
  }
  __name6(toSafeIndex, "toSafeIndex");
  function toSafeInteger(number) {
    return number !== number || number === 0 ? 0 : Math.trunc(number);
  }
  __name6(toSafeInteger, "toSafeInteger");
  // @__NO_SIDE_EFFECTS__
  function createCollection2(name) {
    const PROVIDER_NAME2 = name + "CollectionProvider";
    const [createCollectionContext, createCollectionScope4] = createContextScope(PROVIDER_NAME2);
    const [CollectionContextProvider, useCollectionContext] = createCollectionContext(
      PROVIDER_NAME2,
      {
        collectionElement: null,
        collectionRef: { current: null },
        collectionRefObject: { current: null },
        itemMap: new OrderedDict(),
        setItemMap: /* @__PURE__ */ __name6(() => void 0, "setItemMap")
      }
    );
    const CollectionProvider = /* @__PURE__ */ __name6(({ state, ...props }) => {
      return state ? /* @__PURE__ */ jsx(CollectionProviderImpl, { ...props, state }) : /* @__PURE__ */ jsx(CollectionInit, { ...props });
    }, "CollectionProvider");
    CollectionProvider.displayName = PROVIDER_NAME2;
    const CollectionInit = /* @__PURE__ */ __name6((props) => {
      const state = useInitCollection();
      return /* @__PURE__ */ jsx(CollectionProviderImpl, { ...props, state });
    }, "CollectionInit");
    CollectionInit.displayName = PROVIDER_NAME2 + "Init";
    const CollectionProviderImpl = /* @__PURE__ */ __name6((props) => {
      const { scope, children, state } = props;
      const ref = useRef(null);
      const [collectionElement, setCollectionElement] = useState(
        null
      );
      const composeRefs2 = useComposedRefs(ref, setCollectionElement);
      const [itemMap, setItemMap] = state;
      useEffect(() => {
        if (!collectionElement) return;
        const observer = getChildListObserver(() => {
        });
        observer.observe(collectionElement, {
          childList: true,
          subtree: true
        });
        return () => {
          observer.disconnect();
        };
      }, [collectionElement]);
      return /* @__PURE__ */ jsx(
        CollectionContextProvider,
        {
          scope,
          itemMap,
          setItemMap,
          collectionRef: composeRefs2,
          collectionRefObject: ref,
          collectionElement,
          children
        }
      );
    }, "CollectionProviderImpl");
    CollectionProviderImpl.displayName = PROVIDER_NAME2 + "Impl";
    const COLLECTION_SLOT_NAME = name + "CollectionSlot";
    const CollectionSlotImpl = createSlot(COLLECTION_SLOT_NAME);
    const CollectionSlot = forwardRef(
      (props, forwardedRef) => {
        const { scope, children } = props;
        const context = useCollectionContext(COLLECTION_SLOT_NAME, scope);
        const composedRefs = useComposedRefs(forwardedRef, context.collectionRef);
        return /* @__PURE__ */ jsx(CollectionSlotImpl, { ref: composedRefs, children });
      }
    );
    CollectionSlot.displayName = COLLECTION_SLOT_NAME;
    const ITEM_SLOT_NAME = name + "CollectionItemSlot";
    const ITEM_DATA_ATTR = "data-radix-collection-item";
    const CollectionItemSlotImpl = createSlot(ITEM_SLOT_NAME);
    const CollectionItemSlot = forwardRef(
      (props, forwardedRef) => {
        const { scope, children, ...itemData } = props;
        const ref = useRef(null);
        const [element, setElement] = useState(null);
        const composedRefs = useComposedRefs(forwardedRef, ref, setElement);
        const context = useCollectionContext(ITEM_SLOT_NAME, scope);
        const { setItemMap } = context;
        const itemDataRef = useRef(itemData);
        if (!shallowEqual(itemDataRef.current, itemData)) {
          itemDataRef.current = itemData;
        }
        const memoizedItemData = itemDataRef.current;
        useEffect(() => {
          const itemData2 = memoizedItemData;
          setItemMap((map) => {
            if (!element) {
              return map;
            }
            if (!map.has(element)) {
              map.set(element, { ...itemData2, element });
              return map.toSorted(sortByDocumentPosition);
            }
            return map.set(element, { ...itemData2, element }).toSorted(sortByDocumentPosition);
          });
          return () => {
            setItemMap((map) => {
              if (!element || !map.has(element)) {
                return map;
              }
              map.delete(element);
              return new OrderedDict(map);
            });
          };
        }, [element, memoizedItemData, setItemMap]);
        return /* @__PURE__ */ jsx(CollectionItemSlotImpl, { ...{ [ITEM_DATA_ATTR]: "" }, ref: composedRefs, children });
      }
    );
    CollectionItemSlot.displayName = ITEM_SLOT_NAME;
    function useInitCollection() {
      return useState(new OrderedDict());
    }
    __name6(useInitCollection, "useInitCollection");
    function useCollection4(scope) {
      const { itemMap } = useCollectionContext(name + "CollectionConsumer", scope);
      return itemMap;
    }
    __name6(useCollection4, "useCollection");
    const functions = {
      createCollectionScope: createCollectionScope4,
      useCollection: useCollection4,
      useInitCollection
    };
    return [
      { Provider: CollectionProvider, Slot: CollectionSlot, ItemSlot: CollectionItemSlot },
      functions
    ];
  }
  __name6(createCollection2, "createCollection");
  function shallowEqual(a2, b) {
    if (a2 === b) return true;
    if (typeof a2 !== "object" || typeof b !== "object") return false;
    if (a2 == null || b == null) return false;
    const keysA = Object.keys(a2);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (a2[key] !== b[key]) return false;
    }
    return true;
  }
  __name6(shallowEqual, "shallowEqual");
  function isElementPreceding(a2, b) {
    return !!(b.compareDocumentPosition(a2) & Node.DOCUMENT_POSITION_PRECEDING);
  }
  __name6(isElementPreceding, "isElementPreceding");
  function sortByDocumentPosition(a2, b) {
    return !a2[1].element || !b[1].element ? 0 : isElementPreceding(a2[1].element, b[1].element) ? -1 : 1;
  }
  __name6(sortByDocumentPosition, "sortByDocumentPosition");
  function getChildListObserver(callback) {
    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.type === "childList") {
          callback();
          return;
        }
      }
    });
    return observer;
  }
  __name6(getChildListObserver, "getChildListObserver");

  // ../../node_modules/.pnpm/@radix-ui+primitive@1.1.7/node_modules/@radix-ui/primitive/dist/index.mjs
  var __defProp8 = Object.defineProperty;
  var __name7 = (target, value) => __defProp8(target, "name", { value, configurable: true });
  var canUseDOM = !!(typeof window !== "undefined" && window.document && window.document.createElement);
  function composeEventHandlers(originalEventHandler, ourEventHandler, { checkForDefaultPrevented = true } = {}) {
    return /* @__PURE__ */ __name7(function handleEvent(event) {
      originalEventHandler?.(event);
      if (checkForDefaultPrevented === false || !event || !event.defaultPrevented) {
        return ourEventHandler?.(event);
      }
    }, "handleEvent");
  }
  __name7(composeEventHandlers, "composeEventHandlers");
  function getOwnerWindow(element) {
    if (!canUseDOM) {
      throw new Error("Cannot access window outside of the DOM");
    }
    return element?.ownerDocument?.defaultView ?? window;
  }
  __name7(getOwnerWindow, "getOwnerWindow");
  function getOwnerDocument(element) {
    if (!canUseDOM) {
      throw new Error("Cannot access document outside of the DOM");
    }
    return element?.ownerDocument ?? document;
  }
  __name7(getOwnerDocument, "getOwnerDocument");
  function getActiveElement(node, activeDescendant = false) {
    const { activeElement } = getOwnerDocument(node);
    if (!activeElement?.nodeName) {
      return null;
    }
    if (isFrame(activeElement) && activeElement.contentDocument) {
      return getActiveElement(activeElement.contentDocument.body, activeDescendant);
    }
    if (activeDescendant) {
      const id = activeElement.getAttribute("aria-activedescendant");
      if (id) {
        const element = getOwnerDocument(activeElement).getElementById(id);
        if (element) {
          return element;
        }
      }
    }
    return activeElement;
  }
  __name7(getActiveElement, "getActiveElement");
  function isFrame(element) {
    return element.tagName === "IFRAME";
  }
  __name7(isFrame, "isFrame");

  // ../../node_modules/.pnpm/@radix-ui+primitive@1.1.7/node_modules/@radix-ui/primitive/dist/internal/is-development.false.mjs
  var IS_DEVELOPMENT = false;

  // ../../node_modules/.pnpm/@radix-ui+react-use-layout-effect@1.1.4_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-layout-effect/dist/index.mjs
  var useLayoutEffect2 = globalThis?.document ? useLayoutEffect : () => {
  };

  // ../../node_modules/.pnpm/@radix-ui+react-use-effect-event@0.0.5_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-effect-event/dist/index.mjs
  var __defProp9 = Object.defineProperty;
  var __name8 = (target, value) => __defProp9(target, "name", { value, configurable: true });
  var useReactEffectEvent = react_shim_exports[" useEffectEvent ".trim().toString()];
  var useReactInsertionEffect = react_shim_exports[" useInsertionEffect ".trim().toString()];
  function useEffectEvent(callback) {
    if (typeof useReactEffectEvent === "function") {
      return useReactEffectEvent(callback);
    }
    const ref = useRef(() => {
      throw new Error("Cannot call an event handler while rendering.");
    });
    if (typeof useReactInsertionEffect === "function") {
      useReactInsertionEffect(() => {
        ref.current = callback;
      });
    } else {
      useLayoutEffect2(() => {
        ref.current = callback;
      });
    }
    return useMemo(() => ((...args) => ref.current?.(...args)), []);
  }
  __name8(useEffectEvent, "useEffectEvent");

  // ../../node_modules/.pnpm/@radix-ui+react-use-controllable-state@1.2.6_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-controllable-state/dist/index.mjs
  var __defProp10 = Object.defineProperty;
  var __name9 = (target, value) => __defProp10(target, "name", { value, configurable: true });
  var useInsertionEffect2 = react_shim_exports[" useInsertionEffect ".trim().toString()] || useLayoutEffect2;
  function useControllableState({
    prop,
    defaultProp,
    onChange = /* @__PURE__ */ __name9(() => {
    }, "onChange"),
    caller
  }) {
    const [uncontrolledProp, setUncontrolledProp, onChangeRef] = useUncontrolledState({
      defaultProp,
      onChange
    });
    const isControlled = prop !== void 0;
    const value = isControlled ? prop : uncontrolledProp;
    if (IS_DEVELOPMENT) {
      const isControlledRef = useRef(prop !== void 0);
      useEffect(() => {
        const wasControlled = isControlledRef.current;
        if (wasControlled !== isControlled) {
          const from = wasControlled ? "controlled" : "uncontrolled";
          const to = isControlled ? "controlled" : "uncontrolled";
          console.warn(
            `${caller} is changing from ${from} to ${to}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`
          );
        }
        isControlledRef.current = isControlled;
      }, [isControlled, caller]);
    }
    const setValue = useCallback(
      (nextValue) => {
        if (isControlled) {
          const value2 = isFunction(nextValue) ? nextValue(prop) : nextValue;
          if (value2 !== prop) {
            onChangeRef.current?.(value2);
          }
        } else {
          setUncontrolledProp(nextValue);
        }
      },
      [isControlled, prop, setUncontrolledProp, onChangeRef]
    );
    return [value, setValue];
  }
  __name9(useControllableState, "useControllableState");
  function useUncontrolledState({
    defaultProp,
    onChange
  }) {
    const [value, setValue] = useState(defaultProp);
    const prevValueRef = useRef(value);
    const onChangeRef = useRef(onChange);
    useInsertionEffect2(() => {
      onChangeRef.current = onChange;
    }, [onChange]);
    useEffect(() => {
      if (prevValueRef.current !== value) {
        onChangeRef.current?.(value);
        prevValueRef.current = value;
      }
    }, [value, prevValueRef]);
    return [value, setValue, onChangeRef];
  }
  __name9(useUncontrolledState, "useUncontrolledState");
  function isFunction(value) {
    return typeof value === "function";
  }
  __name9(isFunction, "isFunction");
  var SYNC_STATE = /* @__PURE__ */ Symbol("RADIX:SYNC_STATE");
  function useControllableStateReducer(reducer, userArgs, initialArg, init) {
    const { prop: controlledState, defaultProp, onChange: onChangeProp, caller } = userArgs;
    const isControlled = controlledState !== void 0;
    const onChange = useEffectEvent(onChangeProp);
    if (IS_DEVELOPMENT) {
      const isControlledRef = useRef(controlledState !== void 0);
      useEffect(() => {
        const wasControlled = isControlledRef.current;
        if (wasControlled !== isControlled) {
          const from = wasControlled ? "controlled" : "uncontrolled";
          const to = isControlled ? "controlled" : "uncontrolled";
          console.warn(
            `${caller} is changing from ${from} to ${to}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`
          );
        }
        isControlledRef.current = isControlled;
      }, [isControlled, caller]);
    }
    const args = [{ ...initialArg, state: defaultProp }];
    if (init) {
      args.push(init);
    }
    const [internalState, dispatch] = useReducer(
      (state2, action) => {
        if (action.type === SYNC_STATE) {
          return { ...state2, state: action.state };
        }
        const next = reducer(state2, action);
        if (isControlled && !Object.is(next.state, state2.state)) {
          onChange(next.state);
        }
        return next;
      },
      ...args
    );
    const uncontrolledState = internalState.state;
    const prevValueRef = useRef(uncontrolledState);
    useEffect(() => {
      if (prevValueRef.current !== uncontrolledState) {
        prevValueRef.current = uncontrolledState;
        if (!isControlled) {
          onChange(uncontrolledState);
        }
      }
    }, [uncontrolledState, prevValueRef, isControlled]);
    const state = useMemo(() => {
      const isControlled2 = controlledState !== void 0;
      if (isControlled2) {
        return { ...internalState, state: controlledState };
      }
      return internalState;
    }, [internalState, controlledState]);
    useEffect(() => {
      if (isControlled && !Object.is(controlledState, internalState.state)) {
        dispatch({ type: SYNC_STATE, state: controlledState });
      }
    }, [controlledState, internalState.state, isControlled]);
    return [state, dispatch];
  }
  __name9(useControllableStateReducer, "useControllableStateReducer");

  // ../../node_modules/.pnpm/@radix-ui+react-collapsible@1.1.20_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-collapsible/dist/index.mjs
  var dist_exports2 = {};
  __export(dist_exports2, {
    Collapsible: () => Collapsible,
    CollapsibleContent: () => CollapsibleContent,
    CollapsibleTrigger: () => CollapsibleTrigger,
    Content: () => Content,
    Root: () => Root2,
    Trigger: () => Trigger,
    createCollapsibleScope: () => createCollapsibleScope
  });

  // ../../node_modules/.pnpm/@radix-ui+react-presence@1.1.10_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-presence/dist/index.mjs
  var __defProp11 = Object.defineProperty;
  var __name10 = (target, value) => __defProp11(target, "name", { value, configurable: true });
  function useStateMachine(initialState, machine) {
    return useReducer((state, event) => {
      const nextState = machine[state][event];
      return nextState ?? state;
    }, initialState);
  }
  __name10(useStateMachine, "useStateMachine");
  var Presence = /* @__PURE__ */ __name10((props) => {
    const { present, children } = props;
    const presence = usePresence(present);
    const child = typeof children === "function" ? children({ present: presence.isPresent }) : Children.only(children);
    const ref = useStableComposedRefs(presence.ref, getElementRef2(child));
    const forceMount = typeof children === "function";
    return forceMount || presence.isPresent ? cloneElement(child, { ref }) : null;
  }, "Presence");
  function usePresence(present) {
    const [node, setNode] = useState();
    const stylesRef = useRef(null);
    const prevPresentRef = useRef(present);
    const prevAnimationNameRef = useRef("none");
    const mountAnimationNameRef = useRef(void 0);
    const initialState = present ? "mounted" : "unmounted";
    const [state, send] = useStateMachine(initialState, {
      mounted: {
        UNMOUNT: "unmounted",
        ANIMATION_OUT: "unmountSuspended"
      },
      unmountSuspended: {
        MOUNT: "mounted",
        ANIMATION_END: "unmounted"
      },
      unmounted: {
        MOUNT: "mounted"
      }
    });
    useEffect(() => {
      if (state === "mounted") {
        prevAnimationNameRef.current = mountAnimationNameRef.current ?? getAnimationName(stylesRef.current);
        mountAnimationNameRef.current = void 0;
      } else {
        prevAnimationNameRef.current = "none";
      }
    }, [state]);
    useLayoutEffect2(() => {
      const styles = stylesRef.current;
      const wasPresent = prevPresentRef.current;
      const hasPresentChanged = wasPresent !== present;
      if (hasPresentChanged) {
        const prevAnimationName = prevAnimationNameRef.current;
        const currentAnimationName = getAnimationName(styles);
        if (present) {
          mountAnimationNameRef.current = currentAnimationName;
          send("MOUNT");
        } else if (currentAnimationName === "none" || styles?.display === "none") {
          send("UNMOUNT");
        } else {
          const isAnimating = prevAnimationName !== currentAnimationName;
          if (wasPresent && isAnimating) {
            send("ANIMATION_OUT");
          } else {
            send("UNMOUNT");
          }
        }
        prevPresentRef.current = present;
      }
    }, [present, send]);
    useLayoutEffect2(() => {
      if (node) {
        let timeoutId;
        const ownerWindow = node.ownerDocument.defaultView ?? window;
        const handleAnimationEnd = /* @__PURE__ */ __name10((event) => {
          const currentAnimationName = getAnimationName(stylesRef.current);
          const isCurrentAnimation = currentAnimationName.includes(CSS.escape(event.animationName));
          if (event.target === node && isCurrentAnimation) {
            send("ANIMATION_END");
            if (!prevPresentRef.current) {
              const currentFillMode = node.style.animationFillMode;
              node.style.animationFillMode = "forwards";
              timeoutId = ownerWindow.setTimeout(() => {
                if (node.style.animationFillMode === "forwards") {
                  node.style.animationFillMode = currentFillMode;
                }
              });
            }
          }
        }, "handleAnimationEnd");
        const handleAnimationStart = /* @__PURE__ */ __name10((event) => {
          if (event.target === node) {
            prevAnimationNameRef.current = getAnimationName(stylesRef.current);
          }
        }, "handleAnimationStart");
        node.addEventListener("animationstart", handleAnimationStart);
        node.addEventListener("animationcancel", handleAnimationEnd);
        node.addEventListener("animationend", handleAnimationEnd);
        return () => {
          ownerWindow.clearTimeout(timeoutId);
          node.removeEventListener("animationstart", handleAnimationStart);
          node.removeEventListener("animationcancel", handleAnimationEnd);
          node.removeEventListener("animationend", handleAnimationEnd);
        };
      } else {
        send("ANIMATION_END");
      }
    }, [node, send]);
    return {
      isPresent: ["mounted", "unmountSuspended"].includes(state),
      ref: useCallback((node2) => {
        if (node2) {
          const styles = getComputedStyle(node2);
          stylesRef.current = styles;
          mountAnimationNameRef.current = getAnimationName(styles);
        } else {
          stylesRef.current = null;
        }
        setNode(node2);
      }, [])
    };
  }
  __name10(usePresence, "usePresence");
  function setRef2(ref, value) {
    if (typeof ref === "function") {
      return ref(value);
    } else if (ref !== null && ref !== void 0) {
      ref.current = value;
    }
  }
  __name10(setRef2, "setRef");
  function useStableComposedRefs(...refs) {
    const refsRef = useRef(refs);
    refsRef.current = refs;
    return useCallback((node) => {
      const currentRefs = refsRef.current;
      let hasCleanup = false;
      const cleanups = currentRefs.map((ref) => {
        const cleanup = setRef2(ref, node);
        if (!hasCleanup && typeof cleanup === "function") {
          hasCleanup = true;
        }
        return cleanup;
      });
      if (hasCleanup) {
        return () => {
          for (let i = 0; i < cleanups.length; i++) {
            const cleanup = cleanups[i];
            if (typeof cleanup === "function") {
              cleanup();
            } else {
              setRef2(currentRefs[i], null);
            }
          }
        };
      }
    }, []);
  }
  __name10(useStableComposedRefs, "useStableComposedRefs");
  function getAnimationName(styles) {
    return styles?.animationName || "none";
  }
  __name10(getAnimationName, "getAnimationName");
  function getElementRef2(element) {
    let getter = Object.getOwnPropertyDescriptor(element.props, "ref")?.get;
    let mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.ref;
    }
    getter = Object.getOwnPropertyDescriptor(element, "ref")?.get;
    mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.props.ref;
    }
    return element.props.ref || element.ref;
  }
  __name10(getElementRef2, "getElementRef");

  // ../../node_modules/.pnpm/@radix-ui+react-id@1.1.4_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-id/dist/index.mjs
  var __defProp12 = Object.defineProperty;
  var __name11 = (target, value) => __defProp12(target, "name", { value, configurable: true });
  var useReactId = react_shim_exports[" useId ".trim().toString()] || (() => void 0);
  var count = 0;
  function useId2(deterministicId) {
    const [id, setId] = useState(useReactId());
    useLayoutEffect2(() => {
      if (!deterministicId) setId((reactId) => reactId ?? String(count++));
    }, [deterministicId]);
    return deterministicId || (id ? `radix-${id}` : "");
  }
  __name11(useId2, "useId");

  // ../../node_modules/.pnpm/@radix-ui+react-collapsible@1.1.20_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-collapsible/dist/index.mjs
  var __defProp13 = Object.defineProperty;
  var __name12 = (target, value) => __defProp13(target, "name", { value, configurable: true });
  var COLLAPSIBLE_NAME = "Collapsible";
  var [createCollapsibleContext, createCollapsibleScope] = createContextScope(COLLAPSIBLE_NAME);
  var [CollapsibleProvider, useCollapsibleContext] = createCollapsibleContext(COLLAPSIBLE_NAME);
  var Collapsible = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name12(function Collapsible2(props, forwardedRef) {
      const {
        __scopeCollapsible,
        open: openProp,
        defaultOpen,
        disabled,
        onOpenChange,
        ...collapsibleProps
      } = props;
      const [open, setOpen] = useControllableState({
        prop: openProp,
        defaultProp: defaultOpen ?? false,
        onChange: onOpenChange,
        caller: COLLAPSIBLE_NAME
      });
      return /* @__PURE__ */ jsx(
        CollapsibleProvider,
        {
          scope: __scopeCollapsible,
          disabled,
          contentId: useId2(),
          open,
          onOpenToggle: useCallback(() => setOpen((prevOpen) => !prevOpen), [setOpen]),
          children: /* @__PURE__ */ jsx(
            Primitive.div,
            {
              "data-state": getState(open),
              "data-disabled": disabled ? "" : void 0,
              ...collapsibleProps,
              ref: forwardedRef
            }
          )
        }
      );
    }, "Collapsible")
  );
  var TRIGGER_NAME = "CollapsibleTrigger";
  var CollapsibleTrigger = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name12(function CollapsibleTrigger2(props, forwardedRef) {
      const { __scopeCollapsible, ...triggerProps } = props;
      const context = useCollapsibleContext(TRIGGER_NAME, __scopeCollapsible);
      return /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          "aria-controls": context.open ? context.contentId : void 0,
          "aria-expanded": context.open || false,
          "data-state": getState(context.open),
          "data-disabled": context.disabled ? "" : void 0,
          disabled: context.disabled,
          ...triggerProps,
          ref: forwardedRef,
          onClick: composeEventHandlers(props.onClick, context.onOpenToggle)
        }
      );
    }, "CollapsibleTrigger")
  );
  var CONTENT_NAME = "CollapsibleContent";
  var CollapsibleContent = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name12(function CollapsibleContent2(props, forwardedRef) {
      const { forceMount, ...contentProps } = props;
      const context = useCollapsibleContext(CONTENT_NAME, props.__scopeCollapsible);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: ({ present }) => /* @__PURE__ */ jsx(CollapsibleContentImpl, { ...contentProps, ref: forwardedRef, present }) });
    }, "CollapsibleContent")
  );
  var CollapsibleContentImpl = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name12(function CollapsibleContentImpl2(props, forwardedRef) {
    const { __scopeCollapsible, present, children, ...contentProps } = props;
    const context = useCollapsibleContext(CONTENT_NAME, __scopeCollapsible);
    const [isPresent, setIsPresent] = useState(present);
    const ref = useRef(null);
    const composedRefs = useComposedRefs(forwardedRef, ref);
    const heightRef = useRef(0);
    const height = heightRef.current;
    const widthRef = useRef(0);
    const width = widthRef.current;
    const isOpen = context.open || isPresent;
    const isMountAnimationPreventedRef = useRef(isOpen);
    const originalStylesRef = useRef(void 0);
    useEffect(() => {
      const rAF = requestAnimationFrame(() => isMountAnimationPreventedRef.current = false);
      return () => cancelAnimationFrame(rAF);
    }, []);
    useLayoutEffect2(() => {
      const node = ref.current;
      if (node) {
        originalStylesRef.current = originalStylesRef.current || {
          transitionDuration: node.style.transitionDuration,
          animationName: node.style.animationName
        };
        node.style.transitionDuration = "0s";
        node.style.animationName = "none";
        const rect = node.getBoundingClientRect();
        heightRef.current = rect.height;
        widthRef.current = rect.width;
        if (!isMountAnimationPreventedRef.current) {
          node.style.transitionDuration = originalStylesRef.current.transitionDuration;
          node.style.animationName = originalStylesRef.current.animationName;
        }
        setIsPresent(present);
      }
    }, [context.open, present]);
    return /* @__PURE__ */ jsx(
      Primitive.div,
      {
        "data-state": getState(context.open),
        "data-disabled": context.disabled ? "" : void 0,
        id: context.contentId,
        hidden: !isOpen,
        ...contentProps,
        ref: composedRefs,
        style: {
          [`--radix-collapsible-content-height`]: height ? `${height}px` : void 0,
          [`--radix-collapsible-content-width`]: width ? `${width}px` : void 0,
          ...props.style
        },
        children: isOpen && children
      }
    );
  }, "CollapsibleContentImpl"));
  function getState(open) {
    return open ? "open" : "closed";
  }
  __name12(getState, "getState");
  var Root2 = Collapsible;
  var Trigger = CollapsibleTrigger;
  var Content = CollapsibleContent;

  // ../../node_modules/.pnpm/@radix-ui+react-direction@1.1.4_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-direction/dist/index.mjs
  var __defProp14 = Object.defineProperty;
  var __name13 = (target, value) => __defProp14(target, "name", { value, configurable: true });
  var DirectionContext = createContext(void 0);
  function useDirection(localDir) {
    const globalDir = useContext(DirectionContext);
    return localDir || globalDir || "ltr";
  }
  __name13(useDirection, "useDirection");

  // ../../node_modules/.pnpm/@radix-ui+react-alert-dialog@1.1.23_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-alert-dialog/dist/index.mjs
  var dist_exports4 = {};
  __export(dist_exports4, {
    Action: () => Action,
    AlertDialog: () => AlertDialog,
    AlertDialogAction: () => AlertDialogAction,
    AlertDialogCancel: () => AlertDialogCancel,
    AlertDialogContent: () => AlertDialogContent,
    AlertDialogDescription: () => AlertDialogDescription,
    AlertDialogOverlay: () => AlertDialogOverlay,
    AlertDialogPortal: () => AlertDialogPortal,
    AlertDialogTitle: () => AlertDialogTitle,
    AlertDialogTrigger: () => AlertDialogTrigger,
    Cancel: () => Cancel,
    Content: () => Content2,
    Description: () => Description2,
    Overlay: () => Overlay2,
    Portal: () => Portal22,
    Root: () => Root22,
    Title: () => Title2,
    Trigger: () => Trigger2,
    createAlertDialogScope: () => createAlertDialogScope
  });

  // ../../node_modules/.pnpm/@radix-ui+react-dialog@1.1.23_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-dialog/dist/index.mjs
  var dist_exports3 = {};
  __export(dist_exports3, {
    Close: () => DialogClose,
    Content: () => DialogContent,
    Description: () => DialogDescription,
    Dialog: () => Dialog,
    DialogClose: () => DialogClose,
    DialogContent: () => DialogContent,
    DialogDescription: () => DialogDescription,
    DialogOverlay: () => DialogOverlay,
    DialogPortal: () => DialogPortal,
    DialogTitle: () => DialogTitle,
    DialogTrigger: () => DialogTrigger,
    Overlay: () => DialogOverlay,
    Portal: () => DialogPortal,
    Root: () => Dialog,
    Title: () => DialogTitle,
    Trigger: () => DialogTrigger,
    WarningProvider: () => WarningProvider,
    createDialogScope: () => createDialogScope
  });

  // ../../node_modules/.pnpm/@radix-ui+react-use-callback-ref@1.1.4_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-callback-ref/dist/index.mjs
  var __defProp15 = Object.defineProperty;
  var __name14 = (target, value) => __defProp15(target, "name", { value, configurable: true });
  function useCallbackRef(callback) {
    const callbackRef = useRef(callback);
    useEffect(() => {
      callbackRef.current = callback;
    });
    return useMemo(() => ((...args) => callbackRef.current?.(...args)), []);
  }
  __name14(useCallbackRef, "useCallbackRef");

  // ../../node_modules/.pnpm/@radix-ui+react-dismissable-layer@1.1.19_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-dismissable-layer/dist/index.mjs
  var __defProp16 = Object.defineProperty;
  var __name15 = (target, value) => __defProp16(target, "name", { value, configurable: true });
  var CONTEXT_UPDATE = "dismissableLayer.update";
  var POINTER_DOWN_OUTSIDE = "dismissableLayer.pointerDownOutside";
  var FOCUS_OUTSIDE = "dismissableLayer.focusOutside";
  var originalBodyPointerEvents;
  var DismissableLayerContext = createContext({
    layers: /* @__PURE__ */ new Set(),
    layersWithOutsidePointerEventsDisabled: /* @__PURE__ */ new Set(),
    branches: /* @__PURE__ */ new Set(),
    // Outside elements that belong to a layer's own dismiss affordance (eg, a
    // dialog overlay). Pressing them should dismiss the layer regardless of
    // whether or not they stop propagation.
    //
    // See https://github.com/radix-ui/primitives/issues/3346
    dismissableSurfaces: /* @__PURE__ */ new Set()
  });
  var DismissableLayer = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name15(function DismissableLayer2(props, forwardedRef) {
      const {
        disableOutsidePointerEvents = false,
        deferPointerDownOutside = false,
        onEscapeKeyDown,
        onPointerDownOutside,
        onFocusOutside,
        onInteractOutside,
        onDismiss,
        ...layerProps
      } = props;
      const context = useContext(DismissableLayerContext);
      const [node, setNode] = useState(null);
      const ownerDocument = node?.ownerDocument ?? globalThis?.document;
      const [, force] = useState({});
      const composedRefs = useComposedRefs(forwardedRef, setNode);
      const layers = Array.from(context.layers);
      const [highestLayerWithOutsidePointerEventsDisabled] = [
        ...context.layersWithOutsidePointerEventsDisabled
      ].slice(-1);
      const highestLayerWithOutsidePointerEventsDisabledIndex = highestLayerWithOutsidePointerEventsDisabled ? layers.indexOf(highestLayerWithOutsidePointerEventsDisabled) : -1;
      const index2 = node ? layers.indexOf(node) : -1;
      const isBodyPointerEventsDisabled = context.layersWithOutsidePointerEventsDisabled.size > 0;
      const isPointerEventsEnabled = index2 >= highestLayerWithOutsidePointerEventsDisabledIndex;
      const isDeferredPointerDownOutsideRef = useRef(false);
      const pointerDownOutside = usePointerDownOutside(
        (event) => {
          onPointerDownOutside?.(event);
          onInteractOutside?.(event);
          if (!event.defaultPrevented) onDismiss?.();
        },
        {
          ownerDocument,
          deferPointerDownOutside,
          isDeferredPointerDownOutsideRef,
          dismissableSurfaces: context.dismissableSurfaces,
          shouldHandlePointerDownOutside: useCallback(
            (target) => {
              if (!(target instanceof Node)) {
                return false;
              }
              const isPointerDownOnBranch = [...context.branches].some(
                (branch) => branch.contains(target)
              );
              return isPointerEventsEnabled && !isPointerDownOnBranch;
            },
            [context.branches, isPointerEventsEnabled]
          )
        }
      );
      const focusOutside = useFocusOutside((event) => {
        if (deferPointerDownOutside && isDeferredPointerDownOutsideRef.current) {
          return;
        }
        const target = event.target;
        const isFocusInBranch = [...context.branches].some((branch) => branch.contains(target));
        if (isFocusInBranch) return;
        onFocusOutside?.(event);
        onInteractOutside?.(event);
        if (!event.defaultPrevented) onDismiss?.();
      }, ownerDocument);
      const isHighestLayer = node ? index2 === layers.length - 1 : false;
      const handleKeyDown = useCallbackRef((event) => {
        if (event.key !== "Escape") {
          return;
        }
        onEscapeKeyDown?.(event);
        if (!event.defaultPrevented && onDismiss) {
          event.preventDefault();
          onDismiss();
        }
      });
      useEffect(() => {
        if (!isHighestLayer) {
          return;
        }
        ownerDocument.addEventListener("keydown", handleKeyDown, { capture: true });
        return () => ownerDocument.removeEventListener("keydown", handleKeyDown, { capture: true });
      }, [ownerDocument, isHighestLayer, handleKeyDown]);
      useEffect(() => {
        if (!node) return;
        if (disableOutsidePointerEvents) {
          if (context.layersWithOutsidePointerEventsDisabled.size === 0) {
            originalBodyPointerEvents = ownerDocument.body.style.pointerEvents;
            ownerDocument.body.style.pointerEvents = "none";
          }
          context.layersWithOutsidePointerEventsDisabled.add(node);
        }
        context.layers.add(node);
        dispatchUpdate();
        return () => {
          if (disableOutsidePointerEvents) {
            context.layersWithOutsidePointerEventsDisabled.delete(node);
            if (context.layersWithOutsidePointerEventsDisabled.size === 0) {
              ownerDocument.body.style.pointerEvents = originalBodyPointerEvents;
            }
          }
        };
      }, [node, ownerDocument, disableOutsidePointerEvents, context]);
      useEffect(() => {
        return () => {
          if (!node) return;
          context.layers.delete(node);
          context.layersWithOutsidePointerEventsDisabled.delete(node);
          dispatchUpdate();
        };
      }, [node, context]);
      useEffect(() => {
        const handleUpdate = /* @__PURE__ */ __name15(() => force({}), "handleUpdate");
        document.addEventListener(CONTEXT_UPDATE, handleUpdate);
        return () => document.removeEventListener(CONTEXT_UPDATE, handleUpdate);
      }, []);
      return /* @__PURE__ */ jsx(
        Primitive.div,
        {
          ...layerProps,
          ref: composedRefs,
          style: {
            pointerEvents: isBodyPointerEventsDisabled ? isPointerEventsEnabled ? "auto" : "none" : void 0,
            ...props.style
          },
          onFocusCapture: composeEventHandlers(props.onFocusCapture, focusOutside.onFocusCapture),
          onBlurCapture: composeEventHandlers(props.onBlurCapture, focusOutside.onBlurCapture),
          onPointerDownCapture: composeEventHandlers(
            props.onPointerDownCapture,
            pointerDownOutside.onPointerDownCapture
          )
        }
      );
    }, "DismissableLayer")
  );
  function useDismissableLayerSurface() {
    const context = useContext(DismissableLayerContext);
    const [node, setNode] = useState(null);
    useEffect(() => {
      if (!node) {
        return;
      }
      context.dismissableSurfaces.add(node);
      return () => {
        context.dismissableSurfaces.delete(node);
      };
    }, [node, context.dismissableSurfaces]);
    return setNode;
  }
  __name15(useDismissableLayerSurface, "useDismissableLayerSurface");
  var IS_TRUE = /* @__PURE__ */ __name15(() => true, "IS_TRUE");
  function usePointerDownOutside(onPointerDownOutside, args) {
    const {
      ownerDocument = globalThis?.document,
      deferPointerDownOutside = false,
      isDeferredPointerDownOutsideRef,
      dismissableSurfaces,
      shouldHandlePointerDownOutside = IS_TRUE
    } = args;
    const handlePointerDownOutside = useCallbackRef(onPointerDownOutside);
    const isPointerInsideReactTreeRef = useRef(false);
    const isPointerDownOutsideRef = useRef(false);
    const interceptedOutsideInteractionEventsRef = useRef(/* @__PURE__ */ new Map());
    const handleClickRef = useRef(() => {
    });
    useEffect(() => {
      function resetOutsideInteraction() {
        isPointerDownOutsideRef.current = false;
        isDeferredPointerDownOutsideRef.current = false;
        interceptedOutsideInteractionEventsRef.current.clear();
      }
      __name15(resetOutsideInteraction, "resetOutsideInteraction");
      function isOutsideInteractionIntercepted() {
        return Array.from(interceptedOutsideInteractionEventsRef.current.values()).some(Boolean);
      }
      __name15(isOutsideInteractionIntercepted, "isOutsideInteractionIntercepted");
      function handleInteractionCapture(event) {
        if (!isPointerDownOutsideRef.current) {
          return;
        }
        const target = event.target;
        const isDismissableSurface = target instanceof Node && [...dismissableSurfaces].some((surface) => surface.contains(target));
        if (!isDismissableSurface) {
          interceptedOutsideInteractionEventsRef.current.set(event.type, true);
        }
        if (event.type === "click") {
          window.setTimeout(() => {
            if (isPointerDownOutsideRef.current) {
              handleClickRef.current();
            }
          }, 0);
        }
      }
      __name15(handleInteractionCapture, "handleInteractionCapture");
      function handleInteractionBubble(event) {
        if (isPointerDownOutsideRef.current) {
          interceptedOutsideInteractionEventsRef.current.set(event.type, false);
        }
      }
      __name15(handleInteractionBubble, "handleInteractionBubble");
      const handlePointerDown = /* @__PURE__ */ __name15((event) => {
        if (event.target && !isPointerInsideReactTreeRef.current) {
          let handleAndDispatchPointerDownOutsideEvent2 = function() {
            ownerDocument.removeEventListener("click", handleClickRef.current);
            const wasOutsideInteractionIntercepted = isOutsideInteractionIntercepted();
            resetOutsideInteraction();
            if (!wasOutsideInteractionIntercepted) {
              handleAndDispatchCustomEvent(
                POINTER_DOWN_OUTSIDE,
                handlePointerDownOutside,
                eventDetail,
                { discrete: true }
              );
            }
          };
          var handleAndDispatchPointerDownOutsideEvent = handleAndDispatchPointerDownOutsideEvent2;
          __name15(handleAndDispatchPointerDownOutsideEvent2, "handleAndDispatchPointerDownOutsideEvent");
          if (!shouldHandlePointerDownOutside(event.target)) {
            ownerDocument.removeEventListener("click", handleClickRef.current);
            resetOutsideInteraction();
            isPointerInsideReactTreeRef.current = false;
            return;
          }
          const eventDetail = { originalEvent: event };
          isPointerDownOutsideRef.current = true;
          isDeferredPointerDownOutsideRef.current = deferPointerDownOutside && event.button === 0;
          interceptedOutsideInteractionEventsRef.current.clear();
          if (!deferPointerDownOutside || event.button !== 0) {
            handleAndDispatchPointerDownOutsideEvent2();
          } else {
            ownerDocument.removeEventListener("click", handleClickRef.current);
            handleClickRef.current = handleAndDispatchPointerDownOutsideEvent2;
            ownerDocument.addEventListener("click", handleClickRef.current, { once: true });
          }
        } else {
          ownerDocument.removeEventListener("click", handleClickRef.current);
          resetOutsideInteraction();
        }
        isPointerInsideReactTreeRef.current = false;
      }, "handlePointerDown");
      const outsideInteractionEvents = [
        "pointerup",
        "mousedown",
        "mouseup",
        "touchstart",
        "touchend",
        "click"
      ];
      for (const eventName of outsideInteractionEvents) {
        ownerDocument.addEventListener(eventName, handleInteractionCapture, true);
        ownerDocument.addEventListener(eventName, handleInteractionBubble);
      }
      const timerId = window.setTimeout(() => {
        ownerDocument.addEventListener("pointerdown", handlePointerDown);
      }, 0);
      return () => {
        window.clearTimeout(timerId);
        ownerDocument.removeEventListener("pointerdown", handlePointerDown);
        ownerDocument.removeEventListener("click", handleClickRef.current);
        for (const eventName of outsideInteractionEvents) {
          ownerDocument.removeEventListener(eventName, handleInteractionCapture, true);
          ownerDocument.removeEventListener(eventName, handleInteractionBubble);
        }
      };
    }, [
      ownerDocument,
      handlePointerDownOutside,
      deferPointerDownOutside,
      isDeferredPointerDownOutsideRef,
      dismissableSurfaces,
      shouldHandlePointerDownOutside
    ]);
    return {
      // ensures we check React component tree (not just DOM tree)
      onPointerDownCapture: /* @__PURE__ */ __name15(() => isPointerInsideReactTreeRef.current = true, "onPointerDownCapture")
    };
  }
  __name15(usePointerDownOutside, "usePointerDownOutside");
  function useFocusOutside(onFocusOutside, ownerDocument = globalThis?.document) {
    const handleFocusOutside = useCallbackRef(onFocusOutside);
    const isFocusInsideReactTreeRef = useRef(false);
    useEffect(() => {
      const handleFocus = /* @__PURE__ */ __name15((event) => {
        if (event.target && !isFocusInsideReactTreeRef.current) {
          const eventDetail = { originalEvent: event };
          handleAndDispatchCustomEvent(FOCUS_OUTSIDE, handleFocusOutside, eventDetail, {
            discrete: false
          });
        }
      }, "handleFocus");
      ownerDocument.addEventListener("focusin", handleFocus);
      return () => ownerDocument.removeEventListener("focusin", handleFocus);
    }, [ownerDocument, handleFocusOutside]);
    return {
      onFocusCapture: /* @__PURE__ */ __name15(() => isFocusInsideReactTreeRef.current = true, "onFocusCapture"),
      onBlurCapture: /* @__PURE__ */ __name15(() => isFocusInsideReactTreeRef.current = false, "onBlurCapture")
    };
  }
  __name15(useFocusOutside, "useFocusOutside");
  function dispatchUpdate() {
    const event = new CustomEvent(CONTEXT_UPDATE);
    document.dispatchEvent(event);
  }
  __name15(dispatchUpdate, "dispatchUpdate");
  function handleAndDispatchCustomEvent(name, handler, detail, { discrete }) {
    const target = detail.originalEvent.target;
    const event = new CustomEvent(name, { bubbles: false, cancelable: true, detail });
    if (handler) target.addEventListener(name, handler, { once: true });
    if (discrete) {
      dispatchDiscreteCustomEvent(target, event);
    } else {
      target.dispatchEvent(event);
    }
  }
  __name15(handleAndDispatchCustomEvent, "handleAndDispatchCustomEvent");

  // ../../node_modules/.pnpm/@radix-ui+react-focus-scope@1.1.16_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-focus-scope/dist/index.mjs
  var __defProp17 = Object.defineProperty;
  var __name16 = (target, value) => __defProp17(target, "name", { value, configurable: true });
  var AUTOFOCUS_ON_MOUNT = "focusScope.autoFocusOnMount";
  var AUTOFOCUS_ON_UNMOUNT = "focusScope.autoFocusOnUnmount";
  var EVENT_OPTIONS = { bubbles: false, cancelable: true };
  var FocusScope = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name16(function FocusScope2(props, forwardedRef) {
      const {
        loop = false,
        trapped = false,
        onMountAutoFocus: onMountAutoFocusProp,
        onUnmountAutoFocus: onUnmountAutoFocusProp,
        ...scopeProps
      } = props;
      const [container, setContainer] = useState(null);
      const onMountAutoFocus = useCallbackRef(onMountAutoFocusProp);
      const onUnmountAutoFocus = useCallbackRef(onUnmountAutoFocusProp);
      const lastFocusedElementRef = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, setContainer);
      const focusScope = useRef({
        paused: false,
        pause() {
          this.paused = true;
        },
        resume() {
          this.paused = false;
        }
      }).current;
      useEffect(() => {
        if (trapped) {
          let handleFocusIn2 = function(event) {
            if (focusScope.paused || !container) return;
            const target = event.target;
            if (container.contains(target)) {
              lastFocusedElementRef.current = target;
            } else {
              focus(lastFocusedElementRef.current, { select: true });
            }
          }, handleFocusOut2 = function(event) {
            if (focusScope.paused || !container) return;
            const relatedTarget = event.relatedTarget;
            if (relatedTarget === null) return;
            if (!container.contains(relatedTarget)) {
              focus(lastFocusedElementRef.current, { select: true });
            }
          }, handleMutations2 = function(mutations) {
            const focusedElement = document.activeElement;
            if (focusedElement !== document.body) return;
            for (const mutation of mutations) {
              if (mutation.removedNodes.length > 0) focus(container);
            }
          };
          var handleFocusIn = handleFocusIn2, handleFocusOut = handleFocusOut2, handleMutations = handleMutations2;
          __name16(handleFocusIn2, "handleFocusIn");
          __name16(handleFocusOut2, "handleFocusOut");
          __name16(handleMutations2, "handleMutations");
          document.addEventListener("focusin", handleFocusIn2);
          document.addEventListener("focusout", handleFocusOut2);
          const mutationObserver = new MutationObserver(handleMutations2);
          if (container) mutationObserver.observe(container, { childList: true, subtree: true });
          return () => {
            document.removeEventListener("focusin", handleFocusIn2);
            document.removeEventListener("focusout", handleFocusOut2);
            mutationObserver.disconnect();
          };
        }
      }, [trapped, container, focusScope.paused]);
      useEffect(() => {
        if (container) {
          focusScopesStack.add(focusScope);
          const previouslyFocusedElement = document.activeElement;
          const hasFocusedCandidate = container.contains(previouslyFocusedElement);
          if (!hasFocusedCandidate) {
            const mountEvent = new CustomEvent(AUTOFOCUS_ON_MOUNT, EVENT_OPTIONS);
            container.addEventListener(AUTOFOCUS_ON_MOUNT, onMountAutoFocus);
            container.dispatchEvent(mountEvent);
            if (!mountEvent.defaultPrevented) {
              focusFirst(removeLinks(getTabbableCandidates(container)), { select: true });
              if (document.activeElement === previouslyFocusedElement) {
                focus(container);
              }
            }
          }
          return () => {
            container.removeEventListener(AUTOFOCUS_ON_MOUNT, onMountAutoFocus);
            setTimeout(() => {
              const unmountEvent = new CustomEvent(AUTOFOCUS_ON_UNMOUNT, EVENT_OPTIONS);
              container.addEventListener(AUTOFOCUS_ON_UNMOUNT, onUnmountAutoFocus);
              container.dispatchEvent(unmountEvent);
              if (!unmountEvent.defaultPrevented) {
                focus(previouslyFocusedElement ?? document.body, { select: true });
              }
              container.removeEventListener(AUTOFOCUS_ON_UNMOUNT, onUnmountAutoFocus);
              focusScopesStack.remove(focusScope);
            }, 0);
          };
        }
      }, [container, onMountAutoFocus, onUnmountAutoFocus, focusScope]);
      const handleKeyDown = useCallback(
        (event) => {
          if (!loop && !trapped) return;
          if (focusScope.paused) return;
          const isTabKey = event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey;
          const focusedElement = document.activeElement;
          if (isTabKey && focusedElement) {
            const container2 = event.currentTarget;
            const [first, last] = getTabbableEdges(container2);
            const hasTabbableElementsInside = first && last;
            if (!hasTabbableElementsInside) {
              if (focusedElement === container2) event.preventDefault();
            } else {
              if (!event.shiftKey && focusedElement === last) {
                event.preventDefault();
                if (loop) focus(first, { select: true });
              } else if (event.shiftKey && focusedElement === first) {
                event.preventDefault();
                if (loop) focus(last, { select: true });
              }
            }
          }
        },
        [loop, trapped, focusScope.paused]
      );
      return /* @__PURE__ */ jsx(Primitive.div, { tabIndex: -1, ...scopeProps, ref: composedRefs, onKeyDown: handleKeyDown });
    }, "FocusScope")
  );
  function focusFirst(candidates, { select = false } = {}) {
    const previouslyFocusedElement = document.activeElement;
    for (const candidate of candidates) {
      focus(candidate, { select });
      if (document.activeElement !== previouslyFocusedElement) return;
    }
  }
  __name16(focusFirst, "focusFirst");
  function getTabbableEdges(container) {
    const candidates = getTabbableCandidates(container);
    const first = findVisible(candidates, container);
    const last = findVisible(candidates.reverse(), container);
    return [first, last];
  }
  __name16(getTabbableEdges, "getTabbableEdges");
  function getTabbableCandidates(container) {
    const nodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
      acceptNode: /* @__PURE__ */ __name16((node) => {
        const isHiddenInput = node.tagName === "INPUT" && node.type === "hidden";
        if (node.disabled || node.hidden || isHiddenInput) return NodeFilter.FILTER_SKIP;
        return node.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }, "acceptNode")
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }
  __name16(getTabbableCandidates, "getTabbableCandidates");
  function findVisible(elements, container) {
    const canUseCheckVisibility = typeof container.checkVisibility === "function" && container.checkVisibility({ checkVisibilityCSS: true });
    for (const element of elements) {
      const hidden = canUseCheckVisibility ? !element.checkVisibility({ checkVisibilityCSS: true }) : isHidden(element, { upTo: container });
      if (!hidden) {
        return element;
      }
    }
  }
  __name16(findVisible, "findVisible");
  function isHidden(node, { upTo }) {
    if (getComputedStyle(node).visibility === "hidden") return true;
    while (node) {
      if (upTo !== void 0 && node === upTo) return false;
      if (getComputedStyle(node).display === "none") return true;
      node = node.parentElement;
    }
    return false;
  }
  __name16(isHidden, "isHidden");
  function isSelectableInput(element) {
    return element instanceof HTMLInputElement && "select" in element;
  }
  __name16(isSelectableInput, "isSelectableInput");
  function focus(element, { select = false } = {}) {
    if (element && element.focus) {
      const previouslyFocusedElement = document.activeElement;
      element.focus({ preventScroll: true });
      if (element !== previouslyFocusedElement && isSelectableInput(element) && select)
        element.select();
    }
  }
  __name16(focus, "focus");
  var focusScopesStack = createFocusScopesStack();
  function createFocusScopesStack() {
    let stack = [];
    return {
      add(focusScope) {
        const activeFocusScope = stack[0];
        if (focusScope !== activeFocusScope) {
          activeFocusScope?.pause();
        }
        stack = arrayRemove(stack, focusScope);
        stack.unshift(focusScope);
      },
      remove(focusScope) {
        stack = arrayRemove(stack, focusScope);
        stack[0]?.resume();
      }
    };
  }
  __name16(createFocusScopesStack, "createFocusScopesStack");
  function arrayRemove(array, item) {
    const updatedArray = [...array];
    const index2 = updatedArray.indexOf(item);
    if (index2 !== -1) {
      updatedArray.splice(index2, 1);
    }
    return updatedArray;
  }
  __name16(arrayRemove, "arrayRemove");
  function removeLinks(items) {
    return items.filter((item) => item.tagName !== "A");
  }
  __name16(removeLinks, "removeLinks");

  // ../../node_modules/.pnpm/@radix-ui+react-portal@1.1.17_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-portal/dist/index.mjs
  var __defProp18 = Object.defineProperty;
  var __name17 = (target, value) => __defProp18(target, "name", { value, configurable: true });
  var Portal = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name17(function Portal2(props, forwardedRef) {
      const { container: containerProp, ...portalProps } = props;
      const [mounted, setMounted] = useState(false);
      useLayoutEffect2(() => setMounted(true), []);
      const container = containerProp || mounted && globalThis?.document?.body;
      return container ? createPortal(/* @__PURE__ */ jsx(Primitive.div, { ...portalProps, ref: forwardedRef }), container) : null;
    }, "Portal")
  );

  // ../../node_modules/.pnpm/@radix-ui+react-focus-guards@1.1.6_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-focus-guards/dist/index.mjs
  var __defProp19 = Object.defineProperty;
  var __name18 = (target, value) => __defProp19(target, "name", { value, configurable: true });
  var count2 = 0;
  var guards = null;
  function FocusGuards(props) {
    useFocusGuards();
    return props.children;
  }
  __name18(FocusGuards, "FocusGuards");
  function useFocusGuards() {
    useEffect(() => {
      if (!guards) {
        guards = { start: createFocusGuard(), end: createFocusGuard() };
      }
      const { start, end } = guards;
      if (document.body.firstElementChild !== start) {
        document.body.insertAdjacentElement("afterbegin", start);
      }
      if (document.body.lastElementChild !== end) {
        document.body.insertAdjacentElement("beforeend", end);
      }
      count2++;
      return () => {
        if (count2 === 1) {
          guards?.start.remove();
          guards?.end.remove();
          guards = null;
        }
        count2 = Math.max(0, count2 - 1);
      };
    }, []);
  }
  __name18(useFocusGuards, "useFocusGuards");
  function createFocusGuard() {
    const element = document.createElement("span");
    element.setAttribute("data-radix-focus-guard", "");
    element.tabIndex = 0;
    element.style.outline = "none";
    element.style.opacity = "0";
    element.style.position = "fixed";
    element.style.pointerEvents = "none";
    return element;
  }
  __name18(createFocusGuard, "createFocusGuard");

  // ../../node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs
  var __assign = function() {
    __assign = Object.assign || function __assign2(t) {
      for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
      }
      return t;
    };
    return __assign.apply(this, arguments);
  };
  function __rest(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
      t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
      for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
        if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
          t[p[i]] = s[p[i]];
      }
    return t;
  }
  function __spreadArray(to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
      if (ar || !(i in from)) {
        if (!ar) ar = Array.prototype.slice.call(from, 0, i);
        ar[i] = from[i];
      }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
  }

  // ../../node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll-bar/dist/es2015/constants.js
  var zeroRightClassName = "right-scroll-bar-position";
  var fullWidthClassName = "width-before-scroll-bar";
  var noScrollbarsClassName = "with-scroll-bars-hidden";
  var removedBarSizeVariable = "--removed-body-scroll-bar-size";

  // ../../node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/use-callback-ref/dist/es2015/assignRef.js
  function assignRef(ref, value) {
    if (typeof ref === "function") {
      ref(value);
    } else if (ref) {
      ref.current = value;
    }
    return ref;
  }

  // ../../node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/use-callback-ref/dist/es2015/useRef.js
  function useCallbackRef2(initialValue, callback) {
    var ref = useState(function() {
      return {
        // value
        value: initialValue,
        // last callback
        callback,
        // "memoized" public interface
        facade: {
          get current() {
            return ref.value;
          },
          set current(value) {
            var last = ref.value;
            if (last !== value) {
              ref.value = value;
              ref.callback(value, last);
            }
          }
        }
      };
    })[0];
    ref.callback = callback;
    return ref.facade;
  }

  // ../../node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/use-callback-ref/dist/es2015/useMergeRef.js
  var useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
  var currentValues = /* @__PURE__ */ new WeakMap();
  function useMergeRefs(refs, defaultValue) {
    var callbackRef = useCallbackRef2(defaultValue || null, function(newValue) {
      return refs.forEach(function(ref) {
        return assignRef(ref, newValue);
      });
    });
    useIsomorphicLayoutEffect(function() {
      var oldValue = currentValues.get(callbackRef);
      if (oldValue) {
        var prevRefs_1 = new Set(oldValue);
        var nextRefs_1 = new Set(refs);
        var current_1 = callbackRef.current;
        prevRefs_1.forEach(function(ref) {
          if (!nextRefs_1.has(ref)) {
            assignRef(ref, null);
          }
        });
        nextRefs_1.forEach(function(ref) {
          if (!prevRefs_1.has(ref)) {
            assignRef(ref, current_1);
          }
        });
      }
      currentValues.set(callbackRef, refs);
    }, [refs]);
    return callbackRef;
  }

  // ../../node_modules/.pnpm/use-sidecar@1.1.3_@types+react@18.3.31_react@18.3.1/node_modules/use-sidecar/dist/es2015/medium.js
  function ItoI(a2) {
    return a2;
  }
  function innerCreateMedium(defaults, middleware) {
    if (middleware === void 0) {
      middleware = ItoI;
    }
    var buffer = [];
    var assigned = false;
    var medium = {
      read: function() {
        if (assigned) {
          throw new Error("Sidecar: could not `read` from an `assigned` medium. `read` could be used only with `useMedium`.");
        }
        if (buffer.length) {
          return buffer[buffer.length - 1];
        }
        return defaults;
      },
      useMedium: function(data) {
        var item = middleware(data, assigned);
        buffer.push(item);
        return function() {
          buffer = buffer.filter(function(x) {
            return x !== item;
          });
        };
      },
      assignSyncMedium: function(cb) {
        assigned = true;
        while (buffer.length) {
          var cbs = buffer;
          buffer = [];
          cbs.forEach(cb);
        }
        buffer = {
          push: function(x) {
            return cb(x);
          },
          filter: function() {
            return buffer;
          }
        };
      },
      assignMedium: function(cb) {
        assigned = true;
        var pendingQueue = [];
        if (buffer.length) {
          var cbs = buffer;
          buffer = [];
          cbs.forEach(cb);
          pendingQueue = buffer;
        }
        var executeQueue = function() {
          var cbs2 = pendingQueue;
          pendingQueue = [];
          cbs2.forEach(cb);
        };
        var cycle = function() {
          return Promise.resolve().then(executeQueue);
        };
        cycle();
        buffer = {
          push: function(x) {
            pendingQueue.push(x);
            cycle();
          },
          filter: function(filter) {
            pendingQueue = pendingQueue.filter(filter);
            return buffer;
          }
        };
      }
    };
    return medium;
  }
  function createSidecarMedium(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    var medium = innerCreateMedium(null);
    medium.options = __assign({ async: true, ssr: false }, options2);
    return medium;
  }

  // ../../node_modules/.pnpm/use-sidecar@1.1.3_@types+react@18.3.31_react@18.3.1/node_modules/use-sidecar/dist/es2015/exports.js
  var SideCar = function(_a2) {
    var sideCar = _a2.sideCar, rest = __rest(_a2, ["sideCar"]);
    if (!sideCar) {
      throw new Error("Sidecar: please provide `sideCar` property to import the right car");
    }
    var Target = sideCar.read();
    if (!Target) {
      throw new Error("Sidecar medium not found");
    }
    return createElement(Target, __assign({}, rest));
  };
  SideCar.isSideCarExport = true;
  function exportSidecar(medium, exported) {
    medium.useMedium(exported);
    return SideCar;
  }

  // ../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/medium.js
  var effectCar = createSidecarMedium();

  // ../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/UI.js
  var nothing = function() {
    return;
  };
  var RemoveScroll = forwardRef(function(props, parentRef) {
    var ref = useRef(null);
    var _a2 = useState({
      onScrollCapture: nothing,
      onWheelCapture: nothing,
      onTouchMoveCapture: nothing
    }), callbacks = _a2[0], setCallbacks = _a2[1];
    var forwardProps = props.forwardProps, children = props.children, className = props.className, removeScrollBar = props.removeScrollBar, enabled = props.enabled, shards = props.shards, sideCar = props.sideCar, noRelative = props.noRelative, noIsolation = props.noIsolation, inert = props.inert, allowPinchZoom = props.allowPinchZoom, _b = props.as, Container = _b === void 0 ? "div" : _b, gapMode = props.gapMode, rest = __rest(props, ["forwardProps", "children", "className", "removeScrollBar", "enabled", "shards", "sideCar", "noRelative", "noIsolation", "inert", "allowPinchZoom", "as", "gapMode"]);
    var SideCar2 = sideCar;
    var containerRef = useMergeRefs([ref, parentRef]);
    var containerProps = __assign(__assign({}, rest), callbacks);
    return createElement(
      Fragment,
      null,
      enabled && createElement(SideCar2, { sideCar: effectCar, removeScrollBar, shards, noRelative, noIsolation, inert, setCallbacks, allowPinchZoom: !!allowPinchZoom, lockRef: ref, gapMode }),
      forwardProps ? cloneElement(Children.only(children), __assign(__assign({}, containerProps), { ref: containerRef })) : createElement(Container, __assign({}, containerProps, { className, ref: containerRef }), children)
    );
  });
  RemoveScroll.defaultProps = {
    enabled: true,
    removeScrollBar: true,
    inert: false
  };
  RemoveScroll.classNames = {
    fullWidth: fullWidthClassName,
    zeroRight: zeroRightClassName
  };

  // ../../node_modules/.pnpm/get-nonce@1.0.1/node_modules/get-nonce/dist/es2015/index.js
  var currentNonce;
  var getNonce = function() {
    if (currentNonce) {
      return currentNonce;
    }
    if (typeof __webpack_nonce__ !== "undefined") {
      return __webpack_nonce__;
    }
    return void 0;
  };

  // ../../node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@18.3.31_react@18.3.1/node_modules/react-style-singleton/dist/es2015/singleton.js
  function makeStyleTag() {
    if (!document)
      return null;
    var tag = document.createElement("style");
    tag.type = "text/css";
    var nonce = getNonce();
    if (nonce) {
      tag.setAttribute("nonce", nonce);
    }
    return tag;
  }
  function injectStyles2(tag, css) {
    if (tag.styleSheet) {
      tag.styleSheet.cssText = css;
    } else {
      tag.appendChild(document.createTextNode(css));
    }
  }
  function insertStyleTag(tag) {
    var head = document.head || document.getElementsByTagName("head")[0];
    head.appendChild(tag);
  }
  var stylesheetSingleton = function() {
    var counter = 0;
    var stylesheet = null;
    return {
      add: function(style) {
        if (counter == 0) {
          if (stylesheet = makeStyleTag()) {
            injectStyles2(stylesheet, style);
            insertStyleTag(stylesheet);
          }
        }
        counter++;
      },
      remove: function() {
        counter--;
        if (!counter && stylesheet) {
          stylesheet.parentNode && stylesheet.parentNode.removeChild(stylesheet);
          stylesheet = null;
        }
      }
    };
  };

  // ../../node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@18.3.31_react@18.3.1/node_modules/react-style-singleton/dist/es2015/hook.js
  var styleHookSingleton = function() {
    var sheet = stylesheetSingleton();
    return function(styles, isDynamic) {
      useEffect(function() {
        sheet.add(styles);
        return function() {
          sheet.remove();
        };
      }, [styles && isDynamic]);
    };
  };

  // ../../node_modules/.pnpm/react-style-singleton@2.2.3_@types+react@18.3.31_react@18.3.1/node_modules/react-style-singleton/dist/es2015/component.js
  var styleSingleton = function() {
    var useStyle = styleHookSingleton();
    var Sheet = function(_a2) {
      var styles = _a2.styles, dynamic = _a2.dynamic;
      useStyle(styles, dynamic);
      return null;
    };
    return Sheet;
  };

  // ../../node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll-bar/dist/es2015/utils.js
  var zeroGap = {
    left: 0,
    top: 0,
    right: 0,
    gap: 0
  };
  var parse = function(x) {
    return parseInt(x || "", 10) || 0;
  };
  var getOffset = function(gapMode) {
    var cs = window.getComputedStyle(document.body);
    var left = cs[gapMode === "padding" ? "paddingLeft" : "marginLeft"];
    var top = cs[gapMode === "padding" ? "paddingTop" : "marginTop"];
    var right = cs[gapMode === "padding" ? "paddingRight" : "marginRight"];
    return [parse(left), parse(top), parse(right)];
  };
  var getGapWidth = function(gapMode) {
    if (gapMode === void 0) {
      gapMode = "margin";
    }
    if (typeof window === "undefined") {
      return zeroGap;
    }
    var offsets = getOffset(gapMode);
    var documentWidth = document.documentElement.clientWidth;
    var windowWidth = window.innerWidth;
    return {
      left: offsets[0],
      top: offsets[1],
      right: offsets[2],
      gap: Math.max(0, windowWidth - documentWidth + offsets[2] - offsets[0])
    };
  };

  // ../../node_modules/.pnpm/react-remove-scroll-bar@2.3.8_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll-bar/dist/es2015/component.js
  var Style = styleSingleton();
  var lockAttribute = "data-scroll-locked";
  var getStyles = function(_a2, allowRelative, gapMode, important) {
    var left = _a2.left, top = _a2.top, right = _a2.right, gap = _a2.gap;
    if (gapMode === void 0) {
      gapMode = "margin";
    }
    return "\n  .".concat(noScrollbarsClassName, " {\n   overflow: hidden ").concat(important, ";\n   padding-right: ").concat(gap, "px ").concat(important, ";\n  }\n  body[").concat(lockAttribute, "] {\n    overflow: hidden ").concat(important, ";\n    overscroll-behavior: contain;\n    ").concat([
      allowRelative && "position: relative ".concat(important, ";"),
      gapMode === "margin" && "\n    padding-left: ".concat(left, "px;\n    padding-top: ").concat(top, "px;\n    padding-right: ").concat(right, "px;\n    margin-left:0;\n    margin-top:0;\n    margin-right: ").concat(gap, "px ").concat(important, ";\n    "),
      gapMode === "padding" && "padding-right: ".concat(gap, "px ").concat(important, ";")
    ].filter(Boolean).join(""), "\n  }\n  \n  .").concat(zeroRightClassName, " {\n    right: ").concat(gap, "px ").concat(important, ";\n  }\n  \n  .").concat(fullWidthClassName, " {\n    margin-right: ").concat(gap, "px ").concat(important, ";\n  }\n  \n  .").concat(zeroRightClassName, " .").concat(zeroRightClassName, " {\n    right: 0 ").concat(important, ";\n  }\n  \n  .").concat(fullWidthClassName, " .").concat(fullWidthClassName, " {\n    margin-right: 0 ").concat(important, ";\n  }\n  \n  body[").concat(lockAttribute, "] {\n    ").concat(removedBarSizeVariable, ": ").concat(gap, "px;\n  }\n");
  };
  var getCurrentUseCounter = function() {
    var counter = parseInt(document.body.getAttribute(lockAttribute) || "0", 10);
    return isFinite(counter) ? counter : 0;
  };
  var useLockAttribute = function() {
    useEffect(function() {
      document.body.setAttribute(lockAttribute, (getCurrentUseCounter() + 1).toString());
      return function() {
        var newCounter = getCurrentUseCounter() - 1;
        if (newCounter <= 0) {
          document.body.removeAttribute(lockAttribute);
        } else {
          document.body.setAttribute(lockAttribute, newCounter.toString());
        }
      };
    }, []);
  };
  var RemoveScrollBar = function(_a2) {
    var noRelative = _a2.noRelative, noImportant = _a2.noImportant, _b = _a2.gapMode, gapMode = _b === void 0 ? "margin" : _b;
    useLockAttribute();
    var gap = useMemo(function() {
      return getGapWidth(gapMode);
    }, [gapMode]);
    return createElement(Style, { styles: getStyles(gap, !noRelative, gapMode, !noImportant ? "!important" : "") });
  };

  // ../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/aggresiveCapture.js
  var passiveSupported = false;
  if (typeof window !== "undefined") {
    try {
      options = Object.defineProperty({}, "passive", {
        get: function() {
          passiveSupported = true;
          return true;
        }
      });
      window.addEventListener("test", options, options);
      window.removeEventListener("test", options, options);
    } catch (err) {
      passiveSupported = false;
    }
  }
  var options;
  var nonPassive = passiveSupported ? { passive: false } : false;

  // ../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/handleScroll.js
  var alwaysContainsScroll = function(node) {
    return node.tagName === "TEXTAREA";
  };
  var elementCanBeScrolled = function(node, overflow) {
    if (!(node instanceof Element)) {
      return false;
    }
    var styles = window.getComputedStyle(node);
    return (
      // not-not-scrollable
      styles[overflow] !== "hidden" && // contains scroll inside self
      !(styles.overflowY === styles.overflowX && !alwaysContainsScroll(node) && styles[overflow] === "visible")
    );
  };
  var elementCouldBeVScrolled = function(node) {
    return elementCanBeScrolled(node, "overflowY");
  };
  var elementCouldBeHScrolled = function(node) {
    return elementCanBeScrolled(node, "overflowX");
  };
  var locationCouldBeScrolled = function(axis, node) {
    var ownerDocument = node.ownerDocument;
    var current = node;
    do {
      if (typeof ShadowRoot !== "undefined" && current instanceof ShadowRoot) {
        current = current.host;
      }
      var isScrollable = elementCouldBeScrolled(axis, current);
      if (isScrollable) {
        var _a2 = getScrollVariables(axis, current), scrollHeight = _a2[1], clientHeight = _a2[2];
        if (scrollHeight > clientHeight) {
          return true;
        }
      }
      current = current.parentNode;
    } while (current && current !== ownerDocument.body);
    return false;
  };
  var getVScrollVariables = function(_a2) {
    var scrollTop = _a2.scrollTop, scrollHeight = _a2.scrollHeight, clientHeight = _a2.clientHeight;
    return [
      scrollTop,
      scrollHeight,
      clientHeight
    ];
  };
  var getHScrollVariables = function(_a2) {
    var scrollLeft = _a2.scrollLeft, scrollWidth = _a2.scrollWidth, clientWidth = _a2.clientWidth;
    return [
      scrollLeft,
      scrollWidth,
      clientWidth
    ];
  };
  var elementCouldBeScrolled = function(axis, node) {
    return axis === "v" ? elementCouldBeVScrolled(node) : elementCouldBeHScrolled(node);
  };
  var getScrollVariables = function(axis, node) {
    return axis === "v" ? getVScrollVariables(node) : getHScrollVariables(node);
  };
  var getDirectionFactor = function(axis, direction) {
    return axis === "h" && direction === "rtl" ? -1 : 1;
  };
  var handleScroll = function(axis, endTarget, event, sourceDelta, noOverscroll) {
    var directionFactor = getDirectionFactor(axis, window.getComputedStyle(endTarget).direction);
    var delta = directionFactor * sourceDelta;
    var target = event.target;
    var targetInLock = endTarget.contains(target);
    var shouldCancelScroll = false;
    var isDeltaPositive = delta > 0;
    var availableScroll = 0;
    var availableScrollTop = 0;
    do {
      if (!target) {
        break;
      }
      var _a2 = getScrollVariables(axis, target), position = _a2[0], scroll_1 = _a2[1], capacity = _a2[2];
      var elementScroll = scroll_1 - capacity - directionFactor * position;
      if (position || elementScroll) {
        if (elementCouldBeScrolled(axis, target)) {
          availableScroll += elementScroll;
          availableScrollTop += position;
        }
      }
      var parent_1 = target.parentNode;
      target = parent_1 && parent_1.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? parent_1.host : parent_1;
    } while (
      // portaled content
      !targetInLock && target !== document.body || // self content
      targetInLock && (endTarget.contains(target) || endTarget === target)
    );
    if (isDeltaPositive && (noOverscroll && Math.abs(availableScroll) < 1 || !noOverscroll && delta > availableScroll)) {
      shouldCancelScroll = true;
    } else if (!isDeltaPositive && (noOverscroll && Math.abs(availableScrollTop) < 1 || !noOverscroll && -delta > availableScrollTop)) {
      shouldCancelScroll = true;
    }
    return shouldCancelScroll;
  };

  // ../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/SideEffect.js
  var getTouchXY = function(event) {
    return "changedTouches" in event ? [event.changedTouches[0].clientX, event.changedTouches[0].clientY] : [0, 0];
  };
  var getDeltaXY = function(event) {
    return [event.deltaX, event.deltaY];
  };
  var extractRef = function(ref) {
    return ref && "current" in ref ? ref.current : ref;
  };
  var deltaCompare = function(x, y) {
    return x[0] === y[0] && x[1] === y[1];
  };
  var generateStyle = function(id) {
    return "\n  .block-interactivity-".concat(id, " {pointer-events: none;}\n  .allow-interactivity-").concat(id, " {pointer-events: all;}\n");
  };
  var idCounter = 0;
  var lockStack = [];
  function RemoveScrollSideCar(props) {
    var shouldPreventQueue = useRef([]);
    var touchStartRef = useRef([0, 0]);
    var activeAxis = useRef();
    var id = useState(idCounter++)[0];
    var Style2 = useState(styleSingleton)[0];
    var lastProps = useRef(props);
    useEffect(function() {
      lastProps.current = props;
    }, [props]);
    useEffect(function() {
      if (props.inert) {
        document.body.classList.add("block-interactivity-".concat(id));
        var allow_1 = __spreadArray([props.lockRef.current], (props.shards || []).map(extractRef), true).filter(Boolean);
        allow_1.forEach(function(el) {
          return el.classList.add("allow-interactivity-".concat(id));
        });
        return function() {
          document.body.classList.remove("block-interactivity-".concat(id));
          allow_1.forEach(function(el) {
            return el.classList.remove("allow-interactivity-".concat(id));
          });
        };
      }
      return;
    }, [props.inert, props.lockRef.current, props.shards]);
    var shouldCancelEvent = useCallback(function(event, parent) {
      if ("touches" in event && event.touches.length === 2 || event.type === "wheel" && event.ctrlKey) {
        return !lastProps.current.allowPinchZoom;
      }
      var touch = getTouchXY(event);
      var touchStart = touchStartRef.current;
      var deltaX = "deltaX" in event ? event.deltaX : touchStart[0] - touch[0];
      var deltaY = "deltaY" in event ? event.deltaY : touchStart[1] - touch[1];
      var currentAxis;
      var target = event.target;
      var moveDirection = Math.abs(deltaX) > Math.abs(deltaY) ? "h" : "v";
      if ("touches" in event && moveDirection === "h" && target.type === "range") {
        return false;
      }
      var selection = window.getSelection();
      var anchorNode = selection && selection.anchorNode;
      var isTouchingSelection = anchorNode ? anchorNode === target || anchorNode.contains(target) : false;
      if (isTouchingSelection) {
        return false;
      }
      var canBeScrolledInMainDirection = locationCouldBeScrolled(moveDirection, target);
      if (!canBeScrolledInMainDirection) {
        return true;
      }
      if (canBeScrolledInMainDirection) {
        currentAxis = moveDirection;
      } else {
        currentAxis = moveDirection === "v" ? "h" : "v";
        canBeScrolledInMainDirection = locationCouldBeScrolled(moveDirection, target);
      }
      if (!canBeScrolledInMainDirection) {
        return false;
      }
      if (!activeAxis.current && "changedTouches" in event && (deltaX || deltaY)) {
        activeAxis.current = currentAxis;
      }
      if (!currentAxis) {
        return true;
      }
      var cancelingAxis = activeAxis.current || currentAxis;
      return handleScroll(cancelingAxis, parent, event, cancelingAxis === "h" ? deltaX : deltaY, true);
    }, []);
    var shouldPrevent = useCallback(function(_event) {
      var event = _event;
      if (!lockStack.length || lockStack[lockStack.length - 1] !== Style2) {
        return;
      }
      var delta = "deltaY" in event ? getDeltaXY(event) : getTouchXY(event);
      var sourceEvent = shouldPreventQueue.current.filter(function(e) {
        return e.name === event.type && (e.target === event.target || event.target === e.shadowParent) && deltaCompare(e.delta, delta);
      })[0];
      if (sourceEvent && sourceEvent.should) {
        if (event.cancelable) {
          event.preventDefault();
        }
        return;
      }
      if (!sourceEvent) {
        var shardNodes = (lastProps.current.shards || []).map(extractRef).filter(Boolean).filter(function(node) {
          return node.contains(event.target);
        });
        var shouldStop = shardNodes.length > 0 ? shouldCancelEvent(event, shardNodes[0]) : !lastProps.current.noIsolation;
        if (shouldStop) {
          if (event.cancelable) {
            event.preventDefault();
          }
        }
      }
    }, []);
    var shouldCancel = useCallback(function(name, delta, target, should) {
      var event = { name, delta, target, should, shadowParent: getOutermostShadowParent(target) };
      shouldPreventQueue.current.push(event);
      setTimeout(function() {
        shouldPreventQueue.current = shouldPreventQueue.current.filter(function(e) {
          return e !== event;
        });
      }, 1);
    }, []);
    var scrollTouchStart = useCallback(function(event) {
      touchStartRef.current = getTouchXY(event);
      activeAxis.current = void 0;
    }, []);
    var scrollWheel = useCallback(function(event) {
      shouldCancel(event.type, getDeltaXY(event), event.target, shouldCancelEvent(event, props.lockRef.current));
    }, []);
    var scrollTouchMove = useCallback(function(event) {
      shouldCancel(event.type, getTouchXY(event), event.target, shouldCancelEvent(event, props.lockRef.current));
    }, []);
    useEffect(function() {
      lockStack.push(Style2);
      props.setCallbacks({
        onScrollCapture: scrollWheel,
        onWheelCapture: scrollWheel,
        onTouchMoveCapture: scrollTouchMove
      });
      document.addEventListener("wheel", shouldPrevent, nonPassive);
      document.addEventListener("touchmove", shouldPrevent, nonPassive);
      document.addEventListener("touchstart", scrollTouchStart, nonPassive);
      return function() {
        lockStack = lockStack.filter(function(inst) {
          return inst !== Style2;
        });
        document.removeEventListener("wheel", shouldPrevent, nonPassive);
        document.removeEventListener("touchmove", shouldPrevent, nonPassive);
        document.removeEventListener("touchstart", scrollTouchStart, nonPassive);
      };
    }, []);
    var removeScrollBar = props.removeScrollBar, inert = props.inert;
    return createElement(
      Fragment,
      null,
      inert ? createElement(Style2, { styles: generateStyle(id) }) : null,
      removeScrollBar ? createElement(RemoveScrollBar, { noRelative: props.noRelative, gapMode: props.gapMode }) : null
    );
  }
  function getOutermostShadowParent(node) {
    var shadowParent = null;
    while (node !== null) {
      if (node instanceof ShadowRoot) {
        shadowParent = node.host;
        node = node.host;
      }
      node = node.parentNode;
    }
    return shadowParent;
  }

  // ../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/sidecar.js
  var sidecar_default = exportSidecar(effectCar, RemoveScrollSideCar);

  // ../../node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/Combination.js
  var ReactRemoveScroll = forwardRef(function(props, ref) {
    return createElement(RemoveScroll, __assign({}, props, { ref, sideCar: sidecar_default }));
  });
  ReactRemoveScroll.classNames = RemoveScroll.classNames;
  var Combination_default = ReactRemoveScroll;

  // ../../node_modules/.pnpm/aria-hidden@1.2.6/node_modules/aria-hidden/dist/es2015/index.js
  var getDefaultParent = function(originalTarget) {
    if (typeof document === "undefined") {
      return null;
    }
    var sampleTarget = Array.isArray(originalTarget) ? originalTarget[0] : originalTarget;
    return sampleTarget.ownerDocument.body;
  };
  var counterMap = /* @__PURE__ */ new WeakMap();
  var uncontrolledNodes = /* @__PURE__ */ new WeakMap();
  var markerMap = {};
  var lockCount = 0;
  var unwrapHost = function(node) {
    return node && (node.host || unwrapHost(node.parentNode));
  };
  var correctTargets = function(parent, targets) {
    return targets.map(function(target) {
      if (parent.contains(target)) {
        return target;
      }
      var correctedTarget = unwrapHost(target);
      if (correctedTarget && parent.contains(correctedTarget)) {
        return correctedTarget;
      }
      console.error("aria-hidden", target, "in not contained inside", parent, ". Doing nothing");
      return null;
    }).filter(function(x) {
      return Boolean(x);
    });
  };
  var applyAttributeToOthers = function(originalTarget, parentNode, markerName, controlAttribute) {
    var targets = correctTargets(parentNode, Array.isArray(originalTarget) ? originalTarget : [originalTarget]);
    if (!markerMap[markerName]) {
      markerMap[markerName] = /* @__PURE__ */ new WeakMap();
    }
    var markerCounter = markerMap[markerName];
    var hiddenNodes = [];
    var elementsToKeep = /* @__PURE__ */ new Set();
    var elementsToStop = new Set(targets);
    var keep = function(el) {
      if (!el || elementsToKeep.has(el)) {
        return;
      }
      elementsToKeep.add(el);
      keep(el.parentNode);
    };
    targets.forEach(keep);
    var deep = function(parent) {
      if (!parent || elementsToStop.has(parent)) {
        return;
      }
      Array.prototype.forEach.call(parent.children, function(node) {
        if (elementsToKeep.has(node)) {
          deep(node);
        } else {
          try {
            var attr = node.getAttribute(controlAttribute);
            var alreadyHidden = attr !== null && attr !== "false";
            var counterValue = (counterMap.get(node) || 0) + 1;
            var markerValue = (markerCounter.get(node) || 0) + 1;
            counterMap.set(node, counterValue);
            markerCounter.set(node, markerValue);
            hiddenNodes.push(node);
            if (counterValue === 1 && alreadyHidden) {
              uncontrolledNodes.set(node, true);
            }
            if (markerValue === 1) {
              node.setAttribute(markerName, "true");
            }
            if (!alreadyHidden) {
              node.setAttribute(controlAttribute, "true");
            }
          } catch (e) {
            console.error("aria-hidden: cannot operate on ", node, e);
          }
        }
      });
    };
    deep(parentNode);
    elementsToKeep.clear();
    lockCount++;
    return function() {
      hiddenNodes.forEach(function(node) {
        var counterValue = counterMap.get(node) - 1;
        var markerValue = markerCounter.get(node) - 1;
        counterMap.set(node, counterValue);
        markerCounter.set(node, markerValue);
        if (!counterValue) {
          if (!uncontrolledNodes.has(node)) {
            node.removeAttribute(controlAttribute);
          }
          uncontrolledNodes.delete(node);
        }
        if (!markerValue) {
          node.removeAttribute(markerName);
        }
      });
      lockCount--;
      if (!lockCount) {
        counterMap = /* @__PURE__ */ new WeakMap();
        counterMap = /* @__PURE__ */ new WeakMap();
        uncontrolledNodes = /* @__PURE__ */ new WeakMap();
        markerMap = {};
      }
    };
  };
  var hideOthers = function(originalTarget, parentNode, markerName) {
    if (markerName === void 0) {
      markerName = "data-aria-hidden";
    }
    var targets = Array.from(Array.isArray(originalTarget) ? originalTarget : [originalTarget]);
    var activeParentNode = parentNode || getDefaultParent(originalTarget);
    if (!activeParentNode) {
      return function() {
        return null;
      };
    }
    targets.push.apply(targets, Array.from(activeParentNode.querySelectorAll("[aria-live], script")));
    return applyAttributeToOthers(targets, activeParentNode, markerName, "aria-hidden");
  };

  // ../../node_modules/.pnpm/@radix-ui+react-dialog@1.1.23_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-dialog/dist/index.mjs
  var __defProp20 = Object.defineProperty;
  var __name19 = (target, value) => __defProp20(target, "name", { value, configurable: true });
  var DIALOG_NAME = "Dialog";
  var [createDialogContext, createDialogScope] = createContextScope(DIALOG_NAME);
  var [DialogProvider, useDialogContext] = createDialogContext(DIALOG_NAME);
  var Dialog = /* @__PURE__ */ __name19((props) => {
    const {
      __scopeDialog,
      children,
      open: openProp,
      defaultOpen,
      onOpenChange,
      modal = true
    } = props;
    const triggerRef = useRef(null);
    const contentRef = useRef(null);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: DIALOG_NAME
    });
    const [titleCount, setTitleCount] = useState(0);
    const [descriptionCount, setDescriptionCount] = useState(0);
    return /* @__PURE__ */ jsx(
      DialogProvider,
      {
        scope: __scopeDialog,
        triggerRef,
        contentRef,
        contentId: useId2(),
        titleId: useId2(),
        descriptionId: useId2(),
        titlePresent: titleCount > 0,
        descriptionPresent: descriptionCount > 0,
        setTitleCount,
        setDescriptionCount,
        open,
        onOpenChange: setOpen,
        onOpenToggle: useCallback(() => setOpen((prevOpen) => !prevOpen), [setOpen]),
        modal,
        children
      }
    );
  }, "Dialog");
  var TRIGGER_NAME2 = "DialogTrigger";
  var DialogTrigger = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name19(function DialogTrigger2(props, forwardedRef) {
      const { __scopeDialog, ...triggerProps } = props;
      const context = useDialogContext(TRIGGER_NAME2, __scopeDialog);
      const composedTriggerRef = useComposedRefs(forwardedRef, context.triggerRef);
      return /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          "aria-haspopup": "dialog",
          "aria-expanded": context.open,
          "aria-controls": context.open ? context.contentId : void 0,
          "data-state": getState2(context.open),
          ...triggerProps,
          ref: composedTriggerRef,
          onClick: composeEventHandlers(props.onClick, context.onOpenToggle)
        }
      );
    }, "DialogTrigger")
  );
  var PORTAL_NAME = "DialogPortal";
  var [PortalProvider, usePortalContext] = createDialogContext(PORTAL_NAME, {
    forceMount: void 0
  });
  var DialogPortal = /* @__PURE__ */ __name19((props) => {
    const { __scopeDialog, forceMount, children, container } = props;
    const context = useDialogContext(PORTAL_NAME, __scopeDialog);
    return /* @__PURE__ */ jsx(PortalProvider, { scope: __scopeDialog, forceMount, children: Children.map(children, (child) => /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Portal, { asChild: true, container, children: child }) })) });
  }, "DialogPortal");
  var OVERLAY_NAME = "DialogOverlay";
  var DialogOverlay = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name19(function DialogOverlay2(props, forwardedRef) {
      const portalContext = usePortalContext(OVERLAY_NAME, props.__scopeDialog);
      const { forceMount = portalContext.forceMount, ...overlayProps } = props;
      const context = useDialogContext(OVERLAY_NAME, props.__scopeDialog);
      return context.modal ? /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(DialogOverlayImpl, { ...overlayProps, ref: forwardedRef }) }) : null;
    }, "DialogOverlay")
  );
  var Slot2 = createSlot("DialogOverlay.RemoveScroll");
  var DialogOverlayImpl = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name19(function DialogOverlayImpl2(props, forwardedRef) {
      const { __scopeDialog, ...overlayProps } = props;
      const context = useDialogContext(OVERLAY_NAME, __scopeDialog);
      const registerDismissableSurface = useDismissableLayerSurface();
      const composedRefs = useComposedRefs(forwardedRef, registerDismissableSurface);
      return (
        // Make sure `Content` is scrollable even when it doesn't live inside `RemoveScroll`
        // ie. when `Overlay` and `Content` are siblings
        /* @__PURE__ */ jsx(Combination_default, { as: Slot2, allowPinchZoom: true, shards: [context.contentRef], children: /* @__PURE__ */ jsx(
          Primitive.div,
          {
            "data-state": getState2(context.open),
            ...overlayProps,
            ref: composedRefs,
            style: { pointerEvents: "auto", ...overlayProps.style }
          }
        ) })
      );
    }, "DialogOverlayImpl")
  );
  var CONTENT_NAME2 = "DialogContent";
  var DialogContent = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name19(function DialogContent2(props, forwardedRef) {
      const portalContext = usePortalContext(CONTENT_NAME2, props.__scopeDialog);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = useDialogContext(CONTENT_NAME2, props.__scopeDialog);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: context.modal ? /* @__PURE__ */ jsx(DialogContentModal, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(DialogContentNonModal, { ...contentProps, ref: forwardedRef }) });
    }, "DialogContent")
  );
  var DialogContentModal = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name19(function DialogContentModal2(props, forwardedRef) {
      const context = useDialogContext(CONTENT_NAME2, props.__scopeDialog);
      const contentRef = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, context.contentRef, contentRef);
      useEffect(() => {
        const content = contentRef.current;
        if (content) return hideOthers(content);
      }, []);
      return /* @__PURE__ */ jsx(
        DialogContentImpl,
        {
          ...props,
          ref: composedRefs,
          trapFocus: context.open,
          disableOutsidePointerEvents: context.open,
          onCloseAutoFocus: composeEventHandlers(props.onCloseAutoFocus, (event) => {
            event.preventDefault();
            context.triggerRef.current?.focus();
          }),
          onPointerDownOutside: composeEventHandlers(props.onPointerDownOutside, (event) => {
            const originalEvent = event.detail.originalEvent;
            const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
            const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
            if (isRightClick) event.preventDefault();
          }),
          onFocusOutside: composeEventHandlers(
            props.onFocusOutside,
            (event) => event.preventDefault()
          )
        }
      );
    }, "DialogContentModal")
  );
  var DialogContentNonModal = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name19(function DialogContentNonModal2(props, forwardedRef) {
      const context = useDialogContext(CONTENT_NAME2, props.__scopeDialog);
      const hasInteractedOutsideRef = useRef(false);
      const hasPointerDownOutsideRef = useRef(false);
      return /* @__PURE__ */ jsx(
        DialogContentImpl,
        {
          ...props,
          ref: forwardedRef,
          trapFocus: false,
          disableOutsidePointerEvents: false,
          onCloseAutoFocus: (event) => {
            props.onCloseAutoFocus?.(event);
            if (!event.defaultPrevented) {
              if (!hasInteractedOutsideRef.current) context.triggerRef.current?.focus();
              event.preventDefault();
            }
            hasInteractedOutsideRef.current = false;
            hasPointerDownOutsideRef.current = false;
          },
          onInteractOutside: (event) => {
            props.onInteractOutside?.(event);
            if (!event.defaultPrevented) {
              hasInteractedOutsideRef.current = true;
              if (event.detail.originalEvent.type === "pointerdown") {
                hasPointerDownOutsideRef.current = true;
              }
            }
            const target = event.target;
            const targetIsTrigger = context.triggerRef.current?.contains(target);
            if (targetIsTrigger) event.preventDefault();
            if (event.detail.originalEvent.type === "focusin" && hasPointerDownOutsideRef.current) {
              event.preventDefault();
            }
          }
        }
      );
    }, "DialogContentNonModal")
  );
  var DialogContentImpl = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name19(function DialogContentImpl2(props, forwardedRef) {
      const { __scopeDialog, trapFocus, onOpenAutoFocus, onCloseAutoFocus, ...contentProps } = props;
      const context = useDialogContext(CONTENT_NAME2, __scopeDialog);
      useFocusGuards();
      return /* @__PURE__ */ jsx(Fragment2, { children: /* @__PURE__ */ jsx(
        FocusScope,
        {
          asChild: true,
          loop: true,
          trapped: trapFocus,
          onMountAutoFocus: onOpenAutoFocus,
          onUnmountAutoFocus: onCloseAutoFocus,
          children: /* @__PURE__ */ jsx(
            DismissableLayer,
            {
              role: "dialog",
              id: context.contentId,
              "aria-describedby": context.descriptionPresent ? context.descriptionId : void 0,
              "aria-labelledby": context.titlePresent ? context.titleId : void 0,
              "data-state": getState2(context.open),
              ...contentProps,
              ref: forwardedRef,
              deferPointerDownOutside: true,
              onDismiss: () => context.onOpenChange(false)
            }
          )
        }
      ) });
    }, "DialogContentImpl")
  );
  var TITLE_NAME = "DialogTitle";
  var DialogTitle = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name19(function DialogTitle2(props, forwardedRef) {
      const { __scopeDialog, ...titleProps } = props;
      const context = useDialogContext(TITLE_NAME, __scopeDialog);
      const { setTitleCount } = context;
      useLayoutEffect2(() => {
        setTitleCount((count3) => count3 + 1);
        return () => setTitleCount((count3) => count3 - 1);
      }, [setTitleCount]);
      return /* @__PURE__ */ jsx(Primitive.h2, { id: context.titleId, ...titleProps, ref: forwardedRef });
    }, "DialogTitle")
  );
  var DESCRIPTION_NAME = "DialogDescription";
  var DialogDescription = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name19(function DialogDescription2(props, forwardedRef) {
      const { __scopeDialog, ...descriptionProps } = props;
      const context = useDialogContext(DESCRIPTION_NAME, __scopeDialog);
      const { setDescriptionCount } = context;
      useLayoutEffect2(() => {
        setDescriptionCount((count3) => count3 + 1);
        return () => setDescriptionCount((count3) => count3 - 1);
      }, [setDescriptionCount]);
      return /* @__PURE__ */ jsx(Primitive.p, { id: context.descriptionId, ...descriptionProps, ref: forwardedRef });
    }, "DialogDescription")
  );
  var CLOSE_NAME = "DialogClose";
  var DialogClose = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name19(function DialogClose2(props, forwardedRef) {
      const { __scopeDialog, ...closeProps } = props;
      const context = useDialogContext(CLOSE_NAME, __scopeDialog);
      return /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          ...closeProps,
          ref: forwardedRef,
          onClick: composeEventHandlers(props.onClick, () => context.onOpenChange(false))
        }
      );
    }, "DialogClose")
  );
  var WarningProvider = /* @__PURE__ */ __name19((props) => {
    return props.children;
  }, "WarningProvider");
  function getState2(open) {
    return open ? "open" : "closed";
  }
  __name19(getState2, "getState");

  // ../../node_modules/.pnpm/@radix-ui+react-alert-dialog@1.1.23_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-alert-dialog/dist/index.mjs
  var __defProp21 = Object.defineProperty;
  var __name20 = (target, value) => __defProp21(target, "name", { value, configurable: true });
  var ROOT_NAME = "AlertDialog";
  var [createAlertDialogContext, createAlertDialogScope] = createContextScope(ROOT_NAME, [
    createDialogScope
  ]);
  var useDialogScope = createDialogScope();
  var AlertDialog = /* @__PURE__ */ __name20((props) => {
    const { __scopeAlertDialog, ...alertDialogProps } = props;
    const dialogScope = useDialogScope(__scopeAlertDialog);
    return /* @__PURE__ */ jsx(Dialog, { ...dialogScope, ...alertDialogProps, modal: true });
  }, "AlertDialog");
  var AlertDialogTrigger = forwardRef(
    /* @__PURE__ */ __name20(function AlertDialogTrigger2(props, forwardedRef) {
      const { __scopeAlertDialog, ...triggerProps } = props;
      const dialogScope = useDialogScope(__scopeAlertDialog);
      return /* @__PURE__ */ jsx(DialogTrigger, { ...dialogScope, ...triggerProps, ref: forwardedRef });
    }, "AlertDialogTrigger")
  );
  var AlertDialogPortal = /* @__PURE__ */ __name20((props) => {
    const { __scopeAlertDialog, ...portalProps } = props;
    const dialogScope = useDialogScope(__scopeAlertDialog);
    return /* @__PURE__ */ jsx(DialogPortal, { ...dialogScope, ...portalProps });
  }, "AlertDialogPortal");
  var AlertDialogOverlay = forwardRef(
    /* @__PURE__ */ __name20(function AlertDialogOverlay2(props, forwardedRef) {
      const { __scopeAlertDialog, ...overlayProps } = props;
      const dialogScope = useDialogScope(__scopeAlertDialog);
      return /* @__PURE__ */ jsx(DialogOverlay, { ...dialogScope, ...overlayProps, ref: forwardedRef });
    }, "AlertDialogOverlay")
  );
  var CONTENT_NAME3 = "AlertDialogContent";
  var [AlertDialogContentProvider, useAlertDialogContentContext] = createAlertDialogContext(CONTENT_NAME3);
  var AlertDialogContent = forwardRef(
    /* @__PURE__ */ __name20(function AlertDialogContent2(props, forwardedRef) {
      const { __scopeAlertDialog, children, ...contentProps } = props;
      const dialogScope = useDialogScope(__scopeAlertDialog);
      const contentRef = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, contentRef);
      const cancelRef = useRef(null);
      return /* @__PURE__ */ jsx(AlertDialogContentProvider, { scope: __scopeAlertDialog, cancelRef, children: /* @__PURE__ */ jsx(
        DialogContent,
        {
          role: "alertdialog",
          ...dialogScope,
          ...contentProps,
          ref: composedRefs,
          onOpenAutoFocus: composeEventHandlers(contentProps.onOpenAutoFocus, (event) => {
            event.preventDefault();
            cancelRef.current?.focus({ preventScroll: true });
          }),
          onPointerDownOutside: (event) => event.preventDefault(),
          onInteractOutside: (event) => event.preventDefault(),
          children
        }
      ) });
    }, "AlertDialogContent")
  );
  var AlertDialogTitle = forwardRef(
    /* @__PURE__ */ __name20(function AlertDialogTitle2(props, forwardedRef) {
      const { __scopeAlertDialog, ...titleProps } = props;
      const dialogScope = useDialogScope(__scopeAlertDialog);
      return /* @__PURE__ */ jsx(DialogTitle, { ...dialogScope, ...titleProps, ref: forwardedRef });
    }, "AlertDialogTitle")
  );
  var AlertDialogDescription = forwardRef(/* @__PURE__ */ __name20(function AlertDialogDescription2(props, forwardedRef) {
    const { __scopeAlertDialog, ...descriptionProps } = props;
    const dialogScope = useDialogScope(__scopeAlertDialog);
    return /* @__PURE__ */ jsx(DialogDescription, { ...dialogScope, ...descriptionProps, ref: forwardedRef });
  }, "AlertDialogDescription"));
  var AlertDialogAction = forwardRef(
    /* @__PURE__ */ __name20(function AlertDialogAction2(props, forwardedRef) {
      const { __scopeAlertDialog, ...actionProps } = props;
      const dialogScope = useDialogScope(__scopeAlertDialog);
      return /* @__PURE__ */ jsx(DialogClose, { ...dialogScope, ...actionProps, ref: forwardedRef });
    }, "AlertDialogAction")
  );
  var CANCEL_NAME = "AlertDialogCancel";
  var AlertDialogCancel = forwardRef(
    /* @__PURE__ */ __name20(function AlertDialogCancel2(props, forwardedRef) {
      const { __scopeAlertDialog, ...cancelProps } = props;
      const { cancelRef } = useAlertDialogContentContext(CANCEL_NAME, __scopeAlertDialog);
      const dialogScope = useDialogScope(__scopeAlertDialog);
      const ref = useComposedRefs(forwardedRef, cancelRef);
      return /* @__PURE__ */ jsx(DialogClose, { ...dialogScope, ...cancelProps, ref });
    }, "AlertDialogCancel")
  );
  var Root22 = AlertDialog;
  var Trigger2 = AlertDialogTrigger;
  var Portal22 = AlertDialogPortal;
  var Overlay2 = AlertDialogOverlay;
  var Content2 = AlertDialogContent;
  var Action = AlertDialogAction;
  var Cancel = AlertDialogCancel;
  var Title2 = AlertDialogTitle;
  var Description2 = AlertDialogDescription;

  // ../../node_modules/.pnpm/@radix-ui+react-use-size@1.1.4_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-size/dist/index.mjs
  var __defProp22 = Object.defineProperty;
  var __name21 = (target, value) => __defProp22(target, "name", { value, configurable: true });
  function useSize(element) {
    const [size4, setSize] = useState(void 0);
    useLayoutEffect2(() => {
      if (element) {
        setSize({ width: element.offsetWidth, height: element.offsetHeight });
        const resizeObserver = new ResizeObserver((entries) => {
          if (!Array.isArray(entries)) {
            return;
          }
          if (!entries.length) {
            return;
          }
          const entry = entries[0];
          let width;
          let height;
          if ("borderBoxSize" in entry) {
            const borderSizeEntry = entry["borderBoxSize"];
            const borderSize = Array.isArray(borderSizeEntry) ? borderSizeEntry[0] : borderSizeEntry;
            width = borderSize["inlineSize"];
            height = borderSize["blockSize"];
          } else {
            width = element.offsetWidth;
            height = element.offsetHeight;
          }
          setSize({ width, height });
        });
        resizeObserver.observe(element, { box: "border-box" });
        return () => resizeObserver.unobserve(element);
      } else {
        setSize(void 0);
      }
    }, [element]);
    return size4;
  }
  __name21(useSize, "useSize");

  // ../../node_modules/.pnpm/@floating-ui+utils@0.2.12/node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs
  var sides = ["top", "right", "bottom", "left"];
  var min = Math.min;
  var max = Math.max;
  var round = Math.round;
  var floor = Math.floor;
  var createCoords = (v) => ({
    x: v,
    y: v
  });
  var oppositeSideMap = {
    left: "right",
    right: "left",
    bottom: "top",
    top: "bottom"
  };
  function clamp(start, value, end) {
    return max(start, min(value, end));
  }
  function evaluate(value, param) {
    return typeof value === "function" ? value(param) : value;
  }
  function getSide(placement) {
    return placement.split("-")[0];
  }
  function getAlignment(placement) {
    return placement.split("-")[1];
  }
  function getOppositeAxis(axis) {
    return axis === "x" ? "y" : "x";
  }
  function getAxisLength(axis) {
    return axis === "y" ? "height" : "width";
  }
  function getSideAxis(placement) {
    const firstChar = placement[0];
    return firstChar === "t" || firstChar === "b" ? "y" : "x";
  }
  function getAlignmentAxis(placement) {
    return getOppositeAxis(getSideAxis(placement));
  }
  function getAlignmentSides(placement, rects, rtl) {
    if (rtl === void 0) {
      rtl = false;
    }
    const alignment = getAlignment(placement);
    const alignmentAxis = getAlignmentAxis(placement);
    const length = getAxisLength(alignmentAxis);
    let mainAlignmentSide = alignmentAxis === "x" ? alignment === (rtl ? "end" : "start") ? "right" : "left" : alignment === "start" ? "bottom" : "top";
    if (rects.reference[length] > rects.floating[length]) {
      mainAlignmentSide = getOppositePlacement(mainAlignmentSide);
    }
    return [mainAlignmentSide, getOppositePlacement(mainAlignmentSide)];
  }
  function getExpandedPlacements(placement) {
    const oppositePlacement = getOppositePlacement(placement);
    return [getOppositeAlignmentPlacement(placement), oppositePlacement, getOppositeAlignmentPlacement(oppositePlacement)];
  }
  function getOppositeAlignmentPlacement(placement) {
    return placement.includes("start") ? placement.replace("start", "end") : placement.replace("end", "start");
  }
  var lrPlacement = ["left", "right"];
  var rlPlacement = ["right", "left"];
  var tbPlacement = ["top", "bottom"];
  var btPlacement = ["bottom", "top"];
  function getSideList(side, isStart, rtl) {
    switch (side) {
      case "top":
      case "bottom":
        if (rtl) return isStart ? rlPlacement : lrPlacement;
        return isStart ? lrPlacement : rlPlacement;
      case "left":
      case "right":
        return isStart ? tbPlacement : btPlacement;
      default:
        return [];
    }
  }
  function getOppositeAxisPlacements(placement, flipAlignment, direction, rtl) {
    const alignment = getAlignment(placement);
    let list = getSideList(getSide(placement), direction === "start", rtl);
    if (alignment) {
      list = list.map((side) => side + "-" + alignment);
      if (flipAlignment) {
        list = list.concat(list.map(getOppositeAlignmentPlacement));
      }
    }
    return list;
  }
  function getOppositePlacement(placement) {
    const side = getSide(placement);
    return oppositeSideMap[side] + placement.slice(side.length);
  }
  function expandPaddingObject(padding) {
    var _padding$top, _padding$right, _padding$bottom, _padding$left;
    return {
      top: (_padding$top = padding.top) != null ? _padding$top : 0,
      right: (_padding$right = padding.right) != null ? _padding$right : 0,
      bottom: (_padding$bottom = padding.bottom) != null ? _padding$bottom : 0,
      left: (_padding$left = padding.left) != null ? _padding$left : 0
    };
  }
  function getPaddingObject(padding) {
    return typeof padding !== "number" ? expandPaddingObject(padding) : {
      top: padding,
      right: padding,
      bottom: padding,
      left: padding
    };
  }
  function rectToClientRect(rect) {
    const {
      x,
      y,
      width,
      height
    } = rect;
    return {
      width,
      height,
      top: y,
      left: x,
      right: x + width,
      bottom: y + height,
      x,
      y
    };
  }

  // ../../node_modules/.pnpm/@floating-ui+core@1.8.0/node_modules/@floating-ui/core/dist/floating-ui.core.mjs
  function computeCoordsFromPlacement(_ref, placement, rtl) {
    let {
      reference,
      floating
    } = _ref;
    const sideAxis = getSideAxis(placement);
    const alignmentAxis = getAlignmentAxis(placement);
    const alignLength = getAxisLength(alignmentAxis);
    const side = getSide(placement);
    const isVertical = sideAxis === "y";
    const commonX = reference.x + reference.width / 2 - floating.width / 2;
    const commonY = reference.y + reference.height / 2 - floating.height / 2;
    const commonAlign = reference[alignLength] / 2 - floating[alignLength] / 2;
    let coords;
    switch (side) {
      case "top":
        coords = {
          x: commonX,
          y: reference.y - floating.height
        };
        break;
      case "bottom":
        coords = {
          x: commonX,
          y: reference.y + reference.height
        };
        break;
      case "right":
        coords = {
          x: reference.x + reference.width,
          y: commonY
        };
        break;
      case "left":
        coords = {
          x: reference.x - floating.width,
          y: commonY
        };
        break;
      default:
        coords = {
          x: reference.x,
          y: reference.y
        };
    }
    const alignment = getAlignment(placement);
    if (alignment) {
      coords[alignmentAxis] += commonAlign * (alignment === "end" ? 1 : -1) * (rtl && isVertical ? -1 : 1);
    }
    return coords;
  }
  async function detectOverflow(state, options2) {
    var _await$platform$isEle;
    if (options2 === void 0) {
      options2 = {};
    }
    const {
      x,
      y,
      platform: platform2,
      rects,
      elements,
      strategy
    } = state;
    const {
      boundary = "clippingAncestors",
      rootBoundary = "viewport",
      elementContext = "floating",
      altBoundary = false,
      padding = 0
    } = evaluate(options2, state);
    const paddingObject = getPaddingObject(padding);
    const altContext = elementContext === "floating" ? "reference" : "floating";
    const element = elements[altBoundary ? altContext : elementContext];
    const clippingClientRect = rectToClientRect(await platform2.getClippingRect({
      element: ((_await$platform$isEle = await (platform2.isElement == null ? void 0 : platform2.isElement(element))) != null ? _await$platform$isEle : true) ? element : element.contextElement || await (platform2.getDocumentElement == null ? void 0 : platform2.getDocumentElement(elements.floating)),
      boundary,
      rootBoundary,
      strategy
    }));
    const rect = elementContext === "floating" ? {
      x,
      y,
      width: rects.floating.width,
      height: rects.floating.height
    } : rects.reference;
    const offsetParent = await (platform2.getOffsetParent == null ? void 0 : platform2.getOffsetParent(elements.floating));
    const offsetScale = await (platform2.isElement == null ? void 0 : platform2.isElement(offsetParent)) && await (platform2.getScale == null ? void 0 : platform2.getScale(offsetParent)) || {
      x: 1,
      y: 1
    };
    const elementClientRect = rectToClientRect(platform2.convertOffsetParentRelativeRectToViewportRelativeRect ? await platform2.convertOffsetParentRelativeRectToViewportRelativeRect({
      elements,
      rect,
      offsetParent,
      strategy
    }) : rect);
    return {
      top: (clippingClientRect.top - elementClientRect.top + paddingObject.top) / offsetScale.y,
      bottom: (elementClientRect.bottom - clippingClientRect.bottom + paddingObject.bottom) / offsetScale.y,
      left: (clippingClientRect.left - elementClientRect.left + paddingObject.left) / offsetScale.x,
      right: (elementClientRect.right - clippingClientRect.right + paddingObject.right) / offsetScale.x
    };
  }
  var MAX_RESET_COUNT = 50;
  var computePosition = async (reference, floating, config) => {
    const {
      placement = "bottom",
      strategy = "absolute",
      middleware = [],
      platform: platform2
    } = config;
    const platformWithDetectOverflow = platform2.detectOverflow ? platform2 : {
      ...platform2,
      detectOverflow
    };
    const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(floating));
    let rects = await platform2.getElementRects({
      reference,
      floating,
      strategy
    });
    let {
      x,
      y
    } = computeCoordsFromPlacement(rects, placement, rtl);
    let statefulPlacement = placement;
    let resetCount = 0;
    const middlewareData = {};
    for (let i = 0; i < middleware.length; i++) {
      const currentMiddleware = middleware[i];
      if (!currentMiddleware) {
        continue;
      }
      const {
        name,
        fn: fn2
      } = currentMiddleware;
      const {
        x: nextX,
        y: nextY,
        data,
        reset
      } = await fn2({
        x,
        y,
        initialPlacement: placement,
        placement: statefulPlacement,
        strategy,
        middlewareData,
        rects,
        platform: platformWithDetectOverflow,
        elements: {
          reference,
          floating
        }
      });
      x = nextX != null ? nextX : x;
      y = nextY != null ? nextY : y;
      middlewareData[name] = {
        ...middlewareData[name],
        ...data
      };
      if (reset && resetCount < MAX_RESET_COUNT) {
        resetCount++;
        if (typeof reset === "object") {
          if (reset.placement) {
            statefulPlacement = reset.placement;
          }
          if (reset.rects) {
            rects = reset.rects === true ? await platform2.getElementRects({
              reference,
              floating,
              strategy
            }) : reset.rects;
          }
          ({
            x,
            y
          } = computeCoordsFromPlacement(rects, statefulPlacement, rtl));
        }
        i = -1;
      }
    }
    return {
      x,
      y,
      placement: statefulPlacement,
      strategy,
      middlewareData
    };
  };
  var arrow = (options2) => ({
    name: "arrow",
    options: options2,
    async fn(state) {
      const {
        x,
        y,
        placement,
        rects,
        platform: platform2,
        elements,
        middlewareData
      } = state;
      const {
        element,
        padding = 0
      } = evaluate(options2, state) || {};
      if (element == null) {
        return {};
      }
      const paddingObject = getPaddingObject(padding);
      const coords = {
        x,
        y
      };
      const axis = getAlignmentAxis(placement);
      const length = getAxisLength(axis);
      const arrowDimensions = await platform2.getDimensions(element);
      const isYAxis = axis === "y";
      const minProp = isYAxis ? "top" : "left";
      const maxProp = isYAxis ? "bottom" : "right";
      const clientProp = isYAxis ? "clientHeight" : "clientWidth";
      const endDiff = rects.reference[length] + rects.reference[axis] - coords[axis] - rects.floating[length];
      const startDiff = coords[axis] - rects.reference[axis];
      const arrowOffsetParent = await (platform2.getOffsetParent == null ? void 0 : platform2.getOffsetParent(element));
      let clientSize = arrowOffsetParent ? arrowOffsetParent[clientProp] : 0;
      if (!clientSize || !await (platform2.isElement == null ? void 0 : platform2.isElement(arrowOffsetParent))) {
        clientSize = elements.floating[clientProp] || rects.floating[length];
      }
      const centerToReference = endDiff / 2 - startDiff / 2;
      const largestPossiblePadding = clientSize / 2 - arrowDimensions[length] / 2 - 1;
      const minPadding = min(paddingObject[minProp], largestPossiblePadding);
      const maxPadding = min(paddingObject[maxProp], largestPossiblePadding);
      const max2 = clientSize - arrowDimensions[length] - maxPadding;
      const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
      const offset4 = clamp(minPadding, center, max2);
      const shouldAddOffset = !middlewareData.arrow && getAlignment(placement) != null && center !== offset4 && rects.reference[length] / 2 - (center < minPadding ? minPadding : maxPadding) - arrowDimensions[length] / 2 < 0;
      const alignmentOffset = shouldAddOffset ? center < minPadding ? center - minPadding : center - max2 : 0;
      return {
        [axis]: coords[axis] + alignmentOffset,
        data: {
          [axis]: offset4,
          centerOffset: center - offset4 - alignmentOffset,
          ...shouldAddOffset && {
            alignmentOffset
          }
        },
        reset: shouldAddOffset
      };
    }
  });
  var flip = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      name: "flip",
      options: options2,
      async fn(state) {
        var _middlewareData$arrow, _middlewareData$flip;
        const {
          placement,
          middlewareData,
          rects,
          initialPlacement,
          platform: platform2,
          elements
        } = state;
        const {
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = true,
          fallbackPlacements: specifiedFallbackPlacements,
          fallbackStrategy = "bestFit",
          fallbackAxisSideDirection = "none",
          flipAlignment = true,
          ...detectOverflowOptions
        } = evaluate(options2, state);
        if ((_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
          return {};
        }
        const side = getSide(placement);
        const initialSideAxis = getSideAxis(initialPlacement);
        const isBasePlacement = getSide(initialPlacement) === initialPlacement;
        const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating));
        const fallbackPlacements = specifiedFallbackPlacements || (isBasePlacement || !flipAlignment ? [getOppositePlacement(initialPlacement)] : getExpandedPlacements(initialPlacement));
        const hasFallbackAxisSideDirection = fallbackAxisSideDirection !== "none";
        if (!specifiedFallbackPlacements && hasFallbackAxisSideDirection) {
          fallbackPlacements.push(...getOppositeAxisPlacements(initialPlacement, flipAlignment, fallbackAxisSideDirection, rtl));
        }
        const placements2 = [initialPlacement, ...fallbackPlacements];
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const overflows = [];
        let overflowsData = ((_middlewareData$flip = middlewareData.flip) == null ? void 0 : _middlewareData$flip.overflows) || [];
        if (checkMainAxis) {
          overflows.push(overflow[side]);
        }
        if (checkCrossAxis) {
          const sides2 = getAlignmentSides(placement, rects, rtl);
          overflows.push(overflow[sides2[0]], overflow[sides2[1]]);
        }
        overflowsData = [...overflowsData, {
          placement,
          overflows
        }];
        if (!overflows.every((side2) => side2 <= 0)) {
          var _middlewareData$flip2, _overflowsData$filter;
          const nextIndex = (((_middlewareData$flip2 = middlewareData.flip) == null ? void 0 : _middlewareData$flip2.index) || 0) + 1;
          const nextPlacement = placements2[nextIndex];
          if (nextPlacement) {
            const ignoreCrossAxisOverflow = checkCrossAxis === "alignment" ? initialSideAxis !== getSideAxis(nextPlacement) : false;
            if (!ignoreCrossAxisOverflow || // We leave the current main axis only if every placement on that axis
            // overflows the main axis.
            overflowsData.every((d) => getSideAxis(d.placement) === initialSideAxis ? d.overflows[0] > 0 : true)) {
              return {
                data: {
                  index: nextIndex,
                  overflows: overflowsData
                },
                reset: {
                  placement: nextPlacement
                }
              };
            }
          }
          let resetPlacement = (_overflowsData$filter = overflowsData.filter((d) => d.overflows[0] <= 0).sort((a2, b) => a2.overflows[1] - b.overflows[1])[0]) == null ? void 0 : _overflowsData$filter.placement;
          if (!resetPlacement) {
            switch (fallbackStrategy) {
              case "bestFit": {
                var _overflowsData$filter2;
                const placement2 = (_overflowsData$filter2 = overflowsData.filter((d) => {
                  if (hasFallbackAxisSideDirection) {
                    const currentSideAxis = getSideAxis(d.placement);
                    return currentSideAxis === initialSideAxis || // Create a bias to the `y` side axis due to horizontal
                    // reading directions favoring greater width.
                    currentSideAxis === "y";
                  }
                  return true;
                }).map((d) => [d.placement, d.overflows.filter((overflow2) => overflow2 > 0).reduce((acc, overflow2) => acc + overflow2, 0)]).sort((a2, b) => a2[1] - b[1])[0]) == null ? void 0 : _overflowsData$filter2[0];
                if (placement2) {
                  resetPlacement = placement2;
                }
                break;
              }
              case "initialPlacement":
                resetPlacement = initialPlacement;
                break;
            }
          }
          if (placement !== resetPlacement) {
            return {
              reset: {
                placement: resetPlacement
              }
            };
          }
        }
        return {};
      }
    };
  };
  function getSideOffsets(overflow, rect) {
    return {
      top: overflow.top - rect.height,
      right: overflow.right - rect.width,
      bottom: overflow.bottom - rect.height,
      left: overflow.left - rect.width
    };
  }
  function isAnySideFullyClipped(overflow) {
    return sides.some((side) => overflow[side] >= 0);
  }
  var hide = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      name: "hide",
      options: options2,
      async fn(state) {
        const {
          rects,
          platform: platform2
        } = state;
        const {
          strategy = "referenceHidden",
          ...detectOverflowOptions
        } = evaluate(options2, state);
        switch (strategy) {
          case "referenceHidden": {
            const overflow = await platform2.detectOverflow(state, {
              ...detectOverflowOptions,
              elementContext: "reference"
            });
            const offsets = getSideOffsets(overflow, rects.reference);
            return {
              data: {
                referenceHiddenOffsets: offsets,
                referenceHidden: isAnySideFullyClipped(offsets)
              }
            };
          }
          case "escaped": {
            const overflow = await platform2.detectOverflow(state, {
              ...detectOverflowOptions,
              altBoundary: true
            });
            const offsets = getSideOffsets(overflow, rects.floating);
            return {
              data: {
                escapedOffsets: offsets,
                escaped: isAnySideFullyClipped(offsets)
              }
            };
          }
          default: {
            return {};
          }
        }
      }
    };
  };
  var originSides = /* @__PURE__ */ new Set(["left", "top"]);
  async function convertValueToCoords(state, options2) {
    const {
      placement,
      platform: platform2,
      elements
    } = state;
    const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating));
    const side = getSide(placement);
    const alignment = getAlignment(placement);
    const isVertical = getSideAxis(placement) === "y";
    const mainAxisMulti = originSides.has(side) ? -1 : 1;
    const crossAxisMulti = rtl && isVertical ? -1 : 1;
    const rawValue = evaluate(options2, state);
    let {
      mainAxis,
      crossAxis,
      alignmentAxis
    } = typeof rawValue === "number" ? {
      mainAxis: rawValue,
      crossAxis: 0,
      alignmentAxis: null
    } : {
      mainAxis: rawValue.mainAxis || 0,
      crossAxis: rawValue.crossAxis || 0,
      alignmentAxis: rawValue.alignmentAxis
    };
    if (alignment && typeof alignmentAxis === "number") {
      crossAxis = alignment === "end" ? alignmentAxis * -1 : alignmentAxis;
    }
    return isVertical ? {
      x: crossAxis * crossAxisMulti,
      y: mainAxis * mainAxisMulti
    } : {
      x: mainAxis * mainAxisMulti,
      y: crossAxis * crossAxisMulti
    };
  }
  var offset = function(options2) {
    if (options2 === void 0) {
      options2 = 0;
    }
    return {
      name: "offset",
      options: options2,
      async fn(state) {
        var _middlewareData$offse, _middlewareData$arrow;
        const {
          x,
          y,
          placement,
          middlewareData
        } = state;
        const diffCoords = await convertValueToCoords(state, options2);
        if (placement === ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse.placement) && (_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
          return {};
        }
        return {
          x: x + diffCoords.x,
          y: y + diffCoords.y,
          data: {
            ...diffCoords,
            placement
          }
        };
      }
    };
  };
  var shift = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      name: "shift",
      options: options2,
      async fn(state) {
        const {
          x,
          y,
          placement,
          platform: platform2
        } = state;
        const {
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = false,
          limiter = {
            fn: (_ref) => {
              let {
                x: x2,
                y: y2
              } = _ref;
              return {
                x: x2,
                y: y2
              };
            }
          },
          ...detectOverflowOptions
        } = evaluate(options2, state);
        const coords = {
          x,
          y
        };
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const crossAxis = getSideAxis(placement);
        const mainAxis = getOppositeAxis(crossAxis);
        let mainAxisCoord = coords[mainAxis];
        let crossAxisCoord = coords[crossAxis];
        const clampCoord = (axis, coord) => clamp(coord + overflow[axis === "y" ? "top" : "left"], coord, coord - overflow[axis === "y" ? "bottom" : "right"]);
        if (checkMainAxis) {
          mainAxisCoord = clampCoord(mainAxis, mainAxisCoord);
        }
        if (checkCrossAxis) {
          crossAxisCoord = clampCoord(crossAxis, crossAxisCoord);
        }
        const limitedCoords = limiter.fn({
          ...state,
          [mainAxis]: mainAxisCoord,
          [crossAxis]: crossAxisCoord
        });
        return {
          ...limitedCoords,
          data: {
            x: limitedCoords.x - x,
            y: limitedCoords.y - y,
            enabled: {
              [mainAxis]: checkMainAxis,
              [crossAxis]: checkCrossAxis
            }
          }
        };
      }
    };
  };
  var limitShift = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      options: options2,
      fn(state) {
        var _rawOffset$mainAxis, _rawOffset$crossAxis;
        const {
          x,
          y,
          placement,
          rects,
          middlewareData
        } = state;
        const {
          offset: offset4 = 0,
          mainAxis: checkMainAxis = true,
          crossAxis: checkCrossAxis = true
        } = evaluate(options2, state);
        const coords = {
          x,
          y
        };
        const crossAxis = getSideAxis(placement);
        const mainAxis = getOppositeAxis(crossAxis);
        let mainAxisCoord = coords[mainAxis];
        let crossAxisCoord = coords[crossAxis];
        const rawOffset = evaluate(offset4, state);
        const computedOffset = typeof rawOffset === "number" ? {
          mainAxis: rawOffset,
          crossAxis: 0
        } : {
          mainAxis: (_rawOffset$mainAxis = rawOffset.mainAxis) != null ? _rawOffset$mainAxis : 0,
          crossAxis: (_rawOffset$crossAxis = rawOffset.crossAxis) != null ? _rawOffset$crossAxis : 0
        };
        if (checkMainAxis) {
          const len = mainAxis === "y" ? "height" : "width";
          const limitMin = rects.reference[mainAxis] - rects.floating[len] + computedOffset.mainAxis;
          const limitMax = rects.reference[mainAxis] + rects.reference[len] - computedOffset.mainAxis;
          if (mainAxisCoord < limitMin) {
            mainAxisCoord = limitMin;
          } else if (mainAxisCoord > limitMax) {
            mainAxisCoord = limitMax;
          }
        }
        if (checkCrossAxis) {
          var _middlewareData$offse, _middlewareData$offse2;
          const len = mainAxis === "y" ? "width" : "height";
          const isOriginSide = originSides.has(getSide(placement));
          const limitMin = rects.reference[crossAxis] - rects.floating[len] + (isOriginSide ? ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse[crossAxis]) || 0 : 0) + (isOriginSide ? 0 : computedOffset.crossAxis);
          const limitMax = rects.reference[crossAxis] + rects.reference[len] + (isOriginSide ? 0 : ((_middlewareData$offse2 = middlewareData.offset) == null ? void 0 : _middlewareData$offse2[crossAxis]) || 0) - (isOriginSide ? computedOffset.crossAxis : 0);
          if (crossAxisCoord < limitMin) {
            crossAxisCoord = limitMin;
          } else if (crossAxisCoord > limitMax) {
            crossAxisCoord = limitMax;
          }
        }
        return {
          [mainAxis]: mainAxisCoord,
          [crossAxis]: crossAxisCoord
        };
      }
    };
  };
  var size = function(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    return {
      name: "size",
      options: options2,
      async fn(state) {
        const {
          placement,
          rects,
          platform: platform2,
          elements
        } = state;
        const {
          apply = () => {
          },
          ...detectOverflowOptions
        } = evaluate(options2, state);
        const overflow = await platform2.detectOverflow(state, detectOverflowOptions);
        const side = getSide(placement);
        const alignment = getAlignment(placement);
        const isYAxis = getSideAxis(placement) === "y";
        const {
          width,
          height
        } = rects.floating;
        let heightSide;
        let widthSide;
        if (side === "top" || side === "bottom") {
          heightSide = side;
          widthSide = alignment === (await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating)) ? "start" : "end") ? "left" : "right";
        } else {
          widthSide = side;
          heightSide = alignment === "end" ? "top" : "bottom";
        }
        const maximumClippingHeight = height - overflow.top - overflow.bottom;
        const maximumClippingWidth = width - overflow.left - overflow.right;
        const overflowAvailableHeight = min(height - overflow[heightSide], maximumClippingHeight);
        const overflowAvailableWidth = min(width - overflow[widthSide], maximumClippingWidth);
        const shiftData = state.middlewareData.shift;
        const noShift = !shiftData;
        let availableHeight = overflowAvailableHeight;
        let availableWidth = overflowAvailableWidth;
        if (shiftData != null && shiftData.enabled.x) {
          availableWidth = maximumClippingWidth;
        }
        if (shiftData != null && shiftData.enabled.y) {
          availableHeight = maximumClippingHeight;
        }
        if (noShift && !alignment) {
          if (isYAxis) {
            availableWidth = width - 2 * max(overflow.left, overflow.right);
          } else {
            availableHeight = height - 2 * max(overflow.top, overflow.bottom);
          }
        }
        await apply({
          ...state,
          availableWidth,
          availableHeight
        });
        const nextDimensions = await platform2.getDimensions(elements.floating);
        if (width !== nextDimensions.width || height !== nextDimensions.height) {
          return {
            reset: {
              rects: true
            }
          };
        }
        return {};
      }
    };
  };

  // ../../node_modules/.pnpm/@floating-ui+utils@0.2.12/node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
  function hasWindow() {
    return typeof window !== "undefined";
  }
  function getNodeName(node) {
    if (isNode(node)) {
      return (node.nodeName || "").toLowerCase();
    }
    return "#document";
  }
  function getWindow(node) {
    var _node$ownerDocument;
    return (node == null || (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
  }
  function getDocumentElement(node) {
    var _ref;
    return (_ref = (isNode(node) ? node.ownerDocument : node.document) || window.document) == null ? void 0 : _ref.documentElement;
  }
  function isNode(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof Node || value instanceof getWindow(value).Node;
  }
  function isElement(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof Element || value instanceof getWindow(value).Element;
  }
  function isHTMLElement(value) {
    if (!hasWindow()) {
      return false;
    }
    return value instanceof HTMLElement || value instanceof getWindow(value).HTMLElement;
  }
  function isShadowRoot(value) {
    if (!hasWindow() || typeof ShadowRoot === "undefined") {
      return false;
    }
    return value instanceof ShadowRoot || value instanceof getWindow(value).ShadowRoot;
  }
  function isOverflowElement(element) {
    const {
      overflow,
      overflowX,
      overflowY,
      display
    } = getComputedStyle2(element);
    return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && display !== "inline" && display !== "contents";
  }
  function isTableElement(element) {
    return /^(table|td|th)$/.test(getNodeName(element));
  }
  function isTopLayer(element) {
    try {
      if (element.matches(":popover-open")) {
        return true;
      }
    } catch (_e4) {
    }
    try {
      return element.matches(":modal");
    } catch (_e4) {
      return false;
    }
  }
  var willChangeRe = /transform|translate|scale|rotate|perspective|filter/;
  var containRe = /paint|layout|strict|content/;
  var isNotNone = (value) => !!value && value !== "none";
  var isWebKitValue;
  function isContainingBlock(elementOrCss) {
    const css = isElement(elementOrCss) ? getComputedStyle2(elementOrCss) : elementOrCss;
    return isNotNone(css.transform) || isNotNone(css.translate) || isNotNone(css.scale) || isNotNone(css.rotate) || isNotNone(css.perspective) || !isWebKit() && (isNotNone(css.backdropFilter) || isNotNone(css.filter)) || willChangeRe.test(css.willChange || "") || containRe.test(css.contain || "");
  }
  function getContainingBlock(element) {
    let currentNode = getParentNode(element);
    while (isHTMLElement(currentNode) && !isLastTraversableNode(currentNode)) {
      if (isContainingBlock(currentNode)) {
        return currentNode;
      } else if (isTopLayer(currentNode)) {
        return null;
      }
      currentNode = getParentNode(currentNode);
    }
    return null;
  }
  function isWebKit() {
    if (isWebKitValue == null) {
      isWebKitValue = typeof CSS !== "undefined" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none");
    }
    return isWebKitValue;
  }
  function isLastTraversableNode(node) {
    return /^(html|body|#document)$/.test(getNodeName(node));
  }
  function getComputedStyle2(element) {
    return getWindow(element).getComputedStyle(element);
  }
  function getNodeScroll(element) {
    if (isElement(element)) {
      return {
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop
      };
    }
    return {
      scrollLeft: element.scrollX,
      scrollTop: element.scrollY
    };
  }
  function getParentNode(node) {
    if (getNodeName(node) === "html") {
      return node;
    }
    const result = (
      // Step into the shadow DOM of the parent of a slotted node.
      node.assignedSlot || // DOM Element detected.
      node.parentNode || // ShadowRoot detected.
      isShadowRoot(node) && node.host || // Fallback.
      getDocumentElement(node)
    );
    return isShadowRoot(result) ? result.host : result;
  }
  function getNearestOverflowAncestor(node) {
    const parentNode = getParentNode(node);
    if (isLastTraversableNode(parentNode)) {
      return (node.ownerDocument || node).body;
    }
    if (isHTMLElement(parentNode) && isOverflowElement(parentNode)) {
      return parentNode;
    }
    return getNearestOverflowAncestor(parentNode);
  }
  function getOverflowAncestors(node, list, traverseIframes) {
    var _node$ownerDocument2;
    if (list === void 0) {
      list = [];
    }
    if (traverseIframes === void 0) {
      traverseIframes = true;
    }
    const scrollableAncestor = getNearestOverflowAncestor(node);
    const isBody = scrollableAncestor === ((_node$ownerDocument2 = node.ownerDocument) == null ? void 0 : _node$ownerDocument2.body);
    const win = getWindow(scrollableAncestor);
    if (isBody) {
      const frameElement = getFrameElement(win);
      return list.concat(win, win.visualViewport || [], isOverflowElement(scrollableAncestor) ? scrollableAncestor : [], frameElement && traverseIframes ? getOverflowAncestors(frameElement) : []);
    } else {
      return list.concat(scrollableAncestor, getOverflowAncestors(scrollableAncestor, [], traverseIframes));
    }
  }
  function getFrameElement(win) {
    return win.parent && Object.getPrototypeOf(win.parent) ? win.frameElement : null;
  }

  // ../../node_modules/.pnpm/@floating-ui+dom@1.8.0/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
  function getCssDimensions(element) {
    const css = getComputedStyle2(element);
    let width = parseFloat(css.width) || 0;
    let height = parseFloat(css.height) || 0;
    const hasOffset = isHTMLElement(element);
    const offsetWidth = hasOffset ? element.offsetWidth : width;
    const offsetHeight = hasOffset ? element.offsetHeight : height;
    const shouldFallback = round(width) !== offsetWidth || round(height) !== offsetHeight;
    if (shouldFallback) {
      width = offsetWidth;
      height = offsetHeight;
    }
    return {
      width,
      height,
      $: shouldFallback
    };
  }
  function unwrapElement(element) {
    return !isElement(element) ? element.contextElement : element;
  }
  function getScale(element) {
    const domElement = unwrapElement(element);
    if (!isHTMLElement(domElement)) {
      return createCoords(1);
    }
    const rect = domElement.getBoundingClientRect();
    const {
      width,
      height,
      $
    } = getCssDimensions(domElement);
    let x = ($ ? round(rect.width) : rect.width) / width;
    let y = ($ ? round(rect.height) : rect.height) / height;
    if (!x || !Number.isFinite(x)) {
      x = 1;
    }
    if (!y || !Number.isFinite(y)) {
      y = 1;
    }
    return {
      x,
      y
    };
  }
  var noOffsets = /* @__PURE__ */ createCoords(0);
  function getVisualOffsets(element) {
    const win = getWindow(element);
    if (!isWebKit() || !win.visualViewport) {
      return noOffsets;
    }
    return {
      x: win.visualViewport.offsetLeft,
      y: win.visualViewport.offsetTop
    };
  }
  function shouldAddVisualOffsets(element, isFixed, floatingOffsetParent) {
    if (isFixed === void 0) {
      isFixed = false;
    }
    return !!floatingOffsetParent && isFixed && floatingOffsetParent === getWindow(element);
  }
  function getBoundingClientRect(element, includeScale, isFixedStrategy, offsetParent) {
    if (includeScale === void 0) {
      includeScale = false;
    }
    if (isFixedStrategy === void 0) {
      isFixedStrategy = false;
    }
    const clientRect = element.getBoundingClientRect();
    const domElement = unwrapElement(element);
    let scale = createCoords(1);
    if (includeScale) {
      if (offsetParent) {
        if (isElement(offsetParent)) {
          scale = getScale(offsetParent);
        }
      } else {
        scale = getScale(element);
      }
    }
    const visualOffsets = shouldAddVisualOffsets(domElement, isFixedStrategy, offsetParent) ? getVisualOffsets(domElement) : createCoords(0);
    let x = (clientRect.left + visualOffsets.x) / scale.x;
    let y = (clientRect.top + visualOffsets.y) / scale.y;
    let width = clientRect.width / scale.x;
    let height = clientRect.height / scale.y;
    if (domElement && offsetParent) {
      const win = getWindow(domElement);
      const offsetWin = isElement(offsetParent) ? getWindow(offsetParent) : offsetParent;
      let currentWin = win;
      let currentIFrame = getFrameElement(currentWin);
      while (currentIFrame && offsetWin !== currentWin) {
        const iframeScale = getScale(currentIFrame);
        const iframeRect = currentIFrame.getBoundingClientRect();
        const css = getComputedStyle2(currentIFrame);
        const left = iframeRect.left + (currentIFrame.clientLeft + parseFloat(css.paddingLeft)) * iframeScale.x;
        const top = iframeRect.top + (currentIFrame.clientTop + parseFloat(css.paddingTop)) * iframeScale.y;
        x *= iframeScale.x;
        y *= iframeScale.y;
        width *= iframeScale.x;
        height *= iframeScale.y;
        x += left;
        y += top;
        currentWin = getWindow(currentIFrame);
        currentIFrame = getFrameElement(currentWin);
      }
    }
    return rectToClientRect({
      width,
      height,
      x,
      y
    });
  }
  function getWindowScrollBarX(element, rect) {
    const leftScroll = getNodeScroll(element).scrollLeft;
    if (!rect) {
      return getBoundingClientRect(getDocumentElement(element)).left + leftScroll;
    }
    return rect.left + leftScroll;
  }
  function getHTMLOffset(documentElement, scroll) {
    const htmlRect = documentElement.getBoundingClientRect();
    const x = htmlRect.left + scroll.scrollLeft - getWindowScrollBarX(documentElement, htmlRect);
    const y = htmlRect.top + scroll.scrollTop;
    return {
      x,
      y
    };
  }
  function convertOffsetParentRelativeRectToViewportRelativeRect(_ref) {
    let {
      elements,
      rect,
      offsetParent,
      strategy
    } = _ref;
    const isFixed = strategy === "fixed";
    const documentElement = getDocumentElement(offsetParent);
    const topLayer = elements ? isTopLayer(elements.floating) : false;
    if (offsetParent === documentElement || topLayer && isFixed) {
      return rect;
    }
    let scroll = {
      scrollLeft: 0,
      scrollTop: 0
    };
    let scale = createCoords(1);
    const offsets = createCoords(0);
    const isOffsetParentAnElement = isHTMLElement(offsetParent);
    if (isOffsetParentAnElement || !isFixed) {
      if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
        scroll = getNodeScroll(offsetParent);
      }
      if (isOffsetParentAnElement) {
        const offsetRect = getBoundingClientRect(offsetParent);
        scale = getScale(offsetParent);
        offsets.x = offsetRect.x + offsetParent.clientLeft;
        offsets.y = offsetRect.y + offsetParent.clientTop;
      }
    }
    const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
    return {
      width: rect.width * scale.x,
      height: rect.height * scale.y,
      x: rect.x * scale.x - scroll.scrollLeft * scale.x + offsets.x + htmlOffset.x,
      y: rect.y * scale.y - scroll.scrollTop * scale.y + offsets.y + htmlOffset.y
    };
  }
  function getClientRects(element) {
    return element.getClientRects ? Array.from(element.getClientRects()) : [];
  }
  function getDocumentRect(html) {
    const scroll = getNodeScroll(html);
    const body = html.ownerDocument.body;
    const width = max(html.scrollWidth, html.clientWidth, body.scrollWidth, body.clientWidth);
    const height = max(html.scrollHeight, html.clientHeight, body.scrollHeight, body.clientHeight);
    let x = -scroll.scrollLeft + getWindowScrollBarX(html);
    const y = -scroll.scrollTop;
    if (getComputedStyle2(body).direction === "rtl") {
      x += max(html.clientWidth, body.clientWidth) - width;
    }
    return {
      width,
      height,
      x,
      y
    };
  }
  var SCROLLBAR_MAX = 25;
  function getViewportRect(element, strategy, rootBoundary) {
    if (rootBoundary === void 0) {
      rootBoundary = "viewport";
    }
    const isLayoutViewport = rootBoundary === "layoutViewport";
    const win = getWindow(element);
    const html = getDocumentElement(element);
    const visualViewport = win.visualViewport;
    let width = html.clientWidth;
    let height = html.clientHeight;
    let x = 0;
    let y = 0;
    if (visualViewport) {
      const layoutRelativeClientCoords = !isWebKit() || strategy === "fixed";
      if (isLayoutViewport) {
        if (!layoutRelativeClientCoords) {
          x = -visualViewport.offsetLeft;
          y = -visualViewport.offsetTop;
        }
      } else {
        width = visualViewport.width;
        height = visualViewport.height;
        if (layoutRelativeClientCoords) {
          x = visualViewport.offsetLeft;
          y = visualViewport.offsetTop;
        }
      }
    }
    const windowScrollbarX = getWindowScrollBarX(html);
    if (windowScrollbarX <= 0) {
      const doc = html.ownerDocument;
      const body = doc.body;
      const bodyStyles = getComputedStyle(body);
      const bodyMarginInline = doc.compatMode === "CSS1Compat" ? parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight) || 0 : 0;
      const reservedWidth = Math.abs(html.clientWidth - body.clientWidth - bodyMarginInline);
      const gutter = getComputedStyle(html).scrollbarGutter === "stable both-edges" ? reservedWidth / 2 : reservedWidth;
      if (gutter <= SCROLLBAR_MAX) {
        width -= gutter;
      }
    }
    return {
      width,
      height,
      x,
      y
    };
  }
  function getInnerBoundingClientRect(element, strategy) {
    const clientRect = getBoundingClientRect(element, true, strategy === "fixed");
    const top = clientRect.top + element.clientTop;
    const left = clientRect.left + element.clientLeft;
    const scale = getScale(element);
    const width = element.clientWidth * scale.x;
    const height = element.clientHeight * scale.y;
    const x = left * scale.x;
    const y = top * scale.y;
    return {
      width,
      height,
      x,
      y
    };
  }
  function getClientRectFromClippingAncestor(element, clippingAncestor, strategy) {
    let rect;
    if (clippingAncestor === "viewport" || clippingAncestor === "layoutViewport") {
      rect = getViewportRect(element, strategy, clippingAncestor);
    } else if (clippingAncestor === "document") {
      rect = getDocumentRect(getDocumentElement(element));
    } else if (isElement(clippingAncestor)) {
      rect = getInnerBoundingClientRect(clippingAncestor, strategy);
    } else {
      const visualOffsets = getVisualOffsets(element);
      rect = {
        x: clippingAncestor.x - visualOffsets.x,
        y: clippingAncestor.y - visualOffsets.y,
        width: clippingAncestor.width,
        height: clippingAncestor.height
      };
    }
    return rectToClientRect(rect);
  }
  function getClippingElementAncestors(element, cache) {
    const cachedResult = cache.get(element);
    if (cachedResult) {
      return cachedResult;
    }
    let result = getOverflowAncestors(element, [], false).filter((el) => isElement(el) && getNodeName(el) !== "body");
    let lastKeptComputedStyle = null;
    const elementIsFixed = getComputedStyle2(element).position === "fixed";
    let currentNode = elementIsFixed ? getParentNode(element) : element;
    while (isElement(currentNode) && !isLastTraversableNode(currentNode)) {
      const computedStyle = getComputedStyle2(currentNode);
      const currentNodeIsContaining = isContainingBlock(currentNode);
      const lastPosition = lastKeptComputedStyle ? lastKeptComputedStyle.position : elementIsFixed ? "fixed" : "";
      const shouldDropCurrentNode = !currentNodeIsContaining && (lastPosition === "fixed" || lastPosition === "absolute" && computedStyle.position === "static");
      if (shouldDropCurrentNode) {
        result = result.filter((ancestor) => ancestor !== currentNode);
      } else {
        lastKeptComputedStyle = computedStyle;
      }
      currentNode = getParentNode(currentNode);
    }
    cache.set(element, result);
    return result;
  }
  function getClippingRect(_ref) {
    let {
      element,
      boundary,
      rootBoundary,
      strategy
    } = _ref;
    const elementClippingAncestors = boundary === "clippingAncestors" ? isTopLayer(element) ? [] : getClippingElementAncestors(element, this._c) : [].concat(boundary);
    const clippingAncestors = [...elementClippingAncestors, rootBoundary];
    const firstRect = getClientRectFromClippingAncestor(element, clippingAncestors[0], strategy);
    let top = firstRect.top;
    let right = firstRect.right;
    let bottom = firstRect.bottom;
    let left = firstRect.left;
    for (let i = 1; i < clippingAncestors.length; i++) {
      const rect = getClientRectFromClippingAncestor(element, clippingAncestors[i], strategy);
      top = max(rect.top, top);
      right = min(rect.right, right);
      bottom = min(rect.bottom, bottom);
      left = max(rect.left, left);
    }
    return {
      width: right - left,
      height: bottom - top,
      x: left,
      y: top
    };
  }
  function getDimensions(element) {
    const {
      width,
      height
    } = getCssDimensions(element);
    return {
      width,
      height
    };
  }
  function getRectRelativeToOffsetParent(element, offsetParent, strategy) {
    const isOffsetParentAnElement = isHTMLElement(offsetParent);
    const documentElement = getDocumentElement(offsetParent);
    const isFixed = strategy === "fixed";
    const rect = getBoundingClientRect(element, true, isFixed, offsetParent);
    let scroll = {
      scrollLeft: 0,
      scrollTop: 0
    };
    const offsets = createCoords(0);
    if (isOffsetParentAnElement || !isFixed) {
      if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
        scroll = getNodeScroll(offsetParent);
      }
      if (isOffsetParentAnElement) {
        const offsetRect = getBoundingClientRect(offsetParent, true, isFixed, offsetParent);
        offsets.x = offsetRect.x + offsetParent.clientLeft;
        offsets.y = offsetRect.y + offsetParent.clientTop;
      }
    }
    if (!isOffsetParentAnElement && documentElement) {
      offsets.x = getWindowScrollBarX(documentElement);
    }
    const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
    const x = rect.left + scroll.scrollLeft - offsets.x - htmlOffset.x;
    const y = rect.top + scroll.scrollTop - offsets.y - htmlOffset.y;
    return {
      x,
      y,
      width: rect.width,
      height: rect.height
    };
  }
  function isStaticPositioned(element) {
    return getComputedStyle2(element).position === "static";
  }
  function getTrueOffsetParent(element, polyfill) {
    if (!isHTMLElement(element) || getComputedStyle2(element).position === "fixed") {
      return null;
    }
    if (polyfill) {
      return polyfill(element);
    }
    let rawOffsetParent = element.offsetParent;
    if (getDocumentElement(element) === rawOffsetParent) {
      rawOffsetParent = rawOffsetParent.ownerDocument.body;
    }
    return rawOffsetParent;
  }
  function getOffsetParent(element, polyfill) {
    const win = getWindow(element);
    if (isTopLayer(element)) {
      return win;
    }
    if (!isHTMLElement(element)) {
      let svgOffsetParent = getParentNode(element);
      while (svgOffsetParent && !isLastTraversableNode(svgOffsetParent)) {
        if (isElement(svgOffsetParent) && !isStaticPositioned(svgOffsetParent)) {
          return svgOffsetParent;
        }
        svgOffsetParent = getParentNode(svgOffsetParent);
      }
      return win;
    }
    let offsetParent = getTrueOffsetParent(element, polyfill);
    while (offsetParent && isTableElement(offsetParent) && isStaticPositioned(offsetParent)) {
      offsetParent = getTrueOffsetParent(offsetParent, polyfill);
    }
    if (offsetParent && isLastTraversableNode(offsetParent) && isStaticPositioned(offsetParent) && !isContainingBlock(offsetParent)) {
      return win;
    }
    return offsetParent || getContainingBlock(element) || win;
  }
  var getElementRects = async function(data) {
    const getOffsetParentFn = this.getOffsetParent || getOffsetParent;
    const getDimensionsFn = this.getDimensions;
    const floatingDimensions = await getDimensionsFn(data.floating);
    return {
      reference: getRectRelativeToOffsetParent(data.reference, await getOffsetParentFn(data.floating), data.strategy),
      floating: {
        x: 0,
        y: 0,
        width: floatingDimensions.width,
        height: floatingDimensions.height
      }
    };
  };
  function isRTL(element) {
    return getComputedStyle2(element).direction === "rtl";
  }
  var platform = {
    convertOffsetParentRelativeRectToViewportRelativeRect,
    getDocumentElement,
    getClippingRect,
    getOffsetParent,
    getElementRects,
    getClientRects,
    getDimensions,
    getScale,
    isElement,
    isRTL
  };
  function rectsAreEqual(a2, b) {
    return a2.x === b.x && a2.y === b.y && a2.width === b.width && a2.height === b.height;
  }
  function observeMove(element, onMove, ancestorResize) {
    let io = null;
    let timeoutId;
    const root = getDocumentElement(element);
    function cleanup() {
      var _io;
      clearTimeout(timeoutId);
      (_io = io) == null || _io.disconnect();
      io = null;
    }
    function refresh(skip, threshold) {
      if (skip === void 0) {
        skip = false;
      }
      if (threshold === void 0) {
        threshold = 1;
      }
      cleanup();
      const elementRectForRootMargin = element.getBoundingClientRect();
      const {
        left,
        top,
        width,
        height
      } = elementRectForRootMargin;
      if (!skip) {
        onMove();
      }
      if (!width || !height) {
        return;
      }
      const insetTop = floor(top);
      const insetRight = floor(root.clientWidth - (left + width));
      const insetBottom = floor(root.clientHeight - (top + height));
      const insetLeft = floor(left);
      const rootMargin = -insetTop + "px " + -insetRight + "px " + -insetBottom + "px " + -insetLeft + "px";
      const options2 = {
        rootMargin,
        threshold: max(0, min(1, threshold)) || 1
      };
      let isFirstUpdate = true;
      function handleObserve(entries) {
        const ratio = entries[0].intersectionRatio;
        if (!rectsAreEqual(elementRectForRootMargin, element.getBoundingClientRect())) {
          return refresh();
        }
        if (ratio !== threshold) {
          if (!isFirstUpdate) {
            return refresh();
          }
          if (!ratio) {
            timeoutId = setTimeout(() => {
              refresh(false, 1e-7);
            }, 1e3);
          } else {
            refresh(false, ratio);
          }
        }
        isFirstUpdate = false;
      }
      try {
        io = new IntersectionObserver(handleObserve, {
          ...options2,
          // Handle <iframe>s
          root: root.ownerDocument
        });
      } catch (_e4) {
        io = new IntersectionObserver(handleObserve, options2);
      }
      io.observe(element);
    }
    const win = getWindow(element);
    const handleResize = () => refresh(ancestorResize);
    win.addEventListener("resize", handleResize);
    refresh(true);
    return () => {
      win.removeEventListener("resize", handleResize);
      cleanup();
    };
  }
  function autoUpdate(reference, floating, update, options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    const {
      ancestorScroll = true,
      ancestorResize = true,
      elementResize = typeof ResizeObserver === "function",
      layoutShift = typeof IntersectionObserver === "function",
      animationFrame = false
    } = options2;
    const referenceEl = unwrapElement(reference);
    const ancestors = ancestorScroll || ancestorResize ? [...referenceEl ? getOverflowAncestors(referenceEl) : [], ...floating ? getOverflowAncestors(floating) : []] : [];
    ancestors.forEach((ancestor) => {
      ancestorScroll && ancestor.addEventListener("scroll", update);
      ancestorResize && ancestor.addEventListener("resize", update);
    });
    const cleanupIo = referenceEl && layoutShift ? observeMove(referenceEl, update, ancestorResize) : null;
    let reobserveFrame = -1;
    let resizeObserver = null;
    if (elementResize) {
      resizeObserver = new ResizeObserver((_ref) => {
        let [firstEntry] = _ref;
        if (firstEntry && firstEntry.target === referenceEl && resizeObserver && floating) {
          resizeObserver.unobserve(floating);
          cancelAnimationFrame(reobserveFrame);
          reobserveFrame = requestAnimationFrame(() => {
            var _resizeObserver;
            (_resizeObserver = resizeObserver) == null || _resizeObserver.observe(floating);
          });
        }
        update();
      });
      if (referenceEl && !animationFrame) {
        resizeObserver.observe(referenceEl);
      }
      if (floating) {
        resizeObserver.observe(floating);
      }
    }
    let frameId;
    let prevRefRect = animationFrame ? getBoundingClientRect(reference) : null;
    if (animationFrame) {
      frameLoop();
    }
    function frameLoop() {
      const nextRefRect = getBoundingClientRect(reference);
      if (prevRefRect && !rectsAreEqual(prevRefRect, nextRefRect)) {
        update();
      }
      prevRefRect = nextRefRect;
      frameId = requestAnimationFrame(frameLoop);
    }
    update();
    return () => {
      var _resizeObserver2;
      ancestors.forEach((ancestor) => {
        ancestorScroll && ancestor.removeEventListener("scroll", update);
        ancestorResize && ancestor.removeEventListener("resize", update);
      });
      cleanupIo == null || cleanupIo();
      (_resizeObserver2 = resizeObserver) == null || _resizeObserver2.disconnect();
      resizeObserver = null;
      if (animationFrame) {
        cancelAnimationFrame(frameId);
      }
    };
  }
  var offset2 = offset;
  var shift2 = shift;
  var flip2 = flip;
  var size2 = size;
  var hide2 = hide;
  var arrow2 = arrow;
  var limitShift2 = limitShift;
  var computePosition2 = (reference, floating, options2) => {
    const cache = /* @__PURE__ */ new Map();
    const mergedOptions = options2 != null ? options2 : {};
    const platformWithCache = {
      ...platform,
      ...mergedOptions.platform,
      _c: cache
    };
    return computePosition(reference, floating, {
      ...mergedOptions,
      platform: platformWithCache
    });
  };

  // ../../node_modules/.pnpm/@floating-ui+react-dom@2.1.9_react-dom@18.3.1_react@18.3.1/node_modules/@floating-ui/react-dom/dist/floating-ui.react-dom.mjs
  var isClient = typeof document !== "undefined";
  var noop = function noop2() {
  };
  var index = isClient ? useLayoutEffect : noop;
  function deepEqual(a2, b) {
    if (a2 === b) {
      return true;
    }
    if (typeof a2 !== typeof b) {
      return false;
    }
    if (typeof a2 === "function" && a2.toString() === b.toString()) {
      return true;
    }
    let length;
    let i;
    let keys;
    if (a2 && b && typeof a2 === "object") {
      if (Array.isArray(a2)) {
        length = a2.length;
        if (length !== b.length) return false;
        for (i = length; i-- !== 0; ) {
          if (!deepEqual(a2[i], b[i])) {
            return false;
          }
        }
        return true;
      }
      keys = Object.keys(a2);
      length = keys.length;
      if (length !== Object.keys(b).length) {
        return false;
      }
      for (i = length; i-- !== 0; ) {
        if (!{}.hasOwnProperty.call(b, keys[i])) {
          return false;
        }
      }
      for (i = length; i-- !== 0; ) {
        const key = keys[i];
        if (key === "_owner" && a2.$$typeof) {
          continue;
        }
        if (!deepEqual(a2[key], b[key])) {
          return false;
        }
      }
      return true;
    }
    return a2 !== a2 && b !== b;
  }
  function getDPR(element) {
    if (typeof window === "undefined") {
      return 1;
    }
    const win = element.ownerDocument.defaultView || window;
    return win.devicePixelRatio || 1;
  }
  function roundByDPR(element, value) {
    const dpr = getDPR(element);
    return Math.round(value * dpr) / dpr;
  }
  function useLatestRef(value) {
    const ref = useRef(value);
    index(() => {
      ref.current = value;
    });
    return ref;
  }
  function useFloating(options2) {
    if (options2 === void 0) {
      options2 = {};
    }
    const {
      placement = "bottom",
      strategy = "absolute",
      middleware = [],
      platform: platform2,
      elements: {
        reference: externalReference,
        floating: externalFloating
      } = {},
      transform = true,
      whileElementsMounted,
      open
    } = options2;
    const [data, setData] = useState({
      x: 0,
      y: 0,
      strategy,
      placement,
      middlewareData: {},
      isPositioned: false
    });
    const [latestMiddleware, setLatestMiddleware] = useState(middleware);
    if (!deepEqual(latestMiddleware, middleware)) {
      setLatestMiddleware(middleware);
    }
    const [_reference, _setReference] = useState(null);
    const [_floating, _setFloating] = useState(null);
    const setReference = useCallback((node) => {
      if (node !== referenceRef.current) {
        referenceRef.current = node;
        _setReference(node);
      }
    }, []);
    const setFloating = useCallback((node) => {
      if (node !== floatingRef.current) {
        floatingRef.current = node;
        _setFloating(node);
      }
    }, []);
    const referenceEl = externalReference || _reference;
    const floatingEl = externalFloating || _floating;
    const referenceRef = useRef(null);
    const floatingRef = useRef(null);
    const dataRef = useRef(data);
    const hasWhileElementsMounted = whileElementsMounted != null;
    const whileElementsMountedRef = useLatestRef(whileElementsMounted);
    const platformRef = useLatestRef(platform2);
    const openRef = useLatestRef(open);
    const update = useCallback(() => {
      if (!referenceRef.current || !floatingRef.current) {
        return;
      }
      const config = {
        placement,
        strategy,
        middleware: latestMiddleware
      };
      if (platformRef.current) {
        config.platform = platformRef.current;
      }
      computePosition2(referenceRef.current, floatingRef.current, config).then((data2) => {
        const fullData = {
          ...data2,
          // The floating element's position may be recomputed while it's closed
          // but still mounted (such as when transitioning out). To ensure
          // `isPositioned` will be `false` initially on the next open, avoid
          // setting it to `true` when `open === false` (must be specified).
          isPositioned: openRef.current !== false
        };
        if (isMountedRef.current && !deepEqual(dataRef.current, fullData)) {
          dataRef.current = fullData;
          flushSync(() => {
            setData(fullData);
          });
        }
      });
    }, [latestMiddleware, placement, strategy, platformRef, openRef]);
    index(() => {
      if (open === false && dataRef.current.isPositioned) {
        dataRef.current.isPositioned = false;
        setData((data2) => ({
          ...data2,
          isPositioned: false
        }));
      }
    }, [open]);
    const isMountedRef = useRef(false);
    index(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
      };
    }, []);
    index(() => {
      if (referenceEl) referenceRef.current = referenceEl;
      if (floatingEl) floatingRef.current = floatingEl;
      if (referenceEl && floatingEl) {
        if (whileElementsMountedRef.current) {
          return whileElementsMountedRef.current(referenceEl, floatingEl, update);
        }
        update();
      }
    }, [referenceEl, floatingEl, update, whileElementsMountedRef, hasWhileElementsMounted]);
    const refs = useMemo(() => ({
      reference: referenceRef,
      floating: floatingRef,
      setReference,
      setFloating
    }), [setReference, setFloating]);
    const elements = useMemo(() => ({
      reference: referenceEl,
      floating: floatingEl
    }), [referenceEl, floatingEl]);
    const floatingStyles = useMemo(() => {
      const initialStyles = {
        position: strategy,
        left: 0,
        top: 0
      };
      if (!elements.floating) {
        return initialStyles;
      }
      const x = roundByDPR(elements.floating, data.x);
      const y = roundByDPR(elements.floating, data.y);
      if (transform) {
        return {
          ...initialStyles,
          transform: "translate(" + x + "px, " + y + "px)",
          ...getDPR(elements.floating) >= 1.5 && {
            willChange: "transform"
          }
        };
      }
      return {
        position: strategy,
        left: x,
        top: y
      };
    }, [strategy, transform, elements.floating, data.x, data.y]);
    return useMemo(() => ({
      ...data,
      update,
      refs,
      elements,
      floatingStyles
    }), [data, update, refs, elements, floatingStyles]);
  }
  var arrow$1 = (options2) => {
    function isRef(value) {
      return {}.hasOwnProperty.call(value, "current");
    }
    return {
      name: "arrow",
      options: options2,
      fn(state) {
        const {
          element,
          padding
        } = typeof options2 === "function" ? options2(state) : options2;
        if (element && isRef(element)) {
          if (element.current != null) {
            return arrow2({
              element: element.current,
              padding
            }).fn(state);
          }
          return {};
        }
        if (element) {
          return arrow2({
            element,
            padding
          }).fn(state);
        }
        return {};
      }
    };
  };
  var offset3 = (options2, deps) => {
    const result = offset2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var shift3 = (options2, deps) => {
    const result = shift2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var limitShift3 = (options2, deps) => {
    const result = limitShift2(options2);
    return {
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var flip3 = (options2, deps) => {
    const result = flip2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var size3 = (options2, deps) => {
    const result = size2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var hide3 = (options2, deps) => {
    const result = hide2(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };
  var arrow3 = (options2, deps) => {
    const result = arrow$1(options2);
    return {
      name: result.name,
      fn: result.fn,
      options: [options2, deps]
    };
  };

  // ../../node_modules/.pnpm/@radix-ui+react-arrow@1.1.15_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-arrow/dist/index.mjs
  var __defProp23 = Object.defineProperty;
  var __name22 = (target, value) => __defProp23(target, "name", { value, configurable: true });
  var Arrow = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name22(function Arrow2(props, forwardedRef) {
      const { children, width = 10, height = 5, ...arrowProps } = props;
      return /* @__PURE__ */ jsx(
        Primitive.svg,
        {
          ...arrowProps,
          ref: forwardedRef,
          width,
          height,
          viewBox: "0 0 30 10",
          preserveAspectRatio: "none",
          children: props.asChild ? children : /* @__PURE__ */ jsx("polygon", { points: "0,0 30,0 15,10" })
        }
      );
    }, "Arrow")
  );
  var Root3 = Arrow;

  // ../../node_modules/.pnpm/@radix-ui+react-popper@1.3.7_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-popper/dist/index.mjs
  var __defProp24 = Object.defineProperty;
  var __name23 = (target, value) => __defProp24(target, "name", { value, configurable: true });
  var POPPER_NAME = "Popper";
  var [createPopperContext, createPopperScope] = createContextScope(POPPER_NAME);
  var [PopperProvider, usePopperContext] = createPopperContext(POPPER_NAME);
  var Popper = /* @__PURE__ */ __name23((props) => {
    const { __scopePopper, children } = props;
    const [anchor, setAnchor] = useState(null);
    const [placementState, setPlacementState] = useState(void 0);
    return /* @__PURE__ */ jsx(
      PopperProvider,
      {
        scope: __scopePopper,
        anchor,
        onAnchorChange: setAnchor,
        placementState,
        setPlacementState,
        children
      }
    );
  }, "Popper");
  var ANCHOR_NAME = "PopperAnchor";
  var PopperAnchor = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name23(function PopperAnchor2(props, forwardedRef) {
      const { __scopePopper, virtualRef, ...anchorProps } = props;
      const context = usePopperContext(ANCHOR_NAME, __scopePopper);
      const ref = useRef(null);
      const onAnchorChange = context.onAnchorChange;
      const callbackRef = useCallback(
        (node) => {
          ref.current = node;
          if (node) {
            onAnchorChange(node);
          }
        },
        [onAnchorChange]
      );
      const composedRefs = useComposedRefs(forwardedRef, callbackRef);
      const anchorRef = useRef(null);
      useEffect(() => {
        if (!virtualRef) {
          return;
        }
        const previousAnchor = anchorRef.current;
        anchorRef.current = virtualRef.current;
        if (previousAnchor !== anchorRef.current) {
          onAnchorChange(anchorRef.current);
        }
      });
      const sideAndAlign = context.placementState && getSideAndAlignFromPlacement(context.placementState);
      const placedSide = sideAndAlign?.[0];
      const placedAlign = sideAndAlign?.[1];
      return virtualRef ? null : /* @__PURE__ */ jsx(
        Primitive.div,
        {
          "data-radix-popper-side": placedSide,
          "data-radix-popper-align": placedAlign,
          ...anchorProps,
          ref: composedRefs
        }
      );
    }, "PopperAnchor")
  );
  var CONTENT_NAME4 = "PopperContent";
  var [PopperContentProvider, useContentContext] = createPopperContext(CONTENT_NAME4);
  var PopperContent = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name23(function PopperContent2(props, forwardedRef) {
      const {
        __scopePopper,
        side = "bottom",
        sideOffset = 0,
        align = "center",
        alignOffset = 0,
        arrowPadding = 0,
        avoidCollisions = true,
        collisionBoundary = [],
        collisionPadding: collisionPaddingProp = 0,
        sticky = "partial",
        hideWhenDetached = false,
        updatePositionStrategy = "optimized",
        onPlaced,
        ...contentProps
      } = props;
      const context = usePopperContext(CONTENT_NAME4, __scopePopper);
      const [content, setContent] = useState(null);
      const composedRefs = useComposedRefs(forwardedRef, setContent);
      const [arrow4, setArrow] = useState(null);
      const arrowSize = useSize(arrow4);
      const arrowWidth = arrowSize?.width ?? 0;
      const arrowHeight = arrowSize?.height ?? 0;
      const desiredPlacement = side + (align !== "center" ? "-" + align : "");
      const collisionPadding = typeof collisionPaddingProp === "number" ? collisionPaddingProp : { top: 0, right: 0, bottom: 0, left: 0, ...collisionPaddingProp };
      const boundary = Array.isArray(collisionBoundary) ? collisionBoundary : [collisionBoundary];
      const hasExplicitBoundaries = boundary.length > 0;
      const detectOverflowOptions = {
        padding: collisionPadding,
        boundary: boundary.filter(isNotNull),
        // with `strategy: 'fixed'`, this is the only way to get it to respect boundaries
        altBoundary: hasExplicitBoundaries
      };
      const { refs, floatingStyles, placement, isPositioned, middlewareData } = useFloating({
        // default to `fixed` strategy so users don't have to pick and we also avoid focus scroll issues
        strategy: "fixed",
        placement: desiredPlacement,
        whileElementsMounted: /* @__PURE__ */ __name23((...args) => {
          const cleanup = autoUpdate(...args, {
            animationFrame: updatePositionStrategy === "always"
          });
          return cleanup;
        }, "whileElementsMounted"),
        elements: {
          reference: context.anchor
        },
        middleware: [
          offset3({ mainAxis: sideOffset + arrowHeight, alignmentAxis: alignOffset }),
          avoidCollisions && shift3({
            mainAxis: true,
            crossAxis: false,
            limiter: sticky === "partial" ? limitShift3() : void 0,
            ...detectOverflowOptions
          }),
          avoidCollisions && flip3({ ...detectOverflowOptions }),
          size3({
            ...detectOverflowOptions,
            apply: /* @__PURE__ */ __name23(({ elements, rects, availableWidth, availableHeight }) => {
              const { width: anchorWidth, height: anchorHeight } = rects.reference;
              const contentStyle = elements.floating.style;
              contentStyle.setProperty("--radix-popper-available-width", `${availableWidth}px`);
              contentStyle.setProperty("--radix-popper-available-height", `${availableHeight}px`);
              contentStyle.setProperty("--radix-popper-anchor-width", `${anchorWidth}px`);
              contentStyle.setProperty("--radix-popper-anchor-height", `${anchorHeight}px`);
            }, "apply")
          }),
          arrow4 && arrow3({ element: arrow4, padding: arrowPadding }),
          transformOrigin({ arrowWidth, arrowHeight }),
          hideWhenDetached && hide3({
            strategy: "referenceHidden",
            ...detectOverflowOptions,
            // `hide` detects whether the anchor (reference) is clipped, so when
            // no explicit `collisionBoundary` is set we fall back to Floating
            // UI's default clipping ancestors (e.g. a scrollable menu). This
            // lets an occluded submenu hide once its anchor scrolls out of view
            // (#3237). The collision/size middlewares deliberately keep the
            // viewport-based default to avoid clamping content rendered inside
            // transformed or overflow-clipping portal containers.
            boundary: hasExplicitBoundaries ? detectOverflowOptions.boundary : void 0
          })
        ]
      });
      const setPlacementState = context.setPlacementState;
      useLayoutEffect2(() => {
        setPlacementState(placement);
        return () => {
          setPlacementState(void 0);
        };
      }, [placement, setPlacementState]);
      const [placedSide, placedAlign] = getSideAndAlignFromPlacement(placement);
      const handlePlaced = useCallbackRef(onPlaced);
      useLayoutEffect2(() => {
        if (isPositioned) {
          handlePlaced?.();
        }
      }, [isPositioned, handlePlaced]);
      const arrowX = middlewareData.arrow?.x;
      const arrowY = middlewareData.arrow?.y;
      const cannotCenterArrow = middlewareData.arrow?.centerOffset !== 0;
      const [contentZIndex, setContentZIndex] = useState();
      useLayoutEffect2(() => {
        if (content) setContentZIndex(window.getComputedStyle(content).zIndex);
      }, [content]);
      return /* @__PURE__ */ jsx(
        "div",
        {
          ref: refs.setFloating,
          "data-radix-popper-content-wrapper": "",
          style: {
            ...floatingStyles,
            transform: isPositioned ? floatingStyles.transform : "translate(0, -200%)",
            // keep off the page when measuring
            minWidth: "max-content",
            zIndex: contentZIndex,
            "--radix-popper-transform-origin": [
              middlewareData.transformOrigin?.x,
              middlewareData.transformOrigin?.y
            ].join(" "),
            // hide the content if using the hide middleware and should be hidden
            // set visibility to hidden and disable pointer events so the UI behaves
            // as if the PopperContent isn't there at all
            ...middlewareData.hide?.referenceHidden && {
              visibility: "hidden",
              pointerEvents: "none"
            }
          },
          dir: props.dir,
          children: /* @__PURE__ */ jsx(
            PopperContentProvider,
            {
              scope: __scopePopper,
              placedSide,
              placedAlign,
              onArrowChange: setArrow,
              arrowX,
              arrowY,
              shouldHideArrow: cannotCenterArrow,
              children: /* @__PURE__ */ jsx(
                Primitive.div,
                {
                  "data-side": placedSide,
                  "data-align": placedAlign,
                  ...contentProps,
                  ref: composedRefs,
                  style: {
                    ...contentProps.style,
                    // if the PopperContent hasn't been placed yet (not all
                    // measurements done) we prevent animations so that users'
                    // animations don't kick in too early from the wrong sides.
                    animation: !isPositioned ? "none" : contentProps.style?.animation
                  }
                }
              )
            }
          )
        }
      );
    }, "PopperContent")
  );
  var ARROW_NAME = "PopperArrow";
  var OPPOSITE_SIDE = {
    top: "bottom",
    right: "left",
    bottom: "top",
    left: "right"
  };
  var PopperArrow = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name23(function PopperArrow2(props, forwardedRef) {
      const { __scopePopper, ...arrowProps } = props;
      const contentContext = useContentContext(ARROW_NAME, __scopePopper);
      const baseSide = OPPOSITE_SIDE[contentContext.placedSide];
      return (
        // we have to use an extra wrapper because `ResizeObserver` (used by `useSize`)
        // doesn't report size as we'd expect on SVG elements.
        // it reports their bounding box which is effectively the largest path inside the SVG.
        /* @__PURE__ */ jsx(
          "span",
          {
            ref: contentContext.onArrowChange,
            style: {
              position: "absolute",
              left: contentContext.arrowX,
              top: contentContext.arrowY,
              [baseSide]: 0,
              transformOrigin: {
                top: "",
                right: "0 0",
                bottom: "center 0",
                left: "100% 0"
              }[contentContext.placedSide],
              transform: {
                top: "translateY(100%)",
                right: "translateY(50%) rotate(90deg) translateX(-50%)",
                bottom: `rotate(180deg)`,
                left: "translateY(50%) rotate(-90deg) translateX(50%)"
              }[contentContext.placedSide],
              visibility: contentContext.shouldHideArrow ? "hidden" : void 0
            },
            children: /* @__PURE__ */ jsx(
              Root3,
              {
                ...arrowProps,
                ref: forwardedRef,
                style: {
                  ...arrowProps.style,
                  // ensures the element can be measured correctly (mostly for if SVG)
                  display: "block"
                }
              }
            )
          }
        )
      );
    }, "PopperArrow")
  );
  function isNotNull(value) {
    return value !== null;
  }
  __name23(isNotNull, "isNotNull");
  var transformOrigin = /* @__PURE__ */ __name23((options2) => ({
    name: "transformOrigin",
    options: options2,
    fn(data) {
      const { placement, rects, middlewareData } = data;
      const cannotCenterArrow = middlewareData.arrow?.centerOffset !== 0;
      const isArrowHidden = cannotCenterArrow;
      const arrowWidth = isArrowHidden ? 0 : options2.arrowWidth;
      const arrowHeight = isArrowHidden ? 0 : options2.arrowHeight;
      const [placedSide, placedAlign] = getSideAndAlignFromPlacement(placement);
      const noArrowAlign = { start: "0%", center: "50%", end: "100%" }[placedAlign];
      const arrowXCenter = (middlewareData.arrow?.x ?? 0) + arrowWidth / 2;
      const arrowYCenter = (middlewareData.arrow?.y ?? 0) + arrowHeight / 2;
      let x = "";
      let y = "";
      if (placedSide === "bottom") {
        x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
        y = `${-arrowHeight}px`;
      } else if (placedSide === "top") {
        x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
        y = `${rects.floating.height + arrowHeight}px`;
      } else if (placedSide === "right") {
        x = `${-arrowHeight}px`;
        y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
      } else if (placedSide === "left") {
        x = `${rects.floating.width + arrowHeight}px`;
        y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
      }
      return { data: { x, y } };
    }
  }), "transformOrigin");
  function getSideAndAlignFromPlacement(placement) {
    const [side, align = "center"] = placement.split("-");
    return [side, align];
  }
  __name23(getSideAndAlignFromPlacement, "getSideAndAlignFromPlacement");
  var Root23 = Popper;
  var Anchor = PopperAnchor;
  var Content3 = PopperContent;
  var Arrow3 = PopperArrow;

  // ../../node_modules/.pnpm/@radix-ui+react-use-is-hydrated@0.1.3_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-is-hydrated/dist/index.mjs
  var __defProp25 = Object.defineProperty;
  var __name24 = (target, value) => __defProp25(target, "name", { value, configurable: true });
  var _isHydrated = false;
  function useIsHydrated() {
    const [isHydrated, setIsHydrated] = useState(_isHydrated);
    useEffect(() => {
      if (!_isHydrated) {
        _isHydrated = true;
        setIsHydrated(true);
      }
    }, []);
    return isHydrated;
  }
  __name24(useIsHydrated, "useIsHydrated");
  var useReactSyncExternalStore = react_shim_exports[" useSyncExternalStore ".trim().toString()];
  function subscribe() {
    return () => {
    };
  }
  __name24(subscribe, "subscribe");
  function useIsHydratedModern() {
    return useReactSyncExternalStore(
      subscribe,
      () => true,
      () => false
    );
  }
  __name24(useIsHydratedModern, "useIsHydratedModern");
  var useIsHydrated2 = typeof useReactSyncExternalStore === "function" ? useIsHydratedModern : useIsHydrated;

  // ../../node_modules/.pnpm/@radix-ui+react-roving-focus@1.1.19_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-roving-focus/dist/index.mjs
  var __defProp26 = Object.defineProperty;
  var __name25 = (target, value) => __defProp26(target, "name", { value, configurable: true });
  var ENTRY_FOCUS = "rovingFocusGroup.onEntryFocus";
  var EVENT_OPTIONS2 = { bubbles: false, cancelable: true };
  var GROUP_NAME = "RovingFocusGroup";
  var [Collection, useCollection, createCollectionScope] = createCollection(GROUP_NAME);
  var [createRovingFocusGroupContext, createRovingFocusGroupScope] = createContextScope(
    GROUP_NAME,
    [createCollectionScope]
  );
  var [RovingFocusProvider, useRovingFocusContext] = createRovingFocusGroupContext(GROUP_NAME);
  var RovingFocusGroup = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name25(function RovingFocusGroup2(props, forwardedRef) {
      return /* @__PURE__ */ jsx(Collection.Provider, { scope: props.__scopeRovingFocusGroup, children: /* @__PURE__ */ jsx(Collection.Slot, { scope: props.__scopeRovingFocusGroup, children: /* @__PURE__ */ jsx(RovingFocusGroupImpl, { ...props, ref: forwardedRef }) }) });
    }, "RovingFocusGroup")
  );
  var RovingFocusGroupImpl = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name25(function RovingFocusGroupImpl2(props, forwardedRef) {
    const {
      __scopeRovingFocusGroup,
      orientation,
      loop = false,
      dir,
      currentTabStopId: currentTabStopIdProp,
      defaultCurrentTabStopId,
      onCurrentTabStopIdChange,
      onEntryFocus,
      preventScrollOnEntryFocus = false,
      ...groupProps
    } = props;
    const ref = useRef(null);
    const composedRefs = useComposedRefs(forwardedRef, ref);
    const direction = useDirection(dir);
    const [currentTabStopId, setCurrentTabStopId] = useControllableState({
      prop: currentTabStopIdProp,
      defaultProp: defaultCurrentTabStopId ?? null,
      onChange: onCurrentTabStopIdChange,
      caller: GROUP_NAME
    });
    const [isTabbingBackOut, setIsTabbingBackOut] = useState(false);
    const handleEntryFocus = useCallbackRef(onEntryFocus);
    const getItems = useCollection(__scopeRovingFocusGroup);
    const isClickFocusRef = useRef(false);
    const [focusableItemsCount, setFocusableItemsCount] = useState(0);
    useEffect(() => {
      const node = ref.current;
      if (node) {
        node.addEventListener(ENTRY_FOCUS, handleEntryFocus);
        return () => node.removeEventListener(ENTRY_FOCUS, handleEntryFocus);
      }
    }, [handleEntryFocus]);
    return /* @__PURE__ */ jsx(
      RovingFocusProvider,
      {
        scope: __scopeRovingFocusGroup,
        orientation,
        dir: direction,
        loop,
        currentTabStopId,
        onItemFocus: useCallback(
          (tabStopId) => setCurrentTabStopId(tabStopId),
          [setCurrentTabStopId]
        ),
        onItemShiftTab: useCallback(() => setIsTabbingBackOut(true), []),
        onFocusableItemAdd: useCallback(
          () => setFocusableItemsCount((prevCount) => prevCount + 1),
          []
        ),
        onFocusableItemRemove: useCallback(
          () => setFocusableItemsCount((prevCount) => prevCount - 1),
          []
        ),
        children: /* @__PURE__ */ jsx(
          Primitive.div,
          {
            tabIndex: isTabbingBackOut || focusableItemsCount === 0 ? -1 : 0,
            "data-orientation": orientation,
            ...groupProps,
            ref: composedRefs,
            style: { outline: "none", ...props.style },
            onMouseDown: composeEventHandlers(props.onMouseDown, () => {
              isClickFocusRef.current = true;
            }),
            onFocus: composeEventHandlers(props.onFocus, (event) => {
              const isKeyboardFocus = !isClickFocusRef.current;
              if (event.target === event.currentTarget && isKeyboardFocus && !isTabbingBackOut) {
                const entryFocusEvent = new CustomEvent(ENTRY_FOCUS, EVENT_OPTIONS2);
                event.currentTarget.dispatchEvent(entryFocusEvent);
                if (!entryFocusEvent.defaultPrevented) {
                  const items = getItems().filter((item) => item.focusable);
                  const activeItem = items.find((item) => item.active);
                  const currentItem = items.find((item) => item.id === currentTabStopId);
                  const candidateItems = [activeItem, currentItem, ...items].filter(
                    Boolean
                  );
                  const candidateNodes = candidateItems.map((item) => item.ref.current);
                  focusFirst2(candidateNodes, preventScrollOnEntryFocus);
                }
              }
              isClickFocusRef.current = false;
            }),
            onBlur: composeEventHandlers(props.onBlur, () => setIsTabbingBackOut(false))
          }
        )
      }
    );
  }, "RovingFocusGroupImpl"));
  var ITEM_NAME = "RovingFocusGroupItem";
  var RovingFocusGroupItem = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name25(function RovingFocusGroupItem2(props, forwardedRef) {
      const {
        __scopeRovingFocusGroup,
        focusable = true,
        active = false,
        tabStopId,
        children,
        ...itemProps
      } = props;
      const autoId = useId2();
      const id = tabStopId || autoId;
      const context = useRovingFocusContext(ITEM_NAME, __scopeRovingFocusGroup);
      const isCurrentTabStop = context.currentTabStopId === id;
      const getItems = useCollection(__scopeRovingFocusGroup);
      const { onFocusableItemAdd, onFocusableItemRemove, currentTabStopId } = context;
      const isHydrated = useIsHydrated2();
      useLayoutEffect2(() => {
        if (!isHydrated || !focusable) {
          return;
        }
        onFocusableItemAdd();
        return () => onFocusableItemRemove();
      }, [isHydrated, focusable, onFocusableItemAdd, onFocusableItemRemove]);
      useEffect(() => {
        if (isHydrated || !focusable) {
          return;
        }
        onFocusableItemAdd();
        return () => onFocusableItemRemove();
      }, [isHydrated, focusable, onFocusableItemAdd, onFocusableItemRemove]);
      return /* @__PURE__ */ jsx(
        Collection.ItemSlot,
        {
          scope: __scopeRovingFocusGroup,
          id,
          focusable,
          active,
          children: /* @__PURE__ */ jsx(
            Primitive.span,
            {
              tabIndex: isCurrentTabStop ? 0 : -1,
              "data-orientation": context.orientation,
              ...itemProps,
              ref: forwardedRef,
              onMouseDown: composeEventHandlers(props.onMouseDown, (event) => {
                if (!focusable) event.preventDefault();
                else context.onItemFocus(id);
              }),
              onFocus: composeEventHandlers(props.onFocus, () => context.onItemFocus(id)),
              onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
                if (event.key === "Tab" && event.shiftKey) {
                  context.onItemShiftTab();
                  return;
                }
                if (event.target !== event.currentTarget) return;
                const focusIntent = getFocusIntent(event, context.orientation, context.dir);
                if (focusIntent !== void 0) {
                  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                  event.preventDefault();
                  const items = getItems().filter((item) => item.focusable);
                  let candidateNodes = items.map((item) => item.ref.current);
                  if (focusIntent === "last") candidateNodes.reverse();
                  else if (focusIntent === "prev" || focusIntent === "next") {
                    if (focusIntent === "prev") candidateNodes.reverse();
                    const currentIndex = candidateNodes.indexOf(event.currentTarget);
                    candidateNodes = context.loop ? wrapArray(candidateNodes, currentIndex + 1) : candidateNodes.slice(currentIndex + 1);
                  }
                  setTimeout(() => focusFirst2(candidateNodes));
                }
              }),
              children: typeof children === "function" ? children({ isCurrentTabStop, hasTabStop: currentTabStopId != null }) : children
            }
          )
        }
      );
    }, "RovingFocusGroupItem")
  );
  var MAP_KEY_TO_FOCUS_INTENT = {
    ArrowLeft: "prev",
    ArrowUp: "prev",
    ArrowRight: "next",
    ArrowDown: "next",
    PageUp: "first",
    Home: "first",
    PageDown: "last",
    End: "last"
  };
  function getDirectionAwareKey(key, dir) {
    if (dir !== "rtl") return key;
    return key === "ArrowLeft" ? "ArrowRight" : key === "ArrowRight" ? "ArrowLeft" : key;
  }
  __name25(getDirectionAwareKey, "getDirectionAwareKey");
  function getFocusIntent(event, orientation, dir) {
    const key = getDirectionAwareKey(event.key, dir);
    if (orientation === "vertical" && ["ArrowLeft", "ArrowRight"].includes(key)) return void 0;
    if (orientation === "horizontal" && ["ArrowUp", "ArrowDown"].includes(key)) return void 0;
    return MAP_KEY_TO_FOCUS_INTENT[key];
  }
  __name25(getFocusIntent, "getFocusIntent");
  function focusFirst2(candidates, preventScroll = false) {
    const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
    for (const candidate of candidates) {
      if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
      candidate.focus({ preventScroll });
      if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
    }
  }
  __name25(focusFirst2, "focusFirst");
  function wrapArray(array, startIndex) {
    return array.map((_, index2) => array[(startIndex + index2) % array.length]);
  }
  __name25(wrapArray, "wrapArray");
  var Root4 = RovingFocusGroup;
  var Item = RovingFocusGroupItem;

  // ../../node_modules/.pnpm/@radix-ui+react-menu@2.1.24_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-menu/dist/index.mjs
  var __defProp27 = Object.defineProperty;
  var __name26 = (target, value) => __defProp27(target, "name", { value, configurable: true });
  var SELECTION_KEYS = ["Enter", " "];
  var FIRST_KEYS = ["ArrowDown", "PageUp", "Home"];
  var LAST_KEYS = ["ArrowUp", "PageDown", "End"];
  var FIRST_LAST_KEYS = [...FIRST_KEYS, ...LAST_KEYS];
  var SUB_OPEN_KEYS = {
    ltr: [...SELECTION_KEYS, "ArrowRight"],
    rtl: [...SELECTION_KEYS, "ArrowLeft"]
  };
  var SUB_CLOSE_KEYS = {
    ltr: ["ArrowLeft"],
    rtl: ["ArrowRight"]
  };
  var MENU_NAME = "Menu";
  var [Collection2, useCollection2, createCollectionScope2] = createCollection(MENU_NAME);
  var [createMenuContext, createMenuScope] = createContextScope(MENU_NAME, [
    createCollectionScope2,
    createPopperScope,
    createRovingFocusGroupScope
  ]);
  var usePopperScope = createPopperScope();
  var useRovingFocusGroupScope = createRovingFocusGroupScope();
  var [MenuProvider, useMenuContext] = createMenuContext(MENU_NAME);
  var [MenuRootProvider, useMenuRootContext] = createMenuContext(MENU_NAME);
  var Menu = /* @__PURE__ */ __name26((props) => {
    const { __scopeMenu, open = false, children, dir, onOpenChange, modal = true } = props;
    const popperScope = usePopperScope(__scopeMenu);
    const [content, setContent] = useState(null);
    const isUsingKeyboardRef = useRef(false);
    const handleOpenChange = useCallbackRef(onOpenChange);
    const direction = useDirection(dir);
    useEffect(() => {
      const handleKeyDown = /* @__PURE__ */ __name26(() => {
        isUsingKeyboardRef.current = true;
        document.addEventListener("pointerdown", handlePointer, { capture: true, once: true });
        document.addEventListener("pointermove", handlePointer, { capture: true, once: true });
      }, "handleKeyDown");
      const handlePointer = /* @__PURE__ */ __name26(() => isUsingKeyboardRef.current = false, "handlePointer");
      document.addEventListener("keydown", handleKeyDown, { capture: true });
      return () => {
        document.removeEventListener("keydown", handleKeyDown, { capture: true });
        document.removeEventListener("pointerdown", handlePointer, { capture: true });
        document.removeEventListener("pointermove", handlePointer, { capture: true });
      };
    }, []);
    useEffect(() => {
      if (!open) {
        return;
      }
      const handleBlur = /* @__PURE__ */ __name26(() => handleOpenChange(false), "handleBlur");
      window.addEventListener("blur", handleBlur);
      return () => window.removeEventListener("blur", handleBlur);
    }, [open, handleOpenChange]);
    return /* @__PURE__ */ jsx(Root23, { ...popperScope, children: /* @__PURE__ */ jsx(
      MenuProvider,
      {
        scope: __scopeMenu,
        open,
        onOpenChange: handleOpenChange,
        content,
        onContentChange: setContent,
        children: /* @__PURE__ */ jsx(
          MenuRootProvider,
          {
            scope: __scopeMenu,
            onClose: useCallback(() => handleOpenChange(false), [handleOpenChange]),
            isUsingKeyboardRef,
            dir: direction,
            modal,
            children
          }
        )
      }
    ) });
  }, "Menu");
  var MenuAnchor = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name26(function MenuAnchor2(props, forwardedRef) {
      const { __scopeMenu, ...anchorProps } = props;
      const popperScope = usePopperScope(__scopeMenu);
      return /* @__PURE__ */ jsx(Anchor, { ...popperScope, ...anchorProps, ref: forwardedRef });
    }, "MenuAnchor")
  );
  var PORTAL_NAME2 = "MenuPortal";
  var [PortalProvider2, usePortalContext2] = createMenuContext(PORTAL_NAME2, {
    forceMount: void 0
  });
  var MenuPortal = /* @__PURE__ */ __name26((props) => {
    const { __scopeMenu, forceMount, children, container } = props;
    const context = useMenuContext(PORTAL_NAME2, __scopeMenu);
    return /* @__PURE__ */ jsx(PortalProvider2, { scope: __scopeMenu, forceMount, children: /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Portal, { asChild: true, container, children }) }) });
  }, "MenuPortal");
  var CONTENT_NAME5 = "MenuContent";
  var [MenuContentProvider, useMenuContentContext] = createMenuContext(CONTENT_NAME5);
  var MenuContent = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name26(function MenuContent2(props, forwardedRef) {
      const portalContext = usePortalContext2(CONTENT_NAME5, props.__scopeMenu);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = useMenuContext(CONTENT_NAME5, props.__scopeMenu);
      const rootContext = useMenuRootContext(CONTENT_NAME5, props.__scopeMenu);
      return /* @__PURE__ */ jsx(Collection2.Provider, { scope: props.__scopeMenu, children: /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Collection2.Slot, { scope: props.__scopeMenu, children: rootContext.modal ? /* @__PURE__ */ jsx(MenuRootContentModal, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(MenuRootContentNonModal, { ...contentProps, ref: forwardedRef }) }) }) });
    }, "MenuContent")
  );
  var MenuRootContentModal = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name26(function MenuRootContentModal2(props, forwardedRef) {
      const context = useMenuContext(CONTENT_NAME5, props.__scopeMenu);
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      useEffect(() => {
        const content = ref.current;
        if (content) return hideOthers(content);
      }, []);
      return /* @__PURE__ */ jsx(
        MenuContentImpl,
        {
          ...props,
          ref: composedRefs,
          trapFocus: context.open,
          disableOutsidePointerEvents: context.open,
          disableOutsideScroll: true,
          onFocusOutside: composeEventHandlers(
            props.onFocusOutside,
            (event) => event.preventDefault(),
            { checkForDefaultPrevented: false }
          ),
          onDismiss: () => context.onOpenChange(false)
        }
      );
    }, "MenuRootContentModal")
  );
  var MenuRootContentNonModal = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name26(function MenuRootContentNonModal2(props, forwardedRef) {
    const context = useMenuContext(CONTENT_NAME5, props.__scopeMenu);
    return /* @__PURE__ */ jsx(
      MenuContentImpl,
      {
        ...props,
        ref: forwardedRef,
        trapFocus: false,
        disableOutsidePointerEvents: false,
        disableOutsideScroll: false,
        onDismiss: () => context.onOpenChange(false)
      }
    );
  }, "MenuRootContentNonModal"));
  var Slot3 = createSlot("MenuContent.ScrollLock");
  var MenuContentImpl = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name26(function MenuContentImpl2(props, forwardedRef) {
      const {
        __scopeMenu,
        loop = false,
        trapFocus,
        onOpenAutoFocus,
        onCloseAutoFocus,
        disableOutsidePointerEvents,
        onEntryFocus,
        onEscapeKeyDown,
        onPointerDownOutside,
        onFocusOutside,
        onInteractOutside,
        onDismiss,
        disableOutsideScroll,
        ...contentProps
      } = props;
      const context = useMenuContext(CONTENT_NAME5, __scopeMenu);
      const rootContext = useMenuRootContext(CONTENT_NAME5, __scopeMenu);
      const popperScope = usePopperScope(__scopeMenu);
      const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeMenu);
      const getItems = useCollection2(__scopeMenu);
      const [currentItemId, setCurrentItemId] = useState(null);
      const contentRef = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, contentRef, context.onContentChange);
      const timerRef = useRef(0);
      const searchRef = useRef("");
      const pointerGraceTimerRef = useRef(0);
      const pointerGraceIntentRef = useRef(null);
      const pointerDirRef = useRef("right");
      const lastPointerXRef = useRef(0);
      const ScrollLockWrapper = disableOutsideScroll ? Combination_default : Fragment;
      const scrollLockWrapperProps = disableOutsideScroll ? { as: Slot3, allowPinchZoom: true } : void 0;
      const handleTypeaheadSearch = /* @__PURE__ */ __name26((key) => {
        const search = searchRef.current + key;
        const items = getItems().filter((item) => !item.disabled);
        const currentItem = document.activeElement;
        const currentMatch = items.find((item) => item.ref.current === currentItem)?.textValue;
        const values = items.map((item) => item.textValue);
        const nextMatch = getNextMatch(values, search, currentMatch);
        const newItem = items.find((item) => item.textValue === nextMatch)?.ref.current;
        (/* @__PURE__ */ __name26((function updateSearch(value) {
          searchRef.current = value;
          window.clearTimeout(timerRef.current);
          if (value !== "") timerRef.current = window.setTimeout(() => updateSearch(""), 1e3);
        }), "updateSearch"))(search);
        if (newItem) {
          setTimeout(() => newItem.focus());
        }
      }, "handleTypeaheadSearch");
      useEffect(() => {
        return () => window.clearTimeout(timerRef.current);
      }, []);
      useFocusGuards();
      const isPointerMovingToSubmenu = useCallback((event) => {
        const isMovingTowards = pointerDirRef.current === pointerGraceIntentRef.current?.side;
        return isMovingTowards && isPointerInGraceArea(event, pointerGraceIntentRef.current?.area);
      }, []);
      return /* @__PURE__ */ jsx(
        MenuContentProvider,
        {
          scope: __scopeMenu,
          searchRef,
          onItemEnter: useCallback(
            (event) => {
              if (isPointerMovingToSubmenu(event)) event.preventDefault();
            },
            [isPointerMovingToSubmenu]
          ),
          onItemLeave: useCallback(
            (event) => {
              if (isPointerMovingToSubmenu(event)) return;
              contentRef.current?.focus();
              setCurrentItemId(null);
            },
            [isPointerMovingToSubmenu]
          ),
          onTriggerLeave: useCallback(
            (event) => {
              if (isPointerMovingToSubmenu(event)) event.preventDefault();
            },
            [isPointerMovingToSubmenu]
          ),
          pointerGraceTimerRef,
          onPointerGraceIntentChange: useCallback((intent) => {
            pointerGraceIntentRef.current = intent;
          }, []),
          children: /* @__PURE__ */ jsx(ScrollLockWrapper, { ...scrollLockWrapperProps, children: /* @__PURE__ */ jsx(
            FocusScope,
            {
              asChild: true,
              trapped: trapFocus,
              onMountAutoFocus: composeEventHandlers(onOpenAutoFocus, (event) => {
                event.preventDefault();
                contentRef.current?.focus({ preventScroll: true });
              }),
              onUnmountAutoFocus: onCloseAutoFocus,
              children: /* @__PURE__ */ jsx(
                DismissableLayer,
                {
                  asChild: true,
                  disableOutsidePointerEvents,
                  onEscapeKeyDown,
                  onPointerDownOutside,
                  onFocusOutside,
                  onInteractOutside,
                  onDismiss,
                  children: /* @__PURE__ */ jsx(
                    Root4,
                    {
                      asChild: true,
                      ...rovingFocusGroupScope,
                      dir: rootContext.dir,
                      orientation: "vertical",
                      loop,
                      currentTabStopId: currentItemId,
                      onCurrentTabStopIdChange: setCurrentItemId,
                      onEntryFocus: composeEventHandlers(onEntryFocus, (event) => {
                        if (!rootContext.isUsingKeyboardRef.current) event.preventDefault();
                      }),
                      preventScrollOnEntryFocus: true,
                      children: /* @__PURE__ */ jsx(
                        Content3,
                        {
                          role: "menu",
                          "aria-orientation": "vertical",
                          "data-state": getOpenState(context.open),
                          "data-radix-menu-content": "",
                          dir: rootContext.dir,
                          ...popperScope,
                          ...contentProps,
                          ref: composedRefs,
                          style: { outline: "none", ...contentProps.style },
                          onKeyDown: composeEventHandlers(contentProps.onKeyDown, (event) => {
                            const target = event.target;
                            const isKeyDownInside = target.closest("[data-radix-menu-content]") === event.currentTarget;
                            const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
                            const isCharacterKey = event.key.length === 1;
                            if (isKeyDownInside) {
                              if (event.key === "Tab") event.preventDefault();
                              if (!isModifierKey && isCharacterKey) handleTypeaheadSearch(event.key);
                            }
                            const content = contentRef.current;
                            if (event.target !== content) return;
                            if (!FIRST_LAST_KEYS.includes(event.key)) return;
                            event.preventDefault();
                            const items = getItems().filter((item) => !item.disabled);
                            const candidateNodes = items.map((item) => item.ref.current);
                            if (LAST_KEYS.includes(event.key)) candidateNodes.reverse();
                            focusFirst3(candidateNodes);
                          }),
                          onBlur: composeEventHandlers(props.onBlur, (event) => {
                            if (!event.currentTarget.contains(event.target)) {
                              window.clearTimeout(timerRef.current);
                              searchRef.current = "";
                            }
                          }),
                          onPointerMove: composeEventHandlers(
                            props.onPointerMove,
                            whenMouse((event) => {
                              const target = event.target;
                              const pointerXHasChanged = lastPointerXRef.current !== event.clientX;
                              if (event.currentTarget.contains(target) && pointerXHasChanged) {
                                const newDir = event.clientX > lastPointerXRef.current ? "right" : "left";
                                pointerDirRef.current = newDir;
                                lastPointerXRef.current = event.clientX;
                              }
                            })
                          )
                        }
                      )
                    }
                  )
                }
              )
            }
          ) })
        }
      );
    }, "MenuContentImpl")
  );
  var MenuGroup = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name26(function MenuGroup2(props, forwardedRef) {
      const { __scopeMenu, ...groupProps } = props;
      return /* @__PURE__ */ jsx(Primitive.div, { role: "group", ...groupProps, ref: forwardedRef });
    }, "MenuGroup")
  );
  var MenuLabel = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name26(function MenuLabel2(props, forwardedRef) {
      const { __scopeMenu, ...labelProps } = props;
      return /* @__PURE__ */ jsx(Primitive.div, { ...labelProps, ref: forwardedRef });
    }, "MenuLabel")
  );
  var ITEM_NAME2 = "MenuItem";
  var ITEM_SELECT = "menu.itemSelect";
  var MenuItem = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name26(function MenuItem2(props, forwardedRef) {
      const { disabled = false, onSelect, ...itemProps } = props;
      const ref = useRef(null);
      const rootContext = useMenuRootContext(ITEM_NAME2, props.__scopeMenu);
      const contentContext = useMenuContentContext(ITEM_NAME2, props.__scopeMenu);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      const isPointerDownRef = useRef(false);
      const handleSelect = /* @__PURE__ */ __name26(() => {
        const menuItem = ref.current;
        if (!disabled && menuItem) {
          const itemSelectEvent = new CustomEvent(ITEM_SELECT, { bubbles: true, cancelable: true });
          menuItem.addEventListener(ITEM_SELECT, (event) => onSelect?.(event), { once: true });
          dispatchDiscreteCustomEvent(menuItem, itemSelectEvent);
          if (itemSelectEvent.defaultPrevented) {
            isPointerDownRef.current = false;
          } else {
            rootContext.onClose();
          }
        }
      }, "handleSelect");
      return /* @__PURE__ */ jsx(
        MenuItemImpl,
        {
          ...itemProps,
          ref: composedRefs,
          disabled,
          onClick: composeEventHandlers(props.onClick, handleSelect),
          onPointerDown: (event) => {
            props.onPointerDown?.(event);
            isPointerDownRef.current = true;
          },
          onPointerUp: composeEventHandlers(props.onPointerUp, (event) => {
            if (!isPointerDownRef.current) event.currentTarget?.click();
          }),
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            if (disabled || event.target !== event.currentTarget) {
              return;
            }
            const isTypingAhead = contentContext.searchRef.current !== "";
            if (isTypingAhead && event.key === " ") {
              return;
            }
            if (SELECTION_KEYS.includes(event.key)) {
              event.currentTarget.click();
              event.preventDefault();
            }
          })
        }
      );
    }, "MenuItem")
  );
  var MenuItemImpl = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name26(function MenuItemImpl2(props, forwardedRef) {
      const { __scopeMenu, disabled = false, textValue, ...itemProps } = props;
      const contentContext = useMenuContentContext(ITEM_NAME2, __scopeMenu);
      const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeMenu);
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      const [isFocused, setIsFocused] = useState(false);
      const [textContent, setTextContent] = useState("");
      useEffect(() => {
        const menuItem = ref.current;
        if (menuItem) {
          setTextContent((menuItem.textContent ?? "").trim());
        }
      }, [itemProps.children]);
      return /* @__PURE__ */ jsx(
        Collection2.ItemSlot,
        {
          scope: __scopeMenu,
          disabled,
          textValue: textValue ?? textContent,
          children: /* @__PURE__ */ jsx(Item, { asChild: true, ...rovingFocusGroupScope, focusable: !disabled, children: /* @__PURE__ */ jsx(
            Primitive.div,
            {
              role: "menuitem",
              "data-highlighted": isFocused ? "" : void 0,
              "aria-disabled": disabled || void 0,
              "data-disabled": disabled ? "" : void 0,
              ...itemProps,
              ref: composedRefs,
              onPointerMove: composeEventHandlers(
                props.onPointerMove,
                whenMouse((event) => {
                  if (disabled) {
                    contentContext.onItemLeave(event);
                  } else {
                    contentContext.onItemEnter(event);
                    if (!event.defaultPrevented) {
                      const item = event.currentTarget;
                      item.focus({ preventScroll: true });
                    }
                  }
                })
              ),
              onPointerLeave: composeEventHandlers(
                props.onPointerLeave,
                whenMouse((event) => contentContext.onItemLeave(event))
              ),
              onFocus: composeEventHandlers(props.onFocus, () => setIsFocused(true)),
              onBlur: composeEventHandlers(props.onBlur, () => setIsFocused(false))
            }
          ) })
        }
      );
    }, "MenuItemImpl")
  );
  var MenuCheckboxItem = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name26(function MenuCheckboxItem2(props, forwardedRef) {
      const { checked = false, onCheckedChange, ...checkboxItemProps } = props;
      return /* @__PURE__ */ jsx(ItemIndicatorProvider, { scope: props.__scopeMenu, checked, children: /* @__PURE__ */ jsx(
        MenuItem,
        {
          role: "menuitemcheckbox",
          "aria-checked": isIndeterminate(checked) ? "mixed" : checked,
          ...checkboxItemProps,
          ref: forwardedRef,
          "data-state": getCheckedState(checked),
          onSelect: composeEventHandlers(
            checkboxItemProps.onSelect,
            () => onCheckedChange?.(isIndeterminate(checked) ? true : !checked),
            { checkForDefaultPrevented: false }
          )
        }
      ) });
    }, "MenuCheckboxItem")
  );
  var RADIO_GROUP_NAME = "MenuRadioGroup";
  var [RadioGroupProvider, useRadioGroupContext] = createMenuContext(
    RADIO_GROUP_NAME,
    { value: void 0, onValueChange: /* @__PURE__ */ __name26(() => {
    }, "onValueChange") }
  );
  var MenuRadioGroup = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name26(function MenuRadioGroup2(props, forwardedRef) {
      const { value, onValueChange, ...groupProps } = props;
      const handleValueChange = useCallbackRef(onValueChange);
      return /* @__PURE__ */ jsx(RadioGroupProvider, { scope: props.__scopeMenu, value, onValueChange: handleValueChange, children: /* @__PURE__ */ jsx(MenuGroup, { ...groupProps, ref: forwardedRef }) });
    }, "MenuRadioGroup")
  );
  var RADIO_ITEM_NAME = "MenuRadioItem";
  var MenuRadioItem = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name26(function MenuRadioItem2(props, forwardedRef) {
      const { value, ...radioItemProps } = props;
      const context = useRadioGroupContext(RADIO_ITEM_NAME, props.__scopeMenu);
      const checked = value === context.value;
      return /* @__PURE__ */ jsx(ItemIndicatorProvider, { scope: props.__scopeMenu, checked, children: /* @__PURE__ */ jsx(
        MenuItem,
        {
          role: "menuitemradio",
          "aria-checked": checked,
          ...radioItemProps,
          ref: forwardedRef,
          "data-state": getCheckedState(checked),
          onSelect: composeEventHandlers(
            radioItemProps.onSelect,
            () => context.onValueChange?.(value),
            { checkForDefaultPrevented: false }
          )
        }
      ) });
    }, "MenuRadioItem")
  );
  var ITEM_INDICATOR_NAME = "MenuItemIndicator";
  var [ItemIndicatorProvider, useItemIndicatorContext] = createMenuContext(
    ITEM_INDICATOR_NAME,
    { checked: false }
  );
  var MenuItemIndicator = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name26(function MenuItemIndicator2(props, forwardedRef) {
      const { __scopeMenu, forceMount, ...itemIndicatorProps } = props;
      const indicatorContext = useItemIndicatorContext(ITEM_INDICATOR_NAME, __scopeMenu);
      return /* @__PURE__ */ jsx(
        Presence,
        {
          present: forceMount || isIndeterminate(indicatorContext.checked) || indicatorContext.checked === true,
          children: /* @__PURE__ */ jsx(
            Primitive.span,
            {
              ...itemIndicatorProps,
              ref: forwardedRef,
              "data-state": getCheckedState(indicatorContext.checked)
            }
          )
        }
      );
    }, "MenuItemIndicator")
  );
  var MenuSeparator = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name26(function MenuSeparator2(props, forwardedRef) {
      const { __scopeMenu, ...separatorProps } = props;
      return /* @__PURE__ */ jsx(
        Primitive.div,
        {
          role: "separator",
          "aria-orientation": "horizontal",
          ...separatorProps,
          ref: forwardedRef
        }
      );
    }, "MenuSeparator")
  );
  var MenuArrow = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name26(function MenuArrow2(props, forwardedRef) {
      const { __scopeMenu, ...arrowProps } = props;
      const popperScope = usePopperScope(__scopeMenu);
      return /* @__PURE__ */ jsx(Arrow3, { ...popperScope, ...arrowProps, ref: forwardedRef });
    }, "MenuArrow")
  );
  var SUB_NAME = "MenuSub";
  var [MenuSubProvider, useMenuSubContext] = createMenuContext(SUB_NAME);
  var MenuSub = /* @__PURE__ */ __name26((props) => {
    const { __scopeMenu, children, open = false, onOpenChange } = props;
    const parentMenuContext = useMenuContext(SUB_NAME, __scopeMenu);
    const popperScope = usePopperScope(__scopeMenu);
    const [trigger, setTrigger] = useState(null);
    const [content, setContent] = useState(null);
    const handleOpenChange = useCallbackRef(onOpenChange);
    useEffect(() => {
      if (parentMenuContext.open === false) handleOpenChange(false);
      return () => handleOpenChange(false);
    }, [parentMenuContext.open, handleOpenChange]);
    return /* @__PURE__ */ jsx(Root23, { ...popperScope, children: /* @__PURE__ */ jsx(
      MenuProvider,
      {
        scope: __scopeMenu,
        open,
        onOpenChange: handleOpenChange,
        content,
        onContentChange: setContent,
        children: /* @__PURE__ */ jsx(
          MenuSubProvider,
          {
            scope: __scopeMenu,
            contentId: useId2(),
            triggerId: useId2(),
            trigger,
            onTriggerChange: setTrigger,
            children
          }
        )
      }
    ) });
  }, "MenuSub");
  var SUB_TRIGGER_NAME = "MenuSubTrigger";
  var MenuSubTrigger = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name26(function MenuSubTrigger2(props, forwardedRef) {
      const context = useMenuContext(SUB_TRIGGER_NAME, props.__scopeMenu);
      const rootContext = useMenuRootContext(SUB_TRIGGER_NAME, props.__scopeMenu);
      const subContext = useMenuSubContext(SUB_TRIGGER_NAME, props.__scopeMenu);
      const contentContext = useMenuContentContext(SUB_TRIGGER_NAME, props.__scopeMenu);
      const openTimerRef = useRef(null);
      const { pointerGraceTimerRef, onPointerGraceIntentChange } = contentContext;
      const scope = { __scopeMenu: props.__scopeMenu };
      const clearOpenTimer = useCallback(() => {
        if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }, []);
      useEffect(() => clearOpenTimer, [clearOpenTimer]);
      useEffect(() => {
        const pointerGraceTimer = pointerGraceTimerRef.current;
        return () => {
          window.clearTimeout(pointerGraceTimer);
          onPointerGraceIntentChange(null);
        };
      }, [pointerGraceTimerRef, onPointerGraceIntentChange]);
      const composedRefs = useComposedRefs(forwardedRef, subContext.onTriggerChange);
      return /* @__PURE__ */ jsx(MenuAnchor, { asChild: true, ...scope, children: /* @__PURE__ */ jsx(
        MenuItemImpl,
        {
          id: subContext.triggerId,
          "aria-haspopup": "menu",
          "aria-expanded": context.open,
          "aria-controls": context.open ? subContext.contentId : void 0,
          "data-state": getOpenState(context.open),
          ...props,
          ref: composedRefs,
          onClick: (event) => {
            props.onClick?.(event);
            if (props.disabled || event.defaultPrevented) return;
            event.currentTarget.focus();
            if (!context.open) context.onOpenChange(true);
          },
          onPointerMove: composeEventHandlers(
            props.onPointerMove,
            whenMouse((event) => {
              contentContext.onItemEnter(event);
              if (event.defaultPrevented) return;
              if (!props.disabled && !context.open && !openTimerRef.current) {
                contentContext.onPointerGraceIntentChange(null);
                openTimerRef.current = window.setTimeout(() => {
                  context.onOpenChange(true);
                  clearOpenTimer();
                }, 100);
              }
            })
          ),
          onPointerLeave: composeEventHandlers(
            props.onPointerLeave,
            whenMouse((event) => {
              clearOpenTimer();
              const contentRect = context.content?.getBoundingClientRect();
              if (contentRect) {
                const side = context.content?.dataset.side;
                const rightSide = side === "right";
                const bleed = rightSide ? -5 : 5;
                const contentNearEdge = contentRect[rightSide ? "left" : "right"];
                const contentFarEdge = contentRect[rightSide ? "right" : "left"];
                contentContext.onPointerGraceIntentChange({
                  area: [
                    // Apply a bleed on clientX to ensure that our exit point is
                    // consistently within polygon bounds
                    { x: event.clientX + bleed, y: event.clientY },
                    { x: contentNearEdge, y: contentRect.top },
                    { x: contentFarEdge, y: contentRect.top },
                    { x: contentFarEdge, y: contentRect.bottom },
                    { x: contentNearEdge, y: contentRect.bottom }
                  ],
                  side
                });
                window.clearTimeout(pointerGraceTimerRef.current);
                pointerGraceTimerRef.current = window.setTimeout(
                  () => contentContext.onPointerGraceIntentChange(null),
                  300
                );
              } else {
                contentContext.onTriggerLeave(event);
                if (event.defaultPrevented) return;
                contentContext.onPointerGraceIntentChange(null);
              }
            })
          ),
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            if (props.disabled || event.target !== event.currentTarget) {
              return;
            }
            const isTypingAhead = contentContext.searchRef.current !== "";
            if (isTypingAhead && event.key === " ") {
              return;
            }
            if (SUB_OPEN_KEYS[rootContext.dir].includes(event.key)) {
              context.onOpenChange(true);
              context.content?.focus();
              event.preventDefault();
            }
          })
        }
      ) });
    }, "MenuSubTrigger")
  );
  var SUB_CONTENT_NAME = "MenuSubContent";
  var MenuSubContent = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name26(function MenuSubContent2(props, forwardedRef) {
      const portalContext = usePortalContext2(CONTENT_NAME5, props.__scopeMenu);
      const { forceMount = portalContext.forceMount, align = "start", ...subContentProps } = props;
      const context = useMenuContext(CONTENT_NAME5, props.__scopeMenu);
      const rootContext = useMenuRootContext(CONTENT_NAME5, props.__scopeMenu);
      const subContext = useMenuSubContext(SUB_CONTENT_NAME, props.__scopeMenu);
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      return /* @__PURE__ */ jsx(Collection2.Provider, { scope: props.__scopeMenu, children: /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Collection2.Slot, { scope: props.__scopeMenu, children: /* @__PURE__ */ jsx(
        MenuContentImpl,
        {
          id: subContext.contentId,
          "aria-labelledby": subContext.triggerId,
          ...subContentProps,
          ref: composedRefs,
          align,
          side: rootContext.dir === "rtl" ? "left" : "right",
          disableOutsidePointerEvents: false,
          disableOutsideScroll: false,
          trapFocus: false,
          onOpenAutoFocus: (event) => {
            if (rootContext.isUsingKeyboardRef.current) ref.current?.focus();
            event.preventDefault();
          },
          onCloseAutoFocus: (event) => event.preventDefault(),
          onFocusOutside: composeEventHandlers(props.onFocusOutside, (event) => {
            if (event.target !== subContext.trigger) context.onOpenChange(false);
          }),
          onEscapeKeyDown: composeEventHandlers(props.onEscapeKeyDown, (event) => {
            rootContext.onClose();
            event.preventDefault();
          }),
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            const isKeyDownInside = event.currentTarget.contains(event.target);
            const isCloseKey = SUB_CLOSE_KEYS[rootContext.dir].includes(event.key);
            if (isKeyDownInside && isCloseKey) {
              context.onOpenChange(false);
              subContext.trigger?.focus();
              event.preventDefault();
            }
          })
        }
      ) }) }) });
    }, "MenuSubContent")
  );
  function getOpenState(open) {
    return open ? "open" : "closed";
  }
  __name26(getOpenState, "getOpenState");
  function isIndeterminate(checked) {
    return checked === "indeterminate";
  }
  __name26(isIndeterminate, "isIndeterminate");
  function getCheckedState(checked) {
    return isIndeterminate(checked) ? "indeterminate" : checked ? "checked" : "unchecked";
  }
  __name26(getCheckedState, "getCheckedState");
  function focusFirst3(candidates) {
    const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
    for (const candidate of candidates) {
      if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
      candidate.focus();
      if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
    }
  }
  __name26(focusFirst3, "focusFirst");
  function wrapArray2(array, startIndex) {
    return array.map((_, index2) => array[(startIndex + index2) % array.length]);
  }
  __name26(wrapArray2, "wrapArray");
  function getNextMatch(values, search, currentMatch) {
    const isRepeated = search.length > 1 && Array.from(search).every((char) => char === search[0]);
    const normalizedSearch = isRepeated ? search[0] : search;
    const currentMatchIndex = currentMatch ? values.indexOf(currentMatch) : -1;
    let wrappedValues = wrapArray2(values, Math.max(currentMatchIndex, 0));
    const excludeCurrentMatch = normalizedSearch.length === 1;
    if (excludeCurrentMatch) wrappedValues = wrappedValues.filter((v) => v !== currentMatch);
    const nextMatch = wrappedValues.find(
      (value) => value.toLowerCase().startsWith(normalizedSearch.toLowerCase())
    );
    return nextMatch !== currentMatch ? nextMatch : void 0;
  }
  __name26(getNextMatch, "getNextMatch");
  function isPointInPolygon(point, polygon) {
    const { x, y } = point;
    let inside = false;
    for (let i = 0, j2 = polygon.length - 1; i < polygon.length; j2 = i++) {
      const ii = polygon[i];
      const jj = polygon[j2];
      const xi = ii.x;
      const yi = ii.y;
      const xj = jj.x;
      const yj = jj.y;
      const intersect = yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }
  __name26(isPointInPolygon, "isPointInPolygon");
  function isPointerInGraceArea(event, area) {
    if (!area) return false;
    const cursorPos = { x: event.clientX, y: event.clientY };
    return isPointInPolygon(cursorPos, area);
  }
  __name26(isPointerInGraceArea, "isPointerInGraceArea");
  function whenMouse(handler) {
    return (event) => event.pointerType === "mouse" ? handler(event) : void 0;
  }
  __name26(whenMouse, "whenMouse");
  var Root32 = Menu;
  var Anchor2 = MenuAnchor;
  var Portal3 = MenuPortal;
  var Content22 = MenuContent;
  var Group = MenuGroup;
  var Label = MenuLabel;
  var Item2 = MenuItem;
  var CheckboxItem = MenuCheckboxItem;
  var RadioGroup = MenuRadioGroup;
  var RadioItem = MenuRadioItem;
  var ItemIndicator = MenuItemIndicator;
  var Separator = MenuSeparator;
  var Arrow22 = MenuArrow;
  var Sub = MenuSub;
  var SubTrigger = MenuSubTrigger;
  var SubContent = MenuSubContent;

  // ../../node_modules/.pnpm/@radix-ui+react-dropdown-menu@2.1.24_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-dropdown-menu/dist/index.mjs
  var dist_exports8 = {};
  __export(dist_exports8, {
    Arrow: () => Arrow23,
    CheckboxItem: () => CheckboxItem2,
    Content: () => Content23,
    DropdownMenu: () => DropdownMenu,
    DropdownMenuArrow: () => DropdownMenuArrow,
    DropdownMenuCheckboxItem: () => DropdownMenuCheckboxItem,
    DropdownMenuContent: () => DropdownMenuContent,
    DropdownMenuGroup: () => DropdownMenuGroup,
    DropdownMenuItem: () => DropdownMenuItem,
    DropdownMenuItemIndicator: () => DropdownMenuItemIndicator,
    DropdownMenuLabel: () => DropdownMenuLabel,
    DropdownMenuPortal: () => DropdownMenuPortal,
    DropdownMenuRadioGroup: () => DropdownMenuRadioGroup,
    DropdownMenuRadioItem: () => DropdownMenuRadioItem,
    DropdownMenuSeparator: () => DropdownMenuSeparator,
    DropdownMenuSub: () => DropdownMenuSub,
    DropdownMenuSubContent: () => DropdownMenuSubContent,
    DropdownMenuSubTrigger: () => DropdownMenuSubTrigger,
    DropdownMenuTrigger: () => DropdownMenuTrigger,
    Group: () => Group2,
    Item: () => Item22,
    ItemIndicator: () => ItemIndicator2,
    Label: () => Label2,
    Portal: () => Portal23,
    RadioGroup: () => RadioGroup2,
    RadioItem: () => RadioItem2,
    Root: () => Root24,
    Separator: () => Separator2,
    Sub: () => Sub2,
    SubContent: () => SubContent2,
    SubTrigger: () => SubTrigger2,
    Trigger: () => Trigger3,
    createDropdownMenuScope: () => createDropdownMenuScope
  });
  var __defProp28 = Object.defineProperty;
  var __name27 = (target, value) => __defProp28(target, "name", { value, configurable: true });
  var DROPDOWN_MENU_NAME = "DropdownMenu";
  var [createDropdownMenuContext, createDropdownMenuScope] = createContextScope(
    DROPDOWN_MENU_NAME,
    [createMenuScope]
  );
  var useMenuScope = createMenuScope();
  var [DropdownMenuProvider, useDropdownMenuContext] = createDropdownMenuContext(DROPDOWN_MENU_NAME);
  var DropdownMenu = /* @__PURE__ */ __name27((props) => {
    const {
      __scopeDropdownMenu,
      children,
      dir,
      open: openProp,
      defaultOpen,
      onOpenChange,
      modal = true
    } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    const triggerRef = useRef(null);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: DROPDOWN_MENU_NAME
    });
    return /* @__PURE__ */ jsx(
      DropdownMenuProvider,
      {
        scope: __scopeDropdownMenu,
        triggerId: useId2(),
        triggerRef,
        contentId: useId2(),
        open,
        onOpenChange: setOpen,
        onOpenToggle: useCallback(() => setOpen((prevOpen) => !prevOpen), [setOpen]),
        modal,
        children: /* @__PURE__ */ jsx(Root32, { ...menuScope, open, onOpenChange: setOpen, dir, modal, children })
      }
    );
  }, "DropdownMenu");
  var TRIGGER_NAME3 = "DropdownMenuTrigger";
  var DropdownMenuTrigger = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name27(function DropdownMenuTrigger2(props, forwardedRef) {
      const { __scopeDropdownMenu, disabled = false, ...triggerProps } = props;
      const context = useDropdownMenuContext(TRIGGER_NAME3, __scopeDropdownMenu);
      const menuScope = useMenuScope(__scopeDropdownMenu);
      const composedRefs = useComposedRefs(forwardedRef, context.triggerRef);
      return /* @__PURE__ */ jsx(Anchor2, { asChild: true, ...menuScope, children: /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          id: context.triggerId,
          "aria-haspopup": "menu",
          "aria-expanded": context.open,
          "aria-controls": context.open ? context.contentId : void 0,
          "data-state": context.open ? "open" : "closed",
          "data-disabled": disabled ? "" : void 0,
          disabled,
          ...triggerProps,
          ref: composedRefs,
          onPointerDown: composeEventHandlers(props.onPointerDown, (event) => {
            if (!disabled && event.button === 0 && event.ctrlKey === false) {
              context.onOpenToggle();
              if (!context.open) event.preventDefault();
            }
          }),
          onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
            if (disabled) return;
            if (["Enter", " "].includes(event.key)) context.onOpenToggle();
            if (event.key === "ArrowDown") context.onOpenChange(true);
            if (["Enter", " ", "ArrowDown"].includes(event.key)) event.preventDefault();
          })
        }
      ) });
    }, "DropdownMenuTrigger")
  );
  var DropdownMenuPortal = /* @__PURE__ */ __name27((props) => {
    const { __scopeDropdownMenu, ...portalProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(Portal3, { ...menuScope, ...portalProps });
  }, "DropdownMenuPortal");
  var CONTENT_NAME6 = "DropdownMenuContent";
  var DropdownMenuContent = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name27(function DropdownMenuContent2(props, forwardedRef) {
      const { __scopeDropdownMenu, ...contentProps } = props;
      const context = useDropdownMenuContext(CONTENT_NAME6, __scopeDropdownMenu);
      const menuScope = useMenuScope(__scopeDropdownMenu);
      const hasInteractedOutsideRef = useRef(false);
      return /* @__PURE__ */ jsx(
        Content22,
        {
          id: context.contentId,
          "aria-labelledby": context.triggerId,
          ...menuScope,
          ...contentProps,
          ref: forwardedRef,
          onCloseAutoFocus: composeEventHandlers(props.onCloseAutoFocus, (event) => {
            if (!hasInteractedOutsideRef.current) context.triggerRef.current?.focus();
            hasInteractedOutsideRef.current = false;
            event.preventDefault();
          }),
          onInteractOutside: composeEventHandlers(props.onInteractOutside, (event) => {
            const originalEvent = event.detail.originalEvent;
            const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
            const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
            if (!context.modal || isRightClick) hasInteractedOutsideRef.current = true;
          }),
          style: {
            ...props.style,
            // re-namespace exposed content custom properties
            ...{
              "--radix-dropdown-menu-content-transform-origin": "var(--radix-popper-transform-origin)",
              "--radix-dropdown-menu-content-available-width": "var(--radix-popper-available-width)",
              "--radix-dropdown-menu-content-available-height": "var(--radix-popper-available-height)",
              "--radix-dropdown-menu-trigger-width": "var(--radix-popper-anchor-width)",
              "--radix-dropdown-menu-trigger-height": "var(--radix-popper-anchor-height)"
            }
          }
        }
      );
    }, "DropdownMenuContent")
  );
  var DropdownMenuGroup = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name27(function DropdownMenuGroup2(props, forwardedRef) {
      const { __scopeDropdownMenu, ...groupProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Group, { ...menuScope, ...groupProps, ref: forwardedRef });
    }, "DropdownMenuGroup")
  );
  var DropdownMenuLabel = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name27(function DropdownMenuLabel2(props, forwardedRef) {
      const { __scopeDropdownMenu, ...labelProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Label, { ...menuScope, ...labelProps, ref: forwardedRef });
    }, "DropdownMenuLabel")
  );
  var DropdownMenuItem = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name27(function DropdownMenuItem2(props, forwardedRef) {
      const { __scopeDropdownMenu, ...itemProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Item2, { ...menuScope, ...itemProps, ref: forwardedRef });
    }, "DropdownMenuItem")
  );
  var DropdownMenuCheckboxItem = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name27(function DropdownMenuCheckboxItem2(props, forwardedRef) {
    const { __scopeDropdownMenu, ...checkboxItemProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(CheckboxItem, { ...menuScope, ...checkboxItemProps, ref: forwardedRef });
  }, "DropdownMenuCheckboxItem"));
  var DropdownMenuRadioGroup = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name27(function DropdownMenuRadioGroup2(props, forwardedRef) {
    const { __scopeDropdownMenu, ...radioGroupProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(RadioGroup, { ...menuScope, ...radioGroupProps, ref: forwardedRef });
  }, "DropdownMenuRadioGroup"));
  var DropdownMenuRadioItem = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name27(function DropdownMenuRadioItem2(props, forwardedRef) {
    const { __scopeDropdownMenu, ...radioItemProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(RadioItem, { ...menuScope, ...radioItemProps, ref: forwardedRef });
  }, "DropdownMenuRadioItem"));
  var DropdownMenuItemIndicator = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name27(function DropdownMenuItemIndicator2(props, forwardedRef) {
    const { __scopeDropdownMenu, ...itemIndicatorProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(ItemIndicator, { ...menuScope, ...itemIndicatorProps, ref: forwardedRef });
  }, "DropdownMenuItemIndicator"));
  var DropdownMenuSeparator = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name27(function DropdownMenuSeparator2(props, forwardedRef) {
    const { __scopeDropdownMenu, ...separatorProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(Separator, { ...menuScope, ...separatorProps, ref: forwardedRef });
  }, "DropdownMenuSeparator"));
  var DropdownMenuArrow = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name27(function DropdownMenuArrow2(props, forwardedRef) {
      const { __scopeDropdownMenu, ...arrowProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Arrow22, { ...menuScope, ...arrowProps, ref: forwardedRef });
    }, "DropdownMenuArrow")
  );
  var DropdownMenuSub = /* @__PURE__ */ __name27((props) => {
    const { __scopeDropdownMenu, children, open: openProp, onOpenChange, defaultOpen } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: "DropdownMenuSub"
    });
    return /* @__PURE__ */ jsx(Sub, { ...menuScope, open, onOpenChange: setOpen, children });
  }, "DropdownMenuSub");
  var DropdownMenuSubTrigger = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name27(function DropdownMenuSubTrigger2(props, forwardedRef) {
    const { __scopeDropdownMenu, ...subTriggerProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(SubTrigger, { ...menuScope, ...subTriggerProps, ref: forwardedRef });
  }, "DropdownMenuSubTrigger"));
  var DropdownMenuSubContent = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name27(function DropdownMenuSubContent2(props, forwardedRef) {
    const { __scopeDropdownMenu, ...subContentProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(
      SubContent,
      {
        ...menuScope,
        ...subContentProps,
        ref: forwardedRef,
        style: {
          ...props.style,
          // re-namespace exposed content custom properties
          ...{
            "--radix-dropdown-menu-content-transform-origin": "var(--radix-popper-transform-origin)",
            "--radix-dropdown-menu-content-available-width": "var(--radix-popper-available-width)",
            "--radix-dropdown-menu-content-available-height": "var(--radix-popper-available-height)",
            "--radix-dropdown-menu-trigger-width": "var(--radix-popper-anchor-width)",
            "--radix-dropdown-menu-trigger-height": "var(--radix-popper-anchor-height)"
          }
        }
      }
    );
  }, "DropdownMenuSubContent"));
  var Root24 = DropdownMenu;
  var Trigger3 = DropdownMenuTrigger;
  var Portal23 = DropdownMenuPortal;
  var Content23 = DropdownMenuContent;
  var Group2 = DropdownMenuGroup;
  var Label2 = DropdownMenuLabel;
  var Item22 = DropdownMenuItem;
  var CheckboxItem2 = DropdownMenuCheckboxItem;
  var RadioGroup2 = DropdownMenuRadioGroup;
  var RadioItem2 = DropdownMenuRadioItem;
  var ItemIndicator2 = DropdownMenuItemIndicator;
  var Separator2 = DropdownMenuSeparator;
  var Arrow23 = DropdownMenuArrow;
  var Sub2 = DropdownMenuSub;
  var SubTrigger2 = DropdownMenuSubTrigger;
  var SubContent2 = DropdownMenuSubContent;

  // ../../node_modules/.pnpm/@radix-ui+react-use-previous@1.1.4_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-use-previous/dist/index.mjs
  var __defProp29 = Object.defineProperty;
  var __name28 = (target, value) => __defProp29(target, "name", { value, configurable: true });
  function usePrevious(value) {
    const ref = useRef({ value, previous: value });
    return useMemo(() => {
      if (ref.current.value !== value) {
        ref.current.previous = ref.current.value;
        ref.current.value = value;
      }
      return ref.current.previous;
    }, [value]);
  }
  __name28(usePrevious, "usePrevious");

  // ../../node_modules/.pnpm/@radix-ui+number@1.1.3/node_modules/@radix-ui/number/dist/index.mjs
  var __defProp30 = Object.defineProperty;
  var __name29 = (target, value) => __defProp30(target, "name", { value, configurable: true });
  function clamp2(value, [min2, max2]) {
    return Math.min(max2, Math.max(min2, value));
  }
  __name29(clamp2, "clamp");

  // ../../node_modules/.pnpm/@radix-ui+react-popover@1.1.23_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-popover/dist/index.mjs
  var dist_exports10 = {};
  __export(dist_exports10, {
    Anchor: () => Anchor22,
    Arrow: () => Arrow24,
    Close: () => Close,
    Content: () => Content24,
    Popover: () => Popover,
    PopoverAnchor: () => PopoverAnchor,
    PopoverArrow: () => PopoverArrow,
    PopoverClose: () => PopoverClose,
    PopoverContent: () => PopoverContent,
    PopoverPortal: () => PopoverPortal,
    PopoverTrigger: () => PopoverTrigger,
    Portal: () => Portal4,
    Root: () => Root25,
    Trigger: () => Trigger4,
    createPopoverScope: () => createPopoverScope
  });
  var __defProp31 = Object.defineProperty;
  var __name30 = (target, value) => __defProp31(target, "name", { value, configurable: true });
  var POPOVER_NAME = "Popover";
  var [createPopoverContext, createPopoverScope] = createContextScope(POPOVER_NAME, [
    createPopperScope
  ]);
  var usePopperScope2 = createPopperScope();
  var [PopoverProvider, usePopoverContext] = createPopoverContext(POPOVER_NAME);
  var Popover = /* @__PURE__ */ __name30((props) => {
    const {
      __scopePopover,
      children,
      open: openProp,
      defaultOpen,
      onOpenChange,
      modal = false
    } = props;
    const popperScope = usePopperScope2(__scopePopover);
    const triggerRef = useRef(null);
    const [hasCustomAnchor, setHasCustomAnchor] = useState(false);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: POPOVER_NAME
    });
    return /* @__PURE__ */ jsx(Root23, { ...popperScope, children: /* @__PURE__ */ jsx(
      PopoverProvider,
      {
        scope: __scopePopover,
        contentId: useId2(),
        triggerRef,
        open,
        onOpenChange: setOpen,
        onOpenToggle: useCallback(() => setOpen((prevOpen) => !prevOpen), [setOpen]),
        hasCustomAnchor,
        onCustomAnchorAdd: useCallback(() => setHasCustomAnchor(true), []),
        onCustomAnchorRemove: useCallback(() => setHasCustomAnchor(false), []),
        modal,
        children
      }
    ) });
  }, "Popover");
  var ANCHOR_NAME2 = "PopoverAnchor";
  var PopoverAnchor = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name30(function PopoverAnchor2(props, forwardedRef) {
      const { __scopePopover, ...anchorProps } = props;
      const context = usePopoverContext(ANCHOR_NAME2, __scopePopover);
      const popperScope = usePopperScope2(__scopePopover);
      const { onCustomAnchorAdd, onCustomAnchorRemove } = context;
      useEffect(() => {
        onCustomAnchorAdd();
        return () => onCustomAnchorRemove();
      }, [onCustomAnchorAdd, onCustomAnchorRemove]);
      return /* @__PURE__ */ jsx(Anchor, { ...popperScope, ...anchorProps, ref: forwardedRef });
    }, "PopoverAnchor")
  );
  var TRIGGER_NAME4 = "PopoverTrigger";
  var PopoverTrigger = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name30(function PopoverTrigger2(props, forwardedRef) {
      const { __scopePopover, ...triggerProps } = props;
      const context = usePopoverContext(TRIGGER_NAME4, __scopePopover);
      const popperScope = usePopperScope2(__scopePopover);
      const composedTriggerRef = useComposedRefs(forwardedRef, context.triggerRef);
      const trigger = /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          "aria-haspopup": "dialog",
          "aria-expanded": context.open,
          "aria-controls": context.open ? context.contentId : void 0,
          "data-state": getState3(context.open),
          ...triggerProps,
          ref: composedTriggerRef,
          onClick: composeEventHandlers(props.onClick, context.onOpenToggle)
        }
      );
      return context.hasCustomAnchor ? trigger : /* @__PURE__ */ jsx(Anchor, { asChild: true, ...popperScope, children: trigger });
    }, "PopoverTrigger")
  );
  var PORTAL_NAME3 = "PopoverPortal";
  var [PortalProvider3, usePortalContext3] = createPopoverContext(PORTAL_NAME3, {
    forceMount: void 0
  });
  var PopoverPortal = /* @__PURE__ */ __name30((props) => {
    const { __scopePopover, forceMount, children, container } = props;
    const context = usePopoverContext(PORTAL_NAME3, __scopePopover);
    return /* @__PURE__ */ jsx(PortalProvider3, { scope: __scopePopover, forceMount, children: /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Portal, { asChild: true, container, children }) }) });
  }, "PopoverPortal");
  var CONTENT_NAME7 = "PopoverContent";
  var PopoverContent = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name30(function PopoverContent2(props, forwardedRef) {
      const portalContext = usePortalContext3(CONTENT_NAME7, props.__scopePopover);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = usePopoverContext(CONTENT_NAME7, props.__scopePopover);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: context.modal ? /* @__PURE__ */ jsx(PopoverContentModal, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(PopoverContentNonModal, { ...contentProps, ref: forwardedRef }) });
    }, "PopoverContent")
  );
  var Slot4 = createSlot("PopoverContent.RemoveScroll");
  var PopoverContentModal = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name30(function PopoverContentModal2(props, forwardedRef) {
      const context = usePopoverContext(CONTENT_NAME7, props.__scopePopover);
      const contentRef = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, contentRef);
      const isRightClickOutsideRef = useRef(false);
      useEffect(() => {
        const content = contentRef.current;
        if (content) return hideOthers(content);
      }, []);
      return /* @__PURE__ */ jsx(Combination_default, { as: Slot4, allowPinchZoom: true, children: /* @__PURE__ */ jsx(
        PopoverContentImpl,
        {
          ...props,
          ref: composedRefs,
          trapFocus: context.open,
          disableOutsidePointerEvents: true,
          onCloseAutoFocus: composeEventHandlers(props.onCloseAutoFocus, (event) => {
            event.preventDefault();
            if (!isRightClickOutsideRef.current) context.triggerRef.current?.focus();
          }),
          onPointerDownOutside: composeEventHandlers(
            props.onPointerDownOutside,
            (event) => {
              const originalEvent = event.detail.originalEvent;
              const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
              const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
              isRightClickOutsideRef.current = isRightClick;
            },
            { checkForDefaultPrevented: false }
          ),
          onFocusOutside: composeEventHandlers(
            props.onFocusOutside,
            (event) => event.preventDefault(),
            { checkForDefaultPrevented: false }
          )
        }
      ) });
    }, "PopoverContentModal")
  );
  var PopoverContentNonModal = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name30(function PopoverContentNonModal2(props, forwardedRef) {
      const context = usePopoverContext(CONTENT_NAME7, props.__scopePopover);
      const hasInteractedOutsideRef = useRef(false);
      const hasPointerDownOutsideRef = useRef(false);
      return /* @__PURE__ */ jsx(
        PopoverContentImpl,
        {
          ...props,
          ref: forwardedRef,
          trapFocus: false,
          disableOutsidePointerEvents: false,
          onCloseAutoFocus: (event) => {
            props.onCloseAutoFocus?.(event);
            if (!event.defaultPrevented) {
              if (!hasInteractedOutsideRef.current) context.triggerRef.current?.focus();
              event.preventDefault();
            }
            hasInteractedOutsideRef.current = false;
            hasPointerDownOutsideRef.current = false;
          },
          onInteractOutside: (event) => {
            props.onInteractOutside?.(event);
            if (!event.defaultPrevented) {
              hasInteractedOutsideRef.current = true;
              if (event.detail.originalEvent.type === "pointerdown") {
                hasPointerDownOutsideRef.current = true;
              }
            }
            const target = event.target;
            const targetIsTrigger = context.triggerRef.current?.contains(target);
            if (targetIsTrigger) event.preventDefault();
            if (event.detail.originalEvent.type === "focusin" && hasPointerDownOutsideRef.current) {
              event.preventDefault();
            }
          }
        }
      );
    }, "PopoverContentNonModal")
  );
  var PopoverContentImpl = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name30(function PopoverContentImpl2(props, forwardedRef) {
      const {
        __scopePopover,
        trapFocus,
        onOpenAutoFocus,
        onCloseAutoFocus,
        disableOutsidePointerEvents,
        onEscapeKeyDown,
        onPointerDownOutside,
        onFocusOutside,
        onInteractOutside,
        ...contentProps
      } = props;
      const context = usePopoverContext(CONTENT_NAME7, __scopePopover);
      const popperScope = usePopperScope2(__scopePopover);
      useFocusGuards();
      return /* @__PURE__ */ jsx(
        FocusScope,
        {
          asChild: true,
          loop: true,
          trapped: trapFocus,
          onMountAutoFocus: onOpenAutoFocus,
          onUnmountAutoFocus: onCloseAutoFocus,
          children: /* @__PURE__ */ jsx(
            DismissableLayer,
            {
              asChild: true,
              disableOutsidePointerEvents,
              onInteractOutside,
              onEscapeKeyDown,
              onPointerDownOutside,
              onFocusOutside,
              onDismiss: () => context.onOpenChange(false),
              deferPointerDownOutside: true,
              children: /* @__PURE__ */ jsx(
                Content3,
                {
                  "data-state": getState3(context.open),
                  role: "dialog",
                  id: context.contentId,
                  ...popperScope,
                  ...contentProps,
                  ref: forwardedRef,
                  style: {
                    ...contentProps.style,
                    // re-namespace exposed content custom properties
                    ...{
                      "--radix-popover-content-transform-origin": "var(--radix-popper-transform-origin)",
                      "--radix-popover-content-available-width": "var(--radix-popper-available-width)",
                      "--radix-popover-content-available-height": "var(--radix-popper-available-height)",
                      "--radix-popover-trigger-width": "var(--radix-popper-anchor-width)",
                      "--radix-popover-trigger-height": "var(--radix-popper-anchor-height)"
                    }
                  }
                }
              )
            }
          )
        }
      );
    }, "PopoverContentImpl")
  );
  var CLOSE_NAME2 = "PopoverClose";
  var PopoverClose = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name30(function PopoverClose2(props, forwardedRef) {
      const { __scopePopover, ...closeProps } = props;
      const context = usePopoverContext(CLOSE_NAME2, __scopePopover);
      return /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          ...closeProps,
          ref: forwardedRef,
          onClick: composeEventHandlers(props.onClick, () => context.onOpenChange(false))
        }
      );
    }, "PopoverClose")
  );
  var PopoverArrow = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name30(function PopoverArrow2(props, forwardedRef) {
      const { __scopePopover, ...arrowProps } = props;
      const popperScope = usePopperScope2(__scopePopover);
      return /* @__PURE__ */ jsx(Arrow3, { ...popperScope, ...arrowProps, ref: forwardedRef });
    }, "PopoverArrow")
  );
  function getState3(open) {
    return open ? "open" : "closed";
  }
  __name30(getState3, "getState");
  var Root25 = Popover;
  var Anchor22 = PopoverAnchor;
  var Trigger4 = PopoverTrigger;
  var Portal4 = PopoverPortal;
  var Content24 = PopoverContent;
  var Close = PopoverClose;
  var Arrow24 = PopoverArrow;

  // ../../node_modules/.pnpm/@radix-ui+react-progress@1.1.16_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-progress/dist/index.mjs
  var dist_exports11 = {};
  __export(dist_exports11, {
    Indicator: () => Indicator,
    Progress: () => Progress,
    ProgressIndicator: () => ProgressIndicator,
    Root: () => Root5,
    createProgressScope: () => createProgressScope
  });
  var __defProp32 = Object.defineProperty;
  var __name31 = (target, value) => __defProp32(target, "name", { value, configurable: true });
  var PROGRESS_NAME = "Progress";
  var DEFAULT_MAX = 100;
  var [createProgressContext, createProgressScope] = createContextScope(PROGRESS_NAME);
  var [ProgressProvider, useProgressContext] = createProgressContext(PROGRESS_NAME);
  var Progress = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name31(function Progress2(props, forwardedRef) {
      const {
        __scopeProgress,
        value: valueProp = null,
        max: maxProp,
        getValueLabel = defaultGetValueLabel,
        ...progressProps
      } = props;
      if ((maxProp || maxProp === 0) && !isValidMaxNumber(maxProp)) {
        console.error(getInvalidMaxError(`${maxProp}`, "Progress"));
      }
      const max2 = isValidMaxNumber(maxProp) ? maxProp : DEFAULT_MAX;
      if (valueProp !== null && !isValidValueNumber(valueProp, max2)) {
        console.error(getInvalidValueError(`${valueProp}`, "Progress"));
      }
      const value = isValidValueNumber(valueProp, max2) ? valueProp : null;
      const valueLabel = isNumber2(value) ? getValueLabel(value, max2) : void 0;
      return /* @__PURE__ */ jsx(ProgressProvider, { scope: __scopeProgress, value, max: max2, children: /* @__PURE__ */ jsx(
        Primitive.div,
        {
          "aria-valuemax": max2,
          "aria-valuemin": 0,
          "aria-valuenow": isNumber2(value) ? value : void 0,
          "aria-valuetext": valueLabel,
          role: "progressbar",
          "data-state": getProgressState(value, max2),
          "data-value": value ?? void 0,
          "data-max": max2,
          ...progressProps,
          ref: forwardedRef
        }
      ) });
    }, "Progress")
  );
  var INDICATOR_NAME = "ProgressIndicator";
  var ProgressIndicator = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name31(function ProgressIndicator2(props, forwardedRef) {
      const { __scopeProgress, ...indicatorProps } = props;
      const context = useProgressContext(INDICATOR_NAME, __scopeProgress);
      return /* @__PURE__ */ jsx(
        Primitive.div,
        {
          "data-state": getProgressState(context.value, context.max),
          "data-value": context.value ?? void 0,
          "data-max": context.max,
          ...indicatorProps,
          ref: forwardedRef
        }
      );
    }, "ProgressIndicator")
  );
  function defaultGetValueLabel(value, max2) {
    return `${Math.round(value / max2 * 100)}%`;
  }
  __name31(defaultGetValueLabel, "defaultGetValueLabel");
  function getProgressState(value, maxValue) {
    return value == null ? "indeterminate" : value === maxValue ? "complete" : "loading";
  }
  __name31(getProgressState, "getProgressState");
  function isNumber2(value) {
    return typeof value === "number";
  }
  __name31(isNumber2, "isNumber");
  function isValidMaxNumber(max2) {
    return isNumber2(max2) && !isNaN(max2) && max2 > 0;
  }
  __name31(isValidMaxNumber, "isValidMaxNumber");
  function isValidValueNumber(value, max2) {
    return isNumber2(value) && !isNaN(value) && value <= max2 && value >= 0;
  }
  __name31(isValidValueNumber, "isValidValueNumber");
  function getInvalidMaxError(propValue, componentName) {
    return `Invalid prop \`max\` of value \`${propValue}\` supplied to \`${componentName}\`. Only numbers greater than 0 are valid max values. Defaulting to \`${DEFAULT_MAX}\`.`;
  }
  __name31(getInvalidMaxError, "getInvalidMaxError");
  function getInvalidValueError(propValue, componentName) {
    return `Invalid prop \`value\` of value \`${propValue}\` supplied to \`${componentName}\`. The \`value\` prop must be:
  - a positive number
  - less than the value passed to \`max\` (or ${DEFAULT_MAX} if no \`max\` prop is set)
  - \`null\` or \`undefined\` if the progress is indeterminate.

Defaulting to \`null\`.`;
  }
  __name31(getInvalidValueError, "getInvalidValueError");
  var Root5 = Progress;
  var Indicator = ProgressIndicator;

  // ../../node_modules/.pnpm/@radix-ui+react-scroll-area@1.2.18_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-scroll-area/dist/index.mjs
  var dist_exports12 = {};
  __export(dist_exports12, {
    Corner: () => Corner,
    Root: () => Root6,
    ScrollArea: () => ScrollArea,
    ScrollAreaCorner: () => ScrollAreaCorner,
    ScrollAreaScrollbar: () => ScrollAreaScrollbar,
    ScrollAreaThumb: () => ScrollAreaThumb,
    ScrollAreaViewport: () => ScrollAreaViewport,
    Scrollbar: () => Scrollbar,
    Thumb: () => Thumb,
    Viewport: () => Viewport,
    createScrollAreaScope: () => createScrollAreaScope
  });
  var __defProp33 = Object.defineProperty;
  var __name32 = (target, value) => __defProp33(target, "name", { value, configurable: true });
  function useStateMachine2(initialState, machine) {
    return useReducer((state, event) => {
      const nextState = machine[state][event];
      return nextState ?? state;
    }, initialState);
  }
  __name32(useStateMachine2, "useStateMachine");
  var SCROLL_AREA_NAME = "ScrollArea";
  var [createScrollAreaContext, createScrollAreaScope] = createContextScope(SCROLL_AREA_NAME);
  var [ScrollAreaProvider, useScrollAreaContext] = createScrollAreaContext(SCROLL_AREA_NAME);
  var ScrollArea = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name32(function ScrollArea2(props, forwardedRef) {
      const {
        __scopeScrollArea,
        type = "hover",
        dir,
        scrollHideDelay = 600,
        ...scrollAreaProps
      } = props;
      const [scrollArea, setScrollArea] = useState(null);
      const [viewport, setViewport] = useState(null);
      const [content, setContent] = useState(null);
      const [scrollbarX, setScrollbarX] = useState(null);
      const [scrollbarY, setScrollbarY] = useState(null);
      const [cornerWidth, setCornerWidth] = useState(0);
      const [cornerHeight, setCornerHeight] = useState(0);
      const [scrollbarXEnabled, setScrollbarXEnabled] = useState(false);
      const [scrollbarYEnabled, setScrollbarYEnabled] = useState(false);
      const composedRefs = useComposedRefs(forwardedRef, setScrollArea);
      const direction = useDirection(dir);
      return /* @__PURE__ */ jsx(
        ScrollAreaProvider,
        {
          scope: __scopeScrollArea,
          type,
          dir: direction,
          scrollHideDelay,
          scrollArea,
          viewport,
          onViewportChange: setViewport,
          content,
          onContentChange: setContent,
          scrollbarX,
          onScrollbarXChange: setScrollbarX,
          scrollbarXEnabled,
          onScrollbarXEnabledChange: setScrollbarXEnabled,
          scrollbarY,
          onScrollbarYChange: setScrollbarY,
          scrollbarYEnabled,
          onScrollbarYEnabledChange: setScrollbarYEnabled,
          onCornerWidthChange: setCornerWidth,
          onCornerHeightChange: setCornerHeight,
          children: /* @__PURE__ */ jsx(
            Primitive.div,
            {
              dir: direction,
              ...scrollAreaProps,
              ref: composedRefs,
              style: {
                position: "relative",
                // Pass corner sizes as CSS vars to reduce re-renders of context consumers
                "--radix-scroll-area-corner-width": cornerWidth + "px",
                "--radix-scroll-area-corner-height": cornerHeight + "px",
                ...props.style
              }
            }
          )
        }
      );
    }, "ScrollArea")
  );
  var VIEWPORT_NAME = "ScrollAreaViewport";
  var ScrollAreaViewport = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name32(function ScrollAreaViewport2(props, forwardedRef) {
      const { __scopeScrollArea, children, nonce, ...viewportProps } = props;
      const context = useScrollAreaContext(VIEWPORT_NAME, __scopeScrollArea);
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref, context.onViewportChange);
      return /* @__PURE__ */ jsxs(Fragment2, { children: [
        /* @__PURE__ */ jsx(ScrollAreaViewportStyle, { nonce }),
        /* @__PURE__ */ jsx(
          Primitive.div,
          {
            "data-radix-scroll-area-viewport": "",
            ...viewportProps,
            ref: composedRefs,
            style: {
              /**
               * We don't support `visible` because the intention is to have at least one scrollbar
               * if this component is used and `visible` will behave like `auto` in that case
               * https://developer.mozilla.org/en-US/docs/Web/CSS/overflow#description
               *
               * We don't handle `auto` because the intention is for the native implementation
               * to be hidden if using this component. We just want to ensure the node is scrollable
               * so could have used either `scroll` or `auto` here. We picked `scroll` to prevent
               * the browser from having to work out whether to render native scrollbars or not,
               * we tell it to with the intention of hiding them in CSS.
               */
              overflowX: context.scrollbarXEnabled ? "scroll" : "hidden",
              overflowY: context.scrollbarYEnabled ? "scroll" : "hidden",
              ...props.style
            },
            children: /* @__PURE__ */ jsx("div", { ref: context.onContentChange, style: { minWidth: "100%", display: "table" }, children })
          }
        )
      ] });
    }, "ScrollAreaViewport")
  );
  var ScrollAreaViewportStyle = /* @__PURE__ */ memo(
    /* @__PURE__ */ __name32(function ScrollAreaViewportStyle2({ nonce }) {
      return /* @__PURE__ */ jsx(
        "style",
        {
          dangerouslySetInnerHTML: {
            __html: `[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}`
          },
          nonce
        }
      );
    }, "ScrollAreaViewportStyle"),
    (prevProps, nextProps) => prevProps.nonce === nextProps.nonce
  );
  var SCROLLBAR_NAME = "ScrollAreaScrollbar";
  var ScrollAreaScrollbar = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name32(function ScrollAreaScrollbar2(props, forwardedRef) {
      const { forceMount, ...scrollbarProps } = props;
      const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
      const { onScrollbarXEnabledChange, onScrollbarYEnabledChange } = context;
      const isHorizontal = props.orientation === "horizontal";
      useEffect(() => {
        isHorizontal ? onScrollbarXEnabledChange(true) : onScrollbarYEnabledChange(true);
        return () => {
          isHorizontal ? onScrollbarXEnabledChange(false) : onScrollbarYEnabledChange(false);
        };
      }, [isHorizontal, onScrollbarXEnabledChange, onScrollbarYEnabledChange]);
      return context.type === "hover" ? /* @__PURE__ */ jsx(ScrollAreaScrollbarHover, { ...scrollbarProps, ref: forwardedRef, forceMount }) : context.type === "scroll" ? /* @__PURE__ */ jsx(ScrollAreaScrollbarScroll, { ...scrollbarProps, ref: forwardedRef, forceMount }) : context.type === "auto" ? /* @__PURE__ */ jsx(ScrollAreaScrollbarAuto, { ...scrollbarProps, ref: forwardedRef, forceMount }) : context.type === "always" ? /* @__PURE__ */ jsx(ScrollAreaScrollbarVisible, { ...scrollbarProps, ref: forwardedRef, "data-state": "visible" }) : null;
    }, "ScrollAreaScrollbar")
  );
  var ScrollAreaScrollbarHover = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name32(function ScrollAreaScrollbarHover2(props, forwardedRef) {
    const { forceMount, ...scrollbarProps } = props;
    const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
      const scrollArea = context.scrollArea;
      let hideTimer = 0;
      if (scrollArea) {
        const handlePointerEnter = /* @__PURE__ */ __name32(() => {
          window.clearTimeout(hideTimer);
          setVisible(true);
        }, "handlePointerEnter");
        const handlePointerLeave = /* @__PURE__ */ __name32(() => {
          hideTimer = window.setTimeout(() => setVisible(false), context.scrollHideDelay);
        }, "handlePointerLeave");
        scrollArea.addEventListener("pointerenter", handlePointerEnter);
        scrollArea.addEventListener("pointerleave", handlePointerLeave);
        return () => {
          window.clearTimeout(hideTimer);
          scrollArea.removeEventListener("pointerenter", handlePointerEnter);
          scrollArea.removeEventListener("pointerleave", handlePointerLeave);
        };
      }
    }, [context.scrollArea, context.scrollHideDelay]);
    return /* @__PURE__ */ jsx(Presence, { present: forceMount || visible, children: /* @__PURE__ */ jsx(
      ScrollAreaScrollbarAuto,
      {
        "data-state": visible ? "visible" : "hidden",
        ...scrollbarProps,
        ref: forwardedRef
      }
    ) });
  }, "ScrollAreaScrollbarHover"));
  var ScrollAreaScrollbarScroll = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name32(function ScrollAreaScrollbarScroll2(props, forwardedRef) {
    const { forceMount, ...scrollbarProps } = props;
    const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
    const isHorizontal = props.orientation === "horizontal";
    const debounceScrollEnd = useDebounceCallback(() => send("SCROLL_END"), 100);
    const [state, send] = useStateMachine2("hidden", {
      hidden: {
        SCROLL: "scrolling"
      },
      scrolling: {
        SCROLL_END: "idle",
        POINTER_ENTER: "interacting"
      },
      interacting: {
        SCROLL: "interacting",
        POINTER_LEAVE: "idle"
      },
      idle: {
        HIDE: "hidden",
        SCROLL: "scrolling",
        POINTER_ENTER: "interacting"
      }
    });
    useEffect(() => {
      if (state === "idle") {
        const hideTimer = window.setTimeout(() => send("HIDE"), context.scrollHideDelay);
        return () => window.clearTimeout(hideTimer);
      }
    }, [state, context.scrollHideDelay, send]);
    useEffect(() => {
      const viewport = context.viewport;
      const scrollDirection = isHorizontal ? "scrollLeft" : "scrollTop";
      if (viewport) {
        let prevScrollPos = viewport[scrollDirection];
        const handleScroll2 = /* @__PURE__ */ __name32(() => {
          const scrollPos = viewport[scrollDirection];
          const hasScrollInDirectionChanged = prevScrollPos !== scrollPos;
          if (hasScrollInDirectionChanged) {
            send("SCROLL");
            debounceScrollEnd();
          }
          prevScrollPos = scrollPos;
        }, "handleScroll");
        viewport.addEventListener("scroll", handleScroll2);
        return () => viewport.removeEventListener("scroll", handleScroll2);
      }
    }, [context.viewport, isHorizontal, send, debounceScrollEnd]);
    return /* @__PURE__ */ jsx(Presence, { present: forceMount || state !== "hidden", children: /* @__PURE__ */ jsx(
      ScrollAreaScrollbarVisible,
      {
        "data-state": state === "hidden" ? "hidden" : "visible",
        ...scrollbarProps,
        ref: forwardedRef,
        onPointerEnter: composeEventHandlers(props.onPointerEnter, () => send("POINTER_ENTER")),
        onPointerLeave: composeEventHandlers(props.onPointerLeave, () => send("POINTER_LEAVE"))
      }
    ) });
  }, "ScrollAreaScrollbarScroll"));
  var ScrollAreaScrollbarAuto = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name32(function ScrollAreaScrollbarAuto2(props, forwardedRef) {
    const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
    const { forceMount, ...scrollbarProps } = props;
    const [visible, setVisible] = useState(false);
    const isHorizontal = props.orientation === "horizontal";
    const handleResize = useDebounceCallback(() => {
      if (context.viewport) {
        const isOverflowX = context.viewport.offsetWidth < context.viewport.scrollWidth;
        const isOverflowY = context.viewport.offsetHeight < context.viewport.scrollHeight;
        setVisible(isHorizontal ? isOverflowX : isOverflowY);
      }
    }, 10);
    useResizeObserver(context.viewport, handleResize);
    useResizeObserver(context.content, handleResize);
    return /* @__PURE__ */ jsx(Presence, { present: forceMount || visible, children: /* @__PURE__ */ jsx(
      ScrollAreaScrollbarVisible,
      {
        "data-state": visible ? "visible" : "hidden",
        ...scrollbarProps,
        ref: forwardedRef
      }
    ) });
  }, "ScrollAreaScrollbarAuto"));
  var ScrollAreaScrollbarVisible = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name32(function ScrollAreaScrollbarVisible2(props, forwardedRef) {
    const { orientation = "vertical", ...scrollbarProps } = props;
    const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
    const thumbRef = useRef(null);
    const pointerOffsetRef = useRef(0);
    const [sizes, setSizes] = useState({
      content: 0,
      viewport: 0,
      scrollbar: { size: 0, paddingStart: 0, paddingEnd: 0 }
    });
    const thumbRatio = getThumbRatio(sizes.viewport, sizes.content);
    const commonProps = {
      ...scrollbarProps,
      sizes,
      onSizesChange: setSizes,
      hasThumb: Boolean(thumbRatio > 0 && thumbRatio < 1),
      onThumbChange: /* @__PURE__ */ __name32((thumb) => thumbRef.current = thumb, "onThumbChange"),
      onThumbPointerUp: /* @__PURE__ */ __name32(() => pointerOffsetRef.current = 0, "onThumbPointerUp"),
      onThumbPointerDown: /* @__PURE__ */ __name32((pointerPos) => pointerOffsetRef.current = pointerPos, "onThumbPointerDown")
    };
    function getScrollPosition(pointerPos, dir) {
      return getScrollPositionFromPointer(pointerPos, pointerOffsetRef.current, sizes, dir);
    }
    __name32(getScrollPosition, "getScrollPosition");
    if (orientation === "horizontal") {
      return /* @__PURE__ */ jsx(
        ScrollAreaScrollbarX,
        {
          ...commonProps,
          ref: forwardedRef,
          onThumbPositionChange: () => {
            if (context.viewport && thumbRef.current) {
              const scrollPos = context.viewport.scrollLeft;
              const offset4 = getThumbOffsetFromScroll(scrollPos, sizes, context.dir);
              thumbRef.current.style.transform = `translate3d(${offset4}px, 0, 0)`;
            }
          },
          onWheelScroll: (scrollPos) => {
            if (context.viewport) context.viewport.scrollLeft = scrollPos;
          },
          onDragScroll: (pointerPos) => {
            if (context.viewport) {
              context.viewport.scrollLeft = getScrollPosition(pointerPos, context.dir);
            }
          }
        }
      );
    }
    if (orientation === "vertical") {
      return /* @__PURE__ */ jsx(
        ScrollAreaScrollbarY,
        {
          ...commonProps,
          ref: forwardedRef,
          onThumbPositionChange: () => {
            if (context.viewport && thumbRef.current) {
              const scrollPos = context.viewport.scrollTop;
              const offset4 = getThumbOffsetFromScroll(scrollPos, sizes);
              thumbRef.current.style.transform = `translate3d(0, ${offset4}px, 0)`;
            }
          },
          onWheelScroll: (scrollPos) => {
            if (context.viewport) context.viewport.scrollTop = scrollPos;
          },
          onDragScroll: (pointerPos) => {
            if (context.viewport) context.viewport.scrollTop = getScrollPosition(pointerPos);
          }
        }
      );
    }
    return null;
  }, "ScrollAreaScrollbarVisible"));
  var ScrollAreaScrollbarX = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name32(function ScrollAreaScrollbarX2(props, forwardedRef) {
    const { sizes, onSizesChange, ...scrollbarProps } = props;
    const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
    const [computedStyle, setComputedStyle] = useState();
    const ref = useRef(null);
    const composeRefs2 = useComposedRefs(forwardedRef, ref, context.onScrollbarXChange);
    useEffect(() => {
      if (ref.current) setComputedStyle(getComputedStyle(ref.current));
    }, [ref]);
    return /* @__PURE__ */ jsx(
      ScrollAreaScrollbarImpl,
      {
        "data-orientation": "horizontal",
        ...scrollbarProps,
        ref: composeRefs2,
        sizes,
        style: {
          bottom: 0,
          left: context.dir === "rtl" ? "var(--radix-scroll-area-corner-width)" : 0,
          right: context.dir === "ltr" ? "var(--radix-scroll-area-corner-width)" : 0,
          "--radix-scroll-area-thumb-width": getThumbSize(sizes) + "px",
          ...props.style
        },
        onThumbPointerDown: (pointerPos) => props.onThumbPointerDown(pointerPos.x),
        onDragScroll: (pointerPos) => props.onDragScroll(pointerPos.x),
        onWheelScroll: (event, maxScrollPos) => {
          if (context.viewport) {
            const scrollPos = context.viewport.scrollLeft + event.deltaX;
            props.onWheelScroll(scrollPos);
            if (isScrollingWithinScrollbarBounds(scrollPos, maxScrollPos)) {
              event.preventDefault();
            }
          }
        },
        onResize: () => {
          if (ref.current && context.viewport && computedStyle) {
            onSizesChange({
              content: context.viewport.scrollWidth,
              viewport: context.viewport.offsetWidth,
              scrollbar: {
                size: ref.current.clientWidth,
                paddingStart: toInt(computedStyle.paddingLeft),
                paddingEnd: toInt(computedStyle.paddingRight)
              }
            });
          }
        }
      }
    );
  }, "ScrollAreaScrollbarX"));
  var ScrollAreaScrollbarY = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name32(function ScrollAreaScrollbarY2(props, forwardedRef) {
    const { sizes, onSizesChange, ...scrollbarProps } = props;
    const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
    const [computedStyle, setComputedStyle] = useState();
    const ref = useRef(null);
    const composeRefs2 = useComposedRefs(forwardedRef, ref, context.onScrollbarYChange);
    useEffect(() => {
      if (ref.current) setComputedStyle(getComputedStyle(ref.current));
    }, [ref]);
    return /* @__PURE__ */ jsx(
      ScrollAreaScrollbarImpl,
      {
        "data-orientation": "vertical",
        ...scrollbarProps,
        ref: composeRefs2,
        sizes,
        style: {
          top: 0,
          right: context.dir === "ltr" ? 0 : void 0,
          left: context.dir === "rtl" ? 0 : void 0,
          bottom: "var(--radix-scroll-area-corner-height)",
          "--radix-scroll-area-thumb-height": getThumbSize(sizes) + "px",
          ...props.style
        },
        onThumbPointerDown: (pointerPos) => props.onThumbPointerDown(pointerPos.y),
        onDragScroll: (pointerPos) => props.onDragScroll(pointerPos.y),
        onWheelScroll: (event, maxScrollPos) => {
          if (context.viewport) {
            const scrollPos = context.viewport.scrollTop + event.deltaY;
            props.onWheelScroll(scrollPos);
            if (isScrollingWithinScrollbarBounds(scrollPos, maxScrollPos)) {
              event.preventDefault();
            }
          }
        },
        onResize: () => {
          if (ref.current && context.viewport && computedStyle) {
            onSizesChange({
              content: context.viewport.scrollHeight,
              viewport: context.viewport.offsetHeight,
              scrollbar: {
                size: ref.current.clientHeight,
                paddingStart: toInt(computedStyle.paddingTop),
                paddingEnd: toInt(computedStyle.paddingBottom)
              }
            });
          }
        }
      }
    );
  }, "ScrollAreaScrollbarY"));
  var [ScrollbarProvider, useScrollbarContext] = createScrollAreaContext(SCROLLBAR_NAME);
  var ScrollAreaScrollbarImpl = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name32(function ScrollAreaScrollbarImpl2(props, forwardedRef) {
    const {
      __scopeScrollArea,
      sizes,
      hasThumb,
      onThumbChange,
      onThumbPointerUp,
      onThumbPointerDown,
      onThumbPositionChange,
      onDragScroll,
      onWheelScroll,
      onResize,
      ...scrollbarProps
    } = props;
    const context = useScrollAreaContext(SCROLLBAR_NAME, __scopeScrollArea);
    const [scrollbar, setScrollbar] = useState(null);
    const composeRefs2 = useComposedRefs(forwardedRef, setScrollbar);
    const rectRef = useRef(null);
    const prevWebkitUserSelectRef = useRef("");
    const viewport = context.viewport;
    const maxScrollPos = sizes.content - sizes.viewport;
    const handleWheelScroll = useCallbackRef(onWheelScroll);
    const handleThumbPositionChange = useCallbackRef(onThumbPositionChange);
    const handleResize = useDebounceCallback(onResize, 10);
    function handleDragScroll(event) {
      if (rectRef.current) {
        const x = event.clientX - rectRef.current.left;
        const y = event.clientY - rectRef.current.top;
        onDragScroll({ x, y });
      }
    }
    __name32(handleDragScroll, "handleDragScroll");
    useEffect(() => {
      const handleWheel = /* @__PURE__ */ __name32((event) => {
        const element = event.target;
        const isScrollbarWheel = scrollbar?.contains(element);
        if (isScrollbarWheel) handleWheelScroll(event, maxScrollPos);
      }, "handleWheel");
      document.addEventListener("wheel", handleWheel, { passive: false });
      return () => document.removeEventListener("wheel", handleWheel, { passive: false });
    }, [viewport, scrollbar, maxScrollPos, handleWheelScroll]);
    useEffect(handleThumbPositionChange, [sizes, handleThumbPositionChange]);
    useResizeObserver(scrollbar, handleResize);
    useResizeObserver(context.content, handleResize);
    return /* @__PURE__ */ jsx(
      ScrollbarProvider,
      {
        scope: __scopeScrollArea,
        scrollbar,
        hasThumb,
        onThumbChange: useCallbackRef(onThumbChange),
        onThumbPointerUp: useCallbackRef(onThumbPointerUp),
        onThumbPositionChange: handleThumbPositionChange,
        onThumbPointerDown: useCallbackRef(onThumbPointerDown),
        children: /* @__PURE__ */ jsx(
          Primitive.div,
          {
            ...scrollbarProps,
            ref: composeRefs2,
            style: { position: "absolute", ...scrollbarProps.style },
            onPointerDown: composeEventHandlers(props.onPointerDown, (event) => {
              const mainPointer = 0;
              if (event.button === mainPointer) {
                const element = event.target;
                element.setPointerCapture(event.pointerId);
                rectRef.current = scrollbar.getBoundingClientRect();
                prevWebkitUserSelectRef.current = document.body.style.webkitUserSelect;
                document.body.style.webkitUserSelect = "none";
                if (context.viewport) context.viewport.style.scrollBehavior = "auto";
                handleDragScroll(event);
              }
            }),
            onPointerMove: composeEventHandlers(props.onPointerMove, handleDragScroll),
            onPointerUp: composeEventHandlers(props.onPointerUp, (event) => {
              const element = event.target;
              if (element.hasPointerCapture(event.pointerId)) {
                element.releasePointerCapture(event.pointerId);
              }
              document.body.style.webkitUserSelect = prevWebkitUserSelectRef.current;
              if (context.viewport) context.viewport.style.scrollBehavior = "";
              rectRef.current = null;
            })
          }
        )
      }
    );
  }, "ScrollAreaScrollbarImpl"));
  var THUMB_NAME = "ScrollAreaThumb";
  var ScrollAreaThumb = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name32(function ScrollAreaThumb2(props, forwardedRef) {
      const { forceMount, ...thumbProps } = props;
      const scrollbarContext = useScrollbarContext(THUMB_NAME, props.__scopeScrollArea);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || scrollbarContext.hasThumb, children: /* @__PURE__ */ jsx(ScrollAreaThumbImpl, { ref: forwardedRef, ...thumbProps }) });
    }, "ScrollAreaThumb")
  );
  var ScrollAreaThumbImpl = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name32(function ScrollAreaThumbImpl2(props, forwardedRef) {
      const { __scopeScrollArea, style, ...thumbProps } = props;
      const scrollAreaContext = useScrollAreaContext(THUMB_NAME, __scopeScrollArea);
      const scrollbarContext = useScrollbarContext(THUMB_NAME, __scopeScrollArea);
      const { onThumbPositionChange } = scrollbarContext;
      const composedRef = useComposedRefs(forwardedRef, scrollbarContext.onThumbChange);
      const removeUnlinkedScrollListenerRef = useRef(void 0);
      const debounceScrollEnd = useDebounceCallback(() => {
        if (removeUnlinkedScrollListenerRef.current) {
          removeUnlinkedScrollListenerRef.current();
          removeUnlinkedScrollListenerRef.current = void 0;
        }
      }, 100);
      useEffect(() => {
        const viewport = scrollAreaContext.viewport;
        if (viewport) {
          const handleScroll2 = /* @__PURE__ */ __name32(() => {
            debounceScrollEnd();
            if (!removeUnlinkedScrollListenerRef.current) {
              const listener = addUnlinkedScrollListener(viewport, onThumbPositionChange);
              removeUnlinkedScrollListenerRef.current = listener;
              onThumbPositionChange();
            }
          }, "handleScroll");
          onThumbPositionChange();
          viewport.addEventListener("scroll", handleScroll2);
          return () => viewport.removeEventListener("scroll", handleScroll2);
        }
      }, [scrollAreaContext.viewport, debounceScrollEnd, onThumbPositionChange]);
      return /* @__PURE__ */ jsx(
        Primitive.div,
        {
          "data-state": scrollbarContext.hasThumb ? "visible" : "hidden",
          ...thumbProps,
          ref: composedRef,
          style: {
            width: "var(--radix-scroll-area-thumb-width)",
            height: "var(--radix-scroll-area-thumb-height)",
            ...style
          },
          onPointerDownCapture: composeEventHandlers(props.onPointerDownCapture, (event) => {
            const thumb = event.target;
            const thumbRect = thumb.getBoundingClientRect();
            const x = event.clientX - thumbRect.left;
            const y = event.clientY - thumbRect.top;
            scrollbarContext.onThumbPointerDown({ x, y });
          }),
          onPointerUp: composeEventHandlers(props.onPointerUp, scrollbarContext.onThumbPointerUp)
        }
      );
    }, "ScrollAreaThumbImpl")
  );
  var CORNER_NAME = "ScrollAreaCorner";
  var ScrollAreaCorner = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name32(function ScrollAreaCorner2(props, forwardedRef) {
      const context = useScrollAreaContext(CORNER_NAME, props.__scopeScrollArea);
      const hasBothScrollbarsVisible = Boolean(context.scrollbarX && context.scrollbarY);
      const hasCorner = context.type !== "scroll" && hasBothScrollbarsVisible;
      return hasCorner ? /* @__PURE__ */ jsx(ScrollAreaCornerImpl, { ...props, ref: forwardedRef }) : null;
    }, "ScrollAreaCorner")
  );
  var ScrollAreaCornerImpl = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name32(function ScrollAreaCornerImpl2(props, forwardedRef) {
    const { __scopeScrollArea, ...cornerProps } = props;
    const context = useScrollAreaContext(CORNER_NAME, __scopeScrollArea);
    const [width, setWidth] = useState(0);
    const [height, setHeight] = useState(0);
    const hasSize = Boolean(width && height);
    const { onCornerWidthChange, onCornerHeightChange } = context;
    useResizeObserver(context.scrollbarX, () => {
      const height2 = context.scrollbarX?.offsetHeight || 0;
      context.onCornerHeightChange(height2);
      setHeight(height2);
    });
    useResizeObserver(context.scrollbarY, () => {
      const width2 = context.scrollbarY?.offsetWidth || 0;
      context.onCornerWidthChange(width2);
      setWidth(width2);
    });
    useEffect(() => {
      return () => {
        onCornerWidthChange(0);
        onCornerHeightChange(0);
      };
    }, [onCornerWidthChange, onCornerHeightChange]);
    return hasSize ? /* @__PURE__ */ jsx(
      Primitive.div,
      {
        ...cornerProps,
        ref: forwardedRef,
        style: {
          width,
          height,
          position: "absolute",
          right: context.dir === "ltr" ? 0 : void 0,
          left: context.dir === "rtl" ? 0 : void 0,
          bottom: 0,
          ...props.style
        }
      }
    ) : null;
  }, "ScrollAreaCornerImpl"));
  function toInt(value) {
    return value ? parseInt(value, 10) : 0;
  }
  __name32(toInt, "toInt");
  function getThumbRatio(viewportSize, contentSize) {
    const ratio = viewportSize / contentSize;
    return isNaN(ratio) ? 0 : ratio;
  }
  __name32(getThumbRatio, "getThumbRatio");
  function getThumbSize(sizes) {
    const ratio = getThumbRatio(sizes.viewport, sizes.content);
    const scrollbarPadding = sizes.scrollbar.paddingStart + sizes.scrollbar.paddingEnd;
    const thumbSize = (sizes.scrollbar.size - scrollbarPadding) * ratio;
    return Math.max(thumbSize, 18);
  }
  __name32(getThumbSize, "getThumbSize");
  function getScrollPositionFromPointer(pointerPos, pointerOffset, sizes, dir = "ltr") {
    const thumbSizePx = getThumbSize(sizes);
    const thumbCenter = thumbSizePx / 2;
    const offset4 = pointerOffset || thumbCenter;
    const thumbOffsetFromEnd = thumbSizePx - offset4;
    const minPointerPos = sizes.scrollbar.paddingStart + offset4;
    const maxPointerPos = sizes.scrollbar.size - sizes.scrollbar.paddingEnd - thumbOffsetFromEnd;
    const maxScrollPos = sizes.content - sizes.viewport;
    const scrollRange = dir === "ltr" ? [0, maxScrollPos] : [maxScrollPos * -1, 0];
    const interpolate = linearScale([minPointerPos, maxPointerPos], scrollRange);
    return interpolate(pointerPos);
  }
  __name32(getScrollPositionFromPointer, "getScrollPositionFromPointer");
  function getThumbOffsetFromScroll(scrollPos, sizes, dir = "ltr") {
    const thumbSizePx = getThumbSize(sizes);
    const scrollbarPadding = sizes.scrollbar.paddingStart + sizes.scrollbar.paddingEnd;
    const scrollbar = sizes.scrollbar.size - scrollbarPadding;
    const maxScrollPos = sizes.content - sizes.viewport;
    const maxThumbPos = scrollbar - thumbSizePx;
    const scrollClampRange = dir === "ltr" ? [0, maxScrollPos] : [maxScrollPos * -1, 0];
    const scrollWithoutMomentum = clamp2(scrollPos, scrollClampRange);
    const interpolate = linearScale([0, maxScrollPos], [0, maxThumbPos]);
    return interpolate(scrollWithoutMomentum);
  }
  __name32(getThumbOffsetFromScroll, "getThumbOffsetFromScroll");
  function linearScale(input, output) {
    return (value) => {
      if (input[0] === input[1] || output[0] === output[1]) return output[0];
      const ratio = (output[1] - output[0]) / (input[1] - input[0]);
      return output[0] + ratio * (value - input[0]);
    };
  }
  __name32(linearScale, "linearScale");
  function isScrollingWithinScrollbarBounds(scrollPos, maxScrollPos) {
    return scrollPos > 0 && scrollPos < maxScrollPos;
  }
  __name32(isScrollingWithinScrollbarBounds, "isScrollingWithinScrollbarBounds");
  var addUnlinkedScrollListener = /* @__PURE__ */ __name32((node, handler = () => {
  }) => {
    let prevPosition = { left: node.scrollLeft, top: node.scrollTop };
    let rAF = 0;
    (/* @__PURE__ */ __name32((function loop() {
      const position = { left: node.scrollLeft, top: node.scrollTop };
      const isHorizontalScroll = prevPosition.left !== position.left;
      const isVerticalScroll = prevPosition.top !== position.top;
      if (isHorizontalScroll || isVerticalScroll) handler();
      prevPosition = position;
      rAF = window.requestAnimationFrame(loop);
    }), "loop"))();
    return () => window.cancelAnimationFrame(rAF);
  }, "addUnlinkedScrollListener");
  function useDebounceCallback(callback, delay) {
    const handleCallback = useCallbackRef(callback);
    const debounceTimerRef = useRef(0);
    useEffect(() => () => window.clearTimeout(debounceTimerRef.current), []);
    return useCallback(() => {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(handleCallback, delay);
    }, [handleCallback, delay]);
  }
  __name32(useDebounceCallback, "useDebounceCallback");
  function useResizeObserver(element, onResize) {
    const handleResize = useCallbackRef(onResize);
    useLayoutEffect2(() => {
      let rAF = 0;
      if (element) {
        const resizeObserver = new ResizeObserver(() => {
          cancelAnimationFrame(rAF);
          rAF = window.requestAnimationFrame(handleResize);
        });
        resizeObserver.observe(element);
        return () => {
          window.cancelAnimationFrame(rAF);
          resizeObserver.unobserve(element);
        };
      }
    }, [element, handleResize]);
  }
  __name32(useResizeObserver, "useResizeObserver");
  var Root6 = ScrollArea;
  var Viewport = ScrollAreaViewport;
  var Scrollbar = ScrollAreaScrollbar;
  var Thumb = ScrollAreaThumb;
  var Corner = ScrollAreaCorner;

  // ../../node_modules/.pnpm/@radix-ui+react-select@2.3.7_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-select/dist/index.mjs
  var dist_exports13 = {};
  __export(dist_exports13, {
    Arrow: () => SelectArrow,
    Content: () => SelectContent,
    Group: () => SelectGroup,
    Icon: () => SelectIcon,
    Item: () => SelectItem,
    ItemIndicator: () => SelectItemIndicator,
    ItemText: () => SelectItemText,
    Label: () => SelectLabel,
    Portal: () => SelectPortal,
    Root: () => Select,
    ScrollDownButton: () => SelectScrollDownButton,
    ScrollUpButton: () => SelectScrollUpButton,
    Select: () => Select,
    SelectArrow: () => SelectArrow,
    SelectContent: () => SelectContent,
    SelectGroup: () => SelectGroup,
    SelectIcon: () => SelectIcon,
    SelectItem: () => SelectItem,
    SelectItemIndicator: () => SelectItemIndicator,
    SelectItemText: () => SelectItemText,
    SelectLabel: () => SelectLabel,
    SelectPortal: () => SelectPortal,
    SelectScrollDownButton: () => SelectScrollDownButton,
    SelectScrollUpButton: () => SelectScrollUpButton,
    SelectSeparator: () => SelectSeparator,
    SelectTrigger: () => SelectTrigger,
    SelectValue: () => SelectValue,
    SelectViewport: () => SelectViewport,
    Separator: () => SelectSeparator,
    Trigger: () => SelectTrigger,
    Value: () => SelectValue,
    Viewport: () => SelectViewport,
    createSelectScope: () => createSelectScope,
    unstable_BubbleInput: () => SelectBubbleInput,
    unstable_Provider: () => SelectProvider,
    unstable_SelectBubbleInput: () => SelectBubbleInput,
    unstable_SelectProvider: () => SelectProvider
  });
  var __defProp34 = Object.defineProperty;
  var __name33 = (target, value) => __defProp34(target, "name", { value, configurable: true });
  var OPEN_KEYS = [" ", "Enter", "ArrowUp", "ArrowDown"];
  var SELECTION_KEYS2 = [" ", "Enter"];
  var SELECT_NAME = "Select";
  var [Collection3, useCollection3, createCollectionScope3] = createCollection(SELECT_NAME);
  var [createSelectContext, createSelectScope] = createContextScope(SELECT_NAME, [
    createCollectionScope3,
    createPopperScope
  ]);
  var usePopperScope3 = createPopperScope();
  var [SelectProviderImpl, useSelectContext] = createSelectContext(SELECT_NAME);
  var [SelectNativeOptionsProvider, useSelectNativeOptionsContext] = createSelectContext(SELECT_NAME);
  function SelectProvider(props) {
    const {
      __scopeSelect,
      children,
      open: openProp,
      defaultOpen,
      onOpenChange,
      value: valueProp,
      defaultValue,
      onValueChange,
      dir,
      name,
      autoComplete,
      disabled,
      required,
      form,
      // @ts-expect-error internal render prop used by `Select` to compose its default parts
      internal_do_not_use_render
    } = props;
    const popperScope = usePopperScope3(__scopeSelect);
    const [trigger, setTrigger] = useState(null);
    const [valueNode, setValueNode] = useState(null);
    const [valueNodeHasChildren, setValueNodeHasChildren] = useState(false);
    const direction = useDirection(dir);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: SELECT_NAME
    });
    const [value, setValue] = useControllableState({
      prop: valueProp,
      defaultProp: defaultValue,
      onChange: onValueChange,
      caller: SELECT_NAME
    });
    const triggerPointerDownPosRef = useRef(null);
    const initialValueRef = useRef(value);
    useEffect(() => {
      const associatedForm = form ? trigger?.ownerDocument.getElementById(form) : trigger?.form;
      if (associatedForm instanceof HTMLFormElement) {
        const reset = /* @__PURE__ */ __name33(() => setValue(initialValueRef.current), "reset");
        associatedForm.addEventListener("reset", reset);
        return () => associatedForm.removeEventListener("reset", reset);
      }
    }, [form, trigger, setValue]);
    const isFormControl = trigger ? !!form || !!trigger.closest("form") : true;
    const [nativeOptionsSet, setNativeOptionsSet] = useState(/* @__PURE__ */ new Set());
    const contentId = useId2();
    const nativeSelectKey = Array.from(nativeOptionsSet).map((option) => option.props.value).join(";");
    const handleNativeOptionAdd = useCallback((option) => {
      setNativeOptionsSet((prev) => new Set(prev).add(option));
    }, []);
    const handleNativeOptionRemove = useCallback((option) => {
      setNativeOptionsSet((prev) => {
        const optionsSet = new Set(prev);
        optionsSet.delete(option);
        return optionsSet;
      });
    }, []);
    const context = {
      required,
      trigger,
      onTriggerChange: setTrigger,
      valueNode,
      onValueNodeChange: setValueNode,
      valueNodeHasChildren,
      onValueNodeHasChildrenChange: setValueNodeHasChildren,
      contentId,
      value,
      onValueChange: setValue,
      open,
      onOpenChange: setOpen,
      dir: direction,
      triggerPointerDownPosRef,
      disabled,
      name,
      autoComplete,
      form,
      nativeOptions: nativeOptionsSet,
      nativeSelectKey,
      isFormControl
    };
    return /* @__PURE__ */ jsx(Root23, { ...popperScope, children: /* @__PURE__ */ jsx(SelectProviderImpl, { scope: __scopeSelect, ...context, children: /* @__PURE__ */ jsx(Collection3.Provider, { scope: __scopeSelect, children: /* @__PURE__ */ jsx(
      SelectNativeOptionsProvider,
      {
        scope: __scopeSelect,
        onNativeOptionAdd: handleNativeOptionAdd,
        onNativeOptionRemove: handleNativeOptionRemove,
        children: isFunction2(internal_do_not_use_render) ? internal_do_not_use_render(context) : children
      }
    ) }) }) });
  }
  __name33(SelectProvider, "SelectProvider");
  var Select = /* @__PURE__ */ __name33((props) => {
    const { __scopeSelect, children, ...providerProps } = props;
    return /* @__PURE__ */ jsx(
      SelectProvider,
      {
        __scopeSelect,
        ...providerProps,
        internal_do_not_use_render: ({ isFormControl }) => /* @__PURE__ */ jsxs(Fragment2, { children: [
          children,
          isFormControl ? /* @__PURE__ */ jsx(
            SelectBubbleInput,
            {
              __scopeSelect
            }
          ) : null
        ] })
      }
    );
  }, "Select");
  var TRIGGER_NAME5 = "SelectTrigger";
  var SelectTrigger = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name33(function SelectTrigger2(props, forwardedRef) {
      const { __scopeSelect, disabled = false, ...triggerProps } = props;
      const popperScope = usePopperScope3(__scopeSelect);
      const context = useSelectContext(TRIGGER_NAME5, __scopeSelect);
      const isDisabled = context.disabled || disabled;
      const composedRefs = useComposedRefs(forwardedRef, context.onTriggerChange);
      const getItems = useCollection3(__scopeSelect);
      const pointerTypeRef = useRef("touch");
      const [searchRef, handleTypeaheadSearch, resetTypeahead] = useTypeaheadSearch((search) => {
        const enabledItems = getItems().filter((item) => !item.disabled);
        const currentItem = enabledItems.find((item) => item.value === context.value);
        const nextItem = findNextItem(enabledItems, search, currentItem);
        if (nextItem !== void 0) {
          context.onValueChange(nextItem.value);
        }
      });
      const handleOpen = /* @__PURE__ */ __name33((pointerEvent) => {
        if (!isDisabled) {
          context.onOpenChange(true);
          resetTypeahead();
        }
        if (pointerEvent) {
          context.triggerPointerDownPosRef.current = {
            x: Math.round(pointerEvent.pageX),
            y: Math.round(pointerEvent.pageY)
          };
        }
      }, "handleOpen");
      return /* @__PURE__ */ jsx(Anchor, { asChild: true, ...popperScope, children: /* @__PURE__ */ jsx(
        Primitive.button,
        {
          type: "button",
          role: "combobox",
          "aria-controls": context.open ? context.contentId : void 0,
          "aria-expanded": context.open,
          "aria-required": context.required,
          "aria-autocomplete": "none",
          dir: context.dir,
          "data-state": context.open ? "open" : "closed",
          disabled: isDisabled,
          "data-disabled": isDisabled ? "" : void 0,
          "data-placeholder": shouldShowPlaceholder(context.value) ? "" : void 0,
          ...triggerProps,
          ref: composedRefs,
          onClick: composeEventHandlers(triggerProps.onClick, (event) => {
            event.currentTarget.focus();
            if (pointerTypeRef.current !== "mouse") {
              handleOpen(event);
            }
          }),
          onPointerDown: composeEventHandlers(triggerProps.onPointerDown, (event) => {
            pointerTypeRef.current = event.pointerType;
            const target = event.target;
            if (target.hasPointerCapture(event.pointerId)) {
              target.releasePointerCapture(event.pointerId);
            }
            if (event.button === 0 && event.ctrlKey === false && event.pointerType === "mouse") {
              handleOpen(event);
              event.preventDefault();
            }
          }),
          onKeyDown: composeEventHandlers(triggerProps.onKeyDown, (event) => {
            const isTypingAhead = searchRef.current !== "";
            const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
            if (!isModifierKey && event.key.length === 1) handleTypeaheadSearch(event.key);
            if (isTypingAhead && event.key === " ") return;
            if (OPEN_KEYS.includes(event.key)) {
              handleOpen();
              event.preventDefault();
            }
          })
        }
      ) });
    }, "SelectTrigger")
  );
  var VALUE_NAME = "SelectValue";
  var SelectValue = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name33(function SelectValue2(props, forwardedRef) {
      const { __scopeSelect, className, style, children, placeholder = "", ...valueProps } = props;
      const context = useSelectContext(VALUE_NAME, __scopeSelect);
      const { onValueNodeHasChildrenChange } = context;
      const hasChildren = children !== void 0;
      const composedRefs = useComposedRefs(forwardedRef, context.onValueNodeChange);
      useLayoutEffect2(() => {
        onValueNodeHasChildrenChange(hasChildren);
      }, [onValueNodeHasChildrenChange, hasChildren]);
      const showPlaceholder = shouldShowPlaceholder(context.value);
      return /* @__PURE__ */ jsx(
        Primitive.span,
        {
          ...valueProps,
          asChild: showPlaceholder ? false : valueProps.asChild,
          ref: composedRefs,
          style: { pointerEvents: "none" },
          children: /* @__PURE__ */ jsx(Fragment, { children: showPlaceholder ? placeholder : children }, showPlaceholder ? "placeholder" : "value")
        }
      );
    }, "SelectValue")
  );
  var SelectIcon = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name33(function SelectIcon2(props, forwardedRef) {
      const { __scopeSelect, children, ...iconProps } = props;
      return /* @__PURE__ */ jsx(Primitive.span, { "aria-hidden": true, ...iconProps, ref: forwardedRef, children: children || "\u25BC" });
    }, "SelectIcon")
  );
  var PORTAL_NAME4 = "SelectPortal";
  var [PortalProvider4, usePortalContext4] = createSelectContext(PORTAL_NAME4, {
    forceMount: void 0
  });
  var SelectPortal = /* @__PURE__ */ __name33((props) => {
    const { __scopeSelect, forceMount, ...portalProps } = props;
    return /* @__PURE__ */ jsx(PortalProvider4, { scope: props.__scopeSelect, forceMount, children: /* @__PURE__ */ jsx(Portal, { asChild: true, ...portalProps }) });
  }, "SelectPortal");
  var CONTENT_NAME8 = "SelectContent";
  var SelectContent = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name33(function SelectContent2(props, forwardedRef) {
      const portalContext = usePortalContext4(CONTENT_NAME8, props.__scopeSelect);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = useSelectContext(CONTENT_NAME8, props.__scopeSelect);
      const [fragment, setFragment] = useState();
      useLayoutEffect2(() => {
        setFragment(new DocumentFragment());
      }, []);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: ({ present }) => present ? /* @__PURE__ */ jsx(SelectContentImpl, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(SelectContentFragment, { ...contentProps, fragment }) });
    }, "SelectContent")
  );
  var SelectContentFragment = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name33(function SelectContentFragment2(props, forwardedRef) {
    const { __scopeSelect, children, fragment } = props;
    if (!fragment) return null;
    return createPortal(
      /* @__PURE__ */ jsx(SelectContentProvider, { scope: __scopeSelect, children: /* @__PURE__ */ jsx(Collection3.Slot, { scope: __scopeSelect, children: /* @__PURE__ */ jsx("div", { ref: forwardedRef, children }) }) }),
      fragment
    );
  }, "SelectContentFragment"));
  var CONTENT_MARGIN = 10;
  var [SelectContentProvider, useSelectContentContext] = createSelectContext(CONTENT_NAME8);
  var Slot5 = createSlot("SelectContent.RemoveScroll");
  var SelectContentImpl = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name33(function SelectContentImpl2(props, forwardedRef) {
      const { __scopeSelect } = props;
      const {
        position = "item-aligned",
        onCloseAutoFocus,
        onEscapeKeyDown,
        onPointerDownOutside,
        //
        // PopperContent props
        side,
        sideOffset,
        align,
        alignOffset,
        arrowPadding,
        collisionBoundary,
        collisionPadding,
        sticky,
        hideWhenDetached,
        avoidCollisions,
        //
        ...contentProps
      } = props;
      const context = useSelectContext(CONTENT_NAME8, __scopeSelect);
      const [content, setContent] = useState(null);
      const [viewport, setViewport] = useState(null);
      const composedRefs = useComposedRefs(forwardedRef, setContent);
      const [selectedItem, setSelectedItem] = useState(null);
      const [selectedItemText, setSelectedItemText] = useState(
        null
      );
      const getItems = useCollection3(__scopeSelect);
      const [isPositioned, setIsPositioned] = useState(false);
      const firstValidItemFoundRef = useRef(false);
      useEffect(() => {
        if (content) return hideOthers(content);
      }, [content]);
      useFocusGuards();
      const focusFirst4 = useCallback(
        (candidates) => {
          const [firstItem, ...restItems] = getItems().map((item) => item.ref.current);
          const [lastItem] = restItems.slice(-1);
          const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
          for (const candidate of candidates) {
            if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
            candidate?.scrollIntoView({ block: "nearest" });
            if (candidate === firstItem && viewport) viewport.scrollTop = 0;
            if (candidate === lastItem && viewport) viewport.scrollTop = viewport.scrollHeight;
            candidate?.focus();
            if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
          }
        },
        [getItems, viewport]
      );
      const focusSelectedItem = useCallback(
        () => focusFirst4([selectedItem, content]),
        [focusFirst4, selectedItem, content]
      );
      useEffect(() => {
        if (isPositioned) {
          focusSelectedItem();
        }
      }, [isPositioned, focusSelectedItem]);
      const { onOpenChange, triggerPointerDownPosRef } = context;
      useEffect(() => {
        if (content) {
          let pointerMoveDelta = { x: 0, y: 0 };
          const handlePointerMove = /* @__PURE__ */ __name33((event) => {
            pointerMoveDelta = {
              x: Math.abs(Math.round(event.pageX) - (triggerPointerDownPosRef.current?.x ?? 0)),
              y: Math.abs(Math.round(event.pageY) - (triggerPointerDownPosRef.current?.y ?? 0))
            };
          }, "handlePointerMove");
          const handlePointerUp = /* @__PURE__ */ __name33((event) => {
            if (pointerMoveDelta.x <= 10 && pointerMoveDelta.y <= 10) {
              event.preventDefault();
            } else {
              if (!event.composedPath().includes(content)) {
                onOpenChange(false);
              }
            }
            document.removeEventListener("pointermove", handlePointerMove);
            triggerPointerDownPosRef.current = null;
          }, "handlePointerUp");
          if (triggerPointerDownPosRef.current !== null) {
            document.addEventListener("pointermove", handlePointerMove);
            document.addEventListener("pointerup", handlePointerUp, { capture: true, once: true });
          }
          return () => {
            document.removeEventListener("pointermove", handlePointerMove);
            document.removeEventListener("pointerup", handlePointerUp, { capture: true });
          };
        }
      }, [content, onOpenChange, triggerPointerDownPosRef]);
      useEffect(() => {
        const close = /* @__PURE__ */ __name33(() => onOpenChange(false), "close");
        window.addEventListener("blur", close);
        window.addEventListener("resize", close);
        return () => {
          window.removeEventListener("blur", close);
          window.removeEventListener("resize", close);
        };
      }, [onOpenChange]);
      const [searchRef, handleTypeaheadSearch] = useTypeaheadSearch((search) => {
        const enabledItems = getItems().filter((item) => !item.disabled);
        const currentItem = enabledItems.find((item) => item.ref.current === document.activeElement);
        const nextItem = findNextItem(enabledItems, search, currentItem);
        if (nextItem) {
          setTimeout(() => nextItem.ref.current?.focus());
        }
      });
      const itemRefCallback = useCallback(
        (node, value, disabled) => {
          const isFirstValidItem = !firstValidItemFoundRef.current && !disabled;
          const isSelectedItem = context.value !== void 0 && context.value === value;
          if (isSelectedItem || isFirstValidItem) {
            setSelectedItem(node);
            if (isFirstValidItem) firstValidItemFoundRef.current = true;
          }
        },
        [context.value]
      );
      const handleItemLeave = useCallback(() => content?.focus(), [content]);
      const itemTextRefCallback = useCallback(
        (node, value, disabled) => {
          const isFirstValidItem = !firstValidItemFoundRef.current && !disabled;
          const isSelectedItem = context.value !== void 0 && context.value === value;
          if (isSelectedItem || isFirstValidItem) {
            setSelectedItemText(node);
          }
        },
        [context.value]
      );
      const SelectPosition = position === "popper" ? SelectPopperPosition : SelectItemAlignedPosition;
      const popperContentProps = SelectPosition === SelectPopperPosition ? {
        side,
        sideOffset,
        align,
        alignOffset,
        arrowPadding,
        collisionBoundary,
        collisionPadding,
        sticky,
        hideWhenDetached,
        avoidCollisions
      } : {};
      return /* @__PURE__ */ jsx(
        SelectContentProvider,
        {
          scope: __scopeSelect,
          content,
          viewport,
          onViewportChange: setViewport,
          itemRefCallback,
          selectedItem,
          onItemLeave: handleItemLeave,
          itemTextRefCallback,
          focusSelectedItem,
          selectedItemText,
          position,
          isPositioned,
          searchRef,
          children: /* @__PURE__ */ jsx(Combination_default, { as: Slot5, allowPinchZoom: true, children: /* @__PURE__ */ jsx(
            FocusScope,
            {
              asChild: true,
              trapped: context.open,
              onMountAutoFocus: (event) => {
                event.preventDefault();
              },
              onUnmountAutoFocus: composeEventHandlers(onCloseAutoFocus, (event) => {
                context.trigger?.focus({ preventScroll: true });
                event.preventDefault();
              }),
              children: /* @__PURE__ */ jsx(
                DismissableLayer,
                {
                  asChild: true,
                  disableOutsidePointerEvents: true,
                  onEscapeKeyDown,
                  onPointerDownOutside,
                  onFocusOutside: (event) => event.preventDefault(),
                  onDismiss: () => context.onOpenChange(false),
                  children: /* @__PURE__ */ jsx(
                    SelectPosition,
                    {
                      role: "listbox",
                      id: context.contentId,
                      "data-state": context.open ? "open" : "closed",
                      dir: context.dir,
                      onContextMenu: (event) => event.preventDefault(),
                      ...contentProps,
                      ...popperContentProps,
                      onPlaced: () => setIsPositioned(true),
                      ref: composedRefs,
                      style: {
                        // flex layout so we can place the scroll buttons properly
                        display: "flex",
                        flexDirection: "column",
                        // reset the outline by default as the content MAY get focused
                        outline: "none",
                        ...contentProps.style
                      },
                      onKeyDown: composeEventHandlers(contentProps.onKeyDown, (event) => {
                        const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
                        if (event.key === "Tab") event.preventDefault();
                        if (!isModifierKey && event.key.length === 1) handleTypeaheadSearch(event.key);
                        if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
                          const items = getItems().filter((item) => !item.disabled);
                          let candidateNodes = items.map((item) => item.ref.current);
                          if (["ArrowUp", "End"].includes(event.key)) {
                            candidateNodes = candidateNodes.slice().reverse();
                          }
                          if (["ArrowUp", "ArrowDown"].includes(event.key)) {
                            const currentElement = event.target;
                            const currentIndex = candidateNodes.indexOf(currentElement);
                            candidateNodes = candidateNodes.slice(currentIndex + 1);
                          }
                          setTimeout(() => focusFirst4(candidateNodes));
                          event.preventDefault();
                        }
                      })
                    }
                  )
                }
              )
            }
          ) })
        }
      );
    }, "SelectContentImpl")
  );
  var SelectItemAlignedPosition = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name33(function SelectItemAlignedPosition2(props, forwardedRef) {
    const { __scopeSelect, onPlaced, ...popperProps } = props;
    const context = useSelectContext(CONTENT_NAME8, __scopeSelect);
    const contentContext = useSelectContentContext(CONTENT_NAME8, __scopeSelect);
    const [contentWrapper, setContentWrapper] = useState(null);
    const [content, setContent] = useState(null);
    const composedRefs = useComposedRefs(forwardedRef, setContent);
    const getItems = useCollection3(__scopeSelect);
    const shouldExpandOnScrollRef = useRef(false);
    const shouldRepositionRef = useRef(true);
    const { viewport, selectedItem, selectedItemText, focusSelectedItem } = contentContext;
    const position = useCallback(() => {
      if (context.trigger && context.valueNode && contentWrapper && content && viewport && selectedItem && selectedItemText) {
        const triggerRect = context.trigger.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        const valueNodeRect = context.valueNode.getBoundingClientRect();
        const itemTextRect = selectedItemText.getBoundingClientRect();
        if (context.dir !== "rtl") {
          const itemTextOffset = itemTextRect.left - contentRect.left;
          const left = valueNodeRect.left - itemTextOffset;
          const leftDelta = triggerRect.left - left;
          const minContentWidth = triggerRect.width + leftDelta;
          const contentWidth = Math.max(minContentWidth, contentRect.width);
          const rightEdge = window.innerWidth - CONTENT_MARGIN;
          const clampedLeft = clamp2(left, [
            CONTENT_MARGIN,
            // Prevents the content from going off the starting edge of the
            // viewport. It may still go off the ending edge, but this can be
            // controlled by the user since they may want to manage overflow in a
            // specific way.
            // https://github.com/radix-ui/primitives/issues/2049
            Math.max(CONTENT_MARGIN, rightEdge - contentWidth)
          ]);
          contentWrapper.style.minWidth = minContentWidth + "px";
          contentWrapper.style.left = clampedLeft + "px";
        } else {
          const itemTextOffset = contentRect.right - itemTextRect.right;
          const right = window.innerWidth - valueNodeRect.right - itemTextOffset;
          const rightDelta = window.innerWidth - triggerRect.right - right;
          const minContentWidth = triggerRect.width + rightDelta;
          const contentWidth = Math.max(minContentWidth, contentRect.width);
          const leftEdge = window.innerWidth - CONTENT_MARGIN;
          const clampedRight = clamp2(right, [
            CONTENT_MARGIN,
            Math.max(CONTENT_MARGIN, leftEdge - contentWidth)
          ]);
          contentWrapper.style.minWidth = minContentWidth + "px";
          contentWrapper.style.right = clampedRight + "px";
        }
        const items = getItems();
        const availableHeight = window.innerHeight - CONTENT_MARGIN * 2;
        const itemsHeight = viewport.scrollHeight;
        const contentStyles = window.getComputedStyle(content);
        const contentBorderTopWidth = parseInt(contentStyles.borderTopWidth, 10);
        const contentPaddingTop = parseInt(contentStyles.paddingTop, 10);
        const contentBorderBottomWidth = parseInt(contentStyles.borderBottomWidth, 10);
        const contentPaddingBottom = parseInt(contentStyles.paddingBottom, 10);
        const fullContentHeight = contentBorderTopWidth + contentPaddingTop + itemsHeight + contentPaddingBottom + contentBorderBottomWidth;
        const minContentHeight = Math.min(selectedItem.offsetHeight * 5, fullContentHeight);
        const viewportStyles = window.getComputedStyle(viewport);
        const viewportPaddingTop = parseInt(viewportStyles.paddingTop, 10);
        const viewportPaddingBottom = parseInt(viewportStyles.paddingBottom, 10);
        const topEdgeToTriggerMiddle = triggerRect.top + triggerRect.height / 2 - CONTENT_MARGIN;
        const triggerMiddleToBottomEdge = availableHeight - topEdgeToTriggerMiddle;
        const selectedItemHalfHeight = selectedItem.offsetHeight / 2;
        const itemOffsetMiddle = selectedItem.offsetTop + selectedItemHalfHeight;
        const contentTopToItemMiddle = contentBorderTopWidth + contentPaddingTop + itemOffsetMiddle;
        const itemMiddleToContentBottom = fullContentHeight - contentTopToItemMiddle;
        const willAlignWithoutTopOverflow = contentTopToItemMiddle <= topEdgeToTriggerMiddle;
        if (willAlignWithoutTopOverflow) {
          const isLastItem = items.length > 0 && selectedItem === items[items.length - 1].ref.current;
          contentWrapper.style.bottom = "0px";
          const viewportOffsetBottom = content.clientHeight - viewport.offsetTop - viewport.offsetHeight;
          const clampedTriggerMiddleToBottomEdge = Math.max(
            triggerMiddleToBottomEdge,
            selectedItemHalfHeight + // viewport might have padding bottom, include it to avoid a scrollable viewport
            (isLastItem ? viewportPaddingBottom : 0) + viewportOffsetBottom + contentBorderBottomWidth
          );
          const height = contentTopToItemMiddle + clampedTriggerMiddleToBottomEdge;
          contentWrapper.style.height = height + "px";
        } else {
          const isFirstItem = items.length > 0 && selectedItem === items[0].ref.current;
          contentWrapper.style.top = "0px";
          const clampedTopEdgeToTriggerMiddle = Math.max(
            topEdgeToTriggerMiddle,
            contentBorderTopWidth + viewport.offsetTop + // viewport might have padding top, include it to avoid a scrollable viewport
            (isFirstItem ? viewportPaddingTop : 0) + selectedItemHalfHeight
          );
          const height = clampedTopEdgeToTriggerMiddle + itemMiddleToContentBottom;
          contentWrapper.style.height = height + "px";
          viewport.scrollTop = contentTopToItemMiddle - topEdgeToTriggerMiddle + viewport.offsetTop;
        }
        contentWrapper.style.margin = `${CONTENT_MARGIN}px 0`;
        contentWrapper.style.minHeight = minContentHeight + "px";
        contentWrapper.style.maxHeight = availableHeight + "px";
        onPlaced?.();
        requestAnimationFrame(() => shouldExpandOnScrollRef.current = true);
      }
    }, [
      getItems,
      context.trigger,
      context.valueNode,
      contentWrapper,
      content,
      viewport,
      selectedItem,
      selectedItemText,
      context.dir,
      onPlaced
    ]);
    useLayoutEffect2(() => position(), [position]);
    const [contentZIndex, setContentZIndex] = useState();
    useLayoutEffect2(() => {
      if (content) setContentZIndex(window.getComputedStyle(content).zIndex);
    }, [content]);
    const handleScrollButtonChange = useCallback(
      (node) => {
        if (node && shouldRepositionRef.current === true) {
          position();
          focusSelectedItem?.();
          shouldRepositionRef.current = false;
        }
      },
      [position, focusSelectedItem]
    );
    return /* @__PURE__ */ jsx(
      SelectViewportProvider,
      {
        scope: __scopeSelect,
        contentWrapper,
        shouldExpandOnScrollRef,
        onScrollButtonChange: handleScrollButtonChange,
        children: /* @__PURE__ */ jsx(
          "div",
          {
            ref: setContentWrapper,
            style: {
              display: "flex",
              flexDirection: "column",
              position: "fixed",
              zIndex: contentZIndex
            },
            children: /* @__PURE__ */ jsx(
              Primitive.div,
              {
                ...popperProps,
                ref: composedRefs,
                style: {
                  // When we get the height of the content, it includes borders. If we were to set
                  // the height without having `boxSizing: 'border-box'` it would be too big.
                  boxSizing: "border-box",
                  // We need to ensure the content doesn't get taller than the wrapper
                  maxHeight: "100%",
                  ...popperProps.style
                }
              }
            )
          }
        )
      }
    );
  }, "SelectItemAlignedPosition"));
  var SelectPopperPosition = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name33(function SelectPopperPosition2(props, forwardedRef) {
    const {
      __scopeSelect,
      align = "start",
      collisionPadding = CONTENT_MARGIN,
      ...popperProps
    } = props;
    const popperScope = usePopperScope3(__scopeSelect);
    return /* @__PURE__ */ jsx(
      Content3,
      {
        ...popperScope,
        ...popperProps,
        ref: forwardedRef,
        align,
        collisionPadding,
        style: {
          // Ensure border-box for floating-ui calculations
          boxSizing: "border-box",
          ...popperProps.style,
          // re-namespace exposed content custom properties
          ...{
            "--radix-select-content-transform-origin": "var(--radix-popper-transform-origin)",
            "--radix-select-content-available-width": "var(--radix-popper-available-width)",
            "--radix-select-content-available-height": "var(--radix-popper-available-height)",
            "--radix-select-trigger-width": "var(--radix-popper-anchor-width)",
            "--radix-select-trigger-height": "var(--radix-popper-anchor-height)"
          }
        }
      }
    );
  }, "SelectPopperPosition"));
  var [SelectViewportProvider, useSelectViewportContext] = createSelectContext(CONTENT_NAME8, {});
  var VIEWPORT_NAME2 = "SelectViewport";
  var SelectViewport = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name33(function SelectViewport2(props, forwardedRef) {
      const { __scopeSelect, nonce, ...viewportProps } = props;
      const contentContext = useSelectContentContext(VIEWPORT_NAME2, __scopeSelect);
      const viewportContext = useSelectViewportContext(VIEWPORT_NAME2, __scopeSelect);
      const composedRefs = useComposedRefs(forwardedRef, contentContext.onViewportChange);
      const prevScrollTopRef = useRef(0);
      return /* @__PURE__ */ jsxs(Fragment2, { children: [
        /* @__PURE__ */ jsx(
          "style",
          {
            dangerouslySetInnerHTML: {
              __html: `[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}`
            },
            nonce
          }
        ),
        /* @__PURE__ */ jsx(Collection3.Slot, { scope: __scopeSelect, children: /* @__PURE__ */ jsx(
          Primitive.div,
          {
            "data-radix-select-viewport": "",
            role: "presentation",
            ...viewportProps,
            ref: composedRefs,
            style: {
              // we use position: 'relative' here on the `viewport` so that when we call
              // `selectedItem.offsetTop` in calculations, the offset is relative to the viewport
              // (independent of the scrollUpButton).
              position: "relative",
              flex: 1,
              // Viewport should only be scrollable in the vertical direction.
              // This won't work in vertical writing modes, so we'll need to
              // revisit this if/when that is supported
              // https://developer.chrome.com/blog/vertical-form-controls
              overflow: "hidden auto",
              ...viewportProps.style
            },
            onScroll: composeEventHandlers(viewportProps.onScroll, (event) => {
              const viewport = event.currentTarget;
              const { contentWrapper, shouldExpandOnScrollRef } = viewportContext;
              if (shouldExpandOnScrollRef?.current && contentWrapper) {
                const scrolledBy = Math.abs(prevScrollTopRef.current - viewport.scrollTop);
                if (scrolledBy > 0) {
                  const availableHeight = window.innerHeight - CONTENT_MARGIN * 2;
                  const cssMinHeight = parseFloat(contentWrapper.style.minHeight);
                  const cssHeight = parseFloat(contentWrapper.style.height);
                  const prevHeight = Math.max(cssMinHeight, cssHeight);
                  if (prevHeight < availableHeight) {
                    const nextHeight = prevHeight + scrolledBy;
                    const clampedNextHeight = Math.min(availableHeight, nextHeight);
                    const heightDiff = nextHeight - clampedNextHeight;
                    contentWrapper.style.height = clampedNextHeight + "px";
                    if (contentWrapper.style.bottom === "0px") {
                      viewport.scrollTop = heightDiff > 0 ? heightDiff : 0;
                      contentWrapper.style.justifyContent = "flex-end";
                    }
                  }
                }
              }
              prevScrollTopRef.current = viewport.scrollTop;
            })
          }
        ) })
      ] });
    }, "SelectViewport")
  );
  var GROUP_NAME2 = "SelectGroup";
  var [SelectGroupContextProvider, useSelectGroupContext] = createSelectContext(GROUP_NAME2);
  var SelectGroup = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name33(function SelectGroup2(props, forwardedRef) {
      const { __scopeSelect, ...groupProps } = props;
      const groupId = useId2();
      return /* @__PURE__ */ jsx(SelectGroupContextProvider, { scope: __scopeSelect, id: groupId, children: /* @__PURE__ */ jsx(Primitive.div, { role: "group", "aria-labelledby": groupId, ...groupProps, ref: forwardedRef }) });
    }, "SelectGroup")
  );
  var LABEL_NAME = "SelectLabel";
  var SelectLabel = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name33(function SelectLabel2(props, forwardedRef) {
      const { __scopeSelect, ...labelProps } = props;
      const groupContext = useSelectGroupContext(LABEL_NAME, __scopeSelect);
      return /* @__PURE__ */ jsx(Primitive.div, { id: groupContext.id, ...labelProps, ref: forwardedRef });
    }, "SelectLabel")
  );
  var ITEM_NAME3 = "SelectItem";
  var [SelectItemContextProvider, useSelectItemContext] = createSelectContext(ITEM_NAME3);
  var SelectItem = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name33(function SelectItem2(props, forwardedRef) {
      const {
        __scopeSelect,
        value,
        disabled = false,
        textValue: textValueProp,
        ...itemProps
      } = props;
      const context = useSelectContext(ITEM_NAME3, __scopeSelect);
      const contentContext = useSelectContentContext(ITEM_NAME3, __scopeSelect);
      const isSelected = context.value === value;
      const [textValue, setTextValue] = useState(textValueProp ?? "");
      const [isFocused, setIsFocused] = useState(false);
      const handleItemRefCallback = useCallbackRef(
        (node) => contentContext.itemRefCallback?.(node, value, disabled)
      );
      const composedRefs = useComposedRefs(forwardedRef, handleItemRefCallback);
      const textId = useId2();
      const pointerTypeRef = useRef("touch");
      const handleSelect = /* @__PURE__ */ __name33(() => {
        if (!disabled) {
          context.onValueChange(value);
          context.onOpenChange(false);
        }
      }, "handleSelect");
      return /* @__PURE__ */ jsx(
        SelectItemContextProvider,
        {
          scope: __scopeSelect,
          value,
          disabled,
          textId,
          isSelected,
          onItemTextChange: useCallback((node) => {
            setTextValue((prevTextValue) => prevTextValue || (node?.textContent ?? "").trim());
          }, []),
          children: /* @__PURE__ */ jsx(
            Collection3.ItemSlot,
            {
              scope: __scopeSelect,
              value,
              disabled,
              textValue,
              children: /* @__PURE__ */ jsx(
                Primitive.div,
                {
                  role: "option",
                  "aria-labelledby": textId,
                  "data-highlighted": isFocused ? "" : void 0,
                  "aria-selected": isSelected && isFocused,
                  "data-state": isSelected ? "checked" : "unchecked",
                  "aria-disabled": disabled || void 0,
                  "data-disabled": disabled ? "" : void 0,
                  tabIndex: disabled ? void 0 : -1,
                  ...itemProps,
                  ref: composedRefs,
                  onFocus: composeEventHandlers(itemProps.onFocus, () => setIsFocused(true)),
                  onBlur: composeEventHandlers(itemProps.onBlur, () => setIsFocused(false)),
                  onClick: composeEventHandlers(itemProps.onClick, () => {
                    if (pointerTypeRef.current !== "mouse") handleSelect();
                  }),
                  onPointerUp: composeEventHandlers(itemProps.onPointerUp, () => {
                    if (pointerTypeRef.current === "mouse") handleSelect();
                  }),
                  onPointerDown: composeEventHandlers(itemProps.onPointerDown, (event) => {
                    pointerTypeRef.current = event.pointerType;
                  }),
                  onPointerMove: composeEventHandlers(itemProps.onPointerMove, (event) => {
                    pointerTypeRef.current = event.pointerType;
                    if (disabled) {
                      contentContext.onItemLeave?.();
                    } else if (pointerTypeRef.current === "mouse") {
                      event.currentTarget.focus({ preventScroll: true });
                    }
                  }),
                  onPointerLeave: composeEventHandlers(itemProps.onPointerLeave, (event) => {
                    if (event.currentTarget === document.activeElement) {
                      contentContext.onItemLeave?.();
                    }
                  }),
                  onKeyDown: composeEventHandlers(itemProps.onKeyDown, (event) => {
                    if (disabled || event.target !== event.currentTarget) {
                      return;
                    }
                    const isTypingAhead = contentContext.searchRef?.current !== "";
                    if (isTypingAhead && event.key === " ") {
                      return;
                    }
                    if (SELECTION_KEYS2.includes(event.key)) {
                      handleSelect();
                    }
                    if (event.key === " ") {
                      event.preventDefault();
                    }
                  })
                }
              )
            }
          )
        }
      );
    }, "SelectItem")
  );
  var ITEM_TEXT_NAME = "SelectItemText";
  var SelectItemText = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name33(function SelectItemText2(props, forwardedRef) {
      const { __scopeSelect, className, style, ...itemTextProps } = props;
      const context = useSelectContext(ITEM_TEXT_NAME, __scopeSelect);
      const contentContext = useSelectContentContext(ITEM_TEXT_NAME, __scopeSelect);
      const itemContext = useSelectItemContext(ITEM_TEXT_NAME, __scopeSelect);
      const nativeOptionsContext = useSelectNativeOptionsContext(ITEM_TEXT_NAME, __scopeSelect);
      const [itemTextNode, setItemTextNode] = useState(null);
      const handleItemTextRefCallback = useCallbackRef(
        (node) => contentContext.itemTextRefCallback?.(node, itemContext.value, itemContext.disabled)
      );
      const composedRefs = useComposedRefs(
        forwardedRef,
        setItemTextNode,
        itemContext.onItemTextChange,
        handleItemTextRefCallback
      );
      const textContent = itemTextNode?.textContent;
      const nativeOption = useMemo(
        () => /* @__PURE__ */ jsx("option", { value: itemContext.value, disabled: itemContext.disabled, children: textContent }, itemContext.value),
        [itemContext.disabled, itemContext.value, textContent]
      );
      const { onNativeOptionAdd, onNativeOptionRemove } = nativeOptionsContext;
      useLayoutEffect2(() => {
        onNativeOptionAdd(nativeOption);
        return () => onNativeOptionRemove(nativeOption);
      }, [onNativeOptionAdd, onNativeOptionRemove, nativeOption]);
      return /* @__PURE__ */ jsxs(Fragment2, { children: [
        /* @__PURE__ */ jsx(Primitive.span, { id: itemContext.textId, ...itemTextProps, ref: composedRefs }),
        itemContext.isSelected && context.valueNode && !context.valueNodeHasChildren && !shouldShowPlaceholder(context.value) ? createPortal(itemTextProps.children, context.valueNode) : null
      ] });
    }, "SelectItemText")
  );
  var ITEM_INDICATOR_NAME2 = "SelectItemIndicator";
  var SelectItemIndicator = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name33(function SelectItemIndicator2(props, forwardedRef) {
      const { __scopeSelect, ...itemIndicatorProps } = props;
      const itemContext = useSelectItemContext(ITEM_INDICATOR_NAME2, __scopeSelect);
      return itemContext.isSelected ? /* @__PURE__ */ jsx(Primitive.span, { "aria-hidden": true, ...itemIndicatorProps, ref: forwardedRef }) : null;
    }, "SelectItemIndicator")
  );
  var SCROLL_UP_BUTTON_NAME = "SelectScrollUpButton";
  var SelectScrollUpButton = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name33(function SelectScrollUpButton2(props, forwardedRef) {
    const contentContext = useSelectContentContext(SCROLL_UP_BUTTON_NAME, props.__scopeSelect);
    const viewportContext = useSelectViewportContext(SCROLL_UP_BUTTON_NAME, props.__scopeSelect);
    const [canScrollUp, setCanScrollUp] = useState(false);
    const composedRefs = useComposedRefs(forwardedRef, viewportContext.onScrollButtonChange);
    useLayoutEffect2(() => {
      if (contentContext.viewport && contentContext.isPositioned) {
        let handleScroll22 = function() {
          const canScrollUp2 = viewport.scrollTop > 0;
          setCanScrollUp(canScrollUp2);
        };
        var handleScroll2 = handleScroll22;
        __name33(handleScroll22, "handleScroll");
        const viewport = contentContext.viewport;
        handleScroll22();
        viewport.addEventListener("scroll", handleScroll22);
        return () => viewport.removeEventListener("scroll", handleScroll22);
      }
    }, [contentContext.viewport, contentContext.isPositioned]);
    return canScrollUp ? /* @__PURE__ */ jsx(
      SelectScrollButtonImpl,
      {
        ...props,
        ref: composedRefs,
        onAutoScroll: () => {
          const { viewport, selectedItem } = contentContext;
          if (viewport && selectedItem) {
            viewport.scrollTop = viewport.scrollTop - selectedItem.offsetHeight;
          }
        }
      }
    ) : null;
  }, "SelectScrollUpButton"));
  var SCROLL_DOWN_BUTTON_NAME = "SelectScrollDownButton";
  var SelectScrollDownButton = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name33(function SelectScrollDownButton2(props, forwardedRef) {
    const contentContext = useSelectContentContext(SCROLL_DOWN_BUTTON_NAME, props.__scopeSelect);
    const viewportContext = useSelectViewportContext(SCROLL_DOWN_BUTTON_NAME, props.__scopeSelect);
    const [canScrollDown, setCanScrollDown] = useState(false);
    const composedRefs = useComposedRefs(forwardedRef, viewportContext.onScrollButtonChange);
    useLayoutEffect2(() => {
      if (contentContext.viewport && contentContext.isPositioned) {
        let handleScroll22 = function() {
          const maxScroll = viewport.scrollHeight - viewport.clientHeight;
          const canScrollDown2 = Math.ceil(viewport.scrollTop) < maxScroll;
          setCanScrollDown(canScrollDown2);
        };
        var handleScroll2 = handleScroll22;
        __name33(handleScroll22, "handleScroll");
        const viewport = contentContext.viewport;
        handleScroll22();
        viewport.addEventListener("scroll", handleScroll22);
        return () => viewport.removeEventListener("scroll", handleScroll22);
      }
    }, [contentContext.viewport, contentContext.isPositioned]);
    return canScrollDown ? /* @__PURE__ */ jsx(
      SelectScrollButtonImpl,
      {
        ...props,
        ref: composedRefs,
        onAutoScroll: () => {
          const { viewport, selectedItem } = contentContext;
          if (viewport && selectedItem) {
            viewport.scrollTop = viewport.scrollTop + selectedItem.offsetHeight;
          }
        }
      }
    ) : null;
  }, "SelectScrollDownButton"));
  var SelectScrollButtonImpl = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name33(function SelectScrollButtonImpl2(props, forwardedRef) {
    const { __scopeSelect, onAutoScroll, ...scrollIndicatorProps } = props;
    const contentContext = useSelectContentContext("SelectScrollButton", __scopeSelect);
    const autoScrollTimerRef = useRef(null);
    const getItems = useCollection3(__scopeSelect);
    const clearAutoScrollTimer = useCallback(() => {
      if (autoScrollTimerRef.current !== null) {
        window.clearInterval(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
    }, []);
    useEffect(() => {
      return () => clearAutoScrollTimer();
    }, [clearAutoScrollTimer]);
    useLayoutEffect2(() => {
      const activeItem = getItems().find((item) => item.ref.current === document.activeElement);
      activeItem?.ref.current?.scrollIntoView({ block: "nearest" });
    }, [getItems]);
    return /* @__PURE__ */ jsx(
      Primitive.div,
      {
        "aria-hidden": true,
        ...scrollIndicatorProps,
        ref: forwardedRef,
        style: { flexShrink: 0, ...scrollIndicatorProps.style },
        onPointerDown: composeEventHandlers(scrollIndicatorProps.onPointerDown, () => {
          if (autoScrollTimerRef.current === null) {
            autoScrollTimerRef.current = window.setInterval(onAutoScroll, 50);
          }
        }),
        onPointerMove: composeEventHandlers(scrollIndicatorProps.onPointerMove, () => {
          contentContext.onItemLeave?.();
          if (autoScrollTimerRef.current === null) {
            autoScrollTimerRef.current = window.setInterval(onAutoScroll, 50);
          }
        }),
        onPointerLeave: composeEventHandlers(scrollIndicatorProps.onPointerLeave, () => {
          clearAutoScrollTimer();
        })
      }
    );
  }, "SelectScrollButtonImpl"));
  var SelectSeparator = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name33(function SelectSeparator2(props, forwardedRef) {
      const { __scopeSelect, ...separatorProps } = props;
      return /* @__PURE__ */ jsx(Primitive.div, { "aria-hidden": true, ...separatorProps, ref: forwardedRef });
    }, "SelectSeparator")
  );
  var ARROW_NAME2 = "SelectArrow";
  var SelectArrow = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name33(function SelectArrow2(props, forwardedRef) {
      const { __scopeSelect, ...arrowProps } = props;
      const popperScope = usePopperScope3(__scopeSelect);
      const contentContext = useSelectContentContext(ARROW_NAME2, __scopeSelect);
      return contentContext.position === "popper" ? /* @__PURE__ */ jsx(Arrow3, { ...popperScope, ...arrowProps, ref: forwardedRef }) : null;
    }, "SelectArrow")
  );
  var BUBBLE_INPUT_NAME = "SelectBubbleInput";
  var SelectBubbleInput = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name33(function SelectBubbleInput2({ __scopeSelect, ...props }, forwardedRef) {
      const context = useSelectContext(BUBBLE_INPUT_NAME, __scopeSelect);
      const { value, onValueChange, required, disabled, name, autoComplete, form } = context;
      const { nativeOptions, nativeSelectKey } = context;
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      const selectValue = value ?? "";
      const prevValue = usePrevious(selectValue);
      const hasEmptyValueOption = Array.from(nativeOptions).some(
        (option) => (option.props.value ?? "") === ""
      );
      useEffect(() => {
        const select = ref.current;
        if (!select) return;
        const selectProto = window.HTMLSelectElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(
          selectProto,
          "value"
        );
        const setValue = descriptor.set;
        if (prevValue !== selectValue && setValue) {
          const event = new Event("change", { bubbles: true });
          setValue.call(select, selectValue);
          select.dispatchEvent(event);
        }
      }, [prevValue, selectValue]);
      return /* @__PURE__ */ jsxs(
        Primitive.select,
        {
          "aria-hidden": true,
          required,
          tabIndex: -1,
          name,
          autoComplete,
          disabled,
          form,
          onChange: (event) => onValueChange(event.target.value),
          ...props,
          style: { ...VISUALLY_HIDDEN_STYLES, ...props.style },
          ref: composedRefs,
          defaultValue: selectValue,
          children: [
            shouldShowPlaceholder(value) && !hasEmptyValueOption ? /* @__PURE__ */ jsx("option", { value: "" }) : null,
            Array.from(nativeOptions)
          ]
        },
        nativeSelectKey
      );
    }, "SelectBubbleInput")
  );
  function isFunction2(value) {
    return typeof value === "function";
  }
  __name33(isFunction2, "isFunction");
  function shouldShowPlaceholder(value) {
    return value === "" || value === void 0;
  }
  __name33(shouldShowPlaceholder, "shouldShowPlaceholder");
  function useTypeaheadSearch(onSearchChange) {
    const handleSearchChange = useCallbackRef(onSearchChange);
    const searchRef = useRef("");
    const timerRef = useRef(0);
    const handleTypeaheadSearch = useCallback(
      (key) => {
        const search = searchRef.current + key;
        handleSearchChange(search);
        (/* @__PURE__ */ __name33((function updateSearch(value) {
          searchRef.current = value;
          window.clearTimeout(timerRef.current);
          if (value !== "") timerRef.current = window.setTimeout(() => updateSearch(""), 1e3);
        }), "updateSearch"))(search);
      },
      [handleSearchChange]
    );
    const resetTypeahead = useCallback(() => {
      searchRef.current = "";
      window.clearTimeout(timerRef.current);
    }, []);
    useEffect(() => {
      return () => window.clearTimeout(timerRef.current);
    }, []);
    return [searchRef, handleTypeaheadSearch, resetTypeahead];
  }
  __name33(useTypeaheadSearch, "useTypeaheadSearch");
  function findNextItem(items, search, currentItem) {
    const isRepeated = search.length > 1 && Array.from(search).every((char) => char === search[0]);
    const normalizedSearch = isRepeated ? search[0] : search;
    const currentItemIndex = currentItem ? items.indexOf(currentItem) : -1;
    let wrappedItems = wrapArray3(items, Math.max(currentItemIndex, 0));
    const excludeCurrentItem = normalizedSearch.length === 1;
    if (excludeCurrentItem) wrappedItems = wrappedItems.filter((v) => v !== currentItem);
    const nextItem = wrappedItems.find(
      (item) => item.textValue.toLowerCase().startsWith(normalizedSearch.toLowerCase())
    );
    return nextItem !== currentItem ? nextItem : void 0;
  }
  __name33(findNextItem, "findNextItem");
  function wrapArray3(array, startIndex) {
    return array.map((_, index2) => array[(startIndex + index2) % array.length]);
  }
  __name33(wrapArray3, "wrapArray");

  // ../../node_modules/.pnpm/@radix-ui+react-tooltip@1.2.16_@types+react-dom@18.3.7_@types+react@18.3.31_react-dom@18.3.1_react@18.3.1/node_modules/@radix-ui/react-tooltip/dist/index.mjs
  var dist_exports14 = {};
  __export(dist_exports14, {
    Arrow: () => Arrow25,
    Content: () => Content25,
    Portal: () => Portal5,
    Provider: () => Provider,
    Root: () => Root33,
    Tooltip: () => Tooltip,
    TooltipArrow: () => TooltipArrow,
    TooltipContent: () => TooltipContent,
    TooltipPortal: () => TooltipPortal,
    TooltipProvider: () => TooltipProvider,
    TooltipTrigger: () => TooltipTrigger,
    Trigger: () => Trigger5,
    createTooltipScope: () => createTooltipScope
  });
  var __defProp35 = Object.defineProperty;
  var __name34 = (target, value) => __defProp35(target, "name", { value, configurable: true });
  var [createTooltipContext, createTooltipScope] = createContextScope("Tooltip", [
    createPopperScope
  ]);
  var usePopperScope4 = createPopperScope();
  var PROVIDER_NAME = "TooltipProvider";
  var DEFAULT_DELAY_DURATION = 700;
  var TOOLTIP_OPEN = "tooltip.open";
  var [TooltipProviderContextProvider, useTooltipProviderContext] = createTooltipContext(PROVIDER_NAME);
  var TooltipProvider = /* @__PURE__ */ __name34((props) => {
    const {
      __scopeTooltip,
      delayDuration = DEFAULT_DELAY_DURATION,
      skipDelayDuration = 300,
      disableHoverableContent = false,
      children
    } = props;
    const isOpenDelayedRef = useRef(true);
    const isPointerInTransitRef = useRef(false);
    const skipDelayTimerRef = useRef(0);
    useEffect(() => {
      const skipDelayTimer = skipDelayTimerRef.current;
      return () => window.clearTimeout(skipDelayTimer);
    }, []);
    return /* @__PURE__ */ jsx(
      TooltipProviderContextProvider,
      {
        scope: __scopeTooltip,
        isOpenDelayedRef,
        delayDuration,
        onOpen: useCallback(() => {
          if (skipDelayDuration <= 0) return;
          window.clearTimeout(skipDelayTimerRef.current);
          isOpenDelayedRef.current = false;
        }, [skipDelayDuration]),
        onClose: useCallback(() => {
          if (skipDelayDuration <= 0) return;
          window.clearTimeout(skipDelayTimerRef.current);
          skipDelayTimerRef.current = window.setTimeout(
            () => isOpenDelayedRef.current = true,
            skipDelayDuration
          );
        }, [skipDelayDuration]),
        isPointerInTransitRef,
        onPointerInTransitChange: useCallback((inTransit) => {
          isPointerInTransitRef.current = inTransit;
        }, []),
        disableHoverableContent,
        children
      }
    );
  }, "TooltipProvider");
  var TOOLTIP_NAME = "Tooltip";
  var [TooltipContextProvider, useTooltipContext] = createTooltipContext(TOOLTIP_NAME);
  var Tooltip = /* @__PURE__ */ __name34((props) => {
    const {
      __scopeTooltip,
      children,
      open: openProp,
      defaultOpen,
      onOpenChange,
      disableHoverableContent: disableHoverableContentProp,
      delayDuration: delayDurationProp
    } = props;
    const providerContext = useTooltipProviderContext(TOOLTIP_NAME, props.__scopeTooltip);
    const popperScope = usePopperScope4(__scopeTooltip);
    const [trigger, setTrigger] = useState(null);
    const [contentIdState, setContentId] = useState(void 0);
    const generatedContentId = useId2();
    const openTimerRef = useRef(0);
    const disableHoverableContent = disableHoverableContentProp ?? providerContext.disableHoverableContent;
    const delayDuration = delayDurationProp ?? providerContext.delayDuration;
    const wasOpenDelayedRef = useRef(false);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: /* @__PURE__ */ __name34((open2) => {
        if (open2) {
          providerContext.onOpen();
          document.dispatchEvent(new CustomEvent(TOOLTIP_OPEN));
        } else {
          providerContext.onClose();
        }
        onOpenChange?.(open2);
      }, "onChange"),
      caller: TOOLTIP_NAME
    });
    const stateAttribute = useMemo(() => {
      return open ? wasOpenDelayedRef.current ? "delayed-open" : "instant-open" : "closed";
    }, [open]);
    const handleOpen = useCallback(() => {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = 0;
      wasOpenDelayedRef.current = false;
      setOpen(true);
    }, [setOpen]);
    const handleClose = useCallback(() => {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = 0;
      setOpen(false);
    }, [setOpen]);
    const handleDelayedOpen = useCallback(() => {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = window.setTimeout(() => {
        wasOpenDelayedRef.current = true;
        setOpen(true);
        openTimerRef.current = 0;
      }, delayDuration);
    }, [delayDuration, setOpen]);
    useEffect(() => {
      return () => {
        if (openTimerRef.current) {
          window.clearTimeout(openTimerRef.current);
          openTimerRef.current = 0;
        }
      };
    }, []);
    const contentId = contentIdState ?? generatedContentId;
    return /* @__PURE__ */ jsx(Root23, { ...popperScope, children: /* @__PURE__ */ jsx(
      TooltipContextProvider,
      {
        scope: __scopeTooltip,
        contentId,
        setContentId,
        open,
        stateAttribute,
        trigger,
        onTriggerChange: setTrigger,
        onTriggerEnter: useCallback(() => {
          if (providerContext.isOpenDelayedRef.current) handleDelayedOpen();
          else handleOpen();
        }, [providerContext.isOpenDelayedRef, handleDelayedOpen, handleOpen]),
        onTriggerLeave: useCallback(() => {
          if (disableHoverableContent) {
            handleClose();
          } else {
            window.clearTimeout(openTimerRef.current);
            openTimerRef.current = 0;
          }
        }, [handleClose, disableHoverableContent]),
        onOpen: handleOpen,
        onClose: handleClose,
        disableHoverableContent,
        children
      }
    ) });
  }, "Tooltip");
  var TRIGGER_NAME6 = "TooltipTrigger";
  var TooltipTrigger = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name34(function TooltipTrigger2(props, forwardedRef) {
      const { __scopeTooltip, ...triggerProps } = props;
      const context = useTooltipContext(TRIGGER_NAME6, __scopeTooltip);
      const providerContext = useTooltipProviderContext(TRIGGER_NAME6, __scopeTooltip);
      const popperScope = usePopperScope4(__scopeTooltip);
      const ref = useRef(null);
      const composedRefs = useComposedRefs(forwardedRef, ref, context.onTriggerChange);
      const isPointerDownRef = useRef(false);
      const hasPointerMoveOpenedRef = useRef(false);
      const handlePointerUp = useCallback(() => isPointerDownRef.current = false, []);
      useEffect(() => {
        return () => document.removeEventListener("pointerup", handlePointerUp);
      }, [handlePointerUp]);
      return /* @__PURE__ */ jsx(Anchor, { asChild: true, ...popperScope, children: /* @__PURE__ */ jsx(
        Primitive.button,
        {
          "aria-describedby": context.open ? context.contentId : void 0,
          "data-state": context.stateAttribute,
          ...triggerProps,
          ref: composedRefs,
          onPointerMove: composeEventHandlers(props.onPointerMove, (event) => {
            if (event.pointerType === "touch") return;
            if (!hasPointerMoveOpenedRef.current && !providerContext.isPointerInTransitRef.current) {
              context.onTriggerEnter();
              hasPointerMoveOpenedRef.current = true;
            }
          }),
          onPointerLeave: composeEventHandlers(props.onPointerLeave, () => {
            context.onTriggerLeave();
            hasPointerMoveOpenedRef.current = false;
          }),
          onPointerDown: composeEventHandlers(props.onPointerDown, () => {
            if (context.open) {
              context.onClose();
            }
            isPointerDownRef.current = true;
            document.addEventListener("pointerup", handlePointerUp, { once: true });
          }),
          onFocus: composeEventHandlers(props.onFocus, () => {
            if (!isPointerDownRef.current) context.onOpen();
          }),
          onBlur: composeEventHandlers(props.onBlur, context.onClose),
          onClick: composeEventHandlers(props.onClick, context.onClose)
        }
      ) });
    }, "TooltipTrigger")
  );
  var PORTAL_NAME5 = "TooltipPortal";
  var [PortalProvider5, usePortalContext5] = createTooltipContext(PORTAL_NAME5, {
    forceMount: void 0
  });
  var TooltipPortal = /* @__PURE__ */ __name34((props) => {
    const { __scopeTooltip, forceMount, children, container } = props;
    const context = useTooltipContext(PORTAL_NAME5, __scopeTooltip);
    return /* @__PURE__ */ jsx(PortalProvider5, { scope: __scopeTooltip, forceMount, children: /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Portal, { asChild: true, container, children }) }) });
  }, "TooltipPortal");
  var CONTENT_NAME9 = "TooltipContent";
  var TooltipContent = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name34(function TooltipContent2(props, forwardedRef) {
      const portalContext = usePortalContext5(CONTENT_NAME9, props.__scopeTooltip);
      const { forceMount = portalContext.forceMount, side = "top", ...contentProps } = props;
      const context = useTooltipContext(CONTENT_NAME9, props.__scopeTooltip);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: context.disableHoverableContent ? /* @__PURE__ */ jsx(TooltipContentImpl, { side, ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(TooltipContentHoverable, { side, ...contentProps, ref: forwardedRef }) });
    }, "TooltipContent")
  );
  var TooltipContentHoverable = /* @__PURE__ */ forwardRef(/* @__PURE__ */ __name34(function TooltipContentHoverable2(props, forwardedRef) {
    const context = useTooltipContext(CONTENT_NAME9, props.__scopeTooltip);
    const providerContext = useTooltipProviderContext(CONTENT_NAME9, props.__scopeTooltip);
    const ref = useRef(null);
    const composedRefs = useComposedRefs(forwardedRef, ref);
    const [pointerGraceArea, setPointerGraceArea] = useState(null);
    const { trigger, onClose } = context;
    const content = ref.current;
    const { onPointerInTransitChange } = providerContext;
    const handleRemoveGraceArea = useCallback(() => {
      setPointerGraceArea(null);
      onPointerInTransitChange(false);
    }, [onPointerInTransitChange]);
    const handleCreateGraceArea = useCallback(
      (event, hoverTarget) => {
        const currentTarget = event.currentTarget;
        const exitPoint = { x: event.clientX, y: event.clientY };
        const exitSide = getExitSideFromRect(exitPoint, currentTarget.getBoundingClientRect());
        const paddedExitPoints = getPaddedExitPoints(exitPoint, exitSide);
        const hoverTargetPoints = getPointsFromRect(hoverTarget.getBoundingClientRect());
        const graceArea = getHull([...paddedExitPoints, ...hoverTargetPoints]);
        setPointerGraceArea(graceArea);
        onPointerInTransitChange(true);
      },
      [onPointerInTransitChange]
    );
    useEffect(() => {
      return () => handleRemoveGraceArea();
    }, [handleRemoveGraceArea]);
    useEffect(() => {
      if (trigger && content) {
        const handleTriggerLeave = /* @__PURE__ */ __name34((event) => handleCreateGraceArea(event, content), "handleTriggerLeave");
        const handleContentLeave = /* @__PURE__ */ __name34((event) => handleCreateGraceArea(event, trigger), "handleContentLeave");
        trigger.addEventListener("pointerleave", handleTriggerLeave);
        content.addEventListener("pointerleave", handleContentLeave);
        return () => {
          trigger.removeEventListener("pointerleave", handleTriggerLeave);
          content.removeEventListener("pointerleave", handleContentLeave);
        };
      }
    }, [trigger, content, handleCreateGraceArea, handleRemoveGraceArea]);
    useEffect(() => {
      if (pointerGraceArea) {
        const handleTrackPointerGrace = /* @__PURE__ */ __name34((event) => {
          const target = event.target;
          const pointerPosition = { x: event.clientX, y: event.clientY };
          const hasEnteredTarget = trigger?.contains(target) || content?.contains(target);
          const isPointerOutsideGraceArea = !isPointInPolygon2(pointerPosition, pointerGraceArea);
          if (hasEnteredTarget) {
            handleRemoveGraceArea();
          } else if (isPointerOutsideGraceArea) {
            handleRemoveGraceArea();
            onClose();
          }
        }, "handleTrackPointerGrace");
        document.addEventListener("pointermove", handleTrackPointerGrace);
        return () => document.removeEventListener("pointermove", handleTrackPointerGrace);
      }
    }, [trigger, content, pointerGraceArea, onClose, handleRemoveGraceArea]);
    return /* @__PURE__ */ jsx(TooltipContentImpl, { ...props, ref: composedRefs });
  }, "TooltipContentHoverable"));
  var Slottable2 = createSlottable("TooltipContent");
  var TooltipContentImpl = /* @__PURE__ */ forwardRef(
    // blank line to reduce diff noise
    /* @__PURE__ */ __name34(function TooltipContentImpl2(props, forwardedRef) {
      const {
        __scopeTooltip,
        children,
        "aria-label": ariaLabel,
        id: idProp,
        onEscapeKeyDown,
        onPointerDownOutside,
        ...contentProps
      } = props;
      const context = useTooltipContext(CONTENT_NAME9, __scopeTooltip);
      const popperScope = usePopperScope4(__scopeTooltip);
      const { onClose } = context;
      useEffect(() => {
        document.addEventListener(TOOLTIP_OPEN, onClose);
        return () => document.removeEventListener(TOOLTIP_OPEN, onClose);
      }, [onClose]);
      useEffect(() => {
        if (context.trigger) {
          const handleScroll2 = /* @__PURE__ */ __name34((event) => {
            if (event.target instanceof Node && event.target.contains(context.trigger)) {
              onClose();
            }
          }, "handleScroll");
          window.addEventListener("scroll", handleScroll2, { capture: true });
          return () => window.removeEventListener("scroll", handleScroll2, { capture: true });
        }
      }, [context.trigger, onClose]);
      const { setContentId } = context;
      useLayoutEffect2(() => {
        setContentId(idProp);
        return () => {
          setContentId(void 0);
        };
      }, [idProp, setContentId]);
      return /* @__PURE__ */ jsx(
        DismissableLayer,
        {
          asChild: true,
          disableOutsidePointerEvents: false,
          onEscapeKeyDown,
          onPointerDownOutside,
          onFocusOutside: (event) => event.preventDefault(),
          onDismiss: onClose,
          children: /* @__PURE__ */ jsxs(
            Content3,
            {
              "data-state": context.stateAttribute,
              role: ariaLabel ? void 0 : "tooltip",
              id: ariaLabel ? void 0 : context.contentId,
              ...popperScope,
              ...contentProps,
              ref: forwardedRef,
              style: {
                ...contentProps.style,
                // re-namespace exposed content custom properties
                ...{
                  "--radix-tooltip-content-transform-origin": "var(--radix-popper-transform-origin)",
                  "--radix-tooltip-content-available-width": "var(--radix-popper-available-width)",
                  "--radix-tooltip-content-available-height": "var(--radix-popper-available-height)",
                  "--radix-tooltip-trigger-width": "var(--radix-popper-anchor-width)",
                  "--radix-tooltip-trigger-height": "var(--radix-popper-anchor-height)"
                }
              },
              children: [
                /* @__PURE__ */ jsx(Slottable2, { children }),
                ariaLabel ? /* @__PURE__ */ jsx(Root, { id: context.contentId, role: "tooltip", children: ariaLabel }) : null
              ]
            }
          )
        }
      );
    }, "TooltipContentImpl")
  );
  var TooltipArrow = /* @__PURE__ */ forwardRef(
    /* @__PURE__ */ __name34(function TooltipArrow2(props, forwardedRef) {
      const { __scopeTooltip, ...arrowProps } = props;
      const popperScope = usePopperScope4(__scopeTooltip);
      return /* @__PURE__ */ jsx(Arrow3, { ...popperScope, ...arrowProps, ref: forwardedRef });
    }, "TooltipArrow")
  );
  function getExitSideFromRect(point, rect) {
    const top = Math.abs(rect.top - point.y);
    const bottom = Math.abs(rect.bottom - point.y);
    const right = Math.abs(rect.right - point.x);
    const left = Math.abs(rect.left - point.x);
    switch (Math.min(top, bottom, right, left)) {
      case left:
        return "left";
      case right:
        return "right";
      case top:
        return "top";
      case bottom:
        return "bottom";
      default:
        throw new Error("unreachable");
    }
  }
  __name34(getExitSideFromRect, "getExitSideFromRect");
  function getPaddedExitPoints(exitPoint, exitSide, padding = 5) {
    const paddedExitPoints = [];
    switch (exitSide) {
      case "top":
        paddedExitPoints.push(
          { x: exitPoint.x - padding, y: exitPoint.y + padding },
          { x: exitPoint.x + padding, y: exitPoint.y + padding }
        );
        break;
      case "bottom":
        paddedExitPoints.push(
          { x: exitPoint.x - padding, y: exitPoint.y - padding },
          { x: exitPoint.x + padding, y: exitPoint.y - padding }
        );
        break;
      case "left":
        paddedExitPoints.push(
          { x: exitPoint.x + padding, y: exitPoint.y - padding },
          { x: exitPoint.x + padding, y: exitPoint.y + padding }
        );
        break;
      case "right":
        paddedExitPoints.push(
          { x: exitPoint.x - padding, y: exitPoint.y - padding },
          { x: exitPoint.x - padding, y: exitPoint.y + padding }
        );
        break;
    }
    return paddedExitPoints;
  }
  __name34(getPaddedExitPoints, "getPaddedExitPoints");
  function getPointsFromRect(rect) {
    const { top, right, bottom, left } = rect;
    return [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom }
    ];
  }
  __name34(getPointsFromRect, "getPointsFromRect");
  function isPointInPolygon2(point, polygon) {
    const { x, y } = point;
    let inside = false;
    for (let i = 0, j2 = polygon.length - 1; i < polygon.length; j2 = i++) {
      const ii = polygon[i];
      const jj = polygon[j2];
      const xi = ii.x;
      const yi = ii.y;
      const xj = jj.x;
      const yj = jj.y;
      const intersect = yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }
  __name34(isPointInPolygon2, "isPointInPolygon");
  function getHull(points) {
    const newPoints = points.slice();
    newPoints.sort((a2, b) => {
      if (a2.x < b.x) return -1;
      else if (a2.x > b.x) return 1;
      else if (a2.y < b.y) return -1;
      else if (a2.y > b.y) return 1;
      else return 0;
    });
    return getHullPresorted(newPoints);
  }
  __name34(getHull, "getHull");
  function getHullPresorted(points) {
    if (points.length <= 1) return points.slice();
    const upperHull = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      while (upperHull.length >= 2) {
        const q2 = upperHull[upperHull.length - 1];
        const r3 = upperHull[upperHull.length - 2];
        if ((q2.x - r3.x) * (p.y - r3.y) >= (q2.y - r3.y) * (p.x - r3.x)) upperHull.pop();
        else break;
      }
      upperHull.push(p);
    }
    upperHull.pop();
    const lowerHull = [];
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      while (lowerHull.length >= 2) {
        const q2 = lowerHull[lowerHull.length - 1];
        const r3 = lowerHull[lowerHull.length - 2];
        if ((q2.x - r3.x) * (p.y - r3.y) >= (q2.y - r3.y) * (p.x - r3.x)) lowerHull.pop();
        else break;
      }
      lowerHull.push(p);
    }
    lowerHull.pop();
    if (upperHull.length === 1 && lowerHull.length === 1 && upperHull[0].x === lowerHull[0].x && upperHull[0].y === lowerHull[0].y) {
      return upperHull;
    } else {
      return upperHull.concat(lowerHull);
    }
  }
  __name34(getHullPresorted, "getHullPresorted");
  var Provider = TooltipProvider;
  var Root33 = Tooltip;
  var Trigger5 = TooltipTrigger;
  var Portal5 = TooltipPortal;
  var Content25 = TooltipContent;
  var Arrow25 = TooltipArrow;

  // ../../node_modules/.pnpm/class-variance-authority@0.7.1/node_modules/class-variance-authority/dist/index.mjs
  var falsyToString = (value) => typeof value === "boolean" ? `${value}` : value === 0 ? "0" : value;
  var cx = clsx;
  var cva = (base, config) => (props) => {
    var _config_compoundVariants;
    if ((config === null || config === void 0 ? void 0 : config.variants) == null) return cx(base, props === null || props === void 0 ? void 0 : props.class, props === null || props === void 0 ? void 0 : props.className);
    const { variants, defaultVariants } = config;
    const getVariantClassNames = Object.keys(variants).map((variant) => {
      const variantProp = props === null || props === void 0 ? void 0 : props[variant];
      const defaultVariantProp = defaultVariants === null || defaultVariants === void 0 ? void 0 : defaultVariants[variant];
      if (variantProp === null) return null;
      const variantKey = falsyToString(variantProp) || falsyToString(defaultVariantProp);
      return variants[variant][variantKey];
    });
    const propsWithoutUndefined = props && Object.entries(props).reduce((acc, param) => {
      let [key, value] = param;
      if (value === void 0) {
        return acc;
      }
      acc[key] = value;
      return acc;
    }, {});
    const getCompoundVariantClassNames = config === null || config === void 0 ? void 0 : (_config_compoundVariants = config.compoundVariants) === null || _config_compoundVariants === void 0 ? void 0 : _config_compoundVariants.reduce((acc, param) => {
      let { class: cvClass, className: cvClassName, ...compoundVariantOptions } = param;
      return Object.entries(compoundVariantOptions).every((param2) => {
        let [key, value] = param2;
        return Array.isArray(value) ? value.includes({
          ...defaultVariants,
          ...propsWithoutUndefined
        }[key]) : {
          ...defaultVariants,
          ...propsWithoutUndefined
        }[key] === value;
      }) ? [
        ...acc,
        cvClass,
        cvClassName
      ] : acc;
    }, []);
    return cx(base, getVariantClassNames, getCompoundVariantClassNames, props === null || props === void 0 ? void 0 : props.class, props === null || props === void 0 ? void 0 : props.className);
  };

  // ../../node_modules/.pnpm/react-resizable-panels@4.13.3_react-dom@18.3.1_react@18.3.1/node_modules/react-resizable-panels/dist/react-resizable-panels.js
  function Mt(e, t) {
    const n = getComputedStyle(e), o = parseFloat(n.fontSize);
    return t * o;
  }
  function Et(e, t) {
    const n = getComputedStyle(e.ownerDocument.documentElement), o = parseFloat(n.fontSize);
    return t * o;
  }
  function It(e) {
    return e / 100 * window.innerHeight;
  }
  function kt(e) {
    return e / 100 * window.innerWidth;
  }
  function Ot(e) {
    switch (typeof e) {
      case "number":
        return [e, "px"];
      case "string": {
        const t = parseFloat(e);
        return e.endsWith("%") ? [t, "%"] : e.endsWith("px") ? [t, "px"] : e.endsWith("rem") ? [t, "rem"] : e.endsWith("em") ? [t, "em"] : e.endsWith("vh") ? [t, "vh"] : e.endsWith("vw") ? [t, "vw"] : [t, "%"];
      }
    }
  }
  function ie({
    groupSize: e,
    panelElement: t,
    styleProp: n
  }) {
    let o;
    const [r3, i] = Ot(n);
    switch (i) {
      case "%": {
        o = r3 / 100 * e;
        break;
      }
      case "px": {
        o = r3;
        break;
      }
      case "rem": {
        o = Et(t, r3);
        break;
      }
      case "em": {
        o = Mt(t, r3);
        break;
      }
      case "vh": {
        o = It(r3);
        break;
      }
      case "vw": {
        o = kt(r3);
        break;
      }
    }
    return o;
  }
  function F(e) {
    return parseFloat(e.toFixed(3));
  }
  function ae({
    group: e
  }) {
    const { orientation: t, panels: n } = e;
    return n.reduce((o, r3) => (o += t === "horizontal" ? r3.element.offsetWidth : r3.element.offsetHeight, o), 0);
  }
  function Le(e) {
    const { panels: t } = e, n = ae({ group: e });
    return n === 0 ? t.map((o) => ({
      groupResizeBehavior: o.panelConstraints.groupResizeBehavior,
      collapsedSize: 0,
      collapsible: o.panelConstraints.collapsible === true,
      defaultSize: void 0,
      disabled: o.panelConstraints.disabled,
      minSize: 0,
      maxSize: 100,
      panelId: o.id
    })) : t.map((o) => {
      const { element: r3, panelConstraints: i } = o;
      let s = 0;
      if (i.collapsedSize !== void 0) {
        const f = ie({
          groupSize: n,
          panelElement: r3,
          styleProp: i.collapsedSize
        });
        s = F(f / n * 100);
      }
      let u2;
      if (i.collapsedThreshold !== void 0) {
        const f = ie({
          groupSize: n,
          panelElement: r3,
          styleProp: i.collapsedThreshold
        });
        u2 = F(f / n * 100);
      }
      let c;
      if (i.defaultSize !== void 0) {
        const f = ie({
          groupSize: n,
          panelElement: r3,
          styleProp: i.defaultSize
        });
        c = F(f / n * 100);
      }
      let a2 = 0;
      if (i.minSize !== void 0) {
        const f = ie({
          groupSize: n,
          panelElement: r3,
          styleProp: i.minSize
        });
        a2 = F(f / n * 100);
      }
      let l = 100;
      if (i.maxSize !== void 0) {
        const f = ie({
          groupSize: n,
          panelElement: r3,
          styleProp: i.maxSize
        });
        l = F(f / n * 100);
      }
      return {
        groupResizeBehavior: i.groupResizeBehavior,
        collapsedSize: s,
        collapsedThreshold: u2,
        collapsible: i.collapsible === true,
        defaultSize: c,
        disabled: i.disabled,
        minSize: a2,
        maxSize: l,
        panelId: o.id
      };
    });
  }
  var _e;
  var ot = class {
    constructor() {
      __privateAdd(this, _e, {});
    }
    addListener(t, n) {
      const o = __privateGet(this, _e)[t];
      return o === void 0 ? __privateGet(this, _e)[t] = [n] : o.includes(n) || o.push(n), () => {
        this.removeListener(t, n);
      };
    }
    emit(t, n) {
      const o = __privateGet(this, _e)[t];
      if (o !== void 0)
        if (o.length === 1)
          o[0].call(null, n);
        else {
          let r3 = false, i = null;
          const s = Array.from(o);
          for (let u2 = 0; u2 < s.length; u2++) {
            const c = s[u2];
            try {
              c.call(null, n);
            } catch (a2) {
              i === null && (r3 = true, i = a2);
            }
          }
          if (r3)
            throw i;
        }
    }
    removeAllListeners() {
      __privateSet(this, _e, {});
    }
    removeListener(t, n) {
      const o = __privateGet(this, _e)[t];
      if (o !== void 0) {
        const r3 = o.indexOf(n);
        r3 >= 0 && o.splice(r3, 1);
      }
    }
  };
  _e = new WeakMap();
  var k = {
    cursorFlags: 0,
    state: "inactive"
  };
  var Me = new ot();
  function q() {
    return k;
  }
  function rt(e) {
    return Me.addListener("change", e);
  }
  function Dt(e, t = [], n, o = false) {
    const r3 = k, i = { ...k };
    i.cursorFlags = e, i.state === "active" && (i.didPointerMove || (i.didPointerMove = o), i.previews = t, n && (i.previewLayoutMap = n)), k = i, Me.emit("change", {
      prev: r3,
      next: i
    });
  }
  function W(e) {
    const t = k;
    k = e, t.state === "active" && e.state !== "active" && t.didPointerMove && t.hitRegions.forEach(({ separator: n }) => {
      n && n.element.ownerDocument.activeElement === n.element && n.element.blur();
    }), Me.emit("change", {
      prev: t,
      next: e
    });
  }
  function Tt(e) {
    k.state !== "active" || !k.previews.some((t) => t.separator === e) || W({
      ...k,
      previews: k.previews.map(
        (t) => t.separator === e ? { ...t } : t
      )
    });
  }
  function Nt(e) {
    if (k.state === "inactive")
      return false;
    const t = k.hitRegions.filter(
      (o) => o.group !== e
    ), n = k.state === "active" && k.previews.some((o) => o.group === e);
    if (t.length === k.hitRegions.length && !n)
      return false;
    if (t.length === 0)
      W({ cursorFlags: 0, state: "inactive" });
    else if (k.state === "active") {
      const o = new Map(k.initialLayoutMap), r3 = new Map(k.previewLayoutMap);
      o.delete(e), r3.delete(e), W({
        ...k,
        cursorFlags: 0,
        hitRegions: t,
        initialLayoutMap: o,
        previewLayoutMap: r3,
        previews: k.previews.filter((i) => i.group !== e)
      });
    } else
      W({ ...k, hitRegions: t });
    return true;
  }
  var Gt = (e) => e;
  var we = () => {
  };
  var it = 1;
  var st = 2;
  var at2 = 4;
  var lt = 8;
  var Fe = 3;
  var _e2 = 12;
  var me;
  function $e() {
    return me === void 0 && (me = false, typeof window < "u" && (window.navigator.userAgent.includes("Chrome") || window.navigator.userAgent.includes("Firefox")) && (me = true)), me;
  }
  function At({
    cursorFlags: e,
    groups: t,
    state: n
  }) {
    let o = 0, r3 = 0;
    switch (n) {
      case "active":
      case "hover":
        t.forEach((i) => {
          if (!i.mutableState.disableCursor)
            switch (i.orientation) {
              case "horizontal": {
                o++;
                break;
              }
              case "vertical": {
                r3++;
                break;
              }
            }
        });
    }
    if (!(o === 0 && r3 === 0)) {
      switch (n) {
        case "active": {
          if (e && $e()) {
            const i = (e & it) !== 0, s = (e & st) !== 0, u2 = (e & at2) !== 0, c = (e & lt) !== 0;
            if (i)
              return u2 ? "se-resize" : c ? "ne-resize" : "e-resize";
            if (s)
              return u2 ? "sw-resize" : c ? "nw-resize" : "w-resize";
            if (u2)
              return "s-resize";
            if (c)
              return "n-resize";
          }
          break;
        }
      }
      return $e() ? o > 0 && r3 > 0 ? "move" : o > 0 ? "ew-resize" : "ns-resize" : o > 0 && r3 > 0 ? "grab" : o > 0 ? "col-resize" : "row-resize";
    }
  }
  var He = /* @__PURE__ */ new WeakMap();
  function fe(e) {
    if (!e.defaultView || !e.adoptedStyleSheets)
      return;
    let { prevStyle: t, styleSheet: n } = He.get(e) ?? {};
    n === void 0 && (n = new e.defaultView.CSSStyleSheet(), e.adoptedStyleSheets && (Object.isExtensible(e.adoptedStyleSheets) ? e.adoptedStyleSheets.push(n) : e.adoptedStyleSheets = [
      ...e.adoptedStyleSheets,
      n
    ]));
    const o = q();
    switch (o.state) {
      case "active":
      case "hover": {
        const r3 = At({
          cursorFlags: o.cursorFlags,
          groups: o.hitRegions.map((s) => s.group),
          state: o.state
        }), i = `*, *:hover {cursor: ${r3} !important; }`;
        if (t === i)
          return;
        t = i, r3 ? n.cssRules.length === 0 ? n.insertRule(i) : n.replaceSync(i) : n.cssRules.length === 1 && n.deleteRule(0);
        break;
      }
      case "inactive": {
        t = void 0, n.cssRules.length === 1 && n.deleteRule(0);
        break;
      }
    }
    He.set(e, {
      prevStyle: t,
      styleSheet: n
    });
  }
  function L(e, t = "Assertion error") {
    if (!e)
      throw Error(t);
  }
  function Ce(e, t) {
    return Array.from(t).sort((n, o) => {
      const r3 = e === "horizontal" ? Ft(n, o) : _t(n, o);
      if (r3 !== 0)
        return r3;
      const i = n.element.compareDocumentPosition(o.element);
      return i & Node.DOCUMENT_POSITION_DISCONNECTED ? 0 : i & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : i & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
    });
  }
  function Ft(e, t) {
    const n = e.element.offsetLeft - t.element.offsetLeft;
    return n !== 0 ? n : e.element.offsetWidth - t.element.offsetWidth;
  }
  function _t(e, t) {
    const n = e.element.offsetTop - t.element.offsetTop;
    return n !== 0 ? n : e.element.offsetHeight - t.element.offsetHeight;
  }
  function Re(e) {
    return e !== null && typeof e == "object" && "nodeType" in e && e.nodeType === Node.ELEMENT_NODE;
  }
  function ct(e, t) {
    return {
      x: e.x >= t.left && e.x <= t.right ? 0 : Math.min(
        Math.abs(e.x - t.left),
        Math.abs(e.x - t.right)
      ),
      y: e.y >= t.top && e.y <= t.bottom ? 0 : Math.min(
        Math.abs(e.y - t.top),
        Math.abs(e.y - t.bottom)
      )
    };
  }
  function $t({
    orientation: e,
    rects: t,
    targetRect: n
  }) {
    const o = {
      x: n.x + n.width / 2,
      y: n.y + n.height / 2
    };
    let r3, i = Number.MAX_VALUE;
    for (const s of t) {
      const { x: u2, y: c } = ct(o, s), a2 = e === "horizontal" ? u2 : c;
      a2 < i && (i = a2, r3 = s);
    }
    return L(r3, "No rect found"), r3;
  }
  var ge;
  function Ht() {
    return ge === void 0 && (typeof matchMedia == "function" ? ge = !!matchMedia("(pointer:coarse)").matches : ge = false), ge;
  }
  function Ee({
    expandHitTargets: e = true,
    group: t,
    includeDisabled: n = false
  }) {
    const { element: o, orientation: r3, panels: i, separators: s } = t, u2 = Ce(
      r3,
      Array.from(o.children).filter(Re).filter((h) => !h.hasAttribute("data-resize-preview")).map((h) => ({ element: h }))
    ).map(({ element: h }) => h), c = [];
    let a2 = false, l = false, f = -1, y, p = -1, g = 0, d, v = [];
    {
      let h = -1;
      for (const m of u2)
        m.hasAttribute("data-panel") && (h++, m.hasAttribute("data-disabled") || (g++, f === -1 && (f = h), p = h));
    }
    if (n || g > 1) {
      let h = -1;
      for (const m of u2)
        if (m.hasAttribute("data-panel")) {
          h++;
          const x = i.find(
            (S) => S.element === m
          );
          if (x) {
            if (d) {
              const S = d.element.getBoundingClientRect(), P = m.getBoundingClientRect();
              let C2;
              if (l) {
                const E = r3 === "horizontal" ? new DOMRect(
                  S.right,
                  S.top,
                  0,
                  S.height
                ) : new DOMRect(
                  S.left,
                  S.bottom,
                  S.width,
                  0
                ), w = r3 === "horizontal" ? new DOMRect(P.left, P.top, 0, P.height) : new DOMRect(P.left, P.top, P.width, 0);
                switch (v.length) {
                  case 0: {
                    C2 = [
                      E,
                      w
                    ];
                    break;
                  }
                  case 1: {
                    const R = v[0], N = $t({
                      orientation: r3,
                      rects: [S, P],
                      targetRect: R.element.getBoundingClientRect()
                    });
                    C2 = [
                      R,
                      N === S ? w : E
                    ];
                    break;
                  }
                  default: {
                    C2 = v;
                    break;
                  }
                }
              } else
                v.length ? C2 = v : C2 = [
                  r3 === "horizontal" ? new DOMRect(
                    S.right,
                    P.top,
                    P.left - S.right,
                    P.height
                  ) : new DOMRect(
                    P.left,
                    S.bottom,
                    P.width,
                    P.top - S.bottom
                  )
                ];
              for (const E of C2) {
                let w = "width" in E ? E : E.element.getBoundingClientRect();
                const R = e ? Ht() ? t.resizeTargetMinimumSize.coarse : t.resizeTargetMinimumSize.fine : 0;
                if (w.width < R) {
                  const O = R - w.width;
                  w = new DOMRect(
                    w.x - O / 2,
                    w.y,
                    w.width + O,
                    w.height
                  );
                }
                if (w.height < R) {
                  const O = R - w.height;
                  w = new DOMRect(
                    w.x,
                    w.y - O / 2,
                    w.width,
                    w.height + O
                  );
                }
                const N = h <= f || h > p;
                (n || !a2 && !N) && (y ?? (y = ae({ group: t })), c.push({
                  group: t,
                  groupSize: y,
                  panels: [d, x],
                  separator: "width" in E ? void 0 : E,
                  rect: w
                })), a2 = false;
              }
            }
            l = false, d = x, v = [];
          }
        } else if (m.hasAttribute("data-separator")) {
          m.ariaDisabled !== null && (a2 = true);
          const x = s.find(
            (S) => S.element === m
          );
          x ? v.push(x) : (d = void 0, v = []);
        } else
          l = true;
    }
    return c;
  }
  var U = /* @__PURE__ */ new Map();
  var ut = new ot();
  function Vt(e) {
    U = new Map(U), U.delete(e);
  }
  function ft(e, t) {
    for (const [n] of U)
      if (n.id === e)
        return n;
  }
  function Q(e, t) {
    for (const [n, o] of U)
      if (n.id === e)
        return o;
    if (t)
      throw Error(`Could not find data for Group with id ${e}`);
  }
  function ee() {
    return U;
  }
  function Ie(e, t) {
    return ut.addListener("groupChange", (n) => {
      n.group.id === e && t(n);
    });
  }
  function X2(e, t, n) {
    const o = U.get(e);
    U = new Map(U), U.set(e, t), ut.emit("groupChange", {
      group: e,
      isUserInteraction: n?.isUserInteraction === true,
      prev: o,
      next: t
    });
  }
  function jt(e, t) {
    if (e.length !== t.length)
      return false;
    for (let n = 0; n < e.length; n++)
      if (e[n] != t[n])
        return false;
    return true;
  }
  function D(e, t, n = 0) {
    return Math.abs(F(e) - F(t)) <= n;
  }
  function j(e, t) {
    return D(e, t) ? 0 : e > t ? 1 : -1;
  }
  function se({
    overrideDisabledPanels: e,
    panelConstraints: t,
    prevSize: n,
    size: o
  }) {
    const {
      collapsedSize: r3 = 0,
      collapsedThreshold: i,
      collapsible: s,
      disabled: u2,
      maxSize: c = 100,
      minSize: a2 = 0
    } = t;
    if (u2 && !e)
      return n;
    if (j(o, a2) < 0)
      if (s) {
        const l = i ?? (a2 - r3) / 2, f = j(n, r3) <= 0, y = f ? r3 + l : a2 - l, p = j(o, y);
        j(o, r3) <= 0 || p < 0 || i !== void 0 && f && p === 0 ? o = r3 : o = a2;
      } else
        o = a2;
    return o = Math.min(c, o), o = F(o), o;
  }
  function de({
    delta: e,
    initialLayout: t,
    panelConstraints: n,
    pivotIndices: o,
    prevLayout: r3,
    trigger: i
  }) {
    if (D(e, 0))
      return t;
    const s = i === "imperative-api", u2 = n.map(
      ({ panelId: g }) => t[g]
    ), c = n.map(
      ({ panelId: g }) => r3[g]
    ), a2 = [...u2], [l, f] = o;
    L(l != null, "Invalid first pivot index"), L(f != null, "Invalid second pivot index");
    let y = 0;
    switch (i) {
      case "keyboard": {
        {
          const g = e < 0 ? f : l, d = n[g];
          L(
            d,
            `Panel constraints not found for index ${g}`
          );
          const {
            collapsedSize: v = 0,
            collapsible: h,
            minSize: m = 0
          } = d;
          if (h) {
            const x = u2[g];
            if (L(
              x != null,
              `Previous layout not found for panel index ${g}`
            ), D(x, v)) {
              const S = m - x;
              j(S, Math.abs(e)) > 0 && (e = e < 0 ? 0 - S : S);
            }
          }
        }
        {
          const g = e < 0 ? l : f, d = n[g];
          L(
            d,
            `No panel constraints found for index ${g}`
          );
          const {
            collapsedSize: v = 0,
            collapsible: h,
            minSize: m = 0
          } = d;
          if (h) {
            const x = u2[g];
            if (L(
              x != null,
              `Previous layout not found for panel index ${g}`
            ), D(x, m)) {
              const S = x - v;
              j(S, Math.abs(e)) > 0 && (e = e < 0 ? 0 - S : S);
            }
          }
        }
        break;
      }
      default: {
        const g = e < 0 ? f : l, d = n[g];
        L(
          d,
          `Panel constraints not found for index ${g}`
        );
        const v = u2[g], { collapsedSize: h, collapsedThreshold: m, collapsible: x, minSize: S } = d;
        if (x && j(v, S) < 0) {
          const P = S - h, C2 = m ?? P / 2, E = v + Math.abs(e);
          if (j(E, S) < 0) {
            const w = j(Math.abs(e), C2), R = m === void 0 && e < 0;
            w > 0 || w === 0 && R ? e = e < 0 ? -P : P : e = 0;
          }
        }
        break;
      }
    }
    {
      const g = e < 0 ? 1 : -1;
      let d = e < 0 ? f : l, v = 0;
      for (; ; ) {
        const m = u2[d];
        L(
          m != null,
          `Previous layout not found for panel index ${d}`
        );
        const S = se({
          overrideDisabledPanels: s,
          panelConstraints: n[d],
          prevSize: m,
          size: 100
        }) - m;
        if (v += S, d += g, d < 0 || d >= n.length)
          break;
      }
      const h = Math.min(Math.abs(e), Math.abs(v));
      e = e < 0 ? 0 - h : h;
    }
    {
      let d = e < 0 ? l : f;
      for (; d >= 0 && d < n.length; ) {
        const v = Math.abs(e) - Math.abs(y), h = u2[d];
        L(
          h != null,
          `Previous layout not found for panel index ${d}`
        );
        const m = h - v, x = se({
          overrideDisabledPanels: s,
          panelConstraints: n[d],
          prevSize: h,
          size: m
        });
        if (!D(h, x) && (y += h - x, a2[d] = x, y.toFixed(3).localeCompare(Math.abs(e).toFixed(3), void 0, {
          numeric: true
        }) >= 0))
          break;
        e < 0 ? d-- : d++;
      }
    }
    if (jt(c, a2))
      return r3;
    {
      const g = e < 0 ? f : l, d = u2[g];
      L(
        d != null,
        `Previous layout not found for panel index ${g}`
      );
      const v = d + y, h = se({
        overrideDisabledPanels: s,
        panelConstraints: n[g],
        prevSize: d,
        size: v
      });
      if (a2[g] = h, !D(h, v)) {
        let m = v - h, S = e < 0 ? f : l;
        for (; S >= 0 && S < n.length; ) {
          const P = a2[S];
          L(
            P != null,
            `Previous layout not found for panel index ${S}`
          );
          const C2 = P + m, E = se({
            overrideDisabledPanels: s,
            panelConstraints: n[S],
            prevSize: P,
            size: C2
          });
          if (D(P, E) || (m -= E - P, a2[S] = E), D(m, 0))
            break;
          e > 0 ? S-- : S++;
        }
      }
    }
    const p = Object.values(a2).reduce(
      (g, d) => d + g,
      0
    );
    return D(p, 100, 0.1) ? a2.reduce((g, d, v) => (g[n[v].panelId] = d, g), {}) : r3;
  }
  function K(e, t) {
    if (Object.keys(e).length !== Object.keys(t).length)
      return false;
    for (const n in e)
      if (t[n] === void 0 || j(e[n], t[n]) !== 0)
        return false;
    return true;
  }
  function ke({
    commit: e,
    document: t,
    event: n,
    hitRegions: o,
    initialLayoutMap: r3,
    mountedGroups: i,
    pointerDownAtPoint: s,
    prevCursorFlags: u2
  }) {
    let c = 0;
    const a2 = q();
    let l = a2.state === "active" ? a2.previews : [];
    const f = new Map(
      a2.state === "active" ? a2.previewLayoutMap : void 0
    );
    o.forEach((g) => {
      const { group: d, groupSize: v } = g, { orientation: h, panels: m } = d;
      if (e && d.resizePreviewMode !== "separator")
        return;
      const { disableCursor: x } = d.mutableState;
      let S = 0;
      s ? h === "horizontal" ? S = (n.clientX - s.x) / v * 100 : S = (n.clientY - s.y) / v * 100 : h === "horizontal" ? S = n.clientX < 0 ? -100 : 100 : S = n.clientY < 0 ? -100 : 100;
      const P = r3.get(d), C2 = i.get(d);
      if (!P || !C2)
        return;
      const {
        defaultLayoutDeferred: E,
        derivedPanelConstraints: w,
        groupSize: R,
        layout: N,
        separatorToPanels: O
      } = C2;
      if (w && N && O) {
        const I = d.resizePreviewMode === "separator" ? f.get(d) ?? N : N, G = de({
          delta: S,
          initialLayout: P,
          panelConstraints: w,
          pivotIndices: g.panels.map((_) => m.indexOf(_)),
          prevLayout: I,
          trigger: "mouse-or-touch"
        });
        if (d.resizePreviewMode === "separator" && !e && !K(G, I)) {
          f.set(d, G);
          let _ = 0;
          const b = m.map((z) => (_ += G[z.id] - P[z.id], _ * (v / 100)));
          l = l.map((z) => {
            if (z.group !== d)
              return z;
            const M = b[z.panelIndex];
            return M === z.offset ? z : { ...z, offset: M };
          });
        }
        if (K(G, I) && S !== 0 && !x)
          switch (h) {
            case "horizontal": {
              c |= S < 0 ? it : st;
              break;
            }
            case "vertical": {
              c |= S < 0 ? at2 : lt;
              break;
            }
          }
        (d.resizePreviewMode !== "separator" || e) && !K(G, N) && X2(g.group, {
          defaultLayoutDeferred: E,
          derivedPanelConstraints: w,
          groupSize: R,
          layout: G,
          separatorToPanels: O
        });
      }
    });
    let y = 0;
    n.movementX === 0 ? y |= u2 & Fe : y |= c & Fe, n.movementY === 0 ? y |= u2 & _e2 : y |= c & _e2;
    const p = a2.state === "active" && (n.clientX !== a2.pointerDownAtPoint.x || n.clientY !== a2.pointerDownAtPoint.y);
    Dt(y, l, f, p), fe(t);
  }
  function dt(e, t) {
    const n = q(), o = ee();
    let r3 = false;
    switch (n.state) {
      case "active":
        ke({
          commit: true,
          document: e,
          event: t,
          hitRegions: n.hitRegions,
          initialLayoutMap: n.initialLayoutMap,
          mountedGroups: o,
          pointerDownAtPoint: n.pointerDownAtPoint,
          prevCursorFlags: n.cursorFlags
        }), W({
          cursorFlags: 0,
          state: "inactive"
        }), n.hitRegions.length > 0 && (fe(e), r3 = true, n.hitRegions.forEach((i) => {
          if (!o.has(i.group))
            return;
          const s = Q(i.group.id, true);
          X2(i.group, s, {
            isUserInteraction: true
          });
        }));
    }
    return r3;
  }
  function Ve(e) {
    e.defaultPrevented || dt(e.currentTarget, e);
  }
  function Ut(e, t, n) {
    let o, r3 = {
      x: 1 / 0,
      y: 1 / 0
    };
    for (const i of t) {
      const s = ct(n, i.rect);
      switch (e) {
        case "horizontal": {
          s.x <= r3.x && (o = i, r3 = s);
          break;
        }
        case "vertical": {
          s.y <= r3.y && (o = i, r3 = s);
          break;
        }
      }
    }
    return o ? {
      distance: r3,
      hitRegion: o
    } : void 0;
  }
  function Bt(e) {
    return e !== null && typeof e == "object" && "nodeType" in e && e.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
  }
  function Wt(e, t) {
    if (e === t) throw new Error("Cannot compare node with itself");
    const n = {
      a: Be(e),
      b: Be(t)
    };
    let o;
    for (; n.a.at(-1) === n.b.at(-1); )
      o = n.a.pop(), n.b.pop();
    L(
      o,
      "Stacking order can only be calculated for elements with a common ancestor"
    );
    const r3 = {
      a: Ue(je(n.a)),
      b: Ue(je(n.b))
    };
    if (r3.a === r3.b) {
      const i = o.childNodes, s = {
        a: n.a.at(-1),
        b: n.b.at(-1)
      };
      let u2 = i.length;
      for (; u2--; ) {
        const c = i[u2];
        if (c === s.a) return 1;
        if (c === s.b) return -1;
      }
    }
    return Math.sign(r3.a - r3.b);
  }
  var Kt = /\b(?:position|zIndex|opacity|transform|webkitTransform|mixBlendMode|filter|webkitFilter|isolation)\b/;
  function Xt(e) {
    const t = getComputedStyle(pt(e) ?? e).display;
    return t === "flex" || t === "inline-flex";
  }
  function qt(e) {
    const t = getComputedStyle(e);
    return !!(t.position === "fixed" || t.zIndex !== "auto" && (t.position !== "static" || Xt(e)) || +t.opacity < 1 || "transform" in t && t.transform !== "none" || "webkitTransform" in t && t.webkitTransform !== "none" || "mixBlendMode" in t && t.mixBlendMode !== "normal" || "filter" in t && t.filter !== "none" || "webkitFilter" in t && t.webkitFilter !== "none" || "isolation" in t && t.isolation === "isolate" || Kt.test(t.willChange) || t.webkitOverflowScrolling === "touch");
  }
  function je(e) {
    let t = e.length;
    for (; t--; ) {
      const n = e[t];
      if (L(n, "Missing node"), qt(n)) return n;
    }
    return null;
  }
  function Ue(e) {
    return e && Number(getComputedStyle(e).zIndex) || 0;
  }
  function Be(e) {
    const t = [];
    for (; e; )
      t.push(e), e = pt(e);
    return t;
  }
  function pt(e) {
    const { parentNode: t } = e;
    return Bt(t) ? t.host : t;
  }
  function Yt(e, t) {
    return e.x < t.x + t.width && e.x + e.width > t.x && e.y < t.y + t.height && e.y + e.height > t.y;
  }
  function Jt(e) {
    try {
      return e.matches(":modal");
    } catch {
      return false;
    }
  }
  function Zt({
    groupElement: e,
    hitRegion: t,
    pointerEventTarget: n
  }) {
    if (Re(n)) {
      const o = n.closest("dialog");
      if (o && !o.contains(e) && Jt(o))
        return false;
    }
    if (!Re(n) || n.contains(e) || e.contains(n))
      return true;
    if (Wt(n, e) > 0) {
      let o = n;
      for (; o; ) {
        if (o.contains(e))
          return true;
        if (Yt(o.getBoundingClientRect(), t))
          return false;
        o = o.parentElement;
      }
    }
    return true;
  }
  function Oe(e, t) {
    const n = [];
    return t.forEach((o, r3) => {
      if (r3.disabled)
        return;
      const i = Ee({ group: r3 }), s = Ut(r3.orientation, i, {
        x: e.clientX,
        y: e.clientY
      });
      s && s.distance.x <= 0 && s.distance.y <= 0 && Zt({
        groupElement: r3.element,
        hitRegion: s.hitRegion.rect,
        pointerEventTarget: e.target
      }) && n.push(s.hitRegion);
    }), n;
  }
  function ne({
    layout: e,
    panelConstraints: t
  }) {
    const n = t.map(({ panelId: s }) => e[s]), o = [...n], r3 = o.reduce(
      (s, u2) => s + u2,
      0
    );
    if (Object.keys(e).length !== t.length)
      throw Error(
        `Invalid ${t.length} panel layout: ${Object.values(e).map((s) => `${s}%`).join(", ")}`
      );
    if (!D(r3, 100) && o.length > 0)
      for (let s = 0; s < t.length; s++) {
        const u2 = o[s];
        L(u2 != null, `No layout data found for index ${s}`);
        const c = 100 / r3 * u2;
        o[s] = c;
      }
    let i = 0;
    for (let s = 0; s < t.length; s++) {
      const u2 = n[s];
      L(u2 != null, `No layout data found for index ${s}`);
      const c = o[s];
      L(c != null, `No layout data found for index ${s}`);
      const a2 = se({
        overrideDisabledPanels: true,
        panelConstraints: t[s],
        prevSize: u2,
        size: c
      });
      c != a2 && (i += c - a2, o[s] = a2);
    }
    if (!D(i, 0))
      for (let s = 0; s < t.length; s++) {
        const u2 = o[s];
        L(u2 != null, `No layout data found for index ${s}`);
        const c = u2 + i, a2 = se({
          overrideDisabledPanels: true,
          panelConstraints: t[s],
          prevSize: u2,
          size: c
        });
        if (u2 !== a2 && (i -= a2 - u2, o[s] = a2, D(i, 0)))
          break;
      }
    return o.reduce((s, u2, c) => (s[t[c].panelId] = u2, s), {});
  }
  function ht({
    groupId: e,
    panelId: t
  }) {
    const n = () => {
      const c = ee();
      for (const [
        a2,
        {
          defaultLayoutDeferred: l,
          derivedPanelConstraints: f,
          layout: y,
          groupSize: p,
          separatorToPanels: g
        }
      ] of c)
        if (a2.id === e)
          return {
            defaultLayoutDeferred: l,
            derivedPanelConstraints: f,
            group: a2,
            groupSize: p,
            layout: y,
            separatorToPanels: g
          };
      throw Error(`Group ${e} not found`);
    }, o = () => {
      const c = n().derivedPanelConstraints.find(
        (a2) => a2.panelId === t
      );
      if (c !== void 0)
        return c;
      throw Error(`Panel constraints not found for Panel ${t}`);
    }, r3 = () => {
      const c = n().group.panels.find((a2) => a2.id === t);
      if (c !== void 0)
        return c;
      throw Error(`Layout not found for Panel ${t}`);
    }, i = () => {
      const c = n().layout[t];
      if (c !== void 0)
        return c;
      throw Error(`Layout not found for Panel ${t}`);
    }, s = ({
      nextSize: c,
      panels: a2,
      prevLayout: l,
      derivedPanelConstraints: f
    }) => {
      const y = i(), p = a2.findIndex((h) => h.id === t), g = p === 0, d = p === a2.length - 1;
      if (d && c < y && (g || a2.slice(0, p).every((h, m) => {
        const x = f[m];
        return x?.collapsible && D(x.collapsedSize, l[x.panelId]);
      }))) {
        const h = a2.slice(0, p).reduce((m, x) => m + l[x.id], 0);
        return {
          ...l,
          [t]: F(100 - h)
        };
      }
      return de({
        delta: d ? y - c : c - y,
        initialLayout: l,
        panelConstraints: f,
        pivotIndices: d ? [p - 1, p] : [p, p + 1],
        prevLayout: l,
        trigger: "imperative-api"
      });
    }, u2 = (c) => {
      const a2 = i();
      if (c === a2)
        return;
      const {
        defaultLayoutDeferred: l,
        derivedPanelConstraints: f,
        group: y,
        groupSize: p,
        layout: g,
        separatorToPanels: d
      } = n(), v = s({
        nextSize: c,
        panels: y.panels,
        prevLayout: g,
        derivedPanelConstraints: f
      }), h = ne({
        layout: v,
        panelConstraints: f
      });
      K(g, h) || X2(y, {
        defaultLayoutDeferred: l,
        derivedPanelConstraints: f,
        groupSize: p,
        layout: h,
        separatorToPanels: d
      });
    };
    return {
      collapse: () => {
        const { collapsible: c, collapsedSize: a2 } = o(), { mutableValues: l } = r3(), f = i();
        c && f !== a2 && (l.expandToSize = f, u2(a2));
      },
      expand: () => {
        const { collapsible: c, collapsedSize: a2, minSize: l } = o(), { mutableValues: f } = r3(), y = i();
        if (c && y === a2) {
          let p = f.expandToSize ?? l;
          p === 0 && (p = 1), u2(p);
        }
      },
      getSize: () => {
        const { group: c } = n(), a2 = i(), { element: l } = r3(), f = c.orientation === "horizontal" ? l.offsetWidth : l.offsetHeight;
        return {
          asPercentage: a2,
          inPixels: f
        };
      },
      isCollapsed: () => {
        const { collapsible: c, collapsedSize: a2 } = o(), l = i();
        return c && D(a2, l);
      },
      resize: (c) => {
        const { group: a2 } = n(), { element: l } = r3(), f = ae({ group: a2 }), y = ie({
          groupSize: f,
          panelElement: l,
          styleProp: c
        }), p = F(y / f * 100);
        u2(p);
      }
    };
  }
  function We(e) {
    if (e.defaultPrevented)
      return;
    const t = ee();
    Oe(e, t).forEach((o) => {
      if (o.separator && !o.separator.disableDoubleClick) {
        const r3 = o.panels.find(
          (i) => i.panelConstraints.defaultSize !== void 0
        );
        if (r3) {
          const i = r3.panelConstraints.defaultSize, s = ht({
            groupId: o.group.id,
            panelId: r3.id
          });
          s && i !== void 0 && (s.resize(i), e.preventDefault());
        }
      }
    });
  }
  function ye(e) {
    const t = ee();
    for (const [n] of t)
      if (n.separators.some(
        (o) => o.element === e
      ))
        return n;
    throw Error("Could not find parent Group for separator element");
  }
  function mt({
    groupId: e
  }) {
    const t = () => {
      const n = ee();
      for (const [o, r3] of n)
        if (o.id === e)
          return { group: o, ...r3 };
      throw Error(`Could not find Group with id "${e}"`);
    };
    return {
      getLayout() {
        const { defaultLayoutDeferred: n, layout: o } = t();
        return n ? {} : o;
      },
      setLayout(n) {
        const {
          defaultLayoutDeferred: o,
          derivedPanelConstraints: r3,
          group: i,
          groupSize: s,
          layout: u2,
          separatorToPanels: c
        } = t(), a2 = ne({
          layout: n,
          panelConstraints: r3
        });
        return o ? u2 : (K(u2, a2) || X2(i, {
          defaultLayoutDeferred: o,
          derivedPanelConstraints: r3,
          groupSize: s,
          layout: a2,
          separatorToPanels: c
        }), a2);
      }
    };
  }
  function te(e, t) {
    const n = ye(e), o = Q(n.id, true), r3 = n.separators.find(
      (f) => f.element === e
    );
    L(r3, "Matching separator not found");
    const i = o.separatorToPanels.get(r3);
    L(i, "Matching panels not found");
    const s = i.map((f) => n.panels.indexOf(f)), c = mt({ groupId: n.id }).getLayout(), a2 = de({
      delta: t,
      initialLayout: c,
      panelConstraints: o.derivedPanelConstraints,
      pivotIndices: s,
      prevLayout: c,
      trigger: "keyboard"
    }), l = ne({
      layout: a2,
      panelConstraints: o.derivedPanelConstraints
    });
    K(c, l) || X2(
      n,
      {
        defaultLayoutDeferred: o.defaultLayoutDeferred,
        derivedPanelConstraints: o.derivedPanelConstraints,
        groupSize: o.groupSize,
        layout: l,
        separatorToPanels: o.separatorToPanels
      },
      // Keyboard resizes (arrow keys, Home/End, Enter collapse/expand) originate
      // from a real DOM event on the separator, so they are user interactions
      // just like pointer drags. This function is only reached from
      // onDocumentKeyDown. See #716.
      { isUserInteraction: true }
    );
  }
  function Ke(e) {
    if (e.defaultPrevented)
      return;
    const t = e.currentTarget, n = ye(t);
    if (!(n.disabled || n.separators.find(
      (r3) => r3.element === t
    )?.disabled))
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault(), n.orientation === "vertical" && te(t, 5);
          break;
        }
        case "ArrowLeft": {
          e.preventDefault(), n.orientation === "horizontal" && te(t, -5);
          break;
        }
        case "ArrowRight": {
          e.preventDefault(), n.orientation === "horizontal" && te(t, 5);
          break;
        }
        case "ArrowUp": {
          e.preventDefault(), n.orientation === "vertical" && te(t, -5);
          break;
        }
        case "End": {
          e.preventDefault(), te(t, 100);
          break;
        }
        case "Enter": {
          e.preventDefault();
          const r3 = ye(t), i = Q(r3.id, true), { derivedPanelConstraints: s, layout: u2, separatorToPanels: c } = i, a2 = r3.separators.find(
            (p) => p.element === t
          );
          L(a2, "Matching separator not found");
          const l = c.get(a2);
          L(l, "Matching panels not found");
          const f = l[0], y = s.find(
            (p) => p.panelId === f.id
          );
          if (L(y, "Panel metadata not found"), y.collapsible) {
            const p = u2[f.id], g = y.collapsedSize === p ? r3.mutableState.expandedPanelSizes[f.id] ?? y.minSize : y.collapsedSize;
            te(t, g - p);
          }
          break;
        }
        case "F6": {
          e.preventDefault();
          const i = ye(t).separators.map(
            (a2) => a2.element
          ), s = Array.from(i).findIndex(
            (a2) => a2 === e.currentTarget
          );
          L(s !== null, "Index not found");
          const u2 = e.shiftKey ? s > 0 ? s - 1 : i.length - 1 : s + 1 < i.length ? s + 1 : 0;
          i[u2].focus({
            preventScroll: true
          });
          break;
        }
        case "Home": {
          e.preventDefault(), te(t, -100);
          break;
        }
      }
  }
  function Qt(e, t) {
    const { element: n, orientation: o, panels: r3 } = e, i = n.getBoundingClientRect(), s = o === "horizontal";
    return Ee({
      expandHitTargets: false,
      group: e,
      includeDisabled: true
    }).map(
      ({ panels: c, rect: a2, separator: l }, f) => {
        const y = r3.indexOf(c[0]), p = s ? a2.left + a2.width / 2 : a2.top + a2.height / 2;
        return {
          active: t.some((d) => {
            if (d.group !== e || d.panels[0] !== c[0])
              return false;
            if (l || d.separator)
              return d.separator === l;
            const v = s ? d.rect.left + d.rect.width / 2 : d.rect.top + d.rect.height / 2;
            return D(p, v);
          }),
          group: e,
          key: l ? `separator-${l.id}` : `panel-${c[0].id}-${f}`,
          offset: 0,
          panelIndex: y,
          rect: new DOMRect(
            (s && !l ? p : a2.left) - i.left - n.clientLeft + n.scrollLeft,
            (!s && !l ? p : a2.top) - i.top - n.clientTop + n.scrollTop,
            s && !l ? 0 : a2.width,
            !s && !l ? 0 : a2.height
          ),
          separator: l
        };
      }
    );
  }
  function Xe(e) {
    if (e.defaultPrevented)
      return;
    if (e.pointerType === "mouse" && e.button > 0)
      return;
    const t = ee(), n = Oe(e, t);
    if (n.length === 0)
      return;
    const o = /* @__PURE__ */ new Map();
    let r3 = false;
    n.forEach((s) => {
      s.separator && (r3 || (r3 = true, s.separator.element.focus({
        // @ts-expect-error https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus#browser_compatibility
        focusVisible: false,
        preventScroll: true
      })));
      const u2 = t.get(s.group);
      u2 && o.set(s.group, u2.layout);
    });
    const i = Array.from(o.keys()).flatMap(
      (s) => s.resizePreviewMode === "separator" ? Qt(s, n) : []
    );
    W({
      cursorFlags: 0,
      didPointerMove: false,
      hitRegions: n,
      initialLayoutMap: o,
      pointerDownAtPoint: { x: e.clientX, y: e.clientY },
      previewLayoutMap: new Map(o),
      previews: i,
      state: "active"
    }), e.preventDefault();
  }
  function qe(e) {
    const t = ee(), n = q();
    switch (n.state) {
      case "active":
        ke({
          commit: false,
          document: e.currentTarget,
          event: e,
          hitRegions: n.hitRegions,
          initialLayoutMap: n.initialLayoutMap,
          mountedGroups: t,
          prevCursorFlags: n.cursorFlags
        });
    }
  }
  function Ye(e) {
    if (e.defaultPrevented)
      return;
    const t = q(), n = ee();
    switch (t.state) {
      case "active": {
        if (
          // Skip this check for "pointerleave" events, else Firefox triggers a false positive (see #514)
          e.buttons === 0
        ) {
          t.previewLayoutMap.forEach((o, r3) => {
            const i = n.get(r3);
            r3.resizePreviewMode === "separator" && i && !K(o, i.layout) && X2(r3, { ...i, layout: o });
          }), W({
            cursorFlags: 0,
            state: "inactive"
          }), t.hitRegions.forEach((o) => {
            if (!n.has(o.group))
              return;
            const r3 = Q(o.group.id, true);
            X2(o.group, r3, {
              isUserInteraction: true
            });
          }), fe(e.currentTarget);
          return;
        }
        for (const o of t.hitRegions)
          if (o.separator) {
            const { element: r3 } = o.separator;
            r3.isConnected && !r3.hasPointerCapture?.(e.pointerId) && r3.setPointerCapture?.(e.pointerId);
          }
        ke({
          commit: false,
          document: e.currentTarget,
          event: e,
          hitRegions: t.hitRegions,
          initialLayoutMap: t.initialLayoutMap,
          mountedGroups: n,
          pointerDownAtPoint: t.pointerDownAtPoint,
          prevCursorFlags: t.cursorFlags
        });
        break;
      }
      default: {
        const o = Oe(e, n);
        o.length === 0 ? t.state !== "inactive" && W({
          cursorFlags: 0,
          state: "inactive"
        }) : W({
          cursorFlags: 0,
          hitRegions: o,
          state: "hover"
        }), fe(e.currentTarget);
        break;
      }
    }
  }
  function Je(e) {
    if (e.relatedTarget instanceof HTMLIFrameElement)
      switch (q().state) {
        case "hover":
          W({
            cursorFlags: 0,
            state: "inactive"
          });
      }
  }
  function Ze(e) {
    if (e.defaultPrevented)
      return;
    if (e.pointerType === "mouse" && e.button > 0)
      return;
    dt(
      e.currentTarget,
      e
    ) && e.preventDefault();
  }
  function en(e) {
    let t = 0, n = 0;
    const o = {};
    for (const i of e)
      if (i.defaultSize !== void 0) {
        t++;
        const s = F(i.defaultSize);
        n += s, o[i.panelId] = s;
      } else
        o[i.panelId] = void 0;
    const r3 = e.length - t;
    if (r3 !== 0) {
      const i = F((100 - n) / r3);
      for (const s of e)
        s.defaultSize === void 0 && (o[s.panelId] = i);
    }
    return o;
  }
  function tn(e, t) {
    const n = e.map((r3) => r3.id), o = Object.keys(t);
    if (n.length !== o.length)
      return false;
    for (const r3 of n)
      if (!o.includes(r3))
        return false;
    return true;
  }
  function Qe({
    group: e,
    panelConstraints: t
  }) {
    const n = e.panels.map(({ id: r3 }) => r3).join(","), o = e.mutableState.defaultLayout;
    return e.mutableState.layouts[n] ?? (o && tn(e.panels, o) ? o : en(t));
  }
  function nn(e, t, n) {
    if (!n[0])
      return;
    const r3 = e.panels.find((a2) => a2.element === t);
    if (!r3 || !r3.onResize)
      return;
    const i = ae({ group: e }), s = e.orientation === "horizontal" ? r3.element.offsetWidth : r3.element.offsetHeight, u2 = r3.mutableValues.prevSize, c = {
      asPercentage: F(s / i * 100),
      inPixels: s
    };
    r3.mutableValues.prevSize = c, r3.onResize(c, r3.id, u2);
  }
  function gt(e, t) {
    if (Object.keys(e).length !== Object.keys(t).length)
      return false;
    for (const o in e)
      if (e[o] !== t[o])
        return false;
    return true;
  }
  function on(e, t) {
    return e.length !== t.length ? false : e.every((n, o) => gt(n, t[o]));
  }
  function rn({
    group: e,
    nextGroupSize: t,
    prevGroupSize: n,
    prevLayout: o
  }) {
    if (n <= 0 || t <= 0 || n === t)
      return o;
    let r3 = 0, i = 0, s = false;
    const u2 = /* @__PURE__ */ new Map(), c = [];
    for (const f of e.panels) {
      const y = o[f.id] ?? 0;
      switch (f.panelConstraints.groupResizeBehavior) {
        case "preserve-pixel-size": {
          s = true;
          const p = y / 100 * n, g = F(
            p / t * 100
          );
          u2.set(f.id, g), r3 += g;
          break;
        }
        case "preserve-relative-size":
        default: {
          c.push(f.id), i += y;
          break;
        }
      }
    }
    if (!s || c.length === 0)
      return o;
    const a2 = 100 - r3, l = { ...o };
    if (u2.forEach((f, y) => {
      l[y] = f;
    }), i > 0)
      for (const f of c) {
        const y = o[f] ?? 0;
        l[f] = F(
          y / i * a2
        );
      }
    else {
      const f = F(
        a2 / c.length
      );
      for (const y of c)
        l[y] = f;
    }
    return l;
  }
  var re = /* @__PURE__ */ new Map();
  function sn(e) {
    let t = true;
    L(
      e.element.ownerDocument.defaultView,
      "Cannot register an unmounted Group"
    );
    const n = e.element.ownerDocument.defaultView.ResizeObserver, o = /* @__PURE__ */ new Set(), r3 = /* @__PURE__ */ new Set(), i = new n((p) => {
      for (const g of p) {
        const { borderBoxSize: d, target: v } = g;
        if (v === e.element) {
          if (t) {
            const h = ae({ group: e });
            if (h === 0)
              return;
            const m = Q(e.id);
            if (!m)
              return;
            const x = Le(e), S = m.defaultLayoutDeferred ? Qe({
              group: e,
              panelConstraints: x
            }) : m.layout, P = rn({
              group: e,
              nextGroupSize: h,
              prevGroupSize: m.groupSize,
              prevLayout: S
            }), C2 = ne({
              layout: P,
              panelConstraints: x
            });
            if (!m.defaultLayoutDeferred && K(m.layout, C2) && on(
              m.derivedPanelConstraints,
              x
            ) && m.groupSize === h)
              continue;
            X2(e, {
              defaultLayoutDeferred: false,
              derivedPanelConstraints: x,
              groupSize: h,
              layout: C2,
              separatorToPanels: m.separatorToPanels
            });
          }
        } else
          nn(e, v, d);
      }
    });
    i.observe(e.element), e.panels.forEach((p) => {
      L(
        !o.has(p.id),
        `Panel ids must be unique; id "${p.id}" was used more than once`
      ), o.add(p.id), p.onResize && i.observe(p.element);
    });
    const s = ae({ group: e }), u2 = Le(e), c = Qe({
      group: e,
      panelConstraints: u2
    }), a2 = ne({
      layout: c,
      panelConstraints: u2
    }), l = e.element.ownerDocument;
    re.set(
      l,
      (re.get(l) ?? 0) + 1
    );
    const f = /* @__PURE__ */ new Map();
    return Ee({ group: e, includeDisabled: true }).forEach((p) => {
      p.separator && f.set(p.separator, p.panels);
    }), X2(e, {
      defaultLayoutDeferred: s === 0,
      derivedPanelConstraints: u2,
      groupSize: s,
      layout: a2,
      separatorToPanels: f
    }), e.separators.forEach((p) => {
      L(
        !r3.has(p.id),
        `Separator ids must be unique; id "${p.id}" was used more than once`
      ), r3.add(p.id), p.element.addEventListener("keydown", Ke);
    }), re.get(l) === 1 && (l.addEventListener("contextmenu", Ve, true), l.addEventListener("dblclick", We, true), l.addEventListener("pointerdown", Xe, true), l.addEventListener("pointerleave", qe), l.addEventListener("pointermove", Ye), l.addEventListener("pointerout", Je), l.addEventListener("pointerup", Ze, true)), function() {
      t = false, re.set(
        l,
        Math.max(0, (re.get(l) ?? 0) - 1)
      ), Vt(e), Nt(e) && fe(l), e.separators.forEach((g) => {
        g.element.removeEventListener("keydown", Ke);
      }), re.get(l) || (l.removeEventListener(
        "contextmenu",
        Ve,
        true
      ), l.removeEventListener(
        "dblclick",
        We,
        true
      ), l.removeEventListener(
        "pointerdown",
        Xe,
        true
      ), l.removeEventListener("pointerleave", qe), l.removeEventListener("pointermove", Ye), l.removeEventListener("pointerout", Je), l.removeEventListener("pointerup", Ze, true)), i.disconnect();
    };
  }
  function an() {
    const [e, t] = useState({}), n = useCallback(() => t({}), []);
    return [e, n];
  }
  function De(e) {
    const t = useId();
    return `${e ?? t}`;
  }
  var V = typeof window < "u" ? useLayoutEffect : useEffect;
  function ue(e) {
    const t = useRef(e);
    return V(() => {
      t.current = e;
    }, [e]), useCallback(
      (...n) => t.current?.(...n),
      [t]
    );
  }
  function Te(...e) {
    return ue((t) => {
      e.forEach((n) => {
        if (n)
          switch (typeof n) {
            case "function": {
              n(t);
              break;
            }
            case "object": {
              n.current = t;
              break;
            }
          }
      });
    });
  }
  function Ne(e) {
    const t = useRef({ ...e });
    return V(() => {
      for (const n in e)
        t.current[n] = e[n];
    }, [e]), t.current;
  }
  var yt = createContext(null);
  function ln({
    separator: e
  }) {
    const { element: t } = e, n = useRef(null);
    return V(() => {
      const o = t.cloneNode(true), r3 = [t, ...t.querySelectorAll("*")], i = [o, ...o.querySelectorAll("*")], s = t.ownerDocument.defaultView;
      return r3.forEach((u2, c) => {
        const a2 = i[c];
        if (a2 instanceof s.HTMLElement || a2 instanceof s.SVGElement) {
          const l = s.getComputedStyle(u2);
          for (let f = 0; f < l.length; f++) {
            const y = l.item(f);
            a2.style.setProperty(
              y,
              l.getPropertyValue(y)
            );
          }
        }
        a2.removeAttribute("data-testid"), a2.removeAttribute("id");
      }), Object.assign(o.style, {
        boxSizing: "border-box",
        height: "100%",
        margin: "0",
        position: "static",
        transform: "none",
        width: "100%"
      }), n.current.appendChild(o), () => o.remove();
    }, [t]), /* @__PURE__ */ jsx(
      "div",
      {
        ref: n,
        style: {
          height: "100%",
          opacity: 0.65,
          pointerEvents: "none",
          width: "100%"
        }
      }
    );
  }
  function be() {
    const e = useContext(yt);
    return L(
      e,
      "Group Context not found; did you render a Panel or Separator outside of a Group?"
    ), e;
  }
  function vt(e) {
    const { registerOverlay: t } = be(), n = useRef(e);
    gt(n.current, e) || (n.current = e);
    const o = n.current;
    return V(
      () => t(o),
      [t, o]
    ), null;
  }
  vt.displayName = "SeparatorOverlay";
  function cn({
    active: e,
    orientation: t,
    style: n,
    ...o
  }) {
    let r3;
    switch (t) {
      case "horizontal": {
        r3 = {
          height: "100%",
          minWidth: "1px"
        };
        break;
      }
      case "vertical": {
        r3 = {
          minHeight: "1px",
          width: "100%"
        };
        break;
      }
    }
    return /* @__PURE__ */ jsx(
      "div",
      {
        ...o,
        "data-separator-overlay": e ? "active" : "inactive",
        style: {
          ...r3,
          ...n,
          flexShrink: 0,
          pointerEvents: "none"
        }
      }
    );
  }
  function un({
    overlay: e,
    preview: t
  }) {
    const { group: n, offset: o, rect: r3, separator: i } = t, s = n.orientation === "horizontal";
    let u2 = i?.preview, c = e;
    return isValidElement(u2) && u2.type === vt && (c = u2.props, u2 = void 0), u2 == null && (c ? u2 = /* @__PURE__ */ jsx(
      cn,
      {
        ...c,
        active: t.active,
        orientation: n.orientation
      }
    ) : i && (u2 = /* @__PURE__ */ jsx(ln, { separator: i }))), /* @__PURE__ */ jsx(
      "div",
      {
        "aria-hidden": "true",
        "data-resize-preview": true,
        inert: true,
        style: {
          height: r3.height,
          left: r3.left,
          pointerEvents: "none",
          position: "absolute",
          top: r3.top,
          transform: s ? `translateX(${o}px)` : `translateY(${o}px)`,
          width: r3.width
        },
        children: u2
      }
    );
  }
  function fn(e, t) {
    const n = useRef({
      getLayout: () => ({}),
      setLayout: Gt
    });
    useImperativeHandle(t, () => n.current, []), V(() => {
      Object.assign(
        n.current,
        mt({ groupId: e })
      );
    });
  }
  function dn({
    groupId: e,
    resizePreviewMode: t
  }) {
    const [n, o] = useState([]), r3 = useRef(n);
    return V(() => {
      const i = (u2) => {
        const c = ft(e), a2 = t === "separator" && u2.state === "active" ? u2.previews.filter(
          (f) => f.group === c && (f.active || !D(f.offset, 0))
        ) : [], l = r3.current;
        l.length === a2.length && a2.every(
          (f, y) => f === l[y]
        ) || (r3.current = a2, o(a2));
      };
      if (t !== "separator") {
        i(q());
        return;
      }
      const s = rt(
        ({ next: u2 }) => i(u2)
      );
      return i(q()), s;
    }, [e, t]), n;
  }
  function pn({
    children: e,
    className: t,
    defaultLayout: n,
    disableCursor: o,
    disabled: r3,
    elementRef: i,
    groupRef: s,
    id: u2,
    onLayoutChange: c,
    onLayoutChanged: a2,
    orientation: l = "horizontal",
    resizePreviewMode: f = "panel",
    resizeTargetMinimumSize: y = {
      coarse: 20,
      fine: 10
    },
    style: p,
    ...g
  }) {
    const d = useRef({
      onLayoutChange: {},
      onLayoutChanged: {}
    }), v = ue((b) => {
      K(d.current.onLayoutChange, b) || (d.current.onLayoutChange = b, c?.(b));
    }), h = ue(
      (b, z) => {
        K(d.current.onLayoutChanged, b) || (d.current.onLayoutChanged = b, a2?.(b, { isUserInteraction: z }));
      }
    ), m = De(u2), [x, S] = useState(), P = dn({
      groupId: m,
      resizePreviewMode: f
    }), C2 = useRef(null), [E, w] = an(), R = useRef({
      lastExpandedPanelSizes: {},
      layouts: {},
      panels: [],
      separators: []
    }), N = Te(C2, i);
    fn(m, s);
    const O = ue(
      (b, z) => {
        const M = Q(b);
        if (M)
          return {
            flexGrow: M.layout[z] ?? 1
          };
        if (n?.[z])
          return {
            flexGrow: n?.[z]
          };
      }
    ), I = Ne({
      defaultLayout: n,
      disableCursor: o,
      resizeTargetMinimumSize: y
    }), G = useMemo(
      () => ({
        get disableCursor() {
          return !!I.disableCursor;
        },
        getPanelStyles: O,
        id: m,
        orientation: l,
        registerPanel: (b) => {
          const z = R.current;
          return z.panels = Ce(l, [
            ...z.panels,
            b
          ]), w(), () => {
            z.panels = z.panels.filter(
              (M) => M !== b
            ), w();
          };
        },
        registerOverlay: (b) => (S(b), () => {
          S(void 0);
        }),
        registerSeparator: (b) => {
          const z = R.current;
          return z.separators = Ce(l, [
            ...z.separators,
            b
          ]), w(), () => {
            z.separators = z.separators.filter(
              (M) => M !== b
            ), w();
          };
        },
        updatePanelProps: (b, { disabled: z }) => {
          const A = R.current.panels.find(
            (oe) => oe.id === b
          );
          A && (A.panelConstraints.disabled = z);
          const $ = ft(m), Y2 = Q(m);
          $ && Y2 && X2($, {
            ...Y2,
            derivedPanelConstraints: Le($)
          });
        },
        updateSeparatorProps: (b, {
          disabled: z,
          disableDoubleClick: M
        }) => {
          const $ = R.current.separators.find(
            (Y2) => Y2.id === b
          );
          $ && ($.disabled = z, $.disableDoubleClick = M);
        }
      }),
      [O, m, w, l, I]
    ), _ = useRef(null);
    return V(() => {
      const b = C2.current;
      if (b === null)
        return;
      const z = R.current;
      let M;
      if (I.defaultLayout !== void 0 && Object.keys(I.defaultLayout).length === z.panels.length) {
        M = {};
        for (const J2 of z.panels) {
          const pe2 = I.defaultLayout[J2.id];
          pe2 !== void 0 && (M[J2.id] = pe2);
        }
      }
      const A = {
        disabled: !!r3,
        element: b,
        id: m,
        mutableState: {
          defaultLayout: M,
          disableCursor: !!I.disableCursor,
          expandedPanelSizes: R.current.lastExpandedPanelSizes,
          layouts: R.current.layouts
        },
        orientation: l,
        panels: z.panels,
        resizePreviewMode: f,
        get resizeTargetMinimumSize() {
          return I.resizeTargetMinimumSize;
        },
        separators: z.separators
      };
      _.current = A;
      const $ = sn(A), { defaultLayoutDeferred: Y2, derivedPanelConstraints: oe, layout: le2 } = Q(A.id, true);
      !Y2 && oe.length > 0 && (v(le2), h(le2, false));
      const xe = Ie(m, (J2) => {
        const { defaultLayoutDeferred: pe2, derivedPanelConstraints: Ge, layout: he2 } = J2.next;
        if (pe2 || Ge.length === 0)
          return;
        const St2 = A.panels.map(({ id: H }) => H).join(",");
        A.mutableState.layouts[St2] = he2, Ge.forEach((H) => {
          if (H.collapsible) {
            const { layout: ze } = J2.prev ?? {};
            if (ze) {
              const xt = D(
                H.collapsedSize,
                he2[H.panelId]
              ), zt = D(
                H.collapsedSize,
                ze[H.panelId]
              );
              xt && !zt && (A.mutableState.expandedPanelSizes[H.panelId] = ze[H.panelId]);
            }
          }
        });
        const Ae2 = q(), bt = Ae2.state !== "active" || !Ae2.hitRegions.some((H) => H.group === A);
        v(he2), bt && h(he2, J2.isUserInteraction);
      });
      return () => {
        _.current = null, $(), xe();
      };
    }, [
      r3,
      m,
      h,
      v,
      l,
      E,
      f,
      I
    ]), useEffect(() => {
      const b = _.current;
      b && (b.mutableState.defaultLayout = n, b.mutableState.disableCursor = !!o);
    }), /* @__PURE__ */ jsx(yt.Provider, { value: G, children: /* @__PURE__ */ jsxs(
      "div",
      {
        ...g,
        className: t,
        "data-group": true,
        "data-testid": m,
        id: m,
        ref: N,
        style: {
          height: "100%",
          width: "100%",
          overflow: "hidden",
          position: f === "separator" ? "relative" : void 0,
          ...p,
          display: "flex",
          flexDirection: l === "horizontal" ? "row" : "column",
          flexWrap: "nowrap",
          // Inform the browser that the library is handling touch events for this element
          // but still allow users to scroll content within panels in the non-resizing direction
          // NOTE This is not an inherited style
          // See github.com/bvaughn/react-resizable-panels/issues/662
          touchAction: l === "horizontal" ? "pan-y" : "pan-x"
        },
        children: [
          e,
          P.map((b) => /* @__PURE__ */ jsx(
            un,
            {
              overlay: x,
              preview: b
            },
            b.key
          ))
        ]
      }
    ) });
  }
  pn.displayName = "Group";
  function gn(e, t) {
    const { id: n } = be(), o = useRef({
      collapse: we,
      expand: we,
      getSize: () => ({
        asPercentage: 0,
        inPixels: 0
      }),
      isCollapsed: () => false,
      resize: we
    });
    useImperativeHandle(t, () => o.current, []), V(() => {
      Object.assign(
        o.current,
        ht({ groupId: n, panelId: e })
      );
    });
  }
  function yn({
    children: e,
    className: t,
    collapsedSize: n = "0%",
    collapsedThreshold: o,
    collapsible: r3 = false,
    defaultSize: i,
    disabled: s,
    elementRef: u2,
    groupResizeBehavior: c = "preserve-relative-size",
    id: a2,
    maxSize: l = "100%",
    minSize: f = "0%",
    onResize: y,
    panelRef: p,
    style: g,
    ...d
  }) {
    const v = !!a2, h = De(a2), m = Ne({
      disabled: s
    }), x = useRef(null), S = Te(x, u2), {
      getPanelStyles: P,
      id: C2,
      orientation: E,
      registerPanel: w,
      updatePanelProps: R
    } = be(), N = y !== null, O = ue(
      (b, z, M) => {
        y?.(b, a2, M);
      }
    );
    V(() => {
      const b = x.current;
      if (b !== null) {
        const z = {
          element: b,
          id: h,
          idIsStable: v,
          mutableValues: {
            expandToSize: void 0,
            prevSize: void 0
          },
          onResize: N ? O : void 0,
          panelConstraints: {
            groupResizeBehavior: c,
            collapsedSize: n,
            collapsedThreshold: o,
            collapsible: r3,
            defaultSize: i,
            disabled: m.disabled,
            maxSize: l,
            minSize: f
          }
        };
        return w(z);
      }
    }, [
      c,
      n,
      o,
      r3,
      i,
      N,
      h,
      v,
      l,
      f,
      O,
      w,
      m
    ]), useEffect(() => {
      R(h, { disabled: s });
    }, [s, h, R]), gn(h, p);
    const I = () => {
      const b = P(C2, h);
      if (b)
        return JSON.stringify(b);
    }, G = useSyncExternalStore(
      (b) => Ie(C2, b),
      I,
      I
    );
    let _;
    return G ? _ = JSON.parse(G) : i !== void 0 ? _ = {
      flexGrow: void 0,
      flexShrink: void 0,
      flexBasis: i
    } : _ = { flexGrow: 1 }, /* @__PURE__ */ jsx(
      "div",
      {
        ...d,
        "data-disabled": s || void 0,
        "data-panel": true,
        "data-testid": h,
        id: h,
        ref: S,
        style: {
          ...vn,
          display: "flex",
          flexBasis: 0,
          flexShrink: 1,
          overflow: "visible",
          ..._
        },
        children: /* @__PURE__ */ jsx(
          "div",
          {
            className: t,
            style: {
              maxHeight: "100%",
              maxWidth: "100%",
              flexGrow: 1,
              overflow: "auto",
              ...g,
              // Inform the browser that the library is handling touch events for this element
              // but still allow users to scroll content within panels in the non-resizing direction
              // NOTE This is not an inherited style
              // See github.com/bvaughn/react-resizable-panels/issues/662
              touchAction: E === "horizontal" ? "pan-y" : "pan-x"
            },
            children: e
          }
        )
      }
    );
  }
  yn.displayName = "Panel";
  var vn = {
    minHeight: 0,
    maxHeight: "100%",
    height: "auto",
    minWidth: 0,
    maxWidth: "100%",
    width: "auto",
    border: "none",
    borderWidth: 0,
    padding: 0,
    margin: 0
  };
  function Sn({
    layout: e,
    panelConstraints: t,
    panelId: n,
    panelIndex: o
  }) {
    let r3, i;
    const s = e[n], u2 = t.find(
      (c) => c.panelId === n
    );
    if (u2) {
      const c = u2.maxSize, a2 = u2.collapsible ? u2.collapsedSize : u2.minSize, l = [o, o + 1];
      i = ne({
        layout: de({
          delta: a2 - s,
          initialLayout: e,
          panelConstraints: t,
          pivotIndices: l,
          prevLayout: e
        }),
        panelConstraints: t
      })[n], r3 = ne({
        layout: de({
          delta: c - s,
          initialLayout: e,
          panelConstraints: t,
          pivotIndices: l,
          prevLayout: e
        }),
        panelConstraints: t
      })[n];
    }
    return {
      valueControls: n,
      valueMax: r3,
      valueMin: i,
      valueNow: s
    };
  }
  function bn({
    children: e,
    className: t,
    disabled: n,
    disableDoubleClick: o,
    elementRef: r3,
    id: i,
    preview: s,
    style: u2,
    ...c
  }) {
    const a2 = De(i), l = Ne({
      disabled: n,
      disableDoubleClick: o,
      children: e,
      className: t,
      preview: s,
      style: u2
    }), [f, y] = useState({}), [p, g] = useState("inactive"), [d, v] = useState(false), h = useRef(null), m = useRef(null), x = Te(h, r3), {
      disableCursor: S,
      id: P,
      orientation: C2,
      registerSeparator: E,
      updateSeparatorProps: w
    } = be(), R = C2 === "horizontal" ? "vertical" : "horizontal";
    V(() => {
      const I = h.current;
      if (I !== null) {
        const G = {
          disabled: l.disabled,
          disableDoubleClick: l.disableDoubleClick,
          element: I,
          id: a2,
          get children() {
            return l.children;
          },
          get className() {
            return l.className;
          },
          get preview() {
            return l.preview;
          },
          get style() {
            return l.style;
          }
        };
        m.current = G;
        const _ = E(G), b = rt(
          (M) => {
            g(
              M.next.state !== "inactive" && M.next.hitRegions.some(
                (A) => A.separator === G
              ) ? M.next.state : "inactive"
            );
          }
        ), z = Ie(
          P,
          (M) => {
            const { derivedPanelConstraints: A, layout: $, separatorToPanels: Y2 } = M.next, oe = Y2.get(G);
            if (oe) {
              const le2 = oe[0], xe = A.findIndex(
                (J2) => J2.panelId === le2.id
              );
              y(
                Sn({
                  layout: $,
                  panelConstraints: A,
                  panelId: le2.id,
                  panelIndex: xe
                })
              );
            }
          }
        );
        return () => {
          m.current = null, b(), z(), _();
        };
      }
    }, [P, a2, E, l]), V(() => {
      const I = m.current;
      I && Tt(I);
    }, [s]), useEffect(() => {
      w(a2, { disabled: n, disableDoubleClick: o });
    }, [n, o, a2, w]);
    let N;
    n && !S && (N = "not-allowed");
    let O;
    if (n)
      O = "disabled";
    else
      switch (p) {
        case "active": {
          O = "active";
          break;
        }
        default:
          d ? O = "focus" : O = p;
      }
    return /* @__PURE__ */ jsx(
      "div",
      {
        ...c,
        "aria-controls": f.valueControls,
        "aria-disabled": n || void 0,
        "aria-orientation": R,
        "aria-valuemax": f.valueMax,
        "aria-valuemin": f.valueMin,
        "aria-valuenow": f.valueNow,
        children: e,
        className: t,
        "data-separator": O,
        "data-testid": a2,
        id: a2,
        onBlur: () => v(false),
        onFocus: () => v(true),
        ref: x,
        role: "separator",
        style: {
          flexBasis: "auto",
          cursor: N,
          ...u2,
          flexGrow: 0,
          flexShrink: 0,
          // Inform the browser that the library is handling touch events for this element
          // See github.com/bvaughn/react-resizable-panels/issues/662
          touchAction: "none"
        },
        tabIndex: n ? void 0 : 0
      }
    );
  }
  bn.displayName = "Separator";

  // ../../../packages/shadcn-ui/dist/index.js
  function r2(...e) {
    return twMerge(clsx(e));
  }
  var le = cva(
    "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    {
      variants: {
        variant: {
          default: "bg-primary text-primary-foreground hover:bg-primary/80",
          outline: "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
          secondary: "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
          ghost: "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
          destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
          link: "text-primary underline-offset-4 hover:underline"
        },
        size: {
          default: "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
          xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
          sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
          lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
          icon: "size-8",
          "icon-xs": "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
          "icon-sm": "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
          "icon-lg": "size-9"
        }
      },
      defaultVariants: {
        variant: "default",
        size: "default"
      }
    }
  );
  function C({
    className: e,
    variant: t = "default",
    size: o = "default",
    asChild: n = false,
    ...i
  }) {
    const s = n ? dist_exports.Root : "button";
    return /* @__PURE__ */ jsx(
      s,
      {
        "data-slot": "button",
        "data-variant": t,
        "data-size": o,
        className: r2(le({ variant: t, size: o, className: e })),
        ...i
      }
    );
  }
  function tt({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports4.Root, { "data-slot": "alert-dialog", ...e });
  }
  function ue2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports4.Portal, { "data-slot": "alert-dialog-portal", ...e });
  }
  function ce({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports4.Overlay,
      {
        "data-slot": "alert-dialog-overlay",
        className: r2(
          "fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          e
        ),
        ...t
      }
    );
  }
  function rt2({
    className: e,
    size: t = "default",
    ...o
  }) {
    return /* @__PURE__ */ jsxs(ue2, { children: [
      /* @__PURE__ */ jsx(ce, {}),
      /* @__PURE__ */ jsx(
        dist_exports4.Content,
        {
          "data-slot": "alert-dialog-content",
          "data-size": t,
          className: r2(
            "group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            e
          ),
          ...o
        }
      )
    ] });
  }
  function ot2({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      "div",
      {
        "data-slot": "alert-dialog-header",
        className: r2(
          "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
          e
        ),
        ...t
      }
    );
  }
  function nt({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      "div",
      {
        "data-slot": "alert-dialog-footer",
        className: r2(
          "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
          e
        ),
        ...t
      }
    );
  }
  function dt2({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports4.Title,
      {
        "data-slot": "alert-dialog-title",
        className: r2(
          "text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
          e
        ),
        ...t
      }
    );
  }
  function st2({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports4.Description,
      {
        "data-slot": "alert-dialog-description",
        className: r2(
          "text-sm text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
          e
        ),
        ...t
      }
    );
  }
  function lt2({
    className: e,
    variant: t = "default",
    size: o = "default",
    ...n
  }) {
    return /* @__PURE__ */ jsx(C, { variant: t, size: o, asChild: true, children: /* @__PURE__ */ jsx(
      dist_exports4.Action,
      {
        "data-slot": "alert-dialog-action",
        className: r2(e),
        ...n
      }
    ) });
  }
  function ut2({
    className: e,
    variant: t = "outline",
    size: o = "default",
    ...n
  }) {
    return /* @__PURE__ */ jsx(C, { variant: t, size: o, asChild: true, children: /* @__PURE__ */ jsx(
      dist_exports4.Cancel,
      {
        "data-slot": "alert-dialog-cancel",
        className: r2(e),
        ...n
      }
    ) });
  }
  var ge2 = cva(
    "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
    {
      variants: {
        variant: {
          default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
          secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
          destructive: "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
          outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
          ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
          link: "text-primary underline-offset-4 hover:underline"
        }
      },
      defaultVariants: {
        variant: "default"
      }
    }
  );
  function vt2({
    className: e,
    variant: t = "default",
    asChild: o = false,
    ...n
  }) {
    const i = o ? dist_exports.Root : "span";
    return /* @__PURE__ */ jsx(
      i,
      {
        "data-slot": "badge",
        "data-variant": t,
        className: r2(ge2({ variant: t }), e),
        ...n
      }
    );
  }
  function St({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports2.Root, { "data-slot": "collapsible", ...e });
  }
  function _t2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports2.CollapsibleTrigger,
      {
        "data-slot": "collapsible-trigger",
        ...e
      }
    );
  }
  function Tt2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports2.CollapsibleContent,
      {
        "data-slot": "collapsible-content",
        ...e
      }
    );
  }
  function pe({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports3.Root, { "data-slot": "dialog", ...e });
  }
  function fe2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports3.Portal, { "data-slot": "dialog-portal", ...e });
  }
  function me2({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports3.Overlay,
      {
        "data-slot": "dialog-overlay",
        className: r2(
          "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          e
        ),
        ...t
      }
    );
  }
  function be2({
    className: e,
    children: t,
    showCloseButton: o = true,
    ...n
  }) {
    return /* @__PURE__ */ jsxs(fe2, { children: [
      /* @__PURE__ */ jsx(me2, {}),
      /* @__PURE__ */ jsxs(
        dist_exports3.Content,
        {
          "data-slot": "dialog-content",
          className: r2(
            "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            e
          ),
          ...n,
          children: [
            t,
            o && /* @__PURE__ */ jsx(dist_exports3.Close, { "data-slot": "dialog-close", asChild: true, children: /* @__PURE__ */ jsxs(
              C,
              {
                variant: "ghost",
                className: "absolute top-2 right-2",
                size: "icon-sm",
                children: [
                  /* @__PURE__ */ jsx(
                    X,
                    {}
                  ),
                  /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Close" })
                ]
              }
            ) })
          ]
        }
      )
    ] });
  }
  function ve({ className: e, ...t }) {
    return /* @__PURE__ */ jsx(
      "div",
      {
        "data-slot": "dialog-header",
        className: r2("flex flex-col gap-2", e),
        ...t
      }
    );
  }
  function Mt2({
    className: e,
    showCloseButton: t = false,
    children: o,
    ...n
  }) {
    return /* @__PURE__ */ jsxs(
      "div",
      {
        "data-slot": "dialog-footer",
        className: r2(
          "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
          e
        ),
        ...n,
        children: [
          o,
          t && /* @__PURE__ */ jsx(dist_exports3.Close, { asChild: true, children: /* @__PURE__ */ jsx(C, { variant: "outline", children: "Close" }) })
        ]
      }
    );
  }
  function he({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports3.Title,
      {
        "data-slot": "dialog-title",
        className: r2(
          "text-base leading-none font-medium",
          e
        ),
        ...t
      }
    );
  }
  function Z({ className: e, type: t, ...o }) {
    return /* @__PURE__ */ jsx(
      "input",
      {
        type: t,
        "data-slot": "input",
        className: r2(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          e
        ),
        ...o
      }
    );
  }
  function we2({ className: e, ...t }) {
    return /* @__PURE__ */ jsx(
      "textarea",
      {
        "data-slot": "textarea",
        className: r2(
          "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          e
        ),
        ...t
      }
    );
  }
  var ye2 = cva(
    "flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground select-none group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-4",
    {
      variants: {
        align: {
          "inline-start": "order-first pl-2 has-[>button]:ml-[-0.3rem] has-[>kbd]:ml-[-0.15rem]",
          "inline-end": "order-last pr-2 has-[>button]:mr-[-0.3rem] has-[>kbd]:mr-[-0.15rem]",
          "block-start": "order-first w-full justify-start px-2.5 pt-2 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2",
          "block-end": "order-last w-full justify-start px-2.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2"
        }
      },
      defaultVariants: {
        align: "inline-start"
      }
    }
  );
  var Ne2 = cva(
    "flex items-center gap-2 text-sm shadow-none",
    {
      variants: {
        size: {
          xs: "h-6 gap-1 rounded-[calc(var(--radius)-3px)] px-1.5 [&>svg:not([class*='size-'])]:size-3.5",
          sm: "",
          "icon-xs": "size-6 rounded-[calc(var(--radius)-3px)] p-0 has-[>svg]:p-0",
          "icon-sm": "size-8 p-0 has-[>svg]:p-0"
        }
      },
      defaultVariants: {
        size: "xs"
      }
    }
  );
  function ia({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports8.Root, { "data-slot": "dropdown-menu", ...e });
  }
  function sa({
    ...e
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports8.Trigger,
      {
        "data-slot": "dropdown-menu-trigger",
        ...e
      }
    );
  }
  function la({
    className: e,
    align: t = "start",
    sideOffset: o = 4,
    ...n
  }) {
    return /* @__PURE__ */ jsx(dist_exports8.Portal, { children: /* @__PURE__ */ jsx(
      dist_exports8.Content,
      {
        "data-slot": "dropdown-menu-content",
        sideOffset: o,
        align: t,
        className: r2("z-50 max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", e),
        ...n
      }
    ) });
  }
  function ca({
    className: e,
    inset: t,
    variant: o = "default",
    ...n
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports8.Item,
      {
        "data-slot": "dropdown-menu-item",
        "data-inset": t,
        "data-variant": o,
        className: r2(
          "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
          e
        ),
        ...n
      }
    );
  }
  function pa({
    ...e
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports8.RadioGroup,
      {
        "data-slot": "dropdown-menu-radio-group",
        ...e
      }
    );
  }
  function fa({
    className: e,
    children: t,
    inset: o,
    ...n
  }) {
    return /* @__PURE__ */ jsxs(
      dist_exports8.RadioItem,
      {
        "data-slot": "dropdown-menu-radio-item",
        "data-inset": o,
        className: r2(
          "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          e
        ),
        ...n,
        children: [
          /* @__PURE__ */ jsx(
            "span",
            {
              className: "pointer-events-none absolute right-2 flex items-center justify-center",
              "data-slot": "dropdown-menu-radio-item-indicator",
              children: /* @__PURE__ */ jsx(dist_exports8.ItemIndicator, { children: /* @__PURE__ */ jsx(
                Check,
                {}
              ) })
            }
          ),
          t
        ]
      }
    );
  }
  function ma({
    className: e,
    inset: t,
    ...o
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports8.Label,
      {
        "data-slot": "dropdown-menu-label",
        "data-inset": t,
        className: r2(
          "px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7",
          e
        ),
        ...o
      }
    );
  }
  function Na({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports10.Root, { "data-slot": "popover", ...e });
  }
  function Ca({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports10.Trigger, { "data-slot": "popover-trigger", ...e });
  }
  function Sa({
    className: e,
    align: t = "center",
    sideOffset: o = 4,
    ...n
  }) {
    return /* @__PURE__ */ jsx(dist_exports10.Portal, { children: /* @__PURE__ */ jsx(
      dist_exports10.Content,
      {
        "data-slot": "popover-content",
        align: t,
        sideOffset: o,
        className: r2(
          "z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          e
        ),
        ...n
      }
    ) });
  }
  function Ma({
    className: e,
    value: t,
    ...o
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports11.Root,
      {
        "data-slot": "progress",
        className: r2(
          "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
          e
        ),
        ...o,
        children: /* @__PURE__ */ jsx(
          dist_exports11.Indicator,
          {
            "data-slot": "progress-indicator",
            className: "size-full flex-1 bg-primary transition-all",
            style: { transform: `translateX(-${100 - (t || 0)}%)` }
          }
        )
      }
    );
  }
  function Ga({
    className: e,
    children: t,
    ...o
  }) {
    return /* @__PURE__ */ jsxs(
      dist_exports12.Root,
      {
        "data-slot": "scroll-area",
        className: r2("relative", e),
        ...o,
        children: [
          /* @__PURE__ */ jsx(
            dist_exports12.Viewport,
            {
              "data-slot": "scroll-area-viewport",
              className: "size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1",
              children: t
            }
          ),
          /* @__PURE__ */ jsx(Ce2, {}),
          /* @__PURE__ */ jsx(dist_exports12.Corner, {})
        ]
      }
    );
  }
  function Ce2({
    className: e,
    orientation: t = "vertical",
    ...o
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports12.ScrollAreaScrollbar,
      {
        "data-slot": "scroll-area-scrollbar",
        "data-orientation": t,
        orientation: t,
        className: r2(
          "flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
          e
        ),
        ...o,
        children: /* @__PURE__ */ jsx(
          dist_exports12.ScrollAreaThumb,
          {
            "data-slot": "scroll-area-thumb",
            className: "relative flex-1 rounded-full bg-border"
          }
        )
      }
    );
  }
  function ja({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports13.Root, { "data-slot": "select", ...e });
  }
  function $a({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports13.Value, { "data-slot": "select-value", ...e });
  }
  function Ea({
    className: e,
    size: t = "default",
    children: o,
    ...n
  }) {
    return /* @__PURE__ */ jsxs(
      dist_exports13.Trigger,
      {
        "data-slot": "select-trigger",
        "data-size": t,
        className: r2(
          "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          e
        ),
        ...n,
        children: [
          o,
          /* @__PURE__ */ jsx(dist_exports13.Icon, { asChild: true, children: /* @__PURE__ */ jsx(ChevronDown, { className: "pointer-events-none size-4 text-muted-foreground" }) })
        ]
      }
    );
  }
  function Oa({
    className: e,
    children: t,
    position: o = "item-aligned",
    align: n = "center",
    ...i
  }) {
    return /* @__PURE__ */ jsx(dist_exports13.Portal, { children: /* @__PURE__ */ jsxs(
      dist_exports13.Content,
      {
        "data-slot": "select-content",
        "data-align-trigger": o === "item-aligned",
        className: r2("relative z-50 max-h-(--radix-select-content-available-height) min-w-36 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", o === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1", e),
        position: o,
        align: n,
        ...i,
        children: [
          /* @__PURE__ */ jsx(Se, {}),
          /* @__PURE__ */ jsx(
            dist_exports13.Viewport,
            {
              "data-position": o,
              className: r2(
                "data-[position=popper]:h-(--radix-select-trigger-height) data-[position=popper]:w-full data-[position=popper]:min-w-(--radix-select-trigger-width)",
                o === "popper" && ""
              ),
              children: t
            }
          ),
          /* @__PURE__ */ jsx(_e3, {})
        ]
      }
    ) });
  }
  function Ha({
    className: e,
    children: t,
    ...o
  }) {
    return /* @__PURE__ */ jsxs(
      dist_exports13.Item,
      {
        "data-slot": "select-item",
        className: r2(
          "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
          e
        ),
        ...o,
        children: [
          /* @__PURE__ */ jsx("span", { className: "pointer-events-none absolute right-2 flex size-4 items-center justify-center", children: /* @__PURE__ */ jsx(dist_exports13.ItemIndicator, { children: /* @__PURE__ */ jsx(Check, { className: "pointer-events-none" }) }) }),
          /* @__PURE__ */ jsx(dist_exports13.ItemText, { children: t })
        ]
      }
    );
  }
  function Se({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports13.ScrollUpButton,
      {
        "data-slot": "select-scroll-up-button",
        className: r2(
          "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
          e
        ),
        ...t,
        children: /* @__PURE__ */ jsx(
          ChevronUp,
          {}
        )
      }
    );
  }
  function _e3({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports13.ScrollDownButton,
      {
        "data-slot": "select-scroll-down-button",
        className: r2(
          "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
          e
        ),
        ...t,
        children: /* @__PURE__ */ jsx(
          ChevronDown,
          {}
        )
      }
    );
  }
  function Ie2({ ...e }) {
    return /* @__PURE__ */ jsx(dist_exports3.Root, { "data-slot": "sheet", ...e });
  }
  function De2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports3.Portal, { "data-slot": "sheet-portal", ...e });
  }
  function Me2({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports3.Overlay,
      {
        "data-slot": "sheet-overlay",
        className: r2(
          "fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          e
        ),
        ...t
      }
    );
  }
  function Re2({
    className: e,
    children: t,
    side: o = "right",
    showCloseButton: n = true,
    ...i
  }) {
    return /* @__PURE__ */ jsxs(De2, { children: [
      /* @__PURE__ */ jsx(Me2, {}),
      /* @__PURE__ */ jsxs(
        dist_exports3.Content,
        {
          "data-slot": "sheet-content",
          "data-side": o,
          className: r2(
            "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10",
            e
          ),
          ...i,
          children: [
            t,
            n && /* @__PURE__ */ jsx(dist_exports3.Close, { "data-slot": "sheet-close", asChild: true, children: /* @__PURE__ */ jsxs(
              C,
              {
                variant: "ghost",
                className: "absolute top-3 right-3",
                size: "icon-sm",
                children: [
                  /* @__PURE__ */ jsx(
                    X,
                    {}
                  ),
                  /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Close" })
                ]
              }
            ) })
          ]
        }
      )
    ] });
  }
  function Ae({ className: e, ...t }) {
    return /* @__PURE__ */ jsx(
      "div",
      {
        "data-slot": "sheet-header",
        className: r2("flex flex-col gap-0.5 p-4", e),
        ...t
      }
    );
  }
  function Pe({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports3.Title,
      {
        "data-slot": "sheet-title",
        className: r2(
          "text-base font-medium text-foreground",
          e
        ),
        ...t
      }
    );
  }
  function K2({ className: e, ...t }) {
    return /* @__PURE__ */ jsx(
      "div",
      {
        "data-slot": "skeleton",
        className: r2("animate-pulse rounded-md bg-muted", e),
        ...t
      }
    );
  }
  function Be2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports14.Root, { "data-slot": "tooltip", ...e });
  }
  function $e2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports14.Trigger, { "data-slot": "tooltip-trigger", ...e });
  }
  function Ee2({
    className: e,
    sideOffset: t = 0,
    children: o,
    ...n
  }) {
    return /* @__PURE__ */ jsx(dist_exports14.Portal, { children: /* @__PURE__ */ jsxs(
      dist_exports14.Content,
      {
        "data-slot": "tooltip-content",
        sideOffset: t,
        className: r2(
          "z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          e
        ),
        ...n,
        children: [
          o,
          /* @__PURE__ */ jsx(dist_exports14.Arrow, { className: "z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" })
        ]
      }
    ) });
  }
  var Le2 = 3600 * 24 * 7;
  var J = createContext(null);
  var Ue2 = cva(
    "peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate",
    {
      variants: {
        variant: {
          default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          outline: "bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]"
        },
        size: {
          default: "h-8 text-sm",
          sm: "h-7 text-xs",
          lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!"
        }
      },
      defaultVariants: {
        variant: "default",
        size: "default"
      }
    }
  );
  var We2 = cva(
    "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
    {
      variants: {
        variant: {
          default: "bg-muted",
          line: "gap-1 bg-transparent"
        }
      },
      defaultVariants: {
        variant: "default"
      }
    }
  );
  var Y = cva(
    "group/toggle inline-flex items-center justify-center gap-1 rounded-lg text-sm font-medium whitespace-nowrap transition-all outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:bg-muted data-[state=on]:bg-muted dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    {
      variants: {
        variant: {
          default: "bg-transparent",
          outline: "border border-input bg-transparent hover:bg-muted"
        },
        size: {
          default: "h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
          sm: "h-7 min-w-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
          lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2"
        }
      },
      defaultVariants: {
        variant: "default",
        size: "default"
      }
    }
  );
  var Q2 = createContext({
    size: "default",
    variant: "default",
    spacing: 2,
    orientation: "horizontal"
  });

  // src/lib/remote-components/resume-screen/src/components/badges.tsx
  function candidateSpec(status, timedOut) {
    switch (status) {
      case "pending_review":
        return { label: "\u5F85\u5BA1", tone: "tone-blue", dot: true };
      case "accepted":
        return { label: "\u63A8\u8FDB", tone: "tone-green", icon: "ri-arrow-right-up-line" };
      case "hold":
        return { label: "\u5F85\u5B9A", tone: "tone-amber", icon: "ri-pause-line" };
      case "rejected":
        return { label: "\u6DD8\u6C70", tone: "tone-red", icon: "ri-close-circle-line" };
      case "failed":
        return { label: "\u5931\u8D25", tone: "tone-failed", icon: "ri-error-warning-line" };
      default:
        return timedOut ? { label: "\u89E3\u6790\u8D85\u65F6", tone: "tone-amber", icon: "ri-timer-line" } : { label: "\u89E3\u6790\u4E2D", tone: "tone-blue", icon: "ri-loader-4-line", spin: true };
    }
  }
  function CandidateBadge({ status, timedOut = false }) {
    const spec = candidateSpec(status, timedOut);
    return /* @__PURE__ */ react_shim_default.createElement("span", { className: `rs-badge ${spec.tone}`, title: spec.label }, spec.dot ? /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-badge-dot" }) : null, spec.icon ? /* @__PURE__ */ react_shim_default.createElement("i", { className: spec.spin ? `${spec.icon} rs-spin` : spec.icon, "aria-hidden": "true" }) : null, spec.label);
  }
  function statusAccent(status, timedOut = false) {
    switch (status) {
      case "pending_review":
      case "parsing":
      case "draft":
        return timedOut ? "var(--rs-amber)" : "var(--rs-blue)";
      case "accepted":
        return "var(--rs-green)";
      case "hold":
        return "var(--rs-amber)";
      case "rejected":
        return "var(--rs-red)";
      case "failed":
        return "#b91c1c";
      default:
        return "var(--rs-soft)";
    }
  }
  function QueueBadge({ status }) {
    const spec = status === "queued" ? { label: "\u6392\u961F\u4E2D", tone: "tone-neutral" } : status === "uploading" ? { label: "\u4E0A\u4F20\u4E2D", tone: "tone-blue", icon: "ri-loader-4-line", spin: true, hint: "\u4E0A\u4F20\u5E76\u7531\u670D\u52A1\u7AEF\u89E3\u6790\u4E2D" } : status === "created" ? { label: "\u5DF2\u521B\u5EFA", tone: "tone-green", icon: "ri-check-line" } : status === "skipped" ? { label: "\u8DF3\u8FC7(\u91CD\u590D)", tone: "tone-neutral" } : { label: "\u5931\u8D25", tone: "tone-red", icon: "ri-error-warning-line" };
    if (!spec) return null;
    return /* @__PURE__ */ react_shim_default.createElement("span", { className: `rs-badge ${spec.tone}`, title: spec.hint ?? spec.label }, spec.icon ? /* @__PURE__ */ react_shim_default.createElement("i", { className: spec.spin ? `${spec.icon} rs-spin` : spec.icon, "aria-hidden": "true" }) : null, spec.label);
  }

  // src/lib/remote-components/resume-screen/src/components/candidate-list.tsx
  var { memo: memo2, useEffect: useEffect2, useRef: useRef2, useState: useState2 } = react_shim_default;
  var SORT_OPTIONS = [
    { value: "matchScore:desc", label: "\u5339\u914D\u5206\u964D\u5E8F", by: "matchScore", dir: "desc" },
    { value: "matchScore:asc", label: "\u5339\u914D\u5206\u5347\u5E8F", by: "matchScore", dir: "asc" },
    { value: "createdAt:desc", label: "\u521B\u5EFA\u65F6\u95F4\u964D\u5E8F", by: "createdAt", dir: "desc" },
    { value: "createdAt:asc", label: "\u521B\u5EFA\u65F6\u95F4\u5347\u5E8F", by: "createdAt", dir: "asc" },
    { value: "updatedAt:desc", label: "\u66F4\u65B0\u65F6\u95F4\u964D\u5E8F", by: "updatedAt", dir: "desc" }
  ];
  var STATUS_OPTIONS = [
    { value: "all", label: "\u5168\u90E8" },
    { value: "pending_review", label: "\u5F85\u5BA1" },
    { value: "accepted", label: "\u63A8\u8FDB" },
    { value: "hold", label: "\u5F85\u5B9A" },
    { value: "rejected", label: "\u6DD8\u6C70" },
    { value: "failed", label: "\u5931\u8D25" },
    { value: "parsing", label: "\u89E3\u6790\u4E2D" }
  ];
  function CandidateList(props) {
    const { loading, items, total, selectedId, search, status, sortBy, sortDir, enteringIds } = props;
    const listRef = useRef2(null);
    const [searchDraft, setSearchDraft] = useState2(search);
    useEffect2(() => {
      setSearchDraft(search);
    }, [search]);
    useEffect2(() => {
      if (!selectedId || !listRef.current) return;
      const node = listRef.current.querySelector(`[data-candidate-id="${CSS.escape(selectedId)}"]`);
      node?.scrollIntoView({ block: "nearest" });
    }, [selectedId]);
    function moveSelection(delta) {
      if (!items.length) return;
      const index2 = items.findIndex((item) => item.id === selectedId);
      const nextIndex = Math.min(items.length - 1, Math.max(0, (index2 < 0 ? 0 : index2) + delta));
      props.onSelect(items[nextIndex].id);
    }
    const sortValue = `${sortBy}:${sortDir}`;
    const sortLabel = SORT_OPTIONS.find((option) => sortValue === option.value)?.label ?? "\u5339\u914D\u5206\u964D\u5E8F";
    const sortActive = sortValue !== "matchScore:desc";
    const shown = items.length;
    const overCap = shown >= DOM_ROW_CAP;
    return /* @__PURE__ */ react_shim_default.createElement(react_shim_default.Fragment, null, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-list-tools" }, /* @__PURE__ */ react_shim_default.createElement("label", { className: "rs-search" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-search-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement(
      "input",
      {
        "data-slot": "input",
        value: searchDraft,
        placeholder: "\u641C\u7D22\u59D3\u540D/\u516C\u53F8/\u6280\u80FD\uFF0CEnter \u63D0\u4EA4",
        "aria-label": "\u641C\u7D22\u5019\u9009\u4EBA",
        onChange: (event) => setSearchDraft(event.currentTarget.value),
        onKeyDown: (event) => {
          if (event.key === "Enter") props.onSearch(searchDraft.trim());
        },
        onBlur: () => {
          window.setTimeout(() => props.onSearch(searchDraft.trim()), 300);
        }
      }
    )), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-list-filter" }, /* @__PURE__ */ react_shim_default.createElement(ja, { value: status, onValueChange: (value) => props.onStatusChange(value) }, /* @__PURE__ */ react_shim_default.createElement(Ea, { "aria-label": "\u72B6\u6001\u7B5B\u9009", className: "rs-status-select" }, /* @__PURE__ */ react_shim_default.createElement($a, null)), /* @__PURE__ */ react_shim_default.createElement(Oa, null, STATUS_OPTIONS.map((option) => /* @__PURE__ */ react_shim_default.createElement(Ha, { key: option.value, value: option.value }, option.label)))), /* @__PURE__ */ react_shim_default.createElement(ia, null, /* @__PURE__ */ react_shim_default.createElement(sa, { asChild: true }, /* @__PURE__ */ react_shim_default.createElement(C, { variant: "ghost", size: "sm", className: `rs-toolbar-button${sortActive ? " is-active" : ""}`, title: "\u6392\u5E8F" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-arrow-up-down-line", "aria-hidden": "true" }), sortLabel)), /* @__PURE__ */ react_shim_default.createElement(la, { align: "end" }, /* @__PURE__ */ react_shim_default.createElement(ma, null, "\u6392\u5E8F"), /* @__PURE__ */ react_shim_default.createElement(pa, { value: sortValue, onValueChange: props.onSortChange }, SORT_OPTIONS.map((option) => /* @__PURE__ */ react_shim_default.createElement(fa, { key: option.value, value: option.value }, option.label)))))), search ? /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-search-chip" }, /* @__PURE__ */ react_shim_default.createElement(vt2, { variant: "secondary" }, "\u641C\u7D22\u4E2D\u300C", search, "\u300D"), /* @__PURE__ */ react_shim_default.createElement(
      C,
      {
        variant: "ghost",
        size: "sm",
        onClick: () => {
          setSearchDraft("");
          props.onSearch("");
        }
      },
      /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-close-line", "aria-hidden": "true" }),
      "\u6E05\u9664"
    )) : null), /* @__PURE__ */ react_shim_default.createElement(
      "div",
      {
        className: "rs-list",
        ref: listRef,
        role: "listbox",
        "aria-label": "\u5019\u9009\u4EBA\u5217\u8868",
        "aria-busy": loading,
        tabIndex: 0,
        onKeyDown: (event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveSelection(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            moveSelection(-1);
          }
        }
      },
      loading && shown === 0 ? /* @__PURE__ */ react_shim_default.createElement(ListSkeleton, null) : null,
      !loading && shown === 0 ? /* @__PURE__ */ react_shim_default.createElement(EmptyState, { ...props }) : null,
      items.map((item, index2) => /* @__PURE__ */ react_shim_default.createElement(
        CandidateItem,
        {
          key: item.id,
          candidate: item,
          selected: item.id === selectedId,
          timedOut: props.isTimedOut(item),
          enterDelay: enteringIds.has(item.id) ? Math.min(index2, 9) * 40 : null,
          jump: props.jumpCandidateId === item.id,
          onJumpConsumed: props.onJumpConsumed,
          onSelect: props.onSelect
        }
      ))
    ), /* @__PURE__ */ react_shim_default.createElement("footer", { className: "rs-list-foot" }, shown > 0 && shown < total ? /* @__PURE__ */ react_shim_default.createElement(C, { variant: "ghost", size: "sm", onClick: props.onLoadMore, disabled: overCap }, "\u52A0\u8F7D\u66F4\u591A") : null, /* @__PURE__ */ react_shim_default.createElement("span", { "aria-live": "polite" }, overCap ? "\u5DF2\u8FBE\u5C55\u793A\u4E0A\u9650\uFF0C\u8BF7\u7528\u7B5B\u9009\u7F29\u5C0F\u8303\u56F4" : `\u5DF2\u663E\u793A ${shown} / \u5171 ${total}`)));
  }
  function ListSkeleton() {
    return /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-list-skeleton", "aria-hidden": "true" }, Array.from({ length: 6 }, (_, index2) => /* @__PURE__ */ react_shim_default.createElement("div", { key: index2, className: "rs-sk-row" }, /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-avatar" }), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-sk-lines" }, /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-line rs-sk-half" }), /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-line rs-sk-two-thirds" })), /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-line rs-sk-score" }))));
  }
  function EmptyState({ hasJobs, hasFilterActive, onUploadRequest, onCreateJobRequest, onClearFilters }) {
    if (!hasJobs) {
      return /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-empty" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-briefcase-line rs-empty-icon", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("strong", null, "\u8FD8\u6CA1\u6709\u5C97\u4F4D\uFF0C\u5148\u65B0\u5EFA\u4E00\u4E2A\u5C97\u4F4D"), /* @__PURE__ */ react_shim_default.createElement("small", null, "\u5C97\u4F4D\u63CF\u8FF0\uFF08JD\uFF09\u662F AI \u5339\u914D\u8BC4\u5206\u7684\u4F9D\u636E"), /* @__PURE__ */ react_shim_default.createElement(C, { onClick: onCreateJobRequest }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-add-line", "aria-hidden": "true" }), "\u65B0\u5EFA\u5C97\u4F4D"));
    }
    if (hasFilterActive) {
      return /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-empty" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-filter-3-line rs-empty-icon", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("strong", null, "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u5019\u9009\u4EBA"), /* @__PURE__ */ react_shim_default.createElement(C, { variant: "outline", onClick: onClearFilters }, "\u6E05\u9664\u7B5B\u9009"));
    }
    return /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-empty" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-upload-cloud-line rs-empty-icon", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("strong", null, "\u6682\u65E0\u5019\u9009\u4EBA\uFF0C\u4E0A\u4F20\u7B80\u5386\u6587\u4EF6\u5F00\u59CB\u521D\u7B5B"), /* @__PURE__ */ react_shim_default.createElement("small", null, "\u652F\u6301 .docx / .pdf\uFF0C\u53EF\u591A\u9009"), /* @__PURE__ */ react_shim_default.createElement(C, { onClick: onUploadRequest }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-upload-cloud-line", "aria-hidden": "true" }), "\u4E0A\u4F20\u7B80\u5386\u6587\u4EF6"));
  }
  var CandidateItem = memo2(function CandidateItem2({ candidate, selected, timedOut, enterDelay, jump, onJumpConsumed, onSelect }) {
    const name = candidate.name || candidate.sourceFileName || "\u672A\u547D\u540D\u5019\u9009\u4EBA";
    const tier = scoreTier(candidate.matchScore);
    const subtitle = candidate.status === "failed" ? candidate.failureReason || "\u89E3\u6790\u5931\u8D25" : candidate.status === "parsing" || candidate.status === "draft" ? timedOut ? "\u89E3\u6790\u5DF2\u8D85\u8FC7 10 \u5206\u949F\uFF0C\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u91CD\u6295" : "AI \u6B63\u5728\u89E3\u6790\u8BE5\u7B80\u5386\u2026" : [candidate.yearsOfExperience ?? "", candidate.education ?? "", candidate.currentCompany ?? ""].filter(Boolean).join(" \xB7 ") || formatMonthDay(candidate.createdAt);
    useEffect2(() => {
      if (!jump) return void 0;
      const timer = window.setTimeout(onJumpConsumed, 520);
      return () => window.clearTimeout(timer);
    }, [jump, onJumpConsumed]);
    return /* @__PURE__ */ react_shim_default.createElement(
      "div",
      {
        "data-candidate-id": candidate.id,
        className: `rs-item${enterDelay !== null ? " rs-enter" : ""}${jump ? " rs-jump" : ""}`,
        style: enterDelay !== null ? { "--rs-stagger": `${enterDelay}ms` } : void 0,
        role: "option",
        "aria-selected": selected,
        "aria-current": selected ? "true" : void 0,
        tabIndex: -1,
        onClick: () => onSelect(candidate.id)
      },
      /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-mark", style: { background: statusAccent(candidate.status, timedOut) }, "aria-hidden": "true" }, name.slice(0, 1)),
      /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-item-main" }, /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-item-title" }, /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-item-name" }, name), candidate.sourceFileName ? /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-file-line rs-item-source", title: `\u6765\u6E90\uFF1A${candidate.sourceFileName}`, "aria-label": `\u6765\u6E90\u6587\u4EF6 ${candidate.sourceFileName}` }) : null, /* @__PURE__ */ react_shim_default.createElement(CandidateBadge, { status: candidate.status, timedOut })), /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-item-meta" }, subtitle)),
      /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-item-score" }, /* @__PURE__ */ react_shim_default.createElement(vt2, { variant: "secondary", className: "rs-score-badge" }, candidate.matchScore ?? "\u2014"), /* @__PURE__ */ react_shim_default.createElement(
        Ma,
        {
          value: Math.max(0, Math.min(100, candidate.matchScore ?? 0)),
          className: `rs-score-bar${tier === "amber" ? " tier-amber" : tier === "red" ? " tier-red" : ""}`,
          "aria-label": `\u5339\u914D\u5206 ${candidate.matchScore ?? 0}`
        }
      ))
    );
  });

  // src/lib/remote-components/resume-screen/src/components/action-bar.tsx
  var { useState: useState3 } = react_shim_default;
  var BUTTONS = [
    {
      key: "accept_candidate",
      label: "\u63A8\u8FDB",
      variant: "default",
      icon: "ri-arrow-right-up-line",
      // §3.6 表：推进在 pending_review / hold / rejected / failed 可见（解析中行无分数不可处置）
      visible: (c) => c.status === "pending_review" || c.status === "hold" || c.status === "rejected" || c.status === "failed"
    },
    { key: "hold_candidate", label: "\u5F85\u5B9A", variant: "outline", icon: "ri-pause-line", visible: (c) => c.status === "pending_review" },
    { key: "reject_candidate", label: "\u6DD8\u6C70", variant: "outline", destructive: true, icon: "ri-close-circle-line", visible: (c) => c.status === "pending_review" || c.status === "hold" },
    { key: "reset_candidate", label: "\u64A4\u56DE\u4E3A\u5F85\u5BA1", variant: "ghost", icon: "ri-arrow-go-back-line", visible: (c) => c.status === "accepted" || c.status === "hold" || c.status === "rejected" },
    { key: "edit", label: "\u7F16\u8F91", variant: "ghost", icon: "ri-edit-2-line", visible: (c) => c.status === "pending_review" },
    { key: "retry_candidate", label: "\u91CD\u8BD5", variant: "outline", icon: "ri-restart-line", visible: (c, t) => c.status === "failed" || c.status === "parsing" && t }
  ];
  function ActionBar({ candidate, timedOut, busyKey, onDispose, onEdit }) {
    const [confirmReject, setConfirmReject] = useState3(false);
    const visible = BUTTONS.filter((button) => button.visible(candidate, timedOut));
    const busy = busyKey !== null;
    async function run(key) {
      await onDispose(key);
    }
    return /* @__PURE__ */ react_shim_default.createElement("footer", { className: "rs-detail-foot", "aria-busy": busy }, visible.map((button) => {
      const isBusy = busyKey === button.key;
      return /* @__PURE__ */ react_shim_default.createElement(
        C,
        {
          key: button.key,
          variant: button.variant,
          size: "sm",
          disabled: busy,
          className: button.destructive ? "rs-action-destructive" : void 0,
          onClick: () => {
            if (button.key === "edit") {
              onEdit();
              return;
            }
            if (button.key === "reject_candidate") {
              setConfirmReject(true);
              return;
            }
            void run(button.key);
          }
        },
        /* @__PURE__ */ react_shim_default.createElement("i", { className: button.icon, "aria-hidden": "true" }),
        isBusy ? "\u63D0\u4EA4\u4E2D\u2026" : button.label
      );
    }), /* @__PURE__ */ react_shim_default.createElement(
      tt,
      {
        open: confirmReject,
        onOpenChange: (open) => {
          if (!busy) setConfirmReject(open);
        }
      },
      /* @__PURE__ */ react_shim_default.createElement(rt2, null, /* @__PURE__ */ react_shim_default.createElement(ot2, null, /* @__PURE__ */ react_shim_default.createElement(dt2, null, "\u6DD8\u6C70\u8BE5\u5019\u9009\u4EBA\uFF1F"), /* @__PURE__ */ react_shim_default.createElement(st2, null, "\u8BE5\u5019\u9009\u4EBA\u5C06\u6807\u8BB0\u4E3A\u6DD8\u6C70\uFF0C\u53EF\u64A4\u56DE\u3002")), /* @__PURE__ */ react_shim_default.createElement(nt, null, /* @__PURE__ */ react_shim_default.createElement(ut2, { variant: "outline", size: "sm" }, "\u53D6\u6D88"), /* @__PURE__ */ react_shim_default.createElement(
        lt2,
        {
          variant: "default",
          size: "sm",
          className: "rs-reject-confirm-action",
          onClick: () => {
            setConfirmReject(false);
            void run("reject_candidate");
          }
        },
        "\u6DD8\u6C70"
      )))
    ));
  }

  // src/lib/remote-components/resume-screen/src/components/candidate-detail.tsx
  var { useState: useState4 } = react_shim_default;
  var HUMAN_EDIT_NOTE = "\u5DF2\u4FDD\u5B58\uFF08\u4EBA\u5DE5\u4FEE\u6B63\u5B57\u6BB5\u4E0D\u4F1A\u88AB AI \u8986\u76D6\uFF09";
  var FIELD_LABELS = {
    name: "\u59D3\u540D",
    yearsOfExperience: "\u5E74\u9650",
    education: "\u5B66\u5386",
    currentCompany: "\u5F53\u524D\u516C\u53F8",
    skills: "\u6280\u80FD",
    summary: "\u6458\u8981",
    matchScore: "\u5339\u914D\u5206"
  };
  function DetailContent(props) {
    const { candidate } = props;
    if (!candidate) {
      return /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-detail-empty" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-inbox-line", "aria-hidden": "true", style: { fontSize: 28 } }), "\u4ECE\u5DE6\u4FA7\u9009\u62E9\u5019\u9009\u4EBA\u67E5\u770B\u8BE6\u60C5");
    }
    return /* @__PURE__ */ react_shim_default.createElement("div", { key: candidate.id, className: "rs-detail-stack rs-detail-anim" }, /* @__PURE__ */ react_shim_default.createElement(DetailBody, { ...props, candidate }));
  }
  function DetailBody({ candidate, timedOut, showTimeoutCard, now, busyKey, onDispose, onWaitMore, onSave, onConflictRefresh }) {
    const [editing, setEditing] = useState4(false);
    const [draft, setDraft] = useState4({});
    const [skillDraft, setSkillDraft] = useState4("");
    const [conflict, setConflict] = useState4({ open: false, message: "" });
    const [saving, setSaving] = useState4(false);
    const [stashed, setStashed] = useState4(false);
    const isParsing = candidate.status === "parsing" || candidate.status === "draft";
    const isFailed = candidate.status === "failed";
    const editedFields = candidate.humanEditedFields ?? [];
    function startEdit() {
      setDraft(
        draft.name !== void 0 || draft.matchScore !== void 0 || draft.skills?.length ? draft : {
          name: candidate.name ?? "",
          yearsOfExperience: candidate.yearsOfExperience ?? "",
          education: candidate.education ?? "",
          currentCompany: candidate.currentCompany ?? "",
          skills: candidate.skills ?? [],
          matchScore: candidate.matchScore
        }
      );
      setStashed(false);
      setEditing(true);
    }
    function cancelEdit() {
      setEditing(false);
      setStashed(false);
    }
    async function submitSave() {
      if (saving) return;
      setSaving(true);
      try {
        const outcome = await onSave(candidate, draft, candidate.revision);
        if (outcome.success) {
          setEditing(false);
          setDraft({});
        } else if (outcome.conflict) {
          setConflict({ open: true, message: outcome.message });
        }
      } finally {
        setSaving(false);
      }
    }
    return /* @__PURE__ */ react_shim_default.createElement(react_shim_default.Fragment, null, /* @__PURE__ */ react_shim_default.createElement("header", { className: "rs-detail-head" }, /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-detail-avatar", style: { background: statusAccent(candidate.status, timedOut) }, "aria-hidden": "true" }, (candidate.name || candidate.sourceFileName || "?").slice(0, 1)), /* @__PURE__ */ react_shim_default.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-detail-title" }, /* @__PURE__ */ react_shim_default.createElement("strong", null, candidate.name || candidate.sourceFileName || "\u672A\u547D\u540D\u5019\u9009\u4EBA"), /* @__PURE__ */ react_shim_default.createElement(CandidateBadge, { status: candidate.status, timedOut }), editedFields.length > 0 ? /* @__PURE__ */ react_shim_default.createElement(Be2, null, /* @__PURE__ */ react_shim_default.createElement($e2, { asChild: true }, /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-badge rs-badge-edit" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-edit-2-line", "aria-hidden": "true" }), "\u4EBA\u5DE5\u4FEE\u6B63 ", editedFields.length, " \u9879")), /* @__PURE__ */ react_shim_default.createElement(Ee2, null, editedFields.map((field) => FIELD_LABELS[field] ?? field).join("\u3001"), " \u5DF2\u88AB\u4EBA\u5DE5\u4FEE\u6B63\uFF0CAI \u91CD\u65B0\u89E3\u6790\u4E0D\u4F1A\u8986\u76D6")) : null), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-detail-meta" }, /* @__PURE__ */ react_shim_default.createElement("span", null, candidate.yearsOfExperience ? `${candidate.yearsOfExperience} \xB7 ` : "", candidate.education || "", candidate.education ? " \xB7 " : "", candidate.currentCompany || ""), /* @__PURE__ */ react_shim_default.createElement("span", null, "\u521B\u5EFA\u4E8E ", formatMonthDay(candidate.createdAt) || "\u2014"), /* @__PURE__ */ react_shim_default.createElement("span", null, "\u7B2C ", candidate.attemptCount || 1, " \u6B21\u89E3\u6790"), candidate.sourceFileName ? /* @__PURE__ */ react_shim_default.createElement(Be2, null, /* @__PURE__ */ react_shim_default.createElement($e2, { asChild: true }, /* @__PURE__ */ react_shim_default.createElement("span", null, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-file-line", "aria-hidden": "true" }), "\u6765\u6E90 ", candidate.sourceFileName)), /* @__PURE__ */ react_shim_default.createElement(Ee2, null, candidate.sourceFileName)) : null))), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-detail-body" }, /* @__PURE__ */ react_shim_default.createElement(Ga, { className: "rs-detail-scroll" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-detail-pad" }, stashed && !editing ? /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-notice rs-notice-inline tone-amber", role: "status", style: { position: "static", marginTop: 0 } }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-edit-2-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("div", { style: { minWidth: 0 } }, "\u4F60\u7684\u4FEE\u6539\u5DF2\u6682\u5B58\uFF0C\u53EF\u70B9\u51FB\u300C\u7F16\u8F91\u300D\u6062\u590D")) : null, isFailed ? (
      // 失败覆盖态：告示卡（红变体 role=alert）+ 原因全文 + 重试；四区块隐藏（§3.5/§6.3）
      /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-notice rs-notice-inline", role: "alert", style: { position: "static" } }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-error-warning-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ react_shim_default.createElement("div", null, "\u89E3\u6790\u5931\u8D25\uFF1A", candidate.failureReason || "\u672A\u77E5\u539F\u56E0"), (candidate.attemptCount ?? 0) > 2 ? /* @__PURE__ */ react_shim_default.createElement("div", { style: { marginTop: 4, fontSize: 12 } }, "\u591A\u6B21\u5931\u8D25\uFF0C\u5EFA\u8BAE\u68C0\u67E5\u6A21\u578B\u51ED\u8BC1\uFF1B\u82E5\u539F\u6587\u62BD\u53D6\u5B57\u6BB5\u6709\u8BEF\uFF0C\u53EF\u7528\u300C\u7F16\u8F91\u300D\u4EBA\u5DE5\u4FEE\u6B63") : null, /* @__PURE__ */ react_shim_default.createElement(C, { variant: "outline", size: "sm", style: { marginTop: 8 }, disabled: busyKey !== null, onClick: () => void onDispose("retry_candidate") }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-restart-line", "aria-hidden": "true" }), "\u91CD\u8BD5")))
    ) : isParsing ? /* @__PURE__ */ react_shim_default.createElement(ParsingBody, { candidate, timedOut, showTimeoutCard, now, busyKey, onDispose, onWaitMore }) : editing ? /* @__PURE__ */ react_shim_default.createElement(
      EditForm,
      {
        draft,
        skillDraft,
        onSkillDraft: setSkillDraft,
        onField: (key, value) => setDraft((current) => ({ ...current, [key]: value })),
        onAddSkill: () => {
          const skill = skillDraft.trim();
          if (!skill) return;
          setDraft((current) => ({ ...current, skills: [...(current.skills ?? []).filter((item) => item !== skill), skill] }));
          setSkillDraft("");
        },
        onRemoveSkill: (skill) => setDraft((current) => ({ ...current, skills: (current.skills ?? []).filter((item) => item !== skill) }))
      }
    ) : /* @__PURE__ */ react_shim_default.createElement(ViewBody, { candidate })))), editing ? /* @__PURE__ */ react_shim_default.createElement("footer", { className: "rs-detail-foot", "aria-busy": saving }, /* @__PURE__ */ react_shim_default.createElement(C, { variant: "ghost", size: "sm", onClick: cancelEdit }, "\u53D6\u6D88"), /* @__PURE__ */ react_shim_default.createElement(C, { size: "sm", disabled: saving, onClick: () => void submitSave() }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-save-line", "aria-hidden": "true" }), saving ? "\u63D0\u4EA4\u4E2D\u2026" : "\u4FDD\u5B58")) : isParsing || isFailed ? null : /* @__PURE__ */ react_shim_default.createElement(
      ActionBar,
      {
        candidate,
        timedOut,
        busyKey,
        onDispose,
        onEdit: startEdit
      }
    ), /* @__PURE__ */ react_shim_default.createElement(
      tt,
      {
        open: conflict.open,
        onOpenChange: (open) => {
          if (!open) setConflict({ open: false, message: "" });
        }
      },
      /* @__PURE__ */ react_shim_default.createElement(rt2, null, /* @__PURE__ */ react_shim_default.createElement(ot2, null, /* @__PURE__ */ react_shim_default.createElement(dt2, null, "\u8BE5\u5019\u9009\u4EBA\u5DF2\u88AB\u5176\u4ED6\u4EBA\u66F4\u65B0"), /* @__PURE__ */ react_shim_default.createElement(st2, null, "\u4E3A\u907F\u514D\u8986\u76D6\u4ED6\u4EBA\u4FEE\u6539\uFF0C\u672C\u6B21\u4FDD\u5B58\u672A\u751F\u6548\u3002\u8BF7\u5148\u67E5\u770B\u6700\u65B0\u5185\u5BB9\uFF0C\u518D\u51B3\u5B9A\u662F\u5426\u91CD\u65B0\u4FEE\u6539\u3002")), /* @__PURE__ */ react_shim_default.createElement(nt, null, /* @__PURE__ */ react_shim_default.createElement(
        lt2,
        {
          variant: "default",
          size: "sm",
          onClick: () => {
            setEditing(false);
            setStashed(true);
            onConflictRefresh();
            setConflict({ open: false, message: "" });
          }
        },
        "\u67E5\u770B\u6700\u65B0"
      ), /* @__PURE__ */ react_shim_default.createElement(
        ut2,
        {
          variant: "ghost",
          size: "sm",
          onClick: () => {
            setEditing(false);
            setDraft({});
            setStashed(false);
            setConflict({ open: false, message: "" });
          }
        },
        "\u653E\u5F03\u4FEE\u6539"
      )))
    ));
  }
  function ParsingBody({
    candidate,
    showTimeoutCard,
    now,
    busyKey,
    onDispose,
    onWaitMore
  }) {
    return /* @__PURE__ */ react_shim_default.createElement("div", null, showTimeoutCard ? /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-notice rs-notice-inline tone-amber", role: "alert", style: { position: "static", marginTop: 0 } }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-timer-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("div", null, /* @__PURE__ */ react_shim_default.createElement("div", null, "\u8BE5\u7B80\u5386\u89E3\u6790\u5DF2\u8D85\u8FC7 10 \u5206\u949F\uFF0C\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u91CD\u6295\uFF1B\u82E5\u4ECD\u672A\u5B8C\u6210\uFF0C\u53EF\u70B9\u51FB\u91CD\u8BD5\u3002"), /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8 } }, /* @__PURE__ */ react_shim_default.createElement(C, { variant: "outline", size: "sm", disabled: busyKey !== null, onClick: () => void onDispose("retry_candidate") }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-restart-line", "aria-hidden": "true" }), "\u91CD\u8BD5"), /* @__PURE__ */ react_shim_default.createElement(C, { variant: "ghost", size: "sm", onClick: () => onWaitMore(candidate.id) }, "\u518D\u7B49\u7B49")))) : (
      // 未超时：区块骨架（超时卡出现时按 §6.4 替换骨架）
      /* @__PURE__ */ react_shim_default.createElement("div", null, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-section" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-section-title" }, "\u62BD\u53D6\u5B57\u6BB5"), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-sk-stack", "aria-hidden": "true" }, /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-line rs-sk-third" }), /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-line rs-sk-half" }), /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-line rs-sk-two-thirds" }))), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-section" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-section-title" }, "\u5339\u914D\u8BC4\u5206"), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-sk-score-row", "aria-hidden": "true" }, /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-score" }), /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-bar" }))), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-section" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-section-title" }, "\u547D\u4E2D\u70B9 / \u98CE\u9669\u70B9"), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-sk-pill-row", "aria-hidden": "true" }, /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-pill" }), /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-pill rs-sk-pill-sm" }))))
    ), /* @__PURE__ */ react_shim_default.createElement("div", { style: { color: "var(--rs-muted)", fontSize: 12 } }, /* @__PURE__ */ react_shim_default.createElement("span", { className: `rs-badge ${showTimeoutCard ? "tone-amber" : "tone-blue"}`, style: { marginRight: 6 } }, showTimeoutCard ? /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-timer-line", "aria-hidden": "true" }) : /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-loader-4-line rs-spin", "aria-hidden": "true" }), showTimeoutCard ? "\u89E3\u6790\u8D85\u65F6" : "AI \u6B63\u5728\u89E3\u6790\u8BE5\u7B80\u5386\u2026"), "\u5DF2\u8017\u65F6 ", elapsedLabel(candidate.updatedAt || candidate.createdAt, now) || "\u2014"));
  }
  function ViewBody({ candidate }) {
    const [reasonExpanded, setReasonExpanded] = useState4(false);
    const tier = scoreTier(candidate.matchScore);
    const hasScore = candidate.matchScore !== void 0 && candidate.matchScore !== null;
    const editedFields = candidate.humanEditedFields ?? [];
    return /* @__PURE__ */ react_shim_default.createElement(react_shim_default.Fragment, null, /* @__PURE__ */ react_shim_default.createElement("section", { className: "rs-section" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-section-title" }, "\u62BD\u53D6\u5B57\u6BB5"), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-fields" }, /* @__PURE__ */ react_shim_default.createElement(Field, { label: "\u59D3\u540D", fieldKey: "name", value: candidate.name, editedFields }), /* @__PURE__ */ react_shim_default.createElement(Field, { label: "\u5E74\u9650", fieldKey: "yearsOfExperience", value: candidate.yearsOfExperience, editedFields }), /* @__PURE__ */ react_shim_default.createElement(Field, { label: "\u5B66\u5386", fieldKey: "education", value: candidate.education, editedFields }), /* @__PURE__ */ react_shim_default.createElement(Field, { label: "\u5F53\u524D\u516C\u53F8", fieldKey: "currentCompany", value: candidate.currentCompany, editedFields }), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-field", style: { gridColumn: "1 / -1" } }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u6280\u80FD"), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-chip-row" }, (candidate.skills ?? []).length ? (candidate.skills ?? []).map((skill) => /* @__PURE__ */ react_shim_default.createElement(SkillChip, { key: skill, skill })) : /* @__PURE__ */ react_shim_default.createElement("strong", { style: { fontWeight: 650, color: "var(--rs-text)" } }, "\u2014"))))), /* @__PURE__ */ react_shim_default.createElement("section", { className: "rs-section" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-section-title" }, "\u5339\u914D\u8BC4\u5206"), hasScore ? /* @__PURE__ */ react_shim_default.createElement(react_shim_default.Fragment, null, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-score-big" }, /* @__PURE__ */ react_shim_default.createElement("strong", { style: { color: tier === "red" ? "var(--rs-red)" : tier === "amber" ? "var(--rs-amber)" : "var(--rs-blue)" } }, candidate.matchScore), /* @__PURE__ */ react_shim_default.createElement("span", null, "/100")), /* @__PURE__ */ react_shim_default.createElement(
      Ma,
      {
        value: Math.max(0, Math.min(100, candidate.matchScore ?? 0)),
        className: `rs-score-detail${tier === "amber" ? " tier-amber" : tier === "red" ? " tier-red" : ""}`,
        "aria-label": `\u5339\u914D\u5206 ${candidate.matchScore ?? 0}`
      }
    )) : /* @__PURE__ */ react_shim_default.createElement("div", { style: { color: "var(--rs-soft)", fontSize: 12 } }, "\u6682\u65E0\u8BC4\u5206\uFF08\u7B49\u5F85 AI \u89E3\u6790\u56DE\u586B\uFF09"), candidate.matchReason ? (
      // 评分理由最多 8 行折叠 + 展开（§3.5/§3.8 Collapsible；hidden 关闭态保留 clamp 预览故 forceMount）
      /* @__PURE__ */ react_shim_default.createElement(St, { open: reasonExpanded, onOpenChange: setReasonExpanded, style: { marginTop: 10 } }, /* @__PURE__ */ react_shim_default.createElement(Tt2, { forceMount: true, hidden: false }, /* @__PURE__ */ react_shim_default.createElement("div", { className: `rs-reason${reasonExpanded ? "" : " is-collapsed"}` }, candidate.matchReason)), /* @__PURE__ */ react_shim_default.createElement(_t2, { asChild: true }, /* @__PURE__ */ react_shim_default.createElement("button", { type: "button", className: "rs-expand" }, reasonExpanded ? "\u6536\u8D77" : "\u5C55\u5F00")))
    ) : null), /* @__PURE__ */ react_shim_default.createElement("section", { className: "rs-section" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-section-title" }, "\u547D\u4E2D\u70B9"), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-hit" }, (candidate.hitPoints ?? []).length ? (candidate.hitPoints ?? []).map((point, index2) => /* @__PURE__ */ react_shim_default.createElement("span", { key: `${point}-${index2}`, className: "hit-good" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-checkbox-circle-line", "aria-hidden": "true" }), point)) : /* @__PURE__ */ react_shim_default.createElement("span", { style: { color: "var(--rs-soft)", fontSize: 12 } }, "\u2014"))), /* @__PURE__ */ react_shim_default.createElement("section", { className: "rs-section" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-section-title" }, "\u98CE\u9669\u70B9"), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-hit" }, (candidate.riskPoints ?? []).length ? (candidate.riskPoints ?? []).map((point, index2) => /* @__PURE__ */ react_shim_default.createElement("span", { key: `${point}-${index2}`, className: "hit-risk" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-error-warning-line", "aria-hidden": "true" }), point)) : /* @__PURE__ */ react_shim_default.createElement("span", { style: { color: "var(--rs-soft)", fontSize: 12 } }, "\u672A\u8BC6\u522B\u5230\u98CE\u9669"))));
  }
  function Field({ label, fieldKey, value, editedFields }) {
    return /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-field" }, /* @__PURE__ */ react_shim_default.createElement("span", null, label, editedFields.includes(fieldKey) ? /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-edit-2-line", title: "\u5DF2\u4EBA\u5DE5\u4FEE\u6B63", style: { fontSize: 10, marginLeft: 4, color: "var(--rs-blue)" }, "aria-label": "\u5DF2\u4EBA\u5DE5\u4FEE\u6B63" }) : null), /* @__PURE__ */ react_shim_default.createElement("strong", null, value || "\u2014"));
  }
  function SkillChip({ skill }) {
    return /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-chip" }, skill);
  }
  function EditForm({ draft, skillDraft, onSkillDraft, onField, onAddSkill, onRemoveSkill }) {
    const scoreInvalid = draft.matchScore !== void 0 && (Number.isNaN(draft.matchScore) || draft.matchScore < 0 || draft.matchScore > 100);
    return /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-form" }, /* @__PURE__ */ react_shim_default.createElement("label", { className: "rs-form-field" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u59D3\u540D", /* @__PURE__ */ react_shim_default.createElement("small", null, "\u6587\u672C")), /* @__PURE__ */ react_shim_default.createElement(Z, { value: draft.name ?? "", onChange: (event) => onField("name", event.currentTarget.value) })), /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 } }, /* @__PURE__ */ react_shim_default.createElement("label", { className: "rs-form-field" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u5E74\u9650", /* @__PURE__ */ react_shim_default.createElement("small", null, "\u5982 5\u5E74")), /* @__PURE__ */ react_shim_default.createElement(Z, { value: draft.yearsOfExperience ?? "", onChange: (event) => onField("yearsOfExperience", event.currentTarget.value) })), /* @__PURE__ */ react_shim_default.createElement("label", { className: "rs-form-field" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u5B66\u5386"), /* @__PURE__ */ react_shim_default.createElement(Z, { value: draft.education ?? "", onChange: (event) => onField("education", event.currentTarget.value) }))), /* @__PURE__ */ react_shim_default.createElement("label", { className: "rs-form-field" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u5F53\u524D\u516C\u53F8"), /* @__PURE__ */ react_shim_default.createElement(Z, { value: draft.currentCompany ?? "", onChange: (event) => onField("currentCompany", event.currentTarget.value) })), /* @__PURE__ */ react_shim_default.createElement("label", { className: "rs-form-field" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u6280\u80FD", /* @__PURE__ */ react_shim_default.createElement("small", null, "\u8F93\u5165\u540E Enter \u6216\u70B9\u300C\u6DFB\u52A0\u300D")), /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 6 } }, /* @__PURE__ */ react_shim_default.createElement(
      Z,
      {
        value: skillDraft,
        placeholder: "\u5982 React",
        onChange: (event) => onSkillDraft(event.currentTarget.value),
        onKeyDown: (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onAddSkill();
          }
        }
      }
    ), /* @__PURE__ */ react_shim_default.createElement(C, { variant: "outline", size: "sm", onClick: onAddSkill }, "\u6DFB\u52A0")), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-chip-row" }, (draft.skills ?? []).map((skill) => /* @__PURE__ */ react_shim_default.createElement("span", { key: skill, className: "rs-chip rs-chip-edit" }, skill, /* @__PURE__ */ react_shim_default.createElement("button", { type: "button", "aria-label": `\u5220\u9664\u6280\u80FD ${skill}`, onClick: () => onRemoveSkill(skill) }, "\xD7"))))), /* @__PURE__ */ react_shim_default.createElement("label", { className: "rs-form-field" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u5339\u914D\u5206", /* @__PURE__ */ react_shim_default.createElement("small", null, "0\u2013100")), /* @__PURE__ */ react_shim_default.createElement(
      Z,
      {
        type: "number",
        min: 0,
        max: 100,
        step: 1,
        value: draft.matchScore ?? "",
        "aria-invalid": scoreInvalid,
        onChange: (event) => {
          const raw = event.currentTarget.value;
          onField("matchScore", raw === "" ? void 0 : Number(raw));
        }
      }
    ), scoreInvalid ? /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-form-error", role: "alert" }, "\u5339\u914D\u5206\u9700\u4E3A 0\u2013100 \u7684\u6570\u5B57") : null), /* @__PURE__ */ react_shim_default.createElement("div", { style: { fontSize: 12, color: "var(--rs-soft)" } }, HUMAN_EDIT_NOTE));
  }

  // src/lib/remote-components/resume-screen/src/components/intake-panel.tsx
  var { memo: memo3, useEffect: useEffect3, useRef: useRef3 } = react_shim_default;
  var QUEUE_VISIBLE_CAP = 20;
  var QUEUE_ROW_H = 34;
  function IntakePanel({ rows, now, busy, expanded, uploadRequestSeq, onExpandedChange, onPickFiles, onClearFailed, onJumpToCandidate, canUpload }) {
    const inputRef = useRef3(null);
    const summary = summarizeQueue(rows);
    const earlyCount = Math.max(0, rows.length - QUEUE_VISIBLE_CAP);
    const visible = earlyCount > 0 ? rows.slice(0, QUEUE_VISIBLE_CAP) : rows;
    function requestUpload() {
      if (!canUpload()) return;
      inputRef.current?.click();
    }
    useEffect3(() => {
      if (uploadRequestSeq > 0) inputRef.current?.click();
    }, [uploadRequestSeq]);
    return /* @__PURE__ */ react_shim_default.createElement(St, { open: expanded, onOpenChange: onExpandedChange, className: "rs-intake" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-intake-row" }, /* @__PURE__ */ react_shim_default.createElement(C, { variant: "default", size: "sm", disabled: busy, onClick: requestUpload }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-upload-cloud-line", "aria-hidden": "true" }), "\u4E0A\u4F20\u7B80\u5386\u6587\u4EF6"), /* @__PURE__ */ react_shim_default.createElement(
      "input",
      {
        ref: inputRef,
        type: "file",
        accept: ".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        multiple: true,
        hidden: true,
        onChange: (event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length) onPickFiles(files);
        }
      }
    ), /* @__PURE__ */ react_shim_default.createElement(_t2, { asChild: true }, /* @__PURE__ */ react_shim_default.createElement("button", { type: "button", className: "rs-intake-handle", "aria-label": "\u5C55\u5F00\u6216\u6536\u8D77\u4E0A\u4F20\u961F\u5217" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-upload-cloud-line rs-handle-icon", "aria-hidden": "true" }), "\u4E0A\u4F20\u961F\u5217", summary.active > 0 ? /* @__PURE__ */ react_shim_default.createElement(vt2, { variant: "secondary", className: "rs-handle-badge" }, "\u4E0A\u4F20\u4E2D ", summary.active) : null, summary.failed > 0 ? /* @__PURE__ */ react_shim_default.createElement(vt2, { variant: "secondary", className: "rs-handle-badge rs-handle-badge-fail" }, "\u5931\u8D25 ", summary.failed) : null, rows.length === 0 ? /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-intake-hint" }, "\u4E0A\u4F20 .docx / .pdf \u5F00\u59CB\u521D\u7B5B\uFF08\u53EF\u591A\u9009\uFF09") : null, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-arrow-down-s-line rs-chevron", "aria-hidden": "true" })))), /* @__PURE__ */ react_shim_default.createElement(Tt2, { forceMount: true, hidden: false }, /* @__PURE__ */ react_shim_default.createElement("div", { className: `rs-intake-collapse${expanded ? " is-open" : ""}` }, /* @__PURE__ */ react_shim_default.createElement("div", null, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-intake-body" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-queue-summary", "aria-live": "polite" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u5DF2\u63D0\u4EA4 ", /* @__PURE__ */ react_shim_default.createElement("b", null, summary.total), " \u4EFD \xB7 \u6392\u961F\u4E2D ", /* @__PURE__ */ react_shim_default.createElement("b", null, summary.queued), " \xB7 \u4E0A\u4F20\u4E2D ", /* @__PURE__ */ react_shim_default.createElement("b", null, summary.uploading), " \xB7 \u5DF2\u521B\u5EFA ", /* @__PURE__ */ react_shim_default.createElement("b", null, summary.created), " \xB7 \u8DF3\u8FC7", " ", /* @__PURE__ */ react_shim_default.createElement("b", null, summary.skipped), " \xB7", /* @__PURE__ */ react_shim_default.createElement("span", { className: summary.failed ? "is-fail" : void 0 }, " \u5931\u8D25 ", /* @__PURE__ */ react_shim_default.createElement("b", null, summary.failed))), summary.failed > 0 ? (
      // 「清除失败记录」仅在存在失败时出现（§3.7 聚合条）；上传入口固定在把手行主按钮
      /* @__PURE__ */ react_shim_default.createElement(C, { variant: "ghost", size: "sm", className: "rs-queue-clear", onClick: onClearFailed }, "\u6E05\u9664\u5931\u8D25\u8BB0\u5F55")
    ) : null), rows.length === 0 ? /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-queue-guidance" }, "\u4E0A\u4F20 .docx / .pdf \u7B80\u5386\uFF08\u53EF\u591A\u9009\uFF09\uFF1A\u6587\u4EF6\u6309\u5F53\u524D\u5C97\u4F4D\u89E3\u6790\u5165\u5E93\uFF0CAI \u81EA\u52A8\u62BD\u53D6\u8BC4\u5206\uFF0C\u7ED3\u679C\u56DE\u586B\u540E\u51FA\u73B0\u5728\u5DE6\u4FA7\u5217\u8868\u3002") : null, earlyCount > 0 ? /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-queue-hint" }, "\u66F4\u65E9\u4E0A\u4F20 ", earlyCount, " \u6761") : null, /* @__PURE__ */ react_shim_default.createElement(Ga, { className: "rs-queue-scroll", style: { height: Math.min(160, Math.max(34, visible.length * QUEUE_ROW_H)) } }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-queue-list", role: "list", "aria-label": "\u4E0A\u4F20\u961F\u5217" }, visible.map((row, index2) => /* @__PURE__ */ react_shim_default.createElement(
      QueueRowItem,
      {
        key: row.localId,
        row,
        elapsedLong: now - row.startedAt > UPLOAD_STILL_WORKING_MS,
        enter: index2 < 10,
        onJumpToCandidate
      }
    )))))))));
  }
  var QueueRowItem = memo3(function QueueRowItem2({
    row,
    elapsedLong,
    enter,
    onJumpToCandidate
  }) {
    const working = row.status === "queued" || row.status === "uploading";
    return /* @__PURE__ */ react_shim_default.createElement("div", { className: `rs-queue-row${enter ? " rs-enter" : ""}${row.leaving ? " rs-leaving" : ""}`, role: "listitem" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-file-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-queue-name", title: row.fileName }, row.fileName), /* @__PURE__ */ react_shim_default.createElement(QueueBadge, { status: row.status }), /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-queue-actions" }, row.status === "created" && row.candidateId ? /* @__PURE__ */ react_shim_default.createElement(C, { variant: "ghost", size: "sm", onClick: () => onJumpToCandidate(row.candidateId) }, "\u67E5\u770B") : null, working && elapsedLong ? /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-queue-hint" }, "\u4ECD\u5728\u5904\u7406\uFF0C\u53EF\u7A0D\u540E\u67E5\u770B") : null), row.status === "skipped" ? /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-queue-hint rs-queue-span" }, "\u8BE5\u7B80\u5386\u5185\u5BB9\u5DF2\u5B58\u5728") : null, row.status === "failed" && row.failureReason ? (
      // 行尾展开可执行重新上传指引（role=alert，四类原因文案在入队时已映射，§6.6）
      /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-queue-fail", role: "alert" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-error-warning-line", "aria-hidden": "true" }), row.failureReason)
    ) : null);
  });

  // src/lib/remote-components/resume-screen/src/components/job-header.tsx
  var { useEffect: useEffect4, useMemo: useMemo2, useRef: useRef4, useState: useState5 } = react_shim_default;
  var MIN_JD_LENGTH = 30;
  var MAX_TITLE_LENGTH = 200;
  function JobHeader({ jobs, currentJobId, busy, jobPulseSeq, xsMode, onSelectJob, onCreateJob, onRefresh }) {
    const [createOpen, setCreateOpen] = useState5(false);
    const currentJob = useMemo2(() => jobs.find((job) => job.id === currentJobId) ?? null, [jobs, currentJobId]);
    const jobSelectRef = useRef4(null);
    useEffect4(() => {
      const openDialog = () => setCreateOpen(true);
      window.addEventListener("rs:open-create-job", openDialog);
      return () => window.removeEventListener("rs:open-create-job", openDialog);
    }, []);
    useEffect4(() => {
      if (jobPulseSeq === 0) return;
      const node = jobSelectRef.current?.querySelector('[data-slot="select-trigger"]');
      if (!node) return;
      node.classList.remove("rs-pulse-job");
      void node.offsetWidth;
      node.classList.add("rs-pulse-job");
    }, [jobPulseSeq]);
    return /* @__PURE__ */ react_shim_default.createElement("header", { className: "rs-header" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-briefcase-line rs-job-icon", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-job-select", ref: jobSelectRef }, /* @__PURE__ */ react_shim_default.createElement(ja, { value: currentJobId ?? void 0, onValueChange: onSelectJob }, /* @__PURE__ */ react_shim_default.createElement(Ea, { "aria-label": "\u9009\u62E9\u5C97\u4F4D" }, /* @__PURE__ */ react_shim_default.createElement($a, { placeholder: "\u9009\u62E9\u5C97\u4F4D" })), /* @__PURE__ */ react_shim_default.createElement(Oa, null, jobs.map((job) => /* @__PURE__ */ react_shim_default.createElement(Ha, { key: job.id, value: job.id }, job.title))))), currentJob ? /* @__PURE__ */ react_shim_default.createElement(JdPopover, { job: currentJob }) : null, /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-header-spacer" }), xsMode ? (
      // 超窄容器：新建/刷新收纳进「更多」下拉（蓝图 §4 <560px 断点）
      /* @__PURE__ */ react_shim_default.createElement(ia, null, /* @__PURE__ */ react_shim_default.createElement(sa, { asChild: true }, /* @__PURE__ */ react_shim_default.createElement(C, { variant: "ghost", size: "icon", title: "\u66F4\u591A\u64CD\u4F5C", "aria-label": "\u66F4\u591A\u64CD\u4F5C" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-more-line", "aria-hidden": "true" }))), /* @__PURE__ */ react_shim_default.createElement(la, { align: "end" }, /* @__PURE__ */ react_shim_default.createElement(ca, { disabled: busy, onSelect: () => setCreateOpen(true) }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-add-line", "aria-hidden": "true" }), "\u65B0\u5EFA\u5C97\u4F4D"), /* @__PURE__ */ react_shim_default.createElement(ca, { disabled: busy, onSelect: onRefresh }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-refresh-line", "aria-hidden": "true" }), "\u5237\u65B0")))
    ) : /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-header-actions" }, /* @__PURE__ */ react_shim_default.createElement(C, { variant: "outline", size: "sm", disabled: busy, onClick: () => setCreateOpen(true) }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-add-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-header-label" }, "\u65B0\u5EFA\u5C97\u4F4D")), /* @__PURE__ */ react_shim_default.createElement(C, { variant: "ghost", size: "icon", title: "\u5237\u65B0", "aria-label": "\u5237\u65B0", disabled: busy, onClick: onRefresh }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-refresh-line", "aria-hidden": "true" }))), /* @__PURE__ */ react_shim_default.createElement(CreateJobDialog, { open: createOpen, onOpenChange: setCreateOpen, onSubmit: onCreateJob }));
  }
  function JdPopover({ job }) {
    return /* @__PURE__ */ react_shim_default.createElement(Na, null, /* @__PURE__ */ react_shim_default.createElement(Ca, { asChild: true }, /* @__PURE__ */ react_shim_default.createElement(C, { variant: "ghost", size: "sm", title: "\u67E5\u770B\u5C97\u4F4D\u63CF\u8FF0" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-file-text-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-header-label" }, "JD"))), /* @__PURE__ */ react_shim_default.createElement(Sa, { align: "start", className: "rs-jd-popover" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-section-title" }, job.title, " \xB7 \u804C\u4F4D\u63CF\u8FF0"), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-jd-text" }, job.jdText)));
  }
  function CreateJobDialog({
    open,
    onOpenChange,
    onSubmit
  }) {
    const [title, setTitle] = useState5("");
    const [jdText, setJdText] = useState5("");
    const [saving, setSaving] = useState5(false);
    const [touched, setTouched] = useState5(false);
    const [submitError, setSubmitError] = useState5("");
    const titleRef = useRef4(null);
    const jdRef = useRef4(null);
    const titleError = touched && !title.trim() ? "\u5C97\u4F4D\u540D\u79F0\u5FC5\u586B" : "";
    const jdLength = jdText.trim().length;
    const jdError = touched && jdLength > 0 && jdLength < MIN_JD_LENGTH ? `\u804C\u4F4D\u63CF\u8FF0\u81F3\u5C11 ${MIN_JD_LENGTH} \u5B57\uFF08\u5F53\u524D ${jdLength} \u5B57\uFF09` : "";
    const canSave = Boolean(title.trim()) && jdLength >= MIN_JD_LENGTH && !saving;
    useEffect4(() => {
      if (open) {
        setTitle("");
        setJdText("");
        setTouched(false);
        setSaving(false);
        setSubmitError("");
      }
    }, [open]);
    async function submit() {
      setTouched(true);
      setSubmitError("");
      if (!title.trim()) {
        titleRef.current?.focus();
        return;
      }
      if (jdLength < MIN_JD_LENGTH) {
        jdRef.current?.focus();
        return;
      }
      setSaving(true);
      try {
        const outcome = await onSubmit(title.trim(), jdText.trim());
        if (outcome.ok) {
          onOpenChange(false);
        } else {
          setSubmitError(outcome.notice ?? "");
          titleRef.current?.focus();
        }
      } finally {
        setSaving(false);
      }
    }
    return /* @__PURE__ */ react_shim_default.createElement(pe, { open, onOpenChange: (next) => !saving && onOpenChange(next) }, /* @__PURE__ */ react_shim_default.createElement(be2, { className: "rs-create-dialog", "aria-busy": saving }, /* @__PURE__ */ react_shim_default.createElement(ve, null, /* @__PURE__ */ react_shim_default.createElement(he, null, "\u65B0\u5EFA\u5C97\u4F4D")), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-form" }, /* @__PURE__ */ react_shim_default.createElement("label", { className: "rs-form-field" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u5C97\u4F4D\u540D\u79F0", /* @__PURE__ */ react_shim_default.createElement("em", null, "*"), /* @__PURE__ */ react_shim_default.createElement("small", null, "\u4E0D\u8D85\u8FC7 ", MAX_TITLE_LENGTH, " \u5B57")), /* @__PURE__ */ react_shim_default.createElement(
      Z,
      {
        ref: titleRef,
        value: title,
        autoFocus: true,
        maxLength: MAX_TITLE_LENGTH,
        "aria-invalid": Boolean(titleError),
        "aria-describedby": titleError ? "rs-job-title-error" : void 0,
        placeholder: "\u5982\uFF1A\u524D\u7AEF\u5DE5\u7A0B\u5E08",
        onChange: (event) => setTitle(event.currentTarget.value),
        onKeyDown: (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }
      }
    ), /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-soft-count", style: { color: "var(--rs-soft)", fontSize: 11 } }, title.length, "/", MAX_TITLE_LENGTH), titleError ? /* @__PURE__ */ react_shim_default.createElement("span", { id: "rs-job-title-error", className: "rs-form-error", role: "alert" }, titleError) : null), /* @__PURE__ */ react_shim_default.createElement("label", { className: "rs-form-field" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u804C\u4F4D\u63CF\u8FF0", /* @__PURE__ */ react_shim_default.createElement("em", null, "*"), /* @__PURE__ */ react_shim_default.createElement("small", null, "\u81F3\u5C11 ", MIN_JD_LENGTH, " \u5B57")), /* @__PURE__ */ react_shim_default.createElement(
      we2,
      {
        ref: jdRef,
        value: jdText,
        "aria-invalid": Boolean(jdError),
        "aria-describedby": jdError ? "rs-job-jd-error" : void 0,
        placeholder: "\u7C98\u8D34\u5C97\u4F4D JD \u539F\u6587\uFF0CAI \u5C06\u636E\u6B64\u62BD\u53D6\u8BC4\u5206",
        onChange: (event) => setJdText(event.currentTarget.value)
      }
    ), jdError ? /* @__PURE__ */ react_shim_default.createElement("span", { id: "rs-job-jd-error", className: "rs-form-error", role: "alert" }, jdError) : null)), submitError ? (
      // M10 M-3（§3.2）：「其他异常」在表单语境呈现——Dialog 内 notice 红变体（复用 .rs-notice sm token、role=alert），
      // notify 轻提示由父编排双通道同步发出；Dialog 保持打开，文案给出失败事实
      /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-notice rs-notice-inline", role: "alert", style: { position: "static", margin: "10px 0 0" } }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-error-warning-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("div", { style: { minWidth: 0 } }, submitError))
    ) : null, /* @__PURE__ */ react_shim_default.createElement(Mt2, null, /* @__PURE__ */ react_shim_default.createElement(C, { variant: "ghost", disabled: saving, onClick: () => onOpenChange(false) }, "\u53D6\u6D88"), /* @__PURE__ */ react_shim_default.createElement(C, { disabled: !canSave, onClick: () => void submit() }, saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58"))));
  }

  // src/lib/remote-components/resume-screen/src/components/stat-bar.tsx
  var { useMemo: useMemo3 } = react_shim_default;
  var PILL_DEFS = [
    { key: "pending_review", label: "\u5F85\u5BA1", pick: (s) => s.pendingReview, accent: "var(--rs-blue)" },
    { key: "accepted", label: "\u63A8\u8FDB", pick: (s) => s.accepted, accent: "var(--rs-green)" },
    { key: "hold", label: "\u5F85\u5B9A", pick: (s) => s.hold, accent: "var(--rs-amber)" },
    { key: "rejected", label: "\u6DD8\u6C70", pick: (s) => s.rejected, accent: "var(--rs-red)" },
    { key: "failed", label: "\u5931\u8D25", pick: (s) => s.failed, accent: "var(--rs-red)" },
    { key: "parsing", label: "\u89E3\u6790\u4E2D", pick: (s) => s.parsing, accent: "var(--rs-blue)" }
  ];
  function StatBar({ stats, loading, value, hasTimedOutParsing, onFilterChange }) {
    const pills = useMemo3(
      () => PILL_DEFS.map((def) => ({ def, count: def.pick(stats) })),
      [stats]
    );
    if (loading) {
      return /* @__PURE__ */ react_shim_default.createElement("nav", { className: "rs-statsbar", "aria-label": "\u72B6\u6001\u7EDF\u8BA1\u52A0\u8F7D\u4E2D", "aria-busy": "true" }, Array.from({ length: 5 }, (_, index2) => /* @__PURE__ */ react_shim_default.createElement(K2, { key: index2, className: "rs-pill-skeleton" })));
    }
    return /* @__PURE__ */ react_shim_default.createElement("nav", { className: "rs-statsbar", "aria-label": "\u72B6\u6001\u7EDF\u8BA1\u7B5B\u9009" }, /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-pill rs-pill-total" }, /* @__PURE__ */ react_shim_default.createElement("strong", null, stats.total), "\u5171"), pills.map(({ def, count: count3 }) => {
      const selected = value === def.key;
      return /* @__PURE__ */ react_shim_default.createElement(
        "button",
        {
          key: def.key,
          type: "button",
          className: `rs-pill${count3 === 0 ? " is-zero" : ""}${selected ? " is-selected" : ""}`,
          style: { "--pill-strong": def.accent },
          "aria-pressed": selected,
          onClick: () => onFilterChange(selected ? "all" : def.key)
        },
        count3,
        /* @__PURE__ */ react_shim_default.createElement("span", null, def.label),
        def.key === "parsing" && count3 > 0 ? /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-loader-4-line rs-spin", "aria-hidden": "true" }) : null,
        def.key === "parsing" && hasTimedOutParsing ? /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-timeout-dot", "aria-label": "\u5B58\u5728\u89E3\u6790\u8D85\u65F6" }) : null
      );
    }));
  }

  // src/lib/remote-components/resume-screen/src/components/workbench.tsx
  var { useCallback: useCallback2, useEffect: useEffect5, useMemo: useMemo4, useRef: useRef5, useState: useState6 } = react_shim_default;
  var INITIAL_VIEW = { jobId: null, status: "all", sortBy: "matchScore", sortDir: "desc", search: "" };
  function pickJobIdFromContext(context) {
    const fromPayload = context.payload?.parameters?.jobId ?? context.initialQuery?.parameters?.jobId;
    const value = Array.isArray(fromPayload) ? fromPayload[0] : fromPayload;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
  function initialJobId(context, data) {
    return data.job?.id ?? pickJobIdFromContext(context) ?? data.jobs[0]?.id ?? null;
  }
  function ResumeScreenWorkbench({ context }) {
    const [data, setData] = useState6(null);
    const [items, setItems] = useState6([]);
    const [view, setView] = useState6(() => ({
      ...INITIAL_VIEW,
      jobId: pickJobIdFromContext(context),
      search: context.initialQuery?.search ?? ""
    }));
    const [pagesLoaded, setPagesLoaded] = useState6(1);
    const [firstLoading, setFirstLoading] = useState6(true);
    const [loadError, setLoadError] = useState6("");
    const [refreshing, setRefreshing] = useState6(false);
    const [selectedId, setSelectedId] = useState6(null);
    const [busyKey, setBusyKey] = useState6(null);
    const [notice, setNotice] = useState6("");
    const [queueRows, setQueueRows] = useState6([]);
    const [queueExpanded, setQueueExpanded] = useState6(false);
    const [queueBusy, setQueueBusy] = useState6(false);
    const [jobPulseSeq, setJobPulseSeq] = useState6(0);
    const [jumpCandidateId, setJumpCandidateId] = useState6(null);
    const [uploadRequestSeq, setUploadRequestSeq] = useState6(0);
    const [enteringIds, setEnteringIds] = useState6(() => /* @__PURE__ */ new Set());
    const [nowTick, setNowTick] = useState6(() => Date.now());
    const [sheetOpen, setSheetOpen] = useState6(false);
    const [widthMode, setWidthMode] = useState6("wide");
    const [timeoutDismiss, setTimeoutDismiss] = useState6({});
    const shellRef = useRef5(null);
    const viewRef = useRef5(view);
    viewRef.current = view;
    const selectedRef = useRef5(selectedId);
    selectedRef.current = selectedId;
    const queueSeq = useRef5(0);
    const noticeTimer = useRef5(null);
    function showNotice(message) {
      setNotice(message);
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(""), 1e4);
    }
    const load = useCallback2(
      async (mode) => {
        const current = viewRef.current;
        const loaded = mode === "more" ? pagesLoaded : mode === "refresh" ? pagesLoaded : 1;
        const query = buildQuery({
          jobId: current.jobId,
          status: current.status,
          sortBy: current.sortBy,
          sortDir: current.sortDir,
          search: current.search,
          page: mode === "more" ? pagesLoaded + 1 : 1,
          // M10 I-1：「加载更多」= 追加下一页且 page.size=20（§3.4/§11）。服务端窗口为 start=(page-1)*pageSize，
          // more 若把 pageSize 传成已加载跨度，第二次起 start 跳越、返回空片，41+ 候选人永不可达——故固定 PAGE_SIZE；
          // 刷新/首屏保留一次取回已加载全跨度的语义，避免多页请求拼接竞态（§11 DOM 上限内）
          pageSize: mode === "more" ? PAGE_SIZE : Math.min(DOM_ROW_CAP, PAGE_SIZE * Math.max(1, loaded))
        });
        if (mode === "first") setFirstLoading(true);
        else setRefreshing(true);
        try {
          const response = await requestData(query);
          const result = normalizeViewData(response);
          setData(result);
          setItems((previous) => {
            const nextIds = new Set(result.candidates.map((item) => item.id));
            if (mode === "more") {
              const merged = [...previous];
              for (const item of result.candidates) {
                if (!merged.some((existing) => existing.id === item.id)) merged.push(item);
              }
              setEnteringIds(new Set(result.candidates.map((item) => item.id)));
              return merged;
            }
            const previousIds = new Set(previous.map((item) => item.id));
            setEnteringIds(new Set([...nextIds].filter((id) => !previousIds.has(id))));
            return result.candidates;
          });
          if (mode === "more") setPagesLoaded(pagesLoaded + 1);
          setLoadError("");
          if (!current.jobId && result.jobs.length > 0) {
            setView((state) => ({ ...state, jobId: initialJobId(context, result) }));
          }
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : "\u89C6\u56FE\u6570\u636E\u52A0\u8F7D\u5931\u8D25";
          if (mode === "first") {
            setLoadError(message);
          } else {
            showNotice(message);
          }
          return null;
        } finally {
          setFirstLoading(false);
          setRefreshing(false);
        }
      },
      [context, pagesLoaded]
    );
    const silentRefresh = useCallback2(async () => {
      await load("refresh");
    }, [load]);
    useEffect5(() => {
      void load(items.length === 0 && !data ? "first" : "refresh");
    }, [view]);
    useEffect5(() => {
      window.__resumeScreenReload = () => void silentRefresh();
      return () => {
        delete window.__resumeScreenReload;
      };
    }, [silentRefresh]);
    useEffect5(() => {
      setOnLateReceipt(() => void silentRefresh());
      return () => setOnLateReceipt(null);
    }, [silentRefresh]);
    useEffect5(() => {
      const shell = shellRef.current;
      if (!shell || typeof ResizeObserver === "undefined") return void 0;
      const observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? 0;
        setWidthMode(width < 560 ? "xs" : width < 720 ? "narrow" : "wide");
      });
      observer.observe(shell);
      return () => observer.disconnect();
    }, []);
    const hasParsing = items.some((item) => item.status === "parsing" || item.status === "draft");
    const hasQueueWorking = queueRows.some((row) => row.status === "queued" || row.status === "uploading");
    useEffect5(() => {
      if (!hasParsing && !hasQueueWorking) return void 0;
      const timer = window.setInterval(() => {
        setNowTick(Date.now());
        void silentRefresh();
      }, PARSE_POLL_MS);
      return () => window.clearInterval(timer);
    }, [hasParsing, hasQueueWorking, silentRefresh]);
    const isTimedOut = useCallback2(
      (candidate) => isParsingTimedOut(candidate, nowTick),
      [nowTick]
    );
    const selected = useMemo4(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
    const hasTimedOutParsing = useMemo4(() => items.some((item) => isParsingTimedOut(item, nowTick)), [items, nowTick]);
    function changeView(patch, options2) {
      setView((state) => ({ ...state, ...patch }));
      if (options2?.clearSelection) setSelectedId(null);
      setPagesLoaded(1);
    }
    function selectJob(jobId) {
      changeView({ jobId, status: "all", search: "" }, { clearSelection: true });
    }
    function toggleStatusFilter(next) {
      changeView({ status: next });
    }
    function clearFilters() {
      changeView({ status: "all", search: "" });
    }
    const runDisposition = useCallback2(
      async (key, candidate) => {
        if (busyKey) return;
        setBusyKey(key);
        try {
          const response = await executeAction(key, candidate.id, { candidateId: candidate.id }, { jobId: candidate.jobId });
          const result = parseActionResult(response);
          const message = resolveText(result.message);
          if (!result.success) {
            showNotice(message || "\u64CD\u4F5C\u5931\u8D25");
            notify(message || "\u64CD\u4F5C\u5931\u8D25", "error");
            return;
          }
          if (key === "retry_candidate") {
            setItems((list) => list.map((item) => item.id === candidate.id ? { ...item, status: "parsing", failureReason: void 0 } : item));
          }
          notify(message || (key === "retry_candidate" ? "\u5DF2\u91CD\u65B0\u5F00\u59CB\u89E3\u6790" : "\u5904\u7F6E\u6210\u529F"));
          const actedSelected = selectedRef.current === candidate.id;
          await silentRefresh();
          if (actedSelected && key !== "retry_candidate") {
            setItems((list) => {
              const nextId = nextPendingId(list, candidate.id);
              if (nextId) setSelectedId(nextId);
              return list;
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "\u64CD\u4F5C\u5931\u8D25";
          showNotice(message);
          notify(message, "error");
        } finally {
          setBusyKey(null);
        }
      },
      [busyKey, silentRefresh]
    );
    const saveCandidate = useCallback2(
      async (candidate, patch, expectedRevision) => {
        try {
          const response = await executeAction(
            "update_candidate",
            candidate.id,
            { candidateId: candidate.id, patch, expectedRevision },
            { jobId: candidate.jobId }
          );
          const result = parseActionResult(response);
          const message = resolveText(result.message);
          if (!result.success) {
            const conflict = looksLikeRevisionConflict(message);
            if (!conflict) {
              showNotice(message || "\u4FDD\u5B58\u5931\u8D25");
              notify(message || "\u4FDD\u5B58\u5931\u8D25", "error");
            }
            return { success: false, conflict, message };
          }
          notify(message || "\u5DF2\u4FDD\u5B58");
          if (result.refresh) await silentRefresh();
          return { success: true, conflict: false, message };
        } catch (error) {
          const message = error instanceof Error ? error.message : "\u4FDD\u5B58\u5931\u8D25";
          showNotice(message);
          notify(message, "error");
          return { success: false, conflict: false, message };
        }
      },
      [silentRefresh]
    );
    const createJob = useCallback2(
      async (title, jdText) => {
        try {
          const response = await executeAction("create_job", null, { title, jdText }, {});
          const result = parseActionResult(response);
          const message = resolveText(result.message);
          if (!result.success) {
            notify(message || "\u8BE5\u5C97\u4F4D\u5DF2\u5B58\u5728", "error");
            return { ok: false };
          }
          notify(message || "\u5C97\u4F4D\u5DF2\u521B\u5EFA");
          const jobField = isObject(result.data) ? result.data.job : void 0;
          const job = isObject(jobField) ? jobField : null;
          if (job?.id) {
            changeView({ jobId: job.id, status: "all", search: "" }, { clearSelection: true });
          } else {
            void silentRefresh();
          }
          return { ok: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : "\u65B0\u5EFA\u5C97\u4F4D\u5931\u8D25";
          notify(message, "error");
          return { ok: false, notice: message };
        }
      },
      // changeView 仅用函数式 setState，无外部状态依赖；静默刷新一并声明依赖
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [silentRefresh]
    );
    const canUpload = useCallback2(() => {
      if (viewRef.current.jobId) return true;
      notify("\u8BF7\u5148\u9009\u62E9\u5C97\u4F4D", "error");
      setJobPulseSeq((seq) => seq + 1);
      return false;
    }, []);
    function patchQueueRow(localId, patch) {
      setQueueRows((rows) => rows.map((item) => item.localId === localId ? { ...item, ...patch } : item));
    }
    const pickFiles = useCallback2(
      async (files) => {
        const jobId = viewRef.current.jobId;
        if (!jobId) return;
        setQueueBusy(true);
        const rows = files.map((file) => {
          const row = { localId: ++queueSeq.current, fileName: file.name, status: "queued", startedAt: Date.now() };
          setQueueRows((current) => [row, ...current].slice(0, 40));
          return row;
        });
        setQueueExpanded(true);
        try {
          for (let index2 = 0; index2 < files.length; index2 += 1) {
            const file = files[index2];
            const row = rows[index2];
            if (file.size > UPLOAD_MAX_BYTES) {
              patchQueueRow(row.localId, { status: "failed", failureReason: UPLOAD_OVERSIZE_HINT });
              notify(`${file.name}\uFF1A${UPLOAD_OVERSIZE_HINT}`, "error");
              continue;
            }
            patchQueueRow(row.localId, { status: "uploading" });
            try {
              const response = await executeFileAction("upload_resume_files", null, {}, { jobId }, file);
              const result = parseActionResult(response);
              const dataField = isObject(result.data) ? result.data : {};
              const createdList = Array.isArray(dataField.created) ? dataField.created : [];
              const skippedList = Array.isArray(dataField.skipped) ? dataField.skipped : [];
              if (!result.success) {
                const reason = mapUploadFailure(resolveText(result.message));
                patchQueueRow(row.localId, { status: "failed", failureReason: reason });
                notify(`${file.name}\uFF1A${reason}`, "error");
                continue;
              }
              if (createdList.length > 0) {
                patchQueueRow(row.localId, { status: "created", candidateId: createdList[0]?.id });
              } else if (skippedList.length > 0) {
                patchQueueRow(row.localId, { status: "skipped" });
              } else {
                patchQueueRow(row.localId, { status: "created" });
              }
            } catch (error) {
              const reason = mapUploadFailure(error instanceof Error ? error.message : "\u4E0A\u4F20\u5931\u8D25");
              patchQueueRow(row.localId, { status: "failed", failureReason: reason });
              notify(`${file.name}\uFF1A${reason}`, "error");
            }
          }
        } finally {
          setQueueBusy(false);
        }
        await silentRefresh();
      },
      [silentRefresh]
    );
    const clearFailedRows = useCallback2(() => {
      setQueueRows((rows) => rows.map((row) => row.status === "failed" ? { ...row, leaving: true } : row));
      window.setTimeout(() => setQueueRows((rows) => rows.filter((row) => !(row.status === "failed" && row.leaving))), 160);
    }, []);
    const jumpToCandidate = useCallback2(
      (candidateId) => {
        setSheetOpen(false);
        setSelectedId(candidateId);
        setJumpCandidateId(candidateId);
      },
      []
    );
    const loading = firstLoading || !data && !loadError;
    const isError = Boolean(loadError) && !data && !firstLoading;
    const stats = data?.stats ?? { total: 0, pendingReview: 0, accepted: 0, hold: 0, rejected: 0, failed: 0, parsing: 0 };
    const total = data?.page?.total ?? items.length;
    const hasFilterActive = view.status !== "all" || view.search !== "";
    const detail = /* @__PURE__ */ react_shim_default.createElement(
      DetailContent,
      {
        candidate: selected,
        timedOut: selected ? isTimedOut(selected) : false,
        showTimeoutCard: selected ? isTimedOut(selected) && (timeoutDismiss[selected.id] ?? 0) < nowTick : false,
        now: nowTick,
        busyKey,
        onDispose: (key) => selected ? runDisposition(key, selected) : Promise.resolve(),
        onWaitMore: (candidateId) => setTimeoutDismiss((map) => ({ ...map, [candidateId]: Date.now() + 5 * 6e4 })),
        onSave: saveCandidate,
        onConflictRefresh: () => void silentRefresh()
      }
    );
    return /* @__PURE__ */ react_shim_default.createElement("main", { className: "rs-shell", ref: shellRef, "data-rs-width": widthMode }, refreshing && !firstLoading ? /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-scanline", "aria-hidden": "true" }) : null, /* @__PURE__ */ react_shim_default.createElement(
      JobHeader,
      {
        jobs: data?.jobs ?? [],
        currentJobId: view.jobId,
        busy: busyKey !== null,
        jobPulseSeq,
        xsMode: widthMode === "xs",
        onSelectJob: selectJob,
        onCreateJob: createJob,
        onRefresh: () => void silentRefresh()
      }
    ), /* @__PURE__ */ react_shim_default.createElement(StatBar, { stats, loading: loading && !data, value: view.status, hasTimedOutParsing, onFilterChange: toggleStatusFilter }), isError ? (
      // 首载失败：错误卡 + 重试（重新 requestData）；刷新失败只走 notice 不替换整页（§6.1）
      /* @__PURE__ */ react_shim_default.createElement("section", { className: "rs-content" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-error-card", role: "alert" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-error-warning-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("div", null, loadError || "\u89C6\u56FE\u6570\u636E\u52A0\u8F7D\u5931\u8D25"), /* @__PURE__ */ react_shim_default.createElement(C, { variant: "outline", size: "sm", onClick: () => void load("first") }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-refresh-line", "aria-hidden": "true" }), "\u91CD\u8BD5")))
    ) : /* @__PURE__ */ react_shim_default.createElement("section", { className: "rs-content" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-list-panel" }, /* @__PURE__ */ react_shim_default.createElement(
      CandidateList,
      {
        loading,
        items,
        total,
        selectedId,
        search: view.search,
        status: view.status,
        sortBy: view.sortBy,
        sortDir: view.sortDir,
        enteringIds,
        isTimedOut,
        hasJobs: (data?.jobs.length ?? 0) > 0,
        hasFilterActive,
        jumpCandidateId,
        onJumpConsumed: () => setJumpCandidateId(null),
        onSelect: (id) => {
          setSelectedId(id);
          if (widthMode !== "wide") setSheetOpen(true);
        },
        onSearch: (value) => changeView({ search: value }),
        onStatusChange: (value) => changeView({ status: value }),
        onSortChange: (value) => {
          const [sortBy, sortDir] = value.split(":");
          changeView({ sortBy, sortDir });
        },
        onLoadMore: () => void load("more"),
        onClearFilters: clearFilters,
        onUploadRequest: () => {
          if (!canUpload()) return;
          setQueueExpanded(true);
          setUploadRequestSeq((seq) => seq + 1);
        },
        onCreateJobRequest: () => {
          window.dispatchEvent(new CustomEvent("rs:open-create-job"));
        }
      }
    )), widthMode === "wide" ? /* @__PURE__ */ react_shim_default.createElement("aside", { className: "rs-detail-panel" }, loading && !selected ? /* @__PURE__ */ react_shim_default.createElement(DetailSkeleton, null) : detail) : null), /* @__PURE__ */ react_shim_default.createElement(Ie2, { open: widthMode !== "wide" && sheetOpen, onOpenChange: setSheetOpen }, /* @__PURE__ */ react_shim_default.createElement(Re2, { side: "right", className: "rs-sheet-content" }, /* @__PURE__ */ react_shim_default.createElement(Ae, { className: "rs-sr-only" }, /* @__PURE__ */ react_shim_default.createElement(Pe, null, "\u5019\u9009\u4EBA\u8BE6\u60C5")), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-sheet-body" }, detail))), notice ? /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-notice", role: "alert" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-error-warning-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("span", { style: { minWidth: 0 } }, notice), /* @__PURE__ */ react_shim_default.createElement("button", { type: "button", "aria-label": "\u5173\u95ED\u63D0\u793A", onClick: () => setNotice("") }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-close-line", "aria-hidden": "true" }))) : null, /* @__PURE__ */ react_shim_default.createElement(
      IntakePanel,
      {
        rows: queueRows,
        now: nowTick,
        busy: queueBusy,
        expanded: queueExpanded,
        uploadRequestSeq,
        onExpandedChange: setQueueExpanded,
        canUpload,
        onPickFiles: (files) => void pickFiles(files),
        onClearFailed: clearFailedRows,
        onJumpToCandidate: jumpToCandidate
      }
    ));
  }
  function DetailSkeleton() {
    return /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-detail-skeleton", "aria-hidden": "true" }, /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-avatar-lg" }), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-sk-blocks" }, /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-line" }), /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-line rs-sk-short" }), /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-line" }), /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-line rs-sk-mid" })));
  }

  // src/lib/remote-components/resume-screen/src/main.tsx
  var { useEffect: useEffect6, useState: useState7 } = react_shim_default;
  injectStyles();
  function App() {
    const [context, setContext] = useState7(null);
    useEffect6(() => {
      const disposeBridge = installBridgeListener({
        onInit: setContext,
        // 宿主对话旁路事件（assistant.tool.completed 转发）：交给工作台做静默刷新
        onHostEvent: () => window.__resumeScreenReload?.()
      });
      post("ready");
      return disposeBridge;
    }, []);
    useEffect6(() => {
      const root = document.getElementById("root");
      if (!root || typeof ResizeObserver === "undefined") return void 0;
      const observer = new ResizeObserver(() => setTimeout(reportResize, 0));
      observer.observe(root);
      return () => observer.disconnect();
    }, []);
    useEffect6(() => {
      setTimeout(reportResize, 0);
    });
    if (!context) {
      return /* @__PURE__ */ react_shim_default.createElement("main", { className: "rs-shell rs-shell-loading" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-boot-loading" }, "\u52A0\u8F7D\u4E2D\u2026"));
    }
    return /* @__PURE__ */ react_shim_default.createElement(ResumeScreenWorkbench, { context });
  }
  var rootElement = document.getElementById("root") ?? document.body;
  createRoot(rootElement).render(/* @__PURE__ */ react_shim_default.createElement(App, null));
})();
