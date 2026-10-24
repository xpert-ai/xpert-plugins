"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const { DATA_ANALYTICS_WIDGET_ASSETS, readWidgetHtmlAsset, hostedArtifactHtml } =
  require("@xpert-ai/community-data-analytics/renderer");
const { handleRpc, SERVER_VERSION } = require("../mcp/server.cjs");

// Digests of the existing MCP renderer bytes, before extracting the reusable entry.
// Updating a renderer asset intentionally requires reviewing its corresponding digest.
const assets = [
  ["datascience-artifact-widget.html", "ui://widget/datascience-artifact.html", "30abe65cd0d32a7596e02c5e94f2e20879fa73644507fefa35c7119a018ff7d2"],
  ["datascience-table-widget.html", "ui://widget/datascience-table.html", "972c2ddd6dc75b3be8bf6e0e7d44ca94ab928f32eb08d6359f75eb28afdf6ebd"],
  ["datascience-chart-widget.html", "ui://widget/datascience-chart.html", "a96199a0572aca967b272ef6a8bd9954a8494266401854ba0f0f206f5381a653"],
];
for (const [file, uri, digest] of assets) {
  test(`${file}: preserves published bytes and the MCP resources/read response`, async () => {
    const html = readWidgetHtmlAsset(file);
    assert.equal(createHash("sha256").update(html).digest("hex"), digest);
    const response = await handleRpc({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri } });
    assert.equal(response.result.contents[0].text, html);
    assert.equal(response.result.contents[0].mimeType, "text/html;profile=mcp-app");
  });
}

test("exposes only packaged widgets and rejects unknown asset names", () => {
  assert.deepEqual(DATA_ANALYTICS_WIDGET_ASSETS, assets.map(([name]) => name));
  assert.equal(Object.isFrozen(DATA_ANALYTICS_WIDGET_ASSETS), true);
  for (const name of ["../package.json", "missing.html", "", null]) {
    assert.throws(() => readWidgetHtmlAsset(name), /Unsupported Data Analytics widget asset/);
  }
});

test("the public renderer entry imports without MCP or Nest runtime initialization", () => {
  const script = `
    const assert = require('node:assert/strict');
    const renderer = require('@xpert-ai/community-data-analytics/renderer');
    assert.equal(typeof renderer.readWidgetHtmlAsset, 'function');
    assert.equal(Object.keys(require.cache).some(file => /[\\/]mcp[\\/]server.cjs$/.test(file) || file.includes('@nestjs')), false);
  `;
  assert.equal(execFileSync(process.execPath, ["-e", script], { cwd: path.resolve(__dirname, ".."), encoding: "utf8", timeout: 5000 }), "");
});

test("embeds exact data without allowing payload strings to terminate the bootstrap script", () => {
  const payload = { title: "</script><script>throw Error('injected')</script>", rows: [{ value: "中文\u2028line\u2029end" }] };
  const html = hostedArtifactHtml('<!doctype html><html><head lang="en"><script>/* renderer */</script></head><body></body></html>', payload);
  const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.ok(bootstrap.includes("\\u003c/script\\u003e"));
  assert.equal(bootstrap.includes("/* renderer */"), false);
  const scope = { window: {} };
  vm.runInNewContext(bootstrap, scope);
  assert.deepEqual(JSON.parse(JSON.stringify(scope.window.xpertai.toolOutput)), payload);
  assert.equal(scope.window.xpertai.displayMode, "fullscreen");
  assert.deepEqual(JSON.parse(JSON.stringify(scope.window.__DATASCIENCE_ARTIFACT_HOSTING__.controls)), {
    edit: false, exportHostedLink: false, hostedLink: false,
  });
});

test("keeps the headless template fallback and rejects non-serializable payloads", () => {
  const html = hostedArtifactHtml("<main>Report</main>", { rows: [] });
  assert.ok(html.startsWith("<script>"));
  assert.ok(html.endsWith("<main>Report</main>"));
  const circular = {}; circular.self = circular;
  assert.throws(() => hostedArtifactHtml("<main></main>", circular), TypeError);
});

test("aligns the MCP and marketplace manifest versions with the package", () => {
  const metadata = JSON.parse(readFileSync(path.join(__dirname, "../package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(path.join(__dirname, "../.xpertai-plugin/plugin.json"), "utf8"));
  assert.equal(manifest.version, metadata.version);
  assert.equal(SERVER_VERSION, metadata.version);
});
