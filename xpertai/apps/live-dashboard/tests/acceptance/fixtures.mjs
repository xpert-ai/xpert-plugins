import { config, download, load, save } from "./context.mjs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
// Independent synthetic fixture; this parser is only for the documented regression input, not a data adapter.
const expected = [
  ["2026-07", "华东", 600],
  ["2026-07", "华东", 400],
  ["2026-07", "华西", 800],
  ["2026-08", "华东", 1500],
  ["2026-08", "华西", 900],
  ["2026-09", "华东", 1000],
  ["2026-09", "华西", 500],
];
const checks = [];
for (const item of config.cases) {
  const bytes = await download(item.filePath);
  let rows;
  if (item.format === "csv") {
    const lines = bytes.toString("utf8").trim().split(/\r?\n/);
    assert.equal(lines.shift(), "month,region,net_sales");
    rows = lines.map((line) => line.split(","));
  } else if (item.format === "json") {
    rows = JSON.parse(bytes.toString("utf8")).sales.map((row) => [
      row.month,
      row.region,
      row.net_sales,
    ]);
  } else {
    const { Workbook } = createRequire(
      new URL(
        "../../../../tools/analytics-files/package.json",
        import.meta.url,
      ),
    )("exceljs");
    const book = new Workbook();
    await book.xlsx.load(bytes);
    const sheet = book.getWorksheet("销售");
    assert(sheet, "Expected 销售 sheet");
    assert.deepEqual(
      [1, 2, 3].map((column) => sheet.getCell(1, column).value),
      ["month", "region", "net_sales"],
    );
    rows = Array.from({ length: sheet.rowCount - 1 }, (_, row) =>
      [1, 2, 3].map((column) => sheet.getCell(row + 2, column).value),
    );
  }
  assert(
    rows.every(
      (row) => typeof row[2] === "string" || typeof row[2] === "number",
    ),
    "No formula or compound amounts in fixture",
  );
  assert.deepEqual(
    rows.map((row) => [row[0], row[1], Number(row[2])]),
    expected,
    item.format + " synthetic oracle",
  );
  checks.push({
    format: item.format,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
let previous;
try {
  previous = await load("initial-fixtures.json");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (previous)
  assert.deepEqual(
    checks,
    previous.checks,
    "Fixture baseline changed; restore sources before continuing",
  );
else await save("initial-fixtures.json", { checks });
console.log(
  JSON.stringify({ passed: true, formats: checks.map((item) => item.format) }),
);
