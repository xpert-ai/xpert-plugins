import React, { useState } from "react";
import {
  Button, Popover, PopoverTrigger, PopoverContent,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuSeparator,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from "@xpert-ai/plugin-shadcn-ui";
import {
  ArrowLeft, CalendarDays, Clock3, Download, Info, MoreHorizontal,
  MessagesSquare, Pencil, Trash2, RefreshCw, LoaderCircle, CircleAlert,
} from "lucide-react";
import type { MeetingDto } from "../../../src/domain";
import { Status, date, time, type Capture, type T } from "./ui-common";
import { errorText } from "./i18n";

// React 18 adapter: Radix asChild needs a DOM ref; the local shared Button is
// a function component. Keep this compatibility boundary out of domain logic.
const TriggerButton = React.forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>(
  function TriggerButton({ children, ...props }, ref) {
    return <Button {...props} asChild><button ref={ref}>{children}</button></Button>;
  }
);

export function MeetingHeader({ meeting, capture, elapsedMs, locale, t, busy, canDelete,
  onBack, onRename, onDelete, onSync, onExport, onOpenAssistant,
}: {
  meeting: MeetingDto; capture: Capture; elapsedMs: number; locale?: string; t: T;
  busy: boolean; canDelete: boolean;
  onBack: () => void; onRename: () => void; onDelete: () => void;
  onSync: () => void; onExport: (includeTranscript: boolean) => void;
  onOpenAssistant: () => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [includeTranscript, setIncludeTranscript] = useState(false);
  const working = meeting.assistant.operations.some(o => ["queued", "running"].includes(o.status));
  const phaseCount = meeting.assistant.operations.filter(o => o.kind === "phase" && o.status === "ready").length;
  const workspaceFailed = meeting.workspace?.status === "failed";
  const assistantStatus = working ? t("assistantWorking") : meeting.processing === "ready"
    ? t("summaryComplete") : `${t("phaseComplete")} · ${phaseCount}`;
  return (
    <TooltipProvider>
      <header className="meeting-header shrink-0 space-y-1 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button size="icon" variant="ghost" aria-label={t("library")} title={t("library")} onClick={onBack}>
            <ArrowLeft />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight" title={meeting.title}>{meeting.title}</h1>
          <div className="flex shrink-0 items-center gap-1">
            {meeting.assistant.conversationId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <TriggerButton size="icon" variant="ghost" disabled={busy || !meeting.assistant.threadId} aria-label={t("openAssistant")} onClick={onOpenAssistant}>
                    <MessagesSquare />
                  </TriggerButton>
                </TooltipTrigger>
                <TooltipContent>{t("openAssistant")}</TooltipContent>
              </Tooltip>
            )}
            <Popover open={infoOpen} onOpenChange={setInfoOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <PopoverTrigger asChild>
                      <TriggerButton size="icon" variant="ghost" aria-label={t("meetingInfo")}><Info /></TriggerButton>
                    </PopoverTrigger>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("meetingInfo")}</TooltipContent>
              </Tooltip>
              <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-3" aria-label={t("meetingInfo")}>
                <h2 className="font-semibold">{t("meetingInfo")}</h2>
                <p className="break-words text-sm">{meeting.title}</p>
                <div className="space-y-2 border-t border-border pt-3 text-xs">
                  <p className="text-muted-foreground">{t("workspaceFolder")}</p>
                  <p className="break-all font-mono">{meeting.workspace?.folder ?? "meetings/"}</p>
                  <p className="leading-relaxed text-muted-foreground">{t("workspaceSyncHelp")}</p>
                  <p role="status" className={workspaceFailed ? "text-destructive" : "text-muted-foreground"}>
                    {meeting.workspace?.errorCode ? errorText(new Error(meeting.workspace.errorCode), t)
                      : t(meeting.workspace?.status === "ready" ? "workspaceSynced" : workspaceFailed ? "workspaceFailed" : "workspacePending")}
                  </p>
                  <Button variant="outline" size="sm" disabled={busy} onClick={onSync}>
                    <RefreshCw className={busy ? "animate-spin motion-reduce:animate-none" : ""} />{t("workspaceRetry")}
                  </Button>
                </div>
                {meeting.assistant.conversationId && <div className="space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
                  <p>{assistantStatus}</p>
                  {meeting.assistant.operations.some(o => o.kind === "phase" && o.status === "failed") && <p>{t("assistantFailed")}</p>}
                </div>}
                <p className="text-xs text-muted-foreground">{t("private")}</p>
              </PopoverContent>
            </Popover>
            {meeting.processing === "ready" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <TriggerButton variant="outline" disabled={busy} aria-label={t("export")}><Download /><span className="hidden sm:inline">{t("export")}</span></TriggerButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuCheckboxItem checked={includeTranscript} onCheckedChange={setIncludeTranscript} onSelect={e => e.preventDefault()}>{t("includeTranscript")}</DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onExport(includeTranscript)}><Download />{t("export")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <TriggerButton variant="ghost" size="icon" aria-label={t("moreActions")} title={t("moreActions")}><MoreHorizontal /></TriggerButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={busy} onSelect={onRename}><Pencil />{t("rename")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" disabled={busy || !canDelete} onSelect={onDelete}><Trash2 />{t("delete")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-10 text-xs text-muted-foreground">
          <Status meeting={meeting} capture={capture} t={t} />
          <span className="inline-flex items-center gap-1.5"><CalendarDays />{date(meeting.createdAt, locale)}</span>
          <span className="inline-flex items-center gap-1.5 tabular-nums"><Clock3 />{time(elapsedMs)}</span>
          {working && <span className="inline-flex items-center gap-1.5" role="status"><LoaderCircle className="animate-spin motion-reduce:animate-none" />{t("assistantWorking")}</span>}
          {workspaceFailed && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setInfoOpen(true)}><CircleAlert />{t("workspacePending")}</Button>}
        </div>
      </header>
    </TooltipProvider>
  );
}
