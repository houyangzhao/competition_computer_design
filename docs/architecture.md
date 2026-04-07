# 筑忆 (Zhuyi) — 系统架构原理图

## 1. 系统总览

```mermaid
graph TB
    subgraph User["用户端 (Browser)"]
        Browser["浏览器<br/>React 19 + Vite + Three.js"]
    end

    subgraph Frontend["前端 (Port 6006)"]
        direction TB
        Router["React Router 7"]
        Auth["AuthContext<br/>(localStorage 持久化)"]
        Pages["页面组件"]
        Splat["SplatViewer<br/>3DGS 渲染器"]
        API["lib/api.ts<br/>HTTP 客户端"]
    end

    subgraph Backend["后端 FastAPI (Port 8000)"]
        direction TB
        Endpoints["API 路由层"]
        AuthMW["认证中间件<br/>HMAC-SHA256 Token"]
        BizLogic["业务逻辑层"]
        ReconThread["重建线程池<br/>(daemon thread)"]
        DB["SQLite<br/>zhuyi.db"]
        Chat["AI 对话<br/>DeepSeek API"]
    end

    subgraph Pipeline["重建流水线 (subprocess)"]
        direction TB
        Filter["filter_images.py<br/>GPS 筛选"]
        COLMAP["COLMAP SfM<br/>特征提取/匹配/稀疏重建"]
        GS["3DGS train.py<br/>高斯泼溅训练"]
        Convert["convert_ply_to_splat.py<br/>PLY→.splat + outdoor_arch"]
        CamCalc["compute_camera_settings.py<br/>相机参数计算"]
    end

    subgraph Storage["文件存储"]
        JobFiles["storage/jobs/{id}/<br/>raw/ input/ output_N/ sparse/"]
        PublicModels["frontend/public/generated/<br/>{id}.splat + covers/"]
    end

    Browser -->|HTTPS| Frontend
    Frontend -->|"/api/*" 代理| Backend

    Router --> Pages
    Pages --> Splat
    Pages --> API
    API -->|Bearer Token| Endpoints

    Endpoints --> AuthMW
    AuthMW --> BizLogic
    BizLogic --> DB
    BizLogic --> ReconThread
    BizLogic --> Chat

    ReconThread -->|subprocess| Pipeline
    Filter --> COLMAP --> GS --> Convert --> CamCalc

    ReconThread -->|写入| JobFiles
    ReconThread -->|发布| PublicModels
    Splat -->|GET .splat| PublicModels
```

## 2. 页面路由与组件关系

```mermaid
graph LR
    subgraph Routes["路由 (React Router)"]
        Home["/ <br/>HomePage"]
        Explore["/explore<br/>ExplorePage"]
        Building["/building/:id<br/>BuildingPage"]
        Recon["/reconstruct<br/>ReconstructPage"]
        My["/my<br/>MyModelsPage"]
        Contrib["/contribute/:id<br/>ContributePage"]
        About["/about<br/>AboutPage"]
    end

    subgraph Components["共享组件"]
        Navbar["Navbar<br/>顶部导航 + 用户状态"]
        AuthModal["AuthModal<br/>登录/注册弹窗"]
        SplatViewer["SplatViewer<br/>3DGS 第一人称漫游"]
        ChatPanel["ChatPanel<br/>AI 建筑问答"]
        ReconProgress["ReconstructProgress<br/>重建进度条"]
        BuildingCard["BuildingCard<br/>建筑预览卡片"]
        KnowledgeCard["KnowledgeCard<br/>建筑构件知识"]
    end

    subgraph State["全局状态"]
        AuthCtx["AuthContext<br/>{user, token, login, logout}"]
        LS["localStorage<br/>zhuyi_auth"]
    end

    Home --> SplatViewer
    Explore --> BuildingCard
    Explore --> SplatViewer
    Building --> SplatViewer
    Building --> ChatPanel
    Building --> KnowledgeCard
    Recon --> ReconProgress
    Recon --> SplatViewer
    My --> BuildingCard

    Navbar --> AuthModal
    AuthModal --> AuthCtx
    AuthCtx --> LS
```

