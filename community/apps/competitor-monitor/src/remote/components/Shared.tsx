import type { ReactNode } from "react";
import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from "@xpert-ai/plugin-shadcn-ui";
import { t, type MessageKey } from "../i18n";
export function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <header className="section-heading">
        <h2>{title}</h2>
        <div className="actions">{actions}</div>
      </header>
      <Separator />
      <div className="section-content">{children}</div>
    </section>
  );
}
const statuses: Record<string, MessageKey> = {
  active: "status.active",
  paused: "status.paused",
  running: "status.running",
  success: "status.success",
  failed: "status.failed",
  partial: "status.partial",
  pending: "status.pending",
  approved: "status.approved",
  rejected: "status.rejected",
};
export function Status({ value }: { value: string }) {
  return (
    <Badge
      className="monitor-status"
      data-status={value}
      variant={
        ["failed", "rejected"].includes(value)
          ? "destructive"
          : ["active", "success", "approved"].includes(value)
            ? "default"
            : "secondary"
      }
    >
      {t(statuses[value] ?? "status.unknown")}
    </Badge>
  );
}
export function Choice({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
