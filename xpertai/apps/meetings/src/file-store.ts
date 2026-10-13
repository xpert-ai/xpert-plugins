// The atomic manifest owns meeting metadata/transcript checkpoints. After initialization,
// platform Yjs owns document content; the manifest and Markdown are repairable projections.
// The host authorizes the Assistant workspace and serializes writers before revision checks.
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  join,
  atomicWrite,
  type StoragePath,
  type WorkspaceStorage,
} from "./workspace-storage.js";
export { atomicWrite } from "./workspace-storage.js";
import {
  meetingSchema,
  scopeSchema,
  idSchema,
  MeetingError,
  sameAssistant,
  type Meeting,
  type Scope,
} from "./domain.js";

export const sha256 = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export class FileStore {
  constructor(
    readonly storage: (scope: Scope) => WorkspaceStorage,
    readonly projection?: {
      sync(
        scope: Scope,
        meeting: Meeting,
        directory: StoragePath,
        force?: boolean
      ): Promise<void>;
    }
  ) {}
  ownerPath(scope: Scope): StoragePath {
    scopeSchema.parse(scope);
    return { storage: this.storage(scope), path: "records" };
  }
  directory(scope: Scope, id: string) {
    return join(this.ownerPath(scope), idSchema.parse(id));
  }
  async prepare(scope: Scope, id: string) {
    const directory = this.directory(scope, id);
    await mkdir(directory);
    return directory;
  }
  async locked<T>(
    scope: Scope,
    id: string,
    action: (directory: StoragePath) => Promise<T>
  ): Promise<T> {
    const directory = this.directory(scope, id);
    return directory.storage.withLock(directory.path, async () => {
      await mkdir(directory);
      return action(directory);
    });
  }
  captureDirectory(scope: Scope, captureId: string): StoragePath {
    scopeSchema.parse(scope);
    return {
      storage: this.storage(scope),
      path: `captures/${idSchema.parse(captureId)}`,
    };
  }
  async lockedCapture<T>(
    scope: Scope,
    captureId: string,
    action: (directory: StoragePath) => Promise<T>
  ) {
    const directory = this.captureDirectory(scope, captureId);
    return directory.storage.withLock(directory.path, async () => {
      await mkdir(directory);
      return action(directory);
    });
  }
  withProcessingLock<T>(
    scope: Scope,
    id: string,
    kind: "processing" | "assistant",
    action: () => Promise<T>,
    waitMs = 0
  ) {
    const directory = this.directory(scope, id);
    return directory.storage.withLock(`${directory.path}/${kind}`, action, {
      waitMs,
    });
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
      !sameAssistant(parsed.data.scope, scope) ||
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
  async save(
    scope: Scope,
    directory: StoragePath,
    meeting: Meeting,
    force = false
  ) {
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
        await this.projection.sync(scope, meeting, directory, force);
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
      await this.save(scope, directory, meeting, force);
      return meeting;
    });
  }
  async update(
    scope: Scope,
    id: string,
    change: (meeting: Meeting, directory: StoragePath) => void | Promise<void>
  ) {
    return this.locked(scope, id, async (directory) => {
      const meeting = await this.read(scope, id);
      await change(meeting, directory);
      meeting.revision += 1;
      meeting.updatedAt = new Date().toISOString();
      await this.save(scope, directory, meeting);
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
