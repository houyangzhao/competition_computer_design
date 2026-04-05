import { useParams, Link } from 'react-router-dom'
import { getBuildingById } from '../data/buildings'

export default function ContributePage() {
  const { id } = useParams<{ id: string }>()
  const building = getBuildingById(id ?? '')

  return (
    <div className="pt-20 max-w-2xl mx-auto px-8 pb-16">
      <Link to={`/building/${id}`} className="text-stone-500 hover:text-amber-400 text-sm transition-colors">
        ← 返回建筑详情
      </Link>

      <div className="mt-6 mb-8">
        <h1 className="text-3xl font-bold text-stone-100">众包贡献</h1>
        {building && (
          <p className="text-amber-400 mt-1">{building.name}</p>
        )}
        <p className="text-stone-500 mt-2">
          为公共大型古建筑项目贡献你的照片，共同构建高精度三维数字档案
        </p>
      </div>

      {/* 说明 */}
      <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 mb-8">
        <h3 className="text-stone-100 font-medium mb-3">拍摄要求</h3>
        <ul className="text-stone-400 text-sm space-y-2">
          <li>• 相邻照片重叠率 ≥ 70%</li>
          <li>• 环绕建筑多角度拍摄，包含仰拍和平拍</li>
          <li>• 光线均匀，避免强烈阴影和逆光</li>
          <li>• 保持相机稳定，避免运动模糊</li>
          <li>• 无需提供相机位姿，系统自动估计</li>
        </ul>
      </div>

      {/* 众包上传（预留，结构与 ReconstructPage 一致） */}
      <div className="border-2 border-dashed border-stone-700 rounded-xl p-16 flex flex-col items-center gap-4 text-center">
        <span className="text-4xl">📷</span>
        <p className="text-stone-400">众包上传功能即将上线</p>
        <p className="text-stone-600 text-sm">接口已预留，敬请期待</p>
      </div>
    </div>
  )
}
