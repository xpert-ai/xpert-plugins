# data-xpert analytics documentation

This Mintlify site documents the analytics provider, not ontology authoring or deployment automation.
Use MDX with YAML frontmatter and keep `docs.json` navigation synchronized.

- Distinguish Xpert Dataset/Binding, this provider's transport, and data-xpert's ontology adapters.
- Keep native query semantics in adapter-owned `definition` and Action `inputSchema`.
- Explain current-viewer Actor Token and Assistant/resource authorization without exposing credentials.
- Do not claim that a registered ontology adapter automatically permits a read-only Action.
- Distinguish HTTP fixtures and lifecycle mocks from real SSO and dashboard acceptance.
- Keep machine paths, private receipts and tokens out of the package.
