// 从提交基线与当前插件源码创建隔离副本；不复制依赖、产物、环境变量或凭证文件。
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const source = dirname(dirname(fileURLToPath(import.meta.url)));
const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: source,
  encoding: "utf8",
}).trim();
const base = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repo,
  encoding: "utf8",
}).trim();
const sandbox = mkdtempSync(join(tmpdir(), "competitor-clean-")),
  checkout = join(sandbox, "repository");
mkdirSync(checkout);
const archive = join(sandbox, "source.tar");
execFileSync("git", ["archive", "--format=tar", "--output", archive, "HEAD"], {
  cwd: repo,
});
execFileSync("tar", [
  "-xf",
  archive,
  "-C",
  checkout,
  "--exclude=node_modules",
  "--exclude=dist",
]);
const packagePath = relative(repo, source);
const files = execFileSync(
  "git",
  [
    "ls-files",
    "-co",
    "--exclude-standard",
    "-z",
    "--",
    packagePath,
    "community/pnpm-lock.yaml",
  ],
  { cwd: repo, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const digest = createHash("sha256");
for (const file of [...new Set(files)].sort()) {
  const original = join(repo, file);
  if (!lstatSync(original).isFile())
    throw Error(`Unexpected non-file source: ${file}`);
  const content = readFileSync(original);
  mkdirSync(dirname(join(checkout, file)), { recursive: true });
  copyFileSync(original, join(checkout, file));
  if (!file.includes("/docs/")) digest.update(file).update(content);
}
const env = {
  ...process.env,
  PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`,
};
delete env.NODE_PATH;
const corepack = join(dirname(process.execPath), "corepack");
const steps = [];
function run(label, cwd, executable, args) {
  console.log(`[clean] ${label}`);
  const result = spawnSync(executable, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  writeFileSync(
    join(sandbox, `${label}.log`),
    (result.stdout ?? "") + (result.stderr ?? ""),
  );
  steps.push({
    label,
    command: [executable, ...args].join(" "),
    exitCode: result.status,
  });
  if (result.status !== 0) {
    console.error((result.stdout ?? "").slice(-4000), result.stderr ?? "");
    finish();
    throw Error(`${label} failed; logs: ${sandbox}`);
  }
}
function finish() {
  writeFileSync(
    join(sandbox, "report.json"),
    JSON.stringify(
      {
        baseSHA: base,
        sourceSHA256: digest.copy().digest("hex"),
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        steps,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`[clean] Report: ${sandbox}/report.json`);
}
const community = join(checkout, "community");
run("install", community, corepack, [
  "pnpm",
  "--filter",
  "@community/apps-competitor-monitor...",
  "install",
  "--frozen-lockfile",
  "--store-dir",
  join(sandbox, "store"),
]);
for (const step of ["build", "typecheck", "test", "verify:dist"])
  run(step.replace(":", "-"), community, corepack, [
    "pnpm",
    "--filter",
    "@community/apps-competitor-monitor",
    step,
  ]);
const harness = join(checkout, "plugin-dev-harness");
// pnpm 11 的独立 harness 构建许可仅存在此临时副本，不改动仓库工作区设置。
writeFileSync(
  join(harness, "pnpm-workspace.yaml"),
  'packages:\n  - .\nallowBuilds:\n  "@nestjs/core": true\n',
);
run("harness-install", harness, corepack, [
  "pnpm",
  "install",
  "--frozen-lockfile",
  "--store-dir",
  join(sandbox, "harness-store"),
]);
run("harness-build", harness, corepack, ["pnpm", "build"]);
run("harness", checkout, process.execPath, [
  "plugin-dev-harness/dist/index.js",
  "--workspace",
  "./community",
  "--plugin",
  "@community/apps-competitor-monitor",
]);
finish();
