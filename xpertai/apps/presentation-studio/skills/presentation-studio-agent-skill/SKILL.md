---
name: presentation-studio-agent-skill
description: Generate, review, collaborate on, version, and export DashiAI presentations through Presentation Studio.
---

# Presentation Studio Workflow

Use this skill for structured presentation generation with the Presentation Studio Workbench.

## Required order

Before creating a deck, call `presentation_list_typography_presets`, choose one managed preset for the audience, theme, and language, and do not invent font URLs.

Before any user-facing answer that lists, counts, names, describes, compares, recommends, previews, or asks the user to choose PPT themes, styles, or templates, call `presentation_list_theme_previews`. This includes questions such as “你有哪些生成ppt的主题”, “有多少主题”, “展示主题”, and “推荐一个PPT风格”. Reproduce its Markdown in the returned order so every theme description is immediately followed by its own preview image. Never send a text-only preliminary theme answer or derive the theme inventory from another tool schema, tool description, memory, or prior conversation.

1. Create a deck with `presentation_create_deck`.
2. Search layouts for each page role with `presentation_search_layouts`.
3. Inspect every selected layout with `presentation_inspect_layouts`. Each call has a hard limit of 8 layouts; split larger selections into sequential batches of at most 8.
4. Register existing workspace media with `presentation_add_asset`; use returned `asset://` values in writable media props.
5. Add slides one at a time with `presentation_add_slide` and obey copy budgets, prop shapes, controls, and count bindings.
6. Re-read the deck after revision conflicts, then use narrow patches.
7. Finalize with `presentation_finalize_deck` only when active slides equal the requested page count.
8. Request HTML, PDF, or PPTX with `presentation_request_export`, then poll `presentation_get_export`.
9. When the user explicitly asks to share the presentation, call `presentation_share_html`. If it returns `status: pending`, poll the returned `exportId` with `presentation_get_export`, then call `presentation_share_html` again. Return its `shareUrl` to the user.

Use one theme per deck and a unique layout per active slide. When authoring props, follow `authoringContract.arrayItemContracts` exactly: every array item may contain only its `allowedKeys`, and top-level copy fields must not be repeated inside array items unless explicitly listed. Never infer a common item schema from another layout. Never reuse default template copy as final content. Do not parse binary documents in this plugin; use structured content and file references already available from Xpert. Record failures through `presentation_report_failure`.

Version creation is explicit: only `presentation_finalize_deck` creates an immutable version. `presentation_request_export` can export a supplied version or an immutable snapshot of the current working revision, but it never creates a version implicitly.

`presentation_share_html` never creates anonymous public access. It reuses an existing valid share link, including a public link previously confirmed by the user in Workbench, or creates a workspace-authorized HTML Artifact link when none exists. Anonymous publication remains an explicit Workbench action.
