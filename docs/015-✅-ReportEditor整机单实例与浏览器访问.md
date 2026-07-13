# ReportEditor：整机单实例 + 浏览器访问边界说明

> 本文件为 **任务看板 / 说明**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **已于 0.3.74 落地**（2026-07-13）。  
> **诉求**：① 强制整机只能打开**一个**桌面软件实例；② 浏览器访问边界；③ **局域网应用内 AI**（开关 + Agent Token）。  
> 相关：[`main.cjs`](../_Prj/SD_SMA_ReportEditor/frontend/electron/main.cjs)、[`ai_config.py`](../_Prj/SD_SMA_ReportEditor/backend/modules/ai_config.py)、[`runtimeEnv.ts`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/runtimeEnv.ts)。

---

# ✅ 已完成：Electron 整机单实例强制（0.3.74）

## 产品诉求

1. 同一台电脑上，**Report Editor AI 桌面版**同时只允许跑 **1 个进程/主窗口**。  
2. 用户再次双击图标 / 开第二个实例时：应**聚焦已有窗口**（或托盘恢复），而不是再开一套后端抢 8000 端口。  
3. ~~计划~~ → **已与局域网 AI 同发 0.3.74**。

## 现状（实现后）

| 点 | 现状 |
|----|------|
| Electron `requestSingleInstanceLock` | ✅ `main.cjs` 启动早期申请；未拿到锁立即退出 |
| 第二实例 | ✅ `second-instance` → `showMainWindowFromTray()`；`pendingFocus` 竞态 |
| 后端端口 | 仍 8000；单实例避免双开抢端口 |

## 建议实现（默认）

| 项 | 约定 |
|----|------|
| API | Electron `app.requestSingleInstanceLock()`；未拿到锁 → **立刻** `app.quit()` |
| 时机 | 锁须在 `app.whenReady` **之前**申请（Electron 惯例） |
| 未拿到锁时 | **禁止**继续往下：不注册业务 IPC、不 `startPythonBackend`、不 `createWindow` |
| 第二实例 | `second-instance` → 走与托盘相同的 **`showMainWindowFromTray()`**（还原最小化 / `show` / `focus` / macOS 必要时 `dock.show()`），**不要**只 `focus()`（静默会话主窗可能是 hide） |
| 启动竞态 | 第一实例已拿到锁、但尚未 `createWindow` 时收到 `second-instance`：设 `pendingFocus = true`，在 `createWindow` 之后再调 `showMainWindowFromTray()` |
| `commandLine` | 本应用**无**自定义协议/深链；第二实例传入的 argv **忽略**即可（含 `--silent-start`） |
| 范围 | **仅约束 Electron 桌面进程**；不禁止本机/局域网浏览器打开网页版 |
| 平台 | Windows / macOS 均做；开发模式 `electron:dev` **同样单实例** |
| 验收 | 连开两次安装版 → 只有一个窗口；第二次把第一个拉到前台 |
| 单测 | **本切片不做自动化单测**（Electron 进程锁难在 CI 复现）；仅手工 M1–M6 |

### 已拍板（单实例）

| # | 问题 | 结论 |
|---|------|------|
| Q1 | 第二实例行为 | **聚焦/恢复已有窗口**（不弹「已在运行」对话框） |
| Q2 | 是否禁止本机浏览器同时开网页版 | **否** |
| Q3 | 开发模式 `electron:dev` | **同样单实例** |
| Q4 | 是否改默认只绑 127.0.0.1 | **否**（保持 0.0.0.0；现场用防火墙） |
| Q5 | 与 013 审计谁先 | **013 已发（0.3.73）** |

### 明确不做（单实例切片）

- 桌面 ↔ 浏览器互斥会话  
- 改默认绑定为仅 loopback  
- 自定义协议唤起 / 深链转发  
- 自动化单测  

---

# ✅ 已完成：局域网浏览器可用应用内 AI（0.3.74）

## 产品诉求（2026-07-13 拍板）

1. **应用内 AI**在**局域网浏览器**里也能用（须鉴权）。  
2. 真正做不到的桌面能力 → **明确提示**「仅桌面」。