## 3. 后端 API 全景

```mermaid
graph TB
    subgraph Public["公开接口"]
        Health["GET /api/health"]
        Overview["GET /api/overview"]
        ListBuildings["GET /api/buildings"]
        GetBuilding["GET /api/buildings/:id"]
        GetKnowledge["GET /api/buildings/:id/knowledge"]
    end

    subgraph AuthEndpoints["认证接口"]
        Register["POST /api/auth/register"]
        RegisterAdmin["POST /api/auth/register-admin<br/>(需 adminCode)"]
        Login["POST /api/auth/login"]
        Me["GET /api/auth/me"]
    end

    subgraph Protected["需登录接口"]
        MyBuildings["GET /api/my/buildings"]
        StartRecon["POST /api/reconstruct<br/>(上传照片)"]
        PollJob["GET /api/reconstruct/:job_id"]
        SaveJob["POST /api/reconstruct/:job_id/save"]
        ChatAPI["POST /api/chat"]
        Contribute["POST /api/contribute/:id"]
    end

    subgraph Admin["管理员接口"]
        CreateProject["POST /api/admin/projects"]
        DeleteProject["DELETE /api/admin/projects/:id"]
        ImportModel["POST /api/admin/import-model"]
    end

    subgraph DB["SQLite Tables"]
        Users["users<br/>(id, email, payload)"]
        Buildings["buildings<br/>(id, type, owner_id, status, payload)"]
        Jobs["jobs<br/>(id, status, owner_id, payload)"]
        Contributions["contributions<br/>(id, building_id, contributor_id, payload)"]
        Knowledge["knowledge_items<br/>(building_id, term, payload)"]
    end

    Register --> Users
    Login --> Users
    ListBuildings --> Buildings
    StartRecon --> Jobs
    SaveJob --> Buildings
    Contribute --> Contributions
    GetKnowledge --> Knowledge
    ChatAPI -->|DeepSeek/本地回退| Buildings
```

## 4. 重建流水线（核心流程）

```mermaid
flowchart TB
    Upload["用户上传照片<br/>POST /api/reconstruct"]
    -->|"存入 storage/jobs/{id}/raw/"| Queue["创建 Job<br/>status=queued"]
    --> Thread["启动后台线程<br/>process_reconstruction_job()"]

    Thread --> ModeCheck{"RECONSTRUCTION_MODE?"}

    ModeCheck -->|real| RealPipeline
    ModeCheck -->|auto| AutoCheck{"GPU + 脚本可用?"}
    ModeCheck -->|mock| MockPipeline

    AutoCheck -->|是| RealPipeline
    AutoCheck -->|否| MockPipeline

    subgraph RealPipeline["_run_real_pipeline()"]
        direction TB
        R1["1. filter_images.py<br/>GPS 筛选 → input/"]
        --> R2["2. reconstruct.sh<br/>COLMAP 特征提取/匹配/稀疏重建"]
        --> R3["3. train.py<br/>3DGS 训练 (10k iterations, -r 2)"]
        --> R4["4. convert_ply_to_splat.py<br/>--transform outdoor_arch"]
        --> R5["5. detect_model_output()<br/>找到 .splat 文件"]
        --> R6["6. publish_model()<br/>复制到 frontend/public/generated/"]
        --> R7["7. compute_camera_settings.py<br/>从 COLMAP 计算 up/position/lookAt"]
        --> R8["8. update_job(status=done,<br/>modelPath, cameraSettings)"]
    end

    subgraph MockPipeline["run_mock_reconstruction()"]
        direction TB
        M1["1. 复制照片到 input/"]
        --> M2["2. 模拟延迟 (0.7s)"]
        --> M3["3. 复制 bonsai.splat 作为样例"]
        --> M4["4. update_job(status=done,<br/>modelPath, cameraSettings=null)"]
    end

    RealPipeline --> Poll
    MockPipeline --> Poll

    Poll["前端轮询 GET /api/reconstruct/:id<br/>每 1.2s"]
    --> Done{"status == done?"}
    Done -->|是| Preview["SplatViewer 预览"]
    --> Save["用户点击'保存'<br/>POST /reconstruct/:id/save"]
    --> CreateBuilding["create_personal_building_from_job()<br/>写入 buildings 表 (含 cameraSettings)"]

    Done -->|否| Poll

    style RealPipeline fill:#e8f5e9
    style MockPipeline fill:#fff3e0
```

