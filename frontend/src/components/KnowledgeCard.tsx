import type { KnowledgeItem } from '../types'

export default function KnowledgeCard({ item }: { item: KnowledgeItem }) {
  return (
    <div className="bg-stone-900 border border-stone-800 rounded-lg p-4">
      <h4 className="text-amber-400 font-medium text-sm">{item.term}</h4>
      <p className="text-stone-400 text-sm mt-1 leading-relaxed">{item.description}</p>
    </div>
  )
}
