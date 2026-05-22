# Report Editor 演示工具包

本工具包用于**离线培训 / 无远程演示服务器**时，在本机启动 MariaDB + OPC UA 演示服务。

## 前置条件

- 已安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)（本应用**不包含** Docker 引擎）
- Docker 已启动并可执行 `docker compose`

## 快速开始

### macOS / Linux

```bash
./scripts/start.sh
```

停止：

```bash
./scripts/stop.sh
```

### Windows（PowerShell）

```powershell
.\scripts\start.ps1
```

停止：

```powershell
.\scripts\stop.ps1
```

## 连接参数（与 Report Editor 本地通道一致）

| 服务 | 地址 |
|------|------|
| MariaDB | `127.0.0.1:3306`，库 `report`，用户 `root`，密码见 `docker-compose.yml` 中 `MARIADB_ROOT_PASSWORD` |
| OPC UA | `opc.tcp://127.0.0.1:4840/report-editor/demo-opcua/`（匿名） |

在 Report Editor **设置 → 演示与培训** 中选择「本地工具包」，点击「检测演示环境」与「一键添加演示连接」。

## 演示数据

- 数据库：`seed/demo.sql` 在首次启动 MariaDB 时自动导入
- OPC UA：`ReportEditorDemo` 对象下 Counter、Temperature、ClockUtc 等变量

## 排错

- 端口占用：修改 `.env` 或环境变量 `MARIADB_PORT` / `OPCUA_DEMO_PORT`
- Docker Hub 超时：参考 `docker-compose.yml` 注释设置 `PYTHON_BASE_IMAGE` 镜像加速
