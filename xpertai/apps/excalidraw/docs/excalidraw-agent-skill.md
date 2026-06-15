# Excalidraw Agent Drawing Skill

Use this skill when an Agent needs to create, update, or manage reviewable Excalidraw diagrams.

## Workflow

1. Identify the drawing purpose, audience, nodes, relationships, and constraints.
2. Search or read an existing drawing before editing it.
3. Save a Mermaid draft for flowcharts and architecture flows when that is the fastest path.
4. Save direct Excalidraw JSON for precise layouts, freeform diagrams, wireframes, or targeted edits.
5. Preserve user edits by patching existing elements when possible.
6. Save each meaningful change as a new version with a short change summary.
7. Report failures with operation, reason, recoverability, and evidence.

## Mermaid Guidance

- Flowcharts are the preferred Mermaid input for editable conversion.
- Other Mermaid diagram types may enter Excalidraw as an image and may be less editable.
- Keep node labels short and stable.
- Avoid relying on unsupported styling when the workbench conversion result must remain editable.
- The workbench auto-previews saved Mermaid drafts as Excalidraw scenes after Agent tool completion, but users still save the converted scene as a reviewed version.

## Excalidraw JSON Guidance

- Use serializable element JSON with stable ids.
- Keep the scene understandable: title area, grouped sections, clear arrows, and short labels.
- Prefer `excalidraw_patch_scene` for small edits and `excalidraw_save_scene_version` for full replacements.
- Do not overwrite `files` or `appState` unless the change requires it.

## Failure Reporting

Call `excalidraw_report_failure` when source material is missing, Mermaid is invalid, requested edits conflict with the current drawing, or generated JSON cannot be made valid enough for review.
