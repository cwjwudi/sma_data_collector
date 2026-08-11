# 测试模版：一键隐藏边框 + 非批次导出

文件：`test-hide-border-nonbatch-template.json`

- **模版名**：测试·一键隐藏边框+非批次导出
- **id**：`a040-nonbatch-hide-border-test`
- **类型**：非批次（`reportKind=nonBatch`）
- **默认目标文件夹**：`%USERPROFILE%\Desktop\ReportEditorNonBatchTest`

## 重新写入本机 AI 版

```powershell
cd _Prj\SD_SMA_ReportEditor
.\backend\venv\Scripts\python.exe scripts\dev\make_hide_border_nonbatch_template.py
```

写入后若应用已打开，请**重启**或刷新模版列表。

## 怎么测

### 1）一键隐藏边框（040）

1. 打开模版编辑器 → 打开本模版。
2. 封面 / 正文 / 封底页眉页脚与正文文本、色块、日期默认**有灰边框**；正文表格有边框。
3. 停在任意页点工具栏「一键隐藏边框」：
   - **整份模版**（封面 / 正文全部页 / 封底）的页眉、页脚、正文、区装饰外框应变无。
   - **表格边框应保留**。
   - 无需先选中页眉所在页。

### 2）非批次导出（046）

1. 确认模版顶部类型为「非批次」，目标文件夹为桌面 `ReportEditorNonBatchTest`（可改）。
2. 到「报表生成」选本模版导出 PDF。
3. PDF 应直接落在该文件夹下，**不会**再按批号建子目录；也不依赖全局导出根目录。
