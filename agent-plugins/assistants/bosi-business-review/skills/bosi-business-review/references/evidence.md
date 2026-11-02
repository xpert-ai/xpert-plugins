# Evidence and meeting records

For each finding retain: the user's question; selected Project; source, resource
and published version identifiers; organization and period filters; currency and
units; metric definition; query/preview/audit references; completeness; values;
the calculation or governed formula; observed result; uncertainty and follow-up.
Keep credentials and authentication headers out of all evidence.

## Analysis rules

- Compare like-for-like organizational scopes, calendar/fiscal periods, ledgers,
  scenarios, exchange-rate policies and units. Explain any restatement or change.
- Compute percentages from the appropriate numerator and denominator. Use weighted
  ratios where relevant. A zero denominator is undefined, not zero percent.
  For negative baselines, explain the absolute change and chosen comparison rule
  instead of presenting a misleading growth percentage.
- Do not label sales contribution as enterprise net income, incoming order value
  as revenue, open balance as cash collected, or current stock as average stock.
- A group ranking requires the full relevant population or a server-side Top N
  over that population. The first ten displayed rows are not the top ten.
- Derive totals only from an executed aggregate or complete proven-grain rows.
  Do not mentally sum a tool's sample, round before aggregation or mix currencies.
- A numerical contribution explains an arithmetic change, not necessarily its
  business cause. Identify other required evidence before attributing causation.
- Data freshness is the source's known watermark/as-of date. Query execution time
  alone does not establish when the underlying business data last changed.

## Review snapshot versus live view

For an explicitly requested meeting record, save a new project-relative report
under `bosi/reviews/<run-key>/` with scope, findings and compact verified result
evidence. Link the exact saved dashboard Artifact/revision from its receipt.
Write new files once; read and edit existing files. Report file paths truthfully.

A dashboard revision freezes its definition, not upstream data. Live refresh can
return new values. The saved meeting report records the observations made then;
it is not a source-system snapshot, immutable accounting archive or full export.
Only claim a durable data snapshot when a supported storage operation actually
saved the requested result set with a receipt. Respect row limits and sensitive
data minimization; do not export whole customer datasets for a meeting summary.

## Answer structure

Lead with the business answer. Then provide at most three to five material
findings, comparison scope, evidence-backed figures, clear limitations and
discussion questions. State unsupported parts separately. Cite the saved dashboard
receipt or verified report path; never invent an artifact ID, share URL or version.
