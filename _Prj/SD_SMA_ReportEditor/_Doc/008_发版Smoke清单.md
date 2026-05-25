# 发版 Smoke 清单（0.1.13+）

> 每次发版前在**安装版**（非 `npm run dev`）上执行。通过后再 bump manifest、打包、同步 Portal。  
> 自动化：`npm test`（仓库根目录）须全部通过。

---

## 0. 通用前置

- [ ] 版本号已 bump（`frontend/package.json` = 目标版本）
- [ ] `npm test` 通过
- [ ] 使用 **Mac 或 Win 安装包**（非浏览器 dev）

---

## 1. 补丁 F1 — Mac「打开已安装的应用」

**平台：** macOS 安装版，且已下载过更新包

- [ ] 设置 → 软件更新 → 下载完成后点击「打开已安装的应用」
- [ ] 不报 `object could not be cloned`，能正常打开 Report Editor

---

## 2. 演示双通道（M11 MVP）

### 2A 远程演示（默认）

**前置：** 团队远程演示服可用，或在设置中填写可用的 DB/OPC 地址

- [ ] 设置 → **演示与培训** → 通道选「远程演示服务器」
- [ ] 点击「检测演示环境」→ DB 与 OPC 均正常
- [ ] 点击「一键添加演示连接」
- [ ] 数据源配置 → DB / OPC Tab 显示 **「仿真」** 后缀
- [ ] OPC 浏览变量、DB 查表正常
- [ ] 选演示模版完成 **一次 PDF 手动导出**

### 2B 本地工具包（可选）

**前置：** 本机已装 Docker Desktop；Portal 已发布 `demo-pack/latest.json` + zip

- [ ] 设置 → 演示与培训 → 通道选「本地工具包」
- [ ] 「检查/安装工具包」成功（或已安装最新版）
- [ ] 在工具包目录执行 `scripts/start.sh`（或 `start.ps1`）启动 compose
- [ ] 「检测演示环境」→ 127.0.0.1 DB/OPC 正常
- [ ] 一键添加演示连接 → 导出 PDF 成功
- [ ] 执行 `scripts/stop.sh` 停止演示环境

---

## 3. 审计（M14）

- [ ] 侧边栏 / 仪表盘 → **操作审计** 页面可打开
- [ ] 高级筛选：类型、结果、日期范围
- [ ] 「导出 JSON」与「导出 CSV」可用
- [ ] 执行以下操作后「刷新」列表可见记录：
  - [ ] 修改并保存 OPC UA 连接（`opcua.connection_save`）
  - [ ] 手动导出 PDF（`export.manual_pdf`）
  - [ ] 测试写回 PLC（`export.opc_writeback_test`）
  - [ ] 配置导出/导入（`config.export` / `config.import`）
  - [ ] 检查软件更新（`update.check`）
- [ ] 「导出 JSON」可下载审计文件
- [ ] 「导出 CSV」可下载审计文件

---

## 3B. 演示启停（M11-T6）

**前置：** 已安装本地演示工具包 + Docker Desktop

- [ ] 设置 → 演示与培训 → **启动演示环境** / **停止演示环境**
- [ ] 启动后「检测演示环境」通过

---

## 4. 连接可观测（M12）

- [ ] 仪表盘显示 DB + OPC 连接汇总
- [ ] 数据源 Tab 点击「N 异常」弹出详情

---

## 5. 回归（0.1.12 能力不退化）

- [ ] 设置 → 连接探活：DB/OPC 指示灯正常
- [ ] 报表生成：导出前连接检查、写回 PLC 失败有 Toast
- [ ] 软件更新：检查 / 下载 / 安装流程正常（Win 自行验证）

---

## 6. 发版收尾

- [ ] `generate-update-manifest.mjs` 填入双平台 SHA256
- [ ] Portal `public/downloads/report-editor/latest.json` 同步
- [ ] 若含 demo-pack 更新：Portal `demo-pack/latest.json` + zip
- [ ] 更新 [007_版本发布记录.md](007_版本发布记录.md) 状态为 ✅

---

## 记录模板

| 日期 | 版本 | 执行人 | 平台 | 远程演示 | 本地工具包 | 审计 | 备注 |
|------|------|--------|------|----------|------------|------|------|
| | 0.1.13 | | Mac / Win | ☐ | ☐ | ☐ | |
