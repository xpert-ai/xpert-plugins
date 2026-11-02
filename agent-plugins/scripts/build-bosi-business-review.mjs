#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../assistants/bosi-business-review/', import.meta.url));
const readJson = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
const catalog = await readJson('skills/bosi-business-review/references/roles.json');
const topics = await readJson('skills/bosi-business-review/references/topics.json');
const icon = `data:image/svg+xml;base64,${(await readFile(join(root, 'assets/icon.svg'))).toString('base64')}`;
const i18n = (en_US, zh_Hans) => ({ en_US, zh_Hans });
const plugins = ['@xpert-ai/plugin-live-dashboard', '@xpert-ai/plugin-analytics-data-xpert'];
const providers = ['LiveDashboard', 'SandboxFile', 'skillsMiddleware'];
const primary = 'Agent_Bosi';
const skills = ['bosi-business-review', ...topics.topics.map(topic => topic.skill)];
const sharedPrompt = `Read the installed bosi-business-review Skill before analysis and the relevant topic Skills on demand. The current user's question determines the business task, source, organization and period; role priorities, examples, previous requests and saved preferences are defaults, never overrides. One Assistant may analyze many topics and produce many dashboards from one or several authorized sources. BW XMLA, SAP OData and databases are source protocols, not role boundaries. Discover actual read-only analytics contracts through LiveDashboard; never guess IDs, formulas or joins. A role template, Project or analytics definition does not grant access: use only resources authorized for both this Assistant and the current actor. Missing data is not zero or demo data. Never borrow another Assistant identity. Check completeness, grain, currency and accounting scope before asserting totals or ratios. For dashboard requests, read the installed live-dashboard Skill and its theme guides, use window.xpertLiveArtifact for HTML, validate live bindings and filters, and save a draft in the current ChatKit Project. Preserve the returned Artifact identity and revision. Do not reopen an unchanged draft merely to verify a successful save. An analysis-only request need not create an Artifact. Do not publish, share, schedule work, send messages or write to source business systems by default. Use the user's language and explain business results rather than raw tool schemas.`;

await mkdir(join(root, 'templates'), { recursive: true });
for (const role of catalog.roles) {
  const avatar = `data:image/png;base64,${(await readFile(join(root, 'assets/avatars', `${role.key}.png`))).toString('base64')}`;
  const questions = [
    { label: role.label, prompt: role.starter },
    { label: '使用指定数据分析', prompt: '我想使用指定的业务数据进行分析。请先检查我当前问题涉及的数据源和模型，缺少必要范围时再简短追问；不要用其他数据或演示数据代替。' },
    { label: '检查数据覆盖', prompt: '请检查当前项目中本助手与我共同有权使用的数据，列出可分析的主题、缺少的字段或绑定和下一步准备事项。只做检查，不制作或修改看板。' }
  ];
  const definition = {
    team: {
      type: 'agent', name: role.key, title: role.title, description: role.description,
      version: catalog.version, avatar: { url: avatar }, agent: { key: primary },
      starters: questions.map(question => question.prompt),
      features: { sandbox: { enabled: true }, opener: { enabled: true,
        message: '选择或创建项目，告诉我你的经营问题。我会先核对授权数据和口径，再分析或制作实时看板。', questions } },
      options: { workspaceScope: { mode: 'project-required', projectType: {
        applicationKey: '@xpert-ai/plugin-live-dashboard:live-dashboard', projectTypeKey: 'dashboard'
      } } },
      agentConfig: { recursionLimit: 300 }, workspaceDataScope: 'shared', knowledgebases: [], toolsets: [], tags: []
    },
    nodes: [
      { type: 'agent', key: primary, position: { x: 200, y: 100 }, entity: {
        key: primary, name: role.key, title: role.title, avatar: { url: avatar },
        prompt: `${sharedPrompt}\n\nRole perspective: ${role.focus}\nDefault topic priorities: ${role.topics.join(', ') || 'determine from the current question and actual coverage'}. These priorities do not restrict supported questions.`,
        collaboratorNames: [], toolsetIds: [], knowledgebaseIds: []
      } },
      ...providers.map((provider, index) => ({ type: 'workflow', key: `Middleware_${provider}`,
        position: { x: 550, y: 100 + index * 120 }, entity: { type: 'middleware',
          key: `Middleware_${provider}`, title: provider, provider, required: true,
          ...(provider === 'LiveDashboard' ? { options: { maxModelCalls: 64 } } : {}) } }))
    ],
    connections: providers.map(provider => ({ type: 'workflow', key: `${primary}/Middleware_${provider}`,
      from: primary, to: `Middleware_${provider}`, required: true })),
    template: { schemaVersion: 2, dependencies: { plugins,
      skills: [
        { pluginName: plugins[0], componentKey: 'live-dashboard', targetAgentKey: primary },
        ...skills.map(componentKey => ({ source: { kind: 'agent-plugin', name: 'bosi-business-review' }, componentKey, targetAgentKey: primary }))
      ] }, manifest: { schemaVersion: 2, version: catalog.version,
        onboarding: { skill: 'bosi-business-review', required: true, preferences: [],
          completionCriteria: 'Verify the selected Project and actual authorized source coverage. Answer the first requested business question with query evidence or save the requested dashboard draft with its real receipt. Installation or a missing-configuration report alone is not successful business onboarding.' },
        execution: { offline: 'requires-online', modelFeatures: ['tool-call'] }
      } }
  };
  await writeFile(join(root, 'templates', `${role.key}.json`), JSON.stringify(definition, null, 2) + '\n');
}
const manifest = {
  $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  name: 'bosi-business-review', version: catalog.version,
  description: 'Role-based business analysis Assistants with shared analytical Skills and governed Live Dashboards for BW XMLA, SAP OData and databases.',
  author: { name: 'Xpert AI' }, keywords: ['assistant-template', 'business-intelligence', 'live-dashboard', 'sap'],
  extensions: { xpertai: { version: 2, role: 'assistant', interface: {
    displayName: i18n('Bosi Business Review', 'Bosi 经营分析助手套件'), icon,
    description: i18n('Install the roles your organization needs; share analytical methods while configuring access per instance.', '按组织职责选装岗位助手，共享分析方法，为每个实例配置实际数据权限。')
  }, templates: catalog.roles.map(role => ({ key: role.key, path: `templates/${role.key}.json`,
    category: 'analytics', presentation: { title: i18n(role.englishTitle, role.title),
      description: i18n(role.englishDescription, role.description),
      pluginDisplayName: i18n('Bosi Business Review', 'Bosi 经营分析助手套件') }
  })) } }
};
await writeFile(join(root, 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${catalog.roles.length} role/general templates with ${skills.length} shared Bosi Skills.`);
