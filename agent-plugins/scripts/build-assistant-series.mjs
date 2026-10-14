#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  categories,
  profiles,
  skills,
  skillKey,
  workspace,
  agentPrompt,
  localTools,
} from "./assistant-series-content.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const catalogRoot = join(root, "catalog/assistant-series");
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const roleSchema = z
  .object({
    id: slug,
    package: slug,
    category: z.enum(Object.keys(categories)),
    title: z.string().min(2),
    description: z.string().min(10),
    inputs: z.string().min(5),
    deliverable: z.string().min(4),
    procedure: z.array(z.string().min(5)).min(3),
    boundary: z.string().min(5),
    profile: z.enum(Object.keys(profiles)),
    source: z
      .object({
        url: z.string().url(),
        name: z.string().min(1),
        creator: z.string(),
        categories: z.array(z.string()),
        checkedAt: z.string(),
        skillCount: z.number().int().nonnegative(),
        routineCount: z.number().int().nonnegative(),
        integrations: z.array(z.string()),
      })
      .strict(),
    status: z.enum(["existing-validated", "repository-adaptation"]),
    classificationNote: z.string().optional(),
  })
  .strict();
export async function loadSeries() {
  const all = [];
  for (const category of Object.keys(categories)) {
    const roles = z
      .array(roleSchema)
      .parse(
        JSON.parse(
          await readFile(join(catalogRoot, `${category}.json`), "utf8"),
        ),
      );
    if (roles.some((role) => role.category !== category))
      throw new Error(`Category mismatch: ${category}`);
    all.push(...roles);
  }
  for (const key of ["id", "package"])
    if (new Set(all.map((r) => r[key])).size !== all.length)
      throw new Error(`Duplicate ${key}`);
  for (const r of all)
    if (r.source.url !== `https://x.ai/bot/marketplace/bots/${r.id}`)
      throw new Error(`Source mismatch: ${r.id}`);
  return all;
}
export async function loadPresentations(roles) {
  const english = z
    .record(z.tuple([z.string().min(2), z.string().min(10)]))
    .parse(
      JSON.parse(await readFile(join(catalogRoot, "locales/en.json"), "utf8")),
    );
  if (
    Object.keys(english).length !== roles.length ||
    roles.some((role) => !english[role.id])
  )
    throw new Error(
      "English catalog translations must cover every role exactly once",
    );
  return new Map(
    roles.map((role) => [
      role.id,
      {
        title: { en_US: english[role.id][0], zh_Hans: role.title },
        description: { en_US: english[role.id][1], zh_Hans: role.description },
        pluginDisplayName: { en_US: english[role.id][0], zh_Hans: role.title },
      },
    ]),
  );
}
const json = (value) => JSON.stringify(value, null, 2) + "\n";
async function write(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, value);
}
const esc = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function sourceNote(role) {
  return `原始参考：[${role.source.name}](${role.source.url})，页面作者 ${role.source.creator || "未列出"}，核对日期 ${role.source.checkedAt}。原始类别：${role.source.categories.join(" / ")}。${role.classificationNote || ""}`;
}
function readme(role) {
  return `# ${role.title}\n\n<img src="assets/icon.png" alt="${role.title}" width="96" height="96">\n\n${role.description}\n\n类别：${categories[role.category]} · 版本：1.0.3 · 纯文件 Agent Plugin\n\n## 使用\n\n从 Agent 插件管理导入本目录的 ZIP，或选择仓库 Git 子目录 \`agent-plugins/assistants/${role.package}\`。安装后在智能体模板市场打开“${role.title}”，导入为 Assistant，选择支持 tool-call 的模型与可用的沙箱。插件和模板共用同一头像，由系统控制圆角。\n\n输入：${role.inputs}。\n\n交付：${role.deliverable}。\n\n${role.procedure.map((s, i) => `${i + 1}. ${s}。`).join("\n")}\n\n## 包内能力\n\n- 三个原创技能：首次使用、业务执行、结果复核。\n- Assistant DSL v2：职责、技能引用、用户独立初始文件、偏好初始化、外部操作审批。\n- ${role.source.routineCount ? "一个默认暂停的每周本地复核任务，启用前需确认用户时区。它是本实现的复核计划，未逐项移植上游例行任务。" : "不预置自动运行的例行任务。"}\n- SandboxFile${profiles[role.profile].providers.length ? "、" + profiles[role.profile].providers.join("、") : ""} 使用宿主已有能力；没有 NestJS 模块或服务端安装脚本。\n\n## 能力边界与来源\n\n${role.boundary}。\n\n${sourceNote(role)}\n\n本包为 Xpert 按公开业务用途独立编写的功能适配，未复制上游长篇提示词、技能正文、人物头像或账号配置。原页面列出 ${role.source.skillCount} 项技能、${role.source.routineCount} 项例行任务；这里的三个技能是重新设计的工作流程，不宣称逐项功能等价或源作者背书。\n\n原页面列出的集成：${role.source.integrations.length ? role.source.integrations.join("、") : "无"}。这些名称仅作来源与后续兼容性追踪；本包不预装外部账号连接，也不冒充已接入上游专有工具。联网研究、CRM、电话、云开发、媒体生成等操作需要另外安装对应工具并完成授权和实测；未接入时可处理上传资料并交付本地文件/草稿，未完成部分必须明确说明。\n\n验证范围：仓库结构、生产解析器、ZIP 导入合同、技能/头像/DSL 绑定；各角色模型业务执行与真实供应商连接另行验收。\n\n源声明见 [docs/provenance.json](docs/provenance.json)，头像提示词见 [assets/avatar.json](assets/avatar.json)。配置源为 [分类目录](../../catalog/assistant-series/${role.category}.json)，运行 \`node scripts/build-assistant-series.mjs\` 重新生成；Office Ops 不由该生成器改写。\n`;
}
export function buildDefinition(role, icon) {
  const key = "primary",
    base = workspace(role),
    avatar = { url: icon };
  const starters = [
    `开始设置${role.title}。`,
    `根据我提供的资料完成${role.deliverable}。`,
    "复核当前工作，列出实际结果与阻塞。",
  ];
  const providers = ["SandboxFile", ...profiles[role.profile].providers];
  const nodes = [
    {
      key,
      type: "agent",
      position: { x: 0, y: 0 },
      entity: {
        key,
        name: role.package,
        title: role.title,
        avatar,
        prompt: agentPrompt(role),
      },
    },
  ];
  for (const [i, provider] of providers.entries())
    nodes.push({
      key: `middleware-${i}`,
      type: "workflow",
      position: { x: 300, y: i * 180 },
      entity: {
        key: `middleware-${i}`,
        type: "middleware",
        provider,
        required: true,
        options:
          provider === "ViewImageMiddleware" ? { compressionPercent: 100 } : {},
        ...(provider === "SandboxFile"
          ? {
              tools: {
                sandbox_read_file: true,
                sandbox_list_dir: true,
                sandbox_write_file: true,
                sandbox_append_file: false,
                sandbox_glob: true,
                sandbox_grep: true,
                sandbox_edit_file: true,
                sandbox_multi_edit_file: false,
                present_files: true,
              },
            }
          : {}),
      },
    });
  const entries = [
    [
      "brief.md",
      `# ${role.title}\n\n目标：待用户提供。\n输入：${role.inputs}。\n交付：${role.deliverable}。\n验收条件：待根据任务确认。\n`,
    ],
    ["work-items.json", json({ schemaVersion: 1, items: [] })],
    ["evidence.json", json({ schemaVersion: 1, items: [] })],
  ].map(([path, content]) => ({
    kind: "file",
    path: `${base}/${path}`,
    content,
    contentVersion: "1",
    policy: "create-only",
  }));
  const routines = role.source.routineCount
    ? [
        {
          key: "weekly-local-review",
          required: false,
          trigger: "schedule",
          expression: "0 9 * * 1",
          timezone: "user",
          skill: skillKey(role, "review"),
          output: `只读本地资料，复核${role.deliverable}的证据、实际结果与阻塞。不查询或写入外部服务。`,
          enabled: false,
        },
      ]
    : [];
  return {
    team: {
      type: "agent",
      name: role.package,
      title: role.title,
      description: role.description,
      version: "1.0.3",
      avatar,
      agent: { key },
      starters,
      features: {
        sandbox: { enabled: true },
        opener: {
          enabled: true,
          message: `${role.description}请提供${role.inputs}。`,
          questions: starters,
        },
      },
      options: {
        operationPolicy: {
          default: "approve",
          rules: localTools.map((tool) => ({
            tool,
            decision: "allow",
            reason:
              "在当前 Assistant 的用户文件与偏好范围工作；外部操作仍需审批。",
          })),
        },
      },
    },
    nodes,
    connections: nodes.slice(1).map((node) => ({
      key: `${key}/${node.key}`,
      type: "workflow",
      from: key,
      to: node.key,
      required: true,
    })),
    memories: [
      { prefix: "工作范围", value: role.description },
      { prefix: "交付标准", value: role.deliverable },
      { prefix: "职责边界", value: role.boundary },
    ],
    template: {
      schemaVersion: 2,
      dependencies: {
        skills: ["setup", "work", "review"].map((kind) => ({
          componentKey: skillKey(role, kind),
          targetAgentKey: key,
          source: { kind: "agent-plugin", name: role.package },
        })),
      },
      manifest: {
        schemaVersion: 2,
        version: "1.0.3",
        files: { scope: "user", entries },
        onboarding: {
          skill: skillKey(role, "setup"),
          required: true,
          preferences: ["language", "timezone"],
          completionCriteria: `保存已确认偏好与任务说明，交付首个${role.deliverable}或含关键缺失项的准备清单。`,
        },
        routines,
        execution: {
          offline: "requires-online",
          modelFeatures: [
            "tool-call",
            ...(providers.includes("ViewImageMiddleware") ? ["vision"] : []),
          ],
        },
      },
    },
  };
}
export async function buildSeries() {
  const roles = await loadSeries();
  const presentations = await loadPresentations(roles);
  // Preflight all assets before writing anything. Never silently substitute another character.
  const icons = new Map();
  for (const role of roles.filter((r) => r.status !== "existing-validated")) {
    const png = await readFile(
      join(root, "assistants", role.package, "assets/icon.png"),
    );
    if (
      png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      png.readUInt32BE(16) !== 256 ||
      png.readUInt32BE(20) !== 256
    )
      throw new Error(`Expected 256px PNG: ${role.id}`);
    const art = JSON.parse(
      await readFile(
        join(root, "assistants", role.package, "assets/avatar.json"),
        "utf8",
      ),
    );
    if (
      art.id !== role.id ||
      art.sha256 !== createHash("sha256").update(png).digest("hex")
    )
      throw new Error(`Avatar provenance mismatch: ${role.id}`);
    icons.set(role.id, `data:image/png;base64,${png.toString("base64")}`);
  }
  for (const role of roles.filter((r) => r.status !== "existing-validated")) {
    const dir = join(root, "assistants", role.package),
      icon = icons.get(role.id);
    await write(
      join(dir, "plugin.json"),
      json({
        $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        name: role.package,
        version: "1.0.3",
        description: role.description,
        author: { name: "Xpert AI" },
        license: "AGPL-3.0-only",
        keywords: [
          "assistant-template",
          role.category,
          "enterprise-avatar-series",
        ],
        extensions: {
          xpertai: {
            version: 2,
            interface: {
              displayName: presentations.get(role.id).title,
              description: presentations.get(role.id).description,
              icon,
            },
            templates: [
              {
                key: role.id,
                path: `templates/${role.id}.json`,
                category: role.category,
                presentation: presentations.get(role.id),
              },
            ],
          },
        },
      }),
    );
    await write(
      join(dir, `templates/${role.id}.json`),
      json(buildDefinition(role, icon)),
    );
    for (const [kind, content] of Object.entries(skills(role))) {
      await write(
        join(dir, "skills", skillKey(role, kind), "SKILL.md"),
        content,
      );
      const label = { setup: "首次使用", work: "业务执行", review: "结果复核" }[
        kind
      ];
      await write(
        join(dir, "skills", skillKey(role, kind), "agents/xpertai.yaml"),
        `interface:\n  display_name: ${JSON.stringify(role.title + " · " + label)}\n  short_description: ${JSON.stringify(role.description)}\n`,
      );
    }
    await write(join(dir, "README.md"), readme(role));
    await write(
      join(dir, "docs/docs.json"),
      json({
        $schema: "https://mintlify.com/docs.json",
        theme: "mint",
        name: role.title,
        colors: { primary: "#325F84", light: "#729ABC", dark: "#202B3B" },
        navigation: {
          groups: [{ group: "使用指南", pages: ["index", "usage"] }],
        },
      }),
    );
    await write(
      join(dir, "docs/index.mdx"),
      `---\ntitle: ${JSON.stringify(role.title)}\ndescription: ${JSON.stringify(role.description)}\n---\n\n${role.description}\n\n## 主要交付\n\n${role.deliverable}。\n\n${role.procedure.map((step, i) => `${i + 1}. ${step}。`).join("\n")}\n\n## 适配说明\n\n${sourceNote(role)}\n\n本包是原创功能适配，未复制上游长篇提示词或头像，不宣称逐项等价。外部工具和真实供应商连接需单独安装、授权和验收。\n`,
    );
    await write(
      join(dir, "docs/usage.mdx"),
      `---\ntitle: "安装与验收"\n---\n\n## 安装\n\n将本插件目录打包为 ZIP 后从 Agent 插件管理导入，再在模板市场创建 Assistant。选择支持工具调用的模型和可用沙箱。\n\n## 首次运行\n\n提供${role.inputs}，从首次使用技能开始。检查实际产出是否为${role.deliverable}，是否保存到用户文件空间，是否能追溯到真实输入。\n\n## 复核\n\n${role.boundary}。资料缺失或外部能力未接入时，应明确显示未完成项。所有预置例行任务默认暂停；启用前确认用户时区。外部写入需经平台审批。\n\n## 验收状态\n\n仓库校验与生产解析器测试不能替代模型业务执行、授权和供应商实测。每个角色的真实运行需要用获准业务资料另行验收。\n`,
    );
    await write(
      join(dir, "docs/provenance.json"),
      json({
        source: role.source,
        adaptation: {
          author: "Xpert AI",
          method: "original-functional-adaptation",
          upstreamTextCopied: false,
          upstreamImagesCopied: false,
          category: role.category,
          skillCount: 3,
          routineCount: role.source.routineCount ? 1 : 0,
          externalIntegrationsBundled: [],
          businessRuntimeAcceptance: "pending",
          ...(role.classificationNote
            ? { classificationNote: role.classificationNote }
            : {}),
        },
      }),
    );
  }
  // Office Ops shares presentation metadata, while its proven business DSL and skills remain intact.
  for (const role of roles.filter(
    (role) => role.status === "existing-validated",
  )) {
    const dir = join(root, "assistants", role.package);
    const manifest = JSON.parse(
      await readFile(join(dir, "plugin.json"), "utf8"),
    );
    const presentation = presentations.get(role.id);
    manifest.version = "1.1.4";
    manifest.extensions.xpertai.interface.displayName = presentation.title;
    manifest.extensions.xpertai.interface.description =
      presentation.description;
    manifest.extensions.xpertai.templates[0].presentation = presentation;
    await write(join(dir, "plugin.json"), json(manifest));
    const path = join(dir, manifest.extensions.xpertai.templates[0].path);
    const definition = JSON.parse(await readFile(path, "utf8"));
    definition.template.manifest.version = manifest.version;
    await write(path, json(definition));
  }
  const quickstart = JSON.parse(
    await readFile(join(root, "quickstart.json"), "utf8"),
  );
  for (const role of roles) {
    let entry = quickstart.plugins.find((p) => p.id === role.package);
    if (!entry) {
      entry = { id: role.package, oauthServers: [] };
      quickstart.plugins.push(entry);
    }
    entry.path = `assistants/${role.package}`;
  }
  await write(join(root, "quickstart.json"), json(quickstart));
  await writeCatalog(roles);
  console.log(
    `Built ${roles.length - 1} new packages; preserved Office Ops. ${roles.length} templates in ${Object.keys(categories).length} categories.`,
  );
}
async function writeCatalog(roles) {
  let md = `# 企业 Assistant 模板系列\n\n以 [Grok Bot Marketplace](https://x.ai/bot/marketplace) 2026-10-14 的全部分类页面为范围，去重收录 **${roles.length} 个模板**。包含 ${roles.length - 1} 个原创功能适配包和已有 Office Ops；所有包均为文件型 Agent Plugins，不需要新增 NestJS 服务端模块。\n\n[查看头像与分类画廊](gallery.html) · [90 人头像总览](avatar-sheet.html) · [生成与校验说明](../../README.md)\n\n## 收录与适配边界\n\n“全部”指本次可公开访问的市场列表快照，不承诺未来新增条目自动同步。首页和 From Grok Bot Team 是推荐入口，不另建重复包；多类别模板保留源分类并选定一个主类别。四个仅在推荐入口出现的模板补充了编辑分类并单独注明。\n\n每个新包包含原创职责、三个任务技能、初始文件、默认审批和独立头像。上游长篇提示词和技能正文不入库；不复制头像、凭据或私有配置。源作者仅用于归属记录，不代表授权背书。上游技能、自动化、专有工具和真实供应商集成没有逐项等价迁移，详见每包 README 与 docs/provenance.json；业务模型执行另行验收。\n\n分类 JSON 是生成源；全部 90 个包统一放在 \`assistants/\` 子目录，quickstart 通过显式 path 定位。Office Ops 使用相同目录与来源元数据结构，保留其 7 个技能和 3 个例行任务，生成器不改写已有业务配置。\n\n`;
  for (const [category, label] of Object.entries(categories)) {
    const group = roles.filter((r) => r.category === category);
    md += `## ${label}（${group.length}）\n\n| Assistant | 原模板 / 来源 | 插件目录 |\n| --- | --- | --- |\n`;
    for (const role of group)
      md += `| ${role.title} | [${role.source.name.replaceAll("|", "/")} ](${role.source.url}) | [${role.package}](../../assistants/${role.package}/README.md) |\n`;
    md += "\n";
  }
  await write(join(catalogRoot, "README.md"), md.trimEnd() + "\n");
  const cards = roles
    .map(
      (r) =>
        `<article data-category="${r.category}" data-search="${esc([r.title, r.source.name, r.package].join(" ").toLowerCase())}"><img src="../../assistants/${r.package}/assets/icon.png" alt="${esc(r.title)}" width="96" height="96" loading="lazy"><span>${categories[r.category]}</span><h2>${esc(r.title)}</h2><p class="source">${esc(r.source.name)}</p><p>${esc(r.description)}</p><footer><a href="../../assistants/${r.package}/README.md">插件说明</a><a href="${r.source.url}">原模板 ↗</a></footer></article>`,
    )
    .join("\n");
  await write(
    join(catalogRoot, "gallery.html"),
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>企业 Assistant 模板系列</title><style>*{box-sizing:border-box}body{margin:0;background:#f8f6f1;color:#202b3b;font:16px/1.6 system-ui,sans-serif}header,main{max-width:1480px;margin:auto;padding:32px}h1{font-size:36px;margin:8px 0}header p{max-width:950px;color:#596274}nav{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0 16px}button,input{font:inherit;border:1px solid #d4d9df;border-radius:10px;padding:9px 14px;background:white}button{cursor:pointer}button[aria-pressed=true]{background:#202b3b;color:white}input{width:min(100%,480px)}#count{margin-left:16px;color:#596274}main{padding-top:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(265px,1fr));gap:20px}article{padding:24px;border:1px solid #e1e3e6;border-radius:20px;background:white;display:flex;flex-direction:column}article[hidden]{display:none}img{border-radius:22px;object-fit:cover}span,.source{font-size:13px;color:#737985}article span{margin-top:14px}h2{font-size:20px;margin:6px 0 0}article p{margin:8px 0}footer{display:flex;gap:20px;margin-top:auto;padding-top:18px;font-size:14px}a{color:#325f84}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #4278a8;outline-offset:3px}@media(max-width:600px){header,main{padding:20px}h1{font-size:28px}}</style><header><small>XPERT · ASSISTANT COLLECTION</small><h1>企业 Assistant 模板系列</h1><p>90 个角色 · 8 个分类 · 统一办公人物头像。按公开业务用途编写的 Xpert 功能适配；外部集成与各角色业务执行仍需单独验收。</p><p><a href="avatar-sheet.html">查看全套头像总览 →</a></p><nav aria-label="类别"><button data-category="all" aria-pressed="true">全部</button>${Object.entries(
      categories,
    )
      .map(
        ([k, v]) =>
          `<button data-category="${k}" aria-pressed="false">${v}</button>`,
      )
      .join(
        "",
      )}</nav><input type="search" aria-label="搜索模板" placeholder="搜索中文角色、原模板名称或插件名"><span id="count">90 个模板</span></header><main>${cards}</main><script>let category='all';const search=document.querySelector('input');function filter(){let count=0;document.querySelectorAll('article').forEach(card=>{card.hidden=!(category==='all'||card.dataset.category===category)||!card.dataset.search.includes(search.value.trim().toLowerCase());if(!card.hidden)count++});document.querySelector('#count').textContent=count+' 个模板'}document.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{category=button.dataset.category;document.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));filter()}));search.addEventListener('input',filter)</script></html>`,
  );
  await write(
    join(catalogRoot, "avatar-sheet.html"),
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>90 个企业 Assistant 头像</title><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#f8f6f1;color:#202b3b;font:13px/1.4 system-ui,sans-serif}header{margin-bottom:22px}h1{font-size:28px;margin:0 0 8px}main{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:14px}article{text-align:center;min-width:0}img{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:18px}h2{font-size:12px;margin:7px 0 0;font-weight:600}p{color:#737985;margin:3px 0;font-size:10px;overflow-wrap:anywhere}a{color:#325f84}@media(max-width:700px){main{grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}body{padding:16px}}</style><header><h1>企业 Assistant 头像系列</h1><span>90 个角色 · 8 个分类 · 原创企业办公人物头像</span> · <a href="gallery.html">返回分类画廊</a></header><main>${roles.map((r) => `<article><img src="../../assistants/${r.package}/assets/icon.png" alt="${esc(r.title)}"><h2>${esc(r.title)}</h2><p>${esc(r.source.name)}</p></article>`).join("")}</main></html>`,
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await buildSeries();
