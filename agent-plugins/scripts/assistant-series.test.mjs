import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { loadSeries } from "./build-assistant-series.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const roles = await loadSeries();
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
test("every source category entry is covered exactly once, with traceable editorial classification", async () => {
  const snapshot = await readJson(
    join(root, "catalog/assistant-series/source-inventory.json"),
  );
  const ids = [
    ...new Set(
      Object.values(snapshot.categories)
        .flat()
        .map((path) => path.split("/").pop()),
    ),
  ].sort();
  assert.equal(ids.length, 90);
  assert.deepEqual(roles.map((r) => r.id).sort(), ids);
  assert.equal(new Set(roles.map((r) => r.package)).size, 90);
  assert.equal(new Set(roles.map((r) => r.category)).size, 8);
  const catalog = await readJson(join(root, "quickstart.json"));
  for (const role of roles)
    assert.equal(
      catalog.plugins.filter((p) => p.id === role.package).length,
      1,
    );
  assert.equal(roles.filter((r) => r.classificationNote).length, 4);
});
test("all template and plugin avatars use their own packaged 256px PNG; identities are not duplicated", async () => {
  const hashes = [];
  for (const role of roles) {
    const dir = join(root, "assistants", role.package),
      png = await readFile(join(dir, "assets/icon.png"));
    const manifest = await readJson(join(dir, "plugin.json"));
    const dsl = await readJson(
      join(dir, manifest.extensions.xpertai.templates[0].path),
    );
    assert.equal(manifest.extensions.xpertai.role, role.package === "office-ops" ? "capability" : "assistant", role.id);
    const expected = `data:image/png;base64,${png.toString("base64")}`;
    assert.equal(manifest.extensions.xpertai.interface.icon, expected, role.id);
    assert.equal(dsl.team.avatar.url, expected, role.id);
    assert.equal(
      dsl.nodes.find((n) => n.key === dsl.team.agent.key).entity.avatar.url,
      expected,
      role.id,
    );
    assert.equal(png.readUInt32BE(16), 256);
    assert.equal(png.readUInt32BE(20), 256);
    const hash = createHash("sha256").update(png).digest("hex");
    hashes.push(hash);
    assert.equal(
      (await readJson(join(dir, "assets/avatar.json"))).sha256,
      hash,
    );
  }
  assert.equal(new Set(hashes).size, 90);
});
test("portable packages resolve local skills and graph edges, isolate seeds and pause every routine", async () => {
  for (const role of roles) {
    const dir = join(root, "assistants", role.package),
      manifest = await readJson(join(dir, "plugin.json"));
    const dsl = await readJson(
      join(dir, manifest.extensions.xpertai.templates[0].path),
    );
    assert.equal(dsl.template.manifest.version, manifest.version);
    assert.equal(
      manifest.extensions.xpertai.templates[0].category,
      role.category,
    );
    const presentation = manifest.extensions.xpertai.templates[0].presentation;
    assert.equal(presentation.title.zh_Hans, role.title);
    assert.equal(presentation.description.zh_Hans, role.description);
    assert.match(presentation.title.en_US, /^[A-Za-z]/);
    assert.match(presentation.description.en_US, /^[A-Za-z]/);
    assert.equal(
      presentation.pluginDisplayName.en_US,
      presentation.title.en_US,
    );
    assert.deepEqual(
      manifest.extensions.xpertai.interface.displayName,
      presentation.title,
    );
    assert.deepEqual(
      manifest.extensions.xpertai.interface.description,
      presentation.description,
    );
    for (const dep of dsl.template.dependencies.skills) {
      assert.deepEqual(dep.source, {
        kind: "agent-plugin",
        name: role.package,
      });
      assert(
        dsl.nodes.some(
          (n) => n.key === dep.targetAgentKey && n.type === "agent",
        ),
      );
      const text = await readFile(
        join(dir, "skills", dep.componentKey, "SKILL.md"),
        "utf8",
      );
      assert(text.includes(`name: ${dep.componentKey}`));
      assert(text.length > 500);
    }
    for (const edge of dsl.connections)
      for (const k of ["from", "to"])
        assert(dsl.nodes.some((n) => n.key === edge[k]));
    assert.equal(dsl.template.manifest.files.scope, "user");
    for (const entry of dsl.template.manifest.files.entries) {
      assert.equal(entry.policy, "create-only");
      assert(!entry.path.startsWith("/"));
      assert(!entry.path.split("/").includes(".."));
      if (entry.path.endsWith(".json"))
        assert.deepEqual(JSON.parse(entry.content).items, []);
    }
    for (const routine of dsl.template.manifest.routines) {
      assert.equal(routine.enabled, false);
      assert.equal(routine.timezone, "user");
      assert(
        dsl.template.dependencies.skills.some(
          (s) => s.componentKey === routine.skill,
        ),
      );
    }
    assert.equal(dsl.team.options.operationPolicy.default, "approve");
    const files = await readdir(dir);
    assert(!files.includes("package.json"));
    assert(!files.includes("mcp.json"));
    assert(
      (await stat(join(dir, manifest.extensions.xpertai.templates[0].path)))
        .size <
        4 * 1024 * 1024,
    );
  }
});
test("adaptations disclose provider gaps and preserve substantive role procedures", async () => {
  for (const role of roles.filter(
    (r) => r.status === "repository-adaptation",
  )) {
    const dir = join(root, "assistants", role.package),
      provenance = await readJson(join(dir, "docs/provenance.json"));
    assert.deepEqual(provenance.source, role.source);
    assert.deepEqual(provenance.adaptation.externalIntegrationsBundled, []);
    assert.equal(provenance.adaptation.upstreamTextCopied, false);
    assert.equal(provenance.adaptation.businessRuntimeAcceptance, "pending");
    const work = await readFile(
      join(dir, "skills", `${role.id}-work`, "SKILL.md"),
      "utf8",
    );
    for (const step of role.procedure) assert(work.includes(step), role.id);
    assert(work.includes(role.boundary));
    assert(work.includes(role.deliverable));
    const readme = await readFile(join(dir, "README.md"), "utf8");
    assert(readme.includes(role.source.url));
    assert(readme.includes("不宣称逐项功能等价"));
  }
});

test("all 90 packages share the assistants layout and traceable series metadata", async () => {
  const catalog = await readJson(join(root, "quickstart.json"));
  assert.equal((await readdir(join(root, "assistants"))).length, 90);
  for (const role of roles) {
    assert.equal(
      catalog.plugins.find((p) => p.id === role.package).path,
      `assistants/${role.package}`,
    );
    const dir = join(root, "assistants", role.package);
    assert.deepEqual(
      (await readJson(join(dir, "docs/provenance.json"))).source,
      role.source,
    );
    assert.equal((await readJson(join(dir, "assets/avatar.json"))).id, role.id);
  }
});
