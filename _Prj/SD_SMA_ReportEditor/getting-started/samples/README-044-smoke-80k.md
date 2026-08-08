# 044 冒烟：导出 8 万条（不设 5 万硬上限）

目标：验证分卷导出取数不再静默截断到 50000。

## A. Docker MariaDB（推荐，与现网一致）

### 一次性前置（需管理员）

本机当前状态：
- Docker Desktop **已安装**
- **WSL2 未安装** → Desktop 无法启动引擎

请用**管理员 PowerShell**执行：

```powershell
wsl --install
```

重启电脑 → 打开 **Docker Desktop** → 等到左下角绿色 Running。

### 一键灌库 + 模版

```powershell
cd _Prj\SD_SMA_ReportEditor
.\scripts\dev\setup_044_docker.ps1
```

会：
1. `docker compose up -d mariadb`（口令见 `.env` 的 `MARIADB_ROOT_PASSWORD`）
2. 在 `report_user_lib.demo_metrics` 插入 **80000** 行（`batch_no=SMOKE_80K`）
3. 写入 AI 版数据源连接 `local-docker-mariadb-044`
4. 写入模版 **测试·044·8万条分卷导出**（非批次，输出到桌面 `ReportEditor044Smoke`）

### 导出验收

1. **重启** Report Editor AI  
2. 报表生成 → 选模版「测试·044·8万条分卷导出」→ 导出  
3. 看桌面 `ReportEditor044Smoke`：
   - **通过**：约 **80** 个 PDF（`maxRows=1000` 分卷），合计行数 **80000**
   - **失败（旧行为）**：约 **50** 个 PDF（被 5 万硬上限截断）

> 全量 80 份 PDF 墙钟可能很长（联动 045/030）。可先在数据源工作台对同一 SQL 用 limit=80000 点查询，确认后端能取满 8 万。

---

## B. SQLite 兜底（无需 Docker / WSL）

管理员提权或 WSL 未完成时，可先用本机 SQLite 验 044 取数口径：

```powershell
cd _Prj\SD_SMA_ReportEditor
.\backend\venv\Scripts\python.exe scripts\dev\setup_044_smoke_80k_sqlite.py
```

模版名：**测试·044·8万条分卷导出（SQLite）**  
库文件：`%APPDATA%\sd-sma-report-editor-ai\backend-data\smoke_044_80k.sqlite`

验收标准同 A（约 80 份 PDF / 合计 80000 行）。

---

## 配置要点（模版内已设好）

| 项 | 值 |
|----|-----|
| `tableSqlFill.enabled` | true |
| `splitReportsOnMaxRows` | **true**（关键：才会按全量取数） |
| `maxRows` | 1000（单份行数 / 分卷粒度） |
| `reportKind` | nonBatch |
| 输出目录 | `%USERPROFILE%\Desktop\ReportEditor044Smoke` |
