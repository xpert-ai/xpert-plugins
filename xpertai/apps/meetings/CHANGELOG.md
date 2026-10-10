# @xpert-ai/plugin-meetings

## 0.2.0

### Minor Changes

- 7de20bb: Support browser recording through the host audio-capture bridge, with microphone-only or optional shared audio tracks and silence-triggered summaries based on the selected tracks. Requires the corresponding browser audio-capture host and client-command support.

  Refresh the meeting library and detail views, align typography with host theme tokens, and include branded plugin assets. Improve live transcript polling and capture feedback, show saved notes when the collaborative editor cannot connect, and allow manual reconnection. Handle empty collaborative documents and avoid redundant writes for unchanged document snapshots.

### Patch Changes

- f7cf61a: Add the Meetings Agentic App with Desktop recording controls, dual-track live transcription, configurable silence-triggered Assistant summaries, and final meeting minutes. Provide Tiptap/Yjs notes and summaries, history and evidence-linked follow-up tools, and per-meeting Markdown/JSON folders at the Assistant workspace root. Includes existing-record migration, file conflict protection, and integration checks; requires the corresponding Desktop, ChatKit, Assistant task runtime, and workspace file error fixes.

  Publish from the official apps workspace. Localize the View name and provide actionable recording feedback for unsupported hosts, denied audio permissions, and unavailable Desktop connections. Keep recording errors visible in the dialog and preserve the meeting title for retry.

- 42c94b3: Explain Desktop microphone signing, permission-check, and system-audio consent failures separately in English and Chinese, without treating a host command rejection as proof of missing OS permissions.
