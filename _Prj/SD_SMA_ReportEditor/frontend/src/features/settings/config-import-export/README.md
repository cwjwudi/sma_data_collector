实现见 `ConfigImportExport.vue`、`config-bundle-client.ts` 与后端 `config_bundle.py`。

配置包（`bundle_version: 2`）包含：数据源（`db_connections` / `opcua_servers` / `app_preferences`）、模版、版式、签名库，以及 `client_prefs` 中的生成报表与历史报表本机偏好。

导出时前端会把 `client_prefs` 合并进 JSON；导入时服务端写入磁盘数据并回传 `client_prefs`，由前端写入 localStorage。

**跨电脑迁移**：请使用「导出（本机备份）」——服务端会把口令解密为 JSON 内的 `password` 字段，在目标机导入时用该机密钥重新加密。若只导出脱敏包，目标机需自行填写数据库/OPC 口令。旧版备份 JSON 仅含 `password_enc` 时，在另一台电脑导入会提示口令无法解密，需在数据源中重新保存密码。
