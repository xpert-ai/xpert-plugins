// Build against an explicit SDK artifact; never replace installed SDK dependencies.
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = path.join(root, "xpertai");
const require = createRequire(path.join(workspace, "package.json"));
const sdk = path.resolve(process.argv[2] ?? "");
if (!process.argv[2] || !existsSync(path.join(sdk, "data-workbench.d.ts")))
  throw new Error(
    "Usage: node plugin-dev-harness/verify-database-workbench.mjs <platform-sdk-dist>"
  );
const scratch = mkdtempSync(path.join(tmpdir(), "database-workbench-"));
const buildPackage = (
  relative,
  configName = "tsconfig.lib.json",
  noEmit = false
) => {
  const target = path.join(workspace, relative);
  const config = path.join(scratch, "tsconfig.json");
  writeFileSync(
    config,
    JSON.stringify(
      {
        extends: path.join(target, configName),
        compilerOptions: {
          tsBuildInfoFile: path.join(
            scratch,
            `${relative.replaceAll("/", "-")}-${configName}.tsbuildinfo`
          ),
          typeRoots: [
            path.join(target, "node_modules/@types"),
            path.dirname(
              path.dirname(require.resolve("@types/node/package.json"))
            ),
          ],
          paths: {
            "@xpert-ai/plugin-sdk": [path.join(sdk, "index.d.ts")],
            "@xpert-ai/plugin-sdk/data-workbench": [
              path.join(sdk, "data-workbench.d.ts"),
            ],
          },
        },
      },
      null,
      2
    )
  );
  execFileSync(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
      "-p",
      config,
      ...(noEmit ? ["--noEmit"] : []),
    ],
    { cwd: target, stdio: "inherit" }
  );
  console.log(`Verified ${relative}/${configName}`);
};
try {
  for (const target of [
    "packages/sql-workbench",
    "databases/mysql",
    "databases/postgres",
    "databases/hana",
    "apps/db-studio",
  ])
    buildPackage(target);
  buildPackage("apps/db-studio", "tsconfig.spec.json", true);
  buildPackage("apps/db-studio", "tsconfig.ui.json", true);
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
  const studio = path.join(workspace, "apps/db-studio");
  const testOut = mkdtempSync(path.join(studio, ".workbench-tests-"));
  try {
    const { readdirSync } = await import("node:fs");
    const tests = readdirSync(path.join(studio, "tests")).filter((file) =>
      file.endsWith(".test.ts")
    );
    for (const test of tests)
      await build({
        entryPoints: [path.join(studio, "tests", test)],
        outfile: path.join(testOut, test.replace(/\.ts$/, ".mjs")),
        bundle: true,
        platform: "node",
        packages: "external",
        format: "esm",
        target: "node22",
      });
    execFileSync(
      process.execPath,
      [
        "--test",
        ...tests.map((test) =>
          path.join(testOut, test.replace(/\.ts$/, ".mjs"))
        ),
      ],
      { cwd: studio, stdio: "inherit" }
    );
    execFileSync(process.execPath, ["scripts/test-controller.mjs"], {
      cwd: studio,
      stdio: "inherit",
    });
  } finally {
    rmSync(testOut, { recursive: true, force: true });
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
