import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod/v3";
import type { WorkspaceFilesApi } from "@xpert-ai/plugin-sdk";
import { atomicWrite, sha256 } from "./file-store.js";
import {
  MeetingError,
  summarySchema,
  type Meeting,
  type Scope,
} from "./domain.js";
import { summaryMarkdown } from "./document-markdown.js";

type Files = Pick<
  WorkspaceFilesApi,
  "writeRuntimeBuffer" | "readRuntimeBuffer" | "deleteFile"
>;
const receiptSchema = z
  .object({
    folder: z.string(),
    catalog: z.enum(["xperts", "user-xperts"]),
    hashes: z.record(z.string().regex(/^[a-f0-9]{64}$/)),
  })
  .strict();

export function meetingFolder(meeting: Meeting) {
  const name =
    Array.from(
      meeting.title
        .normalize("NFC")
        .replace(/[\x00-\x1f\x7f/\\:*?"<>|.]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
    )
      .slice(0, 36)
      .join("") || "meeting";
  return `meetings/${meeting.createdAt.slice(0, 10)}-${name}-${meeting.id}`;
}
function missing(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
function timestamp(ms: number) {
  return `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")}`;
}

/** Repairable, revision-serialized Workspace projection. No host volume paths or session folders. */
export class MeetingWorkspaceFiles {
  constructor(readonly api: (scope: Scope) => Files) {}

  async sync(meeting: Meeting, directory: string, force = false) {
    const receiptPath = join(directory, "workspace-files.json");
    let receipt: z.infer<typeof receiptSchema>;
    try {
      receipt = receiptSchema.parse(
        JSON.parse(await readFile(receiptPath, "utf8"))
      );
    } catch (error) {
      if (!missing(error)) throw error;
      if (meeting.deleted) return; // Legacy meetings may never have created workspace files.
      if (!meeting.scope.workspaceCatalog)
        throw new MeetingError("workspace_scope_missing");
      receipt = {
        folder: meetingFolder(meeting),
        catalog: meeting.scope.workspaceCatalog,
        hashes: {},
      };
      // Persist the stable destination before the first write, including crash/retry recovery.
      await atomicWrite(receiptPath, JSON.stringify(receipt));
    }
    if (
      receipt.catalog !== meeting.scope.workspaceCatalog ||
      !receipt.folder.startsWith("meetings/") ||
      receipt.folder.split("/").length !== 2 ||
      !receipt.folder.endsWith(`-${meeting.id}`) ||
      receipt.folder.includes("\0")
    )
      throw new MeetingError("workspace_scope_changed");
    meeting.workspace!.folder = receipt.folder;
    const files = this.api(meeting.scope);
    if (meeting.deleted) {
      for (const path of Object.keys(receipt.hashes)) {
        this.checkPath(receipt.folder, path);
        try {
          await files.deleteFile({ filePath: path });
        } catch (error) {
          if (!missing(error)) throw error;
        }
        delete receipt.hashes[path];
        await atomicWrite(receiptPath, JSON.stringify(receipt));
      }
      return;
    }
    const outputs = await this.outputs(meeting, directory);
    for (const [name, content] of outputs) {
      const path = `${receipt.folder}/${name}`;
      this.checkPath(receipt.folder, path);
      // Empty documents are valid; the platform upload API requires at least one byte.
      const buffer = Buffer.from(content || "\n"),
        hash = sha256(buffer);
      if (!force && receipt.hashes[path] === hash) continue;
      let current: Buffer | undefined;
      try {
        current = (await files.readRuntimeBuffer(path)).buffer;
      } catch (error) {
        if (!missing(error)) throw error;
      }
      if (
        current &&
        sha256(current) !== hash &&
        (!receipt.hashes[path] || sha256(current) !== receipt.hashes[path])
      )
        throw new MeetingError("workspace_file_conflict");
      if (!current || sha256(current) !== hash) {
        const written = await files.writeRuntimeBuffer({
          path,
          originalName: name.split("/").at(-1)!,
          buffer,
          mimeType: name.endsWith(".json")
            ? "application/json"
            : "text/markdown",
        });
        if (
          written.reference.filePath !== path ||
          written.reference.catalog !== receipt.catalog
        )
          throw new MeetingError("workspace_destination_mismatch");
      }
      receipt.hashes[path] = hash;
      await atomicWrite(receiptPath, JSON.stringify(receipt));
    }
  }

  private checkPath(folder: string, path: string) {
    if (
      !path.startsWith(`${folder}/`) ||
      path.includes("\0") ||
      path.includes("\\") ||
      path.split("/").some((part) => !part || part === "." || part === "..")
    )
      throw new MeetingError("unsafe_storage");
  }

  private async outputs(
    m: Meeting,
    directory: string
  ): Promise<Map<string, string>> {
    // Pre-Tiptap records only persisted the structured summary. Never replace an
    // initialized collaboration document, including an intentionally empty one.
    if (m.summary && !m.documents.summary && !m.summaryMarkdown)
      m.summaryMarkdown = summaryMarkdown(m.title, m.summary);
    const files = new Map<string, string>([
      [
        "meeting.json",
        JSON.stringify(
          {
            title: m.title,
            createdAt: m.createdAt,
            startedAt: m.startedAt,
            endedAt: m.endedAt,
            durationMs: m.durationMs,
            capture: m.capture,
            processing: m.processing,
          },
          null,
          2
        ),
      ],
      ["notes.md", m.notes],
      ["transcript.json", JSON.stringify(m.transcript, null, 2)],
      [
        "transcript.md",
        `# ${m.title}\n\n${m.transcript
          .filter((s) => s.text.trim())
          .map(
            (s) =>
              `## ${timestamp(s.startMs)}–${timestamp(s.endMs)} · ${
                s.track
              }\n\n${s.text}\n`
          )
          .join("\n")}`,
      ],
    ]);
    if (m.summary) files.set("summary.md", m.summaryMarkdown);
    for (let version = 1; version <= m.summaryVersion; version++) {
      const source = await readFile(
        join(directory, "summaries", `${version}.json`),
        "utf8"
      );
      let markdown: string;
      try {
        markdown = await readFile(
          join(directory, "summaries", `${version}.md`),
          "utf8"
        );
      } catch (error) {
        if (!missing(error)) throw error;
        const history = z
          .object({ summary: summarySchema })
          .parse(JSON.parse(source));
        markdown = summaryMarkdown(m.title, history.summary);
      }
      files.set(`history/summary-${version}.json`, source);
      files.set(`history/summary-${version}.md`, markdown);
    }
    let phase = 0;
    for (const operation of m.assistant.operations) {
      if (operation.kind !== "phase") continue;
      phase++;
      if (operation.status === "ready")
        files.set(
          `stages/${String(phase).padStart(4, "0")}.md`,
          await readFile(
            join(directory, "assistant", `${operation.id}.md`),
            "utf8"
          )
        );
    }
    return files;
  }
}
