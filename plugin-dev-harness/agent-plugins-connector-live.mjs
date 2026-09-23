#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { startConnectorMcpFixture } from "./fixtures/connector-mcp.mjs";
import {
  packQuickstartPlugin,
  createAgentPluginApi,
} from "../agent-plugins/scripts/quickstart.mjs";

const { values } = parseArgs({
  options: Object.fromEntries(
    ["platform-root", "sdk-root", "context", "output-dir", "api-url"].map(
      (k) => [k, { type: "string" }],
    ),
  ),
});
for (const key of ["platform-root", "sdk-root", "context", "output-dir"])
  if (!values[key]) throw Error(`Missing --${key}`);
const platform = resolve(values["platform-root"]),
  output = resolve(values["output-dir"]);
const apiUrl = (values["api-url"] || "http://localhost:3333/api").replace(
  /\/+$/,
  "",
);
if (!["localhost", "127.0.0.1"].includes(new URL(apiUrl).hostname))
  throw Error("This fixture is only for a local development platform.");
const context = JSON.parse(await readFile(resolve(values.context), "utf8"));
for (const key of ["orgId", "workspaceId", "assistantId"])
  assert.match(context[key], /^[0-9a-f-]{36}$/i);
const { requireAuthentication, createRequestHeaders } = await import(
  pathToFileURL(join(platform, "tools/scripts/local-plugin-cli.mjs"))
);
const { Client } = await import(
  pathToFileURL(
    join(resolve(values["sdk-root"]), "packages/core/dist/index.js"),
  )
);
const authentication = await requireAuthentication({ apiUrl });
const headers = createRequestHeaders(
  { scope: "organization", orgId: context.orgId },
  authentication.token,
  authentication.tenantId,
);
const api = createAgentPluginApi(apiUrl, headers);
const client = new Client({ apiUrl: apiUrl + "/ai", defaultHeaders: headers });
async function request(path, method = "GET", body) {
  const response = await fetch(apiUrl + path, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok)
    throw Error(`Local Xpert request failed: HTTP ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
await mkdir(output, { recursive: true, mode: 0o700 });
const fixture = await startConnectorMcpFixture(
  platform,
  new URL(apiUrl).origin,
);
const root = await mkdtemp(join(tmpdir(), "connector-plugin-fixture-"));
const bindings = [];
let fixtureConnectorId;
const receipt = { summary: {} };
try {
  await mkdir(join(root, "skills/connector-probe"), { recursive: true });
  await writeFile(
    join(root, "plugin.json"),
    JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "connector-probe",
      version: "1.0.0",
      extensions: {
        "cn.xpertai": {
          version: 1,
          connectors: { probe: { type: "mcp_oauth", scopes: ["read"] } },
        },
      },
    }),
  );
  await writeFile(
    join(root, "mcp.json"),
    JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: { probe: { type: "streamable-http", url: fixture.url } },
    }),
  );
  await writeFile(
    join(root, "skills/connector-probe/SKILL.md"),
    "---\nname: connector-probe\ndescription: Verify the local Connector MCP echo tool.\n---\n\nInvoke connector_echo with the user-provided marker and report its result. This is a local read-only verification.\n",
  );
  const form = new FormData();
  form.append(
    "file",
    new Blob([await packQuickstartPlugin({ root })]),
    "connector-probe.zip",
  );
  const pkg = await api("/zip", "POST", form);
  const input = {
    title: "Connector OAuth integration test",
    workspaceIds: [context.workspaceId],
    definition: { kind: "agent_plugin", packageId: pkg.id, experts: {} },
  };
  const binding = await api("/bindings", "POST", input);
  bindings.push(binding);
  const reference = { bindingId: binding.id, version: binding.version };
  const selected = await client.assistants.validateResources(
    context.assistantId,
    { revision: 0, resources: [reference] },
  );
  const authorization = await client.assistants.authorizeResource(
    context.assistantId,
    { ...reference, serverName: "probe" },
  );
  assert.equal(authorization.type, "connector");
  const connectorId = authorization.connector.bindingId;
  const started = await fetch(
    apiUrl + "/connector/bindings/" + connectorId + "/connect",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        authMethodId: "mcp-oauth",
        xpertId: context.assistantId,
      }),
    },
  );
  assert.equal(started.status, 201);
  const cookie = started.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  assert.ok(cookie);
  const pending = await started.json();
  const authorize = await fetch(pending.authorizationUrl, {
    redirect: "manual",
  });
  const callback = authorize.headers.get("location");
  assert.ok(callback);
  // A callback from a different browser cannot consume this authorization.
  await fetch(callback, { redirect: "manual" });
  assert.equal(
    (
      await client.connectors.authorizationStatus(connectorId, {
        xpertId: context.assistantId,
      })
    ).connector.status,
    "pending",
  );
  await fetch(callback, { headers: { cookie }, redirect: "manual" });
  assert.equal(
    (
      await client.connectors.authorizationStatus(connectorId, {
        xpertId: context.assistantId,
      })
    ).granted,
    true,
  );
  receipt.summary.browserBinding = true;
  fixtureConnectorId = connectorId;
  assert.equal(authorization.connector.authorizationMode, "shared");
  assert.equal(authorization.connector.canManage, true);
  receipt.summary.workspaceSharedConnection = true;
  const graphBefore = (await request("/xpert/" + context.assistantId + "/team"))
    .graph;
  const thread = await client.threads.create({
    assistantId: context.assistantId,
  });
  receipt.thread = thread;
  const events = [];
  for await (const event of client.runs.stream(
    thread.thread_id,
    context.assistantId,
    {
      input: {
        action: "send",
        message: {
          input: {
            input:
              "Load the connector-probe skill and invoke connector_echo exactly once with the text CONNECTOR_BRIDGE_ACCEPTANCE. Return its verification result. This is an authorized local read-only protocol test.",
            runtimeResources: selected,
          },
        },
      },
      streamMode: ["events"],
      signal: AbortSignal.timeout(120000),
    },
  ))
    events.push(event);
  await writeFile(join(output, "events.json"), JSON.stringify(events), {
    mode: 0o600,
  });
  assert.ok(
    fixture.stats.calls >= 1,
    "Agent must invoke the authenticated MCP tool",
  );
  assert.ok(
    fixture.stats.refreshes >= 1,
    "Connector must refresh the expired token",
  );
  assert.ok(
    JSON.stringify(events).includes(
      "CONNECTOR_MCP_OK:CONNECTOR_BRIDGE_ACCEPTANCE",
    ),
  );
  assert.deepEqual(
    (await request("/xpert/" + context.assistantId + "/team")).graph,
    graphBefore,
  );
  receipt.summary.toolCall = true;
  receipt.summary.tokenRefresh = true;
  receipt.summary.graphUnchanged = true;
  receipt.summary.mcpUiAdvertised = JSON.stringify(events).includes(
    "ui://connector/probe.html",
  );
  function findApp(value) {
    if (!value || typeof value !== "object") return;
    if (value.appInstanceId && value.appInstanceToken) return value;
    for (const child of Object.values(value)) {
      const app = findApp(child);
      if (app) return app;
    }
  }
  const app = findApp(events);
  assert.ok(app);
  const appQuery = { ...app, token: app.appInstanceToken };
  const resource = await client.mcp.apps.getResource(
    app.appInstanceId,
    appQuery,
  );
  assert.ok(JSON.stringify(resource).includes("Connector MCP UI"));
  assert.ok(fixture.stats.uiReads >= 1);
  receipt.summary.mcpUiRead = true;
  const next = await api("/bindings", "POST", {
    ...input,
    title: input.title + " v2",
    replacesBindingId: binding.id,
  });
  bindings.push(next);
  assert.equal(
    next.installations[context.workspaceId].connectors.probe.bindingId,
    connectorId,
  );
  await client.assistants.validateResources(context.assistantId, selected);
  receipt.summary.workspaceConnectionReusedAcrossVersions = true;
  receipt.summary.oldVersionPreserved = true;
  await request(`/connector/${context.workspaceId}/${connectorId}`, "DELETE");
  fixtureConnectorId = undefined;
  const catalog = await client.assistants.getResources(context.assistantId, {
    kind: "agent_plugin",
    limit: 100,
  });
  assert.equal(
    catalog.items.find((item) => item.bindingId === next.id).status,
    "requires_auth",
  );
  receipt.summary.disconnectInvalidatesCatalog = true;
  const readsBefore = fixture.stats.uiReads;
  await assert.rejects(
    client.mcp.apps.getResource(app.appInstanceId, {
      ...appQuery,
      token: resource.appInstanceToken,
    }),
  );
  assert.equal(fixture.stats.uiReads, readsBefore);
  receipt.summary.disconnectBlocksExistingUi = true;
  console.log(JSON.stringify({ ...receipt.summary, ...fixture.stats }));
} finally {
  if (fixtureConnectorId)
    await request(`/connector/${context.workspaceId}/${fixtureConnectorId}`, "DELETE").catch(() => undefined);
  for (const binding of bindings)
    await api("/bindings/" + binding.id, "PUT", { enabled: false }).catch(
      () => undefined,
    );
  receipt.bindings = bindings;
  receipt.stats = fixture.stats;
  await writeFile(join(output, "receipt.json"), JSON.stringify(receipt), {
    mode: 0o600,
  });
  await rm(root, { recursive: true, force: true });
  await fixture.close();
}
