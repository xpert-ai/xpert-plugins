import { readFile, writeFile } from "node:fs/promises";
import { currentBuild, verifyBuild } from "./build-evidence.mjs";
import assert from "node:assert/strict";
const config = JSON.parse(await readFile(process.argv[2], "utf8"));
assert(config.buildManifest, "Configure an external buildManifest path");
if (process.argv[3] === "record") {
  await writeFile(config.buildManifest, JSON.stringify(await currentBuild(config), null, 2), { flag: "wx", mode: 0o600 });
} else {
  assert.equal(process.argv[3], "verify", "Use record or verify");
  await verifyBuild(config);
}
console.log(JSON.stringify({ passed: true, mode: process.argv[3], scope: "source_and_build_bytes_only" }));
