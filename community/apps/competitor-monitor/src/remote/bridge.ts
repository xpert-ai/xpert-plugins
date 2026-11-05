import { z } from "zod";
import { installShadcnThemeVars } from "@xpert-ai/plugin-shadcn-ui/theme";
import { i18n } from "./i18n";
import {
  actionDataSchema,
  datasetSchema,
  type Action,
  type ActionData,
} from "./types";
const CHANNEL = "xpertai.remote_component";
const envelope = z
  .object({
    channel: z.literal(CHANNEL),
    protocolVersion: z.literal(1),
    type: z.string(),
    instanceId: z.string().optional(),
    scopeRevision: z.number().optional(),
    requestId: z.string().optional(),
    locale: z.string().optional(),
    debug: z.object({ enabled: z.boolean() }).optional(),
    theme: z
      .object({
        mode: z.string().optional(),
        density: z.enum(["default", "compact"]).optional(),
        tokens: z.record(z.union([z.string(), z.number()])).optional(),
      })
      .optional(),
  })
  .passthrough();
type Envelope = z.infer<typeof envelope>;
export class RemoteBridge {
  private instanceId?: string;
  private scopeRevision?: number;
  private sequence = 0;
  private debug = false;
  private pending = new Map<
    string,
    {
      resolve: (value: Envelope) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private readonly win: Window,
    private readonly timeout = 30000,
  ) {}
  private clear() {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(Error("scope_changed"));
    }
    this.pending.clear();
  }
  start(onRefresh: () => void, onReset: () => void) {
    const listener = (event: MessageEvent) => {
      if (event.source !== this.win.parent) return;
      const parsed = envelope.safeParse(event.data);
      if (!parsed.success) return;
      const message = parsed.data;
      if (message.type === "init" && message.instanceId) {
        if (this.instanceId && message.instanceId !== this.instanceId) return;
        const first = !this.instanceId,
          changed = !first && message.scopeRevision !== this.scopeRevision;
        this.instanceId = message.instanceId;
        this.scopeRevision = message.scopeRevision;
        this.debug = message.debug?.enabled ?? false;
        i18n.setLocale(message.locale);
        if (message.theme) {
          const root = this.win.document.documentElement;
          root.classList.toggle("dark", message.theme.mode === "dark");
          for (const [key, value] of Object.entries(
            message.theme.tokens ?? {},
          )) {
            const property = key.startsWith("--")
              ? key
              : `--xui-${key.replace(/[._]/g, "-").replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
            if (property.startsWith("--xui-"))
              root.style.setProperty(property, String(value));
          }
          installShadcnThemeVars({ density: message.theme.density });
        }
        // 语言/主题更新只更新展示，不清空表单或重复读取业务数据。
        if (changed) {
          this.clear();
          onReset();
        }
        if (first || changed) onRefresh();
        return;
      }
      if (
        !this.instanceId ||
        message.instanceId !== this.instanceId ||
        message.scopeRevision !== this.scopeRevision
      )
        return;
      if (message.type === "hostEvent") {
        onRefresh();
        return;
      }
      const request = message.requestId
        ? this.pending.get(message.requestId)
        : undefined;
      if (!request) return;
      clearTimeout(request.timer);
      this.pending.delete(message.requestId!);
      if (message.type === "error")
        request.reject(Error("host_request_failed"));
      else request.resolve(message);
    };
    this.win.addEventListener("message", listener);
    this.win.parent.postMessage(
      { channel: CHANNEL, protocolVersion: 1, type: "ready" },
      "*",
    );
    return () => {
      this.win.removeEventListener("message", listener);
      this.clear();
    };
  }
  private send(type: string, body: object): Promise<Envelope> {
    if (!this.instanceId) return Promise.reject(Error("not_connected"));
    const requestId = `monitor-${++this.sequence}`;
    // 调试只记录请求类型和编号，不输出业务内容或身份信息。
    if (this.debug) console.debug("[competitor-monitor]", type, requestId);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(Error("host_timeout"));
      }, this.timeout);
      this.pending.set(requestId, { resolve, reject, timer });
      this.win.parent.postMessage(
        {
          channel: CHANNEL,
          protocolVersion: 1,
          instanceId: this.instanceId,
          scopeRevision: this.scopeRevision,
          requestId,
          type,
          ...body,
        },
        "*",
      );
    });
  }
  async load() {
    const response = await this.send("requestData", {
      query: { parameters: {} },
    });
    return z.object({ item: datasetSchema }).parse(response.data).item;
  }
  action: Action = async (actionKey, input) => {
    const response = await this.send("executeAction", { actionKey, input });
    const result = z
      .object({
        success: z.boolean(),
        message: z.union([z.string(), z.record(z.string())]).optional(),
        data: actionDataSchema.optional(),
      })
      .parse(response.result);
    if (!result.success)
      throw Error(
        result.message ? i18n.label(result.message) : "host_request_failed",
      );
    return result.data ?? {};
  };
  async dispatch(data: ActionData) {
    if (!data.analysisMessage) throw Error("analysis_dispatch_failed");
    const response = await this.send("invokeClientCommand", {
      commandKey: "assistant.chat.send_message",
      payload: { text: data.analysisMessage },
    });
    const result = z
      .object({ success: z.boolean() })
      .safeParse(response.result);
    // 只有明确拒绝才释放分析标记；超时不能证明助手没有开始执行。
    if (!result.success || !result.data.success) {
      if (data.roundId)
        await this.action("cancel_analysis_request", {
          roundId: data.roundId,
        }).catch(() => {});
      throw Error("analysis_dispatch_failed");
    }
  }
}
