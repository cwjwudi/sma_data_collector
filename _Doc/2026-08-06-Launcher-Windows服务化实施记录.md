# Launcher Windows 服务化实施记录

## 已实施

- Launcher 新增 `SD_SMA_DATA_ROOT` 和 `${DATA_ROOT}`，将只读程序与可写配置、日志、备份分离；未设置变量时保持便携包兼容。
- Launcher 新增 Windows Job Object、信号停止事件和启动阶段中断处理，停止父进程时清理受管子进程树。
- 安装器改为管理员级 `Program Files` 安装，使用 WinSW 2.12.0 注册 `LocalSystem` 延迟自动服务，并配置 30/60/120 秒故障恢复。
- ProgramData 首次安装只播种空配置目录；升级不覆盖活动配置，卸载默认保留数据。
- 新增 `SD_SMA_COMMON` 受限文件浏览模块；DB Admin 和 Report Copy 已由 Tk 弹窗切换到 Web 目录浏览。

## 配置接口

```text
SD_SMA_DATA_ROOT
${DATA_ROOT}
DB Admin: allowed_browse_roots
Report Copy: allowed_source_roots
```

服务模式数据根固定为 `%ProgramData%\SmartData\SD SMA`；便携模式默认使用包根。文件浏览只允许规范化后的真实路径位于配置根目录内，过滤越界路径、链接逃逸和不匹配文件扩展名。

## 本机验证证据

- Launcher：29 项测试通过。
- DB Admin：57 项测试通过。
- Report Copy：18 项测试通过。
- SD SMA Common：2 项通过；1 项符号链接测试因当前 Windows 权限不允许创建链接而跳过。
- 两个前端 JavaScript 文件通过 `node --check`。
- 安装器及初始化 PowerShell 通过语法解析。
- Inno Setup 6.7.3 最小化编译成功。
- 便携包 `-SkipVenv` 构建成功，并确认包含 `SD_SMA_COMMON` 和 `${DATA_ROOT}` 默认配置。

## 现场验收项

- 在 Windows 管理员环境构建正式安装包并验证安装、升级、卸载和开机延迟启动。
- 使用 `Stop-Service SD_SMA` 以及强制结束 Launcher 验证 8091–8094 无残留进程。
- 验证 LocalSystem 对目标 U 盘的写权限；网络共享必须使用 UNC 路径和适当服务身份。
- 卸载清理选项涉及不可恢复数据，正式发布前使用现场副本复验二次确认流程。

## 完整构建验证（2026-08-06）

- 执行 `_Launcher/scripts/build_installer_package.ps1 -Version 1.0.0`，完整构建成功。
- 依赖校验、43 个项目源码字节码编译、Nuitka Launcher 编译及四个子服务 smoke test 均通过。
- Inno Setup 6.7.3 正式编译成功，生成 `SD_SMA_Setup_1.0.0.exe`。
- smoke test 退出后确认 8091–8094 无残留监听。
- 构建时会从交付用默认配置中递归移除 `password` 和 `password_enc`，避免目标机器因缺少源机器 Fernet 密钥而无法首次启动；源码配置不会被改写。

## Launcher 管理中心实施（2026-08-06）

### 已实施

- 新增 `127.0.0.1:8090` 触屏管理中心，统一展示四个子服务的健康状态、PID、端口、运行时间、重启次数、CPU 和内存。
- 原批量监控循环改为独立服务主管；支持单服务启停和重启，人工停止状态写入 `state/services.json` 并跨重启保留，子服务故障不再导致管理中心和其他服务退出。
- 写操作使用 6–12 位管理员 PIN 解锁；PIN 仅保存 PBKDF2 盐和哈希，短时会话保存在 HttpOnly、SameSite Cookie 中，并限制外部 Origin 和连续失败尝试。
- 数据库凭据按档案管理，密码使用 Windows DPAPI LocalMachine 加密后存入 `secrets/launcher_security.json`。Collector、Query Web 和 DB Admin 通过 `SD_SMA_DB_PASSWORD` 接收分配的密码，API、日志和浏览器均不返回密码。
- DB Admin 独立模式改用本机 Fernet 密文保存密码；Launcher 受管模式使用中央密码并清理本地密码字段，不再将密码写入浏览器存储。
- 配置导入默认允许可移动盘和 `ImportBox`，支持额外本地白名单。导入经过路径沙箱、JSON 类型检查、敏感字段清理、覆盖预览、备份和原子替换；运行服务重启健康检查失败时恢复备份。
- 安装器快捷方式改为 8090，端口检查扩展为 8090–8094，并加入管理员 PIN 重置脚本。ProgramData 继续仅允许 LocalSystem/Administrators，`ImportBox` 单独授予普通用户修改权限。

### 新增管理接口

```text
GET  /api/launcher/status
POST /api/launcher/services/{name}/start|stop|restart
POST /api/launcher/auth/setup|unlock|lock
GET  /api/launcher/auth/session
GET|POST|DELETE /api/launcher/credentials...
PUT  /api/launcher/credentials/assignments/{service}
GET  /api/launcher/filesystem/roots|entries
GET|PUT /api/launcher/import/settings
POST /api/launcher/import/inspect|apply
```

### 验证记录

