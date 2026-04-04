# 筑忆 MVP 实现计划

## Context

3天内交付校赛可演示的Web MVP，后续可持续迭代。当前已有React + Vite前端骨架，3DGS查看器能加载bonsai.splat。
单线开发，按顺序执行。AI对话等功能预留接口但MVP不实现。

---

## 产品定位

**"让任何人用手机照片为古建筑留下3D数字档案"**

### 两种使用模式

**个人重建模式**：
用户注册 → 上传古建筑多角度照片 → 后端自动运行COLMAP估计位姿+3DGS重建 → 等待动画 → 生成个人3D模型 → 保存到"我的模型"随时查看

**公共众包模式**（大场景如故宫）：
平台发起公共项目 → 人人上传照片 → 照片汇入公共资源池 → 合并重建 → 公共3D模型展示页

### 关键技术说明：位姿自动估计

用户**不需要提供相机位姿**。COLMAP的SfM（Structure from Motion）管线会自动完成：
1. 从照片中提取特征点
2. 跨照片匹配特征
3. 自动估计每张照片的相机位置和朝向
4. 输出稀疏点云 + 相机位姿

用户只需拍摄多角度、有足够重叠（>70%）的照片即可。

---

## 技术选型

| 层 | 选型 | 原因 |
|---|---|---|
| 前端框架 | React 19 + TypeScript + Vite 8 | 已搭建 |
| 路由 | react-router-dom v7 | 标准方案 |
| 样式 | TailwindCSS v4 | 最快出精美UI |
| 地图 | 天地图 (tianditu.gov.cn) | 自带审图号，竞赛合规 |
| 3D渲染 | @mkkellogg/gaussian-splats-3d | 已验证可用 |
| 后端 | FastAPI | 轻量异步，预留扩展接口 |
| AI对话 | **MVP不实现，预留接口** | 后续接入DeepSeek |
| 数据库 | 无，JSON文件 | MVP阶段够用，后续可迁移至PostgreSQL |
| 3D重建 | COLMAP（自动位姿估计）+ 3D Gaussian Splatting | 开源成熟，用户无需提供位姿 |
| 重建环境 | AutoDL (RTX 3090/4090) | 按时计费GPU |

---

## MVP页面结构

```
/                   首页：全屏3D背景 + 标语 + 入口
/explore            探索：公共古建筑3D模型浏览（地图/列表）
/building/:id       详情：3D漫游 + 建筑信息 + 预留AI对话面板
/reconstruct        重建：上传照片 → 等待动画 → 查看结果（MVP可简化为展示流程）
/my                 我的模型：个人重建历史（MVP预留页面）
/contribute/:id     众包贡献：为公共项目上传照片（MVP预留页面）
/about              关于：项目背景、技术架构、团队
```

---

## 任务清单

### 阶段一：获取一个可展示的古建筑.splat模型

- [ ] 1.1 寻找开源古建筑多角度照片数据集（或现成的古建筑3DGS/NeRF数据集）
- [ ] 1.2 编写AutoDL环境搭建脚本 setup_autodl.sh（COLMAP + 3DGS + 依赖）
- [ ] 1.3 编写一键重建脚本 reconstruct.sh（照片→COLMAP SfM自动位姿估计→3DGS训练→导出.ply）
- [ ] 1.4 编写 convert_ply_to_splat.py（PLY→.splat格式转换）
- [ ] 1.5 在AutoDL上跑通管线，生成1个古建筑.splat文件
- [ ] 1.6 下载.splat到本地，验证能在现有Web demo中加载渲染

### 阶段二：前端基础设施

- [ ] 2.1 安装新依赖（react-router-dom, tailwindcss, @tailwindcss/vite）
- [ ] 2.2 配置TailwindCSS
- [ ] 2.3 定义TypeScript类型（Building, ReconstructionJob, ChatMessage等，为两种模式预留）
- [ ] 2.4 创建路由（7个页面：/, /explore, /building/:id, /reconstruct, /my, /contribute/:id, /about）
- [ ] 2.5 App.tsx改为Layout组件（Navbar + Outlet）
- [ ] 2.6 创建建筑元数据文件 buildings.ts（含公共/个人标记）
- [ ] 2.7 创建API请求封装 lib/api.ts
- [ ] 2.8 COOP/COEP改为credentialless解决与地图的兼容

### 阶段三：核心组件开发

- [ ] 3.1 SplatViewer.tsx — 3DGS查看器组件（props: modelPath, cameraPosition等）
- [ ] 3.2 Navbar.tsx — 顶部导航（首页/探索/重建/我的/关于）
- [ ] 3.3 BuildingCard.tsx — 建筑卡片（缩略图+名称+朝代，用于列表和地图弹窗）
- [ ] 3.4 UploadZone.tsx — 照片上传区域（拖拽+点击上传，显示照片预览网格）
- [ ] 3.5 ReconstructProgress.tsx — 重建等待动画（进度条+阶段提示：特征提取中/匹配中/重建中）
- [ ] 3.6 ChatPanel.tsx — AI对话面板（预留，MVP显示"即将上线"占位）
- [ ] 3.7 KnowledgeCard.tsx — 知识卡片（预留）

### 阶段四：页面开发

