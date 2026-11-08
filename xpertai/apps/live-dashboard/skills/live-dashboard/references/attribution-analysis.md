Use together with `live-dashboard` for cancellation attribution tasks.

1. Inspect the supplied schema, time period and booking grain. Deduplicate by the validated booking identifier. Define known, cancelled, retained and missing-status populations.
2. Compare lead-time buckets, channel, deposit type, hotel type, customer type and historical cancellations only when the fields exist. List absent dimensions rather than fabricate them.
3. Show group booking count, cancellation count, cancellation rate, share of all cancellations and difference from the overall rate. Flag small samples and missing values. Rank the top three candidates by observed contribution and affected volume, not rate alone.
4. Separate composition changes from within-group rate changes when comparing periods. Do not label associations as causes; deposit-policy and selection effects require further investigation.
5. Produce KPI cards, group comparison charts, an evidence table and three prioritized investigation actions with quantified scope. Recompute all figures from complete queries, label synthetic data, and do not call booking-value estimates realized revenue.
6. Save an editable Live Dashboard draft and return its artifact card; never publish automatically.
