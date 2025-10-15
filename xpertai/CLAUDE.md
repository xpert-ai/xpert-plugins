<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors

<!-- nx configuration end-->

# Plugin System Development Guidelines for XpertAI

The repository contains a **plugin SDK** and multiple **plugin projects**. The SDK defines the standard interfaces, decorators, and lifecycle contracts for building plugins. Plugin developers must follow these conventions.

## 1. Project Structure

- The repository is organized as an **Nx monorepo**.  
- Each plugin is created as a standalone library or application under the `libs/` or `apps/` folder.  
- A typical plugin project includes:
```

libs/plugin-<name>/
├── src/
│   ├── lib/
│   │   ├── *.strategy.ts
│   │   ├── *.service.ts
│   │   ├── *.controller.ts
│   │   └── types.ts
│   ├── index.ts
│   └── plugin.ts
├── project.json
├── tsconfig.json
└── README.md

````

- Always use Nx generators (`nx generate @nx/nest:library ...`) when scaffolding new projects instead of creating directories manually.

## 2. Plugin Fundamentals

- All plugins must implement the `XpertPlugin` interface defined in the SDK.  
- The **entry file** (`plugin.ts`) must export a default `XpertPlugin` object that declares:
- `meta`: Plugin metadata (`name`, `version`, `category`, `icon`, `description`, `keywords`)  
- `config`: A `zod` schema for validating plugin configuration  
- `register`: Returns a NestJS `DynamicModule` to be mounted in the host application  
- Optional lifecycle methods: `onInit`, `onStart`, `onStop`  

Example:
```ts
const plugin: XpertPlugin<MyConfig> = {
meta: { name: '@xpert-ai/plugin-foo', version: '1.0.0', category: 'integration' },
config: { schema: ConfigSchema },
register(ctx) { return { module: FooPlugin, global: true } },
async onStart(ctx) { ctx.logger.log('foo plugin started') }
}
````

## 3. NestJS Module Registration

* Use the `@XpertServerPlugin()` decorator to register plugin providers, controllers, and entities as a NestJS module.
* Example:

```ts
@XpertServerPlugin({
  imports: [ RouterModule.register([{ path: '/foo', module: FooPlugin }]) ],
  providers: [ FooIntegrationStrategy, FooService ],
  controllers: [ FooController ],
  entities: []
})
export class FooPlugin {}
```

## 4. Strategies (Enhancement Points)

Plugins extend the host system via **enhancement points** (strategies).
The SDK currently supports:

### IntegrationStrategy

* Used for **external system integration** (e.g. Firecrawl, OpenAI).
* Must implement the `IntegrationStrategy` interface and provide a `meta` object.
* Decorated with `@IntegrationStrategyKey('<ProviderName>')`.

Example:

```ts
@Injectable()
@IntegrationStrategyKey('Firecrawl')
export class FirecrawlIntegrationStrategy implements IntegrationStrategy<FirecrawlOptions> {
  readonly meta = { name: 'Firecrawl', description: { en_US: '...' } }
  async execute(integration: IIntegration<FirecrawlOptions>, payload: TIntegrationStrategyParams) {
    // implement API call
  }
}
```

### DocumentSourceStrategy

* Used for **data source ingestion** (e.g. crawling, file parsing).
* Must implement `IDocumentSourceStrategy`.
* Decorated with `@DocumentSourceStrategy('<ProviderName>')`.

## 5. Services and Controllers

* Services encapsulate the logic for interacting with external APIs or internal resources.
* Controllers expose plugin-specific REST endpoints (e.g. `/foo/test`).
* Always keep controllers thin and delegate logic to services.

## 6. Configuration and Secrets

* Define plugin config schemas using `zod`.
* Sensitive fields (e.g. API Keys) must use the `ISchemaSecretField` UI component with masking and persistence.
* Example:

```ts
schema: {
  type: 'object',
  properties: {
    apiKey: {
      type: 'string',
      'x-ui': {
        component: 'secretInput',
        label: 'API Key',
        placeholder: 'Enter your API Key',
        revealable: true,
        maskSymbol: '*',
        persist: true
      }
    }
  }
}
```

## 7. Lifecycle and Logging

* Use lifecycle hooks (`onInit`, `onStart`, `onStop`) to manage startup/shutdown tasks.
* Use the provided `PluginLogger` for structured logging instead of `console.log`.
* Example:

```ts
ctx.logger.log('Initializing plugin...')
ctx.logger.error('API request failed', { error })
```

## 8. Health Checks

* Implement `checkHealth` when the plugin depends on external systems.
* Example:

```ts
async checkHealth() {
  try {
    await this.service.ping()
    return { status: 'up' }
  } catch (e) {
    return { status: 'down', details: e.message }
  }
}
```

## 9. Development Workflow

* Always run builds/tests via Nx (`nx build plugin-foo`, `nx test plugin-foo`).
* When modifying multiple plugins, use `nx affected` to re-run only impacted projects.
* Keep plugins independent; avoid cross-imports unless through clearly defined SDK exports.

## 10. Best Practices

* Keep plugin logic **modular** and **decoupled**.
* Validate all external inputs via zod schema.
* Use async/await consistently, and always handle errors.
* Write unit tests for strategies and services.
* Provide README.md in each plugin to describe usage and configuration.

---
