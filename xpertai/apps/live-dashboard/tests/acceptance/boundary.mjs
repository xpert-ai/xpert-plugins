import { config, api, request, load, save, login } from "./context.mjs";
import assert from "node:assert/strict";
const reports = [],
  path = `/view-hosts/agent/${config.assistantId}/views/live-dashboard__live-dashboard/actions/query-binding`;
for (const item of config.cases) {
  const document = await load(`${item.format}-edit2/document.json`);
  for (const binding of document.manifest.bindings) {
    const input = {
      artifactId: document.artifactId,
      draftRevision: document.draftRevision,
      bindingId: binding.id,
      controls: Object.fromEntries(
        document.manifest.controls.map((control) => [
          control.controlId,
          control.defaultValue,
        ]),
      ),
    };
    assert((await api(path, "POST", { input })).data.rows.length > 0);
    const denied = [];
    for (const extra of [
      { filePath: "../secret.csv" },
      { file: { catalog: "users", userId: "override" } },
      { reader: { format: "json" } },
      { url: "https://example.invalid" },
      { providerId: "postgres.sql" },
      { binding: {} },
      { payload: {} },
      { controls: { ...input.controls, filePath: "secret" } },
      { bindingId: "undeclared" },
    ]) {
      const response = await request(path, "POST", {
          input: { ...input, ...extra },
        }),
        body = await response.json();
      assert(
        [400, 403].includes(response.status),
        "Saved Binding override accepted",
      );
      assert.equal(body.data, undefined);
      denied.push({ keys: Object.keys(extra), status: response.status });
    }
    reports.push({ format: item.format, bindingId: binding.id, denied });
  }
}
// A rejected request to an invalid hostname would also fail without CSP.
// Observe an actual connect-src violation against the healthy local API instead.
const browserChecks = [];
const { b, p } = await login();
try {
  for (const item of config.cases) {
    const name = `${item.format}-edit2`,
      generation = await load(`${name}/ui-generation.json`),
      document = await load(`${name}/document.json`);
    await p.goto(generation.url);
    const chat = p.frameLocator('iframe[name="chatkit"]');
    await chat
      .getByRole("button", { name: "打开 " + document.title, exact: true })
      .last()
      .click();
    const frame = chat
      .frameLocator('iframe[title="实时看板"]')
      .frameLocator('iframe[title="' + document.title + '"]');
    const result = await frame
      .locator("body")
      .evaluate(async (el, healthUrl) => {
        let listener, timer;
        const violation = new Promise((resolve) => {
          listener = (event) => {
            if (event.effectiveDirective === "connect-src") resolve(true);
          };
          document.addEventListener("securitypolicyviolation", listener);
          timer = setTimeout(() => resolve(false), 2000);
        });
        try {
          const denied = await fetch(healthUrl).then(
            () => false,
            () => true,
          );
          return { denied, connectSrcViolation: await violation };
        } finally {
          clearTimeout(timer);
          document.removeEventListener("securitypolicyviolation", listener);
        }
      }, config.apiUrl + "/api/health/ready");
    assert(
      result.denied && result.connectSrcViolation,
      "Direct fetch was not proven blocked by CSP",
    );
    browserChecks.push({ format: item.format, ...result });
  }
} finally {
  await b.close();
}
await save("boundary.json", { passed: true, reports, browserChecks });
console.log(
  JSON.stringify({
    passed: true,
    bindings: reports.length,
    rejected: reports.reduce((n, report) => n + report.denied.length, 0),
  }),
);
