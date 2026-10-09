// The atomic manifest owns meeting metadata/transcript checkpoints. After migration,
// platform Yjs owns document content; the manifest and Markdown are repairable projections.
// All writers use the same shared POSIX volume and lock before testing revisions.
import {
  mkdir,
  readFile,
  rename,
  open,
  readdir,
  rm,
  lstat,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import lockfile from "proper-lockfile";
import {
  meetingSchema,
  scopeSchema,
  idSchema,
  MeetingError,
  sameOwner,
  type Meeting,
  type Scope,
} from "./domain.js";

export const sha256 = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export async function atomicWrite(path: string, bytes: string | Buffer) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export class FileStore {
  readonly root: string;
  constructor(
    root: string,
    readonly projection?: {
      sync(meeting: Meeting, directory: string, force?: boolean): Promise<void>;
    }
  ) {
    this.root = resolve(root);
  }
  ownerPath(scope: Scope) {
    scopeSchema.parse(scope);
    return join(
      this.root,
      sha256(
        JSON.stringify([scope.tenantId, scope.organizationId, scope.userId])
      )
    );
  }
  directory(scope: Scope, id: string) {
    return join(this.ownerPath(scope), idSchema.parse(id));
  }
  async prepare(scope: Scope, id: string) {
    const directory = this.directory(scope, id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (
      (await lstat(directory)).isSymbolicLink() ||
      (await lstat(this.ownerPath(scope))).isSymbolicLink()
    )
      throw new MeetingError("unsafe_storage");
    return directory;
  }
  async locked<T>(
    scope: Scope,
    id: string,
    action: (directory: string) => Promise<T>
  ): Promise<T> {
    const directory = await this.prepare(scope, id);
    return this.lockDirectory(directory, action);
  }
  captureDirectory(scope: Scope, captureId: string) {
    return join(
      this.ownerPath(scope),
      "captures",
      sha256(scope.assistantId),
      idSchema.parse(captureId)
    );
  }
  async lockedCapture<T>(
    scope: Scope,
    captureId: string,
    action: (directory: string) => Promise<T>
  ) {
    const directory = this.captureDirectory(scope, captureId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if ((await lstat(directory)).isSymbolicLink())
      throw new MeetingError("unsafe_storage");
    return this.lockDirectory(directory, action);
  }
  private async lockDirectory<T>(
    directory: string,
    action: (directory: string) => Promise<T>
  ): Promise<T> {
    let compromised = false;
    const release = await lockfile.lock(directory, {
      realpath: false,
      stale: 120000,
      update: 10000,
      retries: { retries: 12, minTimeout: 20, maxTimeout: 500 },
      onCompromised: () => {
        compromised = true;
      },
    });
    try {
      const result = await action(directory);
      if (compromised) throw new MeetingError("storage_lock_lost");
      return result;
    } finally {
      await release();
    }
  }
  async read(
    scope: Scope,
    id: string,
    includeDeleted = false
  ): Promise<Meeting> {
    let source: string;
    try {
      source = await readFile(
        join(this.directory(scope, id), "meeting.json"),
        "utf8"
      );
    } catch (error) {
      if (isMissing(error)) throw new MeetingError("meeting_not_found");
      throw error;
    }
    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch {
      throw new MeetingError("storage_corrupt");
    }
    const parsed = meetingSchema.safeParse(value);
    if (!parsed.success) throw new MeetingError("storage_corrupt");
    if (
      !sameOwner(parsed.data.scope, scope) ||
      (parsed.data.deleted && !includeDeleted)
    )
      throw new MeetingError("meeting_not_found");
    if (
      scope.workspaceCatalog &&
      parsed.data.scope.workspaceCatalog &&
      scope.workspaceCatalog !== parsed.data.scope.workspaceCatalog
    )
      throw new MeetingError("workspace_scope_changed");
    return parsed.data;
  }
  async save(directory: string, meeting: Meeting, force = false) {
    if (this.projection)
      meeting.workspace = {
        folder: meeting.workspace?.folder ?? null,
        status: "pending",
        errorCode: null,
      };
    await atomicWrite(
      join(directory, "meeting.json"),
      JSON.stringify(meetingSchema.parse(meeting))
    );
    if (this.projection) {
      try {
        await this.projection.sync(meeting, directory, force);
        meeting.workspace!.status = "ready";
      } catch (error) {
        meeting.workspace!.status = "failed";
        meeting.workspace!.errorCode =
          error instanceof MeetingError ? error.code : "workspace_sync_failed";
      }
      await atomicWrite(
        join(directory, "meeting.json"),
        JSON.stringify(meetingSchema.parse(meeting))
      );
    }
  }
  /** Retry durable projections and attach legacy records only from an authorized host scope. */
  async reconcile(scope: Scope, id: string, force = false) {
    const current = await this.read(scope, id, true);
    if (!this.projection) return current;
    if (current.workspace?.status === "ready" && !force) return current;
    return this.locked(scope, id, async (directory) => {
      const meeting = await this.read(scope, id, true);
      meeting.scope.workspaceCatalog ??= scope.workspaceCatalog;
      if (
        scope.workspaceCatalog &&
        meeting.scope.workspaceCatalog !== scope.workspaceCatalog
      )
        throw new MeetingError("workspace_scope_changed");
      await this.save(directory, meeting, force);
      return meeting;
    });
  }
  async update(
    scope: Scope,
    id: string,
    change: (meeting: Meeting, directory: string) => void | Promise<void>
  ) {
    return this.locked(scope, id, async (directory) => {
      const meeting = await this.read(scope, id);
      await change(meeting, directory);
      meeting.revision += 1;
      meeting.updatedAt = new Date().toISOString();
      await this.save(directory, meeting);
      return meeting;
    });
  }
  async list(scope: Scope) {
    let names: string[];
    try {
      names = await readdir(this.ownerPath(scope));
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const records: Meeting[] = [];
    for (const id of names) {
      if (!idSchema.safeParse(id).success) continue;
      try {
        const meeting = await this.read(scope, id, true);
        if (!meeting.deleted) records.push(meeting);
      } catch (error) {
        if (
          !(error instanceof MeetingError && error.code === "meeting_not_found")
        )
          throw error;
      }
    }
    return records.sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
    );
  }
}
