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

Requires `@xpert-ai/plugin-sdk` **3.18.7 or later within 3.x**. The plugin imports
`IKeywordAnalyzerStrategy` and `KeywordAnalyzerStrategy` directly from the SDK;
its scoped lifecycle test uses the SDK's `KeywordAnalyzerRegistry`.

The host must also include the knowledgebase keyword analyzer implementation.
Updating the SDK alone does not add analyzer selection or indexing to older hosts.
Deploy the host analyzer implementation before installing the plugin.

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
