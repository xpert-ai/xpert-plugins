# AI collaboration

## Tools and model disclosure

The development assistant was Codex. It supported source reconnaissance, plugin implementation, tests, debugging and delivery documentation. The business AI is the host Xpert Assistant using the demo organization's configured tool-calling Primary Copilot, not a model SDK embedded in this plugin.

Exact coding-model and live provider/model identifiers were not archived in these delivery records. They remain UNKNOWN until the candidate checks the development-session information and host model settings. Do not substitute a guessed model name or publish credentials. This omission is a remaining interview disclosure item, not proof that no real business AI call occurred.

## Representative decisions

### Source reconnaissance before implementation

The candidate supplied the target users, the complaint workflow and the proposed status/result fields, and explicitly required READ -> TRACE -> VERIFY -> PLAN before business coding. Investigation compared the existing procurement App's entities, service, middleware, View and Assistant template, with CRM and Dockyard as narrower references. The Complaint domain and review ownership were developed independently; procurement rules and Dockyard's embedded editor were not made product requirements.

The resulting lesson was to validate the host's actual extension contracts rather than assume a familiar NestJS or model API. The original local Gate-1 notes are not part of this plugin package; the source patterns are mapped in [source-reuse.md](source-reuse.md).

### Failure before a Tool call

Source tracing showed that sending a chat message only acknowledges dispatch; if the model fails before invoking a Tool, a Tool-based failure report cannot execute. The implementation therefore uses the host Assistant Task runtime and reconciles task state in ComplaintAssistantTaskService, with ComplaintCaseService retaining the business state. A plain chat reply is not accepted as structured writeback.

Verification combined mocked start/status failure tests with the user's real FAILED/Retry acceptance. This choice made model failure a recoverable business state, while leaving durable host-crash/timeout recovery outside the MVP.

### Clean dependency verification

An active-workspace build initially hid installation weaknesses. A fresh isolated install exposed missing published contracts/SDK imports and Core/CQRS version selection problems. The candidate requested correction and repeat validation rather than treating the existing workspace as sufficient proof.

The package metadata was tightened using Dockyard's local dependency-remediation precedent. Standalone and fresh community Complaint-targeted build, 27 tests and mock-backed Harness subsequently passed. Nested pnpm settings still have workspace-root scope limitations and peer warnings remain disclosed. See clean-install.md and workspace-verification.md; no global override was added to suppress them.

### Published Assistant and evidence review

Installing a new plugin/template did not automatically change the already published Assistant. Its main prompt was synchronized and published while preserving identity, middleware and Workbench. A new real-model chat stopped requesting internal UUIDs; a separate Workbench regression exercised structured AI results, human draft/save/reload and confirmation/reload.

The candidate supplied the supplemental POST-PUBLISH-025 failure screenshot. It is kept separate from RETRY-021: a different case's final image cannot establish that failure's recovery. Final review also found that linking to screenshot documentation did not satisfy the task's requirement to embed images directly in README; the delivery follow-up closes that documentation gap.

## Human involvement and remaining boundary

The candidate selected the complaint business direction, authorized the scoped Windows host fixes and Git operations, configured/logged into the model/platform, and confirmed normal and Retry behavior. Codex automated implementation/checks and part of the browser regression. These are attributed contributions, not invented quotations from a full transcript.

Generated code and prose are not acceptance evidence by themselves. The evidence consists of source, executed checks, attributed browser/manual results and redacted screenshots. Build, mock lifecycle, real plugin load and real business flow remain different claims. Stock-host validation and exact model disclosure still need completion; this report does not call the product fully production-ready.
