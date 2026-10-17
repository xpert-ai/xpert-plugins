---
name: workspace-script-dataset
description: Build Python or JavaScript Dataset providers from authorized workspace files and upstream data-source Bindings, then connect them to live dashboards. Use when data requires scripts or the user explicitly requests Python/JavaScript processing.
---

# Workspace script datasets

Use the installed SKILL.md path from the skill catalog with `read_skill_file({"path":"<catalog path>"})`, and resolve reference paths relative to that file.

Read [runtime.md](references/runtime.md) before writing a script or registering its input/output contract. The Assistant needs WorkspaceScriptDataset, SandboxFile and skillsMiddleware with Sandbox enabled; live dashboards additionally need LiveDashboard.

1. Inspect the actual file using `sandbox_read_file`, or discover/preview the actual upstream data source. Do not create fictitious rows to satisfy a requested metric.
2. Create the script with `sandbox_write_file({"file_path":"scripts/sales.py","content":"..."})`; JavaScript uses a `.mjs` file. Read and edit existing files with `sandbox_edit_file` / `sandbox_multi_edit_file`. Use workspace-relative paths; `content` is a string, not an `html` field. No plugin-specific file write/read tools are needed.
3. Implement the runtime's `query(ctx)` contract from the reference. Read input only through declared `ctx.files` / `ctx.sources` aliases. Apply filters from `ctx.parameters` on every execution. There is no arbitrary network access or package installation in Dataset execution.
4. Register the file with `workspace_dataset_register`. Declare language, files, upstream canonical `bindingJson`, parameters and output fields/grain. Registration saves a governed definition; writing a `.py`/`.mjs` file alone does not register it.
5. Default `mode: pinned` snapshots the code while inputs remain live. After code edits, register the new code and update the dashboard Binding through successful previews. `current` intentionally executes the latest registered file; it must be an explicit choice.
6. Copy returned `discoveryRequest` to `dashboard_discover`, and returned `bindingJson` unchanged to `dashboard_preview_binding`. Verify real rows, totals and filters. Do not translate the canonical Binding into the simplified `dashboard_preview` shape.
7. Follow the `live-dashboard` skill for HTML or standard rendering, saving and ongoing edits. The final Binding uses `workspace_script.query` when the user requested script processing; upstream SQL/ontology previews remain inputs, not substitutes.

Script execution remains a governed Sandbox Job even though authoring uses the common SandboxFile tools. File changes, registration receipts and dashboard save receipts prove different steps; report only steps that completed.
