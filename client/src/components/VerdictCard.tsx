import {
  AlertOctagon,
  CheckCircle2,
  Clock3,
  Gauge,
  Radio,
  Route as RouteIcon,
  TrendingDown,
} from 'lucide-react'
import type { RouteResponse } from '../lib/types'
import { formatDistance, formatEta } from '../lib/geo'

export default function VerdictCard({ result }: { result: RouteResponse }) {
  const route = result.routes.find((item) => item.recommended) || result.routes[0]
  if (!route) return null

  const blocked = result.allBlocked || !route.travelable
  const delayed = route.status === 'slow'
  const headline = blocked
    ? 'No confirmed clear route'
    : result.rerouted
      ? 'A better route is available'
      : delayed
        ? 'Travelable with delays'
        : 'Best route is travelable'

  const observed = route.observedSpeedKph == null ? null : Math.round(route.observedSpeedKph)
  const signalLabel = route.confidence >= 0.65 ? 'Strong signal' : route.confidence >= 0.3 ? 'Moderate signal' : 'Limited signal'

  return (
    <article className={`verdict-card ${blocked ? 'is-blocked' : delayed ? 'is-slow' : 'is-clear'}`}>
      <div className="verdict-topline">
        <span className="verdict-icon">
          {blocked ? <AlertOctagon size={19} /> : <CheckCircle2 size={19} />}
        </span>
        <div>
          <span className="verdict-kicker">ROUTE VERDICT</span>
          <h3>{headline}</h3>
        </div>
        <span className="travel-badge">{route.travelable ? 'TRAVELABLE' : 'USE CAUTION'}</span>
      </div>

      <div className="trip-metrics">
        <div className="primary-metric">
          <Clock3 size={18} />
          <strong>{formatEta(route.adjustedEtaMin)}</strong>
          <span>estimated arrival time</span>
        </div>
        <div className="metric-divider" />
        <div className="secondary-metric">
          <RouteIcon size={16} />
          <strong>{formatDistance(route.distanceKm)}</strong>
          <span>total distance</span>
        </div>
        {(result.timeSavedMin > 0 || result.detourCostMin > 0) && (
          <div className="comparison-metric">
            <TrendingDown size={15} />
            <strong>{result.timeSavedMin > 0 ? `${result.timeSavedMin} min saved` : `+${result.detourCostMin} min`}</strong>
            <span>{result.timeSavedMin > 0 ? 'against the usual route' : 'to avoid a blockage'}</span>
          </div>
        )}
      </div>

      <p className="route-advice">{result.advice}</p>

      {route.roadNames.length > 0 && (
        <div className="primary-roads">
          <RouteIcon size={14} />
          <span><b>Main roads:</b> {route.roadNames.slice(0, 4).join(' / ')}</span>
        </div>
      )}

      <div className="signal-row">
        <span><Gauge size={14} /> {observed == null ? route.congestion : `${observed} km/h observed`}</span>
        <span><Radio size={14} /> {route.telemetrySamples + route.touchingHintIds.length} nearby signals</span>
        <span>{signalLabel}</span>
      </div>
    </article>
  )
}
