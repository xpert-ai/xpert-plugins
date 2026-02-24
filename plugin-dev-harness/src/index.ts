#!/usr/bin/env node
import 'reflect-metadata';

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createTypeOrmMockModule } from './typeorm-mock.js';

interface CliOptions {
  workspace: string;
  plugin: string;
  configPath?: string;
  verbose: boolean;
  enableMocks: boolean;
}

interface PluginMetaLike {
  name?: string;
  version?: string;
  category?: string;
  [key: string]: unknown;
}

interface PluginSchemaLike {
  safeParse?: (value: unknown) => {
    success: boolean;
    data?: unknown;
    error?: unknown;
  };
  parse?: (value: unknown) => unknown;
}

interface PluginConfigLike {
  schema?: PluginSchemaLike;
  defaults?: Record<string, unknown>;
}

interface NestModuleRefLike {
  get(token: unknown, options?: unknown): unknown;
}

interface DynamicModuleLike {
  module: unknown;
  global?: boolean;
  imports?: unknown[];
  providers?: unknown[];
  exports?: unknown[];
}

interface ApplicationContextLike {
  get(token: unknown, options?: unknown): unknown;
  close(): Promise<void> | void;
}

interface NestRuntimeLike {
  NestFactory: {
    createApplicationContext(
      module: unknown,
      options?: unknown
    ): Promise<ApplicationContextLike>;
  };
  ModuleRef: unknown;
}

interface HarnessPluginContext {
  module: NestModuleRefLike;
  app?: unknown;
  logger: HarnessLogger;
  config: Record<string, unknown>;
  resolve<TInput = unknown, TResult = TInput>(token: unknown): TResult;
}

interface HarnessPlugin {
  meta: PluginMetaLike;
  config?: PluginConfigLike;
  register(ctx: HarnessPluginContext): DynamicModuleLike;
  onInit?(ctx: HarnessPluginContext): Promise<void> | void;
  onStart?(ctx: HarnessPluginContext): Promise<void> | void;
  onStop?(ctx: HarnessPluginContext): Promise<void> | void;
}

interface HarnessLogger {
  child(meta: Record<string, unknown>): HarnessLogger;
  debug(message: string, meta?: unknown): void;
  log(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

function printUsage() {
  // Keep output short and explicit so CI logs stay easy to scan.
  process.stdout.write(
    [
      'Usage:',
      '  node dist/index.js --workspace <path> --plugin <package> [--config <file>] [--verbose] [--no-mocks]',
      '',
      'Required:',
      '  --workspace   Plugin workspace root directory (must contain package.json)',
      '  --plugin      Plugin package name (for example: @xpert-ai/plugin-lark)',
      '',
      'Optional:',
      '  --config      JSON file path for plugin config',
      '  --verbose     Enable debug logs',
      '  --no-mocks    Disable built-in TypeORM/CACHE mock providers',
      ''
    ].join('\n')
  );
}

function parseCliArgs(argv: string[]): CliOptions {
  let workspace = '';
  let plugin = '';
  let configPath: string | undefined;
  let verbose = false;
  let enableMocks = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--workspace': {
        workspace = getFlagValue(argv, i, '--workspace');
        i++;
        break;
      }
      case '--plugin': {
        plugin = getFlagValue(argv, i, '--plugin');
        i++;
        break;
      }
      case '--config': {
        configPath = getFlagValue(argv, i, '--config');
        i++;
        break;
      }
      case '--verbose': {
        verbose = true;
        break;
      }
      case '--no-mocks': {
        enableMocks = false;
        break;
      }
      case '--help':
      case '-h': {
        printUsage();
        process.exit(0);
      }
      default: {
        throw new Error(`Unknown argument: ${arg}`);
      }
    }
  }

  if (!workspace) {
    throw new Error('Missing required argument: --workspace');
  }
  if (!plugin) {
    throw new Error('Missing required argument: --plugin');
  }

  return { workspace, plugin, configPath, verbose, enableMocks };
}

