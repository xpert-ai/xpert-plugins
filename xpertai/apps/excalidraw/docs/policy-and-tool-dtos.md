# Invocation policy and actionable tool results (0.14.2)

Excalidraw declares `mcp.defaultApprovalMode: 'allow'` for every write tool, including public Artifact sharing. Read tools already default to allow. New or synchronized managed MCP Publications use these declarations when no explicit administrator override exists. Identity, tenant/organization scope, resource access, revision checks and operation receipts still apply. A later administrator override takes precedence.

The host/SDK contract now carries the optional default through decorated tools, native definitions, catalog descriptors, semantic hashes, Publication runtime and management UI. Old plugins retain read/allow, write/confirm and dangerous/deny defaults. Dangerous tools keep their risk annotations; direct execution requires an explicit owner declaration. Manually managed Publications must review changes to their descriptor, while managed Publications adopt a plugin upgrade through normal synchronization.

Bootstrap synchronization now uses the restored tenant/organization scope without impersonating an administrator. It refreshes an existing, scope-checked plugin-owned Toolset and its catalog. Initial installation still uses the authenticated management path. Missing tenant scope is rejected before a query; current administrator policy overrides and existing credentials are preserved.

Public sharing does not request elicitation. The trusted plugin passes `publicLinkAuthorization: 'application_policy'` to the Artifact runtime rather than claiming a fresh user confirmation. This authorization is never accepted in tool arguments. The platform still requires an authenticated file owner and valid scope. Public links remain fixed-version Artifact links with reuse and revocation support.

These changes require paired host contracts/runtime and plugin SDK support. The locally built SDK contains the additions; published SDK 3.18.3 does not. Do not publish this plugin to npm until its dependency range references a released SDK containing these interfaces.

## Output contracts

All 38 tools return explicit allowlisted DTOs on both native MCP and Assistant middleware surfaces. Every successful MCP result includes the same compact JSON in a TextContent block and in structuredContent, as recommended by the MCP backward-compatibility contract. Clients that expose only text can read IDs, revisions, URLs and diagnostics. Image results retain their binary block and add JSON metadata text. Successful mutations omit generic prose; actual changed element IDs are retained for subsequent edits, including all 220 IDs in the largest supported mixed patch. Historical operation receipts are still read through their original storage schema and projected to the current public DTO on retry.

| Tools | Returned information |
| --- | --- |
| All drawing and IR mutations | Success, drawing ID, current scene/IR revision, status; actual change counts where available. Checkpoint creation also returns its version ID/number; publishing returns the share URL. Validation also returns up to 20 targeted issues, total count and next issue offset. Visual review returns its effective decision, attempt and quality run ID. |
| `search_drawings` | Paged drawing identities, titles, kind/status, revisions, version number and nonempty tags. No long descriptions or history. |
| `get_drawing` | Flat drawing summary and element count; optional paged element references with `nextElementOffset`. No automatic history query. |
| `list_versions` | Paged version IDs, numbers, source, summary, date and checkpoint marker. No repeated drawing ID per entry or scene snapshots. |
| `get_scene_item` | One editable element, supported canvas settings, Mermaid source or file metadata. No CRDT seed/nonces/timestamps or private custom data. |
| `list_typography_presets` | Font preset ID/label, Excalidraw family number/name and supported languages. No CSS or fonts from unrelated applications. |
| `template_list` | Template key/version, localized title, category and tags. No preview asset paths. |
| `template_inspect` | Parameter schema, defaults and editable label IDs. No internal builder, full base scene or duplicated examples. |
| `diagram_get` | Drawing ID, IR revision/status and the requested IR. Quality history and file references are read separately. |
| `diagram_get_quality_report` | Paged validation issues and latest review by default. `issueOffset/issueLimit` and `reviewOffset/reviewLimit` expose bounded history. No preview file references. The current quality run ID and attempt remain available for interrupted review workflows. |
| Render submit/get/wait/cancel tools | Job/drawing IDs, input revision, status, kind/format, cursor, terminal marker, available result IDs, the tool to read them, and error/recovery details. |
| `read_preview` | Standard MCP PNG image content plus compact identity/revision/staleness metadata. The same metadata is readable as JSON text; image bytes stay exclusively in the image block. |
| `read_export` | Addressed base64 chunks. File metadata and checksum appear only at offset zero. |

