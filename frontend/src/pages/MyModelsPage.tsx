import { Link } from 'react-router-dom'

export default function MyModelsPage() {
  return (
    <div className="pt-20 max-w-6xl mx-auto px-8 pb-16">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-100">我的模型</h1>
        <p className="text-stone-500 mt-2">你上传重建的个人古建筑三维模型</p>
      </div>

      {/* 预留：暂无数据状态 */}
      <div className="flex flex-col items-center justify-center py-32 gap-6 text-center">
        <span className="text-6xl opacity-20">🏛</span>
        <div>
          <p className="text-stone-400 font-medium">还没有模型</p>
          <p className="text-stone-600 text-sm mt-1">上传古建筑照片，系统自动重建三维模型</p>
        </div>
        <Link
          to="/reconstruct"
          className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium rounded-full text-sm transition-colors"
        >
          开始重建
        </Link>
      </div>
    </div>
  )
}
