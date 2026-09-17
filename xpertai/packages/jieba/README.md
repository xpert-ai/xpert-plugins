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

Requires Xpert's keyword analyzer host implementation and `@xpert-ai/plugin-sdk` **3.19.0 or later within major 3**. Publish the SDK containing `IKeywordAnalyzerStrategy`, `KeywordAnalyzerStrategy` and `KeywordAnalyzerRegistry`, and deploy the host changes before distributing this plugin. SDK 3.18.5 does not contain this interface.

During development, build the updated SDK in `<platform-root>` and link its `packages/plugin-sdk/dist` into this package's local `node_modules/@xpert-ai/plugin-sdk`. Keep local links outside tracked files. Do not replace the workspace-wide SDK used by other plugins.

## Build and test

From `xpertai/`, after dependencies and the compatible SDK are available:

```sh
corepack pnpm exec nx build @xpert-ai/plugin-jieba
corepack pnpm exec nx test @xpert-ai/plugin-jieba
```

From the repository root, run the plugin lifecycle harness:

```sh
node plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @xpert-ai/plugin-jieba --no-mocks
```

Install locally using Xpert's normal plugin installation flow with `source: "code"` and `workspacePath: "<plugin-repo-root>/xpertai/packages/jieba"`. For a distribution package, run `corepack pnpm pack` in this plugin directory after building. Keep native optional dependencies enabled when installing; Jieba selects the binary for the host OS and architecture.
