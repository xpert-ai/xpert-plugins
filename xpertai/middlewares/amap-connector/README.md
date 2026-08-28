# AMap Connector

AMap connector plugin for XpertAI. It stores an AMap Web Service Key and optional digital-signature private key in the platform vault, then exposes the official AMap Web Service API as bounded, read-only Agent tools.

## Capabilities

- Address geocoding and reverse geocoding
- Keyword, type, nearby, and POI detail search
- Driving, transit, walking, and bicycling route planning
- Straight-line, driving, and walking distance calculation
- Current weather, forecasts, and explicit public IPv4 location
- Connection status without returning either credential

All coordinates accepted and returned by this connector use GCJ-02 and `{ lng, lat }` objects. Tool responses are allowlisted and capped; raw polylines, unknown provider fields, the Key, and the signature private key are never returned to the Agent.

## Authentication

Create an application and a Key for the **Web Service** platform in the [AMap console](https://console.amap.com/dev/key/app), then create an **AMap** connector in Xpert and enter the Key. If digital signature verification is enabled for the Key, also enter its private key. The connection check executes one read-only geocoding request before activation.

Credentials are encrypted by the Xpert platform and resolved only for connector tool calls. Do not put them in plugin configuration, Agent instructions, logs, or source control.

## Development

```bash
pnpm exec nx run @xpert-ai/plugin-amap-connector:typecheck
pnpm exec nx run @xpert-ai/plugin-amap-connector:test
pnpm exec nx run @xpert-ai/plugin-amap-connector:build
```

The upstream origin is fixed to `https://restapi.amap.com`. Every response is validated against the official `status` and `infocode` envelope before it reaches an Agent. See the [plugin documentation](./docs/index.mdx) for setup, architecture, tool contracts, and operations.
