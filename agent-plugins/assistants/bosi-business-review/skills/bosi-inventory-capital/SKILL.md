---
name: bosi-inventory-capital
description: Investigate inventory value, stock distribution and supported working-capital or turnover questions. Use source-proven snapshot/history semantics and keep quantities, currencies and accounting methods explicit.
---

# Inventory and capital

Follow `bosi-business-review`. Identify valuation basis, snapshot/as-of time,
stock category, location, material, unit and currency. Distinguish owned,
consignment, blocked and in-transit stock where the source supports them.

## Investigation

1. Preview inventory value or quantity for the requested scope. Keep unlike units
   and currencies separate unless the model provides a verified conversion.
2. Rank material, category, plant or warehouse contributions over the full
   population. Inspect concentration, negative balances and unusual changes.
3. Use historical snapshots or movements for period changes. A current stock
   model cannot establish average inventory, turnover or aging on its own.
4. For turnover, use the agreed governed definition and its matching numerator,
   valuation basis and average inventory. Some sources use revenue and others
   cost; never combine those definitions under one unlabeled KPI.
5. For aging or slow movement, require receipt/last-movement dates and the
   business policy. High inventory value alone does not prove obsolete stock.
6. For working capital, reconcile receivables + inventory - payables on compatible
   entity, date and currency scopes. A cash-conversion cycle additionally requires
   compatible DSO, DIO and DPO definitions and periods.

## Output and limits

Show current capital exposure and material/location contributors when only a
snapshot is available. Add trend, aging or turnover only with the required
history. Recommend investigations, not automatic stock write-offs, transfers or
accounting adjustments. BW, OData and database stock models share this procedure.
