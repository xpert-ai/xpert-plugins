import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadQuickstartPlugins, packQuickstartPlugin } from './quickstart.mjs';

const root = fileURLToPath(new URL('../assistants/bosi-business-review/', import.meta.url));
const readJson = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
const roles = (await readJson('skills/bosi-business-review/references/roles.json')).roles;
const topics = (await readJson('skills/bosi-business-review/references/topics.json')).topics;

test('Bosi generates reproducibly from role and topic catalogs without mutating shared playbooks', async () => {
  const manifest = await readJson('plugin.json');
  const paths = ['plugin.json', ...manifest.extensions.xpertai.templates.map(t => t.path)];
  const before = await Promise.all(paths.map(path => readFile(join(root, path), 'utf8')));
  execFileSync(process.execPath, [fileURLToPath(new URL('./build-bosi-business-review.mjs', import.meta.url))]);
  const after = await Promise.all(paths.map(path => readFile(join(root, path), 'utf8')));
  assert.deepEqual(after, before);
  assert.deepEqual((await readdir(join(root, 'templates'))).sort(), roles.map(r => `${r.key}.json`).sort());
  assert.equal(roles.filter(r => r.tier === 'core').length, 6);
  assert.equal(roles.filter(r => r.tier === 'specialist').length, 4);
  assert.equal(roles.filter(r => r.tier === 'general').length, 1);
});

test('every role binds shared source-neutral skills to its connected primary Agent and requires the same Project type', async () => {
  const topicKeys = new Set(topics.map(t => t.key));
  for (const role of roles) {
    role.topics.forEach(topic => assert(topicKeys.has(topic), `${role.key}: ${topic}`));
    const dsl = await readJson(`templates/${role.key}.json`);
    const primary = dsl.nodes.find(n => n.key === dsl.team.agent.key);
    assert.equal(primary.type, 'agent');
    assert.equal(dsl.team.options.workspaceScope.mode, 'project-required');
    assert.equal(dsl.team.options.workspaceScope.projectType.applicationKey, '@xpert-ai/plugin-live-dashboard:live-dashboard');
    assert.equal(dsl.team.options.workspaceScope.projectType.projectTypeKey, 'dashboard');
    assert.equal(dsl.team.features.sandbox.enabled, true);
    assert.equal(dsl.team.features.sandbox.provider, undefined);
    const dependencies = dsl.template.dependencies;
    assert(dependencies.plugins.includes('@xpert-ai/plugin-analytics-data-xpert'));
    assert.deepEqual(dependencies.skills.filter(s => s.source).map(s => s.componentKey).sort(),
      ['bosi-business-review', ...topics.map(t => t.skill)].sort());
    for (const skill of dependencies.skills) {
      assert.equal(skill.targetAgentKey, primary.key);
      if (skill.source) {
        assert.equal(skill.source.name, 'bosi-business-review');
        const text = await readFile(join(root, 'skills', skill.componentKey, 'SKILL.md'), 'utf8');
        assert(text.includes(`name: ${skill.componentKey}`));
      }
    }
    const connectedProviders = dsl.connections.map(edge => {
      assert.equal(edge.from, primary.key);
      assert.equal(edge.required, true);
      return dsl.nodes.find(n => n.key === edge.to).entity.provider;
    });
    assert.deepEqual(connectedProviders.sort(), ['LiveDashboard', 'SandboxFile', 'skillsMiddleware'].sort());
    assert(!dsl.template.manifest.routines?.some(r => r.enabled));
    assert.deepEqual(dsl.template.manifest.onboarding.preferences, []);
    assert.match(primary.entity.prompt, /current user's question determines/);
    assert.match(primary.entity.prompt, /both this Assistant and the current actor/);
    assert.match(primary.entity.prompt, /Missing data is not zero or demo data/);
    assert.doesNotMatch(JSON.stringify(dsl), /localhost|goodsap|H100|6e00459f|Bearer |client_secret|\/Users\//);
    for (const question of dsl.team.features.opener.questions) {
      assert(question.label.length < question.prompt.length);
      assert(question.prompt.length > 25);
    }
  }
});

test('Bosi is an independently installable resource package with role, source and usage documentation', async () => {
  const entry = (await loadQuickstartPlugins()).find(p => p.id === 'bosi-business-review');
  assert(entry);
  assert.equal(entry.version, (await readJson('plugin.json')).version);
  assert((await packQuickstartPlugin(entry)).length > 0);
  const docs = await readJson('docs/docs.json');
  for (const page of docs.navigation.groups.flatMap(group => group.pages))
    assert((await readFile(join(root, 'docs', `${page}.mdx`), 'utf8')).length > 200);
  const sources = await readFile(join(root, 'skills/bosi-business-review/references/data-sources.md'), 'utf8');
  for (const protocol of ['XMLA', 'OData', 'database']) assert(sources.includes(protocol));
  assert.match(sources, /\$apply/);
});
