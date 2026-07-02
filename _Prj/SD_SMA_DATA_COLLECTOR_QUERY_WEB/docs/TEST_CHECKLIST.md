# Query Web 最小测试清单

## A. 连接测试

- [ ] `GET /api/db/check` 返回 `status=ok`
- [ ] `GET /api/meta/groups` 能返回组列表
- [ ] 错误账号时返回 503 且提示可读

## B. 查询测试

- [ ] `table` 视图可查询并返回数据
- [ ] `alarm` 视图可查询并返回数据
- [ ] `audit` 视图可查询并返回数据（无数据时有提示）
- [ ] `warnings` 与 `missing_columns` 在前端可见

## C. 配置测试

- [ ] 每个标列顺序可编辑并生效
- [ ] 每个标 `sort_by/sort_dir/page_size` 可编辑并生效
- [ ] “应用并保存”后重启服务配置仍保留

## D. 保护策略测试

- [ ] 未传时间范围时自动限制到默认窗口
- [ ] 超大时间窗口会被截断并提示
- [ ] 高频请求触发 429 限流

## E. 文档与边界检查

- [ ] README 与操作手册仅保留查询程序职责说明

## F. OPC UA 回写测试

### 自动化

- [ ] `pytest tests/ -v` 单元测试通过
- [ ] `pytest tests/ -v -m integration` 集成测试通过（自动启动 mock server 4841）

### 手动（mock server）

- [ ] 启动 `python scripts/query_web_opcua_mock_server.py`
- [ ] profile 配置 `endpoint_url` 与 `alarm_2` 页 `opcua_writeback`
- [ ] 打开 `/plugins/alarm_2.html`，查询后 OPC 数组更新
- [ ] 点击第 N 行，`cursor` 变为对应索引（0 起）
- [ ] 上一页/下一页后行高亮清除，`diCursor` 为 `-1`
- [ ] 停止 OPC 服务后查询仍正常、无弹窗

### 现场 PLC

- [ ] 真实 Endpoint 与 NodeId 与 OpcUaMap 一致
- [ ] 数组前 N 项与表格一致；PLC 侧 `IF cursor >= 0 THEN` 再读行数据
