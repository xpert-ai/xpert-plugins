"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const metadata = require("../package.json");
const plugin = require("@xpert-ai/community-data-analytics").default;

// Check the executable package entry: the host persists these runtime values.
test("the built plugin reports the package identity, version, and installation level", () => {
  assert.equal(plugin.meta.name, metadata.name);
  assert.equal(plugin.meta.version, metadata.version);
  assert.equal(plugin.meta.level, metadata.xpert.plugin.level);
});
