# 团队模版与版式（Portal 云端下载）

| 文件 | 内容 |
|------|------|
| `team-templates.json` | `{ "version", "updatedAt", "templates": [...] }` |
| `team-layout-presets.json` | `{ "version", "updatedAt", "layout_presets": [...] }` |

**br / admin** 登录客户端后点「下载团队模版与版式」会同时拉取上述两个文件。

## 更新流程

1. 在 Report Editor 中导出完整备份（`report-editor-backup-YYYY-MM-DD.json`）
2. 提取模版与版式段：

```bash
node packaging/scripts/extract-team-cloud-assets.mjs \
  packaging/updates/report-editor-backup-YYYY-MM-DD.json
```

3. 将生成的两个 JSON 复制到 Portal：

```
storage/report-editor/defaults/team-templates.json
storage/report-editor/defaults/team-layout-presets.json
```

4. 无需改 Portal 代码或客户端；文件名保持不变即可覆盖更新。

## 注意

- 完整备份含数据库连接等敏感信息，**不要**上传到 Portal，仅提取 `templates` 与 `layout_presets`。
- `report-editor-backup-*.json` 建议保留在本地，勿提交 Git。
