import React from "react";
import { Button, Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@xpert-ai/plugin-shadcn-ui";
import { ArrowRight, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { z } from "zod/v3";
import { itemSchema, Status, time, type Capture, type T } from "./ui-common";
import { useMeetingListTransition } from "./use-meeting-list-transition";

export function MeetingList({ items, locale, capture, t, onSelect }: {
  items: z.infer<typeof itemSchema>[]; locale?: string; capture: Capture; t: T; onSelect: (id: string) => void;
}) {
  const day = new Intl.DateTimeFormat(locale ?? "zh-Hans", { month: "long", day: "numeric", weekday: "long" });
  const { root, entries } = useMeetingListTransition(items);
  return <div ref={root} className="meeting-list relative">
    {entries.map(({ item, leaving, top }, index) => <div key={item.id} data-meeting-id={item.id}
      data-leaving={leaving || undefined} aria-hidden={leaving || undefined}
      style={leaving ? { position: "absolute", top, insetInline: 0, pointerEvents: "none" } : undefined}>
      {!leaving && (index === 0 || day.format(new Date(entries[index - 1].item.createdAt)) !== day.format(new Date(item.createdAt))) &&
        <h2 className={`px-4 pb-2 text-sm font-semibold ${index === 0 ? "pt-0" : "pt-4"}`}>{day.format(new Date(item.createdAt))}</h2>}
      <Button variant="ghost" className="meeting-row flex w-full items-center gap-3 rounded-none border-x-transparent border-t-transparent border-b-border px-4 py-2.5 text-left"
        disabled={leaving}
        onClick={() => onSelect(item.id)}>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted"><FileText size={17} /></span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-sm font-medium">{item.title}</strong>
          {item.preview && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.preview}</span>}
        </span>
        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">{time(item.durationMs)}</span>
        <Status meeting={item} capture={capture} t={t} />
        <ArrowRight className="hidden text-muted-foreground sm:block" size={15} />
      </Button>
    </div>)}
  </div>;
}

export function MeetingPagination({ page, pageSize, total, loading, t, onPage, onPageSize }: {
  page: number; pageSize: number; total: number; loading: boolean; t: T;
  onPage: (page: number) => void; onPageSize: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav aria-label={t("pagination")} className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground sm:px-6">
    <span role="status">{t("totalMeetings").replace("{total}", String(total))}</span>
    <div className="flex items-center gap-2">
      <Select value={String(pageSize)} onValueChange={value => onPageSize(Number(value))} disabled={loading}>
        <SelectTrigger size="sm" aria-label={t("pageSize")}><SelectValue /></SelectTrigger>
        <SelectContent>{[10, 20, 50].map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="icon-sm" variant="ghost" disabled={loading || page <= 1} aria-label={t("previous")} onClick={() => onPage(page - 1)}><ChevronLeft /></Button>
      <span className="tabular-nums">{t("pageNumber").replace("{page}", String(page)).replace("{pages}", String(pages))}</span>
      <Button size="icon-sm" variant="ghost" disabled={loading || page >= pages} aria-label={t("next")} onClick={() => onPage(page + 1)}><ChevronRight /></Button>
    </div>
  </nav>;
}
