# Jieba keyword analyzer

`@xpert-ai/plugin-jieba` adds Chinese keyword search segmentation to Xpert knowledgebases. Install it for an organization, then select **Jieba** when creating a knowledgebase or configuring an empty knowledgebase. The host retains its built-in **Basic (Unicode)** analyzer without this plugin.

## Behavior

- Uses `@node-rs/jieba` **2.0.3**, its bundled dictionary, search segmentation and disabled HMM.
- Applies NFKC normalization and lowercase conversion for both indexing and queries.
- Retains ordered terms and repetitions; excludes punctuation-only and whitespace-only tokens.
- Supports Chinese and mixed English text. It does not provide stemming or dictionaries for every language.
- Requires no credentials or mutable plugin configuration. Knowledgebases pin provider `jieba`, its plugin scope and revision `jieba-2.0.3-default-search-nfkc-v1`.
- Documents lock the knowledgebase analyzer. Changing dictionaries, normalization or segmentation requires a new revision. The host rejects incompatible revisions and blocks uninstall while a knowledgebase references this plugin.

The host stores analyzed terms in the existing chunk table and shared GIN index. The plugin does not create PostgreSQL extensions, tables or indexes.

## Compatibility and release order

This plugin is temporarily `private: true` while the keyword analyzer SDK exports
are unpublished. It builds with the published `@xpert-ai/plugin-sdk` 3.18.6 and a
local `keyword-analyzer.sdk.mock.ts` containing the pending interface and decorator.
The decorator preserves the host's strategy metadata; segmentation still uses real
Jieba. This does not add keyword analyzer support to older hosts.

After the SDK exports `IKeywordAnalyzerStrategy`, `KeywordAnalyzerStrategy`, and
`KeywordAnalyzerRegistry`, replace the local mock imports with SDK imports, restore
the registry integration test to the SDK registry, and remove the mock file. Update
the SDK peer range and lockfile, verify the build, tests, and lifecycle harness,
then remove `private: true` and add a release changeset. Deploy the host analyzer
implementation before distributing the plugin.

## Build and test

From `xpertai/`, after installing dependencies:

```sh
corepack pnpm exec nx build @xpert-ai/plugin-jieba
corepack pnpm exec nx test @xpert-ai/plugin-jieba
```

From the repository root, run the plugin lifecycle harness:

```sh
node plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @xpert-ai/plugin-jieba --no-mocks
```

Install locally using Xpert's normal plugin installation flow with `source: "code"` and `workspacePath: "<plugin-repo-root>/xpertai/packages/jieba"`. For a distribution package, run `corepack pnpm pack` in this plugin directory after building. Keep native optional dependencies enabled when installing; Jieba selects the binary for the host OS and architecture.
