# Spreadsheets Skill Plugin

This Xpert plugin packages the Codex Spreadsheets skill as an installable Xpert skill bundle.

## Included Skill

- `spreadsheets`: create, edit, analyze, visualize, render, and verify spreadsheet artifacts and Google Sheets-targeted workbooks.

## Source

- Converted from `/examples/spreadsheets/26.630.12135`.
- Source Codex plugin version: `26.630.12135`.
- Skill files are preserved as closely as possible for Xpert installation.

## Xpert Packaging

- Bundle manifest: `.xpertai-plugin/plugin.json`
- Skill root: `skills/spreadsheets`
- Xpert component key: `spreadsheets`

## Runtime Requirements

- Required tools: Xpert `SkillsMiddleware.read_skill_file` and `SkillsMiddleware.skill_shell`.
- Compatible shell alternatives: `SandboxShell.sandbox_shell` or builtin `bash.bash_execute`.
- Required runtime: writable workspace filesystem, shell access, workspace dependency runtime, `node`, and `@oai/artifact-tool`.
- Optional runtime for analysis/native output: `python`, `pandas`, `numpy`, `pypdf`, `python-docx`, `reportlab`, and Google Drive spreadsheet import.