## 实现摘要

- 后端：`local_or_lan_ai_auth_error`；`_require_loopback` 改为本机免 Token / 局域网须 `allow_lan_access` + Agent Token  
- 前端：`runtimeEnv.ts` + AiDrawer Token 引导；`apiFetch` / 流式请求自动带头  
- 设置开关文案更新；历史报表 / 更新 / 启动 / 云同步等提示「仅桌面」  
- 单测：`test_lan_ai_auth.py`、`runtimeEnv.test.ts`

## 建议实现（默认 ★）

| 项 | 约定 |
|----|------|
| 开关 | **复用**现有 `allow_lan_access`；文案改为涵盖「Agent API + 应用内 AI」（局域网） |
| 默认 | 开关仍默认 **关**；现场需要时在桌面设置里打开，并复制 Agent Token |
| 本机 / Electron / `127.0.0.1` | 行为**不变**：应用内 AI **仍免 Token** |
| 局域网访问应用内 AI | 须同时满足：① `allow_lan_access=true`；② 请求带合法 **Agent Token**（`Authorization: Bearer …`，与 `/v1` 同一套校验） |
| 开关关或无 Token | 继续 403；前端给出**可读中文提示**（勿只甩 HTTP 码） |
| 前端 | 检测非 loopback（且非 Electron 可视为远程）：首次打开 AI 抽屉时引导粘贴 Token → `sessionStorage` 保存；后续聊天/Pending 自动带 Header |
| Token 从哪来 | 仍在本机桌面「设置 › AI」生成/复制；局域网用户向现场管理员要，或本机浏览器 `127.0.0.1` 打开设置复制 |
| 写工具总闸 | 仍受 `write_tools_enabled` 约束；局域网有 Token ≠ 自动放开写入 |

### 拟改落点（局域网 AI）

1. 后端：把 `_require_loopback` 换成「loopback **或**（`allow_lan_access` + 有效 Agent Token）」共用守卫（聊天 / Pending / tools 等同一套）。  
2. 前端：`AiDrawer`、Pending 相关请求在远程场景附带 Token；无 Token / 开关关时阻断并提示。  
3. 设置页：更新开关文案与简短说明（开了仍须 Token）。  
4. 单测：loopback 免 Token；局域网无 Token → 403；开开关 + 正确 Token → 200；错 Token → 403。

### 测试用例（局域网 AI · 草案）

| # | 用例 | 期望 |
|---|------|------|
| A1 | 本机 Electron / 127.0.0.1 聊天 | 仍免 Token，可用 |
| A2 | 局域网、开关关 | 403；UI 提示需开启「允许局域网…」 |
| A3 | 局域网、开关开、无 Token | 403；UI 引导粘贴 Token |
| A4 | 局域网、开关开、正确 Token | 聊天流式 / 非流式可用 |
| A5 | Pending 确认同 A4 | 可列出并确认/取消 |
| A6 | 错 Token | 403，不泄露内部细节 |
| A7 | 桌面独有能力（更新/托盘/选文件夹等） | 局域网有**明确「仅桌面」提示**，不假装可用 |

---

# 说明：用别的浏览器访问，能不能正常操作？

## 短结论

| 场景 | 能否用 | 说明 |
|------|--------|------|
| **本机浏览器**打开 `http://127.0.0.1:8000/` | **大部分可以**（含 AI，免 Token） | 与 Electron 共用后端 |
| **同网段浏览器**打开 `http://<工控机IP>:8000/` | 业务页多半可开；**AI 待本切片落地后**：开开关 + Token 可用 | 防火墙放行 8000 |
| **仅开浏览器、不启动桌面版** | 安装版通常不行 | 后端多由 Electron 拉起 |
| **开发** Vite + uvicorn | 可以 | 无部分 IPC |

## 架构示意

```text
                    ┌─────────────────────────┐
  本机 Electron ────┤  同一 FastAPI :8000      │
  本机 Chrome ──────┤  数据目录共用            │
  局域网浏览器 ─────┤  静态页 + /api/*         │
                    │  AI：开关 + Agent Token  │
                    └─────────────────────────┘
```

