---
name: bosi-manufacturing-performance
description: Analyze manufacturing order execution, operation durations, yield and scrap from authorized production models, with explicit quantity, time and status semantics.
---

# Manufacturing performance

Follow `bosi-business-review` for discovery, scope, evidence and dashboard delivery.
This topic is useful to production managers, plant managers, supply-chain managers
and cost controllers; it does not grant production or cost access.

## Establish the operational contract

- Discover order, order-item, operation and confirmation grain separately. Identify
  plant, work center, material, unit, planned/actual dates and execution status.
- Distinguish order quantity, confirmed yield, confirmed scrap, goods receipt and
  scrap cost. They can represent different populations and reporting dates.
- Respect reversals, partial confirmations, joint production and unit conversions.
  Joining order costs or quantities to multiple confirmations can multiply totals.
- Current order status is not the status at a past month end. A duration measure
  may be elapsed calendar time, working time or machine time; read its definition.

## Investigate relevant questions

1. Compare planned and actual output or duration only for compatible order cohorts.
2. Break down delays and scrap by plant, work center, material and order where
   supported. Rank by absolute impact alongside rates and the population size.
3. Calculate a scrap rate only with a documented denominator, compatible units and
   complete input. An amount of scrap does not establish a scrap quantity rate.
4. Link production cost findings through `bosi-cost-controlling` only when the
   same orders, periods, units and valuation scope can be proven.
5. Present a prioritized investigation list with observed exceptions and drilldown.
   Do not label a correlation as a machine failure or a confirmed root cause.

## Stop unsupported metrics

OEE requires availability, performance and quality inputs over the same production
scope. Capacity utilization needs usable capacity and an aligned load measure.
Neither can be inferred from an order-duration or scrap query alone. A scrap
model does not prove that inspection lots, defects, rework or customer quality
claims are available. Do not promise a complete quality-management dashboard.

Use the installed Live Dashboard recipe/theme system. Keep the actual workflow
read-only in SAP; do not release orders, alter confirmations or change schedules.
