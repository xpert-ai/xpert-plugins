// Validate normal package resolution against the published SDK; no declaration overrides.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = path.join(root, "xpertai");
const require = createRequire(path.join(workspace, "package.json"));
const runNx = (...args) =>
  execFileSync("corepack", ["pnpm", "exec", "nx", ...args], {
    cwd: workspace,
    stdio: "inherit",
    env: { ...process.env, NX_DAEMON: "false", CI: "true" },
  });
const projects = [
  "@xpert-ai/sql-workbench",
  "@xpert-ai/plugin-mysql",
  "@xpert-ai/plugin-postgres",
  "@xpert-ai/plugin-hana",
  "@xpert-ai/plugin-db-studio",
  "@xpert-ai/plugin-mariadb",
  "@xpert-ai/plugin-kingbase",
  "@xpert-ai/plugin-opengauss",
  "@xpert-ai/plugin-redshift",
];
const sdkPackage = require("@xpert-ai/plugin-sdk/package.json");
if (sdkPackage.version !== "3.29.0")
  throw new Error(
    "Database migration verification requires the published SDK 3.29.0"
  );
const scratch = mkdtempSync(path.join(tmpdir(), "database-workbench-"));
try {
  runNx("run-many", "-t", "build", "-p", projects.join(","), "--parallel=1");
  runNx(
    "run-many",
    "-t",
    "typecheck",
    "-p",
    projects.join(","),
    "--parallel=1"
  );
  const studioRequire = createRequire(
    path.join(workspace, "apps/db-studio/package.json")
  );
  const { build } = studioRequire("esbuild");
  const specs = [
    "databases/mysql/tests/workbench-sql.spec.ts",
    "databases/mysql/tests/workbench-pagination.spec.ts",
    "databases/postgres/tests/workbench-describe.spec.ts",
  ];
  const out = path.join(scratch, "regressions");
  mkdirSync(out);
  for (const [i, spec] of specs.entries())
    await build({
      entryPoints: [path.join(workspace, spec)],
      outfile: path.join(out, `${i}.test.cjs`),
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node22",
    });
  execFileSync(
    process.execPath,
    [
      require.resolve("jest/bin/jest"),
      "--runInBand",
      "--config",
      JSON.stringify({
        rootDir: out,
        testMatch: ["**/*.test.cjs"],
        testEnvironment: "node",
        transform: {},
      }),
    ],
    { cwd: workspace, stdio: "inherit" }
  );
  runNx("run", "@xpert-ai/plugin-db-studio:test");
  runNx(
    "run-many",
    "-t",
    "test:workbench,test:analytics",
    "-p",
    "@xpert-ai/plugin-mysql,@xpert-ai/plugin-postgres,@xpert-ai/plugin-hana",
    "--parallel=1"
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
