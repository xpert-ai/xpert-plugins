---
name: valve-business-operations
description: Use the Valve Business Workbench middleware tools for context-aware valve object analysis, evidence and constraint review, ontology Action discovery and preflight, reviewable proposal creation, and audit. Use when a user asks about the current Workbench valve, a valve identified by code, or a governed valve business operation.
---

# Valve context-aware business operations

Treat the published data-xpert snapshot and plugin persistence as the system of record. Do not claim a fact, proposal, approval, execution, or audit event unless the corresponding tool returns it.

## Resolve the current valve

1. Prefer the current Valve Business Workbench selection. Call `valve_get_object_360` without guessed identity fields so middleware resolves the canonical current object.
2. If there is no active context, call `valve_list_resources`, then `valve_search_objects` with the user's name or external key, and finally `valve_get_object_360` for the chosen exact object.
3. Never invent `resourceId`, `partitionKey`, `entityId`, `entityTypeCode`, `snapshotId`, or `graphVersion`. Treat `partitionKey` as opaque.
4. When several objects match, show a bounded choice and ask the user which object they mean before any proposal write.

Use `valve_get_schema` only when field, relation, or Action interpretation requires the compact current Schema. Do not fetch it mechanically before every object read.

## Analyze facts and evidence

For an object review, use `valve_get_object_360` and report separately:

- **Ontology facts**: identity, attributes, relations, related components/materials/standards, constraints, snapshot and graph version.
- **Evidence and gaps**: evidence keys or source locations, unresolved relations, missing values, and stale or inconsistent data.
- **Agent judgment**: engineering interpretation and risk, clearly labeled as judgment rather than ontology fact.

Use `valve_get_audit_trace` only for a requested proposal/task trace or when an operation's history is needed to explain current state. Use `valve_list_action_proposals` to inspect existing work before recommending duplicate action.

## Discover and preflight Actions

For a business operation:

1. Call `valve_discover_actions` against the canonical current object.
2. Select only an Action returned for that object. Explain its risk, approval requirement, preconditions, required input, expected effects, adapter availability, and Demo boundary.
3. Collect missing required input from the user; do not invent dates, priorities, fault descriptions, quantities, reasons, or approval facts.
4. Call `valve_preflight_action` with the exact Action code, current graph version, and supplied input.
5. If preflight is blocked, report the blocking codes and recovery action. Do not create a proposal.

Preflight is read-only. A successful preflight does not mean that an Action ran or that a proposal was saved.

## Create a governed proposal

Call `valve_create_action_proposal` only when the user explicitly asks to save a recommendation or create a draft.

- For `ontology_action`, use the Action code and normalized input from the latest successful preflight. Preserve the target snapshot/graph version, evidence, expected effects, and concise rationale.
- Use `engineering_review` only when no discovered ontology Action represents the requested recommendation; state that it is a general review proposal.
- Set `changeSummary` to a concise, locale-appropriate business progress title naming the target and proposal intent; do not repeat the full input or include secrets.
- Before creating, check current open proposals when duplicate work is plausible.
- After creation, report the proposal ID, `pending_review` status, target object, and the exact human next step in the Workbench.

The Agent cannot approve, reject, execute, complete, or fail a proposal. Workbench Demo execution produces only a simulated receipt and never writes to real ERP, EAM, QMS, procurement, DCS, or SIS systems.

## Freshness and recovery

- On graph-version or stale-context conflict, reread `valve_get_object_360`, rediscover the Action, and rerun preflight once against current state.
- On `NO_ACTIVE_CONTEXT`, use resource discovery and bounded object search; ask for a target when identity remains ambiguous.
- On unavailable or non-ready resources, report the configuration/resource problem without guessing another model.
- Do not call MCP, modify ontology Schema or data, initialize an ontology, publish a version, or bypass human approval through this Skill.

Return compact conclusions and useful next actions. Include internal IDs only when needed for traceability or requested diagnostics.
