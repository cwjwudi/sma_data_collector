# SD SMA Unified Launcher

这个目录用于统一启动：

- `_Prj/SD_SMA_DATA_COLLECTOR`
- `_Prj/SD_SMA_DATA_COLLECTOR_QUERY_WEB`

启动器会使用同一个 Python 环境，检查依赖包，检查端口，然后分别启动两个 FastAPI 服务。

## 直接启动

在仓库根目录或解压后的交付包中，双击：

```bat
_Launcher\start.bat
```

默认地址：

- 采集配置/监控：`http://127.0.0.1:8091/dashboard`
- 历史查询：`http://127.0.0.1:8092/query`

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

短暂启动两个服务，健康检查通过后自动退出：

```bat
_Launcher\start.bat --smoke --no-browser
```

## 清理残留服务

如果启动器提示 `Port already in use: 127.0.0.1:8091` 或 `8092`，通常是上一次启动留下了服务进程。可以运行：

```bat
_Launcher\stop.bat
```

## 生成解压即用包

在仓库根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File _Launcher\scripts\build_portable_package.ps1
```

默认输出：

```text
_Build/SD_SMA_Runtime_Package
```

输出目录中会包含：

```text
SD_SMA_Runtime_Package/
  start.bat
  .venv/
  _Launcher/
  _Prj/
    SD_SMA_DATA_COLLECTOR/
    SD_SMA_DATA_COLLECTOR_QUERY_WEB/
  logs/
```

需要同时生成 zip：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File _Launcher\scripts\build_portable_package.ps1 -Zip
```

需要准备离线 wheelhouse：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File _Launcher\scripts\build_portable_package.ps1 -BuildWheelhouse
```

## 端口

默认端口：

- `8091`: 采集配置/监控 Web
- `8092`: 查询 Web

如果端口被占用，启动器会停止并提示。可以在 `launcher_config.json` 修改端口。

## 配置目录

可以在 `_Launcher/launcher_config.json` 的每个服务中修改 `env` 来指定配置目录。相对路径按包根目录解析，绝对路径会直接使用。

采集器：

```json
"env": {
  "SD_SMA_COLLECTOR_CONFIG_DIR": "site_config/collector"
}
```

查询 Web：

```json
"env": {
  "SD_SMA_QUERY_WEB_CONFIG_DIR": "site_config/query_web"
}
```
