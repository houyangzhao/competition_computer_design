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

### 第二步：安装算法依赖

运行一键安装脚本（**约 20–40 分钟**，主要时间用于编译 COLMAP 和 CUDA 扩展）：

```bash
bash reconstruction/setup_autodl.sh
```

脚本完成后，执行以下命令使环境变量生效：

```bash
source ~/.bashrc
```

<details>
<summary>脚本自动完成的操作（点击展开）</summary>

1. 安装 COLMAP 编译依赖（cmake、boost、eigen3 等系统库）
2. 从源码编译 COLMAP 3.11，启用 GPU SIFT 加速
3. 克隆 graphdeco-inria/gaussian-splatting 并编译 CUDA 扩展
4. 安装 Python 依赖（plyfile、opencv 等）
5. 将路径写入 `~/.bashrc`

</details>

---

### 第三步：创建 Python 虚拟环境

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
```

---

### 第四步：安装前端依赖

> 如果服务器没有 Node.js 20+，请先安装：
> ```bash
> curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
> apt-get install -y nodejs
> ```

```bash
cd frontend
npm install
cd ..
```

---

### 第五步：启动项目

```bash
bash start_project.sh
```

启动成功后输出：

```
Backend  → http://0.0.0.0:8000
Frontend → http://0.0.0.0:5173
✅ 项目已启动
   前端: http://localhost:5173
   后端: http://localhost:8000/docs
```

浏览器访问 `http://<服务器IP>:5173` 即可使用。

停止项目：

```bash
bash stop_project.sh
```

---

### 第六步：验证重建功能（可选）

准备 20 张以上同一建筑的照片，测试完整重建流程：

```bash
# 1. 建立场景目录，照片放入 input/ 子目录
mkdir -p /tmp/test_scene/input
cp /path/to/your/photos/*.jpg /tmp/test_scene/input/

# 2. 运行重建（约 10–30 分钟，取决于图片数量和 GPU 型号）
bash reconstruction/reconstruct.sh /tmp/test_scene 7000

# 3. 重建完成后输出 .splat 文件
ls /tmp/test_scene/*.splat
```

将生成的 `.splat` 文件拖入前端页面的「上传重建」模块即可查看三维模型。

---

## 方案二：仅前端演示（无需 GPU）

如需快速查看系统界面和已有三维模型，无需 GPU 服务器，可在本地运行。

### 要求

- Python 3.10+
- Node.js 20+

### 步骤

```bash
# 1. 克隆项目
git clone https://github.com/houyangzhao/competition_computer_design.git
cd competition_computer_design

# 2. 后端依赖
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt

# 3. 前端依赖
cd frontend && npm install && cd ..

# 4. 启动（跳过 GPU 检查）
bash start_project.sh
```

> 此模式下「上传重建」功能无法运行（缺少 GPU 环境），但可以浏览建筑档案、查看已有三维模型，以及体验完整的前端交互。

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

---

### GPU SIFT 在 headless 服务器上崩溃

```
Failed to initialize OpenGL
```

脚本已通过 `xvfb-run` 提供虚拟 X 显示解决此问题。若仍报错，手动安装：

```bash
apt-get install -y xvfb libgl1-mesa-glx
```

---

### gaussian-splatting CUDA 扩展编译失败

```
TORCH_CUDA_ARCH_LIST not set
```

手动指定 GPU 架构后重新安装（RTX 4090 为 `8.9`，RTX 3090 为 `8.6`）：

```bash
export TORCH_CUDA_ARCH_LIST="8.9"
cd /root/Code/gaussian-splatting
pip install submodules/diff-gaussian-rasterization
pip install submodules/simple-knn
```

---

### 前端无法访问后端 API

检查 Vite 代理配置（`frontend/vite.config.ts`）：

```ts
proxy: { '/api': 'http://localhost:8000' }
```

确保后端在 `8000` 端口正常运行：

```bash
curl http://localhost:8000/api/health
# 返回 {"status":"ok"} 表示正常
```

---

### 端口被占用

```bash
# 查找占用进程
lsof -i :8000
lsof -i :5173

# 或直接停止项目
bash stop_project.sh
```

---

## 项目技术栈速览

| 模块 | 技术 | 说明 |
|------|------|------|
| 前端 | React 18 + TypeScript + Tailwind CSS | 单页应用 |
| 三维渲染 | @mkkellogg/gaussian-splats-3d | WebGL 实时渲染 .splat 模型 |
| 后端 | FastAPI + uvicorn | REST API + 重建任务调度 |
| SfM | COLMAP 3.11 | 从照片估计相机位姿，生成稀疏点云 |
| 神经渲染 | 3D Gaussian Splatting | 从点云训练辐射场，生成 .splat 文件 |

---

*如有部署问题，请联系项目负责人。*
