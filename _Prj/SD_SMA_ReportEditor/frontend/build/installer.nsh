; Custom NSIS hooks for Report Editor AI (electron-builder)
; Ensures running app/backend are stopped before uninstall.

!macro customUnInstall
  nsExec::ExecToLog 'taskkill /F /IM "Report Editor AI.exe" /T 2>nul'
  nsExec::ExecToLog 'taskkill /F /IM report_backend.exe /T 2>nul'
  Sleep 500
  ; 用户数据：config.json、数据源、模版、localStorage 偏好等（%APPDATA%\sd-sma-report-editor-ai）
  ; 覆盖升级（应用内更新 / 同版本重装）时 ${isUpdated} 为 true，必须保留数据。
  ; 仅用户从「设置 → 应用」主动卸载时才处理用户数据。
  ${ifNot} ${isUpdated}
    IfFileExists "$APPDATA\sd-sma-report-editor-ai\*.*" 0 done_userdata
      ; 卸载前询问是否先备份，避免重装后配置丢失。
      MessageBox MB_YESNO|MB_ICONQUESTION "是否在卸载前备份本软件数据（数据源、模版、版式、签名、设置）？$\r$\n$\r$\n选择“是”将复制到「文档」文件夹，便于重装后恢复。$\r$\n（如需加密备份，请取消卸载，先在软件「设置 → 备份与恢复」导出加密备份。）" IDNO do_delete_userdata
        ; 备份目标：我的文档\ReportEditorAI-Backup
        StrCpy $0 "$DOCUMENTS\ReportEditorAI-Backup"
        CreateDirectory "$0"
        nsExec::ExecToLog 'cmd /c xcopy /E /I /Y /Q "$APPDATA\sd-sma-report-editor-ai\backend-data" "$0\backend-data"'
        Pop $1
        ${If} $1 == 0
          MessageBox MB_OK|MB_ICONINFORMATION "已备份到：$0\backend-data"
        ${Else}
          MessageBox MB_OK|MB_ICONEXCLAMATION "备份未完全成功（错误码 $1）。请手动复制目录：$\r$\n$APPDATA\sd-sma-report-editor-ai\backend-data"
        ${EndIf}
      do_delete_userdata:
      RMDir /r "$APPDATA\sd-sma-report-editor-ai"
    done_userdata:
  ${endIf}
!macroend

!macro customInstall
  ; Register uninstall entry is handled by electron-builder NSIS template.
!macroend