## Client upgrade

Refresh `tools/list` after upgrading. Parent reads no longer wrap entities in `item` or `data`; `get_scene_item.item` remains the explicitly requested scene item. The MCP App consumes the same current schemas. A legacy 2025-11-25 stateless client can execute these tools without elicitation under the default application policy. A deliberate administrator `confirm` override still requires a compatible interactive connection.

Run `scripts/smoke-native-sharing.mjs` against the installed package to verify legacy and modern creation, edits, public sharing, retries, stale revisions, link reuse and cleanup without advertising elicitation capability.

## Local acceptance, 2026-09-06

Version 0.14.0 was packaged and installed on `http://localhost:3333`. The existing Excalidraw Publication was synchronized, and its previous explicit public-sharing `confirm` override was changed to `allow` as requested. All 38 tools now have effective `allow` policy. A subsequent host restart automatically refreshed the bindings without another enable request.

- Plugin build/type checks and 153 tests passed; management UI 15 tests passed; related SDK, contracts, runtime policy, Artifact, catalog and bootstrap scope tests passed.
- `verify:dist`, real tarball extraction checks and `plugin-dev-harness` lifecycle checks passed.
- Real 2025-11-25 and 2026-07-28 requests, neither advertising elicitation, passed create/edit/share/retry/reuse/stale-revision/revoke checks. The successful creation DTO was 102 bytes. Synthetic shares were revoked and drawings archived.
- Real template inspection, IR creation/read/validation/render, paged quality, checkpoint/list and JSON export reads passed. Template inspection returned 934 bytes, validation 173 bytes and the tested quality result 208 bytes. Subsequent export chunks contained only job ID, data and offsets.
- The installed MCP App loaded a real drawing and an authorized PNG with Web Storage blocked. The built App's zoom, pan, fit, theme and locale checks passed.

Sanitized evidence and the local tarball are in `test-output/policy-dto/`. Repeat the compact DTO acceptance with `scripts/smoke-native-dtos.mjs`. Refresh client tool schemas after upgrading; no MCP client protocol upgrade is required for these default direct calls. No npm publication was performed.

## Text-only client repair

Version 0.14.1 removes the placeholder “completed. See structuredContent” response. Transport compatibility and data minimization are separate concerns: the public DTO stays bounded, but required results must be available in both supported channels. The wire response intentionally carries JSON twice for backward compatibility; a client that understands both channels may choose one when constructing model context.

Input schema failures identify JSON Pointer paths, unknown/missing field names, constraint messages and enum options without echoing submitted values. Nested array failures identify their item index. Diagnostics are bounded to 20 issues with total/truncation metadata. Template parameter failures include `/parameters/...` paths. Rejected DiagramIR creation/rendering includes actual validation codes, messages and target IDs; creation failures explicitly state that no drawing/report was persisted. Persisted validation results expose the first issue page and continuation offset.

All 38 tools were reviewed by operation group. Searches and explicit reads retain their existing bounded data; mutations now preserve changed element IDs, failed-operation recovery hints and effective review decisions. Async results identify their kind/format and result-reading tool, including retained Mermaid conversion output after a revision conflict. Internal entities, file paths, CRDT bookkeeping and full history remain excluded.

`scripts/smoke-text-client.mjs` deliberately never reads structuredContent. It verifies old and new protocol connections using text-derived drawing/element/version IDs, public links, field diagnostics, geometry diagnostics, rendering jobs and image metadata.

## 0.14.1 acceptance evidence

The corrected plugin and host adapter were installed on the local API at port 3333. The running host exposes version 0.14.1, 38 tools and the preview App resource.

