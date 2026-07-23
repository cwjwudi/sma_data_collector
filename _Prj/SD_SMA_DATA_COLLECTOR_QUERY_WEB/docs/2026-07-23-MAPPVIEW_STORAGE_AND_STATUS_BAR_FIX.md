# ✅ 已完成：QUERY_WEB 在 mappView sandbox 中兼容本地存储限制

目标：mappView 嵌入页面无法访问 `localStorage` 时，查询和后端配置保存仍正常完成，不再把页面状态保存失败误报为配置保存失败。

范围：

- 为通用查询页、插件查询页和配置页增加安全的本地存储读写封装。
- 参考 `SD_SMA_DATA_COLLECTOR`，本地存储不可用时静默降级。
- 将配置页结果提示从 iframe 底部固定栏改为页面内顶部粘性消息栏，避免 mappView 裁剪或重排后不可见。
- 更新静态资源版本参数，避免现场浏览器继续使用旧缓存。

实现：

- `config.js`、`query.js`、`specialized_query.js` 的 `localStorage` 操作全部收口至安全封装；访问被拒绝时读取返回空、写入和删除静默失败。
- 配置文件仍由后端 API 保存，本地页面状态失败不再进入保存操作的错误分支。
- 配置页消息栏移动至主内容顶部，采用与采集器一致的 `position: sticky`、状态色边框和阴影。
- 配置页、查询页和插件查询页增加 `20260723_01` 静态资源版本参数。

验收证据：

- `node --check`：三个 JavaScript 文件均通过。
- `python -m pytest tests/test_config_page_ui.py -q`：4 项通过。
- `python -m pytest tests -q -m "not integration"`：95 项通过，9 项集成测试跳过。
- 本地浏览器确认消息栏计算样式为 `position: sticky; top: 8px`，初始化成功消息可见且无控制台错误。

# ⌛️ 未完成：现场 mappView sandbox 验收

代码和自动化验证已完成；部署后需在实际 mappView WebViewer 中确认：保存配置不再出现 `localStorage Access is denied` 误报，且顶部消息栏在滚动及页面重排后持续可见。
