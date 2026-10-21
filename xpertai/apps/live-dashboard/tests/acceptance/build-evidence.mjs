import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const pluginRoot = fileURLToPath(new URL("../..", import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function tree(root) {
  const result = {};
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "node_modules") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) result[relative(root, path)] = hash(await readFile(path));
      else throw new Error(`Unexpected build entry: ${path}`);
    }
  }
  await visit(root);
  return result;
}
export async function currentBuild(config) {
  const git = (...args) => execFileSync("git", args, { cwd: config.platformRoot });
  const paths = ["apps/api", "apps/cloud", "packages", "package.json", "pnpm-lock.yaml", "tsconfig.base.json"];
  const untracked = {};
  for (const path of git("ls-files", "--others", "--exclude-standard", "-z", "--", ...paths).toString().split("\0").filter(Boolean))
    untracked[path] = hash(await readFile(join(config.platformRoot, path)));
  const runtime = {};
  for (const name of ["src", "skills", "sandbox-actions", "scripts", "dist"])
    runtime[name] = await tree(join(pluginRoot, name));
  for (const name of ["package.json", "index.cjs", "tsconfig.json", "tsconfig.remote.json"])
    runtime[name] = hash(await readFile(join(pluginRoot, name)));
  return { platform: { head: git("rev-parse", "HEAD").toString().trim(),
    diffSha256: hash(git("diff", "HEAD", "--binary", "--", ...paths)), untracked },
    sdk: await tree(join(config.platformRoot, "packages/plugin-sdk/dist")),
    contracts: await tree(join(config.platformRoot, "packages/contracts/dist")), runtime };
}
export async function verifyBuild(config) {
  if (!config.buildManifest) return;
  const expected = JSON.parse(await readFile(config.buildManifest, "utf8"));
  const digest = hash(JSON.stringify(expected));
  assert.equal(hash(JSON.stringify(await currentBuild(config))), digest,
    "Frozen build changed; start a new baseline instead of mixing results");
  return digest;
}
