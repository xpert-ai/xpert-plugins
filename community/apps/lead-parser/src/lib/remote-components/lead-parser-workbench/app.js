"use strict";
var XpertLeadParserWorkbench = (() => {
  // src/lib/remote-components/lead-parser-workbench/src/react-shim.ts
  var ReactGlobal = window.React;
  var react_shim_default = ReactGlobal;
  var Children = ReactGlobal.Children;
  var Component = ReactGlobal.Component;
  var Fragment = ReactGlobal.Fragment;
  var StrictMode = ReactGlobal.StrictMode;
  var cloneElement = ReactGlobal.cloneElement;
  var createElement = ReactGlobal.createElement;
  var createContext = ReactGlobal.createContext;
  var createRef = ReactGlobal.createRef;
  var forwardRef = ReactGlobal.forwardRef;
  var isValidElement = ReactGlobal.isValidElement;
  var memo = ReactGlobal.memo;
  var useCallback = ReactGlobal.useCallback;
  var useContext = ReactGlobal.useContext;
  var useEffect = ReactGlobal.useEffect;
  var useMemo = ReactGlobal.useMemo;
  var useRef = ReactGlobal.useRef;
  var useState = ReactGlobal.useState;
  var version = ReactGlobal.version;

  // src/lib/remote-components/lead-parser-workbench/src/react-dom-client-shim.ts
  var ReactDOMGlobal = window.ReactDOM;
  var createRoot = ReactDOMGlobal.createRoot;
  var hydrateRoot = ReactDOMGlobal.hydrateRoot;

  // src/lib/remote-components/lead-parser-workbench/src/bridge.ts
  var CHANNEL = "xpertai.remote_component";
  var VERSION = 1;
  var instanceId = null;
  var requestSequence = 0;
  var pending = /* @__PURE__ */ new Map();
  function isObject(value) {
    return typeof value === "object" && value !== null;
  }
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
          item.reject(new Error(typeof message.message === "string" ? message.message : "Remote request failed"));
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
    const root = document.getElementById("root");
    const shell = root?.firstElementChild;
    const height = Math.max(shell?.scrollHeight ?? 0, 480);
    post("resize", { height: Math.ceil(height), viewportBound: false });
  }

  // src/lib/remote-components/lead-parser-workbench/src/workbench.tsx
  function messageText(message) {
    if (!message) return "";
    if (typeof message === "string") return message;
    return message.zh_Hans ?? message.en_US ?? "";
  }
  var FIELDS = [
    { key: "name", label: "\u59D3\u540D" },
    { key: "company", label: "\u516C\u53F8" },
    { key: "intent", label: "\u610F\u5411" },
    { key: "budget", label: "\u9884\u7B97\uFF08\u4E07\u5143\uFF09" }
  ];
  function Workbench() {
    const [text, setText] = useState("");
    const [parsed, setParsed] = useState(null);
    const [saved, setSaved] = useState([]);
    const [parsing, setParsing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const loadSaved = useCallback(async () => {
      try {
        const res = await requestData({});
        const list = res.data?.items;
        if (Array.isArray(list)) setSaved(list);
      } catch {
      }
    }, []);
    useEffect(() => {
      loadSaved();
    }, [loadSaved]);
    useEffect(() => {
      reportResize();
    }, [parsed, saved, saveError]);
    const handleParse = async () => {
      if (!text.trim() || parsing) return;
      setParsing(true);
      setSaveError(null);
      try {
        const res = await executeAction("parse", null, { text: text.trim() });
        if (res.success === false) {
          notify(messageText(res.message) || "\u89E3\u6790\u5931\u8D25", "error");
          return;
        }
        setParsed(res.data ?? null);
        notify(messageText(res.message) || "\u89E3\u6790\u5B8C\u6210", "success");
      } catch (error) {
        notify(error instanceof Error ? error.message : "\u89E3\u6790\u5931\u8D25", "error");
      } finally {
        setParsing(false);
      }
    };
    const handleSave = async () => {
      if (!parsed || saving) return;
      setSaving(true);
      setSaveError(null);
      try {
        const res = await executeAction("save", null, { text: text.trim(), lead: parsed });
        if (res.success === false) {
          setSaveError(messageText(res.message) || "\u4FDD\u5B58\u5931\u8D25");
          return;
        }
        notify(messageText(res.message) || "\u7EBF\u7D22\u5DF2\u4FDD\u5B58", "success");
        setParsed(null);
        setText("");
        await loadSaved();
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "\u4FDD\u5B58\u5931\u8D25");
      } finally {
        setSaving(false);
      }
    };
    return /* @__PURE__ */ react_shim_default.createElement("div", { className: "lp-shell" }, /* @__PURE__ */ react_shim_default.createElement("header", { className: "lp-header" }, /* @__PURE__ */ react_shim_default.createElement("h2", null, "\u7EBF\u7D22\u89E3\u6790\u5DE5\u4F5C\u53F0"), /* @__PURE__ */ react_shim_default.createElement("p", null, "\u7C98\u8D34\u4E00\u6BB5\u9500\u552E\u7EBF\u7D22\u539F\u6587\uFF0CAI \u63D0\u53D6\u7ED3\u6784\u5316\u5B57\u6BB5\uFF0C\u786E\u8BA4\u540E\u4FDD\u5B58\u3002")), /* @__PURE__ */ react_shim_default.createElement(
      "textarea",
      {
        className: "lp-input",
        placeholder: "\u4F8B\u5982\uFF1AXX\u6C7D\u8F66\u96F6\u90E8\u4EF6\u516C\u53F8\u7684\u674E\u603B\u60F3\u505A\u65B0\u80FD\u6E90\u4EA7\u7EBF\u65B9\u6848\uFF0C\u9884\u7B97\u5927\u698280\u4E07",
        value: text,
        onChange: (e) => setText(e.target.value),
        rows: 3
      }
    ), /* @__PURE__ */ react_shim_default.createElement("div", { className: "lp-actions" }, /* @__PURE__ */ react_shim_default.createElement("button", { className: "lp-btn lp-btn-primary", disabled: !text.trim() || parsing, onClick: handleParse }, parsing ? "\u89E3\u6790\u4E2D\u2026" : "AI \u89E3\u6790")), parsed && /* @__PURE__ */ react_shim_default.createElement("section", { className: "lp-result" }, /* @__PURE__ */ react_shim_default.createElement("h3", null, "\u89E3\u6790\u7ED3\u679C"), /* @__PURE__ */ react_shim_default.createElement("dl", null, FIELDS.map(({ key, label }) => /* @__PURE__ */ react_shim_default.createElement("div", { key, className: "lp-field" }, /* @__PURE__ */ react_shim_default.createElement("dt", null, label), /* @__PURE__ */ react_shim_default.createElement("dd", null, parsed[key] ?? /* @__PURE__ */ react_shim_default.createElement("span", { className: "lp-empty" }, "\u672A\u8BC6\u522B"))))), /* @__PURE__ */ react_shim_default.createElement("div", { className: "lp-actions" }, /* @__PURE__ */ react_shim_default.createElement("button", { className: "lp-btn lp-btn-primary", disabled: saving, onClick: handleSave }, saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u7EBF\u7D22"))), saveError && /* @__PURE__ */ react_shim_default.createElement("div", { className: "lp-toast lp-toast-error", role: "alert" }, /* @__PURE__ */ react_shim_default.createElement("span", null, saveError), /* @__PURE__ */ react_shim_default.createElement("button", { className: "lp-btn lp-btn-retry", disabled: saving, onClick: handleSave }, "\u91CD\u8BD5")), saved.length > 0 && /* @__PURE__ */ react_shim_default.createElement("section", { className: "lp-saved" }, /* @__PURE__ */ react_shim_default.createElement("h3", null, "\u5DF2\u4FDD\u5B58\u7EBF\u7D22\uFF08", saved.length, "\uFF09"), /* @__PURE__ */ react_shim_default.createElement("ul", null, saved.map((item) => /* @__PURE__ */ react_shim_default.createElement("li", { key: item.id }, /* @__PURE__ */ react_shim_default.createElement("strong", null, item.company ?? item.name ?? item.id), /* @__PURE__ */ react_shim_default.createElement("span", null, item.intent ?? ""), item.budget != null && /* @__PURE__ */ react_shim_default.createElement("em", null, item.budget, " \u4E07"))))));
  }

  // src/lib/remote-components/lead-parser-workbench/src/main.tsx
  installBridgeListener({
    onInit: () => {
    },
    onHostEvent: () => {
    }
  });
  var container = document.getElementById("root");
  if (container) {
    createRoot(container).render(
      /* @__PURE__ */ react_shim_default.createElement(react_shim_default.StrictMode, null, /* @__PURE__ */ react_shim_default.createElement(Workbench, null))
    );
  }
  post("ready");
})();
