import { login, root as outputRoot } from "./context.mjs";
import { readFile, writeFile } from "node:fs/promises";
const name = process.argv[3],
  root = new URL("file://" + outputRoot + "/" + name + "/"),
  g = JSON.parse(await readFile(new URL("ui-generation.json", root))),
  saved = JSON.parse(
    await readFile(new URL("saved-dashboard.json", root)),
  ).dashboard;
const { b, p } = await login();
try {
  await p.goto(g.url);
  const chat = p.frameLocator('iframe[name="chatkit"]');
  await chat
    .getByRole("button", { name: "打开 " + saved.title, exact: true })
    .last()
    .click();
  const doc = chat
    .frameLocator('iframe[title="实时看板"]')
    .frameLocator('iframe[title="' + saved.title + '"]');
  await doc.locator("table tbody tr").first().waitFor({ timeout: 45000 });
  for (let i = 0; i < 100; i++) {
    const ready = await doc
      .locator("body")
      .evaluate(
        (el) =>
          el.querySelectorAll("[_echarts_instance_]").length > 0 &&
          [...el.querySelectorAll("[_echarts_instance_]")].every(
            (e) => echarts.getInstanceByDom(e)?.getOption()?.series?.length,
          ),
      );
    if (ready) break;
    await p.waitForTimeout(200);
  }
  const state = await doc.locator("body").evaluate((el) => ({
    text: el.innerText,
    ids: [...el.querySelectorAll("[id]")].map((e) => ({
      tag: e.tagName,
      id: e.id,
      text: e.tagName === "SELECT" ? e.innerHTML : undefined,
    })),
    charts: [...el.querySelectorAll("[_echarts_instance_]")].map((e) => ({
      id: e.id,
      series: echarts
        .getInstanceByDom(e)
        .getOption()
        ?.series?.map((s) => ({ type: s.type, name: s.name, data: s.data })),
    })),
  }));
  await writeFile(
    new URL("inspection.json", root),
    JSON.stringify(state, null, 2),
  );
  await p.screenshot({
    path: new URL("initial.png", root).pathname,
    fullPage: true,
  });
  console.log(JSON.stringify(state).slice(0, 12000));
} finally {
  await b.close();
}
