# SD_SMA_ReportEditor

Markdown 报表编辑器桌面软件。支持读取 MySQL/PostgreSQL 数据库与 OPC UA 变量，通过可视化界面配置报表模板，自动生成 Markdown 报表。

## 技术栈

- **后端**：Python 3.10+ / FastAPI / SQLAlchemy / asyncua
- **前端**：Electron / Vue 3 / Vite / Pinia
- **桌面壳**：Electron（内嵌 Vue 前端 + 启动 Python 后端子进程）

## 目录结构

```
SD_SMA_ReportEditor/
├── _Doc/           # 项目文档（计划、工单、变更记录）
├── backend/        # Python FastAPI 后端
├── frontend/       # Electron + Vue 3 前端
└── README.md
```

## 快速开始

### 后端

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

### Electron 桌面模式

```bash
cd frontend
npm run electron:dev
```

## 文档

- [项目计划](_Doc/001_项目计划.md)
- [里程碑与工单](_Doc/002_里程碑与工单.md)
