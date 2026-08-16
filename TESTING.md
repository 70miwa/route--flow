# Route-Flow Testing

The project uses Node's built-in `node:test` runner, so the test suite does not
need a second dependency tree or a network connection.

## Commands

```bash
npm test          # one deterministic run
npm run test:watch
npx tsc --noEmit  # static TypeScript contract check
npm run build     # production bundle check
```

## Test layers

- `server/lib/classify.test.js` tests route scoring, meaningful-saving
  thresholds, blocked-route behavior, report freshness, telemetry matching,
  congestion classification, and detour waypoint generation.
- `server/lib/reset-token.test.js` tests token entropy, one-way hashing, and
  strict expiry behavior.
- `server/routes/routing.test.js` tests the HTTP route contract with a mocked
  OSRM response, so external routing uptime cannot make CI flaky.

When changing routing behavior, add or update a failing test first, then change
the implementation, then run `npm test`, `npx tsc --noEmit`, and `npm run build`.
