# 筑忆

筑忆是一个面向古建筑数字化保护的 Web 项目。当前版本已经具备以下能力：

- 用户注册、登录和会话恢复
- 公共建筑档案浏览与知识卡片展示
- 探索页示例 `.splat` 三维可视化预览
- 个人照片上传重建、任务轮询和结果预览
- 重建结果保存到“我的模型”
- 公共项目众包照片上传
- 建筑 AI 讲解问答接口，支持接入 DeepSeek
- 开发环境下的 mock 重建模式，以及真实 GPU 管线自动切换
- SQLite 持久化存储

## 项目结构

- `frontend/`: React 19 + TypeScript + Vite 前端
- `backend/`: FastAPI 后端与 SQLite 数据存储
- `reconstraction/`: 真实重建脚本、图片筛选与 `.splat` 转换工具

## 本地启动

1. 进入项目目录：`cd competition_computer_design`
2. 初始化依赖：`./setup_project.sh`
3. 启动项目：`./start_project.sh`
4. 停止项目：`./stop_project.sh`

默认前端运行在 `http://127.0.0.1:5173`，后端运行在 `http://127.0.0.1:8000`。

## 环境变量

可复制 `.env.example` 作为参考。最常用的是：

- `ZHUYI_RECONSTRUCTION_MODE=mock`
  纯本地开发时推荐，重建流程会自动使用示例模型走完整闭环。
- `ZHUYI_RECONSTRUCTION_MODE=real`
  强制走真实重建脚本，需要配置好 `gaussian-splatting` 环境。
- `ZHUYI_GAUSSIAN_SPLATTING_DIR=/root/gaussian-splatting`
  真实重建依赖目录。
- `ZHUYI_AUTH_SECRET=change-me`
  后端签发 token 的密钥。
- `ZHUYI_SQLITE_PATH=/path/to/backend/data/zhuyi.db`
  SQLite 数据库文件路径。
- `DEEPSEEK_API_KEY=...`
  配置后，建筑详情页的 AI 讲解会优先调用 DeepSeek；未配置时自动回退到本地知识库讲解。
- `DEEPSEEK_MODEL=deepseek-chat`
  默认使用 `deepseek-chat`，也可以改成 DeepSeek 官方支持的其他兼容模型。

建议先执行 `cp .env.example .env`，然后在 `.env` 里补上自己的 `DEEPSEEK_API_KEY`。

## 开发说明

- 后端当前默认使用 SQLite 存储用户、建筑、任务、众包和知识数据。
- 仓库里保留的 `backend/data/*.json` 主要用于初始化种子数据和旧数据迁移。
- 如果本机没有 GPU 管线，后端会在 `auto` 模式下自动降级到 mock 重建。
- 前端构建依赖 Node.js 20+；仓库脚本会优先尝试系统 Node，不满足时使用 `/tmp/node-v22.14.0-linux-x64/bin` 作为兜底。
- 启动脚本会自动加载项目根目录下的 `.env`，所以 DeepSeek 和重建相关变量都可以直接写在里面。
- 为避免把模型资产直接提交到仓库，默认不会跟踪 `.splat` 文件；如果你想体验探索页示例预览，可自行放置一个本地示例模型到 `frontend/public/models/bonsai.splat`。

## 后续建议

- 将 JSON 存储迁移到 PostgreSQL
- 为众包和个人模型增加后台审核与编辑能力
- 用任务队列替代进程内线程调度
- 接入地图底图与空间标注能力
