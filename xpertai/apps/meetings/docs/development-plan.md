# Meetings implementation plan

The implementation includes waveforms, Tailwind styling, transcription during recording, Tiptap, and platform collaboration. See [live transcription and collaboration](realtime-collaboration.md) for details.

The first release targets the right-hand plugin View in macOS Desktop, reusing the host's ChatKit conversation and Assistant navigation. Its three screens are the meeting library, recording with personal notes, and minutes with transcript evidence. Continuous transcription feeds silence-triggered stage summaries and final minutes, with follow-up questions in the same Assistant conversation. Verification receipts stay outside source control; release gates are listed below.

## Scope

P0 includes manual dual-track capture, persistent recording state and source activity, independently saved personal notes, live transcription, post-meeting refinement and minutes, traceable decisions and suggested actions, paginated search, Markdown export, retries/recovery, private access, English/Chinese localization, and theme support.

Calendar integration, cross-account sharing, multi-user calls, automatic sending, and external task execution are P1. Simulated results must not stand in for production capabilities.

## File-first persistence

User-facing Markdown, transcripts, stage summaries, and history live under `meetings/<date-title-uuid>/` at the Assistant workspace root, outside `sessions/`. See [README](../README.md) for the full layout. The private directory below holds domain state, buffers, recovery copies, and synchronization receipts.

Meetings adds no business tables. The server uses an administrator-configured persistent data directory, and Desktop uses its protected user-data directory. Neither is a public static directory, and no arbitrary-path read API is exposed.

```text
server-data/meetings/<scope-hash>/<meeting-id>/
  meeting.json              # Metadata, transcript checkpoints, document sequences, capture/processing/deletion state
  notes.md                  # Personal notes Markdown projection
  summary.md                # Editable summary Markdown projection
  documents/<kind>.initial.json # Idempotent migration seed
  audio/<track>/<seq>.wav    # Temporary audio
  audio/<track>/<seq>.json   # Chunk interval and SHA-256
  transcript.json           # Completed export; checkpoints live in meeting.json
  summaries/<version>.json  # Generated minutes and transcript evidence
  processing/               # Processing lock target
```

Paths are derived from trusted tenant, organization, and user scope. Records are checked again for ownership. Clients cannot supply scope or server paths. Cross-process file locks protect revision checks and mutations, and temporary files are fsynced before atomic rename. Acknowledgements follow persistence. Workers in shared deployments require the same persistent filesystem with atomic rename and directory locks. Indexes can be rebuilt from metadata; read failures must not masquerade as empty lists. Redis is used through platform Managed Queue, not as the only meeting-content store.

Desktop encrypts audio chunks with random AES-GCM keys wrapped by operating-system `safeStorage`. Cache scope includes server, account, organization, Assistant, and View. Logout or scope changes stop capture, and old cached audio cannot upload under a new account. Chunk hashes support idempotent upload acknowledgements. Acknowledged local delivery clears the local cache, while successful final processing removes server audio. Pending local uploads do not expire automatically. Failed server audio defaults to 7-day retention, cleaned up on library access with an `audio_expired` result retained.

## Repository responsibilities

| Repository | Changes |
| --- | --- |
| xpert | Desktop capture controller, native helper, permissions and packaging, encrypted buffers and recovery, authorized delivery; temporary STT file lifecycle |
| chatkit-js | Generic client-command envelope, View provenance and user-activation context, structured errors, and regression coverage; reuse SDK View data/action transport |
| xpert-plugins | `@xpert-ai/plugin-meetings`, file-backed domain services, queued processing, View provider, React UI, Agent tools, Assistant template, skill, and installation documentation |

The plugin uses a native Extension View fixed Workbench slot, feature activation, manifest client-command allowlists, and the remote-component bridge. It is not a separate full-screen app, and its iframe does not request audio permissions. The plugin declares system level and stable namespace `meetings`; installation scope is selected separately from business organization scope.

## Interfaces and state

