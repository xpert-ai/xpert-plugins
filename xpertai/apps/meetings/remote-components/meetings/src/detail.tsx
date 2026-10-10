import { captureCommand } from "./capture";
import React, { useEffect, useRef, useState } from "react";
import { z } from "zod/v3";
import {
  Button,
  Input,
  Checkbox,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@xpert-ai/plugin-shadcn-ui";
import {
  ArrowLeft,
  Mic,
  Monitor,
  Square,
  Download,
  Trash2,
  CalendarDays,
  Clock3,
  LoaderCircle,
  Pencil,
  Radio,
  Search,
  FileText,
  MessagesSquare,
} from "lucide-react";
import type { MeetingDto } from "../../../src/domain";
import { action, command } from "./bridge";
import { errorText } from "./i18n";
import { time, date, Status, type Capture, type T } from "./ui-common";
import { DocumentEditor } from "./document-editor";
import type { DocumentHandle } from "./use-document";
import { Waveform } from "./waveform";

export function Detail({
  meeting,
  viewKey,
  autoOpenAssistant,
  assistantOpened,
  capture,
  t,
  locale,
  busy,
  perform,
  refresh,
  onDeleted,
  setError,
}: {
  meeting: MeetingDto;
  viewKey: string;
  autoOpenAssistant: boolean;
  assistantOpened: () => void;
  capture: Capture;
  t: T;
  locale?: string;
  busy: boolean;
  perform: (fn: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
  onDeleted: () => void;
  setError: (message?: string) => void;
}) {
  const [tab, setTab] = useState<"summary" | "notes" | "transcript">(
    meeting.processing === "not_started" ? "notes" : "summary"
  );
  const [deleteOpen, setDeleteOpen] = useState(false),
    [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(meeting.title),
    [includeTranscript, setIncludeTranscript] = useState(false);
  const [search, setSearch] = useState(""),
    [limit, setLimit] = useState(40),
    [follow, setFollow] = useState(true);
  const notes = useRef<DocumentHandle>(null),
    summary = useRef<DocumentHandle>(null),
    liveScroll = useRef<HTMLDivElement>(null);
  const active =
    capture.meetingId === meeting.id &&
    ["starting", "recording"].includes(capture.status);
  const localPending =
    capture.meetingId === meeting.id &&
    ["uploading", "pending"].includes(capture.status);
  const processing = ["queued", "transcribing", "summarizing"].includes(
    meeting.processing
  );
  const flush = async () => {
    const saved =
      ((await notes.current?.flush()) ?? true) &&
      ((await summary.current?.flush()) ?? true);
    if (!saved) setError(t("documentOffline"));
    return saved;
  };
  useEffect(() => {
    const panel = liveScroll.current;
    if (active && follow && panel) panel.scrollTop = panel.scrollHeight;
  }, [meeting.transcript.length, active, follow]);
  const openAssistant = async () => {
    if (!meeting.assistant.conversationId || !(await flush())) return;
    await command("workbench.navigation.open", {
      target: "assistant.conversation",
      conversationId: meeting.assistant.conversationId,
      ...(meeting.assistant.threadId
        ? { threadId: meeting.assistant.threadId }
        : {}),
      preserveView: true,
      viewKey,
      selectionId: meeting.id,
    });
  };
  useEffect(() => {
    if (!autoOpenAssistant || !meeting.assistant.threadId) return;
    assistantOpened();
    void openAssistant().catch((e) => {
      if (!(e instanceof Error && e.message === "scope_changed")) setError(errorText(e, t));
    });
  }, [autoOpenAssistant, meeting.assistant.threadId]);
  const phaseCount = meeting.assistant.operations.filter(
    (o) => o.kind === "phase" && o.status === "ready"
  ).length;
  const assistantWorking = meeting.assistant.operations.some(
    (o) => o.status === "queued" || o.status === "running"
  );
  const segments = meeting.transcript.filter(
    (segment) =>
      segment.text &&
      segment.text.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  );
  const live = meeting.transcript.filter((segment) => segment.text).slice(-8);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
        <Button
          variant="ghost"
          onClick={() =>
            void perform(async () => {
              if (await flush()) onDeleted();
            })
          }
        >
          <ArrowLeft size={16} />
          {t("library")}
        </Button>
        {meeting.processing === "ready" && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={includeTranscript}
                onCheckedChange={(checked) =>
                  setIncludeTranscript(checked === true)
                }
              />
              {t("includeTranscript")}
            </label>
            <Button
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  if (!(await flush())) return;
                  const exported = z
                    .object({
                      fileName: z.string(),
                      content: z.string(),
                      mimeType: z.string(),
                    })
                    .parse(
                      await action("export", {
                        meetingId: meeting.id,
                        includeTranscript,
                      })
                    );
                  const url = URL.createObjectURL(
                      new Blob([exported.content], { type: exported.mimeType })
                    ),
                    link = document.createElement("a");
                  link.href = url;
                  link.download = exported.fileName;
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                })
              }
            >
              <Download size={15} />
              {t("export")}
            </Button>
          </div>
        )}
      </div>
      <div
        className="mx-6 mb-5 flex flex-wrap items-center gap-3 border-b border-border pb-4 text-sm"
        role="status"
      >
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground">{t("workspaceFolder")}</p>
          <p className="mt-1 break-all font-mono text-xs">
            {meeting.workspace?.folder ?? "meetings/"}
          </p>
          {meeting.workspace?.status !== "ready" && (
            <p
              className={`mt-2 ${
                meeting.workspace?.status === "failed"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {meeting.workspace?.errorCode
                ? errorText(new Error(meeting.workspace?.errorCode), t)
                : t(
                    meeting.workspace?.status === "failed"
                      ? "workspaceFailed"
                      : "workspacePending"
                  )}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              if (!(await flush())) return;
              await action("workspace.sync", { meetingId: meeting.id });
              await refresh();
            })
          }
        >
          {t("workspaceRetry")}
        </Button>
      </div>
      {meeting.assistant.conversationId && (
        <section
          className="mx-6 mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 px-5 py-4"
          aria-live="polite"
        >
          {assistantWorking ? (
            <LoaderCircle
              size={17}
              className="animate-spin motion-reduce:animate-none text-primary"
            />
          ) : (
            <MessagesSquare size={17} className="text-primary" />
          )}
          <div className="mr-auto text-sm">
            <p>
              {assistantWorking
                ? t("assistantWorking")
                : meeting.processing === "ready"
                ? t("summaryComplete")
                : `${t("phaseComplete")} · ${phaseCount}`}
            </p>
            {meeting.assistant.operations.some(
              (o) => o.kind === "phase" && o.status === "failed"
            ) && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("assistantFailed")}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            disabled={busy || !meeting.assistant.threadId}
            onClick={() => void perform(openAssistant)}
          >
            <MessagesSquare size={16} />
            {t("openAssistant")}
          </Button>
        </section>
      )}
      {active && (
        <section className="mx-6 mb-6 space-y-5 rounded-2xl border border-primary/15 bg-primary/5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-4">
            <span className="size-3 rounded-full bg-red-500 ring-4 ring-red-500/15 motion-safe:animate-pulse" />
            <strong className="text-lg text-red-500">
              {t(capture.status === "starting" ? "starting" : "recording")}
            </strong>
            <span className="mr-auto font-mono text-3xl font-semibold tabular-nums">
              {time(capture.elapsedMs)}
            </span>
            <Button
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await captureCommand("stop", {
                    captureId: capture.captureId,
                  }, capture.runtime);
                  await flush();
                  await refresh();
                })
              }
            >
              <Square size={14} fill="currentColor" />
              {t("end")}
            </Button>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {(capture.tracks ?? ["microphone", "system"] as const).map((track) => (
              <div
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 px-4 py-2"
                key={track}
              >
                {track === "microphone" ? (
                  <Mic className="shrink-0 text-emerald-500" size={18} />
                ) : (
                  <Monitor className="shrink-0 text-violet-500" size={18} />
                )}
                <span className="shrink-0 text-sm text-muted-foreground">
                  {t(track === "system" && capture.runtime === "browser" ? "sharedAudio" : track)}
                </span>
                <Waveform
                  level={capture[track]}
                  label={t(track === "system" && capture.runtime === "browser" ? "sharedAudio" : track)}
                  system={track === "system"}
                />
              </div>
            ))}
          </div>
          <p className="text-xs leading-6 text-muted-foreground">
            {t(capture.runtime === "browser" ? "browserCaptureHelp" : "captureHelp")}{" "}
            {t("silenceHelp").replace(
              "{seconds}",
              String(meeting.assistant.silenceSeconds)
            )}
          </p>
        </section>
      )}
      <h1 className="mx-6 mb-3 break-words text-2xl font-semibold tracking-tight">
        {meeting.title}
      </h1>
      <div className="mx-6 mb-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <CalendarDays size={14} />
          {date(meeting.createdAt, locale)}
        </span>
        <span className="flex items-center gap-2">
          <Clock3 size={14} />
          {time(active || localPending ? capture.elapsedMs : meeting.durationMs)}
        </span>
        <Status meeting={meeting} capture={capture} t={t} />
        <div className="ml-auto flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("rename")}
            onClick={() => {
              setName(meeting.title);
              setRenameOpen(true);
            }}
          >
            <Pencil size={16} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("delete")}
            disabled={active || localPending}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>
      {localPending && (
        <div
          className="mx-6 mb-4 flex items-center gap-3 rounded-xl bg-muted px-5 py-4 text-sm"
          role="status"
        >
          <LoaderCircle
            size={17}
            className={
              capture.status === "uploading"
                ? "animate-spin motion-reduce:animate-none"
                : ""
            }
          />
          <span className="mr-auto">
            {t(capture.status === "uploading" ? "uploading" : "upload_pending")}
          </span>
          {capture.status === "pending" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await captureCommand("retry", {
                    captureId: capture.captureId,
                  }, capture.runtime);
                  await refresh();
                })
              }
            >
              {t("retryUpload")}
            </Button>
          )}
        </div>
      )}
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as typeof tab)}
        className="min-w-0 flex-col gap-0"
      >
        <TabsList
          variant="line"
          className="meeting-tabs w-full justify-start border-b border-border px-6"
          aria-label={t("viewTitle")}
        >
          {(["summary", "notes", "transcript"] as const).map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(key)}
            </TabsTrigger>
          ))}
        </TabsList>
        <div
          className={`grid min-w-0 gap-5 p-6 ${
            active && tab !== "transcript" ? "xl:grid-cols-2" : ""
          }`}
        >
          {active && tab !== "transcript" && (
            <section className="min-w-0 rounded-xl border border-border bg-card">
              <header className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
                <Radio className="text-primary" size={18} />
                <h2 className="mr-auto font-semibold">{t("liveTranscript")}</h2>
                <span className="text-xs text-muted-foreground" role="status">
                  {t(
                    meeting.liveTranscription.status === "retrying"
                      ? "liveRetrying"
                      : meeting.liveTranscription.status === "transcribing"
                      ? "transcribing"
                      : "listening"
                  )}
                </span>
              </header>
              <div
                ref={liveScroll}
                className="max-h-96 min-h-48 space-y-5 overflow-y-auto p-5"
                aria-live="polite"
                aria-relevant="additions text"
              >
                {live.map((segment) => (
                  <article key={segment.id}>
                    <div className="mb-1 flex gap-2 text-xs text-muted-foreground">
                      <time>{time(segment.startMs)}</time>
                      <span>{t(segment.track)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-7">
                      {segment.text}
                    </p>
                  </article>
                ))}
                {!live.length && (
                  <p className="text-sm leading-7 text-muted-foreground">
                    {t("liveWaiting")}
                  </p>
                )}
              </div>
              <label className="flex items-center gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
                <Checkbox
                  checked={follow}
                  onCheckedChange={(checked) => setFollow(checked === true)}
                />
                {t("followTranscript")}
              </label>
            </section>
          )}
          <TabsContent
            value="notes"
            forceMount
            className="min-w-0 data-[state=inactive]:hidden"
          >
            <DocumentEditor
              ref={notes}
              meetingId={meeting.id}
              kind="notes"
              savedMarkdown={meeting.notes}
              t={t}
            />
          </TabsContent>
          {meeting.summary && (
            <TabsContent
              value="summary"
              forceMount
              className="min-w-0 space-y-4 data-[state=inactive]:hidden"
            >
              <DocumentEditor
                ref={summary}
                meetingId={meeting.id}
                kind="summary"
                savedMarkdown={
                  meeting.summaryMarkdown || meeting.summary.overview
                }
                t={t}
              />
              <p className="text-xs leading-6 text-muted-foreground">
                {t("summaryEditable")}
              </p>
              <Collapsible className="rounded-lg border border-border px-5 py-3">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="text-muted-foreground">
                    {t("original")} · {t("source")}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {[
                    ...meeting.summary.decisions,
                    ...meeting.summary.actions,
                  ].map((item, index) => (
                    <blockquote
                      key={index}
                      className="my-4 border-l-2 border-primary/30 pl-4 text-sm leading-7"
                    >
                      <span className="text-xs text-muted-foreground">
                        {item.evidence.segmentId}
                      </span>
                      <p>{item.evidence.quote}</p>
                    </blockquote>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </TabsContent>
          )}
          {tab === "summary" && !meeting.summary && (
            <TabsContent
              value="summary"
              className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl bg-muted/40 p-6 text-center"
            >
              {processing ? (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  size={28}
                />
              ) : (
                <FileText size={28} />
              )}
              <h2 className="text-lg font-medium">
                {t(
                  processing
                    ? (meeting.processing as
                        | "queued"
                        | "transcribing"
                        | "summarizing")
                    : active
                    ? "during"
                    : meeting.processing === "failed"
                    ? "failed"
                    : "created"
                )}
              </h2>
              <p className="text-sm leading-7 text-muted-foreground">
                {meeting.errorCode
                  ? errorText(new Error(meeting.errorCode), t)
                  : t(active ? "duringHelp" : "processHelp")}
              </p>
              {meeting.processing === "failed" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await action("retry", { meetingId: meeting.id });
                      await refresh();
                    })
                  }
                >
                  {t("retry")}
                </Button>
              )}
            </TabsContent>
          )}
          {tab === "transcript" && (
            <TabsContent value="transcript" className="space-y-6">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  size={16}
                />
                <Input
                  className="pl-10"
                  aria-label={t("transcript")}
                  placeholder={t("search")}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setLimit(40);
                  }}
                />
              </div>
              {active && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Radio size={14} />
                  {t("liveTranscript")} · {t("liveWaiting")}
                </p>
              )}
              {segments.slice(0, limit).map((segment) => (
                <article
                  className="flex gap-5 border-b border-border pb-5"
                  key={segment.id}
                >
                  <time className="pt-1 font-mono text-xs text-muted-foreground">
                    {time(segment.startMs)}
                  </time>
                  <div>
                    <strong className="text-sm">{t(segment.track)}</strong>
                    <p className="mt-2 whitespace-pre-wrap leading-8">
                      {segment.text}
                    </p>
                  </div>
                </article>
              ))}
              {!segments.length && (
                <p className="text-sm text-muted-foreground">
                  {t(active ? "liveWaiting" : "noTranscript")}
                </p>
              )}
              {segments.length > limit && (
                <Button variant="outline" onClick={() => setLimit(limit + 40)}>
                  {t("next")}
                </Button>
              )}
            </TabsContent>
          )}
        </div>
      </Tabs>
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent
          showCloseButton={false}
          className="border-border bg-background text-foreground"
        >
          <DialogHeader>
            <DialogTitle>{t("rename")}</DialogTitle>
            <DialogDescription>{t("title")}</DialogDescription>
          </DialogHeader>
          <Input
            value={name}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              disabled={busy || !name.trim()}
              onClick={() =>
                void perform(async () => {
                  await action("edit", {
                    meetingId: meeting.id,
                    expectedRevision: meeting.revision,
                    title: name.trim(),
                  });
                  setRenameOpen(false);
                  await refresh();
                })
              }
            >
              {t("apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent
          showCloseButton={false}
          className="border-border bg-background text-foreground"
        >
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteHelp")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  if (!(await flush())) return;
                  await action("delete", { meetingId: meeting.id });
                  setDeleteOpen(false);
                  onDeleted();
                })
              }
            >
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
