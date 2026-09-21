"use strict";
var XpertSupportTicketWorkbench = (() => {
  // src/lib/remote-components/support-ticket/src/utils.ts
  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function asObject(value) {
    return isObject(value) ? value : void 0;
  }
  function asString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : void 0;
  }
  function cx(...values) {
    return values.filter(Boolean).join(" ");
  }
  function viewData(message) {
    return asObject(message.data) ?? asObject(message.result) ?? {};
  }
  function actionOutcome(message) {
    const result = asObject(message.result) ?? asObject(message.data) ?? {};
    const data = asObject(result.data) ?? {};
    return {
      success: result.success !== false,
      code: asString(data.code),
      data
    };
  }
  function newRequestId() {
    const cryptoApi = window.crypto;
    if (cryptoApi?.randomUUID) {
      return cryptoApi.randomUUID();
    }
    return `st-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }
  function formatDateTime(value, locale = "zh-Hans") {
    if (!value) {
      return void 0;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat(locale === "en-US" ? "en-US" : "zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }
  function optionLabel(options, value, locale = "zh-Hans") {
    if (!value) {
      return void 0;
    }
    const match = options?.find((item) => item.value === value);
    if (!match) {
      return value;
    }
    return locale === "en-US" ? match.en_US : match.zh_Hans;
  }

  // src/lib/remote-components/support-ticket/src/bridge.ts
  var CHANNEL = "xpertai.remote_component";
  var VERSION = 1;
  var instanceId = null;
  var sequence = 0;
  var pending = /* @__PURE__ */ new Map();
  function installBridge(handlers) {
    const listener = (event) => {
      const raw = event.data;
      if (!isObject(raw) || raw.channel !== CHANNEL || raw.protocolVersion !== VERSION || typeof raw.type !== "string") {
        return;
      }
      const message = raw;
      if (message.type === "init") {
        instanceId = typeof message.instanceId === "string" ? message.instanceId : null;
        handlers.onInit({
          manifest: message.manifest,
          initialQuery: message.initialQuery ?? {},
          locale: message.locale,
          theme: message.theme
        });
        setTimeout(reportResize, 0);
        return;
      }
      if (message.instanceId !== instanceId) {
        return;
      }
      if (message.type === "hostEvent") {
        handlers.onHostEvent(message.payload ?? message.data);
        return;
      }
      const requestId = typeof message.requestId === "string" ? message.requestId : "";
      const request2 = requestId ? pending.get(requestId) : void 0;
      if (!request2) {
        return;
      }
      pending.delete(requestId);
      if (message.type === "error") {
        request2.reject(new Error(typeof message.message === "string" ? message.message : "Remote request failed."));
      } else {
        request2.resolve(message);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }
  function post(type, body = {}) {
    if (!instanceId && type !== "ready") {
      return;
    }
    window.parent.postMessage({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type, ...body }, "*");
  }
  function requestData(query) {
    return request("requestData", { query });
  }
  function executeAction(actionKey, targetId, input = {}) {
    return request("executeAction", { actionKey, targetId, input });
  }
  function invokeClientCommand(commandKey, payload) {
    return request("invokeClientCommand", { commandKey, payload });
  }
  function reportResize() {
    const height = Math.max(window.innerHeight || document.documentElement.clientHeight || 0, 720);
    post("resize", { height, viewportBound: true });
  }
  function request(type, body) {
    const requestId = String(++sequence);
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      post(type, { requestId, ...body });
      window.setTimeout(() => {
        if (!pending.has(requestId)) {
          return;
        }
        pending.delete(requestId);
        reject(new Error("HOST_REQUEST_TIMEOUT"));
      }, 3e4);
    });
  }

  // src/lib/remote-components/support-ticket/src/vendor.ts
  var React = window.React;
  var ReactDOM = window.ReactDOM;

  // src/lib/constants.ts
  var SUPPORT_TICKET_ACTIONS = {
    refresh: "refresh",
    submitTicket: "submit_ticket",
    retryTicket: "retry_ticket",
    markTicketFailed: "mark_ticket_failed",
    saveDraft: "save_draft",
    confirmTicket: "confirm_ticket"
  };
  var SUPPORT_TICKET_CODES = {
    invalidInput: "invalid_input",
    aiTimeout: "ai_timeout",
    aiToolError: "ai_tool_error",
    alreadyConfirmed: "already_confirmed",
    revisionConflict: "revision_conflict",
    ticketNotFound: "ticket_not_found",
    unsupportedAction: "unsupported_action"
  };
  var ASSISTANT_SEND_MESSAGE_COMMAND = "assistant.chat.send_message";
  var SUPPORT_TICKET_STATUSES = [
    { value: "processing", en_US: "AI processing", zh_Hans: "AI \u5904\u7406\u4E2D" },
    { value: "pending_review", en_US: "Awaiting review", zh_Hans: "\u5F85\u4EBA\u5DE5\u786E\u8BA4" },
    { value: "confirmed", en_US: "Confirmed", zh_Hans: "\u5DF2\u786E\u8BA4" },
    { value: "failed", en_US: "Failed", zh_Hans: "\u5904\u7406\u5931\u8D25" }
  ];

  // src/lib/remote-components/support-ticket/src/i18n.ts
  var DICT = {
    loading: ["\u6B63\u5728\u52A0\u8F7D\u5DE5\u5355\u5DE5\u4F5C\u53F0\u2026", "Loading Support Ticket Workbench\u2026"],
    title: ["\u5BA2\u670D\u5DE5\u5355\u5DE5\u4F5C\u53F0", "Support Ticket Workbench"],
    subtitle: ["AI \u5206\u7C7B\u5B9A\u7EA7\u4E0E\u56DE\u590D\u8349\u7A3F\uFF0C\u4EBA\u5DE5\u786E\u8BA4\u540E\u5F52\u6863", "AI triage and reply drafting, archived after human review"],
    refresh: ["\u5237\u65B0", "Refresh"],
    newTicket: ["\u65B0\u5EFA\u5DE5\u5355", "New ticket"],
    ticketDetail: ["\u5DE5\u5355\u8BE6\u60C5", "Ticket detail"],
    statProcessing: ["AI \u5904\u7406\u4E2D", "Processing"],
    statPendingReview: ["\u5F85\u786E\u8BA4", "To review"],
    statConfirmed: ["\u5DF2\u786E\u8BA4", "Confirmed"],
    statFailed: ["\u5931\u8D25", "Failed"],
    searchPlaceholder: ["\u641C\u7D22\u5DE5\u5355\u53F7\u3001\u5BA2\u6237\u6216\u6D88\u606F\u5185\u5BB9", "Search ticket no, customer or message"],
    allStatuses: ["\u5168\u90E8", "All"],
    emptyList: ["\u6682\u65E0\u5DE5\u5355", "No tickets yet"],
    emptyListHint: ["\u5728\u53F3\u4FA7\u5F55\u5165\u5BA2\u6237\u6D88\u606F\u5E76\u63D0\u4EA4\uFF0C\u5C31\u4F1A\u751F\u6210\u7B2C\u4E00\u5F20\u5DE5\u5355\u3002", "Submit a customer message on the right to create the first ticket."],
    noMatch: ["\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u5DE5\u5355", "No ticket matches the current filter"],
    customer: ["\u5BA2\u6237\u540D\u79F0", "Customer"],
    customerPlaceholder: ["\u4F8B\u5982\uFF1A\u676D\u5DDE\u4E91\u542F\u667A\u80FD\u8BBE\u5907\u6709\u9650\u516C\u53F8", "e.g. Northwind Trading Ltd."],
    channel: ["\u8054\u7CFB\u6E20\u9053", "Channel"],
    message: ["\u5BA2\u6237\u539F\u59CB\u6D88\u606F", "Customer message"],
    messagePlaceholder: [
      "\u628A\u5BA2\u6237\u90AE\u4EF6\u6216\u804A\u5929\u8BB0\u5F55\u539F\u6837\u7C98\u8D34\u8FDB\u6765\uFF0C\u4FDD\u7559\u8BA2\u5355\u53F7\u3001\u65F6\u95F4\u3001\u73B0\u8C61\u7B49\u7EC6\u8282\u3002",
      "Paste the original customer email or chat message, keep order numbers, timestamps and symptoms."
    ],
    submit: ["\u63D0\u4EA4\u5E76\u4EA4\u7ED9 AI \u5904\u7406", "Submit to AI"],
    submitting: ["\u6B63\u5728\u63D0\u4EA4\u2026", "Submitting\u2026"],
    required: ["\u5FC5\u586B", "Required"],
    messageTooLong: ["\u6D88\u606F\u8D85\u51FA {max} \u5B57\uFF0C\u8BF7\u62C6\u5206\u540E\u518D\u63D0\u4EA4", "Message exceeds {max} characters, split it before submitting"],
    originalMessage: ["\u539F\u59CB\u6D88\u606F", "Original message"],
    aiSection: ["AI \u5206\u7C7B\u4E0E\u8349\u7A3F", "AI triage and draft"],
    aiPending: ["AI \u6B63\u5728\u5904\u7406\u2026", "AI is processing\u2026"],
    aiPendingHint: ["\u5DF2\u7B49\u5F85 {seconds} \u79D2\uFF0C\u8D85\u8FC7 {timeout} \u79D2\u672A\u8FD4\u56DE\u5C06\u6807\u8BB0\u4E3A\u5931\u8D25\u5E76\u5141\u8BB8\u91CD\u8BD5\u3002", "Waited {seconds}s. After {timeout}s it is marked failed and can be retried."],
    waitingForTool: ["\u7B49\u5F85\u52A9\u624B\u5B8C\u6210\u5206\u7C7B\u2026", "Waiting for the assistant tool result\u2026"],
    category: ["\u95EE\u9898\u7C7B\u522B", "Category"],
    priority: ["\u4F18\u5148\u7EA7", "Priority"],
    priorityReason: ["\u5B9A\u7EA7\u4F9D\u636E", "Priority evidence"],
    draftReply: ["\u56DE\u590D\u8349\u7A3F", "Reply draft"],
    confidence: ["\u7F6E\u4FE1\u5EA6", "Confidence"],
    missingInfo: ["\u5F85\u8865\u5145\u4FE1\u606F", "Missing information"],
    reviewSection: ["\u4EBA\u5DE5\u6821\u5BF9\u4E0E\u786E\u8BA4", "Human review"],
    reviewerHint: [
      "AI \u53EA\u63D0\u4F9B\u5EFA\u8BAE\uFF0C\u4FEE\u6539\u540E\u70B9\u51FB\u300C\u786E\u8BA4\u5E76\u5F52\u6863\u300D\u624D\u4F1A\u5199\u5165\u6B63\u5F0F\u8BB0\u5F55\u3002",
      "AI output is a suggestion only. Click Confirm to turn edits into the official record."
    ],
    saveDraft: ["\u4FDD\u5B58\u8349\u7A3F", "Save draft"],
    saving: ["\u4FDD\u5B58\u4E2D\u2026", "Saving\u2026"],
    confirm: ["\u786E\u8BA4\u5E76\u5F52\u6863", "Confirm and archive"],
    confirming: ["\u786E\u8BA4\u4E2D\u2026", "Confirming\u2026"],
    retry: ["\u91CD\u8BD5 AI \u5904\u7406", "Retry AI processing"],
    retrying: ["\u91CD\u8BD5\u4E2D\u2026", "Retrying\u2026"],
    markFailed: ["\u6807\u8BB0\u4E3A\u5931\u8D25", "Mark failed"],
    confirmNeedsAi: ["\u9700\u8981\u5148\u62FF\u5230 AI \u7ED3\u679C\u624D\u80FD\u786E\u8BA4\u3002", "An AI result is required before confirming."],
    failureTitle: ["AI \u5904\u7406\u5931\u8D25", "AI processing failed"],
    failureHint: ["\u5BA2\u6237\u6D88\u606F\u4E0E\u5DE5\u5355\u53F7\u5DF2\u4FDD\u7559\uFF0C\u91CD\u8BD5\u4E0D\u4F1A\u91CD\u590D\u521B\u5EFA\u5DE5\u5355\u6216\u4EA7\u751F\u7B2C\u4E8C\u6B21\u4E1A\u52A1\u7ED3\u679C\u3002", "The message and ticket number are kept. Retrying reuses this ticket instead of creating another one."],
    code_invalid_input: ["\u8F93\u5165\u4E0D\u5B8C\u6574\u6216\u8D85\u51FA\u9650\u5236\uFF0C\u8BF7\u6309\u63D0\u793A\u4FEE\u6B63\u540E\u91CD\u8BD5\u3002", "The input is incomplete or out of range. Fix it and try again."],
    code_ai_timeout: ["\u6A21\u578B\u6216\u52A9\u624B\u672A\u5728\u89C4\u5B9A\u65F6\u95F4\u5185\u8FD4\u56DE\u7ED3\u679C\uFF0C\u8BF7\u786E\u8BA4\u6A21\u578B\u53EF\u7528\u540E\u91CD\u8BD5\u3002", "The assistant did not return a result in time. Check the model and retry."],
    code_ai_tool_error: ["\u52A9\u624B\u8C03\u7528\u5DE5\u5177\u65F6\u51FA\u9519\uFF0C\u8BF7\u91CD\u8BD5\u6216\u8054\u7CFB\u7BA1\u7406\u5458\u67E5\u770B\u65E5\u5FD7\u3002", "The assistant tool call failed. Retry or ask an administrator to check logs."],
    code_already_confirmed: ["\u8BE5\u5DE5\u5355\u5DF2\u786E\u8BA4\u5F52\u6863\uFF0C\u4E0D\u518D\u91CD\u590D\u5904\u7406\u3002", "This ticket is already confirmed and will not be processed again."],
    code_revision_conflict: ["\u5DE5\u5355\u540C\u65F6\u88AB\u5176\u4ED6\u4EBA\u4FEE\u6539\uFF0C\u4F60\u7684\u4FEE\u6539\u4ECD\u4FDD\u7559\u5728\u9875\u9762\u4E0A\uFF0C\u8BF7\u5237\u65B0\u6BD4\u5BF9\u540E\u91CD\u8BD5\u3002", "Somebody else changed this ticket. Your edits are kept on screen; refresh, compare and retry."],
    code_ticket_not_found: ["\u627E\u4E0D\u5230\u8BE5\u5DE5\u5355\uFF0C\u53EF\u80FD\u5DF2\u88AB\u5220\u9664\u6216\u4E0D\u5C5E\u4E8E\u5F53\u524D\u7EC4\u7EC7\u3002", "Ticket not found in the current organization."],
    code_unsupported_action: ["\u5F53\u524D\u7248\u672C\u4E0D\u652F\u6301\u8BE5\u64CD\u4F5C\u3002", "This action is not supported by the current version."],
    attempt: ["\u7B2C {count} \u6B21\u5C1D\u8BD5", "Attempt {count}"],
    revision: ["\u7248\u672C r{revision}", "Revision r{revision}"],
    timeline: ["\u64CD\u4F5C\u8BB0\u5F55", "Activity"],
    agentRequestFailed: ["\u65E0\u6CD5\u628A\u6D88\u606F\u53D1\u9001\u7ED9\u52A9\u624B\uFF0C\u8BF7\u786E\u8BA4\u52A9\u624B\u5DF2\u914D\u7F6E\u53EF\u7528\u6A21\u578B\u540E\u91CD\u8BD5\u3002", "Could not hand the message to the assistant. Check the assistant model configuration and retry."],
    noticeSubmitted: ["\u5DE5\u5355\u5DF2\u63D0\u4EA4\uFF0C\u6B63\u5728\u7B49\u5F85 AI \u7ED3\u679C", "Ticket submitted, waiting for the AI result"],
    noticeSubmittedDuplicate: ["\u5DF2\u590D\u7528\u540C\u4E00\u5F20\u5DE5\u5355\uFF0C\u672A\u91CD\u590D\u521B\u5EFA", "Reused the existing ticket instead of creating a duplicate"],
    noticeAiDone: ["\u5DF2\u6536\u5230 AI \u5206\u7C7B\u4E0E\u8349\u7A3F\uFF0C\u8BF7\u4EBA\u5DE5\u6821\u5BF9", "AI triage and draft received, please review"],
    noticeDraftSaved: ["\u8349\u7A3F\u5DF2\u4FDD\u5B58", "Draft saved"],
    noticeConfirmed: ["\u5DE5\u5355\u5DF2\u786E\u8BA4\u5F52\u6863", "Ticket confirmed and archived"],
    noticeRetried: ["\u5DF2\u91CD\u65B0\u63D0\u4EA4 AI \u5904\u7406", "AI processing restarted"],
    noticeRefreshed: ["\u5DF2\u5237\u65B0", "Refreshed"],
    loadFailed: ["\u5DE5\u5355\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u70B9\u51FB\u5237\u65B0\u91CD\u8BD5\u3002", "Failed to load tickets. Refresh to retry."],
    event_submitted: ["\u521B\u5EFA\u5DE5\u5355", "Ticket created"],
    event_ai_completed: ["AI \u8FD4\u56DE\u7ED3\u679C", "AI result received"],
    event_ai_failed: ["AI \u5904\u7406\u5931\u8D25", "AI processing failed"],
    event_retry_requested: ["\u53D1\u8D77\u91CD\u8BD5", "Retry requested"],
    event_draft_saved: ["\u4FDD\u5B58\u4EBA\u5DE5\u4FEE\u6539", "Reviewer edits saved"],
    event_confirmed: ["\u4EBA\u5DE5\u786E\u8BA4\u5F52\u6863", "Confirmed by reviewer"],
    untouched: ["\u4E0E AI \u5EFA\u8BAE\u4E00\u81F4", "Matches AI suggestion"],
    edited: ["\u4EBA\u5DE5\u5DF2\u4FEE\u6539", "Edited by reviewer"],
    finalReply: ["\u6700\u7EC8\u56DE\u590D", "Final reply"],
    priorityEvidence: ["\u4F18\u5148\u7EA7\u4F9D\u636E", "Priority evidence"]
  };
  function normalizeLocale(locale) {
    return locale?.toLowerCase().startsWith("en") ? "en-US" : "zh-Hans";
  }
  function createText(locale) {
    const normalized = normalizeLocale(locale);
    const index = normalized === "en-US" ? 1 : 0;
    return (key, params) => {
      const entry = DICT[key];
      const template = entry ? entry[index] : key;
      if (!params) {
        return template;
      }
      return Object.entries(params).reduce(
        (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
        template
      );
    };
  }

  // src/lib/remote-components/support-ticket/src/components/intake-form.tsx
  var { useState } = React;
  function IntakeForm(props) {
    const { t, locale, channels, maxMessageLength, busy, onSubmit } = props;
    const [customerName, setCustomerName] = useState("");
    const [channel, setChannel] = useState("email");
    const [message, setMessage] = useState("");
    const [touched, setTouched] = useState(false);
    const nameError = touched && !customerName.trim() ? t("required") : "";
    const messageError = touched ? !message.trim() ? t("required") : message.length > maxMessageLength ? t("messageTooLong", { max: maxMessageLength }) : "" : "";
    const canSubmit = Boolean(customerName.trim() && message.trim() && message.length <= maxMessageLength);
    return /* @__PURE__ */ React.createElement("section", { className: "st-section" }, /* @__PURE__ */ React.createElement("div", { className: "st-section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "st-section-title" }, t("newTicket")), /* @__PURE__ */ React.createElement("div", { className: "st-section-hint" }, t("subtitle")))), /* @__PURE__ */ React.createElement("div", { className: "st-row" }, /* @__PURE__ */ React.createElement("div", { className: "st-field" }, /* @__PURE__ */ React.createElement("label", { className: "st-label", htmlFor: "st-customer" }, t("customer"), " ", /* @__PURE__ */ React.createElement("b", null, "*")), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "st-customer",
        className: "st-input",
        value: customerName,
        placeholder: t("customerPlaceholder"),
        onChange: (event) => setCustomerName(event.target.value)
      }
    ), nameError ? /* @__PURE__ */ React.createElement("div", { className: "st-error" }, nameError) : null), /* @__PURE__ */ React.createElement("div", { className: "st-field" }, /* @__PURE__ */ React.createElement("label", { className: "st-label", htmlFor: "st-channel" }, t("channel")), /* @__PURE__ */ React.createElement(
      "select",
      {
        id: "st-channel",
        className: "st-select",
        value: channel,
        onChange: (event) => setChannel(event.target.value)
      },
      channels.map((item) => /* @__PURE__ */ React.createElement("option", { key: item.value, value: item.value }, locale === "en-US" ? item.en_US : item.zh_Hans))
    ))), /* @__PURE__ */ React.createElement("div", { className: "st-field" }, /* @__PURE__ */ React.createElement("label", { className: "st-label", htmlFor: "st-message" }, t("message"), " ", /* @__PURE__ */ React.createElement("b", null, "*")), /* @__PURE__ */ React.createElement(
      "textarea",
      {
        id: "st-message",
        className: "st-textarea",
        value: message,
        placeholder: t("messagePlaceholder"),
        onChange: (event) => setMessage(event.target.value)
      }
    ), /* @__PURE__ */ React.createElement("div", { className: "st-section-hint st-mono" }, message.length, " / ", maxMessageLength), messageError ? /* @__PURE__ */ React.createElement("div", { className: "st-error" }, messageError) : null), /* @__PURE__ */ React.createElement("div", { className: "st-actions" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "st-btn st-btn-primary",
        disabled: busy,
        onClick: () => {
          setTouched(true);
          if (!canSubmit) {
            return;
          }
          onSubmit({
            requestId: newRequestId(),
            customerName: customerName.trim(),
            channel,
            originalMessage: message.trim()
          });
          setCustomerName("");
          setMessage("");
          setTouched(false);
        }
      },
      busy ? t("submitting") : t("submit")
    ), !canSubmit && touched ? /* @__PURE__ */ React.createElement("span", { className: "st-section-hint" }, t("required")) : null));
  }

  // src/lib/remote-components/support-ticket/src/components/review-panel.tsx
  var { useEffect, useState: useState2 } = React;
  function ReviewPanel(props) {
    const { t, locale, item, categories, priorities, channels, busyAction, waitingSeconds, timeoutSeconds, alert } = props;
    const [category, setCategory] = useState2("other");
    const [priority, setPriority] = useState2("p2");
    const [reply, setReply] = useState2("");
    const [validated, setValidated] = useState2(false);
    useEffect(() => {
      setCategory(item.confirmed?.category ?? item.ai?.category ?? "other");
      setPriority(item.confirmed?.priority ?? item.ai?.priority ?? "p2");
      setReply(item.confirmed?.draftReply ?? item.ai?.draftReply ?? "");
      setValidated(false);
    }, [item.id, item.revision]);
    const isConfirmed = item.status === "confirmed";
    const isProcessing = item.status === "processing";
    const canReview = Boolean(item.ai) && !isConfirmed;
    const replyError = validated && !reply.trim() ? t("required") : "";
    const categoryEdited = Boolean(item.confirmed && item.ai && item.confirmed.category && item.confirmed.category !== item.ai.category);
    const replyEdited = Boolean(item.confirmed && item.ai && item.confirmed.draftReply && item.confirmed.draftReply !== item.ai.draftReply);
    const submit = (handler) => () => {
      setValidated(true);
      if (!reply.trim()) {
        return;
      }
      handler({
        expectedRevision: item.revision,
        category,
        priority,
        draftReply: reply.trim()
      });
    };
    return /* @__PURE__ */ React.createElement("div", { className: "st-panel" }, /* @__PURE__ */ React.createElement("section", { className: "st-section" }, /* @__PURE__ */ React.createElement("div", { className: "st-section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "st-section-title st-mono" }, item.ticketNo, " \xB7 ", item.customerName), /* @__PURE__ */ React.createElement("div", { className: "st-section-hint" }, optionLabel(channels, item.channel, locale), " \xB7 ", t("attempt", { count: item.attemptCount }), " \xB7", " ", t("revision", { revision: item.revision }), " \xB7 ", formatDateTime(item.updatedAt ?? item.createdAt, locale))), /* @__PURE__ */ React.createElement("span", { className: cx("st-tag", `st-tag-${item.status}`) }, optionLabel(SUPPORT_TICKET_STATUSES, item.status, locale))), alert ? /* @__PURE__ */ React.createElement("div", { className: cx("st-alert", alert.code === "revision_conflict" ? "st-alert-warning" : "st-alert-error") }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, alert.code ? t(`code_${alert.code}`) : t("failureTitle")), /* @__PURE__ */ React.createElement("span", null, alert.message))) : null, item.status === "failed" ? /* @__PURE__ */ React.createElement("div", { className: "st-alert st-alert-error", style: { marginTop: alert ? 10 : 0 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("strong", null, t("failureTitle")), /* @__PURE__ */ React.createElement("span", null, item.failure?.reason), /* @__PURE__ */ React.createElement("div", { className: "st-section-hint" }, t("failureHint"))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "st-btn st-btn-primary st-btn-sm", disabled: Boolean(busyAction), onClick: props.onRetry }, busyAction === SUPPORT_TICKET_ACTIONS.retryTicket ? t("retrying") : t("retry"))) : null, isProcessing ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "st-skeleton st-skeleton-line", style: { width: "42%" } }), /* @__PURE__ */ React.createElement("div", { className: "st-skeleton st-skeleton-line", style: { width: "78%" } }), /* @__PURE__ */ React.createElement("div", { className: "st-skeleton st-skeleton-line", style: { width: "64%" } }), /* @__PURE__ */ React.createElement("div", { className: "st-section-hint" }, waitingSeconds === null ? t("waitingForTool") : t("aiPendingHint", { seconds: waitingSeconds, timeout: timeoutSeconds })), /* @__PURE__ */ React.createElement("div", { className: "st-actions", style: { marginTop: 10 } }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "st-btn st-btn-ghost st-btn-sm", disabled: Boolean(busyAction), onClick: props.onMarkFailed }, t("markFailed")))) : null), /* @__PURE__ */ React.createElement("section", { className: "st-section" }, /* @__PURE__ */ React.createElement("div", { className: "st-section-head" }, /* @__PURE__ */ React.createElement("div", { className: "st-section-title" }, t("message"))), /* @__PURE__ */ React.createElement("div", { className: "st-reply" }, item.originalMessage)), item.ai ? /* @__PURE__ */ React.createElement("section", { className: "st-section" }, /* @__PURE__ */ React.createElement("div", { className: "st-section-head" }, /* @__PURE__ */ React.createElement("div", { className: "st-section-title" }, t("aiSection")), /* @__PURE__ */ React.createElement("div", { className: "st-section-hint" }, formatDateTime(item.ai.processedAt, locale))), /* @__PURE__ */ React.createElement("div", { className: "st-result-grid" }, /* @__PURE__ */ React.createElement("div", { className: "st-kv" }, /* @__PURE__ */ React.createElement("div", { className: "st-kv-label" }, t("category")), /* @__PURE__ */ React.createElement("div", { className: "st-kv-value" }, optionLabel(categories, item.ai.category, locale), categoryEdited ? /* @__PURE__ */ React.createElement("span", { className: "st-tag st-tag-pending_review", style: { marginLeft: 8 } }, t("edited")) : null)), /* @__PURE__ */ React.createElement("div", { className: "st-kv" }, /* @__PURE__ */ React.createElement("div", { className: "st-kv-label" }, t("priority")), /* @__PURE__ */ React.createElement("div", { className: "st-kv-value" }, optionLabel(priorities, item.ai.priority, locale)))), /* @__PURE__ */ React.createElement("div", { className: "st-field", style: { marginTop: 12 } }, /* @__PURE__ */ React.createElement("div", { className: "st-kv-label" }, t("priorityEvidence")), /* @__PURE__ */ React.createElement("div", { className: "st-quote" }, item.ai.priorityReason)), /* @__PURE__ */ React.createElement("div", { className: "st-field" }, /* @__PURE__ */ React.createElement("div", { className: "st-kv-label" }, t("draftReply")), /* @__PURE__ */ React.createElement("div", { className: "st-reply" }, item.ai.draftReply)), item.ai.missingInfo?.length ? /* @__PURE__ */ React.createElement("div", { className: "st-field" }, /* @__PURE__ */ React.createElement("div", { className: "st-kv-label" }, t("missingInfo")), /* @__PURE__ */ React.createElement("div", { className: "st-quote" }, item.ai.missingInfo.join("\u3001"))) : null, typeof item.ai.confidence === "number" ? /* @__PURE__ */ React.createElement("div", { className: "st-section-hint" }, t("confidence"), ": ", Math.round(item.ai.confidence * 100), "%") : null) : null, canReview ? /* @__PURE__ */ React.createElement("section", { className: "st-section" }, /* @__PURE__ */ React.createElement("div", { className: "st-section-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "st-section-title" }, t("reviewSection")), /* @__PURE__ */ React.createElement("div", { className: "st-section-hint" }, t("reviewerHint")))), /* @__PURE__ */ React.createElement("div", { className: "st-row" }, /* @__PURE__ */ React.createElement("div", { className: "st-field" }, /* @__PURE__ */ React.createElement("label", { className: "st-label", htmlFor: "st-review-category" }, t("category")), /* @__PURE__ */ React.createElement(
      "select",
      {
        id: "st-review-category",
        className: "st-select",
        value: category,
        onChange: (event) => setCategory(event.target.value)
      },
      categories.map((option) => /* @__PURE__ */ React.createElement("option", { key: option.value, value: option.value }, locale === "en-US" ? option.en_US : option.zh_Hans))
    )), /* @__PURE__ */ React.createElement("div", { className: "st-field" }, /* @__PURE__ */ React.createElement("label", { className: "st-label", htmlFor: "st-review-priority" }, t("priority")), /* @__PURE__ */ React.createElement(
      "select",
      {
        id: "st-review-priority",
        className: "st-select",
        value: priority,
        onChange: (event) => setPriority(event.target.value)
      },
      priorities.map((option) => /* @__PURE__ */ React.createElement("option", { key: option.value, value: option.value }, locale === "en-US" ? option.en_US : option.zh_Hans))
    ))), /* @__PURE__ */ React.createElement("div", { className: "st-field" }, /* @__PURE__ */ React.createElement("label", { className: "st-label", htmlFor: "st-review-reply" }, t("draftReply"), " ", /* @__PURE__ */ React.createElement("b", null, "*")), /* @__PURE__ */ React.createElement(
      "textarea",
      {
        id: "st-review-reply",
        className: "st-textarea",
        style: { minHeight: 140 },
        value: reply,
        onChange: (event) => setReply(event.target.value)
      }
    ), replyError ? /* @__PURE__ */ React.createElement("div", { className: "st-error" }, replyError) : null), /* @__PURE__ */ React.createElement("div", { className: "st-actions" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "st-btn st-btn-primary",
        disabled: Boolean(busyAction),
        onClick: submit(props.onConfirm),
        title: item.ai ? void 0 : t("confirmNeedsAi")
      },
      busyAction === SUPPORT_TICKET_ACTIONS.confirmTicket ? t("confirming") : t("confirm")
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "st-btn st-btn-ghost",
        disabled: Boolean(busyAction),
        onClick: submit(props.onSaveDraft)
      },
      busyAction === SUPPORT_TICKET_ACTIONS.saveDraft ? t("saving") : t("saveDraft")
    ))) : null, isConfirmed ? /* @__PURE__ */ React.createElement("section", { className: "st-section" }, /* @__PURE__ */ React.createElement("div", { className: "st-section-head" }, /* @__PURE__ */ React.createElement("div", { className: "st-section-title" }, t("finalReply")), /* @__PURE__ */ React.createElement("div", { className: "st-section-hint" }, replyEdited ? t("edited") : t("untouched"), " \xB7 ", formatDateTime(item.confirmed?.reviewedAt, locale))), /* @__PURE__ */ React.createElement("div", { className: "st-result-grid", style: { marginBottom: 12 } }, /* @__PURE__ */ React.createElement("div", { className: "st-kv" }, /* @__PURE__ */ React.createElement("div", { className: "st-kv-label" }, t("category")), /* @__PURE__ */ React.createElement("div", { className: "st-kv-value" }, optionLabel(categories, item.confirmed?.category, locale))), /* @__PURE__ */ React.createElement("div", { className: "st-kv" }, /* @__PURE__ */ React.createElement("div", { className: "st-kv-label" }, t("priority")), /* @__PURE__ */ React.createElement("div", { className: "st-kv-value" }, optionLabel(priorities, item.confirmed?.priority, locale)))), /* @__PURE__ */ React.createElement("div", { className: "st-reply" }, item.confirmed?.draftReply)) : null, /* @__PURE__ */ React.createElement("section", { className: "st-section" }, /* @__PURE__ */ React.createElement("div", { className: "st-section-head" }, /* @__PURE__ */ React.createElement("div", { className: "st-section-title" }, t("timeline"))), /* @__PURE__ */ React.createElement("div", { className: "st-timeline" }, item.events.map((event, index) => /* @__PURE__ */ React.createElement("div", { className: "st-timeline-item", key: `${event.action}-${index}` }, /* @__PURE__ */ React.createElement("span", { className: "st-dot" }), /* @__PURE__ */ React.createElement("span", { style: { flex: 1 } }, t(`event_${event.action}`), event.detail ? ` \xB7 ${event.detail}` : ""), /* @__PURE__ */ React.createElement("span", null, formatDateTime(event.at, locale)))))));
  }

  // src/lib/remote-components/support-ticket/src/components/ticket-list.tsx
  function TicketList(props) {
    const {
      t,
      locale,
      loading,
      items,
      stats,
      statuses,
      categories,
      priorities,
      status,
      onStatusChange,
      search,
      onSearchChange,
      selectedId,
      onSelect
    } = props;
    const statsMap = stats ?? {};
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "st-tabs", role: "tablist" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        role: "tab",
        "aria-selected": status === "",
        className: cx("st-tab", status === "" && "is-active"),
        onClick: () => onStatusChange("")
      },
      t("allStatuses"),
      /* @__PURE__ */ React.createElement("span", null, stats?.total ?? 0)
    ), statuses.map((item) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: item.value,
        type: "button",
        role: "tab",
        "aria-selected": status === item.value,
        className: cx("st-tab", status === item.value && "is-active"),
        onClick: () => onStatusChange(item.value)
      },
      locale === "en-US" ? item.en_US : item.zh_Hans,
      /* @__PURE__ */ React.createElement("span", null, statsMap[item.value] ?? 0)
    ))), /* @__PURE__ */ React.createElement("div", { className: "st-search" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "st-input",
        value: search,
        placeholder: t("searchPlaceholder"),
        "aria-label": t("searchPlaceholder"),
        onChange: (event) => onSearchChange(event.target.value)
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "st-list" }, loading && items.length === 0 ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "st-skeleton st-skeleton-line" }), /* @__PURE__ */ React.createElement("div", { className: "st-skeleton st-skeleton-line" }), /* @__PURE__ */ React.createElement("div", { className: "st-skeleton st-skeleton-line" })) : null, !loading && items.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "st-empty" }, /* @__PURE__ */ React.createElement("strong", null, search || status ? t("noMatch") : t("emptyList")), /* @__PURE__ */ React.createElement("span", null, search || status ? "" : t("emptyListHint"))) : null, items.map((item) => /* @__PURE__ */ React.createElement(
      "article",
      {
        key: item.id,
        className: cx("st-card", selectedId === item.id && "is-selected"),
        onClick: () => onSelect(item.id)
      },
      /* @__PURE__ */ React.createElement("div", { className: "st-card-top" }, /* @__PURE__ */ React.createElement("span", { className: "st-card-no st-mono" }, item.ticketNo), /* @__PURE__ */ React.createElement("span", { className: cx("st-tag", `st-tag-${item.status}`) }, statusLabel(item.status, statuses, locale))),
      /* @__PURE__ */ React.createElement("div", { className: "st-card-customer" }, item.customerName),
      /* @__PURE__ */ React.createElement("div", { className: "st-card-preview" }, item.confirmedReplyPreview ?? item.draftReplyPreview ?? ""),
      /* @__PURE__ */ React.createElement("div", { className: "st-card-meta" }, item.category ? /* @__PURE__ */ React.createElement("span", { className: "st-tag st-tag-neutral" }, optionLabel(categories, item.category, locale)) : null, item.priority ? /* @__PURE__ */ React.createElement("span", { className: "st-tag st-tag-neutral" }, optionLabel(priorities, item.priority, locale)) : null, /* @__PURE__ */ React.createElement("span", null, formatDateTime(item.updatedAt ?? item.createdAt, locale)))
    ))));
  }
  function statusLabel(status, statuses, locale) {
    const match = statuses.find((item) => item.value === status);
    if (!match) {
      return status;
    }
    return locale === "en-US" ? match.en_US : match.zh_Hans;
  }

  // src/lib/remote-components/support-ticket/src/components/workbench.tsx
  var { useCallback, useEffect: useEffect2, useMemo, useState: useState3 } = React;
  var FALLBACK_META = {
    statuses: [],
    categories: [],
    priorities: [],
    channels: [],
    maxMessageLength: 2e3,
    aiTimeoutSeconds: 90
  };
  function SupportTicketWorkbench(props) {
    const { context, hostEventTick } = props;
    const locale = normalizeLocale(context.locale);
    const t = useMemo(() => createText(context.locale), [context.locale]);
    const [data, setData] = useState3(null);
    const [loading, setLoading] = useState3(true);
    const [selectedId, setSelectedId] = useState3(null);
    const [statusFilter, setStatusFilter] = useState3("");
    const [search, setSearch] = useState3("");
    const [appliedSearch, setAppliedSearch] = useState3("");
    const [busyAction, setBusyAction] = useState3(null);
    const [notice, setNotice] = useState3(null);
    const [alert, setAlert] = useState3(null);
    const [waiting, setWaiting] = useState3(null);
    const [waitingSeconds, setWaitingSeconds] = useState3(null);
    const meta = data?.meta ?? FALLBACK_META;
    const statuses = meta.statuses ?? [];
    const categories = meta.categories ?? [];
    const priorities = meta.priorities ?? [];
    const channels = meta.channels ?? [];
    const timeoutSeconds = meta.aiTimeoutSeconds ?? 90;
    const item = selectedId ? data?.item : void 0;
    const fetchData = useCallback(
      async (ticketId) => {
        const message = await requestData({
          page: 1,
          pageSize: 50,
          search: appliedSearch || void 0,
          parameters: {
            ...statusFilter ? { status: statusFilter } : {},
            ...ticketId ? { ticketId } : {}
          }
        });
        return viewData(message);
      },
      [appliedSearch, statusFilter]
    );
    useEffect2(() => {
      let cancelled = false;
      setLoading(true);
      fetchData(selectedId).then((next) => {
        if (!cancelled) {
          setData(next);
        }
      }).catch((error) => {
        console.error("support-ticket: load failed", error);
        if (!cancelled) {
          setNotice({ kind: "error", text: t("loadFailed") });
        }
      }).finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [fetchData]);
    useEffect2(() => {
      const timer = window.setTimeout(() => setAppliedSearch(search.trim()), 400);
      return () => window.clearTimeout(timer);
    }, [search]);
    useEffect2(() => {
      if (!notice) {
        return void 0;
      }
      const timer = window.setTimeout(() => setNotice(null), 4e3);
      return () => window.clearTimeout(timer);
    }, [notice]);
    useEffect2(() => {
      if (!hostEventTick) {
        return;
      }
      setWaiting(null);
      void fetchData(selectedId).then((next) => {
        setData(next);
        if (selectedId && next.item?.id === selectedId && next.item.status === "pending_review") {
          setNotice({ kind: "success", text: t("noticeAiDone") });
        }
      }).catch((error) => console.error("support-ticket: refresh after tool event failed", error));
    }, [hostEventTick]);
    useEffect2(() => {
      if (!waiting) {
        setWaitingSeconds(null);
        return void 0;
      }
      const update = () => setWaitingSeconds(Math.floor((Date.now() - waiting.startedAt) / 1e3));
      update();
      const interval = window.setInterval(update, 1e3);
      return () => window.clearInterval(interval);
    }, [waiting]);
    useEffect2(() => {
      if (!waiting || waitingSeconds === null || waitingSeconds < timeoutSeconds) {
        return;
      }
      const ticketId = waiting.ticketId;
      setWaiting(null);
      void executeAction(SUPPORT_TICKET_ACTIONS.markTicketFailed, ticketId, {
        reason: t("code_ai_timeout"),
        code: SUPPORT_TICKET_CODES.aiTimeout
      }).then((message) => {
        const outcome = actionOutcome(message);
        const code = outcome.code ?? SUPPORT_TICKET_CODES.aiTimeout;
        setAlert({ code, message: t(`code_${code}`) });
        return fetchData(ticketId).then(setData);
      }).catch((error) => console.error("support-ticket: watchdog failed", error));
    }, [waiting, waitingSeconds, timeoutSeconds]);
    const applyActionAlert = (outcome) => {
      if (outcome.code) {
        setAlert({ code: outcome.code, message: t(`code_${outcome.code}`) });
        return true;
      }
      return false;
    };
    const handToAssistant = async (payloadSource, clientMessageId) => {
      const clientCommand = asObject(payloadSource.clientCommand);
      const commandKey = asString(clientCommand?.commandKey);
      const payload = asObject(clientCommand?.payload);
      if (commandKey !== ASSISTANT_SEND_MESSAGE_COMMAND || !payload) {
        throw new Error("AGENT_COMMAND_MISSING");
      }
      const response = await invokeClientCommand(commandKey, { ...payload, clientMessageId });
      const commandResult = asObject(response.result);
      if (commandResult?.success === false) {
        throw new Error(asString(commandResult.code) ?? "AGENT_COMMAND_REJECTED");
      }
    };
    const submit = (payload) => {
      setBusyAction(SUPPORT_TICKET_ACTIONS.submitTicket);
      setAlert(null);
      void executeAction(SUPPORT_TICKET_ACTIONS.submitTicket, null, { ...payload }).then(async (message) => {
        const outcome = actionOutcome(message);
        if (applyActionAlert(outcome)) {
          return;
        }
        const ticketId = asString(outcome.data.ticketId);
        if (!ticketId) {
          setAlert({ message: t("agentRequestFailed") });
          return;
        }
        setSelectedId(ticketId);
        setWaiting({ ticketId, startedAt: Date.now() });
        setNotice({
          kind: "success",
          text: outcome.data.duplicated ? t("noticeSubmittedDuplicate") : t("noticeSubmitted")
        });
        await handToAssistant(outcome.data, `support-ticket:${ticketId}:1:${Date.now()}`);
      }).catch((error) => {
        console.error("support-ticket: submit failed", error);
        setAlert({ message: t("agentRequestFailed") });
      }).finally(() => setBusyAction(null));
    };
    const retry = () => {
      if (!selectedId) {
        return;
      }
      const ticketId = selectedId;
      setBusyAction(SUPPORT_TICKET_ACTIONS.retryTicket);
      setAlert(null);
      void executeAction(SUPPORT_TICKET_ACTIONS.retryTicket, ticketId).then(async (message) => {
        const outcome = actionOutcome(message);
        if (applyActionAlert(outcome)) {
          return;
        }
        setWaiting({ ticketId, startedAt: Date.now() });
        setNotice({ kind: "success", text: t("noticeRetried") });
        await handToAssistant(outcome.data, `support-ticket:${ticketId}:retry:${Date.now()}`);
      }).catch((error) => {
        console.error("support-ticket: retry failed", error);
        setAlert({ message: t("agentRequestFailed") });
      }).finally(() => setBusyAction(null));
    };
    const runReviewAction = (actionKey, payload, successText) => {
      if (!selectedId) {
        return;
      }
      const ticketId = selectedId;
      setBusyAction(actionKey);
      setAlert(null);
      void executeAction(actionKey, ticketId, { ...payload }).then((message) => {
        const outcome = actionOutcome(message);
        if (applyActionAlert(outcome)) {
          return;
        }
        setNotice({ kind: "success", text: successText });
        return fetchData(ticketId).then(setData);
      }).catch((error) => {
        console.error("support-ticket: review action failed", error);
        setAlert({ message: t("loadFailed") });
      }).finally(() => setBusyAction(null));
    };
    const markFailed = () => {
      if (!selectedId) {
        return;
      }
      setBusyAction(SUPPORT_TICKET_ACTIONS.markTicketFailed);
      void executeAction(SUPPORT_TICKET_ACTIONS.markTicketFailed, selectedId, {
        reason: t("code_ai_timeout"),
        code: SUPPORT_TICKET_CODES.aiTimeout
      }).then((message) => {
        const outcome = actionOutcome(message);
        if (applyActionAlert(outcome)) {
          return;
        }
        setWaiting(null);
        return fetchData(selectedId).then(setData);
      }).catch((error) => console.error("support-ticket: mark failed error", error)).finally(() => setBusyAction(null));
    };
    const refresh = () => {
      setBusyAction(SUPPORT_TICKET_ACTIONS.refresh);
      void fetchData(selectedId).then((next) => {
        setData(next);
        setNotice({ kind: "success", text: t("noticeRefreshed") });
      }).catch((error) => console.error("support-ticket: refresh failed", error)).finally(() => setBusyAction(null));
    };
    const stats = data?.summary?.stats;
    const selectedTitle = asString(asObject(data?.item)?.ticketNo);
    return /* @__PURE__ */ React.createElement("main", { className: "st-shell" }, /* @__PURE__ */ React.createElement("header", { className: "st-topbar" }, /* @__PURE__ */ React.createElement("div", { className: "st-brand" }, /* @__PURE__ */ React.createElement("span", { className: "st-brand-mark" }, "ST"), /* @__PURE__ */ React.createElement("div", { className: "st-brand-text" }, /* @__PURE__ */ React.createElement("div", { className: "st-brand-title" }, t("title")), /* @__PURE__ */ React.createElement("div", { className: "st-brand-sub" }, t("subtitle")))), /* @__PURE__ */ React.createElement("div", { className: "st-topbar-actions" }, /* @__PURE__ */ React.createElement("div", { className: "st-stats" }, /* @__PURE__ */ React.createElement("span", { className: "st-stat" }, t("statProcessing"), /* @__PURE__ */ React.createElement("strong", null, stats?.processing ?? 0)), /* @__PURE__ */ React.createElement("span", { className: "st-stat is-warning" }, t("statPendingReview"), /* @__PURE__ */ React.createElement("strong", null, stats?.pending_review ?? 0)), /* @__PURE__ */ React.createElement("span", { className: "st-stat is-success" }, t("statConfirmed"), /* @__PURE__ */ React.createElement("strong", null, stats?.confirmed ?? 0)), /* @__PURE__ */ React.createElement("span", { className: "st-stat is-danger" }, t("statFailed"), /* @__PURE__ */ React.createElement("strong", null, stats?.failed ?? 0))), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "st-btn st-btn-ghost st-btn-sm",
        disabled: Boolean(busyAction),
        onClick: refresh
      },
      t("refresh")
    ))), /* @__PURE__ */ React.createElement("div", { className: "st-body" }, /* @__PURE__ */ React.createElement("aside", { className: "st-sidebar" }, /* @__PURE__ */ React.createElement(
      TicketList,
      {
        t,
        locale,
        loading,
        items: data?.items ?? [],
        stats,
        statuses,
        categories,
        priorities,
        status: statusFilter,
        onStatusChange: (value) => {
          setStatusFilter(value);
          setSelectedId(null);
          setAlert(null);
        },
        search,
        onSearchChange: setSearch,
        selectedId,
        onSelect: (id) => {
          setSelectedId(id);
          setAlert(null);
        }
      }
    )), /* @__PURE__ */ React.createElement("section", { className: "st-main" }, selectedId && item ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "st-panel", style: { marginBottom: 12 } }, /* @__PURE__ */ React.createElement("div", { className: "st-actions" }, /* @__PURE__ */ React.createElement("span", { className: "st-section-hint" }, t("ticketDetail")), selectedTitle ? /* @__PURE__ */ React.createElement("span", { className: "st-tag st-tag-neutral st-mono" }, selectedTitle) : null, /* @__PURE__ */ React.createElement("span", { className: "st-spacer" }), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "st-btn st-btn-ghost st-btn-sm",
        onClick: () => {
          setSelectedId(null);
          setAlert(null);
        }
      },
      t("newTicket")
    ))), /* @__PURE__ */ React.createElement(
      ReviewPanel,
      {
        t,
        locale,
        item,
        categories,
        priorities,
        channels,
        busyAction,
        waitingSeconds,
        timeoutSeconds,
        alert,
        onSaveDraft: (payload) => runReviewAction(SUPPORT_TICKET_ACTIONS.saveDraft, payload, t("noticeDraftSaved")),
        onConfirm: (payload) => runReviewAction(SUPPORT_TICKET_ACTIONS.confirmTicket, payload, t("noticeConfirmed")),
        onRetry: retry,
        onMarkFailed: markFailed
      }
    )) : /* @__PURE__ */ React.createElement("div", { className: "st-panel" }, alert ? /* @__PURE__ */ React.createElement("div", { className: "st-alert st-alert-error" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, alert.code ? t(`code_${alert.code}`) : t("failureTitle")), /* @__PURE__ */ React.createElement("span", null, alert.message))) : null, /* @__PURE__ */ React.createElement(
      IntakeForm,
      {
        t,
        locale,
        channels,
        maxMessageLength: meta.maxMessageLength ?? 2e3,
        busy: busyAction === SUPPORT_TICKET_ACTIONS.submitTicket,
        onSubmit: submit
      }
    )))), notice ? /* @__PURE__ */ React.createElement("div", { className: "st-toast" }, /* @__PURE__ */ React.createElement("div", { className: cx("st-toast-item", notice.kind === "error" && "is-error"), role: "status" }, notice.text)) : null);
  }

  // src/lib/remote-components/support-ticket/src/styles.ts
  var STYLES = `
:root {
  --st-bg: #f8fafc;
  --st-surface: #ffffff;
  --st-border: #e2e8f0;
  --st-text: #0f172a;
  --st-muted: #475569;
  --st-faint: #94a3b8;
  --st-primary: #2563eb;
  --st-primary-strong: #1d4ed8;
  --st-primary-soft: #eff6ff;
  --st-success: #16a34a;
  --st-success-soft: #ecfdf5;
  --st-warning: #d97706;
  --st-warning-soft: #fffbeb;
  --st-danger: #dc2626;
  --st-danger-soft: #fef2f2;
  color-scheme: light;
}
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  font-family: "PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif;
  background: var(--st-bg);
  color: var(--st-text);
  font-size: 14px;
  line-height: 1.5;
}
.st-shell { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.st-topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 10px 20px; background: #0f172a; color: #fff; flex-shrink: 0;
}
.st-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.st-brand-mark {
  display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #38bdf8); font-weight: 600; flex-shrink: 0;
}
.st-brand-text { min-width: 0; }
.st-brand-title { font-size: 15px; font-weight: 600; }
.st-brand-sub { font-size: 12px; color: #94a3b8; }
.st-topbar-actions { display: flex; align-items: center; gap: 16px; }
.st-stats { display: flex; align-items: center; gap: 14px; }
.st-stat { display: flex; align-items: baseline; gap: 6px; font-size: 12px; color: #cbd5f5; }
.st-stat strong { font-size: 16px; color: #fff; font-weight: 600; }
.st-stat.is-warning strong { color: #fbbf24; }
.st-stat.is-danger strong { color: #fca5a5; }
.st-stat.is-success strong { color: #6ee7b7; }
.st-body { flex: 1; min-height: 0; display: flex; }
.st-sidebar {
  width: 320px; flex-shrink: 0; border-right: 1px solid var(--st-border); background: var(--st-surface);
  display: flex; flex-direction: column; min-height: 0;
}
.st-sidebar-head { padding: 12px 14px 8px; border-bottom: 1px solid var(--st-border); }
.st-tabs { display: flex; gap: 4px; padding: 8px 12px 0; flex-wrap: wrap; }
.st-tab {
  border: none; background: transparent; padding: 6px 10px; border-radius: 8px; cursor: pointer;
  font-size: 13px; color: var(--st-muted); transition: background 0.15s ease, color 0.15s ease;
}
.st-tab:hover { background: #f1f5f9; color: var(--st-text); }
.st-tab.is-active { background: var(--st-primary-soft); color: var(--st-primary-strong); font-weight: 600; }
.st-tab span { margin-left: 4px; color: var(--st-faint); font-size: 12px; }
.st-search { margin: 10px 12px; display: flex; align-items: center; gap: 8px; }
.st-input, .st-textarea, .st-select {
  width: 100%; border: 1px solid var(--st-border); border-radius: 10px; background: #fff;
  padding: 8px 10px; font-size: 13px; color: var(--st-text); outline: none; font-family: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.st-input:focus, .st-textarea:focus, .st-select:focus {
  border-color: var(--st-primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}
.st-textarea { resize: vertical; min-height: 96px; line-height: 1.6; }
.st-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px 12px; }
.st-card {
  background: var(--st-surface); border: 1px solid var(--st-border); border-radius: 10px;
  padding: 10px 12px; margin-bottom: 8px; cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.st-card:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08); }
.st-card.is-selected { border-color: var(--st-primary); box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12); }
.st-card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.st-card-no { font-size: 12px; color: var(--st-faint); font-variant-numeric: tabular-nums; }
.st-card-customer { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.st-card-preview { font-size: 12px; color: var(--st-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.st-card-meta { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 11px; color: var(--st-faint); flex-wrap: wrap; }
.st-tag {
  display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 600; border: 1px solid transparent; white-space: nowrap;
}
.st-tag-processing { background: var(--st-primary-soft); color: var(--st-primary-strong); border-color: #bfdbfe; }
.st-tag-pending_review { background: var(--st-warning-soft); color: var(--st-warning); border-color: #fde68a; }
.st-tag-confirmed { background: var(--st-success-soft); color: var(--st-success); border-color: #bbf7d0; }
.st-tag-failed { background: var(--st-danger-soft); color: var(--st-danger); border-color: #fecaca; }
.st-tag-neutral { background: #f1f5f9; color: var(--st-muted); border-color: var(--st-border); }
.st-main { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; padding: 16px 20px 28px; }
.st-panel { max-width: 880px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.st-section {
  background: var(--st-surface); border: 1px solid var(--st-border); border-radius: 12px; padding: 16px;
  animation: st-fade-in 0.22s ease both;
}
.st-section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.st-section-title { font-size: 14px; font-weight: 600; }
.st-section-hint { font-size: 12px; color: var(--st-faint); }
.st-field { margin-bottom: 12px; }
.st-label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--st-muted); margin-bottom: 6px; }
.st-label b { color: var(--st-danger); font-weight: 600; }
.st-row { display: flex; gap: 12px; }
.st-row > * { flex: 1; }
.st-error { color: var(--st-danger); font-size: 12px; margin-top: 6px; }
.st-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border-radius: 10px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer;
  border: 1px solid transparent; transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
.st-btn:hover:not(:disabled) { transform: translateY(-1px); }
.st-btn-primary { background: var(--st-primary); color: #fff; }
.st-btn-primary:hover:not(:disabled) { background: var(--st-primary-strong); box-shadow: 0 6px 14px rgba(37, 99, 235, 0.24); }
.st-btn-ghost { background: #fff; border-color: var(--st-border); color: var(--st-muted); }
.st-btn-ghost:hover:not(:disabled) { border-color: var(--st-primary); color: var(--st-primary); }
.st-btn-danger { background: var(--st-danger-soft); color: var(--st-danger); border-color: #fecaca; }
.st-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.st-btn-sm { padding: 5px 10px; font-size: 12px; }
.st-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.st-spacer { flex: 1; }
.st-alert { display: flex; gap: 10px; padding: 12px 14px; border-radius: 10px; font-size: 13px; align-items: flex-start; }
.st-alert-error { background: var(--st-danger-soft); border: 1px solid #fecaca; color: #991b1b; }
.st-alert-warning { background: var(--st-warning-soft); border: 1px solid #fde68a; color: #92400e; }
.st-alert-success { background: var(--st-success-soft); border: 1px solid #bbf7d0; color: #14532d; }
.st-alert strong { display: block; margin-bottom: 2px; }
.st-result-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.st-kv { background: #f8fafc; border: 1px solid var(--st-border); border-radius: 10px; padding: 10px 12px; }
.st-kv-label { font-size: 11px; color: var(--st-faint); margin-bottom: 4px; }
.st-kv-value { font-size: 13px; font-weight: 600; }
.st-quote { font-size: 13px; color: var(--st-muted); white-space: pre-wrap; }
.st-reply {
  background: #f8fafc; border: 1px solid var(--st-border); border-radius: 10px; padding: 12px;
  font-size: 13px; line-height: 1.7; white-space: pre-wrap;
}
.st-skeleton { border-radius: 8px; background: linear-gradient(90deg, #eef2f7 25%, #f8fafc 37%, #eef2f7 63%); background-size: 400% 100%; animation: st-shimmer 1.3s ease infinite; }
.st-skeleton-line { height: 12px; margin-bottom: 10px; }
.st-empty { padding: 40px 16px; text-align: center; color: var(--st-faint); font-size: 13px; }
.st-empty strong { display: block; color: var(--st-muted); font-size: 14px; margin-bottom: 6px; }
.st-timeline { display: flex; flex-direction: column; gap: 8px; }
.st-timeline-item { display: flex; gap: 10px; font-size: 12px; color: var(--st-muted); }
.st-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--st-primary); margin-top: 6px; flex-shrink: 0; }
.st-toast {
  position: fixed; right: 20px; bottom: 20px; z-index: 40; display: flex; flex-direction: column; gap: 8px;
}
.st-toast-item {
  min-width: 220px; max-width: 360px; padding: 10px 14px; border-radius: 10px; font-size: 13px;
  background: #0f172a; color: #fff; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.24);
  animation: st-slide-in 0.24s ease both;
}
.st-toast-item.is-error { background: #b91c1c; }
.st-mono { font-variant-numeric: tabular-nums; }
@keyframes st-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
@keyframes st-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes st-slide-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
@media (max-width: 1024px) {
  .st-body { flex-direction: column; }
  .st-sidebar { width: 100%; max-height: 42%; border-right: none; border-bottom: 1px solid var(--st-border); }
  .st-result-grid { grid-template-columns: minmax(0, 1fr); }
}
`;
  var injected = false;
  function injectStyles() {
    if (injected || typeof document === "undefined") {
      return;
    }
    const style = document.createElement("style");
    style.setAttribute("data-support-ticket", "workbench");
    style.textContent = STYLES;
    document.head.appendChild(style);
    injected = true;
  }

  // src/lib/remote-components/support-ticket/src/main.tsx
  var { useEffect: useEffect3, useState: useState4 } = React;
  injectStyles();
  function App() {
    const [context, setContext] = useState4(null);
    const [hostEventTick, setHostEventTick] = useState4(0);
    useEffect3(() => {
      const dispose = installBridge({
        onInit: (next) => setContext(next),
        onHostEvent: () => setHostEventTick((tick) => tick + 1)
      });
      post("ready");
      return dispose;
    }, []);
    useEffect3(() => {
      const timer = window.setTimeout(reportResize, 0);
      return () => window.clearTimeout(timer);
    });
    if (!context) {
      return /* @__PURE__ */ React.createElement("main", { className: "st-shell" }, /* @__PURE__ */ React.createElement("div", { className: "st-empty" }, "Support Ticket Workbench"));
    }
    return /* @__PURE__ */ React.createElement(SupportTicketWorkbench, { context, hostEventTick });
  }
  var rootElement = document.getElementById("root");
  var root = ReactDOM.createRoot ? ReactDOM.createRoot(rootElement) : null;
  if (root) {
    root.render(/* @__PURE__ */ React.createElement(App, null));
  } else {
    ReactDOM.render?.(/* @__PURE__ */ React.createElement(App, null), rootElement);
  }
})();
