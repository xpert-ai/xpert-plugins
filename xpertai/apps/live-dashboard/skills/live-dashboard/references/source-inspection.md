# Source inspection

For each Binding, author `sourceMetadata: [{bindingId,title,description?}]`. Use business names, not invented SQL summaries. Include option-catalog/filter queries too.

HTML pages declare `components: [{id,elementId,title,kind,sources:[{bindingId,fieldIds?}]}]`. `kind` is metric, chart, table, filter or text. The HTML must contain exactly one element with each `elementId`; put IDs on static containers (including canvas parents) rather than dynamically generated children. IDs start with a letter and use letters, digits, dot, underscore or hyphen, at most 80 characters. A multi-query metric lists all of its Binding dependencies. A static element can declare an empty sources array. Field IDs refer to Binding output field IDs, not provider column guesses.

Example (as JSON text in Agent tools):

```json
[{"id":"revenue","elementId":"revenue-card","title":"Revenue","kind":"metric","sources":[{"bindingId":"sales","fieldIds":["amount"]}]}]
```

The declared Binding owns the only query payload. Do not embed payloads, credentials or query results in component metadata. Standard chart/table definitions already associate their dataset with its Binding and need no extra component mapping.

`dashboard_update` merges source metadata by bindingId and components by id. Omitted declarations stay unchanged. Use `removals.componentIds` for deliberate removal; changing a DOM ID also requires updating elementId. Removing a Binding requires updating/removing any component references to it. Sources and Inspect read the exact saved revision. Inspect is read-only; its click does not trigger a business filter.

Export/import is a Workbench file operation. An imported dashboard is a new draft, retaining internal Binding/control/component IDs and verified dependency bytes. It must pass current-user data and HTML validation; importing does not grant access or publish a version.
