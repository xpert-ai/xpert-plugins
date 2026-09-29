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

  // community/apps/resume-screen/src/lib/remote-components/resume-screen/src/react-shim.ts
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

  // community/apps/resume-screen/src/lib/remote-components/resume-screen/src/react-dom-client-shim.ts
  var ReactDOMGlobal = window.ReactDOM;
  var createRoot = ReactDOMGlobal.createRoot;
  var hydrateRoot = ReactDOMGlobal.hydrateRoot;

  // community/apps/resume-screen/src/lib/remote-components/resume-screen/src/utils.ts
  var PAGE_SIZE = 20;
  var DOM_ROW_CAP = 200;
  var PARSE_POLL_MS = 3e4;
  var PARSE_TIMEOUT_MS = 10 * 60 * 1e3;
  var UPLOAD_STILL_WORKING_MS = 6e4;
  var LEAVE_FADE_MS = 180;
  var UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
  var UPLOAD_OVERSIZE_HINT = "\u6587\u4EF6\u8D85\u8FC7 10MB\uFF0C\u8BF7\u7CBE\u7B80\u6216\u62C6\u5206\u540E\u91CD\u65B0\u4E0A\u4F20";
  var RS_LAYERS = { inline: 0, sticky: 10, sheet: 40, dialog: 50, popper: 60, toast: 70 };
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
  function looksLikeRevisionConflict(message, code) {
    if (code === "revision_conflict") return true;
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
  var UPLOAD_FAILURE_TOKEN_COPY = {
    file_missing: "\u8BE5\u5019\u9009\u4EBA\u672A\u4FDD\u7559\u539F\u59CB\u7B80\u5386\u6587\u4EF6\uFF0C\u65E0\u6CD5\u91CD\u65B0\u89E3\u6790\uFF0C\u8BF7\u91CD\u65B0\u4E0A\u4F20\u8BE5\u7B80\u5386",
    no_text_layer: "\u8BE5 PDF \u65E0\u6CD5\u63D0\u53D6\u6587\u5B57\uFF08\u53EF\u80FD\u4E3A\u626B\u63CF\u4EF6\uFF09\uFF0C\u8BF7\u8F6C\u5B58\u4E3A Word \u540E\u91CD\u65B0\u4E0A\u4F20",
    encrypted: "\u6587\u4EF6\u5DF2\u52A0\u5BC6\uFF0C\u8BF7\u89E3\u9664\u5BC6\u7801\u540E\u91CD\u65B0\u4E0A\u4F20",
    unsupported_format: "\u4EC5\u652F\u6301 .docx / .pdf\uFF08\u226410MB\uFF09\uFF0C\u8BF7\u8F6C\u6362\u683C\u5F0F\u540E\u91CD\u65B0\u4E0A\u4F20",
    file_too_large: UPLOAD_OVERSIZE_HINT,
    parse_error: "\u6587\u4EF6\u5185\u5BB9\u65E0\u6CD5\u89E3\u6790\uFF0C\u8BF7\u786E\u8BA4\u6587\u4EF6\u672A\u635F\u574F\u540E\u91CD\u65B0\u4E0A\u4F20"
  };
  function mapUploadFailure(message) {
    const text = message.trim();
    if (!text) return "\u4E0A\u4F20\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u4E0A\u4F20";
    const byToken = UPLOAD_FAILURE_TOKEN_COPY[text];
    if (byToken) return byToken;
    if (/加密|password/i.test(text)) return UPLOAD_FAILURE_TOKEN_COPY.encrypted;
    if (/扫描|无文本|无法提取文字/.test(text)) return UPLOAD_FAILURE_TOKEN_COPY.no_text_layer;
    if (/格式|不支持/.test(text)) return UPLOAD_FAILURE_TOKEN_COPY.unsupported_format;
    if (/超过|过大|10MB|size/i.test(text)) return UPLOAD_OVERSIZE_HINT;
    return text;
  }
  function summarizeUploadRows(rows) {
    const alive = rows.filter((row) => !row.leaving);
    const count3 = (status) => alive.filter((row) => row.status === status).length;
    const done = count3("created");
    const skipped = count3("skipped");
    const failed = count3("failed");
    const inFlight = count3("queued") + count3("uploading");
    return { selected: alive.length, done, skipped, failed, inFlight, closable: inFlight === 0 };
  }
  function candidateSignature(candidate) {
    return JSON.stringify([
      candidate.status,
      candidate.name ?? "",
      candidate.yearsOfExperience ?? "",
      candidate.education ?? "",
      candidate.currentCompany ?? "",
      candidate.skills ?? [],
      candidate.summary ?? "",
      candidate.matchScore ?? null,
      candidate.matchReason ?? "",
      candidate.hitPoints ?? [],
      candidate.riskPoints ?? [],
      candidate.humanEditedFields ?? [],
      candidate.attemptCount,
      candidate.failureReason ?? "",
      candidate.sourceFileName ?? "",
      candidate.revision,
      candidate.createdAt,
      candidate.updatedAt
    ]);
  }
  function reconcileCandidateItems(previous, next) {
    if (previous.length === 0) return next;
    const previousById = new Map(previous.map((item) => [item.id, item]));
    return next.map((item) => {
      const existing = previousById.get(item.id);
      return existing && !existing.leaving && candidateSignature(existing) === candidateSignature(item) ? existing : item;
    });
  }
  function mergeRefreshedList(previous, next) {
    const nextIds = new Set(next.map((item) => item.id));
    const merged = reconcileCandidateItems(previous, next);
    const carried = previous.filter((item) => item.leaving && !nextIds.has(item.id));
    const removed = previous.filter((item) => !item.leaving && !nextIds.has(item.id));
    if (removed.length === 0) return carried.length > 0 ? [...merged, ...carried] : merged;
    for (const item of removed) {
      const index2 = previous.indexOf(item);
      const before = previous.slice(0, index2).reverse().find((row) => !row.leaving && nextIds.has(row.id));
      const after = before ? void 0 : previous.slice(index2 + 1).find((row) => !row.leaving && nextIds.has(row.id));
      const anchorIndex = before ? merged.findIndex((row) => row.id === before.id) : after ? merged.findIndex((row) => row.id === after.id) : -1;
      const position = before && anchorIndex >= 0 ? anchorIndex + 1 : after && anchorIndex >= 0 ? anchorIndex : merged.length;
      merged.splice(position, 0, { ...item, leaving: true });
    }
    return carried.length > 0 ? [...merged, ...carried] : merged;
  }
  function mergeAppendedPage(previous, appended) {
    const merged = previous.filter((item) => !item.leaving);
    for (const item of appended) {
      if (!merged.some((existing) => existing.id === item.id)) merged.push(item);
    }
    return merged;
  }
  function nextPendingId(list, afterId) {
    const startIndex = afterId ? list.findIndex((item) => item.id === afterId) : -1;
    for (let offset4 = 1; offset4 <= list.length; offset4 += 1) {
      const item = list[(startIndex + offset4 + list.length) % list.length];
      if (item && item.status === "pending_review") return item.id;
    }
    return null;
  }
  function decodeBase64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index2 = 0; index2 < binary.length; index2 += 1) {
      bytes[index2] = binary.charCodeAt(index2);
    }
    return bytes;
  }
  function createPdfBlobUrl(bytes, mime) {
    const url = URL.createObjectURL(new Blob([bytes.buffer], { type: mime }));
    let released = false;
    return {
      url,
      release: () => {
        if (released) return;
        released = true;
        URL.revokeObjectURL(url);
      }
    };
  }

  // community/apps/resume-screen/src/lib/remote-components/resume-screen/src/bridge.ts
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

  // community/apps/resume-screen/src/lib/remote-components/resume-screen/src/styles.ts
  var RS_STYLES_CSS = `
    :root {
      /* \u6D45\u8272\u9489\u6B7B\uFF1A\u4E0B\u5217 shadcn \u8BED\u4E49 token \u4E0E app.css \u7684 :root \u540C\u540D\u3002\u5BBF\u4E3B createRemoteTheme()
         \u6309\u88F8\u540D\u8BFB\u53D6\uFF0C\u53EA\u6709\u672C\u8868\u628A\u5B83\u4EEC\u58F0\u660E\u51FA\u6765\u5B83\u624D\u53D6\u5230\u503C\uFF1B!important \u538B\u7684\u662F app.css \u7684\u540C\u540D :root
         \u58F0\u660E\uFF08\u53CA\u5176 .dark \u5757\uFF09\uFF0C\u4E0D\u662F\u5BBF\u4E3B\u7684\u884C\u5185 --xui-color-*\u3002\u53D6\u503C\u5373\u672C\u5DE5\u4F5C\u53F0\u65E2\u6709\u8BBE\u8BA1\u8272\u677F\u7684
         oklch \u7B49\u4EF7\uFF08#ffffff/#1f2937/#2563eb/#e5e7eb/\u2026\uFF09\uFF0C\u4E0D\u65B0\u9020\u989C\u8272\u3002 */
      color-scheme: light !important;
      --background: oklch(1 0 0) !important;                   /* = #ffffff */
      --foreground: oklch(0.278 0.04 256.8) !important;        /* = #1f2937\uFF1A--rs-text \u540C\u6E90 */
      --card: oklch(1 0 0) !important;
      --card-foreground: oklch(0.278 0.04 256.8) !important;
      --popover: oklch(1 0 0) !important;
      --popover-foreground: oklch(0.278 0.04 256.8) !important;
      --primary: oklch(0.45 0.2 262) !important;               /* \u2248#1d4ed8\uFF1A\u767D\u5B57\u6309\u538B\u94AE\u5BF9\u6BD4 \u22657:1 */
      --primary-foreground: oklch(1 0 0) !important;
      --secondary: oklch(0.962 0.008 256) !important;
      --secondary-foreground: oklch(0.278 0.04 256.8) !important;
      --muted: oklch(0.962 0.008 256) !important;
      --muted-foreground: oklch(0.556 0.03 257) !important;    /* \u2248#6b7280\uFF1A\u767D\u5E95\u5C0F\u5B57\u8F85\u52A9\u6587\u5B57 \u22654.5:1 */
      --accent: oklch(0.955 0.02 261) !important;
      --accent-foreground: oklch(0.278 0.04 256.8) !important;
      --destructive: oklch(0.62 0.22 25) !important;           /* \u2248#dc2626 */
      --destructive-foreground: oklch(1 0 0) !important;
      --border: oklch(0.922 0.007 260) !important;             /* \u2248#e5e7eb */
      --input: oklch(0.922 0.007 260) !important;
      --ring: oklch(0.45 0.2 262) !important;
      /* \u6D6E\u5C42\u5C42\u7EA7\uFF08\u6570\u503C\u5168\u90E8\u53D6\u81EA utils.RS_LAYERS\uFF0C\u6837\u5F0F\u4FA7\u552F\u4E00\u53D6\u503C\u53E3\uFF1B\u65B0\u589E\u5C42\u7EA7\u5148\u53BB\u90A3\u5F20\u8868\u52A0\u6863\uFF09 */
      --rs-layer-inline: ${RS_LAYERS.inline} !important;       /* \u6587\u6863\u6D41\u5185\u7684\u88C5\u9970\u4EF6\u57FA\u7EBF */
      --rs-layer-sticky: ${RS_LAYERS.sticky} !important;                        /* \u626B\u63CF\u7EBF\u7B49\u884C\u5185\u88C5\u9970\uFF1A\u4E0D\u5F97\u76D6\u8FC7\u6D6E\u5C42 */
      --rs-layer-sheet: ${RS_LAYERS.sheet} !important;                         /* \u7A84\u5BB9\u5668\u62BD\u5C49\u9762\u677F */
      --rs-layer-sheet-overlay: ${RS_LAYERS.sheet - 1} !important;             /* \u62BD\u5C49\u906E\u7F69\u538B\u5728 sheet \u9762\u677F\u4E0B\u65B9\uFF0C\u6545\u7531 sheet \u6D3E\u751F\u3001\u4E0D\u72EC\u7ACB\u53D6\u6570 */
      --rs-layer-dialog: ${RS_LAYERS.dialog} !important;
      --rs-layer-popper: ${RS_LAYERS.popper} !important;
      --rs-layer-toast: ${RS_LAYERS.toast} !important;                         /* notice/\u544A\u8B66\u6761\uFF1A\u6700\u4E0A\u5C42\u4E0D\u88AB\u4EFB\u4F55\u6D6E\u5C42\u906E\u6321 */
      /* ===== \u4EE5\u4E0B\u4E3A\u672C\u7EC4\u4EF6\u81EA\u6709 token\uFF08\u503C\u3001\u987A\u5E8F\u3001\u6CE8\u91CA\u7167\u539F :root \u539F\u6837\u642C\u5165\uFF0C\u52FF\u6539\uFF09 ===== */
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
    /* \u7126\u70B9\u73AF\u4FDD\u7559\uFF08\u84DD\u56FE \xA76.8\uFF0C\u5BF9\u9F50 crm \u641C\u7D22\u6846 focus \u5708\uFF09\uFF1B\u300C\u7422\u300D\u8865\u9F50\u81EA\u7ED8\u53EF\u4EA4\u4E92\u4EF6\uFF1A\u5217\u8868\u884C\u4E0E\u8F93\u5165\u65CF\u540C\u73AF */
    [data-slot="input"]:focus-visible, [data-slot="textarea"]:focus-visible, [data-slot="select-trigger"]:focus-visible, .rs-item:focus-visible, [data-slot="button"]:focus-visible, .rs-expand:focus-visible, .rs-notice button:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12); }
    /* \u5217\u8868\u5BB9\u5668\u662F\u952E\u76D8\u5BFC\u822A\u5BBF\u4E3B\uFF08\u2191/\u2193/Enter\uFF09\uFF0C\u7126\u70B9\u53EF\u89C1\u6027\u7528\u5185\u63CF\u8FB9\u514D\u88AB shell overflow \u88C1\u5207 */
    .rs-list:focus-visible { outline: 2px solid color-mix(in srgb, var(--rs-primary) 45%, transparent); outline-offset: -2px; }
    /* \u6309\u94AE\u6309\u538B\u89E6\u611F\uFF1A1px \u4E0B\u6C89\u6A21\u62DF\u7269\u7406\u6309\u952E\uFF08\u4EC5 transform\uFF0Creduced-motion \u4E0B\u77AC\u65F6\u751F\u6548\u4E0D\u4F24\u6027\u80FD\uFF09 */
    [data-slot="button"]:active:not(:disabled) { transform: translateY(1px); }
    i[class^="ri-"] { font-style: normal; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }

    /* ===== \u9AA8\u67B6\u5E03\u5C40\uFF08T14 \u5355\u680F\u5316\uFF1A48px \u5934\u90E8 + 1fr \u4E3B\u4F53 + auto \u5E95\u90E8\uFF0C\u5E95\u90E8\u53EA\u5269 notice \u7A7A\u95F4\uFF09 ===== */
    .rs-shell { min-height: 640px; display: grid; grid-template-rows: 48px minmax(0, 1fr) auto; background: var(--rs-panel); position: relative; overflow: hidden; container-type: inline-size; }
    .rs-shell.rs-shell-loading { display: flex; align-items: center; justify-content: center; }
    .rs-boot-loading { color: var(--rs-muted); font-size: 13px; }
    .rs-header { display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--rs-border); min-width: 0; }
    /* \u4E3B\u4F53\u5355\u680F\uFF08\xA75.1\uFF09\uFF1A\u5217\u8868\u72EC\u5360\uFF0C\u8BE6\u60C5\u53EA\u6D3B\u5728\u540C\u5C42 Sheet \u906E\u7F69\u4E0A */
    .rs-content { min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); }
    .rs-list-panel { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
    .rs-detail-stack { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 0; height: 100%; }
    /* \u9996\u8F7D\u5931\u8D25\u9519\u8BEF\u5361\uFF08\xA76.1\uFF1Acrm notice \u7EA2\u53D8\u4F53 + \u91CD\u8BD5\uFF0C\u5C45\u4E2D\uFF09 */
    .rs-error-card { grid-column: 1 / -1; margin: 10px; min-height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; border: 1px solid color-mix(in srgb, var(--rs-red) 40%, transparent); background: var(--rs-red-soft); color: var(--rs-red); border-radius: var(--rs-radius-lg); font-size: 13px; padding: 22px 14px; text-align: center; }
    .rs-error-card i { font-size: 34px; }

    /* ===== \u5C97\u4F4D\u5207\u6362\u533A\uFF08\u84DD\u56FE \xA73.2\uFF09 ===== */
    .rs-job-icon { color: var(--rs-muted); width: 30px; height: 30px; font-size: 16px; flex: 0 0 auto; }
    .rs-job-select [data-slot="select-trigger"] { height: var(--rs-control-h); border-radius: var(--rs-radius); border-color: var(--rs-border); background: var(--rs-panel); font-weight: 650; max-width: 260px; }
    .rs-header-spacer { flex: 1 1 auto; }
    .rs-header-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
    .rs-header-actions [data-slot="button"] i { margin-right: 6px; font-size: 14px; }
    .rs-header-actions [data-slot="button"][data-size="icon"] i { margin-right: 0; }

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
    /* \u70B9\u6309\u77AC\u95F4\u5373\u5448\u73B0\u9009\u4E2D\u5E95\u8272\u9884\u89C8\uFF08\u5148\u4E8E\u6570\u636E\u56DE\u6D41\uFF09\uFF0C\u884C\u70B9\u51FB\u300C\u8DDF\u624B\u300D\uFF1BA8 \u9000\u573A\u884C\u4E0D\u53EF\u4EA4\u4E92 */
    .rs-item:active { background: var(--rs-active); }
    .rs-item[aria-current="true"] { background: var(--rs-active); }
    /* \u5217\u8868\u6EDA\u52A8\u6761\u8D28\u611F\uFF08\xA79 \u8272\u677F\u5185\u53D6\u503C\uFF09\uFF1A\u7EC6\u8F68\u900F\u660E\u5E95\uFF0Cthumb \u7528\u8FB9\u6846\u7070\uFF0Chover \u5347\u4E00\u7EA7\u2014\u2014\u4E0E crm \u6D45\u7070\u8BED\u8A00\u4E00\u81F4 */
    .rs-list { scrollbar-width: thin; scrollbar-color: var(--rs-border) transparent; }
    .rs-list::-webkit-scrollbar { width: 8px; }
    .rs-list::-webkit-scrollbar-track { background: transparent; }
    .rs-list::-webkit-scrollbar-thumb { background: var(--rs-border); border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
    .rs-list::-webkit-scrollbar-thumb:hover { background-color: var(--rs-soft); background-clip: content-box; }
    .rs-item-main { min-width: 0; display: grid; gap: 2px; }
    .rs-item-title { min-width: 0; display: flex; align-items: center; gap: 6px; }
    /* \u300C\u7422\u300D\u957F\u6587\u672C\u4E0D\u6324\u538B\uFF1A\u6536\u7F29\u538B\u529B\u5168\u90E8\u8BA9\u7ED9\u59D3\u540D\uFF08\u81EA\u5E26 ellipsis\uFF09\uFF0C\u6765\u6E90\u89D2\u6807\u4E0E\u72B6\u6001\u5FBD\u6807\u6C38\u4E0D\u538B\u7F29\u53D8\u5F62 */
    .rs-item-title .rs-badge, .rs-item-title i { flex: 0 0 auto; }
    .rs-item-name { font-size: 13px; font-weight: 650; color: var(--rs-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rs-item-source { color: var(--rs-soft); font-size: 11px; flex: 0 0 auto; }
    .rs-item-meta { font-size: 12px; color: var(--rs-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rs-mark { width: 28px; height: 28px; border-radius: var(--rs-radius); color: #fff; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; background: var(--rs-soft); flex: 0 0 auto; }
    .rs-item-score { display: grid; gap: 3px; justify-items: end; width: 46px; }
    /* \u5339\u914D\u5206\u5448\u73B0\uFF08P2 \u88C1\u51B3\uFF09\uFF1ABadge \u6570\u5B57 + Progress \u7EC6\u6761\uFF1Btabular-nums \u9632\u5237\u65B0\u8DF3\u52A8 */
    .rs-score-badge { height: 20px; min-width: 40px; justify-content: center; border-radius: var(--rs-radius); background: transparent; color: var(--rs-text); font-size: 13px; font-weight: 750; font-variant-numeric: tabular-nums; padding: 0 2px; }
    /* Progress \u8986\u5199\uFF1A\u6307\u793A\u6761\u989C\u8272\u968F\u5206\u6863\uFF08\u6839\u7EC4\u4EF6\u7528 translateX \u8868\u73B0\u8FDB\u5EA6\uFF0C\u65E0\u9700\u6539\u5BBD\u5EA6\u52A8\u753B\uFF09 */
    .rs-score-bar { width: 40px; height: 3px; border-radius: 2px; background: var(--rs-border-soft); }
    .rs-score-bar [data-slot="progress-indicator"] { background: var(--rs-blue); border-radius: 2px; }
    .rs-score-bar.tier-amber [data-slot="progress-indicator"] { background: var(--rs-amber); }
    .rs-score-bar.tier-red [data-slot="progress-indicator"] { background: var(--rs-red); }
    /* Progress \u8FC7\u6E21\u5E76\u6863\uFF08\xA77 \u7EDF\u4E00\u65F6\u957F/\u7F13\u52A8\uFF09\uFF1A\u8986\u76D6 shadcn \u9ED8\u8BA4 transition-all 150ms\u2014\u2014
       AI \u56DE\u586B\u8BC4\u5206\u65F6\u7EC6\u6761 240ms ease-out \u751F\u957F\u3001\u5206\u6863\u6362\u8272 160ms\uFF0C\u53EA\u52A8 transform/background */
    .rs-score-bar [data-slot="progress-indicator"], .rs-score-detail [data-slot="progress-indicator"] { transition: transform var(--rs-motion-slow) var(--rs-ease-entry), background-color var(--rs-motion-base) var(--rs-ease-entry); }
    .rs-list-foot { min-height: 40px; border-top: 1px solid var(--rs-border); display: flex; align-items: center; gap: 10px; padding: 0 10px; color: var(--rs-soft); font-size: 12px; }
    .rs-list-foot [data-slot="button"] { height: 28px; }

    /* \u7A7A\u6001\uFF08\u84DD\u56FE \xA73.4\uFF1Acrm \u5C45\u4E2D\u7AD6\u6392 + sm \u8F6F\u5E95\u5757\uFF09 */
    .rs-empty { min-height: 280px; margin: 10px; border-radius: 7px; background: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--rs-muted); padding: 22px 14px; text-align: center; font-size: 13px; /* \u7A7A\u6001\u7F13\u5165\uFF1A\u7B5B\u9009\u5207\u6362\u540E\u4E0D\u300C\u556A\u300D\u5730\u7838\u51FA\uFF0C\u4E0E A6 \u8BE6\u60C5\u5165\u573A\u540C\u6863 */ animation: rs-detail-in var(--rs-motion-slow) var(--rs-ease-entry); }
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

    /* ===== \u4E0A\u4F20\u5F39\u7A97\uFF08\xA75.3\uFF1A\u62D6\u62FD\u533A + \u9010\u6587\u4EF6\u884C + \u6C47\u603B\u6761 + \u53CC\u52A8\u4F5C footer\uFF0CT15\uFF09 ===== */
    /* \u5F39\u7A97\u5B9A\u5BBD 560 \u4E0A\u9650\uFF1B\u884C\u5217\u8868\u81EA\u8EAB\u9650\u9AD8\u6536\u53E3\uFF0C\u5C11\u884C\u65F6\u968F\u5185\u5BB9\u6536\u7F29\uFF08intake ScrollArea \u540C\u6B3E\u7B56\u7565\uFF0C\u4E0D\u4F9D\u8D56 1fr \u884C\uFF09 */
    .rs-upload-dialog { width: min(560px, calc(100% - 32px)); max-height: min(80vh, 680px); display: grid; gap: 12px; overflow: hidden; }
    .rs-upload-drop { display: grid; justify-items: center; gap: 8px; padding: 18px 14px; border: 1px dashed var(--rs-border); border-radius: var(--rs-radius-lg); background: var(--rs-bg-soft); color: var(--rs-muted); font-size: 13px; text-align: center; transition: border-color var(--rs-motion-base) var(--rs-ease-entry), background-color var(--rs-motion-base) var(--rs-ease-entry); }
    .rs-upload-drop i { font-size: 26px; color: var(--rs-soft); }
    /* \u62D6\u62FD\u8FDB\u5165\uFF1A\u84DD\u8F6F\u5E95 + \u5B9E\u7EBF\uFF0C\u7ED9\u51FA\u300C\u677E\u624B\u5C31\u5728\u8FD9\u91CC\u300D\u7684\u786E\u5B9A\u611F\uFF08A14 \u540C\u6E90\u8272\u5BF9\uFF09 */
    .rs-upload-drop.is-drag { border-style: solid; border-color: var(--rs-primary); background: var(--rs-primary-soft); color: var(--rs-text); }
    .rs-upload-summary { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--rs-muted); flex-wrap: wrap; }
    .rs-upload-summary b { font-weight: 750; font-variant-numeric: tabular-nums; color: var(--rs-text); }
    .rs-upload-summary .is-fail { color: var(--rs-red); }
    .rs-upload-clear { margin-left: auto; }
    .rs-upload-scroll { min-height: 0; max-height: 264px; }
    .rs-upload-list { display: grid; gap: 4px; padding-right: 6px; }
    .rs-upload-row { min-height: 32px; display: grid; grid-template-columns: 16px minmax(0, 1fr) auto auto; align-items: center; gap: 8px; font-size: 12px; color: var(--rs-text); padding: 0 2px; border-radius: var(--rs-radius); }
    .rs-upload-row:hover { background: var(--rs-hover); }
    .rs-upload-row > i { color: var(--rs-soft); font-size: 14px; }
    /* \u884C\u5185\u76F4\u6302\u7684\u300C\u8DF3\u8FC7(\u91CD\u590D)\u300D\u63D0\u793A\u5BF9\u9F50\u64CD\u4F5C\u5217\uFF08\u627F\u63A5\u539F\u5E95\u90E8\u5F55\u5165\u533A\u7684\u540C\u4F4D\u8BED\u4E49\uFF09 */
    .rs-upload-row > .rs-upload-hint { grid-column: 3 / -1; }
    .rs-upload-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rs-upload-actions { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
    .rs-upload-hint { color: var(--rs-soft); font-size: 11px; }
    /* \u5931\u8D25\u884C\u6307\u5F15\uFF1A\u7EA2\u8F6F\u5E95 notice\uFF08\xA76.6 \u53EF\u6267\u884C\u91CD\u65B0\u4E0A\u4F20\u6307\u5F15\uFF0Crole=alert\uFF1B\u6587\u6848\u552F\u4E00\u771F\u6E90 mapUploadFailure\uFF09 */
    .rs-upload-fail { grid-column: 1 / -1; margin: 2px 0 6px; display: flex; align-items: flex-start; gap: 6px; border: 1px solid color-mix(in srgb, var(--rs-red) 40%, transparent); background: var(--rs-red-soft); color: var(--rs-red); border-radius: var(--rs-radius); padding: 6px 8px; font-size: 12px; line-height: 1.5; }
    .rs-upload-guidance { font-size: 12px; color: var(--rs-muted); line-height: 1.6; }
    .rs-upload-foot { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding-top: 4px; border-top: 1px solid var(--rs-border-soft); }
    .rs-upload-foot [data-slot="button"] i { margin-right: 6px; font-size: 14px; }

    /* ===== \u7B80\u5386\u9884\u89C8\uFF08\xA75.4\uFF1Adocx \u5BCC\u6587\u672C / pdf \u539F\u751F\u67E5\u770B\u5668\u5171\u7528\u540C\u4E00 Dialog \u5C3A\u5BF8\uFF09 ===== */
    .rs-preview-dialog { width: min(880px, calc(100% - 32px)); height: min(72vh, 720px); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 12px; overflow: hidden; }
    .rs-preview-scroll { min-height: 0; }
    /* \u7248\u5F0F\u5BF9\u9F50\u771F\u5B9E\u9605\u8BFB\u5BC6\u5EA6\uFF1A14px/1.7\u3001\u6B63\u6587\u6700\u957F 72ch\uFF0C\u8D85\u5BBD\u89C6\u53E3\u4E0B\u4E0D\u62C9\u6210\u62A5\u7EB8\u680F */
    .rs-preview-doc { max-width: 72ch; margin: 0 auto; padding: 4px 6px 12px; font-size: 14px; line-height: 1.7; color: var(--rs-text); overflow-wrap: anywhere; }
    .rs-preview-doc h1, .rs-preview-doc h2, .rs-preview-doc h3 { font-size: 16px; font-weight: 700; margin: 14px 0 6px; }
    .rs-preview-doc p, .rs-preview-doc li { margin: 0 0 6px; }
    .rs-preview-doc table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px; }
    .rs-preview-doc th, .rs-preview-doc td { border: 1px solid var(--rs-border); padding: 5px 7px; text-align: left; vertical-align: top; }
    .rs-preview-doc img { max-width: 100%; height: auto; }
    .rs-preview-pdf { width: 100%; height: 100%; min-height: 0; border: 1px solid var(--rs-border); border-radius: var(--rs-radius); background: var(--rs-bg-soft); }
    .rs-preview-foot { display: flex; justify-content: flex-end; padding-top: 4px; border-top: 1px solid var(--rs-border-soft); }
    .rs-detail-preview { margin-left: auto; }

    /* ===== notice \u6761\uFF08\u84DD\u56FE \xA76.1 \u901A\u7528\u9519\u8BEF\u51FA\u53E3\uFF1Bcrm .crm20-notice \u540C\u6784\u7EA2/\u7425\u73C0\u53D8\u4F53\uFF09 ===== */
    .rs-notice { position: absolute; left: 12px; right: 12px; top: 92px; z-index: var(--rs-layer-toast); display: flex; align-items: flex-start; gap: 8px; border: 1px solid var(--rs-red); background: var(--rs-red-soft); color: var(--rs-red); padding: 8px 10px; border-radius: var(--rs-radius); font-size: 13px; box-shadow: 0 6px 20px rgba(31, 41, 55, 0.08); animation: rs-notice-in var(--rs-motion-slow) var(--rs-ease-entry); }
    @keyframes rs-notice-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    .rs-notice.tone-amber { border-color: #f2c94c; background: #fffbeb; color: #7a4d00; }
    .rs-notice button { margin-left: auto; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 14px; padding: 0 2px; }
    .rs-notice-inline { position: static; margin: 8px 12px 0; }

    /* ===== \u52A8\u753B\u6E05\u5355\uFF08\u84DD\u56FE \xA77\uFF09 ===== */
    /* A1 \u589E\u91CF\u5237\u65B0\u626B\u63CF\u7EBF\uFF08\u9996\u5C4F\u4E0D\u7528\uFF0C\u7528 Skeleton\uFF09\uFF1A\u884C\u5185\u88C5\u9970\uFF0C\u53D6 sticky \u6863\uFF0C\u4E0D\u5F97\u76D6\u8FC7\u4EFB\u4F55\u6D6E\u5C42 */
    .rs-scanline { position: absolute; top: 0; left: 0; height: 2px; width: 35%; background: var(--rs-primary); z-index: var(--rs-layer-sticky); animation: rs-scan 1s ease-in-out infinite; }
    @keyframes rs-scan { 0% { transform: translateX(-100%); } 50% { transform: translateX(160%); } 100% { transform: translateX(360%); } }
    /* A6 \u8BE6\u60C5\u5185\u5BB9\u5207\u6362 */
    .rs-detail-anim { animation: rs-detail-in var(--rs-motion-base) var(--rs-ease-entry); }
    @keyframes rs-detail-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    /* A7 \u65B0\u7ED3\u679C\u884C\u56DE\u586B\uFF08\u9010\u884C stagger \u4EC5\u524D 10 \u884C\uFF0C\u884C\u5185\u8054 delay \u53D8\u91CF\uFF09 */
    .rs-enter { animation: rs-row-in var(--rs-motion-slow) var(--rs-ease-entry) both; animation-delay: var(--rs-stagger, 0ms); }
    @keyframes rs-row-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    /* A8 \u884C\u79FB\u51FA\u6DE1\u51FA\uFF1A\u9000\u573A\u4E2D\u7684\u884C\u4E0D\u518D\u63A5\u53D7\u6307\u9488\u4EA4\u4E92\uFF08\u5217\u8868\u884C\u53E6\u6709 aria-hidden \u9000\u51FA\u8BFB\u5C4F\uFF09 */
    .rs-leaving { animation: rs-row-out var(--rs-motion-base) var(--rs-ease-exit) both; pointer-events: none; }
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

    /* ===== \u5019\u9009\u4EBA\u8BE6\u60C5\u62BD\u5C49\uFF08\xA75.5\uFF1A\u4E09\u6BB5 = \u5934\u90E8/\u6EDA\u52A8\u6B63\u6587/\u5904\u7F6E\u6761\uFF0C\u5355\u680F\u4E0B\u662F\u552F\u4E00\u8BE6\u60C5\u8F7D\u4F53\uFF09 ===== */
    .rs-sheet-content { width: min(460px, calc(100% - 24px)); max-width: calc(100% - 24px); padding: 0; gap: 0; display: grid; grid-template-rows: minmax(0, 1fr); z-index: var(--rs-layer-sheet); }
    /* xs\uFF08<560px \u5BB9\u5668\uFF09\uFF1A\u62BD\u5C49\u6EE1\u5BBD\u63A5\u7BA1\uFF0C\u4E0D\u518D\u7559 24px \u7F1D */
    .rs-sheet-content.is-full { width: 100%; max-width: 100%; }
    .rs-sheet-body { min-height: 0; display: grid; }
    /* \u62BD\u5C49\u5934\u90E8\u53EF\u8BFB\u6027\uFF1ARadix \u9ED8\u8BA4\u628A SheetHeader \u6392\u6210\u5757\uFF0C\u8FD9\u91CC\u4EA4\u7ED9 DetailContent \u7684 .rs-detail-head \u627F\u62C5\uFF0C
       SheetHeader \u4EC5\u4FDD\u7559\u65E0\u969C\u788D\u8BED\u4E49\uFF08aria-labelledby\uFF09 */
    .rs-sheet-sr-head { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

    /* ===== \u6D6E\u5C42\u5C42\u7EA7\u5F52\u4F4D\uFF08\xA75.6\uFF09\uFF1ATailwind \u5DE5\u5177\u7C7B\u4E0E\u5BBF\u4E3B\u5C42\u4E92\u76F8\u8E29\uFF0C\u4E00\u5F8B\u56DE\u523B\u5EA6\u8868 =====
       \u540C\u7279\u5F02\u6027\u4E0B\u672C\u8868\u540E\u7F6E\u6CE8\u5165\u5FC5\u80DC z-50\uFF08R-P80 \u901A\u9053\u4E8B\u5B9E\uFF09\uFF0C\u4E25\u7981 !important\uFF08T13 \u626B\u63CF\u5668\u5408\u89C4\u8BA1\u6570\u4E0D\u8BA4\uFF09 */
    [data-slot="sheet-overlay"] { z-index: var(--rs-layer-sheet-overlay); backdrop-filter: blur(2px); }
    [data-slot="dialog-overlay"] { z-index: var(--rs-layer-sheet-overlay); backdrop-filter: blur(2px); }
    [data-slot="sheet-content"] { z-index: var(--rs-layer-sheet); }
    [data-slot="dialog-content"] { z-index: var(--rs-layer-dialog); }
    [data-slot="alert-dialog-overlay"] { z-index: var(--rs-layer-sheet-overlay); }
    [data-slot="alert-dialog-content"] { z-index: var(--rs-layer-dialog); }
    [data-slot="popover-content"], [data-slot="select-content"], [data-slot="dropdown-menu-content"], [data-slot="tooltip-content"] { z-index: var(--rs-layer-popper); }

    /* \u5904\u7F6E\u6309\u94AE/\u786E\u8BA4\u6846\u7EA2\u5F3A\u8C03\uFF08\u6DD8\u6C70\u8BED\u4E49\uFF0C\xA73.6\uFF09 */
    .rs-action-destructive { color: var(--rs-red); }
    .rs-action-destructive:hover { color: var(--rs-red); background: var(--rs-red-soft); }
    .rs-reject-confirm-action [data-slot="alert-dialog-action"], [data-slot="alert-dialog-action"].rs-reject-confirm-action { background-color: var(--rs-red); color: #fff; }

    /* \u964D\u7EA7\u7EAA\u5F8B\uFF08\u84DD\u56FE \xA77\uFF09\uFF1Areduced-motion \u5168\u91CF\u7981\u7528\uFF0Cloader \u4FDD\u7559\u4F46\u9759\u6B62 */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
    }
    /* <560px\uFF1A\u62BD\u53D6\u5B57\u6BB5\u5355\u5217\u3001\u5934\u90E8\u6807\u7B7E\u6536\u7EB3\uFF08\u7EDF\u8BA1\u6761/\u53CC\u680F\u65AD\u70B9\u5DF2\u968F T14 \u5355\u680F\u5316\u5220\u9664\uFF09 */
    @container (max-width: 559px) {
      .rs-fields { grid-template-columns: minmax(0, 1fr); }
      .rs-header-label { display: none; }
    }
    /* JS \u5C5E\u6027\u964D\u7EA7\u901A\u9053\uFF08ResizeObserver \u4E0D\u652F\u6301\u5BB9\u5668\u67E5\u8BE2\u7684\u73AF\u5883\uFF0C\u4E0E\u5BB9\u5668\u67E5\u8BE2\u540C\u6548\uFF09 */
    .rs-shell[data-rs-width="xs"] .rs-header-label { display: none; }
    .rs-shell[data-rs-width="xs"] .rs-fields { grid-template-columns: minmax(0, 1fr); }
`;
  function injectStyles() {
    if (document.getElementById("resume-screen-styles")) return;
    const style = document.createElement("style");
    style.id = "resume-screen-styles";
    style.textContent = RS_STYLES_CSS;
    document.head.appendChild(style);
  }

  // node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
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

  // node_modules/.pnpm/tailwind-merge@3.6.0/node_modules/tailwind-merge/dist/bundle-mjs.mjs
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
    return themeGetter;
  };
  var arbitraryValueRegex = /^\[(?:(\w[\w-]*):)?(.+)\]$/i;
  var arbitraryVariableRegex = /^\((?:(\w[\w-]*):)?(.+)\)$/i;
  var fractionRegex = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/;
  var tshirtUnitRegex = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/;
  var lengthUnitRegex = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/;
  var colorFunctionRegex = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/;
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
    const scaleSizingInline = () => [isFraction, "screen", "full", "dvw", "lvw", "svw", "min", "max", "fit", ...scaleUnambiguousSpacing()];
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
          columns: [isNumber, isArbitraryValue, isArbitraryVariable, themeContainer]
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
         * @see https://tailwindcss.com/docs/width
         */
        "inline-size": [{
          inline: ["auto", ...scaleSizingInline()]
        }],
        /**
         * Min-Inline Size
         * @see https://tailwindcss.com/docs/min-width
         */
        "min-inline-size": [{
          "min-inline": ["auto", ...scaleSizingInline()]
        }],
        /**
         * Max-Inline Size
         * @see https://tailwindcss.com/docs/max-width
         */
        "max-inline-size": [{
          "max-inline": ["none", ...scaleSizingInline()]
        }],
        /**
         * Block Size
         * @see https://tailwindcss.com/docs/height
         */
        "block-size": [{
          block: ["auto", ...scaleSizingBlock()]
        }],
        /**
         * Min-Block Size
         * @see https://tailwindcss.com/docs/min-height
         */
        "min-block-size": [{
          "min-block": ["auto", ...scaleSizingBlock()]
        }],
        /**
         * Max-Block Size
         * @see https://tailwindcss.com/docs/max-height
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
          "max-h": ["screen", "lh", ...scaleSizing()]
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
            conic: [isInteger, isArbitraryVariable, isArbitraryValue]
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
        "inset-x": ["right", "left"],
        "inset-y": ["top", "bottom"],
        flex: ["basis", "grow", "shrink"],
        gap: ["gap-x", "gap-y"],
        p: ["px", "py", "ps", "pe", "pbs", "pbe", "pt", "pr", "pb", "pl"],
        px: ["pr", "pl"],
        py: ["pt", "pb"],
        m: ["mx", "my", "ms", "me", "mbs", "mbe", "mt", "mr", "mb", "ml"],
        mx: ["mr", "ml"],
        my: ["mt", "mb"],
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
        "border-w-x": ["border-w-r", "border-w-l"],
        "border-w-y": ["border-w-t", "border-w-b"],
        "border-color": ["border-color-x", "border-color-y", "border-color-s", "border-color-e", "border-color-bs", "border-color-be", "border-color-t", "border-color-r", "border-color-b", "border-color-l"],
        "border-color-x": ["border-color-r", "border-color-l"],
        "border-color-y": ["border-color-t", "border-color-b"],
        translate: ["translate-x", "translate-y", "translate-none"],
        "translate-none": ["translate", "translate-x", "translate-y", "translate-z"],
        "scroll-m": ["scroll-mx", "scroll-my", "scroll-ms", "scroll-me", "scroll-mbs", "scroll-mbe", "scroll-mt", "scroll-mr", "scroll-mb", "scroll-ml"],
        "scroll-mx": ["scroll-mr", "scroll-ml"],
        "scroll-my": ["scroll-mt", "scroll-mb"],
        "scroll-p": ["scroll-px", "scroll-py", "scroll-ps", "scroll-pe", "scroll-pbs", "scroll-pbe", "scroll-pt", "scroll-pr", "scroll-pb", "scroll-pl"],
        "scroll-px": ["scroll-pr", "scroll-pl"],
        "scroll-py": ["scroll-pt", "scroll-pb"],
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

  // node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/mergeClasses.mjs
  var mergeClasses = (...classes) => classes.filter((className, index2, array) => {
    return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index2;
  }).join(" ").trim();

  // node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toKebabCase.mjs
  var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

  // node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toCamelCase.mjs
  var toCamelCase = (string) => string.replace(
    /^([A-Z])|[\s-_]+(\w)/g,
    (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase()
  );

  // node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/toPascalCase.mjs
  var toPascalCase = (string) => {
    const camelCase = toCamelCase(string);
    return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
  };

  // node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/defaultAttributes.mjs
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

  // node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/shared/src/utils/hasA11yProp.mjs
  var hasA11yProp = (props) => {
    for (const prop in props) {
      if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
        return true;
      }
    }
    return false;
  };

  // node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/context.mjs
  var LucideContext = createContext({});
  var useLucideContext = () => useContext(LucideContext);

  // node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/Icon.mjs
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

  // node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/createLucideIcon.mjs
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

  // node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/check.mjs
  var __iconNode = [["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }]];
  var Check = createLucideIcon("check", __iconNode);

  // node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/chevron-down.mjs
  var __iconNode2 = [["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }]];
  var ChevronDown = createLucideIcon("chevron-down", __iconNode2);

  // node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/chevron-up.mjs
  var __iconNode3 = [["path", { d: "m18 15-6-6-6 6", key: "153udz" }]];
  var ChevronUp = createLucideIcon("chevron-up", __iconNode3);

  // node_modules/.pnpm/lucide-react@1.24.0_react@18.3.1/node_modules/lucide-react/dist/esm/icons/x.mjs
  var __iconNode4 = [
    ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
    ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
  ];
  var X = createLucideIcon("x", __iconNode4);

  // community/apps/resume-screen/src/lib/remote-components/resume-screen/src/react-jsx-runtime-shim.ts
  var ReactGlobal2 = window.React;
  var Fragment2 = ReactGlobal2.Fragment;
  function jsx(type, props, key) {
    return ReactGlobal2.createElement(type, key === void 0 ? props : { ...props, key });
  }
  var jsxs = jsx;

  // community/apps/resume-screen/src/lib/remote-components/resume-screen/src/react-dom-shim.ts
  var ReactDOMGlobal2 = window.ReactDOM;
  var createPortal = ReactDOMGlobal2.createPortal;
  var flushSync = ReactDOMGlobal2.flushSync;
  var findDOMNode = ReactDOMGlobal2.findDOMNode;
  var hydrate = ReactDOMGlobal2.hydrate;
  var render = ReactDOMGlobal2.render;
  var unstable_batchedUpdates = ReactDOMGlobal2.unstable_batchedUpdates;
  var unmountComponentAtNode = ReactDOMGlobal2.unmountComponentAtNode;
  var version2 = ReactDOMGlobal2.version;

  // node_modules/.pnpm/@radix-ui+react-slot@1.3.0_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-slot/dist/index.mjs
  var dist_exports = {};
  __export(dist_exports, {
    Root: () => Slot,
    Slot: () => Slot,
    Slottable: () => Slottable,
    createSlot: () => createSlot,
    createSlottable: () => createSlottable
  });

  // node_modules/.pnpm/@radix-ui+react-compose-ref_1124f78b370d43bfeceaaa9b791be73d/node_modules/@radix-ui/react-compose-refs/dist/index.mjs
  function setRef(ref, value) {
    if (typeof ref === "function") {
      return ref(value);
    } else if (ref !== null && ref !== void 0) {
      ref.current = value;
    }
  }
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
  function useComposedRefs(...refs) {
    return useCallback(composeRefs(...refs), refs);
  }

  // node_modules/.pnpm/@radix-ui+react-slot@1.3.0_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-slot/dist/index.mjs
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
  var Slot = /* @__PURE__ */ createSlot("Slot");
  var SLOTTABLE_IDENTIFIER = /* @__PURE__ */ Symbol.for("radix.slottable");
  // @__NO_SIDE_EFFECTS__
  function createSlottable(ownerName) {
    const Slottable22 = (props) => "child" in props ? props.children(props.child) : props.children;
    Slottable22.displayName = `${ownerName}.Slottable`;
    Slottable22.__radixId = SLOTTABLE_IDENTIFIER;
    return Slottable22;
  }
  var Slottable = /* @__PURE__ */ createSlottable("Slottable");
  var getSlottableElementFromSlottable = (slottable, child) => {
    if ("child" in slottable.props) {
      const child2 = slottable.props.child;
      if (!isValidElement(child2)) return null;
      return cloneElement(child2, void 0, slottable.props.children(child2.props.children));
    }
    return isValidElement(child) ? child : null;
  };
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
  function isSlottable(child) {
    return isValidElement(child) && typeof child.type === "function" && "__radixId" in child.type && child.type.__radixId === SLOTTABLE_IDENTIFIER;
  }
  var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
  function isLazyComponent(element) {
    return element != null && typeof element === "object" && "$$typeof" in element && element.$$typeof === REACT_LAZY_TYPE && "_payload" in element && isPromiseLike(element._payload);
  }
  function isPromiseLike(value) {
    return typeof value === "object" && value !== null && "then" in value;
  }
  var createSlotError = (ownerName) => {
    return `${ownerName} failed to slot onto its children. Expected a single React element child or \`Slottable\`.`;
  };
  var createSlottableError = (ownerName) => {
    return `${ownerName} failed to slot onto its \`Slottable\`. Expected \`Slottable\` to receive a single React element child.`;
  };
  var use = react_shim_exports[" use ".trim().toString()];

  // node_modules/.pnpm/@radix-ui+react-primitive@2_4c60825657fad9e38f0a4d7b31c9e11d/node_modules/@radix-ui/react-primitive/dist/index.mjs
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
    const Slot5 = createSlot(`Primitive.${node}`);
    const Node2 = forwardRef((props, forwardedRef) => {
      const { asChild, ...primitiveProps } = props;
      const Comp = asChild ? Slot5 : node;
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

  // node_modules/.pnpm/@radix-ui+react-visually-hi_c850badfde3651ed5cb7d90f2934dc1f/node_modules/@radix-ui/react-visually-hidden/dist/index.mjs
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
  var NAME = "VisuallyHidden";
  var VisuallyHidden = forwardRef(
    (props, forwardedRef) => {
      return /* @__PURE__ */ jsx(
        Primitive.span,
        {
          ...props,
          ref: forwardedRef,
          style: { ...VISUALLY_HIDDEN_STYLES, ...props.style }
        }
      );
    }
  );
  VisuallyHidden.displayName = NAME;
  var Root = VisuallyHidden;

  // node_modules/.pnpm/@radix-ui+react-context@1.2_c68a3e9727ce2654dfdd7ac4b59b3999/node_modules/@radix-ui/react-context/dist/index.mjs
  function createContextScope(scopeName, createContextScopeDeps = []) {
    let defaultContexts = [];
    function createContext3(rootComponentName, defaultContext) {
      const BaseContext = createContext(defaultContext);
      BaseContext.displayName = rootComponentName + "Context";
      const index2 = defaultContexts.length;
      defaultContexts = [...defaultContexts, defaultContext];
      const Provider2 = (props) => {
        const { scope, children, ...context } = props;
        const Context = scope?.[scopeName]?.[index2] || BaseContext;
        const value = useMemo(() => context, Object.values(context));
        return /* @__PURE__ */ jsx(Context.Provider, { value, children });
      };
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
      return [Provider2, useContext2];
    }
    const createScope = () => {
      const scopeContexts = defaultContexts.map((defaultContext) => {
        return createContext(defaultContext);
      });
      return function useScope(scope) {
        const contexts = scope?.[scopeName] || scopeContexts;
        return useMemo(
          () => ({ [`__scope${scopeName}`]: { ...scope, [scopeName]: contexts } }),
          [scope, contexts]
        );
      };
    };
    createScope.scopeName = scopeName;
    return [createContext3, composeContextScopes(createScope, ...createContextScopeDeps)];
  }
  function composeContextScopes(...scopes) {
    const baseScope = scopes[0];
    if (scopes.length === 1) return baseScope;
    const createScope = () => {
      const scopeHooks = scopes.map((createScope2) => ({
        useScope: createScope2(),
        scopeName: createScope2.scopeName
      }));
      return function useComposedScopes(overrideScopes) {
        const nextScopes = scopeHooks.reduce((nextScopes2, { useScope, scopeName }) => {
          const scopeProps = useScope(overrideScopes);
          const currentScope = scopeProps[`__scope${scopeName}`];
          return { ...nextScopes2, ...currentScope };
        }, {});
        return useMemo(() => ({ [`__scope${baseScope.scopeName}`]: nextScopes }), [nextScopes]);
      };
    };
    createScope.scopeName = baseScope.scopeName;
    return createScope;
  }

  // node_modules/.pnpm/@radix-ui+react-collection@_48cd336a2ef85a82af4ed74226b41844/node_modules/@radix-ui/react-collection/dist/index.mjs
  function createCollection(name) {
    const PROVIDER_NAME3 = name + "CollectionProvider";
    const [createCollectionContext, createCollectionScope4] = createContextScope(PROVIDER_NAME3);
    const [CollectionProviderImpl, useCollectionContext] = createCollectionContext(
      PROVIDER_NAME3,
      { collectionRef: { current: null }, itemMap: /* @__PURE__ */ new Map() }
    );
    const CollectionProvider = (props) => {
      const { scope, children } = props;
      const ref = useRef(null);
      const itemMap = useRef(/* @__PURE__ */ new Map()).current;
      return /* @__PURE__ */ jsx(CollectionProviderImpl, { scope, itemMap, collectionRef: ref, children });
    };
    CollectionProvider.displayName = PROVIDER_NAME3;
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
    return [
      { Provider: CollectionProvider, Slot: CollectionSlot, ItemSlot: CollectionItemSlot },
      useCollection4,
      createCollectionScope4
    ];
  }

  // node_modules/.pnpm/@radix-ui+primitive@1.1.5/node_modules/@radix-ui/primitive/dist/index.mjs
  var canUseDOM = !!(typeof window !== "undefined" && window.document && window.document.createElement);
  function composeEventHandlers(originalEventHandler, ourEventHandler, { checkForDefaultPrevented = true } = {}) {
    return function handleEvent(event) {
      originalEventHandler?.(event);
      if (checkForDefaultPrevented === false || !event || !event.defaultPrevented) {
        return ourEventHandler?.(event);
      }
    };
  }

  // node_modules/.pnpm/@radix-ui+react-use-layout-_ad41f999ca2019252b887df955038ce1/node_modules/@radix-ui/react-use-layout-effect/dist/index.mjs
  var useLayoutEffect2 = globalThis?.document ? useLayoutEffect : () => {
  };

  // node_modules/.pnpm/@radix-ui+react-use-control_e3b0d353471f209a120bf58c8d35c552/node_modules/@radix-ui/react-use-controllable-state/dist/index.mjs
  var useInsertionEffect2 = react_shim_exports[" useInsertionEffect ".trim().toString()] || useLayoutEffect2;
  function useControllableState({
    prop,
    defaultProp,
    onChange = () => {
    },
    caller
  }) {
    const [uncontrolledProp, setUncontrolledProp, onChangeRef] = useUncontrolledState({
      defaultProp,
      onChange
    });
    const isControlled = prop !== void 0;
    const value = isControlled ? prop : uncontrolledProp;
    if (true) {
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
  function isFunction(value) {
    return typeof value === "function";
  }

  // node_modules/.pnpm/@radix-ui+react-collapsible_a9f09893a8761cb960ef9cb5a7a4a433/node_modules/@radix-ui/react-collapsible/dist/index.mjs
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

  // node_modules/.pnpm/@radix-ui+react-presence@1._d6843a2439efb57a10ac44d5b494738a/node_modules/@radix-ui/react-presence/dist/index.mjs
  function useStateMachine(initialState, machine) {
    return useReducer((state, event) => {
      const nextState = machine[state][event];
      return nextState ?? state;
    }, initialState);
  }
  var Presence = (props) => {
    const { present, children } = props;
    const presence = usePresence(present);
    const child = typeof children === "function" ? children({ present: presence.isPresent }) : Children.only(children);
    const ref = useStableComposedRefs(presence.ref, getElementRef2(child));
    const forceMount = typeof children === "function";
    return forceMount || presence.isPresent ? cloneElement(child, { ref }) : null;
  };
  Presence.displayName = "Presence";
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
        const handleAnimationEnd = (event) => {
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
        };
        const handleAnimationStart = (event) => {
          if (event.target === node) {
            prevAnimationNameRef.current = getAnimationName(stylesRef.current);
          }
        };
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
  function setRef2(ref, value) {
    if (typeof ref === "function") {
      return ref(value);
    } else if (ref !== null && ref !== void 0) {
      ref.current = value;
    }
  }
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
  function getAnimationName(styles) {
    return styles?.animationName || "none";
  }
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

  // node_modules/.pnpm/@radix-ui+react-id@1.1.2_@types+react@18.3.31_react@18.3.1/node_modules/@radix-ui/react-id/dist/index.mjs
  var useReactId = react_shim_exports[" useId ".trim().toString()] || (() => void 0);
  var count = 0;
  function useId2(deterministicId) {
    const [id, setId] = useState(useReactId());
    useLayoutEffect2(() => {
      if (!deterministicId) setId((reactId) => reactId ?? String(count++));
    }, [deterministicId]);
    return deterministicId || (id ? `radix-${id}` : "");
  }

  // node_modules/.pnpm/@radix-ui+react-collapsible_a9f09893a8761cb960ef9cb5a7a4a433/node_modules/@radix-ui/react-collapsible/dist/index.mjs
  var COLLAPSIBLE_NAME = "Collapsible";
  var [createCollapsibleContext, createCollapsibleScope] = createContextScope(COLLAPSIBLE_NAME);
  var [CollapsibleProvider, useCollapsibleContext] = createCollapsibleContext(COLLAPSIBLE_NAME);
  var Collapsible = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  Collapsible.displayName = COLLAPSIBLE_NAME;
  var TRIGGER_NAME = "CollapsibleTrigger";
  var CollapsibleTrigger = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  CollapsibleTrigger.displayName = TRIGGER_NAME;
  var CONTENT_NAME = "CollapsibleContent";
  var CollapsibleContent = forwardRef(
    (props, forwardedRef) => {
      const { forceMount, ...contentProps } = props;
      const context = useCollapsibleContext(CONTENT_NAME, props.__scopeCollapsible);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: ({ present }) => /* @__PURE__ */ jsx(CollapsibleContentImpl, { ...contentProps, ref: forwardedRef, present }) });
    }
  );
  CollapsibleContent.displayName = CONTENT_NAME;
  var CollapsibleContentImpl = forwardRef((props, forwardedRef) => {
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
  });
  function getState(open) {
    return open ? "open" : "closed";
  }
  var Root2 = Collapsible;
  var Trigger = CollapsibleTrigger;
  var Content = CollapsibleContent;

  // node_modules/.pnpm/@radix-ui+react-direction@1_2157d1ab8e201288009ff536bb11c468/node_modules/@radix-ui/react-direction/dist/index.mjs
  var DirectionContext = createContext(void 0);
  function useDirection(localDir) {
    const globalDir = useContext(DirectionContext);
    return localDir || globalDir || "ltr";
  }

  // node_modules/.pnpm/@radix-ui+react-alert-dialo_e6e41d2a4af4ab50646683a57177c7f1/node_modules/@radix-ui/react-alert-dialog/dist/index.mjs
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
    Portal: () => Portal2,
    Root: () => Root22,
    Title: () => Title2,
    Trigger: () => Trigger2,
    createAlertDialogScope: () => createAlertDialogScope
  });

  // node_modules/.pnpm/@radix-ui+react-dialog@1.1._19e637a1eb439fb7ac9fbd37f3b253ea/node_modules/@radix-ui/react-dialog/dist/index.mjs
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

  // node_modules/.pnpm/@radix-ui+react-use-callbac_5106d65c013fadfe178f87486239c7af/node_modules/@radix-ui/react-use-callback-ref/dist/index.mjs
  function useCallbackRef(callback) {
    const callbackRef = useRef(callback);
    useEffect(() => {
      callbackRef.current = callback;
    });
    return useMemo(() => ((...args) => callbackRef.current?.(...args)), []);
  }

  // node_modules/.pnpm/@radix-ui+react-dismissable_52f617dd5f45a8e179b652efa1a9fb2f/node_modules/@radix-ui/react-dismissable-layer/dist/index.mjs
  var DISMISSABLE_LAYER_NAME = "DismissableLayer";
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
  var DismissableLayer = forwardRef(
    (props, forwardedRef) => {
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
        const handleUpdate = () => force({});
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
    }
  );
  DismissableLayer.displayName = DISMISSABLE_LAYER_NAME;
  var BRANCH_NAME = "DismissableLayerBranch";
  var DismissableLayerBranch = forwardRef((props, forwardedRef) => {
    const context = useContext(DismissableLayerContext);
    const ref = useRef(null);
    const composedRefs = useComposedRefs(forwardedRef, ref);
    useEffect(() => {
      const node = ref.current;
      if (node) {
        context.branches.add(node);
        return () => {
          context.branches.delete(node);
        };
      }
    }, [context.branches]);
    return /* @__PURE__ */ jsx(Primitive.div, { ...props, ref: composedRefs });
  });
  DismissableLayerBranch.displayName = BRANCH_NAME;
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
  var IS_TRUE = () => true;
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
      function isOutsideInteractionIntercepted() {
        return Array.from(interceptedOutsideInteractionEventsRef.current.values()).some(Boolean);
      }
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
      function handleInteractionBubble(event) {
        if (isPointerDownOutsideRef.current) {
          interceptedOutsideInteractionEventsRef.current.set(event.type, false);
        }
      }
      const handlePointerDown = (event) => {
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
      };
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
      onPointerDownCapture: () => isPointerInsideReactTreeRef.current = true
    };
  }
  function useFocusOutside(onFocusOutside, ownerDocument = globalThis?.document) {
    const handleFocusOutside = useCallbackRef(onFocusOutside);
    const isFocusInsideReactTreeRef = useRef(false);
    useEffect(() => {
      const handleFocus = (event) => {
        if (event.target && !isFocusInsideReactTreeRef.current) {
          const eventDetail = { originalEvent: event };
          handleAndDispatchCustomEvent(FOCUS_OUTSIDE, handleFocusOutside, eventDetail, {
            discrete: false
          });
        }
      };
      ownerDocument.addEventListener("focusin", handleFocus);
      return () => ownerDocument.removeEventListener("focusin", handleFocus);
    }, [ownerDocument, handleFocusOutside]);
    return {
      onFocusCapture: () => isFocusInsideReactTreeRef.current = true,
      onBlurCapture: () => isFocusInsideReactTreeRef.current = false
    };
  }
  function dispatchUpdate() {
    const event = new CustomEvent(CONTEXT_UPDATE);
    document.dispatchEvent(event);
  }
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

  // node_modules/.pnpm/@radix-ui+react-focus-scope_ea0a3c5eb186fbaed09fdcf83b961bfb/node_modules/@radix-ui/react-focus-scope/dist/index.mjs
  var AUTOFOCUS_ON_MOUNT = "focusScope.autoFocusOnMount";
  var AUTOFOCUS_ON_UNMOUNT = "focusScope.autoFocusOnUnmount";
  var EVENT_OPTIONS = { bubbles: false, cancelable: true };
  var FOCUS_SCOPE_NAME = "FocusScope";
  var FocusScope = forwardRef((props, forwardedRef) => {
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
  });
  FocusScope.displayName = FOCUS_SCOPE_NAME;
  function focusFirst(candidates, { select = false } = {}) {
    const previouslyFocusedElement = document.activeElement;
    for (const candidate of candidates) {
      focus(candidate, { select });
      if (document.activeElement !== previouslyFocusedElement) return;
    }
  }
  function getTabbableEdges(container) {
    const candidates = getTabbableCandidates(container);
    const first = findVisible(candidates, container);
    const last = findVisible(candidates.reverse(), container);
    return [first, last];
  }
  function getTabbableCandidates(container) {
    const nodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        const isHiddenInput = node.tagName === "INPUT" && node.type === "hidden";
        if (node.disabled || node.hidden || isHiddenInput) return NodeFilter.FILTER_SKIP;
        return node.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }
  function findVisible(elements, container) {
    const canUseCheckVisibility = typeof container.checkVisibility === "function" && container.checkVisibility({ checkVisibilityCSS: true });
    for (const element of elements) {
      const hidden = canUseCheckVisibility ? !element.checkVisibility({ checkVisibilityCSS: true }) : isHidden(element, { upTo: container });
      if (!hidden) {
        return element;
      }
    }
  }
  function isHidden(node, { upTo }) {
    if (getComputedStyle(node).visibility === "hidden") return true;
    while (node) {
      if (upTo !== void 0 && node === upTo) return false;
      if (getComputedStyle(node).display === "none") return true;
      node = node.parentElement;
    }
    return false;
  }
  function isSelectableInput(element) {
    return element instanceof HTMLInputElement && "select" in element;
  }
  function focus(element, { select = false } = {}) {
    if (element && element.focus) {
      const previouslyFocusedElement = document.activeElement;
      element.focus({ preventScroll: true });
      if (element !== previouslyFocusedElement && isSelectableInput(element) && select)
        element.select();
    }
  }
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
  function arrayRemove(array, item) {
    const updatedArray = [...array];
    const index2 = updatedArray.indexOf(item);
    if (index2 !== -1) {
      updatedArray.splice(index2, 1);
    }
    return updatedArray;
  }
  function removeLinks(items) {
    return items.filter((item) => item.tagName !== "A");
  }

  // node_modules/.pnpm/@radix-ui+react-portal@1.1._dc7a74c2058d5b681fc692ae2e26f5cd/node_modules/@radix-ui/react-portal/dist/index.mjs
  var PORTAL_NAME = "Portal";
  var Portal = forwardRef((props, forwardedRef) => {
    const { container: containerProp, ...portalProps } = props;
    const [mounted, setMounted] = useState(false);
    useLayoutEffect2(() => setMounted(true), []);
    const container = containerProp || mounted && globalThis?.document?.body;
    return container ? createPortal(/* @__PURE__ */ jsx(Primitive.div, { ...portalProps, ref: forwardedRef }), container) : null;
  });
  Portal.displayName = PORTAL_NAME;

  // node_modules/.pnpm/@radix-ui+react-focus-guard_6b3d65e71789b2986a17d5efdb8859bf/node_modules/@radix-ui/react-focus-guards/dist/index.mjs
  var count2 = 0;
  var guards = null;
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

  // node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs
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

  // node_modules/.pnpm/react-remove-scroll-bar@2.3_24279af7608b4a4e9fe00320b3c0cae7/node_modules/react-remove-scroll-bar/dist/es2015/constants.js
  var zeroRightClassName = "right-scroll-bar-position";
  var fullWidthClassName = "width-before-scroll-bar";
  var noScrollbarsClassName = "with-scroll-bars-hidden";
  var removedBarSizeVariable = "--removed-body-scroll-bar-size";

  // node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/use-callback-ref/dist/es2015/assignRef.js
  function assignRef(ref, value) {
    if (typeof ref === "function") {
      ref(value);
    } else if (ref) {
      ref.current = value;
    }
    return ref;
  }

  // node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/use-callback-ref/dist/es2015/useRef.js
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

  // node_modules/.pnpm/use-callback-ref@1.3.3_@types+react@18.3.31_react@18.3.1/node_modules/use-callback-ref/dist/es2015/useMergeRef.js
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

  // node_modules/.pnpm/use-sidecar@1.1.3_@types+react@18.3.31_react@18.3.1/node_modules/use-sidecar/dist/es2015/medium.js
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

  // node_modules/.pnpm/use-sidecar@1.1.3_@types+react@18.3.31_react@18.3.1/node_modules/use-sidecar/dist/es2015/exports.js
  var SideCar = function(_a) {
    var sideCar = _a.sideCar, rest = __rest(_a, ["sideCar"]);
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

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/medium.js
  var effectCar = createSidecarMedium();

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/UI.js
  var nothing = function() {
    return;
  };
  var RemoveScroll = forwardRef(function(props, parentRef) {
    var ref = useRef(null);
    var _a = useState({
      onScrollCapture: nothing,
      onWheelCapture: nothing,
      onTouchMoveCapture: nothing
    }), callbacks = _a[0], setCallbacks = _a[1];
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

  // node_modules/.pnpm/get-nonce@1.0.1/node_modules/get-nonce/dist/es2015/index.js
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

  // node_modules/.pnpm/react-style-singleton@2.2.3_64be49a27fe392764e1764f59e110241/node_modules/react-style-singleton/dist/es2015/singleton.js
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

  // node_modules/.pnpm/react-style-singleton@2.2.3_64be49a27fe392764e1764f59e110241/node_modules/react-style-singleton/dist/es2015/hook.js
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

  // node_modules/.pnpm/react-style-singleton@2.2.3_64be49a27fe392764e1764f59e110241/node_modules/react-style-singleton/dist/es2015/component.js
  var styleSingleton = function() {
    var useStyle = styleHookSingleton();
    var Sheet = function(_a) {
      var styles = _a.styles, dynamic = _a.dynamic;
      useStyle(styles, dynamic);
      return null;
    };
    return Sheet;
  };

  // node_modules/.pnpm/react-remove-scroll-bar@2.3_24279af7608b4a4e9fe00320b3c0cae7/node_modules/react-remove-scroll-bar/dist/es2015/utils.js
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

  // node_modules/.pnpm/react-remove-scroll-bar@2.3_24279af7608b4a4e9fe00320b3c0cae7/node_modules/react-remove-scroll-bar/dist/es2015/component.js
  var Style = styleSingleton();
  var lockAttribute = "data-scroll-locked";
  var getStyles = function(_a, allowRelative, gapMode, important) {
    var left = _a.left, top = _a.top, right = _a.right, gap = _a.gap;
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
  var RemoveScrollBar = function(_a) {
    var noRelative = _a.noRelative, noImportant = _a.noImportant, _b = _a.gapMode, gapMode = _b === void 0 ? "margin" : _b;
    useLockAttribute();
    var gap = useMemo(function() {
      return getGapWidth(gapMode);
    }, [gapMode]);
    return createElement(Style, { styles: getStyles(gap, !noRelative, gapMode, !noImportant ? "!important" : "") });
  };

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/aggresiveCapture.js
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

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/handleScroll.js
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
        var _a = getScrollVariables(axis, current), scrollHeight = _a[1], clientHeight = _a[2];
        if (scrollHeight > clientHeight) {
          return true;
        }
      }
      current = current.parentNode;
    } while (current && current !== ownerDocument.body);
    return false;
  };
  var getVScrollVariables = function(_a) {
    var scrollTop = _a.scrollTop, scrollHeight = _a.scrollHeight, clientHeight = _a.clientHeight;
    return [
      scrollTop,
      scrollHeight,
      clientHeight
    ];
  };
  var getHScrollVariables = function(_a) {
    var scrollLeft = _a.scrollLeft, scrollWidth = _a.scrollWidth, clientWidth = _a.clientWidth;
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
      var _a = getScrollVariables(axis, target), position = _a[0], scroll_1 = _a[1], capacity = _a[2];
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

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/SideEffect.js
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

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/sidecar.js
  var sidecar_default = exportSidecar(effectCar, RemoveScrollSideCar);

  // node_modules/.pnpm/react-remove-scroll@2.7.2_@types+react@18.3.31_react@18.3.1/node_modules/react-remove-scroll/dist/es2015/Combination.js
  var ReactRemoveScroll = forwardRef(function(props, ref) {
    return createElement(RemoveScroll, __assign({}, props, { ref, sideCar: sidecar_default }));
  });
  ReactRemoveScroll.classNames = RemoveScroll.classNames;
  var Combination_default = ReactRemoveScroll;

  // node_modules/.pnpm/aria-hidden@1.2.6/node_modules/aria-hidden/dist/es2015/index.js
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

  // node_modules/.pnpm/@radix-ui+react-dialog@1.1._19e637a1eb439fb7ac9fbd37f3b253ea/node_modules/@radix-ui/react-dialog/dist/index.mjs
  var DIALOG_NAME = "Dialog";
  var [createDialogContext, createDialogScope] = createContextScope(DIALOG_NAME);
  var [DialogProvider, useDialogContext] = createDialogContext(DIALOG_NAME);
  var Dialog = (props) => {
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
    return /* @__PURE__ */ jsx(
      DialogProvider,
      {
        scope: __scopeDialog,
        triggerRef,
        contentRef,
        contentId: useId2(),
        titleId: useId2(),
        descriptionId: useId2(),
        open,
        onOpenChange: setOpen,
        onOpenToggle: useCallback(() => setOpen((prevOpen) => !prevOpen), [setOpen]),
        modal,
        children
      }
    );
  };
  Dialog.displayName = DIALOG_NAME;
  var TRIGGER_NAME2 = "DialogTrigger";
  var DialogTrigger = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  DialogTrigger.displayName = TRIGGER_NAME2;
  var PORTAL_NAME2 = "DialogPortal";
  var [PortalProvider, usePortalContext] = createDialogContext(PORTAL_NAME2, {
    forceMount: void 0
  });
  var DialogPortal = (props) => {
    const { __scopeDialog, forceMount, children, container } = props;
    const context = useDialogContext(PORTAL_NAME2, __scopeDialog);
    return /* @__PURE__ */ jsx(PortalProvider, { scope: __scopeDialog, forceMount, children: Children.map(children, (child) => /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Portal, { asChild: true, container, children: child }) })) });
  };
  DialogPortal.displayName = PORTAL_NAME2;
  var OVERLAY_NAME = "DialogOverlay";
  var DialogOverlay = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext(OVERLAY_NAME, props.__scopeDialog);
      const { forceMount = portalContext.forceMount, ...overlayProps } = props;
      const context = useDialogContext(OVERLAY_NAME, props.__scopeDialog);
      return context.modal ? /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(DialogOverlayImpl, { ...overlayProps, ref: forwardedRef }) }) : null;
    }
  );
  DialogOverlay.displayName = OVERLAY_NAME;
  var Slot2 = createSlot("DialogOverlay.RemoveScroll");
  var DialogOverlayImpl = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  var CONTENT_NAME2 = "DialogContent";
  var DialogContent = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext(CONTENT_NAME2, props.__scopeDialog);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = useDialogContext(CONTENT_NAME2, props.__scopeDialog);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: context.modal ? /* @__PURE__ */ jsx(DialogContentModal, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(DialogContentNonModal, { ...contentProps, ref: forwardedRef }) });
    }
  );
  DialogContent.displayName = CONTENT_NAME2;
  var DialogContentModal = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  var DialogContentNonModal = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  var DialogContentImpl = forwardRef(
    (props, forwardedRef) => {
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
              "aria-describedby": context.descriptionId,
              "aria-labelledby": context.titleId,
              "data-state": getState2(context.open),
              ...contentProps,
              ref: forwardedRef,
              deferPointerDownOutside: true,
              onDismiss: () => context.onOpenChange(false)
            }
          )
        }
      ) });
    }
  );
  var TITLE_NAME = "DialogTitle";
  var DialogTitle = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...titleProps } = props;
      const context = useDialogContext(TITLE_NAME, __scopeDialog);
      return /* @__PURE__ */ jsx(Primitive.h2, { id: context.titleId, ...titleProps, ref: forwardedRef });
    }
  );
  DialogTitle.displayName = TITLE_NAME;
  var DESCRIPTION_NAME = "DialogDescription";
  var DialogDescription = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDialog, ...descriptionProps } = props;
      const context = useDialogContext(DESCRIPTION_NAME, __scopeDialog);
      return /* @__PURE__ */ jsx(Primitive.p, { id: context.descriptionId, ...descriptionProps, ref: forwardedRef });
    }
  );
  DialogDescription.displayName = DESCRIPTION_NAME;
  var CLOSE_NAME = "DialogClose";
  var DialogClose = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  DialogClose.displayName = CLOSE_NAME;
  var WarningProvider = (props) => {
    return props.children;
  };
  function getState2(open) {
    return open ? "open" : "closed";
  }

  // node_modules/.pnpm/@radix-ui+react-alert-dialo_e6e41d2a4af4ab50646683a57177c7f1/node_modules/@radix-ui/react-alert-dialog/dist/index.mjs
  var ROOT_NAME = "AlertDialog";
  var [createAlertDialogContext, createAlertDialogScope] = createContextScope(ROOT_NAME, [
    createDialogScope
  ]);
  var useDialogScope = createDialogScope();
  var AlertDialog = (props) => {
    const { __scopeAlertDialog, ...alertDialogProps } = props;
    const dialogScope = useDialogScope(__scopeAlertDialog);
    return /* @__PURE__ */ jsx(Dialog, { ...dialogScope, ...alertDialogProps, modal: true });
  };
  AlertDialog.displayName = ROOT_NAME;
  var TRIGGER_NAME3 = "AlertDialogTrigger";
  var AlertDialogTrigger = forwardRef(
    (props, forwardedRef) => {
      const { __scopeAlertDialog, ...triggerProps } = props;
      const dialogScope = useDialogScope(__scopeAlertDialog);
      return /* @__PURE__ */ jsx(DialogTrigger, { ...dialogScope, ...triggerProps, ref: forwardedRef });
    }
  );
  AlertDialogTrigger.displayName = TRIGGER_NAME3;
  var PORTAL_NAME3 = "AlertDialogPortal";
  var AlertDialogPortal = (props) => {
    const { __scopeAlertDialog, ...portalProps } = props;
    const dialogScope = useDialogScope(__scopeAlertDialog);
    return /* @__PURE__ */ jsx(DialogPortal, { ...dialogScope, ...portalProps });
  };
  AlertDialogPortal.displayName = PORTAL_NAME3;
  var OVERLAY_NAME2 = "AlertDialogOverlay";
  var AlertDialogOverlay = forwardRef(
    (props, forwardedRef) => {
      const { __scopeAlertDialog, ...overlayProps } = props;
      const dialogScope = useDialogScope(__scopeAlertDialog);
      return /* @__PURE__ */ jsx(DialogOverlay, { ...dialogScope, ...overlayProps, ref: forwardedRef });
    }
  );
  AlertDialogOverlay.displayName = OVERLAY_NAME2;
  var CONTENT_NAME3 = "AlertDialogContent";
  var [AlertDialogContentProvider, useAlertDialogContentContext] = createAlertDialogContext(CONTENT_NAME3);
  var AlertDialogContent = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  AlertDialogContent.displayName = CONTENT_NAME3;
  var TITLE_NAME2 = "AlertDialogTitle";
  var AlertDialogTitle = forwardRef(
    (props, forwardedRef) => {
      const { __scopeAlertDialog, ...titleProps } = props;
      const dialogScope = useDialogScope(__scopeAlertDialog);
      return /* @__PURE__ */ jsx(DialogTitle, { ...dialogScope, ...titleProps, ref: forwardedRef });
    }
  );
  AlertDialogTitle.displayName = TITLE_NAME2;
  var DESCRIPTION_NAME2 = "AlertDialogDescription";
  var AlertDialogDescription = forwardRef((props, forwardedRef) => {
    const { __scopeAlertDialog, ...descriptionProps } = props;
    const dialogScope = useDialogScope(__scopeAlertDialog);
    return /* @__PURE__ */ jsx(DialogDescription, { ...dialogScope, ...descriptionProps, ref: forwardedRef });
  });
  AlertDialogDescription.displayName = DESCRIPTION_NAME2;
  var ACTION_NAME = "AlertDialogAction";
  var AlertDialogAction = forwardRef(
    (props, forwardedRef) => {
      const { __scopeAlertDialog, ...actionProps } = props;
      const dialogScope = useDialogScope(__scopeAlertDialog);
      return /* @__PURE__ */ jsx(DialogClose, { ...dialogScope, ...actionProps, ref: forwardedRef });
    }
  );
  AlertDialogAction.displayName = ACTION_NAME;
  var CANCEL_NAME = "AlertDialogCancel";
  var AlertDialogCancel = forwardRef(
    (props, forwardedRef) => {
      const { __scopeAlertDialog, ...cancelProps } = props;
      const { cancelRef } = useAlertDialogContentContext(CANCEL_NAME, __scopeAlertDialog);
      const dialogScope = useDialogScope(__scopeAlertDialog);
      const ref = useComposedRefs(forwardedRef, cancelRef);
      return /* @__PURE__ */ jsx(DialogClose, { ...dialogScope, ...cancelProps, ref });
    }
  );
  AlertDialogCancel.displayName = CANCEL_NAME;
  var Root22 = AlertDialog;
  var Trigger2 = AlertDialogTrigger;
  var Portal2 = AlertDialogPortal;
  var Overlay2 = AlertDialogOverlay;
  var Content2 = AlertDialogContent;
  var Action = AlertDialogAction;
  var Cancel = AlertDialogCancel;
  var Title2 = AlertDialogTitle;
  var Description2 = AlertDialogDescription;

  // node_modules/.pnpm/@radix-ui+react-use-previou_58b78c95af3b98dc4c1bc8bce73c779d/node_modules/@radix-ui/react-use-previous/dist/index.mjs
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

  // node_modules/.pnpm/@radix-ui+react-use-size@1._4b75a7cfb879b922004e7a6caa492077/node_modules/@radix-ui/react-use-size/dist/index.mjs
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

  // node_modules/.pnpm/@floating-ui+utils@0.2.11/node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs
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
    return {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      ...padding
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

  // node_modules/.pnpm/@floating-ui+core@1.7.5/node_modules/@floating-ui/core/dist/floating-ui.core.mjs
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
    switch (getAlignment(placement)) {
      case "start":
        coords[alignmentAxis] -= commonAlign * (rtl && isVertical ? -1 : 1);
        break;
      case "end":
        coords[alignmentAxis] += commonAlign * (rtl && isVertical ? -1 : 1);
        break;
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
    const offsetScale = await (platform2.isElement == null ? void 0 : platform2.isElement(offsetParent)) ? await (platform2.getScale == null ? void 0 : platform2.getScale(offsetParent)) || {
      x: 1,
      y: 1
    } : {
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
        fn
      } = currentMiddleware;
      const {
        x: nextX,
        y: nextY,
        data,
        reset
      } = await fn({
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
      const min$1 = minPadding;
      const max2 = clientSize - arrowDimensions[length] - maxPadding;
      const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
      const offset4 = clamp(min$1, center, max2);
      const shouldAddOffset = !middlewareData.arrow && getAlignment(placement) != null && center !== offset4 && rects.reference[length] / 2 - (center < min$1 ? minPadding : maxPadding) - arrowDimensions[length] / 2 < 0;
      const alignmentOffset = shouldAddOffset ? center < min$1 ? center - min$1 : center - max2 : 0;
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
        const crossAxis = getSideAxis(getSide(placement));
        const mainAxis = getOppositeAxis(crossAxis);
        let mainAxisCoord = coords[mainAxis];
        let crossAxisCoord = coords[crossAxis];
        if (checkMainAxis) {
          const minSide = mainAxis === "y" ? "top" : "left";
          const maxSide = mainAxis === "y" ? "bottom" : "right";
          const min2 = mainAxisCoord + overflow[minSide];
          const max2 = mainAxisCoord - overflow[maxSide];
          mainAxisCoord = clamp(min2, mainAxisCoord, max2);
        }
        if (checkCrossAxis) {
          const minSide = crossAxis === "y" ? "top" : "left";
          const maxSide = crossAxis === "y" ? "bottom" : "right";
          const min2 = crossAxisCoord + overflow[minSide];
          const max2 = crossAxisCoord - overflow[maxSide];
          crossAxisCoord = clamp(min2, crossAxisCoord, max2);
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
          mainAxis: 0,
          crossAxis: 0,
          ...rawOffset
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
        var _state$middlewareData, _state$middlewareData2;
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
        const noShift = !state.middlewareData.shift;
        let availableHeight = overflowAvailableHeight;
        let availableWidth = overflowAvailableWidth;
        if ((_state$middlewareData = state.middlewareData.shift) != null && _state$middlewareData.enabled.x) {
          availableWidth = maximumClippingWidth;
        }
        if ((_state$middlewareData2 = state.middlewareData.shift) != null && _state$middlewareData2.enabled.y) {
          availableHeight = maximumClippingHeight;
        }
        if (noShift && !alignment) {
          const xMin = max(overflow.left, 0);
          const xMax = max(overflow.right, 0);
          const yMin = max(overflow.top, 0);
          const yMax = max(overflow.bottom, 0);
          if (isYAxis) {
            availableWidth = width - 2 * (xMin !== 0 || xMax !== 0 ? xMin + xMax : max(overflow.left, overflow.right));
          } else {
            availableHeight = height - 2 * (yMin !== 0 || yMax !== 0 ? yMin + yMax : max(overflow.top, overflow.bottom));
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

  // node_modules/.pnpm/@floating-ui+utils@0.2.11/node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
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
      return node.ownerDocument ? node.ownerDocument.body : node.body;
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

  // node_modules/.pnpm/@floating-ui+dom@1.7.6/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
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
    if (!floatingOffsetParent || isFixed && floatingOffsetParent !== getWindow(element)) {
      return false;
    }
    return isFixed;
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
    if (domElement) {
      const win = getWindow(domElement);
      const offsetWin = offsetParent && isElement(offsetParent) ? getWindow(offsetParent) : offsetParent;
      let currentWin = win;
      let currentIFrame = getFrameElement(currentWin);
      while (currentIFrame && offsetParent && offsetWin !== currentWin) {
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
    if (isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed) {
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
    return Array.from(element.getClientRects());
  }
  function getDocumentRect(element) {
    const html = getDocumentElement(element);
    const scroll = getNodeScroll(element);
    const body = element.ownerDocument.body;
    const width = max(html.scrollWidth, html.clientWidth, body.scrollWidth, body.clientWidth);
    const height = max(html.scrollHeight, html.clientHeight, body.scrollHeight, body.clientHeight);
    let x = -scroll.scrollLeft + getWindowScrollBarX(element);
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
  function getViewportRect(element, strategy) {
    const win = getWindow(element);
    const html = getDocumentElement(element);
    const visualViewport = win.visualViewport;
    let width = html.clientWidth;
    let height = html.clientHeight;
    let x = 0;
    let y = 0;
    if (visualViewport) {
      width = visualViewport.width;
      height = visualViewport.height;
      const visualViewportBased = isWebKit();
      if (!visualViewportBased || visualViewportBased && strategy === "fixed") {
        x = visualViewport.offsetLeft;
        y = visualViewport.offsetTop;
      }
    }
    const windowScrollbarX = getWindowScrollBarX(html);
    if (windowScrollbarX <= 0) {
      const doc = html.ownerDocument;
      const body = doc.body;
      const bodyStyles = getComputedStyle(body);
      const bodyMarginInline = doc.compatMode === "CSS1Compat" ? parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight) || 0 : 0;
      const clippingStableScrollbarWidth = Math.abs(html.clientWidth - body.clientWidth - bodyMarginInline);
      if (clippingStableScrollbarWidth <= SCROLLBAR_MAX) {
        width -= clippingStableScrollbarWidth;
      }
    } else if (windowScrollbarX <= SCROLLBAR_MAX) {
      width += windowScrollbarX;
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
    const scale = isHTMLElement(element) ? getScale(element) : createCoords(1);
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
    if (clippingAncestor === "viewport") {
      rect = getViewportRect(element, strategy);
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
  function hasFixedPositionAncestor(element, stopNode) {
    const parentNode = getParentNode(element);
    if (parentNode === stopNode || !isElement(parentNode) || isLastTraversableNode(parentNode)) {
      return false;
    }
    return getComputedStyle2(parentNode).position === "fixed" || hasFixedPositionAncestor(parentNode, stopNode);
  }
  function getClippingElementAncestors(element, cache) {
    const cachedResult = cache.get(element);
    if (cachedResult) {
      return cachedResult;
    }
    let result = getOverflowAncestors(element, [], false).filter((el) => isElement(el) && getNodeName(el) !== "body");
    let currentContainingBlockComputedStyle = null;
    const elementIsFixed = getComputedStyle2(element).position === "fixed";
    let currentNode = elementIsFixed ? getParentNode(element) : element;
    while (isElement(currentNode) && !isLastTraversableNode(currentNode)) {
      const computedStyle = getComputedStyle2(currentNode);
      const currentNodeIsContaining = isContainingBlock(currentNode);
      if (!currentNodeIsContaining && computedStyle.position === "fixed") {
        currentContainingBlockComputedStyle = null;
      }
      const shouldDropCurrentNode = elementIsFixed ? !currentNodeIsContaining && !currentContainingBlockComputedStyle : !currentNodeIsContaining && computedStyle.position === "static" && !!currentContainingBlockComputedStyle && (currentContainingBlockComputedStyle.position === "absolute" || currentContainingBlockComputedStyle.position === "fixed") || isOverflowElement(currentNode) && !currentNodeIsContaining && hasFixedPositionAncestor(element, currentNode);
      if (shouldDropCurrentNode) {
        result = result.filter((ancestor) => ancestor !== currentNode);
      } else {
        currentContainingBlockComputedStyle = computedStyle;
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
    function setLeftRTLScrollbarOffset() {
      offsets.x = getWindowScrollBarX(documentElement);
    }
    if (isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed) {
      if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
        scroll = getNodeScroll(offsetParent);
      }
      if (isOffsetParentAnElement) {
        const offsetRect = getBoundingClientRect(offsetParent, true, isFixed, offsetParent);
        offsets.x = offsetRect.x + offsetParent.clientLeft;
        offsets.y = offsetRect.y + offsetParent.clientTop;
      } else if (documentElement) {
        setLeftRTLScrollbarOffset();
      }
    }
    if (isFixed && !isOffsetParentAnElement && documentElement) {
      setLeftRTLScrollbarOffset();
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
  function observeMove(element, onMove) {
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
        if (ratio === 1 && !rectsAreEqual(elementRectForRootMargin, element.getBoundingClientRect())) {
          refresh();
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
    refresh(true);
    return cleanup;
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
      ancestorScroll && ancestor.addEventListener("scroll", update, {
        passive: true
      });
      ancestorResize && ancestor.addEventListener("resize", update);
    });
    const cleanupIo = referenceEl && layoutShift ? observeMove(referenceEl, update) : null;
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
    const mergedOptions = {
      platform,
      ...options2
    };
    const platformWithCache = {
      ...mergedOptions.platform,
      _c: cache
    };
    return computePosition(reference, floating, {
      ...mergedOptions,
      platform: platformWithCache
    });
  };

  // node_modules/.pnpm/@floating-ui+react-dom@2.1._f1bed12861163fa290e602839f1ebdb9/node_modules/@floating-ui/react-dom/dist/floating-ui.react-dom.mjs
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

  // node_modules/.pnpm/@radix-ui+react-arrow@1.1.1_46841099dde2429c8edffbf91fdd0f75/node_modules/@radix-ui/react-arrow/dist/index.mjs
  var NAME2 = "Arrow";
  var Arrow = forwardRef((props, forwardedRef) => {
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
  });
  Arrow.displayName = NAME2;
  var Root3 = Arrow;

  // node_modules/.pnpm/@radix-ui+react-popper@1.3._0a9221ab1b0956a4d531653402915605/node_modules/@radix-ui/react-popper/dist/index.mjs
  var POPPER_NAME = "Popper";
  var [createPopperContext, createPopperScope] = createContextScope(POPPER_NAME);
  var [PopperProvider, usePopperContext] = createPopperContext(POPPER_NAME);
  var Popper = (props) => {
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
  };
  Popper.displayName = POPPER_NAME;
  var ANCHOR_NAME = "PopperAnchor";
  var PopperAnchor = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  PopperAnchor.displayName = ANCHOR_NAME;
  var CONTENT_NAME4 = "PopperContent";
  var [PopperContentProvider, useContentContext] = createPopperContext(CONTENT_NAME4);
  var PopperContent = forwardRef(
    (props, forwardedRef) => {
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
        whileElementsMounted: (...args) => {
          const cleanup = autoUpdate(...args, {
            animationFrame: updatePositionStrategy === "always"
          });
          return cleanup;
        },
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
            apply: ({ elements, rects, availableWidth, availableHeight }) => {
              const { width: anchorWidth, height: anchorHeight } = rects.reference;
              const contentStyle = elements.floating.style;
              contentStyle.setProperty("--radix-popper-available-width", `${availableWidth}px`);
              contentStyle.setProperty("--radix-popper-available-height", `${availableHeight}px`);
              contentStyle.setProperty("--radix-popper-anchor-width", `${anchorWidth}px`);
              contentStyle.setProperty("--radix-popper-anchor-height", `${anchorHeight}px`);
            }
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
                    // if the PopperContent hasn't been placed yet (not all measurements done)
                    // we prevent animations so that users's animation don't kick in too early referring wrong sides
                    animation: !isPositioned ? "none" : void 0
                  }
                }
              )
            }
          )
        }
      );
    }
  );
  PopperContent.displayName = CONTENT_NAME4;
  var ARROW_NAME = "PopperArrow";
  var OPPOSITE_SIDE = {
    top: "bottom",
    right: "left",
    bottom: "top",
    left: "right"
  };
  var PopperArrow = forwardRef(function PopperArrow2(props, forwardedRef) {
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
  });
  PopperArrow.displayName = ARROW_NAME;
  function isNotNull(value) {
    return value !== null;
  }
  var transformOrigin = (options2) => ({
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
  });
  function getSideAndAlignFromPlacement(placement) {
    const [side, align = "center"] = placement.split("-");
    return [side, align];
  }
  var Root23 = Popper;
  var Anchor = PopperAnchor;
  var Content3 = PopperContent;
  var Arrow2 = PopperArrow;

  // node_modules/.pnpm/@radix-ui+react-use-is-hydr_d8b55bd05f5d50f7ea21f52744760552/node_modules/@radix-ui/react-use-is-hydrated/dist/index.mjs
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
  var useReactSyncExternalStore = react_shim_exports[" useSyncExternalStore ".trim().toString()];
  function subscribe() {
    return () => {
    };
  }
  function useIsHydratedModern() {
    return useReactSyncExternalStore(
      subscribe,
      () => true,
      () => false
    );
  }
  var useIsHydrated2 = typeof useReactSyncExternalStore === "function" ? useIsHydratedModern : useIsHydrated;

  // node_modules/.pnpm/@radix-ui+react-roving-focu_6f6d23a80cf2852a1243fe7c18f7ea40/node_modules/@radix-ui/react-roving-focus/dist/index.mjs
  var ENTRY_FOCUS = "rovingFocusGroup.onEntryFocus";
  var EVENT_OPTIONS2 = { bubbles: false, cancelable: true };
  var GROUP_NAME = "RovingFocusGroup";
  var [Collection, useCollection, createCollectionScope] = createCollection(GROUP_NAME);
  var [createRovingFocusGroupContext, createRovingFocusGroupScope] = createContextScope(
    GROUP_NAME,
    [createCollectionScope]
  );
  var [RovingFocusProvider, useRovingFocusContext] = createRovingFocusGroupContext(GROUP_NAME);
  var RovingFocusGroup = forwardRef(
    (props, forwardedRef) => {
      return /* @__PURE__ */ jsx(Collection.Provider, { scope: props.__scopeRovingFocusGroup, children: /* @__PURE__ */ jsx(Collection.Slot, { scope: props.__scopeRovingFocusGroup, children: /* @__PURE__ */ jsx(RovingFocusGroupImpl, { ...props, ref: forwardedRef }) }) });
    }
  );
  RovingFocusGroup.displayName = GROUP_NAME;
  var RovingFocusGroupImpl = forwardRef((props, forwardedRef) => {
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
  });
  var ITEM_NAME = "RovingFocusGroupItem";
  var RovingFocusGroupItem = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  RovingFocusGroupItem.displayName = ITEM_NAME;
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
  function getFocusIntent(event, orientation, dir) {
    const key = getDirectionAwareKey(event.key, dir);
    if (orientation === "vertical" && ["ArrowLeft", "ArrowRight"].includes(key)) return void 0;
    if (orientation === "horizontal" && ["ArrowUp", "ArrowDown"].includes(key)) return void 0;
    return MAP_KEY_TO_FOCUS_INTENT[key];
  }
  function focusFirst2(candidates, preventScroll = false) {
    const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
    for (const candidate of candidates) {
      if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
      candidate.focus({ preventScroll });
      if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
    }
  }
  function wrapArray(array, startIndex) {
    return array.map((_, index2) => array[(startIndex + index2) % array.length]);
  }
  var Root4 = RovingFocusGroup;
  var Item = RovingFocusGroupItem;

  // node_modules/.pnpm/@radix-ui+react-menu@2.1.20_e838fb73c3335c4850fd37fa077066a8/node_modules/@radix-ui/react-menu/dist/index.mjs
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
  var Menu = (props) => {
    const { __scopeMenu, open = false, children, dir, onOpenChange, modal = true } = props;
    const popperScope = usePopperScope(__scopeMenu);
    const [content, setContent] = useState(null);
    const isUsingKeyboardRef = useRef(false);
    const handleOpenChange = useCallbackRef(onOpenChange);
    const direction = useDirection(dir);
    useEffect(() => {
      const handleKeyDown = () => {
        isUsingKeyboardRef.current = true;
        document.addEventListener("pointerdown", handlePointer, { capture: true, once: true });
        document.addEventListener("pointermove", handlePointer, { capture: true, once: true });
      };
      const handlePointer = () => isUsingKeyboardRef.current = false;
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
      const handleBlur = () => handleOpenChange(false);
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
  };
  Menu.displayName = MENU_NAME;
  var ANCHOR_NAME2 = "MenuAnchor";
  var MenuAnchor = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, ...anchorProps } = props;
      const popperScope = usePopperScope(__scopeMenu);
      return /* @__PURE__ */ jsx(Anchor, { ...popperScope, ...anchorProps, ref: forwardedRef });
    }
  );
  MenuAnchor.displayName = ANCHOR_NAME2;
  var PORTAL_NAME4 = "MenuPortal";
  var [PortalProvider2, usePortalContext2] = createMenuContext(PORTAL_NAME4, {
    forceMount: void 0
  });
  var MenuPortal = (props) => {
    const { __scopeMenu, forceMount, children, container } = props;
    const context = useMenuContext(PORTAL_NAME4, __scopeMenu);
    return /* @__PURE__ */ jsx(PortalProvider2, { scope: __scopeMenu, forceMount, children: /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Portal, { asChild: true, container, children }) }) });
  };
  MenuPortal.displayName = PORTAL_NAME4;
  var CONTENT_NAME5 = "MenuContent";
  var [MenuContentProvider, useMenuContentContext] = createMenuContext(CONTENT_NAME5);
  var MenuContent = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext2(CONTENT_NAME5, props.__scopeMenu);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = useMenuContext(CONTENT_NAME5, props.__scopeMenu);
      const rootContext = useMenuRootContext(CONTENT_NAME5, props.__scopeMenu);
      return /* @__PURE__ */ jsx(Collection2.Provider, { scope: props.__scopeMenu, children: /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Collection2.Slot, { scope: props.__scopeMenu, children: rootContext.modal ? /* @__PURE__ */ jsx(MenuRootContentModal, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(MenuRootContentNonModal, { ...contentProps, ref: forwardedRef }) }) }) });
    }
  );
  var MenuRootContentModal = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  var MenuRootContentNonModal = forwardRef((props, forwardedRef) => {
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
  });
  var Slot3 = createSlot("MenuContent.ScrollLock");
  var MenuContentImpl = forwardRef(
    (props, forwardedRef) => {
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
      const handleTypeaheadSearch = (key) => {
        const search = searchRef.current + key;
        const items = getItems().filter((item) => !item.disabled);
        const currentItem = document.activeElement;
        const currentMatch = items.find((item) => item.ref.current === currentItem)?.textValue;
        const values = items.map((item) => item.textValue);
        const nextMatch = getNextMatch(values, search, currentMatch);
        const newItem = items.find((item) => item.textValue === nextMatch)?.ref.current;
        (function updateSearch(value) {
          searchRef.current = value;
          window.clearTimeout(timerRef.current);
          if (value !== "") timerRef.current = window.setTimeout(() => updateSearch(""), 1e3);
        })(search);
        if (newItem) {
          setTimeout(() => newItem.focus());
        }
      };
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
    }
  );
  MenuContent.displayName = CONTENT_NAME5;
  var GROUP_NAME2 = "MenuGroup";
  var MenuGroup = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, ...groupProps } = props;
      return /* @__PURE__ */ jsx(Primitive.div, { role: "group", ...groupProps, ref: forwardedRef });
    }
  );
  MenuGroup.displayName = GROUP_NAME2;
  var LABEL_NAME = "MenuLabel";
  var MenuLabel = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, ...labelProps } = props;
      return /* @__PURE__ */ jsx(Primitive.div, { ...labelProps, ref: forwardedRef });
    }
  );
  MenuLabel.displayName = LABEL_NAME;
  var ITEM_NAME2 = "MenuItem";
  var ITEM_SELECT = "menu.itemSelect";
  var MenuItem = forwardRef(
    (props, forwardedRef) => {
      const { disabled = false, onSelect, ...itemProps } = props;
      const ref = useRef(null);
      const rootContext = useMenuRootContext(ITEM_NAME2, props.__scopeMenu);
      const contentContext = useMenuContentContext(ITEM_NAME2, props.__scopeMenu);
      const composedRefs = useComposedRefs(forwardedRef, ref);
      const isPointerDownRef = useRef(false);
      const handleSelect = () => {
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
      };
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
    }
  );
  MenuItem.displayName = ITEM_NAME2;
  var MenuItemImpl = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  var CHECKBOX_ITEM_NAME = "MenuCheckboxItem";
  var MenuCheckboxItem = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  MenuCheckboxItem.displayName = CHECKBOX_ITEM_NAME;
  var RADIO_GROUP_NAME = "MenuRadioGroup";
  var [RadioGroupProvider, useRadioGroupContext] = createMenuContext(
    RADIO_GROUP_NAME,
    { value: void 0, onValueChange: () => {
    } }
  );
  var MenuRadioGroup = forwardRef(
    (props, forwardedRef) => {
      const { value, onValueChange, ...groupProps } = props;
      const handleValueChange = useCallbackRef(onValueChange);
      return /* @__PURE__ */ jsx(RadioGroupProvider, { scope: props.__scopeMenu, value, onValueChange: handleValueChange, children: /* @__PURE__ */ jsx(MenuGroup, { ...groupProps, ref: forwardedRef }) });
    }
  );
  MenuRadioGroup.displayName = RADIO_GROUP_NAME;
  var RADIO_ITEM_NAME = "MenuRadioItem";
  var MenuRadioItem = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  MenuRadioItem.displayName = RADIO_ITEM_NAME;
  var ITEM_INDICATOR_NAME = "MenuItemIndicator";
  var [ItemIndicatorProvider, useItemIndicatorContext] = createMenuContext(
    ITEM_INDICATOR_NAME,
    { checked: false }
  );
  var MenuItemIndicator = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  MenuItemIndicator.displayName = ITEM_INDICATOR_NAME;
  var SEPARATOR_NAME = "MenuSeparator";
  var MenuSeparator = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  MenuSeparator.displayName = SEPARATOR_NAME;
  var ARROW_NAME2 = "MenuArrow";
  var MenuArrow = forwardRef(
    (props, forwardedRef) => {
      const { __scopeMenu, ...arrowProps } = props;
      const popperScope = usePopperScope(__scopeMenu);
      return /* @__PURE__ */ jsx(Arrow2, { ...popperScope, ...arrowProps, ref: forwardedRef });
    }
  );
  MenuArrow.displayName = ARROW_NAME2;
  var SUB_NAME = "MenuSub";
  var [MenuSubProvider, useMenuSubContext] = createMenuContext(SUB_NAME);
  var MenuSub = (props) => {
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
  };
  MenuSub.displayName = SUB_NAME;
  var SUB_TRIGGER_NAME = "MenuSubTrigger";
  var MenuSubTrigger = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  MenuSubTrigger.displayName = SUB_TRIGGER_NAME;
  var SUB_CONTENT_NAME = "MenuSubContent";
  var MenuSubContent = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  MenuSubContent.displayName = SUB_CONTENT_NAME;
  function getOpenState(open) {
    return open ? "open" : "closed";
  }
  function isIndeterminate(checked) {
    return checked === "indeterminate";
  }
  function getCheckedState(checked) {
    return isIndeterminate(checked) ? "indeterminate" : checked ? "checked" : "unchecked";
  }
  function focusFirst3(candidates) {
    const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
    for (const candidate of candidates) {
      if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
      candidate.focus();
      if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
    }
  }
  function wrapArray2(array, startIndex) {
    return array.map((_, index2) => array[(startIndex + index2) % array.length]);
  }
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
  function isPointerInGraceArea(event, area) {
    if (!area) return false;
    const cursorPos = { x: event.clientX, y: event.clientY };
    return isPointInPolygon(cursorPos, area);
  }
  function whenMouse(handler) {
    return (event) => event.pointerType === "mouse" ? handler(event) : void 0;
  }
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

  // node_modules/.pnpm/@radix-ui+react-dropdown-me_859a9e2ff47818a9da5ac1bd196880aa/node_modules/@radix-ui/react-dropdown-menu/dist/index.mjs
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
    Portal: () => Portal22,
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
  var DROPDOWN_MENU_NAME = "DropdownMenu";
  var [createDropdownMenuContext, createDropdownMenuScope] = createContextScope(
    DROPDOWN_MENU_NAME,
    [createMenuScope]
  );
  var useMenuScope = createMenuScope();
  var [DropdownMenuProvider, useDropdownMenuContext] = createDropdownMenuContext(DROPDOWN_MENU_NAME);
  var DropdownMenu = (props) => {
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
  };
  DropdownMenu.displayName = DROPDOWN_MENU_NAME;
  var TRIGGER_NAME4 = "DropdownMenuTrigger";
  var DropdownMenuTrigger = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, disabled = false, ...triggerProps } = props;
      const context = useDropdownMenuContext(TRIGGER_NAME4, __scopeDropdownMenu);
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
    }
  );
  DropdownMenuTrigger.displayName = TRIGGER_NAME4;
  var PORTAL_NAME5 = "DropdownMenuPortal";
  var DropdownMenuPortal = (props) => {
    const { __scopeDropdownMenu, ...portalProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(Portal3, { ...menuScope, ...portalProps });
  };
  DropdownMenuPortal.displayName = PORTAL_NAME5;
  var CONTENT_NAME6 = "DropdownMenuContent";
  var DropdownMenuContent = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  DropdownMenuContent.displayName = CONTENT_NAME6;
  var GROUP_NAME3 = "DropdownMenuGroup";
  var DropdownMenuGroup = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, ...groupProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Group, { ...menuScope, ...groupProps, ref: forwardedRef });
    }
  );
  DropdownMenuGroup.displayName = GROUP_NAME3;
  var LABEL_NAME2 = "DropdownMenuLabel";
  var DropdownMenuLabel = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, ...labelProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Label, { ...menuScope, ...labelProps, ref: forwardedRef });
    }
  );
  DropdownMenuLabel.displayName = LABEL_NAME2;
  var ITEM_NAME3 = "DropdownMenuItem";
  var DropdownMenuItem = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, ...itemProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Item2, { ...menuScope, ...itemProps, ref: forwardedRef });
    }
  );
  DropdownMenuItem.displayName = ITEM_NAME3;
  var CHECKBOX_ITEM_NAME2 = "DropdownMenuCheckboxItem";
  var DropdownMenuCheckboxItem = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...checkboxItemProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(CheckboxItem, { ...menuScope, ...checkboxItemProps, ref: forwardedRef });
  });
  DropdownMenuCheckboxItem.displayName = CHECKBOX_ITEM_NAME2;
  var RADIO_GROUP_NAME2 = "DropdownMenuRadioGroup";
  var DropdownMenuRadioGroup = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...radioGroupProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(RadioGroup, { ...menuScope, ...radioGroupProps, ref: forwardedRef });
  });
  DropdownMenuRadioGroup.displayName = RADIO_GROUP_NAME2;
  var RADIO_ITEM_NAME2 = "DropdownMenuRadioItem";
  var DropdownMenuRadioItem = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...radioItemProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(RadioItem, { ...menuScope, ...radioItemProps, ref: forwardedRef });
  });
  DropdownMenuRadioItem.displayName = RADIO_ITEM_NAME2;
  var INDICATOR_NAME = "DropdownMenuItemIndicator";
  var DropdownMenuItemIndicator = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...itemIndicatorProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(ItemIndicator, { ...menuScope, ...itemIndicatorProps, ref: forwardedRef });
  });
  DropdownMenuItemIndicator.displayName = INDICATOR_NAME;
  var SEPARATOR_NAME2 = "DropdownMenuSeparator";
  var DropdownMenuSeparator = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...separatorProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(Separator, { ...menuScope, ...separatorProps, ref: forwardedRef });
  });
  DropdownMenuSeparator.displayName = SEPARATOR_NAME2;
  var ARROW_NAME3 = "DropdownMenuArrow";
  var DropdownMenuArrow = forwardRef(
    (props, forwardedRef) => {
      const { __scopeDropdownMenu, ...arrowProps } = props;
      const menuScope = useMenuScope(__scopeDropdownMenu);
      return /* @__PURE__ */ jsx(Arrow22, { ...menuScope, ...arrowProps, ref: forwardedRef });
    }
  );
  DropdownMenuArrow.displayName = ARROW_NAME3;
  var DropdownMenuSub = (props) => {
    const { __scopeDropdownMenu, children, open: openProp, onOpenChange, defaultOpen } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: onOpenChange,
      caller: "DropdownMenuSub"
    });
    return /* @__PURE__ */ jsx(Sub, { ...menuScope, open, onOpenChange: setOpen, children });
  };
  var SUB_TRIGGER_NAME2 = "DropdownMenuSubTrigger";
  var DropdownMenuSubTrigger = forwardRef((props, forwardedRef) => {
    const { __scopeDropdownMenu, ...subTriggerProps } = props;
    const menuScope = useMenuScope(__scopeDropdownMenu);
    return /* @__PURE__ */ jsx(SubTrigger, { ...menuScope, ...subTriggerProps, ref: forwardedRef });
  });
  DropdownMenuSubTrigger.displayName = SUB_TRIGGER_NAME2;
  var SUB_CONTENT_NAME2 = "DropdownMenuSubContent";
  var DropdownMenuSubContent = forwardRef((props, forwardedRef) => {
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
  });
  DropdownMenuSubContent.displayName = SUB_CONTENT_NAME2;
  var Root24 = DropdownMenu;
  var Trigger3 = DropdownMenuTrigger;
  var Portal22 = DropdownMenuPortal;
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

  // node_modules/.pnpm/@radix-ui+number@1.1.2/node_modules/@radix-ui/number/dist/index.mjs
  function clamp2(value, [min2, max2]) {
    return Math.min(max2, Math.max(min2, value));
  }

  // node_modules/.pnpm/@radix-ui+react-progress@1._ba0a23888d03d7a38e90b386f3352204/node_modules/@radix-ui/react-progress/dist/index.mjs
  var dist_exports10 = {};
  __export(dist_exports10, {
    Indicator: () => Indicator,
    Progress: () => Progress,
    ProgressIndicator: () => ProgressIndicator,
    Root: () => Root5,
    createProgressScope: () => createProgressScope
  });
  var PROGRESS_NAME = "Progress";
  var DEFAULT_MAX = 100;
  var [createProgressContext, createProgressScope] = createContextScope(PROGRESS_NAME);
  var [ProgressProvider, useProgressContext] = createProgressContext(PROGRESS_NAME);
  var Progress = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  Progress.displayName = PROGRESS_NAME;
  var INDICATOR_NAME2 = "ProgressIndicator";
  var ProgressIndicator = forwardRef(
    (props, forwardedRef) => {
      const { __scopeProgress, ...indicatorProps } = props;
      const context = useProgressContext(INDICATOR_NAME2, __scopeProgress);
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
    }
  );
  ProgressIndicator.displayName = INDICATOR_NAME2;
  function defaultGetValueLabel(value, max2) {
    return `${Math.round(value / max2 * 100)}%`;
  }
  function getProgressState(value, maxValue) {
    return value == null ? "indeterminate" : value === maxValue ? "complete" : "loading";
  }
  function isNumber2(value) {
    return typeof value === "number";
  }
  function isValidMaxNumber(max2) {
    return isNumber2(max2) && !isNaN(max2) && max2 > 0;
  }
  function isValidValueNumber(value, max2) {
    return isNumber2(value) && !isNaN(value) && value <= max2 && value >= 0;
  }
  function getInvalidMaxError(propValue, componentName) {
    return `Invalid prop \`max\` of value \`${propValue}\` supplied to \`${componentName}\`. Only numbers greater than 0 are valid max values. Defaulting to \`${DEFAULT_MAX}\`.`;
  }
  function getInvalidValueError(propValue, componentName) {
    return `Invalid prop \`value\` of value \`${propValue}\` supplied to \`${componentName}\`. The \`value\` prop must be:
  - a positive number
  - less than the value passed to \`max\` (or ${DEFAULT_MAX} if no \`max\` prop is set)
  - \`null\` or \`undefined\` if the progress is indeterminate.

Defaulting to \`null\`.`;
  }
  var Root5 = Progress;
  var Indicator = ProgressIndicator;

  // node_modules/.pnpm/@radix-ui+react-scroll-area_42744b7ae87cd630a69f8d88c5a61168/node_modules/@radix-ui/react-scroll-area/dist/index.mjs
  var dist_exports11 = {};
  __export(dist_exports11, {
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
  function useStateMachine2(initialState, machine) {
    return useReducer((state, event) => {
      const nextState = machine[state][event];
      return nextState ?? state;
    }, initialState);
  }
  var SCROLL_AREA_NAME = "ScrollArea";
  var [createScrollAreaContext, createScrollAreaScope] = createContextScope(SCROLL_AREA_NAME);
  var [ScrollAreaProvider, useScrollAreaContext] = createScrollAreaContext(SCROLL_AREA_NAME);
  var ScrollArea = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  ScrollArea.displayName = SCROLL_AREA_NAME;
  var VIEWPORT_NAME = "ScrollAreaViewport";
  var ScrollAreaViewport = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  ScrollAreaViewport.displayName = VIEWPORT_NAME;
  var ScrollAreaViewportStyle = memo(
    ({ nonce }) => {
      return /* @__PURE__ */ jsx(
        "style",
        {
          dangerouslySetInnerHTML: {
            __html: `[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}`
          },
          nonce
        }
      );
    },
    (prevProps, nextProps) => prevProps.nonce === nextProps.nonce
  );
  var SCROLLBAR_NAME = "ScrollAreaScrollbar";
  var ScrollAreaScrollbar = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  ScrollAreaScrollbar.displayName = SCROLLBAR_NAME;
  var ScrollAreaScrollbarHover = forwardRef((props, forwardedRef) => {
    const { forceMount, ...scrollbarProps } = props;
    const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
      const scrollArea = context.scrollArea;
      let hideTimer = 0;
      if (scrollArea) {
        const handlePointerEnter = () => {
          window.clearTimeout(hideTimer);
          setVisible(true);
        };
        const handlePointerLeave = () => {
          hideTimer = window.setTimeout(() => setVisible(false), context.scrollHideDelay);
        };
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
  });
  var ScrollAreaScrollbarScroll = forwardRef((props, forwardedRef) => {
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
        const handleScroll2 = () => {
          const scrollPos = viewport[scrollDirection];
          const hasScrollInDirectionChanged = prevScrollPos !== scrollPos;
          if (hasScrollInDirectionChanged) {
            send("SCROLL");
            debounceScrollEnd();
          }
          prevScrollPos = scrollPos;
        };
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
  });
  var ScrollAreaScrollbarAuto = forwardRef((props, forwardedRef) => {
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
  });
  var ScrollAreaScrollbarVisible = forwardRef((props, forwardedRef) => {
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
      onThumbChange: (thumb) => thumbRef.current = thumb,
      onThumbPointerUp: () => pointerOffsetRef.current = 0,
      onThumbPointerDown: (pointerPos) => pointerOffsetRef.current = pointerPos
    };
    function getScrollPosition(pointerPos, dir) {
      return getScrollPositionFromPointer(pointerPos, pointerOffsetRef.current, sizes, dir);
    }
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
  });
  var ScrollAreaScrollbarX = forwardRef((props, forwardedRef) => {
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
  });
  var ScrollAreaScrollbarY = forwardRef((props, forwardedRef) => {
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
  });
  var [ScrollbarProvider, useScrollbarContext] = createScrollAreaContext(SCROLLBAR_NAME);
  var ScrollAreaScrollbarImpl = forwardRef((props, forwardedRef) => {
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
    useEffect(() => {
      const handleWheel = (event) => {
        const element = event.target;
        const isScrollbarWheel = scrollbar?.contains(element);
        if (isScrollbarWheel) handleWheelScroll(event, maxScrollPos);
      };
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
  });
  var THUMB_NAME = "ScrollAreaThumb";
  var ScrollAreaThumb = forwardRef(
    (props, forwardedRef) => {
      const { forceMount, ...thumbProps } = props;
      const scrollbarContext = useScrollbarContext(THUMB_NAME, props.__scopeScrollArea);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || scrollbarContext.hasThumb, children: /* @__PURE__ */ jsx(ScrollAreaThumbImpl, { ref: forwardedRef, ...thumbProps }) });
    }
  );
  var ScrollAreaThumbImpl = forwardRef(
    (props, forwardedRef) => {
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
          const handleScroll2 = () => {
            debounceScrollEnd();
            if (!removeUnlinkedScrollListenerRef.current) {
              const listener = addUnlinkedScrollListener(viewport, onThumbPositionChange);
              removeUnlinkedScrollListenerRef.current = listener;
              onThumbPositionChange();
            }
          };
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
    }
  );
  ScrollAreaThumb.displayName = THUMB_NAME;
  var CORNER_NAME = "ScrollAreaCorner";
  var ScrollAreaCorner = forwardRef(
    (props, forwardedRef) => {
      const context = useScrollAreaContext(CORNER_NAME, props.__scopeScrollArea);
      const hasBothScrollbarsVisible = Boolean(context.scrollbarX && context.scrollbarY);
      const hasCorner = context.type !== "scroll" && hasBothScrollbarsVisible;
      return hasCorner ? /* @__PURE__ */ jsx(ScrollAreaCornerImpl, { ...props, ref: forwardedRef }) : null;
    }
  );
  ScrollAreaCorner.displayName = CORNER_NAME;
  var ScrollAreaCornerImpl = forwardRef((props, forwardedRef) => {
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
  });
  function toInt(value) {
    return value ? parseInt(value, 10) : 0;
  }
  function getThumbRatio(viewportSize, contentSize) {
    const ratio = viewportSize / contentSize;
    return isNaN(ratio) ? 0 : ratio;
  }
  function getThumbSize(sizes) {
    const ratio = getThumbRatio(sizes.viewport, sizes.content);
    const scrollbarPadding = sizes.scrollbar.paddingStart + sizes.scrollbar.paddingEnd;
    const thumbSize = (sizes.scrollbar.size - scrollbarPadding) * ratio;
    return Math.max(thumbSize, 18);
  }
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
  function linearScale(input, output) {
    return (value) => {
      if (input[0] === input[1] || output[0] === output[1]) return output[0];
      const ratio = (output[1] - output[0]) / (input[1] - input[0]);
      return output[0] + ratio * (value - input[0]);
    };
  }
  function isScrollingWithinScrollbarBounds(scrollPos, maxScrollPos) {
    return scrollPos > 0 && scrollPos < maxScrollPos;
  }
  var addUnlinkedScrollListener = (node, handler = () => {
  }) => {
    let prevPosition = { left: node.scrollLeft, top: node.scrollTop };
    let rAF = 0;
    (function loop() {
      const position = { left: node.scrollLeft, top: node.scrollTop };
      const isHorizontalScroll = prevPosition.left !== position.left;
      const isVerticalScroll = prevPosition.top !== position.top;
      if (isHorizontalScroll || isVerticalScroll) handler();
      prevPosition = position;
      rAF = window.requestAnimationFrame(loop);
    })();
    return () => window.cancelAnimationFrame(rAF);
  };
  function useDebounceCallback(callback, delay) {
    const handleCallback = useCallbackRef(callback);
    const debounceTimerRef = useRef(0);
    useEffect(() => () => window.clearTimeout(debounceTimerRef.current), []);
    return useCallback(() => {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(handleCallback, delay);
    }, [handleCallback, delay]);
  }
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
  var Root6 = ScrollArea;
  var Viewport = ScrollAreaViewport;
  var Scrollbar = ScrollAreaScrollbar;
  var Thumb = ScrollAreaThumb;
  var Corner = ScrollAreaCorner;

  // node_modules/.pnpm/@radix-ui+react-select@2.3._e41ea4091319bba4ffed6d0f7126160f/node_modules/@radix-ui/react-select/dist/index.mjs
  var dist_exports12 = {};
  __export(dist_exports12, {
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
  var OPEN_KEYS = [" ", "Enter", "ArrowUp", "ArrowDown"];
  var SELECTION_KEYS2 = [" ", "Enter"];
  var SELECT_NAME = "Select";
  var [Collection3, useCollection3, createCollectionScope3] = createCollection(SELECT_NAME);
  var [createSelectContext, createSelectScope] = createContextScope(SELECT_NAME, [
    createCollectionScope3,
    createPopperScope
  ]);
  var usePopperScope2 = createPopperScope();
  var [SelectProviderImpl, useSelectContext] = createSelectContext(SELECT_NAME);
  var [SelectNativeOptionsProvider, useSelectNativeOptionsContext] = createSelectContext(SELECT_NAME);
  var PROVIDER_NAME = "SelectProvider";
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
    const popperScope = usePopperScope2(__scopeSelect);
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
        const reset = () => setValue(initialValueRef.current);
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
  SelectProvider.displayName = PROVIDER_NAME;
  var Select = (props) => {
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
  };
  Select.displayName = SELECT_NAME;
  var TRIGGER_NAME5 = "SelectTrigger";
  var SelectTrigger = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, disabled = false, ...triggerProps } = props;
      const popperScope = usePopperScope2(__scopeSelect);
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
      const handleOpen = (pointerEvent) => {
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
      };
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
    }
  );
  SelectTrigger.displayName = TRIGGER_NAME5;
  var VALUE_NAME = "SelectValue";
  var SelectValue = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  SelectValue.displayName = VALUE_NAME;
  var ICON_NAME = "SelectIcon";
  var SelectIcon = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, children, ...iconProps } = props;
      return /* @__PURE__ */ jsx(Primitive.span, { "aria-hidden": true, ...iconProps, ref: forwardedRef, children: children || "\u25BC" });
    }
  );
  SelectIcon.displayName = ICON_NAME;
  var PORTAL_NAME6 = "SelectPortal";
  var [PortalProvider3, usePortalContext3] = createSelectContext(PORTAL_NAME6, {
    forceMount: void 0
  });
  var SelectPortal = (props) => {
    const { __scopeSelect, forceMount, ...portalProps } = props;
    return /* @__PURE__ */ jsx(PortalProvider3, { scope: props.__scopeSelect, forceMount, children: /* @__PURE__ */ jsx(Portal, { asChild: true, ...portalProps }) });
  };
  SelectPortal.displayName = PORTAL_NAME6;
  var CONTENT_NAME7 = "SelectContent";
  var SelectContent = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext3(CONTENT_NAME7, props.__scopeSelect);
      const { forceMount = portalContext.forceMount, ...contentProps } = props;
      const context = useSelectContext(CONTENT_NAME7, props.__scopeSelect);
      const [fragment, setFragment] = useState();
      useLayoutEffect2(() => {
        setFragment(new DocumentFragment());
      }, []);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: ({ present }) => present ? /* @__PURE__ */ jsx(SelectContentImpl, { ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(SelectContentFragment, { ...contentProps, fragment }) });
    }
  );
  SelectContent.displayName = CONTENT_NAME7;
  var SelectContentFragment = forwardRef((props, forwardedRef) => {
    const { __scopeSelect, children, fragment } = props;
    if (!fragment) return null;
    return createPortal(
      /* @__PURE__ */ jsx(SelectContentProvider, { scope: __scopeSelect, children: /* @__PURE__ */ jsx(Collection3.Slot, { scope: __scopeSelect, children: /* @__PURE__ */ jsx("div", { ref: forwardedRef, children }) }) }),
      fragment
    );
  });
  SelectContentFragment.displayName = "SelectContentFragment";
  var CONTENT_MARGIN = 10;
  var [SelectContentProvider, useSelectContentContext] = createSelectContext(CONTENT_NAME7);
  var CONTENT_IMPL_NAME = "SelectContentImpl";
  var Slot4 = createSlot("SelectContent.RemoveScroll");
  var SelectContentImpl = forwardRef(
    (props, forwardedRef) => {
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
      const context = useSelectContext(CONTENT_NAME7, __scopeSelect);
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
          const handlePointerMove = (event) => {
            pointerMoveDelta = {
              x: Math.abs(Math.round(event.pageX) - (triggerPointerDownPosRef.current?.x ?? 0)),
              y: Math.abs(Math.round(event.pageY) - (triggerPointerDownPosRef.current?.y ?? 0))
            };
          };
          const handlePointerUp = (event) => {
            if (pointerMoveDelta.x <= 10 && pointerMoveDelta.y <= 10) {
              event.preventDefault();
            } else {
              if (!event.composedPath().includes(content)) {
                onOpenChange(false);
              }
            }
            document.removeEventListener("pointermove", handlePointerMove);
            triggerPointerDownPosRef.current = null;
          };
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
        const close = () => onOpenChange(false);
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
          children: /* @__PURE__ */ jsx(Combination_default, { as: Slot4, allowPinchZoom: true, children: /* @__PURE__ */ jsx(
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
    }
  );
  SelectContentImpl.displayName = CONTENT_IMPL_NAME;
  var ITEM_ALIGNED_POSITION_NAME = "SelectItemAlignedPosition";
  var SelectItemAlignedPosition = forwardRef((props, forwardedRef) => {
    const { __scopeSelect, onPlaced, ...popperProps } = props;
    const context = useSelectContext(CONTENT_NAME7, __scopeSelect);
    const contentContext = useSelectContentContext(CONTENT_NAME7, __scopeSelect);
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
  });
  SelectItemAlignedPosition.displayName = ITEM_ALIGNED_POSITION_NAME;
  var POPPER_POSITION_NAME = "SelectPopperPosition";
  var SelectPopperPosition = forwardRef((props, forwardedRef) => {
    const {
      __scopeSelect,
      align = "start",
      collisionPadding = CONTENT_MARGIN,
      ...popperProps
    } = props;
    const popperScope = usePopperScope2(__scopeSelect);
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
  });
  SelectPopperPosition.displayName = POPPER_POSITION_NAME;
  var [SelectViewportProvider, useSelectViewportContext] = createSelectContext(CONTENT_NAME7, {});
  var VIEWPORT_NAME2 = "SelectViewport";
  var SelectViewport = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  SelectViewport.displayName = VIEWPORT_NAME2;
  var GROUP_NAME4 = "SelectGroup";
  var [SelectGroupContextProvider, useSelectGroupContext] = createSelectContext(GROUP_NAME4);
  var SelectGroup = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, ...groupProps } = props;
      const groupId = useId2();
      return /* @__PURE__ */ jsx(SelectGroupContextProvider, { scope: __scopeSelect, id: groupId, children: /* @__PURE__ */ jsx(Primitive.div, { role: "group", "aria-labelledby": groupId, ...groupProps, ref: forwardedRef }) });
    }
  );
  SelectGroup.displayName = GROUP_NAME4;
  var LABEL_NAME3 = "SelectLabel";
  var SelectLabel = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, ...labelProps } = props;
      const groupContext = useSelectGroupContext(LABEL_NAME3, __scopeSelect);
      return /* @__PURE__ */ jsx(Primitive.div, { id: groupContext.id, ...labelProps, ref: forwardedRef });
    }
  );
  SelectLabel.displayName = LABEL_NAME3;
  var ITEM_NAME4 = "SelectItem";
  var [SelectItemContextProvider, useSelectItemContext] = createSelectContext(ITEM_NAME4);
  var SelectItem = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopeSelect,
        value,
        disabled = false,
        textValue: textValueProp,
        ...itemProps
      } = props;
      const context = useSelectContext(ITEM_NAME4, __scopeSelect);
      const contentContext = useSelectContentContext(ITEM_NAME4, __scopeSelect);
      const isSelected = context.value === value;
      const [textValue, setTextValue] = useState(textValueProp ?? "");
      const [isFocused, setIsFocused] = useState(false);
      const handleItemRefCallback = useCallbackRef(
        (node) => contentContext.itemRefCallback?.(node, value, disabled)
      );
      const composedRefs = useComposedRefs(forwardedRef, handleItemRefCallback);
      const textId = useId2();
      const pointerTypeRef = useRef("touch");
      const handleSelect = () => {
        if (!disabled) {
          context.onValueChange(value);
          context.onOpenChange(false);
        }
      };
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
    }
  );
  SelectItem.displayName = ITEM_NAME4;
  var ITEM_TEXT_NAME = "SelectItemText";
  var SelectItemText = forwardRef(
    (props, forwardedRef) => {
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
    }
  );
  SelectItemText.displayName = ITEM_TEXT_NAME;
  var ITEM_INDICATOR_NAME2 = "SelectItemIndicator";
  var SelectItemIndicator = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, ...itemIndicatorProps } = props;
      const itemContext = useSelectItemContext(ITEM_INDICATOR_NAME2, __scopeSelect);
      return itemContext.isSelected ? /* @__PURE__ */ jsx(Primitive.span, { "aria-hidden": true, ...itemIndicatorProps, ref: forwardedRef }) : null;
    }
  );
  SelectItemIndicator.displayName = ITEM_INDICATOR_NAME2;
  var SCROLL_UP_BUTTON_NAME = "SelectScrollUpButton";
  var SelectScrollUpButton = forwardRef((props, forwardedRef) => {
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
  });
  SelectScrollUpButton.displayName = SCROLL_UP_BUTTON_NAME;
  var SCROLL_DOWN_BUTTON_NAME = "SelectScrollDownButton";
  var SelectScrollDownButton = forwardRef((props, forwardedRef) => {
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
  });
  SelectScrollDownButton.displayName = SCROLL_DOWN_BUTTON_NAME;
  var SelectScrollButtonImpl = forwardRef((props, forwardedRef) => {
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
  });
  var SEPARATOR_NAME3 = "SelectSeparator";
  var SelectSeparator = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, ...separatorProps } = props;
      return /* @__PURE__ */ jsx(Primitive.div, { "aria-hidden": true, ...separatorProps, ref: forwardedRef });
    }
  );
  SelectSeparator.displayName = SEPARATOR_NAME3;
  var ARROW_NAME4 = "SelectArrow";
  var SelectArrow = forwardRef(
    (props, forwardedRef) => {
      const { __scopeSelect, ...arrowProps } = props;
      const popperScope = usePopperScope2(__scopeSelect);
      const contentContext = useSelectContentContext(ARROW_NAME4, __scopeSelect);
      return contentContext.position === "popper" ? /* @__PURE__ */ jsx(Arrow2, { ...popperScope, ...arrowProps, ref: forwardedRef }) : null;
    }
  );
  SelectArrow.displayName = ARROW_NAME4;
  var BUBBLE_INPUT_NAME = "SelectBubbleInput";
  var SelectBubbleInput = forwardRef(
    ({ __scopeSelect, ...props }, forwardedRef) => {
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
    }
  );
  SelectBubbleInput.displayName = BUBBLE_INPUT_NAME;
  function isFunction2(value) {
    return typeof value === "function";
  }
  function shouldShowPlaceholder(value) {
    return value === "" || value === void 0;
  }
  function useTypeaheadSearch(onSearchChange) {
    const handleSearchChange = useCallbackRef(onSearchChange);
    const searchRef = useRef("");
    const timerRef = useRef(0);
    const handleTypeaheadSearch = useCallback(
      (key) => {
        const search = searchRef.current + key;
        handleSearchChange(search);
        (function updateSearch(value) {
          searchRef.current = value;
          window.clearTimeout(timerRef.current);
          if (value !== "") timerRef.current = window.setTimeout(() => updateSearch(""), 1e3);
        })(search);
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
  function wrapArray3(array, startIndex) {
    return array.map((_, index2) => array[(startIndex + index2) % array.length]);
  }

  // node_modules/.pnpm/@radix-ui+react-tooltip@1.2_722bdaa997c75963a9f848c204fdd02f/node_modules/@radix-ui/react-tooltip/dist/index.mjs
  var dist_exports13 = {};
  __export(dist_exports13, {
    Arrow: () => Arrow24,
    Content: () => Content24,
    Portal: () => Portal4,
    Provider: () => Provider,
    Root: () => Root33,
    Tooltip: () => Tooltip,
    TooltipArrow: () => TooltipArrow,
    TooltipContent: () => TooltipContent,
    TooltipPortal: () => TooltipPortal,
    TooltipProvider: () => TooltipProvider,
    TooltipTrigger: () => TooltipTrigger,
    Trigger: () => Trigger4,
    createTooltipScope: () => createTooltipScope
  });
  var [createTooltipContext, createTooltipScope] = createContextScope("Tooltip", [
    createPopperScope
  ]);
  var usePopperScope3 = createPopperScope();
  var PROVIDER_NAME2 = "TooltipProvider";
  var DEFAULT_DELAY_DURATION = 700;
  var TOOLTIP_OPEN = "tooltip.open";
  var [TooltipProviderContextProvider, useTooltipProviderContext] = createTooltipContext(PROVIDER_NAME2);
  var TooltipProvider = (props) => {
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
  };
  TooltipProvider.displayName = PROVIDER_NAME2;
  var TOOLTIP_NAME = "Tooltip";
  var [TooltipContextProvider, useTooltipContext] = createTooltipContext(TOOLTIP_NAME);
  var Tooltip = (props) => {
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
    const popperScope = usePopperScope3(__scopeTooltip);
    const [trigger, setTrigger] = useState(null);
    const contentId = useId2();
    const openTimerRef = useRef(0);
    const disableHoverableContent = disableHoverableContentProp ?? providerContext.disableHoverableContent;
    const delayDuration = delayDurationProp ?? providerContext.delayDuration;
    const wasOpenDelayedRef = useRef(false);
    const [open, setOpen] = useControllableState({
      prop: openProp,
      defaultProp: defaultOpen ?? false,
      onChange: (open2) => {
        if (open2) {
          providerContext.onOpen();
          document.dispatchEvent(new CustomEvent(TOOLTIP_OPEN));
        } else {
          providerContext.onClose();
        }
        onOpenChange?.(open2);
      },
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
    return /* @__PURE__ */ jsx(Root23, { ...popperScope, children: /* @__PURE__ */ jsx(
      TooltipContextProvider,
      {
        scope: __scopeTooltip,
        contentId,
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
  };
  Tooltip.displayName = TOOLTIP_NAME;
  var TRIGGER_NAME6 = "TooltipTrigger";
  var TooltipTrigger = forwardRef(
    (props, forwardedRef) => {
      const { __scopeTooltip, ...triggerProps } = props;
      const context = useTooltipContext(TRIGGER_NAME6, __scopeTooltip);
      const providerContext = useTooltipProviderContext(TRIGGER_NAME6, __scopeTooltip);
      const popperScope = usePopperScope3(__scopeTooltip);
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
    }
  );
  TooltipTrigger.displayName = TRIGGER_NAME6;
  var PORTAL_NAME7 = "TooltipPortal";
  var [PortalProvider4, usePortalContext4] = createTooltipContext(PORTAL_NAME7, {
    forceMount: void 0
  });
  var TooltipPortal = (props) => {
    const { __scopeTooltip, forceMount, children, container } = props;
    const context = useTooltipContext(PORTAL_NAME7, __scopeTooltip);
    return /* @__PURE__ */ jsx(PortalProvider4, { scope: __scopeTooltip, forceMount, children: /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: /* @__PURE__ */ jsx(Portal, { asChild: true, container, children }) }) });
  };
  TooltipPortal.displayName = PORTAL_NAME7;
  var CONTENT_NAME8 = "TooltipContent";
  var TooltipContent = forwardRef(
    (props, forwardedRef) => {
      const portalContext = usePortalContext4(CONTENT_NAME8, props.__scopeTooltip);
      const { forceMount = portalContext.forceMount, side = "top", ...contentProps } = props;
      const context = useTooltipContext(CONTENT_NAME8, props.__scopeTooltip);
      return /* @__PURE__ */ jsx(Presence, { present: forceMount || context.open, children: context.disableHoverableContent ? /* @__PURE__ */ jsx(TooltipContentImpl, { side, ...contentProps, ref: forwardedRef }) : /* @__PURE__ */ jsx(TooltipContentHoverable, { side, ...contentProps, ref: forwardedRef }) });
    }
  );
  var TooltipContentHoverable = forwardRef((props, forwardedRef) => {
    const context = useTooltipContext(CONTENT_NAME8, props.__scopeTooltip);
    const providerContext = useTooltipProviderContext(CONTENT_NAME8, props.__scopeTooltip);
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
        const handleTriggerLeave = (event) => handleCreateGraceArea(event, content);
        const handleContentLeave = (event) => handleCreateGraceArea(event, trigger);
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
        const handleTrackPointerGrace = (event) => {
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
        };
        document.addEventListener("pointermove", handleTrackPointerGrace);
        return () => document.removeEventListener("pointermove", handleTrackPointerGrace);
      }
    }, [trigger, content, pointerGraceArea, onClose, handleRemoveGraceArea]);
    return /* @__PURE__ */ jsx(TooltipContentImpl, { ...props, ref: composedRefs });
  });
  var [VisuallyHiddenContentContextProvider, useVisuallyHiddenContentContext] = createTooltipContext(TOOLTIP_NAME, { isInside: false });
  var Slottable2 = createSlottable("TooltipContent");
  var TooltipContentImpl = forwardRef(
    (props, forwardedRef) => {
      const {
        __scopeTooltip,
        children,
        "aria-label": ariaLabel,
        onEscapeKeyDown,
        onPointerDownOutside,
        ...contentProps
      } = props;
      const context = useTooltipContext(CONTENT_NAME8, __scopeTooltip);
      const popperScope = usePopperScope3(__scopeTooltip);
      const { onClose } = context;
      useEffect(() => {
        document.addEventListener(TOOLTIP_OPEN, onClose);
        return () => document.removeEventListener(TOOLTIP_OPEN, onClose);
      }, [onClose]);
      useEffect(() => {
        if (context.trigger) {
          const handleScroll2 = (event) => {
            if (event.target instanceof Node && event.target.contains(context.trigger)) {
              onClose();
            }
          };
          window.addEventListener("scroll", handleScroll2, { capture: true });
          return () => window.removeEventListener("scroll", handleScroll2, { capture: true });
        }
      }, [context.trigger, onClose]);
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
                /* @__PURE__ */ jsx(VisuallyHiddenContentContextProvider, { scope: __scopeTooltip, isInside: true, children: /* @__PURE__ */ jsx(Root, { id: context.contentId, role: "tooltip", children: ariaLabel || children }) })
              ]
            }
          )
        }
      );
    }
  );
  TooltipContent.displayName = CONTENT_NAME8;
  var ARROW_NAME5 = "TooltipArrow";
  var TooltipArrow = forwardRef(
    (props, forwardedRef) => {
      const { __scopeTooltip, ...arrowProps } = props;
      const popperScope = usePopperScope3(__scopeTooltip);
      const visuallyHiddenContentContext = useVisuallyHiddenContentContext(
        ARROW_NAME5,
        __scopeTooltip
      );
      return visuallyHiddenContentContext.isInside ? null : /* @__PURE__ */ jsx(Arrow2, { ...popperScope, ...arrowProps, ref: forwardedRef });
    }
  );
  TooltipArrow.displayName = ARROW_NAME5;
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
  function getPointsFromRect(rect) {
    const { top, right, bottom, left } = rect;
    return [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom }
    ];
  }
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
  var Provider = TooltipProvider;
  var Root33 = Tooltip;
  var Trigger4 = TooltipTrigger;
  var Portal4 = TooltipPortal;
  var Content24 = TooltipContent;
  var Arrow24 = TooltipArrow;

  // node_modules/.pnpm/class-variance-authority@0.7.1/node_modules/class-variance-authority/dist/index.mjs
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

  // node_modules/.pnpm/react-resizable-panels@4.12_161ced68c111c71d90739887f576eb70/node_modules/react-resizable-panels/dist/react-resizable-panels.js
  function St(e, t) {
    const n = getComputedStyle(e), o = parseFloat(n.fontSize);
    return t * o;
  }
  function vt(e, t) {
    const n = getComputedStyle(e.ownerDocument.documentElement), o = parseFloat(n.fontSize);
    return t * o;
  }
  function bt(e) {
    return e / 100 * window.innerHeight;
  }
  function zt(e) {
    return e / 100 * window.innerWidth;
  }
  function xt(e) {
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
    const [i, s] = xt(n);
    switch (s) {
      case "%": {
        o = i / 100 * e;
        break;
      }
      case "px": {
        o = i;
        break;
      }
      case "rem": {
        o = vt(t, i);
        break;
      }
      case "em": {
        o = St(t, i);
        break;
      }
      case "vh": {
        o = bt(i);
        break;
      }
      case "vw": {
        o = zt(i);
        break;
      }
    }
    return o;
  }
  function T(e) {
    return parseFloat(e.toFixed(3));
  }
  function ne({
    group: e
  }) {
    const { orientation: t, panels: n } = e;
    return n.reduce((o, i) => (o += t === "horizontal" ? i.element.offsetWidth : i.element.offsetHeight, o), 0);
  }
  function ve(e) {
    const { panels: t } = e, n = ne({ group: e });
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
      const { element: i, panelConstraints: s } = o;
      let u2 = 0;
      if (s.collapsedSize !== void 0) {
        const c = ie({
          groupSize: n,
          panelElement: i,
          styleProp: s.collapsedSize
        });
        u2 = T(c / n * 100);
      }
      let a2;
      if (s.defaultSize !== void 0) {
        const c = ie({
          groupSize: n,
          panelElement: i,
          styleProp: s.defaultSize
        });
        a2 = T(c / n * 100);
      }
      let r3 = 0;
      if (s.minSize !== void 0) {
        const c = ie({
          groupSize: n,
          panelElement: i,
          styleProp: s.minSize
        });
        r3 = T(c / n * 100);
      }
      let l = 100;
      if (s.maxSize !== void 0) {
        const c = ie({
          groupSize: n,
          panelElement: i,
          styleProp: s.maxSize
        });
        l = T(c / n * 100);
      }
      return {
        groupResizeBehavior: s.groupResizeBehavior,
        collapsedSize: u2,
        collapsible: s.collapsible === true,
        defaultSize: a2,
        disabled: s.disabled,
        minSize: r3,
        maxSize: l,
        panelId: o.id
      };
    });
  }
  function C(e, t = "Assertion error") {
    if (!e)
      throw Error(t);
  }
  function be(e, t) {
    return Array.from(t).sort(
      e === "horizontal" ? Pt : wt
    );
  }
  function Pt(e, t) {
    const n = e.element.offsetLeft - t.element.offsetLeft;
    return n !== 0 ? n : e.element.offsetWidth - t.element.offsetWidth;
  }
  function wt(e, t) {
    const n = e.element.offsetTop - t.element.offsetTop;
    return n !== 0 ? n : e.element.offsetHeight - t.element.offsetHeight;
  }
  function Ye(e) {
    return e !== null && typeof e == "object" && "nodeType" in e && e.nodeType === Node.ELEMENT_NODE;
  }
  function Je(e, t) {
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
  function Lt({
    orientation: e,
    rects: t,
    targetRect: n
  }) {
    const o = {
      x: n.x + n.width / 2,
      y: n.y + n.height / 2
    };
    let i, s = Number.MAX_VALUE;
    for (const u2 of t) {
      const { x: a2, y: r3 } = Je(o, u2), l = e === "horizontal" ? a2 : r3;
      l < s && (s = l, i = u2);
    }
    return C(i, "No rect found"), i;
  }
  var fe;
  function Ct() {
    return fe === void 0 && (typeof matchMedia == "function" ? fe = !!matchMedia("(pointer:coarse)").matches : fe = false), fe;
  }
  function Ze(e) {
    const { element: t, orientation: n, panels: o, separators: i } = e, s = be(
      n,
      Array.from(t.children).filter(Ye).map((z) => ({ element: z }))
    ).map(({ element: z }) => z), u2 = [];
    let a2 = false, r3 = false, l = -1, c = -1, m = 0, p, S = [];
    {
      let z = -1;
      for (const f of s)
        f.hasAttribute("data-panel") && (z++, f.hasAttribute("data-disabled") || (m++, l === -1 && (l = z), c = z));
    }
    if (m > 1) {
      let z = -1;
      for (const f of s)
        if (f.hasAttribute("data-panel")) {
          z++;
          const d = o.find(
            (h) => h.element === f
          );
          if (d) {
            if (p) {
              const h = p.element.getBoundingClientRect(), y = f.getBoundingClientRect();
              let b;
              if (r3) {
                const v = n === "horizontal" ? new DOMRect(
                  h.right,
                  h.top,
                  0,
                  h.height
                ) : new DOMRect(
                  h.left,
                  h.bottom,
                  h.width,
                  0
                ), g = n === "horizontal" ? new DOMRect(y.left, y.top, 0, y.height) : new DOMRect(y.left, y.top, y.width, 0);
                switch (S.length) {
                  case 0: {
                    b = [
                      v,
                      g
                    ];
                    break;
                  }
                  case 1: {
                    const w = S[0], M = Lt({
                      orientation: n,
                      rects: [h, y],
                      targetRect: w.element.getBoundingClientRect()
                    });
                    b = [
                      w,
                      M === h ? g : v
                    ];
                    break;
                  }
                  default: {
                    b = S;
                    break;
                  }
                }
              } else
                S.length ? b = S : b = [
                  n === "horizontal" ? new DOMRect(
                    h.right,
                    y.top,
                    y.left - h.right,
                    y.height
                  ) : new DOMRect(
                    y.left,
                    h.bottom,
                    y.width,
                    y.top - h.bottom
                  )
                ];
              for (const v of b) {
                let g = "width" in v ? v : v.element.getBoundingClientRect();
                const w = Ct() ? e.resizeTargetMinimumSize.coarse : e.resizeTargetMinimumSize.fine;
                if (g.width < w) {
                  const L = w - g.width;
                  g = new DOMRect(
                    g.x - L / 2,
                    g.y,
                    g.width + L,
                    g.height
                  );
                }
                if (g.height < w) {
                  const L = w - g.height;
                  g = new DOMRect(
                    g.x,
                    g.y - L / 2,
                    g.width,
                    g.height + L
                  );
                }
                const M = z <= l || z > c;
                !a2 && !M && u2.push({
                  group: e,
                  groupSize: ne({ group: e }),
                  panels: [p, d],
                  separator: "width" in v ? void 0 : v,
                  rect: g
                }), a2 = false;
              }
            }
            r3 = false, p = d, S = [];
          }
        } else if (f.hasAttribute("data-separator")) {
          f.ariaDisabled !== null && (a2 = true);
          const d = i.find(
            (h) => h.element === f
          );
          d ? S.push(d) : (p = void 0, S = []);
        } else
          r3 = true;
    }
    return u2;
  }
  var _e;
  var Qe = class {
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
          let i = false, s = null;
          const u2 = Array.from(o);
          for (let a2 = 0; a2 < u2.length; a2++) {
            const r3 = u2[a2];
            try {
              r3.call(null, n);
            } catch (l) {
              s === null && (i = true, s = l);
            }
          }
          if (i)
            throw s;
        }
    }
    removeAllListeners() {
      __privateSet(this, _e, {});
    }
    removeListener(t, n) {
      const o = __privateGet(this, _e)[t];
      if (o !== void 0) {
        const i = o.indexOf(n);
        i >= 0 && o.splice(i, 1);
      }
    }
  };
  _e = new WeakMap();
  var ee = {
    cursorFlags: 0,
    state: "inactive"
  };
  var ze = new Qe();
  function B() {
    return ee;
  }
  function Rt(e) {
    return ze.addListener("change", e);
  }
  function Mt(e) {
    const t = ee, n = { ...ee };
    n.cursorFlags = e, ee = n, ze.emit("change", {
      prev: t,
      next: n
    });
  }
  function te(e) {
    const t = ee;
    ee = e, ze.emit("change", {
      prev: t,
      next: e
    });
  }
  var Et = (e) => e;
  var ye = () => {
  };
  var et = 1;
  var tt = 2;
  var nt = 4;
  var ot = 8;
  var Ie = 3;
  var ke = 12;
  var de;
  function De() {
    return de === void 0 && (de = false, typeof window < "u" && (window.navigator.userAgent.includes("Chrome") || window.navigator.userAgent.includes("Firefox")) && (de = true)), de;
  }
  function It({
    cursorFlags: e,
    groups: t,
    state: n
  }) {
    let o = 0, i = 0;
    switch (n) {
      case "active":
      case "hover":
        t.forEach((s) => {
          if (!s.mutableState.disableCursor)
            switch (s.orientation) {
              case "horizontal": {
                o++;
                break;
              }
              case "vertical": {
                i++;
                break;
              }
            }
        });
    }
    if (!(o === 0 && i === 0)) {
      switch (n) {
        case "active": {
          if (e && De()) {
            const s = (e & et) !== 0, u2 = (e & tt) !== 0, a2 = (e & nt) !== 0, r3 = (e & ot) !== 0;
            if (s)
              return a2 ? "se-resize" : r3 ? "ne-resize" : "e-resize";
            if (u2)
              return a2 ? "sw-resize" : r3 ? "nw-resize" : "w-resize";
            if (a2)
              return "s-resize";
            if (r3)
              return "n-resize";
          }
          break;
        }
      }
      return De() ? o > 0 && i > 0 ? "move" : o > 0 ? "ew-resize" : "ns-resize" : o > 0 && i > 0 ? "grab" : o > 0 ? "col-resize" : "row-resize";
    }
  }
  var Te = /* @__PURE__ */ new WeakMap();
  function xe(e) {
    if (e.defaultView === null || e.defaultView === void 0)
      return;
    let { prevStyle: t, styleSheet: n } = Te.get(e) ?? {};
    n === void 0 && (n = new e.defaultView.CSSStyleSheet(), e.adoptedStyleSheets && (Object.isExtensible(e.adoptedStyleSheets) ? e.adoptedStyleSheets.push(n) : e.adoptedStyleSheets = [
      ...e.adoptedStyleSheets,
      n
    ]));
    const o = B();
    switch (o.state) {
      case "active":
      case "hover": {
        const i = It({
          cursorFlags: o.cursorFlags,
          groups: o.hitRegions.map((u2) => u2.group),
          state: o.state
        }), s = `*, *:hover {cursor: ${i} !important; }`;
        if (t === s)
          return;
        t = s, i ? n.cssRules.length === 0 ? n.insertRule(s) : n.replaceSync(s) : n.cssRules.length === 1 && n.deleteRule(0);
        break;
      }
      case "inactive": {
        t = void 0, n.cssRules.length === 1 && n.deleteRule(0);
        break;
      }
    }
    Te.set(e, {
      prevStyle: t,
      styleSheet: n
    });
  }
  var F = /* @__PURE__ */ new Map();
  var it = new Qe();
  function kt(e) {
    F = new Map(F), F.delete(e);
  }
  function Oe(e, t) {
    for (const [n] of F)
      if (n.id === e)
        return n;
  }
  function H(e, t) {
    for (const [n, o] of F)
      if (n.id === e)
        return o;
    if (t)
      throw Error(`Could not find data for Group with id ${e}`);
  }
  function X2() {
    return F;
  }
  function Pe(e, t) {
    return it.addListener("groupChange", (n) => {
      n.group.id === e && t(n);
    });
  }
  function j(e, t, n) {
    const o = F.get(e);
    F = new Map(F), F.set(e, t), it.emit("groupChange", {
      group: e,
      isUserInteraction: n?.isUserInteraction === true,
      prev: o,
      next: t
    });
  }
  function rt(e) {
    const t = B();
    let n = false;
    switch (t.state) {
      case "active":
        te({
          cursorFlags: 0,
          state: "inactive"
        }), t.hitRegions.length > 0 && (xe(e), n = true, t.hitRegions.forEach((o) => {
          const i = H(o.group.id, true);
          j(o.group, i, {
            isUserInteraction: true
          });
        }));
    }
    return n;
  }
  function Ge(e) {
    e.defaultPrevented || rt(e.currentTarget);
  }
  function Dt(e, t, n) {
    let o, i = {
      x: 1 / 0,
      y: 1 / 0
    };
    for (const s of t) {
      const u2 = Je(n, s.rect);
      switch (e) {
        case "horizontal": {
          u2.x <= i.x && (o = s, i = u2);
          break;
        }
        case "vertical": {
          u2.y <= i.y && (o = s, i = u2);
          break;
        }
      }
    }
    return o ? {
      distance: i,
      hitRegion: o
    } : void 0;
  }
  function Tt(e) {
    return e !== null && typeof e == "object" && "nodeType" in e && e.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
  }
  function Ot(e, t) {
    if (e === t) throw new Error("Cannot compare node with itself");
    const n = {
      a: Ne(e),
      b: Ne(t)
    };
    let o;
    for (; n.a.at(-1) === n.b.at(-1); )
      o = n.a.pop(), n.b.pop();
    C(
      o,
      "Stacking order can only be calculated for elements with a common ancestor"
    );
    const i = {
      a: Fe(Ae(n.a)),
      b: Fe(Ae(n.b))
    };
    if (i.a === i.b) {
      const s = o.childNodes, u2 = {
        a: n.a.at(-1),
        b: n.b.at(-1)
      };
      let a2 = s.length;
      for (; a2--; ) {
        const r3 = s[a2];
        if (r3 === u2.a) return 1;
        if (r3 === u2.b) return -1;
      }
    }
    return Math.sign(i.a - i.b);
  }
  var Gt = /\b(?:position|zIndex|opacity|transform|webkitTransform|mixBlendMode|filter|webkitFilter|isolation)\b/;
  function At(e) {
    const t = getComputedStyle(st(e) ?? e).display;
    return t === "flex" || t === "inline-flex";
  }
  function Ft(e) {
    const t = getComputedStyle(e);
    return !!(t.position === "fixed" || t.zIndex !== "auto" && (t.position !== "static" || At(e)) || +t.opacity < 1 || "transform" in t && t.transform !== "none" || "webkitTransform" in t && t.webkitTransform !== "none" || "mixBlendMode" in t && t.mixBlendMode !== "normal" || "filter" in t && t.filter !== "none" || "webkitFilter" in t && t.webkitFilter !== "none" || "isolation" in t && t.isolation === "isolate" || Gt.test(t.willChange) || t.webkitOverflowScrolling === "touch");
  }
  function Ae(e) {
    let t = e.length;
    for (; t--; ) {
      const n = e[t];
      if (C(n, "Missing node"), Ft(n)) return n;
    }
    return null;
  }
  function Fe(e) {
    return e && Number(getComputedStyle(e).zIndex) || 0;
  }
  function Ne(e) {
    const t = [];
    for (; e; )
      t.push(e), e = st(e);
    return t;
  }
  function st(e) {
    const { parentNode: t } = e;
    return Tt(t) ? t.host : t;
  }
  function Nt(e, t) {
    return e.x < t.x + t.width && e.x + e.width > t.x && e.y < t.y + t.height && e.y + e.height > t.y;
  }
  function _t({
    groupElement: e,
    hitRegion: t,
    pointerEventTarget: n
  }) {
    if (!Ye(n) || n.contains(e) || e.contains(n))
      return true;
    if (Ot(n, e) > 0) {
      let o = n;
      for (; o; ) {
        if (o.contains(e))
          return true;
        if (Nt(o.getBoundingClientRect(), t))
          return false;
        o = o.parentElement;
      }
    }
    return true;
  }
  function we(e, t) {
    const n = [];
    return t.forEach((o, i) => {
      if (i.disabled)
        return;
      const s = Ze(i), u2 = Dt(i.orientation, s, {
        x: e.clientX,
        y: e.clientY
      });
      u2 && u2.distance.x <= 0 && u2.distance.y <= 0 && _t({
        groupElement: i.element,
        hitRegion: u2.hitRegion.rect,
        pointerEventTarget: e.target
      }) && n.push(u2.hitRegion);
    }), n;
  }
  function $t(e, t) {
    if (e.length !== t.length)
      return false;
    for (let n = 0; n < e.length; n++)
      if (e[n] != t[n])
        return false;
    return true;
  }
  function k(e, t, n = 0) {
    return Math.abs(T(e) - T(t)) <= n;
  }
  function A(e, t) {
    return k(e, t) ? 0 : e > t ? 1 : -1;
  }
  function Z({
    overrideDisabledPanels: e,
    panelConstraints: t,
    prevSize: n,
    size: o
  }) {
    const {
      collapsedSize: i = 0,
      collapsible: s,
      disabled: u2,
      maxSize: a2 = 100,
      minSize: r3 = 0
    } = t;
    if (u2 && !e)
      return n;
    if (A(o, r3) < 0)
      if (s) {
        const l = (i + r3) / 2;
        A(o, l) < 0 ? o = i : o = r3;
      } else
        o = r3;
    return o = Math.min(a2, o), o = T(o), o;
  }
  function le({
    delta: e,
    initialLayout: t,
    panelConstraints: n,
    pivotIndices: o,
    prevLayout: i,
    trigger: s
  }) {
    if (k(e, 0))
      return t;
    const u2 = s === "imperative-api", a2 = Object.values(t), r3 = Object.values(i), l = [...a2], [c, m] = o;
    C(c != null, "Invalid first pivot index"), C(m != null, "Invalid second pivot index");
    let p = 0;
    switch (s) {
      case "keyboard": {
        {
          const f = e < 0 ? m : c, d = n[f];
          C(
            d,
            `Panel constraints not found for index ${f}`
          );
          const {
            collapsedSize: h = 0,
            collapsible: y,
            minSize: b = 0
          } = d;
          if (y) {
            const v = a2[f];
            if (C(
              v != null,
              `Previous layout not found for panel index ${f}`
            ), k(v, h)) {
              const g = b - v;
              A(g, Math.abs(e)) > 0 && (e = e < 0 ? 0 - g : g);
            }
          }
        }
        {
          const f = e < 0 ? c : m, d = n[f];
          C(
            d,
            `No panel constraints found for index ${f}`
          );
          const {
            collapsedSize: h = 0,
            collapsible: y,
            minSize: b = 0
          } = d;
          if (y) {
            const v = a2[f];
            if (C(
              v != null,
              `Previous layout not found for panel index ${f}`
            ), k(v, b)) {
              const g = v - h;
              A(g, Math.abs(e)) > 0 && (e = e < 0 ? 0 - g : g);
            }
          }
        }
        break;
      }
      default: {
        const f = e < 0 ? m : c, d = n[f];
        C(
          d,
          `Panel constraints not found for index ${f}`
        );
        const h = a2[f], { collapsible: y, collapsedSize: b, minSize: v } = d;
        if (y && A(h, v) < 0)
          if (e > 0) {
            const g = v - b, w = g / 2, M = h + e;
            A(M, v) < 0 && (e = A(e, w) <= 0 ? 0 : g);
          } else {
            const g = v - b, w = 100 - g / 2, M = h - e;
            A(M, v) < 0 && (e = A(100 + e, w) > 0 ? 0 : -g);
          }
        break;
      }
    }
    {
      const f = e < 0 ? 1 : -1;
      let d = e < 0 ? m : c, h = 0;
      for (; ; ) {
        const b = a2[d];
        C(
          b != null,
          `Previous layout not found for panel index ${d}`
        );
        const g = Z({
          overrideDisabledPanels: u2,
          panelConstraints: n[d],
          prevSize: b,
          size: 100
        }) - b;
        if (h += g, d += f, d < 0 || d >= n.length)
          break;
      }
      const y = Math.min(Math.abs(e), Math.abs(h));
      e = e < 0 ? 0 - y : y;
    }
    {
      let d = e < 0 ? c : m;
      for (; d >= 0 && d < n.length; ) {
        const h = Math.abs(e) - Math.abs(p), y = a2[d];
        C(
          y != null,
          `Previous layout not found for panel index ${d}`
        );
        const b = y - h, v = Z({
          overrideDisabledPanels: u2,
          panelConstraints: n[d],
          prevSize: y,
          size: b
        });
        if (!k(y, v) && (p += y - v, l[d] = v, p.toFixed(3).localeCompare(Math.abs(e).toFixed(3), void 0, {
          numeric: true
        }) >= 0))
          break;
        e < 0 ? d-- : d++;
      }
    }
    if ($t(r3, l))
      return i;
    {
      const f = e < 0 ? m : c, d = a2[f];
      C(
        d != null,
        `Previous layout not found for panel index ${f}`
      );
      const h = d + p, y = Z({
        overrideDisabledPanels: u2,
        panelConstraints: n[f],
        prevSize: d,
        size: h
      });
      if (l[f] = y, !k(y, h)) {
        let b = h - y, g = e < 0 ? m : c;
        for (; g >= 0 && g < n.length; ) {
          const w = l[g];
          C(
            w != null,
            `Previous layout not found for panel index ${g}`
          );
          const M = w + b, L = Z({
            overrideDisabledPanels: u2,
            panelConstraints: n[g],
            prevSize: w,
            size: M
          });
          if (k(w, L) || (b -= L - w, l[g] = L), k(b, 0))
            break;
          e > 0 ? g-- : g++;
        }
      }
    }
    const S = Object.values(l).reduce(
      (f, d) => d + f,
      0
    );
    if (!k(S, 100, 0.1))
      return i;
    const z = Object.keys(i);
    return l.reduce((f, d, h) => (f[z[h]] = d, f), {});
  }
  function W(e, t) {
    if (Object.keys(e).length !== Object.keys(t).length)
      return false;
    for (const n in e)
      if (t[n] === void 0 || A(e[n], t[n]) !== 0)
        return false;
    return true;
  }
  function K({
    layout: e,
    panelConstraints: t
  }) {
    const n = Object.values(e), o = [...n], i = o.reduce(
      (a2, r3) => a2 + r3,
      0
    );
    if (o.length !== t.length)
      throw Error(
        `Invalid ${t.length} panel layout: ${o.map((a2) => `${a2}%`).join(", ")}`
      );
    if (!k(i, 100) && o.length > 0)
      for (let a2 = 0; a2 < t.length; a2++) {
        const r3 = o[a2];
        C(r3 != null, `No layout data found for index ${a2}`);
        const l = 100 / i * r3;
        o[a2] = l;
      }
    let s = 0;
    for (let a2 = 0; a2 < t.length; a2++) {
      const r3 = n[a2];
      C(r3 != null, `No layout data found for index ${a2}`);
      const l = o[a2];
      C(l != null, `No layout data found for index ${a2}`);
      const c = Z({
        overrideDisabledPanels: true,
        panelConstraints: t[a2],
        prevSize: r3,
        size: l
      });
      l != c && (s += l - c, o[a2] = c);
    }
    if (!k(s, 0))
      for (let a2 = 0; a2 < t.length; a2++) {
        const r3 = o[a2];
        C(r3 != null, `No layout data found for index ${a2}`);
        const l = r3 + s, c = Z({
          overrideDisabledPanels: true,
          panelConstraints: t[a2],
          prevSize: r3,
          size: l
        });
        if (r3 !== c && (s -= c - r3, o[a2] = c, k(s, 0)))
          break;
      }
    const u2 = Object.keys(e);
    return o.reduce((a2, r3, l) => (a2[u2[l]] = r3, a2), {});
  }
  function at({
    groupId: e,
    panelId: t
  }) {
    const n = () => {
      const r3 = X2();
      for (const [
        l,
        {
          defaultLayoutDeferred: c,
          derivedPanelConstraints: m,
          layout: p,
          groupSize: S,
          separatorToPanels: z
        }
      ] of r3)
        if (l.id === e)
          return {
            defaultLayoutDeferred: c,
            derivedPanelConstraints: m,
            group: l,
            groupSize: S,
            layout: p,
            separatorToPanels: z
          };
      throw Error(`Group ${e} not found`);
    }, o = () => {
      const r3 = n().derivedPanelConstraints.find(
        (l) => l.panelId === t
      );
      if (r3 !== void 0)
        return r3;
      throw Error(`Panel constraints not found for Panel ${t}`);
    }, i = () => {
      const r3 = n().group.panels.find((l) => l.id === t);
      if (r3 !== void 0)
        return r3;
      throw Error(`Layout not found for Panel ${t}`);
    }, s = () => {
      const r3 = n().layout[t];
      if (r3 !== void 0)
        return r3;
      throw Error(`Layout not found for Panel ${t}`);
    }, u2 = ({
      nextSize: r3,
      panels: l,
      prevLayout: c,
      derivedPanelConstraints: m
    }) => {
      const p = s(), S = l.findIndex((h) => h.id === t), z = S === 0, f = S === l.length - 1;
      if (f && r3 < p && (z || l.slice(0, S).every((h, y) => {
        const b = m[y];
        return b?.collapsible && k(b.collapsedSize, c[b.panelId]);
      }))) {
        const h = l.slice(0, S).reduce((y, b) => y + c[b.id], 0);
        return {
          ...c,
          [t]: T(100 - h)
        };
      }
      return le({
        delta: f ? p - r3 : r3 - p,
        initialLayout: c,
        panelConstraints: m,
        pivotIndices: f ? [S - 1, S] : [S, S + 1],
        prevLayout: c,
        trigger: "imperative-api"
      });
    }, a2 = (r3) => {
      const l = s();
      if (r3 === l)
        return;
      const {
        defaultLayoutDeferred: c,
        derivedPanelConstraints: m,
        group: p,
        groupSize: S,
        layout: z,
        separatorToPanels: f
      } = n(), d = u2({
        nextSize: r3,
        panels: p.panels,
        prevLayout: z,
        derivedPanelConstraints: m
      }), h = K({
        layout: d,
        panelConstraints: m
      });
      W(z, h) || j(p, {
        defaultLayoutDeferred: c,
        derivedPanelConstraints: m,
        groupSize: S,
        layout: h,
        separatorToPanels: f
      });
    };
    return {
      collapse: () => {
        const { collapsible: r3, collapsedSize: l } = o(), { mutableValues: c } = i(), m = s();
        r3 && m !== l && (c.expandToSize = m, a2(l));
      },
      expand: () => {
        const { collapsible: r3, collapsedSize: l, minSize: c } = o(), { mutableValues: m } = i(), p = s();
        if (r3 && p === l) {
          let S = m.expandToSize ?? c;
          S === 0 && (S = 1), a2(S);
        }
      },
      getSize: () => {
        const { group: r3 } = n(), l = s(), { element: c } = i(), m = r3.orientation === "horizontal" ? c.offsetWidth : c.offsetHeight;
        return {
          asPercentage: l,
          inPixels: m
        };
      },
      isCollapsed: () => {
        const { collapsible: r3, collapsedSize: l } = o(), c = s();
        return r3 && k(l, c);
      },
      resize: (r3) => {
        const { group: l } = n(), { element: c } = i(), m = ne({ group: l }), p = ie({
          groupSize: m,
          panelElement: c,
          styleProp: r3
        }), S = T(p / m * 100);
        a2(S);
      }
    };
  }
  function _e2(e) {
    if (e.defaultPrevented)
      return;
    const t = X2();
    we(e, t).forEach((o) => {
      if (o.separator && !o.separator.disableDoubleClick) {
        const i = o.panels.find(
          (s) => s.panelConstraints.defaultSize !== void 0
        );
        if (i) {
          const s = i.panelConstraints.defaultSize, u2 = at({
            groupId: o.group.id,
            panelId: i.id
          });
          u2 && s !== void 0 && (u2.resize(s), e.preventDefault());
        }
      }
    });
  }
  function pe(e) {
    const t = X2();
    for (const [n] of t)
      if (n.separators.some(
        (o) => o.element === e
      ))
        return n;
    throw Error("Could not find parent Group for separator element");
  }
  function lt({
    groupId: e
  }) {
    const t = () => {
      const n = X2();
      for (const [o, i] of n)
        if (o.id === e)
          return { group: o, ...i };
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
          derivedPanelConstraints: i,
          group: s,
          groupSize: u2,
          layout: a2,
          separatorToPanels: r3
        } = t(), l = K({
          layout: n,
          panelConstraints: i
        });
        return o ? a2 : (W(a2, l) || j(s, {
          defaultLayoutDeferred: o,
          derivedPanelConstraints: i,
          groupSize: u2,
          layout: l,
          separatorToPanels: r3
        }), l);
      }
    };
  }
  function U(e, t) {
    const n = pe(e), o = H(n.id, true), i = n.separators.find(
      (m) => m.element === e
    );
    C(i, "Matching separator not found");
    const s = o.separatorToPanels.get(i);
    C(s, "Matching panels not found");
    const u2 = s.map((m) => n.panels.indexOf(m)), r3 = lt({ groupId: n.id }).getLayout(), l = le({
      delta: t,
      initialLayout: r3,
      panelConstraints: o.derivedPanelConstraints,
      pivotIndices: u2,
      prevLayout: r3,
      trigger: "keyboard"
    }), c = K({
      layout: l,
      panelConstraints: o.derivedPanelConstraints
    });
    W(r3, c) || j(
      n,
      {
        defaultLayoutDeferred: o.defaultLayoutDeferred,
        derivedPanelConstraints: o.derivedPanelConstraints,
        groupSize: o.groupSize,
        layout: c,
        separatorToPanels: o.separatorToPanels
      },
      // Keyboard resizes (arrow keys, Home/End, Enter collapse/expand) originate
      // from a real DOM event on the separator, so they are user interactions
      // just like pointer drags. This function is only reached from
      // onDocumentKeyDown. See #716.
      { isUserInteraction: true }
    );
  }
  function $e(e) {
    if (e.defaultPrevented)
      return;
    const t = e.currentTarget, n = pe(t);
    if (!n.disabled)
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault(), n.orientation === "vertical" && U(t, 5);
          break;
        }
        case "ArrowLeft": {
          e.preventDefault(), n.orientation === "horizontal" && U(t, -5);
          break;
        }
        case "ArrowRight": {
          e.preventDefault(), n.orientation === "horizontal" && U(t, 5);
          break;
        }
        case "ArrowUp": {
          e.preventDefault(), n.orientation === "vertical" && U(t, -5);
          break;
        }
        case "End": {
          e.preventDefault(), U(t, 100);
          break;
        }
        case "Enter": {
          e.preventDefault();
          const o = pe(t), i = H(o.id, true), { derivedPanelConstraints: s, layout: u2, separatorToPanels: a2 } = i, r3 = o.separators.find(
            (p) => p.element === t
          );
          C(r3, "Matching separator not found");
          const l = a2.get(r3);
          C(l, "Matching panels not found");
          const c = l[0], m = s.find(
            (p) => p.panelId === c.id
          );
          if (C(m, "Panel metadata not found"), m.collapsible) {
            const p = u2[c.id], S = m.collapsedSize === p ? o.mutableState.expandedPanelSizes[c.id] ?? m.minSize : m.collapsedSize;
            U(t, S - p);
          }
          break;
        }
        case "F6": {
          e.preventDefault();
          const i = pe(t).separators.map(
            (r3) => r3.element
          ), s = Array.from(i).findIndex(
            (r3) => r3 === e.currentTarget
          );
          C(s !== null, "Index not found");
          const u2 = e.shiftKey ? s > 0 ? s - 1 : i.length - 1 : s + 1 < i.length ? s + 1 : 0;
          i[u2].focus({
            preventScroll: true
          });
          break;
        }
        case "Home": {
          e.preventDefault(), U(t, -100);
          break;
        }
      }
  }
  function je(e) {
    if (e.defaultPrevented)
      return;
    if (e.pointerType === "mouse" && e.button > 0)
      return;
    const t = X2(), n = we(e, t), o = /* @__PURE__ */ new Map();
    let i = false;
    n.forEach((s) => {
      s.separator && (i || (i = true, s.separator.element.focus({
        // @ts-expect-error https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus#browser_compatibility
        focusVisible: false,
        preventScroll: true
      })));
      const u2 = t.get(s.group);
      u2 && o.set(s.group, u2.layout);
    }), te({
      cursorFlags: 0,
      hitRegions: n,
      initialLayoutMap: o,
      pointerDownAtPoint: { x: e.clientX, y: e.clientY },
      state: "active"
    }), n.length && e.preventDefault();
  }
  function ut({
    document: e,
    event: t,
    hitRegions: n,
    initialLayoutMap: o,
    mountedGroups: i,
    pointerDownAtPoint: s,
    prevCursorFlags: u2
  }) {
    let a2 = 0;
    n.forEach((l) => {
      const { group: c, groupSize: m } = l, { orientation: p, panels: S } = c, { disableCursor: z } = c.mutableState;
      let f = 0;
      s ? p === "horizontal" ? f = (t.clientX - s.x) / m * 100 : f = (t.clientY - s.y) / m * 100 : p === "horizontal" ? f = t.clientX < 0 ? -100 : 100 : f = t.clientY < 0 ? -100 : 100;
      const d = o.get(c), h = i.get(c);
      if (!d || !h)
        return;
      const {
        defaultLayoutDeferred: y,
        derivedPanelConstraints: b,
        groupSize: v,
        layout: g,
        separatorToPanels: w
      } = h;
      if (b && g && w) {
        const M = le({
          delta: f,
          initialLayout: d,
          panelConstraints: b,
          pivotIndices: l.panels.map((L) => S.indexOf(L)),
          prevLayout: g,
          trigger: "mouse-or-touch"
        });
        if (W(M, g)) {
          if (f !== 0 && !z)
            switch (p) {
              case "horizontal": {
                a2 |= f < 0 ? et : tt;
                break;
              }
              case "vertical": {
                a2 |= f < 0 ? nt : ot;
                break;
              }
            }
        } else
          j(l.group, {
            defaultLayoutDeferred: y,
            derivedPanelConstraints: b,
            groupSize: v,
            layout: M,
            separatorToPanels: w
          });
      }
    });
    let r3 = 0;
    t.movementX === 0 ? r3 |= u2 & Ie : r3 |= a2 & Ie, t.movementY === 0 ? r3 |= u2 & ke : r3 |= a2 & ke, Mt(r3), xe(e);
  }
  function He(e) {
    const t = X2(), n = B();
    switch (n.state) {
      case "active":
        ut({
          document: e.currentTarget,
          event: e,
          hitRegions: n.hitRegions,
          initialLayoutMap: n.initialLayoutMap,
          mountedGroups: t,
          prevCursorFlags: n.cursorFlags
        });
    }
  }
  function Ve(e) {
    if (e.defaultPrevented)
      return;
    const t = B(), n = X2();
    switch (t.state) {
      case "active": {
        if (
          // Skip this check for "pointerleave" events, else Firefox triggers a false positive (see #514)
          e.buttons === 0
        ) {
          te({
            cursorFlags: 0,
            state: "inactive"
          }), t.hitRegions.forEach((o) => {
            const i = H(o.group.id, true);
            j(o.group, i, {
              isUserInteraction: true
            });
          });
          return;
        }
        for (const o of t.hitRegions)
          if (o.separator) {
            const { element: i } = o.separator;
            i.hasPointerCapture?.(e.pointerId) || i.setPointerCapture?.(e.pointerId);
          }
        ut({
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
        const o = we(e, n);
        o.length === 0 ? t.state !== "inactive" && te({
          cursorFlags: 0,
          state: "inactive"
        }) : te({
          cursorFlags: 0,
          hitRegions: o,
          state: "hover"
        }), xe(e.currentTarget);
        break;
      }
    }
  }
  function Ue(e) {
    if (e.relatedTarget instanceof HTMLIFrameElement)
      switch (B().state) {
        case "hover":
          te({
            cursorFlags: 0,
            state: "inactive"
          });
      }
  }
  function Be(e) {
    if (e.defaultPrevented)
      return;
    if (e.pointerType === "mouse" && e.button > 0)
      return;
    rt(e.currentTarget) && e.preventDefault();
  }
  function We(e) {
    let t = 0, n = 0;
    const o = {};
    for (const s of e)
      if (s.defaultSize !== void 0) {
        t++;
        const u2 = T(s.defaultSize);
        n += u2, o[s.panelId] = u2;
      } else
        o[s.panelId] = void 0;
    const i = e.length - t;
    if (i !== 0) {
      const s = T((100 - n) / i);
      for (const u2 of e)
        u2.defaultSize === void 0 && (o[u2.panelId] = s);
    }
    return o;
  }
  function jt(e, t, n) {
    if (!n[0])
      return;
    const i = e.panels.find((l) => l.element === t);
    if (!i || !i.onResize)
      return;
    const s = ne({ group: e }), u2 = e.orientation === "horizontal" ? i.element.offsetWidth : i.element.offsetHeight, a2 = i.mutableValues.prevSize, r3 = {
      asPercentage: T(u2 / s * 100),
      inPixels: u2
    };
    i.mutableValues.prevSize = r3, i.onResize(r3, i.id, a2);
  }
  function Ht(e, t) {
    if (Object.keys(e).length !== Object.keys(t).length)
      return false;
    for (const o in e)
      if (e[o] !== t[o])
        return false;
    return true;
  }
  function Vt({
    group: e,
    nextGroupSize: t,
    prevGroupSize: n,
    prevLayout: o
  }) {
    if (n <= 0 || t <= 0 || n === t)
      return o;
    let i = 0, s = 0, u2 = false;
    const a2 = /* @__PURE__ */ new Map(), r3 = [];
    for (const m of e.panels) {
      const p = o[m.id] ?? 0;
      switch (m.panelConstraints.groupResizeBehavior) {
        case "preserve-pixel-size": {
          u2 = true;
          const S = p / 100 * n, z = T(
            S / t * 100
          );
          a2.set(m.id, z), i += z;
          break;
        }
        case "preserve-relative-size":
        default: {
          r3.push(m.id), s += p;
          break;
        }
      }
    }
    if (!u2 || r3.length === 0)
      return o;
    const l = 100 - i, c = { ...o };
    if (a2.forEach((m, p) => {
      c[p] = m;
    }), s > 0)
      for (const m of r3) {
        const p = o[m] ?? 0;
        c[m] = T(
          p / s * l
        );
      }
    else {
      const m = T(
        l / r3.length
      );
      for (const p of r3)
        c[p] = m;
    }
    return c;
  }
  function Ut(e, t) {
    const n = e.map((i) => i.id), o = Object.keys(t);
    if (n.length !== o.length)
      return false;
    for (const i of n)
      if (!o.includes(i))
        return false;
    return true;
  }
  var J = /* @__PURE__ */ new Map();
  function Bt(e) {
    let t = true;
    C(
      e.element.ownerDocument.defaultView,
      "Cannot register an unmounted Group"
    );
    const n = e.element.ownerDocument.defaultView.ResizeObserver, o = /* @__PURE__ */ new Set(), i = /* @__PURE__ */ new Set(), s = new n((f) => {
      for (const d of f) {
        const { borderBoxSize: h, target: y } = d;
        if (y === e.element) {
          if (t) {
            const b = ne({ group: e });
            if (b === 0)
              return;
            const v = H(e.id);
            if (!v)
              return;
            const g = ve(e), w = v.defaultLayoutDeferred ? We(g) : v.layout, M = Vt({
              group: e,
              nextGroupSize: b,
              prevGroupSize: v.groupSize,
              prevLayout: w
            }), L = K({
              layout: M,
              panelConstraints: g
            });
            if (!v.defaultLayoutDeferred && W(v.layout, L) && Ht(
              v.derivedPanelConstraints,
              g
            ) && v.groupSize === b)
              return;
            j(e, {
              defaultLayoutDeferred: false,
              derivedPanelConstraints: g,
              groupSize: b,
              layout: L,
              separatorToPanels: v.separatorToPanels
            });
          }
        } else
          jt(e, y, h);
      }
    });
    s.observe(e.element), e.panels.forEach((f) => {
      C(
        !o.has(f.id),
        `Panel ids must be unique; id "${f.id}" was used more than once`
      ), o.add(f.id), f.onResize && s.observe(f.element);
    });
    const u2 = ne({ group: e }), a2 = ve(e), r3 = e.panels.map(({ id: f }) => f).join(",");
    let l = e.mutableState.defaultLayout;
    l && (Ut(e.panels, l) || (l = void 0));
    const c = e.mutableState.layouts[r3] ?? l ?? We(a2), m = K({
      layout: c,
      panelConstraints: a2
    }), p = e.element.ownerDocument;
    J.set(
      p,
      (J.get(p) ?? 0) + 1
    );
    const S = /* @__PURE__ */ new Map();
    return Ze(e).forEach((f) => {
      f.separator && S.set(f.separator, f.panels);
    }), j(e, {
      defaultLayoutDeferred: u2 === 0,
      derivedPanelConstraints: a2,
      groupSize: u2,
      layout: m,
      separatorToPanels: S
    }), e.separators.forEach((f) => {
      C(
        !i.has(f.id),
        `Separator ids must be unique; id "${f.id}" was used more than once`
      ), i.add(f.id), f.element.addEventListener("keydown", $e);
    }), J.get(p) === 1 && (p.addEventListener("contextmenu", Ge, true), p.addEventListener("dblclick", _e2, true), p.addEventListener("pointerdown", je, true), p.addEventListener("pointerleave", He), p.addEventListener("pointermove", Ve), p.addEventListener("pointerout", Ue), p.addEventListener("pointerup", Be, true)), function() {
      t = false, J.set(
        p,
        Math.max(0, (J.get(p) ?? 0) - 1)
      ), kt(e), e.separators.forEach((d) => {
        d.element.removeEventListener("keydown", $e);
      }), J.get(p) || (p.removeEventListener(
        "contextmenu",
        Ge,
        true
      ), p.removeEventListener(
        "dblclick",
        _e2,
        true
      ), p.removeEventListener(
        "pointerdown",
        je,
        true
      ), p.removeEventListener("pointerleave", He), p.removeEventListener("pointermove", Ve), p.removeEventListener("pointerout", Ue), p.removeEventListener("pointerup", Be, true)), s.disconnect();
    };
  }
  function Wt() {
    const [e, t] = useState({}), n = useCallback(() => t({}), []);
    return [e, n];
  }
  function Le(e) {
    const t = useId();
    return `${e ?? t}`;
  }
  var q = typeof window < "u" ? useLayoutEffect : useEffect;
  function se(e) {
    const t = useRef(e);
    return q(() => {
      t.current = e;
    }, [e]), useCallback(
      (...n) => t.current?.(...n),
      [t]
    );
  }
  function Ce(...e) {
    return se((t) => {
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
  function Re(e) {
    const t = useRef({ ...e });
    return q(() => {
      for (const n in e)
        t.current[n] = e[n];
    }, [e]), t.current;
  }
  var ct = createContext(null);
  function Kt(e, t) {
    const n = useRef({
      getLayout: () => ({}),
      setLayout: Et
    });
    useImperativeHandle(t, () => n.current, []), q(() => {
      Object.assign(
        n.current,
        lt({ groupId: e })
      );
    });
  }
  function Xt({
    children: e,
    className: t,
    defaultLayout: n,
    disableCursor: o,
    disabled: i,
    elementRef: s,
    groupRef: u2,
    id: a2,
    onLayoutChange: r3,
    onLayoutChanged: l,
    orientation: c = "horizontal",
    resizeTargetMinimumSize: m = {
      coarse: 20,
      fine: 10
    },
    style: p,
    ...S
  }) {
    const z = useRef({
      onLayoutChange: {},
      onLayoutChanged: {}
    }), f = se((x) => {
      W(z.current.onLayoutChange, x) || (z.current.onLayoutChange = x, r3?.(x));
    }), d = se(
      (x, P) => {
        W(z.current.onLayoutChanged, x) || (z.current.onLayoutChanged = x, l?.(x, { isUserInteraction: P }));
      }
    ), h = Le(a2), y = useRef(null), [b, v] = Wt(), g = useRef({
      lastExpandedPanelSizes: {},
      layouts: {},
      panels: [],
      resizeTargetMinimumSize: m,
      separators: []
    }), w = Ce(y, s);
    Kt(h, u2);
    const M = se(
      (x, P) => {
        const I = B(), R = Oe(x), E = H(x);
        if (E) {
          let D = false;
          switch (I.state) {
            case "active": {
              D = I.hitRegions.some(
                (V) => V.group === R
              );
              break;
            }
          }
          return {
            flexGrow: E.layout[P] ?? 1,
            pointerEvents: D ? "none" : void 0
          };
        }
        if (n?.[P])
          return {
            flexGrow: n?.[P]
          };
      }
    ), L = Re({
      defaultLayout: n,
      disableCursor: o
    }), G = useMemo(
      () => ({
        get disableCursor() {
          return !!L.disableCursor;
        },
        getPanelStyles: M,
        id: h,
        orientation: c,
        registerPanel: (x) => {
          const P = g.current;
          return P.panels = be(c, [
            ...P.panels,
            x
          ]), v(), () => {
            P.panels = P.panels.filter(
              (I) => I !== x
            ), v();
          };
        },
        registerSeparator: (x) => {
          const P = g.current;
          return P.separators = be(c, [
            ...P.separators,
            x
          ]), v(), () => {
            P.separators = P.separators.filter(
              (I) => I !== x
            ), v();
          };
        },
        updatePanelProps: (x, { disabled: P }) => {
          const R = g.current.panels.find(
            (V) => V.id === x
          );
          R && (R.panelConstraints.disabled = P);
          const E = Oe(h), D = H(h);
          E && D && j(E, {
            ...D,
            derivedPanelConstraints: ve(E)
          });
        },
        updateSeparatorProps: (x, {
          disabled: P,
          disableDoubleClick: I
        }) => {
          const E = g.current.separators.find(
            (D) => D.id === x
          );
          E && (E.disabled = P, E.disableDoubleClick = I);
        }
      }),
      [M, h, v, c, L]
    ), N = useRef(null);
    return q(() => {
      const x = y.current;
      if (x === null)
        return;
      const P = g.current;
      let I;
      if (L.defaultLayout !== void 0 && Object.keys(L.defaultLayout).length === P.panels.length) {
        I = {};
        for (const _ of P.panels) {
          const Y2 = L.defaultLayout[_.id];
          Y2 !== void 0 && (I[_.id] = Y2);
        }
      }
      const R = {
        disabled: !!i,
        element: x,
        id: h,
        mutableState: {
          defaultLayout: I,
          disableCursor: !!L.disableCursor,
          expandedPanelSizes: g.current.lastExpandedPanelSizes,
          layouts: g.current.layouts
        },
        orientation: c,
        panels: P.panels,
        resizeTargetMinimumSize: P.resizeTargetMinimumSize,
        separators: P.separators
      };
      N.current = R;
      const E = Bt(R), { defaultLayoutDeferred: D, derivedPanelConstraints: V, layout: ue2 } = H(R.id, true);
      !D && V.length > 0 && (f(ue2), d(ue2, false));
      const oe = Pe(h, (_) => {
        const { defaultLayoutDeferred: Y2, derivedPanelConstraints: Ee2, layout: ce2 } = _.next;
        if (Y2 || Ee2.length === 0)
          return;
        const ft = R.panels.map(({ id: $ }) => $).join(",");
        R.mutableState.layouts[ft] = ce2, Ee2.forEach(($) => {
          if ($.collapsible) {
            const { layout: ge2 } = _.prev ?? {};
            if (ge2) {
              const pt = k(
                $.collapsedSize,
                ce2[$.panelId]
              ), ht = k(
                $.collapsedSize,
                ge2[$.panelId]
              );
              pt && !ht && (R.mutableState.expandedPanelSizes[$.panelId] = ge2[$.panelId]);
            }
          }
        });
        const dt2 = B().state !== "active";
        f(ce2), dt2 && d(ce2, _.isUserInteraction);
      });
      return () => {
        N.current = null, E(), oe();
      };
    }, [
      i,
      h,
      d,
      f,
      c,
      b,
      L
    ]), useEffect(() => {
      const x = N.current;
      x && (x.mutableState.defaultLayout = n, x.mutableState.disableCursor = !!o);
    }), /* @__PURE__ */ jsx(ct.Provider, { value: G, children: /* @__PURE__ */ jsx(
      "div",
      {
        ...S,
        className: t,
        "data-group": true,
        "data-testid": h,
        id: h,
        ref: w,
        style: {
          height: "100%",
          width: "100%",
          overflow: "hidden",
          ...p,
          display: "flex",
          flexDirection: c === "horizontal" ? "row" : "column",
          flexWrap: "nowrap",
          // Inform the browser that the library is handling touch events for this element
          // but still allow users to scroll content within panels in the non-resizing direction
          // NOTE This is not an inherited style
          // See github.com/bvaughn/react-resizable-panels/issues/662
          touchAction: c === "horizontal" ? "pan-y" : "pan-x"
        },
        children: e
      }
    ) });
  }
  Xt.displayName = "Group";
  function Me() {
    const e = useContext(ct);
    return C(
      e,
      "Group Context not found; did you render a Panel or Separator outside of a Group?"
    ), e;
  }
  function Jt(e, t) {
    const { id: n } = Me(), o = useRef({
      collapse: ye,
      expand: ye,
      getSize: () => ({
        asPercentage: 0,
        inPixels: 0
      }),
      isCollapsed: () => false,
      resize: ye
    });
    useImperativeHandle(t, () => o.current, []), q(() => {
      Object.assign(
        o.current,
        at({ groupId: n, panelId: e })
      );
    });
  }
  function Zt({
    children: e,
    className: t,
    collapsedSize: n = "0%",
    collapsible: o = false,
    defaultSize: i,
    disabled: s,
    elementRef: u2,
    groupResizeBehavior: a2 = "preserve-relative-size",
    id: r3,
    maxSize: l = "100%",
    minSize: c = "0%",
    onResize: m,
    panelRef: p,
    style: S,
    ...z
  }) {
    const f = !!r3, d = Le(r3), h = Re({
      disabled: s
    }), y = useRef(null), b = Ce(y, u2), {
      getPanelStyles: v,
      id: g,
      orientation: w,
      registerPanel: M,
      updatePanelProps: L
    } = Me(), G = m !== null, N = se(
      (R, E, D) => {
        m?.(R, r3, D);
      }
    );
    q(() => {
      const R = y.current;
      if (R !== null) {
        const E = {
          element: R,
          id: d,
          idIsStable: f,
          mutableValues: {
            expandToSize: void 0,
            prevSize: void 0
          },
          onResize: G ? N : void 0,
          panelConstraints: {
            groupResizeBehavior: a2,
            collapsedSize: n,
            collapsible: o,
            defaultSize: i,
            disabled: h.disabled,
            maxSize: l,
            minSize: c
          }
        };
        return M(E);
      }
    }, [
      a2,
      n,
      o,
      i,
      G,
      d,
      f,
      l,
      c,
      N,
      M,
      h
    ]), useEffect(() => {
      L(d, { disabled: s });
    }, [s, d, L]), Jt(d, p);
    const x = () => {
      const R = v(g, d);
      if (R)
        return JSON.stringify(R);
    }, P = useSyncExternalStore(
      (R) => Pe(g, R),
      x,
      x
    );
    let I;
    return P ? I = JSON.parse(P) : i !== void 0 ? I = {
      flexGrow: void 0,
      flexShrink: void 0,
      flexBasis: i
    } : I = { flexGrow: 1 }, /* @__PURE__ */ jsx(
      "div",
      {
        ...z,
        "data-disabled": s || void 0,
        "data-panel": true,
        "data-testid": d,
        id: d,
        ref: b,
        style: {
          ...Qt,
          display: "flex",
          flexBasis: 0,
          flexShrink: 1,
          overflow: "visible",
          ...I
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
              ...S,
              // Inform the browser that the library is handling touch events for this element
              // but still allow users to scroll content within panels in the non-resizing direction
              // NOTE This is not an inherited style
              // See github.com/bvaughn/react-resizable-panels/issues/662
              touchAction: w === "horizontal" ? "pan-y" : "pan-x"
            },
            children: e
          }
        )
      }
    );
  }
  Zt.displayName = "Panel";
  var Qt = {
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
  function en({
    layout: e,
    panelConstraints: t,
    panelId: n,
    panelIndex: o
  }) {
    let i, s;
    const u2 = e[n], a2 = t.find(
      (r3) => r3.panelId === n
    );
    if (a2) {
      const r3 = a2.maxSize, l = a2.collapsible ? a2.collapsedSize : a2.minSize, c = [o, o + 1];
      s = K({
        layout: le({
          delta: l - u2,
          initialLayout: e,
          panelConstraints: t,
          pivotIndices: c,
          prevLayout: e
        }),
        panelConstraints: t
      })[n], i = K({
        layout: le({
          delta: r3 - u2,
          initialLayout: e,
          panelConstraints: t,
          pivotIndices: c,
          prevLayout: e
        }),
        panelConstraints: t
      })[n];
    }
    return {
      valueControls: n,
      valueMax: i,
      valueMin: s,
      valueNow: u2
    };
  }
  function tn({
    children: e,
    className: t,
    disabled: n,
    disableDoubleClick: o,
    elementRef: i,
    id: s,
    style: u2,
    ...a2
  }) {
    const r3 = Le(s), l = Re({
      disabled: n,
      disableDoubleClick: o
    }), [c, m] = useState({}), [p, S] = useState("inactive"), [z, f] = useState(false), d = useRef(null), h = Ce(d, i), {
      disableCursor: y,
      id: b,
      orientation: v,
      registerSeparator: g,
      updateSeparatorProps: w
    } = Me(), M = v === "horizontal" ? "vertical" : "horizontal";
    q(() => {
      const N = d.current;
      if (N !== null) {
        const x = {
          disabled: l.disabled,
          disableDoubleClick: l.disableDoubleClick,
          element: N,
          id: r3
        }, P = g(x), I = Rt(
          (E) => {
            S(
              E.next.state !== "inactive" && E.next.hitRegions.some(
                (D) => D.separator === x
              ) ? E.next.state : "inactive"
            );
          }
        ), R = Pe(
          b,
          (E) => {
            const { derivedPanelConstraints: D, layout: V, separatorToPanels: ue2 } = E.next, oe = ue2.get(x);
            if (oe) {
              const _ = oe[0], Y2 = oe.indexOf(_);
              m(
                en({
                  layout: V,
                  panelConstraints: D,
                  panelId: _.id,
                  panelIndex: Y2
                })
              );
            }
          }
        );
        return () => {
          I(), R(), P();
        };
      }
    }, [b, r3, g, l]), useEffect(() => {
      w(r3, { disabled: n, disableDoubleClick: o });
    }, [n, o, r3, w]);
    let L;
    n && !y && (L = "not-allowed");
    let G;
    if (n)
      G = "disabled";
    else
      switch (p) {
        case "active": {
          G = "active";
          break;
        }
        default:
          z ? G = "focus" : G = p;
      }
    return /* @__PURE__ */ jsx(
      "div",
      {
        ...a2,
        "aria-controls": c.valueControls,
        "aria-disabled": n || void 0,
        "aria-orientation": M,
        "aria-valuemax": c.valueMax,
        "aria-valuemin": c.valueMin,
        "aria-valuenow": c.valueNow,
        children: e,
        className: t,
        "data-separator": G,
        "data-testid": r3,
        id: r3,
        onBlur: () => f(false),
        onFocus: () => f(true),
        ref: h,
        role: "separator",
        style: {
          flexBasis: "auto",
          cursor: L,
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
  tn.displayName = "Separator";

  // packages/shadcn-ui/dist/index.js
  function r2(...e) {
    return twMerge(clsx(e));
  }
  var le2 = cva(
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
  function C2({
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
        className: r2(le2({ variant: t, size: o, className: e })),
        ...i
      }
    );
  }
  function tt2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports4.Root, { "data-slot": "alert-dialog", ...e });
  }
  function ue({
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
    return /* @__PURE__ */ jsxs(ue, { children: [
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
  function nt2({
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
  function dt({
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
    return /* @__PURE__ */ jsx(C2, { variant: t, size: o, asChild: true, children: /* @__PURE__ */ jsx(
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
    return /* @__PURE__ */ jsx(C2, { variant: t, size: o, asChild: true, children: /* @__PURE__ */ jsx(
      dist_exports4.Cancel,
      {
        "data-slot": "alert-dialog-cancel",
        className: r2(e),
        ...n
      }
    ) });
  }
  var ge = cva(
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
        className: r2(ge({ variant: t }), e),
        ...n
      }
    );
  }
  function St2({
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
  function pe2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports3.Root, { "data-slot": "dialog", ...e });
  }
  function fe2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports3.Portal, { "data-slot": "dialog-portal", ...e });
  }
  function me({
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
      /* @__PURE__ */ jsx(me, {}),
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
              C2,
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
  function ve2({ className: e, ...t }) {
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
          t && /* @__PURE__ */ jsx(dist_exports3.Close, { asChild: true, children: /* @__PURE__ */ jsx(C2, { variant: "outline", children: "Close" }) })
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
  function xe2({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports3.Description,
      {
        "data-slot": "dialog-description",
        className: r2(
          "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
          e
        ),
        ...t
      }
    );
  }
  function Z2({ className: e, type: t, ...o }) {
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
  function Ma({
    className: e,
    value: t,
    ...o
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports10.Root,
      {
        "data-slot": "progress",
        className: r2(
          "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
          e
        ),
        ...o,
        children: /* @__PURE__ */ jsx(
          dist_exports10.Indicator,
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
      dist_exports11.Root,
      {
        "data-slot": "scroll-area",
        className: r2("relative", e),
        ...o,
        children: [
          /* @__PURE__ */ jsx(
            dist_exports11.Viewport,
            {
              "data-slot": "scroll-area-viewport",
              className: "size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1",
              children: t
            }
          ),
          /* @__PURE__ */ jsx(Ce2, {}),
          /* @__PURE__ */ jsx(dist_exports11.Corner, {})
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
      dist_exports11.ScrollAreaScrollbar,
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
          dist_exports11.ScrollAreaThumb,
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
    return /* @__PURE__ */ jsx(dist_exports12.Root, { "data-slot": "select", ...e });
  }
  function $a({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports12.Value, { "data-slot": "select-value", ...e });
  }
  function Ea({
    className: e,
    size: t = "default",
    children: o,
    ...n
  }) {
    return /* @__PURE__ */ jsxs(
      dist_exports12.Trigger,
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
          /* @__PURE__ */ jsx(dist_exports12.Icon, { asChild: true, children: /* @__PURE__ */ jsx(ChevronDown, { className: "pointer-events-none size-4 text-muted-foreground" }) })
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
    return /* @__PURE__ */ jsx(dist_exports12.Portal, { children: /* @__PURE__ */ jsxs(
      dist_exports12.Content,
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
            dist_exports12.Viewport,
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
      dist_exports12.Item,
      {
        "data-slot": "select-item",
        className: r2(
          "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
          e
        ),
        ...o,
        children: [
          /* @__PURE__ */ jsx("span", { className: "pointer-events-none absolute right-2 flex size-4 items-center justify-center", children: /* @__PURE__ */ jsx(dist_exports12.ItemIndicator, { children: /* @__PURE__ */ jsx(Check, { className: "pointer-events-none" }) }) }),
          /* @__PURE__ */ jsx(dist_exports12.ItemText, { children: t })
        ]
      }
    );
  }
  function Se({
    className: e,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports12.ScrollUpButton,
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
      dist_exports12.ScrollDownButton,
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
              C2,
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
  function Ae2({ className: e, ...t }) {
    return /* @__PURE__ */ jsx(
      "div",
      {
        "data-slot": "sheet-header",
        className: r2("flex flex-col gap-0.5 p-4", e),
        ...t
      }
    );
  }
  function Pe2({
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
  function Wa({
    delayDuration: e = 0,
    ...t
  }) {
    return /* @__PURE__ */ jsx(
      dist_exports13.Provider,
      {
        "data-slot": "tooltip-provider",
        delayDuration: e,
        ...t
      }
    );
  }
  function Be2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports13.Root, { "data-slot": "tooltip", ...e });
  }
  function $e2({
    ...e
  }) {
    return /* @__PURE__ */ jsx(dist_exports13.Trigger, { "data-slot": "tooltip-trigger", ...e });
  }
  function Ee({
    className: e,
    sideOffset: t = 0,
    children: o,
    ...n
  }) {
    return /* @__PURE__ */ jsx(dist_exports13.Portal, { children: /* @__PURE__ */ jsxs(
      dist_exports13.Content,
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
          /* @__PURE__ */ jsx(dist_exports13.Arrow, { className: "z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" })
        ]
      }
    ) });
  }
  var Le2 = 3600 * 24 * 7;
  var J2 = createContext(null);
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
  var Q = createContext({
    size: "default",
    variant: "default",
    spacing: 2,
    orientation: "horizontal"
  });

  // community/apps/resume-screen/src/lib/remote-components/resume-screen/src/components/badges.tsx
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
  function UploadBadge({ status }) {
    const spec = status === "queued" ? { label: "\u6392\u961F\u4E2D", tone: "tone-neutral" } : status === "uploading" ? { label: "\u4E0A\u4F20\u4E2D", tone: "tone-blue", icon: "ri-loader-4-line", spin: true, hint: "\u4E0A\u4F20\u5E76\u7531\u670D\u52A1\u7AEF\u89E3\u6790\u4E2D" } : status === "created" ? { label: "\u5DF2\u521B\u5EFA", tone: "tone-green", icon: "ri-check-line" } : status === "skipped" ? { label: "\u8DF3\u8FC7(\u91CD\u590D)", tone: "tone-neutral" } : { label: "\u5931\u8D25", tone: "tone-red", icon: "ri-error-warning-line" };
    if (!spec) return null;
    return /* @__PURE__ */ react_shim_default.createElement("span", { className: `rs-badge ${spec.tone}`, title: spec.hint ?? spec.label }, spec.icon ? /* @__PURE__ */ react_shim_default.createElement("i", { className: spec.spin ? `${spec.icon} rs-spin` : spec.icon, "aria-hidden": "true" }) : null, spec.label);
  }

  // community/apps/resume-screen/src/lib/remote-components/resume-screen/src/components/candidate-list.tsx
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
    function liveRows() {
      return items.some((item) => item.leaving) ? items.filter((item) => !item.leaving) : items;
    }
    const sortValue = `${sortBy}:${sortDir}`;
    const sortLabel = SORT_OPTIONS.find((option) => sortValue === option.value)?.label ?? "\u5339\u914D\u5206\u964D\u5E8F";
    const sortActive = sortValue !== "matchScore:desc";
    const shown = liveRows().length;
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
    )), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-list-filter" }, /* @__PURE__ */ react_shim_default.createElement(ja, { value: status, onValueChange: (value) => props.onStatusChange(value) }, /* @__PURE__ */ react_shim_default.createElement(Ea, { "aria-label": "\u72B6\u6001\u7B5B\u9009", className: "rs-status-select" }, /* @__PURE__ */ react_shim_default.createElement($a, null)), /* @__PURE__ */ react_shim_default.createElement(Oa, { position: "popper", collisionPadding: 8 }, STATUS_OPTIONS.map((option) => /* @__PURE__ */ react_shim_default.createElement(Ha, { key: option.value, value: option.value }, option.label)))), /* @__PURE__ */ react_shim_default.createElement(Wa, { delayDuration: 300 }, /* @__PURE__ */ react_shim_default.createElement(Be2, null, /* @__PURE__ */ react_shim_default.createElement($e2, { asChild: true }, /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "outline", size: "sm", className: "rs-toolbar-button", onClick: props.onUploadRequest }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-upload-cloud-2-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-header-label" }, "\u4E0A\u4F20\u7B80\u5386"))), /* @__PURE__ */ react_shim_default.createElement(Ee, { side: "bottom", collisionPadding: 8 }, "\u652F\u6301 .docx / .pdf\uFF0C\u5355\u6587\u4EF6 \u2264 10MB\uFF0C\u53EF\u591A\u9009"))), /* @__PURE__ */ react_shim_default.createElement(ia, null, /* @__PURE__ */ react_shim_default.createElement(sa, { asChild: true }, /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "ghost", size: "sm", className: `rs-toolbar-button${sortActive ? " is-active" : ""}`, title: "\u6392\u5E8F" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-arrow-up-down-line", "aria-hidden": "true" }), sortLabel)), /* @__PURE__ */ react_shim_default.createElement(la, { align: "end", collisionPadding: 8 }, /* @__PURE__ */ react_shim_default.createElement(ma, null, "\u6392\u5E8F"), /* @__PURE__ */ react_shim_default.createElement(pa, { value: sortValue, onValueChange: props.onSortChange }, SORT_OPTIONS.map((option) => /* @__PURE__ */ react_shim_default.createElement(fa, { key: option.value, value: option.value }, option.label)))))), search ? /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-search-chip" }, /* @__PURE__ */ react_shim_default.createElement(vt2, { variant: "secondary" }, "\u641C\u7D22\u4E2D\u300C", search, "\u300D"), /* @__PURE__ */ react_shim_default.createElement(
      C2,
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
            props.onMoveSelection(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            props.onMoveSelection(-1);
          } else if (event.key === "Enter" && selectedId) {
            props.onSelect(selectedId);
          }
        }
      },
      loading && shown === 0 ? /* @__PURE__ */ react_shim_default.createElement(ListSkeleton, null) : null,
      !loading && shown === 0 && !items.some((item) => item.leaving) ? /* @__PURE__ */ react_shim_default.createElement(EmptyState, { ...props }) : null,
      items.map((item, index2) => /* @__PURE__ */ react_shim_default.createElement(
        CandidateItem,
        {
          key: item.id,
          candidate: item,
          selected: item.id === selectedId,
          leaving: item.leaving === true,
          timedOut: props.isTimedOut(item),
          enterDelay: enteringIds.has(item.id) ? Math.min(index2, 9) * 40 : null,
          jump: props.jumpCandidateId === item.id,
          onJumpConsumed: props.onJumpConsumed,
          onSelect: props.onSelect
        }
      ))
    ), /* @__PURE__ */ react_shim_default.createElement("footer", { className: "rs-list-foot" }, shown > 0 && shown < total ? /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "ghost", size: "sm", onClick: props.onLoadMore, disabled: overCap }, "\u52A0\u8F7D\u66F4\u591A") : null, /* @__PURE__ */ react_shim_default.createElement("span", { "aria-live": "polite" }, overCap ? "\u5DF2\u8FBE\u5C55\u793A\u4E0A\u9650\uFF0C\u8BF7\u7528\u7B5B\u9009\u7F29\u5C0F\u8303\u56F4" : `\u5DF2\u663E\u793A ${shown} / \u5171 ${total}`)));
  }
  function ListSkeleton() {
    return /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-list-skeleton", "aria-hidden": "true" }, Array.from({ length: 6 }, (_, index2) => /* @__PURE__ */ react_shim_default.createElement("div", { key: index2, className: "rs-sk-row" }, /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-avatar" }), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-sk-lines" }, /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-line rs-sk-half" }), /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-line rs-sk-two-thirds" })), /* @__PURE__ */ react_shim_default.createElement(K2, { className: "rs-sk-line rs-sk-score" }))));
  }
  function EmptyState({ hasJobs, hasFilterActive, onUploadRequest, onCreateJobRequest, onClearFilters }) {
    if (!hasJobs) {
      return /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-empty" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-briefcase-line rs-empty-icon", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("strong", null, "\u8FD8\u6CA1\u6709\u5C97\u4F4D\uFF0C\u5148\u65B0\u5EFA\u4E00\u4E2A\u5C97\u4F4D"), /* @__PURE__ */ react_shim_default.createElement("small", null, "\u5C97\u4F4D\u63CF\u8FF0\uFF08JD\uFF09\u662F AI \u5339\u914D\u8BC4\u5206\u7684\u4F9D\u636E"), /* @__PURE__ */ react_shim_default.createElement(C2, { onClick: onCreateJobRequest }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-add-line", "aria-hidden": "true" }), "\u65B0\u5EFA\u5C97\u4F4D"));
    }
    if (hasFilterActive) {
      return /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-empty" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-filter-3-line rs-empty-icon", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("strong", null, "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u5019\u9009\u4EBA"), /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "outline", onClick: onClearFilters }, "\u6E05\u9664\u7B5B\u9009"));
    }
    return /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-empty" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-upload-cloud-line rs-empty-icon", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("strong", null, "\u6682\u65E0\u5019\u9009\u4EBA\uFF0C\u4E0A\u4F20\u7B80\u5386\u6587\u4EF6\u5F00\u59CB\u521D\u7B5B"), /* @__PURE__ */ react_shim_default.createElement("small", null, "\u652F\u6301 .docx / .pdf\uFF0C\u53EF\u591A\u9009"), /* @__PURE__ */ react_shim_default.createElement(C2, { onClick: onUploadRequest }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-upload-cloud-line", "aria-hidden": "true" }), "\u4E0A\u4F20\u7B80\u5386\u6587\u4EF6"));
  }
  var CandidateItem = memo2(function CandidateItem2({ candidate, selected, leaving, timedOut, enterDelay, jump, onJumpConsumed, onSelect }) {
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
        className: `rs-item${enterDelay !== null ? " rs-enter" : ""}${jump ? " rs-jump" : ""}${leaving ? " rs-leaving" : ""}`,
        style: enterDelay !== null ? { "--rs-stagger": `${enterDelay}ms` } : void 0,
        role: "option",
        "aria-selected": selected,
        "aria-current": selected ? "true" : void 0,
        "aria-hidden": leaving ? true : void 0,
        tabIndex: -1,
        onClick: () => {
          if (!leaving) onSelect(candidate.id);
        }
      },
      /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-mark", style: { background: statusAccent(candidate.status, timedOut) }, "aria-hidden": "true" }, name.slice(0, 1)),
      /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-item-main" }, /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-item-title" }, /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-item-name", title: name }, name), candidate.sourceFileName ? /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-file-line rs-item-source", title: `\u6765\u6E90\uFF1A${candidate.sourceFileName}`, "aria-label": `\u6765\u6E90\u6587\u4EF6 ${candidate.sourceFileName}` }) : null, /* @__PURE__ */ react_shim_default.createElement(CandidateBadge, { status: candidate.status, timedOut })), /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-item-meta", title: subtitle }, subtitle)),
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

  // community/apps/resume-screen/src/lib/remote-components/resume-screen/src/components/action-bar.tsx
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
        C2,
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
      tt2,
      {
        open: confirmReject,
        onOpenChange: (open) => {
          if (!busy) setConfirmReject(open);
        }
      },
      /* @__PURE__ */ react_shim_default.createElement(rt2, null, /* @__PURE__ */ react_shim_default.createElement(ot2, null, /* @__PURE__ */ react_shim_default.createElement(dt, null, "\u6DD8\u6C70\u8BE5\u5019\u9009\u4EBA\uFF1F"), /* @__PURE__ */ react_shim_default.createElement(st2, null, "\u8BE5\u5019\u9009\u4EBA\u5C06\u6807\u8BB0\u4E3A\u6DD8\u6C70\uFF0C\u53EF\u64A4\u56DE\u3002")), /* @__PURE__ */ react_shim_default.createElement(nt2, null, /* @__PURE__ */ react_shim_default.createElement(ut2, { variant: "outline", size: "sm" }, "\u53D6\u6D88"), /* @__PURE__ */ react_shim_default.createElement(
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

  // community/apps/resume-screen/src/lib/remote-components/resume-screen/src/components/candidate-detail.tsx
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
    return /* @__PURE__ */ react_shim_default.createElement("div", { key: candidate.id, className: "rs-detail-stack rs-detail-anim" }, /* @__PURE__ */ react_shim_default.createElement(Wa, { delayDuration: 300 }, /* @__PURE__ */ react_shim_default.createElement(DetailBody, { ...props, candidate })));
  }
  function DetailBody({ candidate, timedOut, showTimeoutCard, now, busyKey, onDispose, onWaitMore, onSave, onConflictRefresh, onPreview }) {
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
    return /* @__PURE__ */ react_shim_default.createElement(react_shim_default.Fragment, null, /* @__PURE__ */ react_shim_default.createElement("header", { className: "rs-detail-head" }, /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-detail-avatar", style: { background: statusAccent(candidate.status, timedOut) }, "aria-hidden": "true" }, (candidate.name || candidate.sourceFileName || "?").slice(0, 1)), /* @__PURE__ */ react_shim_default.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-detail-title" }, /* @__PURE__ */ react_shim_default.createElement("strong", { title: candidate.name || candidate.sourceFileName || void 0 }, candidate.name || candidate.sourceFileName || "\u672A\u547D\u540D\u5019\u9009\u4EBA"), /* @__PURE__ */ react_shim_default.createElement(CandidateBadge, { status: candidate.status, timedOut }), editedFields.length > 0 ? /* @__PURE__ */ react_shim_default.createElement(Be2, null, /* @__PURE__ */ react_shim_default.createElement($e2, { asChild: true }, /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-badge rs-badge-edit" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-edit-2-line", "aria-hidden": "true" }), "\u4EBA\u5DE5\u4FEE\u6B63 ", editedFields.length, " \u9879")), /* @__PURE__ */ react_shim_default.createElement(Ee, { collisionPadding: 8 }, editedFields.map((field) => FIELD_LABELS[field] ?? field).join("\u3001"), " \u5DF2\u88AB\u4EBA\u5DE5\u4FEE\u6B63\uFF0CAI \u91CD\u65B0\u89E3\u6790\u4E0D\u4F1A\u8986\u76D6")) : null), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-detail-meta" }, /* @__PURE__ */ react_shim_default.createElement("span", null, [candidate.yearsOfExperience, candidate.education, candidate.currentCompany].filter(Boolean).join(" \xB7 ") || "\u2014"), /* @__PURE__ */ react_shim_default.createElement("span", null, "\u521B\u5EFA\u4E8E ", formatMonthDay(candidate.createdAt) || "\u2014"), /* @__PURE__ */ react_shim_default.createElement("span", null, "\u7B2C ", candidate.attemptCount || 1, " \u6B21\u89E3\u6790"), candidate.sourceFileName ? /* @__PURE__ */ react_shim_default.createElement(Be2, null, /* @__PURE__ */ react_shim_default.createElement($e2, { asChild: true }, /* @__PURE__ */ react_shim_default.createElement("span", null, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-file-line", "aria-hidden": "true" }), "\u6765\u6E90 ", candidate.sourceFileName)), /* @__PURE__ */ react_shim_default.createElement(Ee, { collisionPadding: 8 }, candidate.sourceFileName)) : null, /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-detail-preview" }, /* @__PURE__ */ react_shim_default.createElement(Be2, null, /* @__PURE__ */ react_shim_default.createElement($e2, { asChild: true }, /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "ghost", size: "sm", disabled: !candidate.hasFile, onClick: () => void onPreview(candidate) }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-file-search-line", "aria-hidden": "true" }), "\u9884\u89C8\u7B80\u5386")), candidate.hasFile ? null : /* @__PURE__ */ react_shim_default.createElement(Ee, { collisionPadding: 8 }, "\u65E7\u6570\u636E\u672A\u4FDD\u7559\u539F\u59CB\u6587\u4EF6\uFF0C\u8BF7\u91CD\u65B0\u4E0A\u4F20\u7B80\u5386\u540E\u9884\u89C8")))))), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-detail-body" }, /* @__PURE__ */ react_shim_default.createElement(Ga, { className: "rs-detail-scroll" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-detail-pad" }, stashed && !editing ? /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-notice rs-notice-inline tone-amber", role: "status", style: { position: "static", marginTop: 0 } }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-edit-2-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("div", { style: { minWidth: 0 } }, "\u4F60\u7684\u4FEE\u6539\u5DF2\u6682\u5B58\uFF0C\u53EF\u70B9\u51FB\u300C\u7F16\u8F91\u300D\u6062\u590D")) : null, isFailed ? (
      // 失败覆盖态：告示卡（红变体 role=alert）+ 原因全文 + 重试；四区块隐藏（§3.5/§6.3）
      /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-notice rs-notice-inline", role: "alert", style: { position: "static" } }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-error-warning-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ react_shim_default.createElement("div", null, "\u89E3\u6790\u5931\u8D25\uFF1A", candidate.failureReason || "\u672A\u77E5\u539F\u56E0"), (candidate.attemptCount ?? 0) > 2 ? /* @__PURE__ */ react_shim_default.createElement("div", { style: { marginTop: 4, fontSize: 12 } }, "\u591A\u6B21\u5931\u8D25\uFF0C\u5EFA\u8BAE\u68C0\u67E5\u6A21\u578B\u51ED\u8BC1\uFF1B\u82E5\u539F\u6587\u62BD\u53D6\u5B57\u6BB5\u6709\u8BEF\uFF0C\u53EF\u7528\u300C\u7F16\u8F91\u300D\u4EBA\u5DE5\u4FEE\u6B63") : null, /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "outline", size: "sm", style: { marginTop: 8 }, disabled: busyKey !== null, onClick: () => void onDispose("retry_candidate") }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-restart-line", "aria-hidden": "true" }), "\u91CD\u8BD5")))
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
    ) : /* @__PURE__ */ react_shim_default.createElement(ViewBody, { candidate })))), editing ? /* @__PURE__ */ react_shim_default.createElement("footer", { className: "rs-detail-foot", "aria-busy": saving }, /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "ghost", size: "sm", onClick: cancelEdit }, "\u53D6\u6D88"), /* @__PURE__ */ react_shim_default.createElement(C2, { size: "sm", disabled: saving, onClick: () => void submitSave() }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-save-line", "aria-hidden": "true" }), saving ? "\u63D0\u4EA4\u4E2D\u2026" : "\u4FDD\u5B58")) : isParsing || isFailed ? null : /* @__PURE__ */ react_shim_default.createElement(
      ActionBar,
      {
        candidate,
        timedOut,
        busyKey,
        onDispose,
        onEdit: startEdit
      }
    ), /* @__PURE__ */ react_shim_default.createElement(
      tt2,
      {
        open: conflict.open,
        onOpenChange: (open) => {
          if (!open) setConflict({ open: false, message: "" });
        }
      },
      /* @__PURE__ */ react_shim_default.createElement(rt2, null, /* @__PURE__ */ react_shim_default.createElement(ot2, null, /* @__PURE__ */ react_shim_default.createElement(dt, null, "\u8BE5\u5019\u9009\u4EBA\u5DF2\u88AB\u5176\u4ED6\u4EBA\u66F4\u65B0"), /* @__PURE__ */ react_shim_default.createElement(st2, null, "\u4E3A\u907F\u514D\u8986\u76D6\u4ED6\u4EBA\u4FEE\u6539\uFF0C\u672C\u6B21\u4FDD\u5B58\u672A\u751F\u6548\u3002\u8BF7\u5148\u67E5\u770B\u6700\u65B0\u5185\u5BB9\uFF0C\u518D\u51B3\u5B9A\u662F\u5426\u91CD\u65B0\u4FEE\u6539\u3002")), /* @__PURE__ */ react_shim_default.createElement(nt2, null, /* @__PURE__ */ react_shim_default.createElement(
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
    return /* @__PURE__ */ react_shim_default.createElement("div", null, showTimeoutCard ? /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-notice rs-notice-inline tone-amber", role: "alert", style: { position: "static", marginTop: 0 } }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-timer-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("div", null, /* @__PURE__ */ react_shim_default.createElement("div", null, "\u8BE5\u7B80\u5386\u89E3\u6790\u5DF2\u8D85\u8FC7 10 \u5206\u949F\uFF0C\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u91CD\u6295\uFF1B\u82E5\u4ECD\u672A\u5B8C\u6210\uFF0C\u53EF\u70B9\u51FB\u91CD\u8BD5\u3002"), /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "flex", gap: 8, marginTop: 8 } }, /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "outline", size: "sm", disabled: busyKey !== null, onClick: () => void onDispose("retry_candidate") }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-restart-line", "aria-hidden": "true" }), "\u91CD\u8BD5"), /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "ghost", size: "sm", onClick: () => onWaitMore(candidate.id) }, "\u518D\u7B49\u7B49")))) : (
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
      /* @__PURE__ */ react_shim_default.createElement(St2, { open: reasonExpanded, onOpenChange: setReasonExpanded, style: { marginTop: 10 } }, /* @__PURE__ */ react_shim_default.createElement(Tt2, { forceMount: true, hidden: false }, /* @__PURE__ */ react_shim_default.createElement("div", { className: `rs-reason${reasonExpanded ? "" : " is-collapsed"}` }, candidate.matchReason)), /* @__PURE__ */ react_shim_default.createElement(_t2, { asChild: true }, /* @__PURE__ */ react_shim_default.createElement("button", { type: "button", className: "rs-expand" }, reasonExpanded ? "\u6536\u8D77" : "\u5C55\u5F00")))
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
    return /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-form" }, /* @__PURE__ */ react_shim_default.createElement("label", { className: "rs-form-field" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u59D3\u540D", /* @__PURE__ */ react_shim_default.createElement("small", null, "\u6587\u672C")), /* @__PURE__ */ react_shim_default.createElement(Z2, { autoFocus: true, value: draft.name ?? "", onChange: (event) => onField("name", event.currentTarget.value) })), /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 } }, /* @__PURE__ */ react_shim_default.createElement("label", { className: "rs-form-field" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u5E74\u9650", /* @__PURE__ */ react_shim_default.createElement("small", null, "\u5982 5\u5E74")), /* @__PURE__ */ react_shim_default.createElement(Z2, { value: draft.yearsOfExperience ?? "", onChange: (event) => onField("yearsOfExperience", event.currentTarget.value) })), /* @__PURE__ */ react_shim_default.createElement("label", { className: "rs-form-field" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u5B66\u5386"), /* @__PURE__ */ react_shim_default.createElement(Z2, { value: draft.education ?? "", onChange: (event) => onField("education", event.currentTarget.value) }))), /* @__PURE__ */ react_shim_default.createElement("label", { className: "rs-form-field" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u5F53\u524D\u516C\u53F8"), /* @__PURE__ */ react_shim_default.createElement(Z2, { value: draft.currentCompany ?? "", onChange: (event) => onField("currentCompany", event.currentTarget.value) })), /* @__PURE__ */ react_shim_default.createElement("label", { className: "rs-form-field" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u6280\u80FD", /* @__PURE__ */ react_shim_default.createElement("small", null, "\u8F93\u5165\u540E Enter \u6216\u70B9\u300C\u6DFB\u52A0\u300D")), /* @__PURE__ */ react_shim_default.createElement("div", { style: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 6 } }, /* @__PURE__ */ react_shim_default.createElement(
      Z2,
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
    ), /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "outline", size: "sm", onClick: onAddSkill }, "\u6DFB\u52A0")), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-chip-row" }, (draft.skills ?? []).map((skill) => /* @__PURE__ */ react_shim_default.createElement("span", { key: skill, className: "rs-chip rs-chip-edit" }, skill, /* @__PURE__ */ react_shim_default.createElement("button", { type: "button", "aria-label": `\u5220\u9664\u6280\u80FD ${skill}`, onClick: () => onRemoveSkill(skill) }, "\xD7"))))), /* @__PURE__ */ react_shim_default.createElement("label", { className: "rs-form-field" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u5339\u914D\u5206", /* @__PURE__ */ react_shim_default.createElement("small", null, "0\u2013100")), /* @__PURE__ */ react_shim_default.createElement(
      Z2,
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

  // community/apps/resume-screen/src/lib/remote-components/resume-screen/src/components/job-header.tsx
  var { useEffect: useEffect3, useRef: useRef3, useState: useState5 } = react_shim_default;
  var MIN_JD_LENGTH = 30;
  var MAX_TITLE_LENGTH = 200;
  function JobHeader({ jobs, currentJobId, busy, refreshing, jobPulseSeq, xsMode, onSelectJob, onCreateJob, onRefresh }) {
    const [createOpen, setCreateOpen] = useState5(false);
    const jobSelectRef = useRef3(null);
    useEffect3(() => {
      const openDialog = () => setCreateOpen(true);
      window.addEventListener("rs:open-create-job", openDialog);
      return () => window.removeEventListener("rs:open-create-job", openDialog);
    }, []);
    useEffect3(() => {
      if (jobPulseSeq === 0) return;
      const node = jobSelectRef.current?.querySelector('[data-slot="select-trigger"]');
      if (!node) return;
      node.classList.remove("rs-pulse-job");
      void node.offsetWidth;
      node.classList.add("rs-pulse-job");
    }, [jobPulseSeq]);
    return /* @__PURE__ */ react_shim_default.createElement("header", { className: "rs-header" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-briefcase-line rs-job-icon", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-job-select", ref: jobSelectRef }, /* @__PURE__ */ react_shim_default.createElement(ja, { value: currentJobId ?? void 0, onValueChange: onSelectJob }, /* @__PURE__ */ react_shim_default.createElement(Ea, { "aria-label": "\u9009\u62E9\u5C97\u4F4D" }, /* @__PURE__ */ react_shim_default.createElement($a, { placeholder: "\u9009\u62E9\u5C97\u4F4D" })), /* @__PURE__ */ react_shim_default.createElement(Oa, { position: "popper", collisionPadding: 8 }, jobs.map((job) => /* @__PURE__ */ react_shim_default.createElement(Ha, { key: job.id, value: job.id }, job.title))))), /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-header-spacer" }), xsMode ? (
      // 超窄容器：新建/刷新收纳进「更多」下拉（蓝图 §4 <560px 断点）
      /* @__PURE__ */ react_shim_default.createElement(ia, null, /* @__PURE__ */ react_shim_default.createElement(sa, { asChild: true }, /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "ghost", size: "icon", title: "\u66F4\u591A\u64CD\u4F5C", "aria-label": "\u66F4\u591A\u64CD\u4F5C" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-more-line", "aria-hidden": "true" }))), /* @__PURE__ */ react_shim_default.createElement(la, { align: "end", collisionPadding: 8 }, /* @__PURE__ */ react_shim_default.createElement(ca, { disabled: busy, onSelect: () => setCreateOpen(true) }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-add-line", "aria-hidden": "true" }), "\u65B0\u5EFA\u5C97\u4F4D"), /* @__PURE__ */ react_shim_default.createElement(ca, { disabled: busy || refreshing, onSelect: onRefresh }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-refresh-line", "aria-hidden": "true" }), "\u5237\u65B0")))
    ) : /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-header-actions" }, /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "outline", size: "sm", disabled: busy, onClick: () => setCreateOpen(true) }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-add-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-header-label" }, "\u65B0\u5EFA\u5C97\u4F4D")), /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "ghost", size: "icon", title: "\u5237\u65B0", "aria-label": "\u5237\u65B0", disabled: busy || refreshing, onClick: onRefresh }, /* @__PURE__ */ react_shim_default.createElement("i", { className: `ri-refresh-line${refreshing ? " rs-spin" : ""}`, "aria-hidden": "true" }))), /* @__PURE__ */ react_shim_default.createElement(CreateJobDialog, { open: createOpen, onOpenChange: setCreateOpen, onSubmit: onCreateJob }));
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
    const titleRef = useRef3(null);
    const jdRef = useRef3(null);
    const titleError = touched && !title.trim() ? "\u5C97\u4F4D\u540D\u79F0\u5FC5\u586B" : "";
    const jdLength = jdText.trim().length;
    const jdError = touched && jdLength > 0 && jdLength < MIN_JD_LENGTH ? `\u804C\u4F4D\u63CF\u8FF0\u81F3\u5C11 ${MIN_JD_LENGTH} \u5B57\uFF08\u5F53\u524D ${jdLength} \u5B57\uFF09` : "";
    const canSave = Boolean(title.trim()) && jdLength >= MIN_JD_LENGTH && !saving;
    useEffect3(() => {
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
    return /* @__PURE__ */ react_shim_default.createElement(pe2, { open, onOpenChange: (next) => !saving && onOpenChange(next) }, /* @__PURE__ */ react_shim_default.createElement(be2, { className: "rs-create-dialog", "aria-busy": saving }, /* @__PURE__ */ react_shim_default.createElement(ve2, null, /* @__PURE__ */ react_shim_default.createElement(he, null, "\u65B0\u5EFA\u5C97\u4F4D")), /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-form" }, /* @__PURE__ */ react_shim_default.createElement("label", { className: "rs-form-field" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u5C97\u4F4D\u540D\u79F0", /* @__PURE__ */ react_shim_default.createElement("em", null, "*"), /* @__PURE__ */ react_shim_default.createElement("small", null, "\u4E0D\u8D85\u8FC7 ", MAX_TITLE_LENGTH, " \u5B57")), /* @__PURE__ */ react_shim_default.createElement(
      Z2,
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
    ) : null, /* @__PURE__ */ react_shim_default.createElement(Mt2, null, /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "ghost", disabled: saving, onClick: () => onOpenChange(false) }, "\u53D6\u6D88"), /* @__PURE__ */ react_shim_default.createElement(C2, { disabled: !canSave, onClick: () => void submit() }, saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58"))));
  }

  // community/apps/resume-screen/src/lib/remote-components/resume-screen/src/components/upload-dialog.tsx
  var { memo: memo3, useEffect: useEffect4, useRef: useRef4, useState: useState6 } = react_shim_default;
  var ROW_CAP = 24;
  function UploadDialog({ open, rows, busy, uploadRequestSeq, onClose, onPickFiles, onClearFailed, onJumpToCandidate }) {
    const inputRef = useRef4(null);
    const [dragging, setDragging] = useState6(false);
    const [confirmClose, setConfirmClose] = useState6(false);
    const summary = summarizeUploadRows(rows);
    const earlyCount = Math.max(0, rows.length - ROW_CAP);
    const visible = earlyCount > 0 ? rows.slice(0, ROW_CAP) : rows;
    useEffect4(() => {
      if (open && uploadRequestSeq > 0) inputRef.current?.click();
    }, [open, uploadRequestSeq]);
    function accept(files) {
      setDragging(false);
      if (files.length) onPickFiles(files);
    }
    function requestClose() {
      if (summary.closable) {
        onClose(false);
        return;
      }
      setConfirmClose(true);
    }
    return /* @__PURE__ */ react_shim_default.createElement(pe2, { open, onOpenChange: (next) => next ? void 0 : requestClose() }, /* @__PURE__ */ react_shim_default.createElement(be2, { className: "rs-upload-dialog" }, /* @__PURE__ */ react_shim_default.createElement(ve2, null, /* @__PURE__ */ react_shim_default.createElement(he, null, "\u4E0A\u4F20\u7B80\u5386"), /* @__PURE__ */ react_shim_default.createElement(xe2, null, "\u652F\u6301 .docx / .pdf\uFF0C\u5355\u6587\u4EF6 \u2264 10MB\uFF0C\u53EF\u4E00\u6B21\u9009\u62E9\u591A\u4E2A\u6587\u4EF6\u3002")), /* @__PURE__ */ react_shim_default.createElement(
      "div",
      {
        className: `rs-upload-drop${dragging ? " is-drag" : ""}`,
        onDragOver: (event) => {
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (event) => {
          event.preventDefault();
          accept(Array.from(event.dataTransfer.files ?? []));
        }
      },
      /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-upload-cloud-2-line", "aria-hidden": "true" }),
      /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-upload-drop-text" }, "\u628A\u7B80\u5386\u6587\u4EF6\u62D6\u5230\u8FD9\u91CC\uFF0C\u6216"),
      /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "outline", size: "sm", disabled: busy, onClick: () => inputRef.current?.click() }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-file-add-line", "aria-hidden": "true" }), "\u9009\u62E9\u6587\u4EF6"),
      /* @__PURE__ */ react_shim_default.createElement(
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
            accept(files);
          }
        }
      )
    ), rows.length > 0 ? /* @__PURE__ */ react_shim_default.createElement(react_shim_default.Fragment, null, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-upload-summary", role: "status", "aria-live": "polite" }, /* @__PURE__ */ react_shim_default.createElement("span", null, "\u5DF2\u9009 ", /* @__PURE__ */ react_shim_default.createElement("b", null, summary.selected), " \xB7 \u5B8C\u6210 ", /* @__PURE__ */ react_shim_default.createElement("b", null, summary.done), " \xB7 \u8DF3\u8FC7 ", /* @__PURE__ */ react_shim_default.createElement("b", null, summary.skipped), /* @__PURE__ */ react_shim_default.createElement("span", { className: summary.failed ? " is-fail" : void 0 }, " \xB7 \u5931\u8D25 ", /* @__PURE__ */ react_shim_default.createElement("b", null, summary.failed))), summary.failed > 0 ? /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "ghost", size: "sm", className: "rs-upload-clear", onClick: onClearFailed }, "\u6E05\u9664\u5931\u8D25\u8BB0\u5F55") : null), earlyCount > 0 ? /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-upload-hint" }, "\u66F4\u65E9 ", earlyCount, " \u6761") : null, /* @__PURE__ */ react_shim_default.createElement(Ga, { className: "rs-upload-scroll" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-upload-list", role: "list", "aria-label": "\u4E0A\u4F20\u8FDB\u5EA6" }, visible.map((row, index2) => /* @__PURE__ */ react_shim_default.createElement(
      UploadRowItem,
      {
        key: row.localId,
        row,
        enterDelay: index2 < 10 ? Math.min(index2, 9) * 40 : null,
        elapsedLong: Date.now() - row.startedAt > UPLOAD_STILL_WORKING_MS,
        onJumpToCandidate
      }
    ))))) : /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-upload-guidance" }, "\u8FD8\u6CA1\u6709\u9009\u62E9\u6587\u4EF6\u3002\u9009\u62E9\u540E\u4F1A\u9010\u4E2A\u4E0A\u4F20\uFF0C\u670D\u52A1\u7AEF\u89E3\u6790\u5B8C\u6210\u540E\u81EA\u52A8\u51FA\u73B0\u5728\u5DE6\u4FA7\u5217\u8868\u3002"), /* @__PURE__ */ react_shim_default.createElement("footer", { className: "rs-upload-foot" }, /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "outline", size: "sm", disabled: busy, onClick: () => inputRef.current?.click() }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-add-line", "aria-hidden": "true" }), "\u7EE7\u7EED\u4E0A\u4F20"), /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "default", size: "sm", onClick: requestClose }, "\u5B8C\u6210")), /* @__PURE__ */ react_shim_default.createElement(tt2, { open: confirmClose, onOpenChange: setConfirmClose }, /* @__PURE__ */ react_shim_default.createElement(rt2, null, /* @__PURE__ */ react_shim_default.createElement(ot2, null, /* @__PURE__ */ react_shim_default.createElement(dt, null, "\u8FD8\u6709 ", summary.inFlight, " \u4E2A\u6587\u4EF6\u6B63\u5728\u4E0A\u4F20"), /* @__PURE__ */ react_shim_default.createElement(st2, null, "\u5173\u95ED\u7A97\u53E3\u4E0D\u4F1A\u53D6\u6D88\u4E0A\u4F20\uFF0C\u6587\u4EF6\u4ECD\u4F1A\u5728\u670D\u52A1\u7AEF\u89E3\u6790\u5165\u5E93\uFF1B\u53EF\u7A0D\u540E\u5728\u5217\u8868\u4E2D\u67E5\u770B\u7ED3\u679C\u3002")), /* @__PURE__ */ react_shim_default.createElement(nt2, null, /* @__PURE__ */ react_shim_default.createElement(ut2, { variant: "outline", size: "sm" }, "\u7EE7\u7EED\u7B49\u5F85"), /* @__PURE__ */ react_shim_default.createElement(
      lt2,
      {
        variant: "default",
        size: "sm",
        onClick: () => {
          setConfirmClose(false);
          onClose(false);
        }
      },
      "\u4ECD\u8981\u5173\u95ED"
    ))))));
  }
  var UploadRowItem = memo3(function UploadRowItem2({
    row,
    enterDelay,
    elapsedLong,
    onJumpToCandidate
  }) {
    const working = row.status === "queued" || row.status === "uploading";
    return /* @__PURE__ */ react_shim_default.createElement(
      "div",
      {
        className: `rs-upload-row${enterDelay !== null ? " rs-enter" : ""}${row.leaving ? " rs-leaving" : ""}`,
        style: enterDelay !== null ? { "--rs-stagger": `${enterDelay}ms` } : void 0,
        role: "listitem"
      },
      /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-file-line", "aria-hidden": "true" }),
      /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-upload-name", title: row.fileName }, row.fileName),
      /* @__PURE__ */ react_shim_default.createElement(UploadBadge, { status: row.status }),
      /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-upload-actions" }, row.status === "created" && row.candidateId ? /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "ghost", size: "sm", onClick: () => onJumpToCandidate(row.candidateId) }, "\u67E5\u770B") : null, working && elapsedLong ? /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-upload-hint" }, "\u4ECD\u5728\u5904\u7406\uFF0C\u53EF\u7A0D\u540E\u67E5\u770B") : null),
      row.status === "skipped" ? /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-upload-hint" }, "\u8BE5\u7B80\u5386\u5185\u5BB9\u5DF2\u5B58\u5728") : null,
      row.status === "failed" && row.failureReason ? /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-upload-fail", role: "alert" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-error-warning-line", "aria-hidden": "true" }), row.failureReason) : null
    );
  });

  // community/apps/resume-screen/src/lib/remote-components/resume-screen/src/components/preview-dialog.tsx
  var { useEffect: useEffect5, useState: useState7 } = react_shim_default;
  function PreviewDialog({ open, fileName, payload, onClose }) {
    const [blobUrl, setBlobUrl] = useState7("");
    useEffect5(() => {
      if (payload.kind !== "pdf") {
        setBlobUrl("");
        return void 0;
      }
      let handle = null;
      try {
        handle = createPdfBlobUrl(decodeBase64ToBytes(payload.base64), "application/pdf");
      } catch {
        setBlobUrl("");
        return void 0;
      }
      setBlobUrl(handle.url);
      const current = handle;
      return () => current.release();
    }, [payload]);
    const failed = payload.kind === "pdf" && !blobUrl;
    return /* @__PURE__ */ react_shim_default.createElement(pe2, { open, onOpenChange: (next) => next ? void 0 : onClose(false) }, /* @__PURE__ */ react_shim_default.createElement(be2, { className: "rs-preview-dialog" }, /* @__PURE__ */ react_shim_default.createElement(ve2, null, /* @__PURE__ */ react_shim_default.createElement(he, null, "\u9884\u89C8\u7B80\u5386"), /* @__PURE__ */ react_shim_default.createElement(xe2, null, fileName)), failed ? (
      // 与首载失败卡同构的红变体 notice（§6.1），文案给可执行下一步
      /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-notice rs-notice-inline", role: "alert", style: { position: "static" } }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-error-warning-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("div", { style: { minWidth: 0 } }, "\u7B80\u5386\u9884\u89C8\u52A0\u8F7D\u5931\u8D25\uFF0C\u53EF\u5173\u95ED\u7A97\u53E3\u540E\u91CD\u65B0\u6253\u5F00\uFF1B\u82E5\u53CD\u590D\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u4E0A\u4F20\u8BE5\u7B80\u5386\u3002"))
    ) : payload.kind === "html" ? (
      // 内容已在服务端 sanitizePreviewHtml 消毒（T10），此处 dangerouslySetInnerHTML 是受控用法
      /* @__PURE__ */ react_shim_default.createElement(Ga, { className: "rs-preview-scroll" }, /* @__PURE__ */ react_shim_default.createElement("article", { className: "rs-preview-doc", dangerouslySetInnerHTML: { __html: payload.html } }))
    ) : /* @__PURE__ */ react_shim_default.createElement("iframe", { className: "rs-preview-pdf", src: blobUrl, title: `${fileName} \u7B80\u5386\u9884\u89C8` }), /* @__PURE__ */ react_shim_default.createElement("footer", { className: "rs-preview-foot" }, /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "outline", size: "sm", onClick: () => onClose(false) }, "\u5173\u95ED"))));
  }

  // community/apps/resume-screen/src/lib/remote-components/resume-screen/src/components/workbench.tsx
  var { useCallback: useCallback2, useEffect: useEffect6, useMemo: useMemo2, useRef: useRef5, useState: useState8 } = react_shim_default;
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
    const [data, setData] = useState8(null);
    const [items, setItems] = useState8([]);
    const [view, setView] = useState8(() => ({
      ...INITIAL_VIEW,
      jobId: pickJobIdFromContext(context),
      search: context.initialQuery?.search ?? ""
    }));
    const [pagesLoaded, setPagesLoaded] = useState8(1);
    const [firstLoading, setFirstLoading] = useState8(true);
    const [loadError, setLoadError] = useState8("");
    const [refreshing, setRefreshing] = useState8(false);
    const [selectedId, setSelectedId] = useState8(null);
    const [busyKey, setBusyKey] = useState8(null);
    const [notice, setNotice] = useState8("");
    const [queueRows, setQueueRows] = useState8([]);
    const [queueBusy, setQueueBusy] = useState8(false);
    const [jobPulseSeq, setJobPulseSeq] = useState8(0);
    const [jumpCandidateId, setJumpCandidateId] = useState8(null);
    const [uploadRequestSeq, setUploadRequestSeq] = useState8(0);
    const [uploadOpen, setUploadOpen] = useState8(false);
    const [enteringIds, setEnteringIds] = useState8(() => /* @__PURE__ */ new Set());
    const [nowTick, setNowTick] = useState8(() => Date.now());
    const [sheetOpen, setSheetOpen] = useState8(false);
    const [widthMode, setWidthMode] = useState8("default");
    const [timeoutDismiss, setTimeoutDismiss] = useState8({});
    const shellRef = useRef5(null);
    const viewRef = useRef5(view);
    viewRef.current = view;
    const selectedRef = useRef5(selectedId);
    selectedRef.current = selectedId;
    const removalToken = useRef5(0);
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
              removalToken.current += 1;
              const merged2 = mergeAppendedPage(previous, result.candidates);
              setEnteringIds(new Set(result.candidates.map((item) => item.id)));
              return merged2;
            }
            const previousIds = new Set(previous.map((item) => item.id));
            setEnteringIds(new Set([...nextIds].filter((id) => !previousIds.has(id))));
            const merged = mergeRefreshedList(previous, result.candidates);
            const token = ++removalToken.current;
            if (merged.length === result.candidates.length) return merged;
            const finalList = result.candidates;
            window.setTimeout(() => {
              if (removalToken.current !== token) return;
              setItems((current2) => mergeRefreshedList(current2.filter((item) => !item.leaving), finalList));
            }, LEAVE_FADE_MS);
            return merged;
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
    useEffect6(() => {
      void load(items.length === 0 && !data ? "first" : "refresh");
    }, [view]);
    useEffect6(() => {
      window.__resumeScreenReload = () => void silentRefresh();
      return () => {
        delete window.__resumeScreenReload;
      };
    }, [silentRefresh]);
    useEffect6(() => {
      setOnLateReceipt(() => void silentRefresh());
      return () => setOnLateReceipt(null);
    }, [silentRefresh]);
    useEffect6(() => {
      const shell = shellRef.current;
      if (!shell || typeof ResizeObserver === "undefined") return void 0;
      const observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? 0;
        setWidthMode(width < 560 ? "xs" : "default");
      });
      observer.observe(shell);
      return () => observer.disconnect();
    }, []);
    const liveItems = useMemo2(() => items.some((item) => item.leaving) ? items.filter((item) => !item.leaving) : items, [items]);
    const hasParsing = liveItems.some((item) => item.status === "parsing" || item.status === "draft");
    const hasQueueWorking = queueRows.some((row) => row.status === "queued" || row.status === "uploading");
    useEffect6(() => {
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
    const selected = useMemo2(() => liveItems.find((item) => item.id === selectedId) ?? null, [liveItems, selectedId]);
    const handleSelect = useCallback2((id) => {
      setSelectedId(id);
      setSheetOpen(true);
    }, []);
    const consumeJumpHighlight = useCallback2(() => setJumpCandidateId(null), []);
    function moveSelection(delta) {
      const rows = liveItems;
      if (!rows.length) return;
      const index2 = rows.findIndex((item) => item.id === selectedId);
      const nextIndex = Math.min(rows.length - 1, Math.max(0, (index2 < 0 ? 0 : index2) + delta));
      handleSelect(rows[nextIndex].id);
    }
    function changeView(patch, options2) {
      setView((state) => ({ ...state, ...patch }));
      if (options2?.clearSelection) setSelectedId(null);
      setPagesLoaded(1);
    }
    function selectJob(jobId) {
      changeView({ jobId, status: "all", search: "" }, { clearSelection: true });
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
              const nextId = nextPendingId(list.filter((item) => !item.leaving), candidate.id);
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
            const conflict = looksLikeRevisionConflict(message, isObject(result.data) ? result.data.code : void 0);
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
    const [preview, setPreview] = useState8(null);
    const [previewBusy, setPreviewBusy] = useState8(false);
    const openPreview = useCallback2(
      async (candidate) => {
        if (previewBusy) return;
        setPreviewBusy(true);
        try {
          const response = await executeAction("preview_candidate", candidate.id, { candidateId: candidate.id }, { jobId: candidate.jobId });
          const result = parseActionResult(response);
          const message = resolveText(result.message);
          if (!result.success || !isObject(result.data)) {
            showNotice(message || "\u7B80\u5386\u9884\u89C8\u52A0\u8F7D\u5931\u8D25");
            notify(message || "\u7B80\u5386\u9884\u89C8\u52A0\u8F7D\u5931\u8D25", "error");
            return;
          }
          const kind = result.data.kind === "pdf" ? "pdf" : "html";
          setPreview({
            candidateId: candidate.id,
            fileName: typeof result.data.fileName === "string" ? result.data.fileName : candidate.sourceFileName || "\u7B80\u5386",
            payload: kind === "pdf" ? { kind: "pdf", base64: String(result.data.base64 ?? "") } : { kind: "html", html: String(result.data.html ?? "") }
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "\u7B80\u5386\u9884\u89C8\u52A0\u8F7D\u5931\u8D25";
          showNotice(message);
          notify(message, "error");
        } finally {
          setPreviewBusy(false);
        }
      },
      [previewBusy]
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
    function patchUploadRow(localId, patch) {
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
        try {
          for (let index2 = 0; index2 < files.length; index2 += 1) {
            const file = files[index2];
            const row = rows[index2];
            if (file.size > UPLOAD_MAX_BYTES) {
              patchUploadRow(row.localId, { status: "failed", failureReason: UPLOAD_OVERSIZE_HINT });
              notify(`${file.name}\uFF1A${UPLOAD_OVERSIZE_HINT}`, "error");
              continue;
            }
            patchUploadRow(row.localId, { status: "uploading" });
            try {
              const response = await executeFileAction("upload_resume_files", null, {}, { jobId }, file);
              const result = parseActionResult(response);
              const dataField = isObject(result.data) ? result.data : {};
              const createdList = Array.isArray(dataField.created) ? dataField.created : [];
              const skippedList = Array.isArray(dataField.skipped) ? dataField.skipped : [];
              if (!result.success) {
                const reason = mapUploadFailure(resolveText(result.message));
                patchUploadRow(row.localId, { status: "failed", failureReason: reason });
                notify(`${file.name}\uFF1A${reason}`, "error");
                continue;
              }
              if (createdList.length > 0) {
                patchUploadRow(row.localId, { status: "created", candidateId: createdList[0]?.id });
              } else if (skippedList.length > 0) {
                patchUploadRow(row.localId, { status: "skipped" });
              } else {
                patchUploadRow(row.localId, { status: "created" });
              }
            } catch (error) {
              const reason = mapUploadFailure(error instanceof Error ? error.message : "\u4E0A\u4F20\u5931\u8D25");
              patchUploadRow(row.localId, { status: "failed", failureReason: reason });
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
    const total = data?.page?.total ?? liveItems.length;
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
        onConflictRefresh: () => void silentRefresh(),
        onPreview: openPreview
      }
    );
    return /* @__PURE__ */ react_shim_default.createElement("main", { className: "rs-shell", ref: shellRef, "data-rs-width": widthMode }, refreshing && !firstLoading ? /* @__PURE__ */ react_shim_default.createElement("span", { className: "rs-scanline", "aria-hidden": "true" }) : null, /* @__PURE__ */ react_shim_default.createElement(
      JobHeader,
      {
        jobs: data?.jobs ?? [],
        currentJobId: view.jobId,
        busy: busyKey !== null,
        refreshing: refreshing && !firstLoading,
        jobPulseSeq,
        xsMode: widthMode === "xs",
        onSelectJob: selectJob,
        onCreateJob: createJob,
        onRefresh: () => void silentRefresh()
      }
    ), isError ? (
      // 首载失败：错误卡 + 重试（重新 requestData）；刷新失败只走 notice 不替换整页（§6.1）
      /* @__PURE__ */ react_shim_default.createElement("section", { className: "rs-content" }, /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-error-card", role: "alert" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-error-warning-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("div", null, loadError || "\u89C6\u56FE\u6570\u636E\u52A0\u8F7D\u5931\u8D25"), /* @__PURE__ */ react_shim_default.createElement(C2, { variant: "outline", size: "sm", onClick: () => void load("first") }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-refresh-line", "aria-hidden": "true" }), "\u91CD\u8BD5")))
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
        onJumpConsumed: consumeJumpHighlight,
        onSelect: handleSelect,
        onMoveSelection: moveSelection,
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
          setUploadOpen(true);
          setUploadRequestSeq((seq) => seq + 1);
        },
        onCreateJobRequest: () => {
          window.dispatchEvent(new CustomEvent("rs:open-create-job"));
        }
      }
    ))), /* @__PURE__ */ react_shim_default.createElement(Ie2, { open: sheetOpen, onOpenChange: setSheetOpen }, /* @__PURE__ */ react_shim_default.createElement(
      Re2,
      {
        side: "right",
        className: `rs-sheet-content${widthMode === "xs" ? " is-full" : ""}`,
        "aria-describedby": void 0,
        onKeyDown: (event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          moveSelection(event.key === "ArrowDown" ? 1 : -1);
        }
      },
      /* @__PURE__ */ react_shim_default.createElement(Ae2, { className: "rs-sheet-sr-head" }, /* @__PURE__ */ react_shim_default.createElement(Pe2, null, "\u5019\u9009\u4EBA\u8BE6\u60C5")),
      /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-sheet-body" }, detail)
    )), notice ? /* @__PURE__ */ react_shim_default.createElement("div", { className: "rs-notice", role: "alert" }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-error-warning-line", "aria-hidden": "true" }), /* @__PURE__ */ react_shim_default.createElement("span", { style: { minWidth: 0 } }, notice), /* @__PURE__ */ react_shim_default.createElement("button", { type: "button", "aria-label": "\u5173\u95ED\u63D0\u793A", onClick: () => setNotice("") }, /* @__PURE__ */ react_shim_default.createElement("i", { className: "ri-close-line", "aria-hidden": "true" }))) : null, /* @__PURE__ */ react_shim_default.createElement(
      UploadDialog,
      {
        open: uploadOpen,
        rows: queueRows,
        busy: queueBusy,
        uploadRequestSeq,
        onClose: (next) => {
          setUploadOpen(next);
        },
        onPickFiles: (files) => void pickFiles(files),
        onClearFailed: clearFailedRows,
        onJumpToCandidate: (id) => {
          setUploadOpen(false);
          jumpToCandidate(id);
        }
      }
    ), preview ? /* @__PURE__ */ react_shim_default.createElement(
      PreviewDialog,
      {
        open: true,
        fileName: preview.fileName,
        payload: preview.payload,
        onClose: () => setPreview(null)
      }
    ) : null);
  }

  // community/apps/resume-screen/src/lib/remote-components/resume-screen/src/main.tsx
  var { useEffect: useEffect7, useState: useState9 } = react_shim_default;
  injectStyles();
  function App() {
    const [context, setContext] = useState9(null);
    useEffect7(() => {
      const disposeBridge = installBridgeListener({
        onInit: setContext,
        // 宿主对话旁路事件（assistant.tool.completed 转发）：交给工作台做静默刷新
        onHostEvent: () => window.__resumeScreenReload?.()
      });
      post("ready");
      return disposeBridge;
    }, []);
    useEffect7(() => {
      const root = document.getElementById("root");
      if (!root || typeof ResizeObserver === "undefined") return void 0;
      const observer = new ResizeObserver(() => setTimeout(reportResize, 0));
      observer.observe(root);
      return () => observer.disconnect();
    }, []);
    useEffect7(() => {
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
