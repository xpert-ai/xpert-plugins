---
name: bosi-cost-controlling
description: Analyze cost-center and manufacturing-order actual, plan, target and variance measures for controllers, preserving accounting versions and reconciliation.
---

# Cost controlling

Follow `bosi-business-review` for discovery, evidence and delivery. Cost controlling
is a shared topic; install a separate controller Assistant only when that person's
responsibility, access or working context needs an independent instance.

## Required semantics

Discover controlling area, company, fiscal period/variant, cost center or cost
object, currency role, valuation and accounting version. Identify plan, actual,
target, settlement, WIP and variance measures from their documented definitions.
Do not assume that every production-cost model exposes every variance category.

## Analysis procedure

1. Establish a reconciled actual baseline at the requested cost-object grain.
2. Compare with the selected plan or target version, aligned periods and currency.
   If none is available, provide actual spending and concentration, not a variance.
3. Separate absolute cost differences from output-volume effects when compatible
   output quantities and a documented target-cost method exist.
4. Use provided price, quantity, scrap, resource-usage or lot-size variance measures
   when their semantics are proven. Do not invent a decomposition from total costs.
5. Reconcile component contributions to the total and disclose unmapped accounts,
   missing cost objects, rounding and eliminations. Avoid summing overlapping
   hierarchy nodes or both debit totals and their component cost elements.
6. Rank material exceptions, then distinguish arithmetic drivers from operational
   hypotheses. Provide the exact cost object and period for a human investigation.

WIP is a stock at an accounting cutoff and cannot be added across periods as a
flow. Costs by order and costs by work center can be alternative representations
of the same spending. Do not sum the two. A plant's production margin is not a
consolidated company profit. Save analysis drafts; never post allocations,
settlements, journal entries or changes to budgets.
