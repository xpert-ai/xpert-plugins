import type { SkillSlashCommand, TPromptWorkflow } from '@xpert-ai/contracts'
import { dashboardIcon } from './dashboard-icon'

const context = `Work in the current authorized Assistant/project scope. Use the user's language for the page and response. Read the installed live-dashboard skill through read_skill_file and follow the references relevant to this task. Respect provider policy, access controls and tool schemas. Never change deployment, credentials, Assistant configuration or business-source data.
Resolve source/provider pairs, Artifact IDs, fields and file paths from current tools, not names or previous conversation claims. Use only real query results; no invented business data, targets, thresholds, comparison periods or activity feeds. Keep queries read-only and bounded. Report actual tool failures and diagnosticId when supplied. A missing capability or runtime binding is a blocker, not permission to bypass validation or switch presentation modes.`

const metrics = `Confirm metric definitions, units, time range, grain and join keys from metadata and small real samples. Compute ratios from aggregated numerators and denominators, not sums/averages of percentages. Keep unknown/zero denominators as unavailable, not zero. Check join cardinality and avoid duplicate totals. Use chronological date ordering and comparable complete periods. State freshness and gaps; historical data must not be described as current operations. Avoid exposing unnecessary personal or sensitive row-level fields.`

const discover = `Call dashboard_list_sources first, then dashboard_discover for exact authorized source/provider pairs. Follow returned inspectRequest/nextRequest and query contracts; do not scan unrelated schemas or guess SQL fields. Prefer existing governed definitions. If the requested source is missing, use analytics_definition_connections and analytics_definition_inspect; register a missing definition with analytics_definition_register only when needed for this requested dashboard, then refresh sources. Never duplicate an existing definition or ask the user to supply internal IDs.`

const preview = `Before saving new or changed Bindings, call dashboard_preview or dashboard_preview_binding with the exact final queries and typed default controls in this run. Execute every preview.validation.checks[].suggestedCall with dashboard_test_filter; use observed non-default values and the all-values/null case when applicable. Follow each tool's schema, serialize JSON-string fields correctly, and copy returned bindingJson rather than nesting a Binding inside SQL. Changed queries/defaults need fresh evidence. Use at most eight final Bindings, sharing a query where its metric, grain and filters permit it. Never reuse historical previewIds or hard-code preview rows into the page.`

const receipt = `Save a working draft and require a successful domain receipt with dashboard.artifactId, status "draft" and draftRevision. File writes, an existing resource card or an older published version are not proof of this save. Open the exact saved Artifact to inspect it; do not update an unchanged copy just to verify persistence. Verify real filter changes and refresh where available, distinguishing tool checks from unperformed viewer checks. Return the saved receipt, sources, metric definitions and a short manual acceptance checklist. Formal publication remains a separate human Workbench action.`

const newDashboard = `Create a NEW independent dashboard. Do not modify, rename or replace an existing Artifact, including the currently selected dashboard. Choose a distinct business title. In HTML mode choose an unused workspace-relative named .html path; never reuse an old page just because it has a similar title. Reuse verified source definitions, not an old dashboard's identity. If this run already saved the requested dashboard, keep its Artifact rather than creating a duplicate.`

const automaticTheme = `Choose one useful business theme from the authorized data, prioritizing an operational decision such as delivery delays, inventory backlog, supplier performance or production quality. Compare only a few plausible sources by completeness, freshness, metric clarity and actionable detail; then select the strongest one without repeatedly asking the user to choose. Explain who will use it, which decision it supports and which records require attention. If no source supports a defensible theme, report the missing data instead of making a decorative demo.`

const specifiedTheme = `Use the business theme, audience and question supplied by the user. Translate them into a small coherent set of metrics, trends, comparisons and actionable detail. If the theme is missing or a material business definition is ambiguous, ask one focused question. Do not silently replace the requested theme or data source. Omit unsupported metrics and explain the gap.`

const standard = `Use the STANDARD dashboard definition and native charts/tables/controls with dashboard_create for a new dashboard. Do not author HTML, load ECharts, call dashboard_create_html or convert the dashboard to HTML. Choose only components supported by the current tool schema; express summary metrics with supported charts/tables rather than inventing a KPI-card type. Include a useful time trend, a business-dimension comparison, a bounded detail table (normally at most 50 rows), and supported filters. Bind all views to real queries so filter changes and refresh requery the source.`

