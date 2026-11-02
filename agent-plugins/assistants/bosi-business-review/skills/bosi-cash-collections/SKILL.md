---
name: bosi-cash-collections
description: Analyze cash position, collections, receivables aging and supported liquidity risks using governed financial data. Use only the cash or receivables concepts actually requested and available.
---

# Cash and collections

Follow `bosi-business-review`; establish cutoff, organization and currency first.
Cash-position, bank-statement balance, forecast cash and receivables are distinct.

## Required evidence

Discover open amounts, due dates, clearing status, customer/account and as-of date
for receivables; opening/closing cash and classified movements for cash analysis.
If available, inspect payables, committed inflows/outflows and forecast certainty.
SAP receivables/aging/DSO and Cash Management models are candidates; use equivalent
OData or database semantics when authorized. Standard content still needs local
configuration and data. A model's existence is not evidence of a cash balance.

## Investigation

1. Preview the requested cash or receivable population, with consistent as-of
   filtering. Do not apply today's cleared status as historical month-end status.
2. Reconcile opening cash + observed inflows - outflows to closing cash where the
   model supports the bridge; label FX and other differences explicitly.
3. For receivables, rank overdue exposure, concentration and changes using complete
   aggregates. Keep not-yet-due items separate from overdue aging buckets.
4. Use the source's governed DSO definition. Record the sales-day/window method;
   different SAP models can use different formulas. Do not substitute invoice
   count or average invoice age for DSO.
5. Assess supported upcoming receipts/payments. A due date is not a guaranteed
   collection date. Separate actual, committed and scenario values.

## Output and limits

Use cash trend/bridge, aging buckets, customer exposure and due-payment views as
relevant. An optional 13-week outlook requires actual dated cash-flow inputs and
explicit assumptions; do not extrapolate a current balance into a forecast.
Do not initiate payments, send collection messages, change credit limits or mark
invoices collected. Report possible follow-up actions for the authorized staff.
