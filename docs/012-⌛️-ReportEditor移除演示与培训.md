# ReportEditor：移除「演示与培训」功能

> 本文件为 **任务看板 / 实现计划**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **本轮仅写计划，未改代码。**  
> 产品诉求：设置页整块「演示与培训」可移除（截图确认）。  
> 相关里程碑：M11（`_Doc/002_里程碑与工单.md` · 0.1.13/0.1.14 已落地）。

---

# ⌛️ 未完成：拆除设置「演示与培训」及相关远程/本地演示通道

## 产品诉求（2026-07-13）

1. **设置 → 演示与培训**整块 UI 去掉（含演示通道、检测、一键添加、本地工具包启停等）。  
2. 不再引导用户添加标「仿真」的远程/本地演示连接。  
3. 本轮**先写看板**；代码拆除另开版本切片（建议 **0.3.68+**）。

## 范围边界（勿误删）

| 保留 | 原因 |
|------|------|
| `certificate-verification/demo-license-store*` | **演示许可证/证书校验**，与「演示与培训」无关（仅文件名含 demo） |
| 配置包/更新里路径含 `web-portal-demo` 的 Portal 探测文案 | 仓库目录名，非本功能 |
| 用户已有的普通 DB/OPC 连接 | 正式产线配置 |

| 拆除 / 收敛 | 说明 |
|-------------|------|
| 设置区块 `DemoTrainingSection` | 用户可见入口 |
| 后端 `/demo/*` + `demo_service` | 预设、健康检查、一键写连接 |
| Electron `demo-pack.cjs` + IPC | 本地 Docker 工具包下载/启停 |
| `packaging/demo-pack/**` | 演示 compose / seed / 打包脚本（可选：整目录删除或标废弃） |
| Tab「· 仿真」与 `is_demo` 写入路径 | 新连接不再产生；存量见下方决策 |

## 现状（代码对照）

### UI

- [`Settings.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/views/Settings.vue) 挂载 `<DemoTrainingSection />`
- [`DemoTrainingSection.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/features/settings/demo-training/DemoTrainingSection.vue)  
  - 通道：远程演示服务器 / 本地工具包  
  - 按钮：检测演示环境、一键添加演示连接、检查/安装工具包、启动/停止演示环境

### 后端

- [`api/routers/demo.py`](../_Prj/SD_SMA_ReportEditor/backend/api/routers/demo.py)：`GET /demo/presets`、`GET /demo/health`、`POST /demo/apply_connections`
- [`modules/demo_service.py`](../_Prj/SD_SMA_ReportEditor/backend/modules/demo_service.py)：双通道预设与写库
- 配置键（`schemas/common.py` / `settings_config.py`）：`demo_preferred_channel`、`demo_remote_db_*`、`demo_remote_opcua_*`
- 连接/服务器字段：`is_demo`、`demo_channel`（多处读写：database 路由、AI 数据源、datasource_lock、审计 action `demo.*`）

### Electron / 打包

- [`electron/demo-pack.cjs`](../_Prj/SD_SMA_ReportEditor/frontend/electron/demo-pack.cjs) + `main.cjs` / `preload.cjs` 的 `demo-pack-*` IPC
- [`packaging/demo-pack/`](../_Prj/SD_SMA_ReportEditor/packaging/demo-pack/) + `build-demo-pack.mjs`
- Smoke：[`_Doc/008_发版Smoke清单.md`](../_Prj/SD_SMA_ReportEditor/_Doc/008_发版Smoke清单.md) 演示通道章节

### 数据源展示

- DB Tab：`connection-tab-label.ts` → `· 仿真`
- OPC：`opcua-endpoint-url.js` → `· 仿真`
- `ConnectionManager` 有演示连接只读/提示相关逻辑与单测

## 建议拆除策略（默认 · 待开工确认）

### A. UI / API / 打包（必做）

1. 设置页去掉 `DemoTrainingSection`；删除 `features/settings/demo-training/`。  
2. 取消注册 `demo` 路由；删除或掏空 `demo_service`（无引用后删文件）。  
3. 去掉 Electron demo-pack IPC 与 `demo-pack.cjs`。  
4. 删除或移出仓库 `packaging/demo-pack/` 与 `build-demo-pack.mjs`（若 Portal 仍托管 zip，发版说明写「不再维护」即可）。  
5. 更新 Smoke 清单、里程碑 M11 备注「功能已退役」、发布记录。

### B. 存量「仿真」连接（需产品拍板 · 默认 **B1**）

| 方案 | 行为 | 适用 |
|------|------|------|
| **B1（默认）** | 保留 `is_demo` 字段与「· 仿真」展示；不再提供添加入口；用户可手动删连接 | 升级不丢已有演示库连接 |
| B2 | 升级时把 `is_demo` 清 false，Tab 不再标仿真 | 彻底抹演示语义 |
| B3 | 升级迁移删除所有 `is_demo` 连接 | 最干净，可能误删用户仍在用的演示库 |

远程演示连接若仍内嵌口令/主机：拆除入口后，**配置里残留的 `demo_remote_*` 与远程凭据**建议一并从默认配置/导出白名单去掉（降低再分发面）；与 [docs/001](001-🚧-安全与可靠性缺陷修复.md) 口令治理一致时可顺带做。

### C. AI / 审计（随 A）

- AI 工具里对 `is_demo` / remote demo 的特殊分支：改为普通连接逻辑或删除分支。  
- 审计过滤器中的 `demo.*` action：可保留历史展示，或改为「已废弃」分组。

## 验收（开工后）

- [ ] 设置页无「演示与培训」区块  
- [ ] 无 `/demo/health`、`/demo/apply_connections` 可用入口（路由 404 或未挂载）  
- [ ] 无法从应用内下载/启停 demo-pack  
- [ ] 新装机不能一键生成仿真连接；B1 下旧连接仍可测连/删除  
- [ ] 证书「演示许可证」区块仍在  
- [ ] Smoke 清单已删演示章节；前端相关单测改绿

## 本轮范围

- ✅ 记录产品诉求与代码落点  
- ✅ 划清与 demo-license 边界  
- ✅ 拟拆除切片 + 存量连接默认 B1  
- ⌛️ 代码拆除与发版（待开工）

## 开工前可确认（可选）

| # | 问题 | 默认 |
|---|------|------|
| Q1 | 存量仿真连接？ | **B1** 保留标记、可手删 |
| Q2 | `packaging/demo-pack` 是否物理删除？ | **是**（或移文档归档） |
| Q3 | 是否同步清 `demo_remote_*` 默认凭据？ | **建议是**（安全） |
