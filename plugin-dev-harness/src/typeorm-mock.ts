import path from 'node:path';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

interface DynamicModuleLike {
  module: unknown;
  global?: boolean;
  imports?: unknown[];
  providers?: unknown[];
  exports?: unknown[];
}

interface ProviderLike {
  provide: unknown;
  useValue?: unknown;
  useExisting?: unknown;
  useFactory?: (...args: unknown[]) => unknown;
  inject?: unknown[];
}

interface TypeOrmRuntimeLike {
  DataSource?: unknown;
  Connection?: unknown;
  EntityManager?: unknown;
  getDataSourceToken?: (dataSource?: unknown) => unknown;
  getEntityManagerToken?: (dataSource?: unknown) => unknown;
}

const PACKAGE_SEARCH_IGNORED_DIRS = new Set([
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'node_modules'
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findPackageJsonByName(workspaceRoot: string, packageName: string): string | undefined {
  const pending = [workspaceRoot];

  while (pending.length) {
    const current = pending.shift();
    if (!current) {
      continue;
    }

    const packageJsonPath = path.join(current, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: unknown };
        if (parsed.name === packageName) {
          return packageJsonPath;
        }
      } catch {
        // Keep scanning; malformed package files are not relevant for mock discovery.
      }
    }

    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || PACKAGE_SEARCH_IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      pending.push(path.join(current, entry.name));
    }
  }

  return undefined;
}

function createRuntimeRequire(workspaceRoot: string, pluginName: string) {
  const workspacePackageJson = path.join(workspaceRoot, 'package.json');
  const requireFromWorkspace = createRequire(workspacePackageJson);

  try {
    requireFromWorkspace.resolve('typeorm');
    return requireFromWorkspace;
  } catch {
    const packageJsonPath = findPackageJsonByName(workspaceRoot, pluginName);
    return packageJsonPath ? createRequire(packageJsonPath) : requireFromWorkspace;
  }
}

function loadTypeOrmRuntimeFromWorkspace(
  workspaceRoot: string,
  pluginName: string
): TypeOrmRuntimeLike | undefined {
  const requireFromWorkspace = createRuntimeRequire(workspaceRoot, pluginName);

  let typeormExports: unknown;
  try {
    typeormExports = requireFromWorkspace('typeorm');
  } catch {
    return undefined;
  }

  let nestTypeormExports: unknown;
  try {
    nestTypeormExports = requireFromWorkspace('@nestjs/typeorm');
  } catch {
    nestTypeormExports = undefined;
  }

  const typeormObject = isPlainObject(typeormExports) ? typeormExports : {};
  const nestTypeormObject = isPlainObject(nestTypeormExports) ? nestTypeormExports : {};

  return {
    DataSource: typeormObject.DataSource,
    Connection: typeormObject.Connection,
    EntityManager: typeormObject.EntityManager,
    getDataSourceToken: typeof nestTypeormObject.getDataSourceToken === 'function'
      ? (nestTypeormObject.getDataSourceToken as (dataSource?: unknown) => unknown)
      : undefined,
    getEntityManagerToken: typeof nestTypeormObject.getEntityManagerToken === 'function'
      ? (nestTypeormObject.getEntityManagerToken as (dataSource?: unknown) => unknown)
      : undefined
  };
}

function createQueryBuilderMock() {
  const queryBuilder: Record<string, unknown> = {};
  const chainMethods = [
    'select',
    'addSelect',
    'from',
    'leftJoin',
    'leftJoinAndSelect',
    'innerJoin',
    'innerJoinAndSelect',
    'where',
    'andWhere',
    'orWhere',
    'orderBy',
    'addOrderBy',
    'groupBy',
    'addGroupBy',
    'limit',
    'offset',
    'skip',
    'take',
    'setParameter',
    'setParameters',
    'withDeleted'
  ];

  for (const methodName of chainMethods) {
    queryBuilder[methodName] = () => queryBuilder;
  }

  queryBuilder.getOne = async () => null;
  queryBuilder.getMany = async () => [];
  queryBuilder.getRawOne = async () => null;
  queryBuilder.getRawMany = async () => [];
  queryBuilder.getCount = async () => 0;
  queryBuilder.execute = async () => [];
  queryBuilder.insert = () => queryBuilder;
  queryBuilder.update = () => queryBuilder;
  queryBuilder.delete = () => queryBuilder;

  return queryBuilder;
}

