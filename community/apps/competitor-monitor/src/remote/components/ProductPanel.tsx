import { useState } from "react";
import {
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@xpert-ai/plugin-shadcn-ui";
import { t } from "../i18n";
import type { Item, Action } from "../types";
import { Section, Status } from "./Shared";
export function ProductPanel({
  items,
  busy,
  action,
  onError,
}: {
  items: Item[];
  busy: boolean;
  action: Action;
  onError: (error: Error) => void;
}) {
  const [search, setSearch] = useState(""),
    [open, setOpen] = useState(false),
    [itemId, setItemId] = useState(""),
    [title, setTitle] = useState("");
  const visible = items.filter((i) =>
    `${i.title} ${i.itemId}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Section
      title={t("items")}
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" disabled={busy}>
              {t("action.add")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("action.add")}</DialogTitle>
              <DialogDescription>{t("empty.items")}</DialogDescription>
            </DialogHeader>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void action("add_item", {
                  itemId: itemId.trim(),
                  title: title.trim(),
                })
                  .then(() => {
                    setOpen(false);
                    setItemId("");
                    setTitle("");
                  })
                  .catch(onError);
              }}
            >
              <Label htmlFor="item-id">{t("field.itemId")}</Label>
              <Input
                id="item-id"
                required
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
              />
              <Label htmlFor="item-title">{t("field.title")}</Label>
              <Input
                id="item-title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={busy || !itemId.trim() || !title.trim()}
                >
                  {t("action.add")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <Input
        aria-label={t("field.search")}
        placeholder={t("field.search")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="record-list">
        {visible.map((item) => (
          <article className="record-row" key={item.id}>
            <div className="record-copy">
              <strong>{item.title}</strong>
              <p>
                {t("field.itemId")}: {item.itemId}
              </p>
              <Status value={item.status} />
            </div>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                void action("toggle_item", { itemId: item.itemId }).catch(
                  onError,
                )
              }
            >
              {t(item.status === "active" ? "action.pause" : "action.restore")}
            </Button>
          </article>
        ))}
        {!visible.length && <p>{t(search ? "empty.search" : "empty.items")}</p>}
      </div>
    </Section>
  );
}
