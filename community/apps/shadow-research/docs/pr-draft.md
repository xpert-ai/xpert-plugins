# Add a stock research lab with frozen evidence and human confirmation

Researchers can import a frozen market/financial snapshot, create an independent task, ask an Xpert Assistant to inspect evidence and persist four ordered reviews, then confirm the result. Tasks and prior attempts survive reloads; a failed attempt retries the same input without duplicating the task.

The tenant plugin supplies scoped TypeORM persistence, six native middleware tools, an iframe Workbench and an Assistant template. Human confirmation stays outside Agent tools. Server checks reject future evidence, unknown citations, premature decisions and risk-vetoed selections. Missing evidence remains unknown, with abstention allowed.

Real Xpert screenshots, installation instructions, source attribution and limits are in [the plugin README](../README.md). Validation includes six business/persistence tests, exporter regression, lifecycle Mock loading, and actual qwen3.8-flash research saved and confirmed in Xpert. A live HTTP smoke test checks controlled tool failure, idempotent creation, retry identity/fingerprint and anonymous denial. It does not substitute for real model execution.

Platform main tested: 3ddc380ca20373f9113a77411090de3c3da75e37. Plugin main baseline: dfad5423205811b3251628ee9bf59a79a4bcbd87. Exact final worktree commands and unresolved checks are recorded in docs/validation.md before submission.

Limitations: historical bounded input only, incomplete financial coverage, no historical price-series analysis or trading, five-minute execution lease, and no live two-account cross-organization acceptance. Model explanations may overinterpret evidence; a saved result is not a factual or investment-quality certification. No npm publication or platform core change is required.
