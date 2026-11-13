# Local Verification Record

Verified on the Tencent Cloud Xpert App Dev environment.

## Build and rule tests

```bash
cd /opt/xpert-appdev/plugins/community
corepack pnpm --filter @xpert-ai/plugin-vehicle-pickup test
```

Result: 5 of 5 tests passed; server and remote-component TypeScript builds passed.

## Plugin and Assistant

- Plugin id: `@xpert-ai/plugin-vehicle-pickup`
- Plugin level: `tenant`
- Artifact namespace: `vehicle_pickup`
- Runtime status after restart: `loaded`
- Assistant slug: `vehicle-pickup-assistant`
- Assistant model: `deepseek-flash` through the OpenAI-compatible provider

## Full workflow

The real DeepSeek Assistant invoked the middleware tools for validation and request creation.

Verified outcomes:

- `777777` and `999999` validation returned customs-lock and store-permission errors.
- Creating `777777` was blocked and created no request.
- Repeating an active create reused the same request.
- Store role could not approve.
- A customs-lock change before approval caused automatic system rejection.
- Manual rejection and cancellation both succeeded.
- Carrier execution failed on attempt 1 and succeeded on attempt 2.
- Executed requests became visible to the carrier role.
- Successful retry cleared the previous execution failure reason.
- Status filtering no longer retained a stale selected request ID.

## Final UI checks

- Desktop workbench renders list, detail, status badges, role switch and operation logs.
- Approver action buttons remain readable when the workbench is narrow.
- Carrier role displays executed requests.
- Executed filter returns only executed requests.
- Mobile viewport `390x844` has no page-level horizontal overflow; the vehicle table scrolls inside its own container.
- UI approval action succeeded and showed the expected state transition.

## Screenshots

- `docs/artifacts/desktop-final.png`
- `docs/artifacts/desktop-filter-executed-fixed.png`
- `docs/artifacts/mobile-final.png`
- `docs/artifacts/mobile-approver-final.png`
- `docs/artifacts/mobile-approved-via-ui.png`
