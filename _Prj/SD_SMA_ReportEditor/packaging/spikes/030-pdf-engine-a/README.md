# Spike-A：pdf-lib 矢量出 PDF（无 Chromium）

对应看板 [docs/030](../../../../../docs/030-🚧-ReportEditor结批占满CPU导致mappView白屏.md) · Plan [0.3.114](../../../_Doc/009_版本Plan/0.3.114.md)。

## 目的

验证：**不经过** `webContents.printToPDF` 时，同机再开一个 Chromium（模拟 mappView）是否仍被打挂。

本 Spike **只证明负载路径**，不证明与现模版 DOM 1:1 保真。

## 运行

```powershell
cd _Prj\SD_SMA_ReportEditor\packaging\spikes\030-pdf-engine-a
npm install
npm run spike
```

输出：`out/spike-a-sample.pdf`，并打印耗时与进程 CPU 采样（粗）。

## 现场观察（人工）

1. 先打开 mappView（或任意 Chromium 页，持续操作）。
2. 再跑 `npm run spike`（可连续跑多次模拟「多分卷」）。
3. 记录：HMI 是否闪白/需重载。

## 结论栏（跑完后填到 0.3.114 Plan「决议」）

- 同机是否闪：_（空）_
- 是否建议进实现：_（空）_
