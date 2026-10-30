# Local acceptance environment

Tested on Windows with Node 22.23.4, platform pnpm 10.24.0, plugin pnpm 8.15.8, PostgreSQL and Redis from the official infrastructure Compose file, and Ollama `deepseek-r1:14b` on the host. API port 3333 and Cloud port 4200 avoid an existing local service on port 3000.

Platform source baseline: `ef5125f1f73f6f30b1ca1e5d90e062c65aa4537e`.
Plugin source baseline: `60794aa72edb1fddffebd5e5d071619b8c29014b`.

The platform checkout is locally patched. The exact source changes are in [platform-windows.patch](platform-windows.patch), applied to the platform repository, separately from this plugin:

Apply this zero-context patch to the baseline platform checkout with `git apply --unidiff-zero <path-to-platform-windows.patch>`. The patch was checked in reverse against the tested checkout.

- Execute the Tailwind Node entry point directly on Windows instead of executing a shell shim.
- Exclude production-inappropriate testing fixtures from the server library build.
- Use the Windows shell for the host deployment command's Corepack shim.
- Defer the dialog service token and class resolution to break a circular Angular import at startup.
- Convert model provider `file:` URLs with Node's `fileURLToPath`, preserving Windows drive letters.

The platform lockfile was regenerated during local dependency installation; it is not included in this plugin PR. `isolated-vm` used its Node 22 prebuilt binary. This records a patched local test environment, not an assertion that untouched upstream main runs on Windows.

The official OpenAI-compatible provider was built from `xpertai/models/openai-compatible` at the plugin baseline. For this local source deployment, TypeScript helpers were inlined, runtime peers remained host supplied, and package scripts/development dependencies and the now-unneeded `tslib` runtime dependency were omitted from the test artifact. Provider behavior and model validation code were unchanged. This avoids the Windows runtime installer's `npm` shim spawn issue. It is an environment fixture, not part of the Support Triage plugin.

The platform's own model connection and the plugin's server model adapter both point to local Ollama. The platform model supports Assistant chat; the adapter handles structured ticket analysis with a bounded timeout. No cloud API key is required for this environment.

Local administrator credentials, JWTs, generated environment files, database contents and installation receipts stay outside this repository. Screenshots contain synthetic customer text only. The real key supplied in the conversation was not used or committed.