function getFlagValue(argv: string[], index: number, flagName: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flagName}`);
  }
  return value;
}

function resolveWorkspaceRoot(input: string): string {
  const workspaceRoot = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
  const workspacePackageJson = path.join(workspaceRoot, 'package.json');
  if (!existsSync(workspacePackageJson)) {
    throw new Error(
      `Workspace package.json not found: ${workspacePackageJson}`
    );
  }
  return workspaceRoot;
}

function loadNestRuntimeFromWorkspace(workspaceRoot: string): NestRuntimeLike {
  const workspacePackageJson = path.join(workspaceRoot, 'package.json');
  const requireFromWorkspace = createRequire(workspacePackageJson);
  let nestCore: unknown;

  try {
    nestCore = requireFromWorkspace('@nestjs/core');
  } catch (error) {
    throw new Error(
      `Failed to load @nestjs/core from workspace '${workspaceRoot}': ${toErrorMessage(error)}`
    );
  }

  if (!isPlainObject(nestCore)) {
    throw new Error(`Invalid @nestjs/core export loaded from workspace '${workspaceRoot}'.`);
  }

  const NestFactory = nestCore.NestFactory;
  const ModuleRef = nestCore.ModuleRef;
  if (
    !NestFactory ||
    !ModuleRef ||
    !isPlainObject(NestFactory) ||
    typeof NestFactory.createApplicationContext !== 'function'
  ) {
    throw new Error(
      `Workspace '@nestjs/core' does not expose NestFactory.createApplicationContext and ModuleRef.`
    );
  }

  return {
    NestFactory: NestFactory as NestRuntimeLike['NestFactory'],
    ModuleRef
  };
}

function createCacheManagerMock() {
  const store = new Map<string, unknown>();
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => {
      store.set(key, value);
      return undefined;
    },
    del: async (key: string) => {
      store.delete(key);
      return undefined;
    },
    reset: async () => {
      store.clear();
      return undefined;
    },
    wrap: async (key: string, fallback: unknown) => {
      if (store.has(key)) {
        return store.get(key);
      }
      if (typeof fallback === 'function') {
        const value = await (fallback as (...args: unknown[]) => Promise<unknown> | unknown)();
        store.set(key, value);
        return value;
      }
      return undefined;
    }
  };
}

function createCacheMockModule(): DynamicModuleLike {
  class CacheMockModule {}
  return {
    module: CacheMockModule,
    global: true,
    providers: [
      {
        provide: 'CACHE_MANAGER',
        useValue: createCacheManagerMock()
      }
    ],
    exports: ['CACHE_MANAGER']
  };
}

function readJsonObject(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const raw = readFileSync(filePath, 'utf8');
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${toErrorMessage(error)}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`Expected a JSON object in ${filePath}`);
  }

  return parsed;
}

async function loadPluginFromWorkspace(
  workspaceRoot: string,
  pluginName: string
): Promise<{ plugin: HarnessPlugin; resolvedEntry: string }> {
  const workspacePackageJson = path.join(workspaceRoot, 'package.json');
  const requireFromWorkspace = createRequire(workspacePackageJson);
  let resolvedEntry = '';

  try {
    resolvedEntry = requireFromWorkspace.resolve(pluginName);
  } catch (error) {
    throw new Error(
      `Plugin resolve failed for '${pluginName}' from workspace '${workspaceRoot}': ${toErrorMessage(error)}`
    );
  }

  let moduleExports: unknown;
  try {
    moduleExports = await import(pathToFileURL(resolvedEntry).href);
  } catch (error) {
    throw new Error(
      `Plugin import failed for '${pluginName}' (${resolvedEntry}): ${toErrorMessage(error)}`
    );
  }

  const pluginCandidate = extractPluginExport(moduleExports);
  if (!isHarnessPlugin(pluginCandidate)) {
    throw new Error(
      `Module '${pluginName}' does not export a valid plugin. Expected { meta, register(ctx) }.`
    );
  }

  return { plugin: pluginCandidate, resolvedEntry };
}

function extractPluginExport(moduleExports: unknown): unknown {
  if (isPlainObject(moduleExports) && 'default' in moduleExports) {
    return (moduleExports as { default: unknown }).default;
  }
  return moduleExports;
}

function isHarnessPlugin(value: unknown): value is HarnessPlugin {
  if (!isPlainObject(value)) {
    return false;
  }
  const maybePlugin = value as Partial<HarnessPlugin>;
  return isPlainObject(maybePlugin.meta) && typeof maybePlugin.register === 'function';
}

function readConfig(configPath: string | undefined): Record<string, unknown> {
  if (!configPath) {
    return {};
  }
  const absolute = path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);
  return readJsonObject(absolute);
}

function validateConfigWithSchema(
  plugin: HarnessPlugin,
  rawConfig: Record<string, unknown>
): Record<string, unknown> {
  const defaults = isPlainObject(plugin.config?.defaults)
    ? (plugin.config?.defaults as Record<string, unknown>)
    : {};
  const merged = { ...defaults, ...rawConfig };

  const schema = plugin.config?.schema;
  if (!schema) {
    return merged;
  }

  if (typeof schema.safeParse === 'function') {
    const result = schema.safeParse(merged);
    if (result.success) {
      if (isPlainObject(result.data)) {
        return result.data as Record<string, unknown>;
      }
      return merged;
    }
    throw new Error(`Config schema validation failed: ${formatSchemaError(result.error)}`);
  }

  if (typeof schema.parse === 'function') {
    try {
      const parsed = schema.parse(merged);
      if (isPlainObject(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return merged;
    } catch (error) {
      throw new Error(`Config schema validation failed: ${formatSchemaError(error)}`);
    }
  }

  throw new Error(
    "Unsupported plugin config schema. Expected a schema with 'safeParse' or 'parse'."
  );
}

function formatSchemaError(error: unknown): string {
  if (isPlainObject(error) && Array.isArray(error.issues)) {
    const issues = error.issues as Array<{ path?: unknown[]; message?: string }>;
    if (!issues.length) {
      return 'Unknown schema validation error.';
    }
    return issues
      .map((issue) => {
        const pathText = Array.isArray(issue.path) && issue.path.length
          ? issue.path.map(String).join('.')
          : '<root>';
        const message = issue.message || 'Invalid value';
        return `${pathText}: ${message}`;
      })
      .join('; ');
  }
  return toErrorMessage(error);
}

function createHarnessLogger(
  scope: string,
  verbose: boolean,
  baseMeta: Record<string, unknown> = {}
): HarnessLogger {
  const write = (
    level: 'debug' | 'log' | 'warn' | 'error',
    message: string,
    meta?: unknown
  ) => {
    if (level === 'debug' && !verbose) {
      return;
    }

    const mergedMeta = meta === undefined
      ? baseMeta
      : { ...baseMeta, ...(isPlainObject(meta) ? meta : { value: meta }) };
    const metaText = Object.keys(mergedMeta).length
      ? ` ${safeJsonStringify(mergedMeta)}`
      : '';
    const output = `[plugin-dev-harness][${scope}][${level}] ${message}${metaText}`;

    if (level === 'error') {
      console.error(output);
      return;
    }
    if (level === 'warn') {
      console.warn(output);
      return;
    }
    console.log(output);
  };

  return {
    child(meta: Record<string, unknown>): HarnessLogger {
      return createHarnessLogger(scope, verbose, { ...baseMeta, ...meta });
    },
    debug(message: string, meta?: unknown) {
      write('debug', message, meta);
    },
    log(message: string, meta?: unknown) {
      write('log', message, meta);
    },
    warn(message: string, meta?: unknown) {
      write('warn', message, meta);
    },
    error(message: string, meta?: unknown) {
      write('error', message, meta);
    }
  };
}

function createPluginContext(
  pluginName: string,
  config: Record<string, unknown>,
  verbose: boolean
): HarnessPluginContext {
  const context: HarnessPluginContext = {
    module: undefined as unknown as NestModuleRefLike,
    app: undefined,
    logger: createHarnessLogger(`plugin:${pluginName}`, verbose),
    config,
    resolve<TInput = unknown, TResult = TInput>(token: unknown): TResult {
      if (!context.module || typeof context.module.get !== 'function') {
        throw new Error(
          `Plugin '${pluginName}' context is not bound to a Nest module yet.`
        );
      }
      return context.module.get(token, { strict: false }) as TResult;
    }
  };

  return context;
}

function isDynamicModule(value: unknown): value is DynamicModuleLike {
  return isPlainObject(value) && 'module' in value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

async function safeInvoke(
  label: string,
  callback: () => Promise<void> | void
): Promise<void> {
  try {
    await callback();
  } catch (error) {
    console.warn(`[plugin-dev-harness] ${label} failed: ${toErrorMessage(error)}`);
  }
}

async function run(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const workspaceRoot = resolveWorkspaceRoot(options.workspace);
  const nestRuntime = loadNestRuntimeFromWorkspace(workspaceRoot);
  const { plugin, resolvedEntry } = await loadPluginFromWorkspace(workspaceRoot, options.plugin);
  const rawConfig = readConfig(options.configPath);
  const validatedConfig = validateConfigWithSchema(plugin, rawConfig);

  const pluginName = String(plugin.meta.name ?? options.plugin);
  const pluginVersion = String(plugin.meta.version ?? 'unknown');

  console.log(`[plugin-dev-harness] workspace: ${workspaceRoot}`);
  console.log(`[plugin-dev-harness] plugin: ${pluginName}@${pluginVersion}`);
  console.log(`[plugin-dev-harness] entry: ${resolvedEntry}`);
  console.log(`[plugin-dev-harness] mocks: ${options.enableMocks ? 'enabled' : 'disabled'}`);

  const context = createPluginContext(pluginName, validatedConfig, options.verbose);
  let appContext: ApplicationContextLike | undefined;
  let pluginModuleInstance: unknown;
  let dynamicModule: DynamicModuleLike | undefined;

  try {
    dynamicModule = plugin.register(context);
    if (!isDynamicModule(dynamicModule)) {
      throw new Error('plugin.register(ctx) must return a valid DynamicModule.');
    }

    const rootImports: unknown[] = [dynamicModule];
    if (options.enableMocks) {
      rootImports.unshift(createCacheMockModule());
      const typeOrmMockModule = createTypeOrmMockModule(workspaceRoot);
      if (typeOrmMockModule) {
        rootImports.unshift(typeOrmMockModule);
      }
    }

    class HarnessRootModule {}
    const rootModule: DynamicModuleLike = {
      module: HarnessRootModule,
      imports: rootImports
    };

    appContext = await nestRuntime.NestFactory.createApplicationContext(rootModule, {
      logger: options.verbose
        ? ['error', 'warn', 'log', 'debug', 'verbose']
        : ['error', 'warn', 'log']
    });

    context.app = appContext;
    context.module = appContext.get(nestRuntime.ModuleRef, { strict: false }) as NestModuleRefLike;

    if (typeof plugin.onInit === 'function') {
      await plugin.onInit(context);
      console.log('[plugin-dev-harness] onInit completed');
    }
    if (typeof plugin.onStart === 'function') {
      await plugin.onStart(context);
      console.log('[plugin-dev-harness] onStart completed');
    }

    try {
      pluginModuleInstance = appContext.get(dynamicModule.module, { strict: false });
    } catch {
      pluginModuleInstance = undefined;
    }

    if (
      pluginModuleInstance &&
      typeof (pluginModuleInstance as { onPluginBootstrap?: unknown }).onPluginBootstrap === 'function'
    ) {
      await (pluginModuleInstance as { onPluginBootstrap: () => Promise<void> | void }).onPluginBootstrap();
      console.log('[plugin-dev-harness] onPluginBootstrap completed');
    }

    console.log('[plugin-dev-harness] Plugin loaded successfully.');
  } finally {
    if (pluginModuleInstance) {
      await safeInvoke('onPluginDestroy', async () => {
        const maybeDestroy = (pluginModuleInstance as { onPluginDestroy?: unknown }).onPluginDestroy;
        if (typeof maybeDestroy === 'function') {
          await maybeDestroy.call(pluginModuleInstance);
          console.log('[plugin-dev-harness] onPluginDestroy completed');
        }
      });
    }

    await safeInvoke('onStop', async () => {
      if (typeof plugin.onStop === 'function') {
        await plugin.onStop(context);
        console.log('[plugin-dev-harness] onStop completed');
      }
    });

    await safeInvoke('app.close', async () => {
      if (appContext) {
        await appContext.close();
        console.log('[plugin-dev-harness] Application context closed');
      }
    });
  }
}

run().catch((error) => {
  const errorMessage = toErrorMessage(error);
  console.error(`[plugin-dev-harness] ${errorMessage}`);
  if (errorMessage.includes("Cannot find module '@metad/store'")) {
    console.error(
      '[plugin-dev-harness] Hint: use @metad/store 3.6.7 for @xpert-ai/plugin-lark; 3.7.5 is published without runtime build output.'
    );
  }
  if (errorMessage.includes('STATE_VARIABLE_HUMAN')) {
    console.error(
      '[plugin-dev-harness] Hint: Node 22 may fail on @metad/contracts/@xpert-ai/chatkit-types init order. Try Node 20 (npx -y node@20 ...).'
    );
  }
  process.exitCode = 1;
});