const html = `Use a custom HTML dashboard. Call dashboard_libraries and read the installed skill's HTML runtime/lifecycle reference before authoring. Check the actual available libraries and pageRuntime contract; do not assume Browser Runtime is healthy. Author through SandboxFile tools and save a new page with dashboard_create_html. The page must declare const live = window.xpertLiveArtifact, subscribe before await live.ready(), and call live.query(bindingId, typedControls) for initial load and all affected bindings on filter application. Refresh each exact Binding ID with live.refresh(bindingId). Data comes only through these declared bindings, never direct database/REST requests or embedded preview rows. Follow allowed library origins, locks and runtime validation; do not add arbitrary dependencies.`

const design = `Build a polished business workspace, not a wall of large charts. Use a restrained light enterprise theme unless the user supplies another style: quiet page background, clean panels, consistent spacing, readable typography and one main accent. At desktop widths, place three or four meaningful summary metrics above a main trend/comparison area with a narrower attention list; place actionable detail below. Adapt to the actual embedded viewport and stack on narrow widths without clipping. Use compact chart heights, clear units, restrained gridlines, legible tooltips and deliberate whitespace. Attention lists and comparison badges require real evidence; otherwise omit them. Support loading, no-data, error and partial-data states distinctly. Display the effective filters, data period and last successful refresh, never a fabricated refresh timestamp. Keep interactions functional and keyboard accessible.`

const existing = `Use only the explicitly selected dashboard or a uniquely identified target from dashboard_list. Ask for a target if ambiguous; never choose by recency. Call dashboard_open, inspect its presentation.type and read the current definition/editing copy. Preserve Artifact identity, saved Bindings, business semantics and library locks unless the requested change requires changing them. Copy saveArguments and revision fields from the current open result, include the requested/current title, and save real changes with dashboard_update. On revision conflict retain the edits and reconcile with the latest draft; do not overwrite blindly.`

const recovery = `Inspect the actual failed call, its full returned error and the current saved/unsaved state first. A previous response quoting an error is not a fresh execution. If an earlier save outcome is unknown, inspect matching saved Artifacts before attempting creation again. Repair only the evidenced argument, query, filter or page defect. Obtain fresh previews and filter evidence in this run for new/changed Bindings, then retry the appropriate domain save. Do not repeatedly guess. For RUNTIME_UNBOUND, missing tools, permission failures or unavailable Browser Runtime, stop with the precise blocker and preserved file/Artifact references; do not edit infrastructure or downgrade presentation. Report success only from a new successful save receipt.`

type Group = 'standard' | 'html' | 'checks'
type Prompt = {
  name: string
  label: { en_US: string; zh_Hans: string }
  description: { en_US: string; zh_Hans: string }
  group: Group
  argsHint: string
  instructions: string[]
}

function command(prompt: Prompt): SkillSlashCommand {
  return {
    name: prompt.name,
    label: prompt.label,
    description: prompt.description,
    icon: dashboardIcon,
    category: 'live-dashboard',
    kind: 'prompt_workflow',
    workflow: { type: 'prompt_workflow', name: prompt.name, label: prompt.label, description: prompt.description, tags: ['live-dashboard', prompt.group] },
    argsHint: prompt.argsHint,
    action: { type: 'insert_invocation', template: [context, ...prompt.instructions, 'User requirements / 用户需求：', '{{args}}'].join('\n\n') }
  }
}

