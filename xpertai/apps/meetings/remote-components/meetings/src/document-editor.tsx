import React, { forwardRef, useEffect, useImperativeHandle } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Collaboration from "@tiptap/extension-collaboration";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Undo2,
  Redo2,
  Users,
  Check,
  LoaderCircle,
  Download,
} from "lucide-react";
import { Button } from "@xpert-ai/plugin-shadcn-ui";
import { useDocument, type DocumentHandle } from "./use-document";
import type { DocumentKind } from "../../../src/domain";
import type { T } from "./ui-common";

export const DocumentEditor = forwardRef<
  DocumentHandle,
  { meetingId: string; kind: DocumentKind; savedMarkdown: string; t: T }
>(function DocumentEditor({ meetingId, kind, savedMarkdown, t }, ref) {
  const document = useDocument(meetingId, kind);
  if (!document.ready)
    return (
      <div
        className="rounded-xl border border-border p-6 text-sm text-muted-foreground"
        role="status"
      >
        <p>{t(document.error ? "documentUnavailable" : "connecting")}</p>
        {document.error && (
          <Button variant="outline" className="mt-3" onClick={document.retry}>
            {t("retryConnection")}
          </Button>
        )}
        {savedMarkdown && (
          <div
            className="mt-4 whitespace-pre-wrap break-words leading-relaxed"
            aria-label={t(kind)}
          >
            {savedMarkdown}
          </div>
        )}
      </div>
    );
  return <EditorSurface ref={ref} document={document} kind={kind} t={t} />;
});

const EditorSurface = forwardRef<
  DocumentHandle,
  { document: ReturnType<typeof useDocument>; kind: DocumentKind; t: T }
>(function EditorSurface({ document, kind, t }, ref) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          undoRedo: false,
          link: { openOnClick: false, protocols: ["https", "http", "mailto"] },
        }),
        Markdown,
        Collaboration.configure({ document: document.doc, field: "body" }),
        Placeholder.configure({
          placeholder: t(
            kind === "notes" ? "notesPlaceholder" : "summaryPlaceholder"
          ),
        }),
      ],
      editable: false,
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": t(kind),
          class:
            "min-h-72 p-5 outline-none leading-8 break-words [&_p]:my-3 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_a]:text-primary [&_a]:underline [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_code]:font-mono [&_hr]:my-6 [&_hr]:border-border [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] [&_p.is-editor-empty:first-child]:before:text-muted-foreground [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:pointer-events-none",
        },
      },
    },
    [document.doc]
  );
  useEffect(() => {
    editor?.setEditable(document.ready && document.connection === "connected");
  }, [editor, document.ready, document.connection]);
  useImperativeHandle(ref, () => ({
    flush: document.flush,
    markdown: () => editor?.getMarkdown() ?? "",
  }));
  const selected = useEditorState({
    editor,
    selector: ({ editor: value }) => ({
      bold: value?.isActive("bold"),
      italic: value?.isActive("italic"),
      heading: value?.isActive("heading"),
      bullet: value?.isActive("bulletList"),
      ordered: value?.isActive("orderedList"),
      quote: value?.isActive("blockquote"),
    }),
  });
  const toolbar = [
    {
      key: "bold",
      label: t("bold"),
      icon: Bold,
      active: selected?.bold,
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      key: "italic",
      label: t("italic"),
      icon: Italic,
      active: selected?.italic,
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      key: "heading",
      label: t("heading"),
      icon: Heading2,
      active: selected?.heading,
      run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      key: "bullet",
      label: t("bulletList"),
      icon: List,
      active: selected?.bullet,
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      key: "ordered",
      label: t("orderedList"),
      icon: ListOrdered,
      active: selected?.ordered,
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      key: "quote",
      label: t("quote"),
      icon: Quote,
      active: selected?.quote,
      run: () => editor?.chain().focus().toggleBlockquote().run(),
    },
    {
      key: "undo",
      label: t("undo"),
      icon: Undo2,
      run: () => editor?.chain().focus().undo().run(),
    },
    {
      key: "redo",
      label: t("redo"),
      icon: Redo2,
      run: () => editor?.chain().focus().redo().run(),
    },
  ];
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([editor?.getMarkdown() ?? ""], { type: "text/markdown" })
    );
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${kind}-draft.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="rounded-xl border border-border bg-card text-card-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <h2 className="mr-auto text-lg font-semibold">{t(kind)}</h2>
        <span
          className="flex items-center gap-2 text-xs text-muted-foreground"
          title={document.presence?.collaborators
            .map((item) => item.displayName)
            .join(", ")}
        >
          <Users size={15} />
          {document.connection === "connected"
            ? `${document.presence?.collaborators.length ?? 1} ${t("online")}`
            : t("connecting")}
        </span>
        <span
          className="flex items-center gap-1 text-xs text-muted-foreground"
          role="status"
        >
          {document.dirty ? (
            <LoaderCircle
              size={13}
              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <Check size={13} />
          )}
          {t(
            document.error
              ? "unsaved"
              : !document.ready
              ? "connecting"
              : document.dirty
              ? "saving"
              : "saved"
          )}
        </span>
      </header>
      {document.presence && document.presence.remoteSessions.length > 0 && (
        <p className="px-5 pt-3 text-xs text-muted-foreground">
          {t("otherWindows")} {document.presence.remoteSessions.length}
        </p>
      )}
      {(document.error || document.connection === "disconnected") && (
        <div role="alert" className="mx-4 mt-4 rounded-lg bg-muted p-4 text-sm">
          <p>{t("documentOffline")}</p>
          <Button className="mt-2" variant="outline" onClick={download}>
            <Download size={14} />
            {t("downloadDraft")}
          </Button>
        </div>
      )}
      <div
        className="flex flex-wrap gap-1 border-b border-border px-3 py-2"
        role="toolbar"
        aria-label={t("formatNotes")}
      >
        {toolbar.map((item) => (
          <Button
            key={item.key}
            variant="ghost"
            size="icon-sm"
            className={`${
              item.active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground"
            }`}
            title={item.label}
            aria-label={item.label}
            aria-pressed={item.active}
            disabled={!editor?.isEditable}
            onClick={item.run}
          >
            <item.icon size={16} />
          </Button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </section>
  );
});
