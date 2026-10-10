---
name: notion-knowledge-capture
description: Capture conversations and decisions into structured Notion pages; use when turning chats/notes into wiki entries, how-tos, decisions, or FAQs with proper linking.
metadata:
  short-description: Capture conversations into structured Notion pages
---

# Knowledge Capture

Ported from [`openai/plugins` commit `1dc195897af4161d039b80d8471ec0a10c9bbc89`](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/skills). Notion Labs' MIT notice is in `LICENSE.txt`. Tool names are the hosted Notion MCP names. This host does not use the OpenAI client aliases `search` and `fetch`. `agents/openai.yaml` was not copied.


Convert conversations and notes into structured, linkable Notion pages for easy reuse.

## Quick start
1) Clarify what to capture (decision, how-to, FAQ, learning, documentation) and target audience.
2) Identify the right database/template in `reference/` (team wiki, how-to, FAQ, decision log, learning, documentation).
3) Pull any prior context from Notion with `notion-search` → `notion-fetch` (existing pages to update/link).
4) Draft the page with `notion-create-pages` using the database’s schema; include summary, context, source links, and tags/owners.
5) Link from hub pages and related records; update status/owners with `notion-update-page` as the source evolves.

## Tool-call guardrails
- Notion tool availability can vary by workspace. If a Notion MCP call returns `Tool <name> not found`, treat that tool as unavailable for the rest of the current task. Do not retry it with different arguments or call it again later; use `notion-search` and `notion-fetch` where sufficient.
- Use one literal search query per `notion-search` call and include `filters: {}` when no narrower filter is needed. If several query variants are useful, issue separate searches instead of writing `or` or `+` inside one query string.
- Only pass Notion page, database, or data-source URLs/IDs to `notion-fetch`. Search can also surface external connected-source URLs; use those as context or citations, but do not feed them into `notion-fetch`.
- Create pages with an explicit `parent` and a `pages` array. For database-backed pages, fetch the database first and use the returned `collection://...` data source ID.
- To edit existing page content, fetch the current page first, then use `notion-update-page` with `command: "update_content"`, `properties: {}`, and exact `old_str` / full replacement `new_str` pairs. For property-only edits, use `command: "update_properties"` with `content_updates: []`. The current deployed schema expects both top-level fields even when one is unused. Do not invent insertion-only commands.

## Workflow
### 0) If Notion tools are unavailable, pause and ask the user to connect Notion
1. Open the plugin details and connect Notion through the workspace Connector.
2. Complete Notion authorization if prompted. Never request tokens or passwords in chat.
3. Retry after the connection is ready. An installed plugin does not grant access to pages the connected user cannot see.

After Notion is connected, finish the current answer and tell the user to retry so they can continue with Step 1.

### 1) Define the capture
- Ask purpose, audience, freshness, and whether this is new or an update.
- Determine content type: decision, how-to, FAQ, concept/wiki entry, learning/note, documentation page.

### 2) Locate destination
- Pick the correct database using `reference/*-database.md` guides; confirm required properties (title, tags, owner, status, date, relations).
- If multiple candidate databases, ask the user which to use; otherwise, create in the primary wiki/documentation DB.

### 3) Extract and structure
- Extract facts, decisions, actions, and rationale from the conversation.
- For decisions, record alternatives, rationale, and outcomes.
- For how-tos/docs, capture steps, pre-reqs, links to assets/code, and edge cases.
- For FAQs, phrase as Q&A with concise answers and links to deeper docs.

### 4) Create/update in Notion
- Use `notion-create-pages` with the correct `data_source_id`; set properties (title, tags, owner, status, dates, relations).
- Use templates in `reference/` to structure content (section headers, checklists).
- If updating an existing page, fetch then edit via `notion-update-page`.

### 5) Link and surface
- Add relations/backlinks to hub pages, related specs/docs, and teams.
- Add a short summary/changelog for future readers.
- If follow-up tasks exist, create tasks in the relevant database and link them.

## References and examples
- `reference/` — database schemas and templates (e.g., `team-wiki-database.md`, `how-to-guide-database.md`, `faq-database.md`, `decision-log-database.md`, `documentation-database.md`, `learning-database.md`, `database-best-practices.md`).
- `examples/` — capture patterns in practice (e.g., `decision-capture.md`, `how-to-guide.md`, `conversation-to-faq.md`).
