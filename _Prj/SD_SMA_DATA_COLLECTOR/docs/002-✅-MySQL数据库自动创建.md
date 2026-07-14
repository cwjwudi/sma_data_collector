# ✅ MySQL 数据库自动创建

## 目标

当配置的 MySQL 数据库不存在时，由采集器按配置自动创建数据库，再继续现有的自动建表、建索引和补列流程。配置界面必须明确提示服务器级 `CREATE` 权限要求，并推荐使用 ROOT 账号完成初始化。

## 实现

- 新增 `database.auto_create`，默认 `false`；仅接受 JSON 布尔值。
- 仅在目标库连接返回 MySQL `1049 Unknown database` 且 `auto_create=true` 时启动建库流程。
- 临时连接 MySQL 服务器，执行：

```sql
CREATE DATABASE IF NOT EXISTS `<配置数据库名>`
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

- 创建完成后释放临时连接，重新连接目标数据库。
- 数据库名采用 MySQL 标识符转义，并限制非空、无 NUL、最长 64 字符。
- 密码错误、网络错误等非 1049 异常不会触发建库。
- SQLite 行为不变。
- 配置页面新增“自动创建数据库及数据表（仅 MySQL）”复选框；勾选后显示：确保账号具备服务器 `CREATE` 权限，推荐使用 ROOT 完成初始化。

## 验证

- 自动化测试：采集器完整测试 `154 passed, 4 warnings`；警告均为既有弃用或测试返回值警告。
- 配置页面静态资源经本地 Web 服务返回 `HTTP 200`，确认包含默认字段、复选框、“服务器 CREATE 权限”和“推荐使用 ROOT”四项内容。
- 使用 `AA_SMA_DATA_TEST.json` 中的测试 MySQL 连接创建一次性数据库：
  - 首次目标库连接返回不存在；
  - 自动创建并成功重连；
  - 字符集读回 `utf8mb4`；
  - 排序规则读回 `utf8mb4_unicode_ci`；
  - 验证结束后已删除本轮创建的一次性数据库。

## 配置

`config/collector/AA_SMA_DATA_TEST.json` 已启用：

```json
"database": {
  "auto_create": true
}
```

该现场配置目录受 `.gitignore` 保护，仅保存在本机，不纳入版本库。
