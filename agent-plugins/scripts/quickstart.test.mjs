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

for (const id of ['documents']) test(`${id} packages helpers and references and installs without an MCP server`, async () => {
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

test("document presets require explicit presentation with the paths-only host tool", async () => {
  for (const id of ["documents"]) {
    const root = new URL(`../${id}/`, import.meta.url);
    const manifest = JSON.parse(await readFile(new URL("plugin.json", root), "utf8"));
    const skill = await readFile(new URL(`skills/${id}/SKILL.md`, root), "utf8");
    assert.equal(manifest.version, "1.0.2");
    assert.ok(manifest.extensions["xpertai"].middlewares.some(m => m.provider === "SandboxFile"));
    assert.match(skill, /call `present_files` with only `paths`/);
    assert.doesNotMatch(skill, /## Automatic output cards|host automatically saves/);
  }
});
