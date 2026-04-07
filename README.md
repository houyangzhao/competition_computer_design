# 筑忆

面向古建筑数字化保护的 Web 平台。用户上传建筑照片，系统通过 3D Gaussian Splatting 自动重建三维模型，并提供在线浏览、AI 讲解、众包协作等功能。

## 功能概览

- 用户注册 / 登录 / 会话恢复
- 公共建筑档案浏览与知识卡片
- 3DGS 三维模型在线浏览（第一人称漫游）
- 照片上传 → 自动 3DGS 重建 → 结果预览与保存
- 公共项目众包照片上传
- 建筑 AI 讲解问答（DeepSeek）
- GPU 任务排队（同时只运行一个重建任务）
- mock 重建模式（无 GPU 时自动降级）

## 项目结构

```
├── backend/
│   ├── app/               FastAPI 应用包（config/auth/crud/chat/reconstruction/routes）
│   ├── models.py          Pydantic 数据模型
│   ├── data/              SQLite DB + 种子 JSON
│   └── main.py            入口：from app import create_app
├── frontend/              React 19 + TypeScript + Vite
├── reconstruction/        COLMAP + 3DGS 重建脚本（独立 CLI 工具集）
├── scripts/
│   ├── setup.sh           安装依赖（--gpu 装重建环境）
│   ├── start.sh           启动前后端
│   └── stop.sh            停止前后端
├── docs/                  文档
├── presentation/          答辩材料
├── .env                   运行时配置（不提交）
└── .env.example           配置模板
```

---

## 部署指南

### 前置条件

- Python 3.10+
- Node.js 20+（脚本自带 v22 兜底）
- （可选）NVIDIA GPU + CUDA 12.x + 编译好的 COLMAP（真实重建需要）

### 第一步：克隆仓库

```bash
git clone <repo-url>
cd competition_computer_design
```

### 第二步：配置环境变量

```bash
cp .env.example .env
vim .env   # 按需修改
```

关键变量说明：

| 变量 | 说明 | 示例 |
|------|------|------|
| `ZHUYI_AUTH_SECRET` | JWT 签名密钥 | 任意随机字符串 |
| `ZHUYI_DATA_DIR` | 大文件存储根目录。留空则存在 `backend/storage/` | `/root/autodl-tmp/zhuyi-data` |
| `ZHUYI_RECONSTRUCTION_MODE` | `real`=真实重建，`mock`=示例模型 | `mock` |
| `ZHUYI_RECON_PYTHON` | 重建用的 Python（需含 PyTorch+CUDA） | `/root/miniconda3/bin/python` |
| `ZHUYI_GAUSSIAN_SPLATTING_DIR` | gaussian-splatting 仓库路径 | `/root/gaussian-splatting` |
| `ZHUYI_COLMAP_NO_GPU` | `0`=GPU COLMAP，`1`=CPU COLMAP | `0` |
| `DEEPSEEK_API_KEY` | DeepSeek AI 讲解 API 密钥 | `sk-...` |

> **存储说明**：后端通过 FastAPI StaticFiles 直接 serve `.splat` 文件，不使用软链接。如果服务器有独立数据盘（如 AutoDL 的 `/root/autodl-tmp`），将 `ZHUYI_DATA_DIR` 指向该盘即可。不设置则所有文件存在项目目录内，适合本地开发。

### 第三步：安装依赖

```bash
scripts/setup.sh           # Web 依赖（Python venv + npm）
scripts/setup.sh --gpu     # 额外安装 COLMAP + 3DGS（需要 GPU 环境）
```

### 第四步：启动项目

```bash
scripts/start.sh
```

- 前端：`http://127.0.0.1:6006`
- 后端：`http://127.0.0.1:8000`（通过前端 Vite proxy 转发）

### 停止项目

```bash
scripts/stop.sh
```

**不要用 `pkill` 或手动 `kill`**，否则 PID 文件残留会导致下次启动跳过。

---

## 存储架构

### 数据流

- 运行时所有数据读写走 **SQLite**（`backend/data/zhuyi.db`）
- `backend/data/*.json` 仅作**种子数据**，数据库为空时导入一次
- 修改 JSON 文件不会影响已有数据库

### 文件存储

后端在 `create_app()` 中 mount `/generated` 和 `/models` 静态路由，直接 serve `.splat` 文件。前端 Vite 开发服务器通过 proxy 转发这两个路径到后端。

存储位置由 `ZHUYI_DATA_DIR` 决定：

| 路由 | 有 ZHUYI_DATA_DIR | 无 ZHUYI_DATA_DIR |
|------|-------------------|-------------------|
| `/models/` | `$ZHUYI_DATA_DIR/models/` | `backend/storage/models/` |
| `/generated/` | `$ZHUYI_DATA_DIR/generated/` | `backend/storage/generated/` |
| 重建任务 | `$ZHUYI_DATA_DIR/jobs/` | `backend/storage/jobs/` |

### 模型路径约定

- 种子模型：`/models/xxx.splat`
- 用户重建模型：`/generated/xxx.splat`
- `.splat` 文件已 gitignore，不提交

---

## 重建管线

用户上传照片后的完整流程：

```
上传照片 → jobs/<job_id>/raw/
    ↓
图片筛选（去重去模糊）→ input/
    ↓
COLMAP 稀疏重建（GPU）→ sparse/0/
    ↓
3DGS 训练（-r 4, 10000 迭代）→ output_10000/
    ↓
PLY → .splat 转换（自动剪枝）→ <scene>.splat
    ↓
发布到 generated/<building_id>.splat + 计算相机参数
```

- GPU 任务排队：同一时刻只有一个重建任务占用 GPU，其他排队等待
- 训练参数：`-r 4`（1/4 分辨率），`--min-opacity 0.1 --max-scale 0.05`（自动剪枝）
- 详细重建实录见 `reconstruction/重建流程实录.md`

### 真实重建环境要求

真实重建需要两个独立的 Python 环境：

| 环境 | 用途 | 要求 |
|------|------|------|
| `.venv` | Web 后端 FastAPI | 标准 venv，`pip install -r backend/requirements.txt` |
| 系统 Python | COLMAP + 3DGS 训练 | PyTorch + CUDA，需编译 diff-gaussian-rasterization 等 |

两个环境不要混用。`.env` 中 `ZHUYI_RECON_PYTHON` 指向系统 Python。

重建环境安装：`scripts/setup.sh --gpu` 或 `bash reconstruction/setup_gpu.sh`

---

## AutoDL 部署备注

AutoDL 环境的特殊配置：

```env
ZHUYI_DATA_DIR=/root/autodl-tmp/zhuyi-data
ZHUYI_RECON_PYTHON=/root/miniconda3/bin/python
ZHUYI_GAUSSIAN_SPLATTING_DIR=/root/gaussian-splatting
ZHUYI_COLMAP_NO_GPU=0
```

端口映射：前端 6006 → 公网 HTTPS，后端 8000 通过 Vite proxy 转发。
