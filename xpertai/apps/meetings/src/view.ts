import { Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v3";
import type {
  XpertExtensionViewManifest,
  XpertResolvedViewHostContext,
  XpertViewQuery,
  XpertViewDataResult,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertRemoteComponentViewSchema,
} from "@xpert-ai/contracts";
import {
  ViewExtensionProvider,
  renderRemoteReactIframeHtml,
  type IXpertViewExtensionProvider,
  type XpertViewFileActionFile,
} from "@xpert-ai/plugin-sdk";
import { MeetingsBackend } from "./backend.js";
import {
  documentKindSchema,
  FEATURE,
  PROVIDER,
  PLUGIN,
  VIEW,
  scopeSchema,
  notesSchema,
  idSchema,
  summarySchema,
  MeetingError,
} from "./domain.js";

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans });
import {
  captureCommands,
  captureEventSchema,
  captureChunkSchema,
} from "./capture-contract.js";
export { captureCommands } from "./capture-contract.js";
const selectionSchema = z.object({ meetingId: idSchema }).strict();
const editSchema = z
  .object({
    meetingId: idSchema,
    expectedRevision: z.number().int().positive(),
    title: z.string().trim().min(1).max(200).optional(),
    actions: summarySchema.shape.actions.optional(),
  })
  .strict();
export function scopeFromView(c: XpertResolvedViewHostContext) {
  const files = c.runtimeScope?.workspaceFiles;
  if (files && (files.catalog === "projects" || files.scopeId !== c.hostId))
    throw new MeetingError("assistant_workspace_required");
  return scopeSchema.parse({
    tenantId: c.tenantId,
    organizationId: c.organizationId,
    userId: c.userId,
    assistantId: c.hostId,
    workspaceCatalog: files?.catalog,
  });
}
function failure(error: unknown): XpertViewActionResult {
  return {
    success: false,
    refresh: false,
    data: {
      code:
        error instanceof MeetingError
          ? error.code
          : error instanceof z.ZodError
          ? "invalid_input"
          : "operation_failed",
    },
  };
}

