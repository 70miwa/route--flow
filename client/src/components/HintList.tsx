import { Clock3, Inbox, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react'
import type { Report } from '../lib/types'
import { STATUS_META, timeAgo } from '../lib/geo'

interface Props {
  reports: Report[]
  currentUserId: number | null
  onVote: (id: number, vote: 'confirm' | 'dispute') => void
  onFocus: (report: Report) => void
  onDelete: (id: number) => void
}

export default function HintList({ reports, currentUserId, onVote, onFocus, onDelete }: Props) {
  if (!reports.length) {
    return (
      <div className="reports-empty">
        <Inbox size={23} />
        <strong>No recent reports</strong>
        <span>Road reports from drivers will appear here.</span>
      </div>
    )
  }

  return (
    <div className="report-list">
      {reports.map((report) => {
        const meta = STATUS_META[report.status]
        return (
          <article className="report-row" key={report.id}>
            <button className="report-main" onClick={() => onFocus(report)}>
              <span className="report-status-dot" style={{ background: meta.color }} />
              <span className="report-copy">
                <span className="report-title"><strong style={{ color: meta.color }}>{meta.label}</strong>{report.road_name && <span>{report.road_name}</span>}</span>
                {report.note && <span className="report-note">{report.note}</span>}
                <span className="report-meta"><span>@{report.author}</span><span><Clock3 size={11} /> {timeAgo(report.created_at)}</span></span>
              </span>
            </button>
            <div className="report-actions">
              <button className={report.my_vote === 'confirm' ? 'is-confirmed' : ''} onClick={() => onVote(report.id, 'confirm')} title="Confirm"><ThumbsUp size={13} /> {report.confirms}</button>
              <button className={report.my_vote === 'dispute' ? 'is-disputed' : ''} onClick={() => onVote(report.id, 'dispute')} title="Dispute"><ThumbsDown size={13} /> {report.disputes}</button>
              {currentUserId === report.user_id && <button className="delete-report" onClick={() => onDelete(report.id)} title="Delete"><Trash2 size={13} /></button>}
            </div>
          </article>
        )
      })}
    </div>
  )
}
