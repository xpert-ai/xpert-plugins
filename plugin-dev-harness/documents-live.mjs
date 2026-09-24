#!/usr/bin/env node
// Uses an existing published sandbox Assistant without changing its graph/model.
// Host-specific identifiers and execution contents stay in a private receipt.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadQuickstartPlugins, createAgentPluginApi, installQuickstartPlugin } from '../agent-plugins/scripts/quickstart.mjs';

const { values } = parseArgs({ options: Object.fromEntries(
  ['platform-root', 'sdk-root', 'context', 'output-dir', 'api-url'].map(key => [key, { type: 'string' }])
) });
for (const key of ['platform-root', 'sdk-root', 'context', 'output-dir'])
  assert.ok(values[key], `Missing --${key}`);
const apiUrl = (values['api-url'] || 'http://localhost:3000/api').replace(/\/+$/, '');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(apiUrl).hostname), 'Local acceptance only');
const output = resolve(values['output-dir']);
await mkdir(output, { recursive: true, mode: 0o700 });
const context = JSON.parse(await readFile(resolve(values.context), 'utf8'));
for (const key of ['orgId', 'workspaceId', 'assistantId']) assert.match(context[key], /^[a-f0-9-]{36}$/i);
const { requireAuthentication, createRequestHeaders } = await import(pathToFileURL(join(resolve(values['platform-root']), 'tools/scripts/local-plugin-cli.mjs')));
const { Client } = await import(pathToFileURL(join(resolve(values['sdk-root']), 'packages/core/dist/index.js')));
const auth = await requireAuthentication({ apiUrl });
const headers = createRequestHeaders({ scope: 'organization', orgId: context.orgId }, auth.token, auth.tenantId);
const api = createAgentPluginApi(apiUrl, headers);
const client = new Client({ apiUrl: apiUrl + '/ai', defaultHeaders: headers });
async function team() {
  const response = await fetch(apiUrl + '/xpert/' + context.assistantId + '/team', { headers });
  assert.ok(response.ok, `Assistant access HTTP ${response.status}`);
  return response.json();
}
const before = await team();
assert.equal(before.workspaceId, context.workspaceId);
assert.ok(before.publishAt && before.features?.sandbox?.enabled, 'Use a published sandbox Assistant');
const plugin = (await loadQuickstartPlugins()).find(item => item.id === 'documents');
const installed = await installQuickstartPlugin(plugin, context.workspaceId, api, { replace: true });
const selected = await client.assistants.validateResources(context.assistantId, {
  revision: 0, resources: [{ bindingId: installed.binding.id, version: installed.binding.version }]
});
const thread = await client.threads.create({ assistantId: context.assistantId });
await writeFile(join(output, 'context.json'), JSON.stringify({ ...context, thread, binding: installed.binding }), { mode: 0o600 });
const events = [];
const taskRoot = 'documents/acceptance-' + randomUUID().slice(0, 8);
const documentPath = taskRoot + '/documents-acceptance.docx';
try {
  for await (const event of client.runs.stream(thread.thread_id, context.assistantId, {
    input: { action: 'send', message: { input: {
      input: `This is an authorized Documents plugin acceptance test. Use only the selected portable documents Skill, whose path includes agent-plugins. Read its SKILL.md and references. Run its documents.py doctor through sandbox_shell. Create ${documentPath} with exactly two pages: page 1 has the title Documents Acceptance, a Chinese paragraph about document review, and a 3-row editable table; page 2 has a heading and a short numbered review checklist. Use a page break and Noto Sans CJK SC fonts. Write a new builder under ${taskRoot}, run it through documents.py run, and explicitly run documents.py inspect on the saved file to verify the paragraphs and table. Render with documents.py render to ${taskRoot}/qa-1 and use view_image to inspect BOTH pages. Fix and rerender to a new directory if needed. Use sandbox_list_dir to confirm delivery, report the final workspace path with Files panel download instructions, and state what was verified. Do not invent a download URL. Do not change source repositories, install dependencies, call external services, reuse previous test artifacts, or use the older native Documents Skill.`,
      runtimeResources: selected
    } } }, streamMode: ['events'], signal: AbortSignal.timeout(600000)
  })) events.push(event);
} catch (error) {
  const runs = await client.runs.list(thread.thread_id, { limit: 10 });
  for (const run of runs.filter(run => run.status === 'running'))
    await client.runs.cancel(thread.thread_id, run.run_id, false, 'interrupt');
  throw error;
} finally {
  await writeFile(join(output, 'events.json'), JSON.stringify(events), { mode: 0o600 });
}
const after = await team();
assert.deepEqual(after.graph, before.graph, 'Acceptance must leave the Assistant graph unchanged');
const state = await client.threads.get(thread.thread_id);
await writeFile(join(output, 'state.json'), JSON.stringify(state), { mode: 0o600 });
assert.equal(state.status, 'idle');
const messages = state.values?.messages ?? [];
const replies = messages.filter(message => message.name === 'sandbox_shell').flatMap(message => {
  try { return [JSON.parse(message.content)]; } catch { return []; }
});
assert.ok(messages.some(message => message.name === 'read_skill_file' && message.content.includes('# Documents')));
assert.ok(replies.some(reply => reply.packages?.['python-docx']), 'Successful runtime doctor required');
assert.ok(replies.some(reply => reply.paragraphs?.length && reply.tables?.[0]?.length === 3), 'Inspect must confirm the saved document');
const render = replies.findLast(reply => reply.input === documentPath && reply.pageCount === 2);
assert.ok(render, 'Successful two-page render required');
assert.ok(messages.some(message => message.name === 'view_image' && message.content.includes('Loaded 2 image(s)')));
const views = messages.flatMap(message => message.tool_calls ?? []).filter(call => call.name === 'view_image');
for (const page of render.pages) assert.ok(views.some(call => JSON.stringify(call.args).includes(page.path)));
const conversationId = events.find(event => event.data?.event === 'on_conversation_start')?.data?.data?.id;
assert.ok(conversationId, 'Conversation context required for download');
for (const path of [documentPath, render.pdf, ...render.pages.map(page => page.path)]) {
  const response = await fetch(apiUrl + '/chat-conversation/' + conversationId + '/file/download?' + new URLSearchParams({ path }), { headers });
  assert.ok(response.ok, `Workspace download HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (path === documentPath) assert.equal(createHash('sha256').update(bytes).digest('hex'), render.sha256);
  await writeFile(join(output, path.split('/').at(-1)), bytes, { mode: 0o600 });
}
await writeFile(join(output, 'render.json'), JSON.stringify(render), { mode: 0o600 });
console.log(JSON.stringify({ installed: installed.state, graphUnchanged: true, pageCount: render.pageCount,
  workspaceDownload: true, documentHashVerified: true, visualReview: 'Inspect downloaded page PNGs independently' }));
