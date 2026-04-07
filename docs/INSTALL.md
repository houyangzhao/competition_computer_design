# 部署说明

本文档面向从零开始部署本项目的评委老师，提供两种部署方案。

---

## 方案一：完整部署（含三维重建功能）

适用于拥有 NVIDIA GPU 的 Linux 服务器，例如 **AutoDL 云服务器**。

### 硬件与系统要求

| 项目 | 要求 |
|------|------|
| GPU | NVIDIA RTX 3090 / 4090（显存 ≥ 16 GB） |
| 系统 | Ubuntu 20.04 / 22.04 |
| CUDA | 11.8 或 12.x |
| Python | 3.10 – 3.12 |
| Node.js | 20+ |
| 磁盘 | ≥ 30 GB 可用空间 |

> **推荐使用 AutoDL**（[autodl.com](https://www.autodl.com)）：选择「PyTorch 2.x + CUDA 12.x + Ubuntu 22.04」镜像，GPU 选 RTX 4090。

---

### 第一步：克隆项目

```bash
git clone https://github.com/houyangzhao/competition_computer_design.git
cd competition_computer_design
```

---

### 第二步：配置环境变量

```bash
cp .env.example .env
vim .env   # 按需修改
```

关键变量：

| 变量 | 说明 | 示例 |
|------|------|------|
| `ZHUYI_AUTH_SECRET` | JWT 签名密钥 | 任意随机字符串 |
| `ZHUYI_DATA_DIR` | 大文件存储根目录（留空则存在项目内） | `/root/autodl-tmp/zhuyi-data` |
| `ZHUYI_RECONSTRUCTION_MODE` | `real` 或 `mock` | `real` |
| `ZHUYI_RECON_PYTHON` | 系统 Python（含 PyTorch+CUDA） | `/root/miniconda3/bin/python` |
| `ZHUYI_COLMAP_NO_GPU` | `0`=GPU，`1`=CPU | `0` |
| `DEEPSEEK_API_KEY` | DeepSeek AI 对话密钥 | `sk-...` |

---

### 第三步：安装依赖

```bash
# Web 依赖（Python venv + 前端 npm）
scripts/setup.sh

# GPU 重建环境（COLMAP + 3D Gaussian Splatting）
scripts/setup.sh --gpu
```

> GPU 环境安装约 20–40 分钟，主要时间用于编译 COLMAP 和 CUDA 扩展。

---

### 第四步：启动项目

```bash
scripts/start.sh
```

启动成功后输出：

```
Backend started on http://127.0.0.1:8000
Frontend started on http://127.0.0.1:6006
```

- 前端访问：`http://<服务器IP>:6006`
- 后端 API 通过前端 Vite 代理访问，无需直接暴露

停止项目：

```bash
scripts/stop.sh
```

**不要用 `pkill` 或手动 `kill`**，否则 PID 文件残留会导致下次启动跳过。

---

### 第五步：验证重建功能（可选）

准备 20 张以上同一建筑的照片，测试完整重建流程：

```bash
# 1. 建立场景目录，照片放入 input/ 子目录
mkdir -p /tmp/test_scene/input
cp /path/to/your/photos/*.jpg /tmp/test_scene/input/

# 2. 运行重建（约 5–10 分钟）
bash reconstruction/reconstruct.sh /tmp/test_scene 10000

# 3. 重建完成后输出 .splat 文件
ls /tmp/test_scene/*.splat
```

或直接通过 Web 界面上传照片发起重建。

---

## 方案二：仅前端演示（无需 GPU）

如需快速查看系统界面和已有三维模型，无需 GPU 服务器。

### 要求

- Python 3.10+
- Node.js 20+

### 步骤

```bash
# 1. 克隆项目
git clone https://github.com/houyangzhao/competition_computer_design.git
cd competition_computer_design

# 2. 配置
cp .env.example .env
# 确保 ZHUYI_RECONSTRUCTION_MODE=mock

# 3. 安装依赖
scripts/setup.sh

# 4. 启动
scripts/start.sh
```

> 此模式下「上传重建」会使用示例模型（mock），但可以浏览建筑档案、查看已有三维模型，以及体验完整的前端交互。

---

## 常见问题

### COLMAP 编译失败

```
CMake Error: CUDA not found
```

确认 CUDA 已安装并在 PATH 中：

```bash
nvcc --version   # 应显示 CUDA 版本
nvidia-smi       # 应显示 GPU 信息
```

### GPU SIFT 在 headless 服务器上崩溃

```
Failed to initialize OpenGL
```

脚本已通过 `xvfb-run` 提供虚拟 X 显示解决此问题。若仍报错：

```bash
apt-get install -y xvfb libgl1-mesa-glx
```

### gaussian-splatting CUDA 扩展编译失败

手动指定 GPU 架构后重新安装（RTX 4090 为 `8.9`，RTX 3090 为 `8.6`）：

```bash
export TORCH_CUDA_ARCH_LIST="8.9"
cd /root/gaussian-splatting
pip install submodules/diff-gaussian-rasterization
pip install submodules/simple-knn
```

### 前端无法访问后端 API

检查后端是否正常运行：

```bash
curl http://localhost:8000/api/health
# 返回 {"ok": true, ...} 表示正常
```

### 端口被占用

```bash
# 正确的停止方式
scripts/stop.sh

# 查找占用进程
lsof -i :8000
lsof -i :6006
```

---

## 项目技术栈速览

| 模块 | 技术 | 说明 |
|------|------|------|
| 前端 | React 19 + TypeScript + Tailwind CSS | 单页应用 |
| 三维渲染 | @mkkellogg/gaussian-splats-3d | WebGL 实时渲染 .splat 模型 |
| 后端 | FastAPI + uvicorn | REST API + 重建任务调度 |
| SfM | COLMAP 3.11 | 从照片估计相机位姿，生成稀疏点云 |
| 神经渲染 | 3D Gaussian Splatting | 从点云训练辐射场，生成 .splat 文件 |
| AI 对话 | DeepSeek API | 建筑知识问答 |

---

*如有部署问题，请联系项目负责人。*
