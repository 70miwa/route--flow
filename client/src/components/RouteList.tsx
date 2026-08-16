import { Check, Clock3, Gauge, Route as RouteIcon } from 'lucide-react'
import type { RouteResponse } from '../lib/types'
import { formatDistance, formatEta } from '../lib/geo'

interface Props {
  result: RouteResponse
  selectedRouteId: string | null
  onSelect: (id: string) => void
}

export default function RouteList({ result, selectedRouteId, onSelect }: Props) {
  return (
    <section className="route-options">
      <div className="section-heading">
        <div><span>ROUTE OPTIONS</span><strong>{result.routes.length} compared</strong></div>
        <span>Traffic-adjusted</span>
      </div>
      <div className="route-option-list">
        {result.routes.map((route, index) => {
          const selected = selectedRouteId ? route.id === selectedRouteId : route.recommended
          const label = route.recommended
            ? 'Recommended'
            : route.isDefault
              ? 'Usual route'
              : `Alternative ${index + 1}`
          return (
            <button
              key={route.id}
              className={`route-option ${selected ? 'is-selected' : ''}`}
              onClick={() => onSelect(route.id)}
            >
              <span className="route-option-icon"><RouteIcon size={16} /></span>
              <span className="route-option-copy">
                <span className="route-option-label">
                  <strong>{label}</strong>
                  {route.recommended && <i><Check size={11} /> BEST</i>}
                </span>
                <span className="route-option-detail">
                  <span><Clock3 size={13} /> {formatEta(route.adjustedEtaMin)}</span>
                  <span>{formatDistance(route.distanceKm)}</span>
                  <span><Gauge size={13} /> {route.congestion}</span>
                </span>
                {route.roadNames.length > 0 && (
                  <span className="route-roads">Via {route.roadNames.slice(0, 3).join(' / ')}</span>
                )}
              </span>
              <span className={`route-status status-${route.status}`}>
                {route.travelable ? route.status : 'blocked'}
              </span>
              {route.timeDifferenceMin > 0 && (
                <span className="route-difference">+{route.timeDifferenceMin} min</span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
