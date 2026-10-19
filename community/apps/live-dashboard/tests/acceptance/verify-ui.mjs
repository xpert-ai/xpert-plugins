import {
  login,
  root as outputRoot,
  config as context,
  download,
  upload as uploadFile,
} from "./context.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const updateSources = process.argv[4] !== "read-only";
const name = process.argv[3],
  root = outputRoot + "/",
  caseRoot = root + name;
const config = JSON.parse(await readFile(caseRoot + "/profile.json"));
const g = JSON.parse(await readFile(caseRoot + "/ui-generation.json")),
  saved = JSON.parse(
    await readFile(caseRoot + "/saved-dashboard.json"),
  ).dashboard,
  document = JSON.parse(await readFile(caseRoot + "/document.json"));
const originals = Object.fromEntries(
  await Promise.all(
    config.map(async (c) => [
      c.format,
      await download(
        context.cases.find((item) => item.format === c.format).filePath,
      ),
    ]),
  ),
);
// Keep original bytes for crash recovery too. A run never derives expected totals from its own query result.
for (const [format, bytes] of Object.entries(originals)) {
  const path = caseRoot + "/original." + format;
  let previous;
  try {
    previous = await readFile(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (previous)
    assert(
      bytes.equals(previous),
      "Source differs from the saved original; restore or use a fresh isolated run before continuing",
    );
  else await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
}
try {
  const previous = await readFile(caseRoot + "/ui-acceptance.json");
  await writeFile(
    caseRoot + "/ui-acceptance.previous-" + Date.now() + ".json",
    previous,
    { mode: 0o600 },
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const { b, p } = await login();
const chat = p.frameLocator('iframe[name="chatkit"]'),
  view = chat.frameLocator('iframe[title="实时看板"]'),
  doc = view.frameLocator('iframe[title="' + saved.title + '"]');
const observations = [],
  receipt = {
    artifactId: saved.artifactId,
    draftRevision: saved.draftRevision,
    checks: [],
    queries: [],
  };
const persist = () =>
  writeFile(caseRoot + "/ui-acceptance.json", JSON.stringify(receipt, null, 2));
p.on("response", async (r) => {
  if (r.url().includes("/actions/query-binding"))
    try {
      const input = r.request().postDataJSON()?.input;
      if (input?.artifactId === saved.artifactId)
        observations.push({ status: r.status(), input, body: await r.json() });
    } catch {}
});
async function snapshot() {
  return doc.locator("body").evaluate(
    (el, config) =>
      config.map((c) => {
        const number = (t) =>
          Number(
            t
              .replaceAll(",", "")
              .replace(/CNY|¥|￥|元/g, "")
              .trim(),
          );
        const rows = [
          ...document
            .querySelector(c.tableSelector ?? "#" + c.table)
            .querySelectorAll("tr"),
        ]
          .map((r) =>
            [...r.querySelectorAll("td")].map((td) => td.textContent.trim()),
          )
          .filter((r) => r.length);
        const chart = window.echarts.getInstanceByDom(
          document.querySelector(c.chartSelector ?? "#" + c.chart),
        );
        return {
          format: c.format,
          total: number(
            document.querySelector(c.kpiSelector ?? "#" + c.kpi).textContent,
          ),
          rows,
          months: chart?.getOption()?.xAxis?.[0]?.data,
          tableSum: rows.reduce((n, r) => n + number(r.at(-1)), 0),
          series:
            chart
              ?.getOption()
              ?.series?.filter(
                (s) => !(c.aggregateSeriesNames ?? []).includes(s.name),
              )
              .map((s) => ({ name: s.name, type: s.type, data: s.data })) ?? [],
          aggregateSeries:
            chart
              ?.getOption()
              ?.series?.filter((s) =>
                (c.aggregateSeriesNames ?? []).includes(s.name),
              )
              .map((s) => ({ name: s.name, data: s.data })) ?? [],
        };
      }),
    config,
    { timeout: 2000 },
  );
}
function assertSnapshot(s, profile, region, total, stage) {
  const numeric = (value) =>
    Number(
      String(value)
        .replaceAll(",", "")
        .replace(/CNY|¥|￥|元/g, "")
        .trim(),
    );
  const delta =
    total - (region === "华东" ? 3500 : region === "华西" ? 2200 : 5700);
  const monthly = { 华东: [1000 + delta, 1500, 1000], 华西: [800, 900, 500] };
  const groups = region ? [region] : ["华东", "华西"];
  const months = ["2026-07", "2026-08", "2026-09"];
  assert.equal(s.total, total, stage + " KPI");
  assert.equal(s.tableSum, total, stage + " table total");
  const expectedRows = months.flatMap((month, index) =>
    groups.flatMap((group) =>
      profile.tableGrain === "orders" && group === "华东" && index === 0
        ? [
            [month, group, 600 + delta],
            [month, group, 400],
          ]
        : [[month, group, monthly[group][index]]],
    ),
  );
  const normalize = (rows) =>
    rows
      .map((row) => [
        profile.tableMonthLabels?.includes(row[0])
          ? months[profile.tableMonthLabels.indexOf(row[0])]
          : row[0],
        row[1],
        numeric(row.at(-1)),
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  assert.deepEqual(
    normalize(s.rows),
    normalize(expectedRows),
    stage + " monthly table oracle",
  );
  assert.deepEqual(
    s.months,
    profile.monthLabels ?? months,
    stage + " chart month order",
  );
  if (profile.seriesMode === "aggregate") {
    assert.equal(s.series.length, 0, stage + " undeclared regional series");
    assert(s.aggregateSeries.length > 0, stage + " missing aggregate trend");
  } else {
    assert.deepEqual(
      s.series.map((series) => series.name).sort(),
      [...groups].sort(),
      stage + " regional series",
    );
    for (const series of s.series)
      assert.deepEqual(
        series.data.map((v) => Number(v?.value ?? v)),
        monthly[series.name],
        stage + " regional values",
      );
  }
  const aggregates = months.map((_, index) =>
    groups.reduce((sum, group) => sum + monthly[group][index], 0),
  );
  if (profile.aggregateLabelByRegion)
    assert.deepEqual(
      s.aggregateSeries.map((series) => series.name),
      [profile.aggregateLabelByRegion[region ?? "all"]],
      stage + " aggregate region label",
    );
  for (const series of s.aggregateSeries)
    assert.deepEqual(
      series.data.map((v) => Number(v?.value ?? v)),
      aggregates,
      stage + " aggregate values",
    );
}
async function check(stage, region, totals) {
  let snapshots, failure;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      snapshots = await snapshot();
      snapshots.forEach((s, index) =>
        assertSnapshot(s, config[index], region, totals[index], stage),
      );
      failure = undefined;
      break;
    } catch (error) {
      failure = error;
    }
    await p.waitForTimeout(200);
  }
  if (failure) {
    receipt.failedSnapshot = { stage, region, snapshots };
    await persist();
    throw failure;
  }
  assert(snapshots, stage + " has no rendered data");
  receipt.checks.push({ stage, region, snapshots });
  await persist();
  console.log(JSON.stringify({ case: name, stage, totals }));
}
async function act(stage, action, region, totals) {
  const before = observations.length;
  await action();
  await check(stage, region, totals);
  for (
    let i = 0;
    i < 100 && observations.length < before + document.manifest.bindings.length;
    i++
  )
    await p.waitForTimeout(100);
  const calls = observations.slice(before);
  for (const binding of document.manifest.bindings)
    assert(
      calls.some((c) => c.input.bindingId === binding.id),
      stage + " did not query " + binding.id,
    );
  assert(
    calls.every((c) => c.status === 201),
    stage + " query denied",
  );
  receipt.queries.push({
    stage,
    calls: calls.map((c) => ({
      bindingId: c.input.bindingId,
      controls: c.input.controls,
      executionId: c.body.data.provenance.executionId,
      sourceVersion: c.body.data.provenance.sourceVersion,
    })),
  });
  await persist();
}
async function upload(format, bytes) {
  await uploadFile(
    context.cases.find((item) => item.format === format).filePath,
    bytes,
  );
}
const delta = { csv: 100, json: 200, xlsx: 300 };
try {
  await p.goto(g.url);
  await chat
    .getByRole("button", { name: "打开 " + saved.title, exact: true })
    .last()
    .click();
  await check(
    "initial",
    null,
    config.map(() => 5700),
  );
  const all = await doc
    .locator(config[0].filter ?? "#regionFilter")
    .inputValue();
  await act(
    "east",
    () =>
      doc
        .locator(config[0].filter ?? "#regionFilter")
        .selectOption({ label: "华东" }),
    "华东",
    config.map(() => 3500),
  );
  await doc
    .locator("body")
    .evaluate((el) => (el.dataset.acceptance = "preserved"));
  for (const c of updateSources ? config : []) {
    let bytes;
    if (c.format === "csv")
      bytes = Buffer.from(originals.csv.toString().replace("600.00", "700.00"));
    else if (c.format === "json") {
      const data = JSON.parse(originals.json);
      data.sales[0].net_sales = "800.00";
      bytes = Buffer.from(JSON.stringify(data));
    } else {
      const { Workbook } = createRequire(
        new URL(
          "../../../../tools/analytics-files/package.json",
          import.meta.url,
        ),
      )("exceljs");
      const book = new Workbook();
      await book.xlsx.load(originals.xlsx);
      book.getWorksheet("销售").getCell("C2").value = "900.00";
      bytes = Buffer.from(await book.xlsx.writeBuffer());
    }
    await upload(c.format, bytes);
  }
  await act(
    updateSources ? "sourceChangedToolbarRefresh" : "toolbarRefresh",
    () => view.getByRole("button", { name: "刷新", exact: true }).click(),
    "华东",
    config.map((c) => 3500 + (updateSources ? delta[c.format] : 0)),
  );
  assert.equal(
    await doc.locator("body").getAttribute("data-acceptance"),
    "preserved",
  );
  receipt.documentPreserved = true;
  await act(
    "pageRefresh",
    () => doc.locator(config[0].refresh ?? "#btnRefresh").click(),
    "华东",
    config.map((c) => 3500 + (updateSources ? delta[c.format] : 0)),
  );
  await act(
    "west",
    () =>
      doc
        .locator(config[0].filter ?? "#regionFilter")
        .selectOption({ label: "华西" }),
    "华西",
    config.map(() => 2200),
  );
  for (const c of updateSources ? config : [])
    await upload(c.format, originals[c.format]);
  await act(
    "all",
    () => doc.locator(config[0].filter ?? "#regionFilter").selectOption(all),
    null,
    config.map(() => 5700),
  );
  const defaults = Object.fromEntries(
    document.manifest.controls.map((c) => [c.controlId, c.defaultValue]),
  );
  receipt.boundary = await doc.locator("body").evaluate(
    async (el, { id, defaults }) => {
      const denied = async (fn) => {
        try {
          await fn();
          return false;
        } catch {
          return true;
        }
      };
      return {
        unknownBinding: await denied(() =>
          xpertLiveArtifact.query("undeclared", {}),
        ),
        unknownControl: await denied(() =>
          xpertLiveArtifact.query(id, { ...defaults, filePath: "secret.csv" }),
        ),
        parentDOM: await denied(() => parent.document.body),
        directFetch: await denied(() =>
          fetch("https://example.invalid/forbidden"),
        ),
      };
    },
    { id: document.manifest.bindings[0].id, defaults },
  );
  assert(Object.values(receipt.boundary).every(Boolean));
  await chat
    .getByRole("button", { name: "关闭视图: 实时看板", exact: true })
    .click();
  await chat
    .getByRole("tab", { name: "实时看板", exact: true })
    .waitFor({ state: "hidden" });
  await chat
    .getByRole("button", { name: "打开 " + saved.title, exact: true })
    .last()
    .click();
  await check(
    "cardReopen",
    null,
    config.map(() => 5700),
  );
  await p.reload();
  await view
    .getByRole("combobox", { name: "选择看板", exact: true })
    .waitFor({ timeout: 45000 });
  await check(
    "reloadRestored",
    null,
    config.map(() => 5700),
  );
  assert.equal(
    (
      await view
        .getByRole("combobox", { name: "选择看板", exact: true })
        .innerText()
    ).trim(),
    saved.title,
  );
  await p.waitForTimeout(1000);
  await p.screenshot({ path: caseRoot + "/accepted.png", fullPage: true });
  receipt.passed = true;
} catch (e) {
  receipt.error = e.message;
  await p
    .screenshot({ path: caseRoot + "/failed.png", fullPage: true })
    .catch(() => {});
  throw e;
} finally {
  const restoreErrors = [];
  for (const c of updateSources ? config : [])
    try {
      await upload(c.format, originals[c.format]);
      assert(
        (
          await download(
            context.cases.find((item) => item.format === c.format).filePath,
          )
        ).equals(originals[c.format]),
      );
    } catch (error) {
      restoreErrors.push({ format: c.format, error: error.message });
    }
  receipt.sourcesRestored = !restoreErrors.length;
  receipt.restoreErrors = restoreErrors;
  await persist();
  await b.close();
  assert.equal(
    restoreErrors.length,
    0,
    "Source restoration failed: restore original bytes from the case output before another run",
  );
}
