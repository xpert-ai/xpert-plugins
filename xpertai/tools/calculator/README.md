# Xpert Plugin: Calculator

## Overview

`@xpert-ai/plugin-calculator` is a minimal toolset plugin that demonstrates how to extend the XpertAI agent runtime with custom LangChain tools. It registers a NestJS plugin that exposes the `Calculator` toolset strategy, enabling agents to evaluate free-form math expressions during a conversation. Use it as both a ready-to-run calculator helper and a reference implementation when creating your own toolset plugins.

## Features

- Ships a fully wired `CalculatorPlugin` NestJS module that registers the toolset globally during agent bootstrap and logs lifecycle events.
- Implements `CalculatorStrategy`, showcasing multilingual metadata, schema validation hooks, and integration with the XpertAI toolset catalogue.
- Provides `CalculatorToolset`, derived from `BuiltinToolset`, which lazily instantiates LangChain tools and skips credential validation for zero-config scenarios.
- Exposes a single `calculator` tool built with `expr-eval`; it safely parses arithmetic expressions and returns stringified results or human-friendly error messages.
- Includes TypeScript sources, typings, and Jest scaffolding so you can clone the pattern when building richer toolsets.

## Installation

```bash
npm install @xpert-ai/plugin-calculator
```

> **Peer dependencies:** ensure the host environment already provides `@xpert-ai/plugin-sdk`, `@nestjs/common`, `@nestjs/config`, `@langchain/core`, `chalk`, and `zod` in the versions listed in `package.json`.

## Configuration

This plugin has no runtime configuration. The strategy publishes an empty JSON schema, so you can register the toolset without credentials or additional options.

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| _none_ | – | – | The calculator toolset works out of the box. |

## Usage

1. Add the plugin to the `PLUGINS` environment variable so that the XpertAI host loads it:

   ```bash
   PLUGINS=@xpert-ai/plugin-calculator
   ```

2. Create a toolset instance (via the XpertAI admin UI or API) referencing the `calculator` provider:

   ```jsonc
   {
     "provider": "calculator",
     "options": {}
   }
   ```

3. Once attached to an agent, the tool becomes available to the LLM. Provide any valid mathematical expression—`"sqrt(2) * 5"`, `"3/7 + 8"`, `"pow(2, 8)"`, etc.—and the tool returns the computed result. Invalid expressions yield descriptive error text, ensuring the agent can gracefully fall back or ask the user for clarification.

Because the toolset subclasses `BuiltinToolset`, you can review `CalculatorToolset` and `CalculatorStrategy` to understand where to plug in credential validation, multi-tool orchestration, or metadata before implementing your own plugins.

## Development

From the monorepo root (`xpertai/`), use Nx to build or test:

```bash
npx nx build @xpert-ai/plugin-calculator
npx nx test @xpert-ai/plugin-calculator
```

The compiled bundle is emitted to `dist/`, and the Jest suite focuses on the toolset strategy.

## License

MIT – see the repository root `LICENSE`.
