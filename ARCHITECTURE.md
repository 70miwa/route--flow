# Route-Flow Architecture

## Route decision pipeline

Route-Flow does not treat the shortest route as automatically best. Each route
request runs through five stages:

1. **Candidate generation**
   - Request up to three driving routes from OSRM.
   - If OSRM returns too few choices, probe both sides of the fastest corridor
     with perpendicular via-points and retain materially different routes.
   - If every route is blocked, generate additional waypoints around the
     reported obstruction.

2. **Community signal matching**
   - Match reports within 80 metres of a route line.
   - Weight each report by age, confirmations, and disputes.
   - Expire routing influence after 24 hours.
   - Convert credible slow reports into a bounded time penalty and credible
     blocked reports into a non-travelable route state.

3. **Telemetry delay estimation**
   - Accept opt-in browser GPS speed samples while live tracking is enabled.
   - Ignore inaccurate samples and samples older than 20 minutes.
   - Match samples within 100 metres of a route.
   - Cluster samples into 750 metre route segments so repeated points do not
     multiply the same delay.
   - Compare observed segment speed with OSRM's expected route speed and add a
     confidence-weighted delay. One sample has limited influence; multiple fresh
     samples increase confidence.

4. **Travel-time ranking**
   - Calculate `adjusted ETA = OSRM ETA + community delay + telemetry delay`.
   - Exclude credibly blocked routes when a passable route exists.
   - Keep the normal route unless an alternative saves at least two minutes or
     five percent of the adjusted trip time. This prevents route churn caused by
     weak data or tiny theoretical gains.
   - When the normal route is blocked, select the quickest passable alternative
     and show the added detour time.

5. **Driver verdict**
   - Return distance, adjusted ETA, congestion level, travelability, observed
     speed, data confidence, time saved, detour cost, and a plain-language
     explanation for the recommendation.

The implementation lives in `server/lib/classify.js`. Its core recommendation
rules are covered by `server/lib/classify.test.js`.

## Live location

The client uses `navigator.geolocation.watchPosition` only after the driver
enables live location. While enabled it:

- displays the current point and GPS accuracy radius;
- submits a speed sample at most once every 15 seconds;
- recomputes the route from the moving position every 45 seconds; and
- stops the watcher when live mode is disabled or the app unmounts.

Telemetry is operational traffic data, not a user location-history feature. The
API does not expose individual samples and deletes samples older than two hours.

## Ogun addresses and named roads

The browser calls `/api/geocode`, not Nominatim directly. The server adds the
Ogun State search context, bounds results to the Ogun corridor, identifies the
road and area fields, caches repeated lookups, and serializes upstream requests.
Reverse lookup supplies the full live address shown in the trip summary and map
popup. OSRM step names are normalized into the main road list shown for each
candidate route.

## Accounts and password recovery

- Passwords are hashed with bcrypt.
- Login creates the existing httpOnly session cookie and does not send a reset
  token.
- A reset request creates a random token, stores only its SHA-256 hash, expires
  it after 30 minutes, and invalidates older unused tokens.
- Configure `RESEND_API_KEY`, `RESET_FROM_EMAIL`, and `APP_URL` to send reset
  email in production. Development mode logs the reset URL and exposes the token
  to the local reset form.

## Production deployment

The public OSRM and Nominatim instances are suitable for development and low
volume only. A production Ogun deployment should use self-hosted or contracted
routing/geocoding services, TLS, a strong `JWT_SECRET`, a verified email domain,
API-level rate limiting, and a managed SQL database if multiple server instances
will run concurrently.