function createRepositoryMock() {
  const repository: Record<string, unknown> = {
    find: async () => [],
    findOne: async () => null,
    findBy: async () => [],
    findOneBy: async () => null,
    count: async () => 0,
    exist: async () => false,
    existBy: async () => false,
    save: async (value: unknown) => value,
    create: (value?: unknown) => value ?? {},
    merge: (...values: unknown[]) => values[0] ?? {},
    upsert: async () => ({ identifiers: [], generatedMaps: [], raw: [] }),
    insert: async () => ({ identifiers: [], generatedMaps: [], raw: [] }),
    update: async () => ({ generatedMaps: [], raw: [], affected: 0 }),
    delete: async () => ({ raw: [], affected: 0 }),
    remove: async (value: unknown) => value,
    softDelete: async () => ({ raw: [], affected: 0 }),
    restore: async () => ({ raw: [], affected: 0 }),
    clear: async () => undefined,
    createQueryBuilder: () => createQueryBuilderMock()
  };

  return new Proxy(repository, {
    get(target, prop, receiver) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return undefined;
      }
      if (Reflect.has(target, prop)) {
        return Reflect.get(target, prop, receiver);
      }
      if (typeof prop === 'string') {
        return () => undefined;
      }
      return undefined;
    }
  });
}

function createEntityManagerMock(
  getRepository: (target: unknown) => unknown
) {
  const manager: Record<string, unknown> = {
    find: async () => [],
    findOne: async () => null,
    save: async (value: unknown) => value,
    insert: async () => ({ identifiers: [], generatedMaps: [], raw: [] }),
    update: async () => ({ generatedMaps: [], raw: [], affected: 0 }),
    delete: async () => ({ raw: [], affected: 0 }),
    remove: async (value: unknown) => value,
    upsert: async () => ({ identifiers: [], generatedMaps: [], raw: [] }),
    transaction: async (cb: unknown) =>
      typeof cb === 'function'
        ? (cb as (manager: unknown) => unknown)(manager)
        : undefined,
    createQueryBuilder: () => createQueryBuilderMock(),
    getRepository: (target: unknown) => getRepository(target)
  };

  return new Proxy(manager, {
    get(target, prop, receiver) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return undefined;
      }
      if (Reflect.has(target, prop)) {
        return Reflect.get(target, prop, receiver);
      }
      if (typeof prop === 'string') {
        return () => undefined;
      }
      return undefined;
    }
  });
}

function createDataSourceMock() {
  const repositories = new Map<unknown, unknown>();
  const getRepository = (target: unknown) => {
    if (!repositories.has(target)) {
      repositories.set(target, createRepositoryMock());
    }
    return repositories.get(target);
  };

  const manager = createEntityManagerMock(getRepository);
  const dataSource: Record<string, unknown> = {
    name: 'default',
    isInitialized: true,
    options: {
      type: 'mock'
    },
    entityMetadatas: [],
    manager,
    initialize: async () => dataSource,
    destroy: async () => undefined,
    getRepository,
    getTreeRepository: (target: unknown) => getRepository(target),
    getMongoRepository: (target: unknown) => getRepository(target),
    createEntityManager: () => manager,
    createQueryRunner: () => ({
      manager,
      connect: async () => undefined,
      getTable: async () => undefined,
      addColumn: async () => undefined,
      createIndex: async () => undefined,
      dropIndex: async () => undefined,
      dropUniqueConstraint: async () => undefined,
      release: async () => undefined,
      startTransaction: async () => undefined,
      commitTransaction: async () => undefined,
      rollbackTransaction: async () => undefined
    }),
    transaction: async (cb: unknown) =>
      typeof cb === 'function'
        ? (cb as (manager: unknown) => unknown)(manager)
        : undefined
  };

  return {
    dataSource,
    manager
  };
}

export function createTypeOrmMockModule(
  workspaceRoot: string,
  pluginName: string
): DynamicModuleLike | undefined {
  const runtime = loadTypeOrmRuntimeFromWorkspace(workspaceRoot, pluginName);
  if (!runtime) {
    return undefined;
  }

  const { dataSource, manager } = createDataSourceMock();
  const providers: ProviderLike[] = [];

  const dataSourceTokens = new Set<unknown>();
  if (runtime.DataSource) {
    dataSourceTokens.add(runtime.DataSource);
  }
  if (runtime.Connection) {
    dataSourceTokens.add(runtime.Connection);
  }
  if (runtime.getDataSourceToken) {
    dataSourceTokens.add(runtime.getDataSourceToken());
    dataSourceTokens.add(runtime.getDataSourceToken('default'));
  }

  const entityManagerTokens = new Set<unknown>();
  if (runtime.EntityManager) {
    entityManagerTokens.add(runtime.EntityManager);
  }
  if (runtime.getEntityManagerToken) {
    entityManagerTokens.add(runtime.getEntityManagerToken());
    entityManagerTokens.add(runtime.getEntityManagerToken('default'));
  }

  for (const token of dataSourceTokens) {
    if (token) {
      providers.push({
        provide: token,
        useValue: dataSource
      });
    }
  }

  for (const token of entityManagerTokens) {
    if (token) {
      providers.push({
        provide: token,
        useValue: manager
      });
    }
  }

  if (!providers.length) {
    return undefined;
  }

  class TypeOrmMockModule {}

  return {
    module: TypeOrmMockModule,
    global: true,
    providers,
    exports: providers.map((provider) => provider.provide)
  };
}
