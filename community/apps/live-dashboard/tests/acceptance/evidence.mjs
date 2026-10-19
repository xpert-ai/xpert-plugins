import assert from "node:assert/strict";
import { createHash } from "node:crypto";

/** Traverse LangGraph state without counting lc_kwargs replicas twice. */
export function messages(state) {
  const result = [],
    seen = new Set();
  function walk(value) {
    if (!value || typeof value !== "object") return;
    if (value.id && value.content !== undefined && !seen.has(value.id)) {
      seen.add(value.id);
      result.push(value);
    }
    for (const [key, child] of Object.entries(value))
      if (key !== "lc_kwargs") {
        if (Array.isArray(child)) child.forEach(walk);
        else walk(child);
      }
  }
  walk(state);
  return result;
}
export function receipts(state) {
  const all = messages(state);
  const saves = new Map(
    all.flatMap((message) =>
      (message.tool_calls ?? [])
        .filter((call) =>
          [
            "dashboard_create",
            "dashboard_create_html",
            "dashboard_update",
          ].includes(call.name),
        )
        .map((call) => [call.id, call.name]),
    ),
  );
  return all.flatMap((message) => {
    if (
      typeof message.content !== "string" ||
      !message.tool_call_id ||
      saves.get(message.tool_call_id) !== message.name ||
      message.status === "error"
    )
      return [];
    try {
      const value = JSON.parse(message.content);
      return value.dashboard?.artifactId &&
        Number.isInteger(value.dashboard?.draftRevision) &&
        value.dashboard.draftRevision > 0
        ? [value]
        : [];
    } catch {
      return [];
    }
  });
}
export function toolEvidence(state, priorIds = []) {
  const prior = new Set(priorIds),
    calls = [],
    errors = [];
  for (const message of messages(state).filter(
    (message) => !prior.has(message.id),
  )) {
    for (const call of message.tool_calls ?? [])
      calls.push({ id: call.id, name: call.name });
    if (typeof message.content !== "string") continue;
    let value;
    try {
      value = JSON.parse(message.content);
    } catch {}
    if (
      message.status === "error" ||
      value?.error ||
      /^Error:|^Received tool input/.test(message.content)
    ) {
      errors.push({
        id: message.id,
        tool: message.name,
        toolCallId: message.tool_call_id,
        error: value?.error ?? message.content,
        progress: value?.progress,
        recovery: value?.recovery,
      });
    }
  }
  return {
    calls,
    errors,
    saveCalls: calls.filter((call) =>
      [
        "dashboard_create",
        "dashboard_create_html",
        "dashboard_update",
      ].includes(call.name),
    ).length,
  };
}

/** Accept source hashes only from actual successful dashboard mutation replies. */
export function assertSavedDocumentEvidence(state, receipt, document) {
  const actual = receipts(state);
  assert(actual.some((item) => JSON.stringify(item) === JSON.stringify(receipt)),
    "Saved receipt must match an actual successful mutation reply");
  assert.equal(document.artifactId, receipt.dashboard.artifactId);
  assert.equal(document.draftRevision, receipt.dashboard.draftRevision);
  assert.equal(document.isDraft, true);
  assert.equal(document.title, receipt.dashboard.title);
  const candidates = actual.filter((item) =>
    item.dashboard.artifactId === document.artifactId &&
    item.dashboard.draftRevision <= document.draftRevision && item.sourceFile);
  const source = receipt.sourceFile ?? candidates.sort(
    (a, b) => b.dashboard.draftRevision - a.dashboard.draftRevision,
  )[0]?.sourceFile;
  assert(source, "No successful HTML save receipt for this Artifact");
  assert.equal(createHash("sha256").update(document.manifest.presentation.html).digest("hex"),
    source.sha256, "Saved HTML differs from the successful source receipt");
}

export function assertCreatedDashboardEvidence(state, receipt) {
  const all = messages(state);
  const creationIds = new Map(all.flatMap((message) => message.tool_calls ?? [])
    .filter((call) => ["dashboard_create", "dashboard_create_html"].includes(call.name))
    .map((call) => [call.id, call.name]));
  assert(all.some((message) => {
    if (!message.tool_call_id || creationIds.get(message.tool_call_id) !== message.name || message.status === "error" || typeof message.content !== "string") return false;
    try {
      const value = JSON.parse(message.content);
      return value.dashboard?.artifactId === receipt.dashboard.artifactId && value.dashboard.draftRevision > 0;
    } catch { return false; }
  }), "Generation must create a new Artifact; updating a historical dashboard is not creation");
}

/** Read-only refresh checks are useful diagnostics, but not source-mutation acceptance. */
export function assertUiAcceptance(ui) {
  assert(ui.passed && ui.sourcesRestored, "UI or source restoration failed");
  assert.equal(ui.documentPreserved, true, "Refresh replaced the page instance");
  assert.deepEqual(ui.checks.map((check) => check.stage), [
    "initial", "east", "sourceChangedToolbarRefresh", "pageRefresh", "west",
    "all", "cardReopen", "reloadRestored",
  ], "Incomplete source-mutation UI sequence");
  for (const key of ["unknownBinding", "unknownControl", "parentDOM", "directFetch"])
    assert.equal(ui.boundary?.[key], true, `Missing frame boundary check: ${key}`);
}

/** Model-picker labels are not execution evidence; use persisted root metadata. */
export function assertModelEvidence(execution, expected) {
  assert.equal(execution.threadId, expected.threadId, "Execution belongs to another conversation");
  assert.equal(execution.parentId, null, "Expected a root execution");
  assert.equal(execution.status, "success", "Model execution did not succeed");
  assert.equal(execution.metadata?.primaryModelId, expected.id, "Unexpected executed model ID");
  const model = execution.metadata?.primaryModelSnapshot;
  assert.equal(model?.model, expected.name, "Unexpected executed model name");
  assert.equal(model?.copilotId, expected.copilotId, "Unexpected model connection");
  assert.deepEqual(model?.options, expected.options, "Model options changed within the baseline");
}

/** A round may fail both data and visual checks; count it once, by round name. */
export function summarizeBusinessEvidence(cases, rounds, repairs, visualFindings) {
  const dataFailures = new Set(repairs.map((repair) => repair.format));
  const failures = new Set([...dataFailures, ...visualFindings.map((finding) => finding.round)]);
  const initialFailures = cases.filter((item) => failures.has(item.format)).length;
  return {
    initialGeneration: {
      cases: cases.length,
      dataInteractionFirstPass: cases.length - dataFailures.size,
      businessFirstPass: cases.length - initialFailures,
      requiredBusinessRepair: initialFailures,
    },
    dataAcceptedRounds: rounds.length,
    acceptedRounds: rounds.filter((round) => !failures.has(round.name)).length,
    businessFailedAttempts: failures.size,
  };
}
