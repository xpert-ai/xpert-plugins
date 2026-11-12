Use together with `live-dashboard` when the user requests category contribution or an 80/20 analysis.

1. Inspect the attached dataset schema and actual time coverage. Define the order and line-item grain; remove duplicate records without dropping legitimate multi-item orders.
2. Query the complete result for each category level separately. Report distinct order count and item quantity as different measures. Explain when an order spans categories and therefore category order counts are not additive.
3. Sort descending, calculate total contribution and cumulative share; identify Top 3, 5, 10 and the minimum category set reaching 80%. Do not assume exactly 20% of categories contribute 80%.
4. Handle ties deterministically, missing categories explicitly, and zero denominators without inventing percentages. Do not sum different currencies.
5. Render ranked bars plus a cumulative-share curve, a threshold reference and an evidence table. Derive narrative figures from query results, not hard-coded HTML values. Clearly label synthetic fixtures and data coverage.
6. Save an editable Live Dashboard draft using the governed authoring tools and return its artifact card. Never publish automatically.
