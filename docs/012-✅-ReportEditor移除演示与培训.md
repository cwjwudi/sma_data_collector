# ReportEditor：移除「演示与培训」功能

> 本文件为 **任务看板 / 实现计划**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> 产品诉求：设置页整块「演示与培训」可移除（截图确认）。  
> 相关里程碑：M11（`_Doc/002_里程碑与工单.md` · 0.1.13/0.1.14 已落地）。  
> **交叉引用：** Smoke 清单 `_Prj/SD_SMA_ReportEditor/_Doc/008_发版Smoke清单.md` 已删演示章节。

---

# ✅ 已完成：拆除设置「演示与培训」及相关远程/本地演示通道

## 产品诉求（2026-07-13）

1. **设置 → 演示与培训**整块 UI 去掉（含演示通道、检测、一键添加、本地工具包启停等）。  
2. 不再引导用户添加标「仿真」的远程/本地演示连接。  
3. 代码拆除已按开工确认执行（B1 + 物理删 demo-pack + 清 `demo_remote_*` 配置面）。

## 范围边界（勿误删）

| 保留 | 原因 |
|------|------|
| `certificate-verification/demo-license-store*` | **演示许可证/证书校验**，与「演示与培训」无关（仅文件名含 demo） |
| 配置包/更新里路径含 `web-portal-demo` 的 Portal 探测文案 | 仓库目录名，非本功能 |
| 用户已有的普通 DB/OPC 连接 | 正式产线配置 |
| 连接上的 `is_demo` / Tab「· 仿真」 | **B1**：存量可展示、可手删 |

| 拆除 / 收敛 | 说明 |
|-------------|------|
| 设置区块 `DemoTrainingSection` | 已删目录与 Settings 挂载 |
| 后端 `/demo/*` + `demo_service` | 已删路由与模块 |
| Electron `demo-pack.cjs` + IPC | 已删 |
| `packaging/demo-pack/**` + `build-demo-pack.mjs` | 已物理删除 |
| `demo_remote_*` / `demo_preferred_channel` | 已从 Patch/导入白名单移除；读旧 config 仍过滤敏感键不回传前端 |
| AI `ensure_user_demo_database` 工具 | 已从 catalog / TOOL_DEFINITIONS / dispatch 移除；函数保留为内部辅助 |

## 开工确认（2026-07-13）

| # | 决策 |
|---|------|
| Q1 | **B1**：存量仿真连接保留「· 仿真」标记，可手删；不自动清除 |
| Q2 | **物理删除** `packaging/demo-pack` 与相关打包脚本 |
| Q3 | **同步清除** `demo_remote_*` 默认凭据 / 配置面 |

## 验收

- [x] 设置页无「演示与培训」区块  
- [x] 无 `/demo/health`、`/demo/apply_connections` 可用入口（路由未挂载）  
- [x] 无法从应用内下载/启停 demo-pack  
- [x] 新装机不能一键生成仿真连接；B1 下旧连接仍可测连/删除  
- [x] 证书「演示许可证」区块仍在（未改 `demo-license-store*`）  
- [x] Smoke 清单已删演示章节；相关单测/导入测试已对齐  

## 本轮范围

- ✅ 记录产品诉求与代码落点  
- ✅ 划清与 demo-license 边界  
- ✅ 拟拆除切片 + 存量连接默认 B1  
- ✅ 代码拆除（UI / API / Electron / packaging / 配置面 / AI 工具收敛）
