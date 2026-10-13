import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createAgentPluginApi,
  installQuickstartPlugin,
  loadQuickstartPlugins,
  packQuickstartPlugin,
} from "./quickstart.mjs";

test("install rejects an inaccessible workspace before making any mutation", async () => {
  const [plugin] = await loadQuickstartPlugins();
  const calls = [];
  await assert.rejects(
    installQuickstartPlugin(plugin, "outside", async (...args) => {
      calls.push(args);
      return { workspaces: [{ id: "allowed" }] };
    }),
    /does not expose/,
  );
  assert.deepEqual(calls, [["/options"]]);
});

test("OAuth packages declare Connector dependencies, and repeating an installation reuses its binding", async () => {
  const plugin = (await loadQuickstartPlugins()).find(
    (item) => item.id === "notion",
  );
  const pkg = {
    id: "package",
    descriptor: {
      name: "notion",
      diagnostics: [],
      servers: [{ key: "notion" }],
    },
  };
  const bindings = [];
  let writes = 0;
  const api = async (path, method, body) => {
    if (path === "/options") return { workspaces: [{ id: "workspace" }] };
    if (path === "/zip") {
      assert.equal(method, "POST");
      assert.ok(body.get("file").size > 0);
      return pkg;
    }
    if (!path) return { packages: [pkg], bindings };
    assert.equal(path, "/bindings");
    writes++;
    const binding = {
      ...body,
      id: "binding",
      version: "pinned",
      enabled: true,
    };
    bindings.push(binding);
    return binding;
  };
  const installed = await installQuickstartPlugin(plugin, "workspace", api);
  assert.deepEqual(installed.binding.definition, {
    kind: "agent_plugin",
    packageId: "package",
    experts: {},
    oauthServers: [],
    connectorServers: { notion: { type: "mcp_oauth" } },
  });
  assert.deepEqual(installed.binding.workspaceIds, ["workspace"]);
  const repeated = await installQuickstartPlugin(plugin, "workspace", api);
  assert.equal(repeated.state, "already_published");
  assert.equal(writes, 1);
});

test("a different authorization configuration is not silently reused or replaced", async () => {
  const plugin = (await loadQuickstartPlugins()).find(
    (item) => item.id === "notion",
  );
  const pkg = {
    id: "package",
    descriptor: {
      name: "notion",
      diagnostics: [],
      servers: [{ key: "notion" }],
    },
  };
  const api = async (path) => {
    if (path === "/options") return { workspaces: [{ id: "workspace" }] };
    if (path === "/zip") return pkg;
    assert.equal(path, undefined);
    return {
      packages: [pkg],
      bindings: [
        {
          enabled: true,
          workspaceIds: ["workspace"],
          definition: {
            kind: "agent_plugin",
            packageId: "package",
            oauthServers: [],
          },
        },
      ],
    };
  };
  await assert.rejects(
    installQuickstartPlugin(plugin, "workspace", api),
    /different version or authorization/,
  );
});

test("an imported package with diagnostics is never automatically published", async () => {
  const [plugin] = await loadQuickstartPlugins();
  const api = async (path) => {
    if (path === "/options") return { workspaces: [{ id: "workspace" }] };
    assert.equal(path, "/zip");
    return {
      descriptor: { diagnostics: [{ code: "invalid_server" }], servers: [] },
    };
  };
  await assert.rejects(
    installQuickstartPlugin(plugin, "workspace", api),
    /component diagnostics/,
  );
});

test("a disabled resource cannot be reintroduced by running the installer again", async () => {
  const [plugin] = await loadQuickstartPlugins();
  const pkg = {
    id: "package",
    descriptor: {
      name: plugin.id,
      diagnostics: [],
      servers: [{ key: plugin.id }],
    },
  };
  const api = async (path) => {
    if (path === "/options") return { workspaces: [{ id: "workspace" }] };
    if (path === "/zip") return pkg;
    assert.equal(path, undefined);
    return {
      packages: [pkg],
      bindings: [
        {
          enabled: false,
          workspaceIds: ["workspace"],
          definition: { kind: "agent_plugin", packageId: pkg.id },
        },
      ],
    };
  };
  await assert.rejects(
    installQuickstartPlugin(plugin, "workspace", api),
    /was disabled/,
  );
});

