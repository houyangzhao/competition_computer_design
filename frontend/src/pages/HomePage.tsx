import { Link } from 'react-router-dom'
import SplatViewer from '../components/SplatViewer'

export default function HomePage() {
  const stats = [
    { label: '已抢救模型', value: '1,284' },
    { label: '众包照片', value: '42,900+' },
    { label: '覆盖省份', value: '28' },
  ]

  return (
    <div className="relative w-full h-screen overflow-hidden bg-ink">
      {/* 全屏 3D 背景层 */}
      <div className="absolute inset-0 z-0">
        <SplatViewer
          modelPath="/models/bonsai.splat"
          initialCameraPosition={[2, -1.5, -2]}
          initialCameraLookAt={[0, 0, 0]}
        />
      </div>

      {/* 艺术遮罩：模拟水墨渐变和暗角 */}
      <div className="absolute inset-0 bg-gradient-to-tr from-ink via-transparent to-ink/20 pointer-events-none z-10" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(10,12,13,0.4)_100%)] pointer-events-none z-10" />

      {/* 核心内容区 */}
      <div className="relative z-20 h-full flex flex-col items-center justify-center px-6 pointer-events-none">
        <div className="max-w-4xl w-full text-center space-y-8 pointer-events-auto">
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <h1 className="text-8xl md:text-9xl font-serif font-bold tracking-[0.4em] text-paper drop-shadow-2xl">
              筑<span className="text-cinnabar">忆</span>
            </h1>
            <div className="h-px w-24 bg-gold/40 mx-auto" />
            <p className="text-xl md:text-2xl text-paper/80 font-serif tracking-[0.3em] uppercase">
              濒危古建筑数字抢救平台
            </p>
          </div>

          <p className="max-w-xl mx-auto text-paper/50 text-sm md:text-base leading-relaxed tracking-widest font-light animate-in fade-in duration-1000 delay-300">
            我们不与专业测绘比精度，只为在它们消失前留下最后的数字基因。
            <br />
            手机拍照，AI 自动重建，全民参与的数字文保行动。
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8 animate-in fade-in duration-1000 delay-500">
            <Link
              to="/explore"
              className="group relative px-10 py-4 bg-cinnabar/90 hover:bg-cinnabar text-white text-sm font-bold tracking-[0.3em] rounded-sm transition-all gold-border cinnabar-glow overflow-hidden"
            >
              <span className="relative z-10">探索数字档案</span>
              <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            </Link>
            <Link
              to="/reconstruct"
              className="px-10 py-4 glass-panel text-paper/80 hover:text-paper text-sm font-bold tracking-[0.3em] rounded-sm transition-all hover:bg-white/5 border-white/10"
            >
              开始图像重建
            </Link>
          </div>
        </div>

        {/* 底部实时数据面板 */}
        <div className="absolute bottom-12 left-0 right-0 px-12 hidden lg:block animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-700 pointer-events-auto">
          <div className="max-w-7xl mx-auto flex justify-between items-end border-t border-white/5 pt-8">
            <div className="flex gap-16">
              {stats.map((stat) => (
                <div key={stat.label} className="space-y-1">
                  <p className="text-[10px] text-paper/40 uppercase tracking-[0.2em]">{stat.label}</p>
                  <p className="text-2xl font-serif text-gold tracking-tighter">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="text-right">
              <p className="text-[10px] text-paper/40 uppercase tracking-[0.2em] mb-2">交互指南</p>
              <div className="flex gap-4 text-[10px] text-paper/60 font-mono tracking-widest">
                <span>ROTATE: MOUSE L</span>
                <span className="w-1 h-1 bg-white/20 rounded-full my-auto" />
                <span>ZOOM: SCROLL</span>
                <span className="w-1 h-1 bg-white/20 rounded-full my-auto" />
                <span>PAN: MOUSE R</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 装饰性边缘阴影 */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-ink/80 to-transparent pointer-events-none z-30" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink/80 to-transparent pointer-events-none z-30" />
    </div>
  )
}
