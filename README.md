# Route-Flow 🚦

**Crowdsourced road status & block-aware routing for Ogun State, Nigeria.**

Reading maps for Ogun travel is hard, and you never know a road is blocked until
you're stuck in it. Route-Flow tells you — in plain language — whether your usual
route is **passable or blocked**, shows the **ETA**, and if it's blocked it
**recommends the best clear alternative**. Road status is powered by the community:
any signed-in driver can drop a **hint** (blocked / slow / clear + a note) that
everyone else sees, and confirm or dispute others' hints.

No paid API keys required — it runs on free, open services (OpenStreetMap tiles,
OSRM routing, Nominatim search).

---

## Features

- 🗺️ **Simple map UI** (light + dark) built on Leaflet + OpenStreetMap.
- 🧭 **Block-aware routing** — pulls candidate routes from OSRM, checks each
  against community hints, and recommends the fastest route that isn't blocked.
  If every candidate is blocked, it **synthesizes detours** by re-routing around
  the blocked points so it can still find a way through.
- ⏱️ **Traffic-adjusted ETA** — base travel time plus penalties for reported slow spots.
- 📣 **Crowdsourced hints** — drop blocked/slow/clear pins with notes; others
  confirm or dispute them, and stale/overturned hints stop affecting routing.
- 🔐 **Accounts with hashed passwords** — `bcryptjs` hashing + JWT session in an
  httpOnly cookie.
- 🎯 **Ogun-focused** — search and map are centered/bounded to Ogun State.

## Tech stack

- **Frontend:** Vite + React + TypeScript + Tailwind CSS + react-leaflet
- **Backend:** Node + Express, SQLite (`better-sqlite3`)
- **Auth:** `bcryptjs`, `jsonwebtoken`, httpOnly cookie
- **Geo:** OSRM (routing), Nominatim (geocoding), `@turf/turf` (route/hint matching)

## Routing and traffic engine

- **Ogun geocoding:** Search and reverse-geocoding requests pass through the
  Express API. Results are bounded to Ogun State, normalized into readable
  addresses, areas, and road names, cached, and rate-controlled before reaching
  Nominatim.
- **Candidate route generation:** OSRM supplies route geometry, distance, base
  duration, turn steps, and named roads. When a corridor is reported blocked,
  Route-Flow also probes detour points on both sides of the affected road to
  discover usable secondary routes.
- **Traffic intelligence:** Turf spatial matching associates recent community
  reports and anonymous speed telemetry with nearby route segments. Fresh,
  corroborated reports have more influence, while stale or disputed reports
  lose confidence over time.
- **ETA adjustment:** Each candidate starts with OSRM's base duration. Observed
  slow speeds and credible congestion reports add a calculated delay so route
  comparisons reflect current road conditions rather than distance alone.
- **Route recommendation:** The engine keeps the normal route when a detour does
  not save meaningful time. It recommends an alternative only when the adjusted
  ETA shows a real saving or the normal route has a credible blockage.
- **Live navigation:** High-accuracy browser GPS updates the start point,
  rejects stale or implausible jumps, reverse-geocodes the current address, and
  periodically recalculates the trip as the driver moves.
- **Map rendering:** Leaflet draws the OpenStreetMap road network as the base
  layer, highlights route alternatives, and displays the selected route,
  distance, ETA, addresses, and road names.

## Prerequisites

- **Node.js ≥ 18** (tested on Node 22). Check with `node --version`.

## Getting started

```bash
cd route-flow

# 1. install everything (one install for client + server)
npm install

# 2. create your .env (then edit JWT_SECRET)
copy .env.example .env      # Windows PowerShell/CMD
# cp .env.example .env      # macOS/Linux

# 3. seed demo data (Ogun corridors + a demo user)
npm run seed

# 4. run in development (starts API + Vite together)
npm run dev
```

When the development server starts, open the URL printed by Vite.

The seed command creates local test accounts. Set `SEED_DEMO_PASSWORD` and
`SEED_ADA_PASSWORD` in `.env` to choose their credentials, or leave them empty
to generate random passwords that are printed once when the accounts are created.

### Production (single server)

```bash
npm run build     # builds the client into client/dist
npm start         # Express serves the API and built app on the configured PORT
```

## How to use

1. Set **A** (start) and **B** (destination) — type to search, or tap the map.
2. Route-Flow draws the route and shows a verdict card: clear, slow, or blocked +
   ETA. If your usual route is blocked, it reroutes and shows the extra time.
3. Switch to **Community hints** → **Report a road**, tap the spot on the map,
   choose blocked/slow/clear, add a note, and post. Re-run your route to see it
   reflected instantly.
4. Confirm 👍 or dispute 👎 other people's hints to keep the map accurate.

## Project layout

```
server/            Express API
  db.js            SQLite schema + connection
  config.js        env / secrets
  middleware/auth  JWT cookie -> req.user
  routes/          auth, reports (hints + votes), routing
  lib/osrm.js      fetch routes from OSRM (alternatives + detour via-points)
  lib/classify.js  match hints to routes, adjust ETAs, rank + recommend, plan detours
  seed.js          demo users + Ogun corridor hints
client/            React app (Vite)
  src/components/  Map, SearchBar, VerdictCard, RouteList, HintForm, HintList, ...
  src/lib/         api client, geo helpers, types
  src/context/     Auth + Theme providers
```

## Notes & limitations

- Uses the **public OSRM demo server** (`router.project-osrm.org`) and public
  **Nominatim** — both are rate-limited and meant for light/demo use. For
  production, self-host OSRM and Nominatim (or use a paid provider) and point
  `OSRM_URL` / the client's Nominatim URL at them.
- The public OSRM demo returns a **single** route (no native alternatives), so
  when that route is blocked Route-Flow probes a handful of **detour via-points**
  around the block to build an alternative. A self-hosted OSRM returns richer
  alternatives directly, improving reroute quality.
- There is **no free live sensor-traffic feed** for Ogun State, so congestion
  intelligence comes from community hints + OSRM base travel times, by design.
- Blocked hints influence routing for **24 hours** and fade once the community
  disputes them more than they confirm.
