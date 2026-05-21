; Custom NSIS hooks for Report Editor (electron-builder)
; Ensures running app/backend are stopped before uninstall.

!macro customUnInstall
  nsExec::ExecToLog 'taskkill /F /IM "Report Editor.exe" /T 2>nul'
  nsExec::ExecToLog 'taskkill /F /IM report_backend.exe /T 2>nul'
  Sleep 500
  ; 用户数据：config.json、数据源、模版、localStorage 偏好等（%APPDATA%\sd-sma-report-editor）
  IfFileExists "$APPDATA\sd-sma-report-editor\*.*" 0 +2
    RMDir /r "$APPDATA\sd-sma-report-editor"
!macroend

!macro customInstall
  ; Register uninstall entry is handled by electron-builder NSIS template.
!macroend
