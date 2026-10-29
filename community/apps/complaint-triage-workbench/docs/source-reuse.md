# Reference sources and reuse

## License and baseline

The xpert-plugins repository LICENSE is GNU AGPL version 3. The Complaint package declares AGPL-3.0. Procurement quote comparison and Dockyard also declare AGPL-3.0 in their package metadata. This is a source-reference/adaptation disclosure, not a comprehensive legal review of every transitive dependency.

Repository reference baseline: 759e5a547d39f53dbafc7c58642936ebb104f121. Xpert host reference baseline: 182f2f4a7d05d968016a9ec20a93833687c4394f. Reference links below resolve inside this repository; they do not require copying an entire reference App.

## Adapted patterns

| Capability | Reference source | Reuse scope and Complaint changes |
| --- | --- | --- |
| Plugin/module and entities | [Procurement entry](../../procurement-quote-comparison/src/index.ts), [module](../../procurement-quote-comparison/src/lib/procurement-quote-comparison.plugin.ts) | Registration/provider/entity composition as a reference; Complaint has its own namespace, contributions, entities and services |
| Scoped business service | [Procurement service](../../procurement-quote-comparison/src/lib/procurement-quote-comparison.service.ts), [CRM record service](../../crm/src/lib/crm-record.service.ts) | Repository-backed scoped object pattern; independently defined Complaint status guards, attempts and separate AI/human results |
| Middleware and Tool | [Procurement middleware](../../procurement-quote-comparison/src/lib/procurement-quote-comparison.middleware.ts) | Context-scoped internal structured Tool pattern; Complaint validates its seven fields and current case/attempt, with no supplier/quote logic |
| Workbench/View | [Procurement View](../../procurement-quote-comparison/src/lib/procurement-quote-comparison-view.provider.ts), [CRM View](../../crm/src/lib/crm-view.provider.ts) | Host data/action extension pattern; Complaint actions are create/analyze/check/retry/save/confirm with trusted host scope |
| Assistant template | [Procurement templates](../../procurement-quote-comparison/src/lib/procurement-quote-comparison.templates.ts) | YAML/provider loading precedent; Complaint's own prompt, middleware and fixed Workbench; no hard-coded procurement model choice |
| Dependency metadata | [Dockyard package](../../dockyard/package.json) | pnpm/Core/CQRS and published dependency-remediation precedent; narrowed Complaint packageExtensions, no community root edits |
| Host runtime task path | Xpert packages/plugin-sdk and packages/server-ai Assistant Task runtime contracts/services at the host baseline | ComplaintAssistantTaskService delegates to the host capability instead of embedding a vendor LLM SDK; runtime failure reconciliation is separate from reference chat dispatch |

This map documents reference/adapted patterns. It does not claim byte-for-byte copying where no such provenance was recorded. No Dockyard vendor editor, CRM React bundle, procurement domain rules, customer dataset, credentials or third-party artwork was copied into the Complaint business App. Existing redacted screenshots show the candidate's fictitious cases in the real host.

## Complaint-specific work

ComplaintCaseEntity, ComplaintCaseService, ComplaintAssistantTaskService, ComplaintTriageTools, ComplaintTriageViewProvider, the framework-free complaint Remote Component, YAML template and 27-test suite implement this workflow. Tests assert business outcomes and stale/duplicate/invalid transition protection, but use in-memory/runtime doubles rather than certify PostgreSQL or every model behavior.
