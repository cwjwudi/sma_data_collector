# SD SMA Unified Launcher

这个目录用于统一启动和管理：

- `_Prj/SD_SMA_DATA_COLLECTOR`
- `_Prj/SD_SMA_DATA_COLLECTOR_QUERY_WEB`
- `_Prj/SD_SMA_DB_ADMIN`
- `_Prj/SD_SMA_REPORT_COPY`

启动器会使用同一个 Python 环境，检查依赖和端口，并在 `http://127.0.0.1:8090/` 提供触屏管理中心。默认情况下 8090–8094 同时监听所有网卡，局域网设备可以通过服务器 IP 访问；四个子服务可以独立启动、停止和重启，人工停止状态会在 Launcher 或系统重启后保留。

## 触屏管理中心

本机管理地址为 `http://127.0.0.1:8090/`，远程地址为 `http://<服务器IP>:8090/`。首次执行写操作时可以设置 6–12 位管理员 PIN、明确选择暂不启用，或取消当前操作。PIN 关闭后所有本机和远程访问者都能控制服务、导入配置和管理数据库密码，页面会持续显示红色风险提示。

页面提供：

- 服务健康状态、PID、端口、运行时间、重启次数、CPU 和内存
- 单服务启动、停止、重启和打开业务页面
- 从 U 盘、`ImportBox` 或管理员白名单目录检查并导入配置
- 使用 Windows DPAPI 管理多个数据库凭据档案并分配给 Collector、Query Web、DB Admin
- 在“系统设置”中统一切换 8090–8094 的全局访问/仅本地访问，并启用或关闭管理员 PIN

数据库密码不通过 API 回显，也不会写入浏览器存储。Windows 安装模式下凭据密文位于 ProgramData 的 `secrets` 目录，只允许 LocalSystem 和管理员访问，并且不能复制到另一台设备解密。

安装器默认为 TCP 8090–8094 创建适用于域、专用和公用网络的 Windows 防火墙入站规则。切换为“仅本地访问”会立即将五个端口改绑到 `127.0.0.1` 并删除该规则；切回全局访问会绑定 `0.0.0.0` 并恢复规则。切换时只重启当前运行的业务服务，人工停止的服务保持停止。便携模式没有管理员权限时，监听仍会切换，但需要管理员手工处理防火墙。

## 直接启动

在仓库根目录或解压后的交付包中，双击：

```bat
_Launcher\start.bat
```

## DB Admin

新增数据库管理服务：

- URL: `http://127.0.0.1:8093/admin`
- Service name: `db_admin`
- Project dir: `_Prj/SD_SMA_DB_ADMIN`
- Config env: `SD_SMA_DB_ADMIN_CONFIG_DIR`
- Backup env: `SD_SMA_DB_ADMIN_BACKUP_DIR`

便携包会一并复制 `_Prj/SD_SMA_DB_ADMIN`，并使用统一 `.venv` 启动。便携模式下备份目录位于包根 `backups/`；Windows 服务模式下位于 ProgramData 数据根的 `backups/`。

## Report Copy

新增报表复制服务：

- URL: `http://127.0.0.1:8094/`
- Service name: `report_copy`
- Project dir: `_Prj/SD_SMA_REPORT_COPY`
- Config env: `SD_SMA_REPORT_COPY_CONFIG_DIR`

用于浏览配置的 `SMA_Report` 报表目录、预览 PDF，并将选中的报表复制到 Windows U 盘。

默认地址：

- Launcher 管理中心：`http://127.0.0.1:8090/`
- 采集配置/监控：`http://127.0.0.1:8091/dashboard`
- 历史查询：`http://127.0.0.1:8092/query`
- 数据库管理：`http://127.0.0.1:8093/admin`
- 报表复制：`http://127.0.0.1:8094/`

启动器配置在：

```text
_Launcher/launcher_config.json
```

其中 `python` 默认指向包根目录下的：

```text
.venv/Scripts/python.exe
```

如果现场需要指定已有 Python，可以改这个字段。

## 仅检查环境

```bat
_Launcher\start.bat --check
```

