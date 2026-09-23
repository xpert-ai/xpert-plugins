#!/usr/bin/env node
// Portable resource lifecycle: package -> extract -> parse -> resolve MCP config -> dispose.
// No Nest module or lifecycle hook is loaded from a standard Agent Plugin.
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { loadQuickstartPlugins } from "../agent-plugins/scripts/quickstart.mjs";

const { values } = parseArgs({
  options: { "platform-root": { type: "string" } },
});
const platformRoot = values["platform-root"] || process.env.XPERT_PLATFORM_ROOT;
if (!platformRoot)
  throw new Error(
    "Provide --platform-root <xpert-checkout> with dependencies installed.",
  );
const platform = resolve(platformRoot);
const presets = fileURLToPath(new URL("../agent-plugins/", import.meta.url));
const require = createRequire(join(presets, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const hostSource = join(platform, "packages/server-ai/src/agent-plugin");
const { parseAgentPlugin } = await jiti.import(
  join(hostSource, "agent-plugin-parser.ts"),
);
const { extractPortableZip, portablePackageDigest } = await jiti.import(
  join(hostSource, "agent-plugin-source.ts"),
);
const { portableMcpSchema, connectorMcpAuth } = await jiti.import(
  join(hostSource, "agent-plugin-mcp.ts"),
);
const output = await mkdtemp(join(tmpdir(), "agent-plugin-lifecycle-"));
try {
  execFileSync(
    process.execPath,
    [join(presets, "scripts/quickstart.mjs"), "--pack", "--output-dir", output],
    { stdio: "pipe" },
  );
  for (const entry of await loadQuickstartPlugins()) {
    const root = await mkdtemp(join(tmpdir(), "agent-plugin-import-"));
    try {
      await extractPortableZip(
        await readFile(join(output, `${entry.id}-${entry.version}.zip`)),
        root,
      );
      const plugin = await parseAgentPlugin(root);
      assert.deepEqual(plugin.diagnostics, []);
      assert.equal(plugin.name, entry.id);
      assert.equal(plugin.skills.length, 1);
      assert.equal(plugin.servers.length, 1);
      assert.equal(
        await portablePackageDigest(root),
        await portablePackageDigest(entry.root),
      );
      for (const server of plugin.servers) {
        const oauth = entry.oauthServers.includes(server.key);
        const requirement = entry.connectorServers[server.key];
        assert.deepEqual(plugin.extension?.connectors || {}, entry.connectorServers);
        const connector = requirement ? connectorMcpAuth({ bindingId: 'test-binding', provider: requirement.type === 'existing' ? requirement.provider : 'test-mcp-provider' }, requirement) : undefined;
        const resolved = portableMcpSchema(server, oauth, connector).mcpServers[
          server.key
        ];
        assert.equal(resolved.type, "http");
        assert.equal(resolved.url, server.config.url);
        assert.deepEqual(
          resolved.auth,
          connector ?? (oauth ? { type: "oauth", binding: "user" } : undefined),
        );
      }
      console.log(
        `PASS ${entry.id}: distributed ZIP, production parser, digest, Skills and MCP binding`,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
} finally {
  await rm(output, { recursive: true, force: true });
}