- [ ] 4.1 HomePage — 全屏3D古建筑背景 + "筑忆"标语 + "开始探索"/"上传重建"双入口
- [ ] 4.2 ExplorePage — 上方天地图+标记，下方建筑卡片列表，支持切换地图/列表视图
- [ ] 4.3 BuildingPage — 左侧3D漫游 + 右侧面板（建筑简介+预留AI对话+预留知识卡片）
- [ ] 4.4 ReconstructPage — 三步流程：①上传照片 ②等待重建（动画） ③查看3D结果
- [ ] 4.5 MyModelsPage — 个人模型列表（MVP预留，显示示例数据）
- [ ] 4.6 ContributePage — 众包贡献页（MVP预留，显示项目信息+上传入口）
- [ ] 4.7 AboutPage — 项目背景、两种模式说明、技术架构图、团队

### 阶段五：后端骨架（预留扩展）

- [ ] 5.1 FastAPI项目初始化 + CORS配置
- [ ] 5.2 Pydantic模型定义（Building, ReconstructionJob, ChatRequest, ChatResponse）
- [ ] 5.3 GET /api/buildings — 建筑列表（支持?type=public|personal筛选）
- [ ] 5.4 GET /api/buildings/{id} — 建筑详情
- [ ] 5.5 POST /api/reconstruct — 接收上传照片，创建重建任务（MVP返回mock job_id）
- [ ] 5.6 GET /api/reconstruct/{job_id} — 查询重建进度（MVP返回mock进度）
- [ ] 5.7 POST /api/chat — 桩接口，返回"AI功能即将上线"
- [ ] 5.8 POST /api/contribute/{project_id} — 众包上传接口（桩）
- [ ] 5.9 buildings.json + knowledge/目录骨架
- [ ] 5.10 vite.config.ts 添加 /api 代理

### 阶段六：部署上线

- [ ] 6.1 docker-compose.yml（前端nginx + 后端fastapi）
- [ ] 6.2 nginx.conf（静态文件 + 反向代理 + COOP/COEP头）
- [ ] 6.3 前端生产构建
- [ ] 6.4 云服务器部署（直接用公网IP访问，无需域名和HTTPS）
- [ ] 6.5 上传.splat文件 + 全流程外网测试（http://公网IP）

### 阶段七：打磨

- [ ] 7.1 3D模型加载进度条
- [ ] 7.2 WebGL降级方案（不支持时显示静态图片）
- [ ] 7.3 移动端响应式
- [ ] 7.4 favicon + meta标签 + Open Graph
- [ ] 7.5 最终bug修复

---

## 文件结构

```
frontend/
├── public/models/                # .splat 模型文件
├── src/
│   ├── main.tsx                  # BrowserRouter
│   ├── App.tsx                   # Layout: Navbar + Outlet
│   ├── index.css                 # Tailwind directives
│   ├── components/
│   │   ├── SplatViewer.tsx       # 3DGS查看器
│   │   ├── Navbar.tsx            # 导航栏
│   │   ├── BuildingCard.tsx      # 建筑卡片
│   │   ├── UploadZone.tsx        # 照片上传区
│   │   ├── ReconstructProgress.tsx # 重建等待动画
│   │   ├── ChatPanel.tsx         # AI对话（预留）
│   │   └── KnowledgeCard.tsx     # 知识卡片（预留）
│   ├── pages/
│   │   ├── HomePage.tsx          # 全屏3D首页
│   │   ├── ExplorePage.tsx       # 探索（地图+列表）
│   │   ├── BuildingPage.tsx      # 建筑详情
│   │   ├── ReconstructPage.tsx   # 上传重建
│   │   ├── MyModelsPage.tsx      # 我的模型
│   │   ├── ContributePage.tsx    # 众包贡献
│   │   └── AboutPage.tsx         # 关于
│   ├── data/buildings.ts         # 建筑元数据
│   ├── types/index.ts            # 类型定义
│   └── lib/api.ts                # API封装

backend/
├── main.py                       # FastAPI入口
├── routers/
│   ├── buildings.py              # 建筑CRUD
│   ├── reconstruct.py            # 重建任务接口
│   ├── contribute.py             # 众包接口（桩）
│   └── chat.py                   # AI对话接口（桩）
├── services/
│   ├── reconstruction.py         # 重建任务调度（预留，MVP mock）
│   ├── deepseek.py               # DeepSeek客户端（预留）
│   └── knowledge.py              # 知识库加载（预留）
├── data/
│   ├── buildings.json
│   └── knowledge/
├── models.py
├── config.py
└── requirements.txt

reconstruction/
├── setup_autodl.sh               # AutoDL环境搭建
├── reconstruct.sh                # 一键重建脚本
├── convert_ply_to_splat.py       # PLY→.splat转换
└── README.md                     # 拍摄指南

deploy/
├── docker-compose.yml
├── nginx.conf
└── .env.example
```

---

## 风险与应对

| 风险 | 应对 |
|------|------|
| 找不到古建筑照片数据集 | 搜索Heritage/Cultural数据集；用bonsai兜底；手机拍身边老建筑 |
| 重建模型质量差 | 增加训练迭代次数；筛选高质量照片；多次尝试 |
| 天地图加载慢 | loading占位；最坏用静态地图图片替代 |
| COOP/COEP与地图冲突 | COEP用credentialless |
| 重建功能MVP来不及联通后端 | 前端展示完整UI流程（上传→等待→结果），用预制模型mock结果 |

---

## MVP校赛目标（3天）

**必须完成**：阶段一（1个古建筑.splat）+ 阶段二 + 阶段三 + 阶段四 + 阶段五
**尽量完成**：阶段六（部署）
**可以延后**：阶段七（打磨）

**校赛后持续迭代**：接入真实重建后端、AI对话、用户系统、众包功能
