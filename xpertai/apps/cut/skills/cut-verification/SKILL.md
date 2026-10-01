---
name: cut-verification
description: Use to check Cut edit evidence, timeline changes, caption alignment, and exported media against the user request.
---

# Cut verification

Load `cut-agent-skill` first for authorization and revision rules. Verification inspects results; it does not introduce additional edits.

1. Compare the requested scope with the current project overview and bounded track/clip/media/resource reads. Inspect every affected interval and retain before/after duration and changed IDs. Use the current revision consistently; refresh on a conflict.
2. Before applying a proposal, check enabled items, evidence, protected content and expected impact. Reuse approval for the same content under the base rule. A user-requested preview remains a required stop, and newly chosen destructive content needs a decision.
3. After speech edits, check synchronized audio/video, clip source trims, ordering and duration. After captions, check cue timing around every cut, the cover offset, first/last cues, readable placement and translation coverage. Report missing visual/audio evidence rather than claiming playback passed.
4. For exports, a successful render job plus `resultExportId` proves an artifact was produced. Read `cut_list_project_resources` with `resource: exports` for the matching export summary, format, source revision and available metadata, then read the `cut_get_export` Resource for its authorized file reference. If authorized inspection tools are available, probe duration, dimensions, fps and audio presence, decode, sample boundary/subtitle frames, and compare available checksums. Do not invent tools or claim byte/color equivalence from job success alone.
5. Separate source validation, render success, authenticated download and actual playback. If a file cannot be downloaded, report that boundary and the existing export ID instead of rendering again. Never regenerate media merely to collect missing verification evidence.

Completion: give a compact pass/fail/unverified result against the user's requested edits and delivery format, with exact project/job/export IDs and actionable remaining issues. Only apply a corrective edit if it is covered by the user's existing scope or newly authorized.