- Launcher 新旧测试共 37 项通过；DB Admin 57 项通过；Collector 212 项通过；Common 2 项通过、1 项因 Windows 符号链接权限跳过。
- 源码 smoke 成功启动 8090–8094，退出后确认五个端口均无残留监听。
- 管理页面通过 JavaScript 语法检查，并在 1024×768 浏览器视口验证四服务卡片、首次 PIN、导入页、凭据页以及 Query Web 单服务停止和恢复运行。
- 完整安装包构建通过：Nuitka 编译、bytecode-only 四服务 smoke、8090 管理端健康检查和 Inno Setup 6.7.3 编译全部成功。最终生成文件大小 `58,899,885` 字节，SHA256 为 `A475775C9998D15FAC881D823F06E748EF5551424BD35A0CB0E013D0EAB38581`；退出后 8090–8094 无残留监听。
- Query Web 全量测试 109 项中 108 项通过；`test_table_list_writeback_on_cursor` 的本地 asyncua mock 连接在第二次写入前断开，单独复跑仍失败。本次未修改 Query Web 源码，作为既有 Windows 集成测试不稳定项保留。

### 仍需现场验证

- 正式安装后的 LocalSystem DPAPI 跨重启解密、PIN 重置脚本提权提示，以及普通用户向 `ImportBox` 投放文件的 ACL。
- 插拔现场 U 盘后的动态根目录刷新、目标配置实际业务校验，以及故障配置自动回滚后的业务恢复。

## PIN 可选与网络访问模式（2026-08-06）

- PIN 安全状态扩展为 `undecided`、`enabled`、`disabled`。首次管理操作允许设置、跳过或取消；取消和 Esc 不再提交表单。关闭 PIN 会清除哈希和会话，并明确开放全部本地及远程写操作。
- 新增系统设置页和 `POST /api/launcher/auth/disable`、`GET|PUT /api/launcher/settings/network`。状态与会话接口保留 `pin_configured`，并增加 `pin_mode`、`pin_enabled`。
- 8090–8094 默认绑定 `0.0.0.0`。网络模式写入 `state/network.json`；切换时立即重启当前运行的业务服务、异步重绑管理端，失败则恢复原监听和持久化设置。
- 服务页面链接根据浏览器当前主机生成；写请求 Origin 改为与实际 Host 同源校验，从而支持局域网 IP 和主机名且继续拒绝跨站写请求。
- 安装、升级及运行时全局模式使用固定名称 `SD SMA Runtime 8090-8094` 的 Windows 防火墙规则，适用于所有网络配置文件；仅本地模式和卸载会删除该规则。

### 本机验证

- Launcher 46 项测试、DB Admin 57 项测试全部通过；新增用例覆盖 PIN 三态迁移、跳过/关闭/重新启用、同源访问、网络模式默认值、运行服务重启、人工停止保留，以及同步与异步切换失败回滚。
- 管理前端通过 `node --check`，全部 Launcher Python 文件通过字节码编译，安装器和初始化 PowerShell 脚本通过语法解析。
- 在 1024×768 触屏视口验证系统设置页无横向溢出，操作按钮高度 56px；PIN 取消不继续操作，关闭后风险横幅持续显示。
- 完整构建通过：43 个业务源码文件转为 bytecode-only，Nuitka Launcher、五端口 smoke 和 Inno Setup 6.7.3 编译成功；默认交付配置的 8090–8094 均为 `0.0.0.0`。
- 安装包 `_Build/SD_SMA_Installer_Package/SD_SMA_Setup_1.0.0.exe` 大小为 `58,926,160` 字节，SHA256 为 `AD906287B7368CE5CCBAC2078301DA877A4078FF795E06BEF16477A96D842245`；smoke 退出后 8090–8094 无残留监听。

### 仍需现场验证

- 在管理员权限的正式安装/升级/卸载流程中确认固定防火墙规则的创建、删除和恢复，覆盖域、专用、公用三类网络。
- 从另一台局域网设备验证主机名/IP 访问，并在远程页面切换“仅本地访问”确认当前连接按提示中断。

## 外部配置整包导入与监控修正（2026-08-07）

- 中央数据库凭据从仅注入 `SD_SMA_DB_PASSWORD` 改为同时注入 `SD_SMA_DB_HOST`、`SD_SMA_DB_PORT`、`SD_SMA_DB_USERNAME`、`SD_SMA_DB_DATABASE` 和密码。Collector、Query Web、DB Admin 在运行时统一优先使用这些字段，外部配置中的连接账户不再覆盖 Launcher 分配。
- 导入接口新增 `service=all`，支持一次选择完整配置根目录。识别 `collector/query_web/db_admin/report_copy` 短目录及四个项目目录下的 `config` 布局；四插件统一预览、清理外部密码、分服务备份、原子写入，并且只重启原先运行的服务。
- 导入页增加每秒一次的可移动盘自动检测和手动刷新；根目录没有变化时不重绘当前目录，避免打断触屏选择。真实运行时连续调用根目录接口 5 次共耗时约 52 ms。
- 控制面板资源采样改为跨刷新缓存 `psutil.Process`，汇总服务进程及全部子进程；CPU 按逻辑 CPU 数归一化，另保留单核心口径，内存使用进程树 RSS 总和。真实四服务运行时已取得非零 CPU 采样与约 52–93 MB 的进程树内存。
- 验证结果：Launcher 51 项、Collector 213 项、DB Admin 58 项全部通过；Query Web 本次凭据测试 3 项通过，完整套件 109 项通过、原有 `test_table_list_writeback_on_cursor` OPC UA mock 写回不稳定项 1 项失败。
- 真实运行态从 `_Prj` 布局预览并应用 4 个插件共 23 个配置文件，四个运行服务全部重启并恢复健康；退出 Launcher 后 8090–8094 无残留监听。
- 完整安装包构建通过：Nuitka Launcher、43 个业务源码 bytecode-only、四服务 smoke 和 Inno Setup 6.7.3 均成功。`SD_SMA_Setup_1.0.0.exe` 大小为 `58,943,096` 字节，SHA256 为 `CA97118C661562A1ADDCB1B1DF727D3EED4BEAE23F42D018BD09D2EA097921EF`。
