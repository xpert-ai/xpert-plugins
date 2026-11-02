---
name: bosi-project-performance
description: Analyze business-project budgets, actuals, estimate-at-completion, billing and profitability from authorized project or WBS models.
---

# Business-project performance

Follow `bosi-business-review` for scope, discovery and evidence. A business project
or WBS in SAP is a data dimension. It is NOT the ChatKit Project that contains the
conversation and dashboard. Never treat either identifier as the other.

## Establish the contract

Discover business-project/WBS identity, hierarchy, company, customer, fiscal
period, currency, status, baseline version and the grain of each measure. Read
whether amounts are period flows, inception-to-date totals or current forecasts.
Distinguish recognized revenue, billing, cash collection and time/expense charges.

## Answer the decision

- Start with actual costs and revenue at the requested project level, checking
  that parent/child WBS nodes are not both counted in totals.
- Compare actual with an approved baseline only when the model exposes that
  baseline and its version. A project's existence does not imply a budget.
- Use estimate-at-completion and forecast margin only when actual plus remaining
  forecasts have a consistent cutoff and the forecast version is identified.
- Use project dates and progress definitions to discuss schedule performance.
  Do not derive earned value, CPI or SPI from spending alone; they require defined
  planned value, earned value and actual costs.
- Rank overrun, unbilled-work or margin exceptions only where the required inputs
  exist. Separate the model's forecast from the Assistant's suggested scenario.

The output is a portfolio summary and a business-project drilldown backed by
queries. A dashboard filter for a SAP project must not switch ChatKit Project.
Do not modify project plans, approve time sheets, bill customers or post revenue.
