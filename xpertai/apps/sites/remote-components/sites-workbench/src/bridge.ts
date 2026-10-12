import { z } from "zod/v3";
import { applyTheme } from "./theme";


const channel = "xpertai.remote_component";
const runtimeScopeSchema = z.object({
  projectId: z.string().nullable(),
  conversationId: z.string().nullable(),
});
const contextEventSchema = z.object({
  type: z.literal("view.context.changed"),
  data: z.object({ revision: z.number().int().nonnegative(), runtimeScope: runtimeScopeSchema }),
});
const initSchema = z
  .object({
    instanceId: z.string(),
    scopeRevision: z.number().optional(),
    runtimeScope: runtimeScopeSchema.optional(),
    locale: z.string().optional(),
    debug: z.object({ enabled: z.boolean() }).optional(),
    manifest: z.object({
      key: z.string(),
      icon: z.object({ type: z.string(), value: z.string().optional() }).passthrough().optional(),
    }).passthrough(),
    initialQuery: z
      .object({
        selectionId: z.string().optional(),
        parameters: z.object({
          listPage: z.number().int().positive().catch(1),
          listPageSize: z.union([z.literal(10), z.literal(20), z.literal(50)]).catch(20),
          listSearch: z.string().max(200).catch(""),
        }).passthrough().optional(),
      })
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
function rejectPending(code: string) {
  for (const item of pending.values()) {
    clearTimeout(item.timer);
    item.reject(new Error(code));
  }
  pending.clear();
}
export function connect(onInit: (host: Host) => void, onEvent?: () => void) {
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
        event: z.unknown(),
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
        rejectPending("context_changed");
      }
      host = init.data;
      applyTheme(host);
      if (host.debug?.enabled) console.debug('[sites] bridge initialized');
      onInit(host);
      post("resize", { height: window.innerHeight, viewportBound: true });
      return;
    }
    // Retained Views receive a context event instead of another init when the
    // host opens a conversation. Adopt its revision before sending more requests.
    if (message.type === "hostEvent" && host && message.instanceId === host.instanceId) {
      const context = contextEventSchema.safeParse(message.event);
      if (context.success && context.data.data.revision > (host.scopeRevision ?? -1)) {
        rejectPending("context_changed");
        host = { ...host, scopeRevision: context.data.data.revision, runtimeScope: context.data.data.runtimeScope };
        onInit(host);
      } else onEvent?.();
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
          message.code ?? "request_failed"
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
  const requestId = `sites-${++counter}`;
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
export async function command(commandKey: string, payload: Record<string, unknown>) {
  const result = actionResult.parse(await request('invokeClientCommand', { commandKey, payload }));
  if (!result.success) throw new Error(result.code ?? 'command_unavailable');
  return result.data;
}
