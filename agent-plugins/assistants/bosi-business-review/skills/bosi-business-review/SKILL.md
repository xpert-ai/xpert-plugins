---
name: bosi-business-review
description: Analyze an authorized business question, discover relevant BW XMLA, SAP OData or database resources, select evidence-backed management themes, and deliver project-scoped Live Dashboards. Use for executive reviews and ordinary business analysis; the user's question determines the data and scope.
---

# Bosi business review

The user's current question is the task. A role, starter prompt, previous dashboard,
saved preference or SAP example must not replace it. Analyze only relevant themes;
do not run a full monthly review when the user asks one bounded question.

## Shared workflow

1. Establish the requested decision, audience, business subject, organization,
   period/comparison, currency and deliverable from the current request and trusted
   context. Reuse explicit choices. Discover authorized metadata before asking
   for information the system can supply. Ask one concise business question only
   when an unresolved ambiguity changes the answer. Do not ask for internal IDs.
2. Use the currently selected ChatKit Project. If none is selected, ask the user
   to select or create one through the host. Keep reports, evidence and dashboards
   in that Project. Project selection and resource authorization are separate.
3. Read [data-sources.md](references/data-sources.md). Call
   `dashboard_list_sources`, inspect the candidates relevant to the question and
   follow the returned discovery contract. If a requested source is missing, use
   `analytics_definition_connections` and `analytics_definition_inspect` before
   declaring it unavailable. Register a needed definition through the existing
   governed tool, then refresh sources. Never create redundant definitions.
4. Match the business concepts to published fields, measures, units, grain,
   dimensions and available periods. Select by semantic evidence, not a matching
   title or the first successful query. The installed role does not grant access;
   use only resources allowed for this Assistant AND the current actor. Never
   change grants, reuse another Assistant identity, or borrow its source binding.
5. Read the relevant installed topic Skill from [topics.json](references/topics.json).
   Topic procedures are analytical options, not required dashboard sections.
   Report coverage as `ready`, `needs_configuration`, `no_data`, `unsupported`
   or `not_relevant`. A failed optional theme must not block the user's other
   supported questions. Missing data is never a zero and never demo data.
6. Preview a bounded baseline and the requested comparison. Then investigate
   material changes using relevant dimensions. Rank findings by magnitude,
   business materiality, persistence and evidence quality. For a broad review,
   return at most three to five substantiated issues, not an exhaustive chart dump.
7. Follow [evidence.md](references/evidence.md). Separate observed facts,
   arithmetic contributions, hypotheses and suggested investigations. Do not
   claim causation, financial consolidation or forecast certainty from correlation.
8. For a requested dashboard, follow [dashboard.md](references/dashboard.md) and
   the installed `live-dashboard` Skill. Save a real Artifact draft, preserve its
   returned identity and revisions, and let the host emit its resource card.
   An analysis-only request does not authorize creating a dashboard.
9. Finish with the answer, the saved receipt when applicable, important scope
   limitations and the next business question. Do not expose raw tool schemas,
   authentication details or implementation instructions to the business user.

## Sources and user intent

Support BW/XMLA, SAP OData and databases through their discovered read-only
analytics contracts. A single source may support many themes and dashboards.
Never constrain a CEO to a database, a CFO to BW, or a procurement manager to
OData. Honor an explicitly selected source, period and organization even when a
different source has more convenient sample data. Cross-source comparison needs
proven entity, period, currency and metric compatibility; otherwise show separate
views and explain the difference.

If asked for a monthly meeting, establish the reporting cutoff and closed period.
Do not infer period closure from the latest date member; future members and partial
months may exist. If the user asks for another period or a nonfinancial question,
follow that request. Defaults and preferences yield to the current request.

## First use and recurring work

First use checks tool availability, selected Project, accessible sources and
question coverage. It does not require credentials in chat or a universal company
profile before answering a simple question. Persist optional preferences only
through installed preference tools, and explain any missing data binding to the
administrator. A source definition is not a permission grant.

Recurring review declarations start disabled. Enable only when the user chooses
the schedule, timezone, reporting scope and Project. If a scheduled run lacks that
scope, report the missing setup without selecting a Project from history. Never
publish a dashboard or send messages to others as part of the default review.
