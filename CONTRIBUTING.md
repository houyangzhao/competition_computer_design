# 协作规范

## 分支策略

- `main` 分支受保护，不直接 push
- 新功能从 main 建分支：`feature/xxx`
- 修复问题从 main 建分支：`fix/xxx`
- 完成后提 PR，至少一人 review 后合并

```bash
# 开始新工作
git checkout main
git pull
git checkout -b feature/my-feature

# 完成后推送并提 PR
git push -u origin feature/my-feature
# 然后在 GitHub 上创建 Pull Request
```

## 开发环境搭建

```bash
# 1. 克隆仓库
git clone https://github.com/houyangzhao/competition_computer_design.git
cd competition_computer_design

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，按注释填写（mock 模式无需 GPU）

# 3. 安装依赖
scripts/setup.sh

# 4. 启动项目
scripts/start.sh

# 5. 停止项目（不要用 pkill）
scripts/stop.sh
```

- 前端：http://127.0.0.1:6006
- 后端 API 通过前端代理访问，不直接暴露

## 目录分工

| 目录 | 内容 | 说明 |
|------|------|------|
| `frontend/` | React + TypeScript | 前端页面和组件 |
| `backend/` | FastAPI | 后端 API 和业务逻辑 |
| `reconstruction/` | 重建管线 | COLMAP + 3DGS 脚本（仅负责人维护） |
| `scripts/` | 运维脚本 | 启停和安装脚本 |
| `docs/` | 文档 | 所有人可改 |
| `presentation/` | 答辩材料 | PPT、视频等 |

## 提交规范

- 一个 commit 做一件事，写清楚改了什么
- 提交前 `git status` 检查，不要提交不相关的文件
- 用 `git add <具体文件>` 而不是 `git add .`

### 不要提交的文件

以下文件已在 .gitignore 中，不应提交：

- `.env` — 包含密钥，只提交 `.env.example`
- `*.db` — 数据库运行时生成
- `*.splat` — 模型文件太大
- `backend/storage/` — 运行时存储
- `CLAUDE.md` — 个人 AI 工具配置

## 环境说明

项目使用两个独立 Python 环境：

| 环境 | 用途 | 说明 |
|------|------|------|
| `.venv` | Web 后端 | `scripts/setup.sh` 自动创建 |
| 系统 Python | 3DGS 重建 | 需要 GPU + CUDA，普通开发不需要 |

大多数开发工作只需要 `.venv`，设 `ZHUYI_RECONSTRUCTION_MODE=mock` 即可跳过 GPU 重建。