- Nx plugin build/type checks and 157 tests passed. SDK build and 157 tests passed; the targeted host schema/protocol suites passed 34 tests.
- The largest valid mixed patch (20 additions, 100 updates and 100 deletions) retains every ID in both the durable receipt and the public DTO. Long validation messages remain readable within the declared schema limit, with target IDs preserved.
- `verify:dist`, extracted tarball verification, lifecycle harness and built App interaction checks passed.
- Text-only acceptance passed against 2025-11-25 and 2026-07-28 connections without elicitation. IDs, versions, public links, validation issues, preview jobs/image metadata and export chunks were read exclusively from TextContent. Synthetic links were revoked and drawings archived.
- The tested create result remained 102 bytes, public sharing 166 bytes and successful validation 200 bytes per channel. The second export chunk only returned its job ID, data and offsets.
- The installed App loaded an authorized PNG with Web Storage blocked; its screenshot is in `test-output/mcp/installed-app.png`.

Sanitized text-only evidence and deployment metadata are in `test-output/text-client/`; the repeatable script is `scripts/smoke-text-client.mjs`. These results use the locally built paired host/SDK. No npm publication was performed.

## 0.14.2: one output validation boundary and minimal receipts

DTO functions now project fields without revalidating the entire output. Persisted scene/report parsing remains an explicit trust boundary. Drawing receipts are validated once by the operation store before persistence, and once when an existing receipt is loaded; the receipt builder no longer repeats that check. Input, authorization and revision checks remain unchanged.

The SDK accepts `prepareToolResult(project, recover)` after business execution returns. The normal path projects and validates once in the SDK. It also serializes JSON once for the text fallback, instead of stringifying the same DTO twice. The published MCP JSON Schema remains validated by the protocol runtime; this independent boundary also serves non-decorated tools, while the SDK enforces Zod refinements and conversions that JSON Schema cannot express.

All 38 tools declare a strict union of their normal DTO and a minimal receipt. A projection, output-validation or serialization failure can return:

```json
{
  "resultStatus": "unavailable",
  "errorCode": "tool_result_unavailable",
  "success": true,
  "operationId": "existing-operation-id",
  "drawingId": "known-drawing-id",
  "sceneRevision": 2,
  "message": "The tool returned, but its detailed result is unavailable. The reported business status has not been changed.",
  "nextAction": "Read the returned drawing/job, or retry this call with identical arguments and the same operationId. Do not use a new operationId to recover this result."
}
```

The receipt preserves only known status, identifiers, revisions, version IDs and an already-created share URL. `success` is omitted when the source did not report it, and a reported failure remains false. Invalid identifiers are omitted rather than truncated or replaced. `resultStatus: unavailable` describes result preparation, not a rollback or failed business operation. The fallback itself must pass the declared schema. Business-method exceptions are never converted to a receipt and recovery never reruns the operation.

The Preview App recognizes this receipt, shows an incomplete-result state and does not automatically submit another render. Clients should read the identified resource or retry identical arguments with the same operation ID; never create a fresh write solely to recover a missing response. Normal successful DTOs keep their existing shape. This opt-in SDK addition requires the paired local host; legacy plugins retain their existing behavior.

Validation for 0.14.2: plugin Nx build/type checks and 166 tests passed; SDK build and 164 tests passed; catalog/protocol suites passed 34 tests. Tests cover one SDK validation on the normal path, projection/validation/serialization recovery, failure-status preservation, invalid fallback rejection, no business-method re-execution, and image metadata recovery. The protocol suite verifies that a declared recovery receipt is accepted while arbitrary output is rejected. Dist/tarball checks and the lifecycle harness passed.

The installed API exposes 38 strict recovery unions. `scripts/smoke-recovery-catalog.mjs` validates the actual published schemas, and `scripts/smoke-text-client.mjs` verifies the normal text-only workflow on both protocol generations. The built App test saves `test-output/mcp/app-incomplete-result.png` and verifies that a recovery notification triggers no automatic calls. Local evidence is kept in `test-output/result-recovery/`.
