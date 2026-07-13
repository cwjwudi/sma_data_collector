# ReportEditor 数据源滑动锁与工作台空白

> 产品计划：[`009_版本Plan/0.3.57.md`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.57.md)（已发、未闭环）→ [`0.3.58.md`](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.58.md)（续修）。  
> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。

---

# ✅ 已完成：0.3.57 滑动锁外观止血（轨道不再巨大白块）

- **实现**：`DatasourceLockToggle.vue` 钉死 88×32、`appearance: none`、拇指 `translateX` + SVG。
- **验收（部分）**：0.3.57 目视轨道尺寸正常；**进度填充与拖柄仍不同步**（见下方续修）。
- **证据**：发版包 0.3.57；现场截图确认锁外观已改善。

---

# ✅ 已完成：0.3.57 高度链兜底（未真正解决空白）

- **当时判断**：`page-fill-height` / `.main` 的 `min-height:0` 把主区压没。
- **实现**：`MainLayout` 后代选择器 + stage/body/main 加 `min-height`。
- **验收失败**：0.3.57 安装后仍只见「+ 新建」、无「数据库连接」面板（截图复现）。
- **结论**：高度链可能是加重因素，**不是主因**；见下方重诊。

---

# 🚧 进行中：重诊工作台空白（0.3.57 未修好）

## 现象（0.3.57）

| 区域 | 状态 |
|------|------|
| 滑动锁 | 轨道正常；**进度条与拖柄不同步** |
| Tab /「+ 新建」 | 可见 |
| ConnectionManager（「数据库连接」灰底表单） | **完全不可见**，主区只剩渐变底 |

父级 `DatabaseWorkbench` 的「+ 新建」能画出来，说明 **崩在子组件 ConnectionManager**，不是整页未挂载。

## 主因（组件测试暴露，待改代码确认）

`ConnectionManager.vue` **全文件使用 `draft.*`，但 script 中从未声明**：

```js
import { computed, reactive, ref, watch } from 'vue'
// … 有 reactive 导入，却没有：
// const draft = reactive({ id: '', name: '', engine: 'mysql', … })
```

`watch(..., { immediate: true })` 在 setup 阶段访问 `draft` → `ReferenceError: draft is not defined` → 子树挂载失败 → 主区空白。  
历史纯函数 vitest **测不到** Vue SFC，故 0.3.57「248 passed」仍放行该缺陷。

## 次因（布局，仍建议一并修）

1. 无连接时 `.main` 仍是 **三列 grid** + `.main > * { min-height: 0 }`，表单易被压。
2. `content-scroll .page-fill-height { min-height: 0 }` 在 keep-alive 下高度链脆弱。
3. 进度 fill 用「全轨 width%」，拇指用「travel 区间 translateX」，拖动时不同步。

## 配置备份

同事/本机「配置备份」指设置页 **备份与恢复**（`.rebak`），不能替代 UI 源码对照。  
对照应用数据：`~/Library/Application Support/sd-sma-report-editor-ai/backend-data/`；空白是前端渲染崩溃，**不是配置丢失**。

## 拟改（等文档确认后再动代码 → 0.3.58）

1. 补回 `const draft = reactive({…})`，放在任何 `watch(draft)` / 读 `draft` 之前。
2. 无连接：`main--solo` 单列 + 表单 `min-height`；全高页 `min-height: max(100%, 420px)`。
3. 锁几何抽纯函数：`fillWidthPx` 与 `thumbOffsetPx` 共用同一 pct。
4. **先写测试再合入**（见下一 H1）。

---

# 🚧 进行中：补测试门槛（同事建议）

## 问题

当前前端测试几乎全是 `src/lib/**` 纯函数；**数据源 UI（锁、ConnectionManager、工作台）零覆盖**。  
AI/人工改 UI 只靠目视 + 全绿 lib 测试，会重复出现「发版了其实没修好」。

## 约定（本任务起）

| 改动类型 | 最低测试 |
|----------|----------|
| 滑动锁几何 / 进度与拖柄 | 纯函数单测（pct↔px 同步） |
| ConnectionManager 空态/新建/加载/锁定 | Vue SFC 挂载测（`@vue/test-utils` + `happy-dom`） |
| 工作台防空白布局 | 布局 class 契约 + 关键 CSS 源码契约（禁止再 `height:100%` 循环压没表单） |
| 发版前 | `npm test` 全绿；上述用例必须包含在内 |

## 拟新增（实现阶段）

- `datasource-lock-geometry.ts` + `.test.ts`
- `ConnectionManager.test.ts`（无 `draft` 时必须红）
- `workbench-layout.ts` + CSS 契约测试
- vitest `environment: happy-dom`；devDependency：`@vue/test-utils`、`happy-dom`

---

# ⌛️ 未完成：修锁进度与拖柄同步并入 0.3.58

- **目标**：拖动过程中进度填充右缘始终对齐拇指中心；松手请求完成前不弹回。
- **验收**：单测 `fillWidthPx(pct) === thumbOffsetPx(pct) + THUMB/2`；目视拖动无「条先走/柄后走」。

---

# ⌛️ 未完成：修 ConnectionManager + 布局并发版 0.3.58

- **目标**：无连接时可见「数据库连接」面板（占位或新建表单）；有连接时三栏正常。
- **验收**：`ConnectionManager` 挂载测绿；Mac 包目视；锁定语义不变。
- **发版**：bump **0.3.58**，更新 `007` / `latest.json` / Plan / `todo.md`。
