export interface McpAppHostContext {
  locale?: string;
  language?: string;
  direction?: string;
}

export interface McpAppHandlers {
  onHostContext(context: McpAppHostContext): void;
  onToolInput(input: unknown): void;
  onToolResult(result: unknown): void;
  onError(error: Error): void;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: number;
}

/**
 * Small standard MCP Apps JSON-RPC bridge. The iframe receives only protocol
 * messages from its parent; authentication and organization scope stay in the host.
 */
export class McpAppBridge {
  readonly #pending = new Map<number, PendingRequest>();
  readonly #handlers: McpAppHandlers;
  #nextRequestId = 1;

  constructor(handlers: McpAppHandlers) {
    this.#handlers = handlers;
    window.addEventListener("message", this.#handleMessage);
  }

  async initialize(name: string, version: string) {
    const result = await this.request("ui/initialize", {
      protocolVersion: "2026-01-26",
      appInfo: { name, version },
      appCapabilities: { availableDisplayModes: ["inline"] },
    });
    this.#handlers.onHostContext(readHostContext(result));
    this.notify("ui/notifications/initialized");
    this.notifySize();
  }

  callTool(name: string, arguments_: Record<string, unknown>) {
    return this.request("tools/call", { name, arguments: arguments_ });
  }

  request(method: string, params: Record<string, unknown> = {}) {
    const id = this.#nextRequestId++;
    return new Promise<unknown>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        if (!this.#pending.delete(id)) return;
        reject(new Error(`Timed out waiting for ${method}.`));
      }, 15_000);
      this.#pending.set(id, { resolve, reject, timeout });
      // Register before posting so even a synchronous test host cannot reply
      // before this request is visible in the pending-response map.
      this.#post({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params: Record<string, unknown> = {}) {
    this.#post({ jsonrpc: "2.0", method, params });
  }

  notifySize() {
    window.setTimeout(() => {
      const height = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        240
      );
      this.notify("ui/notifications/size-changed", { height });
    }, 0);
  }

  observeSize(element: HTMLElement) {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => this.notifySize());
    observer.observe(element);
  }

  readonly #handleMessage = (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    const message = parseMessage(event.data);
    if (!message) return;

    const id = readRequestId(message);
    if (id !== undefined) {
      const pending = this.#pending.get(id);
      if (!pending) return;
      window.clearTimeout(pending.timeout);
      this.#pending.delete(id);
      const errorMessage = readErrorMessage(message);
      if (errorMessage) pending.reject(new Error(errorMessage));
      else pending.resolve(Reflect.get(message, "result"));
      return;
    }

    const method = Reflect.get(message, "method");
    const params = Reflect.get(message, "params");
    if (method === "ui/notifications/tool-input")
      this.#handlers.onToolInput(params);
    if (method === "ui/notifications/tool-result")
      this.#handlers.onToolResult(params);
  };

  #post(message: Record<string, unknown>) {
    window.parent.postMessage(message, "*");
  }
}

export function extractToolArguments(value: unknown) {
  const params = asObject(value);
  const arguments_ = params
    ? asObject(Reflect.get(params, "arguments"))
    : undefined;
  return arguments_ ?? params;
}

export function extractStructuredContent(value: unknown) {
  const direct = asObject(value);
  if (!direct) return undefined;
  const structured = asObject(Reflect.get(direct, "structuredContent"));
  if (structured) return structured;
  const result = asObject(Reflect.get(direct, "result"));
  return result
    ? asObject(Reflect.get(result, "structuredContent")) ?? result
    : undefined;
}

export function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}

function parseMessage(value: unknown): object | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value))
    return value;
  if (typeof value !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function readRequestId(message: object) {
  const value = Reflect.get(message, "id");
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : undefined;
}

function readErrorMessage(message: object) {
  const error = Reflect.get(message, "error");
  if (!error || typeof error !== "object") return undefined;
  const text = Reflect.get(error, "message");
  return typeof text === "string" && text ? text : "MCP App request failed.";
}

function readHostContext(value: unknown): McpAppHostContext {
  const result = asObject(value);
  const context = result
    ? asObject(Reflect.get(result, "hostContext")) ??
      asObject(Reflect.get(result, "context"))
    : undefined;
  return {
    locale: readString(context, "locale"),
    language: readString(context, "language"),
    direction: readString(context, "direction"),
  };
}

function readString(value: Record<string, unknown> | undefined, key: string) {
  const field = value?.[key];
  return typeof field === "string" && field ? field : undefined;
}
