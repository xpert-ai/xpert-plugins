import type { WorkspaceFilesApi } from "@xpert-ai/plugin-sdk";

/** @deprecated Compatibility boundary until the SDK release containing workspace-storage is published.
 * Matches packages/plugin-sdk/src/lib/runtime/capabilities/workspace-storage.ts in the host. */
export interface WorkspaceStorage {
  read(path: string): Promise<Buffer>;
  write(path: string, content: string | Uint8Array): Promise<void>;
  mkdir(path: string): Promise<void>;
  list(path: string): Promise<string[]>;
  remove(path: string): Promise<void>;
  withLock<T>(
    key: string,
    action: () => Promise<T>,
    options?: { waitMs?: number }
  ): Promise<T>;
}
/** @deprecated Remove when the published SDK includes WorkspaceFilesApi.appData. */
export type WorkspaceFilesWithAppData = WorkspaceFilesApi & {
  appData?: (options: { pluginName: string; requireUserIsolation?: boolean }) => WorkspaceStorage;
};

/** Relative path bound to an authorized platform workspace; never an API-host filesystem path. */
export interface StoragePath {
  readonly storage: WorkspaceStorage;
  readonly path: string;
}
export function join(base: StoragePath, ...parts: string[]): StoragePath {
  if (
    parts.some(
      (part) =>
        !part ||
        part.includes("\\") ||
        part.includes("\0") ||
        part.startsWith("/") ||
        part.split("/").some((segment) => segment === ".." || segment === ".")
    )
  )
    throw new Error("unsafe_storage");
  return {
    storage: base.storage,
    path: [base.path, ...parts].filter(Boolean).join("/"),
  };
}
export function readFile(file: StoragePath): Promise<Buffer>;
export function readFile(file: StoragePath, encoding: "utf8"): Promise<string>;
export async function readFile(file: StoragePath, encoding?: "utf8") {
  const bytes = await file.storage.read(file.path);
  return encoding ? bytes.toString(encoding) : bytes;
}
export const atomicWrite = (file: StoragePath, bytes: string | Buffer) =>
  file.storage.write(file.path, bytes);
export const mkdir = (
  dir: StoragePath,
  _options?: { recursive?: boolean; mode?: number }
) => dir.storage.mkdir(dir.path);
export const readdir = (dir: StoragePath) => dir.storage.list(dir.path);
export const rm = (
  file: StoragePath,
  _options?: { recursive?: boolean; force?: boolean }
) => file.storage.remove(file.path);
export const access = async (file: StoragePath) => {
  await file.storage.read(file.path);
};
