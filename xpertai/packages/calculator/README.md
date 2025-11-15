# Xpert Plugin: Calculator

`@xpert-ai/plugin-calculator` is a lightweight calculator toolset plugin for the [Xpert AI](https://github.com/xpert-ai/xpert) intelligent agent platform. It enables agents to create dedicated calculator instances and evaluate mathematical expressions on demand without relying on external services.

## Installation

```bash
pnpm add @xpert-ai/plugin-calculator
# or
npm install @xpert-ai/plugin-calculator
```

> **Note**: This plugin depends on `@xpert-ai/plugin-sdk`, `@nestjs/common@^11`, `@nestjs/config@^4`, `@langchain/core@0.3.72`, `chalk@4.1.2`, and `zod@3.25.67` as peer dependencies. Ensure these packages exist in your host project.

## Quick Start

1. **Install & Build**  
   Add the package to your project and run your build process so the plugin is available to the Xpert runtime.

2. **Register the Plugin**  
   Configure the plugin in your service's plugin registration pipeline (e.g., environment variable or configuration file):

   ```sh .env
   PLUGINS=@xpert-ai/plugin-calculator
   ```

   During startup the plugin exposes the `CalculatorPlugin` NestJS module, registers the calculator toolset, and logs lifecycle messages.

3. **Create Calculator Toolsets for Agents**  
   - In the Xpert Console: add a new Built-in Toolset instance and select `Calculator`.  
   - Via API: request the toolset by name (`calculator`).  

   The toolset does not require credentials—any agent can create and execute instances immediately.

## Calculator Toolset

| Field        | Value                                           |
| ------------ | ----------------------------------------------- |
| Name         | `calculator`                                    |
| Display Name | Calculator / 计算器                              |
| Category     | `tools`                                         |
| Description  | Fast math evaluator for agent workflows         |
| Config       | No configuration or secrets are required        |

Internally, the toolset wraps an `expr-eval` parser so that agents can safely evaluate arithmetic expressions (addition, subtraction, multiplication, division, powers, parentheses, etc.) in a sandboxed runtime.

### Provided Tool

| Tool Name  | Purpose                                                                                         | Input Schema                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| calculator | Evaluate a mathematical expression and return the numeric result as a string for downstream use. | `expression: string` – the expression to compute (examples: `"2 + 2 * 3"`, `"sqrt(2)^2"`, `"sum(1, 2, 3)"`). Invalid inputs return an error note. |

Example tool call payload:

```json
{
  "tool": "calculator",
  "input": {
    "expression": "(1200 / 12) * (1 + 0.075)"
  }
}
```

The tool responds with the computed value or a friendly error message formatted by `getErrorMessage`.

## Permissions & Security

- **No External API Access**: All calculations run locally; no secrets or integration credentials are read.
- **Logging**: The plugin emits lightweight lifecycle logs (`register`, `onStart`, `onStop`) to aid troubleshooting.

This makes the calculator safe to grant broadly across agents since it cannot access user data or external services.

## Development & Debugging

From the repository root:

```bash
npm install
npx nx build @xpert-ai/plugin-calculator
npx nx test @xpert-ai/plugin-calculator
```

Build artifacts are emitted to `packages/calculator/dist`. Ensure compiled output, type declarations, and metadata stay in sync before publishing.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
