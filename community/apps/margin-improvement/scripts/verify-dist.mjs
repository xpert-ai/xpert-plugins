import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "yaml";
import plugin from "../dist/index.js";
import { configuration } from "../dist/configuration.js";
const pkg = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url)),
);
assert.equal(plugin.meta.name, pkg.name);
assert.equal(plugin.meta.version, pkg.version);
assert.equal(plugin.meta.level, pkg.xpert.plugin.level);
assert.equal(plugin.meta.artifactNamespace, pkg.xpert.plugin.artifactNamespace);
assert.equal(configuration().template.executionAuthority, "platform");
for (const t of plugin.templates) {
  const d = parse(t.dslContent);
  assert.deepEqual(d.team.avatar, t.avatar);
  assert.match(t.avatar.emoji.unified, /^[0-9a-f]+(?:-[0-9a-f]+)*$/i);
  assert(d.team.agentConfig.recursionLimit >= 80);
  assert.deepEqual(d.team.features.opener.questions, t.startPrompts);
  const primary = d.nodes.find((n) => n.key === t.primaryAgentKey);
  assert(primary);
  assert.deepEqual(primary.entity.avatar, t.avatar);
  for (const provider of ["todoListMiddleware", "ContextCompressionMiddleware"])
    assert(
      d.nodes.some((n) => n.entity.provider === provider && n.entity.required),
    );
  assert(
    d.connections.every(
      (e) =>
        d.nodes.some((n) => n.key === e.from) &&
        d.nodes.some((n) => n.key === e.to),
    ),
  );
}
console.log(
  "dist: metadata, avatars, primary defaults, graph and platform pipeline verified",
);

// Verify the built App contract and the same local asset boundary used by Explore.
const { app, APP_COVER } = await import("../dist/app-config.js");
const { manifest } = await import("./manifest.mjs");
const packedManifest = JSON.parse(
  fs.readFileSync(
    new URL("../.xpertai-plugin/plugin.json", import.meta.url),
    "utf8",
  ),
);
assert.deepEqual(packedManifest, manifest);
assert.equal(
  plugin.templates.filter((t) => t.key === app.appConfig.assistantTemplateKey)
    .length,
  1,
);
for (const role of app.appConfig.assistantSuite.roles) {
  assert(
    plugin.templates.some(
      (t) =>
        t.key === role.templateKey &&
        t.primaryAgentKey === role.primaryAgentKey,
    ),
  );
}
for (const target of plugin.meta.targetApps) {
  const marketplace = plugin.meta.targetAppMeta[target].marketplace;
  assert.deepEqual(
    marketplace.contents.find((item) => item.name === app.name),
    app,
  );
  assert.deepEqual(marketplace.screenshots, [APP_COVER]);
}
assert.deepEqual(
  app.appConfig.presentation.screenshots,
  packedManifest.assets.screenshots,
);
assert(APP_COVER.startsWith("./assets/brand/") && !APP_COVER.includes(".."));
const cover = fs.readFileSync(new URL("../" + APP_COVER, import.meta.url));
assert(cover.length > 0 && cover.length <= 5 * 1024 * 1024);
assert.equal(cover.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
assert(pkg.files.includes("assets") && pkg.files.includes(".xpertai-plugin"));
console.log(
  "app: template links, bilingual presentation, generated manifest and packaged cover verified",
);
