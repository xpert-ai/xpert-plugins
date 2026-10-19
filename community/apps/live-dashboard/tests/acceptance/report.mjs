import { config, load, save, download } from "./context.mjs";
import { createHash } from "node:crypto";
import { assertUiAcceptance } from "./evidence.mjs";
import assert from "node:assert/strict";
const repairs = [],
  reports = [],
  evolution = await load("evolution.json"),
  boundary = await load("boundary.json"),
  permissions = await load("permissions.json");
assert(evolution.every((item) => item.passed));
assert(boundary.passed);
assert(permissions.passed);
assert.equal(
  permissions.checks.filter((check) => check.sameJwt).length,
  config.cases.length,
  "Incomplete revocation cases",
);
assert(
  permissions.cleanup.every((item) => item.removed),
  "Temporary authorization cleanup incomplete",
);
for (const item of config.cases) {
  const rounds = [];
  for (const suffix of ["", "-edit1", "-edit2"]) {
    const name = item.format + (suffix || (item.repairPrompt ? "-repair" : "")),
      tools = await load(`${name}/tool-evidence.json`),
      ui = await load(`${name}/ui-acceptance.json`);
    assertUiAcceptance(ui);
    assert(tools.saveCalls > 0, `${name}: missing mutation call`);
    rounds.push({
      name,
      draftRevision: ui.draftRevision,
      classification: tools.classification,
      toolErrors: tools.errors.length,
      saveCalls: tools.saveCalls,
      toolCalls: tools.calls.length,
      uiChecks: ui.checks.length,
    });
  }
  if (item.repairPrompt) {
    const originalTools = await load(`${item.format}/tool-evidence.json`),
      originalUi = await load(`${item.format}/ui-acceptance.json`);
    assert.equal(
      originalUi.passed,
      undefined,
      "Repair must retain the failed initial UI evidence",
    );
    assert(
      originalUi.sourcesRestored,
      "Original failed run did not restore files",
    );
    repairs.push({
      format: item.format,
      originalUiError: originalUi.error,
      originalToolErrors: originalTools.errors.length,
      originalSaveCalls: originalTools.saveCalls,
    });
  }
  reports.push({ format: item.format, rounds });
}
const original = await load("initial-fixtures.json");
for (const item of config.cases) {
  const bytes = await download(item.filePath),
    hash = createHash("sha256").update(bytes).digest("hex");
  assert.equal(
    hash,
    original.checks.find((check) => check.format === item.format).sha256,
    `${item.format}: fixture bytes changed`,
  );
}
const rounds = reports.flatMap((report) => report.rounds);
const result = {
  passed: true,
  completedAt: new Date().toISOString(),
  scope: "local_application_regression",
  formalReleaseVerification: false,
  formats: reports,
  repairs,
  totals: {
    modelRounds: rounds.length + repairs.length,
    acceptedRounds: rounds.length,
    firstPass: rounds.filter((round) => round.classification === "first_pass")
      .length,
    recovered: rounds.filter((round) => round.classification === "recovered")
      .length,
    toolErrors:
      rounds.reduce((sum, round) => sum + round.toolErrors, 0) +
      repairs.reduce((sum, repair) => sum + repair.originalToolErrors, 0),
    saveCalls:
      rounds.reduce((sum, round) => sum + round.saveCalls, 0) +
      repairs.reduce((sum, repair) => sum + repair.originalSaveCalls, 0),
    uiChecks: rounds.reduce((sum, round) => sum + round.uiChecks, 0),
  },
  sourcesRestored: true,
  sameArtifactAndBindings: true,
  savedBindingBoundary: true,
  sameTokenRevocation: true,
  authorizationCleanup: true,
};
await save("report.json", result);
console.log(JSON.stringify(result));
