/**
 * 033：导出隐藏窗 loadURL / 热切换失败时，判断是否可销毁重建重试。
 */

function isRecoverablePdfExportNavError(err) {
  const msg = String(err && err.message != null ? err.message : err || "");
  return /ERR_FAILED|ERR_ABORTED|ERR_CONNECTION|ERR_TIMED_OUT|ERR_FILE_NOT_FOUND|ERR_NETWORK|net::|-2\b/i.test(
    msg,
  );
}

module.exports = {
  isRecoverablePdfExportNavError,
};