test("packaging rejects symlinks and unrecognized files instead of leaking local configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-plugin-pack-"));
  try {
    await writeFile(join(root, ".env"), "not a real secret");
    await assert.rejects(packQuickstartPlugin({ root }), /Unexpected/);
    await rm(join(root, ".env"));
    await mkdir(join(root, "skills"));
    await symlink(tmpdir(), join(root, "skills/escape"));
    await assert.rejects(packQuickstartPlugin({ root }), /Unexpected/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("API preserves scope headers and lets fetch set the multipart boundary", async () => {
  const headers = {
    "content-type": "application/json",
    authorization: "test-auth",
    "organization-id": "org",
    "tenant-id": "tenant",
    "x-scope-level": "organization",
  };
  for (const url of ["https://xpert.example", "https://xpert.example/api/"]) {
    const api = createAgentPluginApi(
      url,
      headers,
      async (endpoint, options) => {
        assert.equal(endpoint, "https://xpert.example/api/agent-plugins/zip");
        assert.equal(options.headers["content-type"], undefined);
        assert.equal(options.headers["organization-id"], "org");
        assert.equal(options.headers["tenant-id"], "tenant");
        assert.equal(options.headers.authorization, "test-auth");
        return new Response("{}", { status: 200 });
      },
    );
    await api("/zip", "POST", new FormData());
  }
  assert.equal(headers["content-type"], "application/json");
});

for (const id of ['documents', 'pdf', 'presentations', 'spreadsheets']) test(`${id} packages helpers and references and installs without an MCP server`, async () => {
  const plugin = (await loadQuickstartPlugins()).find((item) => item.id === id);
  const pkg = { id: `${id}-package`, descriptor: { name: id, diagnostics: [], skills: [{ key: id }], servers: [] } };
  const calls = [];
  const result = await installQuickstartPlugin(plugin, 'workspace', async (path, method, body) => {
    calls.push(path);
    if (path === '/options') return { workspaces: [{ id: 'workspace' }] };
    if (path === '/zip') {
      assert.ok(body.get('file').size > 5000);
      return pkg;
    }
    if (!path) return { packages: [pkg], bindings: [] };
    assert.equal(path, '/bindings');
    return { ...body, id: 'binding', version: '1' };
  });
  assert.equal(result.binding.definition.packageId, pkg.id);
  assert.deepEqual(calls, ['/options', '/zip', undefined, '/bindings']);
});

test("resource packaging rejects nested credentials and bytecode caches", async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-plugin-resources-'));
  try {
    await mkdir(join(root, 'skills/test/scripts'), { recursive: true });
    await writeFile(join(root, 'skills/test/scripts/helper.py'), 'print("ready")');
    await writeFile(join(root, 'skills/test/scripts/helper.mjs'), 'export const ready = true;');
    await writeFile(join(root, 'skills/test/SKILL.md'), '---\nname: test\ndescription: test\n---\n');
    assert.ok((await packQuickstartPlugin({ root })).length > 0);
    await writeFile(join(root, 'skills/test/.env'), 'fixture');
    await assert.rejects(packQuickstartPlugin({ root }), /Unexpected/);
    await rm(join(root, 'skills/test/.env'));
    await mkdir(join(root, 'skills/test/__pycache__'));
    await assert.rejects(packQuickstartPlugin({ root }), /Unexpected/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("API errors do not echo provider payloads or credentials", async () => {
  const api = createAgentPluginApi(
    "https://xpert.example",
    {},
    async () => new Response("sensitive response", { status: 403 }),
  );
  await assert.rejects(
    api(),
    (error) =>
      error.message.includes("HTTP 403") &&
      !error.message.includes("sensitive"),
  );
});

test("explicit replacement creates a new binding without mutating the pinned old version", async () => {
  const plugin = (await loadQuickstartPlugins()).find(
    (item) => item.id === "notion",
  );
  const previous = {
    id: "old-binding",
    enabled: true,
    workspaceIds: ["workspace"],
    definition: {
      kind: "agent_plugin",
      packageId: "old-package",
      oauthServers: ["notion"],
    },
  };
  const before = structuredClone(previous);
  const pkg = {
    id: "new-package",
    descriptor: {
      name: "notion",
      diagnostics: [],
      servers: [{ key: "notion" }],
    },
  };
  const api = async (path, method, body) => {
    if (path === "/options") return { workspaces: [{ id: "workspace" }] };
    if (path === "/zip") return pkg;
    if (!path)
      return {
        packages: [pkg, { ...pkg, id: "old-package" }],
        bindings: [previous],
      };
    assert.equal(path, "/bindings");
    assert.equal(method, "POST");
    assert.equal(body.replacesBindingId, "old-binding");
    assert.deepEqual(body.definition.connectorServers, {
      notion: { type: "mcp_oauth" },
    });
    return { ...body, id: "new-binding" };
  };
  const result = await installQuickstartPlugin(plugin, "workspace", api, {
    replace: true,
  });
  assert.equal(result.binding.id, "new-binding");
  assert.deepEqual(previous, before);
});

test("notion 1.2.0 keeps Connector OAuth and ports four skills without OpenAI aliases", async () => {
  const plugin = (await loadQuickstartPlugins()).find((item) => item.id === "notion");
  assert.ok(plugin);
  assert.equal(plugin.version, "1.2.0");
  assert.deepEqual(plugin.connectorServers, { notion: { type: "mcp_oauth" } });
  const root = new URL("../notion/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
  const mcp = JSON.parse(await readFile(new URL("mcp.json", root), "utf8"));
  assert.equal(mcp.mcpServers.notion.type, "streamable-http");
  assert.equal(mcp.mcpServers.notion.url, "https://mcp.notion.com/mcp");
  assert.doesNotMatch(JSON.stringify({ mcp, manifest }), /client_secret|oauth_resource|11843774967/);
  const readme = await readFile(new URL("README.md", root), "utf8");
  assert.match(readme, /可用性测试说明/);
  assert.match(readme, /Minimum OAuth scope: `default`/);
  assert.match(readme, /explicit user\s+request and host approval/);
  assert.match(readme, /metadata\.short-description/);
  for (const name of [
    "notion-knowledge-capture",
    "notion-meeting-intelligence",
    "notion-research-documentation",
    "notion-spec-to-implementation",
    "notion-workspace",
  ]) {
    const skill = await readFile(new URL(`skills/${name}/SKILL.md`, root), "utf8");
    assert.match(skill, new RegExp(`name: ${name}`));
    assert.doesNotMatch(skill, /Notion:|bundled Notion app|client_secret|11843774967/);
  }
  assert.ok((await packQuickstartPlugin(plugin)).length > 0);
});

test("slack package uses streamable HTTP and Connector OAuth without embedded secrets", async () => {
  const plugin = (await loadQuickstartPlugins()).find((item) => item.id === "slack");
  assert.ok(plugin);
  assert.equal(plugin.version, "1.0.0");
  assert.deepEqual(plugin.connectorServers, { slack: { type: "mcp_oauth" } });
  assert.deepEqual(plugin.oauthServers, []);
  const root = new URL("../slack/", import.meta.url);
  const mcp = JSON.parse(await readFile(new URL("mcp.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
  assert.equal(manifest.author.name, "Xpert AI");
  assert.doesNotMatch(JSON.stringify({ mcp, manifest }), /client_secret|client_id|11843774967|oauth_resource/);
  assert.equal(mcp.mcpServers.slack.type, "streamable-http");
  assert.equal(mcp.mcpServers.slack.url, "https://mcp.slack.com/mcp");
  const readme = await readFile(new URL("README.md", root), "utf8");
  assert.match(readme, /可用性测试说明/);
  assert.match(readme, /Minimum OAuth scope: TBD/);
  assert.match(readme, /explicit user request and host approval/);
  const skill = await readFile(new URL("skills/slack-workspace/SKILL.md", root), "utf8");
  assert.match(skill, /name: slack-workspace/);
  assert.match(skill, /explicit user request and host approval/);
  assert.ok((await packQuickstartPlugin(plugin)).length > 0);
});

test("google-drive package uses streamable HTTP and Connector OAuth without embedded secrets", async () => {
  const plugin = (await loadQuickstartPlugins()).find((item) => item.id === "google-drive");
  assert.ok(plugin);
  assert.equal(plugin.version, "1.0.0");
  assert.deepEqual(plugin.connectorServers, {
    "google-drive": { type: "mcp_oauth" },
    "google-docs": { type: "mcp_oauth" },
    "google-sheets": { type: "mcp_oauth" },
    "google-slides": { type: "mcp_oauth" },
  });
  assert.deepEqual(plugin.oauthServers, []);
  const root = new URL("../google-drive/", import.meta.url);
  const mcp = JSON.parse(await readFile(new URL("mcp.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
  assert.equal(manifest.author.name, "Xpert AI");
  assert.doesNotMatch(JSON.stringify({ mcp, manifest }), /client_secret|client_id|11843774967|oauth_resource/);
  const urls = {
    "google-drive": "https://drivemcp.googleapis.com/mcp/v1",
    "google-docs": "https://docsmcp.googleapis.com/mcp/v1",
    "google-sheets": "https://sheetsmcp.googleapis.com/mcp/v1",
    "google-slides": "https://slidesmcp.googleapis.com/mcp/v1",
  };
  for (const [key, url] of Object.entries(urls)) {
    assert.equal(mcp.mcpServers[key].type, "streamable-http");
    assert.equal(mcp.mcpServers[key].url, url);
    assert.match(await readFile(new URL(`skills/${key}/SKILL.md`, root), "utf8"), new RegExp(`name: ${key}`));
  }
  const readme = await readFile(new URL("README.md", root), "utf8");
  assert.match(readme, /可用性测试说明/);
  assert.match(readme, /Minimum OAuth scope: TBD/);
  assert.match(readme, /explicit user request and host approval/);
  assert.ok((await packQuickstartPlugin(plugin)).length > 0);
});

test("github package uses streamable HTTP and Connector OAuth without embedded secrets", async () => {
  const plugin = (await loadQuickstartPlugins()).find((item) => item.id === "github");
  assert.ok(plugin);
  assert.equal(plugin.version, "1.0.0");
  assert.deepEqual(plugin.connectorServers, { github: { type: "mcp_oauth" } });
  assert.deepEqual(plugin.oauthServers, []);
  const root = new URL("../github/", import.meta.url);
  const mcp = JSON.parse(await readFile(new URL("mcp.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
  assert.equal(manifest.author.name, "Xpert AI");
  assert.doesNotMatch(JSON.stringify({ mcp, manifest }), /client_secret|client_id|11843774967|oauth_resource/);
  assert.equal(mcp.mcpServers.github.type, "streamable-http");
  assert.equal(mcp.mcpServers.github.url, "https://api.githubcopilot.com/mcp/");
  const readme = await readFile(new URL("README.md", root), "utf8");
  assert.match(readme, /可用性测试说明/);
  assert.match(readme, /OAuth `resource` has no trailing slash/);
  assert.match(readme, /The MCP URL has a trailing slash/);
  assert.match(readme, /Minimum OAuth scope: TBD/);
  assert.match(readme, /explicit user request and host approval/);
  const skill = await readFile(new URL("skills/github-workspace/SKILL.md", root), "utf8");
  assert.match(skill, /name: github-workspace/);
  assert.match(skill, /explicit user request and host approval/);
  assert.ok((await packQuickstartPlugin(plugin)).length > 0);
});

test("figma package uses streamable HTTP and Connector OAuth without embedded secrets", async () => {
  const plugin = (await loadQuickstartPlugins()).find((item) => item.id === "figma");
  assert.ok(plugin);
  assert.equal(plugin.version, "1.0.0");
  assert.deepEqual(plugin.connectorServers, { figma: { type: "mcp_oauth" } });
  assert.deepEqual(plugin.oauthServers, []);
  const root = new URL("../figma/", import.meta.url);
  const mcp = JSON.parse(await readFile(new URL("mcp.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
  assert.equal(manifest.author.name, "Xpert AI");
  assert.equal(manifest.extensions.xpertai.interface.icon, "https://static.figma.com/app/icon/1/favicon.png");
  assert.match(manifest.extensions.xpertai.interface.description, /^Internal only\./);
  assert.match(manifest.extensions.xpertai.interface.description, /Not a public Integration or Marketplace release/);
  assert.equal(manifest.description, manifest.extensions.xpertai.interface.description);
  assert.doesNotMatch(JSON.stringify({ mcp, manifest }), /client_secret|client_id|11843774967|oauth_resource/);
  assert.equal(mcp.mcpServers.figma.type, "streamable-http");
  assert.equal(mcp.mcpServers.figma.url, "https://mcp.figma.com/mcp");
  const readme = await readFile(new URL("README.md", root), "utf8");
  assert.match(readme, /可用性测试说明/);
  assert.match(readme, /Minimum OAuth scope: `mcp:connect`/);
  assert.match(readme, /explicit user request and host approval/);
  assert.match(readme, /FG-00 and FG-01 pass only when that Internal label is visible/);
  assert.match(readme, /Published status with no Internal label is a fail/);
  assert.match(await readFile(new URL("skills/figma-workspace/SKILL.md", root), "utf8"), /name: figma-workspace/);
  assert.ok((await packQuickstartPlugin(plugin)).length > 0);
});

test("monday package uses streamable HTTP and Connector OAuth without embedded secrets", async () => {
  const plugin = (await loadQuickstartPlugins()).find((item) => item.id === "monday");
  assert.ok(plugin);
  assert.equal(plugin.version, "1.0.0");
  assert.deepEqual(plugin.connectorServers, { monday: { type: "mcp_oauth" } });
  assert.deepEqual(plugin.oauthServers, []);
  const root = new URL("../monday/", import.meta.url);
  const mcp = JSON.parse(await readFile(new URL("mcp.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
  assert.equal(manifest.author.name, "Xpert AI");
  assert.equal(manifest.name, "monday");
  assert.doesNotMatch(JSON.stringify({ mcp, manifest }), /client_secret|client_id|oauth_resource/);
  assert.equal(mcp.mcpServers.monday.type, "streamable-http");
  assert.equal(mcp.mcpServers.monday.url, "https://mcp.monday.com/mcp");
  const readme = await readFile(new URL("README.md", root), "utf8");
  assert.match(readme, /Usability test/);
  assert.match(readme, /Minimum OAuth scope: TBD/);
  assert.match(readme, /explicit user request and host approval/);
  const skill = await readFile(new URL("skills/monday-workspace/SKILL.md", root), "utf8");
  assert.match(skill, /name: monday-workspace/);
  assert.match(skill, /explicit user request and host approval/);
  assert.match(skill, /machine-readable annotation/);
  assert.match(skill, /shared Connector/);
  assert.match(readme, /shared Connector/);
  assert.doesNotMatch(readme, /Each user connects their own account/);
  assert.doesNotMatch(mcp.mcpServers.monday.url, /\/sse$/);
  assert.match(readme, /deprecated SSE URL/);
  assert.ok((await packQuickstartPlugin(plugin)).length > 0);
});

test("stripe package uses streamable HTTP and Connector OAuth without embedded secrets", async () => {
  const plugin = (await loadQuickstartPlugins()).find((item) => item.id === "stripe");
  assert.ok(plugin);
  assert.equal(plugin.version, "1.0.0");
  assert.deepEqual(plugin.connectorServers, { stripe: { type: "mcp_oauth" } });
  assert.deepEqual(plugin.oauthServers, []);
  const root = new URL("../stripe/", import.meta.url);
  const mcp = JSON.parse(await readFile(new URL("mcp.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
  assert.equal(manifest.author.name, "Xpert AI");
  assert.equal(manifest.name, "stripe");
  assert.doesNotMatch(JSON.stringify({ mcp, manifest }), /client_secret|client_id|oauth_resource/);
  assert.equal(mcp.mcpServers.stripe.type, "streamable-http");
  assert.equal(mcp.mcpServers.stripe.url, "https://mcp.stripe.com");
  const readme = await readFile(new URL("README.md", root), "utf8");
  assert.match(readme, /Usability test/);
  assert.match(readme, /Minimum OAuth scope: `mcp`/);
  assert.match(readme, /explicit user request and host approval/);
  assert.match(readme, /shared Connector/);
  assert.doesNotMatch(readme, /Each user connects their own account/);
  const skill = await readFile(new URL("skills/stripe-workspace/SKILL.md", root), "utf8");
  assert.match(skill, /name: stripe-workspace/);
  assert.match(skill, /explicit user request and host approval/);
  assert.equal(mcp.mcpServers.stripe.url.endsWith("/"), false);
  assert.ok((await packQuickstartPlugin(plugin)).length > 0);
});

test("clickup package uses streamable HTTP and Connector OAuth without embedded secrets", async () => {
  const plugin = (await loadQuickstartPlugins()).find((item) => item.id === "clickup");
  assert.ok(plugin);
  assert.equal(plugin.version, "1.0.0");
  assert.deepEqual(plugin.connectorServers, { clickup: { type: "mcp_oauth" } });
  assert.deepEqual(plugin.oauthServers, []);
  const root = new URL("../clickup/", import.meta.url);
  const mcp = JSON.parse(await readFile(new URL("mcp.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
  assert.equal(manifest.author.name, "Xpert AI");
  assert.equal(manifest.name, "clickup");
  assert.doesNotMatch(JSON.stringify({ mcp, manifest }), /client_secret|client_id|oauth_resource/);
  assert.equal(mcp.mcpServers.clickup.type, "streamable-http");
  assert.equal(mcp.mcpServers.clickup.url, "https://mcp.clickup.com/mcp");
  const readme = await readFile(new URL("README.md", root), "utf8");
  assert.match(readme, /Usability test/);
  assert.match(readme, /Minimum OAuth scope: `read` and `write`/);
  assert.match(readme, /explicit user request and host approval/);
  assert.match(readme, /shared Connector/);
  const skill = await readFile(new URL("skills/clickup-workspace/SKILL.md", root), "utf8");
  assert.match(skill, /name: clickup-workspace/);
  assert.match(skill, /explicit user request and host approval/);
  assert.match(skill, /shared Connector/);
  assert.doesNotMatch(readme, /Each user connects their own account/);
  assert.ok((await packQuickstartPlugin(plugin)).length > 0);
});

test("canva package uses streamable HTTP and Connector OAuth without embedded secrets", async () => {
  const plugin = (await loadQuickstartPlugins()).find((item) => item.id === "canva");
  assert.ok(plugin);
  assert.equal(plugin.version, "1.0.0");
  assert.deepEqual(plugin.connectorServers, { "canva-global": { type: "mcp_oauth" } });
  assert.deepEqual(plugin.oauthServers, []);
  const root = new URL("../canva/", import.meta.url);
  const mcp = JSON.parse(await readFile(new URL("mcp.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
  assert.equal(manifest.author.name, "Xpert AI");
  assert.equal(manifest.name, "canva");
  assert.equal(manifest.extensions.xpertai.interface.displayName, "Canva");
  assert.equal(manifest.extensions.xpertai.connectors["canva-global"].type, "mcp_oauth");
  assert.equal(manifest.extensions.xpertai.connectors.canva, undefined);
  assert.doesNotMatch(JSON.stringify({ mcp, manifest }), /client_secret|client_id|oauth_resource/);
  assert.equal(mcp.mcpServers["canva-global"].type, "streamable-http");
  assert.equal(mcp.mcpServers["canva-global"].url, "https://mcp.canva.com/mcp");
  assert.equal(mcp.mcpServers.canva, undefined);
  const readme = await readFile(new URL("README.md", root), "utf8");
  assert.match(readme, /Usability test/);
  assert.match(readme, /Minimum OAuth scope: `profile:read`/);
  assert.match(readme, /connector key `canva-global`/);
  assert.match(readme, /explicit user request and host approval/);
  assert.match(readme, /shared Connector/);
  assert.doesNotMatch(readme, /Each user connects their own account/);
  const skill = await readFile(new URL("skills/canva-workspace/SKILL.md", root), "utf8");
  assert.match(skill, /name: canva-workspace/);
  assert.match(skill, /canva-global/);
  assert.match(skill, /shared Connector/);
  assert.match(skill, /explicit user request and host approval/);
  assert.doesNotMatch(mcp.mcpServers["canva-global"].url, /canva\.cn/);
  const chinaManifest = JSON.parse(await readFile(new URL("../canva-cn/plugin.json", import.meta.url), "utf8"));
  const chinaMcp = JSON.parse(await readFile(new URL("../canva-cn/mcp.json", import.meta.url), "utf8"));
  assert.equal(chinaManifest.name, "canva-cn");
  assert.equal(chinaMcp.mcpServers["canva-cn"].url, "https://mcp.canva.cn/mcp");
  assert.equal(chinaManifest.extensions.xpertai.connectors["canva-cn"].type, "existing");
  assert.equal(chinaManifest.extensions.xpertai.connectors["canva-cn"].provider, "canva");
  assert.ok((await packQuickstartPlugin(plugin)).length > 0);
});

test("asana package uses streamable HTTP and Connector OAuth without embedded secrets", async () => {
  const plugin = (await loadQuickstartPlugins()).find((item) => item.id === "asana");
  assert.ok(plugin);
  assert.equal(plugin.version, "1.0.0");
  assert.deepEqual(plugin.connectorServers, { asana: { type: "mcp_oauth" } });
  assert.deepEqual(plugin.oauthServers, []);
  const root = new URL("../asana/", import.meta.url);
  const mcp = JSON.parse(await readFile(new URL("mcp.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
  assert.equal(manifest.author.name, "Xpert AI");
  assert.equal(manifest.name, "asana");
  assert.doesNotMatch(JSON.stringify({ mcp, manifest }), /client_secret|client_id|oauth_resource/);
  assert.equal(mcp.mcpServers.asana.type, "streamable-http");
  assert.equal(mcp.mcpServers.asana.url, "https://mcp.asana.com/v2/mcp");
  const readme = await readFile(new URL("README.md", root), "utf8");
  assert.match(readme, /Usability test/);
  assert.match(readme, /Minimum OAuth scope: `default`/);
  assert.match(readme, /explicit user request and host approval/);
  assert.match(readme, /shared Connector/);
  assert.doesNotMatch(readme, /Each user connects their own account/);
  const skill = await readFile(new URL("skills/asana-workspace/SKILL.md", root), "utf8");
  assert.match(skill, /name: asana-workspace/);
  assert.match(skill, /shared Connector/);
  assert.match(skill, /explicit user request and host approval/);
  assert.doesNotMatch(mcp.mcpServers.asana.url, /\/sse$/);
  assert.match(readme, /https:\/\/mcp\.asana\.com\/sse/);
  assert.ok((await packQuickstartPlugin(plugin)).length > 0);
});

test("atlassian package uses streamable HTTP and Connector OAuth without embedded secrets", async () => {
  const plugin = (await loadQuickstartPlugins()).find((item) => item.id === "atlassian");
  assert.ok(plugin);
  assert.equal(plugin.version, "1.0.0");
  assert.deepEqual(plugin.connectorServers, { atlassian: { type: "mcp_oauth" } });
  assert.deepEqual(plugin.oauthServers, []);
  const root = new URL("../atlassian/", import.meta.url);
  const mcp = JSON.parse(await readFile(new URL("mcp.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
  assert.equal(manifest.author.name, "Xpert AI");
  assert.equal(manifest.name, "atlassian");
  assert.doesNotMatch(JSON.stringify({ mcp, manifest }), /client_secret|client_id|oauth_resource/);
  assert.equal(mcp.mcpServers.atlassian.type, "streamable-http");
  assert.equal(mcp.mcpServers.atlassian.url, "https://mcp.atlassian.com/v2/mcp");
  const readme = await readFile(new URL("README.md", root), "utf8");
  assert.match(readme, /Usability test/);
  assert.match(readme, /Minimum OAuth scope: `read:me`, `read:account`, `offline_access`, `email`, `read:jira:agent-interface`/);
  assert.match(readme, /explicit user request and host approval/);
  assert.match(readme, /shared Connector/);
  assert.doesNotMatch(readme, /Each user connects their own account/);
  const skill = await readFile(new URL("skills/atlassian-workspace/SKILL.md", root), "utf8");
  assert.match(skill, /name: atlassian-workspace/);
  assert.match(skill, /https:\/\/mcp\.atlassian\.com\/v2\/mcp/);
  assert.match(skill, /shared Connector/);
  assert.match(skill, /explicit user request and host approval/);
  assert.doesNotMatch(mcp.mcpServers.atlassian.url, /authv2|\/v1\/mcp/);
  assert.ok((await packQuickstartPlugin(plugin)).length > 0);
});

test("document presets require explicit presentation with the paths-only host tool", async () => {
  for (const id of ["documents", "pdf", "presentations", "spreadsheets"]) {
    const root = new URL(`../${id}/`, import.meta.url);
    const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
    const skill = await readFile(new URL(`skills/${id}/SKILL.md`, root), "utf8");
    assert.equal(manifest.version, "1.0.2");
    assert.ok(manifest.extensions["xpertai"].middlewares.some(m => m.provider === "SandboxFile"));
    assert.match(skill, /call `present_files` with only `paths`/);
    assert.doesNotMatch(skill, /## Automatic output cards|host automatically saves/);
  }
});
