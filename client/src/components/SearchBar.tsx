import { useEffect, useRef, useState } from 'react'
import { ArrowUpDown, Crosshair, Loader2, MapPin, Navigation, X } from 'lucide-react'
import { geocode } from '../lib/api'
import type { Endpoint, Place } from '../lib/types'

interface EndpointValue {
  label: string
  lat: number
  lng: number
}

interface Props {
  origin: EndpointValue | null
  dest: EndpointValue | null
  activeField: Endpoint
  tracking: boolean
  locating: boolean
  liveAccuracy: number | null
  geoError: string
  onFocusField: (field: Endpoint) => void
  onPick: (field: Endpoint, place: Place) => void
  onSwap: () => void
  onToggleLocation: () => void
  onClear: (field: Endpoint) => void
}

function Field({
  kind,
  placeholder,
  value,
  active,
  onFocus,
  onPick,
  onClear,
}: {
  kind: Endpoint
  placeholder: string
  value: EndpointValue | null
  active: boolean
  onFocus: () => void
  onPick: (place: Place) => void
  onClear: () => void
}) {
  const [text, setText] = useState(value?.label ?? '')
  const [results, setResults] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => setText(value?.label ?? ''), [value?.label])

  useEffect(() => {
    if (!open) return
    const query = text.trim()
    if (query.length < 3 || query === value?.label) {
      setResults([])
      setLoading(false)
      return
    }

    let current = true
    setLoading(true)
    const timeout = window.setTimeout(async () => {
      const places = await geocode(query)
      if (current) {
        setResults(places)
        setLoading(false)
      }
    }, 350)
    return () => {
      current = false
      window.clearTimeout(timeout)
    }
  }, [text, open, value?.label])

  useEffect(() => {
    function close(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div ref={boxRef} className="endpoint-field-wrap">
      <div className={`endpoint-field ${active ? 'is-active' : ''}`}>
        <span className={`endpoint-symbol ${kind}`}>{kind === 'origin' ? 'A' : 'B'}</span>
        <input
          value={text}
          placeholder={placeholder}
          onFocus={() => {
            onFocus()
            setOpen(true)
          }}
          onChange={(event) => {
            setText(event.target.value)
            setOpen(true)
          }}
        />
        {loading && <Loader2 className="animate-spin" size={16} />}
        {text && !loading && (
          <button
            className="field-clear"
            title={`Clear ${kind}`}
            onClick={() => {
              setText('')
              setResults([])
              onClear()
            }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="search-results scroll-slim">
          {results.map((place) => (
            <li key={`${place.lat}-${place.lng}`}>
              <button
                onClick={() => {
                  onPick(place)
                  setText(place.label)
                  setOpen(false)
                }}
              >
                <MapPin size={16} />
                <span className="search-result-copy">
                  <strong>{place.label}</strong>
                  {(place.road || place.area) && (
                    <small>{[place.road, place.area].filter(Boolean).join(' - ')}</small>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function SearchBar(props: Props) {
  return (
    <div className="route-search">
      <div className="endpoint-stack">
        <Field
          kind="origin"
          placeholder="Starting point"
          value={props.origin}
          active={props.activeField === 'origin'}
          onFocus={() => props.onFocusField('origin')}
          onPick={(place) => props.onPick('origin', place)}
          onClear={() => props.onClear('origin')}
        />
        <Field
          kind="dest"
          placeholder="Destination"
          value={props.dest}
          active={props.activeField === 'dest'}
          onFocus={() => props.onFocusField('dest')}
          onPick={(place) => props.onPick('dest', place)}
          onClear={() => props.onClear('dest')}
        />
        <span className="endpoint-rail" />
      </div>
      <button className="swap-button" title="Swap start and destination" onClick={props.onSwap}>
        <ArrowUpDown size={17} />
      </button>

      <button
        className={`live-toggle ${props.tracking ? 'is-live' : ''}`}
        onClick={props.onToggleLocation}
        disabled={props.locating}
      >
        {props.locating ? (
          <Loader2 className="animate-spin" size={16} />
        ) : props.tracking ? (
          <Navigation size={16} fill="currentColor" />
        ) : (
          <Crosshair size={16} />
        )}
        <span>
          {props.locating
            ? 'Finding precise location...'
            : props.tracking
              ? `Live location${props.liveAccuracy ? ` - ${props.liveAccuracy} m accuracy` : ''}`
              : 'Use live location'}
        </span>
        {props.tracking && <i>LIVE</i>}
      </button>
      {props.geoError && <p className="geo-error">{props.geoError}</p>}
    </div>
  )
}
