import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod/v3";
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@xpert-ai/plugin-shadcn-ui";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Mic,
  Monitor,
  FileText,
  CalendarDays,
  LoaderCircle,
  CircleAlert,
  X,
} from "lucide-react";
import type { MeetingDto } from "../../../src/domain";
import { connect, data, command, type Host } from "./bridge";
import { translator, errorText } from "./i18n";
import {
  dto,
  itemSchema,
  listSchema,
  captureSchema,
  idle,
  time,
  Status,
  type Capture,
} from "./ui-common";
import { Detail } from "./detail";
import { captureStartPayload } from "../../../src/capture-contract";

function App() {
  const [host, setHost] = useState<Host | null>(null),
    [capture, setCapture] = useState<Capture>(idle);
  const [items, setItems] = useState<z.infer<typeof itemSchema>[]>([]),
    [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string>(),
    [meeting, setMeeting] = useState<MeetingDto>();
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>(),
    [busy, setBusy] = useState(false),
    [createOpen, setCreateOpen] = useState(false),
    [title, setTitle] = useState("");
  const [followMeeting, setFollowMeeting] = useState<string>();
  const captureMeetings = useRef(new Map<string, string>());
  const captureLookup = useRef({ id: "", at: 0 });
  const queryGeneration = useRef(0),
    hostScope = useRef(""),
    hostSelection = useRef<string | undefined>(),
    captureUnavailableScope = useRef("");
  const t = translator(host?.locale);
  const viewTitle = t("viewTitle");
  useEffect(() => {
    document.title = viewTitle;
  }, [viewTitle]);
  useEffect(
    () =>
      connect((context) => {
        const scope = `${context.instanceId}:${context.scopeRevision}`;
        const changedScope = hostScope.current !== scope;
        if (changedScope) {
          hostScope.current = scope;
          setMeeting(undefined);
          captureMeetings.current.clear();
          captureUnavailableScope.current = "";
          setCapture(idle);
          setError(undefined);
        }
        setHost(context);
        const selection = context.initialQuery?.selectionId;
        if (changedScope || hostSelection.current !== selection) {
          hostSelection.current = selection;
          setSelected(selection);
        }
      }),
    []
  );
  const refresh = useCallback(
    async (quiet = false) => {
      if (!host) return;
      const generation = ++queryGeneration.current;
      if (!quiet) setLoading(true);
      try {
        const response = await data(
          selected ? { selectionId: selected } : { search, page, pageSize: 20 }
        );
        if (generation !== queryGeneration.current) return;
        if (selected)
          setMeeting(
            z.object({ meta: z.object({ detail: dto }) }).parse(response).meta
              .detail
          );
        else {
          const result = listSchema.parse(response);
          setItems(result.items);
          setTotal(result.total);
        }
      } catch (e) {
        if (generation === queryGeneration.current)
          setError(errorText(e, translator(host.locale)));
      } finally {
        if (generation === queryGeneration.current) setLoading(false);
      }
    },
    [
      host?.instanceId,
      host?.scopeRevision,
      host?.locale,
      selected,
      search,
      page,
    ]
  );
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 180);
    return () => {
      clearTimeout(timer);
      queryGeneration.current++;
    };
  }, [refresh]);
  useEffect(() => {
    if (!host) return;
    const scope = `${host.instanceId}:${host.scopeRevision}`;
    let current = true,
      running = false;
    const poll = async () => {
      if (running || captureUnavailableScope.current === scope) return;
      running = true;
      try {
        const result = captureSchema.parse(
          await command("desktop.audio.capture.state", {})
        );
        if (!current) return;
        if (!result.supported) {
          captureUnavailableScope.current = scope;
          setCapture({
            ...result,
            errorCode: result.errorCode ?? "unsupported",
          });
          return;
        }
        let meetingId = result.captureId
          ? captureMeetings.current.get(result.captureId)
          : undefined;
        if (
          result.captureId &&
          !meetingId &&
          (captureLookup.current.id !== result.captureId ||
            Date.now() - captureLookup.current.at > 1500)
        ) {
          captureLookup.current = { id: result.captureId, at: Date.now() };
          try {
            const mapping = z
              .object({
                meta: z.object({
                  capture: z.object({ meetingId: z.string().uuid() }),
                }),
              })
              .parse(
                await data({ parameters: { captureId: result.captureId } })
              );
            if (!current) return;
            meetingId = mapping.meta.capture.meetingId;
            captureMeetings.current.set(result.captureId, meetingId);
          } catch {
            // A created callback may still be pending. Keep the device state and retry control visible.
          }
        }
        if (current) setCapture({ ...result, meetingId });
      } catch (e) {
        if (!current) return;
        if (
          e instanceof Error &&
          ["unsupported", "desktop_required"].includes(e.message)
        ) {
          captureUnavailableScope.current = scope;
        }
        setCapture({
          ...idle,
          errorCode: e instanceof Error ? e.message : "capture_unavailable",
        });
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 200);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [host?.instanceId, host?.scopeRevision, selected]);
  useEffect(() => {
    if (
      !meeting ||
      (!["queued", "transcribing", "summarizing"].includes(
        meeting.processing
      ) &&
        meeting.capture !== "recording")
    )
      return;
    const timer = setInterval(() => void refresh(true), 1500);
    return () => clearInterval(timer);
  }, [meeting?.processing, meeting?.capture, refresh]);
  const navigate = (id?: string) => {
    if (id !== capture.meetingId) setFollowMeeting(undefined);
    setError(undefined);
    setSelected(id);
    setMeeting(undefined);
    // Host query owns selection across tab activation; the page never stores account data in browser storage.
    if (host)
      void command("workbench.navigation.open", {
        target: "workbench.view",
        viewKey: host.manifest.key,
        ...(id ? { selectionId: id } : {}),
      }).catch(() => {});
  };
  const perform = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };
  const start = () =>
    void perform(async () => {
      const meetingId = crypto.randomUUID();
      const scope = hostScope.current;
      const state = captureSchema.parse(
        await command(
          "desktop.audio.capture.start",
          captureStartPayload(meetingId, title.trim() || t("untitled"))
        )
      );
      if (scope !== hostScope.current) return;
      if (state.captureId)
        captureMeetings.current.set(state.captureId, meetingId);
      setCapture({ ...state, meetingId });
      setCreateOpen(false);
      setTitle("");
      if (state.captureId) {
        navigate(meetingId);
        setFollowMeeting(meetingId);
      }
    });
  return (
    <main className="flex min-h-screen flex-col bg-background font-sans text-base text-foreground">
      {!selected && (
        <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-7 [&_h1]:flex [&_h1]:items-center [&_h1]:gap-3 [&_h1]:text-3xl [&_h1]:font-semibold [&_p]:mt-2 [&_p]:text-sm [&_p]:text-muted-foreground">
          <div>
            {selected && (
              <button
                className="flex items-center gap-2 px-4 py-2 text-muted-foreground"
                onClick={() => navigate()}
                aria-label={t("back")}
              >
                <ArrowLeft size={17} />
                {t("library")}
              </button>
            )}
            <h1>
              <CalendarDays size={31} />
              {viewTitle}
            </h1>
            {!selected && <p>{t("subtitle")}</p>}
          </div>
          {!selected && (
            <Button
              className="h-auto px-6 py-3"
              onClick={() => setCreateOpen(true)}
              disabled={
                busy ||
                capture.status === "starting" ||
                capture.status === "recording"
              }
            >
              <Mic size={16} />
              {t("newMeeting")}
            </Button>
          )}
        </header>
      )}
      {error && !createOpen && (
        <div
          className="mx-6 mb-5 flex items-center gap-3 rounded-xl bg-destructive/10 px-5 py-4 text-sm text-destructive [&_span]:flex-1"
          role="alert"
        >
          <CircleAlert size={17} />
          <span>{error}</span>
          <button aria-label={t("cancel")} onClick={() => setError(undefined)}>
            <X size={16} />
          </button>
        </div>
      )}
      {capture.errorCode && !createOpen && (
        <div
          className="mx-6 mb-5 flex items-center gap-3 rounded-xl bg-muted px-5 py-4 text-sm text-muted-foreground"
          role="status"
        >
          <CircleAlert size={17} />
          <span>{errorText(new Error(capture.errorCode), t)}</span>
        </div>
      )}
      {!selected && (
        <div className="flex-1 px-6 pb-6">
          {capture.captureId && capture.status !== "idle" && (
            <button
              className="mb-5 flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-5 py-4 text-left [&_strong]:ml-auto"
              onClick={() =>
                capture.meetingId
                  ? navigate(capture.meetingId)
                  : void perform(async () => {
                      await command("desktop.audio.capture.retry", {
                        captureId: capture.captureId,
                      });
                    })
              }
            >
              <span className="size-2 rounded-full bg-red-500 motion-safe:animate-pulse" />
              {t(
                capture.status === "pending"
                  ? capture.meetingId
                    ? "upload_pending"
                    : "retryUpload"
                  : capture.status
              )}{" "}
              <strong>{time(capture.elapsedMs)}</strong>
              <ArrowRight size={16} />
            </button>
          )}
          <div className="relative mb-5 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:z-10 [&>svg]:text-muted-foreground [&_input]:h-12 [&_input]:pl-11 [&_input]:bg-muted/40">
            <Search size={17} />
            <Input
              aria-label={t("search")}
              placeholder={t("search")}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <p className="mb-8 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/40" />
            {t("private")}
          </p>
          {loading ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 p-6 text-center text-muted-foreground [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-foreground [&_p]:text-sm">
              <LoaderCircle className="animate-spin motion-reduce:animate-none" />
              <p>{t("loading")}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 p-6 text-center text-muted-foreground [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-foreground [&_p]:text-sm">
              <span className="rounded-2xl bg-primary/10 p-5 text-primary">
                <Mic size={28} />
              </span>
              <h3>{search ? t("emptySearch") : t("empty")}</h3>
              {!search && (
                <>
                  <p>{t("emptyHelp")}</p>
                  <Button variant="outline" onClick={() => setCreateOpen(true)}>
                    <Mic size={16} />
                    {t("newMeeting")}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((item, index) => (
                <React.Fragment key={item.id}>
                  {(index === 0 ||
                    new Date(items[index - 1].createdAt).toDateString() !==
                      new Date(item.createdAt).toDateString()) && (
                    <h2 className="border-0 pt-7 pb-3 text-lg font-semibold first:pt-0">
                      {new Intl.DateTimeFormat(host?.locale ?? "zh-Hans", {
                        month: "long",
                        day: "numeric",
                        weekday: "long",
                      }).format(new Date(item.createdAt))}
                    </h2>
                  )}
                  <button
                    className="flex w-full items-center gap-4 rounded-lg px-2 py-5 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                    key={item.id}
                    onClick={() => navigate(item.id)}
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted">
                      <FileText size={21} />
                    </span>
                    <span className="min-w-0 flex-1 [&_strong]:block [&_strong]:truncate [&_strong]:text-base [&_strong]:font-semibold">
                      <strong>{item.title}</strong>
                      {item.preview && (
                        <span className="mt-1 block truncate text-sm text-muted-foreground">
                          {item.preview}
                        </span>
                      )}
                    </span>
                    <span className="hidden whitespace-nowrap text-xs text-muted-foreground lg:block">
                      {new Intl.DateTimeFormat(host?.locale ?? "zh-Hans", {
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(item.createdAt))}{" "}
                      · {Math.round(item.durationMs / 60000)} {t("minutes")}
                    </span>
                    <Status meeting={item} capture={capture} t={t} />
                    <ArrowRight
                      size={15}
                      className="hidden shrink-0 text-muted-foreground sm:block"
                    />
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
          {total > 20 && (
            <div className="mt-6 flex items-center justify-center gap-4 text-sm [&_button]:h-auto [&_button]:px-5 [&_button]:py-2.5">
              <Button
                variant="ghost"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                {t("previous")}
              </Button>
              <span>
                {page} / {Math.ceil(total / 20)}
              </span>
              <Button
                variant="ghost"
                disabled={page * 20 >= total}
                onClick={() => setPage(page + 1)}
              >
                {t("next")}
              </Button>
            </div>
          )}
          <footer className="mt-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/40" />
            {t("private")}
          </footer>
        </div>
      )}
      {selected &&
        (meeting ? (
          <Detail
            key={`${hostScope.current}:${selected}`}
            meeting={meeting}
            viewKey={host!.manifest.key}
            autoOpenAssistant={followMeeting === selected}
            assistantOpened={() => setFollowMeeting(undefined)}
            capture={capture}
            t={t}
            locale={host?.locale}
            busy={busy}
            perform={perform}
            refresh={() => refresh(true)}
            onDeleted={() => navigate()}
            setError={setError}
          />
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4 p-6 text-center text-muted-foreground [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-foreground [&_p]:text-sm">
            <LoaderCircle className="animate-spin motion-reduce:animate-none" />
            <p>{t("loading")}</p>
          </div>
        ))}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          showCloseButton={false}
          className="border-border bg-background text-foreground [&_label]:space-y-2 [&_label]:text-sm [&_input]:mt-2 [&_button]:h-auto [&_button]:px-5 [&_button]:py-2.5"
        >
          <DialogHeader>
            <DialogTitle>{t("readyTitle")}</DialogTitle>
            <DialogDescription>{t("consent")}</DialogDescription>
          </DialogHeader>
          <label>
            {t("title")}
            <Input
              autoFocus
              maxLength={200}
              placeholder={t("untitled")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-5 py-4 [&_p]:mt-1 [&_p]:text-sm [&_p]:text-muted-foreground">
            <Mic size={18} />
            <Monitor size={18} />
            <div>
              <strong>{t("sources")}</strong>
              <p>{t("sourcesHelp")}</p>
            </div>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {t("desktopHelp")}
          </p>
          {!capture.supported && (
            <p
              role="status"
              className="flex items-center gap-3 rounded-xl bg-muted px-5 py-4 text-sm leading-6 text-muted-foreground"
            >
              <CircleAlert size={17} className="shrink-0" />
              {capture.errorCode
                ? errorText(new Error(capture.errorCode), t)
                : t("checkingCapture")}
            </p>
          )}
          {error && (
            <div
              role="alert"
              className="flex items-center gap-3 rounded-xl bg-destructive/10 px-5 py-4 text-sm leading-6 text-destructive"
            >
              <CircleAlert size={17} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              className="h-auto px-6 py-3"
              disabled={busy || !capture.supported}
              onClick={start}
            >
              {busy ? (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  size={16}
                />
              ) : (
                <Mic size={16} />
              )}
              {t("record")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
const root = document.getElementById("root");
document.body.className = "m-0 bg-background text-foreground antialiased";
if (root) createRoot(root).render(<App />);
