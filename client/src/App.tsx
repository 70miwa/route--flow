import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ChevronUp,
  Loader2,
  LocateFixed,
  LogIn,
  LogOut,
  MapPinned,
  MapPin,
  MessageSquareWarning,
  Plus,
  Route as RouteIcon,
  ShieldCheck,
  Users,
} from 'lucide-react'
import MapView from './components/MapView'
import SearchBar from './components/SearchBar'
import VerdictCard from './components/VerdictCard'
import RouteList from './components/RouteList'
import HintForm from './components/HintForm'
import HintList from './components/HintList'
import AuthModal from './components/AuthModal'
import { useAuth } from './context/AuthContext'
import { ApiError, reportsApi, reverseGeocodeDetails, routeApi, telemetryApi } from './lib/api'
import type { Endpoint, GeoFix, LatLng, Place, Report, ReportStatus, RouteResponse } from './lib/types'

type EndpointVal = LatLng & {
  label: string
  road?: string
  area?: string
  source?: 'live' | 'manual'
}

function distanceBetweenMeters(a: LatLng, b: LatLng) {
  const radius = 6_371_000
  const toRadians = (value: number) => value * Math.PI / 180
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const dLat = lat2 - lat1
  const dLng = toRadians(b.lng - a.lng)
  const value = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  const bounded = Math.min(1, Math.max(0, value))
  return radius * 2 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded))
}

