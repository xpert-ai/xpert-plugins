import { api, root as outputRoot, config } from "./context.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { assertSavedDocumentEvidence } from "./evidence.mjs";
import assert from "node:assert/strict";
const reports = [];
for (const format of config.cases.map((item) => item.format)) {
  const records = [];
  for (const name of [
    config.cases.find((item) => item.format === format).repairPrompt
      ? format + "-repair"
      : format,
    format + "-edit1",
    format + "-edit2",
  ]) {
    const root = new URL("file://" + outputRoot + "/" + name + "/"),
      document = JSON.parse(await readFile(new URL("document.json", root))),
      receipt = JSON.parse(
        await readFile(new URL("saved-dashboard.json", root)),
      );
    const state = JSON.parse(await readFile(new URL("agent-state.json", root)));
    assertSavedDocumentEvidence(state, receipt, document);
    records.push(document);
  }
  const baseline = records[0];
  if (config.cases.find((item) => item.format === format).repairPrompt) {
    const original = JSON.parse(
      await readFile(outputRoot + "/" + format + "/document.json"),
    );
    assert.equal(baseline.artifactId, original.artifactId);
    assert.equal(baseline.draftId, original.draftId);
    assert.deepEqual(baseline.manifest.bindings, original.manifest.bindings);
    assert.deepEqual(baseline.manifest.controls, original.manifest.controls);
    assert.deepEqual(
      baseline.manifest.presentation.dependencies,
      original.manifest.presentation.dependencies,
    );
  }
  for (let i = 1; i < records.length; i++) {
    const d = records[i];
    assert.equal(d.artifactId, baseline.artifactId);
    assert.equal(d.draftId, baseline.draftId);
    assert(d.draftRevision > records[i - 1].draftRevision);
    assert.deepEqual(d.manifest.bindings, baseline.manifest.bindings);
    assert.deepEqual(d.manifest.controls, baseline.manifest.controls);
    assert.deepEqual(d.dependencies, baseline.dependencies);
    assert.deepEqual(
      d.manifest.presentation.dependencies,
      baseline.manifest.presentation.dependencies,
    );
    assert.notEqual(
      d.manifest.presentation.html,
      records[i - 1].manifest.presentation.html,
    );
  }
  assert.equal(
    records[1].title,
    format.toUpperCase() + " 文件看板重试回归·修订",
  );
  assert.equal(
    records[2].title,
    format.toUpperCase() + " 文件看板重试回归·定稿预览",
  );
  assert(
    records[2].manifest.presentation.html
      .replace(/<[^>]+>/g, "")
      .includes("金额单位：人民币元；按文件业务口径统计"),
  );
  const versions = await api("/artifacts/" + baseline.artifactId + "/versions");
  assert.deepEqual(versions, []);
  reports.push({
    format,
    passed: true,
    artifactId: baseline.artifactId,
    draftId: baseline.draftId,
    revisions: records.map((d) => d.draftRevision),
    sameBindings: true,
    sameControls: true,
    sameDependencies: true,
    saveReceiptHashesMatch: true,
    formalVersionCount: 0,
  });
}
await writeFile(
  outputRoot + "/evolution.json",
  JSON.stringify(reports, null, 2),
);
console.log(
  JSON.stringify(reports.map(({ artifactId, draftId, ...summary }) => summary)),
);
