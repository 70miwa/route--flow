import { Fragment, useEffect, useMemo } from 'react'
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import { Clock, ThumbsDown, ThumbsUp, Trash2, User as UserIcon } from 'lucide-react'
import type { GeoFix, LatLng, Report, RouteResponse } from '../lib/types'
import { OGUN_CENTER, OGUN_DEFAULT_ZOOM, STATUS_META, timeAgo, toLatLng } from '../lib/geo'

interface Props {
  origin: (LatLng & { label: string; road?: string; area?: string }) | null
  dest: (LatLng & { label: string; road?: string; area?: string }) | null
  liveLocation: GeoFix | null
  routeResult: RouteResponse | null
  reports: Report[]
  placingHint: boolean
  pendingHint: LatLng | null
  selectedRouteId: string | null
  currentUserId: number | null
  recenterNonce: number
  onMapClick: (point: LatLng) => void
  onSelectRoute: (id: string) => void
  onVote: (id: number, vote: 'confirm' | 'dispute') => void
  onDeleteHint: (id: number) => void
}

const TILES = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}

function endpointIcon(letter: string, color: string) {
  return L.divIcon({
    className: '',
    html: `<div class="endpoint-marker" style="background:${color}"><span>${letter}</span></div>`,
    iconSize: [32, 38],
    iconAnchor: [16, 36],
    popupAnchor: [0, -34],
  })
}

