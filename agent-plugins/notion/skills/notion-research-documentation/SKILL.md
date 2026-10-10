---
name: notion-research-documentation
description: Research across Notion and synthesize into structured documentation; use when gathering info from multiple Notion sources to produce briefs, comparisons, or reports with citations.
metadata:
  short-description: Research Notion content and produce briefs/reports
---

# Research & Documentation

Ported from [`openai/plugins` commit `1dc195897af4161d039b80d8471ec0a10c9bbc89`](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/skills). Notion Labs' MIT notice is in `LICENSE.txt`. Tool names are the hosted Notion MCP names. This host does not use the OpenAI client aliases `search` and `fetch`. `agents/openai.yaml` was not copied.


Pull relevant Notion pages, synthesize findings, and publish clear briefs or reports (with citations and links to sources).

## Quick start
1) Find sources with `notion-search` using targeted queries; confirm scope with the user.
2) Fetch pages via `notion-fetch`; note key sections and capture citations (`reference/citations.md`).
3) Choose output format (brief, summary, comparison, comprehensive report) using `reference/format-selection-guide.md`.
4) Draft in Notion with `notion-create-pages` using the matching template (quick, summary, comparison, comprehensive).
5) Link sources and add a references/citations section; update as new info arrives with `notion-update-page`.

## Tool-call guardrails
- Notion tool availability can vary by workspace. If a Notion MCP call returns `Tool <name> not found`, treat that tool as unavailable for the rest of the current task. Do not retry it with different arguments or call it again later; use `notion-search` and `notion-fetch` where sufficient.
- Use one literal search query per `notion-search` call and include `filters: {}` when no narrower filter is needed.
- Only fetch Notion page, database, or data-source URLs/IDs. Search results can include external connected-source URLs, which are not valid `notion-fetch` inputs.
- Create output pages with an explicit `parent` and a `pages` array.
- When updating an existing report, fetch it first and use `notion-update-page` with `update_content`, `properties: {}`, and search-and-replace pairs. For property-only updates, use `update_properties` with `content_updates: []`. The current deployed schema expects both top-level fields even when one is unused. Do not invent insertion-only commands.

## Workflow
### 0) If Notion tools are unavailable, pause and ask the user to connect Notion
1. Open the plugin details and connect Notion through the workspace Connector.
2. Complete Notion authorization if prompted. Never request tokens or passwords in chat.
3. Retry after the connection is ready. An installed plugin does not grant access to pages the connected user cannot see.

After Notion is connected, finish the current answer and tell the user to retry so they can continue with Step 1.

### 1) Gather sources
- Search first (`notion-search`); refine queries, and ask the user to confirm if multiple results appear.
- Fetch relevant pages (`notion-fetch`), skim for facts, metrics, claims, constraints, and dates.
- Track each source URL/ID for later citation; prefer direct quotes for critical facts.

### 2) Select the format
- Quick readout → quick brief.
- Single-topic dive → research summary.
- Option tradeoffs → comparison.
- Deep dive / exec-ready → comprehensive report.
- See `reference/format-selection-guide.md` for when to pick each.

### 3) Synthesize
- Outline before writing; group findings by themes/questions.
- Note evidence with source IDs; flag gaps or contradictions.
- Keep user goal in view (decision, summary, plan, recommendation).

### 4) Create the doc
- Pick the matching template in `reference/` (brief, summary, comparison, comprehensive) and adapt it.
- Create the page with `notion-create-pages`; include title, summary, key findings, supporting evidence, and recommendations/next steps when relevant.
- Add citations inline and a references section; link back to source pages.

### 5) Finalize & handoff
- Add highlights, risks, and open questions.
- If the user needs follow-ups, create tasks or a checklist in the page; link any task database entries if applicable.
- Share a short changelog or status using `notion-update-page` when updating.

## References and examples
- `reference/` — search tactics, format selection, templates, and citation rules (e.g., `advanced-search.md`, `format-selection-guide.md`, `research-summary-template.md`, `comparison-template.md`, `citations.md`).
- `examples/` — end-to-end walkthroughs (e.g., `competitor-analysis.md`, `technical-investigation.md`, `market-research.md`, `trip-planning.md`).