Capture commands are `desktop.audio.capture.start`, `desktop.audio.capture.stop`, `desktop.audio.capture.state`, and `desktop.audio.capture.retry`. Starting must follow a user action and host validation of the current Assistant/View. It registers generic delivery callbacks and plugin context. Stop carries the host-generated `captureId`. The main process verifies the owning View and delivers chunks/events; the plugin maintains the capture-to-meeting mapping and idempotent acknowledgements. Public state contains capture phase, `elapsedMs`, source levels, pending chunk count, and stable error codes, without audio, credentials, or file paths.

View queries provide paginated lists and selected meeting details with a bounded transcript. Agent transcript queries paginate independently. Actions handle meeting creation through capture events, notes, title/action edits, processing retries, deletion, and export. Desktop uploads and finalizes through the same authorized View boundary. Views, tools, and background tasks share the file-backed domain services.

Capture, upload, transcription, and minutes have distinct states. `recording` requires successful native capture. Track loss, sleep, exit, and errors stop capture with a recorded reason. Personal notes and summaries are independent Yjs documents. The platform merges concurrent edits, and files project a specific sequence. Legacy revision-based overwrite APIs reject writes after migration. Stale tasks and tasks for deleted or incorrectly scoped meetings cannot commit output.

## Capture and model approach

The initial native helper targets macOS 15+ and captures microphone and system audio separately without storing video frames. Both PCM tracks share a session timeline and produce independently decodable chunks approximately every 5 seconds. Local persistence is confirmed only after encrypted bytes are written. Signed-app permission attribution, source switching, and long recordings remain release acceptance requirements.

Transcription normally uses the Assistant's speech model. `inlineTranscription` takes precedence and uses the platform's scoped runtime with a Base64-capable model such as Tongyi `qwen3-asr-flash`. Adjacent audio is processed in bounded batches with its actual time intervals. If a provider supplies no word timestamps, the UI shows segment-level positions rather than fabricated word alignment.

Summaries run as platform Assistant tasks in the meeting conversation. The model submits strict structured results through plugin tools, and the server validates every evidence quotation. Unknown owners and dates stay null. Unavailable models produce recoverable errors rather than demonstration minutes.

## Implementation order and completion criteria

1. **Contracts and storage:** typed DTOs, strict schemas, file locks and atomic writes, owner isolation, revisions, and deletion tombstones. Verify concurrent writes, cross-user access, traversal rejection, corrupt files, and restart recovery.
2. **Native capture and bridge:** compile the helper and integrate process/lifecycle handling; implement encrypted persistence, sequence/hash checks, idempotent stopping, offline retries, and scope changes. Test with synthetic audio and record real-device results separately.
3. **Processing:** use Managed Queue for transcription and summarization; persist stages, validate sources, bound retries, and clean up successful audio. Cover duplicate delivery, recovery, deletion races, and preservation of human notes.
4. **Production View:** implement the approved screens in one React TSX codebase with shared shadcn/Tailwind and host theme integration. Preview replaces only the adapter. Verify search, recording controls, save conflicts, source inspection, transcript navigation, export, and error states.
5. **Agent and installation:** provide search, minutes/transcript reading, follow-up tools, and the recall skill. Do not expose recording as a model-startable tool. Package the View, template, and skill, then run dist-first plugin-dev-harness lifecycle verification.
6. **Integration:** run relevant cross-repository tests, types, and packaging checks. Validate a representative View Host, including narrow/dark layouts and keyboard access. Use normal installation and real-host checks when authorized local platform access is available. Separate simulated, integrated, and hardware results.

## Release gates

Successful file writes do not establish successful audio capture, and plugin registration does not establish business readiness. Before release, verify dual-track recording in the packaged app, a 2-hour session, 30 minutes of offline recovery, recovery of persisted chunks after a crash, and content quality on representative samples. Report any unperformed long-duration or human-quality checks as unverified. Continue local implementation and automated verification independently of those manual acceptance steps.

## Design inputs

- The three approved right-hand plugin View prototypes replace the earlier standalone-workspace design.
- The user's file-first requirement replaces the earlier proposal for Meetings business entities and tables.
- [Electron audio capture documentation](https://www.electronjs.org/docs/latest/api/desktop-capturer) and [Apple audio capture usage description](https://developer.apple.com/documentation/bundleresources/information-property-list/nsaudiocaptureusagedescription). Native behavior must be verified against the actual SDK build and packaged application.
