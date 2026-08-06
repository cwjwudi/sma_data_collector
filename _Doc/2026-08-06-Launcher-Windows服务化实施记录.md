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