如果没有统一 `.venv`，并且配置允许 `allow_current_python_fallback`，启动器会临时使用当前 Python 做检查。

## 启动冒烟测试

短暂启动管理中心和四个服务，健康检查通过后自动退出：

```bat
_Launcher\start.bat --smoke --no-browser
```

## 清理残留服务

如果启动器提示 8090–8094 端口被占用，通常是上一次启动留下了 Launcher 或服务进程。可以运行：

```bat
_Launcher\stop.bat
```

## 生成解压即用包

一键打包（推荐）：双击：

```bat
_Launcher\一键打包.bat
```

或在仓库根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File _Launcher\scripts\build_portable_package.ps1
```

打包脚本会：

- 只复制 `launcher_config.json` 中配置的 `_Prj` 服务目录
- 优先选用 Python 3.10–3.12（避免系统默认 3.14）
- **强制使用国内 PyPI 源**（默认清华：`https://pypi.tuna.tsinghua.edu.cn/simple`）
- 默认不走代理；如需代理可传 `-HttpProxy http://host:port`

默认输出：

```text
_Build/SD_SMA_Runtime_Package
```

输出目录中会包含：

```text
SD_SMA_Runtime_Package/
  start.bat
  .venv/
  _Python/          # 内置 Python 运行时（现场无需预装）
  config/           # 统一配置：collector / query_web / db_admin / report_copy
  logs/             # 统一日志骨架
  _Launcher/
  _Prj/
    SD_SMA_DATA_COLLECTOR/
    SD_SMA_DATA_COLLECTOR_QUERY_WEB/
    SD_SMA_DB_ADMIN/
    SD_SMA_REPORT_COPY/
```

需要同时生成 zip：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File _Launcher\scripts\build_portable_package.ps1 -Zip
```

需要准备离线 wheelhouse：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File _Launcher\scripts\build_portable_package.ps1 -BuildWheelhouse
```

指定 Python / 镜像示例：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File _Launcher\scripts\build_portable_package.ps1 `
  -Python "C:\Path\To\python.exe" `
  -PipIndexUrl "https://mirrors.aliyun.com/pypi/simple/" `
  -PipTrustedHost "mirrors.aliyun.com"
```

## 端口

默认端口：

- `8090`: Launcher 触屏管理中心
- `8091`: 采集配置/监控 Web
- `8092`: 查询 Web
- `8093`: 数据库管理 Web
- `8094`: 报表复制 Web

如果端口被占用，启动器会停止并提示。可以在 `launcher_config.json` 修改端口。

## 配置目录

便携模式默认使用包根目录；Windows 服务模式使用 ProgramData 下的同一目录结构：

```text
config/
  launcher/       # Launcher 活动配置及导入白名单
  collector/
  query_web/
  db_admin/
  report_copy/
logs/
  launcher/      # 启动器自身日志：launcher.log
  collector/     # 采集器应用日志 + uvicorn.log
  query_web/     # query_web uvicorn.log
  db_admin/      # db_admin uvicorn.log
  report_copy/   # 报表复制业务日志 + uvicorn.log
state/           # 各服务期望启停状态
secrets/         # PIN 哈希与 DPAPI 数据库凭据密文
ImportBox/       # 登录用户可投放待导入 JSON 的目录
```

默认环境变量（见 `launcher_config.json`）：

```json
"env": {
  "SD_SMA_COLLECTOR_CONFIG_DIR": "${DATA_ROOT}/config/collector",
  "SD_SMA_LOG_DIR": "${DATA_ROOT}/logs/collector"
}
```

```json
"env": {
  "SD_SMA_QUERY_WEB_CONFIG_DIR": "${DATA_ROOT}/config/query_web"
}
```

```json
"env": {
  "SD_SMA_DB_ADMIN_CONFIG_DIR": "${DATA_ROOT}/config/db_admin",
  "SD_SMA_DB_ADMIN_BACKUP_DIR": "${DATA_ROOT}/backups"
}
```

