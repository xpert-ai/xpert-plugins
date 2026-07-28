# OfficeCLI upstream notice

This plugin integrates the external OfficeCLI binary at runtime.

- Project: OfficeCLI
- Upstream: https://github.com/iOfficeAI/OfficeCLI
- Pinned release: `v1.0.141`
- Upstream license: Apache License 2.0

The OfficeCLI binary is not committed to this repository or included in the npm package. Unless `OFFICECLI_BINARY_PATH` is configured, the plugin downloads the platform-specific asset from the pinned GitHub Release, verifies the SHA-256 digest recorded in `officecli-release.json`, disables OfficeCLI auto-update, and executes it as a bounded child process.
