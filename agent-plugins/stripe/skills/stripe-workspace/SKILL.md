---
name: stripe-workspace
description: Read the connected Stripe account and run only the API writes the user requested.
---

# Stripe

Use the Stripe MCP tools enabled in this conversation and their live input schemas. This package calls `https://mcp.stripe.com`. Installing it does not grant access to Stripe accounts the connected user cannot open.

If Stripe tools are unavailable, ask the user to connect Stripe from the plugin details. Never request API keys, secret keys, or passwords in chat.

Stripe's MCP documentation, checked on 2026-10-10, names `get_stripe_account_info`, `stripe_api_search`, `stripe_api_details`, `stripe_api_read`, `stripe_api_write`, `search_stripe_documentation`, `stripe_implementation_planner`, and `send_stripe_feedback`. Call a tool only when the live schema lists it.

Use `stripe_api_read` for GET reads. `stripe_api_write` covers POST, PATCH, PUT, and DELETE methods and requires an explicit user request and host approval. Refunds, subscription cancellation, and Treasury tools such as `send_money`, `transfer_money`, `convert_currency`, and `setup_recipient` are writes. Wait for an explicit user request and host approval, and follow any confirmation URL Stripe returns. Do not claim the write succeeded until the tool result says so.

Prefer a sandbox when the user is exploring. Include object identifiers the tool returns. Report provider errors honestly.
