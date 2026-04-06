import { Link } from 'react-router-dom'
import type { Building } from '../types'

interface BuildingCardProps {
  building: Building
}

const statusLabel: Record<Building['status'], { text: string; bg: string; textCol: string }> = {
  ready: { text: '已抢救', bg: 'bg-jade/20', textCol: 'text-jade' },
  pending: { text: '待抢救', bg: 'bg-paper/10', textCol: 'text-paper/40' },
  processing: { text: '重建中', bg: 'bg-gold/20', textCol: 'text-gold' },
}

export default function BuildingCard({ building }: BuildingCardProps) {
  const status = statusLabel[building.status]

  return (
    <Link
      to={`/building/${building.id}`}
      className="group block relative overflow-hidden rounded-sm border border-white/5 bg-white/5 transition-all duration-500 hover:border-gold/40 hover:shadow-[0_0_30px_rgba(212,175,55,0.05)]"
    >
      <div className="flex gap-4 p-3">
        <div className="relative h-28 w-28 flex-shrink-0 overflow-hidden border border-white/5 bg-stone-900">
          {building.coverImage ? (
            <img
              src={building.coverImage}
              alt={building.name}
              className="h-full w-full object-cover opacity-70 transition-transform duration-700 group-hover:scale-110 group-hover:opacity-100"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-ink">
              <span className="text-2xl opacity-10">🏛</span>
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 border-t border-white/5 bg-ink/80 py-1 text-center text-[8px] font-serif tracking-widest text-paper/60">
            {building.dynasty}
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between py-1">
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-serif text-lg font-bold tracking-wide text-paper transition-colors group-hover:text-gold">
                {building.name}
              </h3>
              <span className={`rounded-[2px] px-2 py-0.5 text-[8px] font-bold uppercase tracking-tighter ${status.bg} ${status.textCol}`}>
                {status.text}
              </span>
            </div>
            <p className="text-[10px] font-light uppercase tracking-widest text-paper/40">{building.location}</p>
          </div>

          <p className="line-clamp-2 text-[11px] italic leading-relaxed text-paper/50 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
            {building.description}
          </p>

          <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-2 text-[8px] font-mono tracking-widest">
            <span className="text-paper/20">PHOTOS {building.photoCount}</span>
            <span className="text-paper/20">CONTRIB {building.contributionCount}</span>
            <span className="font-bold text-gold/60 transition-colors group-hover:text-gold">VIEW ARCHIVE →</span>
          </div>
        </div>
      </div>

      <div className="absolute left-0 top-0 h-0 w-px bg-gold/40 transition-all duration-500 group-hover:h-full" />
      <div className="absolute bottom-0 right-0 h-0 w-px bg-gold/40 transition-all duration-500 group-hover:h-full" />
    </Link>
  )
}