```json
"env": {
  "SD_SMA_REPORT_COPY_CONFIG_DIR": "${DATA_ROOT}/config/report_copy",
  "SD_SMA_LOG_DIR": "${DATA_ROOT}/logs/report_copy"
}
```

`${PACKAGE_ROOT}` 表示只读程序包位置，`${DATA_ROOT}` 表示可写运行数据位置。相对数据路径按 `DATA_ROOT` 解析。

分工：

- **便携包 / Launcher 启动**：未设置 `SD_SMA_DATA_ROOT` 时，继续读写包根 `config/<服务>/` 与 `logs/<服务>/`
- **Windows 服务安装**：`SD_SMA_DATA_ROOT=%ProgramData%\SmartData\SD SMA`，程序目录保持只读
- **单独开发某个工程**：仍使用该工程自己的 `_Prj/<工程>/config`（不设上述环境变量时的默认行为）

首次用 Launcher 启动时，若某个 `config/<服务>/` 为空，会自动从对应 `_Prj/<工程>/config` 复制一份作为初始配置。便携包打包时也会预先物化这些目录。

## Windows 服务安装

安装包将程序安装到：

```text
C:\Program Files\SmartData\SD SMA
```

活动配置和运行数据位于：

```text
C:\ProgramData\SmartData\SD SMA\
  config\
  logs\
  backups\
  runtime\
  state\
  secrets\
  ImportBox\
```

服务名称为 `SD_SMA`，显示名称为 `SD SMA Runtime`，使用 `LocalSystem` 延迟自动启动。常用管理命令：

```powershell
Get-Service SD_SMA
Start-Service SD_SMA
Stop-Service SD_SMA
Restart-Service SD_SMA
```

WinSW 包装日志位于 `C:\ProgramData\SmartData\SD SMA\logs\service`，Launcher 日志位于 `logs\launcher`。停止服务时 Launcher 会先优雅停止四个子服务，超时后清理整个 Job Object 进程树。

升级安装不会覆盖 ProgramData 中的活动配置。卸载默认保留配置、日志、凭据和备份；只有在卸载界面明确选择并再次确认后才会删除。旧用户级安装不会自动迁移，若 8090–8094 仍被旧程序占用，安装器会中止并提示先停止旧版本。

忘记 PIN 时，以管理员身份运行安装目录 `_Service\Reset-SD_SMA-LauncherPin.ps1`。脚本只移除 PIN 哈希，保留凭据和服务分配，下一次写操作会要求重新创建 PIN。

导入前会解析并校验 JSON、移除外机密码字段并展示覆盖摘要；确认后先备份到 `backups\config_import`，再原子替换配置。运行中的目标服务会自动重启并做健康检查，失败时恢复原配置；原本停止的服务不会被自动启动。

DB Admin 和 Report Copy 使用浏览器内的受限目录浏览器，不再从后台服务打开 Windows/Tk 文件选择窗口。可分别通过 `allowed_browse_roots`、`allowed_source_roots` 扩充允许访问的服务器目录；网络共享请使用 UNC 路径，不要依赖登录用户的映射盘符。

## 系统资源监控

管理中心周期显示各受管服务的 CPU、内存、PID、健康状态和重启次数。原有 CSV 资源采样器仍可通过 `launcher_config.json` 的 `resource_monitor.enabled` 单独启用，用于长期留档。

监控文件位于：

```text
logs/launcher/resource_metrics.csv   # 周期采样历史
logs/launcher/resource_alerts.log    # 持续超限与恢复记录
```

`resource_metrics.csv` 包含 CPU、内存、线程、Windows Handle、子进程数量、累计 I/O、运行时间和重启次数。`cpu_percent` 是按整机逻辑 CPU 数归一化后的占用率，`cpu_core_percent` 采用“单个核心满载为 100%”的口径。

配置位于 `launcher_config.json` 的 `resource_monitor`。可调整采样周期、控制台摘要周期、日志大小和告警阈值；将 `enabled` 设为 `false` 可关闭监控，将某个告警阈值设为 `0` 可单独关闭该类告警。详细说明见 `_Doc/2026-07-21-Launcher资源监控说明.md`。
