# 团队版式（Portal 云端下载）

`team-layout-presets.json` 为 **br / admin** 账号在客户端「下载团队版式」时拉取的统一文件。

## 更新流程

1. 在 Report Editor 中导出完整备份（`report-editor-backup-YYYY-MM-DD.json`）
2. 提取版式段：

```bash
node packaging/scripts/extract-team-layout-presets.mjs \
  packaging/updates/report-editor-backup-YYYY-MM-DD.json
```

3. 将生成的 `team-layout-presets.json` 复制到 Portal：

```
storage/report-editor/defaults/team-layout-presets.json
```

4. 无需改 Portal 代码或客户端；文件名保持不变即可覆盖更新。

## 注意

- 完整备份含数据库连接等敏感信息，**不要**上传到 Portal，仅提取 `layout_presets`。
- `report-editor-backup-*.json` 建议保留在本地，勿提交 Git。
