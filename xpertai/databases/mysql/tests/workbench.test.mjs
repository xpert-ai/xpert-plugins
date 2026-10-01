import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { createMysqlWorkbench } from "../dist/lib/mysql-workbench.js";
const mockOptions = { host: "mock.invalid", port: 3306, username: "mock", password: "mock", catalog: "analytics" };
function wire(mode = "STRICT_TRANS_TABLES", okFields = false) {
  const calls = [], state = { closed: 0 };
  const driver = { destroy: () => {
    state.closed++;
  }, query: (config) => {
    calls.push(config);
    const events = new EventEmitter();
    queueMicrotask(() => {
      const rows = config.sql.includes("@@session.sql_mode") ? [[mode]] : config.sql.includes("@@version_comment") ? [["doris-3.0.8"]] : config.sql.includes("version()") ? [["8.0.36"]] : config.sql.includes("_db_studio_page") ? [["9007199254740993", "0.12345678901234567890"]] : [];
      try {
        if (rows.length) {
          events.emit("fields", rows[0].map(() => ({ name: "duplicate", type: 246 })));
          for (const row of rows) {
            row.forEach((value) => config.typeCast({ type: "NEWDECIMAL", string: () => value, buffer: () => null }));
            events.emit("result", {});
          }
        } else {
          if (okFields) events.emit("fields", void 0);
          events.emit("result", { affectedRows: 1 });
        }
        events.emit("end");
      } catch {
        events.emit("error", { code: "TEST_FIELDS_EVENT_FAILED" });
      }
    });
    return events;
  } };
  return { driver, calls, state };
}
test("mysql2 OK packets without fields support read transactions, writes and commit", async () => {
  const mock = wire("STRICT_TRANS_TABLES", true), adapter = createMysqlWorkbench(mockOptions, "mysql", mock.driver);
  try {
    const read = await adapter.query({ database: "analytics", mode: "read", sql: "SELECT 1" });
    assert.equal(read.outcome, "succeeded");
    assert.ok(mock.calls.some((call) => call.sql === "START TRANSACTION READ ONLY"));
    assert.ok(mock.calls.some((call) => call.sql === "ROLLBACK"));
    await adapter.transaction("begin");
    const write = await adapter.query({ database: "analytics", mode: "write", sql: "UPDATE orders SET amount=1" });
    assert.equal(write.affectedRows, 1);
    assert.deepEqual(write.columns, []);
    await adapter.transaction("commit");
  } finally {
    await adapter.close();
  }
});
for (const engine of ["mysql", "doris"]) test(`${engine} wire preserves duplicate aliases and precision before object mapping`, async () => {
  const mock = wire(), adapter = createMysqlWorkbench(mockOptions, engine, mock.driver);
  const result = await adapter.query({ database: "analytics", mode: "read", sql: "SELECT ? AS duplicate, ? AS duplicate", parameters: ["x'\\attack", "0.12345678901234567890"] });
  assert.deepEqual(result.rows, [["9007199254740993", "0.12345678901234567890"]]);
  assert.deepEqual(result.columns.map((c) => c.id), ["c0", "c1"]);
  const call = mock.calls.find((c) => c.sql.includes("_db_studio_page"));
  assert.deepEqual(call?.values, ["x'\\attack", "0.12345678901234567890"]);
  await adapter.close();
  assert.equal(mock.state.closed, 1);
});
test("text-protocol parameters fail closed in NO_BACKSLASH_ESCAPES mode", async () => {
  const mock = wire("NO_BACKSLASH_ESCAPES"), adapter = createMysqlWorkbench(mockOptions, "mysql", mock.driver);
  await assert.rejects(() => adapter.query({ mode: "read", sql: "SELECT ?", parameters: ["quoted'value"] }), /sql_mode_unsupported/);
  assert.equal(mock.calls.filter((c) => c.sql.includes("_db_studio_page")).length, 0);
  await adapter.close();
});
test("driver timeout destroys only its own physical connection", async () => {
  const emitter = new EventEmitter(), state = { closed: 0 };
  const driver = { query: () => emitter, destroy: () => {
    state.closed++;
  } };
  const adapter = createMysqlWorkbench(mockOptions, "doris", driver);
  await assert.rejects(() => adapter.query({ mode: "read", sql: "SELECT 1", timeoutMs: 5 }), /timeout/);
  assert.equal(state.closed, 1);
});
