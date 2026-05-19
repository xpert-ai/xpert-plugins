---
'@xpert-ai/plugin-playwright-cli': patch
---

Resolve Playwright CLI commands through the sandbox runtime binary instead of injecting a `PATH=...` shell prefix, while preserving the Chromium `install-browser` bootstrap command.
