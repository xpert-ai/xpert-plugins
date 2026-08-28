# Tencent Maps Connector

Tencent Maps connector plugin for XpertAI. It stores a Tencent Location Services developer Key in the platform vault and exposes the official Tencent Maps WebService API as bounded, read-only Agent tools.

## Capabilities

- Address geocoding and reverse geocoding
- City keyword, nearby, POI detail, and along-route place search
- Driving, transit, walking, bicycling, future-driving, and waypoint-optimized routes
- Distance matrices capped at 100 origin-destination pairs
- Current or forecast weather and explicit IP location
- Connection status without returning the developer Key

All coordinates accepted and returned by this connector use GCJ-02. Tool responses are allowlisted and capped; raw polylines and unknown provider fields are not returned to the Agent.

## Authentication

Create a WebService-capable Key in the [Tencent Location Services console](https://lbs.qq.com/dev/console/application/mine), then create a `Tencent Maps` connector in Xpert and enter the Key. The connection check executes one read-only geocoding request and requires a valid coordinate before activating the connector.

The Key is encrypted by the Xpert platform and resolved only for connector tool calls. Do not put it in plugin configuration, Agent instructions, or logs.

## Development

```bash
pnpm exec nx run @xpert-ai/plugin-tencent-map-connector:typecheck
pnpm exec nx run @xpert-ai/plugin-tencent-map-connector:test
pnpm exec nx run @xpert-ai/plugin-tencent-map-connector:build
```

The upstream origin is fixed to `https://apis.map.qq.com` and every response is validated against the Tencent Maps JSON status contract. See [docs](./docs/index.mdx) for architecture, tool contracts, and operations.

## Privacy

The connector does not persist tool request data. It sends the developer Key and only the address, coordinate, place keyword, route input, or explicit IP address required for the selected tool to the official Tencent Maps WebService API. Xpert stores the Key in its platform vault. Tencent's processing is governed by the [Tencent Privacy Protection Platform](https://privacy.qq.com/).

Source code is maintained in the [Xpert plugins repository](https://github.com/xpert-ai/xpert-plugins/tree/main/xpertai/middlewares/tencent-map-connector).
