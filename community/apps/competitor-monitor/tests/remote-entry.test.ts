// 使用实际构建的 React 页面验证消息、审核、错误与沙箱；宿主响应明确为测试模拟。
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";
import { CompetitorMonitorViewProvider } from "../dist/lib/view.provider.js";
import { VIEW, REMOTE_ENTRY } from "../dist/lib/constants.js";
import en from "../src/remote/locales/en-US.json";
import zh from "../src/remote/locales/zh-Hans.json";
const html = await readFile(
  new URL("../dist/remote/index.html", import.meta.url),
  "utf8",
);
const data = () => ({
  items: [
    {
      id: "i1",
      itemId: "6543210",
      title: "<script>商品</script>",
      status: "active",
    },
  ],
  rounds: [
    {
      id: "r1",
      status: "success",
      startedAt: "2026-11-04T06:07:13Z",
      errorReason: null,
    },
  ],
  changes: [
    {
      id: "c1",
      roundId: "r1",
      itemId: "6543210",
      dimension: "price",
      beforeValue: "199",
      afterValue: "179",
      evidence: "mock:6543210:price",
      severity: "high",
    },
  ],
  advice: [
    {
      id: "a1",
      changeId: "c1",
      category: "promotion_adjustment",
      content: "<b>建议</b>",
      reason: "price evidence",
      status: "pending",
      revision: 4,
    },
  ],
});
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail("UI did not reach expected state");
}
type Request = {
  type: string;
  requestId?: string;
  actionKey?: string;
  input?: {
    id?: string;
    expectedRevision?: number;
    roundId?: string;
    target?: string;
    confirmation?: string;
  };
  payload?: { text?: string };
};
async function page(rejectDispatch = false) {
  const state = data(),
    requests: Request[] = [],
    errors: Error[] = [];
  let dom: JSDOM;
  const console = new VirtualConsole();
  console.on("jsdomError", (e) => {
    if (!e.message.includes("Could not parse CSS stylesheet")) errors.push(e);
  });
  dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://fixture.invalid",
    virtualConsole: console,
    beforeParse(win) {
      for (const key of ["localStorage", "sessionStorage"])
        Object.defineProperty(win, key, {
          get() {
            throw new win.DOMException("Sandbox", "SecurityError");
          },
        });
      win.HTMLElement.prototype.scrollIntoView = () => {};
      win.postMessage = (message: Request) => {
        requests.push(message);
        setTimeout(() => {
          let result: object = { success: true, data: {} };
          if (message.type === "ready") {
            emit({
              type: "init",
              locale: "zh-Hans",
              theme: {
                mode: "light",
                density: "compact",
                tokens: { "color.border": "#ddeeff" },
              },
            });
            return;
          }
          if (message.type === "requestData") {
            emit({
              type: "data",
              requestId: message.requestId,
              data: { item: state },
            });
            return;
          }
          if (message.type === "executeAction") {
            if (message.actionKey === "approve_advice") {
              assert.equal(message.input?.expectedRevision, 4);
              state.advice[0].status = "approved";
            }
            if (message.actionKey === "prepare_analysis")
              result = {
                success: true,
                data: { roundId: "r1", analysisMessage: "Analyze r1" },
              };
            if (message.actionKey === "retry_collection") {
              assert.equal(message.input?.roundId, "r1");
              state.rounds[0].status = "success";
              state.rounds[0].errorReason = null;
              result = {
                success: true,
                data: { round: state.rounds[0], changes: state.changes },
              };
            }
            if (message.actionKey === "delete_records") {
              const deleted = message.input?.confirmation === "digest";
              result = {
                success: true,
                data: {
                  confirmation: "digest",
                  counts: {
                    items: 1,
                    rounds: 1,
                    snapshots: 2,
                    changes: 1,
                    advice: 1,
                  },
                  deleted,
                },
              };
              if (deleted) {
                state.items = [];
                state.rounds = [];
                state.changes = [];
                state.advice = [];
              }
            }
          }
          if (message.type === "invokeClientCommand")
            result = { success: !rejectDispatch };
          emit({ type: "result", requestId: message.requestId, result });
        }, 0);
      };
    },
  });
  function emit(body: object) {
    dom.window.dispatchEvent(
      new dom.window.MessageEvent("message", {
        source: dom.window,
        data: {
          channel: "xpertai.remote_component",
          protocolVersion: 1,
          instanceId: "fixture",
          ...body,
        },
      }),
    );
  }
  await until(
    () => dom.window.document.body.textContent?.includes("6543210") === true,
  );
  function button(label: string) {
    const el = [...dom.window.document.querySelectorAll("button")].find(
      (b) => b.textContent === label,
    );
    assert.ok(el, `Missing ${label}`);
    el.click();
  }
  return { dom, state, requests, errors, emit, button };
}
test("built provider serves the actual bundled React entry", async () => {
  const entry =
    await CompetitorMonitorViewProvider.prototype.getRemoteComponentEntry(
      Object.create(null),
      VIEW,
      { isolation: "iframe", entry: REMOTE_ENTRY },
    );
  assert.equal(entry.html, html);
  assert.equal(entry.contentType, "text/html; charset=utf-8");
  assert.ok(html.includes("xpert-shadcn-ui-theme-vars"));
  assert.ok(!html.includes("<!-- SCRIPT -->"));
});
test("catalog keys and interpolation parameters match", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  for (const key of Object.keys(en) as (keyof typeof en)[])
    assert.deepEqual(
      en[key].match(/{{\w+}}/g)?.sort(),
      zh[key].match(/{{\w+}}/g)?.sort(),
      key,
    );
});
test("sandbox renders escaped evidence and preserves reviewed state after host refresh", async () => {
  const p = await page();
  try {
    const body = p.dom.window.document.body;
    assert.ok(body.textContent?.includes("14:07:13"));
    assert.ok(body.textContent?.includes("-10.1%"));
    assert.ok(body.textContent?.includes("<script>商品</script>"));
    assert.equal(body.querySelectorAll("b").length, 0);
    p.button("查看采集证据");
    await until(
      () => body.textContent?.includes("mock:6543210:price") === true,
    );
    p.button("采纳建议");
    await until(() => body.textContent?.includes("已采纳") === true);
    p.emit({ type: "hostEvent" });
    await until(
      () => p.requests.filter((r) => r.type === "requestData").length >= 3,
    );
    assert.equal(p.state.advice[0].status, "approved");
    assert.ok(
      ![...body.querySelectorAll("button")].some(
        (b) => b.textContent === "采纳建议",
      ),
    );
    assert.deepEqual(p.errors, []);
  } finally {
    p.dom.window.close();
  }
});
test("locale-only init preserves input and does not refetch; theme variables are installed", async () => {
  const p = await page();
  try {
    const count = p.requests.filter((r) => r.type === "requestData").length;
    p.button("添加商品");
    await until(() => !!p.dom.window.document.querySelector("#item-title"));
    const input =
      p.dom.window.document.querySelector<HTMLInputElement>("#item-title")!;
    Object.getOwnPropertyDescriptor(
      p.dom.window.HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "draft");
    input.dispatchEvent(new p.dom.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    p.emit({
      type: "init",
      locale: "en-US",
      theme: {
        mode: "dark",
        density: "default",
        tokens: { "color.border": "#334455" },
      },
    });
    await until(
      () =>
        p.dom.window.document.body.textContent?.includes("Add product") ===
        true,
    );
    assert.equal(
      p.requests.filter((r) => r.type === "requestData").length,
      count,
    );
    assert.equal(input.value, "draft");
    assert.equal(p.dom.window.document.documentElement.lang, "en");
    assert.ok(p.dom.window.document.documentElement.classList.contains("dark"));
    assert.equal(
      p.dom.window.document.documentElement.style.getPropertyValue(
        "--xui-color-border",
      ),
      "#334455",
    );
    assert.deepEqual(p.errors, []);
  } finally {
    p.dom.window.close();
  }
});
test("host rejection cancels unsent analysis and never reports successful dispatch", async () => {
  const p = await page(true);
  try {
    p.button("交给 AI 分析");
    await until(() =>
      p.requests.some((r) => r.actionKey === "cancel_analysis_request"),
    );
    assert.ok(
      !p.dom.window.document.body.textContent?.includes("已发送到助手"),
    );
    assert.equal(
      p.requests.find((r) => r.type === "invokeClientCommand")?.payload?.text,
      "Analyze r1",
    );
  } finally {
    p.dom.window.close();
  }
});
test("failed collection retries the same round and keeps a single existing record", async () => {
  const p = await page();
  try {
    p.state.rounds[0].status = "failed";
    p.emit({ type: "hostEvent" });
    await until(
      () =>
        p.dom.window.document.body.textContent?.includes("同轮重试") === true,
    );
    p.button("同轮重试");
    await until(() =>
      p.requests.some((r) => r.actionKey === "retry_collection"),
    );
    assert.equal(p.state.rounds.length, 1);
    assert.equal(p.state.changes.length, 1);
    assert.equal(p.state.rounds[0].id, "r1");
  } finally {
    p.dom.window.close();
  }
});
test("destructive preview opens accessible confirmation; cancel sends no delete commit", async () => {
  const p = await page();
  try {
    p.button("数据管理 · 删除与清空");
    await until(() =>
      [...p.dom.window.document.querySelectorAll("button")].some(
        (b) => b.textContent === "清空当前组织全部监控数据",
      ),
    );
    p.button("清空当前组织全部监控数据");
    await until(
      () => !!p.dom.window.document.querySelector('[role="alertdialog"]'),
    );
    assert.ok(p.dom.window.document.body.textContent?.includes("快照：2 条"));
    const confirm = [...p.dom.window.document.querySelectorAll("button")].find(
      (b) => b.textContent === "确认永久删除",
    );
    assert.equal(confirm?.disabled, true);
    p.button("取消");
    await until(
      () => !p.dom.window.document.querySelector('[role="alertdialog"]'),
    );
    assert.equal(
      p.requests.filter((r) => r.actionKey === "delete_records").length,
      1,
    );
    assert.deepEqual(p.errors, []);
  } finally {
    p.dom.window.close();
  }
});

test("confirmation sends the server digest and applies the cleared authoritative state", async () => {
  const p = await page();
  try {
    p.button("数据管理 · 删除与清空");
    await until(() =>
      [...p.dom.window.document.querySelectorAll("button")].some(
        (b) => b.textContent === "清空当前组织全部监控数据",
      ),
    );
    p.button("清空当前组织全部监控数据");
    await until(() => !!p.dom.window.document.querySelector("#delete-phrase"));
    const input =
      p.dom.window.document.querySelector<HTMLInputElement>("#delete-phrase")!;
    Object.getOwnPropertyDescriptor(
      p.dom.window.HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "删除");
    input.dispatchEvent(new p.dom.window.Event("input", { bubbles: true }));
    await until(() =>
      [...p.dom.window.document.querySelectorAll("button")].some(
        (b) => b.textContent === "确认永久删除" && !b.disabled,
      ),
    );
    p.button("确认永久删除");
    await until(
      () => !p.dom.window.document.querySelector('[role="alertdialog"]'),
    );
    assert.equal(
      p.requests.filter((r) => r.actionKey === "delete_records").length,
      2,
    );
    assert.equal(p.state.items.length, 0);
    assert.equal(p.state.advice.length, 0);
    assert.ok(p.dom.window.document.body.textContent?.includes("暂无商品"));
    assert.deepEqual(p.errors, []);
  } finally {
    p.dom.window.close();
  }
});
