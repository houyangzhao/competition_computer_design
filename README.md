# 筑忆 · 古建筑数字化重建平台

> 中国大学生计算机设计大赛 2026 · 人工智能应用赛道

用户拍摄古建筑照片上传，系统自动完成 SfM 位姿估计 → 3D Gaussian Splatting 重建 → WebGL 实时渲染的完整闭环，让每个人都能为古建筑留下可交互的数字档案。

---

## 技术架构

```
浏览器 (React + WebGL)
    ↕  REST API
后端 (FastAPI)
    ↕  子进程
重建管线 (COLMAP → 3DGS → .splat)
```

| 层 | 技术 |
|---|---|
| 前端渲染 | React 18 + TypeScript + Tailwind CSS |
| 3D 渲染 | @mkkellogg/gaussian-splats-3d (WebGL) |
| 后端 API | FastAPI + uvicorn |
| SfM 重建 | COLMAP 3.11（GPU SIFT，从源码编译） |
| 神经渲染 | 3D Gaussian Splatting（graphdeco-inria） |
| 格式转换 | 自研 PLY → .splat 转换脚本（含坐标系修正） |

---

## 功能

| 功能 | 状态 |
|---|---|
| 浏览公共古建筑档案 | ✅ |
| 用户注册 / 登录 | ✅ |
| 上传照片 → 自动重建 → 实时进度 | ✅ |
| WebGL 三维模型交互查看 | ✅ |
| 我的模型管理 | ✅ |
| 众包贡献照片 | 🔜 接口已预留 |
| AI 建筑知识讲解 | 🔜 接口已预留 |

---

## 快速开始

### 环境要求

- GPU 服务器（RTX 3090 / 4090，CUDA 12.x）
- Ubuntu 22.04 + Python 3.10+
- Node.js 20+

### 1. 安装依赖（首次，约 20 分钟）

```bash
bash reconstruction/setup_autodl.sh
```

脚本会自动：
- 编译 COLMAP 3.11（支持 GPU SIFT）
- 克隆 gaussian-splatting 并编译 CUDA 扩展
- 安装后端 Python 依赖
- 写入环境变量到 `~/.bashrc`

### 2. 创建 Python 虚拟环境

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
```

### 3. 安装前端依赖

```bash
cd frontend && npm install
```

### 4. 启动项目

```bash
bash start_project.sh
```

- 前端：http://localhost:5173
- 后端 API 文档：http://localhost:8000/docs

```bash
bash stop_project.sh   # 停止
```

### 5. 手动重建（命令行）

```bash
# 将照片放入 <scene_dir>/input/ 后执行：
bash reconstruction/reconstruct.sh /path/to/scene_dir 7000
```

---

## 目录结构

```
.
├── frontend/                  # React 前端
│   ├── src/
│   │   ├── pages/             # 页面组件
│   │   ├── components/        # 通用组件（SplatViewer 等）
│   │   ├── lib/               # API 客户端
│   │   └── types/             # TypeScript 类型定义
│   └── public/
│       └── generated/         # 重建输出的 .splat 文件（运行时生成）
│
├── backend/                   # FastAPI 后端
│   ├── main.py                # 路由与重建任务调度
│   ├── models.py              # Pydantic 数据模型
│   ├── data/                  # buildings.json / users.json / jobs.json
│   └── storage/               # 用户上传文件（.gitignore）
│
├── reconstruction/            # 重建管线脚本 + 文档
│   ├── reconstruct.sh         # 一键重建入口（后端调用）
│   ├── convert_ply_to_splat.py # PLY → .splat 格式转换
│   ├── filter_images.py       # 图像预筛选（GPS 范围过滤）
│   ├── prune_by_cameras.py    # 后处理：基于相机位置剪枝漂浮点
│   ├── setup_autodl.sh        # 环境安装脚本
│   └── 重建流程实录.md         # COLMAP + 3DGS 完整踩坑记录
│
├── start_project.sh           # 启动前后端
└── stop_project.sh            # 停止前后端
```

---

## 重建管线说明

```
用户照片
  ↓ filter_images.py（GPS 筛选 / 均匀采样，≤300 张）
  ↓ COLMAP feature_extractor（GPU SIFT，xvfb-run headless）
  ↓ COLMAP exhaustive_matcher
  ↓ COLMAP mapper → 自动选最大子模型
  ↓ COLMAP image_undistorter
  ↓ 3DGS train.py（默认 7000 iter，可配置）
  ↓ convert_ply_to_splat.py（坐标系修正 + 场景居中）
  → .splat 文件（发布到 frontend/public/generated/）
```

关键参数（通过环境变量配置）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `ZHUYI_GAUSSIAN_SPLATTING_DIR` | `/root/Code/gaussian-splatting` | GS 目录 |
| `ZHUYI_RECON_ITERATIONS` | `7000` | 3DGS 训练步数 |
| `ZHUYI_COLMAP_NO_GPU` | `0` | `1` 为 CPU 模式（慢） |
| `ZHUYI_RECON_MIN_IMAGES` | `10` | 最少图片数 |

---

## 开发说明

### 预留接口

- `POST /api/contribute/{project_id}`：众包照片上传（前端 UI 已实现，后端待对接）
- `POST /api/chat`：AI 讲解（当前返回占位文本，待接入大模型）

### 添加新建筑

编辑 `backend/data/buildings.json`，`status` 为 `"pending"` 时显示"待重建"状态，`"ready"` + `modelPath` 时加载 3D 模型。

### 重建完成后更新建筑

将输出的 `.splat` 文件放入 `frontend/public/models/`，更新 `buildings.json` 中对应条目的 `modelPath` 和 `status`。
