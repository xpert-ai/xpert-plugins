# Sensitive Filter Middleware

`@xpert-ai/plugin-sensitive-filter` filters sensitive content for both input and output in two mutually exclusive modes:

- `rule`: deterministic rules (`keyword` / `regex`)
- `llm`: natural-language policy evaluation with rewrite-only enforcement

## Lifecycle Hooks

- `beforeAgent`: evaluates and optionally rewrites/blocks input
- `wrapModelCall`: evaluates and optionally rewrites/blocks output
- `afterAgent`: writes audit snapshot and sends matched alerts to configured WeCom group webhooks

## Configuration

### Top-level

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `mode` | `'rule' \| 'llm'` | Yes | `rule` | Select one mode. |
| `rules` | `Array<Rule>` | Runtime-required in `rule` mode | `[]` | Business rules for `rule` mode. |
| `caseSensitive` | `boolean` | No | `false` | Case-sensitive matching in `rule` mode. |
| `normalize` | `boolean` | No | `true` | Whitespace normalization in `rule` mode. |
| `llm` | `object` | Runtime-required in `llm` mode | - | LLM mode configuration. |
| `wecom` | `object` | No | disabled when no groups | WeCom webhook notification config. |

### WeCom Notify (`wecom`)

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `enabled` | `boolean` | No | `true` | Turn notification on/off. |
| `groups` | `Array<{webhookUrl}>` | Runtime-required for sending | `[]` | One or more WeCom group webhook targets. |
| `timeoutMs` | `number` | No | `10000` | Per webhook request timeout (max `120000`). |

### Rule Mode (`mode=rule`)

`rules[]` fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | No | Auto-generated when empty (`rule-{index+1}`). |
| `pattern` | `string` | Yes | Match pattern. |
| `type` | `'keyword' \| 'regex'` | Yes | Match type. |
| `scope` | `'input' \| 'output' \| 'both'` | Yes | Match phase. |
| `severity` | `'high' \| 'medium'` | Yes | Conflict priority (`high` > `medium`). |
| `action` | `'block' \| 'rewrite'` | Yes | Hit action. |
| `replacementText` | `string` | No | Optional replacement/block message. |

Runtime validation requires at least one valid rule with:
`pattern/type/action/scope/severity`.

### LLM Mode (`mode=llm`)

| Field | Type | Required (runtime) | Default | Description |
| --- | --- | --- | --- | --- |
| `model` | `ICopilotModel` | Yes | - | Policy evaluation model. |
| `scope` | `'input' \| 'output' \| 'both'` | Yes | - | Evaluation phase scope. |
| `rulePrompt` | `string` | Yes | - | Natural-language policy description. |
| `rewriteFallbackText` | `string` | No | `[已过滤]` | Fallback rewrite text. |
| `timeoutMs` | `number` | No | unlimited | Per-evaluation timeout (max `120000`). |

Notes:

- The middleware internally enforces rewrite-only behavior for LLM hits.
- Structured output method is internally adaptive; the UI does not expose method selection.
- Internal decision traces are muted from chat output.
- Notifications are sent only when there is at least one matched record.

## Backward Compatibility

Historical configurations may still include `generalPack`.

Current behavior:

- The field is ignored.
- Execution continues.
- Rule/LLM behavior is driven only by current supported fields.

## Minimal LLM Example

```json
{
  "mode": "llm",
  "llm": {
    "model": { "provider": "openai", "model": "gpt-4o-mini" },
    "scope": "both",
    "rulePrompt": "If content contains ID cards, phone numbers, bank cards, or home addresses, rewrite it into a privacy-safe response.",
    "rewriteFallbackText": "[已过滤]",
    "timeoutMs": 3000
  }
}
```

## Troubleshooting

1. No effect in `rule` mode:
- Ensure at least one valid rule contains `pattern/type/action/scope/severity`.

2. No effect in `llm` mode:
- Ensure `model/scope/rulePrompt` are all present.

3. Unexpected rewrites in LLM mode:
- Check audit records or runtime logs for entries with `source=error-policy` and `reason` starting with `llm-error:`.

## Validation Commands