export default function App() {
  const { user, loading: authLoading, logout } = useAuth()
  const [origin, setOrigin] = useState<EndpointVal | null>(null)
  const [dest, setDest] = useState<EndpointVal | null>(null)
  const [activeField, setActiveField] = useState<Endpoint>('origin')
  const [routeResult, setRouteResult] = useState<RouteResponse | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [tab, setTab] = useState<'route' | 'hints'>('route')
  const [placingHint, setPlacingHint] = useState(false)
  const [pendingHint, setPendingHint] = useState<LatLng | null>(null)
  const [hintBusy, setHintBusy] = useState(false)
  const [authOpen, setAuthOpen] = useState(() => new URLSearchParams(window.location.search).has('resetToken'))
  const [tracking, setTracking] = useState(false)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState('')
  const [liveLocation, setLiveLocation] = useState<GeoFix | null>(null)
  const [recenterNonce, setRecenterNonce] = useState(0)

  const watchId = useRef<number | null>(null)
  const trackingRef = useRef(false)
  const liveRef = useRef<GeoFix | null>(null)
  const lastTelemetryAt = useRef(0)
  const liveRouteStarted = useRef(false)
  const locationStartedAt = useRef(0)
  const lastAddressPoint = useRef<LatLng | null>(null)

  const loadReports = useCallback(async () => {
    try {
      const response = await reportsApi.list(48)
      setReports(response.reports)
    } catch {
      // Community data is helpful but should never block map usage.
    }
  }, [])

  useEffect(() => {
    loadReports()
    const interval = window.setInterval(loadReports, 60_000)
    return () => window.clearInterval(interval)
  }, [loadReports, user?.id])

  const computeRoute = useCallback(async (from: LatLng, to: LatLng) => {
    setRouteLoading(true)
    setRouteError('')
    try {
      const result = await routeApi.compute(from, to)
      setRouteResult(result)
      setSelectedRouteId(result.recommendedId)
    } catch (error) {
      setRouteResult(null)
      setRouteError(error instanceof ApiError ? error.message : 'Routing failed.')
    } finally {
      setRouteLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!tracking && origin && dest) computeRoute(origin, dest)
  }, [computeRoute, dest, origin, tracking])

  // The interval reads a ref so every GPS tick does not restart the timer.
  useEffect(() => {
    if (!tracking || !dest) return
    const current = liveRef.current
    if (current) {
      liveRouteStarted.current = true
      void computeRoute(current, dest)
    }
    const interval = window.setInterval(() => {
      const fix = liveRef.current
      if (fix) computeRoute(fix, dest)
    }, 45_000)
    return () => window.clearInterval(interval)
  }, [computeRoute, dest, tracking])

  function applyPosition(position: GeolocationPosition) {
    if (!trackingRef.current) return
    const coords = position.coords
    const fix: GeoFix = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: Math.round(coords.accuracy || 25),
      speedKph: coords.speed == null ? null : Math.max(0, coords.speed * 3.6),
      heading: coords.heading == null ? null : coords.heading,
      timestamp: position.timestamp,
    }
    const elapsed = Date.now() - locationStartedAt.current
    if (fix.accuracy > 500 && elapsed < 12_000) {
      setLocating(true)
      setGeoError(`Waiting for a precise GPS fix (current accuracy is about ${fix.accuracy} m).`)
      return
    }

    const previous = liveRef.current
    if (previous) {
      const jumpMeters = distanceBetweenMeters(previous, fix)
      const credibleJump = Math.max(750, (previous.accuracy + fix.accuracy) * 4)
      if (jumpMeters > credibleJump && fix.accuracy >= previous.accuracy) return
    }

    liveRef.current = fix
    setLiveLocation(fix)
    setLocating(false)
    setGeoError(fix.accuracy > 250
      ? `Approximate location (about ${fix.accuracy} m accuracy). Enable precise location on your device for a better fix.`
      : '')
    setOrigin((current) => ({
      lat: fix.lat,
      lng: fix.lng,
      label: current?.source === 'live' ? current.label : 'Finding your address...',
      road: current?.source === 'live' ? current.road : '',
      area: current?.source === 'live' ? current.area : '',
      source: 'live',
    }))
    setActiveField('dest')

    if (!previous) setRecenterNonce((value) => value + 1)

    const addressPoint = lastAddressPoint.current
    if (
      fix.accuracy <= 500 &&
      (!addressPoint || distanceBetweenMeters(addressPoint, fix) >= 250)
    ) {
      lastAddressPoint.current = fix
      void reverseGeocodeDetails(fix.lat, fix.lng).then((place) => {
        if (!place) {
          lastAddressPoint.current = null
          return
        }
        if (!trackingRef.current || !liveRef.current) return
        const current = liveRef.current
        setOrigin({
          lat: current.lat,
          lng: current.lng,
          label: place.label,
          road: place.road,
          area: place.area,
          source: 'live',
        })
      })
    }

    const now = Date.now()
    if (fix.accuracy <= 100 && now - lastTelemetryAt.current >= 15_000) {
      lastTelemetryAt.current = now
      void telemetryApi.record({
        lat: fix.lat,
        lng: fix.lng,
        speed_kph: Math.round(fix.speedKph ?? 0),
        accuracy_m: fix.accuracy,
        ...(fix.heading == null ? {} : { heading_deg: fix.heading }),
      })
    }

  }

  function toggleTracking() {
    if (tracking) {
      stopTracking()
      return
    }

    if (!navigator.geolocation) {
      setGeoError('Location is not available in this browser.')
      return
    }
    trackingRef.current = true
    locationStartedAt.current = Date.now()
    lastAddressPoint.current = null
    liveRouteStarted.current = false
    liveRef.current = null
    setLiveLocation(null)
    setOrigin(null)
    setRouteResult(null)
    setSelectedRouteId(null)
    setTracking(true)
    setLocating(true)
    setGeoError('')
    watchId.current = navigator.geolocation.watchPosition(applyPosition, (error) => {
      if (error.code === error.PERMISSION_DENIED) {
        trackingRef.current = false
        watchId.current = null
        setTracking(false)
        setLocating(false)
        setGeoError('Location permission was denied. Allow precise location access and try again.')
        return
      }
      setLocating(!liveRef.current)
      setGeoError(error.code === error.TIMEOUT
        ? 'GPS is taking longer than expected. Keep precise location enabled.'
        : 'The device could not provide a reliable location yet.')
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 })
  }

  useEffect(() => () => {
    trackingRef.current = false
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
  }, [])

  function stopTracking(preserveOrigin = false) {
    trackingRef.current = false
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    liveRouteStarted.current = false
    liveRef.current = null
    setLiveLocation(null)
    setTracking(false)
    setLocating(false)
    if (!preserveOrigin && origin?.source === 'live') {
      setOrigin(null)
      setRouteResult(null)
    }
  }

  function pickPlace(field: Endpoint, place: Place) {
    const value = {
      lat: place.lat,
      lng: place.lng,
      label: place.label,
      road: place.road,
      area: place.area,
      source: 'manual' as const,
    }
    if (field === 'origin') {
      if (tracking) stopTracking(true)
      setOrigin(value)
      setActiveField('dest')
    } else setDest(value)
  }

  async function handleMapClick(point: LatLng) {
    if (placingHint) {
      if (!user) {
        setAuthOpen(true)
        setPlacingHint(false)
        return
      }
      setPendingHint(point)
      return
    }
    const place = await reverseGeocodeDetails(point.lat, point.lng)
    const value = {
      ...point,
      label: place?.label || 'Selected point',
      road: place?.road,
      area: place?.area,
      source: 'manual' as const,
    }
    if (activeField === 'origin' || !origin) {
      if (tracking) stopTracking(true)
      setOrigin(value)
      setActiveField('dest')
    } else setDest(value)
  }

  function swap() {
    if (tracking) stopTracking(true)
    setOrigin(dest)
    setDest(origin)
  }

  function clearEndpoint(field: Endpoint) {
    if (field === 'origin') setOrigin(null)
    else setDest(null)
    setRouteResult(null)
    setRouteError('')
    setActiveField(field)
  }

  function startPlacingHint() {
    if (!user) {
      setAuthOpen(true)
      return
    }
    setTab('hints')
    setPlacingHint(true)
    setPendingHint(null)
  }

  async function submitHint(data: { status: ReportStatus; note: string; road_name: string }) {
    if (!pendingHint) return
    setHintBusy(true)
    try {
      const { report } = await reportsApi.create({ lat: pendingHint.lat, lng: pendingHint.lng, ...data })
      setReports((previous) => [report, ...previous])
      setPendingHint(null)
      setPlacingHint(false)
      const from = tracking && liveRef.current ? liveRef.current : origin
      if (from && dest) void computeRoute(from, dest)
    } catch (error) {
      setRouteError(error instanceof ApiError ? error.message : 'Could not post this report.')
    } finally {
      setHintBusy(false)
    }
  }

  async function voteHint(id: number, vote: 'confirm' | 'dispute') {
    if (!user) {
      setAuthOpen(true)
      return
    }
    try {
      const { report } = await reportsApi.vote(id, vote)
      setReports((previous) => previous.map((item) => item.id === id ? report : item))
      const from = tracking && liveRef.current ? liveRef.current : origin
      if (from && dest) void computeRoute(from, dest)
    } catch {
      // Vote failures should not interrupt navigation.
    }
  }

  async function deleteHint(id: number) {
    try {
      await reportsApi.remove(id)
      setReports((previous) => previous.filter((report) => report.id !== id))
    } catch {
      // Ignore stale delete failures.
    }
  }

  return (
    <main className="app-shell">
      <div className="map-layer">
        <MapView
          origin={origin}
          dest={dest}
          liveLocation={liveLocation}
          routeResult={routeResult}
          reports={reports}
          placingHint={placingHint}
          pendingHint={pendingHint}
          selectedRouteId={selectedRouteId}
          currentUserId={user?.id ?? null}
          recenterNonce={recenterNonce}
          onMapClick={handleMapClick}
          onSelectRoute={setSelectedRouteId}
          onVote={voteHint}
          onDeleteHint={deleteHint}
        />
      </div>

      {placingHint && !pendingHint && (
        <div className="map-instruction">
          <MapPinned size={16} />
          <span>Tap a road location to report its current condition.</span>
          <button onClick={() => setPlacingHint(false)}>Cancel</button>
        </div>
      )}

      <section className="workspace-panel scroll-slim">
        <header className="app-header">
          <div className="brand-lockup">
            <span className="brand-mark"><RouteIcon size={19} /></span>
            <div>
              <h1>Route-Flow</h1>
              <p>Ogun road intelligence</p>
            </div>
          </div>
          <div className="header-actions">
            {tracking && <span className="live-badge"><Activity size={13} /> Live</span>}
            {authLoading ? <Loader2 className="animate-spin text-[#8d8177]" size={18} /> : user ? (
              <button className="user-chip" onClick={() => void logout()} title="Sign out">
                <span>{user.username.slice(0, 1).toUpperCase()}</span>{user.username}<LogOut size={14} />
              </button>
            ) : (
              <button className="sign-in-button" onClick={() => setAuthOpen(true)}><LogIn size={15} /> Sign in</button>
            )}
          </div>
        </header>

        <div className="workspace-intro">
          <div>
            <span className="eyebrow">TODAY IN OGUN</span>
            <h2>Know the road before you move.</h2>
          </div>
          <div className="signal-stat"><span className="signal-dot" /> {reports.length} live reports</div>
        </div>

        <div className="search-panel">
          <SearchBar
            origin={origin}
            dest={dest}
            activeField={activeField}
            tracking={tracking}
            locating={locating}
            liveAccuracy={liveLocation?.accuracy ?? null}
            geoError={geoError}
            onFocusField={setActiveField}
            onPick={pickPlace}
            onSwap={swap}
            onToggleLocation={toggleTracking}
            onClear={clearEndpoint}
          />
        </div>

        <nav className="workspace-tabs" aria-label="Route workspace">
          <button className={tab === 'route' ? 'active' : ''} onClick={() => setTab('route')}>
            <RouteIcon size={15} /> Trip planner
          </button>
          <button className={tab === 'hints' ? 'active' : ''} onClick={() => setTab('hints')}>
            <Users size={15} /> Road reports <span>{reports.length}</span>
          </button>
        </nav>

        {tab === 'route' ? (
          <div className="workspace-content">
            {routeLoading && (
              <div className="loading-strip"><Loader2 className="animate-spin" size={17} /> Updating route intelligence...</div>
            )}
            {routeError && !routeLoading && (
              <div className="error-strip"><AlertTriangle size={17} /> {routeError}</div>
            )}
            {!routeLoading && !routeError && routeResult && (
              <>
                <section className="trip-addresses">
                  <div>
                    <span className="trip-address-icon origin"><LocateFixed size={15} /></span>
                    <span className="trip-address-copy">
                      <small>YOUR LOCATION</small>
                      <strong>{origin?.label || 'Current location'}</strong>
                      {origin?.road && <span>{origin.road}{origin.area ? `, ${origin.area}` : ''}</span>}
                    </span>
                  </div>
                  <div>
                    <span className="trip-address-icon destination"><MapPin size={15} /></span>
                    <span className="trip-address-copy">
                      <small>DESTINATION</small>
                      <strong>{dest?.label || 'Selected destination'}</strong>
                      {dest?.road && <span>{dest.road}{dest.area ? `, ${dest.area}` : ''}</span>}
                    </span>
                  </div>
                </section>
                <VerdictCard result={routeResult} />
                <RouteList result={routeResult} selectedRouteId={selectedRouteId} onSelect={setSelectedRouteId} />
              </>
            )}
            {!routeLoading && !routeError && !routeResult && (
              <div className="empty-state">
                <span className="empty-icon"><MapPinned size={22} /></span>
                <strong>Set your route</strong>
                <p>Search for a start and destination, or tap two points on the map.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="workspace-content reports-content">
            {pendingHint ? (
              <HintForm
                location={pendingHint}
                busy={hintBusy}
                onSubmit={submitHint}
                onCancel={() => { setPendingHint(null); setPlacingHint(false) }}
              />
            ) : (
              <button className="report-cta" onClick={startPlacingHint}><Plus size={17} /> Report a road condition</button>
            )}
            <div className="reports-heading"><span>Community signal</span><span><ShieldCheck size={14} /> Recent and vote-checked</span></div>
            <HintList
              reports={reports}
              currentUserId={user?.id ?? null}
              onVote={voteHint}
              onFocus={() => undefined}
              onDelete={deleteHint}
            />
          </div>
        )}

        <footer className="panel-footer">
          <span><Activity size={13} /> GPS + community signal</span>
          <span>Ogun State</span>
        </footer>
      </section>

      <div className="map-controls">
        {liveLocation && (
          <button className="map-control-button" onClick={() => setRecenterNonce((value) => value + 1)} title="Recenter on live location">
            <ChevronUp size={17} />
          </button>
        )}
        {tab === 'route' && (
          <button className="floating-report" onClick={startPlacingHint}><MessageSquareWarning size={17} /> Report road</button>
        )}
      </div>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </main>
  )
}
