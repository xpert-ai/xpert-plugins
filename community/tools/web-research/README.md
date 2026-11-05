# Web Research Plugin

An Xpert Toolset that gives Agents two read-only Firecrawl-backed tools:

- `web_search` — search web, news, or images and return up to 10 source links.
- `web_scrape` — extract clean markdown from one public HTTP(S) page, optionally answering a focused question.

## Configure in Xpert

1. Install and enable `@xpert-ai/plugin-web-research` in the Xpert server at tenant scope.
2. Add the **Web research** Toolset to an Agent.
3. Set `apiKey` to a Firecrawl API key. It is a masked, persisted secret field and is never returned by either tool.
4. Keep the default `apiUrl` unless using an approved Firecrawl-compatible endpoint.

The tools are read-only. Search results are intentionally bounded to 10 items and scraped markdown is capped at 50,000 characters.

## Building

Run `nx build my-plugin` to build the library.

## Test

```sh
npx nx test @xpert-ai/plugin-web-research
npx nx typecheck @xpert-ai/plugin-web-research
npx nx build @xpert-ai/plugin-web-research
```
