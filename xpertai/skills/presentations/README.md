# Presentations Skill Plugin

This Xpert plugin packages the Codex Presentations skill as an installable Xpert skill bundle.

## Included Skill

- `presentations`: create, edit, render, verify, and export PowerPoint or Google Slides-targeted presentation decks.

## Source

- Converted from `/examples/presentations/26.630.12135`.
- Source Codex plugin version: `26.630.12135`.
- Skill files are preserved as closely as possible for Xpert installation.

## Xpert Packaging

- Bundle manifest: `.xpertai-plugin/plugin.json`
- Skill root: `skills/presentations`
- Xpert component key: `presentations`

## Runtime Requirements

- Required tools: Xpert `SkillsMiddleware.read_skill_file` and `SkillsMiddleware.skill_shell`.
- Compatible shell alternatives: `SandboxShell.sandbox_shell` or builtin `bash.bash_execute`.
- Required runtime: writable workspace filesystem, shell access, workspace dependency runtime, `node`, `python`, and `@oai/artifact-tool`.
- Optional runtime for richer decks/native output: Graphviz `dot`, `Pillow`, `image_gen`, `image_search`, and Google Drive presentation import.
