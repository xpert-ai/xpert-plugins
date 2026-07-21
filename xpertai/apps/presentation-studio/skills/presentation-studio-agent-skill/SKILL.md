---
name: presentation-studio-agent-skill
description: Generate, review, collaborate on, version, and export DashiAI presentations through Presentation Studio.
---

# Presentation Studio Workflow

Use this skill for structured presentation generation with the Presentation Studio Workbench.

## Required order

1. Call `presentation_list_themes`; use only a ready built-in or custom theme.
2. If the user asks to create a theme from an external template, call `presentation_prepare_theme` for existing Workspace evidence only when the Workbench has not already prepared it. Preparation does not start a background task. Always pass `source` as an array and keep both discriminators explicit: `sourceMode=single_file` requires exactly one Workspace locator for React, HTML, PPTX, PDF, mixed input, or an image ZIP; `sourceMode=image_files` requires `sourceType=images` and 8-30 separate image locators. Prefer `/workspace/...` paths returned by attachments and parsed-file tools. A legacy host path is accepted only when it belongs to the current conversation under `sessions/<conversationId>/files`; the tool normalizes it to `/workspace/sessions/<conversationId>/files/...`. Never pass arbitrary or cross-conversation host paths, and never join paths into one string. Continue only after preparation succeeds, then call `presentation_open_dashi_theme_generator` exactly once with the returned `themeId`. That tool returns the complete built-in Skill, authoring ZIP, exact `sourcePath`, and recommended generation mode; do not use `skillsMiddleware`, call it with `{}`, or construct/search a `themes/<id>/source` directory. For image/PDF evidence, prefer the explicit `reuse-first` mode: pin complete editable page components from theme01-theme12 and author only the external signature modules. Use `fidelity` only when the user explicitly prioritizes deeper structural reconstruction. Runtime correctness gates remain mandatory. Advance `analyzing` → `generating` → `validating` only when each real stage starts, and register the finalized ZIP. A scaffold result is an internal, non-terminal agent-authoring state: continue implementing every remaining owned JSX module yourself and never ask the user to implement it manually. Theme generation ends only after registration returns `ready`, or after a concrete failure is recorded with `presentation_report_theme_failure`. After a deterministic failure, change the input according to the error or report it; never repeat an identical call.
3. Create a deck with `presentation_create_deck`.
4. Search layouts for each page role with `presentation_search_layouts`.
5. Inspect every selected layout with `presentation_inspect_layouts`. Each call has a hard limit of 8 layouts; split larger selections into sequential batches of at most 8.
6. Register existing workspace media with `presentation_add_asset`; use returned `asset://` values in writable media props.
7. Add slides one at a time with `presentation_add_slide` and obey copy budgets, prop shapes, controls, and count bindings.
8. Re-read the deck after revision conflicts, then use narrow patches.
9. Finalize with `presentation_finalize_deck` only when active slides equal the requested page count.
10. Request HTML, PDF, or PPTX with `presentation_request_export`, then poll `presentation_get_export`.
11. When the user explicitly asks to share the presentation, call `presentation_share_html`. If it returns `status: pending`, poll the returned `exportId` with `presentation_get_export`, then call `presentation_share_html` again. Return its `shareUrl` to the user.

Use one theme per deck and a unique layout per active slide. When authoring props, follow `authoringContract.arrayItemContracts` exactly: every array item may contain only its `allowedKeys`, and top-level copy fields must not be repeated inside array items unless explicitly listed. Never infer a common item schema from another layout. Never reuse default template copy as final content. Binary parsing is allowed only inside the explicit `dashi-theme-generator` workflow for a prepared theme source; normal deck authoring still uses structured content and Workspace file references. Record deck failures through `presentation_report_failure`.

When analyzing template images, use the fixed batches from `evidence-index.json`, inspect no more than 3 images per vision call, and perform exactly one primary inspection per image. Write the findings directly into the external theme spec; once that spec passes its contract check, never restart image analysis. A page may be revisited once only when final visual validation names a concrete mismatch on that page. Never feed an evidence output directory back into `extract-theme-source`, never create versioned retry directories, and never guess a system package-manager command. Quote every shell path. If the fixed inspection budget cannot produce a valid spec, report the failure instead of looping. If a deterministic tool call fails, do not repeat the identical call unchanged; use the error to correct the input or report the concrete failure.

Version creation is explicit: only `presentation_finalize_deck` creates an immutable version. `presentation_request_export` can export a supplied version or an immutable snapshot of the current working revision, but it never creates a version implicitly.

`presentation_share_html` never creates anonymous public access. It reuses an existing valid share link, including a public link previously confirmed by the user in Workbench, or creates a workspace-authorized HTML Artifact link when none exists. Anonymous publication remains an explicit Workbench action.