## 5. 认证流程

```mermaid
sequenceDiagram
    participant U as 用户浏览器
    participant F as 前端 (React)
    participant B as 后端 (FastAPI)
    participant DB as SQLite

    Note over U,DB: 注册流程
    U->>F: 填写 用户名/邮箱/密码
    F->>B: POST /api/auth/register
    B->>B: hash_password(password) → (salt, digest)
    B->>DB: INSERT INTO users (id, email, payload)
    B-->>F: {user, token}
    F->>F: localStorage.setItem("zhuyi_auth", {user, token})

    Note over U,DB: 登录流程
    U->>F: 填写 邮箱/密码
    F->>B: POST /api/auth/login
    B->>DB: SELECT * FROM users WHERE email=?
    B->>B: verify_password(input, hash, salt)
    B-->>F: {user, token}
    F->>F: localStorage 持久化

    Note over U,DB: 请求认证
    F->>B: GET /api/my/buildings<br/>Authorization: Bearer {token}
    B->>B: parse_token() → HMAC-SHA256 验签
    B->>DB: SELECT * FROM users WHERE id=?
    B-->>F: Building[]

    Note over U,DB: 会话恢复 (刷新页面)
    F->>F: loadAuthState() from localStorage
    F->>B: GET /api/auth/me (Bearer token)
    B-->>F: User (有效) / 401 (过期)
```

## 6. 3DGS 查看器数据流

```mermaid
flowchart LR
    subgraph Backend
        DB["buildings 表<br/>cameraSettings JSON"]
    end

    subgraph Frontend
        Page["BuildingPage"]
        -->|"GET /api/buildings/:id"| Fetch["获取 building 数据<br/>{modelPath, cameraSettings}"]
        --> SV["SplatViewer 组件"]
    end

    subgraph SplatViewer["SplatViewer 内部"]
        direction TB
        Init["创建 GaussianSplats3D.Viewer<br/>useBuiltInControls: false"]
        --> Load["addSplatScene(modelPath)<br/>加载 .splat 文件"]
        --> Camera["设置相机<br/>position / up / lookAt"]
        --> Lock["原生 PointerLock API"]
        --> Controls["第一人称控制"]
    end

    subgraph Controls["控制系统"]
        direction TB
        Mouse["鼠标移动 → Yaw/Pitch<br/>Q = Q_yaw(Σyaw) · Q₀ · Q_pitch(Σpitch)"]
        Keys["WASD = 水平移动<br/>Space/Q = 垂直<br/>Shift = 加速"]
    end

    PublicDir["frontend/public/generated/<br/>{id}.splat (30-50MB)"]
    SV -->|HTTP GET| PublicDir
    DB -->|API| Fetch

    style SplatViewer fill:#e3f2fd
```

## 7. 坐标系变换原理

```mermaid
graph LR
    subgraph COLMAP["COLMAP 世界坐标系"]
        C_Y["Y 轴 = 物理下方 ↓"]
        C_X["X 轴 = 水平"]
        C_Z["Z 轴 = 水平"]
    end

    subgraph Transform["outdoor_arch 变换"]
        R["R = [[0,0,-1],<br/>     [-1,0,0],<br/>     [0,1,0]]"]
        Op["pos_splat = R · (pos - center)"]
    end

    subgraph Viewer["Three.js / Viewer 坐标系"]
        V_Y["Y 轴 = 物理上方 ↑"]
        V_X["X 轴 = 水平"]
        V_Z["Z 轴 = 水平"]
    end

    COLMAP -->|"R_ARCH"| Transform --> Viewer

    subgraph CameraCalc["相机参数计算"]
        direction TB
        S1["1. 从 images.bin 读所有相机位姿"]
        S2["2. 选距中位点最近的相机"]
        S3["3. position = R_ARCH · (C_world - center)"]
        S4["4. up = R_ARCH · (R^T · [0,-1,0])"]
        S5["5. lookAt = [0,0,0] (场景原点)"]
    end
```

