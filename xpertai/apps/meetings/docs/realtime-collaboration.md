# Live transcription and collaborative editing

Meetings owns waveform rendering, transcription, editable documents, and meeting workflows. Native capture and the ChatKit command bridge provide generic host capabilities. This document describes the plugin implementation and the boundaries for future shared meetings.

## Implementation and acceptance plan

| Stage | Deliverables | Acceptance criteria |
| --- | --- | --- |
| 1. Visuals and interaction | Tailwind utilities, dual waveforms driven by actual audio levels, horizontal button padding | No business-specific CSS selectors; silent waveforms decay; narrow and dark layouts remain readable; stop-button horizontal padding exceeds vertical padding |
| 2. Live transcription | Enqueue live work after upload; approximately 5-second chunks and durable checkpoints | Text appears before finalization; duplicate uploads do not duplicate transcript segments; failures do not interrupt capture |
| 3. Post-meeting processing | Hand off from live processing, refine adjacent audio batches, then generate minutes | Lock contention cannot lose finalization; final minutes cite refined text; failures retain recoverable checkpoints |
| 4. Collaborative documents | Tiptap, platform Yjs, presence, and Markdown projections | Two-client edits converge; duplicate submissions are idempotent; reconnects recover; exports use acknowledged state |
| 5. Integration | Dist build, type checks, domain tests, lifecycle, and live API/Qwen/UI acceptance | Report simulated, live-service, and hardware evidence separately; synthetic tests do not establish microphone capture |

## UI and audio levels

Each microphone/system waveform displays the latest 36 RMS samples as scrolling bars, updated every 200 ms. Green and purple identify the two sources. Activity is not randomized; after silence scrolls the historical samples out, the waveform returns to its baseline. SVG supplies data geometry only. Tailwind classes control color, spacing, responsive layout, transitions, and reduced motion.

Stylesheets contain only Tailwind imports, source scanning, and host theme-token mappings. They do not define fixed business-specific CSS. Text buttons use spacing such as `px-5 py-2.5`; End recording uses `px-7 py-3`. Summary, notes, and transcript tabs remain accessible during recording, and live transcription can be displayed alongside notes.

## Transcription pipeline

```text
Native Desktop tracks -> encrypted local chunks -> authorized upload -> persisted files -> Managed Queue live task
                                                                                               |
                                                                                               v
                                                                               ASR -> draft transcript -> View refresh
Stopped event -> wait for current chunk -> refine adjacent audio -> validate exact evidence -> Assistant minutes
```

- `TranscriptionEngine` supports the existing Tongyi `qwen3-asr-flash` path. This is continuous recognition of short chunks. The first text must wait for a chunk and the network/model response; it is not word-by-word WebSocket streaming ASR.
- Live segments have `final=false` and are persisted before becoming visible. The same track/sequence may be retried. Silent chunks can yield no text while still advancing processing checkpoints.
- After recording stops, up to 12 adjacent chunks are combined for recognition to avoid words being cut at 5-second boundaries. Refined results atomically replace the covered draft range with `final=true`. Retry reuses completed refinement checkpoints.
- A single-chunk session reuses its recognized text. Older records without a `final` field retain their existing post-meeting interpretation.
- After finalization seals chunk counts, a live worker finishes its current model call and releases the lock; post-meeting processing waits for that handoff. Exhausted queue retries produce a visible failure rather than leaving the meeting permanently queued.
- The UI refreshes active transcripts about every 1.5 seconds. Audio levels use separate 200 ms host-state polling.
- A future streaming ASR implementation can use a separate transcription engine. It must still preserve original audio, stable source IDs, draft/final segments, and reconnect cursors. Provider sessions must not become the authoritative meeting store.

## Documents, files, and versions

Personal notes and summaries are separate `DocumentKind` values using Tiptap StarterKit, Markdown, and Collaboration. Documents use ProseMirror schema v1 in `Y.XmlFragment('body')`.

| Content | Authoritative source | File projection or history |
| --- | --- | --- |
| Meeting metadata, transcript checkpoints, deletion tombstones | File-backed domain service | `meeting.json`, `transcript.json` |
| Migrated editable notes and summaries | Platform Collaboration Yjs | `notes.md`, `summary.md` |
| AI-generated results and evidence | Version files | `summaries/N.json`, `summaries/N.md` |

On first open, the plugin creates a stable initialization seed under the file lock, and the platform uses it to initialize the document. The plugin does not keep a second update log. The legacy overwrite-style notes API rejects writes once migration starts, preventing competing sources of truth.

The platform owns sessions, per-document authorization, Yjs update persistence, WebSockets, Redis propagation across nodes, and presence. The plugin contributes the `meetings.document` provider for resource authorization, schema, migration, and monotonic sequence projection. **Meetings adds no database tables or plugin-specific WebSocket service.** Collaboration updates reuse existing platform storage; business data and Markdown projections continue to use files.

The browser receives a short-lived, single-document session, without platform tokens or tenant/user database IDs. Its collaboration client receives updates and presence; writes go through authorized View action `document.update` to the same platform `applyUpdate` capability. Changes are batched after 300 ms and remain unsaved until server acknowledgement. Failures retain CRDT state in the editor and retry, including when the WebSocket disconnects. Sessions renew before expiry, and switching tabs keeps the editor mounted.

Saving, summary input preparation, and export use complete Yjs state and repair Markdown projections. Projection accepts only the same or a later sequence for the same document. Exports include a content hash and document sequence. AI history records the input notes revision/sequence and content hash.

AI never overwrites personal notes or replaces a summary document already bound for human editing. Regenerated output becomes a separate version. Offline, unacknowledged edits cannot appear saved. Users can download a Markdown draft; returning to the library or exporting waits for acknowledgement. Forcibly terminating the app may lose the last unacknowledged in-memory edits.

## Future multi-user meeting boundaries

Current access remains private: multiple windows of the same user in the same organization may edit together. Presence counts deduplicate the platform's opaque actor identity and separately show other active windows. Collaboration UI does not grant another account access.

Extend these boundaries rather than replacing the editor:

1. Expand `MeetingDocumentAccess` into a resource policy with read/write/manage permissions. Persist and validate meeting members, invitations, and roles separately. Personal notes remain personal; shared summaries use meeting-member authorization.
2. Introduce distinct `MeetingRoom`, `Participant`, and `AudioSource` domain contracts. Bind each upload stream to an authorized member, device source, source sequence, and timeline. Derive identity on the server rather than trusting client-supplied user IDs.
3. Separate room lifecycle from local capture sessions. Join, leave, reconnect, host-ended meetings, and a single device stopping are different events. The current single-device finalization that seals the whole recording cannot represent all of them.
4. Transcription consumes audio events with stable `sourceId` values. Participant attribution comes from authorized sources; acoustic speaker identification remains separate. Do not infer identity from microphone versus system tracks.
5. Keep document synchronization on platform Collaboration. A separate adapter owns multi-user media transport and meeting-join protocols; document WebSockets must not carry audio.
6. Before release, verify member permission matrices, session invalidation after revocation, personal-note isolation, multi-source clock alignment, offline reconnects, propagation across two nodes, and long multi-user sessions under load.

This version does not implement invitations, cross-account sharing, or audiovisual meeting rooms. Document access interfaces, separate document kinds, a transcription-engine interface, and platform collaboration adapters provide extension points without coupling those future capabilities to the recording UI.
