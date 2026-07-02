# Documents Skill Plugin

This Xpert plugin packages the Codex Documents skill as an installable Xpert skill bundle.

## Included Skill

- `documents`: create, edit, redline, comment on, render, and verify DOCX or Google Docs-targeted document artifacts.

## Source

- Converted from `/examples/documents/26.630.12135`.
- Source Codex plugin version: `26.630.12135`.
- Skill files are preserved as closely as possible for Xpert installation. Existing source license notices, including `skills/documents/LICENSE.txt`, are retained.

## Xpert Packaging

- Bundle manifest: `.xpertai-plugin/plugin.json`
- Skill root: `skills/documents`
- Xpert component key: `documents`

## Runtime Requirements

- Required tools: Xpert `SkillsMiddleware.read_skill_file` and `SkillsMiddleware.skill_shell`.
- Compatible shell alternatives: `SandboxShell.sandbox_shell` or builtin `bash.bash_execute`.
- Required runtime: writable workspace filesystem, shell access, workspace dependency runtime, `python`, `node`, `python-docx`, and `Pillow`.
- Optional runtime for render verification/native output: `soffice`, `pdfinfo`, `pdftoppm`, `pdf2image`, `reportlab`, and Google Drive document import.
