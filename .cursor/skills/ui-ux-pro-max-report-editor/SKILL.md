# SD SMA Report Editor — UI/UX 协作约定（薄封装）

本 Skill 为 **[UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)** 在本仓库中的**项目上下文入口**。修改报表编辑器界面或交互时，Agent 应优先遵守本节约定；需要通用设计谱系（色板、字体对、组件范式）时，再加载上游 Skill 资源。

## 何时引用

- 编辑 `_Prj/SD_SMA_ReportEditor/frontend` 中的 Vue 页面、布局、数据源工作台、设置页等 UI。
- 讨论无障碍、信息密度、表单与工作台分区（侧栏 / 主区 / 详情）。

## 上游安装（混合方案）

在**本 Git 仓库根目录** `P000_SD_SMA_SCADA` 执行（需 Node.js）：

```bash
npx uipro-cli init --ai cursor
```

CLI 会在 Cursor 约定位置生成或合并上游技能文件；**不要将上游整仓库无差别拷入业务代码目录**。若 CLI 产物未入库，每位开发者本地执行一次即可。

**工作区提示**：Cursor 从**当前打开的工作区根**加载 `.cursor/skills`。若仅打开 `_Prj/SD_SMA_ReportEditor` 子文件夹，可能看不到仓库根下的 skills；报表编辑器相关 AI 协作请以 **`P000_SD_SMA_SCADA` 为工作区根** 打开。

## 技术栈与边界

- **前端**：Vue 3（Composition API）、Vite、Vue Router（hash）、Pinia（按需）、Electron 壳（开发并行 Vite）。
- **后端**：FastAPI，前端通过 `/api` 代理访问（开发）或与桌面同源策略一致。
- **双模式一致**：Electron 与纯浏览器在功能与交互结果上应对齐；禁止「仅某一模式可用」的业务分叉，文件选择等用 Web 标准能力（如 `<input type="file">`）以保证两端一致。

## UI 原则（精简）

- **工作台布局**：数据源等复杂页采用「顶栏 → 三栏主区 → 底栏状态」；次要操作用按钮组，避免深层嵌套对话框。
- **只读与安全**：数据库侧为**只读**场景；查询区明确标注只读；危险操作不提供。
- **对比度与可读性**：浅色内容区 + 清晰边框区分面板；表格支持横向滚动与分页。
- **无障碍**：表单控件保持 `<label>` 关联；关键状态不仅依赖颜色（辅以图标或文案）。

## 与本项目文档的关系

- 运行与打包：[`_Prj/SD_SMA_ReportEditor/README.md`](../../../../_Prj/SD_SMA_ReportEditor/README.md)
- 架构与指令：[`_Prj/SD_SMA_ReportEditor/_Doc/003_项目框架与常用指令.md`](../../../../_Prj/SD_SMA_ReportEditor/_Doc/003_项目框架与常用指令.md)
