import { z } from "zod/v3";
import { applyTheme } from "./theme";
import { captureCommands } from "../../../src/capture-contract";

const channel = "xpertai.remote_component";
const initSchema = z
  .object({
    instanceId: z.string(),
    scopeRevision: z.number().optional(),
    locale: z.string().optional(),
    manifest: z.object({
      key: z.string(),
      icon: z.object({ type: z.string(), value: z.string().optional() }).passthrough().optional(),
    }).passthrough(),
    initialQuery: z
      .object({ selectionId: z.string().optional() })
      .passthrough()
      .optional(),
    theme: z
      .object({
        mode: z.string().optional(),
        cssVars: z.record(z.string()).optional(),
        tokens: z.record(z.string()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type Host = z.infer<typeof initSchema>;
let host: Host | null = null;
let counter = 0;
const pending = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    responseType: string;
  }
>();
export function connect(onInit: (host: Host) => void) {
  const handler = (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return;
    const parsed = z
      .object({
        channel: z.literal(channel),
        protocolVersion: z.literal(1),
        type: z.string(),
        instanceId: z.string().optional(),
        scopeRevision: z.number().optional(),
        requestId: z.string().optional(),
        data: z.unknown(),
        result: z.unknown(),
        message: z.string().optional(),
        code: z.string().optional(),
      })
      .passthrough()
      .safeParse(event.data);
    if (!parsed.success) return;
    const message = parsed.data;
    if (message.type === "init") {
      const init = initSchema.safeParse(event.data);
      if (!init.success) return;
      if (
        host &&
        (host.instanceId !== init.data.instanceId ||
          host.scopeRevision !== init.data.scopeRevision)
      ) {
        for (const item of pending.values()) {
          clearTimeout(item.timer);
          item.reject(new Error("scope_changed"));
        }
        pending.clear();
      }
      host = init.data;
      applyTheme(host);
      onInit(host);
      post("resize", { height: window.innerHeight, viewportBound: true });
      return;
    }
    if (
      !host ||
      message.instanceId !== host.instanceId ||
      (message.scopeRevision !== host.scopeRevision &&
        !(message.type === "error" && message.scopeRevision === undefined))
    )
      return;
    const item = message.requestId ? pending.get(message.requestId) : undefined;
    // Host error envelopes can omit the revision. A unique pending request id
    // still binds them to this scope; changing scope rejects and clears the map.
    if (!item || !message.requestId) return;
    if (message.type !== "error" && message.type !== item.responseType) return;
    pending.delete(message.requestId);
    clearTimeout(item.timer);
    if (message.type === "error")
      item.reject(
        new Error(
          message.code === "context_changed"
            ? "scope_changed"
            : message.code ?? "request_failed"
        )
      );
    else item.resolve(message.data ?? message.result);
  };
  window.addEventListener("message", handler);
  post("ready");
  return () => {
    window.removeEventListener("message", handler);
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error("view_closed"));
    }
    pending.clear();
  };
}
function post(type: string, payload: Record<string, unknown> = {}) {
  window.parent.postMessage(
    {
      channel,
      protocolVersion: 1,
      instanceId: host?.instanceId,
      scopeRevision: host?.scopeRevision,
      type,
      ...payload,
    },
    "*"
  );
}
function request(type: string, payload: Record<string, unknown>, timeoutMs = 30000) {
  if (!host) return Promise.reject(new Error("host_unavailable"));
  const requestId = `meetings-${++counter}`;
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("request_timeout"));
    }, timeoutMs);
    pending.set(requestId, {
      resolve,
      reject,
      timer,
      responseType:
        type === "requestData"
          ? "data"
          : type === "executeAction"
          ? "actionResult"
          : "clientCommandResult",
    });
    post(type, { requestId, ...payload });
  });
}
export async function data(query: Record<string, unknown>) {
  return request("requestData", { query });
}
const actionResult = z
  .object({
    success: z.boolean(),
    data: z.unknown().optional(),
    code: z.string().optional(),
  })
  .passthrough();
export async function action(key: string, input: Record<string, unknown>) {
  const result = actionResult.parse(
    await request("executeAction", { actionKey: key, input })
  );
  if (!result.success) {
    const detail = z.object({ code: z.string() }).safeParse(result.data);
    throw new Error(
      detail.success ? detail.data.code : result.code ?? "operation_failed"
    );
  }
  return result.data;
}
export async function command(key: string, payload: Record<string, unknown>) {
  const isCapture = captureCommands.some((commandKey) => commandKey === key);
  try {
    const result = actionResult.parse(
      await request("invokeClientCommand", { commandKey: key, payload }, key === "browser.audio.capture.start" ? 180000 : 30000)
    );
    if (!result.success)
      throw new Error(
        result.code ?? (isCapture ? "capture_unavailable" : "operation_failed")
      );
    return result.data;
  } catch (error) {
    // Transport failures do not identify a browser or an OS permission denial.
    if (
      isCapture &&
      (error instanceof z.ZodError ||
        (error instanceof Error &&
          ["request_failed", "host_unavailable"].includes(error.message)))
    ) {
      throw new Error("capture_unavailable");
    }
    throw error;
  }
}