## 8. 数据存储全景

```mermaid
graph TB
    subgraph SQLite["SQLite (zhuyi.db)"]
        Users["users<br/>id | email | payload(JSON)"]
        Buildings["buildings<br/>id | type | owner_id | status<br/>name | payload(JSON 含 cameraSettings)"]
        Jobs["jobs<br/>id | status | owner_id<br/>payload(JSON 含 modelPath, cameraSettings)"]
        Contribs["contributions<br/>id | building_id | contributor_id<br/>photo_count | payload"]
        Knowledge["knowledge_items<br/>building_id | term | payload"]
    end

    subgraph FileSystem["文件系统"]
        subgraph JobStorage["backend/storage/jobs/{id}/"]
            Raw["raw/ — 原始照片"]
            Input["input/ — 筛选后照片"]
            Sparse["sparse/0/ — COLMAP 稀疏模型<br/>(images.bin, cameras.bin, points3D.bin)"]
            Output["output_N/ — 3DGS 训练输出<br/>point_cloud/iteration_N/point_cloud.ply"]
            Log["reconstruction.log"]
        end

        subgraph PublicAssets["frontend/public/"]
            Models["models/ — 预置模型 (bonsai.splat)"]
            Generated["generated/ — 用户重建结果<br/>{job_id}.splat"]
            Covers["generated/covers/ — 封面图"]
        end
    end

    subgraph SeedData["种子数据 (仅首次导入)"]
        BJSON["buildings.json"]
        KJSON["knowledge.json"]
    end

    SeedData -->|"DB 空时导入"| SQLite
    Jobs -->|"jobDir 指向"| JobStorage
    Buildings -->|"modelPath 指向"| Generated
```

## 9. 技术栈一览

| 层级 | 技术 | 用途 |
|------|------|------|
| **前端框架** | React 19 + TypeScript | SPA 应用 |
| **构建工具** | Vite 8 | 开发服务器 + 打包 |
| **样式** | Tailwind CSS 4.2 | 原子化 CSS |
| **动画** | Framer Motion 12 | 页面过渡动画 |
| **路由** | React Router 7 | 客户端路由 |
| **3D 渲染** | Three.js 0.183 | WebGL 抽象层 |
| **3DGS 库** | @mkkellogg/gaussian-splats-3d 0.4 | .splat 加载与渲染 |
| **后端框架** | FastAPI 0.116 | REST API |
| **运行时** | Uvicorn 0.35 | ASGI 服务器 |
| **数据库** | SQLite 3 | 持久化存储 |
| **数据校验** | Pydantic v2 | 模型校验 |
| **AI 对话** | DeepSeek API | 建筑知识问答 |
| **SfM** | COLMAP | 多视图几何重建 |
| **3D 重建** | 3D Gaussian Splatting | 辐射场训练 |
| **图像处理** | Pillow + NumPy | 封面生成、点云处理 |
| **部署** | AutoDL (RTX 4080 SUPER) | GPU 服务器 |

## 10. 端口与部署

```
AutoDL 服务器
├── Port 6006 → 前端 Vite 开发服务器 → 公网 HTTPS (AutoDL 映射)
├── Port 8000 → 后端 FastAPI (仅内网，由 Vite 代理 /api/*)
└── Port 6008 → 备用端口 → 公网 HTTPS (AutoDL 映射)

Vite 代理规则: /api/* → http://localhost:8000/api/*
前端直接服务: /generated/*.splat, /models/*.splat (静态文件)
```