@Injectable()
@ViewExtensionProvider(PROVIDER)
export class MeetingsView implements IXpertViewExtensionProvider {
  constructor(private readonly backend: MeetingsBackend) {}
  supports(context: XpertResolvedViewHostContext) {
    return context.hostType === "agent";
  }
  getViewManifests(
    context: XpertResolvedViewHostContext,
    slot: string
  ): XpertExtensionViewManifest[] {
    if (!["agent.workbench.fixed", "agent.workbench.main"].includes(slot))
      return [];
    return [
      {
        key: VIEW,
        title: text("Meetings", "会议记录"),
        hostType: "agent",
        slot,
        order: 30,
        activation: { requiredFeatures: [FEATURE] },
        source: { provider: PROVIDER, plugin: PLUGIN },
        refreshable: true,
        ...(slot === "agent.workbench.fixed"
          ? {
              workbench: {
                fixed: true,
                menu: {
                  enabled: true,
                  label: text("Meetings", "会议记录"),
                  order: 30,
                },
              },
            }
          : {}),
        view: {
          type: "remote_component",
          runtime: "react",
          protocolVersion: 1,
          component: { isolation: "iframe", entry: "meetings" },
          dataSource: { mode: "platform" },
        },
        dataSource: {
          mode: "platform",
          querySchema: {
            supportsSearch: true,
            supportsPagination: true,
            supportsSelection: true,
            supportsParameters: true,
            defaultPageSize: 20,
          },
          cache: { enabled: false },
        },
        clientCommands: [...captureCommands, "workbench.navigation.open"].map(
          (key) => ({
            key,
            label: text(key, key),
          })
        ),
        actions: [
          ...[
            "capture.event",
            "notes",
            "edit",
            "retry",
            "delete",
            "export",
            "document.session",
            "document.sync",
            "document.update",
            "workspace.sync",
          ].map((key) => ({
            key,
            label: text(key, key),
            actionType: "invoke" as const,
          })),
          {
            key: "capture.chunk",
            label: text("Upload audio", "上传音频"),
            actionType: "invoke",
            transport: "file",
          },
        ],
        parameters: [
          { key: "tab", type: "string", label: text("Tab", "页签") },
          { key: "captureId", type: "string", label: text("Capture", "录音") },
        ],
      },
    ];
  }
  async getRemoteComponentEntry(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    component: XpertRemoteComponentViewSchema["component"]
  ) {
    if (viewKey !== VIEW || component.entry !== "meetings")
      throw new MeetingError("view_not_found");
    const root = join(
      dirname(fileURLToPath(import.meta.url)),
      "remote-components",
      "meetings"
    );
    const [appScript, appCss] = await Promise.all([
      readFile(join(root, "app.js"), "utf8"),
      readFile(join(root, "app.css"), "utf8"),
    ]);
    return {
      html: renderRemoteReactIframeHtml({
        title: context.locale?.toLowerCase().startsWith("zh")
          ? "会议记录"
          : "Meetings",
        reactUmd: "",
        reactDomUmd: "",
        appScript,
        appCss,
      }),
      contentType: "text/html; charset=utf-8" as const,
    };
  }
  async getViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery
  ): Promise<XpertViewDataResult> {
    if (viewKey !== VIEW) throw new MeetingError("view_not_found");
    const scope = scopeFromView(context);
    if (query.parameters?.captureId)
      return {
        items: [],
        meta: {
          capture: await this.backend.captures.lookup(
            scope,
            idSchema.parse(query.parameters.captureId)
          ),
        },
      };
    if (query.selectionId)
      return {
        items: [],
        meta: {
          detail: await this.backend.meetings.get(
            scope,
            idSchema.parse(query.selectionId)
          ),
        },
      };
    const parsed = z
      .object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(20),
        search: z.string().max(200).optional(),
      })
      .parse({
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
      });
    return this.backend.meetings.list(scope, parsed);
  }
  async executeViewAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    key: string,
    request: XpertViewActionRequest
  ): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== VIEW) throw new MeetingError("view_not_found");
      const scope = scopeFromView(context),
        service = this.backend.meetings;
      let data: object;
      switch (key) {
        case "workspace.sync": {
          const { meetingId } = selectionSchema.parse(request.input);
          await this.backend.documents.sync(scope, meetingId);
          const meeting = await service.store.reconcile(scope, meetingId, true);
          if (meeting.workspace?.status !== "ready")
            throw new MeetingError(
              meeting.workspace?.errorCode ?? "workspace_sync_failed"
            );
          data = await service.get(scope, meetingId);
          break;
        }
        case "document.update": {
          const input = z
            .object({
              meetingId: idSchema,
              kind: documentKindSchema,
              updateBase64: z
                .string()
                .min(1)
                .max(2000000)
                .regex(/^[A-Za-z0-9+/]*={0,2}$/),
            })
            .strict()
            .parse(request.input);
          data = await this.backend.documents.update(
            scope,
            input.meetingId,
            input.kind,
            input.updateBase64
          );
          break;
        }
        case "document.session": {
          const input = z
            .object({ meetingId: idSchema, kind: documentKindSchema })
            .strict()
            .parse(request.input);
          data = await this.backend.documents.session(
            scope,
            input.meetingId,
            input.kind
          );
          break;
        }
        case "document.sync": {
          const { meetingId } = selectionSchema.parse(request.input);
          await this.backend.documents.sync(scope, meetingId);
          data = await service.get(scope, meetingId);
          break;
        }
        case "capture.event":
          data = await this.backend.captures.event(
            scope,
            captureEventSchema.parse(request.input)
          );
          break;
        case "notes":
          data = await service.notes(scope, notesSchema.parse(request.input));
          break;
        case "edit":
          data = await service.edit(scope, editSchema.parse(request.input));
          break;
        case "retry":
          data = await service.retry(
            scope,
            selectionSchema.parse(request.input).meetingId
          );
          break;
        case "delete":
          await this.backend.documents.remove(
            scope,
            selectionSchema.parse(request.input).meetingId
          );
          data = await service.remove(
            scope,
            selectionSchema.parse(request.input).meetingId
          );
          break;
        case "export": {
          const input = z
            .object({
              meetingId: idSchema,
              includeTranscript: z.boolean().default(false),
            })
            .strict()
            .parse(request.input);
          await this.backend.documents.sync(scope, input.meetingId);
          data = await service.export(
            scope,
            input.meetingId,
            input.includeTranscript
          );
          break;
        }
        default:
          throw new MeetingError("unsupported_action");
      }
      return { success: true, refresh: false, data };
    } catch (error) {
      return failure(error);
    }
  }
  async executeViewFileAction(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    key: string,
    request: XpertViewActionRequest,
    file: XpertViewFileActionFile
  ): Promise<XpertViewActionResult> {
    try {
      if (viewKey !== VIEW || key !== "capture.chunk")
        throw new MeetingError("unsupported_action");
      return {
        success: true,
        refresh: false,
        data: await this.backend.captures.chunk(
          scopeFromView(context),
          captureChunkSchema.parse(request.input),
          file.buffer
        ),
      };
    } catch (error) {
      return failure(error);
    }
  }
}
