# web_config

`SD_SMA_DATA_COLLECTOR` 的独立配置网页模块。

## 功能

- 读取/保存采集配置模板
- 配置校验（复用 `core.config_loader.ConfigLoader`）
- 导出配置文件
- 直写 `config/`（自动备份 + 原子替换）
- OPC UA 浏览并一键生成 `points` 配置

## 约束

- 仅支持采集配置字段：
  - `communications / connections / points / groups / database / logging`
- 已删除历史查询任务配置：
  - 禁止 `trigger=query`
  - 禁止 `groups[].query_config`
  - 禁止 `groups[].output_mode`
  - 禁止顶层 `http_server`

## 启动

```bash
pip install -r ../requirements.txt
python -m uvicorn web_config.main:app --host 0.0.0.0 --port 8091
```

访问：`http://localhost:8091`

