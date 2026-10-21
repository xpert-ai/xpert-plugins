import { config, api, load, save } from "./context.mjs";
import { assertModelEvidence } from "./evidence.mjs";
import assert from "node:assert/strict";

assert(config.model?.id && config.model.name && config.model.copilotId,
  "Configure the expected existing model ID, name, connection and options");
const executions = [];
for (let skip = 0; ; skip += 100) {
  const page = await api(`/xpert-agent-execution/xpert/${config.assistantId}/agent/${config.agentKey ?? "dashboard-agent"}?data=` +
    encodeURIComponent(JSON.stringify({ order: { createdAt: "DESC" }, take: 100, skip })));
  assert(Array.isArray(page.items) && Number.isInteger(page.total), "Invalid execution page");
  executions.push(...page.items);
  if (executions.length >= page.total) break;
  assert(page.items.length, "Incomplete execution pagination");
}
const rounds = [];
for (const item of config.cases) {
  const names = [item.format, ...(item.repairPrompt ? [`${item.format}-repair`] : []),
    `${item.format}-edit1`, `${item.format}-edit2`];
  const generation = await load(`${item.format}/ui-generation.json`);
  const roots = executions.filter((execution) => execution.threadId === generation.threadId && !execution.parentId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  assert.equal(roots.length, names.length, "Unexpected model rounds; preserve and account for every prompt");
  for (const [index, name] of names.entries()) {
    const sent = await load(`${name}/ui-generation.json`);
    assert.equal(sent.threadId, generation.threadId);
    const execution = roots[index];
    assertModelEvidence(execution, { ...config.model, threadId: sent.threadId });
    rounds.push({ name, executionId: execution.id, createdAt: execution.createdAt,
      completedAt: execution.completedAt, elapsedTime: execution.elapsedTime,
      modelId: execution.metadata.primaryModelId, model: execution.metadata.primaryModelSnapshot,
      source: execution.metadata.primaryModelSource });
  }
}
await save("models.json", { passed: true, expected: config.model, rounds });
console.log(JSON.stringify({ passed: true, model: config.model.name, rounds: rounds.length }));
