---
"@xpert-ai/plugin-code-review": minor
---

Add Project Pipeline reviews with parallel correctness and security checks, finding verification, and explicit human approval before GitHub delivery. Persist scoped review evidence and delivery receipts, and include the pipeline database migration.

Support importing local Git changes through the bundled export script and archiving approved review results without posting to GitHub.

Require published `@xpert-ai/contracts` and `@xpert-ai/plugin-sdk` 3.25.0 or newer, with development dependencies locked to 3.25.0 so clean builds and tests no longer depend on a local platform checkout.