## 功能限制对照（目标态 · 本看板落地后）

| 能力 | Electron | 本机浏览器 | 局域网浏览器 |
|------|----------|------------|--------------|
| 模版/版式编辑、列表、保存 | ✅ | ✅ | ✅ |
| 数据源配置、测连、探活设置 | ✅ | ✅ | ✅ |
| 报表生成 / PDF 导出 | ✅ | 基本可用 | 基本可用（IPC 优化可能弱） |
| 选文件夹 / 系统对话框 | ✅ | 受限 → **提示仅桌面** | 同左 |
| 应用内 **AI 聊天 / Pending** | ✅ 免 Token | ✅ 免 Token | ✅ **开关开 + Agent Token**（本切片要实现） |
| Agent `/v1/*` | 本机免 Token | 同左 | 开关 + Token（已有） |
| 自动更新 / 托盘 / 单实例 | ✅ | — → **提示仅桌面** | — |
| 历史报表扫本机导出目录等 | ✅ IPC | 受限 → **提示仅桌面** | 同左 |

> **安全提示**：`0.0.0.0` + 开局域网 AI 后，持 Token 者可调助手与写入类工具（仍受写工具总闸）。Token 按密钥保管；不需要时保持 `allow_lan_access` 关闭。

## 与「整机只能开一个软件」的关系

| 需求理解 | 单实例锁能否覆盖 |
|----------|------------------|
| 不能开两个 **桌面窗口** | ✅ 单实例切片 |
| 局域网也能用 AI | ❌ 属本页「局域网 AI」切片 |
| 局域网别人不能打开整站 | ❌ 防火墙 / 另案鉴权 |

---

## 拟改落点（单实例）

1. `frontend/electron/main.cjs`：文件顶部（`app.whenReady` 之前）`requestSingleInstanceLock`。  
2. 未拿到锁 → 立即 `app.quit()`；**不要**进入后端拉起与建窗逻辑。  
3. 拿到锁后注册 `second-instance`：调用 **`showMainWindowFromTray()`**；处理 `pendingFocus`。  
4. 手工验收 M1–M6；发版说明写入 `007`。

## 测试用例（单实例 · 手工）

| # | 用例 | 期望 |
|---|------|------|
| M1 | 已运行时再开安装版 | 不出现第二主窗；原窗置前；不起第二套后端 |
| M2 | 原窗最小化再开 | 还原并聚焦 |
| M3 | 静默/托盘后再双击 | 拉出主界面；不双后端 |
| M4 | 本机浏览器 :8000 | 仍可进 UI |
| M5 | 局域网 AI（本切片后） | 见上方 A1–A7（**不再**是「永远 403」） |
| M6 | `electron:dev` 再开一次 | 第二进程退出；第一窗置前 |

## 本轮范围

- ✅ 记录「整机单实例」诉求与现状  
- ✅ 说明浏览器访问能力与限制  
- ✅ 单实例实现约定  
- ✅ 拍板局域网 AI（开关 + Token）+ 桌面独有提示  
- ✅ **实现单实例锁（0.3.74）**  
- ✅ **实现局域网 AI 鉴权 + 前端 Token 引导（0.3.74）**  
- ⌛️（二期）仅本机绑定 / 桌面↔浏览器互斥 / 整站登录  

## 拍板一览

| # | 结论 |
|---|------|
| Q1 | 第二实例 → 聚焦/恢复，不弹框 |
| Q2 | 不禁浏览器 UI |
| Q3 | 开发态同样单实例 |
| Q4 | 不改默认 `0.0.0.0` |
| Q5 | 013 已发；可开工 |
| Q6 | **局域网应用内 AI：要实现**（非仅提示不可用） |
| Q7 | 鉴权：**复用 `allow_lan_access` + 现有 Agent Token**；默认开关关；本机仍免 Token |
| Q8 | 做不到的桌面能力 → **明确「仅桌面」提示** |
| G1–G4 | 单实例：托盘恢复、锁前 quit、pendingFocus、无深链/无自动单测 |
