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
      className="group block relative bg-white/5 border border-white/5 rounded-sm overflow-hidden hover:border-gold/40 transition-all duration-500 hover:shadow-[0_0_30px_rgba(212,175,55,0.05)]"
    >
      <div className="flex gap-4 p-3">
        {/* 封面图容器 */}
        <div className="relative w-28 h-28 flex-shrink-0 bg-stone-900 overflow-hidden border border-white/5">
          {building.coverImage ? (
            <img 
              src={building.coverImage} 
              alt={building.name} 
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-70 group-hover:opacity-100" 
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-ink">
              <span className="text-2xl opacity-10">🏛</span>
            </div>
          )}
          {/* 朝代徽章 */}
          <div className="absolute bottom-0 left-0 right-0 bg-ink/80 py-1 text-[8px] text-center text-paper/60 font-serif tracking-widest border-t border-white/5">
            {building.dynasty}
          </div>
        </div>

        {/* 信息区 */}
        <div className="flex-1 flex flex-col justify-between py-1">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-bold text-lg text-paper tracking-wide group-hover:text-gold transition-colors">
                {building.name}
              </h3>
              <span className={`px-2 py-0.5 rounded-[2px] text-[8px] font-bold tracking-tighter uppercase ${status.bg} ${status.textCol}`}>
                {status.text}
              </span>
            </div>
            <p className="text-[10px] text-paper/40 tracking-widest uppercase font-light">
              {building.location}
            </p>
          </div>
          
          <p className="text-[11px] text-paper/50 line-clamp-2 leading-relaxed font-light italic opacity-0 group-hover:opacity-100 transition-opacity duration-500">
            {building.description}
          </p>

          <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
            <span className="text-[8px] text-paper/20 tracking-widest font-mono">ID: {building.id.slice(0, 8)}</span>
            <span className="text-[8px] text-gold/60 group-hover:text-gold transition-colors tracking-widest font-bold">VIEW ARCHIVE →</span>
          </div>
        </div>
      </div>

      {/* 悬停时的金线动效 */}
      <div className="absolute top-0 left-0 w-px h-0 bg-gold/40 group-hover:h-full transition-all duration-500" />
      <div className="absolute bottom-0 right-0 w-px h-0 bg-gold/40 group-hover:h-full transition-all duration-500" />
    </Link>
  )
}
