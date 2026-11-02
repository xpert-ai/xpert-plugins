---
name: bosi-orders-fulfillment
description: Analyze incoming orders, delivery status, supported backlog and fulfillment risks. Use when the user asks about demand or delivery; require historical and due-date evidence for time-sensitive KPIs.
---

# Orders and fulfillment

Follow `bosi-business-review`. Establish order/header/item/schedule-line grain,
cancellation and return exclusions, amount versus quantity, unit and currency.

## Investigation

1. Preview new order amounts and distinct-order or item counts as defined by the
   model. Do not display an item count as a count of orders.
2. Compare the requested periods and rank supported customer/product/organization
   drivers. New orders indicate demand; they are not realized revenue.
3. Inspect delivered, partially delivered and undelivered status definitions.
   Current status describes the query-time state. Historical backlog requires
   dated open quantities, events or source snapshots.
4. Evaluate lateness only with the relevant requested/confirmed due dates, actual
   delivery dates and open quantity. "Undelivered" alone does not mean late.
5. For on-time delivery, state the exact denominator, date basis, tolerance and
   treatment of partial shipments. Missing dates block this KPI.
6. Link orders to deliveries/billing only with proven identifiers/cardinality.
   Do not subtract this month's billing from this month's incoming orders and
   call the difference backlog.

## Output and limits

Choose order trends, status composition, due/late exceptions and customer detail
according to the question. Revenue outlook needs dated open amounts, cancellation
rules and explicit conversion assumptions; label it as a scenario, not a promise.
Do not modify orders, delivery dates or credit blocks as part of analysis.

SAP sales-order/open-sales queries, OData order and delivery entities, or database
order models are valid routes when their actual semantics support the question.