/** Commands are resolved from the installed middleware, including on existing Assistants. */
const prompts = [
  {
    name: 'dashboard-standard-auto', group: 'standard',
    label: { en_US: 'Standard · Choose a business theme', zh_Hans: '标准看板 · 自动选题新建' },
    description: { en_US: 'Choose a useful theme from real data and create an independent native dashboard.', zh_Hans: '根据数据质量和业务价值选题，新建可筛选、刷新的标准看板。' },
    argsHint: '数据源、使用人群、希望解决的问题、时间范围（可选）',
    instructions: [newDashboard, discover, automaticTheme, metrics, standard, preview, receipt]
  },
  {
    name: 'dashboard-standard-new', group: 'standard',
    label: { en_US: 'Standard · Create for a topic', zh_Hans: '标准看板 · 指定主题新建' },
    description: { en_US: 'Create a native dashboard for a specific business question.', zh_Hans: '围绕指定业务问题设计指标、趋势、对比、明细和筛选。' },
    argsHint: '业务主题、数据源、使用人群、时间范围、必需指标',
    instructions: [newDashboard, specifiedTheme, discover, metrics, standard, preview, receipt]
  },
  {
    name: 'dashboard-standard-improve', group: 'standard',
    label: { en_US: 'Standard · Improve a dashboard', zh_Hans: '标准看板 · 优化已有看板' },
    description: { en_US: 'Improve the selected native dashboard while preserving its identity.', zh_Hans: '调整指定标准看板的图表、指标或筛选，保留原看板身份。' },
    argsHint: '选中的看板或准确名称、需要调整的图表/指标/筛选',
    instructions: [existing, 'Require a standard presentation. If the target is HTML, explain the mismatch rather than converting it. Edit only supported definition fields and omit htmlPath/libraries. Use dashboard_update, not a creation tool.', metrics, preview, receipt]
  },
  {
    name: 'dashboard-standard-recover', group: 'standard',
    label: { en_US: 'Standard · Recover a save', zh_Hans: '标准看板 · 恢复保存' },
    description: { en_US: 'Diagnose a failed native draft save and resume with fresh evidence.', zh_Hans: '定位标准看板保存错误，按本轮真实验证结果恢复草稿保存。' },
    argsHint: '失败工具及原始错误、新建还是修改、目标看板（如有）',
    instructions: [recovery, 'Keep standard mode. For a failed new creation use dashboard_create after checking for an existing successful save. Do not create HTML files or call dashboard_create_html. If the existing target is HTML, report the mismatch instead of converting it.', `Only when recovering an existing Artifact: ${existing}`, metrics, preview, receipt]
  },
  {
    name: 'dashboard-html-auto', group: 'html',
    label: { en_US: 'HTML · Choose a business theme', zh_Hans: 'HTML 看板 · 自动选题新建' },
    description: { en_US: 'Choose an actionable business theme and build a polished independent HTML dashboard.', zh_Hans: '选择有真实业务价值的数据，创建布局精致、可实际使用的 HTML 看板。' },
    argsHint: '数据源、使用人群、业务目标、时间范围、风格（可选）',
    instructions: [newDashboard, discover, automaticTheme, metrics, preview, html, design, receipt]
  },
  {
    name: 'dashboard-html-new', group: 'html',
    label: { en_US: 'HTML · Create for a topic', zh_Hans: 'HTML 看板 · 指定主题新建' },
    description: { en_US: 'Build a custom live HTML page for a specific business decision.', zh_Hans: '围绕指定业务问题制作自定义 HTML 看板，保留真实查询与交互。' },
    argsHint: '业务主题、数据源、使用人群、日期、必需指标、风格/参考图',
    instructions: [newDashboard, specifiedTheme, discover, metrics, preview, html, design, receipt]
  },
  {
    name: 'dashboard-html-style', group: 'html',
    label: { en_US: 'HTML · Style from a reference', zh_Hans: 'HTML 看板 · 参考图片美化' },
    description: { en_US: 'Restyle a selected HTML dashboard using a reference without fabricating business content.', zh_Hans: '参考图片或风格描述美化指定 HTML 看板，保留指标、绑定和功能。' },
    argsHint: '目标 HTML 看板、参考图片或风格描述、希望改善的地方',
    instructions: [existing, 'Require an HTML target. Read the returned htmlPath editing copy and dashboard_libraries runtime contract; save with dashboard_update using that exact editing path. Use the reference for hierarchy, layout, typography and visual rhythm, not its example data, unsupported widgets or invented business events. If no usable reference/style was supplied, ask for the missing input. Preserve query/subscription/filter/refresh behavior and dependency locks for style-only work; do not rebuild unchanged queries or require fresh previews for unchanged Bindings.', design, receipt]
  },
  {
    name: 'dashboard-html-recover', group: 'html',
    label: { en_US: 'HTML · Recover a save', zh_Hans: 'HTML 看板 · 恢复保存' },
    description: { en_US: 'Resume an unsaved HTML candidate or draft using actual validation diagnostics.', zh_Hans: '保留已有页面与真实查询，定位运行校验问题并恢复保存。' },
    argsHint: '失败工具和原始错误、HTML 文件路径、目标看板（如有）',
    instructions: [recovery, 'Keep HTML mode. Read the existing candidate instead of rewriting it. For a new unsaved candidate, use its verified path with dashboard_create_html after checking prior save outcomes. For an existing HTML Artifact, save the current editing copy with dashboard_update. If the target is standard, report the mismatch instead of converting it. Read dashboard_libraries and the skill HTML lifecycle reference before a targeted page repair.', `Only when recovering an existing Artifact: ${existing}`, metrics, preview, receipt]
  },
  {
    name: 'dashboard-explore', group: 'checks',
    label: { en_US: 'Inspect · Explore sources', zh_Hans: '通用检查 · 探索数据源' },
    description: { en_US: 'Inspect available sources and propose useful themes without creating resources.', zh_Hans: '只读检查来源、字段、数据新鲜度，推荐可用的业务主题。' },
    argsHint: '指定来源或业务方向、关注的问题（可选）',
    instructions: ['This is inspection only: do not register definitions, write files, create or update dashboards. Call dashboard_list_sources, inspect relevant contracts with dashboard_discover and use small bounded previews. If a source is missing, inspect available analytics_definition_connections/analytics_definition_inspect without registration.', metrics, 'Return a short source inventory with supported queries, date coverage and gaps, then up to three ranked business themes with audience, decision, useful metrics and readiness. No exhaustive database scan.']
  },
  {
    name: 'dashboard-test-source', group: 'checks',
    label: { en_US: 'Inspect · Test a source', zh_Hans: '通用检查 · 验证查询' },
    description: { en_US: 'Run a minimal real query and filter acceptance for one source.', zh_Hans: '验证一个来源的发现、真实查询、字段映射和筛选链路。' },
    argsHint: '数据源名称、一个业务指标、一个筛选维度（可选）',
    instructions: ['This is a bounded read-only source test: do not register definitions, write files or save dashboards. Resolve the requested source with dashboard_list_sources and dashboard_discover. Preview one minimal real query; inspect field types, units, completeness and actual rows. Test one observed non-default filter and the all-values/null case when supported using dashboard_test_filter. Stop at the first unresolved failure. Report exact tool/error, the step that passed and the remaining gap; provider connectivity alone is not full dashboard acceptance.']
  },
  {
    name: 'dashboard-audit-metrics', group: 'checks',
    label: { en_US: 'Inspect · Audit metric definitions', zh_Hans: '通用检查 · 核对指标口径' },
    description: { en_US: 'Check calculations, grain and comparisons without changing the dashboard.', zh_Hans: '检查分子分母、去重、关联粒度、统计期间与单位。' },
    argsHint: '目标看板或数据源、需要核对的指标及已知业务口径',
    instructions: ['Audit only. Inspect the selected/uniquely identified dashboard with dashboard_open, or resolve the supplied source with dashboard_list_sources/dashboard_discover. Do not register definitions, edit files or save changes. Use bounded independent previews to check the declared calculations against source data.', metrics, 'Return each metric with its actual formula, grain, period, unit, evidence and verdict: verified, incorrect or insufficient evidence. Distinguish business-definition uncertainty from a query defect. Recommend concrete corrections without applying them.']
  },
  {
    name: 'dashboard-verify', group: 'checks',
    label: { en_US: 'Inspect · Verify a saved dashboard', zh_Hans: '通用检查 · 验证筛选与刷新' },
    description: { en_US: 'Verify saved identity, real filters and refresh; distinguish viewer checks from tool evidence.', zh_Hans: '核对保存版本、筛选与刷新，区分真实执行证据和待人工验证项。' },
    argsHint: '目标看板、筛选场景、预期业务结果（可选）',
    instructions: ['Acceptance only. Resolve the exact requested Artifact, open its current saved state with dashboard_open and record its identity/revision. Do not modify files, call save tools, publish or change source data. Preview its saved Bindings with actual defaults and observed alternative filter values; use dashboard_test_filter to validate affected queries and the null/all case. For HTML inspect its saved lifecycle and dependency contract as well. If actual viewer controls can be exercised through available authorized tools, check initial load, apply filters, refresh and reopening. Otherwise mark viewer behavior untested and give at most three manual actions with observable expected results. Do not equate a successful query or resource card with a verified browser interaction.']
  }
] satisfies Prompt[]

export const dashboardPromptWorkflows: SkillSlashCommand[] = prompts.map(command)

/** Separate names keep the host's middleware-first merge from hiding these editable shortcuts. */
export const dashboardWorkspacePrompts: TPromptWorkflow[] = prompts.map((prompt) => ({
  name: `live-${prompt.name}`,
  label: prompt.label.zh_Hans,
  description: prompt.description.zh_Hans,
  icon: dashboardIcon,
  category: 'live-dashboard',
  argsHint: prompt.argsHint,
  template: [context, ...prompt.instructions, 'User requirements / 用户需求：', '{{args}}'].join('\n\n'),
  actionType: 'insert_text',
  tags: ['live-dashboard', prompt.group],
  visibility: 'team'
}))
