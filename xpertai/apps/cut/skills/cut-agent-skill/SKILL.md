---
name: cut-agent-skill
description: Use for Cut project setup, importing media, revision-safe timeline edits, and routing speech, caption, verification, or export work.
---

# Cut basics

## Route by the requested outcome

Use `cut-speech-editing` for speech cleanup or evidence-backed rough cuts, `cut-captions` for transcription and subtitles, `cut-verification` for checking proposals and results, and `cut-export` for rendering and delivery. Load only the workflow needed for the current step through the available skill reader. These skills are packaged with Cut; if one is unavailable, report the missing skill instead of inventing its workflow.

## Select the installed entry

- Xpert Cut Plugin: read [the Xpert entry](references/xpert.md) for active Workbench selection and native tool/file context.
- Xpert Cut Agent Plugin in Codex or ChatGPT: read [the MCP entry](references/mcp.md) for connection selection, Resource reads and file transfer. Use the connected service; installing this client does not deploy a Cut runtime.

Both entries use these same editing and authorization rules. Read only the applicable entry; if the environment is unknown, inspect the available connection/context before choosing.

## Project and file identity

1. Resolve the exact Cut project through the installed entry. A Cut project ID is never a platform Assistant ID or file owner.
2. Read `cut_get_project` before edits. Use its current revision as `baseRevision`, and pass `expectedRevision` to bounded reads. Follow `availableReads`: tracks, clips, media assets, and paged project resources. Read all pages needed for the requested scope, not the entire IR.
3. Import through `cut_import_media` using the installed entry's authorized file reference or runtime path. Reuse returned references; never fabricate a catalog or pass base64.
4. Use narrow mutations with `changeSummary`. Validate multi-step edits with `cut_apply_batch` before applying. On a conflict, refresh and compare the affected content; never silently overwrite a dirty Workbench or replace the whole project document.
5. Times are seconds. Keep source-media times distinct from project-timeline times. Use media orientation metadata for source facts; preserve clip transforms when changing project settings unless reframing was requested.
6. Create `cut_finalize_version` snapshots only when explicitly requested. Internal revisions are concurrency tokens, not user-visible saved versions.

## Content authorization

Reuse existing user approval for the same edits. Before a write, match the user's instruction to the exact project, affected content/ranges, and operation. An explicit instruction such as deleting specified ranges or committing reviewed captions already authorizes that content change. Inspect evidence and validate it, then proceed without asking the user to approve it again.

A broad outcome such as "make this better" does not approve newly selected destructive cuts. Prepare a concrete proposal with ranges, evidence and impact and ask only for the unresolved decisions. Honor explicit requests to preview or wait. Expanded scope, changed selections or rejected proposals require a new decision. A revision conflict requires re-reading; reuse approval only if the authorized content and effects are still demonstrably identical, and never silently rebase a stale proposal.

Platform authorization is independent: comply with tool confirmation/elicitation, access checks, proposal state and revision CAS. Conversation approval is not a platform approval token and must never bypass those checks.

Completion: report the resulting project ID/revision and actual changes. Report failures with `cut_report_failure`; keep completed writes distinct from pending jobs and unavailable evidence.
