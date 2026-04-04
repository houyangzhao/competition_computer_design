export default function AboutPage() {
  return (
    <div className="pt-20 max-w-3xl mx-auto px-8 pb-16">
      <h1 className="text-3xl font-bold text-stone-100 mb-2">关于筑忆</h1>
      <p className="text-stone-500 mb-12">让每一座古建筑都有数字生命</p>

      {/* 项目背景 */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-amber-400 mb-4">项目背景</h2>
        <p className="text-stone-400 leading-relaxed">
          中国现有未定级不可移动文物超过76万处，大量散落在乡村的传统民居、祠堂、桥梁正在加速消亡。
          专业三维测绘成本高昂，绝大多数濒危古建筑在消失前无人记录。
        </p>
        <p className="text-stone-400 leading-relaxed mt-3">
          筑忆通过"手机拍照 → AI自动重建 → 三维永久存档"的零门槛流程，
          让每一个人都能成为古建筑数字保护的参与者。
        </p>
      </section>

      {/* 两种模式 */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-amber-400 mb-4">使用模式</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
            <h3 className="text-stone-100 font-medium mb-2">个人重建</h3>
            <p className="text-stone-500 text-sm leading-relaxed">
              上传你拍摄的古建筑照片，系统自动运行 COLMAP + 3D Gaussian Splatting 管线重建三维模型，保存到你的个人档案馆。
            </p>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
            <h3 className="text-stone-100 font-medium mb-2">公共众包</h3>
            <p className="text-stone-500 text-sm leading-relaxed">
              对于故宫这样的超大场景，人人可贡献照片到公共资源池，系统合并重建，共同构建高精度数字遗产档案。
            </p>
          </div>
        </div>
      </section>

      {/* 技术架构 */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-amber-400 mb-4">技术架构</h2>
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 font-mono text-sm text-stone-400">
          <div className="flex flex-col gap-2">
            <div>用户上传照片</div>
            <div className="ml-4 text-stone-600">↓</div>
            <div className="ml-4">COLMAP SfM — 自动估计相机位姿 + 稀疏点云</div>
            <div className="ml-4 text-stone-600">↓</div>
            <div className="ml-4">3D Gaussian Splatting — 训练高斯场景表示</div>
            <div className="ml-4 text-stone-600">↓</div>
            <div className="ml-4">导出 .splat — Web 端实时渲染漫游</div>
            <div className="ml-4 text-stone-600">↓</div>
            <div className="ml-4 text-amber-400">浏览器零插件，鼠标漫游三维古建筑</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { name: 'React 19', desc: '前端框架' },
            { name: 'Three.js', desc: '3D 渲染引擎' },
            { name: 'COLMAP', desc: '相机位姿估计' },
            { name: '3DGS', desc: '高斯溅射重建' },
            { name: 'FastAPI', desc: '后端服务' },
            { name: 'DeepSeek', desc: 'AI 知识引擎（预留）' },
            { name: 'AutoDL', desc: 'GPU 重建算力' },
            { name: '天地图', desc: '合规地图底图' },
          ].map(({ name, desc }) => (
            <div key={name} className="bg-stone-900 border border-stone-800 rounded-lg p-3 text-center">
              <p className="text-stone-100 text-sm font-medium">{name}</p>
              <p className="text-stone-600 text-xs mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 参赛信息 */}
      <section>
        <h2 className="text-xl font-semibold text-amber-400 mb-4">参赛信息</h2>
        <p className="text-stone-500 text-sm leading-relaxed">
          本项目参加 2026 年（第19届）中国大学生计算机设计大赛·软件应用与开发·Web应用与开发赛道。
        </p>
      </section>
    </div>
  )
}
