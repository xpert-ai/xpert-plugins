---
name: cut-speech-editing
description: Use for removing speech pauses, filler words, repeated phrases, stutters, exact transcript passages, or planning evidence-backed rough cuts.
---

# Cut speech editing

Load `cut-agent-skill` first for project identity, content authorization and revision rules.

1. Establish the requested categories, intensity, protected content and target length. Reuse explicit choices already supplied. For exact timeline ranges, inspect the affected clips and validate `cut_ripple_delete_ranges` or a batch; keep picture and audio synchronized. Do not reinterpret timeline ranges as source-media timestamps.
2. For content-selected cuts, obtain a successful transcript through `cut-captions`. Read relevant transcript pages and inspect search results with `cut_search_media_segments` and `cut_get_media_segment`. Use actual audio/shot evidence only when available; Workbench analysis requires the visible user workflow. In standalone MCP, transcript-backed cleanup can proceed without inventing background media analysis or requiring Workbench to open.
3. Use `cut_create_speech_cleanup_proposal` with explicit conservative/balanced/aggressive mode and only requested categories or `manualSegmentIds`. Without audio evidence, treat transcript gaps as transcript gaps, not measured silence. For general rough cuts, use `cut_create_edit_proposal` with exact evidence for every item.
4. Inspect the proposal's typed category counts, enabled items, source/project revisions, predicted removed/retained duration and evidence. Apply the base skill's approval rule: already-authorized exact cuts may proceed after validation; newly selected cuts need a concrete content decision. Read proposal resources in MCP or use Workbench diff/preview when available; Workbench is not required merely to repeat an existing approval.
5. Apply with exact project/proposal revisions. Rejected or stale proposals cannot be silently recreated or applied. Preserve the exact applied ranges and their time coordinate system for captions. Add `cut_add_cover` only if requested, after cleanup; retain its duration as the timeline offset.
6. Hand off to `cut-verification`; then `cut-captions` if captions were requested. Completion means successful application and verified duration/content boundaries, not merely proposal creation. Undo uses `cut_revert_edit_proposal` only on an explicit undo request and the exact applied revision.
