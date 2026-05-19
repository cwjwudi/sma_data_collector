实现见 `ConfigImportExport.vue`、`config-bundle-client.ts` 与后端 `config_bundle.py`。

配置包（`bundle_version: 2`）包含：数据源（`db_connections` / `opcua_servers` / `app_preferences`）、模版、版式、签名库，以及 `client_prefs` 中的生成报表与历史报表本机偏好。

导出时前端会把 `client_prefs` 合并进 JSON；导入时服务端写入磁盘数据并回传 `client_prefs`，由前端写入 localStorage。
