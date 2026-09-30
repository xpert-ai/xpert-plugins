# Native model execution protocol

Version 0.1.0 requires `@xpert-ai/contracts` and `@xpert-ai/plugin-sdk` **3.20.0**. Models explicitly advertise their native protocol in `native_protocols`; the provider returns a server-only transport with its configured credentials and the SDK catalog-pricing callback. Guest keys and URLs cannot replace the configured provider identity. A fetch is one billable attempt, without automatic retries or redirects.

The host separately gates this protocol through its model-execution policy. These changes passed local boundary tests and plugin lifecycle verification. No authorized native provider model was available for real CLI acceptance; keep the protocol off until multi-turn tools, cancellation and usage reconciliation pass against an authorized model.

For this unreleased cross-repository change, first build contracts/plugin-sdk in the host checkout, then run from the plugins root:

```sh
XPERT_PLATFORM_ROOT=/path/to/xpert NX_DAEMON=false corepack pnpm --config.verify-deps-before-run=false --dir xpertai exec nx run @xpert-ai/plugin-anthropic:verify-native --skip-nx-cache
```

The verifier creates an isolated temporary workspace, builds this provider with the fresh SDK, tests native routing/credential isolation/catalog declaration and loads/closes the built plugin through plugin-dev-harness. It sends no real model requests and does not deploy anything.

SDK/contracts 3.20.0 must be published before this plugin. The historical workspace lockfile still pins older development dependencies; after the SDK release, regenerate and review that lockfile and verify a frozen install before publishing. Do not insert nonexistent registry integrity records or machine-specific SDK paths.
