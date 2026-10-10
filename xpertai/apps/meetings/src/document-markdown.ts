import { getSchema, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { MarkdownManager } from "@tiptap/markdown";
import { prosemirrorToYDoc, yDocToProsemirrorJSON } from "y-prosemirror";
import * as Y from "yjs";
import { MeetingError, type Summary } from "./domain.js";

const extensions = [StarterKit.configure({ undoRedo: false })];
const markdown = new MarkdownManager({ extensions });
const schema = getSchema(extensions);
const safeUrl = (url: string) => /^(https?:\/\/|mailto:|#)/i.test(url);
function validate(node: JSONContent, depth = 0): void {
  if (depth > 40) throw new MeetingError("document_invalid");
  if (
    node.marks?.some(
      (mark) => mark.type === "link" && !safeUrl(String(mark.attrs?.href ?? ""))
    )
  )
    throw new MeetingError("document_unsafe_link");
  node.content?.forEach((child) => validate(child, depth + 1));
}
/** Empty notes (including older persisted Yjs seeds) need a valid ProseMirror block. */
function withEmptyParagraph(json: JSONContent): JSONContent {
  return json.type === "doc" && !json.content?.length
    ? { ...json, content: [{ type: "paragraph" }] }
    : json;
}
export function documentFromMarkdown(text: string): Y.Doc {
  const json = withEmptyParagraph(markdown.parse(text));
  validate(json);
  // Construct nodes through their owning schema: the host and Yjs adapter may
  // resolve different compatible ProseMirror versions in a plugin workspace.
  return prosemirrorToYDoc(schema.nodeFromJSON(json), "body");
}
export function documentMarkdown(doc: Y.Doc): string {
  const json = withEmptyParagraph(yDocToProsemirrorJSON(doc, "body"));
  validate(json);
  schema.nodeFromJSON(json).check();
  const result = markdown.serialize(json);
  if (result.length > 100000) throw new MeetingError("document_too_large");
  return result;
}
export function summaryMarkdown(title: string, summary: Summary): string {
  const evidence = (item: Summary["decisions"][number]) =>
    `- ${item.text}\n  > [${
      item.evidence.segmentId
    }] ${item.evidence.quote.replace(/\n/g, "\n  > ")}`;
  const zh = /[\u3400-\u9fff]/.test(title + summary.overview);
  return [
    `# ${title}`,
    "",
    zh ? "## 会议概览" : "## Overview",
    "",
    summary.overview,
    "",
    zh ? "## 关键决策" : "## Decisions",
    "",
    ...summary.decisions.map(evidence),
    "",
    zh ? "## 后续事项" : "## Follow-ups",
    "",
    ...summary.actions.map(
      (item) =>
        `${evidence(item)}\n  ${
          item.owner ?? (zh ? "未明确负责人" : "Owner not specified")
        } · ${item.dueDate ?? (zh ? "未明确日期" : "Date not specified")}`
    ),
    "",
    zh ? "## 待确认问题" : "## Open questions",
    "",
    ...summary.questions.map((item) => `- ${item}`),
    "",
  ].join("\n");
}
