# 044 冒烟：导出 8 万条（不设 5 万硬上限）

目标：验证分卷导出取数不再静默截断到 50000。  
**产品闭环**：看板 [docs/044-✅](../../../../docs/044-✅-ReportEditor导出SQL取数无硬上限.md)（SQLite 路径已实机 80 份 / 80000 行）。下列脚本供复测或对齐 MariaDB/Docker。

## A. 本机 MariaDB（当前推荐；Docker 起不来时用）

本机 Docker Desktop 仍报 **Virtualization support not detected**（缺 WSL2 内核/虚拟机平台），短期改用 **winget 安装的 MariaDB 12.3** 跑在 `127.0.0.1:3306`。

### 已就绪（本机）

| 项 | 值 |
|----|-----|
| 服务方式 | `mariadbd` 用户进程（非 Windows 服务；关机后需再启） |
| 启动脚本 | `scripts\dev\start_local_mariadb_044.ps1` |
| 账号 | `root` / `report_editor_044` |
| 库表 | `report_user_lib.demo_metrics`，`batch_no=SMOKE_80K`，**80000** 行 |
| 连接 | `本机 MariaDB（044）` / id=`local-mariadb-044` |
| 模版 | **测试·044·8万条分卷导出** |

重启电脑后先：

```powershell
cd _Prj\SD_SMA_ReportEditor
.\scripts\dev\start_local_mariadb_044.ps1
```

若要重灌数据：

```powershell
$env:MARIADB_ROOT_PASSWORD='report_editor_044'
.\backend\venv\Scripts\python.exe scripts\dev\setup_044_smoke_80k.py
```

### 导出验收

1. **重启** Report Editor AI  
2. 报表生成 → 选模版「测试·044·8万条分卷导出」→ 导出  
3. 看桌面 `ReportEditor044Smoke`：
   - **通过**：约 **80** 个 PDF（`maxRows=1000` 分卷），合计行数 **80000**
   - **失败（旧行为）**：约 **50** 个 PDF（被 5 万硬上限截断）

> 全量 80 份 PDF 墙钟可能很长（联动 045/030）。可先在数据源工作台对同一 SQL 用 limit=80000 点查询，确认后端能取满 8 万。

### Docker（可选，需管理员修好 WSL2 / 虚拟化）

本机常见卡点（`wsl --status`）：

- 未启用「Windows Subsystem for Linux」/「虚拟机平台」
- 固件未开 CPU 虚拟化（Intel VT-x / AMD-V）→ 见 https://aka.ms/enablevirtualization

**一键（管理员）**：

```powershell
cd _Prj\SD_SMA_ReportEditor
# 右键「使用 PowerShell 以管理员身份运行」，或：
Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File .\scripts\dev\setup_wsl2_for_docker.ps1'
```

脚本会启用可选组件、`wsl --update`、默认 WSL2，并提示是否重启。  
重启后：Docker Desktop 绿灯 → `.\scripts\dev\setup_044_docker.ps1`。  
若 Docker Hub 拉不动 `mariadb:11`，脚本会回退 DaoCloud 镜像 `docker.m.daocloud.io/library/mariadb:11` 再 tag。

**本机已就绪时**：容器 `report_editor_mariadb` · 库表 `report_user_lib.demo_metrics` · `batch_no=SMOKE_80K` · **80000** 行；连接 `local-docker-mariadb-044`；模版「测试·044·8万条分卷导出」。重启 AI 版后导出验收即可。

在修好之前请用上面的本机 MariaDB / SQLite，不必再卡在 Docker。

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
