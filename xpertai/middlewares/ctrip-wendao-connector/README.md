# Ctrip Wendao Connector

Organization-level Xpert connector for read-only travel queries through the Ctrip Wendao API.

## Capabilities

- API Token authorization through the standard Xpert connector UI
- Read-only hotel, flight, attraction, itinerary-planning, and visa-information queries
- Server-side credential resolution from the Xpert platform vault
- Bounded request and response handling with stable error codes

The connector does not support booking, orders, payments, changes, cancellations, refunds, or background synchronization.

Ctrip Wendao results are external informational content and may contain links or promotional text. Do not send identity, passport, phone, order, payment, or other sensitive personal data. Confirm live prices, inventory, schedules, and visa policies with the relevant provider before acting on a result.

## Development

```bash
pnpm exec nx test @xpert-ai/plugin-ctrip-wendao-connector
pnpm exec nx build @xpert-ai/plugin-ctrip-wendao-connector
```

See [`docs/index.mdx`](docs/index.mdx) for setup and operations.
