# Query Web 切换预案

## 目标

在不影响采集入库链路的前提下，将查询能力切换到 `SD_SMA_DATA_COLLECTOR_QUERY_WEB`。

## 切换前条件

- 新程序稳定运行至少 3 天。
- 测试清单全部通过（见 `docs/TEST_CHECKLIST.md`）。
- 现场用户确认查询页可替代现有流程。

## 切换步骤

1. 固定 `app_settings.json` 与 `query_view_config.json` 版本。
2. 启动 Query Web 并验证 `/api/db/check`。
3. 现场端把查询入口指向新程序 URL。
4. 并行观察 1 个班次，记录异常与响应时间。
5. 若稳定，发布“旧接口废弃通知”。

## 回滚步骤

1. 停止 Query Web 页面入口切换。
2. 恢复旧查询入口（若仍可用）。
3. 保留 Query Web 日志与配置快照供排查。

## 旧 HTTP 接口下线建议

- 不建议立即删除。
- 推荐在新程序稳定一个版本周期后再删除旧接口代码。
- 删除前确认不存在外部系统依赖旧接口。
