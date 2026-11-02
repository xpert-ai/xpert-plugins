---
name: bosi-financial-performance
description: Investigate actual financial performance, budget variance and profit or expense drivers from authorized financial models. Use when the user's question concerns financial results; this is a shared topic, not a permission-granting role.
---

# Financial performance and budget

Follow the installed `bosi-business-review` workflow and source/evidence rules.
Use the user's question to choose a bounded analysis, regardless of Assistant role.

## Establish the financial contract

Discover actual amounts, the financial statement/account mapping, fiscal variant,
period, company, ledger, currency type and signs. For comparisons discover the
budget/plan version and comparable actual scope. SAP P&L actual/plan queries are
reference candidates, not mandatory Cube names. An OData analytical entity or
database semantic model with equivalent proven concepts is equally valid.

Distinguish balances from flows, account hierarchies from additive leaf accounts,
and company statements from consolidated group statements. Elimination entries
and consolidation scope are required before claiming group consolidated results.

## Investigation

1. Preview the actual period and comparison, including the relevant financial
   measures. Reconcile selected parent totals and child contributions.
2. Quantify absolute variance first. Apply the business metric's favorable/
   unfavorable direction; a cost increase is not automatically favorable growth.
3. Rank the largest revenue, cost or expense contributions. Drill into the
   supported profit-center, cost-center, account or business-unit dimensions.
4. Separate recurring changes, one-off items and possible classification effects
   only where evidence supports those distinctions. Treat explanations as
   hypotheses until the corresponding entries or operational data prove them.
5. Use a variance waterfall only when the components reconcile to the total.
   Label an unexplained residual; never invent a balancing driver.

## Output and limits

Suggested views: actual-versus-plan KPIs, monthly trend, variance contributions,
department/account detail and management questions. Publish no financial statement
automatically. Without plan data, produce actual/comparison analysis and identify
the missing budget. Without depreciation, tax or financing definitions, omit
EBITDA, EBIT and enterprise net-income claims rather than relabeling sales profit.