function hintIcon(color: string, faded: boolean) {
  return L.divIcon({
    className: '',
    html: `<div class="hint-marker" style="background:${color};opacity:${faded ? 0.45 : 1}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  })
}

const ORIGIN_ICON = endpointIcon('A', '#2f6d4f')
const DEST_ICON = endpointIcon('B', '#b84c35')
const PENDING_ICON = L.divIcon({
  className: '',
  html: '<div class="pending-marker"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})
const LIVE_ICON = L.divIcon({
  className: '',
  html: '<div class="live-location-marker"><span></span></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

function ClickHandler({ onMapClick }: { onMapClick: (point: LatLng) => void }) {
  useMapEvents({
    click(event) {
      onMapClick({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })
  return null
}

function FitBounds({ origin, dest, routeResult, selectedRouteId }: Pick<Props, 'origin' | 'dest' | 'routeResult' | 'selectedRouteId'>) {
  const map = useMap()
  const key = useMemo(
    () => routeResult
      ? `${routeResult.generatedAt}|${selectedRouteId || ''}`
      : `${origin?.lat || ''},${origin?.lng || ''}|${dest?.lat || ''},${dest?.lng || ''}`,
    [routeResult?.generatedAt, selectedRouteId, origin?.lat, dest?.lat]
  )

  useEffect(() => {
    const points: [number, number][] = []
    const selected = routeResult?.routes.find((route) => route.id === selectedRouteId) ||
      routeResult?.routes.find((route) => route.recommended)
    if (selected) points.push(...toLatLng(selected.geometry))
    else {
      if (origin) points.push([origin.lat, origin.lng])
      if (dest) points.push([dest.lat, dest.lng])
    }

    if (points.length === 1) map.setView(points[0], 15, { animate: true })
    else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [430, 90],
        paddingBottomRight: [80, 120],
        maxZoom: 15,
      })
    }
    // key captures the coordinate or route change that should move the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map])
  return null
}

function Recenter({ location, nonce }: { location: GeoFix | null; nonce: number }) {
  const map = useMap()
  useEffect(() => {
    if (location && nonce > 0) map.setView([location.lat, location.lng], 16, { animate: true })
  }, [location, map, nonce])
  return null
}

export default function MapView(props: Props) {
  const orderedRoutes = props.routeResult
    ? [...props.routeResult.routes].sort((a, b) => Number(a.recommended) - Number(b.recommended))
    : []

  return (
    <div className={props.placingHint ? 'rf-picking h-full w-full' : 'h-full w-full'}>
      <MapContainer
        center={OGUN_CENTER}
        zoom={OGUN_DEFAULT_ZOOM}
        zoomControl={false}
        className="h-full w-full"
      >
        <TileLayer url={TILES.url} attribution={TILES.attribution} />
        <ZoomControl position="bottomright" />
        <ClickHandler onMapClick={props.onMapClick} />
        <FitBounds
          origin={props.origin}
          dest={props.dest}
          routeResult={props.routeResult}
          selectedRouteId={props.selectedRouteId}
        />
        <Recenter location={props.liveLocation} nonce={props.recenterNonce} />

        {orderedRoutes.map((route) => {
          const chosen = props.selectedRouteId ? route.id === props.selectedRouteId : route.recommended
          const color = route.status === 'blocked' ? STATUS_META.blocked.color : chosen ? '#5b351d' : '#8d8177'
          return (
            <Fragment key={route.id}>
              <Polyline
                positions={toLatLng(route.geometry)}
                pathOptions={{
                  color: '#fffdf8',
                  weight: chosen ? 12 : 8,
                  opacity: chosen ? 0.95 : 0.7,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              <Polyline
                positions={toLatLng(route.geometry)}
                eventHandlers={{
                  click(event) {
                    L.DomEvent.stopPropagation(event.originalEvent)
                    props.onSelectRoute(route.id)
                  },
                }}
                pathOptions={{
                  color,
                  weight: chosen ? 7 : 4,
                  opacity: chosen ? 0.98 : 0.55,
                  dashArray: route.status === 'blocked' ? '2 10' : undefined,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            </Fragment>
          )
        })}

        {props.origin && !props.liveLocation && (
          <Marker position={[props.origin.lat, props.origin.lng]} icon={ORIGIN_ICON}>
            <Popup>
              <strong>Start</strong><br />{props.origin.label}
              {props.origin.road && <><br /><span>{props.origin.road}</span></>}
            </Popup>
          </Marker>
        )}
        {props.dest && (
          <Marker position={[props.dest.lat, props.dest.lng]} icon={DEST_ICON}>
            <Popup>
              <strong>Destination</strong><br />{props.dest.label}
              {props.dest.road && <><br /><span>{props.dest.road}</span></>}
            </Popup>
          </Marker>
        )}
        {props.pendingHint && (
          <Marker position={[props.pendingHint.lat, props.pendingHint.lng]} icon={PENDING_ICON} />
        )}

        {props.liveLocation && (
          <>
            <Circle
              center={[props.liveLocation.lat, props.liveLocation.lng]}
              radius={Math.max(8, props.liveLocation.accuracy)}
              pathOptions={{ color: '#5b351d', weight: 1, opacity: 0.35, fillOpacity: 0.08 }}
            />
            <Marker position={[props.liveLocation.lat, props.liveLocation.lng]} icon={LIVE_ICON}>
              <Popup>
                <strong>Live location</strong><br />
                {props.origin?.label || 'Finding your address...'}<br />
                <span>GPS accuracy: about {Math.round(props.liveLocation.accuracy)} m</span>
              </Popup>
            </Marker>
          </>
        )}

        {props.reports.map((report) => {
          const meta = STATUS_META[report.status]
          const faded = report.confirms - report.disputes <= -2
          return (
            <Marker
              key={report.id}
              position={[report.lat, report.lng]}
              icon={hintIcon(meta.color, faded)}
            >
              <Popup>
                <div className="report-popup">
                  <div className="report-popup-title">
                    <span style={{ background: meta.color }} />
                    <b style={{ color: meta.color }}>{meta.label}</b>
                    {report.road_name && <span>{report.road_name}</span>}
                  </div>
                  {report.note && <p>{report.note}</p>}
                  <div className="report-popup-meta">
                    <span><UserIcon size={11} /> {report.author}</span>
                    <span><Clock size={11} /> {timeAgo(report.created_at)}</span>
                  </div>
                  <div className="report-popup-actions">
                    <button
                      className={report.my_vote === 'confirm' ? 'active-confirm' : ''}
                      onClick={() => props.onVote(report.id, 'confirm')}
                      title="Confirm report"
                    >
                      <ThumbsUp size={13} /> {report.confirms}
                    </button>
                    <button
                      className={report.my_vote === 'dispute' ? 'active-dispute' : ''}
                      onClick={() => props.onVote(report.id, 'dispute')}
                      title="Dispute report"
                    >
                      <ThumbsDown size={13} /> {report.disputes}
                    </button>
                    {props.currentUserId === report.user_id && (
                      <button onClick={() => props.onDeleteHint(report.id)} title="Delete report">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}
