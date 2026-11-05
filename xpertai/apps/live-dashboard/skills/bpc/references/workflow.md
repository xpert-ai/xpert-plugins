# BPC analysis in Live Dashboard

The default author template binds four sibling skills to `Agent_Dashboard`.
The BPC parent matches the requested analysis to rules supported by the selected model.

```mermaid
flowchart TD
    Request[User selects a BPC model and task] --> Live[live-dashboard]
    Live --> Parent[bpc: confirm the model and the requested analysis]
    Parent -->|Monthly production cost execution| Cost[bpc-cost-expense]
    Parent -->|Annual sales, expense and investment budgets| Planning[bpc-financial-planning]
    Binding[Authorized model and native member mapping] --> Cost
    Binding --> Planning
    Cost --> Compare[Query budget and actual separately for the same month]
    Planning --> Reconcile[Query one budget version, reconcile annual and monthly values by account group]
    Compare --> Check{Scope, grain and completeness verified?}
    Reconcile --> Check
    Check -->|No| Gap[Identify the affected figures and resolve the discrepancy]
    Gap --> Parent
    Check -->|Yes| Intent{Requested output}
    Intent -->|Analysis| Report[Report figures, verified scope and open business questions]
    Intent -->|Dashboard| Draft[Save draft and return its revision for user review]
    Draft -->|Explicit human confirmation| Publish[Publish in Workbench]
```

A single model instance can support both branches. Changing the version, period
or organization reuses the selected child with fresh bindings. For another
company, resolve authorized model and member identities in that environment.

To add a different business contract, add a sibling skill, register its task and
model requirements in [model-routing.md](model-routing.md) and declare the
dependency in the plugin author template. Verify package discovery and Agent
binding. Existing or custom Assistants enable the skills in their own configuration.
