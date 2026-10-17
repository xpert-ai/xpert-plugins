import * as fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import lockfile from "proper-lockfile";
import { FileStore, sha256 } from "../src/file-store.js";
import type { Scope } from "../src/domain.js";
import type {
  StoragePath,
  WorkspaceStorage,
} from "../src/workspace-storage.js";

// Unit-test transport only. The host integration suite exercises authorization,
// Volume containment, atomic writes and multi-process locking with the production implementation.
const roots = new WeakMap<WorkspaceStorage, string>();
export function fixtureStorage(root: string, scope: Scope): WorkspaceStorage {
  const directory = path.join(
    root,
    sha256(
      JSON.stringify([
        scope.tenantId,
        scope.organizationId,
        scope.assistantId,
      ])
    )
  );
  const api: WorkspaceStorage = {
    read: (file) => fs.readFile(path.join(directory, file)),
    async write(file, bytes) {
      const target = path.join(directory, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      const temporary = target + randomUUID() + ".tmp";
      await fs.writeFile(temporary, bytes, { mode: 0o600 });
      await fs.rename(temporary, target);
    },
    async mkdir(file) {
      await fs.mkdir(path.join(directory, file), {
        recursive: true,
        mode: 0o700,
      });
    },
    list: (file) => fs.readdir(path.join(directory, file)),
    remove: (file) =>
      fs.rm(path.join(directory, file), { recursive: true, force: true }),
    async withLock(key, action, options) {
      const lock = path.join(directory, ".locks", sha256(key));
      await fs.mkdir(lock, { recursive: true });
      const release = await lockfile.lock(lock, {
        retries:
          options?.waitMs === 0
            ? 0
            : { retries: 100, minTimeout: 5, maxTimeout: 20 },
      });
      try {
        return await action();
      } finally {
        await release();
      }
    },
  };
  roots.set(api, directory);
  return api;
}
export function join(first: string | StoragePath, ...parts: string[]) {
  if (typeof first === "string") return path.join(first, ...parts);
  const root = roots.get(first.storage);
  if (!root) throw new Error("Unknown fixture workspace");
  return path.join(root, first.path, ...parts);
}
export class TestFileStore extends FileStore {
  constructor(
    root: string,
    projection?: ConstructorParameters<typeof FileStore>[1]
  ) {
    super((scope) => fixtureStorage(root, scope), projection);
  }
}
