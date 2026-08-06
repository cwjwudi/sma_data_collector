# SD SMA Common

共享的纯 Python 运行时辅助模块。当前提供受允许根目录约束的服务端文件系统浏览能力，供 DB Admin 和 Report Copy 使用。

运行测试：

```powershell
$env:PYTHONPATH = "$PWD\_Prj\SD_SMA_COMMON"
uv run python -m pytest _Prj/SD_SMA_COMMON/tests -q
```
