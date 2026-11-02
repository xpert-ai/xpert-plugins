---
name: bosi-sales-profitability
description: Explore sales growth, customer and product contributions, sales profitability and credit-memo effects. Use for requested commercial analysis with verified revenue and cost definitions.
---

# Sales and profitability

Follow `bosi-business-review`. Inspect billing/credit/cancellation rules, amount
versus quantity, currency, reporting period, customer and product grain.
Net sales, gross billed sales and incoming order amounts are not interchangeable.

## Investigation

1. Preview comparable sales amounts and, when available, costs, credit memos and
   source-defined sales profit. Reconcile their arithmetic and units.
2. Find changes in trend and customer/product/region/channel contributions using
   dimensions the source actually exposes. Preserve organizational scope.
3. Rank complete contributions, then inspect exceptional slices. Separate a
   change in activity from a change in product/customer mix.
4. Decompose price, volume and mix only with compatible quantity, price and unit
   information. Do not infer unit price from mixed units or aggregate revenue.
5. Calculate margin as a proven ratio, not an average of row percentages. Amounts
   mislabeled as "margin" remain amounts. Sales profit is not company net income.
6. Check credit memos/cancellations when gross and net sales move differently.
   They are not automatically product returns, refunds paid or quality failures.

## Output and limits

Useful views: sales and margin trend, contribution ranking, product/customer
profitability matrix, credit impact and supporting details. If costs are missing,
answer sales questions and disclose the profitability gap. Use transaction-backed
or governed customer identities; customer lifetime value needs additional lifetime
and cost assumptions and cannot be obtained by renaming current sales.

SAP Sales Volume/Revenue from Invoice queries, authorized OData analytical entities
and database semantic models are alternative data foundations. Copy actual field
and Action names from discovery, not from a worked example.
