import { useEffect, useState } from 'react'
import { Ban, CheckCircle2, MapPin, Send, TrafficCone, X } from 'lucide-react'
import type { LatLng, ReportStatus } from '../lib/types'
import { reverseGeocodeDetails } from '../lib/api'

interface Props {
  location: LatLng
  busy: boolean
  onSubmit: (data: { status: ReportStatus; note: string; road_name: string }) => void
  onCancel: () => void
}

const OPTIONS: { value: ReportStatus; label: string; icon: typeof Ban }[] = [
  { value: 'blocked', label: 'Blocked', icon: Ban },
  { value: 'slow', label: 'Slow', icon: TrafficCone },
  { value: 'clear', label: 'Clear', icon: CheckCircle2 },
]

export default function HintForm({ location, busy, onSubmit, onCancel }: Props) {
  const [status, setStatus] = useState<ReportStatus>('slow')
  const [note, setNote] = useState('')
  const [road, setRoad] = useState('')

  useEffect(() => {
    let current = true
    reverseGeocodeDetails(location.lat, location.lng).then((place) => {
      if (current && place) setRoad(place.road || place.label)
    })
    return () => { current = false }
  }, [location.lat, location.lng])

  return (
    <section className="report-form">
      <div className="report-form-heading">
        <div><span>NEW REPORT</span><h3>What is happening here?</h3></div>
        <button className="icon-button" onClick={onCancel} title="Cancel report"><X size={17} /></button>
      </div>

      <div className="status-picker" role="group" aria-label="Road condition">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            className={`${value} ${status === value ? 'active' : ''}`}
            onClick={() => setStatus(value)}
          >
            <Icon size={17} /> {label}
          </button>
        ))}
      </div>

      <label className="form-label">
        <span>Road or area</span>
        <div className="input-with-icon"><MapPin size={15} /><input className="field" value={road} onChange={(event) => setRoad(event.target.value)} /></div>
      </label>
      <label className="form-label">
        <span>What drivers should know</span>
        <textarea
          className="field"
          rows={3}
          maxLength={280}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Queue length, obstruction, road condition..."
        />
      </label>

      <button className="button button-primary w-full" onClick={() => onSubmit({ status, note, road_name: road })} disabled={busy}>
        <Send size={16} /> {busy ? 'Posting...' : 'Post road report'}
      </button>
    </section>
  )
}
