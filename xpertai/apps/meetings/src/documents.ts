import { Inject, Injectable } from "@nestjs/common";
import {
  CollaborationDocumentProvider,
  CollaborationRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN,
  type AgentMiddlewareRuntimeServiceApi,
  type CollaborationProviderContext,
  type CollaborationMaterializationEvent,
  type ICollaborationDocumentProvider,
  type PluginContext,
} from "@xpert-ai/plugin-sdk";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import * as Y from "yjs";
import {
  CONTEXT,
  documentKindSchema,
  idSchema,
  scopeSchema,
  MeetingError,
  type Scope,
  type DocumentKind,
} from "./domain.js";
import type { Config } from "./config.js";
import { FileStore, atomicWrite } from "./file-store.js";
import { MeetingWorkspaceFiles } from "./workspace-files.js";
import {
  documentFromMarkdown,
  documentMarkdown,
  summaryMarkdown,
} from "./document-markdown.js";

export const DOCUMENT_PROVIDER = "meetings.document";
/** Resource authorization is independent of the transport and document engine.
 * Future meeting members must be resolved here; personal notes remain owner-only. */
export interface MeetingDocumentAccess {
  require(scope: Scope, id: string, kind: DocumentKind): Promise<void>;
}
export function documentResource(context: CollaborationProviderContext) {
  const [id, kind, extra] = context.resourceId.split(":");
  if (extra || context.providerKey !== DOCUMENT_PROVIDER)
    throw new MeetingError("document_invalid");
  return {
    id: idSchema.parse(id),
    kind: documentKindSchema.parse(kind),
    scope: scopeSchema.parse({
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      userId: context.userId,
      assistantId: context.xpertId,
    }),
  };
}
@Injectable()
export class MeetingDocuments {
  readonly store: FileStore;
  readonly access: MeetingDocumentAccess;
  constructor(
    @Inject(CONTEXT) private readonly context: PluginContext<Config>
  ) {
    this.store = new FileStore(
      context.config.dataDirectory,
      new MeetingWorkspaceFiles((scope) => {
        const api = context
          .resolve<AgentMiddlewareRuntimeServiceApi>(
            XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN
          )
          .createScopedApi({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            userId: scope.userId,
            xpertId: scope.assistantId,
            catalog: scope.workspaceCatalog,
            scopeId: scope.assistantId,
            isolateByUser: scope.workspaceCatalog === "user-xperts",
          })
          .capabilities?.get(WorkspaceFilesRuntimeCapability);
        if (!api) throw new MeetingError("workspace_unavailable");
        return api;
      })
    );
    this.access = {
      require: async (scope, id) => {
        await this.store.read(scope, id);
      },
    };
  }
  private api(scope: Scope) {
    const api = this.context
      .resolve<AgentMiddlewareRuntimeServiceApi>(
        XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN
      )
      .createScopedApi({ ...scope, xpertId: scope.assistantId })
      .capabilities?.get(CollaborationRuntimeCapability);
    if (!api) throw new MeetingError("collaboration_unavailable");
    return api;
  }
  async session(scope: Scope, id: string, kind: DocumentKind) {
    await this.access.require(scope, id, kind);
    const meeting = await this.store.read(scope, id);
    if (kind === "summary" && !meeting.summary)
      throw new MeetingError("summary_missing");
    const api = this.api(scope);
    const document = await api.ensureDocument({
      providerKey: DOCUMENT_PROVIDER,
      resourceId: `${id}:${kind}`,
      schemaVersion: 1,
    });
    const state = await api.getDocumentState({ documentId: document.id });
    await this.project(
      scope,
      id,
      kind,
      document.id,
      state.sequenceNumber,
      state.updateBase64
    );
    return {
      session: await api.createSession({
        documentId: document.id,
        access: "write",
      }),
      state: state.updateBase64,
    };
  }
  async update(
    scope: Scope,
    id: string,
    kind: DocumentKind,
    updateBase64: string
  ) {
    await this.access.require(scope, id, kind);
    const binding = (await this.store.read(scope, id)).documents[kind];
    if (!binding) throw new MeetingError("document_not_initialized");
    const api = this.api(scope);
    const state = await api.getDocumentState({ documentId: binding.id });
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, Buffer.from(state.updateBase64, "base64"));
      Y.applyUpdate(doc, Buffer.from(updateBase64, "base64"));
      documentMarkdown(doc);
    } finally {
      doc.destroy();
    }
    const ack = await api.applyUpdate({
      documentId: binding.id,
      updateBase64,
      origin: "meetings:editor",
    });
    return { sequence: ack.sequenceNumber };
  }
  /** Read complete authoritative state before model input, export or destructive operations. */
  async sync(scope: Scope, id: string) {
    const meeting = await this.store.read(scope, id);
    for (const kind of ["notes", "summary"] as const) {
      const binding = meeting.documents[kind];
      if (!binding) continue;
      const state = await this.api(scope).getDocumentState({
        documentId: binding.id,
      });
      await this.project(
        scope,
        id,
        kind,
        binding.id,
        state.sequenceNumber,
        state.updateBase64
      );
    }
  }
  async remove(scope: Scope, id: string) {
    const meeting = await this.store.read(scope, id, true);
    if (meeting.deleted) return;
    for (const binding of Object.values(meeting.documents))
      if (binding)
        await this.api(scope).deleteDocument({ documentId: binding.id });
  }
  async project(
    scope: Scope,
    id: string,
    kind: DocumentKind,
    documentId: string,
    sequence: number,
    state: string
  ) {
    const doc = new Y.Doc();
    let text: string;
    try {
      Y.applyUpdate(doc, Buffer.from(state, "base64"));
      text = documentMarkdown(doc);
    } finally {
      doc.destroy();
    }
    await this.store.locked(scope, id, async (dir) => {
      const m = await this.store.read(scope, id);
      const previous = m.documents[kind];
      if (previous && previous.id !== documentId)
        throw new MeetingError("document_mismatch");
      if (previous && previous.sequence > sequence) return;
      await atomicWrite(join(dir, `${kind}.md`), text);
      if (kind === "notes" && m.notes !== text) {
        m.notes = text;
        m.notesRevision++;
      }
      if (kind === "summary") m.summaryMarkdown = text;
      if (!previous || previous.sequence !== sequence) {
        m.revision++;
        m.updatedAt = new Date().toISOString();
      }
      m.documents[kind] = { id: documentId, sequence };
      await this.store.save(dir, m);
    });
  }
}
@Injectable()
@CollaborationDocumentProvider(DOCUMENT_PROVIDER)
export class MeetingDocumentProvider implements ICollaborationDocumentProvider {
  constructor(private readonly documents: MeetingDocuments) {}
  async authorize(context: CollaborationProviderContext) {
    try {
      const { scope, id, kind } = documentResource(context);
      await this.documents.access.require(scope, id, kind);
      return true;
    } catch {
      return false;
    }
  }
  async initializeDocument(context: CollaborationProviderContext) {
    const { scope, id, kind } = documentResource(context);
    return this.documents.store.locked(scope, id, async (dir) => {
      const m = await this.documents.store.read(scope, id);
      const path = join(dir, "documents", `${kind}.initial.json`);
      try {
        return JSON.parse(await readFile(path, "utf8")) as {
          stateBase64: string;
          schemaVersion: number;
          initialSequence: number;
        };
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          )
        )
          throw error;
      }
      const text =
        kind === "notes"
          ? m.notes
          : m.summaryMarkdown ||
            (m.summary ? summaryMarkdown(m.title, m.summary) : "");
      const doc = documentFromMarkdown(text);
      const initial = {
        stateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
        schemaVersion: 1,
        initialSequence: m.revision,
      };
      doc.destroy();
      await mkdir(join(dir, "documents"), { recursive: true, mode: 0o700 });
      // Immutable migration seed only; the platform owns all subsequent CRDT updates.
      await atomicWrite(path, JSON.stringify(initial));
      return initial;
    });
  }
  async materializeDocument(event: CollaborationMaterializationEvent) {
    const { scope, id, kind } = documentResource(event);
    await this.documents.project(
      scope,
      id,
      kind,
      event.documentId,
      event.sequenceNumber,
      event.stateBase64
    );
  }
}
