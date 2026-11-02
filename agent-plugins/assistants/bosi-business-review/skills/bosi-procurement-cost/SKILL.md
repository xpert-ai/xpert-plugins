---
name: bosi-procurement-cost
description: Analyze purchasing spend, supplier concentration, price and quantity effects, and supported procurement exceptions. Use when the user asks a purchasing question, regardless of their Assistant role or source protocol.
---

# Procurement and cost

Follow `bosi-business-review`. Distinguish purchase commitments, receipts,
invoiced spend and payments. Determine item grain, currency, unit, tax/freight
inclusion, canceled lines and return treatment before comparing values.

## Investigation

1. Preview the requested spend basis and comparison period. Do not combine open
   purchase orders and invoices as additive spend if they describe the same flow.
2. Rank suppliers, categories, materials, plants and buying organizations where
   metadata supports them. Use complete aggregates for concentration and Top N.
3. Inspect price, quantity and mix with compatible unit conversions and an
   explicit baseline. Explain the decomposition method and any interaction term.
4. Report savings only against a defined contract, budget or comparable baseline;
   lower total spend may reflect lower demand rather than negotiated savings.
5. Inspect delivery exceptions only with scheduled and actual receipt dates and
   quantities. Spend or supplier share alone does not establish reliability.
6. If receipts/invoices are available, compare them at proven document/item links
   and identify mismatches without overstating them as fraud or overpayment.

## Output and limits

Suggested views: spend trend, supplier/category contribution, supported price
variance, concentration and exception detail. A manager may also ask for inventory,
cash or sales analysis; use the corresponding shared Skill when authorized.
Never create a purchase order, change a supplier, negotiate externally or execute
a payment as a side effect of this analysis.

Use SAP purchasing-spend/order-value queries, OData purchase/receipt/invoice
entities or equivalent database models according to discovered capabilities.
